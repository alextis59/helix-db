# HDoc 1.0 Canonical Noncontainer Payload Encoding

- Status: Accepted noncontainer payload registry; container records remain incomplete
- Last updated: 2026-07-11
- Owner: Storage architecture owner with Query semantics review
- Format identity: HDoc major `1`, initial minor `0`
- Plan item: `P03-004`
- Governing gate: `G03`
- Governing decision: [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)
- Parent envelope: [HDoc 1.0 envelope format](hdoc-v1.md)
- Type identities: [HDoc 1.x logical type tags](hdoc-v1-type-tags.md)
- Machine-readable companion: [hdoc-v1-payloads.json](hdoc-v1-payloads.json)
- Supersedes: None
- Superseded by: None

## Scope and maturity boundary

This document assigns the exact canonical payload bytes for every HDoc 1.0 noncontainer logical
type: null, Boolean, both integer widths, binary64, decimal128, string, binary, timestamp, date,
UUID, ObjectId, and both vector families. It also assigns the base binary-subtype registry,
alignment, exact length equations, semantic range checks, decimal BID mapping, vector dimension
prefix, noncanonical rejection, and payload-level reference vectors.

It does not define the field, array-element, object, or array record that carries a tag, offset,
and length. Those records, value-area ordering, zero padding, container references, and exact use of
zero-length payload offsets remain `P03-005`. CRC and typed-hash framing remain `P03-006`, and
compression remains `P03-007`. Therefore the parent envelope is still an incomplete byte format,
hash profile zero remains invalid, and no payload example here is a complete or valid HDoc
document.

## Normative notation

- `u8`, `u16`, `u32`, and `u64` are unsigned integers of exactly that width.
- `i32` and `i64` are two's-complement signed integers of exactly that width.
- `le` means least-significant byte first.
- `B[n:m]` means the inclusive bit range of unsigned integer `B`, with bit zero least significant.
- `||` means byte concatenation.
- `len(payload)` is the containing record's exact `value_length` under `P03-005`.
- A hexadecimal payload string lists stored bytes from lowest address to highest address.
- “Reject” means no logical value, borrowed view, index key, sidecar value, or partial document is
  exposed.

The [machine registry](hdoc-v1-payloads.json) is normative together with this document. Where this
document gives an equation and the registry gives exact constants/vectors, an implementation must
satisfy both.

## Common payload contract

The one-byte type tag is carried by the containing record and is not repeated inside the payload.
The containing record supplies exactly one payload offset and length. Payload rules are:

1. Fixed-width payloads have exactly the listed byte count.
2. Strings use the containing length and have no internal length prefix or terminator.
3. Binary values use one subtype byte followed by data; the containing length is `1 + data_bytes`.
4. Vectors use one `u32-le` dimension followed by exactly `N` fixed-width elements.
5. No payload admits ignored trailing bytes, alternate compact forms, native padding, or an
   implicit terminator.
6. Writers use explicit byte stores. Readers use checked byte loads after length, range, section,
   and alignment validation. Neither casts a byte pointer to a host struct.
7. Payload bytes exclude inter-value alignment padding. `P03-005` inserts only the minimum zero
   padding before the next payload and decides the canonical payload order.

An empty string and null both have zero payload bytes, but their distinct containing tags make
them unambiguous. A binary value is never zero bytes because its subtype is part of the payload.
Offset zero, zero length, an all-zero numeric payload, and a zero vector dimension are not generic
absence sentinels.

## Payload summary

| Tag | Logical type | Alignment | Exact payload length | Encoding |
| ---: | --- | ---: | ---: | --- |
| `0x01` | null | 1 | 0 | Empty payload |
| `0x02` | Boolean | 1 | 1 | `00` false, `01` true |
| `0x03` | int32 | 4 | 4 | Two's-complement `i32-le` |
| `0x04` | int64 | 8 | 8 | Two's-complement `i64-le` |
| `0x05` | float64 | 8 | 8 | Exact IEEE 754 binary64 bits, little-endian |
| `0x06` | decimal128 | 8 | 16 | Canonical IEEE decimal128 BID integer, little-endian |
| `0x07` | string | 1 | `value_length` | Exact canonical UTF-8 bytes |
| `0x08` | binary | 1 | `1 + data_bytes` | Subtype `u8`, then exact data |
| `0x0b` | timestamp | 8 | 8 | Range-checked Unix microseconds as `i64-le` |
| `0x0c` | date | 4 | 4 | Range-checked Unix-relative civil days as `i32-le` |
| `0x0d` | UUID | 1 | 16 | RFC 9562 network-order octets |
| `0x0e` | ObjectId | 1 | 12 | Exact opaque ObjectId octets |
| `0x0f` | `vector<f32,N>` | 4 | `4 + 4N` | `u32-le N`, then `N` binary32 bit patterns, little-endian |
| `0x10` | `vector<f16,N>` | 4 | `4 + 2N` | `u32-le N`, then `N` binary16 bit patterns, little-endian |

Object and array tags `0x09`/`0x0a` select container records and are intentionally absent from this
table. Their exact payload/reference grammar is owned by `P03-005`.

## Null and Boolean

### Null

Null has no payload:

```text
type_tag    = 0x01
value_length = 0
payload      = <empty>
```

No byte is read. A byte such as `00`, an absent containing record, a zero offset, or the invalid
type tag `0x00` is not an alternate null encoding. A present null remains different from Missing.

### Boolean

Boolean has one byte:

```text
false = 00
true  = 01
```

Every other byte, including `02` and `ff`, is noncanonical corruption under a known HDoc profile.
There are no distinct true/false type tags and no integer/truthiness coercion during decode.

## Signed integers

`int32` and `int64` store the exact two's-complement bit pattern least-significant byte first:

```text
int32 payload = little_endian(bitcast_u32(value))
int64 payload = little_endian(bitcast_u64(value))
```

The widths are never inferred from magnitude and never use varint, zigzag, sign/magnitude, biased,
decimal-text, or smallest-fitting representations. Consequently `int32(1)` is `01 00 00 00`,
while `int64(1)` is `01 00 00 00 00 00 00 00`; the distinct tag and width survive round trip.

Boundary vectors:

| Logical value | Payload |
| --- | --- |
| `int32::MIN` | `00 00 00 80` |
| `int32::MAX` | `ff ff ff 7f` |
| `int64::MIN` | `00 00 00 00 00 00 00 80` |
| `int64::MAX` | `ff ff ff ff ff ff ff 7f` |

Every bit pattern at the required width is a valid value. Arithmetic overflow rules act before
encoding; the decoder does not reinterpret a stored width based on what another type could hold.

## Binary64 (`float64`)

The payload is the exact 64-bit IEEE 754 binary64 interchange bit pattern, stored
least-significant byte first:

```text
payload = little_endian(binary64_bits)
```

Every 64-bit pattern admitted by the accepted floating-special semantics remains admitted:

- finite normal and subnormal values;
- positive and negative zero;
- positive and negative infinity; and
- quiet or signaling NaNs with either sign and every nonzero payload.

Encoding, decoding, copying, hashing, indexing, backup, replication, and SDK return must preserve
all 64 bits and must not execute a host floating operation that quiets or rewrites NaN. A reader
loads an integer bit pattern first; conversion to a host float is permitted only in a semantic
operation whose behavior is already defined.

The canonical NaN produced by arithmetic is `0x7ff8_0000_0000_0000`, whose payload is
`00 00 00 00 00 00 f8 7f`. That arithmetic-output rule does not make other stored NaN payloads
noncanonical. For example, signaling NaN bits `0x7ff0_0000_0000_0001` canonically persist as
`01 00 00 00 00 00 f0 7f`.

No byte-order swap applies to the sign/exponent/fraction fields individually. The complete
unsigned 64-bit interchange word is serialized little-endian once.

## Decimal128 canonical BID payload

### Selected interchange encoding

HDoc uses the 128-bit IEEE decimal **binary integer decimal (BID)** coefficient encoding, stored
as one unsigned 128-bit integer little-endian. This is the same BID family and byte order used by
the accepted [MongoDB Decimal128 specification](https://specifications.readthedocs.io/en/latest/bson-decimal128/decimal128/),
but HDoc has stricter logical canonicalization: decimal quantum/declared scale, NaN sign/payload,
and alternate cohorts are not logical data in HelixDB.

The selected profile is `hdoc-decimal128-bid-canonical-v1`. Copying a language `_Decimal128`, C
struct, BSON wrapper, DPD value, or pair of native words is forbidden unless it is decoded to the
HelixDB logical tuple and passes the exact canonical re-encoding test below.

### Canonical logical domain

Finite nonzero decimal values first have the accepted canonical tuple:

```text
sign:        0 or 1
coefficient: integer from 1 through 10^34 - 1
exponent:    at least -6176
digits(coefficient) + exponent - 1 <= 6144
coefficient mod 10 != 0
value = (-1)^sign * coefficient * 10^exponent
```

Trailing coefficient zeros are removed while incrementing the logical exponent. Zero has
coefficient/exponent `0/0` and retains its sign. The only specials are positive infinity, negative
infinity, and one unsigned canonical quiet NaN.

### Finite BID mapping

Let canonical logical values be `(sign, C, e)`. The IEEE decimal128 wire quantum exponent cannot
exceed 6111 even though the canonical logical exponent can reach 6144 for short coefficients.
Derive a unique wire pair:

```text
shift  = max(0, e - 6111)
Cwire  = C * 10^shift
ewire  = e - shift
E      = ewire + 6176
```

The accepted domain proves:

```text
0 <= E <= 12287
0 < Cwire < 10^34 < 2^113
```

Construct the unsigned 128-bit interchange integer:

```text
B = (sign << 127) | (E << 113) | Cwire
payload = little_endian_16_bytes(B)
```

Because every valid decimal128 coefficient is below `10^34`, canonical HDoc finite values use only
this normal BID form. The alternate steering form, coefficients at least `10^34`, and finite
patterns that IEEE interchange might interpret as zero are forbidden.

Example: canonical `1 × 10^6144` has `shift = 33`, `Cwire = 10^33`, and `ewire = 6111`. Its payload
is:

```text
00 00 00 00 0a 5b c1 38 93 8d 44 c6 4d 31 fe 5f
```

This deterministic clamping is physical only. Decoding returns canonical logical coefficient `1`
and exponent `6144`, not a scale-bearing coefficient with 33 trailing zeros.

### Zero and specials

Zero always uses logical exponent zero, BID bias 6176, zero coefficient, and the retained sign:

| Logical value | Unsigned BID word | Stored payload |
| --- | --- | --- |
| `+0` | `30400000000000000000000000000000` | `00000000000000000000000000004030` |
| `-0` | `b0400000000000000000000000000000` | `000000000000000000000000000040b0` |

Special values use exactly these complete words and no payload bits:

| Logical value | Unsigned BID word | Stored payload |
| --- | --- | --- |
| `+Infinity` | `78000000000000000000000000000000` | `00000000000000000000000000000078` |
| `-Infinity` | `f8000000000000000000000000000000` | `000000000000000000000000000000f8` |
| `NaN` | `7c000000000000000000000000000000` | `0000000000000000000000000000007c` |

Negative NaN, signaling NaN, NaN diagnostic payloads, and infinity values with nonzero trailing
bits are not HDoc decimal values. A typed import may map them to the single logical NaN only before
normal HDoc encoding and with its lossy transformation reported.

### Canonical decoder test

A decimal decoder does not accept every 128-bit IEEE/BSON carrier. It must:

1. require exactly 16 bytes and load one unsigned 128-bit little-endian integer;
2. accept only the three exact special constants above or a finite normal-form value;
3. reject a finite exponent outside `[-6176,6111]` or coefficient at least `10^34`;
4. map zero to exponent `0` while retaining sign;
5. for nonzero finite values, remove all coefficient trailing zeros while increasing the logical
   exponent and validate the canonical tuple domain;
6. apply the high-exponent clamping equation to that logical tuple; and
7. re-encode and require byte-for-byte equality with the original 16 bytes.

Step 7 rejects every cohort alias. For example, BID coefficient `10`, exponent `-1` represents the
number one but has payload `0a000000000000000000000000003e30`; HDoc accepts only canonical
coefficient `1`, exponent `0`, payload `01000000000000000000000000004030`.

The official MongoDB Decimal128 corpus remains useful as independent BID arithmetic/endianness
input, especially its
[special/ordinary cases](https://github.com/mongodb/specifications/blob/d75d82b18b6f267dc00e75103105d48980181ef1/source/bson-corpus/tests/decimal128-1.json)
and
[clamped/subnormal boundaries](https://github.com/mongodb/specifications/blob/d75d82b18b6f267dc00e75103105d48980181ef1/source/bson-corpus/tests/decimal128-5.json).
HDoc fixtures must additionally prove the stricter cohort, zero-exponent, and one-NaN rules.

## String payload

A string payload is exactly the shortest-form UTF-8 byte sequence for its Unicode scalar values:

```text
payload = canonical_utf8_bytes
len(payload) = number of UTF-8 octets
```

There is no byte-order mark, length prefix, NUL terminator, normalization, case folding, locale,
replacement character, CESU-8, WTF-8, modified UTF-8, UTF-16, or UTF-32 form. U+0000 is ordinary
data, so an empty string is zero bytes while the one-scalar NUL string is `00`.

Readers validate the complete payload as canonical UTF-8 before exposure. They reject overlong,
truncated, surrogate, out-of-range, and otherwise malformed sequences. They preserve exact
canonical bytes; canonically equivalent scalar sequences such as precomposed and decomposed
accented text remain different values. This follows the accepted string semantics and the
[Unicode UTF-8 encoding definition](https://www.unicode.org/versions/latest/core-spec/chapter-3/).

The general string payload has no independent maximum below the complete HDoc/document/resource
limits. Field-name limits are separate and do not restrict string values. A root string `_id`
additionally obeys the accepted 1,024-byte ID payload limit.

## Binary payload and subtype registry

Binary uses:

```text
payload = subtype:u8 || exact_data_bytes
len(payload) = 1 + len(exact_data_bytes)
```

Data may be empty and may contain any octet sequence. The subtype participates in typed identity,
comparison, hashing, indexing, backup, and round trip. It is not a second HDoc type tag and is not
inferred from length/content.

HDoc 1.0 assigns only subtype `0x00`:

| Subtype | Stable name | Meaning |
| ---: | --- | --- |
| `0x00` | `generic` | Exact uninterpreted octets |

The remaining byte space is fully reserved:

| Range | Class | Reader behavior | Allocation owner |
| --- | --- | --- | --- |
| `0x01`–`0x3f` | Future standard subtypes | Reject while unassigned | Accepted format change |
| `0x40`–`0x7f` | Registered semantic extensions | Require understood registry and required feature | `P03-015` or successor |
| `0x80`–`0xef` | Experimental/private | Reject in supported HDoc | Explicit experimental profile only |
| `0xf0`–`0xfe` | Future control | Reject | Future major format only |
| `0xff` | Permanently invalid | Reject | Never allocated |

An unknown subtype cannot be preserved as a normal opaque value because its subtype already
changes equality/order/hash semantics. Import/quarantine tooling may retain the source artifact
outside normal HDoc. UUIDs, ObjectIds, vectors, compressed blocks, and encrypted envelopes use
their own type/feature contracts and cannot masquerade as binary subtype assignments.

## Temporal payloads

### Timestamp

Timestamp is the accepted signed count of Unix microseconds:

```text
payload = i64_le(microseconds_since_1970_01_01T00_00_00Z)
```

The decoder must enforce the inclusive range:

```text
-62_135_596_800_000_000
through
253_402_300_799_999_999
```

These are the UTC instants from `0001-01-01T00:00:00.000000Z` through
`9999-12-31T23:59:59.999999Z`. Offset/zone text, host time objects, Unix milliseconds, leap-second
tables, MVCC timestamps, and monotonic clocks are not payload alternatives.

| Instant | Logical count | Payload |
| --- | ---: | --- |
| minimum | `-62135596800000000` | `0040d400014023ff` |
| Unix epoch | `0` | `0000000000000000` |
| maximum | `253402300799999999` | `ff5f73cc0c448403` |

### Date

Date is the accepted proleptic-Gregorian civil-day count:

```text
payload = i32_le(days_since_1970_01_01)
```

The decoder enforces `-719_162` through `2_932_896`, corresponding to `0001-01-01` through
`9999-12-31` inclusive.

| Date | Logical count | Payload |
| --- | ---: | --- |
| `0001-01-01` | `-719162` | `c606f5ff` |
| `1970-01-01` | `0` | `00000000` |
| `9999-12-31` | `2932896` | `a0c02c00` |

A date remains distinct from a timestamp. Neither encoding performs an implicit midnight or
timezone conversion.

## Identifier payloads

### UUID

UUID is the exact 16 octets in the network/big-endian field order defined by
[RFC 9562](https://www.rfc-editor.org/rfc/rfc9562). The octet sequence is already canonical opaque
data, so HDoc does not reverse the complete UUID or reverse its historical fields on a
little-endian host.

```text
text:    f81d4fae-7dec-11d0-a765-00a0c91e6bf6
payload: f8 1d 4f ae 7d ec 11 d0 a7 65 00 a0 c9 1e 6b f6
```

All 128-bit payloads are storable, including nil/max and explicitly supplied non-IETF
variants/versions. Storage does not validate generation history or rewrite version/variant bits.
COM GUID mixed-endian memory layout is not accepted as a direct payload copy.

### ObjectId

ObjectId is the exact 12 logical octets in their existing order:

```text
text:    507f1f77bcf86cd799439011
payload: 50 7f 1f 77 bc f8 6c d7 99 43 90 11
```

Every 96-bit payload is storable. The
[MongoDB ObjectId specification](https://github.com/mongodb/specifications/blob/d75d82b18b6f267dc00e75103105d48980181ef1/source/bson-objectid/objectid.md)
defines the optional generated timestamp/random/counter interpretation; HDoc does not rearrange
those fields. Arbitrary explicit bytes remain opaque, and timestamp extraction never proves
provenance.

UUID and ObjectId start at byte alignment one because they are opaque byte sequences, not native
128/96-bit integer structs. P03-005 may place a following payload at its own required alignment.

## Vector payloads

### Common layout

Both vector types begin with the exact dimension:

```text
offset  bytes  field
0       4      N:u32-le
4       ...    N exact element bit patterns in index order
```

`N` is inclusive 1 through 4,096. The dimension is part of logical type identity even though it is
payload metadata rather than a separate type tag. The containing length must satisfy the exact
family equation, so no sparse elements, missing/null components, padding between elements, or
trailing bytes are possible.

Vector payloads start at 4-byte alignment. The dimension is aligned to four, every f32 element is
aligned to four, and every f16 element begins at an even offset. No vector or following payload
requires alignment greater than eight.

### `vector<f32,N>`

```text
payload = u32_le(N) || little_endian(binary32_bits[0]) || ... || little_endian(binary32_bits[N-1])
len(payload) = 4 + 4N
8 <= len(payload) <= 16,388
```

IEEE binary32 has one sign bit, eight exponent bits, and 23 fraction bits. Exponent `0xff` denotes
NaN/infinity and is rejected for every element. Finite normal/subnormal values and both signed
zeros are accepted with exact bits preserved.

Example:

```text
N=3, bits=[3f800000,80000000,00000001]
payload=03000000 0000803f 00000080 01000000
```

### `vector<f16,N>`

```text
payload = u32_le(N) || little_endian(binary16_bits[0]) || ... || little_endian(binary16_bits[N-1])
len(payload) = 4 + 2N
6 <= len(payload) <= 8,196
```

IEEE binary16 has one sign bit, five exponent bits, and ten fraction bits. Exponent `0x1f` denotes
NaN/infinity and is rejected. Finite normal/subnormal values and both signed zeros are accepted and
preserved even when an execution path later widens them exactly.

Example:

```text
N=3, bits=[3c00,8000,0001]
payload=03000000 003c 0080 0100
```

Family, dimension, element order, and exact bits all participate in typed payload identity.
Physical CPU/GPU conversion, normalization, or candidate scoring never changes stored bytes.

## Placement, alignment, and length ownership

This task defines each payload's required start alignment and intrinsic bytes. P03-005 must define
the complete value-area algorithm with these invariants:

- the value-area section begins at an 8-byte boundary under the parent envelope;
- each payload starts at the smallest offset at or after the previous payload end satisfying its
  listed alignment;
- any intervening bytes are the minimum required zero padding and belong to neither payload;
- the containing `value_length` counts payload bytes only, never preceding/following padding;
- fixed-width lengths and vector equations are exact;
- strings/binary use the containing length without a duplicate internal length; and
- zero-length null/empty-string offsets and container references receive one unambiguous canonical
  rule rather than host-dependent special cases.

Until P03-005 assigns those records/order/offset rules, concatenating examples from this document
does not make a canonical value area.

## Validation order and atomic exposure

After the parent envelope establishes bounded section slices, a validating reader applies this
payload sequence without narrowing or unchecked arithmetic:

1. validate the containing record/tag/offset/length enough to identify one bounded payload;
2. validate the tag is assigned and the offset satisfies that payload's alignment;
3. validate fixed/minimum/exact dimensioned length before reading a body or allocating;
4. decode integer metadata with explicit little-endian loads;
5. enforce bool, temporal, decimal, UTF-8, binary-subtype, identifier-length, dimension, and vector
   finite-element rules for the selected tag;
6. reject noncanonical aliases, unused/trailing bytes, overlap, and nonzero external padding;
7. continue whole-document structure, checksum, limits, and typed-hash validation; and
8. expose the document and all values only after every required validation succeeds.

Readers should report a bounded offset, type tag, rule identifier, and phase without logging the
payload. A malformed payload under a known supported HDoc profile is `DUR_CORRUPTION`. A document
that correctly declares a registered type/subtype feature the reader does not implement is
`CAP_FORMAT_UNSUPPORTED`; an unassigned byte presented as valid in the known base profile is
corruption. Typed user input rejected before HDoc creation uses the established parse/type/range
error instead and publishes no partial mutation.

## Canonicality and limits

- Every fixed-width payload is checked before a load.
- Every offset/length/addition/multiplication, including `4 + element_bytes * N`, uses checked
  wider arithmetic before allocation or reference formation.
- The complete uncompressed canonical HDoc remains at most 16,777,216 bytes.
- Vector dimension remains 1 through 4,096; exact payload maxima are 16,388 bytes for f32 and
  8,196 bytes for f16.
- Root string/generic-binary IDs additionally remain at most 1,024 data bytes.
- Generic strings/binary values have no separate larger allowance; complete document and resource
  limits bind them.
- Compression never changes logical payload bytes or permits a value/document over its canonical
  limit.

No reader repairs invalid UTF-8, truncates values/vectors, maps an unknown subtype to generic,
clamps temporal values, canonicalizes corrupt decimal bytes in place, substitutes nonfinite vector
elements, or silently retags a payload.

## Hashing, equality, and comparison boundary

This task fixes the payload identity that `P03-006` must frame. It does not assign hash-domain or
length-prefix bytes.

Typed content identity must retain:

- the stable type tag plus these exact canonical payload bytes;
- float64 signed zero and every exact NaN pattern;
- decimal sign/canonical tuple and the one canonical special representation;
- string UTF-8 bytes and binary subtype/data;
- temporal units/counts and exact identifier octets; and
- vector family, dimension, order, signed-zero bits, and exact finite element bits.

Semantic comparison/equality hashes remain separate. They may normalize numeric equality, signed
zero, decimal/float NaN classes, or vector signed-zero equality only under the accepted operator
contract. They never authorize rewriting stored payload bytes.

## Version, migration, and rollback

These payload encodings are stable for HDoc major 1. A minor/profile cannot reinterpret an
existing tag's length, endianness, decimal formula, temporal unit, identifier order, binary subtype,
vector prefix, or validation domain.

Before `P03-016`, no valid HDoc fixture/persisted database exists, so a reviewed superseding change
can replace this registry without data migration. After immutable fixtures or data exist:

- changing an existing encoding requires a new incompatible format/profile and historical reader;
- binary subtype assignment uses an unassigned registered byte plus required feature and never
  reuses a retired meaning;
- migrations decode the old exact logical value, encode the new canonical payload, validate the
  complete new HDoc/hash, and atomically publish while retaining rollback source;
- a downgrade rejects payload/profile features it cannot preserve; and
- WAL/SST/VLOG, backup, replication, protocols, SDKs, and adapters publish explicit format support.

## Subordinate ownership

| Task | Owns next | Cannot change from P03-004 |
| --- | --- | --- |
| `P03-005` | Containing records, value-area order, offsets, external padding, object/array tables | Payload bytes, lengths, or alignments listed here |
| `P03-006` | CRC replay and typed-hash domain/length/tree framing | Canonical logical payload identity |
| `P03-007` | Deterministic bounded compression blocks/codecs | Expanded canonical payload bytes |
| `P03-008`–`P03-010` | Safe encoder, validating decoder, owned/borrowed values | Host-independent encoding and fail-closed rules |
| `P03-015` | Required-feature negotiation and registered subtype extensions | Existing subtype/encoding assignments |
| `P03-016`–`P03-019` | Complete golden HDocs, independent readers, malformed/property/fuzz suites | Payload vectors and rejection expectations |

## Required validation cases

Later complete fixtures/property/fuzz suites must include:

- null versus empty string versus generic empty binary and present null versus Missing;
- Boolean `00`/`01` and every other byte rejection;
- integer minima/maxima, widths, sign extension mistakes, and endian swaps;
- float normals/subnormals, both zeros/infinities, quiet/signaling NaNs, payload/sign preservation,
  and host-operation quieting canaries;
- decimal zero signs, coefficient/exponent boundaries, subnormals, highest clamping, infinities,
  canonical NaN, cohort/zero-exponent/steering/noncanonical-special rejection, and BID endian swaps;
- empty/NUL/supplementary/composed/decomposed strings and every malformed UTF-8 class;
- generic empty/mixed binary data, every reserved-range edge, and unknown-subtype rejection;
- timestamp/date minima/maxima/next-outside values and endian/unit confusion;
- UUID nil/max/variants/network order and ObjectId arbitrary/generated/endian cases;
- f16/f32 dimension 1/4,096, signed zeros, min/max finite, normals/subnormals, every nonfinite
  class, length mismatch, family swap, endian swap, and trailing bytes;
- alignment/padding/overlap/alias/overflow/limit mutations under P03-005; and
- identical Rust/TypeScript/native/Wasm/browser values, bytes, typed hashes, errors, and diagnostics.

The payload examples in the machine registry are normative test inputs, not complete HDoc golden
documents. `P03-016` must embed them in immutable complete documents only after P03-005–P03-007
close the remaining byte grammar.

## References

- [Specifications section 7.2](../../Specifications.md#72-supported-value-types)
- [Specifications section 7.3](../../Specifications.md#73-canonical-binary-document-format)
- [Implementation plan Phase 3](../../ImplementationPlan.md#phase-3--hdoc-format-codec-and-path-dictionary)
- [Logical value model](../architecture/value-model.md)
- [Numeric semantics](../architecture/numeric-semantics.md)
- [Floating special-value semantics](../architecture/floating-special-semantics.md)
- [String semantics](../architecture/string-semantics.md)
- [Temporal semantics](../architecture/temporal-semantics.md)
- [Identifier semantics](../architecture/identifier-semantics.md)
- [Vector semantics](../architecture/vector-semantics.md)
- [Portable v1 limits](../architecture/limits-v1.md)
- [Versioned error semantics](../architecture/error-semantics.md)
- [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)
- [IEEE 754-2019 standard landing page](https://standards.ieee.org/ieee/754/6210/)
- [MongoDB Decimal128 specification](https://specifications.readthedocs.io/en/latest/bson-decimal128/decimal128/)
- [RFC 9562 UUID format](https://www.rfc-editor.org/rfc/rfc9562)
- [Unicode UTF-8 definition](https://www.unicode.org/versions/latest/core-spec/chapter-3/)

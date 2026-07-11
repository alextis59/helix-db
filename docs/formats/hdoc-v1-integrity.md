# HDoc 1.0 CRC-32C and Canonical Typed-Content Hashing

- Status: Accepted integrity profile within complete HDoc 1.0 grammar
- Last updated: 2026-07-11
- Owner: Storage architecture owner with Security and Query semantics review
- Plan item: `P03-006`
- Governing requirements: `CORE-001`, `DATA-001`, `DATA-002`, `INV-001`, `INV-007`
- Governing gate: `G03`
- Governing decision: [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)
- Outer envelope: [HDoc 1.0 envelope](hdoc-v1.md)
- Record grammar: [HDoc 1.0 records](hdoc-v1-records.md)
- Compression profile: [HDoc 1.0 compression](hdoc-v1-compression.md)
- Machine-readable companion: [hdoc-v1-integrity.json](hdoc-v1-integrity.json)

This document fixes HDoc 1.0's two deliberately separate integrity mechanisms:

1. CRC-32C diagnoses damage to the exact stored envelope bytes.
2. Unkeyed BLAKE3-256 profile 1 identifies the canonical typed logical tree independently of
   presentation order and permitted physical encodings.

It assigns the first valid nonzero footer hash profile, exact recursive framing, checksum coverage,
algorithm/profile vectors, reference uncompressed envelopes, failure order, and corruption versus
semantic-identity behavior. It does not make either mechanism an authenticator.

The [compression registry](hdoc-v1-compression.md) now fixes optional stored compressed bytes and
includes a compressed/uncompressed pair with equal typed hash and different CRC. The vectors here
remain normative integrity references, not the immutable supported fixture files owned by
`P03-016`.

## Normative status and notation

The [machine registry](hdoc-v1-integrity.json) is normative together with this document. A conflict
between them is a format defect and blocks `G03`; readers and writers must not choose one silently.

- `u8`, `u16`, `u32`, and `u64` are exact-width unsigned little-endian integers in hash frames.
- Hex digest strings list output bytes from first to last; they are never integer-reversed.
- `||` means exact byte concatenation.
- `BLAKE3(x)` means the first 32 bytes of default unkeyed BLAKE3 output over exact bytes `x`.
- `node_hash(tag, body)` is the profile-1 node operation defined below.
- `CRC32C_zero_crc(HDoc)` means CRC-32C over the exact HDoc slice while treating `[32,36)` as four
  zero bytes.

All lengths, counts, frame construction, and offset calculations use checked wide arithmetic
before narrowing. Hashing does not authorize reading an unvalidated attacker-chosen range.

## Two mechanisms, two identities

| Mechanism | Input | Changes when | Stays equal when | Purpose |
| --- | --- | --- | --- | --- |
| CRC-32C | Exact stored `[0,total_length)` bytes, checksum slot zeroed | Any covered physical byte changes | Stored bytes are identical | Fast accidental-corruption diagnosis |
| Typed content hash | Canonical typed logical tree | Exact name, tag, payload, object mapping, or array position changes | Only presentation/allowed physical encoding changes | Collision-resistant logical content identity |

Neither mechanism is a MAC, signature, authorization decision, or authenticated encryption. An
attacker able to replace a document can recompute both. Authenticated storage metadata, encryption,
backup signatures, replication identity, and transport security must bind HDoc through their own
versioned contracts.

## CRC-32C parameters

HDoc uses the reflected Castagnoli parameter set:

| Parameter | Exact value |
| --- | --- |
| Width | 32 bits |
| Normal polynomial | `0x1edc6f41` |
| Reflected polynomial | `0x82f63b78` |
| Initial register | `0xffffffff` |
| Reflect input | Yes |
| Reflect output | Yes |
| Final XOR | `0xffffffff` |
| ASCII check input | `123456789` |
| Check value | `0xe3069283` |
| Header storage | `u32` little-endian bytes `83 92 06 e3` |

One explicit bit-at-a-time reference recurrence for verification and test generation is:

```text
crc = 0xffffffff
for byte in input:
    crc = crc XOR byte
    repeat 8 times:
        if crc bit 0 is 1:
            crc = (crc >> 1) XOR 0x82f63b78
        else:
            crc = crc >> 1
result = crc XOR 0xffffffff
```

Production implementations may use reviewed table, CPU-intrinsic, SIMD, or platform CRC paths,
but every native/Wasm/browser path must match this output. This recurrence is not permission to
introduce data-dependent unsafe reads or skip bounds checks.

## Exact checksum coverage

The checksum field is header bytes `[32,36)`. Given an exact stored HDoc slice `D`:

```text
require len(D) == header.total_length
temporary = D with temporary[32:36] = 00 00 00 00
crc = CRC32C(temporary[0:total_length])
store crc as u32 little-endian at D[32:36]
```

Coverage includes:

- header fields and feature bits;
- every section-directory byte;
- stored compressed or uncompressed section bytes;
- every internal and top-level padding byte;
- extension bytes;
- footer magic/metadata/copies; and
- all 32 footer content-hash bytes.

Bytes after `total_length` are not silently ignored by an exact HDoc blob reader: they either
belong to a separately framed enclosing format or make the supplied HDoc slice invalid. CRC never
covers an enclosing page/file implicitly.

### Construction order and the apparent cycle

There is no CRC/hash cycle because the typed hash does not consume physical HDoc bytes:

1. validate and encode the canonical logical content;
2. calculate the profile-1 typed root digest;
3. write footer metadata and all 32 digest bytes;
4. leave `[32,36)` zero and finish every stored section/padding byte;
5. compute CRC-32C over the complete exact stored slice; and
6. write the resulting little-endian `u32` into `[32,36)`.

During verification the stored CRC is read only after safe length bounds, the checksum slot is
logically zeroed without mutating the sole source artifact, and the recomputed value is compared.

## CRC-32C reference vectors

[RFC 3720 appendix B.4](https://www.rfc-editor.org/rfc/rfc3720#appendix-B.4) publishes CRC-32C
bytes for fixed inputs. Those bytes equal HDoc's little-endian storage of the numeric result.

| Vector | Input | Numeric CRC | Stored bytes |
| --- | --- | --- | --- |
| Standard check | ASCII `123456789` | `0xe3069283` | `839206e3` |
| RFC zero32 | 32 × `00` | `0x8a9136aa` | `aa36918a` |
| RFC ones32 | 32 × `ff` | `0x62a8ab43` | `43aba862` |
| RFC incrementing | `00..1f` | `0x46dd794e` | `4e79dd46` |
| RFC decrementing | `1f..00` | `0x113fdb5c` | `5cdb3f11` |
| RFC iSCSI Read(10) PDU | 48 exact appendix bytes | `0xd9963a56` | `563a96d9` |

The machine registry contains every exact input generator/hex sequence. Endian-swapping the shown
stored bytes is a conformance failure even if the host library prints the numeric value normally.

## BLAKE3 algorithm assignment

Footer `hash_algorithm_id = 1` means:

```text
algorithm: BLAKE3
mode:      default unkeyed hash
output:    first 32 bytes
storage:   exact output octet order
```

Keyed mode and derive-key mode are not profile 1. A library API default must be selected explicitly
enough that an upgrade cannot switch modes. XOF output beyond byte 31 is not stored or silently
used as another field.

The machine registry pins seven official default-mode cases at input lengths 0, 1, 63, 64, 1,023,
1,024, and 1,025. They cross empty, compression-block, and chunk boundaries. Input byte `i` is
`i mod 251`, exactly as in the [official BLAKE3 vectors](https://github.com/BLAKE3-team/BLAKE3/tree/master/test_vectors).

Production code must use a reviewed BLAKE3 implementation. New handwritten cryptographic code is
not accepted merely because it passes these vectors. Optimized and portable paths must agree.

## Typed-content profile 1

Footer `hash_profile_id = 1` is named `hdoc-typed-content-tree-v1`. Profile zero remains permanently
invalid/unassigned. Unknown nonzero profiles fail with `CAP_FORMAT_UNSUPPORTED` before values are
exposed.

The root digest is the profile-1 hash of the canonical root object node. Root `_id` is an ordinary
included field under its exact tag/payload; protected mutation rules do not exclude it.

### Exact node frame

Every logical value becomes one BLAKE3 input:

```text
node_frame(tag, body) =
    domain[27]
 || profile_id:u16-le
 || type_tag:u8
 || body_length:u64-le
 || body[body_length]

node_hash(tag, body) = BLAKE3(node_frame(tag, body))
```

The 27 domain bytes are exact ASCII plus one terminal NUL:

```text
escaped: HDOC-TYPED-CONTENT-HASH-V1\0
hex:     48444f432d54595045442d434f4e54454e542d484153482d563100
```

Profile 1 is encoded as `01 00`. The type tag is the stable P03-003 byte. `body_length` counts only
following body bytes and is always the exact little-endian 64-bit length. The fixed node header is
38 bytes.

Changing domain case, punctuation, NUL, profile width/order, tag position, length width/order, or
digest byte order creates a different unsupported profile, not an equivalent implementation.

### Noncontainer bodies

For tags other than object/array:

```text
body = exact canonical P03-004 payload bytes
```

Therefore the typed hash retains:

- int32 versus int64 width;
- every exact binary64 bit, including zero sign and NaN sign/class/payload;
- canonical decimal sign/coefficient/exponent/special bytes;
- exact unnormalized UTF-8;
- binary subtype plus data;
- timestamp/date type and units;
- UUID versus ObjectId identity/order; and
- vector f32/f16 family, dimension, order, and finite element bits.

Null and empty string both have body length zero but different tags. Generic empty binary has body
`00`. Their frames and digests are distinct.

### Object bodies

An object body is:

```text
field_count:u32-le
for each field in strict binary_utf8_v1 name order:
    field_name_length:u32-le
 || exact field-name UTF-8 bytes
 || child node digest[32]
```

The count is immediate object fields, not recursive document `field_count`. Every field name is
unique and has length 1–1,024 after ordinary semantic validation. Child digests are exact output
bytes, never hex text or reversed integers.

Presentation ordinal, physical `field_id`, name-pool record ID, and physical container ID do not
enter the body. Thus two accepted objects with the same typed mapping but different presentation
orders have the same object and root digest. Canonical ordering is recomputed from exact name bytes;
the decoder does not trust physical table order without validating it.

### Array bodies

An array body is:

```text
element_count:u32-le
for each dense element at index i from 0 through count-1:
    i:u32-le
 || child node digest[32]
```

The explicit index must equal its zero-based entry position. Count, index, order, duplicates, nested
boundaries, element tags, and payloads therefore contribute. Missing/hole entries cannot be hashed
because they cannot be stored.

### Bottom-up tree algorithm

A bounded implementation may hash iteratively:

1. validate the complete logical tree and physical HDoc structure;
2. hash noncontainer nodes from exact payloads;
3. hash completed child containers bottom-up;
4. form each object/array body from exact child digest bytes;
5. hash the root object frame; and
6. compare all 32 output bytes with the footer.

No host recursion beyond `limits-v1`, map iteration, task completion order, pointer identity, or
parallel reduction order may affect frames. Parallel work may compute independent child digests,
but final bodies are assembled in canonical name/index order.

## What profile 1 excludes

The typed content hash deliberately excludes:

- object presentation ordinals;
- physical field/name/container IDs;
- offsets, lengths, table placement, and padding;
- compressed bytes, block boundaries, and codec IDs;
- collection path-dictionary numeric IDs;
- CRC and footer envelope metadata; and
- registered nonsemantic extension bytes.

It includes the exact logical facts recovered from those physical representations. A compressed,
dictionary-backed, or otherwise permitted physical profile must decode to the same canonical typed
tree and digest.

A semantic extension is excluded only if it is not semantics. Any extension that changes logical
content must register one canonical required logical contribution. An older reader unable to hash
that contribution rejects the required feature; it cannot verify a partial tree and claim success.

## Typed node vectors

The machine registry contains 23 exact bodies and digests: all 14 noncontainer tag families with
Boolean/float distinctions plus seven object/array nodes.

Selected boundary digests:

| Node | Tag | Body distinction | Digest |
| --- | ---: | --- | --- |
| null | `0x01` | empty | `e0ac2679c836c542a2722eb2dc548301293b90ba0399164560a22191ef46c101` |
| empty string | `0x07` | empty | `4c5bb70a9e7c38e3e5fb193b3bb59244932ac3d7135f73329e0230fbf7fb7c2c` |
| int32 one | `0x03` | `01000000` | `9cd88954ec556868cd45482e3967f48f68be3a2328378c2a8af049833668ebfd` |
| int64 one | `0x04` | eight bytes | `ef0dcdaf0af4fdb4bf04244dbfbde78d57cf82d74bad7ddad11307cf53bca235` |
| float +0 | `0x05` | positive-zero bits | `6f3edcd4166eb8e5a0320e2c5a5bf110c70d6db4800f542d1eb5bacb631fcce6` |
| float -0 | `0x05` | negative-zero bits | `52a756ed60bc94450d9abd529f75d6f3b5ed824996babf699cf38f8414b0d320` |
| empty object | `0x09` | count zero | `6b80baab2bce106382e6b54e5002065a77053dfc51a25917c2251fa83915d05a` |
| empty array | `0x0a` | count zero | `0f672ab2e0178f22272b7abf5e0a1965dc167289284712c856efd262466e374c` |
| `[null,true]` | `0x0a` | ordered indices | `e45af9eb5473d654f2505ee0e59c83ed0e01edf401f94f2a58b02270c64a97d2` |
| `[true,null]` | `0x0a` | reversed values | `43e535fac3e406f196186829860e77528c8bc6a7e689c19dfc937c4258d9a53d` |

The complete vector bodies—not only these summaries—are normative. `P03-008` replays them in the
production encoder tests; `P03-017` must independently replay
them through production and independent implementations.

## Uncompressed integrity-reference envelopes

Two 408-byte envelopes encode the same mapping:

```text
{_id: uuid-nil, n: null, s: string-empty}
```

Their only semantic-neutral difference is presentation order:

| Vector | Presentation | CRC-32C | Stored CRC bytes | Typed content hash |
| --- | --- | --- | --- | --- |
| `root-scalars-presentation-s-id-n` | `s,_id,n` | `0xf2666c12` | `126c66f2` | `b3c73f825bbc1f2fecd295a9ee93bff822dae8ba50f9209e5b85fd31b928ba74` |
| `root-scalars-presentation-id-n-s` | `_id,n,s` | `0x5f209897` | `9798205f` | `b3c73f825bbc1f2fecd295a9ee93bff822dae8ba50f9209e5b85fd31b928ba74` |

The different physical field ordinals change exact bytes and CRC. Canonical name order and typed
values are identical, so the content hash stays equal. Their exact complete hex and artifact
SHA-256 values are in the registry.

These vectors use hash algorithm/profile `1/1` and codec `0/0`. They prove the integrity slots and
coverage; `P03-016` still owns immutable supported golden fixture files after the now-complete
format registry is implemented.

## Corruption versus semantic-hash behavior

Validation outcomes depend on what was changed and which independent integrity value was repaired.

| Case | CRC result | Structure result | Typed hash result | Required outcome |
| --- | --- | --- | --- | --- |
| Covered byte flipped, CRC untouched | Fail | Not trusted/evaluated beyond safe bounds | Not evaluated | `DUR_CORRUPTION`, class `stored-crc32c` |
| UUID payload byte flipped, CRC recomputed, footer hash old | Pass | Pass | Fail | `DUR_CORRUPTION`, class `typed-content-hash` |
| Footer digest byte flipped, CRC recomputed | Pass | Pass | Fail | `DUR_CORRUPTION`, class `typed-content-hash` |
| Padding byte made nonzero, CRC recomputed | Pass | Fail canonicality | Not accepted even if logical hash would match | `DUR_CORRUPTION`, class `structural-canonicality` |
| Presentation permutation encoded canonically, CRC recomputed | Pass | Pass | Same as original | Accept once complete profile is supported; presentation differs |
| Attacker replaces content and recomputes both | Pass | Can pass | Can pass | Not authenticated; enclosing authenticated layer decides trust |

A CRC success never repairs or excuses structure, payload, canonicality, limit, decompression, or
typed-hash failure. A typed-hash success never excuses damaged physical bytes. A digest collision
never substitutes for canonical typed equality in collision-sensitive correctness paths.

## Validation order and exposure

A reader preserves this dependency order even if passes are fused:

1. Read only enough fixed header bytes to validate magic/version and exact bounded total length.
2. Recompute CRC-32C over the exact stored slice with `[32,36)` logically zero; reject mismatch.
3. Validate directory/footer fixed structure, feature/codec IDs, stored placement, and repeated
   fields; derive canonical logical section positions.
4. Validate compression tables, decode one bounded block at a time, and then validate decoded
   records, tags, payloads, names, ownership, counts, limits, and internal logical offsets.
5. Recreate and compare canonical compression bytes/section selection.
6. Reconstruct profile-1 nodes bottom-up and compare the root BLAKE3-256 output with the footer.
7. Only then expose an owned document, borrowed view, index value, sidecar input, replication
   record, backup item, or query result.

CRC may be computed before complex parsing only after total-length bounds prevent out-of-range
reads. Implementations must not allocate from unchecked directory/count fields just because CRC
will eventually validate them.

## Diagnostics and operational response

Existing authoritative-byte failures use `DUR_CORRUPTION`. Bounded details distinguish:

- `stored-crc32c`;
- `structural-canonicality`;
- `typed-content-hash`;
- later `decompression` classes; and
- enclosing-artifact corruption where HDoc cannot be safely isolated.

Diagnostics may include format/profile, section kind, bounded offset, check class, and expected/
observed length. They must not log names, values, full payloads, digests usable as sensitive data
correlators beyond policy, or the complete corrupt document.

Readers preserve/quarantine original authoritative bytes according to recovery policy. They never
rewrite the only source in place, guess a new CRC/hash, skip a corrupt row, return null/Missing, or
silently rebuild authoritative HDoc from derived indexes/sidecars.

Invalid new input is rejected before durable publication with its semantic/input/limit code rather
than first persisting corrupt bytes and reporting `DUR_CORRUPTION`.

## Performance and implementation boundary

- BLAKE3 child nodes may be computed in parallel, but assembly order is fixed.
- Validated child hashes may support incremental updates/caching only when ownership/version/
  collision confirmation preserves exact logical behavior.
- CRC hardware acceleration and BLAKE3 SIMD are optional and differential-tested against portable
  paths.
- Native, Wasm, and browser outputs are byte-identical; lack of an optimized instruction changes
  performance only.
- GPU kernels do not become an authoritative hash implementation in v1. A future accelerator must
  match the CPU/portable reference exactly and remain optional.
- CRC/hash time is included in encode/decode/lookup benchmarks; integrity cannot be omitted from a
  favorable performance result.

## Version, migration, and rollback

Hash algorithm ID `1`, profile ID `1`, domain bytes, frame widths/order, type tags, container bodies,
and digest byte storage are stable for HDoc 1.0. A minor version cannot reinterpret any of them.

Before `P03-016`, the integrity registry can be superseded through reviewed source rollback because
no immutable supported HDoc fixture/database exists. After immutable fixtures/data exist, changing
any profile-1 byte requires:

- a new nonzero profile ID or incompatible format version;
- retained support for historical profile-1 reads;
- immutable old/new algorithm, node, complete-envelope, and malformed vectors;
- atomic decode-old/hash-verify/encode-new/full-verify/publish migration;
- interruption, resume, downgrade, and rollback proof; and
- updates to WAL/SST/VLOG, replication, backup, restore, SDK, and protocol support matrices.

IDs are never reused. Reading never silently rehashes or rewrites. A migration verifies the old CRC
and typed hash before deriving a new artifact and retains the source until its rollback boundary.

## Subordinate ownership

| Task | Owns next | Cannot change from P03-006 |
| --- | --- | --- |
| [`P03-007`](hdoc-v1-compression.md) | Compressed block/codec profiles, coordinates, and stored vectors | CRC coverage or decoded typed hash |
| `P03-008`–`P03-009` (complete) | Production encoder/decoder integrity implementation | Algorithms, profile, frames, failure order |
| `P03-010` (complete) | Borrowed and owned logical-value exposure after typed-hash validation | Exact typed payload/container identity |
| `P03-011` (complete) | Exact-name and dotted-path lookup after whole-document validation | Exact typed payload/container identity and validation order |
| [`P03-012`](hdoc-v1-tagged-json.md) (complete) | Tagged rendering/import after complete logical validation | Exact typed payload/container identity and validation order |
| `P03-013`–`P03-015` | Dictionary/extensions/migration negotiation | Resolved names/content identity or ID reuse |
| `P03-016` | Immutable complete positive/malformed HDoc files | Existing registry vectors/expectations |
| `P03-017`–`P03-019` | Independent codecs, properties, corruption tests, fuzzing | Exact outputs and fail-closed behavior |
| `P03-020`–`P03-021` | Integrity-inclusive format/compression performance | Correctness, coverage, or authentication boundary |

## Required later fixtures

Complete tests must include:

- every RFC/official algorithm vector and every typed node vector;
- all 16 assigned tags, zero-length/null/string/binary distinctions, numeric widths, float bits,
  decimal cohorts, identifiers, and vector families;
- empty/deep/wide objects and arrays, canonical field order, explicit indices, nested containers,
  and exact count/length boundaries;
- identical mapping/different presentation and dictionary/compression/nonsemantic-extension
  physical variants with equal typed hash and appropriate different CRCs;
- name/tag/payload/position changes with different typed hashes;
- checksum field endian/zeroing/coverage mistakes and mutations in header/directory/section/padding/
  footer/hash;
- CRC fail, CRC pass plus structure fail, CRC pass plus typed-hash fail, and both integrity fields
  pass without authentication;
- unsupported algorithm/profile/feature behavior and no value exposure;
- native/portable/Wasm/browser incremental/one-shot/SIMD equivalence; and
- property/fuzz/sanitizer tests reaching each check class without unchecked allocation/read.

## References

- [Specifications section 7.3](../../Specifications.md#73-canonical-binary-document-format)
- [Study section 6](../../Study.md#6-hdoc-and-the-data-model)
- [Implementation plan Phase 3](../../ImplementationPlan.md#phase-3--hdoc-format-codec-and-path-dictionary)
- [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)
- [HDoc 1.0 envelope](hdoc-v1.md)
- [HDoc 1.x type tags](hdoc-v1-type-tags.md)
- [HDoc 1.0 noncontainer payloads](hdoc-v1-payloads.md)
- [HDoc 1.0 records](hdoc-v1-records.md)
- [HDoc 1.0 bounded section compression](hdoc-v1-compression.md)
- [HDoc lossless tagged JSON profile 1](hdoc-v1-tagged-json.md)
- [Object semantics and canonical hashes](../architecture/object-semantics.md)
- [Array semantics and canonical hashes](../architecture/array-semantics.md)
- [Versioned error semantics](../architecture/error-semantics.md)
- [Persistent format versioning policy](../governance/versioning.md)
- [RFC 3720 appendix B.4 CRC examples](https://www.rfc-editor.org/rfc/rfc3720#appendix-B.4)
- [BLAKE3 official repository and vectors](https://github.com/BLAKE3-team/BLAKE3)
- [BLAKE3 specification](https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf)

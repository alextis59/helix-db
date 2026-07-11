# HDoc 1.x Logical Type Tag Registry

- Status: Accepted type-identity registry; containing records fixed by `P03-005`
- Last updated: 2026-07-11
- Owner: Storage architecture owner with Query semantics review
- Format identity: HDoc major `1`, initial minor `0`
- Plan item: `P03-003`
- Governing gate: `G03`
- Governing decision: [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)
- Parent envelope: [HDoc 1.0 envelope format](hdoc-v1.md)
- Machine-readable companion: [hdoc-v1-type-tags.json](hdoc-v1-type-tags.json)
- Supersedes: None
- Superseded by: None

## Scope and maturity boundary

This document assigns the one-byte HDoc tag for every required stored logical value type and
reserves the rest of the byte space. It defines type identity, tag stability, unknown-tag
rejection, extension allocation classes, and the relationship between tags, semantic comparison,
typed hashing, fixtures, and subordinate payload/table work.

This registry does not itself define the bytes following a tag. Canonical noncontainer bytes are
fixed by the [HDoc 1.0 payload registry](hdoc-v1-payloads.md), and field/name/object/array/container
positions are fixed by the [HDoc 1.0 record registry](hdoc-v1-records.md). The parent envelope
uses the [profile-1 integrity registry](hdoc-v1-integrity.md) for exact typed hashing and the
[compression registry](hdoc-v1-compression.md) for optional stored representation. The complete
HDoc byte grammar is now assigned. Profile zero is permanently invalid. A tag plus invented host
bytes is not a valid HDoc value.

## Tag field contract

Every stored value position carries exactly one unsigned 8-bit `type_tag`. The tag is a semantic
discriminator, not a size code, storage optimization, host enum ordinal, JSON token, or comparison
rank.

```text
type_tag: u8
domain:   0x00 through 0xff
assigned HDoc 1.x core tags: 0x01 through 0x10
```

The byte has no endianness ambiguity. P03-005 fixes its exact position in field and array/container
records. A reader validates the tag before interpreting any payload offset/length as that type.

## Governing rules

1. Every accepted stored logical type has one and only one HDoc 1.x tag.
2. Different stored logical types never share a tag, even when some values compare equal.
3. One logical type never gains alternate tags for inline, short, common, dictionary, compressed,
   zero, empty, or otherwise optimized values.
4. The tag determines the payload grammar; payload shape never determines or coerces the tag.
5. `missing` is path-evaluation state, not a stored value, and has no tag.
6. Every unassigned/unknown tag is semantic and critical. A reader rejects it before exposing any
   document value.
7. Assigned or retired values are never reused for another meaning.
8. Extensions require a stable registry assignment and understood required feature. No vendor or
   application may claim a byte locally in a supported HDoc.
9. The canonical typed content hash includes the stable tag and canonical payload framing.
10. Semantic comparison/hash rules remain separate and cannot rewrite stored type identity.

## Core HDoc 1.x assignments

| Tag | Stable tag name | Logical type | Family | Width class | Payload owner |
| ---: | --- | --- | --- | --- | --- |
| `0x01` | `null` | `null` | Singleton | None | `P03-004` |
| `0x02` | `bool` | `bool` | Scalar | Fixed | `P03-004` |
| `0x03` | `int32` | `int32` | Numeric | Fixed | `P03-004` |
| `0x04` | `int64` | `int64` | Numeric | Fixed | `P03-004` |
| `0x05` | `float64` | `float64` | Numeric | Fixed | `P03-004` |
| `0x06` | `decimal128` | `decimal128` | Numeric | Fixed | `P03-004` |
| `0x07` | `string` | `string` | Byte sequence | Variable | `P03-004` |
| `0x08` | `binary` | `binary` | Byte sequence | Variable | `P03-004` |
| `0x09` | `object` | `object` | Container | Container reference | `P03-005` |
| `0x0a` | `array` | `array` | Container | Container reference | `P03-005` |
| `0x0b` | `timestamp` | `timestamp` | Temporal | Fixed | `P03-004` |
| `0x0c` | `date` | `date` | Temporal | Fixed | `P03-004` |
| `0x0d` | `uuid` | `uuid` | Identifier | Fixed opaque | `P03-004` |
| `0x0e` | `object_id` | `objectId` | Identifier | Fixed opaque | `P03-004` |
| `0x0f` | `vector_f32` | `vector<f32,N>` | Vector | Dimensioned | `P03-004` |
| `0x10` | `vector_f16` | `vector<f16,N>` | Vector | Dimensioned | `P03-004` |

The assignments are contiguous to support a small checked dispatch table. Contiguity is not a
promise that new core types receive the next byte; every future allocation follows the reserved
range and compatibility process.

### Stable names versus public syntax

`tag_name` is a lowercase machine identifier used by the registry and diagnostics. `logical_type`
is the stable logical name from the value model. SDK aliases, Rust enum variants, TypeScript class
names, Extended JSON wrappers, query `$type` spellings, and human renderings map explicitly to the
logical type; they do not change the HDoc byte.

`object_id` is the tag-registry spelling while `objectId` remains the logical/public type name.
The vector tag names avoid punctuation while their logical names retain element type and dimension
parameter.

## Per-family boundaries

### Null and Boolean

`null` has one tag. It is a present stored value and is never encoded by `0x00`, absence, a zero
offset, or the missing path state.

`bool` has one tag for both false and true. Separate “false” and “true” tags are forbidden; the
[payload registry](hdoc-v1-payloads.md) defines the canonical byte. Host truthiness, integer
zero/one, and strings cannot select this tag implicitly.

### Numeric types

The four numeric tags preserve stored type identity:

```text
int32      0x03
int64      0x04
float64    0x05
decimal128 0x06
```

Mathematically equal values may compare equal under the accepted numeric rules while retaining
different tags and typed content hashes. A writer does not choose the smallest width, promote an
integer because of host representation, turn decimal into float, or normalize a float into an
integer tag. The [payload registry](hdoc-v1-payloads.md) defines exact bits/tuples, including float
NaN payload preservation and canonical decimal cohorts.

### String and binary

`string` means valid exact UTF-8 under the accepted binary collation/no-normalization contract.
`binary` means subtype plus exact octets. Invalid UTF-8 never changes a `string` payload into
`binary` silently; the caller must supply the binary logical type.

Binary subtype is payload metadata, not a second HDoc type tag. UUID, ObjectId, vectors, encrypted
data, and compressed sections do not masquerade as binary subtypes when their distinct logical tag
or format feature applies.

### Object and array

`object` and `array` select container records defined by the
[record registry](hdoc-v1-records.md). They are not alternative tags for inline versus external
tables or empty versus nonempty containers.

Object mapping identity and presentation order remain separate: the object tag is identical for
every object, while container records preserve exact unique names and presentation metadata and
the typed content hash traverses canonical name order. Arrays retain position/order and every
element's own tag.

### Temporal values

`timestamp` and `date` remain distinct. A date is not a timestamp at midnight, and a timestamp is
not a locale/timezone string. The [payload registry](hdoc-v1-payloads.md) maps accepted UTC
microseconds and calendar-date domains to payload bytes without changing their tags.

### Identifiers

`uuid` and `objectId` remain distinct opaque identifier types. Text shapes, byte lengths, UUID
versions, or ObjectId-like payloads do not trigger tag inference. A primary `_id` uses the same tag
as that logical identifier elsewhere; there is no special primary-key UUID/ObjectId tag.

### Vectors

The logical element representation is part of vector type identity, so HDoc has two vector tags:

```text
vector<f32,N> 0x0f
vector<f16,N> 0x10
```

Dimension `N`, element bytes, finite-element validation, and alignment are fixed by the
[payload registry](hdoc-v1-payloads.md). Different dimensions share the family tag because the
dimension is per-value metadata; different element representations do not. CPU widening/fallback
during calculation never changes the stored tag.

## Missing is deliberately untagged

The semantic fixture system has a `missing` tag because expected path-evaluation outcomes must
represent absence. HDoc does not. `0x00` is invalid/uninitialized, not Missing.

Consequences:

- users cannot insert Missing;
- arrays cannot contain a Missing element;
- an absent field has no field-table entry at that object level;
- a present null field has a field entry with tag `0x01`;
- indexes/sidecars use separate presence metadata rather than a fake HDoc value; and
- a decoder encountering a purported Missing/zero tag rejects corruption instead of materializing
  absence.

This distinction is required for `DATA-002`; the record registry now fixes the exact physical
absence versus tagged-null representation.

## Semantic fixture reconciliation

The semantic coverage authority requires these 16 fixture tags:

```text
array binary bool date decimal128 float64 int32 int64
missing null object objectId string timestamp uuid vector
```

The HDoc registry also has 16 stored types, but the sets differ intentionally:

1. Remove the nonstorable fixture state `missing`.
2. Expand the fixture umbrella `vector` into `vector<f32,N>` and `vector<f16,N>`.
3. Keep every other fixture logical type one-to-one.

The result is exactly the 16 assigned HDoc tags. The verifier derives and compares this mapping
against `fixtures/semantic/coverage-v1.json`; a seventeenth stored type, missing tag, or collapsed
vector representation fails.

## Reserved and extension ranges

| Range | Class | Reader behavior | Writer behavior | Allocation authority |
| --- | --- | --- | --- | --- |
| `0x00` | Invalid sentinel | Reject | Forbidden | Never allocated |
| `0x11`–`0x3f` | Future standard logical types | Reject while unassigned | Forbidden until registered | Accepted format change |
| `0x40`–`0x7f` | Registered semantic extensions | Reject unless required feature and registry are understood | Forbidden until registered | `P03-015` or successor |
| `0x80`–`0xef` | Experimental/private | Reject in supported HDoc | Forbidden in supported HDoc | Explicit experimental profile only |
| `0xf0`–`0xfe` | Future control/escape space | Reject | Forbidden | Future major format only |
| `0xff` | Permanently invalid | Reject | Forbidden | Never allocated |

### Future standard logical types (`0x11`–`0x3f`)

This range is for a project-standard stored logical type added through an accepted semantic and
format change. Allocation requires exact semantics, payload, typed/comparison hash behavior,
query/index/sidecar/GPU/protocol/SDK rules, limits, feature/version behavior, golden vectors,
migration/rollback, and compatibility classification. Reserving the range does not pre-approve a
type.

### Registered semantic extensions (`0x40`–`0x7f`)

Every value tag changes logical meaning and typed hash input, so extension tags are always
semantic/critical. A document using one must carry an assigned required feature, and the reader
must understand both the feature and tag registry entry. An unknown extension tag cannot be
skipped as if it were a nonsemantic envelope extension.

Allocation IDs are global within HDoc major 1, stable, and never reused. Plugin, tenant, SDK,
adapter, or vendor namespaces do not allocate directly from this range.

### Experimental/private (`0x80`–`0xef`)

These bytes are a containment boundary, not a vendor extension API. They may appear only in an
explicit experimental profile whose artifacts cannot be opened as supported HDoc, enter normal
databases/backups/replication, or become release/gate fixtures. Promotion allocates a different
registered tag and migrates experimental data; no private meaning becomes standard by convention.

### Control/escape and invalid values (`0xf0`–`0xff`)

HDoc 1.x does not have a multibyte tag escape. `0xf0`–`0xfe` remain forbidden so a future major
format can design one without colliding with values. `0xff` is permanently invalid and cannot be
an escape, null, missing, tombstone, deleted marker, or end marker.

## Extension allocation checklist

Before any unassigned tag becomes valid, one reviewed change must:

1. assign stable tag/logical names and one byte from the correct range;
2. define exact semantic domain and interaction with Missing/null/numeric/object/array rules;
3. assign canonical payload, typed hash, comparison hash/equality/order, and rendering;
4. define every applicable query, update, aggregation, index, sidecar, GPU, protocol, SDK, backup,
   replication, and adapter behavior or explicit rejection;
5. assign a required feature and exact reader/writer/version compatibility;
6. define limits, resource behavior, malformed inputs, errors, and security review;
7. add immutable positive/boundary/unknown-tag/migration vectors and independent readers;
8. preserve the previous range registry and never reuse a retired assignment; and
9. update specification, ADR/change record, implementation plan, requirement ledger, release
   notes, migration, downgrade, and rollback boundary.

## Decoder and writer behavior

### Writer

A writer maps an already validated logical value variant to its single assigned tag. It MUST NOT:

- infer a tag from host object class name, payload byte length, JSON token, map shape, or field name;
- use `0x00`, any reserved/unassigned/experimental/private/control tag, or a registered extension
  without its required feature/profile;
- substitute string/binary, int32/int64, float/decimal, date/timestamp, UUID/ObjectId, object/array,
  or f16/f32 vector tags;
- choose an alternate tag as a size optimization; or
- emit a tag before all recursive type and limit validation succeeds.

### Reader

A reader:

1. validates envelope CRC, bounds, directory, and the containing field/container record enough to
   identify a single in-bounds tag byte;
2. dispatches only assigned core tags or understood registered extension tags;
3. validates the exact payload grammar for that tag;
4. rejects tag/payload/length/feature/container mismatches as corruption; and
5. exposes no partial document/value/view until the complete document and typed content hash pass.

For an unassigned/unknown tag in a normal value position, the result is
`CAP_FORMAT_UNSUPPORTED` when a supported required feature/type is unavailable, or
`DUR_CORRUPTION` when bytes claim a known HDoc profile in which that tag is invalid. The enclosing
operation fails; it cannot skip the field/array element, convert it to binary/null/missing, preserve
it as an opaque normal value, or trust a derived index instead.

Import tooling may preserve an unknown source-format value only in its separate quarantine/source
artifact. It cannot place unknown semantics into normal HDoc under a reserved tag.

## Hashing, equality, and ordering

The canonical typed content hash includes the assigned tag before the canonical payload framing.
Therefore stored `int32(1)` and `int64(1)`, UUID bytes and binary bytes, or f16/f32 vector values do
not collide merely because an operator could compare/convert them under an explicit rule.

Semantic comparison hashes and equality may normalize accepted numeric equivalence classes, object
field presentation, or other behavior defined by Phase 1. They are separate from the typed content
hash and never authorize changing a stored tag. Index encodings retain enough type/payload identity
for exact reconstruction even when comparison keys normalize.

The P03-006 integrity registry fixes exact hash framing. This task fixes the tag identity that
framing includes.

## Version, migration, and rollback

The 16 core assignments are stable for HDoc major 1. A minor/profile cannot reinterpret them. A
reader supporting 1.x may add a registered type only through required feature negotiation; an older
reader rejects it before value exposure.

P03-006 supplies complete integrity-reference envelopes for profile-1 hashing and CRC coverage.
P03-007 adds compressed/uncompressed complete reference envelopes and closes the byte grammar.
They remain validation references, not the immutable supported golden-fixture corpus that P03-016
must publish.
Before P03-016, this registry can be superseded without stored-data migration, but the superseding
change must preserve the historical decision. After fixtures/data exist:

- correcting an existing tag meaning requires a new incompatible format version, not reassignment;
- adding a type uses an unassigned registered value and required feature/profile;
- removing a type retires its tag permanently;
- migrations decode old exact semantics and encode new bytes atomically with source preservation;
- interruption, resume, typed-hash equivalence/transformation, downgrade, and rollback boundaries
  are tested; and
- backups, WAL/SST/VLOG, replication, protocols, SDKs, and adapters publish their version support.

## Subordinate ownership

| Task | Owns next | Cannot change from P03-003 |
| --- | --- | --- |
| [`P03-004`](hdoc-v1-payloads.md) | Canonical noncontainer payload bytes and validation | Tag values or logical meanings |
| [`P03-005`](hdoc-v1-records.md) | Field/array/container record positions for the one-byte tag | Tag width/assignments |
| [`P03-006`](hdoc-v1-integrity.md) | Typed-hash framing including tag and payload | Tag identity or unknown-tag rule |
| `P03-008`–`P03-011` (complete) | Encoder, decoder, owned/borrowed values, and raw lookup implementation | Closed-world registry semantics |
| `P03-015` | Feature negotiation and registered extension governance | Existing assignments or no-reuse rule |
| `P03-016`–`P03-019` | Golden vectors, independent readers, malformed tests, fuzzing | Historical registry bytes/expectations |

## Required validation cases

Later golden/property/fuzz suites must include:

- one minimum/representative/boundary value for each of the 16 assigned tags;
- nested occurrences in objects/arrays and root-system `_id` identifier cases;
- exact round trips preserving numeric width, float bits, decimal canonical tuple, identifier type,
  binary subtype, and f16/f32 vector family/dimension;
- null present versus missing absent and explicit rejection of tag `0x00`;
- every first/last byte of each reserved range plus `0xff`;
- unknown standard/extension/private/control tags with and without misleading feature bits;
- tag/payload/length/container/feature mismatches;
- no alternate compact tags for zero/empty/short/common values;
- typed-hash difference versus accepted semantic-comparison equality cases;
- registry no-duplicate/no-gap-overlap/full-256-byte classification checks;
- identical Rust/TypeScript tag dispatch and stable diagnostics; and
- mutations proving no unknown field/element is skipped or materialized as null/missing/binary.

## References

- [Specifications section 7.2](../../Specifications.md#72-supported-value-types)
- [Specifications section 7.3](../../Specifications.md#73-canonical-binary-document-format)
- [Implementation plan Phase 3](../../ImplementationPlan.md#phase-3--hdoc-format-codec-and-path-dictionary)
- [Logical value model](../architecture/value-model.md)
- [Missing and null semantics](../architecture/missing-null-semantics.md)
- [Numeric semantics](../architecture/numeric-semantics.md)
- [Floating special-value semantics](../architecture/floating-special-semantics.md)
- [Object semantics](../architecture/object-semantics.md)
- [Array semantics](../architecture/array-semantics.md)
- [Temporal semantics](../architecture/temporal-semantics.md)
- [Identifier semantics](../architecture/identifier-semantics.md)
- [Vector semantics](../architecture/vector-semantics.md)
- [HDoc 1.0 canonical noncontainer payloads](hdoc-v1-payloads.md)
- [HDoc 1.0 field/name/value-reference/container records](hdoc-v1-records.md)
- [HDoc 1.0 CRC-32C and canonical typed-content hashing](hdoc-v1-integrity.md)
- [HDoc 1.0 bounded section compression](hdoc-v1-compression.md)
- [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)

# HDoc 1.0 Field, Name, Value-Reference, and Container Records

- Status: Accepted table/container layout; integrity fixed; complete HDoc still blocked by `P03-007`
- Last updated: 2026-07-11
- Owner: Storage architecture owner
- Plan item: `P03-005`
- Governing requirements: `CORE-001`, `DATA-001`, `DATA-002`, `INV-001`, `INV-007`
- Governing gate: `G03`
- Outer envelope: [HDoc 1.0 envelope](hdoc-v1.md)
- Type identities: [HDoc 1.x type tags](hdoc-v1-type-tags.md)
- Noncontainer bytes: [HDoc 1.0 payloads](hdoc-v1-payloads.md)
- Machine-readable companion: [hdoc-v1-records.json](hdoc-v1-records.json)

This document fixes every HDoc 1.0 base-profile record inside `field_table`, `name_pool`,
`value_area`, and `container_tables`. It defines exact widths and offsets, document-local field
IDs, name deduplication, object presentation metadata, dense arrays, the uniquely owned container
tree, value placement, section `item_count` meanings, and canonical rejection rules.

The [integrity registry](hdoc-v1-integrity.md) now assigns typed-content hash profile 1 and CRC
coverage. This document does **not** assign compression. The layouts below remain section-local
structural vectors rather than immutable persisted fixtures; `P03-007` and `P03-016` own those
later steps.

## Normative status and notation

The [machine registry](hdoc-v1-records.json) is normative together with this document. A conflict
between them is a specification defect and blocks `G03`; an implementation must not choose one
silently. All integer fields are unsigned little-endian unless explicitly stated otherwise.

Notation:

- `u8`, `u16`, and `u32` are exact-width unsigned integers.
- `abs(x)` means an absolute byte offset from HDoc byte zero.
- `alignN(x) = (x + N - 1) & ~(N - 1)` after checked wide arithmetic.
- `[a,b)` is a half-open byte range.
- `F` is total recursive object-field count.
- `N` is the number of distinct exact field names in the document.
- `C` is total object-plus-array container count, including the root.
- `A` is total immediate array-entry count summed across every array container.
- `V` is the number of noncontainer value occurrences, including zero-byte null and empty-string
  payloads.

`Missing` is not a value, has no tag, and creates no field or array entry. A present null creates a
normal tagged value reference with tag `0x01`, length zero, and a canonical cursor offset.

## Base-profile overview

The four required section bodies are:

```text
field_table
  F × FieldEntry[24]

name_pool
  N × NameRecord[8]
  exact distinct name bytes in NameRecord order

value_area
  exact noncontainer payload occurrences in canonical reference order
  minimum zero padding needed by each P03-004 payload alignment

container_tables
  C × ContainerDescriptor[32]
  A × ArrayEntry[12]
```

There are no internal section headers, terminators, native structs, implicit lengths, pointer-sized
fields, hidden capacity bytes, or unused tail bytes. The outer directory already supplies section
offset, stored/logical length, version, and item count. An uncompressed base section has the exact
body above and follows the outer `0x0006` flags and codec `0/0` rules.

Exact base equations are:

```text
field_table.logical_length = F * 24
name_pool.logical_length = N * 8 + sum(distinct_name_byte_lengths)
container_tables.logical_length = C * 32 + A * 12

field_table.item_count = F = header.field_count = footer.field_count_copy
name_pool.item_count = N
value_area.item_count = V
container_tables.item_count = C
```

Every multiplication, sum, alignment, offset, and end calculation is performed in checked width
of at least 64 bits before proving that the result fits `u32` and the 16 MiB canonical-document
limit.

## Canonical identity and ordering model

HDoc must preserve three facts without conflating them:

1. An object is a mapping from unique exact UTF-8 names to values.
2. Canonical name order is exact `binary_utf8_v1` ascending byte order.
3. Presentation order is observable on reads but does not define mapping equality or typed content
   identity.

The physical field span for each object is in canonical name order. Each entry separately stores a
`presentation_ordinal`. Consequently, exact mapping lookup and hashing do not depend on host map
iteration, while a reader can reproduce the accepted presentation sequence exactly. Reordering an
object's presentation changes HDoc physical bytes and CRC, but `P03-006`'s typed-content hash must
remain presentation-independent as required by object semantics.

Arrays are finite dense ordered sequences. Their entries are stored in exact element-index order;
there is no ordinal field because array order itself is semantic. A sparse hole cannot be encoded
as `Missing`, an omitted entry, a zero tag, or an offset sentinel.

## Document-local name IDs

All distinct field names anywhere in one document are deduplicated by exact canonical UTF-8 bytes,
sorted in strict `binary_utf8_v1` order, and assigned dense zero-based IDs:

```text
field_id(name) = zero-based NameRecord index
```

This base `field_id` is a document-local exact-name ID. It is not a collection path-dictionary ID,
not a global schema ID, and not a unique occurrence ID. The same exact name used in several objects
has the same base field ID. A field ID is never interpreted without the containing HDoc name pool.

This gives base-profile lookup:

1. binary-search the strict sorted name records by exact bytes to obtain `field_id`;
2. binary-search the target object's strict increasing field-ID span; and
3. follow the validated value reference.

`P03-013` may later define a required-feature-gated collection path-dictionary profile. It cannot
reinterpret base bytes, reuse this namespace silently, or make a base HDoc depend on external
state. Until that profile is present and understood, every HDoc is self-contained and retains all
exact field-name bytes.

## `FieldEntry` — 24 bytes

Every object member has one entry in `field_table`.

| Offset | Bytes | Field | Encoding | Canonical meaning |
| ---: | ---: | --- | --- | --- |
| 0 | 4 | `field_id` | `u32` | Zero-based `NameRecord` index |
| 4 | 4 | `field_name_offset` | absolute `u32` | Exact name-byte start in `name_pool` |
| 8 | 2 | `field_name_length` | `u16` | Exact UTF-8 byte length, 1–1,024 |
| 10 | 1 | `type_tag` | `u8` | Assigned HDoc logical type tag |
| 11 | 1 | `flags` | `u8 = 0` | Reserved; any nonzero bit is noncanonical |
| 12 | 4 | `value_offset` | absolute `u32` | Payload start or child descriptor start |
| 16 | 4 | `value_length` | `u32` | Exact payload length or `32` for a container |
| 20 | 4 | `presentation_ordinal` | `u32` | Position in the owning object's presentation order |

For every field:

- `field_id < name_pool.item_count`;
- `field_name_offset` and `field_name_length` exactly equal that `NameRecord` tuple;
- the referenced bytes decode as the same accepted field name;
- the field span of one object is strictly increasing by `field_id`, so sibling duplicates are
  impossible;
- its presentation ordinals are a permutation of every integer in `[0,item_count)` exactly once;
- `type_tag` is assigned and not `0x00`, reserved, or Missing; and
- the value tuple obeys the noncontainer or container reference rules below.

Field entries are globally grouped by owning object descriptor in increasing `container_id`. Array
descriptors contribute no field entries. An object descriptor's span is contiguous. The ordered
object spans exactly partition all `F` records without a gap, overlap, alias, or unused record.

The redundant name offset/length is deliberate: validated views can fetch an exact name without a
second record load, while validation cross-checks that numeric IDs never detach from original
bytes. No writer may exploit the redundancy to encode two conflicting names.

## `NameRecord` — 8 bytes

The first `N * 8` bytes of `name_pool` are the record table. Its byte suffix begins immediately
after the last record.

| Offset | Bytes | Field | Encoding | Canonical meaning |
| ---: | ---: | --- | --- | --- |
| 0 | 4 | `name_offset` | absolute `u32` | Exact name start in the suffix |
| 4 | 2 | `name_length` | `u16` | UTF-8 bytes, 1–1,024 |
| 6 | 2 | `scalar_count` | `u16` | Decoded Unicode scalars, 1–256 |

The ID is the record index and is not stored again. Name records are strictly sorted by the exact
referenced bytes; equal or out-of-order adjacent records are invalid. Each name is valid canonical
UTF-8 and passes the v1 field-name grammar: no repair or normalization, no NUL/C0/DEL, no dot, and
no leading dollar sign.

Name bytes are concatenated in record order with no prefix, suffix, terminator, alignment gap, or
deduplication alias:

```text
name_bytes_start = name_pool.section_offset + N * 8
NameRecord[0].name_offset = name_bytes_start
NameRecord[i + 1].name_offset = NameRecord[i].name_offset + NameRecord[i].name_length
last_name_end = name_pool.section_offset + name_pool.logical_length
```

Every record is referenced by at least one field. Bytes not described by a record, overlapping
name ranges, an offset into the record table, or a suffix left unused are noncanonical. `N = 0`
requires a zero-length `name_pool` and is structurally possible only when `F = 0`.

## `ArrayEntry` — 12 bytes

Every immediate array element has one entry in the suffix of `container_tables`, after all
descriptors.

| Offset | Bytes | Field | Encoding | Canonical meaning |
| ---: | ---: | --- | --- | --- |
| 0 | 1 | `type_tag` | `u8` | Assigned HDoc logical type tag |
| 1 | 1 | `flags` | `u8 = 0` | Reserved |
| 2 | 2 | `reserved_0` | `u16 = 0` | Reserved |
| 4 | 4 | `value_offset` | absolute `u32` | Payload start or child descriptor start |
| 8 | 4 | `value_length` | `u32` | Exact payload length or `32` for a container |

Entries for one array are contiguous and already correspond to indices `0` through
`item_count - 1`. Array spans are grouped by array descriptor `container_id` ascending and exactly
partition the complete array-entry suffix. Empty arrays use the current canonical suffix cursor
with count zero and own no entry bytes; consecutive empty spans may therefore share a cursor.

An array entry can contain null, an object, another array, or any other stored logical type. It
cannot contain Missing or a hole. Removing an array element changes the dense sequence and all
following indices; it never leaves an unaddressed record.

## `ContainerDescriptor` — 32 bytes

The first `C * 32` bytes of `container_tables` are descriptors in exact `container_id` order.

| Offset | Bytes | Field | Encoding | Canonical meaning |
| ---: | ---: | --- | --- | --- |
| 0 | 4 | `container_id` | `u32` | Must equal zero-based descriptor index |
| 4 | 1 | `type_tag` | `u8` | `0x09` object or `0x0a` array |
| 5 | 1 | `flags` | `u8 = 0` | Reserved |
| 6 | 2 | `depth` | `u16` | Root 1; child is parent depth + 1; maximum 100 |
| 8 | 4 | `item_offset` | absolute `u32` | First owned field or array-entry cursor |
| 12 | 4 | `item_count` | `u32` | Immediate fields or dense elements |
| 16 | 4 | `recursive_field_count` | `u32` | Object fields in this complete subtree |
| 20 | 4 | `parent_container_id` | `u32` | Owning container, or root sentinel |
| 24 | 4 | `parent_slot` | `u32` | Canonical object-member ordinal, array index, or root sentinel |
| 28 | 4 | `reserved_0` | `u32 = 0` | Reserved |

Descriptor zero is the only root and is always:

```text
container_id = 0
type_tag = 0x09                    // object
depth = 1
parent_container_id = 0xffffffff
parent_slot = 0xffffffff
```

No nonroot descriptor may use either root sentinel. For an object parent, `parent_slot` is the
child reference's zero-based ordinal in the parent's canonical field span, not presentation
ordinal. For an array parent it is the exact array index. The referenced child tag and descriptor
tag must match.

An object descriptor has:

```text
item_offset = field_table.section_offset + first_owned_field_index * 24
item_count <= 10,000
```

An array descriptor has:

```text
array_entries_start = container_tables.section_offset + C * 32
item_offset = array_entries_start + first_owned_array_index * 12
item_count <= 1,000,000
```

For a zero-count span, `item_offset` is still the current canonical cursor computed from all prior
same-kind descriptor spans. It may equal a later nonempty span's start or the corresponding table
end, but it cannot be an arbitrary in-range pointer.

`recursive_field_count` counts object fields, not containers or array positions:

```text
object.recursive_field_count = object.item_count
                             + sum(child_container.recursive_field_count)

array.recursive_field_count  = sum(child_container.recursive_field_count)
```

Only immediate container-valued children participate in the sum; their values recursively include
all descendants. The root recursive count equals `F`, the directory item count, and both repeated
envelope field counts. Bottom-up recomputation must match every descriptor.

## Canonical container IDs and ownership

The logical value is a tree, never an on-disk graph. Every nonroot descriptor has exactly one
incoming field/array reference and one matching parent tuple. An unreachable descriptor, two
references to one descriptor, a parent mismatch, a cycle, or a self-reference is invalid.

IDs are assigned by this deterministic breadth-first queue:

```text
queue = [root object assigned id 0]
next_id = 1

for container in queue order:                 // ascending assigned id
    if object:
        children = members in canonical field-name order
    else:
        children = elements in array-index order

    for child in children:
        if child is object or array:
            assign child id = next_id
            next_id += 1
            append child to queue
```

The descriptor table is then emitted by ID. A decoder independently reproduces this scan from the
root references and rejects any different numbering even if the graph would otherwise be
reachable. Presentation-only reordering changes presentation ordinals, not IDs. Repeated equal
host objects/arrays serialize by value as distinct descriptor subtrees; cyclic host values are
rejected before encoding.

## Value-reference union

`FieldEntry` and `ArrayEntry` carry the same logical tuple:

```text
(type_tag, flags=0, value_offset, value_length)
```

There is no inline value form and offset zero is not a sentinel.

### Noncontainer values

For tags other than object/array:

- `value_offset` targets `value_area` or its one-past-end cursor for a zero-byte payload;
- `value_length` is exactly the tag's `P03-004` length;
- the complete bytes validate under that tag and cannot contain ignored trailing bytes;
- each occurrence is emitted separately, even when its bytes equal another occurrence; and
- every nonzero range has one owner and cannot alias or overlap another payload.

The directory `value_area.item_count` is the number of these reference occurrences, not the byte
length and not the number of nonempty ranges. Thus null and empty string each add one even though
they add no payload bytes. Container references add zero.

### Container values

For object/array tags:

```text
value_offset = container_tables.section_offset + child_container_id * 32
value_length = 32
```

The target must be the start of the one canonical child descriptor, and its tag must match. A
container has no payload bytes in `value_area`; its members are reached through the descriptor's
span. An offset into an array-entry suffix or the middle of a descriptor is invalid.

### Missing and null

- Missing means no object field exists. It cannot occur in an array and has no tag/reference.
- Present null uses tag `0x01`, an exact length of zero, and the current canonical value cursor.
- Empty string also has length zero but tag `0x07`.
- Generic empty binary has tag `0x08`, length one, and subtype byte `0x00`.

Hosts must not collapse these states through null pointers, options, sparse arrays, truthiness, or
zero offsets.

## Canonical value-area packing

Payload occurrences are ordered by scanning descriptors in increasing `container_id`. For an
object, scan its canonical field span; for an array, scan its element span. Skip container
references. For every noncontainer occurrence:

```text
alignment = P03-004 alignment for type_tag
payload_offset = align(alignment, cursor)
bytes[cursor:payload_offset] = minimum zero padding
record.value_offset = payload_offset
record.value_length = exact canonical payload length
bytes[payload_offset:payload_offset + value_length] = exact payload
cursor = payload_offset + value_length
```

The initial cursor is `value_area.section_offset`, and the final cursor must equal the section end.
The absolute offset, not an offset relative to the value section, determines alignment. Padding is
not a payload, does not increment `item_count`, is included in CRC coverage, and must be all zero.

A zero-byte payload still performs its alignment step, records the resulting cursor, and then does
not advance it. Equal offsets are allowed only when at least one reference owns no bytes in the
comparison; a later nonempty payload may start at the same cursor as a preceding zero-byte value.
No extra trailing alignment is stored inside `value_area`; only the outer next-section placement
may add its independently required top-level zero padding.

## Complete canonical construction order

A writer follows these dependency-ordered steps:

1. Parse without losing duplicate fields or array holes; validate the root is an object.
2. Validate logical types, exact names, unique sibling names, root `_id`, dense arrays, acyclicity,
   and all `limits-v1` bounds before publishing or allocating from untrusted counts.
3. Collect every distinct exact name, sort strict `binary_utf8_v1`, and assign dense `field_id`s.
4. Assign containers with the root-first breadth-first algorithm and compute parent/depth data.
5. Emit object field spans by container ID and strict field ID, carrying exact presentation
   ordinals.
6. Emit `NameRecord`s and immediately concatenated exact name bytes.
7. Scan containers/children in the same canonical order and pack every noncontainer payload with
   only required zero padding.
8. Emit descriptors by ID, followed by array spans by array-container ID and element index.
9. Compute every section count/length/absolute offset using the outer canonical placement equation,
   then resolve all cross-references.
10. Revalidate the staged result independently: exact coverage, counts, names, tags, tree,
    offsets, payloads, limits, and root `_id`.
11. The integrity profile computes CRC/content hash and `P03-007` may produce a smaller registered
    compressed stored form; no caller sees a value/view until the complete validating-reader
    pipeline passes.

Host hash-map order, pointer identity, allocation address, locale, normalization, thread completion
order, and compressor behavior never participate in these steps.

## Root object and `_id`

The byte grammar has a unique structural representation for an empty object: one root descriptor,
zero other sections, and a 288-byte outer envelope before a valid hash profile. It exists as a
useful internal structural boundary and proves zero-span rules.

A normal HDoc row document nevertheless must contain exactly one root `_id` with an accepted ID
type. Therefore the empty-root structural vector is rejected as a normal document with the stable
semantic/input family, not accepted as persisted data. Nested empty objects remain valid. A
decoder does not repair a missing `_id`, synthesize one during read, or treat a nested `_id` as the
root identifier.

## Structural worked vectors

These vectors fix section-local bytes and absolute offsets but omit a complete profile-1
header/footer/CRC. The integrity registry wraps the scalar-root case in complete 408-byte integrity
references. Hex here remains normative and executable without becoming a P03-016 fixture file.

### Empty root structure

With four directory entries, `header_bytes = 192`. All first three sections are empty at offset
192. The single root descriptor also begins at 192, ends at 224, and the 64-byte footer would end
at 288.

```text
field_table       offset=192 length=0  count=0
name_pool         offset=192 length=0  count=0
value_area        offset=192 length=0  count=0
container_tables  offset=192 length=32 count=1
footer_offset=224 total_length=288
```

The root descriptor's `item_offset` is the canonical empty field-table cursor 192. This structure
is rejected for missing root `_id`.

### Presentation-preserving scalar root

Logical presentation:

```text
{s: string(""), _id: uuid(00000000-0000-0000-0000-000000000000), n: null}
```

Canonical field order is `_id`, `n`, `s`, with field IDs `0`, `1`, `2` and presentation ordinals
`1`, `2`, `0`. The distinct-name record table occupies 24 bytes and exact names `_idns` occupy
five. UUID bytes occupy `[296,312)`; null and empty string both record cursor 312 and add no bytes.

```text
field_table       offset=192 length=72 count=3
name_pool         offset=264 length=29 count=3
outer padding     [293,296) = 00 00 00
value_area        offset=296 length=16 count=3
container_tables  offset=312 length=32 count=1
footer_offset=344 total_length=408
```

### Internal payload alignment

Logical presentation:

```text
{b: int64(1), _id: uuid(00000000-0000-0000-0000-000000000000), a: true}
```

Canonical field order is `_id`, `a`, `b`, with presentation ordinals `1`, `2`, `0`. UUID consumes
`[296,312)`, Boolean true consumes byte 312, and int64 requires alignment eight. Therefore exactly
seven zero bytes occupy `[313,320)` and the int64 payload occupies `[320,328)`.

```text
field_table       offset=192 length=72 count=3
name_pool         offset=264 length=29 count=3
outer padding     [293,296) = 00 00 00
value_area        offset=296 length=32 count=3
  uuid            [296,312)
  bool            [312,313)
  internal pad    [313,320) = seven zero bytes
  int64           [320,328)
container_tables  offset=328 length=32 count=1
footer_offset=360 total_length=424
```

Any shorter, longer, or nonzero internal pad, or an int64 offset other than 320, is noncanonical.

### Nested object and array

Logical presentation:

```text
{z: [null, {a: true}], _id: objectId(000102030405060708090a0b), a: {}}
```

Canonical root order is `_id`, `a`, `z`. Breadth-first IDs are root object `0`, empty object `1`,
array `2`, and the array's nested object `3`. The four fields are the root's three plus the nested
`a`. Array entries are null then container `3`. Value occurrences are ObjectId, null, and Boolean;
the null owns no bytes, so the Boolean begins at the same cursor 332.

```text
field_table       offset=192 length=96  count=4
name_pool         offset=288 length=29  count=3
outer padding     [317,320) = 00 00 00
value_area        offset=320 length=13  count=3
outer padding     [333,336) = 00 00 00
container_tables  offset=336 length=152 count=4
  descriptors     [336,464) = 4 * 32
  array entries   [464,488) = 2 * 12
footer_offset=488 total_length=552
```

The empty object's zero field span and the later nested object's nonempty span both have cursor
264. Only the empty span owns no records; this is canonical and not a byte alias.

## Validation order and fail-closed behavior

After the outer bounded checks and CRC stage defined by the envelope, the base table validator:

1. proves all four section equations and `item_count` cross-equalities with checked arithmetic;
2. splits the container descriptor prefix from its array-entry suffix using `C * 32`;
3. validates name records, exact suffix coverage, UTF-8/name rules, strict order, and use counts;
4. validates descriptor IDs/root/reserved fields and table-span coverage without following
   attacker-chosen recursion;
5. validates field and array records, assigned tags, reserved bytes, name tuples, presentation
   permutations, and immediate limits;
6. reconstructs canonical breadth-first reachability, unique ownership, parent slots, and depth;
7. recomputes recursive field counts bottom-up and checks all envelope copies;
8. replays canonical value occurrence order, alignment, padding, exact payload validators, and
   value-area count/coverage;
9. validates root `_id` and remaining semantic limits; and
10. continues to bounded decompression under `P03-007` and profile-1 typed-content hash validation
    under the integrity registry before exposing any owned or borrowed value.

An implementation may fuse passes while preserving these dependencies and error priorities. It
must use iterative/bounded worklists rather than trusting descriptor depth as permission for host
recursion.

## Required rejection classes

The complete decoder and malformed corpus must reject at least:

- field/name/container/array stride or section-length mismatch;
- count multiplication/addition overflow or result beyond 16 MiB;
- name offset into records/outside suffix, gap, overlap, alias, unused record, invalid UTF-8,
  wrong scalar count, invalid field grammar, duplicate, or non-strict order;
- field ID outside the name table, name tuple mismatch, duplicate/out-of-order object ID, invalid
  presentation ordinal, or non-permutation;
- unknown/reserved/zero tag, nonzero flag/reserved byte, tag/payload length mismatch, or Missing
  materialized as a record;
- object/array reference outside the descriptor prefix, wrong descriptor boundary, wrong length,
  or tag mismatch;
- noncontainer reference outside `value_area`, wrong alignment, overlap, alias, reordered payload,
  extra gap, nonzero padding, or unused/trailing bytes;
- zero-length payload at any offset other than its replayed canonical cursor;
- descriptor ID/order mismatch, nonobject root, wrong root sentinel, sentinel on a child, invalid
  depth, parent mismatch, unreachable descriptor, two parents, self-edge, cycle, or noncanonical
  breadth-first numbering;
- object/array span outside its table, wrong same-kind cursor, gap, overlap, alias, sparse array,
  or unused array entry;
- wrong recursive field count, root/envelope field-count disagreement, per-object/array/depth/name/
  total-field/document-size limit violation, or absent/invalid root `_id`; and
- checksum/hash/profile/compression failures owned by the surrounding format stages.

For existing authoritative bytes these structural failures are `DUR_CORRUPTION`; unsupported
registered features use the capability family; invalid new user input fails atomically under its
input/limit code before durable publication. Diagnostics may report bounded section/offset/check
class but never raw names or values.

## Lookup and access consequences

After complete validation:

- field name to base ID uses the sorted name table;
- object ID lookup uses a strict sorted contiguous span;
- full reads reorder a span by `presentation_ordinal` without changing mapping identity;
- array indexing is direct `item_offset + index * 12` with checked arithmetic;
- container values jump directly to one validated 32-byte descriptor;
- fixed scalar values jump directly to aligned exact payload bytes; and
- repeated path lookup can remain borrowed and allocation-free.

These are representation capabilities, not permission to expose a partially validated view.
`P03-010`/`P03-011` own the safe owned/borrowed APIs and measured lookup implementation.

## Version, migration, and rollback

These record widths, field offsets, ID meaning, canonical orders, tree numbering, zero-span rules,
and section count meanings are stable for the HDoc 1.0 base profile. A minor version cannot change
them while claiming the same profile.

Before `P03-016`, no valid immutable complete HDoc exists, so a reviewed superseding decision can
replace this registry without stored-data migration. After immutable fixtures or data exist, any
incompatible change requires:

- a new explicit format/profile plus historical reader;
- immutable old/new positive and malformed fixtures;
- atomic write-new, complete validate, publish, resume, and rollback proof;
- logical-value and typed-hash transformation/equivalence rules;
- reader/writer/downgrade negotiation; and
- updates to every WAL/SST/VLOG, replication, backup, restore, SDK, and protocol container that
  carries HDoc.

Reading never silently renumbers, canonicalizes, repairs, or rewrites an old HDoc.

## Subordinate ownership

| Task | Owns next | Cannot change from P03-005 |
| --- | --- | --- |
| [`P03-006`](hdoc-v1-integrity.md) | CRC replay; BLAKE3 typed-content domain/framing and vectors | Table bytes, presentation/container/value ordering |
| `P03-007` | Registered deterministic compression block grammar | Expanded canonical section bytes and item meanings |
| `P03-008`–`P03-011` | Safe writer/reader, owned/borrowed values, raw lookup | Accepted structure or fail-closed validation |
| `P03-013` | Feature-gated collection path dictionary/profile | Base document-local field IDs and self-containment |
| `P03-015` | Feature/version reader-writer migration matrix | Existing IDs/flags/record meanings |
| `P03-016`–`P03-019` | Complete golden/malformed, independent readers, property/fuzz suites | Structural vectors and rejection expectations |
| `P03-020`–`P03-021` | Lookup/size/alignment/compression experiments | Correctness rules or portable limits |

## Required later fixtures

Complete fixture/property/fuzz work must include:

- empty nested object/array and rejected empty root;
- one field, maximum per-object/recursive fields, repeated names across objects, and exact name
  byte/scalar boundaries;
- same mapping with different presentation orders and unchanged typed content hash;
- ASCII/multibyte/decomposed name sorting, duplicate names, field-ID/name-tuple disagreement, and
  every presentation-permutation failure;
- arrays empty/one/maximum, duplicates, heterogeneous values, nested arrays/objects, null, and
  explicit hole/Missing rejection;
- breadth/depth boundaries, many empty spans, repeated-by-value subtrees, cycle/alias mutations,
  parent/slot/depth/count corruption, and noncanonical alternative ID assignments;
- all 16 tags in object and array records, every payload alignment, successive zero-length values,
  zero before nonzero, identical nonzero payload non-deduplication, and alias/overlap/gap mutations;
- section length/count/stride arithmetic boundaries, 16 MiB exact/over, and offsets near `u32` wrap;
- independent Rust and TypeScript parsing with identical logical values, presentation, diagnostics,
  CRC, typed hash, native/Wasm/browser results; and
- mutation/fuzz canaries reaching each rejection before any value or borrowed view escapes.

## References

- [Specifications section 7.3](../../Specifications.md#73-canonical-binary-document-format)
- [Study section 6](../../Study.md#6-hdoc-and-the-data-model)
- [Implementation plan Phase 3](../../ImplementationPlan.md#phase-3--hdoc-format-codec-and-path-dictionary)
- [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)
- [HDoc 1.0 envelope](hdoc-v1.md)
- [HDoc 1.x type tags](hdoc-v1-type-tags.md)
- [HDoc 1.0 noncontainer payloads](hdoc-v1-payloads.md)
- [HDoc 1.0 CRC-32C and canonical typed-content hashing](hdoc-v1-integrity.md)
- [Logical value model](../architecture/value-model.md)
- [Object semantics](../architecture/object-semantics.md)
- [Array semantics](../architecture/array-semantics.md)
- [Missing/null semantics](../architecture/missing-null-semantics.md)
- [Portable v1 limits](../architecture/limits-v1.md)
- [Persistent format versioning policy](../governance/versioning.md)
- [Versioned error semantics](../architecture/error-semantics.md)

# HDoc 1.0 Envelope, Section Directory, and Footer Format

- Status: Accepted complete HDoc 1.0 byte format
- Last updated: 2026-07-11
- Owner: Storage architecture owner
- Format identity: HDoc major `1`, minor `0`
- Plan item: `P03-002`
- Governing gate: `G03`
- Governing decision: [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)
- Machine-readable companion: [hdoc-v1-envelope.json](hdoc-v1-envelope.json)
- Compression profile: [hdoc-v1-compression.md](hdoc-v1-compression.md)
- Supersedes: None
- Superseded by: None

## Scope and maturity boundary

This document fixes the outer HDoc 1.0 envelope: magic bytes, fixed header, structural flags,
version and feature fields, stored/canonical lengths, recursive field count, CRC32C slot, section
directory, canonical top-level body order, footer placement, repeated footer fields, and content-hash
slot. Every integer in this document is unsigned little-endian unless explicitly described as raw
octets.

The stable logical tags/extension ranges and exact noncontainer bytes are fixed by the
[HDoc 1.x type-tag registry](hdoc-v1-type-tags.md),
[HDoc 1.0 payload registry](hdoc-v1-payloads.md), and
[HDoc 1.0 record registry](hdoc-v1-records.md). CRC coverage and typed-content hash algorithm/
profile `1/1` are fixed by the [HDoc 1.0 integrity registry](hdoc-v1-integrity.md). Optional codec/
profile `1/1`, its independently bounded block stream, canonical selection, and stored/logical
coordinate model are fixed by the [compression registry](hdoc-v1-compression.md). Together these
documents complete the HDoc 1.0 byte grammar.

Completion of the grammar alone was not an implementation or release-support claim. `P03-008`
implements the production writer, `P03-009` implements the bounded whole-envelope validating
reader, and `P03-010` implements lifetime-bound borrowed views plus detached owned logical values.
`P03-011` still owns optimized exact-name/nested-path lookup, and `P03-016` owns immutable supported
golden files.
Footer `hash_profile_id = 1` is the only assigned base integrity profile; zero remains permanently
invalid. The exact envelopes in the integrity and compression registries are normative executable
references until the immutable corpus is published.

## Implemented P03-009 validating reader

`helix_doc::decode(&[u8])` is the portable whole-envelope validation boundary. It performs these
stages before returning success:

1. recognize magic/version/features and prove total/canonical/footer bounds;
2. verify CRC-32C over the exact stored bytes with the checksum slot zeroed;
3. prove directory order, nonoverlap, alignment, zero padding, stored placement, and footer copies;
4. derive canonical-logical coordinates, then decode each compressed section into a fresh,
   zero-initialized, exact-size allocation after validating its header and complete block table;
5. validate name, field, container, array, value, and payload grammars; reconstruct breadth-first
   ownership/depth and bottom-up recursive field counts; and enforce `_id`/portable limits;
6. recompress every eligible section and rebuild the entire envelope with the stored footer hash,
   requiring byte-for-byte equality with the supplied stored form; and
7. recompute the profile-1 typed-content hash over the independently validated logical tree and
   compare it with the footer.

Success returns `DecodedHDoc`, which retains the original validated bytes, content hash, canonical
length, recursive field count, compressed-section count, validation-built record metadata, and the
logical section backing needed by `P03-010`. The wrapper is constructed only after all seven stages;
no partially validated table or value escapes.

Failures are redacted `DecodeError` values. Unsupported major/minor versions and required
capabilities use stable `CAP_*` codes; malformed or noncanonical bytes use `DUR_CORRUPTION` plus a
bounded `DecodeCheck` stage and byte offset. Errors never contain names, values, input fragments,
or decompressed payloads. Unknown optional semantics are rejected until `P03-015` publishes an
explicit preservation/negotiation matrix.

## Implemented P03-010 value and view layer

`DecodedHDoc::view()` returns a `DocumentView` whose lifetime is bounded by the validated wrapper.
The wrapper retains each base section as follows:

- an uncompressed section is a borrowed slice of the exact input bytes;
- a compressed section is the decoder's existing fresh, exact-size, bounded logical allocation; and
- opening, copying, or traversing a view does not decompress again or allocate payload storage.

The read-only API exposes `DocumentView`, `ObjectView`, `ArrayView`, `FieldView`, and `ValueView`.
Every object descriptor receives a validation-built O(1) presentation-position permutation over
its already canonical-name-sorted field span. Full reads therefore reproduce presentation order
without changing mapping/hash identity. Array access is direct and dense; no hole or Missing value
can appear. Exact string and binary data borrow their logical section, fixed-width scalars are copied
as typed integers/byte arrays, decimal BID bytes become the already validated canonical logical
tuple, and vector views iterate exact finite f32/f16 bit patterns without casting through host
floating point.

`DecodedHDoc::to_owned_document()` recursively detaches a complete `OwnedDocument` / `OwnedValue`
tree. It copies names and variable payloads, preserves object presentation and dense array order,
retains binary subtype zero, exact float/vector bits, decimal tuple, temporal counts, and identifier
octets, and remains valid after all HDoc backing is dropped. The owned inventory has the same 16
stored logical types as `ValueView`; Missing deliberately has no variant and present null has an
explicit variant in both paths.

These APIs do not yet promise exact-name or nested-path lookup. `ObjectView::field_at()` is a
presentation-position accessor, while `ArrayView::get()` is a direct semantic index accessor.
`P03-011` owns allocation-free name/path resolution and its measurements. `P03-012` owns canonical
rendering/import. Public view formatting is not used as a data export contract, and `DecodedHDoc`'s
debug representation reports only bounded metadata rather than names or payloads.

## Normative notation

| Notation | Meaning |
| --- | --- |
| `u16`, `u32`, `u64` | Unsigned integer with the named bit width, encoded little-endian |
| `[n]byte` | Exactly `n` uninterpreted octets |
| stored `offset` | Absolute byte index into the exact stored envelope from document byte zero |
| logical `offset` | Absolute byte index into the derived canonical uncompressed envelope |
| `[a,b)` | Half-open byte range beginning at `a` and ending before `b` |
| `align8(x)` | The smallest integer greater than or equal to `x` and divisible by 8 |
| `MUST`, `MUST NOT` | Required or forbidden for HDoc 1.0 conformance |

Ranges and additions are checked in a host type wider than `u32`. A reader never evaluates
`offset + length` in wrapping 32-bit arithmetic. The containing storage format supplies an exact
HDoc byte slice; a filename, page size, host struct, or surrounding file is never part of an
offset calculation.

## Envelope overview

```text
byte 0
┌─────────────────────────────────────────────────────────────┐
│ fixed header: 64 bytes                                     │
├─────────────────────────────────────────────────────────────┤
│ section directory: section_count × 32 bytes                │
├─────────────────────────────────────────────────────────────┤
│ field_table section, aligned to 8                          │
├─────────────────────────────────────────────────────────────┤
│ name_pool section, aligned to 8                            │
├─────────────────────────────────────────────────────────────┤
│ value_area section, aligned to 8                           │
├─────────────────────────────────────────────────────────────┤
│ container_tables section, aligned to 8                     │
├─────────────────────────────────────────────────────────────┤
│ optional/future registered sections, including extension   │
│ area, each aligned to 8                                    │
├─────────────────────────────────────────────────────────────┤
│ footer: 64 bytes, aligned to 8                             │
└─────────────────────────────────────────────────────────────┘
byte total_length
```

The base uncompressed profile has four directory entries, so its `header_bytes` is:

```text
64 + 4 × 32 = 192
```

The structural lower bound before any body bytes is 256 bytes: 192 header/directory bytes plus the
64-byte footer. The record grammar requires at least one 32-byte root descriptor, so the unique
empty-root structure is 288 bytes. It is still not an accepted document: normal rows require root
`_id`, and integrity profile zero remains invalid.

## Header magic

The first eight bytes are exact octets:

```text
hex:     48 44 4f 43 0d 0a 1a 0a
escaped: H  D  O  C  \r \n \x1a \n
```

The magic is case-sensitive. It is not NUL-terminated text. A reader compares all eight bytes
before interpreting version, length, flags, or offsets. A mismatch is `CAP_FORMAT_UNSUPPORTED`
when the input is not HDoc and `DUR_CORRUPTION` when an enclosing authoritative artifact declared
that the slice was HDoc.

## Fixed 64-byte header

| Offset | Bytes | Field | Encoding/value | Meaning |
| ---: | ---: | --- | --- | --- |
| 0 | 8 | `magic` | `[8]byte`, `48444f430d0a1a0a` | HDoc artifact identity |
| 8 | 2 | `major_version` | `u16 = 1` | Incompatible format generation |
| 10 | 2 | `minor_version` | `u16 = 0` | Compatible generation only under published rules |
| 12 | 2 | `header_bytes` | `u16` | Fixed header plus complete section directory |
| 14 | 2 | `directory_entry_bytes` | `u16 = 32` | Directory stride |
| 16 | 4 | `document_flags` | `u32` | Structural-presence flags defined below |
| 20 | 4 | `total_length` | `u32` | Exact stored envelope byte length |
| 24 | 4 | `canonical_length` | `u32` | Exact complete uncompressed canonical-envelope length |
| 28 | 4 | `field_count` | `u32` | Total recursive object-field entry count |
| 32 | 4 | `crc32c` | `u32` | Stored-byte CRC32C; treated as zero during calculation |
| 36 | 2 | `section_count` | `u16` | Number of 32-byte entries; 4 through 32 |
| 38 | 2 | `reserved_0` | `u16 = 0` | Reserved; nonzero is noncanonical |
| 40 | 4 | `directory_offset` | `u32 = 64` | Absolute directory start |
| 44 | 4 | `footer_offset` | `u32` | Absolute aligned footer start |
| 48 | 8 | `required_features` | `u64` | Required feature bitmap |
| 56 | 8 | `optional_features` | `u64` | Optional nonsemantic feature bitmap |

The fields exactly partition `[0,64)` with no implicit compiler padding. `header_bytes` is
canonical in 1.0:

```text
header_bytes = 64 + section_count × 32
directory_offset = 64
```

Because `section_count <= 32`, `header_bytes <= 1,088`. The equation always yields an 8-byte
multiple. Version 1.0 has no bytes between the final directory entry and the first canonical body
position. A future compatible version cannot place hidden data there under version 1.0.

### `total_length`

`total_length` is the exact number of stored bytes in the HDoc slice, including header, directory,
stored/compressed section bytes, all zero padding, and the footer. The final byte is at
`total_length - 1`. For a standalone exact blob, supplied byte length MUST equal `total_length`;
trailing or truncated bytes are rejected. An enclosing file may contain more data only by passing
an explicitly bounded HDoc sub-slice.

The footer equation is exact:

```text
footer_offset + 64 = total_length
```

Both `footer_offset` and `total_length` are divisible by 8.

### `canonical_length`

`canonical_length` is the byte length of the complete canonical uncompressed HDoc corresponding
to the stored document. For the base profile:

```text
canonical_length = total_length
```

For every profile, the canonical uncompressed length is derived by replacing each stored section
with its exact `logical_length`, placing sections in canonical directory order with `align8`, and
accounting for the unchanged header/directory and 64-byte footer. Compression flags and codec IDs
do not add logical bytes. The derived logical footer plus 64 MUST equal `canonical_length`. Thus a
reader rejects a claimed expanded document beyond the limit before allocating or decompressing.

The [compression registry](hdoc-v1-compression.md#two-coordinate-spaces) makes this derivation a
coordinate system: all internal absolute offsets belong to this canonical logical envelope, while
directory section offsets and the header/footer `footer_offset` address stored bytes.

ADR 0012 requires compression to make the complete stored envelope smaller, so every accepted
HDoc satisfies:

```text
256 <= total_length <= canonical_length <= 16,777,216
```

Compression cannot make an oversized canonical document valid.

### `field_count`

`field_count` counts every object field entry recursively, not only root fields:

```text
{a: 1, b: {c: 2}, d: [{e: 3}]}  => field_count = 5
```

Array elements do not increment this count merely for occupying an array position; object fields
inside an array do. The field-table directory entry's `item_count` MUST equal this header value.
The [record registry](hdoc-v1-records.md) defines the root and per-container ranges that reproduce
the same total. The count is at
most the `document.total_fields` limit of 100,000, while each individual object remains at most
10,000 fields.

The unique empty-root structure has `field_count = 0`, but a normal database row is not publishable
until the higher-level `DATA-001` rule verifies its required `_id`.

### `crc32c`

The four bytes at `[32,36)` hold the little-endian CRC-32C selected by ADR 0012. Computation covers
the entire stored `[0,total_length)` byte range while treating `[32,36)` as four zero bytes. It
therefore covers header, directory, stored/compressed body bytes, padding, footer metadata, and
content hash. The [integrity registry](hdoc-v1-integrity.md) supplies exact whole-document vectors
and differentiated diagnostics without moving this field or changing its coverage rule.

## Document flags

`document_flags` describes structural content that can be checked quickly. It does not replace
feature negotiation. Bits 5 through 31 are reserved and MUST be zero in HDoc 1.0.

| Bit | Mask | Name | Meaning/owner |
| ---: | --- | --- | --- |
| 0 | `0x00000001` | `HAS_COMPRESSED_SECTIONS` | At least one section entry uses registered compression |
| 1 | `0x00000002` | `HAS_EXTENSION_AREA` | Exactly one `extension_area` section exists; `P03-015` |
| 2 | `0x00000004` | `USES_PATH_DICTIONARY_REFERENCES` | Body depends on a pinned path dictionary; `P03-013` |
| 3 | `0x00000008` | `HAS_SEMANTIC_EXTENSIONS` | Extension content contributes to meaning/hash; `P03-015` |
| 4 | `0x00000010` | `HAS_NONSEMANTIC_EXTENSIONS` | Skippable/preservable nonsemantic extension content exists; `P03-015` |

The base uncompressed self-contained profile has `document_flags = 0`.

## Feature bitmaps

Feature bits declare reader capability requirements. A structural flag and its feature bit MUST
agree; either one without the other is corruption/noncanonical input.

### Required features

| Bit | Mask | Name | Required behavior |
| ---: | --- | --- | --- |
| 0 | `0x0000000000000001` | `SECTION_COMPRESSION` | Reader understands every present registered codec/profile; v1 assigns `1/1` |
| 1 | `0x0000000000000002` | `PATH_DICTIONARY_REFERENCES` | Reader can resolve the exact pinned dictionary version (`P03-013`–`P03-015`) |
| 2 | `0x0000000000000004` | `SEMANTIC_EXTENSIONS` | Reader understands every semantic extension and typed-hash contribution (`P03-015`) |

Bits 3 through 63 are unassigned. Any set unassigned required bit yields
`CAP_FORMAT_UNSUPPORTED` before body/value exposure.

### Optional features

| Bit | Mask | Name | Optional behavior |
| ---: | --- | --- | --- |
| 0 | `0x0000000000000001` | `NONSEMANTIC_EXTENSIONS` | Reader may skip length-delimited nonsemantic data only under the preservation rules (`P03-015`) |

Bits 1 through 63 are unassigned. An unknown optional bit is not automatically safe: a reader may
skip it only if a known length-delimited section/extension grammar proves that the bytes cannot
affect semantics, bounds, addressing, checksum, or required validation. Otherwise it rejects the
format. A mutating/re-encoding reader must preserve unknown optional bytes exactly or reject.

### Flag/feature invariants

- `HAS_COMPRESSED_SECTIONS` is set iff at least one directory entry has `COMPRESSED`; required
  feature `SECTION_COMPRESSION` is then set.
- `HAS_EXTENSION_AREA` is set iff exactly one `extension_area` directory entry exists.
- `USES_PATH_DICTIONARY_REFERENCES` and required feature `PATH_DICTIONARY_REFERENCES` are either
  both set or both clear.
- `HAS_SEMANTIC_EXTENSIONS` implies `HAS_EXTENSION_AREA`, required feature
  `SEMANTIC_EXTENSIONS`, and a `CRITICAL | SEMANTIC` extension-area entry.
- `HAS_NONSEMANTIC_EXTENSIONS` implies `HAS_EXTENSION_AREA` and optional feature
  `NONSEMANTIC_EXTENSIONS`.
- A base HDoc 1.0 envelope has both feature bitmaps equal to zero.

## Section directory

The directory begins at absolute byte 64 and contains `section_count` adjacent 32-byte entries.
Entries are unique and sorted by the canonical section-kind order. HDoc 1.0 permits 4 through 32
entries. Duplicate kinds are rejected; compression blocks and extension records live inside their
single owning top-level section rather than duplicating directory kinds.

### Directory entry layout

| Entry offset | Bytes | Field | Encoding | Meaning |
| ---: | ---: | --- | --- | --- |
| 0 | 2 | `section_kind` | `u16` | Stable top-level section identifier |
| 2 | 2 | `section_flags` | `u16` | Compression/critical/semantic/preservation flags |
| 4 | 4 | `section_offset` | `u32` | Absolute aligned stored-section start |
| 8 | 4 | `stored_length` | `u32` | Exact stored byte length at `section_offset` |
| 12 | 4 | `logical_length` | `u32` | Exact byte length after decompression |
| 16 | 4 | `item_count` | `u32` | Section-specific record count |
| 20 | 2 | `codec_id` | `u16` | Compression algorithm; zero means none |
| 22 | 2 | `codec_profile_id` | `u16` | Deterministic settings/block profile; zero means none |
| 24 | 2 | `section_version` | `u16` | Internal section grammar version; base value 1 |
| 26 | 2 | `reserved_0` | `u16 = 0` | Reserved; nonzero rejected |
| 28 | 4 | `reserved_1` | `u32 = 0` | Reserved; nonzero rejected |

All fields exactly partition the 32-byte entry. `section_offset` is not relative to the directory
or previous section.

### Section flags

| Bit | Mask | Name | Rule |
| ---: | --- | --- | --- |
| 0 | `0x0001` | `COMPRESSED` | Stored bytes use an explicit registered nonzero codec/profile |
| 1 | `0x0002` | `CRITICAL` | Reader must understand this section before exposing values |
| 2 | `0x0004` | `SEMANTIC` | Section contributes to decoded typed content/hash |
| 3 | `0x0008` | `OPAQUE_PRESERVE` | Unknown optional bytes must survive re-encoding exactly or cause rejection |

Bits 4 through 15 are reserved and zero. `SEMANTIC` always implies `CRITICAL`; a semantic section
cannot be optional to a reader that verifies the document. The four base sections use
`CRITICAL | SEMANTIC`, encoded as `0x0006` before any compression bit.

### Compression fields

For an uncompressed section:

```text
COMPRESSED is clear
codec_id = 0
codec_profile_id = 0
stored_length = logical_length
```

For a compressed base section, `COMPRESSED` is set, flags are `0x0007`, codec/profile is exactly
`1/1`, `stored_length` covers the complete bounded compression stream, and `logical_length`
describes the exact decoded section bytes. The [compression registry](hdoc-v1-compression.md)
defines the stream and requires the complete compressed document to be smaller than its canonical
uncompressed form. Unknown codec/profile pairs are rejected before allocating or decompressing.

### `item_count`

`item_count` is not a generic byte count. Its exact meaning belongs to the section grammar:

- `field_table`: total field entries; MUST equal header/footer `field_count`;
- `name_pool`: distinct document-local exact-name record count;
- `value_area`: noncontainer reference-occurrence count, including zero-length payloads;
- `container_tables`: container-descriptor count, including the root descriptor;
- `extension_area`: extension-record count, defined by P03-015.

The exact equations and record meanings for the four required sections are fixed by the
[record registry](hdoc-v1-records.md). A future extension cannot reinterpret these counts.

## Top-level section registry

| Kind | ID | Required | Base flags | Canonical order | Internal owner |
| --- | ---: | --- | --- | ---: | --- |
| `field_table` | `0x0001` | Yes | `0x0006` | 0 | `P03-005` |
| `name_pool` | `0x0002` | Yes | `0x0006` | 1 | `P03-005` |
| `value_area` | `0x0003` | Yes | `0x0006` | 2 | `P03-004`/`P03-005` |
| `container_tables` | `0x0004` | Yes | `0x0006` | 3 | `P03-005` |
| `extension_area` | `0x7fff` | No | content-dependent | 4 | `P03-015` |

The four required kinds occur exactly once even when an internal section is empty. Their directory
entries cannot be omitted as a space optimization. `extension_area` occurs at most once and only
when `HAS_EXTENSION_AREA` is set.

IDs `0x0005` through `0x7ffe` and `0x8000` through `0xfffe` are reserved for a future registered
format change; `0xffff` is permanently invalid. A writer MUST NOT use an unassigned kind. A reader
encountering a future unknown kind follows its `CRITICAL`/`SEMANTIC`/`OPAQUE_PRESERVE` flags and
the published version/feature rules; absence of an assigned rule is not permission to guess.

## Canonical body placement

Directory entries appear in the registry's canonical order. Stored body positions are calculated
from the ordered entries:

```text
cursor = header_bytes
for each directory entry i in canonical order:
    section_offset[i] = align8(cursor)
    bytes[cursor : section_offset[i]] = zero padding
    cursor = section_offset[i] + stored_length[i]   // checked arithmetic
footer_offset = align8(cursor)
bytes[cursor : footer_offset] = zero padding
total_length = footer_offset + 64
```

Every section start is divisible by 8. Padding is the minimum required by the equation and every
padding octet is zero. No leading body gap, extra alignment block, reordered section, trailing body
slack, or unused byte is canonical. Zero-length sections use the current aligned cursor; equal
offsets for adjacent zero-length sections do not create a byte overlap.

For each nonempty section, readers prove with wider checked arithmetic:

```text
header_bytes <= section_offset
section_offset % 8 = 0
section_offset + stored_length <= footer_offset
```

Nonempty section ranges cannot overlap or alias. A section cannot point into the fixed header,
directory, footer, another section, or padding. Internal offsets defined by P03-004/P03-005 are
absolute **canonical logical** document offsets. They equal stored offsets in the base profile.
With compression, a reader derives logical section starts from `logical_length`, validates each
internal range there, and then translates it to a decoded-section-local index. It never stores or
follows an internal address into compressed bytes.

## Worked structural placement example

This example demonstrates outer placement only. Its invented section lengths are not valid
field/value encodings and the hash profile remains unassigned.

```text
section_count = 4
header_bytes = 64 + 4 × 32 = 192

field_table:     offset 192, stored_length 32, end 224
name_pool:       offset 224, stored_length  5, end 229
padding:         bytes [229,232) = 00 00 00
value_area:      offset 232, stored_length  9, end 241
padding:         bytes [241,248) = seven zero bytes
container_tables offset 248, stored_length 16, end 264
footer_offset = align8(264) = 264
total_length = 264 + 64 = 328
canonical_length = 328       // uncompressed
```

Moving `value_area` to 240, adding eight bytes after a section, or placing the footer at 272 would
be noncanonical even though all referenced regions might still fit.

## Fixed 64-byte footer

The footer begins at `footer_offset` and exactly fills `[footer_offset,total_length)`.

| Footer offset | Bytes | Field | Encoding/value | Meaning |
| ---: | ---: | --- | --- | --- |
| 0 | 8 | `magic` | `[8]byte`, `48444f43454e440a` | Exact `HDOCEND\n` terminator identity |
| 8 | 2 | `footer_bytes` | `u16 = 64` | Footer size |
| 10 | 2 | `footer_version` | `u16 = 1` | Footer grammar version |
| 12 | 2 | `hash_algorithm_id` | `u16 = 1` | BLAKE3-256 |
| 14 | 2 | `hash_profile_id` | `u16 = 1` | `hdoc-typed-content-tree-v1` |
| 16 | 4 | `hash_length` | `u32 = 32` | Content-hash byte length |
| 20 | 4 | `total_length_copy` | `u32` | Must equal header `total_length` |
| 24 | 4 | `canonical_length_copy` | `u32` | Must equal header `canonical_length` |
| 28 | 4 | `field_count_copy` | `u32` | Must equal header `field_count` |
| 32 | 32 | `content_hash` | `[32]byte` | BLAKE3-256 typed-content hash |

Footer magic bytes are:

```text
hex:     48 44 4f 43 45 4e 44 0a
escaped: H  D  O  C  E  N  D  \n
```

The three repeated header values do not replace CRC/hash validation. They let a bounded reader
reject an obviously misdirected/truncated footer before recursive parsing. Any mismatch is
`DUR_CORRUPTION` for authoritative stored data.

Algorithm ID `1` is permanently assigned to 32-byte default-unkeyed BLAKE3 output by ADR 0012.
Profile ID `1` selects the exact domain, node frame, noncontainer body, canonical object body, and
dense array body in the [integrity registry](hdoc-v1-integrity.md). Profile ID `0` remains
unassigned/invalid—not a zero hash, no-hash mode, or implied default. Any other profile is rejected
until an accepted registry/version explicitly assigns it.

## Base profile

The HDoc 1.0 base envelope is uncompressed, self-contained, and extension-free:

```text
major_version = 1
minor_version = 0
document_flags = 0
required_features = 0
optional_features = 0
hash_algorithm_id = 1
hash_profile_id = 1
section_count = 4
header_bytes = 192
directory kinds = [0x0001, 0x0002, 0x0003, 0x0004]
all directory codec_id/profile_id = 0/0
all required section flags = 0x0006
total_length = canonical_length
```

Compression, extension area, semantic extension, nonsemantic extension, and path-dictionary
references are opt-in feature profiles. The base profile remains mandatory for every conforming
reader and writer; optional profile support never replaces it.

## Validation order and atomic exposure

An implementation may combine passes, but it must preserve these dependencies and expose no
document/view until every required stage succeeds:

1. Require at least 64 supplied bytes and compare all eight header magic bytes.
2. Read major/minor, fixed-width length fields, section count, directory stride/offset, and footer
   offset with safe byte operations.
3. Reject unsupported version/required features and any reserved header flag/bit/field.
4. Prove `section_count` range, `header_bytes` equation, length inequalities, exact supplied slice
   length, footer equation, and 16 MiB limit without overflow.
5. Compute CRC32C over the exact stored range with `[32,36)` treated as zero; reject mismatch.
6. Parse all directory entries; validate reserved fields, unique canonical kinds/order,
   flag/feature cross-invariants, codec pairs, item counts where defined, absolute alignment,
   canonical placement, zero padding, and no nonempty overlap.
7. Validate footer position/magic/size/version/algorithm/hash length, header copies, and a nonzero
   supported hash profile.
8. Derive canonical logical section positions and require exact `canonical_length` agreement.
9. Validate each compression header/table without output allocation, decode one bounded block at a
   time, and prove exact logical lengths under the [compression registry](hdoc-v1-compression.md).
10. Validate each decoded section's internal grammar, type tags, payloads, names, container ranges,
    canonical-logical offsets, counts, canonicality, and semantic limits under P03-003–P03-005;
    recreate and compare the canonical compression selection/bytes.
11. Reconstruct and compare the canonical typed content hash under the
    [integrity registry](hdoc-v1-integrity.md).
12. Only then construct an owned value or validated borrowed view for caller access.

Checking CRC before complex body parsing is an optimization and corruption classification aid; it
does not authorize trusting header offsets or allocating claimed lengths. The minimal header fields
needed to bound the CRC range are themselves validated first.

## Rejection and diagnostics

| Failure | Stable family | Required behavior |
| --- | --- | --- |
| Header magic is not HDoc at an untyped input boundary | `CAP_FORMAT_UNSUPPORTED` | Reject without guessing another binary format |
| Unsupported major/minor under the current matrix | `CAP_UNSUPPORTED_VERSION` | Reject before body interpretation |
| Unknown required feature/critical section/codec/hash profile | `CAP_FORMAT_UNSUPPORTED` | Reject before value exposure |
| Truncation, trailing exact-blob bytes, length/copy mismatch | `DUR_CORRUPTION` for stored data | Preserve original artifact; no partial document |
| CRC mismatch | `DUR_CORRUPTION` | Report checksum class; do not continue as valid |
| Offset overflow, overlap, misalignment, extra/nonzero padding | `DUR_CORRUPTION` | Reject entire document |
| Duplicate/missing/reordered required section | `DUR_CORRUPTION` | Reject entire document |
| Content-hash mismatch | `DUR_CORRUPTION` | Distinguish from checksum class in bounded metadata |
| New user value exceeds a semantic/canonical limit | Applicable limit/input code | Reject before durable publication, not as existing corruption |

Diagnostics may include format/version, section kind, bounded byte offset, declared/observed
length, and check class. They do not log field names, values, full corrupt payloads, keys, or
secrets. Query/scan/backup/replication paths cannot skip a corrupt authoritative row or substitute
null/missing.

## Version and compatibility behavior

Only major 1/minor 0 writing is defined here. A current reader:

- rejects a major other than 1 with `CAP_UNSUPPORTED_VERSION`;
- rejects a minor other than 0 until a later accepted compatibility matrix explicitly authorizes
  it;
- rejects unknown required feature bits and unknown critical/semantic sections;
- may skip an understood length-delimited optional nonsemantic extension only under P03-015's
  exact preservation rules; and
- never infers version from byte length, section count, filename, package version, or surrounding
  storage file.

The header/footer/directory fields are a persistent format contract from the first immutable HDoc
fixture. Changing an offset, width, magic, fixed size, field meaning, canonical placement rule,
section kind assignment, or footer copy requires a superseding format decision and version/profile
change. Unassigned reserved bits/IDs are not free for local experimentation in committed bytes.

## Migration and rollback

No valid HDoc fixture or persisted HDoc row existed at P03-002; its then-unassigned profile zero
ensured that partial format could not accidentally become one. P03-006 assigned integrity profile
1, P03-007 completed compression and the full byte grammar, P03-008 added a production encoder,
P03-009 added a bounded validating reader, and P03-010 added logical views/owned values without
publishing or persisting supported data.
Immutable support fixtures remain P03-016, so the format can still be superseded without
stored-data migration before that fixture/data boundary.

Once a nonzero hash profile and immutable HDoc 1.x vectors exist, changing this layout requires:

- a new explicit readable/writable version/profile matrix;
- immutable old/new golden and malformed vectors;
- an atomic write-new/validate/publish migration with source preservation;
- interruption/resume and semantic/hash equivalence proof;
- downgrade rules and an exact rollback boundary; and
- updates to WAL/SST/VLOG, replication, backup, restore, SDK, protocol, and adapter containers that
  carry HDoc bytes.

Reading never silently migrates or rewrites an HDoc. A container cannot reinterpret HDoc version
fields based on its own format version.

## Subordinate format ownership

| Task | May define | Must not change without superseding P03-002 |
| --- | --- | --- |
| [`P03-003`](hdoc-v1-type-tags.md) | Stable value type tags and reserved tag ranges | Header/directory/footer offsets or section kinds |
| [`P03-004`](hdoc-v1-payloads.md) | Canonical noncontainer bytes inside `value_area` | Envelope endianness, lengths, placement, or footer |
| [`P03-005`](hdoc-v1-records.md) | Field/name/container entries and `item_count` meanings | Absolute offset base, directory stride, top-level order |
| [`P03-006`](hdoc-v1-integrity.md) | First nonzero hash profile, exact typed framing/vectors, corruption diagnostics | CRC field/coverage, BLAKE3 algorithm slot, 32-byte footer hash slot |
| [`P03-007`](hdoc-v1-compression.md) | Nonzero codec/profile IDs, bounded block grammar, and logical-coordinate derivation | Directory stride, logical/stored length fields, canonical limit |
| `P03-013`–`P03-015` | Path dictionary and extension record grammars/negotiation | Existing flag/feature bit meanings or ID reuse |

Later tasks may fill their reserved registries but cannot silently reinterpret zero, a reserved bit,
or an existing ID.

## Required validation fixtures

P03-002 evidence validates the layout document and machine companion, but these are not golden HDoc
bytes. P03-016/P03-018 must eventually include at least:

- exact header/footer magic and every fixed field boundary;
- base four-entry directory, optional extension entry, and maximum 32 entries;
- minimum/maximum length, field-count zero/limit/overflow, exact/trailing/truncated slices;
- every document, required-feature, optional-feature, and section-flag invariant;
- reordered/duplicate/missing/unknown critical and safely skippable optional sections;
- absolute offset overflow, underflow, header/footer pointers, overlap, alias, misalignment, gaps,
  extra padding, and nonzero padding;
- footer offset/magic/size/version/algorithm/profile/hash-length/copy mismatches;
- checksum field zeroing and corruption in header, directory, body, padding, footer, and hash;
- unsupported major/minor/required feature/hash profile/codec;
- uncompressed `total_length == canonical_length` and compressed claimed/actual expansion limits;
- identical parsing/diagnostics in Rust and TypeScript; and
- mutation/fuzz canaries proving each validator failure is reachable before value exposure.

## References

- [Specifications section 7.3](../../Specifications.md#73-canonical-binary-document-format)
- [Study section 6](../../Study.md#6-hdoc-and-the-data-model)
- [Implementation plan Phase 3](../../ImplementationPlan.md#phase-3--hdoc-format-codec-and-path-dictionary)
- [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)
- [HDoc 1.x logical type tags](hdoc-v1-type-tags.md)
- [HDoc 1.0 canonical noncontainer payloads](hdoc-v1-payloads.md)
- [HDoc 1.0 field/name/value-reference/container records](hdoc-v1-records.md)
- [HDoc 1.0 CRC-32C and canonical typed-content hashing](hdoc-v1-integrity.md)
- [HDoc 1.0 bounded section compression](hdoc-v1-compression.md)
- [Logical value model](../architecture/value-model.md)
- [Object semantics and typed content hashes](../architecture/object-semantics.md)
- [Portable v1 limits](../architecture/limits-v1.md)
- [Persistent format versioning policy](../governance/versioning.md)
- [Versioned error semantics](../architecture/error-semantics.md)

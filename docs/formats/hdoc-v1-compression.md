# HDoc 1.0 Bounded Section Compression

- Status: Accepted complete compression profile
- Last updated: 2026-07-11
- Owner: Storage architecture owner
- Plan item: `P03-007`
- Governing requirements: `CORE-001`, `DATA-001`, `DATA-002`, `INV-001`, `INV-007`
- Governing gate: `G03`
- Governing decision: [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)
- Outer envelope: [HDoc 1.0 envelope](hdoc-v1.md)
- Machine-readable companion: [hdoc-v1-compression.json](hdoc-v1-compression.json)

## Scope and maturity boundary

This document completes the HDoc 1.0 byte grammar by assigning the optional section-compression
feature, codec/profile IDs, exact deterministic encoder, independently bounded block container,
whole-section and whole-document selection rules, stored-versus-logical coordinate model,
resource limits, canonical reader checks, and unknown-codec rejection behavior.

The HDoc 1.0 base profile remains uncompressed and mandatory. Compression is a required-feature
profile: readers that do not implement it reject the document before allocating decompression
output or exposing values. A writer never needs compression to represent a valid logical document,
and compression cannot make a document larger, bypass the canonical 16 MiB limit, change typed
content identity, or introduce dictionaries, network access, or user code during decoding.

`P03-007` defined bytes and executable reference vectors without adding a production crate.
`P03-008` installed fail-closed Rust dependency/advisory reporting, adopted the exact reviewed
codec package, and implemented the production writer. `P03-009` now implements the production
bounded validating reader, including fresh exact-output decompression and exact canonical stream
comparison. `P03-016` now freezes immutable supported base and compression-profile fixture files.
The independent-reader, fuzz, benchmark, and gate obligations remain open.

The prose and machine registry are jointly normative. A disagreement is a specification defect
that blocks `G03`; an implementation must not select whichever form is convenient.

## Normative notation

| Notation | Meaning |
| --- | --- |
| `u8`, `u16`, `u32`, `u64` | Unsigned integer of the named width; multibyte values are little-endian |
| `[n]byte` | Exactly `n` uninterpreted octets |
| `[a,b)` | Half-open byte range beginning at `a` and ending before `b` |
| `align8(x)` | Smallest integer at least `x` and divisible by 8, after checked wide arithmetic |
| `stored` | Exact bytes present in the CRC-covered HDoc envelope |
| `logical` | Exact decoded bytes governed by the base section grammar |
| `MUST`, `MUST NOT` | Required or forbidden for HDoc 1.0 conformance |

All count, multiplication, addition, and range operations are performed in a host integer wider
than `u32` or by checked arithmetic. No declared length authorizes an allocation until its
containing HDoc, directory entry, stream header, and block table have passed the preceding bounds
checks.

## Assigned codec and profile

HDoc 1.0 assigns exactly two codec/profile pairs:

| Codec | Profile | Name | Meaning |
| ---: | ---: | --- | --- |
| `0` | `0` | `none` | Required uncompressed base-section representation |
| `1` | `1` | `lz4-flex-safe-independent-32k-v1` | This document's bounded compression stream containing raw LZ4 blocks |

Every other pair is unassigned. Codec/profile IDs `2` through `32767` are reserved for future
registered profiles, `32768` through `65534` are private experimental values that MUST NOT appear
in persisted or exchanged HDoc, and `65535` is an invalid sentinel. The ranges apply independently
to codec IDs and profiles within a codec. Pair `1/0`, `0/1`, or any unknown nonzero pair is not a
fallback request: a reader returns `CAP_FORMAT_UNSUPPORTED` before output allocation,
decompression, or value exposure.

Profile `1/1` uses:

- the LZ4 raw block format, not the LZ4 frame format;
- independently encoded blocks with at most 32,768 logical bytes each;
- no content-size prefix, LZ4 frame header, LZ4 frame checksum, external dictionary, trained
  dictionary, or history shared between blocks;
- `lz4_flex` version `0.13.1`, crate archive SHA-256
  `7ef0d4ed8669f8f8826eb00dc878084aa8f253506c4fd5e8f58f5bce72ddb97e`;
- upstream commit `8507d2e68ba2477fd087b7fa55d6806ca63f8138`;
- `default-features = false` with only `safe-encode` and `safe-decode` enabled; and
- `lz4_flex::block::compress_into` with fresh state for every block as the byte-authoritative
  encoder.

The profile binds the exact encoder version because valid LZ4 encoders can produce different
bytes for the same input. A different implementation may write profile `1/1` only when it proves
byte-for-byte equality with the registry vectors and pinned encoder for every accepted input. A
decoder uses the raw LZ4 grammar for safety and interoperability, then recompresses and compares
to enforce physical canonicality.

The 32 KiB boundary is deliberate. It caps one output allocation, limits a 16 MiB section to 512
blocks and a 12,288-byte table, supports independent block access, and keeps the pinned encoder on
the same small-table path in the verified native 64-bit and Wasm 32-bit targets.

## Two coordinate spaces

Compression creates two explicit coordinate spaces. Mixing them is corruption, not an
implementation choice.

### Stored coordinates

The following fields address exact bytes in the CRC-covered envelope:

- directory `section_offset` and `stored_length`;
- header/footer `footer_offset` and `total_length`; and
- compression-block `stored_offset` and `stored_length`, relative to the compression-stream start.

Stored section placement follows the envelope's normal `align8` equation using `stored_length`.
CRC-32C covers these exact bytes, including compression metadata and stored payloads.

### Canonical logical coordinates

Every absolute offset defined by the `P03-004`/`P03-005` payload and record grammars uses a derived
canonical uncompressed coordinate, whether the owning section is stored compressed or not. A
reader derives section starts without consuming stored offsets:

```text
logical_cursor = header_bytes
for each directory entry in canonical order:
    logical_section_offset[i] = align8(logical_cursor)
    logical_cursor = logical_section_offset[i] + logical_length[i]
logical_footer_offset = align8(logical_cursor)
derived_canonical_length = logical_footer_offset + 64
```

`derived_canonical_length` MUST equal both header and footer `canonical_length`. Internal field,
name, value, container, and array offsets are validated against these logical section ranges. To
resolve one after bounded decompression, the reader first proves that the absolute logical offset
and length are inside the owning logical section, then subtracts that section's derived logical
start to obtain a decoded-section-local index.

For the uncompressed base profile, stored and canonical logical coordinates coincide. For a
compressed document they can diverge after the first compressed section. No record may contain a
stored compressed-body address, and a reader never guesses the coordinate space from numeric
proximity.

## Compression-stream layout

A compressed directory entry stores exactly one HDoc compression stream. The stream has a fixed
32-byte header, `block_count` adjacent 24-byte descriptors, and gapless block payloads:

```text
byte 0
┌──────────────────────────────────────────────┐
│ compression header: 32 bytes                │
├──────────────────────────────────────────────┤
│ block table: block_count × 24 bytes          │
├──────────────────────────────────────────────┤ payload_offset
│ block 0 stored bytes                         │
├──────────────────────────────────────────────┤
│ block 1 stored bytes                         │
├──────────────────────────────────────────────┤
│ ...                                          │
└──────────────────────────────────────────────┘ stored_length
```

There is no padding before, between, or after block payloads inside the stream.

### Fixed 32-byte stream header

| Offset | Bytes | Field | Exact value or rule |
| ---: | ---: | --- | --- |
| 0 | 8 | `magic` | `48434d500d0a1a0a` (`HCMP\r\n\x1a\n`) |
| 8 | 2 | `stream_version` | `u16 = 1` |
| 10 | 2 | `header_bytes` | `u16 = 32` |
| 12 | 2 | `block_entry_bytes` | `u16 = 24` |
| 14 | 1 | `block_size_log2` | `u8 = 15` |
| 15 | 1 | `stream_flags` | `u8 = 0` |
| 16 | 4 | `block_count` | `ceil(logical_length / 32768)` |
| 20 | 4 | `logical_length` | Exact directory `logical_length` |
| 24 | 4 | `payload_offset` | `32 + block_count * 24` |
| 28 | 4 | `reserved_0` | `u32 = 0` |

An empty logical section cannot be compressed, so every stored compression stream has at least one
block. Under the portable document limit, `block_count` is at most 512. All constants, products,
and the complete table range are validated against the directory `stored_length` before reading a
descriptor payload or allocating output.

### Fixed 24-byte block descriptor

| Entry offset | Bytes | Field | Exact value or rule |
| ---: | ---: | --- | --- |
| 0 | 4 | `logical_offset` | `block_index * 32768` |
| 4 | 4 | `logical_length` | 32,768 except the exact positive final remainder |
| 8 | 4 | `stored_offset` | Relative to stream start; exact gapless payload position |
| 12 | 4 | `stored_length` | `1..32768` |
| 16 | 2 | `block_flags` | Only bit 0 may be set |
| 18 | 2 | `reserved_0` | `u16 = 0` |
| 20 | 4 | `reserved_1` | `u32 = 0` |

Flag bit 0 (`RAW`, mask `0x0001`) means the stored bytes exactly equal the logical block and
`stored_length == logical_length`. When `RAW` is clear, the bytes are the exact pinned canonical
LZ4 block, `stored_length < logical_length`, and decoding must produce exactly the descriptor's
logical length. Bits 1 through 15 are zero.

Descriptors cover logical bytes contiguously from zero through the exact section length. Stored
payloads begin at `payload_offset`, follow descriptor order without gaps or overlaps, and end at
the exact compression-stream length. Aliasing a payload, adding trailing bytes, shortening the
last logical block, or encoding an empty block is noncanonical corruption.

## Canonical block encoding

For each logical block, a writer:

1. creates fresh encoder state and computes the exact profile-`1/1` LZ4 bytes;
2. stores those bytes with `RAW` clear only when their length is strictly less than the logical
   block length; and
3. otherwise stores the original block bytes with `RAW` set.

Equality selects raw bytes. A writer cannot keep a nonshrinking LZ4 block in hopes that other
blocks compensate. A stream necessarily contains at least one LZ4 block when it is smaller than
its logical section; nevertheless readers explicitly verify the invariant.

A reader decodes each LZ4 block into one fresh, zero-initialized output buffer whose exact size is
the descriptor logical length and never exceeds 32,768 bytes. The safe decoder's returned byte
count must equal that length. The reader then recompresses the decoded bytes with the pinned
profile and verifies both the raw-versus-LZ4 choice and, for LZ4, exact stored bytes. This rejects
semantically equivalent but physically noncanonical LZ4 sequences.

## Canonical section and document selection

The uncompressed base profile is always valid. There is one canonical optional compressed profile,
not an arbitrary per-section preference.

A writer builds a candidate stream for each of the four required base sections—`field_table`,
`name_pool`, `value_area`, and `container_tables`. It selects a section if and only if the complete
stream, including its header and table, is strictly smaller than that section's logical bytes. In
the compressed profile it compresses every and only section that passes this test.

The writer emits the compressed document profile only if:

- at least one base section is selected; and
- the resulting complete HDoc `total_length` is strictly less than `canonical_length`.

Otherwise it emits the uncompressed base profile. This final check includes changed padding,
directory metadata, and the unchanged 64-byte header/footer, so a locally smaller section cannot
produce a larger stored document.

For HDoc 1.0, compression of `extension_area` is forbidden. P03-015 registers no extension; a
future matrix may add a compatible rule without changing the four base-section algorithm. A reader recreates all four candidates and
compares section selection, directory metadata, block choices, and compressed bytes. Omitting a
beneficial section, compressing a nonbeneficial section, or emitting an alternate valid LZ4 byte
sequence is `DUR_CORRUPTION` in the decompression-canonicality class.

## Envelope, directory, integrity, and hash rules

For an uncompressed section:

```text
section_flags = CRITICAL | SEMANTIC = 0x0006
codec_id = 0
codec_profile_id = 0
stored_length = logical_length
```

For a profile-`1/1` compressed base section:

```text
section_flags = COMPRESSED | CRITICAL | SEMANTIC = 0x0007
codec_id = 1
codec_profile_id = 1
stored_length = exact compression-stream byte length
logical_length = exact decoded section-grammar byte length
```

`item_count` retains its base logical meaning and is never a block count. Header flag
`HAS_COMPRESSED_SECTIONS` and required feature `SECTION_COMPRESSION` are both set if and only if
at least one directory entry is compressed. Any mismatch among flag, feature bit, section flag,
codec/profile pair, or length rule is structural/canonical corruption.

CRC-32C is computed over the exact stored envelope and therefore normally differs between
compressed and uncompressed representations. The footer typed-content hash is computed only from
the fully validated decoded logical tree and therefore remains identical for those representations.
CRC success cannot excuse a decompression, canonicality, section-grammar, or typed-hash failure.

## Validation order and atomic exposure

An implementation may fuse passes, but it must preserve these trust dependencies and expose no
owned value, borrowed view, field name, or payload before all required stages succeed:

1. Validate minimal HDoc magic, fixed fields, supplied slice length, `total_length`,
   `canonical_length`, footer range, and the portable 16 MiB bound with checked arithmetic.
2. Validate CRC-32C over the exact stored envelope.
3. Parse directory fixed fields sufficiently to reject unknown required feature bits and unknown
   codec/profile pairs before decompression allocation.
4. Validate canonical stored section placement, ranges, flags, codec/profile relationships, and
   zero padding.
5. Derive every canonical logical section start and footer position from `logical_length`; require
   exact `canonical_length` agreement.
6. For each compressed section, validate the fixed stream header, checked block-table products,
   descriptor sequence, flags, lengths, and exact gapless stored coverage without output allocation.
7. Decode one fresh bounded block at a time and require exact output length.
8. Validate the complete decoded section grammars, internal canonical-logical offsets, counts,
   limits, and exact logical coverage.
9. Recreate canonical block bytes, raw/LZ4 choices, section selection, and the complete compressed
   document profile; compare every relevant stored byte and field.
10. Reconstruct and compare the profile-1 typed-content hash.
11. Only then return a document or validated borrowed view.

The production implementation may retain validated decoded sections or lazily decode blocks, but
lazy access does not weaken whole-document validation before exposure and never allocates more
than declared, prevalidated logical bounds.

## Failure classes and required rejection cases

| Failure | Stable family/check class | Required behavior |
| --- | --- | --- |
| Unknown required feature, codec, or profile | `CAP_FORMAT_UNSUPPORTED` | Reject before decompression allocation |
| Header/feature/section flag mismatch | `DUR_CORRUPTION` / structural canonicality | Reject complete document |
| Stream constant, reserved field, or table arithmetic failure | `DUR_CORRUPTION` / decompression header or table | Reject without decoding payloads |
| Logical/stored gap, overlap, alias, truncation, or trailing bytes | `DUR_CORRUPTION` / decompression table | Reject complete document |
| Raw length mismatch or invalid/truncated/overrunning LZ4 | `DUR_CORRUPTION` / decompression block | Abort current block and document |
| Wrong raw/LZ4 choice or valid alternate LZ4 bytes | `DUR_CORRUPTION` / decompression canonicality | Reject complete document |
| Nonshrinking stream/section/document or wrong selected sections | `DUR_CORRUPTION` / decompression canonicality | Reject complete document |
| Invalid decoded section grammar | `DUR_CORRUPTION` / structural canonicality | Reject before typed hash/value exposure |
| Decoded typed tree hash mismatch | `DUR_CORRUPTION` / typed content hash | Distinguish from CRC/decompression classes |

Required malformed tests include zero LZ4 offset, truncated length extensions, literal/match
overrun, wrong decoded length, integer overflow, table truncation, nonfinal short block, wrong final
remainder, unknown/reserved flags, nonzero reserved words, stored/logical gaps and overlaps,
duplicate payload references, raw length mismatch, LZ4 stored without shrinking, raw stored when
canonical LZ4 shrinks, a stream not smaller than the section, omitted/extra selected sections, and
`total_length >= canonical_length` in the compressed profile.

Diagnostics may include codec/profile, block index, bounded byte offset, declared/observed length,
and check class. They must not include decoded field names, values, full compressed blocks, keys, or
secrets. No scan, query, backup, replication, or adapter path may skip the corrupt document or
substitute null/missing.

## Executable reference vectors

The machine registry contains seven exact block vectors, five exact section-stream vectors, two
complete HDoc envelopes, and an independent C-encoder canonicality canary. Important boundaries are:

| Vector | Logical bytes | Stored/compressed bytes | Canonical outcome |
| --- | ---: | ---: | --- |
| Empty block encoder reference | 0 | 1 (`00`) | Empty section cannot be compressed |
| Thirteen zero bytes | 13 | 11-byte LZ4; 67-byte stream | Section remains uncompressed |
| 32,768 zero bytes | 32,768 | 140-byte LZ4; 196-byte stream | Compressed section selected |
| 65,536 zero bytes | 65,536 | 360-byte two-block stream | Two independent LZ4 blocks |
| 32,768 zeros + 257 SplitMix64 bytes | 33,025 | 477-byte stream | LZ4 block followed by raw block |
| 32,768 SplitMix64 bytes | 32,768 | 32,824-byte stream | Section remains uncompressed |

Native x86-64 and `wasm32-unknown-unknown` builds of the pinned safe encoder produce identical
bytes for all seven block vectors. The official LZ4 v1.10.0 C encoder produces a different valid
139-byte encoding for 32,768 zero bytes; it decodes to the same logical bytes but is rejected by
profile `1/1` because the canonical pinned output is 140 bytes.

The complete logical document `{_id: UUID(nil), pad: "A" repeated 4096}` has:

- uncompressed `total_length = canonical_length = 4472`, CRC-32C `0x7f92af2c`;
- value-area-compressed `total_length = 448`, `canonical_length = 4472`, stored footer offset
  `384`, and CRC-32C `0x67374852`; and
- identical typed-content hash
  `40bd20b8d0574192538a202d78c7b5f3cde3fd937bd93df6cac244fbb6de062e`.

In the compressed vector, the container-table absolute logical offset is `4376` while its stored
offset is `352`; the logical footer is `4408` while the stored footer is `384`. The exact 448-byte
envelope in the registry makes the coordinate distinction executable.

The registry's timing numbers are non-gating selection smoke data from one development machine.
`P03-020` and `P03-021` own representative, reproducible format/compression benchmarks and any
retention decision based on them.

## Dependency, security, and license boundary

The reviewed `lz4_flex` package is MIT-licensed and, with the selected features, has no runtime
transitive crate. Version `0.13.1` is outside the affected ranges in RustSec advisory
`RUSTSEC-2026-0041`; the machine registry pins the advisory snapshot and all reviewed source/archive
hashes. The profile additionally requires the safe decoder, fresh zero-initialized exact output,
no dictionaries, and exact returned-length validation as defense in depth.

This approval does not bypass repository dependency policy. `P03-008` activated the crate only
after adding a pinned fail-closed scanner/report, exact graph and license authorities, updated
notices, the `=0.13.1` lock checksum, and only the reviewed features. Its durable implementation
evidence carries native/Wasm/independent-C vectors and scanner self-audit results.

## Versioning, migration, and rollback

Codec/profile `1/1`, the `HCMP` stream constants, descriptor widths, block boundary, encoder
version, canonical selection rules, and two-coordinate model are stable persistent HDoc 1.0
contracts. A newer `lz4_flex` version or alternate byte-producing encoder cannot silently replace
the writer while retaining profile `1/1`; it requires byte-equivalence proof or a newly registered
profile and compatibility matrix.

P03-016 now freezes immutable base and canonical compression profile `1/1` HDoc fixtures. An
incompatible change therefore requires historical decoding, new codec/profile negotiation,
old/new positive and malformed fixtures, atomic validated rewrite/resume/rollback, and updates to
every WAL/SST/VLOG, replication, backup, SDK, protocol, and adapter container that carries HDoc.
Reading never silently recompresses, repairs, or rewrites an HDoc.

## Subordinate ownership

| Task | Owns next | Cannot change from `P03-007` |
| --- | --- | --- |
| `P03-008` (complete) | Canonical writer, exact dependency adoption, advisory/license gates | Profile IDs, stream bytes, block/selection rules |
| `P03-009` (complete) | Bounded validating reader and stable decompression diagnostics | Trust order, resource bounds, unknown-codec behavior |
| `P03-010` (complete) | Borrowed views reusing bounded decoded sections and detached owned values | Whole-document validation and logical offsets |
| `P03-011` (complete) | Exact-name lookup and bounded dotted traversal over retained sections | Whole-document validation and logical offsets |
| [`P03-012`](hdoc-v1-tagged-json.md) (complete) | Canonical lossless tagged rendering and strict detached import | Whole-document validation and logical offsets |
| [`P03-015`](hdoc-v1-compatibility.md) (complete) | Closed-world negotiation; extension-area compression remains unsupported | Four-base-section profile and existing IDs |
| [`P03-016`](../../fixtures/hdoc/v1/README.md), `P03-017`, and `P03-018` complete; `P03-019` remains | Immutable fixtures, independent reader, and deterministic properties/mutations complete; fuzz/sanitizer replay remains | Registry vectors and rejection expectations |
| `P03-020`–`P03-021` | Formal format/compression/dictionary benchmarks | Correctness, canonicality, limits, or security rules |

## References

- [Specifications section 7.3](../../Specifications.md#73-canonical-binary-document-format)
- [Study section 6](../../Study.md#6-hdoc-and-the-data-model)
- [Implementation plan Phase 3](../../ImplementationPlan.md#phase-3--hdoc-format-codec-and-path-dictionary)
- [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)
- [HDoc 1.0 envelope](hdoc-v1.md)
- [HDoc 1.0 records](hdoc-v1-records.md)
- [HDoc 1.0 integrity and typed hashing](hdoc-v1-integrity.md)
- [Portable v1 limits](../architecture/limits-v1.md)
- [Versioned error semantics](../architecture/error-semantics.md)
- [Dependency and vulnerability reporting](../architecture/dependency-security-reporting.md)
- [Licensing and attribution](../governance/licensing.md)

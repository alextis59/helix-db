# P03-007 Evidence — HDoc 1.0 Bounded Section Compression

- Task: `P03-007`
- Verdict: **PASS**
- Source commit: `89ec351aa0754aafe69ce8a2f8ad6a4ffe88f8b0`
- Source parent: `cff50c64b7a400fdf50a329277b6b412b4bf0480`
- Source tree: `cdde8d9a841a941247af7f70d71021bd0e482079`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-001`, `DATA-002`, `INV-001`, `INV-007`
- Gate: `G03`
- Recorded: 2026-07-11 UTC

## Outcome

P03-007 completes the HDoc 1.0 byte grammar by assigning optional codec/profile `1/1`,
`lz4-flex-safe-independent-32k-v1`. It uses exact raw LZ4 bytes produced by `lz4_flex` `0.13.1`
with `default-features = false` and only `safe-encode`/`safe-decode`, partitioned into independent
32 KiB blocks inside an HDoc-owned stream.

The accepted format has one mandatory uncompressed base profile and one optional compressed
profile. A block uses LZ4 only when its exact canonical output is strictly shorter; otherwise it is
stored raw. A base section is selected only when its complete stream, including header/table, is
shorter. The compressed document is emitted only when every and only beneficial base section is
selected and the complete stored HDoc is shorter than the canonical uncompressed envelope.

The task also closes the addressing ambiguity exposed by compression:

- directory `section_offset`, header/footer `footer_offset`, and `total_length` address exact stored
  CRC-covered bytes; and
- every P03-004/P03-005 internal absolute offset addresses the derived canonical-logical HDoc,
  using aligned placement over directory `logical_length`.

The source commit defines the profile and reference bytes but does not add an external production
crate. P03-008 must install fail-closed Rust advisory reporting and update lock/license/notice
policy before adopting the exact reviewed package.

## Source artifacts

The exact 23-artifact source diff is hash-bound in [manifest.json](manifest.json):

| Artifact | Role |
| --- | --- |
| [Specifications](../../../Specifications.md) | Normative compression, bounds, and coordinate summary |
| [Study](../../../Study.md) | Codec/size/security/portability selection analysis |
| [Compression document](../../../docs/formats/hdoc-v1-compression.md) | Complete human-readable profile and validation contract |
| [Compression registry](../../../docs/formats/hdoc-v1-compression.json) | Exact layouts, profiles, vectors, failures, provenance, and deferrals |
| [Envelope document](../../../docs/formats/hdoc-v1.md) | Stored/logical coordinates and decompression validation order |
| [Envelope registry](../../../docs/formats/hdoc-v1-envelope.json) | Complete-format marker and codec/profile mirror |
| [Record document](../../../docs/formats/hdoc-v1-records.md) | Canonical-logical internal offset model |
| [Record registry](../../../docs/formats/hdoc-v1-records.json) | Machine coordinate model and completion marker |
| [Integrity document](../../../docs/formats/hdoc-v1-integrity.md) | Stored CRC versus decoded typed-hash integration |
| [Integrity registry](../../../docs/formats/hdoc-v1-integrity.json) | Compression-aware trust order and completion marker |
| [Payload document](../../../docs/formats/hdoc-v1-payloads.md) | Decoded payload identity boundary |
| [Payload registry](../../../docs/formats/hdoc-v1-payloads.json) | Compression binding and complete-format marker |
| [Type-tag document](../../../docs/formats/hdoc-v1-type-tags.md) | Complete-format and optional-storage boundary |
| [Type-tag registry](../../../docs/formats/hdoc-v1-type-tags.json) | Compression binding and complete-format marker |
| [ADR 0012](../../../docs/adr/0012-use-bounded-little-endian-hdoc-v1.md) | Checked P03-007 validation/follow-up state |
| [Dependency reporting](../../../docs/architecture/dependency-security-reporting.md) | First-external-crate scanner gate for P03-008 |
| [Licensing policy](../../../docs/governance/licensing.md) | Reviewed pending MIT codec dependency |
| [Decision owners](../../../docs/governance/decision-owners.md) | Current format-completion boundary |
| [Format index](../../../docs/formats/README.md) | Published compression-format entry |
| [Documentation index](../../../docs/README.md) | Top-level discoverability |
| [Compatibility matrix](../../../compatibility/v1/matrix-v1.json) | Regenerated hash-bound specification authority |
| [Rendered compatibility document](../../../docs/compatibility/v1-semantic-compatibility-matrix.md) | Regenerated human-readable matrix identity |
| [Generation report](../../../fixtures/generation/report-v1.json) | Regenerated artifact hashes and pass verdict |

## Exact stream and bounds

Every compressed section contains:

```text
32-byte HCMP header
block_count × 24-byte descriptors
gapless block payloads
```

The header fixes magic `48434d500d0a1a0a`, stream version 1, header/entry widths 32/24,
`block_size_log2 = 15`, zero flags/reserved fields, exact section logical length, and table-derived
payload offset. Descriptors fix each logical range, relative stored range, raw flag, and zero
reserved fields.

The canonical 16 MiB document limit implies at most 512 blocks in any section, at most 12,288
descriptor bytes, and one fresh zero-initialized decode output of at most 32,768 bytes. Blocks have
no shared history, dictionary, content-size prefix, frame metadata, frame checksum, network access,
or user code. Empty logical sections cannot be compressed.

Unknown required features and unknown codec/profile pairs yield `CAP_FORMAT_UNSUPPORTED` before
decompression output allocation. Structural/table failures, invalid LZ4, noncanonical LZ4,
selection failures, decoded grammar failures, and typed-hash failures remain distinct bounded
`DUR_CORRUPTION` check classes.

## Deterministic codec selection

The reviewed canonical encoder is `lz4_flex::block::compress_into` at exact crate version `0.13.1`
and upstream commit `8507d2e68ba2477fd087b7fa55d6806ca63f8138`. Its crate archive SHA-256 is:

```text
7ef0d4ed8669f8f8826eb00dc878084aa8f253506c4fd5e8f58f5bce72ddb97e
```

Source-time validation built the selected safe feature set for native x86-64 and
`wasm32-unknown-unknown`. All seven block inputs produced identical length, bytes, and SHA-256 on
both targets. An independent decoder reproduced every logical input.

The official LZ4 v1.10.0 C implementation produced a different valid encoding for the 32 KiB zero
block: 139 bytes rather than the pinned Rust encoder's 140. Both decode to the same 32,768 zeros,
which proves that an algorithm label alone cannot define canonical persistent bytes. Profile `1/1`
requires decode, pinned-profile recompression, and exact comparison; the C alternative is rejected
as decompression canonicality failure.

LZ4 frame, Zstandard, Snappy, and external/trained dictionaries were not selected for v1. The
single raw-block profile meets the current portable random-access and bounded-decoding needs with
the smallest versioned surface. Future alternatives require a new registered profile and evidence;
they are not writer preferences under profile `1/1`.

## Executable vectors

The registry contains seven block vectors and five complete section streams:

| Boundary | Result |
| --- | --- |
| Empty input | Canonical encoder emits one byte; empty sections remain uncompressed |
| 13 zero bytes | 11-byte LZ4 block but 67-byte stream; section remains uncompressed |
| 64 ASCII `A` bytes | 12-byte canonical LZ4 boundary vector |
| 32 KiB zeros | 140-byte LZ4 block and 196-byte selected stream |
| 64 KiB zeros | Two independent LZ4 blocks and 360-byte selected stream |
| 32 KiB zeros + 257 SplitMix64 bytes | LZ4 block followed by raw block; 477-byte selected stream |
| 32 KiB SplitMix64 bytes | Raw block and 32,824-byte stream; section remains uncompressed |

The network-free immutable verifier regenerates every logical input, checks its SHA-256, parses all
provided headers/descriptors, independently decodes raw LZ4, enforces raw/LZ4 choices against the
recorded canonical outputs, checks exact stream SHA-256, and verifies selected/nonselected results.

## Complete HDoc and coordinate replay

Both complete reference envelopes represent:

```text
{_id: uuid-nil, pad: string("A" repeated 4096)}
```

| Representation | Total bytes | Canonical bytes | Footer offset | CRC-32C | Typed hash |
| --- | ---: | ---: | ---: | --- | --- |
| Uncompressed | 4,472 | 4,472 | 4,408 | `0x7f92af2c` | `40bd20b…de062e` |
| Value-area compressed | 448 | 4,472 | 384 | `0x67374852` | `40bd20b…de062e` |

The verifier reconstructs the uncompressed 4,472-byte HDoc independently and parses the exact
448-byte compressed HDoc. It validates header/directory/footer, stored placement/padding, CRC,
stream/table/block bytes, decoded field/name/value/container sections, root `_id`, and a portable
BLAKE3 typed-tree reconstruction.

The compressed HDoc makes both coordinate spaces executable:

| Position | Canonical logical | Stored |
| --- | ---: | ---: |
| `value_area` start | 264 | 264 |
| `container_tables` start | 4,376 | 352 |
| footer start | 4,408 | 384 |

Internal record offsets continue to point at 264/280 for the UUID/string payloads and 4,376 for the
container descriptor. A reader validates each against the owning logical section before converting
to a decoded-section-local index; it never follows those numbers into compressed stored bytes.

## Malformed and canonicality replay

All 18 declared negative classes are present, and the verifier executes 32 concrete mutations:

- every stream magic/version/width/log2/flag/reserved constant;
- zero, wrong, overflowing, and truncated block tables;
- logical/stored gaps, wrong final length, and trailing payload bytes;
- raw-length mismatch;
- zero LZ4 offset, truncation, and output overrun;
- nonshrinking LZ4, wrong raw choice, and nonshrinking stream;
- valid official-C but noncanonical LZ4 bytes;
- unknown codec, profile, and required feature with a zero decompression counter;
- feature/document/section mismatch;
- omitted or extra selected sections and a nonshrinking complete document;
- invalid decoded section grammar; and
- repaired-CRC typed-content-hash corruption.

Mutations are isolated in memory and do not modify the source commit or worktree.

## Dependency, vulnerability, and license review

The registry pins eight external snapshots by authority, commit/version, path, byte count, and
SHA-256: the official LZ4 block specification/reference C source; the selected crate manifest,
archive, license, safe compressor, and safe decoder; and RustSec advisory `RUSTSEC-2026-0041`.

The advisory affects `<=0.11.5` and `=0.12.0`; selected `0.13.1` is outside those ranges. The
profile still requires safe decode, a fresh zero-filled exact output buffer, returned-length
validation, and no dictionaries as defense in depth. The selected crate is MIT-licensed and has no
runtime transitive crate with the chosen features.

P03-007 intentionally leaves Cargo at eight unpublished workspace crates and zero external crates.
The dependency policy still rejects external Rust packages. P03-008 must add a pinned fail-closed
Rust advisory scanner/report, exact lock checksum, license/notices, and release/SBOM boundaries in
the same change that adopts the codec.

## Machine validation

[verify.mjs](verify.mjs) is 62,256 bytes with SHA-256
`0538288807d2e66cd83f3326a86696af4ee8bb0407bc8b3dd711d3a2df681ee4`.

It verifies from the immutable source commit rather than the worktree:

- exact parent/tree/source scope, byte counts, and SHA-256 identities for all 23 source artifacts;
- every 32-byte stream-header and 24-byte descriptor field with exact contiguous coverage;
- codec/profile IDs, package/version/features, limits, resource order, coordinate model, and
  cross-registry complete-format bindings;
- seven block vectors, five section streams, two complete HDocs totaling 4,920 bytes, and the
  official-C alternate encoding;
- independent LZ4 decode, CRC-32C, SHA-256, and portable BLAKE3 typed-tree reconstruction;
- all 18 negative classes and 32 isolated malformed/canonicality mutations;
- the zero-external-crate dependency/advisory adoption boundary;
- all 19 normative compression-document headings and required cross-document markers;
- 175 source Markdown files and 1,402 resolving local links; and
- isolated network-free replay of the 263-row generated compatibility matrix.

The immutable verifier passed under exact Node.js 22.23.1 and 24.18.0. It is network-free: exact
upstream source/build validation happened before the source commit, while the verifier binds those
reviewed identities and independently replays the resulting persistent bytes.

## Broader validation

Across the source and closeout snapshots:

- compatibility generation/checking passed 263 rows with zero failures/skips;
- fixture generation/checking passed four generators, five authority artifacts, schemas, and
  independent SplitMix64 reproduction;
- JavaScript, Cargo/npm dependency policy, and offline dependency inventory passed;
- `test:all` passed nine Rust tests, 17 semantic fixtures/313 steps/382 oracle assertions, 16
  MongoDB cases, Wasm/browser bundle checks, three declared browser tests, benchmark validation,
  19 benchmark rejection canaries, and all reserved-suite claim boundaries; and
- all format JSON, changed-file whitespace, generated authority, and local documentation links
  passed.

The timing smoke numbers in the source registry are selection sanity only. Formal representative
encode/decode/lookup/size/compression evidence remains P03-020/P03-021 and no threshold is claimed.

## Commands

```bash
node compatibility/v1/generate-matrix.mjs --check
node compatibility/v1/check-matrix.mjs
corepack npm run fixtures:check
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run dependencies:check
corepack npm run test:all

/home/alextis/.nvm/versions/node/v22.23.1/bin/node \
  evidence/phase-03/P03-007/verify.mjs \
  89ec351aa0754aafe69ce8a2f8ad6a4ffe88f8b0

/home/alextis/.nvm/versions/node/v24.18.0/bin/node \
  evidence/phase-03/P03-007/verify.mjs \
  89ec351aa0754aafe69ce8a2f8ad6a4ffe88f8b0
```

## Maturity boundary

This evidence proves the P03-007 compression/coordinate specification and exact reference bytes.
It does not claim:

- a production encoder or adopted external Cargo dependency (`P03-008`);
- a production bounded validating decoder or stable diagnostics implementation (`P03-009`);
- owned/borrowed value APIs, field lookup, or rendering (`P03-010`–`P03-012`);
- dictionary/extension/migration profiles (`P03-013`–`P03-015`);
- immutable supported complete positive/malformed HDoc fixture files (`P03-016`);
- independent production Rust/TypeScript codecs, property/fuzz/sanitizer proof, or exhaustive
  corruption replay (`P03-017`–`P03-019`);
- representative performance or dictionary-retention conclusions (`P03-020`–`P03-021`); or
- authentication, encryption, signatures, or an authenticated storage envelope.

Those boundaries keep a complete byte grammar from being mistaken for an implemented database
codec or release support claim.

## Primary external references

- [Official LZ4 block format](https://github.com/lz4/lz4/blob/v1.10.0/doc/lz4_Block_format.md)
- [Official LZ4 reference implementation](https://github.com/lz4/lz4/tree/v1.10.0)
- [`lz4_flex` 0.13.1 documentation](https://docs.rs/lz4_flex/0.13.1/lz4_flex/)
- [RustSec RUSTSEC-2026-0041](https://rustsec.org/advisories/RUSTSEC-2026-0041)

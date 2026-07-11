# P03-002 HDoc 1.0 Envelope Layout Evidence

- Task: `P03-002` — define the HDoc header, flags, format version, total length, field count,
  checksum, body sections, and footer
- Requirements supported: `INV-001`, `INV-007`, `DATA-001`, `CORE-001`, `SEC-002`
- Accepted decision: [ADR 0012](../../../docs/adr/0012-use-bounded-little-endian-hdoc-v1.md)
- Normative format: [HDoc 1.0 envelope](../../../docs/formats/hdoc-v1.md)
- Machine companion: [hdoc-v1-envelope.json](../../../docs/formats/hdoc-v1-envelope.json)
- Commit under test: `6b89d300d2cf5f0618219c4894b8db100fbb4949`
- Recorded at: `2026-07-11T08:20:25.428Z`
- Source worktree: clean
- Recorder: Codex implementation agent
- Reviewer: pending independent `G03` format/security review
- Verdict: Pass

## Scope and result

The source commit fixes the HDoc 1.0 outer envelope without claiming a complete HDoc codec or byte
fixture:

| Structure | Exact result |
| --- | --- |
| Header magic | `48 44 4f 43 0d 0a 1a 0a` (`HDOC\r\n\x1a\n`) |
| Fixed header | 64 bytes, 16 adjacent fields |
| Version | Major 1, minor 0; current reader rejects every other minor/major until a matrix says otherwise |
| Directory | Starts at byte 64; 32-byte entries; 4–32 entries |
| Base header | Four entries, so `header_bytes = 192` |
| Body | Required `field_table`, `name_pool`, `value_area`, `container_tables`; optional registered `extension_area` |
| Placement | Absolute `u32` offsets, ascending canonical section order, 8-byte starts, minimal zero padding |
| Lengths | Exact stored `total_length`; complete expanded `canonical_length`; `256 <= total <= canonical <= 16 MiB` |
| Field count | Total recursive object-field entries, mirrored by the field-table count and footer copy |
| Checksum | CRC32C slot at `[32,36)`; complete stored envelope coverage with those bytes zeroed |
| Footer | 64 bytes at `footer_offset`; `HDOCEND\n`, version/hash fields, repeated lengths/count, 32-byte hash slot |
| Maturity brake | BLAKE3 algorithm ID 1 is reserved, but hash profile ID 0 is invalid until `P03-006` assigns exact framing |

The base profile has no compression, extensions, or path-dictionary references. Structural flags
and feature bits are assigned now so later tasks can add registered content without moving the
header or directory. Internal type tags, value bytes, field/container records, content-hash
framing, and compression blocks remain `P03-003`–`P03-007`.

## Source artifacts and generated authority

The exact ten-file source commit:

- adds the 578-line normative format document, 498-line machine layout, and format index;
- links the exact outer layout from the specification, study, documentation guide, and ADR;
- checks the ADR's `P03-002` validation/follow-up rows while leaving the implementation-plan task
  open until this evidence exists;
- regenerates the specification-bound 263-row semantic compatibility matrix and rendered document;
  and
- refreshes the higher-level deterministic fixture-generation report with both new artifact
  identities.

It changes no Rust/TypeScript source, crate/package manifest, dependency, lockfile, public API,
persistent HDoc bytes, golden fixture, or compatibility claim.

## Machine layout validation

The focused checker and [verify.mjs](verify.mjs) independently prove:

- all 16 header fields are unique, adjacent, little-endian/raw as specified, and partition exactly
  `[0,64)`;
- all 11 directory fields partition exactly 32 bytes and all 10 footer fields partition exactly 64
  bytes;
- header/footer magic decode to exactly eight bytes each;
- five document flags, three required feature bits, one optional feature bit, and four section
  flags have unique bits and exact width-padded masks;
- five section IDs/orders are unique, the four base sections are critical+semantic (`0x0006`), and
  the extension area is optional;
- the four-entry base equation produces a 192-byte header and 256-byte structural lower bound;
- 12 canonical placement/count/length/checksum rules are stable and ordered;
- BLAKE3 algorithm ID 1/32-byte output is assigned while profile zero stays invalid; and
- every machine field, flag, section, limit, validation dependency, version rule, error family,
  migration boundary, and subordinate task owner is represented in the normative prose.

## Structural skeleton

The verifier builds a 256-byte in-memory skeleton using the registry—not a committed HDoc fixture:

- 64-byte header and four 32-byte directory entries;
- zero-length body sections at aligned byte 192;
- 64-byte footer at byte 192;
- matching stored/canonical lengths of 256 and field count zero; and
- the checksum field zeroed during reflected CRC32C calculation.

It reproduces:

```text
CRC32C: 0x4eb20944
SHA-256: 8507b3b355ff4786e4eafac55cfdfd913e2f9f4077171eb51512f6f5ebcaf39f
```

The skeleton is deliberately rejected as a complete HDoc because its hash profile is zero and the
internal section grammars are not defined. It proves envelope placement/checksum arithmetic only.

## Negative verification

The verifier executes 35 isolated in-memory mutation canaries. They separately corrupt:

- completion/maturity state and the portable size limit;
- header and footer magic;
- header, directory-entry, and footer widths;
- header/directory/footer field offsets;
- checksum slot and directory offset constants;
- document, required-feature, optional-feature, and section flag masks;
- required section ID, order, critical/semantic flags, and base section inventory/count/header size;
- hash algorithm/profile boundaries;
- footer placement/copy and field-count canonical rules;
- the format-document maturity and recursive-count contract;
- specification, study, format-index, docs-index, and ADR backlinks/check state;
- the source plan's still-open `P03-002` state;
- compatibility-matrix binding to `Specifications.md`; and
- deterministic-generation-report binding to the matrix/rendered document.

Each canary must reach its intended first rejection reason. Mutations never touch the workspace.

## Broader validation

Before the source commit:

- changed-document formatting and 106 local links passed;
- the current tree contained 165 Markdown files and 1,137 resolving local links;
- the exact machine JSON parsed and matched deterministic two-space `JSON.stringify` formatting;
- the compatibility generator/checker passed with 263 rows, zero failures/skips, and seven matrix
  mutation canaries;
- `fixtures:check` passed all four generators, five authority artifacts, schemas, independent
  SplitMix64 reproduction, and deterministic subordinate checks;
- JavaScript/dependency policy passed; and
- `test:all` passed nine Rust tests, 17 semantic fixtures/313 steps/382 oracle assertions, 16
  MongoDB cases, Wasm/browser bundle checks, three declared browser tests, benchmark schema/raw
  validation, 19 benchmark rejection canaries, and all reserved-suite claim boundaries.

The evidence verifier passed under exact Node.js 22.23.1 and 24.18.0.

## Commands

```bash
node compatibility/v1/generate-matrix.mjs --check
node compatibility/v1/check-matrix.mjs
corepack npm run fixtures:check
corepack npm run policy:javascript
corepack npm run test:all
/home/alextis/.nvm/versions/node/v22.23.1/bin/node \
  evidence/phase-03/P03-002/verify.mjs \
  6b89d300d2cf5f0618219c4894b8db100fbb4949
/home/alextis/.nvm/versions/node/v24.18.0/bin/node \
  evidence/phase-03/P03-002/verify.mjs \
  6b89d300d2cf5f0618219c4894b8db100fbb4949
```

## Failures, skips, and limitations

- No final focused, fixture, policy, aggregate, or evidence-verifier check failed or skipped.
- The 256-byte skeleton is not retained as a golden fixture and cannot support a decoder/writer
  claim; hash profile zero makes that boundary executable.
- No logical type tag or payload representation is assigned (`P03-003`/`P03-004`).
- Section `item_count` internals and field/name/container entries remain `P03-005`.
- Exact BLAKE3 domain/framing/golden hash vectors remain `P03-006`.
- Nonzero codec/profile IDs and block grammars remain `P03-007`.
- Dictionary/extension records and reader/writer migration matrices remain `P03-013`–`P03-015`.
- Independent Rust/TypeScript readers, golden bytes, fuzzing, and format benchmarks remain
  `P03-016`–`P03-021` and block `G03`.

## Reproduction

Check out `6b89d300d2cf5f0618219c4894b8db100fbb4949`, run the commands above, and compare the ten source
identities in [manifest.json](manifest.json). The verifier extracts the source commit for its
generator replay and requires no network access.

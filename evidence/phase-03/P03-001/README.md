# P03-001 HDoc V1 Physical Baseline Decision Evidence

- Task: `P03-001` — write the HDoc format ADR covering endianness, alignment, offsets, maximum
  sizes, canonicalization, checksum, hash, and extension strategy
- Requirements supported: `INV-001`, `INV-007`, `DATA-001`, `DATA-002`, `CORE-001`, `SEC-001`,
  `SEC-002`
- Accepted decision: [ADR 0012](../../../docs/adr/0012-use-bounded-little-endian-hdoc-v1.md)
- Commit under test: `ae7bf86ec117d2d1d550a9cb6d1087b7f402402f`
- Recorded at: `2026-07-11T07:48:09.358Z`
- Source worktree: clean
- Recorder: Codex implementation agent
- Reviewer: pending independent `G03` format/security review
- Verdict: Pass

## Scope and result

The accepted 530-line ADR closes the physical decisions assigned to `P03-001` without pretending
that a codec, frozen header, type-tag registry, compression profile, or golden HDoc fixture already
exists. It binds the first HDoc v1 writers and subordinate format work to these rules:

| Concern | Accepted baseline |
| --- | --- |
| Endianness | Little-endian envelope/table/numeric bytes; canonical opaque UUID/ObjectId/binary/decimal bytes are not host-struct layouts |
| Alignment | Any document base; 8-byte top-level sections; natural payload alignment capped at 8; minimal zero padding |
| Offsets | Absolute little-endian `u32` byte offsets from envelope byte zero, with wider checked host arithmetic and no sentinel offsets |
| Limits | Complete uncompressed canonical HDoc at most 16,777,216 bytes plus every accepted `limits-v1` bound |
| Canonicalization | One byte representation per selected version/profile/dictionary version and ordered typed document; exact type/name/array/presentation preservation |
| Checksum | CRC-32C Castagnoli with the RFC/iSCSI parameter set over stored bytes while treating the checksum field as zero |
| Content hash | Unkeyed, domain-separated BLAKE3-256 over canonical typed logical content, independent of object presentation and allowed physical profiles |
| Compression | Mandatory uncompressed base; optional explicit deterministic bounded profiles selected by `P03-007`; no codec preselected here |
| Evolution | Explicit major/minor plus required/optional features and ordered length-delimited extensions; unknown semantics fail closed |
| Failure | No value/view exposure before full validation; stable capability/corruption error families; authoritative corrupt rows are never skipped or silently repaired |

Stored-byte integrity and typed content identity deliberately remain different mechanisms. CRC32C
is not an authentication claim, and the unkeyed BLAKE3 content hash is not a MAC. Authenticated
storage, transport, backup, or encryption metadata remains later versioned security work.

## Source change and traceability

The exact source commit changes seven paths:

- adds [ADR 0012](../../../docs/adr/0012-use-bounded-little-endian-hdoc-v1.md);
- indexes the accepted ADR and links it from the decision-owner register;
- refines the HDoc field sketch in [Specifications.md](../../../Specifications.md) from ambiguous
  `u32/u64` value addressing to the selected `u32` model and links the physical baseline;
- updates [Study.md](../../../Study.md) after the Phase 1 semantic freeze;
- regenerates the hash-bound semantic compatibility matrix and its rendered document; and
- changes no source code, dependency, lockfile, toolchain, package, public API, or persistent byte
  fixture.

The compatibility matrix still contains 263 native rows, 16 MongoDB experimental cases, 56
explicit MongoDB exclusions, and 33 explicit Redis exclusions with zero failure or skip. Only the
normative `Specifications.md` byte identity changes.

## Focused validation

The source validation performed before this evidence was recorded:

- checked 24 required ADR coverage markers, exact heading uniqueness, four traceability backlinks,
  and removal of the old `u32/u64` ambiguity;
- independently implemented the reflected CRC32C loop and reproduced the standard
  `123456789 -> 0xE3069283` vector;
- proved the 16 MiB maximum is representable by the selected `u32` address space;
- checked terminal newlines, trailing whitespace, and local links in every changed artifact;
- regenerated the compatibility matrix using its committed generator, then passed its independent
  schema/integrity checker and seven existing matrix mutation canaries;
- passed `biome check --error-on-warnings .`; and
- passed the complete aggregate suite: nine Rust boundary tests, four accepted and three rejected
  semantic examples, 17 fixtures/313 oracle steps/382 oracle assertions, 263 compatibility rows,
  16 pinned MongoDB cases, deterministic Wasm/browser bundle validation, three declared browser
  tests, benchmark schema/baseline checks, and all reserved-suite claim boundaries.

The first aggregate attempt correctly failed because editing the normative specification made the
committed compatibility matrix stale. The repository generator refreshed its specification
SHA-256/byte identity and rendered row; the exact generator check and full aggregate replay then
passed. The guard was preserved rather than bypassed.

## Independent evidence verifier

[verify.mjs](verify.mjs) reads every source artifact from the exact immutable source commit rather
than trusting the current worktree. It verifies:

- the exact parent, source tree, seven changed paths/statuses, byte sizes, and SHA-256 identities;
- accepted ADR metadata, the exact ordered 29-heading structure, serious alternatives, every
  required physical decision, follow-up ownership, rollback boundary, security limitations, and
  primary-source references;
- exact specification/study/index/owner backlinks and the selected `u32` field sketch;
- compatibility-matrix binding to the changed specification and a clean isolated generator replay;
- all 162 Markdown files and 1,104 repository-local links at the source commit;
- an independent CRC32C implementation/check vector and `u32`/16 MiB arithmetic premise; and
- 16 isolated mutation canaries, each required to reach its intended rejection reason.

The canaries separately mutate byte order, offset width, size limit, zero padding, checksum vector,
hash algorithm/mode, object-presentation hash behavior, bounded compression, unknown-version
handling, ADR index linkage, decision-owner linkage, specification field width, matrix input hash,
source plan state, primary-source linkage, and source artifact identity. Mutations are in memory or
temporary extraction only; no workspace source is changed.

The verifier passed under exact Node.js 22.23.1 and 24.18.0.

## Commands

```bash
node compatibility/v1/generate-matrix.mjs --check
node compatibility/v1/check-matrix.mjs
corepack npm run policy:javascript
corepack npm run test:all
/home/alextis/.nvm/versions/node/v22.23.1/bin/node \
  evidence/phase-03/P03-001/verify.mjs \
  ae7bf86ec117d2d1d550a9cb6d1087b7f402402f
/home/alextis/.nvm/versions/node/v24.18.0/bin/node \
  evidence/phase-03/P03-001/verify.mjs \
  ae7bf86ec117d2d1d550a9cb6d1087b7f402402f
```

## Artifacts

| Source artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `Specifications.md` | 75,817 | `cc0489c6ffc111afcfe29c723b15a725de5eea116d937fe76c8a8b63d2706a30` |
| `Study.md` | 62,005 | `c31cbc0f249a3d4092d6a42e316979602c7b16581e01c1a5be377b13d753776b` |
| `compatibility/v1/matrix-v1.json` | 217,132 | `4409a66a5dda5f83cc372025dd0e27930829dc937652f41b2e16f32946429811` |
| `docs/adr/0012-use-bounded-little-endian-hdoc-v1.md` | 31,766 | `80fc895d22700f8f0ca718640f710f6dca0f4b558d51a90acb1b1da218d9e0e2` |
| `docs/adr/README.md` | 4,461 | `5bcb1c9824c1ced64f2131601440ef9d1891bac74658f0dc534d0286ce9dfca0` |
| `docs/compatibility/v1-semantic-compatibility-matrix.md` | 103,065 | `02c5be0de9da44286c5cfea1833d4a0a13059cc82b9c97b4d06bc5b619b4bb97` |
| `docs/governance/decision-owners.md` | 6,059 | `6d0672d57359dc68f10c61ac7ebae1ea3b98c7defcf161e6396da41f8bda67bb` |

Machine-readable source identities, command results, counts, environment, and verifier identity are
in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No final focused, policy, matrix, aggregate-suite, or evidence-verifier check failed or skipped.
- The deliberate first stale-matrix failure is described above and was resolved by deterministic
  artifact regeneration.
- This task selects the physical baseline but does not claim an HDoc encoder, decoder, byte fixture,
  field tag, header/footer, compression codec, path dictionary, migration, benchmark, or fuzz
  result. Those claims remain explicitly open in `P03-002`–`P03-021`.
- The BLAKE3 domain/framing and exact checksum/hash field positions remain `P03-006`; compression
  algorithm/settings remain `P03-007`.
- The ADR's required reviewers are recorded roles. Independent format/security acceptance remains
  a `G03` prerequisite rather than being inferred from this implementation-agent verdict.
- External standards links are primary-source provenance, not vendored standards snapshots; exact
  algorithm behavior must be frozen by committed golden vectors before `G03`.

## Reproduction

Check out `ae7bf86ec117d2d1d550a9cb6d1087b7f402402f`, run the focused/generator/policy/aggregate commands
above, and then run the committed verifier from this evidence commit with the full source SHA. The
verifier itself extracts the matrix inputs from the source commit and does not require network
access.

# P03-008 Evidence — Safe Deterministic HDoc Encoder

- Task: `P03-008`
- Verdict: **PASS**
- Dependency/security commit: `6d4ea39f603c93467874371f995fefa71b5a585a`
- Encoder source commit: `807e3556a02fe8d5073f65fb60d8c6c86c30e71b`
- Source base: `e2c4ca4a8a3ebe185dd27c67eff40fb65b88b4b7`
- Final source tree: `877494864e6a6e265afaa7643c316414395aba9d`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-001`, `DATA-002`, `INV-001`, `INV-007`, `SEC-002`
- Governing gate: `G03`
- Recorded: 2026-07-11 UTC

## Outcome

P03-008 implements the first production database behavior in the workspace: safe deterministic
HDoc 1.0 encoding. The writer validates the complete borrowed logical tree before publication,
stages output privately, enforces every portable `limits-v1` boundary, emits canonical record and
container tables, computes the profile-1 BLAKE3 typed-content identity, optionally applies the
exact bounded LZ4 profile, and writes whole-envelope CRC-32C.

The public encoder surface is deliberately narrower than the later document model:

- `EncodeDocument`, `EncodeField`, and `EncodeObject` are transient borrowed writer inputs;
- `EncodeValue` covers all 16 stored HDoc v1 logical tags;
- `Decimal128` accepts canonical logical finite/special values and preserves signed zero;
- `EncodeOptions` selects canonical compression evaluation or the mandatory uncompressed profile;
- `EncodedHDoc` exposes exact bytes, canonical length, compressed-section count, and typed hash;
- `EncodeError` reports stable redacted error families and named portable limits.

It does not claim a validating decoder, owned/borrowed decoded views, field lookup, rendering,
storage, query execution, or public format support. Those boundaries remain P03-009 onward, and
immutable supported HDoc fixtures remain P03-016.

## Source and dependency commits

The task intentionally has two source commits:

1. `6d4ea39` adopts the exact three direct Rust dependencies, 13-package external graph, 26-file
   Rust license authority, pinned cargo-audit toolchain, fail-closed advisory checks, and explicit
   CI fetch/offline boundaries.
2. `807e355` implements and documents the encoder, activates product coverage, regenerates
   specification-derived compatibility artifacts, and updates bootstrap/maturity claims.

[manifest.json](manifest.json) binds the exact 50-artifact combined diff from the P03-007 closeout
through the encoder source commit. Every final byte count and SHA-256 is checked from Git objects,
not from mutable worktree copies.

## Canonical encoding behavior

The implementation proves these persistent-format properties:

- object fields retain presentation indices while table/hash traversal uses exact UTF-8 byte order;
- sibling duplicates, invalid names, protected root metadata, and missing/invalid `_id` fail before
  output publication;
- container IDs and descriptor spans are breadth-first and references use canonical-logical absolute
  coordinates;
- scalar payload lengths and alignments exactly match the P03-004 registry;
- objects hash exact canonical names plus child digests; arrays hash explicit dense indices;
- CRC covers exact stored bytes with a zeroed checksum slot, while the typed hash ignores physical
  presentation/compression details;
- LZ4 uses independent 32 KiB blocks, raw fallback, section-level strict shrinking, and whole-HDoc
  strict shrinking; and
- default output is byte-for-byte deterministic, while explicit `Disabled` always emits the
  mandatory base profile.

The two 408-byte root-presentation envelopes match their full normative hex. They have different
CRC-covered bytes but the same typed content hash. The nested object/array field, name, value, and
container sections also match their full registry bytes. The 4,096-byte repeated-string document
matches the exact 448-byte compressed HDoc and its 4,472-byte canonical form.

## Type, payload, hash, and compression replay

Ten `helix-doc` tests, within an 18-test workspace inventory, cover:

| Registry or path | Replayed inventory |
| --- | ---: |
| Public HDoc tags through the complete encoder | 16 |
| Canonical noncontainer payload vectors | 41 |
| Payload rejection classes | 17 |
| Typed-node hash vectors | 23 |
| Structural record examples | 4 |
| LZ4 block vectors | 7 |
| Complete section streams | 5 |
| Compressed/uncompressed complete reference HDocs | 4 |
| Compression negative classes retained for the reader | 18 |

The public all-types test passes every tag through validation, layout, reference tables, payload
writing, hashing, envelope construction, and CRC. Decimal tests include signed zero, finite bounds,
high-exponent clamping, specials, invalid tuples, and trailing-zero cohort canonicalization.

## Portable limit and failure proof

The encoder tests exact acceptance and rejection around:

- 16,777,216 canonical bytes (accepted exactly; the next byte produces 16,777,224 after alignment);
- depth 100 accepted and depth 101 rejected without recursion in production validation;
- 10,000 object fields and 100,000 total fields;
- 1,024 field-name UTF-8 bytes, 256 Unicode scalars, and field-name grammar;
- 1,000,000 array elements;
- 4,096 finite f32/f16 vector elements;
- 1,024-byte string/binary primary IDs; and
- the full timestamp/date/decimal domains.

Defensive internal tests exercise corrupted staging relationships, missing child digests, mismatched
value lengths, checked arithmetic, invalid post-validation payloads, and envelope-size disagreement.
Diagnostics contain stable codes/counts only; raw names and values are not placed in error text.

## Coverage and sanitizer proof

[rust-coverage-report.json](rust-coverage-report.json) is source-bound to `807e355` and records the
active `hdoc-encoder` / `database-functionality = true` state. For `helix-doc` it reports:

| Metric | Covered | Total | Result |
| --- | ---: | ---: | ---: |
| Functions | 83 | 83 | 100% |
| Lines | 969 | 969 | 100% |
| Regions | 1,967 | 2,068 | 95.11% |

The semantic-critical per-file gate therefore passes its unchanged 100% function/line and 95%
region thresholds. The report combiner deduplicates source-coordinate records emitted into multiple
Cargo test objects before combining execution counts.

The stable x86-64 Linux ASan profile runs all 18 workspace library tests. Its first replay exposed a
test-only `Box::leak` depth generator; that generator was replaced with stack-scoped borrowed
continuations, and the final replay completed with no leak or address-safety finding.

## Native and Wasm proof

The final source compiles and passes strict Clippy under:

- native x86-64 with all workspace targets/features;
- `wasm32-unknown-unknown` for the browser profile; and
- `wasm32-wasip2` for the component profile.

Both fixed Wasm build-profile commands pass with frozen/offline Cargo after the explicit locked
fetch boundary. Native tests replay every exact persistent byte vector. No unsafe block, native
codec, ambient I/O, dictionary, network callback, or host capability enters `helix-doc`.

## Dependency, license, and advisory proof

[dependency-inventory-report.json](dependency-inventory-report.json) records 8 workspace packages,
13 exact external Rust packages, 26 Rust license files, 91 locked npm development packages, 73 npm
license/notice files, and the single reviewed npm duplicate family.

[dependency-observation-report.json](dependency-observation-report.json) records:

- zero npm vulnerabilities;
- 52 verified npm registry signatures and 27 SLSA provenance attestations;
- cargo-audit `0.22.2` against RustSec database commit
  `e20296422feea6aab5cd36bf993c68d22e4aa24f`;
- 21 audited workspace graph packages and 374 audited scanner graph packages; and
- zero vulnerabilities, warnings, ignored findings, or scanner self-audit findings.

The live observation used network access once and is retained with exact response/report hashes.
The evidence verifier itself is network-free.

## Evidence verifier

[verify.mjs](verify.mjs) accepts only the full encoder source SHA. It independently checks:

- the two-commit source chain, final tree, combined diff scope, and all 50 source hashes;
- all three retained report byte counts and hashes;
- public API, limit, algorithm, dependency, maturity, and test markers from immutable Git objects;
- vector/structure/compression registry counts and complete-HDoc lengths/hashes;
- exact dependency versions/features/licenses and live npm/Rust finding counts;
- coverage source hashes, active product metadata, test inventory, and strict metrics; and
- 12 isolated mutations across dependency, advisory, coverage, source-limit, and codec identities.

It passed network-free under exact Node.js `22.23.1` and `24.18.0`.

## Commands

```bash
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features
cargo doc --frozen --workspace --no-deps --all-features
cargo clippy --frozen --target wasm32-unknown-unknown --package helix-doc --all-features -- -D warnings
cargo clippy --frozen --target wasm32-wasip2 --package helix-doc --all-features -- -D warnings
node tests/toolchain/run-build-profile.mjs wasm
node tests/toolchain/run-build-profile.mjs browser
node tests/toolchain/run-build-profile.mjs sanitizer
corepack npm run coverage:check
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run rust:audit:test
corepack npm run rust:dependencies:test
corepack npm run dependencies:check
corepack npm run dependencies:report
corepack npm run fixtures:check
node compatibility/v1/check-matrix.mjs
corepack npm run ci:check
corepack npm run bootstrap:check
corepack npm run test:commands
corepack npm test
/home/alextis/.nvm/versions/node/v22.23.1/bin/node evidence/phase-03/P03-008/verify.mjs 807e3556a02fe8d5073f65fb60d8c6c86c30e71b
/home/alextis/.nvm/versions/node/v24.18.0/bin/node evidence/phase-03/P03-008/verify.mjs 807e3556a02fe8d5073f65fb60d8c6c86c30e71b
```

# P03-016 Evidence — Immutable HDoc 1.0 Golden Vectors

- Task: `P03-016`
- Verdict: **PASS**
- Source commit: `221e90fa5be8c5f0aee4022e638cf21a5ae262f8`
- Source base: `a2b08a542575c7c4b091f19d288eab9b9a0e456e`
- Final source tree: `ea3a79869c979e733cedda272010884e06c0f691`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-001`, `DATA-002`, `DATA-003`, `INV-001`, `INV-007`, `SEC-002`
- Governing gate: `G03`
- Recorded: 2026-07-11 UTC

## Outcome

P03-016 crosses the persistent-format support boundary by freezing 24 complete HDoc 1.0 files in
[`fixtures/hdoc/v1`](../../../fixtures/hdoc/v1/README.md). Four canonical documents are accepted;
20 exact invalid artifacts retain stable public error/check outcomes. Every file is bound by exact
length and SHA-256 in a closed versioned manifest and schema.

The accepted corpus covers the base profile, canonical compression codec/profile 1/1, all 16 type
tags, every object/array nesting direction, empty containers, exact Unicode presentation, integer
and temporal extrema, float special bit patterns, decimal domain edges, binary octets, and finite
vector boundaries. The rejection corpus covers magic, exact major/minor versions, document and
required/optional features, truncation/trailing bytes, CRC, overlap, section versions, type tags,
footer/hash profile/content hash, compression codec and claimed expansion, nonzero padding, and a
persistent field-count limit.

## Immutability and reproduction

The Rust producer constructs every byte sequence from public `helix-doc` APIs and validates every
outcome. In write mode it creates only an absent path. Existing files are compared byte-for-byte;
drift fails with an instruction to add a new format version, and no code path overwrites a fixture.
The Node checker independently validates schema closure, exact inventory, hashes, positive header/
footer/length/feature/content-hash fields, coverage identities, and the Rust reproduction result.

The deterministic fixture registry now owns `hdoc.golden-v1`. Its aggregate report binds the
manifest alongside the semantic/oracle/compatibility authorities. The `golden-formats` retention
profile is active, collects 24 files plus schema/manifest into a 26-payload checked bundle, retains
the hosted copy for 90 days, and requires permanent promotion by format version. CI collects and
uploads that bundle on all Node 22 lane outcomes without converting upstream failures to success.

## Coverage and portability

[rust-coverage-report.json](rust-coverage-report.json) records 44 workspace tests and the active
`hdoc-golden-v1` maturity. The semantic-critical product group remains at 460/460 functions,
4,565/4,565 lines, and 8,854/9,246 regions (95.76%). The fixture producer/checker is additionally
compiled under strict all-target clippy and replayed by both exact Node lanes.

Native build/test/doc, JavaScript/dependency policy, deterministic generation, TypeScript, offline
dependency inventory, both Wasm profiles, semantic/differential conformance, browser builds, the
retained golden bundle, and benchmark integrity all pass.

## Source-bound verifier

[verify.mjs](verify.mjs) binds the exact source commit, parent, tree, 75-file binary diff hash,
all 24 immutable file identities/outcomes, 40 coverage identities, the no-overwrite producer guard,
closed schema, generation registry, active retention producer, hosted 90-day upload, specification/
study/maturity/CI authorities, retained coverage, and 20 isolated mutation canaries. It is
network-free and is replayed with exact Node.js 22.23.1 and 24.18.0.

## Commands

```bash
cargo fmt --all -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
env RUSTDOCFLAGS='-D warnings' cargo doc --frozen --workspace --no-deps --all-features
node fixtures/hdoc/v1/check.mjs --check
corepack npm run fixtures:check
corepack npm run artifacts:golden-formats
node tests/toolchain/check-retained-artifacts.mjs bundle golden-formats hdoc-v1
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run toolchain:types
corepack npm run dependencies:check
corepack npm run coverage:check
corepack npm run wasm:validate
corepack npm test
/home/alextis/.nvm/versions/node/v22.23.1/bin/node evidence/phase-03/P03-016/verify.mjs 221e90fa5be8c5f0aee4022e638cf21a5ae262f8
/home/alextis/.nvm/versions/node/v24.18.0/bin/node evidence/phase-03/P03-016/verify.mjs 221e90fa5be8c5f0aee4022e638cf21a5ae262f8
```

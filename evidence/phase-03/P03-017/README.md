# P03-017 Evidence — Rust/TypeScript HDoc Golden-Reader Parity

- Task: `P03-017`
- Verdict: **PASS**
- Source commit: `794f0a29d556c960a9b96d0a6f648b9242ec1e30`
- Source base: `b6849f918f09facf73ca40b3ff522398d528cc45`
- Final source tree: `e40c3fd1b9fb189a320d964abe0eadd90badf0b6`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-001`, `DATA-002`, `DATA-003`, `INV-001`, `INV-007`
- Governing gate: `G03`
- Recorded: 2026-07-11 UTC

## Outcome

P03-017 activates the stable integration suite with one five-case Vitest file. A deterministic Rust
oracle opens all four immutable positive HDoc 1.0 fixtures through the production validating
decoder and exports their complete canonical lossless logical values and typed hashes. A separate
TypeScript reader consumes the same bytes without importing Rust code or reading manifest answers.

The TypeScript implementation validates the stored envelope CRC-32C, parses canonical logical
coordinates, expands bounded compression codec/profile `1/1` with its own LZ4 block decoder,
reconstructs all 16 logical types and nested containers, and recomputes every recursive node with
an independent portable BLAKE3 implementation. All four complete logical values, stored/canonical
lengths, recursive field counts, and root hashes equal the production Rust output. The compressed
case expands a 1,224-byte stored envelope into its 131,456-byte canonical form.

## Command and CI activation

`npm run test:integration` is now active, owns zero Cargo integration targets plus the dedicated
cross-language Vitest file, and requires exactly four fixture comparisons/five tests. The common
runner still uses fixed argument arrays and frozen/offline Cargo. Root TypeScript builds include the
reader/test project, and JavaScript policy covers the new TypeScript source.

CI history, maturity metadata, specifications, study, ADR, format registries, workspace boundary,
coverage policy, and generated compatibility input hashes now bind `P03-017` /
`hdoc-cross-language-v1`. The root `npm test` run passes all eight stable suites with integration
active and the fuzz/crash/distributed suites still honestly reserved.

## Source-bound verifier

[verify.mjs](verify.mjs) binds the exact source commit, parent, tree, 34-file binary diff hash,
reader/oracle independence markers, exact four-vector inventory, active suite counts, CI and
coverage maturity, specification/study claims, a live integration replay, and ten isolated
mutation canaries. It is network-free and is replayed on both exact Node lanes.

## Commands

```bash
cargo fmt --all -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
corepack npm run toolchain:types
corepack npm run policy:javascript
corepack npm run test:integration
corepack npm run test:commands
corepack npm run ci:check
corepack npm run bootstrap:check
corepack npm run coverage:policy
corepack npm test
/home/alextis/.nvm/versions/node/v22.23.1/bin/node evidence/phase-03/P03-017/verify.mjs 794f0a29d556c960a9b96d0a6f648b9242ec1e30
/home/alextis/.nvm/versions/node/v24.18.0/bin/node evidence/phase-03/P03-017/verify.mjs 794f0a29d556c960a9b96d0a6f648b9242ec1e30
```

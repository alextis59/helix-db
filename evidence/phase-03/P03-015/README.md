# P03-015 Evidence — Closed-World HDoc Negotiation and Migration Assessment

- Task: `P03-015`
- Verdict: **PASS**
- Source commit: `5f5d11f72f2e93f30e0fa98ae9750896f2d326ae`
- Source base: `d07352b468ba99a46bd60f71e77ce86821e8047d`
- Final source tree: `2eb682c6d41a3fd4e087c34ea7eae45ec4a1bf0e`
- Accepted ADR: `0012`
- Requirements: `DATA-003`, `INV-001`, `INV-007`, `SEC-002`
- Governing gate: `G03`
- Recorded: 2026-07-11 UTC

## Outcome

P03-015 implements an explicit, closed-world HDoc capability surface. The only readable and
writable byte format is exact HDoc 1.0. Base uncompressed documents and bounded section compression
codec/profile 1/1 are supported. Dictionary-reference, semantic-extension, and nonsemantic-
extension identities are visible but unsupported, and every unknown bit, flag, profile, or version
continues to fail closed.

`negotiate_hdoc` runs the complete validating decoder before exposing version, feature masks,
storage profile, or typed content hash. It is not a header-only parser and cannot return a profile
for corrupt or partially validated bytes. The decoder's accepted masks now come from the same
capability authority exposed by `HDocCapabilities`.

## Migration and compatibility boundary

`assess_hdoc_migration` accepts only fully valid exact HDoc 1.0 targeting exact HDoc 1.0 and returns
`NoMigrationRequired`. The assessment always reports no rewrite. Unsupported trusted targets are
rejected before untrusted source parsing; invalid sources retain the decoder's stable, redacted
error chain. No current/previous promise, same-major minor window, mixed-version operation,
downgrade, automatic migration, byte rewrite, publication, or rollback boundary is advertised.

The machine-readable [compatibility matrix](../../../docs/formats/hdoc-v1-compatibility.json) and
its [explanation](../../../docs/formats/hdoc-v1-compatibility.md) bind this precise claim. The HDoc
envelope registry points to the matrix and keeps codec implementation ownership separate from
negotiation ownership. Standalone collection dictionaries remain separate, self-contained HDoc
references remain unsupported, and future enablement requires an exact grammar and new evidence.

## Test and coverage proof

Four focused tests cover exact masks, supported and rejected feature identities, fully validated
base/compressed profiles, version/feature/corruption rejection, exact-current no-op assessment,
unsupported targets, source-error chaining, and the no-rewrite claim. The full workspace has 44
Rust tests.

[rust-coverage-report.json](rust-coverage-report.json) records the new negotiation source at 100%
for all measured product metrics:

| Metric | Covered | Total | Result |
| --- | ---: | ---: | ---: |
| Functions | 25 | 25 | 100% |
| Lines | 106 | 106 | 100% |
| Regions | 136 | 136 | 100% |

The complete semantic-critical group proves 460/460 functions, 4,565/4,565 lines, and
8,854/9,246 regions (95.76%). Native strict build/test/doc, both Wasm profiles, full npm suites,
fixture/matrix/differential replay, bootstrap/CI authorities on both Node lines, dependency policy,
and coverage gates pass.

## Source-bound verifier

[verify.mjs](verify.mjs) binds the exact source commit, parent, tree, 38-file binary diff hash,
retained coverage report, public API, exact compatibility masks/versions, no-rewrite migration
boundary, envelope registry, specification/study/maturity/test/CI authorities, source/report hashes,
and 20 isolated mutation canaries. It is network-free and is replayed with exact Node.js 22.23.1
and 24.18.0.

## Commands

```bash
cargo fmt --all -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
env RUSTDOCFLAGS='-D warnings' cargo doc --frozen --workspace --no-deps --all-features
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run fixtures:check
corepack npm run toolchain:types
corepack npm run dependencies:check
corepack npm run coverage:check
corepack npm run wasm:validate
corepack npm test
/home/alextis/.nvm/versions/node/v22.23.1/bin/node evidence/phase-03/P03-015/verify.mjs 5f5d11f72f2e93f30e0fa98ae9750896f2d326ae
/home/alextis/.nvm/versions/node/v24.18.0/bin/node evidence/phase-03/P03-015/verify.mjs 5f5d11f72f2e93f30e0fa98ae9750896f2d326ae
```

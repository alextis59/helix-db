# P03-018 Evidence — Deterministic HDoc Properties and Mutations

- Task: `P03-018`
- Verdict: **PASS**
- Source commit: `e690e94072dc39f92511945bd05f8735ef93fded`
- Source base: `666016488bf50e7d883788c94b403079cb1f5c97`
- Final source tree: `b37ca1ba149ec95976f5e097cadb1924baecdc79`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-001`, `DATA-002`, `DATA-003`, `INV-001`, `INV-007`, `SEC-002`
- Governing gate: `G03`
- Recorded: 2026-07-12 UTC

## Outcome

P03-018 adds five deterministic Rust property/mutation tests and raises the exact workspace unit
inventory from 44 to 49. A pinned SplitMix64 generator drives 512 documents containing dynamic
names and values, nested objects/arrays, identifiers, decimal values, binary data, vectors, and
compressible strings. Base and canonical-compression encodings decode to equal owned trees,
lossless tagged JSON, and recursive typed hashes.

A second 512-case property renders, whitespace-wraps, strictly imports, and canonicalizes each
generated tagged document while preserving exact owned values. Another 256 cases permute root
presentation order, require distinct stored bytes but equal canonical hashes, and prove exact-name
lookup equality.

The malformed corpus rejects every proper prefix of all four immutable positive fixtures, a
trailing byte on each, and sampled stored-byte damage. The strongest mutation property flips every
bit outside the checksum slot in the 336-byte minimal fixture, repairs CRC-32C, and still requires
all 2,656 variants to fail through structural, canonical, payload, or typed-hash validation. This
demonstrates that the checksum is not being mistaken for the deeper validation boundary.

## Coverage and execution

The deterministic harness is an exact `cfg(test)`-only source module and has a specific reviewed
coverage path exclusion; no generic product exclusion was added. The retained report records 49
tests, 12 product source files, all 4,565 semantic-critical lines/functions covered, and every
workspace/semantic/recovery threshold group passing. Full native tests, strict clippy, warning-free
docs, TypeScript, JavaScript policy, deterministic fixtures on both Node versions, all stable test
suites, browser build/listing, and benchmark integrity pass.

## Source-bound verifier

[verify.mjs](verify.mjs) binds the exact source commit, parent, tree, 32-file binary diff hash,
five named properties, seed/permutation/prefix/bit-loop breadth, checksum repair, four immutable
fixture bindings, exact test inventory, CI/maturity/coverage contracts, the retained coverage
report, a live focused replay, and ten isolated mutation canaries.

## Commands

```bash
cargo fmt --all -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
cargo test --frozen -p helix-doc property_tests
env RUSTDOCFLAGS='-D warnings' cargo doc --frozen --workspace --no-deps --all-features
corepack npm run fixtures:check
corepack npm run policy:javascript
corepack npm run toolchain:types
corepack npm run coverage:check
corepack npm test
/home/alextis/.nvm/versions/node/v22.23.1/bin/node evidence/phase-03/P03-018/verify.mjs e690e94072dc39f92511945bd05f8735ef93fded
/home/alextis/.nvm/versions/node/v24.18.0/bin/node evidence/phase-03/P03-018/verify.mjs e690e94072dc39f92511945bd05f8735ef93fded
```

# P04-003 Evidence — Host Capability ABI 2.0

- Task: `P04-003`
- Verdict: **PASS**
- Source commits: `bb4cbb48558dcc0df948d45518882e4af591a3b1`, corrected by
  `66d6e9a610a36fb2edcb7aed9a7171e1f5c84897`
- Correction base: `af07bb041e9faf303ea2af1964943e0367beed42`
- Final source tree: `89ba40bd3c883537450ad565c709446cb6655f09`
- Accepted ADR: `0013`
- Requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-003 preserves byte-identical `helix:core-abi@1.0.0` and introduces exact
`helix:core-abi@2.0.0` for nine required host capability interfaces: files, directories,
durability, locks, timers, randomness, scheduling, metrics, and secrets. Each interface owns one
nominal host resource and bounded policy types. The common descriptor enum adds locks while keeping
networking, object storage, and GPU reserved without concrete interfaces.

The current matrix accepts only ABI 2.0. Required imports are an incompatible world-shape change,
so the major version advances. It never rewrites 1.0 or infers compatibility from package SemVer.
Paths remain relative to granted namespaces, clocks and random purposes are explicit,
scheduling grants no threads, metrics exclude document contents, secrets cannot leak into
descriptors/errors/metrics/logs, and revocation fails closed.

## Claim boundary

The nine interfaces define no functions. P04-004 owns coarse operations, P04-005 owns resource
lifecycles, P04-008 owns deadline/partial-I/O/shutdown behavior, and P04-009 owns deterministic
value injection. The component remains unbound with empty WIT; no mock/native/browser host,
component execution, public protocol, or database behavior is claimed.

## Validation

Pinned `wasm-tools` 1.253.0 resolves 12 interfaces, 56 type entries, three existing control
functions, nine capability resources, 11 imports, and one export. Both WIT revisions are byte/hash
bound. Twenty-seven policy and resolution mutations reject.

Full local gates pass: strict format/Clippy, 49 Rust tests, warning-free docs, deterministic
fixtures, all aggregate suites, 640 HDoc fuzz executions, 4,565/4,565 product lines, both portable
artifacts, and six real Chromium/Firefox/WebKit executions.

## Commands

```bash
corepack npm run host:capabilities:check
corepack npm run host:capabilities:test
corepack npm run wasm:validate
cargo fmt --all -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
env RUSTDOCFLAGS='-D warnings' cargo doc --frozen --workspace --no-deps --all-features
corepack npm run fixtures:check
corepack npm test
corepack npm run coverage:check
corepack npm run browser:smoke
node evidence/phase-04/P04-003/verify.mjs 66d6e9a610a36fb2edcb7aed9a7171e1f5c84897
```

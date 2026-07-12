# P04-002 Evidence — Deterministic Core and Ambient Boundary

- Task: `P04-002`
- Verdict: **PASS**
- Source commit: `6cdad16f444c26930d86cadc3928418b44ecd2ce`
- Source base: `b6f9d3b80318a27526663304a366b618fd73e569`
- Final source tree: `adaed2709688b66b304109e38a6db0db1c1b4e84`
- Accepted ADR: `0013`
- Requirements: `CORE-001`, `CORE-002`, `INV-004`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-002 moves the portable composition constants into the physical
`crates/helix-core/src/deterministic.rs` boundary. The deterministic set is exactly `helix-doc`,
`helix-query`, `helix-storage`, `helix-columnar`, and `helix-core`; the core's only direct workspace
dependencies are the first four. Host, server, GPU, async-runtime, socket, randomness, WASI,
browser-binding, and device packages are denied by a closed policy and dependency-closure audit.

The source audit covers all 11 Rust files in the deterministic crates and rejects 14 ambient API
markers, unsafe blocks, and native extern boundaries. The real `wasm32-unknown-unknown` core module
has exactly zero imports, so it cannot acquire ambient authority through its current binary form.

## Claim boundary

This proves separation and active rejection gates, not a working database or capability host. The
WASIp2 component still exposes empty WIT. P04-003 owns concrete host interfaces and bindings;
P04-004 onward own coarse operations, lifecycle, failure, cancellation, and host implementations.

## Validation

Thirty policy/source mutation canaries reject. Full local gates pass: strict formatting and
Clippy, 49 Rust tests, warning-free documentation, deterministic fixtures, all aggregate suites,
640 bounded HDoc fuzz executions, 4,565/4,565 product lines, both portable artifact forms, and six
real Chromium/Firefox/WebKit executions.

## Commands

```bash
corepack npm run core:boundary:check
corepack npm run core:boundary:test
corepack npm run wasm:validate
cargo fmt --all -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
env RUSTDOCFLAGS='-D warnings' cargo doc --frozen --workspace --no-deps --all-features
corepack npm run fixtures:check
corepack npm test
corepack npm run coverage:check
corepack npm run browser:smoke
node evidence/phase-04/P04-002/verify.mjs 6cdad16f444c26930d86cadc3928418b44ecd2ce
```

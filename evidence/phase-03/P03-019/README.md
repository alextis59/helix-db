# P03-019 Evidence — Coverage-Guided HDoc Fuzzing

- Task: `P03-019`
- Verdict: **PASS**
- Source commit: `4fb9ec464ad5a716645e217d9b27e9f8ab618833`
- Source base: `69ce9e36a8317514b49da8a0dedcccc400b1f7f5`
- Final source tree: `a5b95aa5fccbcacd06d540022d5a03ad2b7b43ba`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-001`, `DATA-002`, `DATA-003`, `INV-001`, `INV-007`, `SEC-002`
- Governing gate: `G03`
- Recorded: 2026-07-12 UTC

## Outcome

P03-019 activates five real libFuzzer entry points for HDoc decode, encode/decode invariants, raw
path lookup, tagged JSON render/import, and migration assessment. The separate locked fuzz workspace
pins `cargo-fuzz 0.13.2`, `libfuzzer-sys 0.4.13`, and `nightly-2026-06-30` (rustc commit
`096694416a41840709140eb0fd0ca193d1a3e6ba`).

The bounded smoke executes 128 coverage-guided units per target from 57 assembled seeds. Decoder
and migration corpora reuse all 24 immutable positive HDoc vectors; committed entry-point seeds
cover empty/Unicode values, exact and malformed paths, tagged JSON, and version negotiation. Each
run is bounded to 1 MiB inputs, 10 seconds per unit, 2 GiB RSS, and a fixed seed. Crashes,
sanitizer findings, timeouts, missing coverage/final-stat markers, tool drift, or missing corpora
fail closed.

The same five-target smoke is active in the root aggregate and both hosted Node lanes after an
explicit exact-tool installation boundary. A real-browser replay adds the 24 immutable HDoc inputs
to Chromium, Firefox, and WebKit, where a bounded envelope probe validates magic, version, lengths,
CRC-32C, and directory bounds without trusting malformed inputs.

## Retained execution

[`fuzz-report.json`](fuzz-report.json) records five targets, 640 executions, 57 source seeds, positive
coverage/feature edge discovery for every target, bounded peak RSS, and a pass verdict. Local gates
also passed 49 Rust tests, six real-browser executions, the complete aggregate suite, strict clippy,
warning-free documentation, deterministic fixtures, TypeScript/JavaScript policy, and 4,565/4,565
instrumented product lines.

## Source-bound verifier

[`verify.mjs`](verify.mjs) binds the exact source commit, parent, tree, 61-file binary diff hash,
five target sources, exact toolchain/bounds/corpora/suite/CI/browser contracts, the retained report,
a live 640-execution fuzz replay, and the 12 authority mutation canaries.

## Commands

```bash
cargo fmt --all -- --check
cargo fmt --manifest-path fuzz/Cargo.toml -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
env RUSTDOCFLAGS='-D warnings' cargo doc --frozen --workspace --no-deps --all-features
corepack npm run fixtures:check
corepack npm run fuzz:policy
corepack npm run fuzz:test
corepack npm run test:fuzz
corepack npm run browser:smoke
corepack npm test
corepack npm run coverage:check
node evidence/phase-03/P03-019/verify.mjs 4fb9ec464ad5a716645e217d9b27e9f8ab618833
```

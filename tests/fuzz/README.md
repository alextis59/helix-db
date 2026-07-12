# Fuzz Tests

Version-pinned coverage-guided targets, seed corpora, bounded smoke invocations, and retained crash
reproducers. The stable `npm run test:fuzz` command is active under `P03-019` with five real
libFuzzer targets: HDoc decode, encode/decode invariant, path lookup, tagged rendering/import, and
migration assessment. The exact `cargo-fuzz 0.13.2`, `libfuzzer-sys 0.4.13`, and
`nightly-2026-06-30` identities are machine-bound in `toolchain.json`.

Each bounded smoke copies committed seeds and all 24 immutable HDoc fixtures into ignored working
corpora, executes 128 coverage-guided units per target (640 total), requires libFuzzer coverage and
final-stat markers, writes crash artifacts only below ignored `target/fuzz-artifacts`, and fails on
any crash, timeout, tool drift, missing seed, or nonzero process result. This remains distinct from
the deterministic P03-018 property suite.

Explicit setup and replay:

```bash
rustup toolchain install nightly-2026-06-30 --profile minimal
cargo install cargo-fuzz --locked --version 0.13.2
CARGO_NET_OFFLINE=false cargo +nightly-2026-06-30 fetch --locked --manifest-path fuzz/Cargo.toml
npm run fuzz:policy
npm run fuzz:test
npm run test:fuzz
```

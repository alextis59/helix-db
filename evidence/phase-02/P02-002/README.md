# P02-002 Rust Toolchain and Wasm Target Evidence

- Task: `P02-002` — select and pin the Rust toolchain, minimum supported version, Wasm targets, formatter, linter, and documentation tools
- Requirements: `PLAT-001`, `PLAT-002`, `PLAT-003`, `INV-004`, `INV-007`, `CORE-001`
- Accepted decision: [ADR 0001](../../../docs/adr/0001-public-product-identity.md)
- Commit under test: `02dad4b8f80f19b436420843e7f8e66dd70d5882`
- Recorded at: `2026-07-10T23:13:52Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Verdict: Pass

## Selection

The repository and MSRV are pinned to Rust 1.96.1. Rustup uses the minimal profile and adds version-matched Clippy, rustfmt, local Rust documentation, and standard-library source. All eight workspace packages inherit `rust-version = "1.96.1"`.

Two Tier-2 Wasm targets are installed by the repository toolchain file:

- `wasm32-unknown-unknown` for the browser/JavaScript-host compilation boundary; and
- `wasm32-wasip2` for current Component Model compilation and later G02 validation tooling.

`wasm32-wasip3` is selected as the server/edge destination required by the WASI 0.3+ product direction, but it is not presented as supported. The pinned compiler knows the target specification, while the Rust 1.96.1 rustup channel does not distribute a standard-library target component for it. The accepted [Rust toolchain policy](../../../docs/architecture/rust-toolchain-policy.md) therefore keeps it out of normal bootstrap and prevents `G04` from freezing the production host ABI until a reproducible WASIp3 toolchain and conformance proof exist.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
rustc: 1.96.1 (31fca3adb 2026-06-26)
cargo: 1.96.1 (356927216 2026-06-26)
rustfmt: 1.9.0-stable (31fca3adb2 2026-06-26)
clippy: 0.1.96 (31fca3adb2 2026-06-26)
rustdoc: 1.96.1 (31fca3adb 2026-06-26)
rustup: 1.29.0 (28d1352db 2026-03-05)
```

The first repository invocation caused rustup to fetch the exact versioned toolchain plus six requested component/target additions. All immutable Cargo replays then ran with `CARGO_NET_OFFLINE=true`.

## Commands

```bash
git diff --check 02dad4b8f80f19b436420843e7f8e66dd70d5882^ 02dad4b8f80f19b436420843e7f8e66dd70d5882
rustup show active-toolchain
rustup component list --installed --toolchain 1.96.1
rustup target list --installed --toolchain 1.96.1
rustc --version
cargo --version
rustfmt --version
cargo clippy --version
rustdoc --version
rustup doc --path
cargo metadata --frozen --format-version 1 --no-deps
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo test --frozen --workspace --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS='-D warnings' cargo doc --frozen --workspace --no-deps --all-features
cargo check --frozen --target wasm32-unknown-unknown -p helix-core
cargo check --frozen --target wasm32-wasip2 -p helix-core
node evidence/phase-02/P02-002/verify.mjs 02dad4b8f80f19b436420843e7f8e66dd70d5882
```

## Results

- Exact artifact commit scope: 16 files; no unrelated change.
- Toolchain/MSRV: exact 1.96.1 in rustup, workspace metadata, and all eight package manifests.
- Rustup profile: minimal compiler/Cargo baseline plus `clippy`, `rust-docs`, `rust-src`, and `rustfmt`.
- Tool identities: rustc/Cargo/rustdoc 1.96.1, rustfmt 1.9.0-stable, Clippy 0.1.96.
- Native workspace: formatting, all-target/all-feature check, nine tests, Clippy with warnings denied, and rustdoc with warnings denied all pass.
- Browser compilation boundary: portable `helix-core` closure passes `wasm32-unknown-unknown` check.
- Component compilation boundary: portable `helix-core` closure passes `wasm32-wasip2` check.
- WASIp3 claim boundary: compiler specification present; rustup component absent; normal bootstrap excludes it; support claim false.
- Local `rust-docs`: installed path exists.
- Cargo lock: frozen and unchanged.
- Documentation at source commit: 91 Markdown files and 718 resolving local links.
- Failures/skips: zero for the declared P02-002 checks.

## Review and limitations

Focused review checked exact-versus-floating toolchain behavior, MSRV drift, formatter/linter version coupling, component availability, offline Cargo replay, native/Wasm compilation, legacy WASIp1 exclusion, WASIp2/WASIp3 claim separation, official-source links, and later gate ownership. No blocking P02-002 finding remains.

This evidence does not prove:

- browser execution or bundle loading (`P02-003`, `P02-010`, `P02-016`);
- Component Model binary validation/runtime execution (`P02-010`);
- WASIp3 compilation or WASI 0.3 server/edge support (`P04-*`, `P11-020`, and `G04`);
- multi-OS/multi-architecture CI availability (`P02-009`);
- sanitizer, coverage, benchmark, dependency, license, or provenance tooling; or
- the strict project lint/unsafe policy owned by `P02-006`.

Machine-readable commands, counts, artifact identities, and verifier identity are in [manifest.json](manifest.json).

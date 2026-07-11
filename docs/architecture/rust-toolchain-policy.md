# Rust Toolchain, MSRV, Components, and Wasm Targets

- Status: Accepted toolchain baseline
- Last updated: 2026-07-10
- Owner: Runtime architecture owner
- Plan item: `P02-002`
- Governing requirements: `PLAT-001`, `PLAT-002`, `PLAT-003`, `INV-004`, `INV-007`, `CORE-001`
- Governing gate: `G02`; WASIp3 production promotion remains required before `G04`
- Workspace boundary: [Rust workspace and initial crate boundaries](workspace-boundaries.md)

This policy selects an exact Rust compiler/tool set, one minimum supported Rust version (MSRV), reproducible formatter/linter/documentation components, and the initial WebAssembly target matrix. It does not claim that a Wasm component, browser bundle, host runtime, or database exists.

## Stable toolchain and MSRV

The repository pins **Rust 1.96.1** in [`rust-toolchain.toml`](../../rust-toolchain.toml). Every workspace crate inherits `rust-version = "1.96.1"`; therefore the MSRV and development/CI toolchain are the same exact patch release.

Rust 1.96.1 is selected instead of a floating `stable` channel or 1.96.0 because the [official point-release announcement](https://blog.rust-lang.org/2026/06/30/Rust-1.96.1/) records a compiler miscompilation fix, Cargo HTTP fixes, and bundled-libssh2 security fixes. A floating channel could silently change emitted Wasm features, lints, formatting, Cargo resolution, or documentation between evidence runs.

The single-version policy is deliberate during bootstrap:

- there is no untested MSRV-to-current gap;
- edition 2024 and every selected component/target are exercised by the same release;
- `Cargo.lock` version and package metadata are reproduced by the pinned Cargo; and
- a toolchain upgrade is a reviewed repository change, not an ambient developer update.

The project may adopt a lower long-lived MSRV only after real dependency/API needs exist and CI proves both the MSRV and current pinned release. Until then, compiling with an older toolchain is unsupported rather than “best effort.”

## Rustup profile and components

The toolchain file uses rustup's `minimal` profile, which supplies `rustc`, the host standard library, and Cargo. It then adds exactly:

| Component | Purpose | Required command |
| --- | --- | --- |
| `rustfmt` | Version-matched source formatting | `cargo fmt --all -- --check` |
| `clippy` | Version-matched Rust lint engine | `cargo clippy --workspace --all-targets --all-features` |
| `rust-docs` | Offline standard-library/tool documentation | `rustup doc --path` |
| `rust-src` | Version-matched standard-library source for tooling and future controlled `build-std` experiments | `rustup component list --installed` |

Rustdoc is shipped with `rustc`; repository documentation builds use `cargo doc` with `RUSTDOCFLAGS="-D warnings"`. The [rustup component documentation](https://rust-lang.github.io/rustup/concepts/components.html) defines these component roles, while the [profile documentation](https://rust-lang.github.io/rustup/concepts/profiles.html) confirms the minimal profile's small compiler/Cargo baseline.

`rust-analyzer`, Miri, LLVM coverage reporting tools, generic nightly sanitizer runtimes, dependency-policy tools, and external documentation generators are not P02-002 requirements. `P02-005` adds the stable Linux ASan standard-library target described below; later tasks select reporting and additional diagnostic tools only when their CI/test/coverage purpose and versioning policy are defined.

## Formatter baseline

[`rustfmt.toml`](../../rustfmt.toml) pins only stable options:

- edition and style edition 2024;
- Unix newlines, spaces, four-column indentation, and width 100; and
- deterministic import/module ordering with default small-item heuristics.

The toolchain pins the rustfmt binary version. Formatting is checked, never silently applied, in evidence/CI commands. Generated artifacts and vendored third-party sources will be explicitly excluded by their owning tasks rather than weakening the workspace default.

P02-002 selects Clippy as the linter. `P02-006` freezes the inherited warning/Clippy/no-unsafe baseline and dependency/license review in the [code quality and dependency policy](code-quality-and-dependency-policy.md).

## WebAssembly target matrix

| Target | Status in this repository | Intended use | P02-002 proof boundary |
| --- | --- | --- | --- |
| `wasm32-unknown-unknown` | Required, rustup-installed Tier 2 | Browser/JavaScript host core build | Compile the portable crate closure; no browser execution claim |
| `wasm32-wasip2` | Required, rustup-installed Tier 2 | Current component-model build/validation bridge | Compile the portable crate closure; no server/edge production claim |
| `wasm32-wasip3` | Selected server/edge destination, currently experimental/unavailable through pinned rustup | WASI 0.3 native-async component host required by the product direction | No passing build claim; promotion gate below |
| `wasm32-wasip1` and `wasm32-wasip1-threads` | Unsupported | Legacy preview-1 ABI / portable threading assumption | Must not appear in repository build defaults or support claims |

The Rust target documentation classifies [`wasm32-unknown-unknown`](https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-unknown-unknown.html) as Tier 2 and describes it as the minimal host-assumption target commonly used for web/JavaScript environments. The [`wasm32-wasip2` documentation](https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-wasip2.html) classifies it as Tier 2 and notes that it emits Component Model components for a WASIp2 runtime.

`wasm32-wasip3` is not listed in `rust-toolchain.toml` because Rust 1.96.1's rustup distribution has no `rust-std` target component for it. The current [Rust WASIp3 target documentation](https://doc.rust-lang.org/beta/rustc/platform-support/wasm32-wasip3.html) classifies it as Tier 3, describes early/transitionary imports, and requires building the target rather than installing a supported prebuilt standard library. Listing it in the toolchain file would make every normal bootstrap fail and would falsely imply stable support.

This does not replace the project's WASI 0.3+ direction with WASIp2. It separates a reproducible G02 component-tooling bridge from the future production host ABI.

## WASIp3 promotion gate

`P04-001` through `G04` cannot freeze or claim the server/edge host ABI until one of these occurs:

1. the pinned stable Rust release distributes `rust-std` for `wasm32-wasip3`, and the target passes component validation plus native-host conformance; or
2. an accepted toolchain/ABI ADR pins a reproducible custom/nightly target build, its source and wasi-sdk identities, component validator/runtime, limitations, upgrade policy, and complete conformance evidence.

The promotion review must update this policy, the toolchain file or explicit auxiliary toolchain manifest, CI target matrix, clean-machine bootstrap, and host-ABI evidence. `wasm32-wasip2` success cannot be relabeled as WASI 0.3 support.

## Portable crate closure

P02-002 compiles this deterministic closure for both required distributed targets:

```text
helix-doc
helix-query
helix-storage
helix-columnar
helix-core
```

`helix-host-native` and `helix-server` are native-only boundaries. `helix-gpu` will receive separate browser/native compilation and validation when its host bindings and feature profiles exist. A host crate compiling accidentally for bare Wasm would not prove a valid capability implementation.

## Native diagnostic target added by P02-005

The toolchain also installs `x86_64-unknown-linux-gnuasan` for the bounded Linux AddressSanitizer lane. The [official target documentation](https://doc.rust-lang.org/nightly/rustc/platform-support/x86_64-unknown-linux-gnuasan.html) classifies it as Tier 2, describes a fully ASan-instrumented standard library distributed through rustup, and states that produced binaries run on Linux without external requirements.

This target is diagnostic, not a supported deployment platform. It avoids an unpinned nightly and unstable `-Zbuild-std` path for the initial x86_64 Linux lane. Other hosts, architectures, ThreadSanitizer, MemorySanitizer, and mixed-language instrumentation require their own explicit CI capability entries under `P02-009`; absence of those lanes is never represented as a sanitizer pass.

The exact profile and invocation are defined in [Build Profiles](build-profiles.md). Updating or removing this target follows the same exact-toolchain and clean-replay rules as the Wasm targets.

## Required checks

```bash
rustc --version
cargo --version
rustfmt --version
cargo clippy --version
rustdoc --version
rustup show active-toolchain
rustup component list --installed
rustup target list --installed
cargo metadata --frozen --format-version 1 --no-deps
cargo fmt --all -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS="-D warnings" cargo doc --frozen --workspace --no-deps --all-features
cargo check --frozen --target wasm32-unknown-unknown -p helix-core
cargo check --frozen --target wasm32-wasip2 -p helix-core
```

The metadata check requires all eight packages to report `rust_version = 1.96.1`. The target checks prove compilation only; `P02-010` adds component/bundle validation and smoke artifacts.

## Upgrade procedure

A Rust upgrade is one focused reviewed change that:

1. selects an exact stable patch release and reads its compiler/Cargo/Clippy/rustfmt/security notes;
2. updates `rust-toolchain.toml` and every inherited workspace `rust-version` together;
3. verifies component and target availability on every supported host;
4. runs formatting in check mode before deciding whether a formatting migration is needed;
5. runs native default/all-feature checks, tests, Clippy, warning-free docs, and both required Wasm target checks;
6. records Cargo lock/metadata and emitted Wasm validation differences;
7. updates clean-machine/CI evidence and this target-status table; and
8. preserves the prior evidence commit rather than rewriting it.

Removing a component/target or raising the MSRV is a compatibility change for contributors and builders. It requires release notes once public build support exists.

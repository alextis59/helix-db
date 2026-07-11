# P02-009 Continuous Integration Matrix Evidence

- Task: `P02-009` — add CI for supported operating systems, architectures, Rust targets, Node versions, and browser engines
- Requirements supported: `PLAT-001`, `PLAT-002`, `PLAT-003`, `INV-003`, `INV-004`, `INV-007`, `CORE-001`, `CORE-003`, `QUAL-001`
- Commit under test: `21cbbea30f2fda6dd8c8f56fa43c9764b4396898`
- Recorded at: `2026-07-10T21:59:00Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Verdict: Pass

## Scope

This step establishes a machine-readable CI contract and two GitHub Actions workflows:

- 11 gating lanes cover Node 22/24, Linux/Windows/macOS native checks, two portable Rust targets, the Linux x64 AddressSanitizer profile, and separate Chromium/Firefox/WebKit inventories;
- two scheduled/manual native lanes extend architecture coverage to Linux arm64 and macOS x64;
- runner labels, Node versions, Rust targets, action versions, full action SHAs, and exclusions are centralized in `helix.ci-matrix/1`;
- every provisioned job rejects unexpected runner OS, architecture, process identity, or Node version before executing useful work; and
- workflow permissions, credentials, action pins, mutable aliases, timeouts, caching, and lifecycle-script behavior are bounded by an executable policy check.

The normative lane and trust policy is [continuous integration matrix and trust boundary](../../../docs/architecture/continuous-integration.md).

## Verified matrix

| Class | Verified result |
| --- | --- |
| Gating lanes | 11 across 5 matrix groups |
| Nightly lanes | Linux arm64 and macOS x64 |
| Native gating | Linux x64, Windows x64, macOS arm64 |
| Portable targets | `wasm32-unknown-unknown`, `wasm32-wasip2` |
| Sanitizer | `x86_64-unknown-linux-gnuasan` on Linux x64 |
| Node lines | 22.23.1 and 24.18.0 |
| Browser projects | Chromium, Firefox, WebKit; each inventory-only with 0 tests |
| Workflow structure | 8 jobs and 37 steps parsed independently with Python/PyYAML |
| Action trust | 16 uses of 2 approved actions, all full-SHA pinned |
| Explicit exclusions | Windows arm64 preview and branded browser claims |

The verifier replays all commands available on the evidence host. Both Node lines receive clean, lifecycle-suppressed installs followed by the matrix check, strict JavaScript and dependency policy, type checks, fixture checks, and aggregate tests. The Linux x64 host additionally runs native format/check/Clippy/test/docs, both portable-target Clippy builds, the stable ASan profile, and all three binary-free browser inventories.

## Negative verification

The clean-room verifier applies eight independent mutations and requires each one to fail:

1. replace a full action SHA with a mutable version tag;
2. replace a fixed runner label with `ubuntu-latest`;
3. drift the oldest exact Node version;
4. duplicate a lane ID;
5. promote a browser lane beyond its `P02-010` activation boundary;
6. grant workflow content-write permission;
7. report the wrong runtime architecture; and
8. add an unexpected Playwright test to an inventory-only browser project.

Every mutation is restored, and the temporary checkout must finish with no tracked or untracked source drift.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
rustc: 1.96.1 (31fca3adb 2026-06-26)
cargo: 1.96.1 (356927216 2026-06-26)
active Node.js: v22.19.0
Corepack: 0.34.0
npm through Corepack: 11.18.0
Python: 3.10.12
PyYAML: 6.0
JavaScript validation lanes: Node 22.23.1 and 24.18.0
Browser execution: binary-free inventory only
```

## Commands

```bash
corepack npm run ci:check
node tests/toolchain/emit-ci-matrix.mjs gating
node tests/toolchain/emit-ci-matrix.mjs nightly
corepack npm run ci:browser-inventory -- chromium
corepack npm run ci:browser-inventory -- firefox
corepack npm run ci:browser-inventory -- webkit
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run toolchain:types
corepack npm run fixtures:check
corepack npm test
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
RUSTDOCFLAGS="-D warnings" cargo doc --frozen --workspace --no-deps --all-features
cargo clippy --frozen --target wasm32-unknown-unknown --package helix-core -- -D warnings
cargo clippy --frozen --target wasm32-wasip2 --package helix-core -- -D warnings
node tests/toolchain/run-build-profile.mjs sanitizer
node evidence/phase-02/P02-009/verify.mjs 21cbbea30f2fda6dd8c8f56fa43c9764b4396898
```

## Retained diagnostic attempt

The first strict JavaScript policy run during source implementation exited 1 after the new CI contract itself passed. Biome identified ten issues in the checker: nine literal GitHub-expression placeholders plus one mutable binding/formatting issue. The checker now constructs literal expressions without template interpolation, captures negative-process results explicitly, and follows the existing formatting policy. No accepted lane, runner, target, action pin, or workflow permission changed during that correction.

During evidence assembly, the first ad-hoc requirement-count command assumed heading-form IDs and reported zero because the specification stores IDs in tables. The corrected table/ledger comparison found all 44 IDs. This did not change source or evidence claims.

## Limitations

The workflows are committed locally and have not run on GitHub-hosted runners because this branch has not been pushed. Local evidence validates exact workflow bytes, independent YAML structure, matrix emission, runtime checks, and every lane executable on Linux x64; it does not prove that GitHub provisioned Windows, macOS, or arm64 runners or that a hosted matrix passed.

Browser lanes install no browser binaries and launch no browser. They prove three separately selectable zero-test inventories only; `P02-010` owns real Wasm/component/bundle smoke execution. Artifact upload and retention remain `P02-015`. These results establish a foundation CI contract, not supported product platforms, release readiness, database semantics, security, performance, or `G02` closure.

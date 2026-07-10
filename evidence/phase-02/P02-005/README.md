# P02-005 Build Profile Evidence

- Task: `P02-005` — configure native debug, native release, Wasm, browser, sanitizer, coverage, and benchmark build profiles
- Requirements supported: `INV-003`, `INV-004`, `INV-007`, `PLAT-001`, `PLAT-002`, `PLAT-003`, `CORE-001`, `CORE-003`, `QUAL-001`
- Commit under test: `ba2507779facd9146993d20ca13a25bcf85be6e7`
- Recorded at: `2026-07-10T23:51:35Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Verdict: Pass

## Scope

This step establishes seven named build/instrumentation contracts and one supporting Cargo test profile. The profiles are specified in `Cargo.toml`, bounded by a no-passthrough runner, and explained in [Native, Wasm, Browser, Diagnostic, and Benchmark Build Profiles](../../../docs/architecture/build-profiles.md).

It also adds the stable rustup-distributed `x86_64-unknown-linux-gnuasan` standard-library target, a typed Vite production configuration with no input entry, an exact TypeScript configuration for build tooling, generated-profile ignore rules, and focused configuration checks.

## Profile proof

| Profile | Exact proof at source commit | Result |
| --- | --- | --- |
| Native debug | Frozen/offline workspace, all targets/features, Cargo `dev` | Pass |
| Native release | Frozen/offline workspace, all targets/features, Cargo `release` | Pass |
| Component Wasm | `helix-core` portable closure, `wasm32-wasip2`, Cargo `wasm` | Pass; compilation only |
| Browser Wasm | `helix-core` portable closure, `wasm32-unknown-unknown`, Cargo `browser` | Pass; compilation only |
| Browser JavaScript | Resolve exact Vite production config on Node 22.23.1 and 24.18.0 | Pass; zero bundle inputs/outputs |
| AddressSanitizer | Workspace library tests/all features on `x86_64-unknown-linux-gnuasan`, Cargo `sanitizer` | 9 tests pass; executable imports `__asan_init` |
| Coverage | Workspace library tests/all features, Cargo `coverage`, exact `-C instrument-coverage` | 9 tests pass; 8 non-empty raw profiles |
| Benchmark | Frozen/offline workspace, all targets/features, Cargo `bench` | Pass; build readiness only |

The exact profile-property map, target/toolchain entries, runner arguments, Vite values, package scripts, and immutable source files are independently checked by [verify.mjs](verify.mjs).

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
rustc: 1.96.1 (31fca3adb 2026-06-26)
cargo: 1.96.1 (356927216 2026-06-26)
active Node.js for Rust runner: v22.19.0
Corepack: 0.34.0
npm through Corepack: 11.18.0
JavaScript validation lanes: Node 22.23.1 and 24.18.0
Cargo network: offline/frozen
npm lifecycle scripts: suppressed
```

The verifier reconstructs the exact source commit in a temporary directory. It uses the pinned Rust toolchain/targets, the committed npm lock, both supported Node lanes, and only generated ignored output.

## Commands

```bash
git diff --check ba2507779facd9146993d20ca13a25bcf85be6e7^ ba2507779facd9146993d20ca13a25bcf85be6e7
corepack npm ci --ignore-scripts
corepack npm run toolchain:types
corepack npm run toolchain:browser-profile
node tests/toolchain/run-build-profile.mjs native-debug
node tests/toolchain/run-build-profile.mjs native-release
node tests/toolchain/run-build-profile.mjs wasm
node tests/toolchain/run-build-profile.mjs browser
node tests/toolchain/run-build-profile.mjs sanitizer
node tests/toolchain/run-build-profile.mjs coverage
node tests/toolchain/run-build-profile.mjs benchmark
node evidence/phase-02/P02-005/verify.mjs ba2507779facd9146993d20ca13a25bcf85be6e7
```

The JavaScript install/type/profile commands are repeated through NVM on Node 22.23.1 and 24.18.0. The verifier checks that neither clean install changes `package-lock.json`.

## Results

- Exact source-commit scope: 17 immutable-hashed files.
- Cargo configuration: exact `dev`, `test`, `release`, `wasm`, `browser`, `sanitizer`, `coverage`, and `bench` property maps.
- Required runner contracts: seven; arbitrary names and passthrough arguments rejected.
- Native profile builds: two of two pass.
- Wasm profile builds: two of two pass and produce target-specific Rust artifacts.
- ASan profile: nine existing unit tests pass; a produced executable contains `__asan_init` and the version check symbol.
- Coverage profile: nine existing unit tests pass and produce eight non-empty `.profraw` files with unique names.
- Benchmark profile: optimized build passes; Cargo's built-in `bench` profile reuses the release artifact directory; zero benchmark execution/performance claims.
- Vite profile: exact custom/relative/ES2022/external-assets/hidden-map/Oxc contract resolves on both Node lanes; zero input and zero `dist/` output.
- TypeScript: root and tool-config checks pass on both Node lanes.
- Repository documentation at source commit: 123 Markdown files and 782 resolving local links.
- Source tree: no generated target, dependency, bundle, coverage, sanitizer, benchmark, or browser-report artifacts tracked.

## Review and limitations

Focused review checked optimized-versus-debug overflow behavior, panic strategy, symbol/debug retention, LTO/codegen settings, deterministic target selection, portable-core scope, sanitizer standard-library instrumentation, raw coverage creation, ambient-flag rejection, npm lock stability, environment exposure, asset inlining, source-map posture, output isolation, false browser/WASI/performance claims, and generated-output handling. No blocking P02-005 finding remains.

This task does not provide a real Wasm component, JavaScript/Wasm binding, Vite input, browser bundle, browser execution, coverage report/threshold, benchmark workload/result, cross-host sanitizer matrix, or packaged release binary. Those remain owned by `P02-009`, `P02-010`, `P02-013`, `P02-014`, `P02-016`, and later implementation phases.

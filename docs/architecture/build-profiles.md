# Native, Wasm, Browser, Diagnostic, and Benchmark Build Profiles

- Status: Accepted and executable toolchain profiles; no database/browser release claim
- Last updated: 2026-07-11
- Owner: Runtime architecture owner
- Plan items: `P02-005`; coverage reporting completed by `P02-013`; benchmark reporting completed by `P02-014`
- Governing requirements: `INV-003`, `INV-004`, `INV-007`, `PLAT-001`, `PLAT-002`, `PLAT-003`, `CORE-001`, `CORE-003`, `QUAL-001`
- Governing gate: `G02`
- Rust toolchain: [Rust toolchain policy](rust-toolchain-policy.md)
- JavaScript toolchain: [JavaScript and TypeScript toolchain policy](javascript-toolchain-policy.md)

This policy fixes reproducible build/instrumentation profiles before feature code accumulates. It separates build intent, target, optimization, diagnostics, and artifact location. A passing profile proves only that the current boundary skeleton compiles or runs its existing tests in that mode.

The [Cargo profile reference](https://doc.rust-lang.org/cargo/reference/profiles.html) defines the built-in profiles, custom-profile inheritance, `--profile` selection, and per-profile target directories used here.

## Profile matrix

| Contract | Cargo/Vite selection | Target and scope | Required behavior | Explicit non-claim |
| --- | --- | --- | --- | --- |
| Native debug | Cargo `dev` | Host; workspace, all targets/features | No optimization, full debug info/assertions/overflow checks, unwind, incremental builds | Not sanitizer/recovery evidence |
| Native release | Cargo `release` | Host; workspace, all targets/features | Optimization 3, thin LTO, one codegen unit, line tables, overflow checks, unwind, no incremental build | Not a packaged/production binary |
| Component Wasm | Cargo `wasm` | `wasm32-wasip2`; portable `helix-core` closure | Size optimization, fat LTO, abort panic, stripped symbols; P02-010 validates the Component Model binary | Not WASIp3/server-edge support or a production ABI claim |
| Browser Wasm | Cargo `browser` | `wasm32-unknown-unknown`; portable `helix-core` closure | Size-first optimization, fat LTO, abort panic, stripped symbols; P02-010 validates/instantiates the core module | Not a JavaScript binding or database behavior claim |
| Browser JavaScript | Vite production config | Internal standards-based smoke fixture | Relative base, `custom` app, ES2022, assets kept external, hidden maps, Oxc minification, public-env allow-prefix | Not a user-facing example or browser support claim |
| AddressSanitizer | Cargo `sanitizer` | `x86_64-unknown-linux-gnuasan`; workspace libraries/all features | Optimization 1, full debug/assertions/overflow checks, one codegen unit, fully instrumented distributed standard library | Not portable to unlisted hosts; not Thread/MemorySanitizer |
| Coverage | Cargo `coverage` plus exact stable rustflag and compiler-matched LLVM reporting | Linux x64; workspace libraries/all features | No optimization, full debug/assertions/overflow checks, one codegen unit, `-C instrument-coverage`, unique raw profiles, explicit product/test classification, semantic/recovery thresholds | Coverage is reachability evidence, not semantic or recovery correctness proof |
| Benchmark | Cargo `bench` plus versioned result harness | Host; workspace/all targets/features, then Node host-memory calibration | Same optimization/LTO/codegen/overflow posture as native release, with line tables; strict workload/raw/summary schemas and integrity-only result | Calibration proves reporting plumbing, not database or release performance |

Release and benchmark builds retain line information and native symbols so later evidence can be symbolized. Packaging may split/strip symbols only while retaining a matching debug artifact and digest. Integer overflow checking remains enabled in optimized profiles to avoid silently changing observable failure behavior between debug and optimized builds.

## Bounded runner

[`tests/toolchain/run-build-profile.mjs`](../../tests/toolchain/run-build-profile.mjs) accepts exactly one of seven names and supplies fixed Cargo arguments:

```bash
node tests/toolchain/run-build-profile.mjs native-debug
node tests/toolchain/run-build-profile.mjs native-release
node tests/toolchain/run-build-profile.mjs wasm
node tests/toolchain/run-build-profile.mjs browser
node tests/toolchain/run-build-profile.mjs sanitizer
node tests/toolchain/run-build-profile.mjs coverage
node tests/toolchain/run-build-profile.mjs benchmark
```

All Cargo invocations are frozen and offline. The runner accepts no passthrough arguments, so evidence cannot silently weaken features, targets, or workspace scope.

The sanitizer lane deliberately supports only x86_64 Linux. Rust's [ASan target documentation](https://doc.rust-lang.org/nightly/rustc/platform-support/x86_64-unknown-linux-gnuasan.html) says this target ships an instrumented standard library through rustup and avoids nightly `build-std`. The more general [unstable sanitizer documentation](https://doc.rust-lang.org/beta/unstable-book/compiler-flags/sanitizer.html) remains relevant to future targets and explains why partial instrumentation can miss defects; no unpinned `+nightly` fallback is permitted.

The raw coverage runner rejects ambient `RUSTFLAGS`/`CARGO_ENCODED_RUSTFLAGS`, sets exactly `-C instrument-coverage`, gives every test process a `%p`/`%m` raw-profile path, and fails if no `.profraw` file appears. The [rustc coverage documentation](https://doc.rust-lang.org/beta/rustc/instrument-coverage.html) defines the stable compiler flag, raw profile behavior, unique filename patterns, and compiler-matched LLVM report flow.

`P02-013` adds the separate [product coverage policy](../quality/code-coverage-policy.md). Its bounded runner builds the same profile, executes every discovered library test object, merges profiles with the pinned toolchain's `llvm-profdata`, exports with its `llvm-cov`, excludes only explicitly delimited test code, and enforces workspace plus semantic/recovery-critical thresholds. Raw-profile success alone still cannot close a coverage requirement.

`P02-014` adds the separate [benchmark result contract](../quality/benchmark-results.md). `test:benchmark` still proves the optimized Cargo profile and zero current Cargo benchmark targets, then executes one bounded Node harness calibration. Its ignored raw/summary files carry full source, environment, dataset, observation, stage, correctness, and claim-boundary data. No timing value gates the run or supports a database claim.

## Browser configuration boundary

[`vite.config.ts`](../../vite.config.ts) contains only shared build policy:

- `appType: 'custom'` avoids inventing SPA routing or a UI framework;
- `base: './'` supports embedded/static relative deployment;
- `envPrefix: 'HELIX_PUBLIC_'` prevents broad exposure of ambient environment variables;
- `target: 'es2022'` matches the TypeScript baseline without asserting a browser-version matrix;
- `assetsInlineLimit: 0` keeps Wasm and other assets separately hashable/cacheable;
- hidden source maps retain diagnostic material without adding a source-map URL to emitted code;
- pinned Vite 8's Oxc minifier is selected explicitly; and
- output is isolated under ignored `dist/browser`, with no public-directory copy or compressed-size timing noise.

These options use Vite's official [shared configuration](https://vite.dev/config/shared-options.html), [build options](https://vite.dev/config/build-options.html), and [`resolveConfig` API](https://vite.dev/guide/api-javascript.html#resolveconfig). The committed checker resolves the production config and asserts every value without invoking a build. It also requires no bundle input:

```bash
corepack npm run toolchain:types
corepack npm run toolchain:browser-profile
```

`P02-010` adds the first honest internal input solely to validate the Rust/Wasm/Vite/Playwright toolchain. It is not listed under `examples/` and exposes no database API. The [smoke-validation contract](wasm-browser-smoke-validation.md) checks the exact Wasm and bundle outputs and launches all three engines. `P02-016` still owns the first user-facing minimal example.

## Artifact and reproducibility rules

- Cargo profile output stays under ignored `target/`; Vite output stays under ignored `dist/`; the deterministic coverage summary stays under ignored `dist/coverage/`; benchmark raw/summary output stays under ignored `dist/benchmarks/baseline/`.
- Coverage `.profraw`/`.profdata`, source maps, sanitizer logs, and benchmark output are generated artifacts and are not committed casually.
- Evidence promotes only compact manifests/reports or immutable external hashes according to the [evidence guide](../../evidence/README.md).
- Wasm and browser artifacts are never relabeled as components/bundles until the appropriate validator has run.
- Sanitizer absence/unsupported host is reported explicitly; it is not a skip counted as pass.
- Benchmark builds and results use the same optimized correctness posture, but only real workload evidence can support a performance claim.

## Change rule

A profile change records its correctness, debuggability, size/performance, platform, and artifact consequences; runs every affected profile; and updates CI/bootstrap/evidence together. Disabling overflow checks, debug symbols, sanitizer instrumentation, coverage instrumentation, or Wasm validation to obtain a green build is a review-blocking weakening, not maintenance.

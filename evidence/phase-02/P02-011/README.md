# P02-011 WGSL Parsing, Validation, and Compilation Evidence

- Task: `P02-011` — add WGSL parsing or validation and shader-fixture compilation to CI before GPU runtime work
- Requirements supported: `INV-006`, `INV-007`, `PLAT-001`, `QUAL-001`
- Commit under test: `9f05865334433bc19764b4803c8967ef910c308b`
- Recorded at: `2026-07-11T02:17:17Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Accepted ADRs: none
- Verdict: Pass

## Scope and result

The source commit adds a compile-only, fail-closed WGSL foundation without adding a Rust or npm
dependency:

- [`helix.wgsl-fixtures/1`](../../../shaders/fixtures/manifest.json) binds four repository-owned
  sources to exact paths, purposes, outcomes, diagnostics, and SHA-256 digests;
- the browser-free manifest checker accepts two valid and two deliberately invalid fixtures while
  rejecting path, inventory, encoding, size, symlink, field, and digest drift;
- pinned Playwright 1.61.1 Chromium 149.0.7827.55 obtains the exact Google SwiftShader adapter
  (`swiftshader`, device `0xc0de`, `SwiftShader Device (Subzero)`);
- Dawn reports no diagnostic and creates an asynchronous compute pipeline for the minimal and
  storage-layout fixtures;
- Dawn returns compilation errors, validation errors, and pipeline rejection for the malformed
  function and live duplicate-binding fixtures; and
- both Node CI lanes run the source-integrity check, while only the existing Chromium browser lane
  runs real compilation after its browser installation.

The accepted behavior and security boundary are defined by the
[WGSL fixture validation contract](../../../docs/architecture/wgsl-fixture-validation.md). The
runner accepts no external shader path, source text, URL, stdin, environment override, client
request, or plugin. The fixed loopback page is inert and the software adapter is exposed only to
small hash-bound repository fixtures.

## Fixture results

| Fixture | Expected | Compilation messages | Pipeline | Result |
| --- | --- | ---: | --- | --- |
| `valid-noop-compute` | Accept | 0 | Created | Pass |
| `valid-storage-binding-layout` | Accept | 0 | Created | Pass |
| `invalid-malformed-function` | Reject | 1 error | Rejected | Pass |
| `invalid-duplicate-resource-binding` | Reject | 1 error, 1 information note | Rejected | Pass |

The ignored `helix.wgsl-validation-report/1` output is 3,316 bytes with SHA-256
`5f1179f4106a45cfcbd0954342c73f4decde7543cc22a31cc86100c6782a7955`. It binds the
1,981-byte manifest digest
`6ab55aaed558e2ac041238c76517db333de2209b7753e033afd28df59e567fa5`, browser/backend/adapter
identities, reviewed flags, per-source digests, normalized diagnostics, and the two-created/two-
rejected summary. The clean extracted replay reproduced the report byte for byte.

## Independent clean replay

The committed [verifier](verify.mjs) resolves the exact source commit, requires its exact 21-file
scope, and verifies every byte count and digest from the [evidence manifest](manifest.json). It
then extracts the commit to a temporary directory and performs:

- independent YAML parsing of eight jobs and 40 workflow steps;
- clean lifecycle-suppressed installs under Node 22.23.1 and 24.18.0, both using npm 11.18.0;
- WGSL manifest and CI-contract replay on both Node lines;
- JavaScript formatting/linting, dependency policy, TypeScript, deterministic fixtures, and the
  complete aggregate test command on Node 22;
- real Chromium Dawn/SwiftShader fixture validation and compilation;
- real Chromium Wasm bundle smoke as the affected browser regression;
- native format, check, all-target/all-feature Clippy, and all-feature tests; and
- exact report-schema, adapter, outcome, digest, and byte-identity checks.

The broader source gate additionally passed rustdoc with warnings denied, both portable-target
Clippy builds, WASIp2/core-module validation, and Chromium/Firefox/WebKit bundle smoke. No package
or Cargo lock byte changed, the dependency policy remains 91 development-only npm packages and
zero external Rust packages, and no generated browser, report, dependency, or target output is
tracked.

## Negative verification

The clean verifier applies twelve mutations and requires every one to fail:

1. replace a manifest source digest;
2. add an unlisted `.wgsl` file;
3. point a manifest entry outside the fixture root;
4. pass a third command-line argument that attempts to supply client WGSL;
5. make an accepted fixture syntactically invalid while updating its digest;
6. make a rejected fixture valid while updating its digest;
7. replace a required compiler diagnostic marker;
8. disable WebGPU and require adapter acquisition to fail;
9. change the asserted SwiftShader adapter identity;
10. replace the conditional Chromium validation step in CI;
11. redirect the public `wgsl:validate` script to the manifest-only mode; and
12. replace a listed source with a symlink to an external file.

Every mutation is restored, the real four-fixture validator is rerun after the canaries, the report
must return to the recorded digest, and the temporary source repository must finish clean.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
rustc: 1.96.1 (31fca3adb 2026-06-26)
cargo: 1.96.1 (356927216 2026-06-26)
active Node.js: v22.19.0
supported Node replay: 22.23.1, 24.18.0
Corepack: 0.34.0
npm through Corepack: 11.18.0
Playwright: 1.61.1
Chromium: 149.0.7827.55 / Playwright revision 1228
WebGPU implementation: Chromium Dawn with bundled SwiftShader
adapter: google / swiftshader / 0xc0de / SwiftShader Device (Subzero)
```

## Reproduction commands

```bash
corepack npm ci --ignore-scripts
corepack npm run wgsl:check
corepack npm run ci:check
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run toolchain:types
corepack npm run fixtures:check
corepack npm test
corepack npm exec -- playwright install chromium firefox webkit
corepack npm run wgsl:validate
corepack npm run browser:smoke
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
RUSTDOCFLAGS="-D warnings" cargo doc --frozen --workspace --no-deps --all-features
cargo clippy --frozen --target wasm32-unknown-unknown --package helix-core -- -D warnings
cargo clippy --frozen --target wasm32-wasip2 --package helix-core -- -D warnings
corepack npm run wasm:validate
node evidence/phase-02/P02-011/verify.mjs 9f05865334433bc19764b4803c8967ef910c308b
```

## Retained diagnostic attempts

1. Naga 30.0.0 was evaluated as the official Rust WGSL parser/validator. Adding it would have
   introduced the first external Cargo graph and online resolution into every frozen all-target
   workspace check. The already locked Chromium/Dawn toolchain produced the required real parser,
   validator, and pipeline compiler without changing either dependency lock.
2. JSON serialization of `GPUAdapterInfo` appeared empty because its standardized properties are
   not enumerable. Direct reads exposed and now assert vendor, architecture, device, and
   description.
3. The first duplicate-binding fixture compiled because both colliding bindings were unused. The
   final fixture reads both resources into a live output binding, producing the intended primary
   error and explanatory note.
4. The first evidence backend mutation changed the selector to an unknown name. Chromium ignored
   that value and retained its reviewed SwiftShader fallback, so the canary correctly exposed a
   weak mutation. It now disables WebGPU and requires an adapter-unavailable failure.

These observations are retained because they distinguish dependency/tool choice, JavaScript object
enumerability, real compiler liveness, and browser flag behavior from superficial test success.

## Limitations

The operation creates shader modules and compute pipelines but never allocates data buffers,
encodes commands, submits a queue, or compares results. It proves no product kernel, native wgpu
path, hardware GPU, cross-browser WebGPU behavior, CPU/GPU equivalence, fallback, caching, device
loss, quota, performance, or production SwiftShader support. Those obligations remain with
`P10-*`, `P11-*`, `P13-015`, `P16-*`, and `P24-*`.

The local branch is not pushed, so the edited workflow has not run on GitHub-hosted infrastructure.
Firefox and WebKit passed the existing Wasm bundle regression but are not WGSL validator
authorities. Browser/report retention remains `P02-015`, and independent gate acceptance remains
required before `G02` can close.

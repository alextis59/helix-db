# P04-014 Evidence — Ungranted Capability Isolation

- Task: `P04-014`
- Verdict: **PASS**
- Source commit: `787899e498a705e583cbf783640f8a6989684be6`
- Source base: `fc9dace6397c7eaa2ee99eb53f8469699413ca15`
- Source tree: `449b0dac4ab9db4dbef3c48a194d125ab2aae208`
- Accepted ADR: `0013`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-014 proves that the current portable core cannot reach ungranted files, sockets, clocks, or
devices. The core WebAssembly module has zero imports and the deterministic source boundary rejects
ambient filesystem, networking, time, and device APIs. Native and browser exact-grant policies then
deny ungranted file, networking/socket, timer/clock, and GPU/device scopes.

The native Rust test executes all four denials. Chromium, Firefox, and WebKit independently inspect
the built core's import table and execute the same four policy denials. Socket and GPU-device
operations are absent from ABI 7, eliminating a descriptor-mediated route for those two classes.

## Claim boundary

This is a reachability-isolation proof for the current core and host skeletons. It does not claim
platform storage, socket, or GPU adapters; generated Component Model linkage; broader authorization;
or database behavior. P04-015 owns content-safe tracing and P04-016/P04-017 own transport measurement
and selection.

## Validation

The source commit changes 24 artifacts. Twenty-two policy and eight source mutation canaries reject.
The complete aggregate passes with 69 Rust tests, 15 browser executions, 640 fuzz executions,
5,224/5,263 workspace-product lines, and 100% semantic/recovery-critical line coverage. Native
debug/release, browser, Wasm, dependency/license, artifact-retention, CI-matrix, bootstrap,
strict-TypeScript/Biome, all-target/all-feature Clippy, and warning-free documentation gates pass.

```bash
corepack npm run host:isolation:check
corepack npm run host:isolation:test
corepack npm run browser:smoke
corepack npm test
corepack npm run coverage:check
node evidence/phase-04/P04-014/verify.mjs 787899e498a705e583cbf783640f8a6989684be6
```

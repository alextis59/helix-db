# P04-015 Evidence — Content-Safe Boundary Tracing

- Task: `P04-015`
- Verdict: **PASS**
- Source commit: `473e918bfff3885f07be0fd0ad3bb50190551d50`
- Source base: `0cd37ecd43da8ab31b79a9ac7155dd48a82a7701`
- Source tree: `c5e3d87a85b42d9638639ec5ea06d2f487d92851`
- Accepted ADR: `0013`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-015 traces every executable mock and browser ABI 7 boundary call using only per-host sequence,
stable call identity, success/stable error code, exact explicit-copy byte count, and batch-item count.
The record shape cannot contain scopes, paths, request IDs, document bytes, secrets, clock/random
values, device identifiers, or error messages.

Both implementations retain at most 16,384 records. Overflow drops and saturating-counts the trace
record without changing call behavior. A Rust regression executes 16,385 successful calls; a real
browser regression executes two successful calls with capacity one. Chromium, Firefox, and WebKit
all pass the structural, redaction, copy-count, error-result, and overflow assertions.

## Claim boundary

The native skeleton still has no linked ABI calls, so this does not claim native linked-call
tracing. No exporter, distributed trace propagation, wall-clock profiler, document logging, or
database functionality is added.

## Validation

The source commit changes 28 artifacts. Thirty-two policy and 13 source mutations reject. The full
aggregate passes with 70 Rust tests, 15 browser executions, 640 fuzz executions, 5,270/5,308
workspace-product lines, and 100% semantic/recovery-critical coverage. Native debug/release,
browser, Wasm, strict Clippy, warning-free docs, TypeScript/Biome, CI-contract, bootstrap, retention,
dependency, and compatibility-integrity gates pass locally.

```bash
corepack npm run host:tracing:check
corepack npm run host:tracing:test
corepack npm run browser:smoke
corepack npm test
corepack npm run coverage:check
node evidence/phase-04/P04-015/verify.mjs 473e918bfff3885f07be0fd0ad3bb50190551d50
```

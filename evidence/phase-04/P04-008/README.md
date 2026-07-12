# P04-008 Evidence — Asynchronous Completion Semantics

- Task: `P04-008`
- Verdict: **PASS**
- Source commit: `b3746c1ae16644447ebb5430d4cf8a1d985ef34b`
- Source base: `ae9ddb1fa2b05ac62a845fd051aacfbdddb1a967`
- Final source tree: `3463316078878a74792f2a7b1b7290f51f0330f7`
- Accepted ADR: `0013`
- Requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `STORE-001`, `STORE-002`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-008 preserves immutable ABI 5.0 and defines exact `helix:core-abi@6.0.0`. The new ABI carries
optional named monotonic deadlines on operation contexts and exposes the host's monotonic
`running` → `draining` → `stopped` lifecycle. The versioned contract fixes five cooperative safe
points, deterministic same-safe-point precedence, cancellation mutation outcomes, admission-only
backpressure, partial read/write progress, retry identity, and exactly-once resource cleanup.

## Claim boundary

This is an interface and semantic contract, not a host implementation. Numeric memory/admission
budgets remain P04-009; mock, native, and browser execution remain P04-010 through P04-012. No
operation bindings, transport selection, database behavior, wall-clock dependency, rollback
promise, or post-publication result rewriting is claimed.

## Validation

The immutable base and ABI 6.0 WIT are byte/hash bound. Forty-three rejection mutations cover ABI
drift, missing safe points, precedence changes, wall-clock deadlines, cancellation rollback,
retroactive backpressure, partial-I/O truncation, retry-key drift, lifecycle regressions, and claim
overreach.

Full local gates pass: strict format/Clippy, 55 Rust tests, deterministic fixtures, all aggregate
suites, 640 HDoc fuzz executions, 4,738/4,738 semantic/recovery product lines, both portable
artifacts, and six real Chromium/Firefox/WebKit executions.

```bash
corepack npm run async:completion:check
corepack npm run async:completion:test
corepack npm run wasm:validate
corepack npm test
corepack npm run coverage:check
corepack npm run browser:smoke
node evidence/phase-04/P04-008/verify.mjs b3746c1ae16644447ebb5430d4cf8a1d985ef34b
```

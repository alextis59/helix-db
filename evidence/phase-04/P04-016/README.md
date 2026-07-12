# P04-016 Evidence — Host Boundary Transport Benchmark

- Task: `P04-016`
- Verdict: **PASS**
- Source commit: `e5d1711a143979699df205537ad4fb5512755be1`
- Source base: `231010315810ad56e2a38a38eda9c532055053ef`
- Source tree: `516c7571f59008154c901bf4d485f662a33c2896`
- Accepted ADR: `0013`
- Experiment: `EXP-003`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-016 adds one correctness-gated transport workload across native Rust, Chromium, Firefox, and
WebKit. Each runtime measures chatty 64-byte reads, a coarse 64 KiB copy, opaque-handle dispatch
plus coarse copy, and exclusive staging. Every sample verifies exact bytes and FNV-1a checksum.

Five warmups and twenty measurements per strategy/runtime produce 400 raw observations (320
measured). Coarse strategies use 256 iterations per sample to exceed browser timer resolution; the
1,024-call chatty strategy uses one. The promoted environment-stamped observation is hash-bound.

All four runtimes show the same decision-relevant shape: chatty calls are substantially slower than
coarse transport. Opaque handles and shared staging do not consistently beat coarse explicit copy.
Exact selection and revisit thresholds remain P04-017.

## Claim boundary

These are observational local timings, not universal pass thresholds. The harness does not measure
linked native Component Model calls, platform storage, or database operations.

## Validation

The source commit changes 22 artifacts. Twenty-three policy and eight source mutations reject. The
aggregate passes with 70 Rust tests, 15 browser executions, 640 fuzz executions, 5,270/5,308
workspace-product lines, and 100% semantic/recovery-critical coverage. Native debug/release,
browser, strict Clippy/docs, TypeScript/Biome, compatibility, retention, bootstrap, and CI contracts
pass locally.

```bash
corepack npm run benchmark:host
corepack npm run benchmark:host:check
corepack npm run benchmark:host:test
node evidence/phase-04/P04-016/verify.mjs e5d1711a143979699df205537ad4fb5512755be1
```

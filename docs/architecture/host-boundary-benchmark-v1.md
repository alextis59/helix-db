# Host Boundary Benchmark v1

- Status: Observational native and three-engine measurements recorded
- Last updated: 2026-07-12
- Plan item: `P04-016`
- Experiment: `EXP-003`
- Machine authority: [`helix.host-boundary-benchmark/1`](host-boundary-benchmark-v1.json)

The harness transfers the same deterministic 64 KiB value through chatty 64-byte reads, one coarse
copy, a host-owned opaque-handle lookup plus coarse copy, and an exclusive staging prototype. Every
sample checks exact output length and FNV-1a checksum. Five warmups and twenty measurements run for
each strategy on native Rust, Chromium, Firefox, and WebKit: 400 raw observations, 320 measured.

Coarse strategies repeat 256 times per sample to exceed browser timer resolution; the already
expensive 1,024-call chatty strategy runs once. Summaries normalize nanoseconds per iteration.

## Claim boundary

Timing is observational and carries no pass threshold. The harness measures the current safe
reference models and browser binding layer, not linked native Component Model calls, platform
storage, or database operations. P04-017 owns selection and explicit revisit thresholds.

```bash
corepack npm run benchmark:host
corepack npm run benchmark:host:check
corepack npm run benchmark:host:test
```

# Host Transport Selection v1

- Status: Explicit copy with coarse batched calls selected
- Last updated: 2026-07-12
- Plan item: `P04-017`
- Experiment: `EXP-003`
- Machine authority: [`helix.host-transport-selection/1`](host-transport-selection-v1.json)

The required initial transport remains bounded explicit copy. Host calls must remain coarse and
batched; per-byte crossings are forbidden. Opaque handles and exclusive staging remain optional
prototypes because neither consistently beat coarse explicit copy across native, Chromium, Firefox,
and WebKit, while chatty calls lost decisively in every observed runtime.

## Revisit policy

Reopen the decision only after three qualifying benchmark runs show either boundary work at 15% or
more of representative end-to-end time, native coarse-copy p95 above 100 microseconds, or browser
coarse-copy p95 above 1 millisecond. An alternative then needs at least 30 measurements per
strategy/runtime, 20% median improvement in at least three of four supported runtimes, no runtime
regression above 10%, exact output equivalence, unchanged capability isolation, and safe lifecycle
behavior. Explicit copy remains the mandatory fallback.

This selects transport semantics, not zero copy, mapped memory, platform storage, linked native ABI
execution, or database behavior.

```bash
corepack npm run transport:selection:check
corepack npm run transport:selection:test
```

# Host Boundary Tracing v1

- Status: Content-safe structural tracing implemented
- Last updated: 2026-07-12
- Plan item: `P04-015`
- Machine authority: [`helix.host-boundary-tracing/1`](host-boundary-tracing-v1.json)

Every mock and browser ABI 7 boundary call records a per-host sequence, stable call identity,
success or stable error code, explicit-copy byte count, and batch-item count. The trace schema has
no slot for scopes, paths, request or idempotency IDs, document bytes, secrets, clock/random values,
device identifiers, or error messages.

Browser traces retain at most 16,384 records per host. Overflow drops trace records and increments a
counter without changing the call result. The Rust mock applies the same drop-and-count behavior at
its 16,384-record bound. Copy counts describe explicit buffer transport only; storage batch payload
sizes are not recorded.

## Claim boundary

The native skeleton still has no linked ABI calls, so it cannot honestly claim linked native-call
tracing. This step also adds no telemetry exporter, distributed trace propagation, wall-clock
timing, document logging, or database behavior.

```bash
corepack npm run host:tracing:check
corepack npm run host:tracing:test
corepack npm run browser:smoke
```

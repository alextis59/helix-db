# Asynchronous Completion Contract ABI 6.0

- Status: Accepted completion definitions; bindings and hosts not implemented
- Last updated: 2026-07-12
- Owner: Runtime architecture owner
- Plan item: `P04-008`
- Governing requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `STORE-001`, `STORE-002`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Machine authority: [`helix.async-completion-contract/1`](async-completion-contract-v1.json)
- WIT authority: [`helix:core-abi@6.0.0`](../../wit/helix-core-abi-v6/world.wit)

## Version and time model

ABI 5.0 remains immutable. ABI 6.0 adds an optional monotonic deadline to every operation context
and an explicit host lifecycle query. Deadlines name a negotiated monotonic timer and expire when
the observed tick is greater than or equal to their tick. Wall-clock deadlines are forbidden;
absence means no deadline.

## Safe points and precedence

Cancellation, deadlines, shutdown, and backpressure are observed only before admission, before each
item dispatch, after each bounded host I/O chunk, between retries, and before success publication.
When multiple terminal conditions are visible at one safe point, precedence is stopped host,
draining host for new admission, cancellation, deadline, then backpressure. A published success is
final; no later cancellation or cleanup error can rewrite it.

Cancellation is cooperative and never means rollback. Before dispatch its mutation outcome is
`not-committed`; a confirmed commit is `committed`; any unresolved host mutation is `unknown`.

## Backpressure and partial I/O

Backpressure rejects only before dispatch with `CAP_BACKPRESSURE` and `after-delay` retry advice.
Hosts must not busy-wait or retroactively reject admitted work. P04-009 owns numeric budgets.

Reads internally retry until the requested length or EOF; only EOF permits a short success. Writes
retry until every byte is written. Zero progress before completion is `IO_NO_PROGRESS`. An error
releases no batch success payload; completed/ambiguous mutations are represented by
`helix-error.outcome`, and a batch retry reuses the same idempotency key. Oversized list output is
`IO_RESULT_LIMIT`.

## Shutdown

Lifecycle transitions only `running` → `draining` → `stopped`. Draining rejects new work with
`HOST_DRAINING` while admitted work may run until the monotonic shutdown deadline. At that deadline
the host requests cooperative cancellation at safe points. Stopped rejects every operation with
`HOST_STOPPED`. Resources drop exactly once; cleanup failures are observable but do not rewrite
operation results.

## Claim boundary

This defines WIT values and completion semantics only. Operation bindings, numeric budgets,
mock/native/browser execution, shared conformance, transport benchmarking/selection, and database
behavior remain later P04 work.

```bash
corepack npm run async:completion:check
corepack npm run async:completion:test
```

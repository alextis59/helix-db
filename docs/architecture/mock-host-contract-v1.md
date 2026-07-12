# Deterministic Mock Host v1

- Status: Implemented in-memory ABI 7 oracle; no component/native/browser binding
- Last updated: 2026-07-12
- Owner: Runtime architecture owner
- Plan item: `P04-010`
- Governing requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `PLAT-001`, `PLAT-002`, `QUAL-001`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Machine authority: [`helix.mock-host-contract/1`](mock-host-contract-v1.json)
- Implementation: [`helix-host-mock`](../../crates/helix-host-mock/src/lib.rs)

## Coverage of the ABI

The mock models all 21 imported calls in immutable `helix:core-abi@7.0.0`: four resource methods,
six resource operations, six storage batches, clock and random reads, and three host-control calls.
The two `core-control` functions are guest exports and therefore are not host calls. Interfaces that
declare only policy/resource types have no additional call to implement.

Resource behavior reuses the explicit-copy oracle. Storage uses bounded relative in-memory files;
read results detach, directory lists sort, and write/rename/delete batches validate and mutate a
candidate map before publication. Clock/random reads consume the exact P04-009 queues and execution
profiles remain pinned.

## Exact failure injection

A failure rule selects a call kind and a one-based occurrence, plus a stable fault and mutation
outcome. Duplicate selectors, occurrence zero, and more than 4,096 rules are rejected. A selected
rule fires once and the call log records its global sequence, per-kind occurrence, call kind, and
stable result code. Every one of the 21 calls has an executable injected-failure test.

The log is bounded to 16,384 records, batches to 1,024 requests, files to 16 MiB, and paths to 4,096
bytes. Draining rejects the six new storage-batch admissions. Stopped rejects every call except the
lifecycle query, and lifecycle state outranks a configured fault at the same call.

## Claim boundary

This is a deterministic in-process conformance oracle. It performs no filesystem, sync, wall-clock,
random-device, network, thread, process, GPU, native runtime, browser, or component-binding work.
Its `sync-batch` is observable mock success, not durability. Shared conformance begins at P04-013;
native and browser hosts remain P04-011/P04-012.

```bash
corepack npm run host:mock:check
corepack npm run host:mock:test
```

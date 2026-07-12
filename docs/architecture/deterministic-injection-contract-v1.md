# Deterministic Injection Contract ABI 7.0

- Status: Accepted injected-value definitions and portable reference model; hosts not implemented
- Last updated: 2026-07-12
- Owner: Runtime architecture owner
- Plan item: `P04-009`
- Governing requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `PLAT-001`, `PLAT-002`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Machine authority: [`helix.deterministic-injection-contract/1`](deterministic-injection-contract-v1.json)
- WIT authority: [`helix:core-abi@7.0.0`](../../wit/helix-core-abi-v7/world.wit)

## Exact input streams

ABI 6.0 remains immutable. ABI 7.0 adds purpose-separated clock/random operations and one pinned
execution profile. Each admitted operation consumes zero-based contiguous clock and random
sequences exactly by role/source or purpose/length. Exhaustion and mismatch fail without consuming
the next value. Fixtures can therefore supply exact streams; production hosts supply the same
shape from trusted capabilities.

Wall UTC, monotonic, MVCC, and logical-expiry roles are never interchangeable. Wall and expiry
values are signed UTC microseconds, monotonic values are opaque ticks in one named domain, and MVCC
values are bounded ordered tokens. Unsafe safety-clock input fails with `CAP_CLOCK_UNSAFE`.

## Random IDs

Randomness is separated for request IDs, transaction IDs, UUIDv7, ObjectId, nonces, and sampling.
Production input must be cryptographic and has no weak fallback. UUIDv7/ObjectId generation remains
core work: it consumes the named clock/random purposes once, writes the resolved ID into the
canonical command, and never regenerates on retry, replay, replication, or restore. This task
defines injection and consumption, not the identifier generator itself.

## Memory budget

Every operation pins total, scratch, result, and allocation-count limits before admission. Total
memory is bounded to 4 GiB, each class cannot exceed total, and at most 1,048,576 live allocation
records are representable. Reservations validate all limits before changing accounting; failed
reservations are `QUOTA_MEMORY` and leave usage unchanged. Backpressure remains admission-only.

## Device profile

The pinned profile contains a policy name, coarse architecture, logical-core count, CPU-only or
CPU-and-GPU class, sorted unique bounded feature names, and a maximum buffer size. Machine serials,
driver paths, document/tenant content, and other host-unique identifiers are forbidden. A profile
may change backend eligibility and deterministic fallback, never semantic results.

## Reference model and claim boundary

[`deterministic_inputs.rs`](../../crates/helix-core/src/deterministic_inputs.rs) executes exact queue
consumption, validation, failure-atomic memory accounting, and redacted profile validation without
time/random/device discovery. It is not a capability binding or host. Mock/native/browser hosts,
shared conformance, denial proof, GPU execution, and database orchestration remain later work.

```bash
corepack npm run inputs:deterministic:check
corepack npm run inputs:deterministic:test
```

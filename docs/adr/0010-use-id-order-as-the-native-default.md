# ADR 0010: Use ascending semantic `_id` order as the native default

- Status: Accepted
- Date: 2026-07-10
- Decision owner: Query semantics owner
- Required before: `P01-017` and `G01`
- Supersedes: None
- Superseded by: None

## Context

Filters, secondary indexes, memtables/files, compaction, columnar/bitmap/hash execution, parallel CPU work, WebGPU, cursor batching, restore/rebuild, and future shards can all discover the same matching documents in different physical orders. If a native query without explicit sort returns producer order, pagination, one-target writes, differential tests, caching, and CPU/GPU equivalence become unstable.

Requiring every caller to sort avoids a default promise but makes `find`/`updateOne`/`deleteOne` nondeterministic by default and lets implementation changes alter observable selection. Insertion or primary-file “natural” order is not stable through compaction, recovery, import, or distribution.

The accepted identifier contract already supplies one unique root `_id` and a total cross-type primary-key order. This decision implements `P01-017` and contributes to `QUERY-001` and `INV-002`.

## Decision drivers

- Identical values/order/one-target selection across CPU/GPU/index/host paths.
- Gap/duplicate-free snapshot cursors and reproducible fixtures.
- No dependence on storage layout, insertion chronology, compaction, worker scheduling, or device completion.
- A total key already required for every stored document.
- Stable aggregation provenance after visible `_id` is removed/transformed.
- Clear compatibility claims for engines with different unsorted behavior.
- Feasible future global merge and ordered cache keys.

## Considered options

### Option A — Physical/insertion natural order

Advantages:

- Often cheapest for a collection scan.
- Familiar in systems that expose record position.

Disadvantages:

- Flush, compaction, rebuild, restore, and storage backend can change it.
- Secondary indexes/GPU/parallel execution return different orders.
- Insertion order is not durable causal/commit order without extra state.
- Future shards have no single physical order.

### Option B — Unspecified order unless the caller sorts

Advantages:

- Maximum planner freedom and no mandatory reorder cost.
- Matches a common warning for unsorted database queries.

Disadvantages:

- `find` pagination and one-target writes change with plans/backends.
- CPU/GPU differential output requires set comparison and misses order bugs.
- Cursors need accidental physical continuation state.
- Small implementation changes become user-visible nondeterminism.

### Option C — Ascending semantic `_id` default plus hidden stable provenance

Advantages:

- Unique total order is already available for every row.
- Default reads, target selection, pagination, fixtures, caches, and backend differential tests are deterministic.
- Aggregation can retain source identity after projection/unwind and reset it canonically for groups.
- Physical algorithms remain free behind a final ordered boundary.

Disadvantages:

- Secondary/hash/GPU plans may need ID reorder/materialization/spill.
- Default order may not match application chronology.
- Distributed execution must perform a global merge.
- Hidden ordinals/provenance add state to pipelines/cursors/spill records.

## Decision

Accept Option C and the exact [`default_order_v1`](../architecture/default-ordering-semantics.md) contract.

Core choices:

- Unsorted collection-derived streams use ascending semantic `_id` order.
- Explicit CRUD sort uses ascending `_id` after declared ties unless `_id` is already explicit.
- Exact vector ranking uses metric score then ascending `_id`.
- One-target writes select the first row under explicit/default order; multi-target processing uses ascending `_id`.
- Input-correlated batch results retain command input index instead of collection order.
- Aggregation carries typed hidden stable ordinals; unwind appends index, group resets to canonical key, and sort uses ordinal as final tie.
- Cursors persist the complete semantic continuation tuple/profile at one snapshot.
- No native v1 natural/unspecified-order escape hatch; only internal/concurrent operational interleavings are unspecified.

## Consequences

### Positive

- Plan, index, GPU, host, storage-layout, and restore changes cannot silently reorder public query results.
- One-target mutations and errors are reproducible.
- Exact ordered hashes can drive fixtures/differential tests.
- Cursor batching is independent of physical producer chunking.
- Future shards have an explicit merge key.

### Negative

- Some otherwise streaming plans pay reorder/spill/merge costs.
- Planner/explain/resource admission must account for default ordering.
- Applications wanting chronological order must explicitly sort by a trusted time key plus `_id`.
- Ordinal encoding/evolution and stage provenance need conformance tests.

### Neutral or deferred

- Change-stream commit/causal order is separate and defined later.
- Redis-like multi-key/event ordering follows adapter/protocol semantics, not document `_id`.
- Future approximate or explicitly set-semantic APIs require distinct named contracts.

## Compatibility and migration

No released query protocol/cursor/cache/fixture exists, so no current data migration is required. The first normalized command, fixture, cursor, explain, protocol capability, and adapter matrix names `default_order_v1`.

Changing default/tie/group/vector/ordinal rules is breaking and requires a new profile, regenerated fixtures/oracle/differential reports, cursor/cache migration or invalidation, planner/index/distributed review, adapter updates, and a superseding ADR. Existing cursors retain their original profile after upgrade.

Physical layout/algorithm changes need no migration when exact ordered conformance passes. Rollback is safe before consumers persist profile-bearing cursor/cache state; afterward, a rollback reader must preserve/reject that version explicitly rather than reinterpret it.

## Security and operations

- Authorization/TTL/visibility precede ordering and keys remain redacted in explain/metrics.
- Ordering memory/spill/GPU resources are bounded and tenant-controlled.
- Failure to enforce order returns a typed all-or-error response, never partial leakage.
- Cursor tokens bind/sanitize opaque continuation keys and authorization scope.
- Explain reports provider/reorder/spill/profile without raw document IDs.
- Physical order cannot become a covert planner/device/tenant side channel in public results.

## Validation plan

- [x] Define default/rank/explicit ties, command input versus collection order, pipeline ordinals, pagination, mutations, backend/distributed rules, unspecified surfaces, compatibility, and versioning.
- [ ] Commit mixed-ID/filter/sort/vector/pipeline/batch/cursor order fixtures under `P01-019`.
- [ ] Make the independent reference oracle produce exact ordered outputs under `P01-020`.
- [ ] Prove primary/secondary/row/column/bitmap/hash/spill/CPU/GPU equivalence.
- [ ] Prove cursor one-shot equality across batch sizes, mutation, TTL, retry, and expiry.
- [ ] Prove rebuild/restore/different physical layouts retain ordered hashes.
- [ ] Publish adapter unsorted differences under `P01-022`/`P22-*`.
- [ ] Complete independent semantic review at `G01` and later gates.

## Implementation impact

- Semantic corpus/oracle: `P01-017`–`P01-022`.
- Format/storage/MVCC/query/index/sidecar/GPU: `P03-*`, `P05-*`–`P10-*`.
- Products/protocol/SDK/observability/recovery: `P11-*`–`P15-*`.
- Distributed/cache/sync/adapters: `P17-*`–`P22-*`.
- Requirements: `QUERY-001`, `INV-002`.
- Gates: `G01` and every later gate returning, selecting, resuming, rebuilding, or merging document streams.

## Follow-up work

- [ ] Define a compact collision-free internal ordinal codec with golden fixtures.
- [ ] Include default reorder/spill cost and reason in planner/explain.
- [ ] Make ordered result hashes mandatory in every backend/restore differential suite.
- [ ] Keep change-stream/event ordering separate from query default order.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [Default ordering semantics](../architecture/default-ordering-semantics.md)
- [Identifier semantics](../architecture/identifier-semantics.md)
- [CRUD/query semantics](../architecture/crud-query-semantics.md)
- [Aggregation semantics](../architecture/aggregation-semantics.md)

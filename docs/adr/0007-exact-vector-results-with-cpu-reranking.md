# ADR 0007: Keep vector results exact with CPU reference reranking

- Status: Accepted
- Date: 2026-07-10
- Decision owner: Query semantics owner
- Required before: `P01-010` and `G01`
- Supersedes: None
- Superseded by: None

## Context

HelixDB wants f16/f32 vector storage, WebGPU distance/top-k acceleration, CPU fallback, scalar filtering, and later vector indexes. Floating reductions, shader precision, subnormal handling, approximate indexes, and parallel top-k can change scores/membership/order. A loose “within tolerance” promise is not enough for database predicates, pagination, cache keys, or CPU/GPU equivalence.

V1 needs a reference score and exactness boundary before fixtures, HDoc/vector sidecars, query parsing, GPU kernels, and index algorithm selection. This decision implements `P01-010` and contributes to `QUERY-001`, `INV-002`, `GPU-002`, and `GPU-003`.

## Decision drivers

- Identical final scores, membership, and order across CPU/GPU availability.
- Exact storage/round trip of f16/f32 family, dimension, and finite bits.
- Defined invalid/zero-norm behavior.
- Deterministic metric arithmetic and `_id` tie-breaking.
- Conservative acceleration without false negatives.
- Freedom to evaluate approximate indexes later under an explicit profile.
- Bounded GPU/candidate/rerank resource use and observable fallback.

## Considered options

### Option A — Publish GPU/ANN scores and accept epsilon differences

Advantages:

- Maximum accelerator/index speed.
- Minimal CPU reranking.

Disadvantages:

- Epsilon does not guarantee top-k membership or threshold truth near boundaries.
- Device/driver/workgroup changes can reorder results.
- Approximate recall and numerical error become conflated.
- Pagination, caching, differential tests, and compatibility become unstable.

### Option B — Disable GPU/index acceleration for vectors

Advantages:

- Simple exact CPU semantics.
- No candidate/error-bound complexity.

Disadvantages:

- Misses a central project objective and representative WebGPU workload.
- Cannot test the candidate-plus-verification architecture.
- Large brute-force vector scans may be impractical.

### Option C — Exact CPU reference with conservative candidates and reranking

Advantages:

- Public results remain independent of accelerator/index availability.
- GPU/sidecar/index work can still prune when it proves conservative bounds.
- Numerical error and approximate recall are explicit separate concepts.
- Exact default leaves room for a future named approximate profile.

Disadvantages:

- CPU source-vector fetch/reranking remains in the critical path.
- Conservative intervals may expand to many/all rows.
- Kernel-specific error-bound proof and telemetry add work.
- Approximate indexes cannot accelerate exact queries unless recall is proven.

## Decision

Accept Option C with the normative details in [Vector Types, Metrics, Normalization, and Tolerance Semantics](../architecture/vector-semantics.md):

- Vector family/dimension are explicit logical type identity; casts/normalization are explicit.
- Only finite f16/f32 elements are admitted; subnormals/zero signs round-trip exactly.
- L2, dot, and cosine use fixed ordered float64 reference arithmetic.
- L2 returns Euclidean distance, dot ranks descending, cosine returns clamped `1 - similarity` and rejects zero query norm.
- Exact top-k recomputes CPU reference scores and breaks exact score ties by `_id`.
- Final scores, thresholds, membership, and order allow zero difference/tolerance.
- GPU/optimized scores carry versioned conservative error bounds, can only generate no-false-negative candidates, and are CPU reranked.
- If an exact candidate proof is unavailable, scan all eligible rows/fallback.
- A future approximate mode must be explicitly named and publish recall semantics.

## Consequences

### Positive

- CPU/GPU presence cannot change public vector results.
- Source vector identity and exact query semantics remain testable.
- Kernel numerical drift and index recall failures are separately diagnosable.
- The same candidate-plus-verification invariant used elsewhere applies to vector work.

### Negative

- Exact vector queries may require substantial CPU reranking/source fetch.
- Some devices/kernels provide no useful conservative pruning.
- Correctly rounded deterministic reference arithmetic needs careful implementation.
- ANN benefits are deferred to an explicit approximate contract or proven exact candidate mode.

### Neutral or deferred

- Vector-index algorithm/persistence/update/rebuild remains `P08-017`.
- Maximum dimension/`k` remains `P01-011`.
- Physical f16/f32 bytes/alignment remain `P03-*`.

## Compatibility and migration

No persistent vector fixture, public protocol, or index exists yet, so no current migration is required. First fixtures record family, dimension, exact bits, metric algorithm, score bits, and tie order.

Changing admitted values, reference arithmetic/order, metric meaning, normalization, score result type, tie-break, exactness profile, or kernel-bound interpretation later requires a semantic/config version, regenerated fixtures, vector-index/sidecar rebuild assessment, cursor/cache invalidation, adapter update, and a superseding ADR. Source vectors are never silently normalized/retyped during upgrade.

## Security and operations

- Dimension/`k`/candidate/scratch/rerank resources are admitted and tenant-quota controlled.
- GPU buffers follow isolation/zeroing rules.
- Bound violation or false negative disables/fails that kernel capability and surfaces health/metrics.
- Raw vectors are redacted from logs/diagnostics by default.
- Approximate profiles cannot be selected implicitly by planner or adapter.

## Validation plan

- [x] Define types/admitted values, casts, normalization, metrics, eligibility, exact top-k, tolerance/candidates, and invalid/security behavior.
- [x] Commit executable vector/metric/boundary fixtures under `P01-019`.
- [x] Make the reference interpreter pass the committed Phase 1 metric fixtures under `P01-020`.
- [ ] Expand the reference suite through exact top-k query execution under `P07-010`.
- [ ] Prove HDoc/SDK/protocol/sidecar exact round trips.
- [ ] Prove CPU optimized and GPU candidate bounds with zero false negatives and exact reranking.
- [ ] Evaluate vector index algorithm, recall, recovery, mutation, and rebuild under `P08-*`.
- [x] Complete independent vector review at [`G01`](../../evidence/phase-01/G01/review.md).

## Implementation impact

- Semantic/reference: `P01-010`–`P01-012`, `P01-016`, `P01-019`–`P01-020`, `P07-010`, `P07-017`.
- Physical/index/backend: `P03-004`, `P03-016`, `P08-017`–`P08-020`, `P09-003`, `P09-013`, `P10-012`, `P10-014`.
- Requirements: `QUERY-001`, `INV-002`, `GPU-002`, `GPU-003`.
- Gate: `G01` and later format/query/index/GPU gates.

## Follow-up work

- [x] Implement exact metric fixtures/reference code before any optimized kernel.
- [ ] Register and prove per-kernel conservative bounds before candidate pruning.
- [ ] Keep approximate-index/profile design separate and explicit.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [Vector semantic contract](../architecture/vector-semantics.md)

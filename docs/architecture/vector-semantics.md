# Vector Types, Metrics, Normalization, and Tolerance Semantics

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-010`
- Governing requirements: `QUERY-001`, `INV-002`, `GPU-002`, `GPU-003`
- Governing gate: `G01`
- Decision: [ADR 0007](../adr/0007-exact-vector-results-with-cpu-reranking.md)
- Normative parents: [logical value model](value-model.md), [numeric semantics](numeric-semantics.md), and [floating special semantics](floating-special-semantics.md)

This document defines vector element/dimension identity, admitted values, casts, normalization, equality/hashing, L2/cosine/dot reference scores, eligibility, deterministic top-k, invalid cases, and CPU/GPU tolerance. It keeps final native vector results exact even when an accelerator produces approximate candidates.

## Logical vector types

V1 has two vector families:

```text
vector<f32,N>
vector<f16,N>
```

`N` is part of the logical type and must be a positive integer not exceeding the limit set by `P01-011`.

Rules:

- Elements are dense, ordered, and homogeneous.
- Element type and dimension survive HDoc, SDK, protocol, sidecar, index, backup, replication, and restore.
- A vector is not equal to an array or binary blob with similar contents.
- `vector<f16,N>` and `vector<f32,N>` are different types even when their represented numbers coincide.
- Collections may store different vector types/dimensions on a schema-free path, but one vector operation/index declares one exact element type and dimension.
- There are no missing/null components; missing/null applies only to the containing field/path.

## Element representation and admitted values

Each element stores its exact IEEE binary32 or binary16 bits, subject to the finite-value rule:

- Finite normal values are accepted.
- Finite subnormal values are accepted and their bits are preserved.
- Positive/negative zero are accepted and their sign bits are preserved for typed payload identity.
- NaN and positive/negative infinity are rejected on insert, update, query-vector parsing, explicit cast output, index build, and physical decode.

Non-finite rejection keeps distance, ordering, top-k, and normalization defined. An existing physical vector containing a non-finite element is corrupt/noncanonical data, not a value that a backend may silently skip.

Host APIs must validate before narrowing. Ordinary JSON numeric arrays do not infer vector type; a typed wrapper/schema/operator supplies element type/dimension and performs checked conversion.

## Checked vector casts

There is no implicit cast between vector families or between array/vector.

### `f16 → f32`

Every finite binary16 value converts exactly to binary32. Zero sign and the exact mathematical value are preserved.

### `f32 → f16`

Explicit conversion uses round-to-nearest, ties-to-even with binary16 gradual underflow:

- A finite representable result (normal/subnormal/zero) is returned with deterministic bits.
- Overflow to infinity is a typed conversion error rather than an accepted vector element.
- The caller must request the cast; index/query planning cannot narrow automatically.

Array-to-vector construction validates length once, converts every element atomically under an explicit element type, and rejects partial output on any invalid element.

## Vector equality and hashes

Semantic vector equality requires:

1. Same vector family (`f16` or `f32`).
2. Same dimension.
3. Element-wise numeric equality at every position.

Positive/negative zero compare equal. Because NaN is disallowed, equality is reflexive without a NaN class. Exact typed payload identity additionally distinguishes zero sign and all exact finite bit patterns.

Hashes are order/dimension/type sensitive:

```text
typed vector hash:
  domain/version || vector family || N || exact element bits in order

comparison vector hash:
  domain/version || vector family || N || element comparison keys in order
```

Hash collisions are confirmed by element comparison. Cross-family values do not hash/equal together even if an explicit widening could make their mathematical components equal.

If vectors participate in a total value order under `P01-012`, `f16` family sorts before `f32`, then dimension, then lexicographic element numeric order; distance is never an implicit general sort order.

## No implicit normalization

Source/query vectors are stored and compared exactly as supplied. HelixDB does not normalize on write, index build, query parsing, equality, or round trip.

Reasons:

- Normalization loses original magnitude and changes payload bits.
- Repeated normalization is not idempotent at finite precision.
- L2/dot semantics depend on magnitude.
- Different CPU/GPU rounding could otherwise change stored identity.

An explicit `normalizeVector` transform may produce a new vector:

1. Compute the reference float64 L2 norm below.
2. Reject zero norm.
3. Divide each widened component by the norm in element order using reference binary64 rules.
4. Explicitly quantize each result to the requested output family.
5. Validate finite output and publish atomically.

The resulting finite-precision vector is not tagged “unit forever”; cosine still computes/verifies its norm. Indexes may maintain derived normalized sidecars, but source vectors remain authoritative and final scores are recomputed from source bits.

## Reference arithmetic

All public vector scores are `float64`. Each finite f16/f32 element widens exactly to binary64 before arithmetic.

The v1 reference primitive rules are:

- Round-to-nearest, ties-to-even binary64 operations.
- No fast-math, reassociation, implicit fused multiply-add, extended host precision, or flush-to-zero.
- Components are processed in increasing index order.
- Products/differences round as separate binary64 operations.
- Accumulation is a left fold from positive zero for one vector score.
- Square root is correctly rounded binary64 under the reference math implementation/fixtures.
- Any binary64 overflow/non-finite intermediate is a typed `VectorScoreOverflow` error, not an infinity/NaN score.

This fixed algorithm prioritizes reproducibility over architecture-specific SIMD reduction order. Optimized CPU/GPU implementations either reproduce it exactly or produce conservative candidates followed by reference reranking.

## L2 metric

For vectors `a` and `b` of the same family/dimension:

```text
sum = +0.0
for i = 0 .. N-1:
  d = f64(a[i]) - f64(b[i])
  term = d * d
  sum = sum + term
l2 = sqrt(sum)
```

`l2` is Euclidean distance, not squared L2. Lower is better. Implementations may use squared distance only as an internal candidate/order optimization when they prove it preserves the relevant finite ordering and still return the reference square-root score.

## Dot metric

```text
sum = +0.0
for i = 0 .. N-1:
  term = f64(a[i]) * f64(b[i])
  sum = sum + term
dot = sum
```

Higher is better. Dot does not normalize inputs and can be negative.

## Cosine metric

Reference dot and squared norms are accumulated with the same ordered primitives:

```text
dot = Σ(a[i] * b[i])
aa  = Σ(a[i] * a[i])
bb  = Σ(b[i] * b[i])
denominator = sqrt(aa) * sqrt(bb)
similarity = dot / denominator
similarity = clamp(similarity, -1.0, +1.0)
cosine_distance = 1.0 - similarity
```

Lower cosine distance is better. Clamping removes only finite roundoff outside the mathematical interval; it is applied after reference division and before subtraction.

A zero-norm query vector is invalid. A zero-norm stored candidate has no cosine score and is ineligible for cosine near/top-k results; it is counted in explain/diagnostics. An explicit pairwise distance expression involving a zero-norm operand returns `VectorZeroNorm` rather than an absent score.

L2 and dot accept zero vectors.

## Query eligibility

A vector search declares:

- resolved field path;
- exact vector family;
- exact dimension;
- metric (`l2`, `cosine`, or `dot`);
- query vector;
- `k` or a metric-specific threshold;
- scalar filter/snapshot/deadline and exactness profile.

The query vector must match family/dimension exactly and contain only admitted finite elements. There is no implicit f16/f32 or array conversion.

For a schema-free candidate path:

- Missing, null, non-vector, different-family, and different-dimension values are ineligible, not coerced.
- A non-finite physical vector is corruption and fails the operation/storage health path.
- Cosine additionally excludes zero-norm candidates as defined above.
- Counts for each exclusion class appear in explain/material statistics without values.

An explicit scalar `vectorDistance(a,b,metric)` is stricter: wrong types/dimensions produce a typed error rather than candidate ineligibility.

## Exact `$vectorTopK`

Native v1 `$vectorTopK` is exact over every eligible row in the pinned snapshot after the declared scalar filter.

1. Compute/recompute each eligible reference score.
2. Rank `l2`/`cosine` ascending and `dot` descending.
3. For exactly equal reference scores, compare document `_id` ascending under the primary-ID order.
4. Return the first `min(k, eligible_count)` rows with reference score bits.

`k` must be a positive exact integer within `P01-011` command/result limits. Physical completion order, worker count, chunking, GPU scheduling, and index traversal cannot break ties.

There is no score epsilon for equality/ties and no implicit approximate mode. A future approximate query must use a distinct explicit profile/operator and publish recall/error semantics; it cannot change v1 exact `$vectorTopK`.

## `$vectorNear` thresholds

Threshold predicates use the exact reference score and metric direction:

- L2/cosine accept a maximum distance and include equality at the boundary when the operator is inclusive.
- Dot accepts a minimum score and includes equality when inclusive.
- Tolerance does not move a public threshold.
- A candidate accelerator expands uncertainty intervals/conservative candidates and CPU-verifies the original boundary.

The exact JSON grammar and inclusive/exclusive forms are finalized by `P01-012`/`P07-010`.

## CPU/GPU tolerance and candidate contract

CPU reference scores define semantics. The tolerance policy is:

| Use | Allowed difference |
| --- | --- |
| Vector equality/hash/type/dimension | 0; exact semantic result |
| Final public score | 0 ULP from reference |
| Final top-k membership/order/tie | 0 difference |
| Threshold match | 0 Boolean difference |
| Persisted/returned normalized vector | Exact reference conversion bits |
| Optimized/GPU candidate score | May differ only within its registered conservative absolute-error bound; never authoritative |

Every candidate kernel capability/version registers a conservative error-bound function based on metric, element type, dimension, input magnitude/norm metadata, arithmetic features, and device profile. The bound is validated against adversarial/random reference fixtures and is included in kernel metadata/explain evidence.

Candidate selection operates on score intervals:

- For lower-is-better metrics, candidate interval is `[score_gpu - error, score_gpu + error]`.
- For dot, the same interval is interpreted with higher-is-better ranking.
- A threshold includes every interval that overlaps the accepted side.
- A top-k stage includes every row whose interval can outrank/tie the current boundary, plus any configured conservative spill set.
- If the planner cannot prove no false negatives from intervals/index recall, it expands to all eligible rows or selects CPU reference scan.

After candidate generation, CPU recomputes reference scores and exact final order. Being “within tolerance” is not sufficient to publish a GPU score, exclude a row, or pass a correctness test.

Diagnostic reports record absolute/relative/ULP error distributions, bound violations, candidate count, false negatives (must be zero for exact profile), reranked membership/order, and fallback. A kernel bound is versioned and cannot widen silently.

## Vector index boundary

The vector-index algorithm is deliberately deferred to `P08-017`–`P08-020`, constrained as follows:

- Exact native queries cannot use an approximate index as the sole candidate source unless it proves no false negatives for that query.
- An approximate index may accelerate a future explicitly approximate profile with published recall semantics, never masquerade as exact.
- Scalar prefilters apply to the same snapshot and authorization scope before semantic finalization.
- Source vectors/versions remain available for exact reranking.
- Inserts/updates/deletes, crash recovery, rebuild, compaction, backup, restore, replication, and movement cannot return stale/deleted candidates as final.
- Explain reports algorithm/version, candidate exactness class, recall/error policy, filters, exclusions, rerank count, fallback, and score source.

## Sidecar and physical representation obligations

- HDoc encodes family, dimension, and exact finite element bits.
- Sidecars carry family/dimension/version/alignment/endianness and missing/null metadata.
- f16 storage is not widened/retyped on round trip even when execution widens.
- A device lacking f16 capability may widen f16 exactly for candidate arithmetic or fall back.
- A device that flushes subnormals, contracts operations, or lacks a valid error bound cannot produce authoritative results and may be ineligible even for candidate pruning.
- Transfer/packing cannot reorder elements or use host struct padding.
- Index/sidecar watermarks and row versions are verified before final results.

## Security and resource behavior

- Dimensions, `k`, candidate count, scratch buffers, index probes, and rerank work are capped/admitted before allocation.
- Crafted magnitudes causing reference score overflow return typed error atomically and cannot poison index metadata.
- GPU buffers follow tenant isolation/zeroing/quota rules.
- Explain/logs expose dimensions/types/metrics/counts and reason codes, not raw vectors by default.
- Vector IDs/scores are not authorization signals and approximate time/membership side channels follow the threat model.

## Required fixtures

The semantic corpus includes:

- f16/f32 min/max finite, normal/subnormal, both zeros, quantization ties, overflow, NaN, infinity, and exact bits.
- Dimension zero/max/boundaries and family/dimension mismatch.
- Equality/hash cases for zero sign, positions, family, and dimension.
- Explicit f16↔f32/array conversion success and atomic failure.
- Normalization magnitude, zero norm, repeated normalization, and output quantization.
- Hand-calculated L2/dot/cosine, cancellation, extreme magnitude, clamp, and reference overflow cases.
- Missing/null/wrong type/dimension/zero-cosine candidate eligibility counts.
- Exact threshold boundaries, `k`, equal-score `_id` ties, filters, snapshot mutation, and stable order.
- Candidate error intervals, adversarial bound edges, all-row expansion, zero false negatives, CPU rerank, and fallback.
- HDoc/SDK/protocol/sidecar/index/backup/recovery/replication exact round trips and cross-host result hashes.

## Follow-up ownership

| Plan item | Remaining vector responsibility |
| --- | --- |
| `P01-011` | Maximum vector dimension, `k`, command/document/result limits |
| `P01-012`, `P01-016` | Query grammar/truth tables and stable errors |
| `P01-019`–`P01-020` | Executable vector fixtures/reference oracle |
| `P03-004`, `P03-016` | HDoc vector bytes and golden vectors |
| `P07-010`, `P07-017` | Query parser and CPU reference implementation |
| `P08-017`–`P08-020` | Vector-index decision, recovery, recall/exactness tests |
| `P09-003`, `P09-013` | Sidecar layout and optimized CPU operators |
| `P10-012`, `P10-014` | GPU kernels, bounds, CPU verification |

No implementation may admit non-finite elements, infer/cast vector types, normalize source values, publish approximate scores, use epsilon for final ties/thresholds, or let an unproven approximate index omit exact results without a superseding vector ADR and compatibility/index migration.

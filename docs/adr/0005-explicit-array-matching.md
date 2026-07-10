# ADR 0005: Use explicit whole-array and element matching

- Status: Accepted
- Date: 2026-07-10
- Decision owner: Query semantics owner
- Required before: `P01-008` and `G01`
- Supersedes: None
- Superseded by: None

## Context

Arrays combine ordered value identity, implicit dotted traversal, multikey indexes, same-element binding, nested boundaries, updates, aggregation, and MongoDB compatibility. If scalar equality sometimes means whole-value equality and sometimes element search, or if nested arrays flatten differently by backend, CPU/index/GPU results will diverge.

V1 needs one reference model before fixtures, query normalization, HDoc offsets, multikey keys, sidecars, and adapters. Compatibility can translate an explicit subset later; it cannot be allowed to make the native core ambiguous.

This decision implements `P01-008` and contributes to `DATA-001`, `DATA-002`, and `QUERY-001`.

## Decision drivers

- Reflexive recursive array equality and stable canonical hashes.
- Explicit same-element binding and nested-array boundaries.
- Deterministic, provenance-aware multikey index behavior.
- Identical reference/row/index/sidecar/GPU-assisted results.
- Clear missing/null semantics across fan-out.
- A testable MongoDB adapter boundary rather than accidental partial mimicry.
- Bounded traversal under document/path/resource limits.

## Considered options

### Option A — Copy MongoDB-style implicit element matching and recursive traversal broadly

Advantages:

- Familiar behavior for MongoDB users.
- More queries match arrays without explicit syntax.

Disadvantages:

- Equality meaning depends on stored operand shape.
- Separate conditions can accidentally bind different elements.
- Nested traversal and multikey index eligibility are complex.
- Compatibility details vary by operator/path and require a full upstream oracle anyway.
- GPU/sidecar shortcuts are more likely to flatten incorrectly.

### Option B — Use whole-array equality plus explicit bounded traversal/element operators

Advantages:

- Equality/hash/group/index identity is coherent.
- `$elemMatch` makes same-element intent explicit.
- Nested arrays remain structural values.
- Dotted fan-out is bounded to an immediate structural level and carries provenance.
- Adapters can rewrite/test selected implicit upstream forms.

Disadvantages:

- Some familiar MongoDB queries need explicit syntax or adapter rewriting.
- Path evaluation returns a candidate sequence/provenance rather than one optional value.
- Sort/projection on multivalue paths must error or name a reducer.

### Option C — Disallow traversal and element predicates in v1

Advantages:

- Simplest storage/query implementation.
- No multikey ambiguity.

Disadvantages:

- Fails the required document-query and array-operator scope.
- Prevents useful nested data/index workflows.
- Merely postpones the semantic decision until formats are harder to change.

## Decision

Accept Option B with the normative details in [Array Equality, Ordering, Traversal, and Operator Semantics](../architecture/array-semantics.md):

- Arrays are dense ordered heterogeneous sequences; holes are invalid.
- Equality is whole-array recursive ordered equality; scalar equality does not implicitly search elements.
- Ordering/hashes preserve boundaries, positions, and lengths.
- Dotted paths may select a numeric index or fan out over immediate object elements; nested arrays do not recursively flatten.
- Multivalue candidates carry array-position provenance.
- Positive predicates use any-candidate reduction; negations/complements are defined over that result.
- `$all` is top-level set containment, `$size` is exact immediate length, and `$elemMatch` binds one immediate element.
- Nested traversal requires explicit path levels or nested `$elemMatch`.
- Ambiguous multivalue sort/projection requires an explicit rule rather than arbitrary selection.

## Consequences

### Positive

- Native array equality, grouping, uniqueness, and hashing share one relation.
- Same-element predicates and multikey plans have an explicit provenance model.
- CPU/index/GPU paths can be conservative and verified without hidden flattening.
- Nested arrays remain lossless and predictable.

### Negative

- Native queries differ from MongoDB implicit element equality.
- The adapter must rewrite and differential-test claimed cases.
- Multikey indexes need provenance metadata/restrictions.
- Some convenient multivalue sort/projection forms are rejected until reducers exist.

### Neutral or deferred

- Physical offset/index encodings remain later phase decisions.
- Array update operators and unwind details remain `P01-014`/`P01-015`.
- Full cross-type operator/type-bracketing rules remain `P01-012`.

## Compatibility and migration

No persistent array fixture or public protocol exists yet, so no current migration is required. The first semantic/HDoc/index fixtures encode boundaries, whole-array equality, and provenance rules.

Changing flattening, scalar equality, `$all`, `$size`, `$elemMatch`, or numeric-segment behavior later requires a semantic version, regenerated fixtures, multikey index/sidecar rebuild assessment, query/plan-cache invalidation, adapter-matrix update, and a superseding ADR. Old indexes cannot be reinterpreted under new traversal rules.

## Security and operations

- Depth, fan-out, element count, path count, and predicate work are capped.
- Explain/diagnostics report multikey fan-out, same-element verification, candidate counts, and fallback without exposing values.
- Crafted nested arrays cannot trigger unbounded recursion or GPU allocation.
- Adapter rewrites remain subject to ordinary authorization, quotas, deadlines, and audit.

## Validation plan

- [x] Define equality, order, hash, path fan-out, candidate reduction, `$all`, `$size`, `$elemMatch`, nested boundaries, and compatibility behavior.
- [x] Commit executable array/path/operator fixtures under `P01-019`.
- [x] Make the reference interpreter pass them under `P01-020`.
- [ ] Differential-test every claimed MongoDB array form under `P01-021`/`P22-*`.
- [ ] Prove HDoc/SDK/protocol/backup round trips.
- [ ] Prove multikey index/sidecar/GPU candidate provenance and CPU verification.
- [x] Complete independent array review at [`G01`](../../evidence/phase-01/G01/review.md).

The [initial `P01-021` profile](../../differential/mongodb/README.md) covers direct `$all`, scalar `$elemMatch`, `$size`, scalar-on-array equality, whole-array equality with nested arrays, and one guarded rewrite. The broader checkbox remains open because generated shapes, implemented-engine behavior, indexes, errors, and every future adapter claim remain assigned to `P07-022` and `P22-*`.

## Implementation impact

- Semantic tasks: `P01-008`, `P01-011`–`P01-021`.
- Physical/query work: `P03-*`, `P07-*`, `P08-*`, `P09-*`, `P10-011`, `P12-*`, `P22-*`.
- Requirements: `DATA-001`, `DATA-002`, `QUERY-001`.
- Gate: `G01` and later format/query/index/backend/compatibility gates.

## Follow-up work

- [x] Implement the language-neutral array corpus and reference path evaluator.
- [ ] Freeze multikey index provenance/compound restrictions before index format fixtures.
- [x] Publish the initial exact/different MongoDB array observations and prohibit untested claims under `P01-021`/`P01-022`.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [Array semantic contract](../architecture/array-semantics.md)

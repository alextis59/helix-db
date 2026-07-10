# ADR 0002: Use exact mixed numeric comparison and checked arithmetic

- Status: Accepted
- Date: 2026-07-10
- Decision owner: Query semantics owner
- Required before: `P01-003`, `P01-004`, and `G01`
- Supersedes: None
- Superseded by: None

## Context

HelixDB stores `int32`, `int64`, `float64`, and `decimal128` as distinct logical types while exposing common numeric predicates, arithmetic, indexes, uniqueness, grouping, and CPU/GPU execution. Host-language coercion rules differ and can silently lose integer or decimal precision. WebGPU capability profiles may lack native 64-bit integer, binary64, or decimal operations.

The semantic core therefore needs one portable rule before query fixtures, HDoc tags, index keys, SDK values, or GPU kernels freeze accidental JavaScript, Rust, Wasm, or shader behavior. This decision implements `P01-003`, contributes to `DATA-001` and `QUERY-001`, and is refined for special floating values by `P01-004`.

## Decision drivers

- Identical results across reference, CPU, Wasm, GPU-assisted, embedded, server, and distributed paths.
- No silent integer wrapping or lossy decimal/binary conversion.
- Lossless storage and SDK round trips for every declared numeric type.
- Useful cross-type numeric comparisons and index lookups.
- Conservative fallback on devices without required numeric capabilities.
- Bounded, testable algorithms for untrusted query inputs.
- An explicit MongoDB compatibility boundary rather than accidental emulation.

## Considered options

### Option A — Adopt each host language's native coercion

Rust, JavaScript, Wasm, and WGSL would use their convenient number types and casts.

Advantages:

- Minimal initial implementation.
- Fast on each host's naturally supported cases.

Disadvantages:

- JavaScript cannot exactly represent every `int64` as `number`.
- Overflow, decimal, NaN, and comparison behavior diverges by host and build mode.
- Index/GPU results could disagree with row verification.
- Persistent values could change type or value during SDK round trips.

Evidence:

- The declared domains themselves exceed a single shared host primitive.

### Option B — Use an unconditional widening ladder

All mixed operations would promote through `int32 → int64 → float64 → decimal128` or another total order.

Advantages:

- Simple promotion table.
- Most mixed expressions produce a result.

Disadvantages:

- `int64 → float64` loses values and `float64 → decimal128` does not recover them.
- Reversing decimal/float order merely moves the silent rounding boundary.
- Comparison could change depending on operand coercion order.
- Unique indexes and grouping could disagree with exact equality.

Evidence:

- Adjacent integers above `2^53` collapse under binary64 conversion; decimal `0.1` and binary64 `0.1` are not the same exact value.

### Option C — Exact comparisons with checked, limited arithmetic promotion

Retain types, compare finite numeric values exactly, widen integer arithmetic only when lossless, promote integer/decimal exactly, permit implicit integer/float arithmetic only for exactly representable integers, and reject implicit decimal/float mixing.

Advantages:

- One deterministic semantic result across hosts.
- Common cross-type comparison remains useful.
- Loss requires an explicit conversion and rounding policy.
- GPU capability gaps degrade to fallback rather than wrong results.
- Errors are atomic and reproducible.

Disadvantages:

- Exact decimal/binary comparison needs bounded scaled big-integer logic.
- Some expressions accepted by dynamic languages require explicit conversion.
- Index comparison keys and hashes are more complex.
- Some GPU numeric cases cannot execute exactly and stay on CPU.

Evidence:

- The algorithm operates on fixed-width source domains, so intermediate size and test vectors can be bounded.

## Decision

Accept Option C.

The normative rules are in [Integer, Decimal, and Mixed Numeric Semantics](../architecture/numeric-semantics.md):

- Stored type identity never changes implicitly.
- Finite mixed numeric comparison uses exact represented mathematical values.
- `int32` arithmetic widens once to `int64`; `int64` overflow/underflow errors.
- Integer/decimal promotion is exact and uses a single decimal128 context.
- Integer/float arithmetic is implicit only for exactly representable integers.
- Decimal/float arithmetic requires an explicit conversion.
- Numeric equality keys normalize cross-type equal values while typed value hashes remain type-sensitive.
- Unsupported optimized/device arithmetic falls back or returns verified candidates.
- All numeric NaNs are database-equal and sort after positive infinity; signed zeros are numerically equal while float payload identity preserves the sign bit.
- Float arithmetic preserves IEEE binary64 results with canonical arithmetic NaN output; decimal finite overflow/terminal underflow remains checked.
- Authoritative predicates, keys, persisted arithmetic, and aggregates require exact reference results. A 4-ULP envelope exists only for non-authoritative experiment diagnostics, never query truth.

The special-value, aggregation, and backend details are normative in [Floating-Point and Decimal Special-Value Semantics](../architecture/floating-special-semantics.md).

## Consequences

### Positive

- Semantic correctness is independent of host and accelerator primitives.
- Full integer and decimal domains survive round trip.
- Query comparisons, indexes, uniqueness, grouping, and hashing share one equality relation.
- Conversion loss is visible and testable.

### Negative

- The reference engine needs exact comparison helpers and two hash purposes.
- SDKs must expose typed numbers instead of only native JSON numbers.
- Some mixed arithmetic is more explicit than MongoDB/JavaScript users expect.
- GPU coverage is narrower on limited adapters.

### Neutral or deferred

- Physical HDoc and ordered-index encodings remain later decisions.
- Aggregate accumulator result types remain `P01-015` but must respect this decision.
- Adapter differences are published by the compatibility matrix.

## Compatibility and migration

No persistent fixture or public protocol exists yet, so acceptance requires no data migration. The first HDoc, index, protocol, SDK, backup, and replicated-command versions must encode these semantics from their initial committed fixtures.

Changing mixed equality, promotion, overflow, or conversion behavior after fixtures ship requires a semantic version change, index/group-key rebuild assessment, compatibility-matrix update, fixture migration, and a superseding ADR. A binary rollback is safe only while every stored format and public semantic version remains understood by the older binary.

MongoDB-like adapters may translate behavior only inside their declared compatibility profile; they cannot modify the native semantic core or silently round values.

## Security and operations

Exact comparison operates on bounded source widths and must use capped scratch storage; query-controlled decimal exponents cannot cause unbounded allocation or CPU work. Numeric errors redact sensitive operands from logs by default while retaining type, operator, request ID, and stable reason code.

Planner/explain output records when a numeric predicate falls back because a backend lacks exact width or representation support. No new secret or external trust boundary is introduced.

## Validation plan

- [x] Define the complete type, literal, promotion, overflow, comparison, conversion, and hashing contract.
- [x] Define NaN, infinities, signed zero, canonical results, aggregation, and CPU/GPU tolerance.
- [ ] Commit language-neutral boundary and pairwise fixtures under `P01-019`.
- [ ] Make the reference interpreter pass every numeric fixture under `P01-020`.
- [ ] Differential-test the declared MongoDB subset under `P01-021`.
- [ ] Prove HDoc/SDK/protocol lossless round trips in their governing phases.
- [ ] Prove index, grouping, CPU/optimized, and GPU-fallback equivalence.
- [ ] Complete independent semantic review at `G01`.

## Implementation impact

- Semantic tasks: `P01-003`, `P01-004`, `P01-012`, `P01-014`, `P01-015`, `P01-019`, `P01-020`.
- Physical work: `P03-*`, `P07-*`, `P08-*`, `P09-*`, `P10-*`, `P12-*`.
- Requirements: `DATA-001`, `QUERY-001`, `CORE-003`, `INV-002`, `GPU-002`.
- Gate: `G01` and later physical/backend gates.

## Follow-up work

- [ ] Implement the `P01-004` special-value and deterministic-reduction fixtures under `P01-019` and `P01-020` before exposing float arithmetic.
- [ ] Assign physical ordered numeric encodings under `P08-001` only after fixtures pass.
- [ ] Record adapter differences in `P01-022` and `P22-*`.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [Logical value model](../architecture/value-model.md)
- [Numeric semantic contract](../architecture/numeric-semantics.md)
- [Special-value semantic contract](../architecture/floating-special-semantics.md)

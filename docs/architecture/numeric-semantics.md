# Integer, Decimal, and Mixed Numeric Semantics

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-003`
- Governing requirements: `DATA-001`, `QUERY-001`
- Governing gate: `G01`
- Decision: [ADR 0002](../adr/0002-exact-numeric-semantics.md)
- Normative parent: [logical value model](value-model.md)

This document defines integer width, numeric literal typing, implicit coercion, checked arithmetic, decimal promotion, explicit conversion, and exact mixed finite-number comparison. Floating-point special values, signed zero, hashing details, aggregation tolerance, and CPU/GPU floating behavior are defined by [Floating-Point and Decimal Special-Value Semantics](floating-special-semantics.md) without weakening the no-silent-loss rules here.

## Numeric types

The v1 numeric family contains exactly four logical types:

| Type | Domain summary | Precision model |
| --- | --- | --- |
| `int32` | Signed 32-bit integer | Exact |
| `int64` | Signed 64-bit integer | Exact |
| `float64` | IEEE 754 binary64 | Binary floating point |
| `decimal128` | IEEE 754 decimal128 | 34-digit decimal floating point |

Logical type identity is retained on storage and ordinary round trip. Numeric operators may compare different numeric types as mathematical numbers or produce a promoted result according to this contract; neither behavior changes the stored operand types.

Boolean, null, string, binary, date, timestamp, identifiers, arrays, objects, and vectors are not scalar numeric values. There is no implicit truthiness, string parsing, timestamp arithmetic, or array-to-vector numeric coercion.

## Literal and input typing

Typed protocols and SDK wrappers preserve the caller's explicit numeric type. For ordinary JSON input, the parser retains the original number token until validation and applies these deterministic rules:

| JSON token form | Inferred logical type |
| --- | --- |
| Integer grammar without fraction/exponent, within `int32` | `int32` |
| Integer grammar without fraction/exponent, outside `int32` but within `int64` | `int64` |
| Integer grammar outside `int64` | Validation error; use typed decimal input if representable |
| Token with fraction or exponent | `float64`, if the parsed finite/special policy permits it |

Ordinary JSON has no decimal type. A decimal requires the versioned typed wrapper or an SDK `decimal128` value. Likewise, a JavaScript `number` cannot carry an arbitrary `int64`; JavaScript SDKs require `bigint` or an exact wrapper and reject unsafe integer `number` inputs.

Lexical spelling does not create a fifth numeric type. Typed encodings are required when a caller needs `int64(1)`, `float64(1)`, or `decimal128(1)` rather than the ordinary JSON inference for `1`.

## Implicit coercion boundary

Implicit conversion exists only inside a declared numeric operator. Writes, replacement documents, index keys, protocol decoding, and SDK serialization do not silently retag values.

### Arithmetic common type

For addition, subtraction, multiplication, and unary negation where the operator supports them:

| Operand types | Common/result type rule |
| --- | --- |
| Only `int32` | Compute exactly; return `int32` if representable, otherwise widen once to `int64` if representable |
| Any `int64`, otherwise integers only | Compute exactly as `int64`; out-of-range is an error |
| Integer plus `decimal128` | Convert the integer exactly and compute as `decimal128` |
| Only `decimal128` | Compute in the decimal128 context |
| Integer plus `float64` | Allowed only when each integer operand is exactly representable as binary64; compute as `float64` |
| Only `float64` | Compute as binary64 under `P01-004` |
| `decimal128` plus `float64` | No implicit common type; typed coercion error |

The same table applies independent of operand order. It is not a general cast ladder: in particular, `decimal128` is not implicitly routed through binary64, and a large `int64` is not silently rounded to binary64.

Division, remainder, power, bitwise operations, and averaging require operator-specific result rules under `P01-012` or `P01-015`; their presence must not be inferred from this table.

### Exact binary64 representability of an integer

An integer is eligible for implicit float arithmetic only if converting it to binary64 and back yields the same mathematical integer. This includes all integers through 53 significant binary digits and some larger multiples, rather than relying on a magnitude-only shortcut.

Examples:

```text
int64(9_007_199_254_740_992)  can convert exactly to float64
int64(9_007_199_254_740_993)  cannot convert exactly to float64
```

An explicit rounded conversion can handle the latter; implicit arithmetic cannot.

## Integer overflow and underflow

Integer arithmetic is checked and never wraps, saturates, truncates, or depends on build profile.

| Condition | Result |
| --- | --- |
| `int32` result fits `int32` | Return `int32` |
| `int32` result misses `int32` but fits `int64` | Return widened `int64` |
| Integer result exceeds `int64::MAX` | `NumericOverflow` error |
| Integer result is below `int64::MIN` | `NumericUnderflow` error |
| Negating `int32::MIN` | Widen and return `int64(2147483648)` |
| Negating `int64::MIN` | `NumericOverflow` error |

The operation is atomic: an overflow/underflow error aborts the containing update or command and publishes no partial document, index, sidecar, WAL, or replicated mutation. Batch ordered/unordered behavior is separately defined by the command contract, but an individual document mutation is never partly applied.

## Decimal128 promotion and arithmetic

Every `int32` and `int64` value converts exactly to decimal128 because the integer domains fit within its decimal precision. Therefore an integer/decimal operation always promotes the integer without loss.

Decimal arithmetic uses one engine-wide IEEE decimal128 context:

- Precision is 34 decimal digits.
- Adjusted normal exponents span -6143 through 6144; exact canonical coefficient/exponent and subnormal bounds are defined by `P01-004`.
- The default rounding mode is round to nearest, ties to even.
- No host locale influences parsing, formatting, rounding, or decimal point.
- Exponent overflow is `NumericOverflow`; infinity is not silently substituted for a finite operation.
- Gradual underflow/subnormal results are retained when representable.
- If a nonzero exact result rounds to signed zero because it is below the representable domain, the operation returns `NumericUnderflow` rather than silently storing zero.
- Invalid operations and special values follow `P01-004`.

Rounding within the finite representable decimal128 context is part of decimal arithmetic, not a type conversion. Tests record exact operands, result encoding, and rounding-boundary cases.

## Float overflow and underflow boundary

Binary64 arithmetic does not inherit integer or decimal trapping rules. `P01-004` defines when binary64 produces infinity, subnormal values, signed zero, or NaN and how those results participate in writes, queries, aggregation, hashing, and GPU fallback.

That contract is accepted in [ADR 0002](../adr/0002-exact-numeric-semantics.md) and the executable `P01-004`/`P01-019`/`P01-020` semantic baseline. An implementation may expose binary64 arithmetic only when it reproduces those special-result, reduction, comparison, and hashing fixtures exactly. Optimized CPU and GPU paths remain subject to their later equivalence gates.

## Exact mixed numeric comparison

All finite scalar numeric types share one mathematical comparison domain. Equality and ordering compare exact represented values, not values after conversion to a convenient host type.

Required algorithmic behavior:

- Integers compare by exact signed magnitude.
- An integer and binary64 compare using the float's sign, significand, and binary exponent; the integer is never first cast to float.
- An integer and decimal128 compare by exact coefficient/exponent scaling.
- A finite binary64 and decimal128 compare as exact rational values using bounded big-integer/scaled comparison; neither is first cast to the other.
- Signed finite zero compares numerically equal across numeric types; its special identity behavior is refined by `P01-004`.
- NaN and infinities use the rules in `P01-004`.

Consequences:

```text
int32(1) == int64(1) == float64(1.0) == decimal128(1)
int64(9_007_199_254_740_993) != float64(9_007_199_254_740_992)
decimal128(0.1) != the exact value represented by float64(0.1)
```

The first line states operator equality, not logical type identity. `$type` continues to distinguish all four values.

## Ordering, indexes, grouping, and hashing

Numeric types occupy one contiguous scalar comparison class. Index and sort encodings must make exact mathematical order primary while retaining enough type/payload information for lossless reconstruction.

When numeric operator equality says two finite values are equal:

- `$eq`, `$in`, unique constraints, numeric index lookup, group keys, distinct values, and comparison-key hashes treat them as the same numeric key.
- Range boundaries include/exclude every equal representation consistently.
- A covering index still reconstructs the stored logical type.
- Stable sort tie-breaking is supplied by `P01-017`, not by accidental numeric type rank.

The engine maintains separate hash purposes:

```text
typed_value_hash       includes the logical type and exact payload
numeric_comparison_hash canonicalizes values equal under numeric operators
```

Document canonical hashing uses the former unless the later object/array contract explicitly requests semantic comparison hashing. Hash maps used by `$group`, distinct, uniqueness, and numeric equality use the latter and must confirm equality after a hash match.

## Explicit numeric conversion

Conversion operators are explicit and checked. The default mode is `exact`; a separate `round` mode must be named when loss is accepted.

| Source → target | Exact-mode rule |
| --- | --- |
| Integer → narrower integer | Range check; otherwise error |
| Integer → wider integer | Exact |
| Integer → decimal128 | Exact |
| Integer → float64 | Require exact binary64 representation |
| Finite float64 → integer | Require a mathematically integral, in-range value |
| Finite decimal128 → integer | Require a mathematically integral, in-range value |
| Float64 ↔ decimal128 | Require the exact represented value to exist in the target domain |
| Numeric → string | Canonical locale-independent rendering |
| String → numeric | Explicit parser, canonical grammar, full consumption, range check |

Rounded conversion requires an explicit target and rounding policy. It cannot be selected by a compatibility adapter without that adapter's documented upstream rule. Null and missing propagate only when the conversion operator expressly says so; invalid strings and out-of-range values are errors, not null.

## Backend obligations

- The reference interpreter implements comparison independently from optimized index, SIMD, or GPU encodings.
- Native and Wasm hosts use the same test vectors and result/type hashes.
- WebGPU paths may execute only numeric cases proven exact for the active capability profile.
- Lack of shader `i64`, `f64`, decimal, or sufficient intermediate width triggers CPU fallback or verified candidates; it never authorizes narrowing.
- Zone maps and index bounds must be conservative across mixed numeric representations.
- Serialization libraries cannot use host-language JSON-number round trips as an intermediate canonical form.

## Required fixtures

The semantic corpus includes at least:

- `int32`/`int64` minima, maxima, zero, and both widening boundaries.
- Every operation immediately below, at, and above a width boundary.
- Exact and inexact integer-to-float cases around `2^24`, `2^53`, and the `int64` limits.
- Decimal precision, exponent, subnormal, rounding-tie, overflow, and underflow boundaries.
- Pairwise equality and ordering across every finite numeric type.
- Decimal/binary fractions such as `0.1`, exact powers of two/ten, and adjacent representable values.
- Implicit-coercion accept/reject cases and every explicit conversion direction.
- Numeric equality index lookup, range scan, uniqueness, grouping, distinct, sort, and hash behavior.
- Atomic failure of updates/aggregations on numeric error.
- CPU/reference/optimized/GPU-fallback result, error, type, and canonical hash agreement.

## Follow-up ownership

| Plan item | Remaining numeric responsibility |
| --- | --- |
| `P01-004` | NaN, infinities, signed zero, float/decimal specials, float hashing, aggregation, and CPU/GPU tolerances |
| `P01-012` | Operator grammar and full scalar truth tables |
| `P01-014` | Update-operator application and atomic conflicts |
| `P01-015` | Accumulator state/finalization rules |
| `P01-016` | Stable public numeric error category/codes |
| `P01-019` | Language-neutral edge fixtures |
| `P08-001` | Physical ordered numeric index encoding |

No follow-up may introduce implicit lossy conversion or wrapping arithmetic without superseding ADR 0002 and versioning the affected semantic contract.

# Floating-Point and Decimal Special-Value Semantics

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-004`
- Governing requirements: `QUERY-001`, `CORE-003`, `INV-002`, `GPU-002`
- Governing gate: `G01`
- Decision: [ADR 0002](../adr/0002-exact-numeric-semantics.md)
- Normative parents: [logical value model](value-model.md) and [integer/decimal numeric semantics](numeric-semantics.md)

This document defines admitted `float64` and `decimal128` special values, canonical results, signed zero, equality, total ordering, hashing, arithmetic, aggregation, and CPU/GPU tolerance. It replaces host-language behavior with one database semantic contract.

## Goals and non-goals

The contract must:

- Round-trip admitted values without accidental JSON or host-number conversion.
- Give indexes, grouping, uniqueness, sort, and hashes an equivalence relation and total order.
- Produce deterministic public results across Rust, Wasm, JavaScript hosts, and GPU-assisted plans.
- Prevent relaxed shader math or scheduling order from changing matches or persisted values.
- Keep exact payload identity available where the logical type promises it.

It does not define `f32`/`f16` vector scoring; `P01-010` defines vector-specific precision and top-k behavior.

## Admitted logical values

### Binary64 (`float64`)

Every 64-bit IEEE 754 binary64 encoding is admitted as an input value, including:

- finite normal and subnormal values;
- positive and negative zero;
- positive and negative infinity;
- quiet NaNs and signaling-NaN bit patterns with either sign and any nonzero payload.

Storage and typed round trip preserve all 64 input bits. Merely decoding, copying, hashing, indexing, exporting, backing up, replicating, or returning a float must not execute a host floating operation that quiets or rewrites a NaN.

Arithmetic never emits an arbitrary payload. Any operation whose result is NaN emits the canonical quiet NaN bits:

```text
0x7ff8_0000_0000_0000
```

Consuming a stored signaling-NaN pattern does not raise a host trap; the semantic operation treats it as NaN and produces the canonical quiet NaN when a numeric result is required.

### Decimal128 (`decimal128`)

The logical decimal domain admits:

- finite decimal128 values;
- positive and negative zero;
- positive and negative infinity;
- one canonical quiet NaN value.

Decimal cohort and encoding aliases are canonicalized to a logical tuple rather than preserved as arbitrary interchange bits:

```text
finite: sign, canonical coefficient, canonical exponent
zero:   sign, coefficient 0, exponent 0
special: +Infinity | -Infinity | NaN
```

For a nonzero finite value, trailing coefficient zeros are removed while the exponent can be increased within the decimal128 domain. Decimal quantum/declared scale is not part of the logical value; applications needing a separate scale store it explicitly. Decimal NaN sign, signaling state, and payload are not logical data and noncanonical physical encodings are rejected or canonicalized by an explicitly versioned import path before storage.

The exact canonical finite tuple domain is:

```text
precision p = 34 decimal digits
1 <= coefficient_digits <= 34
coefficient has no leading or trailing zero
-6176 <= exponent
exponent + coefficient_digits - 1 <= 6144
value = (-1)^sign * coefficient * 10^exponent
```

Thus the smallest positive subnormal is `1 × 10^-6176`, the smallest positive normal is `1 × 10^-6143`, and the largest finite value is `(10^34 - 1) × 10^6111`. Zero alone uses coefficient/exponent `0/0` with a retained sign. The adjusted normal exponent bounds are -6143 through 6144; the lower quantum exponent admits 33 subnormal decades. These parameters match the decimal128 precision/exponent characteristics documented by the [WG14 decimal floating proposal](https://www.open-std.org/jtc1/sc22/wg14/www/docs/n1016.htm) and the [decNumber decimal128 context](https://speleotrove.com/decimal/dncont.html).

## Three notions of identity

The engine keeps these purposes separate:

| Purpose | Float behavior | Decimal behavior |
| --- | --- | --- |
| Typed payload identity | Exact 64 bits, including zero sign and NaN payload/signaling bits | Canonical decimal tuple/special, including zero sign |
| Numeric operator equality | Database rules below | Database rules below |
| Approximate diagnostic comparison | Only for non-authoritative experiment reporting | Only where explicitly configured; never query truth |

Typed payload identity supports lossless HDoc/SDK/backup round trips. Numeric equality supports query predicates, grouping, indexes, and uniqueness. Approximate comparison cannot be used as equality or persisted semantics.

## Database numeric equality

Numeric `$eq` is reflexive, symmetric, and transitive for all admitted numeric values:

- Every NaN compares equal to every other NaN across float64 and decimal128.
- Positive and negative zero compare equal to one another and to integer/decimal/float zero.
- Positive infinity compares equal across float64 and decimal128; likewise negative infinity.
- Finite nonzero values use the exact mixed numeric comparison in `P01-003`.

`$ne`, `$in`, `$nin`, grouping, distinct, numeric unique constraints, and numeric comparison hashes use that same equivalence relation. `$type` and typed payload inspection still distinguish types and preserved float bit patterns.

This database equality intentionally differs from a raw IEEE predicate where NaN is unequal to itself. A non-reflexive equality cannot safely define hash keys, unique constraints, group membership, or deterministic query fixtures.

## Total numeric order

Ascending numeric order is:

```text
-Infinity
< finite negative values
< all numeric zeros
< finite positive values
< +Infinity
< NaN
```

All values equal under numeric equality occupy the same comparison position. NaN sign, signaling state, payload, source type, and decimal encoding do not subdivide the numeric order. Descending order reverses this sequence.

Combined with the missing/null contract, the relevant ascending prefix is:

```text
Missing < Present(null) < Present(-Infinity) < ... < Present(NaN)
```

Stable document/result tie-breaking under `P01-017` resolves equal comparison keys. Typed payload bits are not an implicit sort tie-breaker.

## Hashing and canonical keys

Two hashes remain mandatory:

### `typed_value_hash`

- Float64 hashes its exact 64 stored bits, so `+0`, `-0`, and distinct NaN encodings may differ.
- Decimal128 hashes its canonical tuple; positive/negative zero differ and all admitted decimal NaNs are already canonical.
- The logical type tag is included.

### `numeric_comparison_hash`

- All numeric zeros hash to one key.
- All numeric NaNs hash to one key.
- Same-sign infinities hash together across float/decimal.
- Equal finite values hash together across integer, float, and decimal types.

Hash equality is only a candidate for value equality; collision confirmation uses the numeric comparator. Index and group-key encodings apply the same canonical categories.

## Binary64 arithmetic

Supported scalar binary64 arithmetic uses IEEE 754 round-to-nearest, ties-to-even with gradual underflow. Observable rules include:

- Finite overflow produces signed infinity.
- Finite inexact underflow may produce a subnormal or signed zero.
- Invalid operations produce the canonical quiet NaN.
- Any NaN operand produces the canonical quiet NaN result.
- Operations involving infinity follow the normal extended-real/invalid cases for the operator.
- Division by signed zero, when division is introduced, produces signed infinity for a nonzero finite numerator and canonical NaN for zero divided by zero.
- Unary negation flips the sign bit for non-NaN inputs, including zero; a NaN input produces the canonical quiet NaN.

The engine does not expose or persist IEEE exception flags or host floating environment state. Host rounding-mode changes cannot affect the engine.

Compiler fast-math, reassociation, implicit contraction, flush-to-zero, and host-dependent extended precision are forbidden in authoritative numeric paths unless the reference semantic explicitly specifies the same operation and bit result.

## Decimal128 arithmetic with specials

Finite decimal behavior remains the checked context in `P01-003`: 34 digits, round-to-nearest ties-to-even, finite overflow error, gradual underflow where representable, and underflow error when a nonzero exact result would silently become zero.

Explicit special operands follow these rules:

| Operation class | Result |
| --- | --- |
| Any operation with NaN | Canonical decimal NaN |
| `+Infinity + -Infinity` or reverse | Canonical decimal NaN |
| Same-sign infinity addition | That infinity |
| Finite plus infinity | That infinity |
| Infinity multiplied by zero | Canonical decimal NaN |
| Infinity multiplied by finite nonzero | Infinity with computed sign |
| Infinity divided by infinity | Canonical decimal NaN |
| Finite nonzero divided by signed zero | Signed infinity when division is supported |
| Zero divided by zero | Canonical decimal NaN |

Operator-specific division/remainder/power availability remains `P01-012`. These rows define results only once an operator is supported.

Finite decimal overflow remains an error rather than silently manufacturing infinity. An explicitly stored infinity is nevertheless a valid operand and result under the table above.

## Serialization and typed input

Ordinary JSON number syntax cannot represent NaN or infinity and common serializers erase negative-zero or NaN payload identity. Therefore:

- Ordinary JSON accepts only finite JSON-number tokens under the inference rules in `P01-003`.
- Ordinary JSON `-0` follows integer-token inference and becomes `int32(0)`; preserving float or decimal negative zero requires typed input.
- Non-finite float/decimal values and exact float bit identity require a versioned typed wrapper or native SDK type.
- The float wrapper must have an exact-bits form capable of preserving all 64 bits; human-readable `NaN`/`Infinity` aliases may map to canonical bit patterns.
- Decimal strings use locale-independent `NaN`, `Infinity`, `-Infinity`, signed zero, coefficient, exponent, and canonical formatting rules.
- JSON `null`, omitted members, string spellings such as `"NaN"`, and numeric specials never coerce into one another implicitly.
- Logs and diagnostics print a canonical class and optionally redacted bit/exponent metadata; they do not rely on host default formatting.

The exact public wrapper/tag syntax is frozen with the versioned protocol and HDoc fixtures.

## Index, uniqueness, and zone-map behavior

- Numeric ordered indexes implement the total order and numeric equality classes above.
- A lookup for NaN finds every numeric NaN representation in the indexed path.
- A unique numeric index permits only one value from each numeric equality class, so distinct NaN payloads conflict and `+0` conflicts with `-0` and integer zero.
- Covering reads retain stored type/payload identity even when comparison keys normalize it.
- Zone-map minima/maxima use the total order. A chunk containing NaN records an explicit NaN-present flag; an ordinary finite max alone cannot represent that fact.
- Bloom filters and hash indexes use `numeric_comparison_hash` for numeric predicates.
- Decimal noncanonical cohorts cannot create duplicate logical index keys.

Any lossy physical key is candidate-only and requires row verification.

## Aggregation and deterministic reduction

Aggregation processes numeric specials consistently:

- `$min` and `$max` use total numeric order; NaN can therefore be the maximum, and a set containing only NaNs returns NaN.
- Float `$sum`/`$avg` with any NaN contribution returns canonical float NaN.
- Opposite-sign infinities in the same float sum return canonical float NaN; otherwise an infinity dominates finite terms with its sign.
- Decimal special contributions follow the decimal table above.
- A mixed float/decimal accumulator is rejected unless the pipeline contains an explicit conversion.
- Missing/null handling follows `P01-002`; accumulator result types and empty-input results are finalized by `P01-015`.

Finite floating reduction uses the v1 deterministic reduction algorithm:

1. Assign stable logical input ordinals before parallel execution.
2. Partition numeric contributions into consecutive chunks of 1,024 by logical ordinal.
3. Accumulate each chunk as a left fold in ordinal order with the specified binary64 operations and no reassociation/contraction.
4. Combine chunk results in a balanced left-to-right binary tree; an unpaired rightmost chunk advances unchanged at each level.
5. Canonicalize any arithmetic NaN result.
6. Return the exact reference bits or fall back to the reference implementation.

Worker count, shard arrival order, GPU workgroup scheduling, and host iteration order cannot change the public result. Distributed partial aggregation must carry enough state/ordinal metadata to reproduce the same merge or must perform authoritative finalization on a conforming CPU path.

## CPU/GPU exactness and tolerance

CPU defines authoritative scalar semantics. Tolerance never changes database truth.

| Use | Allowed difference from reference |
| --- | --- |
| Filter comparison, `$eq`, range membership | 0; identical Boolean result |
| Sort/group/index/unique/hash key | 0; identical equality class and order |
| Persisted arithmetic/update result | 0 ULP; identical canonical bits/tuple |
| Public aggregate result | 0 ULP; identical canonical bits/tuple |
| GPU/optimized candidate pruning | May be conservative only; no false negatives; final CPU verification required |
| Non-authoritative experiment diagnostic | At most 4 ULP for finite binary results, with exact special class and sign-of-infinity; reported, never accepted as semantic proof |

The 4-ULP diagnostic envelope is not a query option, compatibility promise, or license to publish approximate values. It helps classify experimental kernel drift. Any candidate outside it fails that experiment; any candidate inside it still requires exact final verification unless a later kernel proof establishes bit identity.

For a comparison threshold, tolerance expands a candidate set rather than moving the threshold. Boundary candidates are fetched and evaluated by the reference comparator. NaN, infinity, signed zero, subnormal, and cancellation-heavy cases are always included in backend differential tests.

WebGPU capability profiles lacking exact representation or operations select CPU fallback. Shader `fast` behavior, flush-to-zero, or implementation-dependent contraction cannot be masked by tolerance.

## Required fixtures

The semantic corpus includes:

- Both zeros, both infinities, minimum/maximum finite values, minimum normal/subnormal values, and adjacent values around zero and overflow.
- Multiple quiet/signaling NaN encodings, signs, and payloads for float64 input/round trip.
- Canonical decimal zero signs, cohorts, infinities, NaN, precision ties, and exponent boundaries.
- Full pairwise equality/order/hash classes across integer, float, and decimal zero/infinity/NaN cases.
- Arithmetic matrices for finite/special operands and canonical result bits.
- `$eq`, `$ne`, `$in`, sort, group, distinct, unique index, range scan, zone map, min, max, sum, and average behavior.
- Fixed-tree reduction across worker counts, partitions, chunk boundaries, host/Wasm, and shuffled physical completion order.
- GPU candidate envelopes, boundary false-negative checks, CPU verification, and fallback reason codes.
- Exact typed round trip through every HDoc, SDK, protocol, backup, restore, replication, and migration version.

## Conformance and severity

An authoritative result that differs in match membership, equality class, order, hash/group key, error, logical type, or canonical result bits is a correctness failure. Tolerance is never cited to waive it. A backend that cannot conform must fall back, act only as a conservative candidate producer, or return a typed unsupported/capability error.

Silent NaN normalization during a promised exact float round trip, loss of negative-zero identity, flush-to-zero in stored results, or schedule-dependent aggregation is an `S1` defect and blocks the governing gate.

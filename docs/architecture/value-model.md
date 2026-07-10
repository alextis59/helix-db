# HelixDB Logical Value Model

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-001`
- Governing gate: `G01`
- Normative parent: [Specifications section 7.2](../../Specifications.md#72-supported-value-types)

This document defines the complete set of logical values that HelixDB can represent. It defines type identity and each type's value domain. Later Phase 1 tasks refine missing/null behavior, numeric promotion, floating-point comparison, temporal precision, strings/collation, object canonicalization, arrays, identifiers, vectors, and limits without adding accidental types.

## Core principles

1. Every stored value has one explicit logical type.
2. A value's logical type survives HDoc encoding, indexes, sidecars, queries, SDKs, backup/export, replication, and restore unless a user-requested conversion explicitly changes it.
3. JSON syntax is an input/output representation, not the type system. Values that ordinary JSON cannot distinguish require a versioned typed representation.
4. Missing is path-evaluation state, not a storable value and not an alias for null.
5. Objects and arrays may contain heterogeneous logical values recursively.
6. Derived encodings may optimize a value only when the original logical type and exact semantic value remain recoverable.
7. CPU, GPU, embedded, server, adapter, and distributed paths use this same model.
8. Invalid or unsupported values fail explicitly; they are not silently converted to strings, null, or a narrower numeric type.

## Type inventory

| Stable type name | Logical domain | Fixed/variable width | Ordinary JSON is lossless | Required v1 |
| --- | --- | --- | --- | --- |
| `null` | The single null value | Fixed logical singleton | Yes | Yes |
| `bool` | `false` or `true` | Fixed | Yes | Yes |
| `int32` | Signed 32-bit integer | Fixed | Conditionally | Yes |
| `int64` | Signed 64-bit integer | Fixed | No for the full domain | Yes |
| `float64` | IEEE 754 binary64 payload/value | Fixed | No for all payloads/special values | Yes |
| `decimal128` | IEEE 754 decimal128 decimal value | Fixed | No | Yes |
| `string` | Valid Unicode text represented as UTF-8 | Variable | Yes after valid JSON escaping | Yes |
| `binary` | Byte sequence plus subtype | Variable | No | Yes |
| `object` | Finite mapping/field sequence from names to values | Variable/recursive | Conditionally | Yes |
| `array` | Finite ordered sequence of values | Variable/recursive | Conditionally | Yes |
| `timestamp` | Absolute UTC instant | Fixed logical scalar | No without typed precision contract | Yes |
| `date` | Calendar date without time-of-day or timezone | Fixed logical scalar | No | Yes |
| `uuid` | 128-bit universally unique identifier value | Fixed | No | Yes |
| `objectId` | 12-byte opaque object identifier | Fixed | No | Yes |
| `vector<f32,N>` | Fixed-dimension ordered binary32 vector | Fixed for a given `N` | No | Yes |
| `vector<f16,N>` | Fixed-dimension ordered binary16 vector | Fixed for a given `N` | No | Yes where supported for storage; execution may fall back |

Stable type names are case-sensitive in machine contracts and are the canonical names used by `$type`, fixtures, diagnostics, compatibility matrices, and format documentation. SDKs may expose idiomatic aliases but must map them unambiguously.

## Missing path state

`missing` is an internal result produced when a field/path does not exist. It is not part of the stored value inventory.

Consequences:

- Users cannot insert a “missing” literal.
- A missing path and a present path containing `null` remain distinguishable.
- Index and sidecar encodings use presence/missing metadata rather than a fake value.
- Projection may omit a missing field; it does not materialize null unless an explicit operator requests that transformation.
- `$exists`, comparison, sorting, arrays, updates, and aggregation receive their detailed missing/null truth tables under `P01-002`.

## Scalar types

### `null`

`null` contains no payload. There is exactly one logical null value.

Null is a stored, present value. It differs from a missing path, an absent array element, an empty string, zero, false, an empty object, and an empty array.

### `bool`

`bool` has exactly two values: `false` and `true`.

Numeric zero/one and strings such as `"true"` are not Boolean values. Any conversion must be requested through a specified conversion operator; implicit truthiness is not part of the database value model.

### `int32`

`int32` is a signed two's-complement logical integer in the inclusive domain:

```text
-2,147,483,648 through 2,147,483,647
```

The logical type remains `int32` after round trip even when the same mathematical integer is representable as `int64`, `float64`, or `decimal128`.

### `int64`

`int64` is a signed two's-complement logical integer in the inclusive domain:

```text
-9,223,372,036,854,775,808 through 9,223,372,036,854,775,807
```

SDK/JSON boundaries must not route the full domain through an imprecise host number type. Promotion, coercion, arithmetic overflow, and mixed numeric comparison are defined by `P01-003`.

### `float64`

`float64` carries an IEEE 754 binary64 payload and represents finite values, signed zero, positive/negative infinity, and NaN payload classes admitted by the canonical format.

The value model preserves enough information to implement the canonicalization chosen under `P01-004`. Until that decision is frozen, encoders must not silently normalize NaN payloads or negative zero merely because a host language does.

### `decimal128`

`decimal128` represents an IEEE 754 decimal128 decimal value, including its decimal exponent/coefficient domain and any supported special values. It exists for exact decimal-oriented application values that must not be routed through binary floating point.

Canonical cohort selection, special values, numeric promotion, equality, ordering, arithmetic, hashing, and string conversion are specified under `P01-003` and `P01-004`.

### `string`

`string` is a finite sequence of Unicode scalar values with a valid UTF-8 storage representation. Invalid UTF-8 is never a string; it may be stored as `binary` when the caller explicitly supplies bytes.

Normalization, byte preservation, equality, ordering, collation, case behavior, regex, indexing, length semantics, and invalid host strings are specified under `P01-006`.

### `binary`

`binary` contains:

```text
subtype: u8 logical identifier
bytes: finite sequence of octets
```

Subtype `0` is the generic byte sequence. Other subtype assignments require a versioned registry in the HDoc format. Unknown subtypes remain binary values and are either preserved or rejected according to the containing format/profile; they are never decoded as another logical type by guesswork.

Binary equality and ordering operate on explicit subtype/byte semantics defined with the comparison contract. Binary is not implicitly UTF-8, UUID, ObjectId, vector, encrypted payload, or compressed document.

### `timestamp`

`timestamp` is an absolute instant on the UTC timeline. Its logical value contains no presentation timezone.

`P01-005` freezes epoch, precision, accepted input offsets, leap-second policy, range, formatting, clock-source, and conversion behavior before the HDoc encoding is assigned.

### `date`

`date` is a proleptic calendar date containing year, month, and day with no time-of-day and no timezone. It does not mean midnight in the server's, client's, or UTC timezone.

The calendar system, range, parsing, formatting, date/timestamp conversion, and invalid-date behavior are frozen by `P01-005`.

### `uuid`

`uuid` is an opaque 128-bit identifier value. Its logical identity is the 16-byte value, not the input text's case, braces, or hyphen style.

The canonical text rendering is the lower-case hyphenated 8-4-4-4-12 form. Accepted UUID variants/versions, generation, byte order, ordering, and malformed input are specified by `P01-009`. HDoc and binary protocols use one documented network/canonical byte order and never host-struct memory layout.

### `objectId`

`objectId` is an opaque 12-byte identifier compatible in shape with the common MongoDB ObjectId value domain. The logical value is the bytes.

The canonical text rendering is 24 lower-case hexadecimal digits. Generation layout, timestamp extraction (if exposed), ordering, accepted inputs, and collision behavior are specified by `P01-009`. Code must not infer generation semantics from arbitrary user-supplied bytes unless the public contract explicitly permits it.

## Container types

### `object`

An object is a finite collection of named fields whose values are any logical value, including nested objects and arrays.

The logical model retains field names and the information necessary for deterministic canonicalization. Ordinary writes do not gain permission to store duplicate names merely because an import parser can observe them. Field ordering, duplicate rejection/import behavior, canonical hashing, name validation, and path interaction are specified by `P01-007`.

System fields such as `_id`, `_v`, and `_ts` use this same value model but may have protected mutation/visibility rules.

### `array`

An array is a finite, ordered, zero-based sequence of logical values. Elements may have different types and may include null, objects, arrays, and vectors. There is no stored “missing element” value; sparse host-language arrays must be rejected or converted under an explicit input rule.

Array equality/ordering, nested path traversal, multikey behavior, `$all`, `$size`, `$elemMatch`, update semantics, and maximum length are specified by `P01-008` and `P01-011`.

## Vector types

A vector's logical type includes both its element representation and dimension:

```text
vector<f32,N>
vector<f16,N>
```

Rules common to both:

- `N` is a positive integer fixed for that value and validated against collection/index/query constraints.
- Elements are ordered and homogeneous; they are not arbitrary array values.
- Missing components and null components are invalid.
- The logical value is preserved even if a physical CPU/GPU path widens `f16` for calculation.
- A host/device that cannot execute a representation uses an exact supported conversion only when the metric contract permits it, otherwise CPU fallback or a typed unsupported error.
- Dimension, non-finite element policy, normalization, metrics, tolerances, indexing, and top-k tie behavior are specified by `P01-010`.

Vectors remain distinct from arrays and binary blobs even when a physical encoding uses contiguous bytes.

## Type identity and conversion boundary

HelixDB distinguishes logical type identity from mathematical or textual resemblance:

```text
int32(1)       != same logical type as int64(1)
int64(1)       != same logical type as float64(1.0)
string("...") != binary(UTF-8 bytes)
array([f32])   != vector<f32,N>
binary(16 B)   != uuid
binary(12 B)   != objectId
date           != timestamp
null           != missing
```

The examples state type identity, not the final result of numeric comparison operators. Cross-type equality, ordering, promotion, conversions, index keys, and hashing are owned by the follow-up semantic tasks.

No ingestion layer may infer UUID, ObjectId, date, timestamp, decimal, vector, or binary subtype only from a string/array's shape without an explicit typed input marker or schema/API contract.

## Transport and SDK obligations

Every transport/SDK must represent all logical types without loss:

- Native typed SDKs expose explicit types or tagged wrappers.
- JSON commands use versioned extended representations for values ordinary JSON cannot preserve.
- CBOR/binary protocols map tags to the same logical types and reject unknown required tags.
- JavaScript APIs must not pass full `int64` values through `number`; use an exact integer representation.
- SDK convenience conversion never changes the stored type without an explicit documented call.
- Errors name the expected and actual stable type names without dumping sensitive values.

The exact JSON/CBOR wrappers and protocol tags are frozen with the command/protocol work under `P07-001` and `P12-002`. Until then, documentation examples are illustrative rather than public wire contracts.

## Illustrative implementation shape

The following pseudocode demonstrates exhaustiveness; it is not a frozen Rust public API or HDoc tag assignment:

```rust
enum Value {
    Null,
    Bool(bool),
    Int32(i32),
    Int64(i64),
    Float64(Float64Bits),
    Decimal128(Decimal128Bits),
    String(Utf8String),
    Binary { subtype: u8, bytes: Bytes },
    Object(ObjectValue),
    Array(Vec<Value>),
    Timestamp(TimestampValue),
    Date(DateValue),
    Uuid([u8; 16]),
    ObjectId([u8; 12]),
    VectorF32(Vector<f32>),
    VectorF16(Vector<f16>),
}
```

An internal path evaluator additionally uses a `Missing` state that cannot be serialized as `Value`.

## Physical representation obligations

HDoc, index, sidecar, GPU, backup, and replicated representations may differ physically, but each must document:

- Supported logical types and required feature/version.
- Exact reconstruction or allowed verified-candidate behavior.
- Presence/missing/null metadata.
- Canonical byte order and alignment.
- Special numeric and invalid-payload behavior.
- Type and dimension metadata for vectors.
- Unknown type/feature rejection.
- Round-trip and cross-path fixture coverage.

An index or sidecar may omit unsupported/mixed values only when the planner includes a complete delta/row path; it may never silently omit them from query semantics.

## Conformance obligations

The semantic corpus will contain, for every type:

- Minimum, maximum, zero/empty, representative, and invalid values as applicable.
- Nested object/array occurrences.
- Exact typed round trips through the reference interpreter and later HDoc/SDK/protocol layers.
- Type inspection through `$type`.
- Explicit rejection of missing, malformed, ambiguous, unsupported, and out-of-domain input.
- Cross-host result/type hashes.

Later tasks add operator-specific expected results. `P01-001` is complete when the inventory and domains above are accepted; it does not pre-approve unresolved comparison or encoding choices.

## Follow-up semantic ownership

| Plan item | Refinement owned by that item |
| --- | --- |
| `P01-002` | Missing versus null truth tables across all layers |
| `P01-003` | Numeric width, promotion, coercion, overflow, and mixed comparisons |
| `P01-004` | Float/decimal specials, equality, ordering, hashing, and tolerances |
| `P01-005` | Timestamp/date epoch, precision, timezone, calendar, and clocks |
| `P01-006` | UTF-8, normalization, collation, and string operations |
| `P01-007` | Object order, canonical hash, duplicates, and field names |
| `P01-008` | Array comparison, traversal, and array operators |
| `P01-009` | `_id`, UUID, ObjectId generation/order/collision behavior |
| `P01-010` | Vector dimensions, elements, metrics, normalization, and tolerance |
| `P01-011` | Size, depth, count, name, path, array, vector, and command limits |

These refinements may narrow admitted inputs or define operations, but adding/removing a logical type or changing its fundamental domain requires normative change control.

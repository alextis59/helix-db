# V1 Query Operator Grammar and Truth Tables

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-012`
- Governing requirements: `DATA-002`, `QUERY-001`, `QUERY-002`, `INV-002`
- Governing gate: `G01`
- Limit profile: [limits-v1](limits-v1.md)

This document defines the native v1 filter/operator grammar and observable truth tables. It composes the accepted value, missing/null, numeric, string, object, array, time, identifier, vector, and limit contracts into one two-valued reference model shared by every API/backend.

## Evaluation outcomes

Command parsing/validation produces either a valid normalized operator AST or a typed command error. A valid AST evaluated for one document produces:

```text
Match
NoMatch
RuntimeError(error)
```

There is no SQL `UNKNOWN` result.

- Missing/type mismatch normally produces `NoMatch` as specified below.
- Invalid operator name/shape/operand/options/limits produce a command validation error, not per-document `NoMatch`.
- Corrupt/noncanonical stored data, failed required capability, deadline, or internal invariant produces a runtime command error; it is never treated as a nonmatch.
- The entire AST is parsed/validated before execution, so Boolean short-circuiting cannot hide an invalid branch.
- Runtime errors are absorbing command failures; a true `$or`/false `$and` sibling cannot mask corruption or a required-capability failure in another semantically applicable branch.
- Filters have no side effects. Physical evaluation order may differ only when final match/error behavior is unchanged.

## Filter grammar and normalization

Conceptual native grammar:

```text
Filter := {}
        | {fieldPath: FieldPredicate, ...}
        | {$and: [Filter, ...]}
        | {$or: [Filter, ...]}
        | {$nor: [Filter, ...]}
        | {$not: Filter}
        | {$jsonSchema: SchemaV1}

FieldPredicate := literalValue
                | {fieldOperator: operand, ...}
```

Rules:

- Empty filter `{}` matches every visible/authorized document.
- Multiple ordinary field predicates at one object level are implicit `$and`.
- A literal field predicate normalizes to `$eq` against the whole resolved value.
- Multiple operators in one field predicate are separate predicates combined by AND. On a multivalue dotted path they may be satisfied by different candidates; use `$elemMatch` for same-element binding.
- Literal objects whose first-level keys begin with `$` require an explicit typed literal wrapper to avoid operator ambiguity.
- Duplicate filter/object keys are rejected by the normal duplicate-key contract.
- Unknown `$` operator/options are errors. No spelling is silently treated as a field or future operator.
- Limits apply before and after normalization/rewrite.

## Path candidate reduction

Field paths resolve under `P01-008` to zero or more ordered candidates.

| Predicate class | Multiple-candidate rule |
| --- | --- |
| Positive (`$eq`, ranges, `$in`, `$type`, string, ordinary time) | Match if any candidate matches |
| `$exists: true` | Match if at least one candidate exists |
| `$exists: false` | Match only if no candidate exists |
| `$ne` | Complement of document-level `$eq`; Match only if no candidate equals |
| `$nin` | Complement of document-level `$in` |
| Field `$not` | Complement of the complete nested field predicate |
| `$all`, `$size`, `$elemMatch`, vector operator | Apply to each candidate of required container/type; Match if any eligible candidate satisfies |
| `$ttl` | Apply its explicit missing/timestamp state table; `unbounded` may match zero candidates |

Missing means zero candidates. Explicit null remains a present candidate.

## Equality and comparison domains

### Equality

`$eq` compares:

- Numeric types in the one exact mixed numeric equality domain.
- All other values only within the same logical type, except nested values recursively use their accepted semantic equality.
- Arrays by ordered elements, objects by order-independent mapping equality, vectors only with same family/dimension, binary by subtype/bytes, identifiers by exact bytes, strings by exact UTF-8.
- Null equal only to explicit null.
- Missing equal to nothing because it is not a candidate/value.

`$ne` is the Boolean complement after candidate reduction.

### Range type bracketing

`$gt`, `$gte`, `$lt`, and `$lte` compare only compatible domains:

| Left/right types | Range-compatible |
| --- | --- |
| Any finite/special scalar numeric pair | Yes, exact numeric total order |
| Same `bool` | Yes (`false < true`) |
| Same `string` | Yes (`binary_utf8_v1`) |
| Same `binary` | Yes (subtype, then length, then unsigned bytes) |
| Same `object` | Yes (canonical field/value sequence) |
| Same `array` | Yes (lexicographic elements) |
| Same `timestamp` | Yes (microseconds) |
| Same `date` | Yes (day payload) |
| Same `uuid` | Yes (unsigned network bytes) |
| Same `objectId` | Yes (unsigned bytes) |
| Same vector family and dimension | Yes (lexicographic elements) |
| Null/missing or any other cross-type pair | No |

A valid range predicate against an incompatible stored type is `NoMatch`, not a type error. An operand that is invalid for its own declared type is a command error.

### Total sort/type order

Sorting/group canonical order requires a total rank even though range predicates type-bracket:

```text
Missing
< Null
< Bool
< Numeric
< String
< Binary
< Object
< Array
< Timestamp
< Date
< UUID
< ObjectId
< VectorF16
< VectorF32
```

Missing/null placement and descending reversal follow `P01-002`. Within a rank, use the domain order above; vectors compare dimension then elements. Equal sort keys use the `P01-017` stable tie-break.

## Comparison truth table

For one candidate `v` and valid operand `x`:

| State/relation | `$eq x` | `$ne x` | `$gt x` | `$gte x` | `$lt x` | `$lte x` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Missing path (no candidates) | false | true | false | false | false | false |
| Explicit null, `x = null` | true | false | false | false | false | false |
| Same equality class | true | false | false | true if range-compatible | false | true if range-compatible |
| Range-compatible and `v > x` | false | true | true | true | false | false |
| Range-compatible and `v < x` | false | true | false | false | true | true |
| Present but range-incompatible/unequal | false | true | false | false | false | false |

For multiple candidates, apply the candidate-reduction rules; `$ne` remains the complement of document-level `$eq` rather than “any candidate differs.”

## `$in` and `$nin`

Operand must be a literal array with at most 10,000 values.

```text
$in(values)  = OR over $eq(value_i)
$nin(values) = NOT $in(values)
```

Rules:

- `$in: []` never matches, including missing.
- `$nin: []` always matches a visible document, including missing.
- Null in the list matches explicit null only.
- Nested object/array/vector literals use whole-value equality.
- Duplicate list values do not change truth; implementations may deduplicate using semantic hashes plus equality confirmation.
- Regex/operator documents inside the list are not executable; unsupported ambiguous shapes require an explicit typed literal or are validation errors.
- List elements do not create implicit numeric/string coercion.

## Logical operators

All operands are valid normalized filters.

| Operator | Operand | Result |
| --- | --- | --- |
| `$and` | Array of filters | true iff every child matches |
| `$or` | Array of filters | true iff at least one child matches |
| `$nor` | Array of filters | true iff no child matches |
| Top-level `$not` | One filter | Boolean complement |
| Field `$not` | One field-operator object | Complement after path candidate reduction |

Empty identities:

```text
$and: []  → true
$or: []   → false
$nor: []  → true
```

`$not` never accepts a bare array/multiple operands. Runtime corruption/capability/deadline errors are not converted to truth values.

## `$exists` and `$type`

`$exists` operand is exactly Boolean:

| Path state | `$exists: true` | `$exists: false` |
| --- | ---: | ---: |
| No candidates | false | true |
| At least one candidate, including null | true | false |

`$type` operand is one stable type name or a nonempty array of at most 32 unique names. It matches when any candidate has a requested type.

Exact names:

```text
null bool int32 int64 float64 decimal128 string binary object array
timestamp date uuid objectId vector<f16> vector<f32>
```

Group aliases:

```text
number   = int32 | int64 | float64 | decimal128
integer  = int32 | int64
vector   = vector<f16> | vector<f32>
```

Dimension is inspected by a vector-specific predicate/schema, not encoded in the `$type` string. `missing` is not a type; use `$exists: false`. Unknown/case-mismatched/duplicate names or an empty list are validation errors.

## Array operator truth table

The detailed binding/nesting rules are in `P01-008`.

| Candidate | `$all: R` | `$size: N` | `$elemMatch: P` |
| --- | --- | --- | --- |
| Missing/null/non-array/vector | false | false | false |
| Present array | Every literal in `R` equals an immediate element | Immediate length equals `N` | One immediate element satisfies complete `P` |

Validation rules:

- `$all` operand is a literal array up to 10,000 items. Empty is vacuously true for every present array. Duplicate requirements do not require multiplicity. Nested arrays are whole elements.
- `$size` operand is an exact nonnegative `int32`/`int64` no greater than 1,000,000. Float/decimal/negative/overflow operands are errors.
- `$elemMatch` operand is either a value-operator object or object-field filter. Mixing both at one level is an error. Nested arrays require nested `$elemMatch`.
- Scalar field equality remains whole-value equality; it is not implicit array element search.

## String operator truth table

All string predicates use exact canonical UTF-8 under `binary_utf8_v1` and match only present string candidates.

| Operator | Operand | Match rule |
| --- | --- | --- |
| `$prefix` | Valid string | Candidate bytes begin with operand bytes |
| `$contains` | Valid string | Operand bytes occur contiguously in candidate bytes |
| `$regex` | Pattern string or `{pattern, flags}` | Reference regular-language match exists |

Missing, null, binary, and all non-string types do not match. Empty prefix/contains/regex pattern matches every present string, including empty.

### Regex v1 subset

Regex operates on Unicode scalar values and supports a bounded regular-language subset:

- literals/escapes, `.`, character classes/ranges/negation;
- concatenation, alternation, capturing/noncapturing groups;
- `?`, `*`, `+`, and bounded `{m,n}` repetition;
- `^`, `$`, and supported scalar/Unicode-17 property classes;
- flags `m` (multiline anchors) and `s` (dot includes newline), each at most once.

Unicode mode is always on. Flags `i`, `x`, locale/canonical-equivalence modes, backreferences, lookaround, recursion, conditionals, embedded code, and unsupported constructs are validation errors. Pattern compilation occurs once per command under the 65,536-byte, AST, memory, step, and deadline bounds. An invalid pattern fails the command even if another Boolean branch would short-circuit.

Index/GPU prefix/contains/regex acceleration is candidate-only unless exact proof exists; CPU reference verifies bytes/scalars.

## `$jsonSchema` native subset

`$jsonSchema` does not claim the full JSON Schema or MongoDB dialect. V1 accepts a versioned `schema_v1` object with these keywords only:

```text
type
required
properties
additionalProperties
items
minItems maxItems
minLength maxLength
minimum maximum
enum
```

Rules:

- Unknown keywords/dialects are validation errors, never ignored annotations.
- `type` uses the exact/group names from `$type`; for root schemas it normally requires `object`.
- `required` is an array of unique exact field names; required means present, so explicit null satisfies presence but may fail its property schema.
- `properties` maps exact field names to recursive `schema_v1` objects.
- `additionalProperties` is Boolean; false rejects present names absent from `properties` except protected engine fields evaluated by their system schema.
- `items` applies one schema to every immediate array element.
- min/max items count immediate elements; min/max length count Unicode scalar values for strings.
- `minimum`/`maximum` use inclusive exact numeric comparison and require numeric instances/operands.
- `enum` is a nonempty literal array using semantic equality.
- Missing optional properties are not evaluated. Wrong type for a keyword's target is schema nonmatch after the schema itself validates.

Schema validation/match obeys depth/node/document limits. A future broader dialect needs a distinct version/name and compatibility matrix.

## Cache/time operator truth tables

All ambient-time behavior uses the pinned snapshot expiry cutoff `E` from `P01-005`.

### `$expiresBefore` / `$expiresAfter`

Operand is one valid timestamp `T`; candidates must be timestamp.

| Candidate | `$expiresBefore: T` | `$expiresAfter: T` |
| --- | ---: | ---: |
| Missing/null/non-timestamp | false | false |
| Timestamp `< T` | true | false |
| Timestamp `= T` | false | false |
| Timestamp `> T` | false | true |

These operators never read the clock. Inclusive timestamp bounds use ordinary `$lte`/`$gte`.

### `$ttl`

Operand is exactly one enum string:

```text
active | expired | unbounded
```

| Candidate path | active | expired | unbounded |
| --- | ---: | ---: | ---: |
| Missing | false | false | true |
| Timestamp `> E` | true | false | false |
| Timestamp `<= E` | false | true | false |
| Null/non-timestamp | false | false | false |

Ordinary reads apply TTL visibility before filters, so logically expired rows are absent and `$ttl: "expired"` returns no ordinary row. That state is meaningful only in an authorized maintenance/diagnostic scan explicitly including expired physical rows. Such a scan still uses one pinned `E`, authorization, audit, and no silent deletion.

TTL indexes/schemas treat a present wrong-type/null expiry field according to their validation contract; the generic predicate itself yields nonmatch.

## Vector operator truth tables

Detailed metric arithmetic/eligibility/exactness is in `P01-010`.

### `$vectorNear`

Field predicate operand:

```text
{
  vector: typed vector,
  metric: "l2" | "cosine" | "dot",
  maxDistance: finite nonnegative float64,   // l2/cosine only
  minScore: finite float64,                  // dot only
  inclusive: bool                            // optional, default true
}
```

Exactly one metric-appropriate threshold is required; extra/wrong threshold keys are errors.

| Candidate | Result |
| --- | --- |
| Missing/null/non-vector/wrong family/dimension | false |
| Cosine zero-norm candidate | false/ineligible |
| Eligible L2/cosine | Compare exact distance to `maxDistance` using `<=` if inclusive else `<` |
| Eligible dot | Compare exact score to `minScore` using `>=` if inclusive else `>` |
| Noncanonical/nonfinite stored vector | Runtime corruption error |

GPU/index candidates expand uncertainty and CPU-verify the original threshold; tolerance never moves it.

### `$vectorTopK`

`$vectorTopK` is a query-level ranked selector, not an independently reducible per-document Boolean. At most one occurs in a normalized query.

```text
field: {
  $vectorTopK: {
    vector: typed vector,
    metric: "l2" | "cosine" | "dot",
    k: positive integer,
    optional maxDistance/minScore + inclusive
  }
}
```

The query's other field/logical predicates form the scalar prefilter. Eligible rows are reference-scored; optional threshold applies; L2/cosine rank ascending, dot descending, exact score ties use `_id` ascending, and the first `min(k,count)` return. `k <= 10,000`.

Wrong query vector family/dimension/nonfinite/zero cosine norm, invalid `k`, multiple top-k selectors, or top-k inside `$not`/`$or`/`$nor` is a validation error. This restriction avoids ambiguous global selection under Boolean composition. A future algebra may broaden it with an explicit plan/semantic version.

Approximate vector/index mode is not implicit and cannot satisfy this exact operator without a no-false-negative candidate proof plus reference reranking.

## Operator applicability summary

Legend: `M` meaningful/may match, `F` valid but always nonmatch for present wrong type, `E` invalid command operand shape independent of stored type.

| Operator family | Required candidate domain | Missing behavior |
| --- | --- | --- |
| Equality/in | Any logical value | `$eq/$in` false; complements true |
| Ranges | Compatible bracket in range table | false |
| Exists | Path state | true only for `$exists:false` |
| Type | Any present value | false |
| Prefix/contains/regex | String | false |
| All/size/elemMatch | Array | false |
| Expiry before/after | Timestamp | false |
| TTL | Timestamp or missing for unbounded | state table |
| Vector near/top-k | Exact vector family/dimension | ineligible/false |
| JSON schema | Candidate/root value | optional missing property skipped; root always present |

Wrong stored type follows `F` unless a specific explicit expression (rather than filter predicate) promises a typed runtime error. Malformed operands always follow `E` at command validation.

## Backend and planner invariants

- Reference row evaluation owns truth/error semantics.
- Index/sidecar/GPU paths return exact match sets or conservative candidates with final reference verification.
- Type-bracketed range/index bounds cannot use total sort rank to match another type.
- Missing/null bitmaps remain separate through Boolean complements.
- Multikey provenance prevents `$elemMatch` conditions from combining different elements.
- Regex/string collation, numeric specials, temporal units, vector scores, and canonical object/array order use the accepted contracts.
- Planner rewrite/constant folding applies the empty identities/complements exactly and still validates every branch.
- Explain reports normalized operators, type brackets, candidate/exactness/fallback, verification counts, and stable unsupported reasons.

## Required truth-table fixtures

The executable corpus crosses every operator with:

- Missing, null, every logical type, invalid operand, nested path, and multivalue candidates.
- Numeric widths/specials, string normalization/case/binary order, object presentation order, arrays/nesting, time boundaries, identifiers, and vectors.
- Same-candidate versus different-element conditions and nested `$elemMatch`.
- Empty/one/many logical and list operands plus AST/size limits.
- Regex syntax/flags/Unicode/property/resource boundaries.
- Schema keyword/type/required/additional/items/bounds/unknown cases.
- TTL before/equal/after pinned cutoff and ordinary versus maintenance visibility.
- Vector metric direction/threshold inclusivity/top-k ties/invalid placement/candidate verification.
- CPU/reference/index/sidecar/GPU/browser/server/adapter match IDs, order, errors, and result hashes.

## Compatibility boundary

The current cross-surface classifications are published in the [v1 semantic and compatibility matrix](../compatibility/v1-semantic-compatibility-matrix.md). A specified native operator, executable oracle primitive, or exact MongoDB differential fixture is not by itself an implemented engine or adapter feature.

Native semantics deliberately differ from MongoDB in null equality, object field-order equality, implicit array element matching/nested traversal, supported collations/regex/schema dialect, ID domain/default generation, and other recorded cases. The MongoDB adapter rewrites only proven forms and publishes the exact executable matrix; parsing familiar JSON never implies compatible behavior.

## Follow-up ownership

| Plan item | Remaining responsibility |
| --- | --- |
| `P01-013`–`P01-017` | CRUD/update/aggregation/error/order integration |
| `P01-018`–`P01-020` | Fixture schema, populated corpus, reference oracle |
| `P01-021`–`P01-022` | MongoDB differential report and compatibility matrix |
| `P07-*` | Parser, normalized AST, planner, CPU reference operators |
| `P08-*`–`P10-*` | Index/sidecar/GPU exact/candidate implementations |

No implementation may treat unknown syntax as a field, coerce wrong stored types, use total type rank for range matching, hide invalid branches through short-circuit, move vector/time thresholds by tolerance, or accept candidate output as final without a versioned semantic change and compatibility review.

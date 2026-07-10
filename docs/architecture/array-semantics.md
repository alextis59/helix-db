# Array Equality, Ordering, Traversal, and Operator Semantics

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-008`
- Governing requirements: `DATA-001`, `DATA-002`, `QUERY-001`
- Governing gate: `G01`
- Decision: [ADR 0005](../adr/0005-explicit-array-matching.md)
- Normative parents: [logical value model](value-model.md), [missing/null semantics](missing-null-semantics.md), and [object semantics](object-semantics.md)

This document defines dense array values, equality, ordering, hashing, dotted-path traversal, multivalue predicate reduction, `$all`, `$size`, `$elemMatch`, and nested-array behavior. It deliberately avoids implicit recursive flattening and implicit scalar-versus-element equality.

## Logical array model

An array is a finite, dense, zero-based ordered sequence of logical values:

```text
ArrayValue = [Value_0, Value_1, ... Value_(N-1)]
```

Rules:

- `N` may be zero and is bounded by `P01-011`.
- Order and duplicates are semantic.
- Elements may have different logical types.
- Elements may be null, objects, arrays, or vectors.
- There is no missing/hole element. Sparse host arrays are rejected or explicitly materialized by the caller using real values.
- Cyclic/shared host graphs follow object rules: cycles are rejected and repeated subarrays serialize by value.
- A vector remains a distinct homogeneous typed value, not an array with numeric elements.

## Equality

Array `$eq` is recursive ordered sequence equality:

1. Both operands are arrays.
2. Their lengths are equal.
3. Elements at every index are equal under the element type's semantic equality.

Examples:

```text
[1, 2] == [1, 2]
[1, 2] != [2, 1]
[1] != [1, 1]
[] == []
[[1, 2]] != [1, 2]
```

Numeric element equality uses the exact cross-type numeric relation, so `[int32(1)]` can equal `[int64(1)]`. Typed payload identity/hashes still retain widths and exact float payloads.

Native field equality compares the whole resolved field value. It does not implicitly search array elements:

```text
{tags: {$eq: "red"}}       matches a scalar string field "red"
{tags: {$eq: ["red"]}}     matches the exact one-element array
{tags: {$elemMatch: {$eq: "red"}}}  searches array elements
```

This rule removes operand-shape-dependent equality and keeps index/group/hash equivalence coherent.

## Ordering

When two arrays are order-comparable, ascending order is lexicographic:

1. Compare elements at index zero, then successive indices, using the total value order.
2. The first non-equal element decides the result.
3. If one array is an exact prefix, the shorter array sorts first.
4. Equal arrays share a comparison key; document tie-breaking follows `P01-017`.

Examples under ordinary numeric order:

```text
[] < [0] < [0, 0] < [0, 1] < [1]
```

The complete cross-type rank and whether range operators bracket by type are frozen by `P01-012`. Sorting a field whose value is one array compares the whole array; it does not pick an arbitrary minimum/maximum element.

## Canonical hashes

Array typed content hash is order-sensitive:

```text
array-domain/version
|| array type tag
|| element count
|| canonical typed content hash(element_0)
|| ...
|| canonical typed content hash(element_N-1)
```

Array semantic comparison hash uses the same positions/count but each element's semantic comparison hash. Equal arrays therefore hash together even when equal numeric elements have different stored widths.

Hashes include unambiguous tags/lengths and confirm collisions with recursive equality. Prefix/dictionary/compressed physical encodings cannot omit array boundaries or positions from canonical identity.

## Path-result model

Dotted query-path evaluation produces an ordered sequence of candidate values plus provenance, or `Missing` when no candidate exists:

```text
PathCandidates = [(value, array_position_vector)]
```

An ordinary object segment contributes at most one value. Array fan-out may contribute several. Provenance records the array indices crossed so `$elemMatch`, compound multikey indexes, diagnostics, and verification can distinguish values from the same versus different elements.

Candidate order follows source array order and is deterministic, but Boolean matching does not use completion/physical index order.

## Dotted-path traversal

For each path segment:

### Object input

- If the exact field exists, traversal continues with that value.
- If absent, that branch yields no candidate.
- Null/scalar before the terminal segment yields no candidate.

### Array input with a canonical numeric segment

A canonical decimal segment (`0` or a nonzero digit followed by digits, no sign/leading zero) selects that zero-based array index. Out-of-range yields no candidate. On an object, the same segment remains an ordinary exact field name.

### Array input with a nonnumeric segment

Traversal fans out over the immediate elements of that array:

- An object element consumes the segment through field lookup.
- A scalar/null element contributes no candidate for that segment.
- A nested-array element contributes no candidate implicitly; traversal does not recursively flatten it without consuming a segment.

After an object field is consumed, a later path segment may fan out a resulting array normally. Thus each structural array crossing is explicit in the path/evaluation shape.

Examples for path `items.price`:

| Document fragment | Candidates |
| --- | --- |
| `{items: [{price: 1}, {price: 2}]}` | `[(1, [0]), (2, [1])]` |
| `{items: [{price: null}, {}]}` | `[(null, [0])]` |
| `{items: []}` | `Missing` |
| `{items: [[{price: 1}]]}` | `Missing` (no recursive implicit flatten) |
| `{items: {price: 1}}` | `[(1, [])]` |

Path `items.0.price` explicitly selects the first nested element where `items` is an array. Field/path grammar, escaping, and index bounds are finalized by `P01-011`.

## Predicate reduction over candidates

When dotted traversal produces multiple candidates:

- Positive predicates such as `$eq`, range comparison, `$type`, `$prefix`, and nested field conditions match if any candidate matches.
- `$exists: true` matches when at least one candidate exists, including null.
- `$exists: false` matches only when there are no candidates.
- `$ne` is the complement of any-candidate `$eq`; it matches only when no candidate equals the operand and therefore also matches `Missing`.
- `$nin` and `$not` follow the same Boolean-complement principle.
- Errors in a candidate predicate are governed by the operator/type contract; physical paths cannot silently drop the candidate to avoid an error.

Conditions written as separate predicates may be satisfied by different array elements. `$elemMatch` is required when all conditions must bind to one element.

Sorting/projection over a path yielding multiple candidates is not allowed to choose a value implicitly. The operator must define an explicit reduction/selection, preserve an array result, or return an ambiguous-multivalue error under `P01-013`/`P01-015`.

## `$all`

`{p: {$all: required}}` has these v1 rules:

- `required` must be an array of literal values; unsupported nested query operators are validation errors.
- The resolved `p` value must be a present array; missing, null, scalar, object, and vector do not match.
- Every required value must be equal to at least one top-level element of `p`.
- One array element may satisfy more than one duplicate required value; `$all` is set-containment, not multiset-count containment.
- Duplicate values in `required` do not change the result.
- An empty `required` array is vacuously true for every present array, including an empty array.
- Nested array literals compare as whole elements and are not flattened.

Examples:

```text
[1, 2, 3]  matches $all [1, 3]
[1]        matches $all [1, 1]
[]         matches $all []
[[1, 2]]   matches $all [[1, 2]]
[1, 2]     does not match $all [[1, 2]]
```

## `$size`

`{p: {$size: N}}` matches only when:

- `p` resolves to a present array value;
- `N` is an exact nonnegative integer within the maximum array length; and
- the top-level element count equals `N`.

It does not count nested elements, bytes, distinct values, non-missing traversal candidates, vector dimensions, or string length. Missing/null/non-array values do not match. Negative, fractional, out-of-range, or nonnumeric operands are validation errors rather than “no match.”

## `$elemMatch`

`$elemMatch` requires a present array and binds one top-level array element to the complete nested predicate.

Two explicit forms exist:

### Value form

For scalar/array/vector elements, the operand contains only value operators:

```text
{scores: {$elemMatch: {$gte: 70, $lt: 80}}}
```

One score must satisfy both bounds. Conditions cannot be split across elements.

### Object form

For object elements, the operand is an object-field filter:

```text
{items: {$elemMatch: {kind: "book", price: {$lt: 20}}}}
```

One object element must satisfy the entire filter. Missing/null behavior inside that element follows the ordinary contracts.

Mixing value operators and object field names at one `$elemMatch` level is a validation error. An element of an unexpected type simply does not match a valid form unless the nested operator specifies a type error.

## Nested-array semantics

Nested arrays are preserved as values and one level is never flattened into another.

- Whole-array equality recurses with boundaries intact.
- `$all` examines only immediate elements; a nested array literal is one element.
- `$size` counts only immediate elements.
- `$elemMatch` binds one immediate element.
- To search inside an array element that is itself an array, nest `$elemMatch` explicitly.
- Dotted nonnumeric traversal does not auto-descend through a nested array element.
- Numeric path segments explicitly select one nesting level at a time.

Example:

```text
matrix = [[1, 2], [3, 4]]

$size: 2                              true
$all: [[1, 2]]                        true
$elemMatch: {$eq: [1, 2]}             true
$elemMatch: {$elemMatch: {$eq: 3}}    true
$elemMatch: {$eq: 3}                  false
```

## Compatibility boundary

MongoDB has implicit array-element matches and other array traversal rules for some ordinary field predicates. Native HelixDB deliberately requires whole-value equality or explicit `$elemMatch`/dotted fan-out.

A MongoDB adapter may rewrite a claimed scalar equality to the explicit native disjunction “scalar field equals value OR array contains an equal element,” and may add presentation/provenance-aware verification. It must differential-test every claimed nested-array/path case and mark untranslatable cases different/unsupported. It cannot expose native semantics as MongoDB-compatible merely because the JSON shape parses.

## Index and sidecar obligations

- A whole-array equality index key includes ordered boundaries/count/elements or remains row-verified.
- A multikey index entry records element/provenance information required by its supported predicates.
- `$elemMatch` planning never intersects unrelated element entries as if one element satisfied all conditions.
- Nested arrays are not recursively exploded unless the index definition explicitly names that traversal and restrictions.
- Duplicate array elements may create deduplicated physical entries only when document membership/provenance and query semantics are retained.
- `$size` indexes, if introduced, use explicit top-level count metadata.
- Sidecar offsets preserve document and nested-array boundaries.
- GPU array kernels are exact for proven cases or conservative candidates with CPU verification; no flattening shortcut creates false positives accepted as final or any false negatives.

Compound multikey restrictions, index encoding, online build, and query plans are finalized by `P08-*`.

## Updates and aggregation boundary

- Array replacement preserves exact element order/types.
- Sparse host holes never become stored missing values.
- Positional, append, remove, and conflict behavior is finalized by `P01-014`.
- `$unwind` emits immediate elements in array order and applies its missing/null/empty preservation rule under `P01-015`.
- Array-producing aggregation stages preserve boundaries and reject ambiguous duplicate object fields.
- No parallel execution may reorder elements of a returned/stored array unless an explicit operator defines a sort.

## Required fixtures

The semantic corpus includes:

- Empty, singleton, duplicate, heterogeneous, null, object, vector, and nested arrays.
- Ordered equality/inequality, prefix ordering, semantic versus typed numeric elements, and both hashes.
- Object traversal, immediate array fan-out, numeric index segments, missing/null branches, and nested-array non-flattening.
- Any-candidate positive predicates and complement behavior for `$ne`, `$nin`, `$not`, and `$exists`.
- `$all` empty/duplicates/nested arrays/wrong types; `$size` zero/boundaries/invalid operands.
- `$elemMatch` value/object forms, same-element binding, mixed-form errors, and nested `$elemMatch`.
- Whole-array versus element matching and MongoDB adapter rewrite/differential cases.
- Multikey provenance, compound-condition verification, sidecar offsets, GPU candidates, and CPU final results.
- Update/unwind order, HDoc/SDK/protocol/backup round trips, and cross-host result/hash agreement.

## Follow-up ownership

| Plan item | Remaining array responsibility |
| --- | --- |
| `P01-011` | Array length, path grammar/index bounds, depth, document/command limits |
| `P01-012` | Full cross-type/operator truth tables and error/type bracketing |
| `P01-013`–`P01-015` | Sort/projection/update/unwind/aggregation integration |
| `P01-016` | Stable path/multivalue/operator error codes |
| `P01-019`–`P01-021` | Executable fixtures, oracle, and MongoDB differential cases |
| `P03-*` | HDoc array offsets/boundaries and golden vectors |
| `P08-*`–`P10-*` | Multikey indexes, sidecars, CPU/GPU operators and verification |

No implementation may flatten nested arrays, treat holes as missing values, use scalar equality as implicit element search, lose element provenance, or select an arbitrary multivalue sort/projection key without a superseding semantic decision and compatibility/index assessment.

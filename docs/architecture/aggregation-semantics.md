# V1 Aggregation Pipeline Semantics

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-015`
- Governing requirements: `DATA-002`, `QUERY-001`, `INV-002`
- Governing gate: `G01`
- Normative dependencies: [operator truth tables](operator-semantics.md), [CRUD/query semantics](crud-query-semantics.md), and [limits-v1](limits-v1.md)

This document defines sequential behavior for `$match`, `$project`, `$sort`, `$limit`, `$skip`, `$count`, `$group`, and `$unwind`, plus the minimal versioned expression/accumulator subset required by those stages. Pipeline documents are transient typed objects and need not contain a stored-document `_id`.

## Pipeline execution model

A pipeline is an ordered array of 0–256 single-key stage objects. An empty pipeline is the identity over visible source documents. Unknown stages/options, empty/multi-key stage objects, invalid expressions, and pre/post-normalization limit violations are command errors.

Semantic execution:

1. Capture one authorized read snapshot and logical expiry cutoff.
2. Produce visible input documents in deterministic default/source order.
3. Apply each stage in written order to the complete logical stream.
4. Preserve hidden stable ordinal/provenance metadata across stages as defined below.
5. Validate every emitted/intermediate document against `limits-v1`.
6. Batch the final ordered stream through snapshot cursor semantics.

Stage order is semantic. A planner may push/reorder/fuse work only with proof that values, missing/null shape, order, errors, limits, cardinality, resource/deadline behavior, and explain claims remain equivalent. GPU/index/sidecar paths are exact or candidate-plus-reference verification.

## Hidden stable ordinal

Every pipeline row carries internal `stable_ordinal` metadata not exposed as a document field:

- Source rows start with their deterministic collection/default-order key (ultimately `_id`).
- Projection/match/skip/limit preserve it.
- Unwind appends the immediate element index to the ordinal tuple.
- Group creates an ordinal from the canonical group-key order.
- Count creates a singleton ordinal.
- Sort uses it as the final tie-break after explicit keys.

Removing/overwriting visible `_id` does not remove the hidden ordinal. This prevents worker/hash/GPU completion order from leaking into results.

## Expression v1

Stages use a deliberately small language-neutral expression subset:

```text
Expression := typed literal
            | "$field.path"
            | "$$ROOT"
            | {$literal: typedValue}
            | {$ifNull: [Expression, fallbackExpression]}
            | {$type: Expression}
            | {$size: Expression}
            | {field: Expression, ...}       // constructed object
            | [Expression, ...]              // constructed array
```

Rules:

- A string beginning with one `$` is a field reference; use `$literal` for a literal such string.
- `$$ROOT` is the complete current pipeline document before the containing stage's output is constructed.
- Field references use dotted path semantics. Zero candidates yields Missing; one yields that value; multiple fan-out candidates yield a newly constructed dense array in source/provenance order.
- `$literal` returns exact typed input without interpreting inner operator-looking objects.
- `$ifNull` chooses fallback when first expression is Missing or explicit null; otherwise returns it. Fallback is evaluated only when selected, after the complete expression AST has validated.
- Expression `$type` returns the exact stable type-name string; for Missing it returns literal string `"missing"`.
- Expression `$size` returns `int64` immediate array length; Missing propagates Missing, null/non-array is a type error.
- Constructed object names obey unique/field rules; any child Missing omits that object field. Constructed arrays cannot contain Missing: a child Missing is an expression error unless handled by `$ifNull`.
- Unknown/multi-key expression operator objects are errors. Arithmetic, date, string transforms, conditionals beyond `$ifNull`, functions, scripts, and user code are unsupported in v1 expression subset.

Expression output retains exact value types/payloads and passes depth/field/array/vector/document limits.

## `$match`

```text
{$match: Filter}
```

- Evaluates the complete native filter truth tables against each current pipeline document.
- Preserves matching documents, presentation order, and hidden ordinal unchanged.
- Missing/null/path semantics use the current transformed shape, not the original stored row unless still present.
- `$vectorTopK` is not allowed inside pipeline `$match`; `$vectorNear` may be a Boolean predicate. A future vector stage requires a separate global-stage contract.
- Invalid filter fails pipeline validation; runtime corruption/type errors follow operator rules and abort the current pipeline/batch.

## `$project`

Aggregation projection supports exclusion or inclusion/computation.

### Exclusion mode

- Every non-`_id` specification value is exactly `0`/false.
- Start with current document and remove specified object-only paths.
- `_id` may independently be included/excluded.
- Arrays must be projected as whole terminal values; nested array projection remains unsupported without unwind.
- Retained fields preserve current presentation order.

### Inclusion/computation mode

Each output entry is:

- `1`/true: include same-named source path when present;
- `0`/false only for `_id` exclusion;
- any `Expression`: compute/rename/construct output field.

Rules:

- Output paths are validated/conflict-checked like object construction.
- Inclusion reads from the complete input, not partially built output.
- Missing included/computed result omits the output field; null emits null.
- Existing included fields follow source relative order, followed by computed/new fields in canonical normalized output-path order. `_id` follows its source position/default rule when included.
- Inclusion/computation cannot mix ordinary exclusions except `_id`.
- No implicit array path fan-out writes sparse arrays; a field reference may explicitly return the dense candidate array as one computed value.
- Output may omit `_id`; transient pipeline documents are not stored documents.

A projection that is entirely empty/false is valid exclusion and may yield `{}`. Duplicate/conflicting paths or oversized output fail atomically for the pipeline response/batch.

## `$sort`

```text
{$sort: {path: 1 | -1, ...}}
```

- Uses 1–64 unique keys and the total type/value order from `P01-012`.
- Missing/null/type/direction and multivalue ambiguity follow CRUD sort semantics.
- Sort sees the current pipeline document.
- After explicit keys tie, hidden `stable_ordinal` ascending is the final key; visible `_id` need not exist.
- Sort is stable and deterministic across memory/external runs, shards (later), CPU/GPU, and worker counts.
- Resource limits may spill through a versioned stable format or return a typed resource error; they cannot return partial/unstable order.

`$sort` after `$group` can override the default canonical group order; after `$unwind` it can reorder element rows explicitly.

## `$skip` and `$limit`

```text
{$skip: nonnegativeInteger}
{$limit: nonnegativeInteger}
```

- Exact int32/int64 only; negative/float/decimal/overflow is validation error.
- `$skip: 0` is identity; skip beyond input yields empty.
- `$limit: 0` yields empty; limit beyond input yields all input.
- They preserve relative order/ordinals of retained rows.
- Every occurrence applies at its written pipeline position; multiple stages compose mathematically.
- Planner pushdown across match/sort/group/unwind/project requires equivalence proof.

## `$count` stage

```text
{$count: "validOutputFieldName"}
```

- Consumes the current stream and emits exactly one document, including for empty input.
- Output is `{fieldName: int64(rowCount)}` with count `0` for empty input.
- Field name follows normal grammar but cannot be a dotted path, begin `$`, or use protected root `_id`/`_v`/`_ts`.
- Count overflow beyond int64 is a typed error (practically bounded earlier by resources).
- Output has singleton hidden ordinal and no automatic `_id`.

This intentional always-one-row behavior differs from dialects that emit no row for empty input and is recorded by adapters.

## `$group`

Grammar:

```text
{$group: {
  _id: keyExpression,
  outputField: {accumulator: inputExpression},
  ...
}}
```

`_id` key expression is required and unique. Each other field has exactly one supported accumulator. Output names obey field grammar and cannot conflict with `_id`/protected names.

### Group key

- Any value produced by Expression v1 is groupable.
- Semantic value equality/hash defines membership: numeric widths/zeros/NaNs, object mapping order, array/vector boundaries, strings, identifiers, and types follow accepted contracts.
- Missing and explicit null are separate keys.
- For a Missing key, output omits `_id`; for explicit null it emits `_id: null`.
- Empty input produces zero group documents.
- Groups emit in ascending canonical group-key total order, Missing then null then other ranks, independent of hash/parallel completion.

Composite object/array key expressions retain constructed shape and semantic equality.

### Supported accumulators

```text
$count
$sum
$avg
$min
$max
```

`$count` operand is exactly empty object `{}` and counts every row in the group as int64.

For value accumulators:

- Missing input is skipped.
- `$sum`/`$avg` skip explicit null; present nonnumeric input is a type error.
- `$min`/`$max` include explicit null and any present logical value using total type/value order.

### `$sum`

- No numeric contributions returns `int64(0)`.
- Integer-only contributions accumulate exactly in a checked wide internal state and finalize as int64; outside int64 is numeric overflow error.
- Decimal plus integer contributions promote exactly to decimal128 and follow the accepted decimal context.
- Float plus exactly representable integer contributions use deterministic binary64 reduction; an inexact implicit integer conversion is a coercion error.
- Decimal and float contributions cannot mix implicitly.
- NaN/infinity/signed-zero results use `P01-004`; binary64 reduction uses the fixed 1,024-ordinal-chunk tree over group input ordinals.

### `$avg`

- No numeric contributions returns explicit null.
- Integer-only and decimal/integer contributions return decimal128 `sum / count` in the accepted decimal context.
- Any float contribution returns float64 only when every integer contribution is exactly representable and no decimal contribution exists.
- Float sum uses the deterministic tree; division by positive count uses reference binary64.
- Overflow/underflow/nonfinite results follow numeric contracts; decimal/float mix errors.

### `$min` / `$max`

- Use total type/value order over every present input, including null.
- No present inputs (all Missing) omits the accumulator output field.
- Equal comparison keys retain the first value by hidden stable ordinal, preserving its exact stored type/payload for output.

Unsupported `$first`, `$last`, `$push`, `$addToSet`, custom/JavaScript, percentile, variance, and other accumulators are explicit v1 errors.

### Group execution/resource rules

- Each row contributes once to one semantic key.
- Partial/parallel/GPU grouping uses canonical semantic hashes plus equality confirmation and must merge into the same key/order/results.
- Numeric partials carry sufficient deterministic state/ordinal boundaries; if exact merge is not possible, CPU reference processes the contributions.
- Group cardinality/state/document limits are admitted; deterministic spill may be used, otherwise the entire pipeline errors without partial current batch.
- Explain reports groups, spill/partial/backend, candidate/finalization, skipped missing/null, and errors without values.

## `$unwind`

Accepted forms:

```text
{$unwind: "$array.path"}

{$unwind: {
  path: "$array.path",
  preserveNullAndEmptyArrays: bool?,
  includeArrayIndex: "fieldName"?
}}
```

Path begins with one `$`, then follows object-only single-valued traversal. It cannot implicitly fan out/enter an array before the terminal value.

| Terminal state | preserve false (default) | preserve true |
| --- | --- | --- |
| Missing | Emit 0 rows | Emit 1 unchanged-shape row (path remains absent) |
| Explicit null | Emit 0 rows | Emit 1 row retaining null |
| Empty array | Emit 0 rows | Emit 1 row retaining the empty array |
| Nonempty array | Emit one row per immediate element | Same |
| Present non-array/non-null | Type error | Type error |

For a nonempty array:

- Emit elements in ascending original index order.
- Replace terminal array field with the exact element (nested array remains one value).
- Append index to hidden stable ordinal.
- If `includeArrayIndex` is present, write exact int64 index at that nonconflicting output field; it is absent for preserved missing/null/empty rows.
- Output path/index-field conflicts, protected names, invalid names, or output limits are errors before emitting the current batch.

Unwind does not mutate stored documents and never inserts a missing array hole.

## Pipeline order/cardinality examples

```text
$match → $sort → $skip → $limit → $project
```

is the aggregation equivalent of find ordering, while:

```text
$limit → $match
```

limits input first and is not equivalent.

```text
$unwind → $group
```

groups elements, whereas:

```text
$group → $unwind
```

requires the group output to contain an array and has different cardinality. The planner cannot swap them.

## Cursor, error, and atomic response behavior

- Aggregation cursor pins the same snapshot/expiry and concatenates to one-shot final output.
- Each response batch is all-or-error; earlier delivered batches remain delivered if a later input triggers runtime/resource error.
- Pipeline has no write stages in v1, so it publishes no stored mutation.
- Cancellation/deadline/spill/corruption errors never return a partial current document/batch or silently skip a row/group.
- Repeating an acknowledged cursor-batch request follows cursor idempotency/sequence behavior.

## Backend invariants

- `$match` uses reference verification after candidate paths.
- `$project` exact types/missing shape cannot differ by column/GPU availability.
- `$sort` and top-k optimization preserve hidden ordinal ties.
- GPU numeric group/reduction partials require exact supported semantics or CPU finalization/recompute.
- `$unwind` offsets/provenance come from exact array boundaries.
- Stage fusion/pushdown records logical versus physical stages and fallback/verification in explain.
- Disabling indexes/sidecars/GPU produces identical documents/order/errors/counts.

## Compatibility boundary

Native behavior deliberately differs from MongoDB in expression/accumulator breadth, strict type errors, field grammar, always-one-row empty `$count`, missing/null group distinction/output shape, canonical group order, stable sort ordinals, array projection restrictions, and unwind preserved empty shape.

Adapters translate only differential-tested pipelines/versions and return explicit unsupported/different errors otherwise. Unknown stage/expression/accumulator/options are never ignored.

## Required fixtures

- Stage grammar/order/limits and planner rewrite-equivalence cases.
- Expression field/multivalue/Missing/null/root/literal/ifNull/type/size/object/array/error cases.
- Project include/exclude/compute/rename/order/conflicts/array/output limits.
- Sort all types/missing/ties/removed `_id`/group/unwind ordinals/external runs.
- Skip/limit position/zero/composition/invalid cases.
- Count empty/nonempty/name/count-type behavior.
- Group missing versus null, every key type, numeric widths/specials/errors, zero contributions, avg/min/max ties, canonical order, cardinality/spill/parallel merges.
- Unwind missing/null/empty/scalar/nonempty/nested/index-field/conflict/output shape/order.
- Cursor batch equivalence, cancellation/error on later batch, snapshot/TTL mutation, and CPU/index/sidecar/GPU-disabled result hashes.

## Follow-up ownership

| Plan item | Remaining responsibility |
| --- | --- |
| `P01-016`–`P01-017` | Stable error/retry metadata and default/unspecified order |
| `P01-018`–`P01-020` | Executable pipeline fixtures/reference oracle |
| `P07-014`, `P07-017`–`P07-021` | Parser/logical/CPU aggregation/cursor implementation and fuzzing |
| `P09-*`, `P10-028`–`P10-030` | Optimized/sidecar/GPU projection/reduction/sort differential proof |

No implementation may reorder stages, use hash/worker completion as group/result order, collapse missing/null keys, accept unsupported expressions/accumulators, change numeric reduction order, return partial current batches, or let optimized partials become authoritative without exact reference equivalence.

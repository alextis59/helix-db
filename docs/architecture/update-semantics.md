# V1 Update Operator, Path, Conflict, and Atomicity Semantics

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-014`
- Governing requirements: `DATA-001`, `DATA-002`, `QUERY-001`, `STORE-001`
- Governing gate: `G01`
- Normative dependencies: [CRUD semantics](crud-query-semantics.md), [numeric semantics](numeric-semantics.md), [array semantics](array-semantics.md), and [limits-v1](limits-v1.md)

This document defines supported modifier updates, path resolution/creation, conflicts, dense array mutation, upsert behavior, exact post-image modification, and atomic publication. An update is a deterministic patch computed from one pre-image—not an input-order script.

## Supported v1 update operators

```text
$set
$unset
$inc
$setOnInsert
$push
$addToSet
$pop
$pull
```

Unknown operators, replacement fields mixed with operators, `$rename`, `$mul`, `$min`, `$max`, `$currentDate`, positional `$`, all-positional `$[]`, filtered positional `$[id]`, `arrayFilters`, pipeline updates, and unsupported `$push` options are explicit validation errors in v1.

Replacement documents use `replaceOne`; the engine never guesses replacement versus modifier mode from malformed mixed input.

## Update document grammar

Conceptual grammar:

```text
Update := {
  operator: { dottedPath: operand, ... },
  ...
}
```

Rules:

- Update contains at least one supported operator and one path entry overall.
- Every operator value is a normal unique-key object; duplicate paths are rejected before a host map can discard them.
- Paths pass `limits-v1` grammar and protected-field checks.
- Each operator operand validates completely before target selection/mutation where possible.
- Normalization sorts operator/path entries by canonical operator ID then canonical path segments for deterministic diagnostics/patch construction; input object order is not execution order.
- Empty update or empty-only operator objects are validation errors, not successful no-ops.

## Path model

Update paths are nonempty dotted paths. Traversal is single-valued and never uses implicit array fan-out.

### Object traversal

- Existing field continues with its value.
- Missing intermediate field may be created as a new object when the operation permits path creation.
- Present null/scalar/vector/binary/string at an intermediate segment is a path-type error.
- A canonical numeric segment on an object is an ordinary numeric field name.

### Array traversal

- Only a canonical numeric segment selects an array element.
- Index must be within `0 <= i < length` for element updates.
- Index equal to/beyond length is an error; updates never create holes or infer padding.
- Nonnumeric segment on an array is an error; update paths do not fan out.
- Structural array mutation uses `$push`/`$addToSet`/`$pop`/`$pull`, not synthetic indices.

### Missing numeric-looking paths

When a missing intermediate field is created, it is an object regardless of whether the next segment is numeric. Thus setting `a.0` when `a` is missing creates object `{a: {"0": value}}`, never an inferred array. Arrays are created only by setting/pushing an explicit array value.

### Protected paths

Any operation targeting root `_id`, `_v`, `_ts`, or a descendant of a scalar protected root is rejected. Root replacement is not an update path. Authorization/document-policy checks apply to every resolved/created path before mutation.

## Conflict detection

All normalized paths across all operators are checked together before evaluating any mutation.

Conflicts include:

- exact same path more than once, even under different operators;
- ancestor/descendant paths (`a` and `a.b`);
- structural array operation on path `a` with any operation on `a` or descendant/index (`a.0`);
- removing/unsetting a parent with work under that parent;
- `$setOnInsert` collision with an always-applied operator, because both apply on the insert branch;
- paths whose creation/resolution would alias after exact segment decoding.

Nonconflicting sibling paths such as `a.b` and `a.c` are allowed. Numeric object field names remain distinct exact segments; no normalization/case folding occurs.

Conflict errors report deterministic canonical path/operator identifiers and publish nothing. Conflicts are never resolved by input order/“last wins.”

## Pre-image and simultaneous patch rule

Every operator reads the same immutable document pre-image (or synthesized upsert base). The engine:

1. Validates/normalizes all entries and conflicts.
2. Resolves pre-image path states/types and computes each intended patch/result.
3. Applies nonconflicting patches to a bounded staging copy in canonical path order.
4. Validates complete post-image type/schema/name/depth/field/array/vector/document limits.
5. Computes canonical content/index deltas.
6. Atomically publishes row, index, sidecar/WAL/change state under the CRUD/MVCC unit.

No operator observes another operator's newly written value in the same update. Canonical apply order exists only to construct identical presentation bytes; conflict-free semantics are order independent.

## `$set`

Grammar:

```text
{$set: {path: typedValue, ...}}
```

- Terminal object field missing: create it.
- Missing object intermediates: create objects as described.
- Existing terminal field/array element: replace whole value/type.
- Terminal array index must exist; it replaces one element and preserves length/order.
- Exact typed payload/content identity with existing value is a no-op.
- Semantic equality with different stored type/payload (for example int32 to int64, +0 to -0 bits) is a modification.
- Setting a parent scalar/object/array replaces its former descendants/contents as one value, subject to conflict rejection with other paths.
- Values pass duplicate/type/limit/vector/identifier rules before publication.

New sibling object fields created by the command append in canonical normalized path order; existing fields retain presentation position.

## `$unset`

Grammar accepts exactly `true` or integer `1` as the marker for each path. Other operands are validation errors.

```text
{$unset: {path: true}}
```

- Missing path/branch: idempotent no-op.
- Existing object field: remove it; descendants become missing.
- Existing array index: replace that element with explicit null to keep the array dense/indices stable.
- Empty array/object remains a present empty value; parents are not pruned automatically.
- Protected root fields cannot be unset.

Use `$pull`/`$pop` to remove/shift array elements. `$unset` never creates a missing array hole.

## `$inc`

Operand is one scalar numeric typed value. Strings/bools/null/vectors/arrays/objects are invalid operands.

```text
{$inc: {path: numericDelta}}
```

- Missing terminal under creatable object path: create with the exact delta value/type.
- Existing null/non-numeric terminal: document type error.
- Existing numeric: apply the checked promotion/arithmetic rules from `P01-003`/`P01-004`.
- Missing intermediates create objects; existing array index must exist.
- Overflow/underflow/invalid decimal-float implicit mix aborts the complete update/batch.
- Zero delta may still modify stored type/payload after promotion/IEEE arithmetic; exact equal result is a no-op.
- Non-finite float/decimal operands/results follow accepted scalar numeric semantics, but cannot be written into vector components through `$inc`.

The result is computed once; replay/WAL stores the canonical resolved mutation/result or deterministic command inputs under the transaction model, never re-reads ambient state.

## `$setOnInsert`

`$setOnInsert` has `$set` path/value rules but executes only for the inserted branch of an upsert.

- On matched update it produces no patch and does not affect `modifiedCount`.
- It is still parsed/validated/limit/conflict checked for deterministic command validity.
- On upsert insert it reads the synthesized base and applies simultaneously with other nonconflicting operators.
- It cannot target/provide a conflicting `_id`; identifier precedence remains `P01-009`.

Use it for insert-only defaults. Time/IDs in its values are resolved once at canonical command normalization, not during replay.

## `$push`

`$push` appends/inserts literal values into one array.

Simple form:

```text
{$push: {path: value}}
```

Extended v1 form:

```text
{$push: {path: {$each: [value, ...], $position: nonnegativeInteger?}}}
```

Rules:

- Missing terminal under a creatable object path creates an empty array then applies the push.
- Existing terminal must be array; null/scalar/vector is a type error.
- Simple value is inserted once at the end.
- `$each` array may be empty (no-op); values preserve `$each` order/duplicates.
- `$position` defaults to current length and must be `0 <= position <= length` before insertion.
- Inserting shifts existing elements at/after position right.
- `$slice`, `$sort`, and other option keys are unsupported errors.
- Resulting length/document limits validate before publication.

An object with a first key `$each` is parsed as the modifier form; a literal object needing that otherwise-forbidden field shape uses the explicit typed literal wrapper. Normal stored field names cannot begin `$`.

## `$addToSet`

Simple/`$each` grammar matches `$push` without `$position`:

```text
{$addToSet: {path: value}}
{$addToSet: {path: {$each: [value, ...]}}}
```

- Missing terminal creates an empty array.
- Existing terminal must be array.
- Compare only immediate elements using semantic value equality.
- Preserve every existing element/order/duplicate already present.
- Process candidate values in input `$each` order; append a candidate only if no semantically equal existing or earlier-appended value exists.
- Empty `$each` is a no-op.
- Numeric width aliases, signed zero/NaN scalar rules, object order-independent equality, and ordered array equality all apply.

`$addToSet` does not retroactively deduplicate the existing array and is unrelated to unique secondary indexes.

## `$pop`

```text
{$pop: {path: -1 | 1}}
```

- Operand must be exact integer `-1` (remove first) or `1` (remove last).
- Missing path is a no-op.
- Existing terminal must be array; null/non-array is a type error.
- Empty array is a no-op.
- Removal shifts remaining elements and decreases length by one.
- Removed value is not returned by native v1 update result.

## `$pull`

```text
{$pull: {path: literalValue}}
```

- Missing path is a no-op.
- Existing terminal must be array.
- Remove every immediate element semantically equal to the literal.
- Preserve relative order of remaining elements.
- Nested object/array/vector operands are whole literal values; no predicate/operator interpretation, recursive flattening, or element filter exists in v1.
- If the operand's object shape is operator-ambiguous, use an explicit typed literal wrapper.
- Zero matches is a no-op.

Predicate-based pull, pull-all, positional updates, and array filters are unsupported rather than approximated.

## Array index versus structural mutation examples

Given `a = [10, 20, 30]`:

```text
$set   a.1 = 25      → [10, 25, 30]
$unset a.1           → [10, null, 30]
$inc   a.1 by 5      → [10, 25, 30]
$push  a value 40    → [10, 20, 30, 40]
$pop   a -1          → [20, 30]
$pop   a 1           → [10, 20]
$pull  a literal 20  → [10, 30]
```

`$push a` conflicts with `$set a.0` in one update. Two direct element replacements `a.0` and `a.1` do not conflict and preserve array length.

## Missing/null/type matrix

| Operator | Missing terminal | Explicit null/nonrequired type | Existing required type |
| --- | --- | --- | --- |
| `$set` | Create | Replace | Replace |
| `$unset` | No-op | Remove object field / null array slot | Remove/null slot |
| `$inc` | Create delta | Type error | Checked numeric add |
| `$setOnInsert` | Create on upsert insert only | Replace on insert only | Replace on insert only |
| `$push` | Create array | Type error | Insert values |
| `$addToSet` | Create array | Type error | Append absent values |
| `$pop` | No-op | Type error | Remove first/last or no-op empty |
| `$pull` | No-op | Type error | Remove equal elements |

Intermediate missing can create objects for creating operators; an intermediate wrong type is always an error. `$unset`/`$pop`/`$pull` do not create missing intermediates.

## Upsert insert application

After `P01-013` equality extraction constructs the base:

- `$set`/`$inc`/array creators apply normally.
- `$setOnInsert` applies.
- `$unset`, `$pop`, and `$pull` on missing paths are no-ops.
- All paths/conflicts were validated across the complete operator set first.
- The completed root gets ID/defaults under accepted precedence, then passes schema/limits/uniqueness.

One no-match `updateMany(upsert:true)` creates exactly one post-image. No intermediate empty base is ever visible.

## Modification and presentation accounting

- `matchedCount` comes from target selection.
- A document increments `modifiedCount` iff its final canonical typed content differs from pre-image.
- New object sibling fields append in canonical normalized path order; existing field positions remain.
- Array structural changes preserve defined element order.
- An update with only no-op results publishes no new row version/index/change event unless the transaction/audit contract explicitly records attempted no-op commands outside document state.
- Simultaneous nonconflicting patches yield identical post-image/hash across parser/host input map orders.

## Atomicity across storage/derived state

For each native command atomic unit:

- All post-images, primary/secondary uniqueness checks, row versions/tombstones, derived index/sidecar deltas, WAL/replicated command, retry record, and change events publish consistently at one commit boundary or remain invisible.
- A derived structure may lag only through its accepted watermark/delta protocol; queries still see the canonical post-image semantics.
- Crash/replay applies the canonical update/result idempotently; it does not double-increment/push/pop.
- Any target error in native `updateMany` aborts every target mutation.
- Deadline/cancellation before commit aborts all; after ambiguous durability boundary returns explicit unknown outcome/retry metadata.

## Security and resource behavior

- Path/operator/count/document/array growth validates before allocation and publication.
- Numeric overflow, adversarial `$each`, deep values, hash collisions, and duplicate/conflicting paths are bounded.
- Protected/unauthorized path checks cannot be bypassed through parent `$set`, array value, upsert extraction, or operator aliases.
- Diagnostics escape/redact paths/values while retaining stable operator/path digest/reason.
- Update commands cannot execute code, regex predicates, arbitrary expressions, shaders, or host callbacks.

## Compatibility boundary

Native behavior deliberately differs from MongoDB in atomic multi-update, `$unset` array-null rule only where explicitly matched, restricted `$push` options, literal-only `$pull`, unsupported positional/arrayFilters, path creation, conflict rejection, and exact type/modified-count rules.

Adapters may translate only matrix-proven forms. They cannot silently ignore unsupported options, resolve conflicts by input order, or decompose a native atomic update while claiming equivalent atomicity.

## Required fixtures

The semantic corpus includes:

- Every operator on missing/null/scalar/object/array and existing/nonexisting object/array-index paths.
- Object creation, numeric-looking segment object creation, wrong intermediate type, out-of-range index, protected/unauthorized paths.
- Exact/ancestor/descendant/structural/setOnInsert conflicts and nonconflicting siblings/elements across input orders.
- `$set` exact no-op versus semantic-equal type/payload change and presentation order.
- `$unset` object/missing/array-null behavior.
- `$inc` width promotion, decimal/float rejection, overflow/underflow, missing creation, zero/type changes.
- `$push` simple/each/position/empty/options/limits; `$addToSet` semantic duplicates/order; `$pop`/`$pull` dense ordering.
- Matched versus upsert-insert `$setOnInsert`, equality base extraction, ID/defaults, and no-match multi upsert.
- Single/multi atomic rollback, uniqueness, crash/replay idempotency, deadline/cancel/unknown outcome, index/sidecar/change hashes.
- Cross-host normalized post-image bytes/types/presentation/hash/count/error agreement.

## Follow-up ownership

| Plan item | Remaining responsibility |
| --- | --- |
| `P01-015`–`P01-017` | Aggregation integration, errors/retries, deterministic ordering |
| `P01-018`–`P01-020` | Executable update fixtures/reference oracle |
| `P06-*` | MVCC atomic batch/conflict/retry/concern implementation |
| `P07-011`–`P07-014` | Parser/handler/update executor implementation |
| `P08-*`–`P09-*` | Atomic/replayable index/sidecar delta implementation |

No implementation may process update entries sequentially by input order, infer arrays during path creation, create sparse holes, ignore conflicts/options, wrap/round arithmetic outside the numeric contract, partially publish post-images, or replay a non-idempotent increment/array mutation twice without a versioned semantic change.

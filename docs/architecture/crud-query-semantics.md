# V1 CRUD, Projection, Sort, Pagination, and Cursor Semantics

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-013`
- Governing requirements: `DATA-001`, `DATA-002`, `QUERY-001`, `STORE-001`
- Governing gate: `G01`
- Normative dependencies: [operator truth tables](operator-semantics.md), [identifier semantics](identifier-semantics.md), [limits-v1](limits-v1.md), and [temporal semantics](temporal-semantics.md)

This document defines native insert, replace, update, upsert, delete, find/count, projection, sort, skip, limit, and cursor behavior. Update-operator path/mutation details are refined by `P01-014`; aggregation stages by `P01-015`; stable public errors/order by `P01-016`/`P01-017`.

## Common command lifecycle

Every CRUD/query command follows one semantic lifecycle:

1. Decode and validate the complete command/options/limits.
2. Authenticate and authorize the addressed database/collection/action.
3. Normalize filters, projection, sort, updates, typed values, and generation profile.
4. Capture command/transaction `now`, read snapshot, and logical expiry cutoff as applicable.
5. Resolve idempotency/retry record before generating IDs or executing writes.
6. Select/validate the full target set under the pinned snapshot.
7. Execute reference semantics with resource/deadline/cancellation checks.
8. Atomically publish the command's declared write unit and visibility/index changes.
9. Apply projection/pagination/batching and serialize a typed result.
10. Record the idempotent result/concern acknowledgement at its defined durability boundary.

Validation/authorization failure publishes nothing and creates no observable partial cursor/result. Physical plans/backends can reorder safe work but cannot change target set, result/order, error, generated ID, or atomic unit.

## V1 write atomicity

Native v1 supports:

- Atomic single-document insert, replacement, update, upsert, and delete.
- Atomic multi-document/batch write within the one local range, up to 1,000 target/input documents and the command/transaction resource limit.

`insertMany`, `updateMany`, and `deleteMany` therefore commit all selected mutations or none. A validation, uniqueness, write-conflict exhaustion, limit, deadline, cancellation, durability-before-commit, or document runtime error aborts the entire native command. There is no native ordered/unordered partial-success mode in v1.

The command's target/input order is still stable for ID generation, deterministic error selection/reporting, fixtures, and result arrays. Compatibility adapters may emulate a partial-write upstream command by issuing explicit smaller native commands only when the compatibility matrix documents the resulting atomicity/retry difference.

## Read/write snapshot and target selection

- One command evaluates filters against one pinned read snapshot and expiry cutoff.
- A multi-write determines its complete target `_id` set from that snapshot before applying mutations (no Halloween/self-rematch effect).
- `updateOne`, `replaceOne`, and `deleteOne` choose the first matching document in explicit sort order, or the deterministic default order from `P01-017`.
- Multi-write execution/lock acquisition uses ascending `_id` order independent of scan/backend completion to avoid nondeterministic conflicts.
- If a multi-write would target more than 1,000 documents, it returns the stable batch-target-limit error before mutation; callers paginate explicit atomic batches or use a later bulk workflow.
- Concurrent modification after selection produces the transaction/write-conflict behavior from `P06-*`; a bounded internal retry re-evaluates the whole command or returns a retryable conflict without partial publication.

An explicit `sort` on one-document write commands uses the same sort/path rules as find and has the implicit `_id` tie-break.

## Insert semantics

### `insertOne`

Input is one root object.

1. Validate field names, unique keys, types, depth/count/size, protected fields, and optional schema.
2. Preserve explicit accepted `_id` or generate once under `P01-009`.
3. Capture/resolve deterministic defaults such as statement time.
4. Revalidate the completed canonical document/size.
5. Check primary/secondary uniqueness and publish document/index/change/WAL state atomically.

Result contains:

```text
acknowledged
insertedCount = 1
insertedId (exact typed value)
writeConcern/commit metadata as later defined
```

### `insertMany`

- Input is a nonempty array of 1–1,000 root objects.
- Documents are normalized/assigned IDs in input index order.
- All completed documents are validated together, including conflicts among the batch and existing unique keys.
- One atomic commit publishes all or none.
- Successful `insertedIds` is an input-index-ordered array/map of exact typed IDs.
- On failure, the result/error identifies the deterministic lowest input index for the primary error and may include all validation conflicts discovered without implying partial success.
- Empty input is a validation error, not a successful zero insert.
- `ordered`/`continueOnError` options are unsupported in the native atomic profile and rejected explicitly.

## Replacement semantics

`replaceOne` accepts a filter, one replacement root object, optional target sort, and optional `upsert`.

- Replacement is a complete document, not an operator object.
- It passes normal object/name/type/limit/schema validation.
- If a document matches, omitted `_id` inherits/prepends the existing ID; explicit `_id` must have exact typed payload identity under `P01-009`.
- Every old user field omitted from replacement becomes missing.
- Protected engine metadata is regenerated/preserved only by its owning subsystem, never copied from client fields.
- Unique/index changes and row replacement publish atomically.
- Replacing with a canonically typed-content-identical mapping is a no-op: it retains the existing presentation order and does not increment `modifiedCount`.

Result on match:

```text
matchedCount = 1
modifiedCount = 0 | 1
upsertedCount = 0
```

No match returns zero counts unless `upsert` creates one document.

## Update command semantics

`updateOne` and `updateMany` accept one normalized update document composed only of supported update operators. A replacement document uses `replaceOne`, never an inferred update mode.

- `updateOne` selects at most one target by explicit/default order.
- `updateMany` selects every match in the pinned snapshot, capped at 1,000, and commits all document post-images atomically.
- Each post-image is produced independently from its pre-image under `P01-014`, then all post-images pass limits/schema/uniqueness together.
- `matchedCount` counts selected documents even if an update is a no-op.
- `modifiedCount` counts documents whose canonical typed content changes; presentation-only changes count only if an operator explicitly permits/changes presentation.
- Updating a field so it compares semantically equal but changes exact stored type/payload is a modification unless forbidden by the operator/type contract.
- Empty update, unknown operator, root replacement/update mixing, and conflicting paths are validation errors.

## Upsert semantics

`upsert: true` is supported by `replaceOne`, `updateOne`, and `updateMany`.

- If one or more documents match, no insert occurs; normal one/many update semantics apply.
- If none match, exactly one document is constructed/inserted, even for `updateMany`.

Construction:

### Replacement upsert

The replacement is the base document. An unambiguous accepted root `_id` equality from the filter may supply `_id` only when replacement omits it; conflict is an error. Otherwise ID precedence/generation follows `P01-009`.

### Modifier upsert

1. Start with an empty root object.
2. Extract only exact equality literals from conjunctive, single-valued, non-operator field paths.
3. Do not extract range/negation/list/regex/schema/vector predicates, `$or`/`$nor`/`$not`, multivalue paths, or ambiguous/conflicting equalities.
4. Create extracted paths under the normal path/conflict rules.
5. Apply the update once using insert/upsert-specific operator rules from `P01-014`.
6. Resolve `_id` with explicit update seed, extracted exact `_id`, then generated-profile precedence.
7. Validate/insert atomically.

Ambiguous/conflicting extraction is a validation error rather than silently ignored synthesis. Result includes `upsertedCount = 1`, exact `upsertedId`, `matchedCount = 0`, and `modifiedCount = 0` (the row was inserted, not modified).

## Delete semantics

`deleteOne`/`deleteMany` select visible/authorized matches under the pinned snapshot and create atomic logical tombstones/index removals.

- `deleteOne` selects first by explicit/default order.
- `deleteMany` targets all matches up to 1,000 and commits all tombstones or none.
- No match succeeds with `deletedCount = 0`.
- Each deleted document counts once regardless of derived index entries.
- TTL-expired/invisible documents are not ordinary delete matches; maintenance cleanup uses its separate authorized path.
- Physical bytes may remain for snapshots/recovery/compaction; they are not visible after the delete commit to later snapshots.
- Native v1 delete does not return deleted documents. A future find-and-delete command requires an explicit result/atomicity contract.

## Write result and idempotency

Every write result includes stable command/request identity plus relevant counts/IDs and concern metadata. Counts are exact nonnegative integers.

An optional idempotency key binds to the canonical normalized command hash, principal, database, collection, and semantic/protocol version:

- First execution records the resolved generated IDs and final result atomically with/recoverably adjacent to the write.
- Same key plus same command returns the prior committed result without re-executing/generating.
- Same key plus different command/scope is a conflict error.
- In-progress/unknown-outcome retry returns explicit status/retry metadata; it never guesses success.
- Expiry/retention of retry records is documented and cannot make an SDK retry a non-idempotent write silently.

Write concern/ack/durable failure boundaries are implemented by `P06-011`; semantic counts never claim a mutation that did not reach the selected acknowledgement boundary.

## Find/count execution order

Semantic find order is:

```text
visible + authorized snapshot rows
→ scalar filter/reference verification
→ exact vector top-k selector when present
→ explicit sort or deterministic default order
→ skip
→ limit
→ projection
→ cursor batching/serialization
```

An exact `$vectorTopK` establishes score/`_id` order and cannot be combined with a separate explicit sort in v1. Skip/limit may narrow its already selected `k` results.

`count` counts matching rows after filter and optional skip/limit, ignores projection/sort unless a future command explicitly requests sorted counting, and does not create a document cursor when the exact count fits the response type. TTL-invisible/unauthorized rows never count. `$vectorNear` may be a count predicate; global `$vectorTopK` is invalid in count because it is a ranked result selector rather than a Boolean filter.

## Projection modes

Find projection is either inclusion or exclusion. Computed expressions belong to aggregation `$project`, not CRUD find projection.

Accepted values are exactly Boolean or integer `0`/`1` with the corresponding meaning. Mixed inclusion/exclusion is invalid except `_id` may be explicitly excluded from an inclusion projection or included in an exclusion projection.

### No projection

Return the full visible document with exact stored types/presentation order, subject to response redaction policy outside ordinary authorized CRUD.

### Inclusion

- Start with no user fields.
- For each source field/path requested as include, retain it only if present; missing remains absent and null remains null.
- Retained fields follow source presentation relative order, not projection-spec/host map order.
- `_id` is included by default unless explicitly excluded.
- Selecting an object/array field as a whole preserves its complete value/order.
- Selecting nested object-only paths preserves necessary existing ancestor objects but does not synthesize an ancestor solely for a missing child.

### Exclusion

- Start with the full document.
- Remove each requested present field/path; missing removal is a no-op.
- Remaining fields retain source presentation order.
- `_id` is included by default unless explicitly excluded.

### Nested/multivalue boundary

CRUD projection paths may traverse objects, but any array must be the terminal whole projected value. Neither implicit fan-out nor explicit numeric-index descent is supported in CRUD projection v1 because inclusion/exclusion would otherwise need sparse/shape-changing array output rules. Encountering an array before the terminal path is an ambiguous-array-projection error. Callers project the whole array or use the versioned aggregation projection/unwind semantics.

Two projection paths cannot conflict as duplicate or ancestor/descendant instructions unless the normalized result is identical and explicitly permitted; otherwise validation fails. Projected output must pass depth/field/document limits and authorization/policy checks cannot be bypassed through parent projection.

## Sort semantics

Sort specification contains 1–64 unique field paths with direction `1` (ascending) or `-1` (descending). Boolean, zero, other integers, strings, and duplicate/conflicting paths are invalid directions/specifications.

For each row:

- Resolve each path under object/explicit-index rules.
- Zero candidates is Missing; one candidate is its typed sort value.
- More than one candidate from implicit array fan-out is an ambiguous-multivalue sort error; v1 never chooses min/max/first arbitrarily.
- A field whose one resolved value is an array compares as a whole lexicographic array.
- Compare keys in specification order using the total type/value order from `P01-012`.
- Direction reverses the complete key comparison including missing/null/type rank.

After all explicit keys tie, append implicit `_id` ascending unless `_id` is already an explicit key. This guarantees a total stable order because `_id` is unique. Sort may use an index/GPU top-k only when it reproduces these keys/ties exactly or returns verified candidates.

Without explicit sort or vector ranking, `P01-017` defines the deterministic default order; storage/worker/GPU completion order is never returned accidentally.

## Skip and limit

- `skip` is an exact nonnegative int32/int64; absent means `0`.
- `limit` is an exact nonnegative int32/int64; absent means no semantic limit, while explicit `0` returns zero rows.
- Negative, float/decimal, overflow, and host-truncated values are validation errors.
- Skip and limit apply after stable order/top-k and before projection.
- Skipping beyond result count returns empty.
- Limit larger than remaining count returns all remaining rows.
- Resource/result/cursor batch quotas may require cursor batching but do not change semantic limit.

Large skip may be admitted/rejected by work/deadline policy; it is not rewritten into an unstable physical offset. Resume-key pagination is preferred but must preserve the same normalized sort/snapshot contract.

## Cursor snapshot semantics

A cursor is a versioned capability over one immutable logical result stream. Creation pins:

- principal/tenant/database/collection authorization scope;
- semantic/protocol/feature/limit profile;
- normalized filter/vector/sort/skip/limit/projection fingerprint;
- read snapshot/version and TTL expiry cutoff;
- stable last-key/ordinal and remaining limit;
- deadline/idle/absolute expiry and resource accounting.

Consequences:

- Every batch observes the same snapshot and TTL cutoff; concurrent inserts/updates/deletes neither appear nor create gaps/duplicates.
- Batches concatenate to exactly the one-shot ordered projected result.
- Cursor batch size is a positive exact integer up to the advertised cap (default/max 1,000 documents) and response-byte quota; a single valid document is never split/truncated.
- Server/embedded code may retain state or encode a signed/opaque continuation token, but clients cannot edit/forge snapshot/query/position.
- Authorization is rechecked as policy requires; revocation closes/denies without leaking further rows.
- Batch production is atomic: error/cancellation returns no partial batch, though prior successfully delivered batches remain delivered.
- Empty final batch closes the cursor and marks exhaustion; explicit close/cancel is idempotent.
- Idle/absolute expiry, snapshot-retention exhaustion, process loss without durable cursor support, or invalid token returns a typed cursor error. The engine never restarts from “now” silently.
- Cursor IDs/tokens are unguessable/redacted, scoped to session/principal, and resource-quota controlled.

Cursor retry of the same acknowledged batch request uses request/batch sequence identity to return the same batch or explicit unknown outcome rather than advancing twice. Exact protocol mechanics are frozen by `P12-002`/`P12-005`.

## Pagination and mutation interactions

- Stable sort keys plus `_id` make skip/limit/cursor pagination deterministic within the pinned snapshot.
- Projection does not remove information needed internally for cursor continuation; hidden continuation keys are not exposed unless requested.
- If sort/vector fields mutate concurrently, the pinned snapshot retains their old values/order for this cursor.
- TTL time advancing after cursor creation does not remove a row visible at pinned cutoff.
- Cursor/snapshot age may block compaction; retention quotas expire the cursor explicitly rather than violating snapshot semantics.

## Error and cancellation behavior

- Decode/validation/auth errors occur before snapshot/write/cursor publication.
- Deadline/cancellation before atomic commit publishes no write. After a selected concern boundary, the result uses committed/unknown-outcome metadata; it never reports a definite abort incorrectly.
- Read/cursor deadline/cancellation publishes no partial current response/batch.
- A malformed/corrupt row encountered in an applicable query aborts the command/cursor batch; it is not skipped.
- Multi-write conflicts/errors abort every mutation in that command.
- Error categories/codes/retry metadata are frozen by `P01-016`.

## Compatibility boundary

Native atomic multi-write, null/array/object semantics, field grammar, projection fan-out restriction, explicit limit-zero behavior, deterministic default/tie order, UUIDv7 default, and snapshot cursor behavior differ from some MongoDB commands/drivers.

The MongoDB adapter may decompose commands or translate options only for an explicitly tested matrix. It must disclose loss of native batch atomicity or upstream partial-write behavior and cannot return a native all-or-none result in an upstream partial-success shape misleadingly.

## Required fixtures

The semantic corpus includes:

- Insert explicit/generated IDs, duplicate/schema/limit failures, atomic 1/1,000 document batches, and stable ID/error order.
- Replacement omitted/same/different `_id`, missing fields, identical/no-op, uniqueness, and upsert.
- One/many update target snapshots, no-op/type change, >1,000 target rejection, conflict/retry, and atomic rollback.
- Upsert extraction accepted/rejected Boolean/path cases and exact ID precedence.
- One/many delete target order, zero match, TTL visibility, tombstone snapshots, and rollback.
- Inclusion/exclusion/mixed `_id`, missing/null, object paths, array whole-value versus nested/index errors, source order, and output limits.
- Full type/missing/null/array sort, directions, compound ties, `_id` tie, ambiguous multivalue, vector-sort conflict, and backend equivalence.
- Skip/limit absent/zero/boundary/beyond/invalid cases.
- Cursor one-shot equivalence across batch sizes, concurrent mutation/TTL, retry same batch, cancellation, expiry/revocation/process loss, byte quotas, and no gaps/duplicates.
- Idempotency same/different command, crash/unknown outcome, concern boundaries, and generated-ID reuse.

## Follow-up ownership

| Plan item | Remaining responsibility |
| --- | --- |
| `P01-014` | Update operator/path/conflict/post-image semantics |
| `P01-015` | Aggregation pipeline and computed projection/unwind |
| `P01-016`–`P01-017` | Stable errors/retries and default ordering |
| `P01-018`–`P01-020` | Executable fixtures/reference oracle |
| `P06-*` | MVCC, atomic batch, conflicts, idempotency, concerns, snapshot retention |
| `P07-*`, `P12-*` | Command/parser/executor/cursor/protocol/SDK implementation |

No implementation may partially commit a native multi-write, reselect targets mid-command, regenerate IDs on retry/replay, use storage order as target/result order, synthesize missing projection values, choose an arbitrary multivalue sort key, treat explicit limit zero as unlimited, or resume an expired cursor at a newer snapshot without a versioned semantic change.

# V1 Default Result Ordering and Stable Ordinal Semantics

- Status: Accepted semantic baseline
- Profile: `default_order_v1`
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-017`
- Governing requirements: `QUERY-001`, `INV-002`
- Governing gate: `G01`
- Decision: [ADR 0010](../adr/0010-use-id-order-as-the-native-default.md)
- Normative dependencies: [identifier semantics](identifier-semantics.md), [CRUD/query semantics](crud-query-semantics.md), [aggregation semantics](aggregation-semantics.md), [operator truth tables](operator-semantics.md), and [error semantics](error-semantics.md)

This document defines every native v1 row/result tie and default order, hidden pipeline provenance, cursor continuation order, backend equivalence, and the limited internal/operational surfaces whose interleaving is intentionally unspecified. A supported collection query never leaks physical scan, hash, worker, GPU, or arrival order merely because no explicit sort was supplied.

## Ordering domains

The following orders are separate and must not be conflated:

| Domain | Meaning |
| --- | --- |
| Document stream order | Order of documents/rows returned or selected by a command |
| Document field presentation order | Order of fields within one returned object under object/projection rules |
| Array element order | Stored or constructed dense element sequence |
| Command input order | Position of documents/operations supplied in one batch |
| Mutation serialization order | Internal lock/WAL/commit ordering, normally not visible as partial results |
| Change/event order | Commit/log/resume-token order defined by the later stream protocol |
| Physical order | Blocks, memtables, files, index pages, hash buckets, bitmaps, workgroups, and completion timing |

`default_order_v1` governs document streams. It does not reorder object fields or array elements, reinterpret batch positions, define change-stream causality, or expose physical layout.

## Native default collection order

For a collection-derived stream with no explicit sort and no intrinsic ranking/order-resetting operation, visible authorized rows are ordered by root `_id` ascending under the exact total primary-ID order from `P01-009`:

```text
numeric int32/int64
< string
< generic binary
< uuid
< objectId
```

Within each class, the identifier contract supplies exact numeric or unsigned-byte ordering. Equal numeric IDs of different integer widths cannot coexist, and every stored document has one unique accepted `_id`; therefore the key is total without a further tie-break.

Rules:

- Visibility, snapshot, TTL cutoff, and authorization are resolved before a row may appear; ordering does not leak excluded rows.
- Ascending `_id` is semantic, not “natural,” insertion, commit-time, generation-time, WAL, primary-file, or current index traversal order.
- UUIDv7/ObjectId byte locality does not make arbitrary user IDs chronological; default order makes no creation-time promise.
- A filter preserves the relative `_id` order of matches.
- Skip and limit apply after this order and before projection/batching.
- Projection may hide `_id` from output but cannot change the hidden continuation/order key.
- The normalized query/cursor/cache/explain metadata names profile `default_order_v1` whenever this rule applies.

An implementation may satisfy this order with an ascending primary-index scan, reorder a candidate bitmap/key set, perform a stable external sort, or use any proven equivalent method. It may return a typed quota/deadline/capability error when admitted resources cannot enforce the order; it cannot silently return a cheaper physical order.

## Ordering precedence

For a native find-like stream, exactly one primary ordering source applies:

1. An intrinsic exact rank operator such as `$vectorTopK` establishes metric score direction, then ascending `_id` for exact score ties.
2. Otherwise an explicit sort compares its declared keys in order and uses ascending `_id` as the final tie-break unless `_id` is itself an explicit key.
3. Otherwise `default_order_v1` uses ascending `_id`.

V1 forbids combining `$vectorTopK` with a separate explicit sort. If explicit sort contains `_id`, its declared position/direction participates normally and no second implicit `_id` key is appended. An explicit descending non-ID sort still uses ascending `_id` after all declared keys tie; direction never leaks into the implicit tie key.

Aggregation uses the same source order, then stage-specific hidden ordinals below. A later explicit `$sort` overrides the current visible order while retaining the hidden ordinal as its final stable tie-break.

## Command/result matrix

| Surface | Required order |
| --- | --- |
| `find` / empty aggregation source | Ascending `_id` absent rank/sort; ranking or explicit-sort rules otherwise |
| `findOne`-equivalent future command | First row under rank/explicit/default order |
| `updateOne`, `replaceOne`, `deleteOne` | First matching target under explicit sort or ascending `_id` default |
| `updateMany`, `deleteMany` target set | Selected and internally enumerated/locked by ascending `_id`; atomic response currently exposes counts, not row sequence |
| `insertOne` result | Singleton |
| `insertMany` input-correlated IDs/results | Original command input index, including generated IDs; not sorted by generated/explicit `_id` |
| Multi-write target error/diagnostic | Stable command-input index when input-correlated, otherwise target `_id`, then path/code under error precedence |
| `count` command | Singleton scalar/result; when skip/limit makes conceptual row selection relevant, that selection uses the applicable rank/default stream |
| `$vectorTopK` | Reference metric direction, exact score, then ascending `_id` |
| Explicit CRUD sort | Declared key tuple, then implicit ascending `_id` unless already explicit |
| Aggregation without `$sort` | Source/stage order carried by hidden `stable_ordinal` |
| Aggregation `$group` output | Ascending canonical semantic group-key order, with Missing before null and then total value rank |
| Aggregation `$count` output | Singleton ordinal |
| Cursor batches | Contiguous slices of the one-shot ordered stream at the pinned snapshot |

Input-correlated results use a distinct tagged ordinal such as `input(index)`. They never claim collection order. Future bulk commands that mix operation kinds must define whether every output is input-correlated or stream-correlated; they cannot guess per implementation.

## Hidden stable ordinal

Every semantic row has a collision-free internal `stable_ordinal`. It is typed/tagged and length-delimited; naive byte/string concatenation is forbidden.

Conceptual forms:

```text
source(id_order_key)
unwind(parent_ordinal, element_index)
group(canonical_semantic_group_key)
singleton(stage_identity)
input(command_index)
sort(normalized_key_tuple_with_directions, prior_ordinal)
```

The ordinal is metadata, not a stored/returned document field:

- Collection source assigns `source(_id)` under `default_order_v1`.
- `$match`, `$project`, `$skip`, and `$limit` preserve each retained ordinal unchanged.
- Removing, renaming, or computing visible `_id` never changes source provenance.
- `$unwind` emits immediate elements by ascending zero-based index and appends the index to the parent ordinal. Repeated unwind nests tagged tuples, so different paths/index sequences never alias.
- `$group` resets output order/provenance to the canonical semantic group key. Equal numeric widths, object field presentation permutations, NaN payload aliases, and other semantic-equality classes produce one canonical group ordinal, not competing physical hashes; the visible key representative is the first exact key by current input ordinal.
- `$count` emits the one singleton ordinal even for empty input.
- `$sort` compares explicit keys, then the existing ordinal, and replaces the current ordinal with `sort(keys, prior_ordinal)`. Thus a later stable sort preserves the immediately prior stream order for ties while retaining nested source provenance.
- Accumulator tie rules that retain “first” use the contributing current ordinal, not hash/merge completion.

A future cardinality-changing/combining stage must define an injective provenance transform before admission. For example, a future union needs a stable branch tag before child ordinals; a join needs ordered left/right provenance. Lacking such a rule is an unsupported feature, not permission to use worker order.

The ordinal encoding/version is an internal deterministic-core contract and fixture field, but clients receive only opaque cursor/resume state. They cannot construct ordinals or depend on internal bytes.

## Pipeline stage ordering

An empty pipeline is the source stream in ascending `_id` order. Order behavior by required stage:

| Stage | Order behavior |
| --- | --- |
| `$match` | Stable filter; preserves relative ordinals |
| `$project` | Preserves row ordinals regardless of visible field changes |
| `$skip` / `$limit` | Selects a contiguous prefix/suffix window and preserves retained order |
| `$sort` | Declared keys, then prior stable ordinal; emits a new structured sort ordinal |
| `$unwind` | Replaces each parent position with children in ascending element-index order |
| `$group` | Resets to canonical group-key order; deterministic accumulator reductions still use input ordinals |
| `$count` | Replaces stream with one singleton row |

Stage order remains semantic. An optimization may push, fuse, parallelize, spill, or use GPU partials only when it reproduces the same final ordinal sequence, values, errors, and resource contract. In particular, limit/skip cannot move before an ordering/filter/cardinality-changing stage merely because the physical producer is currently stable.

## Pagination and cursor continuation

The complete logical continuation key is:

| Stream | Continuation tuple |
| --- | --- |
| Default collection stream | `_id` order key |
| Explicit CRUD sort | Every normalized explicit key plus implicit `_id` when needed |
| Exact vector rank | Reference score bits/value in metric direction plus `_id` |
| Aggregation | Current hidden stable ordinal, which structurally includes any active explicit sort tuple and prior provenance |
| Input-correlated batch stream | Command input index |

Cursor state also pins snapshot, TTL cutoff, query/profile/version, authorization scope, and remaining skip/limit as defined by CRUD semantics. Projection never removes continuation state. Batches of any legal size concatenate to the exact one-shot sequence with no duplicate/gap.

A fresh query at a later snapshot is not continuation: inserts/deletes/updates may legitimately change membership and order. Only a valid pinned cursor or future versioned resume-key API carries the original continuation contract. Expired/invalid cursor state fails explicitly; it never restarts at current physical position.

## Mutation selection and side effects

- One-target writes choose the first match by explicit/default semantic order before mutation.
- Multi-target writes freeze the complete matching `_id` set at one snapshot, sort it ascending, and use that order for locks, deterministic evaluation/diagnostics, index/WAL delta construction, and fixtures.
- All native v1 multi-writes are atomic, so intermediate mutation order is not visible as partial success.
- A retry reselects the complete command only under transaction/idempotency rules and must reach the same semantic order for the same snapshot/state.
- Change events use commit/log sequencing defined by the later change-stream contract. They are not retrospectively sorted by document `_id`.

Generated IDs for `insertMany` are resolved in command input order so retries and returned `insertedIds` remain position-correlated. The committed collection becomes visible under normal `_id` order regardless of insertion input order.

## Backend, index, and distributed invariants

- Primary, secondary, compound, unique, TTL, vector, columnar, bitmap, hash, spill, cache, and GPU paths return the same final order as the reference collection stream.
- A secondary index scan's key order is not automatically result order when the command lacks that matching explicit sort. Candidate IDs are reordered by the applicable semantic tuple.
- Bitmap bit position, sidecar row ID, memtable/file generation, compaction output, GPU invocation/workgroup/lane, and worker completion are never public tie-breaks.
- Stable external sort records carry the complete semantic key and ordinal; spill partition/run merge cannot truncate hidden ties.
- Candidate/top-k pushdown may prune only with proof that final membership and order are unchanged; CPU reference verification/reranking remains authoritative where required.
- Query caches store ordered result identities and include the order profile/sort/rank version in their key.
- Replicas/restores/rebuilds with different physical layouts must return identical ordered hashes.
- Future shards/ranges merge globally by the semantic tuple. Range/shard/replica arrival order is not an acceptable v2 default.

Planner cost includes reorder/materialization/spill/merge work. Explain identifies `default_order_v1`, explicit/rank keys, hidden tie source, physical order provider, reorder/spill, and final verification without exposing document keys.

## Intentionally unspecified order

No supported v1 data query/result array is silently unordered. The following orders are intentionally unspecified because they are internal, independently concurrent, or explicitly non-semantic:

| Surface | Rule |
| --- | --- |
| Physical rows/files/pages/hash buckets/index-build partitions/bitmap/GPU work | May vary freely; never observable as query order |
| Independent commands from different clients/sessions | Their response completion/interleaving is unspecified absent transaction/causal protocol; each response's contents remain ordered |
| Thread/process/device log, metric, and trace arrival | Unspecified without an explicit sequence/causal key; timestamps alone are not total order |
| Scheduler progress, background compaction/build/cleanup completion | Unspecified; state transitions and final artifacts must still be valid/deterministic where promised |
| Non-normative timing samples in `explain`/diagnostics | Collection timing may vary; any exposed array with semantic meaning must define/canonicalize its own order |
| Mathematical set/map/hash membership | Order is irrelevant to equality/membership; serialization/presentation of a public array/object still follows its own contract |
| Future cross-range concurrent change events | Outside v1; a stream profile must define resume/causal/merge order before support |

There is no native v1 `natural` order, `$natural` sort, or `order: unspecified` performance escape hatch. A future public response field may be unordered only if its versioned schema explicitly labels set semantics, fixtures compare it as a set, and cursor/pagination do not depend on iteration order. Existing ordered fields cannot be weakened additively.

Object mapping equality being field-order-independent does not make presentation order unspecified. Array order always remains semantic. Counts/singletons/empty results have trivial order.

## Error and resource behavior

- Ordering keys validate before results; invalid/ambiguous sort/rank/provenance state returns the stable typed error.
- Resource/deadline/capability failure while reordering returns no partial current response/cursor batch.
- Corrupt duplicate/missing primary IDs or ordinal collisions are durability/internal invariant failures, never arbitrary ties.
- Parallel target failures select the primary error under `errors-v1`, using stable input index or `_id` order rather than completion time.
- CPU/GPU/index paths must return identical ordered errors as well as values; fallback cannot restart at a different order/snapshot.

## Compatibility boundary

Familiar query syntax does not imply another database's unsorted/natural order. The Mongo-like adapter:

- may claim exact ordering compatibility for an explicitly sorted, differentially tested subset;
- marks unsorted/default-order behavior `different` unless an upstream profile makes an equivalent guarantee and executable tests prove it;
- never maps an upstream natural/physical-order request to `default_order_v1` while calling it exact;
- preserves upstream input-correlated bulk response positions when its decomposition/profile supports them;
- cannot sacrifice native deterministic order internally and still expose the native contract.

Redis-like multi-key/subscriber/stream ordering and future SDK collection types receive separate adapter/protocol contracts. They do not inherit `_id` order when their semantic source is argument or event order.

## Versioning and migration

`default_order_v1` is part of normalized commands, semantic fixture headers, plan/cache keys, cursor tokens, explain, protocol capability negotiation, adapter matrices, and persisted/resumable query state.

Changing the default key, type order, explicit-sort tie key/direction, vector tie, group order, ordinal transform, or unordered-surface classification is a breaking semantic change. It requires a new named profile, accepted ADR, regenerated corpus/oracle/differential hashes, planner/index/distributed assessment, cursor/cache invalidation or migration, protocol/SDK/adapter updates, and release notes. Existing cursors never reinterpret their profile after upgrade.

Physical algorithms/layout may change without semantic migration when conformance proves the same values/order/errors. Adding a future unordered command/field is additive only when it is new, explicitly named, non-pageable/set-semantic, and cannot be confused with an ordered v1 surface.

## Required conformance fixtures

`P01-018`–`P01-020` must include:

- mixed accepted `_id` classes, integer widths/boundaries, UTF-8, binary, UUID, and ObjectId order;
- filters yielding sparse/interleaved ID matches with no sort, skip/limit, projection excluding `_id`, and every cursor batch size;
- one-target write selection and multi-target diagnostic/lock enumeration independent of physical/index order;
- `insertMany` input-correlated IDs/results distinct from committed collection order;
- explicit ascending/descending/compound sort ties, explicit `_id` direction, missing/null/type ties, and stable ordinal fallback;
- exact vector score ties by `_id` and different GPU/index candidate/completion orders;
- empty pipeline and every required stage's preserve/reset/expand behavior, repeated unwind, projected/overwritten `_id`, group equality aliases/canonical order, and accumulator equal-value first retention;
- primary scan, every applicable secondary index, row/column/bitmap/hash/spill/GPU-disabled/GPU candidate paths producing identical ordered hashes;
- different memtable/flush/compaction/rebuild/restore layouts and future shard-arrival permutations;
- cursor one-shot equivalence, retry, expiry, pinned mutation/TTL, and profile-version rejection;
- independent request/log/background completion examples labeled unspecified without weakening per-result order.

Any value/member mismatch, order drift, duplicate/gap, different one-target selection, physical-order leakage, or backend-dependent error is a blocking correctness finding. Tests compare exact typed ordered outputs, not set equality, except fields explicitly registered with set semantics.

## Follow-up ownership

- `P01-018`–`P01-020`: encode order profiles/ordinals/expected sequences in fixtures and the independent oracle.
- `P03-*`–`P09-*`: primary/index/format/spill/CPU ordering providers and rebuild equivalence.
- `P10-*`: GPU candidate/final order and stable top-k/sort/group proof.
- `P11-*`–`P12-*`: embedded/browser/server cursors, protocol/SDK continuation, and response types.
- `P14-*`–`P15-*`: explain/diagnostics and restore/rebuild ordered-hash evidence.
- `P17-*`–`P22-*`: global merge, change/sync streams, cache multi-key behavior, and adapter matrices.

## References

- [Specifications](../../Specifications.md)
- [Implementation plan](../../ImplementationPlan.md)
- [Identifier semantics](identifier-semantics.md)
- [CRUD/query semantics](crud-query-semantics.md)
- [Aggregation semantics](aggregation-semantics.md)
- [Stable error semantics](error-semantics.md)

No implementation may expose insertion/storage/index/hash/worker/GPU/shard arrival as native query order, omit a required tie key, reorder input-correlated results, lose hidden provenance, return a partial unstable batch, or label a deliberately different unsorted adapter behavior as exact without a superseding semantic decision and executable compatibility proof.

# Missing and Null Semantics

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-002`
- Governing requirement: `DATA-002`
- Governing gate: `G01`
- Normative parents: [Specifications section 7.3](../../Specifications.md#73-canonical-binary-document-format) and [logical value model](value-model.md)

This document defines how an absent field differs from a present field whose value is `null`. The distinction is observable and must survive every storage and execution path. Operator details not concerned with presence remain owned by later Phase 1 contracts.

## Semantic states

Path evaluation produces exactly one of these internal states:

```text
Present(value)  the terminal path exists; value may be null
Missing         the terminal path does not exist
Error(error)    command, path, or evaluation is invalid
```

`Missing` is not a logical value, cannot be inserted, and cannot occupy an array slot. It may appear transiently as an expression result, index component, grouping key, sort key, or sidecar presence state when that operation must preserve absence.

These states must never be collapsed by representing both `Missing` and `Present(null)` as a host-language null pointer, option-none, JavaScript `null`, zero tag, or absent bitmap.

## Path evaluation

For a non-array object path such as `profile.name`:

| Document fragment | Result for `profile.name` |
| --- | --- |
| `{}` | `Missing` |
| `{ "profile": null }` | `Missing` |
| `{ "profile": 7 }` | `Missing` |
| `{ "profile": {} }` | `Missing` |
| `{ "profile": { "name": null } }` | `Present(null)` |
| `{ "profile": { "name": "Ada" }` | `Present("Ada")` |

An absent segment or a present non-object intermediate segment makes the remaining path `Missing`; ordinary filter evaluation does not turn that shape mismatch into an error. Malformed path syntax, forbidden system-field access, and invalid operators are `Error`, not `Missing`.

Array traversal and multikey expansion preserve the same element-level distinction but are frozen under `P01-008`. Until then, implementations must not invent array-specific presence behavior.

## Reads and serialization

Full-document reads reproduce stored shape exactly:

- A present null field is returned as that transport's typed null.
- A missing field is absent from the returned object.
- Reading a path through a typed API returns an explicit present/missing result; it must not expose both as the same SDK value.
- JSON serialization omits missing object members. It never serializes a missing member as `null`.
- Sparse host arrays are invalid input; encoders may not turn holes into missing stored elements.
- Change events and before/after images preserve whether a field was created, set to null, or removed.

An API may provide an explicit convenience such as `getOrNull`, but its name and documentation must disclose that it collapses states. Such a convenience cannot be used in the engine, compatibility oracle, or conformance fixtures.

## Filter predicate model

Document filters are two-valued after validation: each document either matches or does not match. Missing operands do not introduce SQL-style `UNKNOWN`. Invalid command structure or incompatible literal syntax is an error before or during evaluation as defined by the operator contract.

### Presence and type

| Path state | `$exists: true` | `$exists: false` | `$type: "null"` | `$type: T` where `T != "null"` |
| --- | ---: | ---: | ---: | ---: |
| `Missing` | false | true | false | false |
| `Present(null)` | true | false | true | false |
| `Present(value of T)` | true | false | false | true |
| `Present(value of another type)` | true | false | false | false |

`missing` is not accepted as a `$type` name. Native queries use `$exists: false` to select missing paths.

### Comparison interaction

The table below fixes only missing/null participation. Numeric, string, array, and cross-type comparison details are defined elsewhere.

| Predicate on path `p` | `p` missing | `p` present null | `p` present non-null |
| --- | ---: | ---: | ---: |
| `{p: {$eq: null}}` | false | true | false |
| `{p: null}` native equality shorthand | false | true | false |
| `{p: {$ne: null}}` | true | false | true |
| `{p: {$eq: x}}`, `x` non-null | false | false | compare values |
| `{p: {$ne: x}}`, `x` non-null | true | true | negate equality |
| `{p: {$gt/$gte/$lt/$lte: x}}` | false | compare only if type-order contract permits | compare values |
| `{p: {$in: [values]}}` | false | true only if null is an equal member | true if an equal member exists |
| `{p: {$nin: [values]}}` | true | inverse of `$in` | inverse of `$in` |

`$ne` and `$nin` are predicate complements and therefore match a missing path. To require presence as well, callers combine the predicate with `$exists: true`.

Logical operators combine the Boolean match results. In particular, `$not` complements the nested predicate for the current document, so it may match a missing path when the nested predicate does not. The complete operator grammar and invalid-operand rules are frozen by `P01-012`.

### Native versus MongoDB adapter behavior

Native HelixDB equality with a null literal matches only an explicit null. [MongoDB null equality matches both explicit null and a missing field](https://www.mongodb.com/docs/manual/tutorial/query-for-null-fields/); the later compatibility adapter must rewrite a claimed-compatible query to the explicit native disjunction or report that form as different/unsupported. It must not change the native semantic core.

The versioned compatibility matrix and differential fixtures under `P01-021`, `P01-022`, and `P22-*` own the exact adapter claim.

## Sorting

Missing and null are distinct sortable states. For ascending native sort, the presence prefix order is:

```text
Missing < Present(null) < Present(non-null value)
```

Descending sort reverses the complete encoded key, including the presence prefix. The type/value order among non-null values is frozen by the numeric, string, array, and identifier contracts.

Consequences:

- A missing sort path does not become null.
- Compound sort keys retain a distinct presence prefix for every component.
- Index keys used to satisfy sort encode the same prefixes and direction rules.
- Distributed merge and cursor resume tokens carry the same logical sort key.
- Equal logical sort keys use the stable tie-breaker defined by `P01-017`; storage iteration order is not semantic.

## Projection and expressions

Inclusion projection follows these rules:

| Input path state | Projected result |
| --- | --- |
| `Missing` | Output path remains absent |
| `Present(null)` | Output path is present with null |
| `Present(value)` | Output path is present with the value |

Exclusion projection removes a selected field whether its value is null or non-null; excluding a missing field is a no-op. Projecting a nested missing child must not create empty parent objects solely to hold absence.

An expression that evaluates to `Missing` propagates missing unless the expression/operator explicitly handles absence. When a projected computed field finishes as `Missing`, the field is omitted. An expression that evaluates to `Present(null)` emits a null field. Future coalesce/default operators must state separately whether they handle missing, null, or both.

## Indexes and sidecars

Every physical representation must be able to distinguish absence from explicit null:

- A normal scalar or compound secondary index encodes separate ordered `MISSING` and `NULL` component tags.
- A sparse index omits entries whose indexed path is `Missing` and includes explicit null unless its documented partial predicate excludes null.
- Missing is not a stored value and does not participate in a uniqueness conflict. Explicit null is a present index value and participates in uniqueness unless an explicit partial-index predicate excludes it.
- Compound-index components preserve missing/null independently; no component may be dropped and shift later components.
- Sidecars store separate `missing_bitmap` and `null_bitmap`; the bitmaps are disjoint.
- A row with either bit set has no readable ordinary payload in that column slot. Kernels must consult the bitmaps before reading/comparing payload bytes.
- Zone-map min/max and numeric/string dictionaries exclude missing and null payloads while recording their counts separately.
- Index-only reads must reconstruct the correct state rather than returning a null for a missing component.

An access path that physically omits missing rows may answer `$exists: false`, `$ne`, `$nin`, or `$not` only by a proven complement/row-set plan or by final row verification. Planner cost choices never change these results.

## Aggregation

Aggregation preserves the distinction across stages:

- `$match` uses the filter rules above.
- `$project` uses the projection rules above.
- `$sort` uses the presence order above.
- `$group` uses separate canonical grouping keys for `Missing` and `Present(null)`.
- An accumulator that consumes values skips `Missing` unless its own contract explicitly counts documents; it receives explicit null as a value and follows its operator-specific null rule.
- `$count` counts input rows and is unaffected by whether a particular field is missing or null.
- `$unwind` without a preservation option emits no row for a missing or null target. With `preserveNullAndEmptyArrays`, it emits one row and preserves the original shape: missing stays absent and null stays null.

The exact accumulator set, empty-input results, unwind array behavior, and group output encoding are owned by `P01-015`. Those rules may not collapse the two grouping keys.

## Inserts, replacements, and updates

Mutation preserves user intent:

- Inserting or replacing with a field set to `null` stores a present null.
- Omitting a field from an inserted/replacement object leaves it missing.
- Replacing a document removes old fields omitted from the replacement; those paths become missing.
- `$set: {p: null}` creates or replaces `p` with explicit null.
- `$unset: {p: ...}` removes `p`; applying it to a missing path is an idempotent no-op.
- Setting a parent path to null removes any former descendants because the parent is now a scalar; descendant paths evaluate as missing.
- Update expressions do not implicitly convert missing to null. An operator that creates a value from missing, such as a specifically defined increment/default operation, must state that rule explicitly.
- Match-before-update and upsert selection use the same filter rules as reads.
- Change records distinguish `created`, `set_null`, `replaced`, and `removed` effects sufficiently to reconstruct state and invalidate indexes/sidecars.

Path-conflict detection, intermediate-object creation, arrays, arithmetic operators, upsert synthesis, and transaction atomicity are frozen by `P01-013` and `P01-014`.

## Storage, replication, and recovery invariants

The distinction is end-to-end:

1. HDoc encodes object field presence structurally and assigns null an explicit type tag.
2. WAL/replicated commands record set-null and remove-field as different canonical mutations.
3. SST/VLOG round trips reproduce object shape.
4. Secondary indexes and sidecars apply the rules above at the same committed version.
5. Backup/export preserves typed null and field absence.
6. Restore, replay, compaction, format migration, synchronization, and range movement cannot introduce or erase null fields.
7. CPU, optimized CPU, GPU-candidate-plus-verification, embedded, server, adapter, and distributed execution return the same match/result hashes.

Derived structures that cannot represent both states are invalid for semantic pruning until rebuilt in a compatible version.

## Required fixture matrix

The semantic corpus must cross each relevant operation with at least:

```text
{}
{p: null}
{p: 0}
{p: false}
{p: ""}
{p: {}}
{p: []}
{p: {q: null}}
{p: {q: 1}}
```

Required assertions include:

- Path results for `p` and `p.q`.
- `$exists`, `$type`, equality, inequality, range, `$in`, `$nin`, and `$not` results.
- Ascending/descending and compound sort keys.
- Inclusion, exclusion, and computed projection shape.
- Dense, sparse, compound, unique, sidecar, and index-only behavior.
- Group keys, accumulators, and unwind preservation.
- Insert, replace, set-null, unset, parent replacement, replay, and change-event deltas.
- Cross-backend document IDs, shapes, type tags, and canonical result hashes.

`P01-019` commits these cases in the language-neutral fixture schema. Later physical phases extend the same cases rather than redefining their expected results.

## Conformance rule

Any component that cannot preserve `Missing` versus `Present(null)` must reject the affected operation, fall back to a conforming path, or operate only as a verified-candidate producer. Silent collapse is a `S1` correctness and compatibility defect and blocks the governing gate.

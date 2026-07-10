# Object Ordering, Equality, Canonical Hashing, and Duplicate Keys

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-007`
- Governing requirements: `DATA-001`, `QUERY-001`
- Governing gate: `G01`
- Normative parents: [logical value model](value-model.md) and [string semantics](string-semantics.md)

This document defines the logical identity and observable ordering of objects, recursive equality, canonical hashing, duplicate-key rejection, and the only import workflow allowed to preserve duplicate source fields. Object limits and the complete field-name/path grammar are finalized by `P01-011`.

## Object model

A normal stored object is a finite mapping from unique string field names to logical values, with a separately preserved presentation order.

```text
ObjectValue {
  fields_by_name: unique mapping<string, Value>
  presentation_order: permutation of every field name exactly once
}
```

The mapping defines semantic identity. Presentation order supports faithful read/export behavior but does not make two mappings unequal.

Consequences:

- Every field name occurs exactly once at each object level.
- Field names are exact canonical UTF-8 strings and are compared without normalization/case folding.
- Nested objects independently carry mapping identity and presentation order.
- Empty object is valid.
- Cyclic/shared host object graphs are not values; encoders reject cycles and serialize repeated subobjects by value.
- Internal system fields use the same model but may have protected visibility/mutation rules.

## Three orders

Implementations must not confuse these distinct orders.

### Presentation order

Presentation order is the deterministic order returned by full-document reads and byte-preserving typed exports:

- Insert/replacement preserves the accepted input field sequence.
- HDoc/backup/replication retains that sequence unless a format explicitly exports canonical order.
- Reading/projection retained source fields preserves their source relative order.
- Removing a field removes its position.
- Updating an existing field retains its position.
- New fields created by one normalized update are appended in `binary_utf8_v1` path order, independent of host map iteration.
- Derived objects use the operator's specified order; if an operator has no order rule, it emits canonical field-name order.

Presentation order is observable formatting, not equality, uniqueness, grouping, or query sort semantics. Applications must not use it as an implicit schema/version mechanism.

### Canonical field order

Canonical field order sorts exact field-name UTF-8 bytes using `binary_utf8_v1` ascending order. It is used for canonical hashes, semantic comparison, deterministic command encoding where input order is irrelevant, and format-independent content identity.

### Query result order

The order of documents/rows is separate from field order and follows `P01-017` plus explicit sort rules. Reordering fields cannot reorder documents.

## Equality and comparison

Object `$eq` uses recursive mapping equality:

1. Both operands are objects.
2. They have the same field count.
3. They have the same exact field-name byte set.
4. Each corresponding value is equal under that value type's semantic equality.

Presentation order is ignored. Thus:

```text
{a: 1, b: 2} == {b: 2, a: 1}
```

Numeric fields use numeric operator equality, so an `int32(1)` field can compare equal to an `int64(1)` field while `$type` still distinguishes them. String equality remains exact bytes; arrays use their ordered semantics under `P01-008`; nested objects recurse.

If a total object order is required for sort/range semantics, compare canonical field sequences lexicographically:

1. Compare field-name bytes.
2. When names are equal, compare values under the total type/value order.
3. If one canonical sequence is an exact prefix, the object with fewer fields sorts first.

The complete cross-type rank and operator eligibility are frozen by `P01-012`. A backend cannot use presentation order as a shortcut.

### Compatibility boundary

[MongoDB embedded-document equality treats field order as significant](https://www.mongodb.com/docs/manual/reference/operator/query/eq/), while native HelixDB mapping equality does not. A MongoDB adapter may claim that case only if it applies a dedicated presentation-order-aware verifier and passes differential fixtures; otherwise the compatibility matrix marks embedded-document equality different/unsupported. It cannot forward the predicate to native object `$eq` and claim equivalence.

## Canonical hashes

Object hashing has two explicit purposes.

### Canonical typed content hash

The content hash is independent of presentation order but retains exact stored type/payload identity:

```text
object-domain/version
|| object type tag
|| field count
|| for each field in canonical field order:
     field-name byte length
  || field-name UTF-8 bytes
  || canonical typed content hash of the value
```

This hash supports HDoc content identity, replication checks, backup verification, change detection, and deterministic cache keys where exact stored types matter. Float payload identity and numeric width therefore affect it; field order does not.

### Semantic comparison hash

Equality/group/distinct/object-comparison hash uses the same canonical field order but recursively uses each value's semantic comparison hash. Therefore values equal under object `$eq` produce the same comparison hash even when numeric widths or float zero representations differ.

Both hashes include domain/version separation and unambiguous lengths/tags. A hash collision never proves equality; canonical names/values are compared. Hash algorithms and physical bytes are versioned with HDoc/index fixtures, but the logical input above is fixed now.

## Duplicate definition

Within one object level, two fields are duplicates when their decoded canonical UTF-8 byte sequences are identical.

Duplicate detection is:

- case-sensitive;
- normalization-sensitive;
- based on decoded names, so JSON escape spelling does not create distinct keys;
- scoped independently at each nested object;
- performed before update/index/WAL publication.

Examples:

```text
{"a": 1, "a": 2}                 duplicate
{"a": 1, "\u0061": 2}           duplicate after escape decoding
{"é": 1, "e\u0301": 2}          not duplicate under binary UTF-8 semantics
{"a": 1, "A": 2}                 not duplicate
```

## Normal-write duplicate rejection

All normal insertion, replacement, update-generated object, protocol, SDK, aggregation output, restore, replication, and migration paths reject duplicate names at any depth.

Rules:

- No first-wins, last-wins, merge, overwrite, or arrayification occurs implicitly.
- Rejection happens before assigning defaults/IDs or publishing any part of the mutation when practical; the document mutation is atomic in all cases.
- The error identifies the object path and the first/duplicate field positions without logging sensitive values.
- A batch reports the document index and follows the later ordered/unordered batch rule; one document never partially lands.
- A decoder must not first materialize input into a host map that already discarded duplicates.
- SDKs accepting raw JSON/CBOR/binary input use a token/sequence-aware validator before map construction.
- HDoc canonical decoding rejects duplicate field-table names as corruption/noncanonical input.

Duplicate rejection is invariant, not a per-collection compatibility flag.

## Import-only duplicate preservation

Import tools sometimes need to inspect legacy BSON/JSON that contains duplicates. Lossless preservation is allowed only in an import quarantine representation, not as a normal `Value::Object` or live collection document.

```text
ImportObject {
  ordered_entries: [(raw_name_token, decoded_name, raw_value)]
  source_locator
  source_byte_hash
  duplicate_diagnostics
}
```

The quarantine artifact:

- preserves original entry order, raw name spelling/bytes where the source format permits, values, offsets, and a source hash;
- is stored in an approved import staging/artifact area with quotas and retention, not HDoc/SST/normal indexes;
- cannot be queried through ordinary collection APIs, replicated as canonical data, used by GPU/sidecars, backed up as a normal database, or returned as compatibility success;
- is visibly noncanonical and accessible only to authorized import/admin tooling;
- must pass security scanning and resource limits like other untrusted input.

Before commit to a normal collection, the operator chooses and records one recursive resolution policy:

| Policy | Behavior |
| --- | --- |
| `reject` | Default; document is not imported |
| `keep_first` | Retain the first occurrence, discard later duplicates with a detailed report |
| `keep_last` | Retain the last occurrence at the first occurrence's presentation position, discard earlier values with a detailed report |

There is no implicit merge or collect-to-array policy because it changes types/schema. A transformation tool may implement such a user-authored mapping as a separate explicit program whose output is validated as a normal unique-key object.

Every lossy resolution report records source/document locator, policy/version, duplicate paths/counts, input/output hashes, discarded-value hashes where safe, operator identity, timestamp, and error/warning disposition. Rerunning the same import/policy must produce the same canonical object/hash.

## Field-name boundary

At this task's layer, field names:

- are valid strings under `P01-006`;
- compare as exact UTF-8 bytes;
- cannot duplicate a sibling name;
- retain their exact bytes and presentation spelling;
- participate in canonical byte ordering/hashing.

`P01-011` freezes empty-name, byte-length, control/NUL, dot, dollar-prefix, reserved system prefix, and path-depth/length rules. Until it lands, normal implementation must not silently accept a broader persistent field-name domain than the final gate can validate.

## Projection and update ordering

Detailed operator semantics remain `P01-013`/`P01-014`, constrained by these invariants:

- Inclusion/exclusion projection does not reorder retained source fields.
- Computed output fields cannot duplicate retained/computed names after path resolution.
- Update paths are parsed/normalized before mutation and checked for exact duplicate and ancestor/descendant conflicts.
- Existing field replacement retains presentation position.
- New sibling fields created by a single command append in canonical path order.
- Replacement documents take the replacement's accepted presentation order.
- Import resolution happens before any update; update operators never act on quarantined duplicate objects.

## Physical representation and backend obligations

- HDoc preserves unique names, values, and presentation order while storing/verifying canonical hashes.
- Collection path dictionaries map exact path bytes; dictionary IDs never define object equality/order.
- Secondary indexes and sidecars address resolved paths but cannot materialize a duplicate field.
- Index-only/projection paths reconstruct the same field-name bytes and deterministic presentation rules.
- Replication/WAL commands encode normalized mutations so host map order cannot change the resulting object.
- Backup/restore preserves presentation order and verifies canonical typed content hashes.
- CPU/GPU code normally consumes resolved scalar columns; any object comparison/hash remains authoritative CPU/reference behavior unless an exact kernel is separately proven.

## Security and operational behavior

- Duplicate floods, huge names, deep nesting, and hash collisions are quota/resource bounded.
- Diagnostics escape Unicode controls/bidi and do not log values.
- System/reserved fields are validated before authorization-sensitive mutation.
- Import quarantine cannot bypass collection authorization, tenant quota, malware/content handling, or evidence retention.
- Lossy import resolution is explicit/audited and can be dry-run before commit.
- Canonicalization uses bounded recursion/stack strategy under `P01-011` limits.

## Required fixtures

The semantic corpus includes:

- Empty, one-field, nested, and different-presentation-order objects.
- Same mapping/different order equality and both canonical hashes.
- Recursive numeric/string/null/missing/array/object equality cases.
- Field-name byte ordering with ASCII, multibyte, normalization, case, controls, and escape aliases.
- Duplicate at first/last/nested positions, JSON escape alias, host-map-loss prevention, and atomic rejection.
- Insert/replacement/update/projection presentation-order cases.
- HDoc corruption with duplicate field-table entries.
- Quarantine round trip and deterministic `reject`/`keep_first`/`keep_last` reports/hashes.
- Hash collision confirmation and cross-host canonical hash agreement.
- Index/sidecar/backup/restore/replay behavior preserving unique keys and object identity.

## Follow-up ownership

| Plan item | Remaining object responsibility |
| --- | --- |
| `P01-011` | Field-name/path/depth/count/size limits and reserved-name grammar |
| `P01-012` | Full cross-type/object operator truth tables |
| `P01-013`–`P01-015` | Projection/update/aggregation object construction and ordering |
| `P01-016` | Stable duplicate/corruption/import error codes |
| `P01-019`–`P01-020` | Executable fixtures and reference oracle |
| `P03-*` | HDoc field table, presentation metadata, canonical hash bytes |
| `P15-*`, `P22-*` | Import/migration/adapter quarantine and reports |

No normal path may persist duplicate names, use host map iteration as semantic order, normalize field names, or hash presentation order as mapping identity without a superseding semantic decision and format/compatibility migration.

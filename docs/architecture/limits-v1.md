# Portable V1 Semantic and Command Limits

- Status: Accepted semantic baseline
- Profile ID: `limits-v1`
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-011`
- Governing requirements: `DATA-001`, `QUERY-001`, `QUERY-002`, `SEC-002`
- Governing gate: `G01`
- Decision: [ADR 0008](../adr/0008-use-one-portable-v1-limit-profile.md)

This document freezes portable hard limits for documents, nesting, fields, field names, paths, arrays, vectors, and commands. Every native, Wasm, browser, server, adapter, import, replication, backup, and GPU-assisted path enforces the same upper bounds before allocation/publication. A deployment may configure smaller quotas, never a broader value domain while claiming `limits-v1`.

## Normative limit table

All byte units are exact octets; KiB/MiB are powers of 1,024.

| Limit | V1 maximum | Measurement |
| --- | ---: | --- |
| Canonical HDoc document | 16,777,216 bytes (16 MiB) | Complete uncompressed canonical HDoc, including header/tables/names/values/checksum/hash |
| Container nesting depth | 100 | Root object is depth 1; each nested object/array adds 1 |
| Fields in one object | 10,000 | Immediate unique entries, including protected fields present in that object |
| Total fields in one document | 100,000 | Sum of entries across every nested object |
| Field-name UTF-8 bytes | 1,024 | Canonical decoded UTF-8 bytes |
| Field-name scalar values | 256 | Unicode scalar count |
| Dotted path UTF-8 bytes | 4,096 | Complete decoded path text, including separators |
| Dotted path segments | 100 | Field and explicit numeric-index segments |
| Array elements | 1,000,000 | Immediate dense elements in one array |
| Vector dimension | 4,096 | `N` in `vector<f16,N>`/`vector<f32,N>` |
| String/binary `_id` payload | 1,024 bytes | UTF-8 bytes or generic binary bytes |
| Raw command envelope | 67,108,864 bytes (64 MiB) | Transport bytes before decompression/decoding |
| Expanded/decoded command | 67,108,864 bytes (64 MiB) | Complete uncompressed canonical normalized-command encoding |
| Batch operations/documents | 1,000 | One insert/update/delete bulk command |
| Aggregation stages | 256 | Parsed stages before and after normalization/expansion |
| Filter/expression AST nodes | 4,096 | Operators, field predicates, expressions, and literals as defined below |
| Filter/expression AST depth | 64 | Root node depth 1 |
| Literal list items | 10,000 | One `$in`, `$nin`, `$all`, or equivalent bounded literal operand |
| Sort keys | 64 | One logical sort specification |
| Projection/output paths | 10,000 | One projection specification after normalization |
| Regex pattern UTF-8 bytes | 65,536 | Decoded pattern text; engine step/memory limits remain additional |
| Exact vector top-k `k` | 10,000 | Positive requested result count |
| Path candidates per document | 1,000,000 | Values produced by one dotted traversal before predicate reduction |

The document/depth choices intentionally align with MongoDB's documented 16 MiB and 100-level BSON ceilings for easier bounded interchange, but all other limits/semantics remain HelixDB's explicit profile and require compatibility-matrix proof. See [MongoDB Limits and Thresholds](https://www.mongodb.com/docs/manual/reference/limits/).

## Document size

The 16 MiB limit applies to the complete uncompressed canonical HDoc representation of each:

- inserted/replacement document;
- updated post-image;
- aggregation intermediate document and emitted result document;
- change-event document payload where represented as HDoc;
- restored/imported/migrated normal document;
- replicated/synchronized canonical document image.

Compression, transport chunking, value-log placement, external blob storage, or an index-only plan cannot make an oversized logical document valid.

Enforcement uses two stages:

1. Streaming parse/validation computes a checked conservative size bound and stops once the limit must be exceeded.
2. Canonical encoding into unpublished bounded staging verifies the exact HDoc length before any row/index/WAL/sidecar visibility.

An encoder bug that produces more than the limit is not repaired by truncation. The complete document mutation fails atomically. Large application payloads use chunk/blob facilities designed and versioned separately, referenced by ordinary bounded documents.

## Nesting depth

Depth counts stored object/array containers:

```text
{}                         depth 1
{a: {}}                    depth 2
{a: []}                    depth 2
{a: [{b: []}]}             depth 4
```

Scalars, strings, binary, UUID/ObjectId, date/timestamp, and vectors do not add a container level. The root normal document must be an object and consumes depth 1.

Parsers/encoders/evaluators use iterative or explicitly bounded stacks. Depth 100 is accepted; adding the 101st container is rejected before recursion/allocation can overflow a host stack.

Command/filter AST depth is a separate maximum of 64 and does not inherit the document-container count.

## Field counts

- Each object entry counts once, including root `_id` and any encoded protected metadata field.
- Array elements do not count as fields, but object fields inside elements do.
- Duplicate names are rejected before final count yet still consume parser work/quota during detection.
- Both per-object 10,000 and whole-document 100,000 limits must pass.
- Projection/aggregation/update construction checks the prospective output counts before publication.

Internal metadata kept outside the HDoc object field table does not count as an object field but still contributes to exact HDoc bytes.

## Field-name grammar and limits

A normal v1 field name must:

- contain 1 through 1,024 canonical UTF-8 bytes;
- contain at most 256 Unicode scalar values;
- satisfy the valid string rules in `P01-006`;
- not contain `U+0000`, ASCII C0 controls `U+0001`–`U+001F`, or `U+007F`;
- not contain `.`;
- not begin with `$`;
- be unique among siblings under exact `binary_utf8_v1` bytes.

Names are not normalized/case-folded. Other Unicode controls/format characters remain valid at this semantic layer but logs/admin UIs escape them and deployments may apply stricter schemas.

At the root:

- `_id` is required/protected by `P01-009`.
- `_v` and `_ts` are reserved engine metadata names and ordinary clients cannot insert/update them.
- Other underscore-prefixed names are allowed unless a versioned schema reserves them.

Nested `_id`, `_v`, and `_ts` are ordinary names unless a schema/operator says otherwise. Compatibility/import tools cannot bypass normal-name validation when committing canonical documents; incompatible source names require an explicit lossless mapping/report.

## Dotted path grammar and limits

V1 dotted paths have no escaping because normal field names cannot contain `.`.

Rules:

- Path text is valid canonical UTF-8 and at most 4,096 bytes.
- It contains 1 through 100 nonempty dot-separated segments.
- Leading/trailing dot and `..` are invalid.
- A field segment satisfies the field-name byte/scalar/control/dollar rules.
- A canonical numeric segment is `0` or `[1-9][0-9]*`; in array context it selects an index, in object context it is the exact numeric field name.
- Nonnumeric array traversal follows `P01-008` and cannot recursively flatten nested arrays.
- A numeric index must parse with checked unsigned arithmetic and be below the array-length maximum; out-of-range evaluation yields Missing, while numeric syntax overflow is a path validation error.
- Root/system path mutation restrictions are checked after parsing and before authorization-sensitive execution.

The path candidate cap prevents a traversal from materializing more than 1,000,000 values for one document. Reaching a greater count is a typed resource/limit error, not truncation or partial predicate evaluation.

## Array length

One array contains at most 1,000,000 immediate dense elements, including null and nested values. The bound applies independently at every array level and remains subordinate to document bytes/depth/field totals.

Sparse host arrays, implicit holes, or an index beyond the current length cannot be used to create a million-element sparse representation. Array construction/mutation computes checked prospective length and fails atomically before partial growth.

## Vector dimension and top-k

- Vector dimension is 1 through 4,096 inclusive.
- Family and dimension remain type identity under `P01-010`.
- Typed parsing validates dimension before allocating/converting element buffers.
- Exact vector `k` is 1 through 10,000 inclusive and remains limited by eligible rows/result/batch quotas.
- A smaller device workgroup/buffer limit causes chunking/fallback, not a smaller logical dimension or changed result.

Approximate/future vector profiles may set smaller operational caps but cannot exceed the stored `limits-v1` dimension without a new profile/format assessment.

## Command envelope size

Both raw and expanded forms are capped at 64 MiB to prevent ordinary and compression-bomb amplification:

- HTTP/gRPC/binary framing stops reading beyond the raw cap.
- Decompression uses a bounded output buffer/stream and stops beyond the expanded cap.
- JSON/CBOR/typed decoding accounts for decoded strings/binary/vectors/documents and produces the versioned canonical normalized-command form used for the expanded limit.
- Authentication/authorization metadata and command options are included; transport headers outside the database frame follow host limits.
- A batch cannot evade the command cap through streaming continuation advertised as one atomic command.

Before the canonical command byte format is frozen, parsers use a documented conservative transport-neutral accounting function over normalized tags, UTF-8 names/strings, raw binary/vector/document bytes, fixed-width scalars, container counts, and length prefixes. A command accepted by that bootstrap accounting must fit the eventual canonical encoding; the fixture freeze replaces the estimate without broadening `limits-v1` silently.

Large ingest/export uses a versioned bounded streaming protocol of independent command units, each with explicit ordering/resume/error semantics. It does not create one unbounded atomic command.

## AST and collection-like command limits

AST nodes count every parsed/normalized:

- logical/comparison/type/string/array/vector operator;
- field predicate/path reference;
- literal value (a container literal counts itself plus recursive contents where interpreted as expression nodes);
- aggregation stage/expression/accumulator;
- projection/sort/update expression.

Normalization cannot expand beyond 4,096 nodes or depth 64. Both pre-normalization and post-normalization forms are checked, so shorthand/rewrite cannot amplify invisibly.

Batch, pipeline, literal-list, sort, projection, regex, and vector-k limits in the table are independent and cumulative with command bytes/AST limits. Regex compilation/steps/memory/deadline, group cardinality, sort memory, cursor batch, transaction size, index keys, GPU buffers, and tenant quotas receive additional later limits; absence here is not unlimited permission.

## Measurement and checked arithmetic

- Byte lengths use canonical decoded/encoded octets, never character counts or compressed sizes unless explicitly named.
- Scalar count iterates decoded Unicode scalar values, never UTF-16 units or grapheme clusters.
- All counters/additions/multiplications use checked wide arithmetic before allocation.
- “Maximum” is inclusive; the next unit is rejected.
- Invalid input is rejected even if it would be under the size limit after repair/normalization, because repair is not allowed.
- Limits apply before authorization result data is materialized where practical, without leaking existence/size of unauthorized data.

## Lower deployment quotas and capability negotiation

A server/tenant/browser may advertise smaller operational quotas for commands, batches, regex, vector `k`, results, memory, or concurrency. Rules:

- Persistent value-domain maxima (document/depth/name/path/array/vector) cannot be raised while claiming `limits-v1`.
- A host unable to reopen an already valid `limits-v1` database must reject the database/profile explicitly rather than corrupt/truncate it.
- Smaller write limits are checked before mutation and exposed through capability metadata.
- Planner/device limits choose chunking/fallback; they do not reinterpret stored values.
- Database manifest, backup, protocol handshake, diagnostics, and compatibility matrices record the semantic profile ID and material lower quotas.

## Import, backup, restore, and migration

- Normal imported/restored documents pass the same exact limits before publication.
- Import quarantine may preserve an oversized/invalid source artifact only outside normal HDoc/collections under separate storage/retention quotas; resolution must output a valid document.
- Backup creation cannot silently omit an oversized/corrupt existing document; it fails/report-quarantines under the recovery policy.
- Restore validates profile/limits before serving data.
- A future higher-limit profile requires version negotiation, host/browser capability analysis, HDoc/index offset review, memory/DoS tests, backup/restore/migration proof, and an ADR.

## Errors, atomicity, and observability

Every violation returns a typed limit error containing:

- stable limit/profile identifier;
- configured/effective maximum;
- observed count/size when safe;
- phase (`wire`, `decode`, `validate`, `normalize`, `encode`, `execute`, `restore`);
- document/batch index/path digest as appropriate;
- request/trace ID.

Values/field names are redacted/escaped by policy. No violation truncates, drops fields/elements/stages, partially writes a document, or silently switches to approximate behavior.

Metrics/explain diagnostics record rejection counts by stable limit ID, not high-cardinality raw paths/values.

## Required fixtures

Every numeric limit has below/at/above fixtures, including combinations where a smaller independent limit wins:

- Exact HDoc byte boundary with header/name/value/checksum overhead.
- Depth 99/100/101 with mixed objects/arrays.
- Per-object and total field boundaries across nested arrays/objects.
- Field names by UTF-8 byte/scalar boundaries, invalid controls/dot/dollar/empty/reserved names, and multibyte cases.
- Path byte/segment/numeric overflow/candidate boundaries.
- Array length and vector dimension/k boundaries with checked prospective mutations.
- Raw versus compressed/expanded command boundaries and decompression bombs.
- Batch/stage/AST/depth/list/sort/projection/regex boundaries before/after normalization.
- Atomic write/update/aggregation/import/restore rejection with unchanged row/index/WAL hashes.
- Identical errors across reference/Wasm/browser/server/adapters and lower-quota capability negotiation.

## Follow-up ownership

| Plan item/phase | Remaining limit responsibility |
| --- | --- |
| `P01-012`–`P01-016` | Operator/CRUD/aggregation/error integration |
| `P01-019`–`P01-020` | Executable boundary fixtures/reference oracle |
| `P03-*`–`P05-*` | HDoc/host/storage checked lengths and corruption behavior |
| `P07-*`–`P10-*` | Parser/planner/index/sidecar/GPU work/memory-specific limits |
| `P11-*`–`P13-*` | Browser/server/protocol/SDK/security quotas and negotiation |
| `P15-*`, `P20-*`, `P23-*` | Backup/restore/cache/managed operational limits |

No implementation may raise/ignore a `limits-v1` bound, measure compressed/host-dependent representations instead, repair/truncate an oversized value, or use host recursion/allocation before limit checks without a new versioned profile and full compatibility/security/migration proof.

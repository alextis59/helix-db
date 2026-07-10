# HelixDB Specifications

- Status: Draft 0.1
- Last updated: 2026-07-09
- Scope: Product, architecture, data, execution, operations, and delivery
- Source: [ChatGPT shared-session transcript](docs/chatgpt-database-system-with-webgpu-transcript.md)

This document is the normative project specification for HelixDB. It converts the source transcript into an implementation-oriented contract while preserving the proposed architecture and staged scope. It describes the intended system; it does not claim that the repository currently implements any listed capability.

## Document purpose

HelixDB is a portable NoSQL document database that combines three operating modes in one engine:

1. A durable MongoDB-inspired document store for embedded and cloud use.
2. An adaptive GPU query path for large parallel scans and vector or bitmap work.
3. A local, edge, and cache store with TTL, eviction, offline operation, and cloud synchronization.

The specification exists to keep those modes on one coherent foundation. They share the same document representation, query semantics, storage engine, MVCC rules, indexes, and CPU execution path. Deployment-specific hosts and compatibility adapters may differ, but they must not create independent data models or subtly different query results.

## Normative terminology and release labels

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** express requirement strength:

- **MUST / MUST NOT**: required for the named release or invariant.
- **SHOULD / SHOULD NOT**: expected unless an accepted architecture decision record documents a justified exception.
- **MAY**: optional behavior or a permitted implementation choice.

Unqualified requirements apply to the long-term product. Requirements explicitly marked **v1**, **v1.5**, or **v2** apply to that release boundary. The roadmap phases are delivery increments, not separate products.

## Architectural invariants

| ID | Invariant |
| --- | --- |
| `INV-001` | The canonical HDoc row document is the source of truth. Indexes, caches, and columnar sidecars are derived and rebuildable. |
| `INV-002` | CPU execution defines the reference query semantics. GPU execution MUST return the same observable result or a candidate set that is verified on CPU. |
| `INV-003` | A GPU is never required for correctness, durability, recovery, or availability. |
| `INV-004` | Deterministic database logic belongs in the Wasm core; files, sockets, clocks, randomness, threads, and devices are explicit host capabilities. |
| `INV-005` | Durable and ephemeral storage classes share an engine but have explicit, non-interchangeable durability and eviction policies. |
| `INV-006` | Clients cannot submit arbitrary WGSL to the database execution path. Production kernels are internal, bounded, versioned, and tested. |
| `INV-007` | Persistent formats, replicated commands, query semantics, and protocol contracts are versioned before production use. |
| `INV-008` | v1 is a credible single-node product. Distributed consensus, range sharding, and multi-node routing are v2 capabilities unless promoted by an approved scope change. |
| `INV-009` | Every promised consistency or durability level has a named test oracle and a failure-injection gate. |
| `INV-010` | Compatibility claims are limited to an explicit tested subset; HelixDB MUST NOT imply complete MongoDB or Redis compatibility. |

## Scope summary

The smallest credible v1 is a durable single-node document database supporting embedded and server deployments, a MongoDB-inspired query subset, a custom LSM-like store, selected-field columnar sidecars, WebGPU acceleration with CPU fallback, browser persistence, native persistence, basic backups, metrics, and `explain()`.

The smallest credible v2 adds replicated range groups, range sharding, a query router, online range movement, cache and local-replica storage classes, synchronization, and documented MongoDB-like and Redis-like compatibility adapters.

---

HelixDB is a distributed NoSQL database designed around three personalities in one engine:

1. **Cloud document database**: MongoDB-like JSON document storage, indexing, replication, sharding, backups, multi-tenant operation.
2. **GPU-accelerated analytical/query path**: fast parallel predicate evaluation for large scans, vector search, bitmap operations, and columnar filtering using WebGPU, with deterministic CPU fallback.
3. **Local/edge/cache database**: embeddable Wasm runtime that can run in browsers, desktop apps, edge nodes, and servers as a durable store or ephemeral cache.

The core idea is not to run raw JSON through GPU shaders. That would be slow and hard to make correct. Instead, the database stores each document as the source of truth and also maintains typed, columnar query sidecars optimized for SIMD and GPU execution.

---

## 1. Platform assumptions and constraints

WebGPU should be treated as the portable GPU abstraction, not as a guaranteed always-available backend. In browsers, WebGPU is still something the engine must feature-detect at runtime; MDN currently marks it as “Limited availability,” notes that it requires secure contexts in supporting browsers, and describes its support for general-purpose GPU computation as a first-class capability. ([developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API))

For native/server deployments, the recommended GPU backend should be **wgpu** or **Dawn**, exposed to the Wasm core through host functions. The Rust `wgpu` project describes itself as a safe portable graphics and compute library based on WebGPU, running natively over Vulkan, Metal, DirectX 12, OpenGL ES, and in browsers through WebAssembly/WebGPU/WebGL2. ([wgpu.rs](https://wgpu.rs/))

The Wasm runtime target should be **WASI 0.3+** for server/edge execution because WASI 0.3 was released on June 11, 2026, adds native async support to the Component Model, and is supported in Wasmtime 43+ according to the WASI roadmap. Threads are still listed as an incremental future item, so the system should rely on host-managed parallelism rather than assuming mature portable Wasm threading everywhere. ([GitHub](https://github.com/WebAssembly/WASI/releases))

For browser-local storage, HelixDB should use OPFS when available because the Origin Private File System provides an origin-private storage endpoint with performance-oriented file access and in-place writes; IndexedDB should remain a fallback for environments where OPFS is unavailable or quota behavior is more favorable. ([developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API))

MongoDB-like query syntax should be supported as a compatibility goal, especially the familiar filter shape `{ field: { $operator: value } }`, comparison operators, logical operators, field equality, and compound query documents. MongoDB’s own documentation describes this query-filter shape and its use of comparison/logical operators. ([MongoDB](https://www.mongodb.com/docs/manual/tutorial/query-documents/))

The storage engine should borrow proven ideas from LSM systems such as RocksDB, but not depend on RocksDB internally. RocksDB is an embeddable persistent key-value engine using a log-structured database design where keys and values are arbitrary byte streams; HelixDB should implement its own LSM-like layout so it can integrate document blobs, secondary indexes, columnar sidecars, cache eviction, and GPU-friendly chunk metadata directly. ([RocksDB](https://rocksdb.org/))

---

## 2. Product goals

HelixDB **MUST** provide:

- JSON document storage with MongoDB-inspired CRUD and query syntax.
- Automatic `_id` primary key generation.
- Secondary indexes on nested document paths.
- Query execution over CPU and GPU backends with identical results.
- Single-node embedded mode.
- Single-node server mode.
- Multi-node distributed mode with sharding and replication.
- Durable mode suitable for primary cloud storage.
- Ephemeral/cache mode with TTL, eviction, and low-latency reads.
- Local-first/edge mode with sync from cloud to local storage.
- Wasm-based core runtime and plugin model.
- WebGPU acceleration where available.
- CPU fallback everywhere.

HelixDB **SHOULD** provide:

- MongoDB wire-protocol adapter for a useful subset of existing tools.
- Redis-like key-value/cache adapter for simple `GET`, `SET`, TTL, counters, pub/sub, and streams.
- Browser SDK using Wasm + WebGPU + OPFS/IndexedDB.
- Native server runtime using Wasmtime + wgpu/Dawn.
- Cloud-native object-storage backups and cold-tier storage.
- Vector search and hybrid document/vector filtering.

HelixDB **MUST NOT** attempt to make every operation GPU-accelerated. Point reads, small indexed lookups, complex regex, arbitrary JavaScript predicates, deeply irregular nested-array logic, and small updates should generally stay on CPU.

---

## 3. Non-goals for v1

HelixDB v1 should not claim full MongoDB compatibility. It should support a clearly documented subset with compatibility adapters.

HelixDB v1 should not claim full Redis compatibility. It should provide a Redis-like API for common cache workloads, not a complete implementation of every Redis data structure and command.

HelixDB v1 should not expose arbitrary user-provided WGSL shaders to database clients. GPU kernels should be internal, audited, versioned, and deterministic.

HelixDB v1 should not require a GPU. GPU acceleration is an optimization layer, not a correctness dependency.

HelixDB v1 should not require all data to fit in GPU memory. The execution engine must chunk, stream, spill, and fall back.

---

## 4. High-level architecture

```text
                         ┌──────────────────────────────┐
                         │          Clients              │
                         │ SDK / HTTP / gRPC / Mongo API │
                         │ Redis-like API / Browser SDK  │
                         └──────────────┬───────────────┘
                                        │
                         ┌──────────────▼───────────────┐
                         │        Query Router           │
                         │ auth, routing, planning,      │
                         │ scatter/gather, result merge  │
                         └──────────────┬───────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
┌─────────────▼─────────────┐ ┌─────────▼─────────────┐ ┌────────▼──────────────┐
│        Shard Group A       │ │      Shard Group B     │ │      Shard Group C    │
│ Raft replicas + range data │ │ replicas + range data  │ │ replicas + range data │
└─────────────┬─────────────┘ └─────────┬─────────────┘ └────────┬──────────────┘
              │                         │                         │
┌─────────────▼───────────────────────────────────────────────────▼──────────────┐
│                              Storage Node                                      │
│                                                                               │
│  ┌────────────────────┐   ┌─────────────────────┐   ┌──────────────────────┐ │
│  │ Wasm DB Core        │   │ Host Runtime         │   │ WebGPU Runtime        │ │
│  │ query semantics     │◄─►│ files, network, time │◄─►│ wgpu/Dawn/browser GPU │ │
│  │ planner, MVCC, LSM  │   │ async, scheduling    │   │ WGSL kernels          │ │
│  └────────────────────┘   └─────────────────────┘   └──────────────────────┘ │
│                                                                               │
│  WAL + memtables + SSTables + value logs + columnar sidecars + index files     │
└───────────────────────────────────────────────────────────────────────────────┘
```

The **Wasm DB Core** contains all deterministic database logic: document format, query parsing, query semantics, MVCC, compaction decisions, index metadata, replication state machine commands, and plugin interfaces.

The **Host Runtime** provides non-deterministic and platform-specific services: file I/O, networking, clocks, TLS, process scheduling, OS threads, object storage clients, memory-mapped files where allowed, GPU device access, and system metrics.

The **WebGPU Runtime** owns GPU device discovery, buffer pools, shader compilation, command encoding, dispatch, error handling, device-loss recovery, and CPU fallback routing.

---

## 5. Deployment modes

### 5.1 Embedded local database

Runs inside an application process.

Targets:

- Browser: Wasm + WebGPU + OPFS/IndexedDB.
- Desktop: Wasm + WASI + local filesystem.
- Mobile: Wasm runtime hosted by app shell.
- Edge worker: Wasm + WASI filesystem/object-store bindings.

Use cases:

- Offline-capable web apps.
- Local cache for SaaS apps.
- Syncable edge data store.
- Local analytical search over user-owned documents.

Properties:

- Single-node.
- Optional GPU.
- Optional durable mode.
- Optional encrypted local store.
- Sync agent can replicate from a cloud HelixDB cluster.

### 5.2 Single-node server

Runs as one database server process.

Use cases:

- Development.
- Small production workloads.
- Embedded server-side storage.
- Local cache node.
- Edge gateway.

Properties:

- Full document API.
- Local LSM storage.
- CPU and GPU query backends.
- No distributed consensus.
- Optional replica follower mode.

### 5.3 Distributed cloud database

Runs many nodes across availability zones or regions.

Use cases:

- Primary application database.
- Multi-tenant cloud service.
- Distributed cache.
- Hybrid operational/analytical store.

Properties:

- Sharding by collection ranges.
- Replication by shard/range.
- Consensus-backed writes.
- Router nodes.
- Metadata/control plane.
- Backups to object storage.
- Autoscaling and rebalancing.
- GPU-aware query placement.

### 5.4 Cache-only mode

Runs as an ephemeral or semi-durable cache.

Use cases:

- Redis-like application cache.
- Session store.
- Rate-limit counters.
- Materialized query cache.
- Local cloud-data cache.

Properties:

- TTL-first data model.
- Eviction policies.
- Optional disk persistence.
- Optional async replication.
- Lower consistency guarantees by default.
- Same query engine for JSON cache values.

---

## 6. Core components

### 6.1 `helix-core.wasm`

The portable database core.

Responsibilities:

- Binary document codec.
- Query parser and validator.
- Query AST and logical planner.
- MVCC visibility rules.
- LSM metadata model.
- Index metadata model.
- Transaction state machine.
- Replication command application.
- Deterministic expression evaluator.
- CPU query operators.
- Plugin/UDF sandbox interface.
- Versioned file-format readers/writers.

Must not directly access files, sockets, GPUs, clocks, or random numbers. Those must be imported capabilities supplied by the host.

### 6.2 `helix-host`

Native host process.

Responsibilities:

- WASI runtime integration.
- File system access.
- Object storage access.
- Networking.
- TLS.
- OS thread pool.
- GPU device creation.
- Process supervision.
- Telemetry export.
- Host capability enforcement.

### 6.3 `helix-gpu`

GPU execution subsystem.

Responsibilities:

- Detect GPU support.
- Compile and cache WGSL kernels.
- Maintain GPU buffer pool.
- Upload/download columnar chunks.
- Dispatch predicate kernels.
- Dispatch bitmap kernels.
- Dispatch vector-distance kernels.
- Recover from GPU device loss.
- Route unsupported plans to CPU.

### 6.4 `helix-router`

Stateless or lightly stateful query router.

Responsibilities:

- Authenticate requests.
- Authorize database/collection/action.
- Maintain cached cluster map.
- Route point reads/writes.
- Scatter/gather distributed queries.
- Merge sorted/limited results.
- Retry on range movement.
- Enforce request deadlines and quotas.

### 6.5 `helix-meta`

Cluster metadata service.

Responsibilities:

- Tenant registry.
- Database and collection registry.
- Range/shard descriptors.
- Node registry.
- Placement policies.
- Index build state.
- Schema/path dictionary versions.
- Backup catalog.
- Global configuration.

Metadata itself should be stored in a small replicated consensus group.

### 6.6 `helix-sync`

Local/cloud synchronization service.

Responsibilities:

- Change stream consumption.
- Local cache population.
- Resume tokens.
- Conflict detection.
- Offline write queue.
- Cache invalidation.
- Version-vector or timestamp tracking.

---

## 7. Data model

### 7.1 Database hierarchy

```text
Tenant
  └── Database
        └── Collection
              └── Document
```

A document is a JSON-like object with extended scalar types.

Every document has:

```json
{
  "_id": "...",
  "_v": 123456789,
  "_ts": "2026-07-06T12:00:00Z"
}
```

Internal metadata such as `_v` and `_ts` should not be exposed unless requested by admin/debug APIs.

### 7.2 Supported value types

The complete logical domains, stable type names, missing-value boundary, container rules, vector identity, and transport obligations are defined by the [HelixDB Logical Value Model](docs/architecture/value-model.md). That document is a normative refinement of this section.

Required v1 types:

- `null`
- `bool`
- `int32`
- `int64`
- `float64`
- `decimal128`
- `string`
- `binary`
- `object`
- `array`
- `timestamp`
- `date`
- `uuid`
- `objectId`
- `vector<f32>`
- `vector<f16>` where supported by host/GPU path

The canonical document format should preserve enough type information to avoid JSON ambiguity between integers, floating-point values, dates, binary values, and strings.

Integer width, literal inference, coercion, checked overflow/underflow, decimal promotion, explicit conversion, exact mixed numeric comparison, special values, numeric hashing, deterministic aggregation, and CPU/GPU tolerance are defined by [Integer, Decimal, and Mixed Numeric Semantics](docs/architecture/numeric-semantics.md), [Floating-Point and Decimal Special-Value Semantics](docs/architecture/floating-special-semantics.md), and [ADR 0002](docs/adr/0002-exact-numeric-semantics.md). Those documents are normative refinements of this value-type contract.

Timestamp precision/range, timezone normalization, date conversion, leap-second policy, deterministic clock sources, and logical expiry are defined by [Timestamp, Date, Expiry, and Clock Semantics](docs/architecture/temporal-semantics.md) and [ADR 0003](docs/adr/0003-utc-microseconds-and-injected-clocks.md). Those documents are normative refinements of the temporal value and TTL contracts.

### 7.3 Canonical binary document format

The required distinction between absent fields and present null values, including observable read, filter, sort, projection, index, sidecar, aggregation, update, and recovery behavior, is defined by [Missing and Null Semantics](docs/architecture/missing-null-semantics.md). That document is a normative refinement of this section and `DATA-002`.

HelixDB should define its own binary JSON format, tentatively called **HDoc**.

Each HDoc document contains:

```text
Header
  magic
  format_version
  flags
  total_length
  checksum
  field_count
Body
  field table
  value area
  nested object/array tables
  optional compression block
Footer
  document-level hash
```

Field table entry:

```text
field_id: u32
field_name_offset: u32
type_tag: u8
value_offset: u32/u64
value_length: u32/u64
flags: u16
```

Design requirements:

- Stable binary representation for hashing and replication.
- Fast field lookup by field ID.
- Preservation of original field names.
- Optional compact representation using collection-level path dictionary.
- Explicit distinction between missing field and field with `null`.
- Duplicate object keys should be rejected by default.
- Compatibility mode may preserve duplicate keys only for import tools, not normal writes.

### 7.4 Field path dictionary

Each collection maintains a dictionary:

```json
{
  "1": "_id",
  "2": "user.id",
  "3": "user.email",
  "4": "age",
  "5": "tags",
  "6": "createdAt"
}
```

The dictionary is versioned. Documents reference field IDs internally. Query compilation resolves dotted paths into field IDs.

Benefits:

- Compact storage.
- Faster query planning.
- Stable columnar sidecar layout.
- Efficient GPU buffers.

### 7.5 Row store and columnar sidecar

HelixDB stores each document twice conceptually:

1. **Row document store**: canonical HDoc blob; source of truth.
2. **Columnar query sidecar**: typed extracted fields grouped by chunk.

Example chunk:

```text
chunk_000421
  doc_ids[]
  mvcc_versions[]
  deleted_bitmap
  field_age:
    type: int64
    values[]
    missing_bitmap
    null_bitmap
    min/max
  field_status:
    type: dictionary_string
    dictionary[]
    codes[]
    missing_bitmap
    null_bitmap
  field_tags:
    type: array<string>
    offsets[]
    flattened_codes[]
    missing_bitmap
```

The GPU scans sidecars, not raw JSON.

---

## 8. Query language

### 8.1 Query style

The query language is JSON-based and MongoDB-inspired.

Example:

```json
{
  "collection": "users",
  "filter": {
    "age": { "$gte": 18 },
    "status": { "$in": ["active", "trial"] },
    "$or": [
      { "country": "FR" },
      { "country": "DE" }
    ]
  },
  "projection": {
    "_id": 1,
    "email": 1,
    "age": 1
  },
  "sort": {
    "createdAt": -1
  },
  "limit": 100
}
```

### 8.2 CRUD API

Required commands:

```json
{ "insertOne": "users", "document": { "email": "a@example.com", "age": 31 } }
```

```json
{
  "find": "users",
  "filter": { "age": { "$gte": 21 } },
  "limit": 50
}
```

```json
{
  "updateOne": "users",
  "filter": { "_id": "user_123" },
  "update": {
    "$set": { "status": "active" },
    "$inc": { "loginCount": 1 }
  }
}
```

```json
{
  "deleteMany": "sessions",
  "filter": { "expiresAt": { "$lt": "2026-07-06T00:00:00Z" } }
}
```

### 8.3 Required query operators

Comparison:

```text
$eq, $ne, $gt, $gte, $lt, $lte, $in, $nin
```

Logical:

```text
$and, $or, $not, $nor
```

Element/type:

```text
$exists, $type
```

Array:

```text
$all, $size, $elemMatch
```

String:

```text
$prefix, $contains, $regex
```

`$regex` should be CPU-only in v1 except for simple prefix/contains acceleration.

Document:

```text
$jsonSchema
```

Cache/time:

```text
$ttl, $expiresBefore, $expiresAfter
```

Vector:

```text
$vectorNear, $vectorTopK
```

Example vector query:

```json
{
  "find": "products",
  "filter": {
    "category": "laptops",
    "embedding": {
      "$vectorNear": {
        "vector": [0.12, -0.03, 0.44],
        "metric": "cosine",
        "k": 50
      }
    }
  }
}
```

### 8.4 Aggregation pipeline

Required v1 stages:

```text
$match
$project
$sort
$limit
$skip
$count
$group
$unwind
```

Optional v1.5/v2 stages:

```text
$lookup
$facet
$bucket
$graphLookup
$geoNear
$search
```

GPU acceleration priority:

1. `$match`
2. bitmap combination for `$and` / `$or`
3. numeric `$group`
4. vector distance
5. projection over columnar fields
6. sort/top-k for numeric fields

---

## 9. Query execution pipeline

Every query follows this pipeline:

```text
Request
  → parse JSON command
  → validate command
  → authorize
  → normalize filter
  → resolve field paths
  → build logical plan
  → estimate cardinality/cost
  → choose indexes and execution backend
  → build physical plan
  → execute CPU/GPU operators
  → fetch source documents
  → verify final predicates if needed
  → project/sort/limit
  → return response
```

### 9.1 Logical plan nodes

Required nodes:

```text
CollectionScan
IndexScan
ColumnarScan
GpuPredicateScan
BitmapAnd
BitmapOr
BitmapNot
FetchDocuments
Filter
Project
Sort
Limit
Group
VectorSearch
```

### 9.2 Physical plan example

For:

```json
{
  "find": "users",
  "filter": {
    "age": { "$gte": 18 },
    "status": "active"
  }
}
```

A typical plan:

```text
Index/ZoneMapPrune(collection=users)
  → GpuPredicateScan(age >= 18, status == "active")
  → BitmapAnd
  → FetchDocuments
  → FinalVerify
  → Project
```

### 9.3 `explain()` output

```json
{
  "plan": {
    "type": "hybrid",
    "stages": [
      {
        "stage": "ZoneMapPrune",
        "chunksBefore": 812,
        "chunksAfter": 203
      },
      {
        "stage": "GpuPredicateScan",
        "backend": "webgpu",
        "kernels": ["int64_gte", "dict_string_eq", "bitmap_and"],
        "inputDocuments": 13303808,
        "outputCandidates": 382901
      },
      {
        "stage": "FetchDocuments",
        "documentsFetched": 382901
      }
    ]
  },
  "fallback": false,
  "gpu": {
    "device": "adapter-class-or-id",
    "bufferPoolHitRate": 0.82,
    "uploadBytes": 134217728,
    "kernelTimeMs": 7.4,
    "downloadBytes": 1048576
  }
}
```

---

## 10. GPU acceleration design

### 10.1 GPU-eligible workloads

The GPU path is suitable for:

- Large collection scans.
- Large candidate sets after index pruning.
- Numeric comparisons.
- Boolean predicates.
- Timestamp/date comparisons.
- Dictionary-encoded string equality.
- `$in` over bounded sets.
- Bitmap intersections/unions.
- Vector distance calculations.
- Simple aggregations over typed columns.
- Top-k selection over numeric scores.

The GPU path is usually unsuitable for:

- Single-document point reads.
- Very small candidate sets.
- Complex Unicode collation.
- Arbitrary regex.
- Arbitrary user-defined functions.
- Highly nested variable-shape JSON traversal.
- Writes requiring small random updates.
- Queries where GPU upload/download cost exceeds compute savings.

### 10.2 Columnar GPU buffers

For every GPU-scannable field, the engine creates a typed buffer layout.

Numeric column:

```text
values:          array<i64 | f64 | timestamp>
missing_bitmap:  bitset
null_bitmap:     bitset
doc_ids:          array<u64>
```

Dictionary string column:

```text
codes:           array<u32>
dictionary_hash: array<u64>
dictionary_data: byte buffer
missing_bitmap:  bitset
null_bitmap:     bitset
```

Array column:

```text
doc_offsets:     array<u32>
element_values:  array<T>
element_codes:   array<u32> for strings
missing_bitmap:  bitset
null_bitmap:     bitset
```

Output:

```text
result_bitmap: bitset
optional_scores: array<f32>
optional_match_counts: array<u32>
```

### 10.3 GPU kernel categories

Required WGSL kernel families:

```text
numeric_eq
numeric_ne
numeric_gt
numeric_gte
numeric_lt
numeric_lte
numeric_between
timestamp_compare
bool_eq
dict_string_eq
dict_string_in
array_contains
array_all
bitmap_and
bitmap_or
bitmap_not
bitmap_count
vector_l2
vector_cosine
vector_dot
topk_local
```

### 10.4 GPU query execution rules

The planner must choose GPU only when:

```text
estimated_input_rows >= gpu_min_rows
AND estimated_input_bytes >= gpu_min_bytes
AND predicate_is_gpu_supported
AND data_sidecar_available
AND device_available
AND request_deadline_allows_async_gpu_dispatch
```

Default thresholds should be configurable:

```yaml
gpu:
  enabled: true
  min_rows: 50000
  min_bytes: 4194304
  max_transfer_ratio: 0.25
  allow_browser_gpu: true
  fallback_on_device_lost: true
```

### 10.5 Correctness model

GPU results are candidate sets unless the kernel is marked **exact**.

Exact GPU kernels:

- Integer comparisons.
- Boolean comparisons.
- Timestamp comparisons.
- Dictionary-code equality where dictionary version is pinned.
- Bitmap operations.

Candidate GPU kernels requiring CPU verification:

- Floating-point comparisons with special values.
- String hash equality.
- Regex-like string operations.
- Complex arrays.
- Collation-sensitive string comparisons.
- Mixed-type comparisons.

Every GPU kernel must have:

- A CPU reference implementation.
- Property tests.
- Differential tests.
- Deterministic edge-case tests.
- Versioned kernel metadata.

### 10.6 GPU memory management

The GPU subsystem must maintain:

- Per-device buffer pool.
- Chunk upload cache.
- LRU eviction for GPU-resident chunks.
- Separate buffers for hot columns.
- Query-local scratch buffers.
- Result bitmap buffers.
- Device-loss recovery.

GPU memory policy:

```yaml
gpu_memory:
  max_fraction_of_device_memory: 0.30
  max_query_scratch_bytes: 1073741824
  evict_policy: lru
  pin_hot_indexes: true
```

### 10.7 CPU fallback

CPU fallback must be always available.

CPU execution should use:

- Same columnar sidecars.
- SIMD where available.
- Multithreaded host worker pool.
- Same predicate semantics.
- Same result verification path.

Fallback triggers:

- GPU unavailable.
- WebGPU feature detection fails.
- GPU buffer allocation fails.
- GPU device lost.
- Query not GPU-supported.
- Query too small.
- User disables GPU.
- Deadline too short.
- Tenant quota exceeded.

---

## 11. Storage engine specification

### 11.1 Storage layout

HelixDB should use an LSM-inspired design:

```text
data/
  MANIFEST
  OPTIONS
  wal/
    00000001.wal
  ranges/
    range_000001/
      meta/
      sst/
      vlog/
      cseg/
      index/
      raft/
```

File categories:

```text
WAL   write-ahead log
SST   sorted string table for keys and small values
VLOG  value log for large document blobs
CSEG  columnar sidecar segment
IDX   secondary index segment
MAN   manifest and metadata
RAF   consensus log/snapshot files
```

### 11.2 Write path

```text
client write
  → route to range leader
  → validate document
  → assign transaction timestamp/version
  → append Raft log entry if replicated
  → append WAL
  → update memtable
  → update in-memory indexes
  → update mutable columnar buffer
  → acknowledge according to write concern
  → async flush to SST/CSEG/IDX
```

### 11.3 Read path

Point read:

```text
_id lookup
  → memtable
  → block cache
  → SST index
  → VLOG if large document
  → MVCC visibility check
  → return HDoc/JSON
```

Filtered read:

```text
query planner
  → primary/secondary index pruning
  → chunk zone-map pruning
  → CPU/GPU sidecar scan
  → fetch matching HDoc blobs
  → final predicate verification
  → projection
```

### 11.4 Key layout

Internal keys:

```text
tenant_id | database_id | collection_id | range_id | key_kind | user_key | version
```

Key kinds:

```text
D  document primary key
I  secondary index key
C  columnar segment metadata
T  tombstone
M  collection metadata
R  replication metadata
```

Secondary index key:

```text
tenant | db | collection | index_id | encoded_field_value | document_id | version
```

### 11.5 MVCC

Every write creates a new version.

Document version metadata:

```text
created_at_ts
deleted_at_ts optional
transaction_id
write_epoch
```

Read concerns:

```text
local       read latest local committed version
majority    read version known durable by quorum
snapshot    read stable snapshot timestamp
linearizable leader-confirmed latest version
```

Write concerns:

```text
ack         accepted by leader
durable     fsynced locally
majority    replicated to quorum
all         replicated to all replicas
```

### 11.6 Compaction

Compaction responsibilities:

- Merge SST files.
- Drop obsolete MVCC versions.
- Drop expired TTL documents.
- Rewrite value logs.
- Rebuild columnar sidecars.
- Rebuild zone maps.
- Compact secondary indexes.
- Recompute chunk statistics.
- Preserve snapshot visibility for active readers.

Compaction must be backpressure-aware and query-aware. It must not starve foreground reads/writes.

### 11.7 Columnar chunking

Default chunk target:

```yaml
chunk:
  target_documents: 65536
  max_uncompressed_bytes: 134217728
  min_documents: 4096
```

Each chunk should maintain:

```text
doc_id range
document count
deleted count
field min/max
field null/missing counts
bloom filters for selected fields
dictionary summaries
compressed byte size
GPU eligibility flags
```

---

## 12. Indexing

### 12.1 Required index types

Primary index:

```text
_id → document pointer
```

Scalar secondary index:

```json
{
  "createIndex": "users",
  "keys": { "email": 1 },
  "unique": true
}
```

Compound index:

```json
{
  "createIndex": "orders",
  "keys": { "userId": 1, "createdAt": -1 }
}
```

TTL index:

```json
{
  "createIndex": "sessions",
  "keys": { "expiresAt": 1 },
  "ttl": true
}
```

Columnar scan index:

```json
{
  "createIndex": "events",
  "type": "columnar",
  "paths": ["timestamp", "userId", "eventType", "properties.country"]
}
```

Vector index:

```json
{
  "createIndex": "products",
  "type": "vector",
  "path": "embedding",
  "metric": "cosine",
  "dimensions": 768
}
```

### 12.2 Index selection

The planner should consider:

- Exact primary-key lookup.
- Unique index lookup.
- Secondary index range scan.
- Compound prefix scan.
- TTL pruning.
- Zone-map pruning.
- Bloom filter pruning.
- GPU sidecar scan.
- Vector index prefilter.
- Hybrid index + GPU filter.

### 12.3 Index build

Online index build phases:

```text
REGISTER → BACKFILL_SCAN → BUILD_SEGMENTS → CATCH_UP → VALIDATE → COMMIT
```

Index builds must be resumable after crash.

---

## 13. Distributed system design

### 13.1 Sharding model

Collections are split into ranges.

Range descriptor:

```json
{
  "rangeId": "r_000123",
  "collection": "orders",
  "startKey": "hash:0000",
  "endKey": "hash:0fff",
  "replicas": ["node-a", "node-b", "node-c"],
  "leader": "node-a",
  "epoch": 42
}
```

Partition strategies:

```text
hash(_id)              default even distribution
range(field)           time-series/range workloads
tenant_hash            multi-tenant isolation
custom shard key       user-defined
```

### 13.2 Replication

Use Raft-style replicated logs per range group. Raft is a well-known consensus algorithm for replicated logs, designed around leader election, log replication, and safety, and is commonly compared with Paxos in fault-tolerance and performance. ([Raft](https://raft.github.io/))

Each range has:

```text
1 leader
2+ followers
optional learners
```

Default production replication:

```yaml
replication:
  factor: 3
  write_quorum: majority
  read_lease: true
  snapshot_interval: 30m
```

### 13.3 Range movement

Range split triggers:

- Size threshold.
- Write throughput threshold.
- Read throughput threshold.
- Hotspot detection.
- Tenant isolation policy.

Range movement steps:

```text
create learner replica
stream snapshot
stream raft log tail
catch up
promote learner
update metadata
remove old replica
```

### 13.4 Distributed query execution

Point query:

```text
router computes shard key
  → sends to range leader/follower depending on read concern
  → returns result
```

Scatter/gather query:

```text
router finds relevant ranges
  → sends subquery to each range
  → each range performs local CPU/GPU plan
  → router merges, sorts, limits
```

Distributed aggregation:

```text
local partial aggregation per shard
  → router/global reducer
  → final aggregation result
```

### 13.5 Multi-region behavior

Supported policies:

```text
single-region strong
multi-AZ strong
multi-region read replicas
multi-region bounded staleness
multi-region active-active for cache/local-first collections
```

Cross-region strong writes should be optional because latency will be dominated by quorum distance.

---

## 14. Cache and local-first mode

### 14.1 Storage classes

Every collection or keyspace can choose a storage class:

```yaml
storage_class: durable | cache | local_replica | memory_only
```

#### `durable`

- WAL enabled.
- Quorum replication.
- Backups enabled.
- Compaction preserves MVCC policy.
- Suitable for primary storage.

#### `cache`

- TTL strongly encouraged.
- Eviction enabled.
- Optional WAL.
- Optional async replication.
- Suitable for Redis-like workloads.

#### `local_replica`

- Pulls from cloud cluster.
- Serves local reads.
- Supports offline operation.
- Optional write queue.
- Conflict policy required.

#### `memory_only`

- No disk durability.
- Fastest mode.
- Lost on restart unless replicated elsewhere.

### 14.2 Cache API

Examples:

```json
{
  "cacheSet": "session:user_123",
  "value": { "userId": "user_123", "roles": ["admin"] },
  "ttlSeconds": 1800
}
```

```json
{
  "cacheGet": "session:user_123"
}
```

```json
{
  "cacheIncr": "rate:user_123:login",
  "by": 1,
  "ttlSeconds": 60
}
```

### 14.3 Eviction policies

Required:

```text
ttl
lru
lfu
size-tiered
manual pinning
```

Eviction must never delete durable data unless the collection is explicitly marked cache/ephemeral.

### 14.4 Local sync

Sync state:

```json
{
  "collection": "users",
  "lastResumeToken": "...",
  "cloudTimestamp": "...",
  "localTimestamp": "...",
  "pendingWrites": 12
}
```

Conflict policies:

```text
server_wins
client_wins
last_write_wins
merge_patch
custom_wasm_resolver
reject_conflict
```

---

## 15. APIs and protocols

### 15.1 Native API

Primary protocol:

```text
HTTP/2 or HTTP/3 + JSON/CBOR
```

Optional high-performance protocol:

```text
gRPC or custom framed binary protocol
```

### 15.2 SDKs

Required SDKs:

- TypeScript.
- Rust.
- Go.
- Python.

Recommended later:

- Java.
- C#.
- Swift.
- Kotlin.

### 15.3 Browser SDK

Example:

```ts
const db = await Helix.open({
  name: "app-cache",
  storage: "opfs",
  gpu: "auto",
  sync: {
    endpoint: "https://db.example.com",
    token: authToken
  }
});

await db.collection("users").insertOne({
  _id: "u1",
  email: "a@example.com",
  age: 31
});

const users = await db.collection("users").find({
  age: { $gte: 18 }
}).toArray();
```

### 15.4 Mongo-compatible adapter

The adapter should support:

- Basic `find`.
- `insertOne`, `insertMany`.
- `updateOne`, `updateMany`.
- `deleteOne`, `deleteMany`.
- Basic aggregation.
- Basic indexes.
- Change streams where feasible.

It should explicitly document unsupported MongoDB behavior.

### 15.5 Redis-like adapter

The adapter should support:

```text
GET
SET
DEL
EXPIRE
TTL
INCR
DECR
MGET
MSET
PUBLISH
SUBSCRIBE
XADD-like streams, optional
```

This adapter maps Redis-like keys into a cache collection.

---

## 16. Transactions and consistency

### 16.1 v1 transaction scope

Required:

- Atomic single-document writes.
- Atomic batch writes within one range.
- Read-your-writes per session.
- Retryable writes.
- Snapshot reads.

v1.5:

- Multi-document transactions within one shard/range.

v2:

- Cross-shard transactions using two-phase commit or deterministic transaction coordinator.

### 16.2 Sessions

Session metadata:

```json
{
  "sessionId": "...",
  "lastSeenTxn": 12345,
  "causalConsistency": true
}
```

Supported guarantees:

```text
read-your-writes
monotonic reads
majority reads
linearizable reads for selected operations
```

---

## 17. Security

### 17.1 Authentication

Required:

- mTLS for node-to-node communication.
- JWT/OIDC for application clients.
- API keys for service accounts.
- Short-lived signed tokens for browser/local sync.

### 17.2 Authorization

Role model:

```text
cluster_admin
tenant_admin
database_admin
collection_read
collection_write
collection_admin
cache_read
cache_write
```

Optional advanced controls:

- Field-level permissions.
- Row/document-level policies.
- Tenant-level isolation.
- Per-index access restrictions.

### 17.3 Encryption

Required:

- TLS in transit.
- AES-256 or equivalent at rest.
- Per-tenant data encryption keys.
- Key rotation.
- Encrypted backups.
- Optional local database encryption.

### 17.4 Wasm sandboxing

User-defined functions, conflict resolvers, triggers, and plugins should run as isolated Wasm components with explicit capabilities. WASI is designed around capability-based security, where access to external resources is provided through granted capabilities rather than ambient authority. ([GitHub](https://github.com/WebAssembly/WASI/blob/master/docs/DesignPrinciples.md))

### 17.5 GPU safety

Rules:

- Clients cannot upload arbitrary GPU shaders by default.
- All WGSL kernels are internal and versioned.
- GPU execution must be bounded by timeout/deadline.
- GPU memory usage must be quota-controlled per tenant.
- Query timing details exposed to tenants should be coarse enough to avoid unnecessary side-channel leakage.
- Device-loss events must not crash the database process.

---

## 18. Observability and administration

### 18.1 Metrics

Required metrics:

```text
query_count
query_latency_p50/p95/p99
gpu_query_count
gpu_fallback_count
gpu_kernel_time
gpu_upload_bytes
gpu_download_bytes
gpu_buffer_pool_hit_rate
cpu_scan_rows
documents_inserted
documents_updated
documents_deleted
wal_bytes_written
sst_bytes_written
compaction_backlog
cache_hit_rate
cache_evictions
raft_commit_latency
raft_leader_changes
range_splits
range_moves
```

### 18.2 Logs

Structured logs:

```json
{
  "timestamp": "...",
  "level": "INFO",
  "component": "query",
  "tenant": "t1",
  "collection": "events",
  "queryId": "...",
  "plan": "gpu_predicate_scan",
  "latencyMs": 12.4
}
```

### 18.3 Tracing

Distributed traces should include:

- Router time.
- Authorization time.
- Planning time.
- Index scan time.
- GPU upload time.
- GPU kernel time.
- Fetch time.
- Network merge time.
- Replication wait time.

### 18.4 Admin commands

Required:

```text
helix status
helix nodes
helix collections
helix indexes
helix explain
helix ranges
helix rebalance
helix backup create
helix backup restore
helix compact
helix gpu status
```

---

## 19. Backup, restore, and disaster recovery

### 19.1 Backup types

Required:

```text
full snapshot
incremental snapshot
point-in-time recovery
collection export
tenant export
```

### 19.2 Backup format

Backups contain:

```text
manifest
collection metadata
range metadata
SST files
VLOG files
CSEG files
IDX files
WAL segments for PITR
checksums
encryption metadata
```

### 19.3 Restore modes

```text
restore cluster
restore tenant
restore database
restore collection
restore to timestamp
restore as forked environment
```

---

## 20. Testing and validation

### 20.1 Correctness tests

Required:

- Document codec round-trip tests.
- Query parser tests.
- Query semantic tests.
- CPU/GPU equivalence tests.
- MVCC visibility tests.
- WAL recovery tests.
- Compaction correctness tests.
- Index consistency tests.
- Distributed replication tests.
- Range movement tests.
- Backup/restore tests.

### 20.2 Differential testing

Run query compatibility tests against MongoDB for the declared compatibility subset.

For each operator:

```text
generate random documents
insert into MongoDB and HelixDB
run same compatible query
compare normalized results
```

### 20.3 GPU testing

For every GPU kernel:

```text
randomized input
edge-case input
CPU reference result
GPU result
bit-for-bit or tolerance comparison
fallback behavior
device-loss simulation
```

### 20.4 Distributed testing

Required:

- Kill leader during write.
- Kill follower during snapshot.
- Network partition.
- Clock skew.
- Range split during query.
- Range movement during index build.
- Disk full.
- GPU device lost.
- Object storage unavailable.
- Browser quota exceeded.

### 20.5 Jepsen-style validation

Before production v1, distributed consistency should be validated using Jepsen-style tests for:

- Linearizable writes where promised.
- Majority reads.
- Snapshot reads.
- Lost-update prevention.
- Duplicate write prevention.
- Range movement correctness.

---

## 21. Performance targets

These are engineering targets, not claims. They must be validated with reproducible benchmarks.

### 21.1 Single-node targets

For commodity NVMe server hardware:

```text
point read p50:              sub-millisecond to low single-digit ms
single document write p50:   low single-digit ms with local durability
batch ingest:                hundreds of thousands of small docs/sec/node target
large predicate scan:        GPU path should outperform CPU path when scan size is large enough
cache GET p50:               sub-millisecond in memory mode
```

### 21.2 GPU-specific benchmark targets

Benchmark categories:

```text
numeric equality over 10M / 100M / 1B rows
numeric range predicate
dictionary string equality
bitmap AND/OR
vector top-k
hybrid index + GPU filter
GPU upload cold cache
GPU resident hot cache
browser WebGPU vs native wgpu
CPU fallback vs GPU
```

### 21.3 Performance acceptance rule

A GPU plan is accepted only if:

```text
gpu_total_time < cpu_estimated_time * gpu_required_speedup_ratio
```

Default:

```yaml
gpu_required_speedup_ratio: 0.80
```

Meaning GPU should be selected only when expected to beat CPU by at least 20%, after transfer and scheduling overhead.

---

## 22. Roadmap

### Phase 0 — Research prototype

Deliverables:

- HDoc binary format.
- Basic Wasm core.
- Host file abstraction.
- Simple collection insert/find.
- CPU predicate engine.
- One WebGPU numeric filter kernel.
- CPU/GPU equivalence test harness.

Acceptance criteria:

- Insert 1M documents locally.
- Query with CPU.
- Query same predicate with GPU.
- Identical results.

### Phase 1 — Embedded single-node database

Deliverables:

- WAL.
- Memtable.
- SSTable.
- Value log.
- Primary index.
- Basic secondary index.
- OPFS/IndexedDB browser backend.
- Native filesystem backend.
- TypeScript and Rust SDKs.

Acceptance criteria:

- Crash recovery works.
- Browser local database works.
- CPU fallback works everywhere.

### Phase 2 — GPU query engine

Deliverables:

- Columnar sidecars.
- Zone maps.
- Dictionary encoding.
- Numeric/string predicate kernels.
- Bitmap kernels.
- GPU planner.
- `explain()` GPU stats.
- Device-loss fallback.

Acceptance criteria:

- GPU scan beats CPU on large supported predicates.
- Unsupported queries transparently use CPU.
- No correctness differences.

### Phase 3 — Server mode

Deliverables:

- `helixd`.
- HTTP/gRPC API.
- Auth.
- Admin CLI.
- Metrics.
- Backup snapshot.
- Single-node production hardening.

Acceptance criteria:

- Durable writes.
- Online compaction.
- Backup/restore.
- Query observability.

### Phase 4 — Distributed replication

Deliverables:

- Range abstraction.
- Raft replication.
- Metadata service.
- Query router.
- Range split.
- Range movement.
- Majority read/write concerns.

Acceptance criteria:

- Three-node cluster survives one-node failure.
- Range movement does not break reads/writes.
- Kill tests pass.

### Phase 5 — Sharding and autoscaling

Deliverables:

- Hash/range sharding.
- Rebalancer.
- Hotspot detection.
- Distributed aggregation.
- Placement policies.
- Multi-tenant quotas.

Acceptance criteria:

- Add node and rebalance automatically.
- Scatter/gather query works.
- Tenant resource limits enforced.

### Phase 6 — Cache/local-first layer

Deliverables:

- TTL indexes.
- Eviction.
- Redis-like adapter.
- Local replica sync.
- Change streams.
- Conflict policies.

Acceptance criteria:

- Cache workloads work without durable mode.
- Local browser/edge replica syncs from cloud.
- Offline read mode works.

### Phase 7 — Compatibility and ecosystem

Deliverables:

- Mongo-compatible adapter subset.
- Migration tool.
- Redis migration helper.
- Kubernetes operator.
- Managed cloud control plane.
- SDK expansion.

Acceptance criteria:

- Common Mongo-style application queries run unchanged or with documented differences.
- Common Redis cache patterns work through adapter.

---

## 23. Major technical risks

The biggest risk is scope. “MongoDB + Redis + RocksDB + GPU + distributed cloud database” is too broad unless implemented as one engine with clearly separated storage classes and compatibility layers.

The second major risk is GPU economics. GPU acceleration helps only when data is already in GPU-friendly typed buffers and the query is large enough to amortize transfer and dispatch overhead. The database must treat GPU as an adaptive execution backend, not a universal accelerator.

The third risk is compatibility. MongoDB query semantics contain many edge cases around arrays, nulls, missing fields, collation, numeric types, regex, and aggregation. HelixDB should publish an explicit compatibility matrix from day one.

The fourth risk is distributed correctness. Sharding, replication, range movement, transactions, and cache invalidation are harder than the GPU portion. The distributed layer needs strict invariants, fault injection, and Jepsen-style testing before being trusted as primary storage.

The fifth risk is browser variability. WebGPU, OPFS, storage quotas, memory pressure, and device limits vary across environments. Browser mode must be opportunistic, quota-aware, and fallback-safe.

---

## 24. Recommended implementation stack

Core language:

```text
Rust
```

Reasons:

- Strong memory safety.
- Good Wasm support.
- Good `wgpu` ecosystem.
- Good async/server ecosystem.
- Good serialization and testing tools.

Shader language:

```text
WGSL
```

Wasm runtime:

```text
Wasmtime for server/edge v1
Browser Wasm runtime for web
```

GPU backend:

```text
Browser: WebGPU through JavaScript bindings
Native/server: wgpu or Dawn host integration
```

Storage:

```text
Custom LSM-like engine
Custom HDoc format
Custom columnar sidecar
```

Protocols:

```text
HTTP/JSON for simplicity
gRPC or binary protocol for performance
Mongo-compatible adapter later
Redis-like adapter later
```

---

## 25. Minimal v1 product definition

The smallest credible v1 should be:

- Single-node durable document database.
- Mongo-like JSON query subset.
- Custom LSM storage engine.
- Columnar sidecars for selected fields.
- WebGPU acceleration for large numeric/string equality/range filters.
- CPU fallback.
- TypeScript and Rust SDKs.
- Browser embedded mode with OPFS/IndexedDB.
- Native server mode.
- Basic backups.
- Metrics and `explain()`.
- No full distributed mode yet, but file formats and APIs designed for ranges/replication.

The smallest credible v2 should be:

- Three-node replicated cluster.
- Range sharding.
- Query router.
- Online range movement.
- TTL/cache storage class.
- Local replica sync.
- Redis-like adapter.
- Mongo-compatible adapter subset.

This staged approach keeps the project realistic while preserving the long-term vision: a portable Wasm database core, GPU-accelerated query execution, distributed cloud storage, and local/cache deployments sharing the same underlying engine.

---

## 26. Requirements traceability

This section provides stable identifiers for the cross-cutting requirements most likely to affect several components. Detailed behavior remains authoritative in the corresponding sections above.

### 26.1 Platform and core

| ID | Requirement | Initial target |
| --- | --- | --- |
| `PLAT-001` | Browser hosts MUST feature-detect WebGPU and storage capabilities at runtime. | v1 |
| `PLAT-002` | Browser deployments MUST work without WebGPU and MUST provide an IndexedDB fallback when OPFS is unavailable. | v1 |
| `PLAT-003` | Native hosts SHOULD use wgpu or Dawn behind the same GPU abstraction used by browser hosts. | v1 |
| `CORE-001` | `helix-core.wasm` MUST contain deterministic codecs, query semantics, MVCC, planning, storage metadata, and replicated command application. | v1 |
| `CORE-002` | The core MUST receive file, network, time, randomness, scheduling, and GPU access only through explicit host interfaces. | v1 |
| `CORE-003` | Host-specific optimization MUST NOT change persistent or query semantics. | v1 |

### 26.2 Data, query, and storage

| ID | Requirement | Initial target |
| --- | --- | --- |
| `DATA-001` | Every stored document MUST have an `_id` and a canonical, typed HDoc representation. | v1 |
| `DATA-002` | Missing and null MUST remain distinct through storage, indexes, sidecars, predicates, and projections. | v1 |
| `DATA-003` | Field-path dictionary and persistent format changes MUST be versioned and recoverable. | v1 |
| `QUERY-001` | The declared query subset MUST have one normalized semantic definition shared by all APIs and execution backends. | v1 |
| `QUERY-002` | Unsupported operators or combinations MUST fail explicitly; they MUST NOT be silently reinterpreted. | v1 |
| `QUERY-003` | `explain()` MUST disclose selected indexes, CPU/GPU stages, fallbacks, candidate verification, and material execution statistics. | v1 |
| `STORE-001` | Acknowledged writes MUST satisfy the selected write concern and survive the failures promised by that concern. | v1/v2 |
| `STORE-002` | WAL replay, memtable flush, compaction, and sidecar/index rebuilds MUST be idempotent or safely resumable. | v1 |
| `STORE-003` | Compaction MUST preserve active snapshot visibility and MUST NOT permit TTL or cache eviction to delete durable live data. | v1 |

### 26.3 GPU execution

| ID | Requirement | Initial target |
| --- | --- | --- |
| `GPU-001` | GPU selection MUST include transfer, queueing, and result materialization costs rather than kernel time alone. | v1 |
| `GPU-002` | Every production GPU kernel MUST have a CPU reference, property tests, edge-case tests, and differential tests. | v1 |
| `GPU-003` | Non-exact GPU operators MUST produce candidates that pass through final CPU verification. | v1 |
| `GPU-004` | Allocation failure, unsupported features, quota exhaustion, timeout, or device loss MUST trigger a bounded fallback or a typed error; none may crash the database process. | v1 |
| `GPU-005` | GPU memory and execution time MUST be quota-controlled per device, query, and tenant where multi-tenancy exists. | v1/v2 |

### 26.4 Distribution, cache, and synchronization

| ID | Requirement | Initial target |
| --- | --- | --- |
| `DIST-001` | Every replicated range MUST have an epoch, authoritative replica set, leader, and consensus-backed ordered command stream. | v2 |
| `DIST-002` | Range splits and moves MUST preserve acknowledged writes, snapshot visibility, and router retry safety. | v2 |
| `DIST-003` | Scatter/gather plans MUST push filters and partial aggregation to ranges and apply global sort/limit semantics correctly. | v2 |
| `CACHE-001` | Eviction MUST operate only on storage classes that explicitly permit it. | v1/v2 |
| `CACHE-002` | TTL expiration MUST be consistent across reads, indexes, compaction, replication, backup, and restore. | v1/v2 |
| `SYNC-001` | Local synchronization MUST persist resumable progress and expose an explicit conflict policy before accepting offline writes. | v2 |
| `SYNC-002` | Replaying a change stream or offline write queue MUST be duplicate-safe. | v2 |

### 26.5 Security, operations, and quality

| ID | Requirement | Initial target |
| --- | --- | --- |
| `SEC-001` | Every external and node-to-node operation MUST be authenticated, authorized, encrypted in transit, and auditable. | v1/v2 |
| `SEC-002` | Tenant data, backups, GPU memory, metrics, logs, and administrative operations MUST respect isolation and quota boundaries. | v2 |
| `OPS-001` | Production releases MUST expose health, metrics, structured logs, tracing, backup/restore, and `explain()` evidence for their supported modes. | v1 |
| `OPS-002` | Restore procedures MUST be tested from actual produced backup artifacts, including point-in-time recovery where claimed. | v1 |
| `QUAL-001` | CPU/GPU equivalence, crash recovery, index consistency, and backup/restore are release-blocking test suites. | v1 |
| `QUAL-002` | Distributed consistency claims require fault injection and Jepsen-style validation before production designation. | v2 |
| `COMPAT-001` | Every MongoDB-like or Redis-like feature claim MUST appear in a versioned compatibility matrix backed by differential or protocol tests. | v1/v2 |

## 27. Format, protocol, and upgrade compatibility

### 27.1 Versioned artifacts

The following artifacts MUST carry an explicit format or protocol version before they are considered production-ready:

- HDoc documents.
- WAL records.
- MANIFEST and OPTIONS files.
- SST, VLOG, CSEG, and IDX files.
- Field-path dictionaries.
- Replicated state-machine commands and snapshots.
- Backup manifests.
- Change-stream records and resume tokens.
- Client protocol envelopes and error payloads.
- WGSL kernel bundles and their required device-feature metadata.

A reader MUST reject an unknown required feature or version with a typed diagnostic. It MUST NOT guess how to interpret unknown durable bytes.

### 27.2 Upgrade behavior

Before v1 release, the project MUST define and test:

1. Which prior on-disk versions a binary can read directly.
2. Whether upgrades are online, offline, or rolling for each deployment mode.
3. How sidecars and indexes are rebuilt when their format changes.
4. How an interrupted migration resumes or rolls back.
5. How backups are validated before any destructive migration.
6. How SDK and server protocol feature negotiation works.

Before v2 release, the project MUST additionally define mixed-version cluster rules, replicated command compatibility, leadership restrictions during upgrades, and rollback limits after a new format or command is committed.

### 27.3 Compatibility policy

MongoDB-like and Redis-like adapters are translation layers over HelixDB semantics. Each adapter MUST publish:

- Supported commands, operators, options, and wire/protocol versions.
- Known semantic differences, including null/missing, arrays, numeric coercion, collation, transactions, TTL, and error behavior.
- Unsupported features and the error returned for each.
- Migration and rollback procedures.
- Differential test coverage and the upstream version used as reference.

## 28. Open architecture decisions

The transcript establishes direction but intentionally leaves several implementation choices open. Each item below requires an architecture decision record before the dependent release gate closes.

| Decision | Required before | Decision criteria |
| --- | --- | --- |
| Native GPU integration: wgpu, Dawn, or a host abstraction supporting both | Phase 0 exit | Wasm boundary cost, feature parity, device recovery, maintainability, platform coverage |
| Server runtime and WASI component boundary | Phase 0 exit | Async support, capability isolation, startup cost, debugging, stable host ABI |
| HDoc checksum, compression, endianness, alignment, and canonical hash rules | Phase 0 exit | Determinism, corruption detection, partial reads, GPU/CPU decode cost, future evolution |
| WAL/SST/VLOG/CSEG physical encodings | Phase 1 exit | Recovery guarantees, write amplification, random reads, compaction, rebuild cost |
| Primary native protocol: HTTP/JSON, CBOR, gRPC, or custom framing | Phase 3 exit | Streaming, backpressure, browser support, SDK generation, observability, compatibility |
| Timestamp and transaction oracle for single-node and distributed snapshots | Phase 3/4 | Monotonicity, failover behavior, clock assumptions, restore, causality |
| Consensus library or implementation strategy | Phase 4 start | Safety evidence, snapshots, membership change, operational maturity, Wasm/core boundary |
| Vector index algorithm and persistence format | Feature start | Recall, rebuild cost, filtering integration, GPU usefulness, memory footprint |
| String collation and Unicode compatibility model | v1 API freeze | Determinism, MongoDB subset behavior, index ordering, CPU/GPU support |
| Cross-shard transaction coordinator | v2 feature start | Failure recovery, blocking behavior, idempotency, observability, operational cost |
| Local-sync version clock and default conflict policy | Phase 6 start | Offline duration, causality, storage overhead, user expectations, merge safety |
| Browser quota, persistence, and eviction UX | Phase 1 exit | OPFS/IndexedDB behavior, user consent, recovery, storage pressure, fallback |
| Tenant GPU accounting and scheduling policy | Multi-tenant preview | Fairness, isolation, cancellation, timing leakage, device utilization |

Until an item is decided, implementations MAY prototype alternatives but MUST NOT encode an irreversible public or persistent contract without explicit versioning.

## 29. Release gates and definition of done

### 29.1 Research prototype gate

The research prototype is complete only when a reproducible test can:

1. Encode and decode one million representative documents through HDoc without semantic loss.
2. Persist them through the host abstraction.
3. Execute the same supported predicate through CPU and one WebGPU kernel.
4. Prove identical ordered document IDs after final verification.
5. Report transfer, dispatch, kernel, verification, and end-to-end timings.
6. Run successfully with the GPU disabled.

### 29.2 v1 gate

v1 is complete only when all of the following are demonstrated from produced artifacts, not mocks alone:

- A fresh native install can create, reopen, query, compact, back up, and restore a database.
- A browser build can perform the same core workflow using OPFS and the documented fallback path.
- Crash tests cover every write-path acknowledgement boundary.
- Primary and supported secondary indexes remain consistent through recovery and compaction.
- Sidecars can be deleted and rebuilt solely from canonical data and metadata.
- Every supported GPU kernel passes CPU differential tests and device-loss fallback tests.
- `explain()`, metrics, logs, and traces expose the actual selected execution path.
- The declared query and SDK compatibility matrices are complete and tested.
- Security defaults do not permit unauthenticated remote access or ambient Wasm capabilities.
- Backup restore is proven in a clean environment and checksums are verified.
- Performance reports include dataset generators, hardware/software details, warm/cold states, CPU baselines, GPU transfer cost, and raw results.

### 29.3 v2 distributed gate

v2 is complete only when:

- A three-node replicated range survives any one node failure without losing majority-acknowledged writes.
- Leader changes, log replay, snapshots, membership changes, and learner promotion pass deterministic and fault-injection tests.
- Range split and movement remain correct under concurrent reads, writes, index builds, and router retries.
- Adding a node and rebalancing preserves availability and the promised consistency level.
- Scatter/gather filtering, sorting, limiting, and partial aggregation match a single-node reference result.
- Multi-tenant authorization, quotas, placement, metrics, backups, and restore are enforced across nodes.
- Jepsen-style histories validate every advertised consistency guarantee.
- Cache/local-replica synchronization proves resume, duplicate suppression, offline writes, conflict handling, and invalidation after failure.

### 29.4 Claim discipline

A feature is not complete merely because its API exists. A release claim requires:

1. A documented semantic contract.
2. A real implementation on every platform named by the claim.
3. Positive, negative, recovery, and compatibility tests.
4. Observability sufficient to diagnose backend selection and failure.
5. Upgrade and rollback behavior for any persistent or public contract.
6. An artifact-level end-to-end proof exercising the user-facing path.

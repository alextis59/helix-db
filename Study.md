# HelixDB Technical and Feasibility Study

- Status: Draft 0.1
- Last updated: 2026-07-09
- Inputs: [Shared-session transcript](docs/chatgpt-database-system-with-webgpu-transcript.md) and [HelixDB Specifications](Specifications.md)
- Purpose: Architectural analysis, feasibility assessment, and research guidance

This study examines the design proposed in the transcript and formalized in the specifications. It is analytical rather than normative: [Specifications.md](Specifications.md) defines what HelixDB intends to become, while this document evaluates why the design may work, where it is most likely to fail, what must be learned before irreversible choices are made, and how the work should be sequenced.

The conclusions here are design hypotheses until they are supported by implementation artifacts and reproducible measurements.

## Executive assessment

HelixDB has a coherent technical center: a canonical document row store paired with typed, rebuildable columnar sidecars, one reference query semantics, and an adaptive planner that can execute over CPU or WebGPU. This is a credible way to combine operational document access with large parallel scans without attempting to parse irregular JSON directly on a GPU.

The full product vision is nevertheless much larger than a GPU database project. It combines at least six difficult systems:

1. A typed document format and MongoDB-inspired semantic layer.
2. A crash-safe LSM-like storage engine with MVCC and online compaction.
3. A portable Wasm core and several host runtimes.
4. A heterogeneous CPU/GPU query engine.
5. A replicated, sharded distributed database.
6. Cache, browser-local, offline-sync, and compatibility products.

Each is feasible in isolation. Their integration is feasible only through strict sequencing and stable invariants. The first product should therefore prove a durable single-node CPU database before treating GPU speed, distribution, wire compatibility, or local-first synchronization as product claims.

### Overall findings

| Question | Assessment |
| --- | --- |
| Is the core architecture coherent? | Yes. Canonical HDoc rows plus derived typed sidecars separate correctness from acceleration. |
| Is WebGPU a sensible accelerator? | Potentially, for large regular workloads after pruning and when transfer costs are controlled. |
| Can GPU acceleration replace indexes? | No. It complements indexes, zone maps, bloom filters, and CPU execution. |
| Is Wasm a useful core boundary? | Yes, if host calls are coarse-grained and host-specific resources remain outside deterministic logic. |
| Is a custom storage engine justified? | Possibly, because sidecars and range metadata are first-class, but it is the largest v1 correctness and schedule risk. |
| Should distribution be built with v1? | No. Formats may anticipate ranges, but consensus and movement should follow single-node recovery proof. |
| Should MongoDB and Redis compatibility drive the core? | No. A native semantic contract should come first; adapters should map only an explicit subset. |
| What is the strongest differentiator? | Portable, adaptive query execution over the same data in browser, edge, and server environments. |
| What is the greatest risk? | Scope multiplication: attempting storage, GPU, distribution, sync, and compatibility at once. |

### Recommended strategic position

HelixDB should initially be positioned as a **portable document engine with an optional accelerated scan path**, not as a complete replacement for MongoDB, Redis, and RocksDB. If the storage and semantic foundations succeed, the same engine can later support those operating profiles through storage classes and adapters.

The recommended proof sequence is:

```text
semantic corpus
  → HDoc codec
  → durable CPU row store
  → typed sidecars and CPU columnar scan
  → WebGPU differential execution
  → browser/native portability
  → hardened single-node server
  → replicated ranges and sharding
  → cache/local sync and compatibility adapters
```

## 1. Scope and study method

The study evaluates the proposal through eight lenses:

- **Semantic coherence**: whether all modes can share one data and query model.
- **Correctness**: whether acceleration, compaction, replication, and recovery preserve observable behavior.
- **Feasibility**: whether the proposed component boundaries can be implemented on browser and native hosts.
- **Performance economics**: whether GPU work can overcome preparation and transfer costs.
- **Operational fitness**: whether the design can be diagnosed, backed up, upgraded, and recovered.
- **Security**: whether Wasm, GPU, browser, and multi-tenant boundaries can be controlled.
- **Delivery risk**: whether the roadmap produces useful evidence before expensive later layers begin.
- **Differentiation**: whether the combined system provides value beyond existing databases and embedded stores.

The study treats specification requirements as design intent, not evidence of implementation. It distinguishes three kinds of statement:

- **Invariant**: behavior the system must preserve regardless of implementation.
- **Hypothesis**: a performance or feasibility claim requiring an experiment.
- **Recommendation**: a proposed way to reduce uncertainty or risk.

## 2. The problem HelixDB is trying to solve

The motivating request combines the roles of a cloud document database, a fast cache, an embedded key-value store, and a GPU query system. The superficial interpretation would be four databases in one binary. That interpretation would produce conflicting durability, latency, memory, and consistency assumptions.

The more viable interpretation is one semantic and storage foundation with multiple operating policies:

| Product role | Primary optimization | Policy differences |
| --- | --- | --- |
| Durable document store | Correctness, recovery, indexed reads, operability | WAL, MVCC retention, backups, quorum durability later |
| GPU scan engine | Throughput over large typed candidate sets | Sidecars, chunking, buffer residency, adaptive planning |
| Embedded local store | Portability, offline availability, small footprint | Host storage adapter, optional GPU, local encryption |
| Cache | Tail latency, TTL, eviction, memory efficiency | Ephemeral storage class, weaker durability, quota policy |
| Distributed cloud store | Availability, scale, placement, tenant isolation | Ranges, consensus, routers, control plane |
| Local replica | Read locality and offline operation | Change streams, resume tokens, conflict policy |

The common substrate is the important product claim. Data should not need one representation for cloud, another for cache, and a third for browser use. The canonical representation, query semantics, indexes, and visibility rules should remain recognizable across deployments. What changes is the host and the policy envelope.

## 3. The central architectural thesis

### 3.1 Canonical rows plus derived columns

The most important design choice is to keep HDoc row documents as the source of truth while generating typed columnar sidecars for fields worth scanning. This resolves several tensions:

- Document writes remain natural and preserve the full object.
- Point reads can fetch a canonical blob rather than reconstructing a document from columns.
- GPU and SIMD paths receive regular typed buffers instead of irregular JSON trees.
- Sidecars can be invalidated and rebuilt without threatening source data.
- Query planning can combine primary indexes, secondary indexes, zone maps, bloom filters, sidecar scans, and final row verification.

This is not free duplication. It trades storage and write amplification for scan efficiency. The design is justified only if sidecar maintenance is asynchronous or batched for most writes and if the planner can avoid sidecars when they are stale, absent, or unprofitable.

### 3.2 Deterministic core plus capability host

The proposed Wasm boundary separates deterministic database decisions from platform services. The core owns codecs, semantics, MVCC rules, plan construction, versioned metadata, and replicated state-machine application. The host owns files, sockets, clocks, randomness, threads, TLS, GPU devices, object storage, and process supervision.

This boundary has three benefits:

1. It makes browser, edge, desktop, and server hosts share the same semantic engine.
2. It makes ambient authority visible and testable.
3. It makes replicated command application and recovery easier to reason about.

The boundary becomes harmful if every block read, tuple comparison, or GPU buffer operation crosses it individually. Interfaces must be coarse-grained: batches, handles, immutable buffer views, and asynchronous operations should cross the boundary rather than fine-grained callbacks.

### 3.3 Adaptive rather than GPU-first execution

The GPU is a physical backend, not a query semantics layer. The planner should first prune with metadata and indexes, then estimate whether remaining work is large and regular enough for GPU execution. The CPU remains both the reference implementation and the natural backend for point reads, small candidate sets, irregular predicates, and final verification.

This architecture avoids a common trap: optimizing kernel time while ignoring data preparation, upload, queueing, download, and row materialization. End-to-end time is the only useful selection criterion.

## 4. Feasibility by subsystem

| Subsystem | Feasibility | Difficulty | Principal uncertainty |
| --- | --- | --- | --- |
| HDoc codec and semantic corpus | High | Medium | Canonicalization, type edge cases, future evolution |
| Single-node CPU document engine | High | High | Crash safety, MVCC, compaction, index consistency |
| Wasm core/host split | Medium-high | Medium-high | ABI cost, async I/O, buffer ownership, debugging |
| Typed sidecars and CPU scans | High | Medium-high | Write amplification, freshness, schema variability |
| WebGPU predicate engine | Medium-high | High | Device capabilities, crossover point, transfer cost |
| Browser durable mode | Medium | High | Quotas, persistence behavior, memory pressure, lifecycle |
| Native server mode | High | Medium-high | Operations, security, upgrades, resource control |
| Replicated ranges | Medium-high | Very high | Consensus integration, snapshots, membership, recovery |
| Sharding and range movement | Medium | Very high | Epochs, retries, concurrent mutation, online movement |
| MongoDB compatibility subset | Medium-high | High | Arrays, missing/null, numbers, collation, errors |
| Redis-like cache adapter | High for a subset | Medium-high | Atomic commands, TTL, pub/sub, persistence expectations |
| Offline local synchronization | Medium | Very high | Conflict semantics, resumability, duplicate suppression |
| Entire vision in one release | Low | Extreme | Scope and interacting failure modes |

The feasibility conclusion is conditional: the architecture is plausible, but the evidence must be accumulated vertically. Building broad APIs before a durable narrow slice would create the appearance of progress while deferring the hardest proof.

## 5. Wasm core and host boundary

### 5.1 What belongs in the core

The core should own logic whose output must be reproducible across hosts:

- HDoc encoding, decoding, validation, and canonical hashing.
- Missing/null/type comparison semantics.
- Query normalization and logical plans.
- MVCC visibility and transaction state transitions.
- Manifest and persistent metadata interpretation.
- Index key construction.
- Compaction selection given explicit input facts.
- Replicated command validation and application.
- CPU reference operators.

Inputs such as current time, random identifiers, available memory, device capabilities, and filesystem results should be supplied explicitly. A deterministic function may decide what to do with those facts; it should not discover them through ambient calls.

### 5.2 What belongs in the host

The host should own:

- File descriptors, durability primitives, directory operations, and object storage.
- Networking, TLS, authentication integration, and request scheduling.
- OS threads and worker pools.
- WebGPU adapter discovery, device creation, command submission, and device-loss handling.
- Timers, cancellation, process signals, and resource accounting.
- Secure key access and platform-specific encryption integration.

### 5.3 Boundary hazards

The main hazards are copying, chatty calls, and mismatched lifecycle rules. A Wasm linear-memory buffer may not be directly usable as a durable file or GPU buffer on every host. The prototype should compare at least three strategies:

1. Copy through Wasm memory for simplicity.
2. Host-owned immutable buffers referenced by opaque handles.
3. Shared or mapped staging regions where a host supports them safely.

The study recommends beginning with explicit copies and excellent measurement. Optimizing the boundary before its cost is measured risks locking in unsafe or host-specific behavior. Once profiling identifies material copies, handles or shared staging can be introduced behind a versioned capability interface.

### 5.4 Portability test

A feature is portable only when the same semantic test corpus passes through at least a native host and a browser host. Successful compilation to Wasm is not sufficient. File durability, cancellation, memory pressure, and GPU capability differences must be part of the test.

## 6. HDoc and the data model

### 6.1 Why a custom binary document format is central

A custom typed format gives HelixDB control over canonical hashes, stable replication payloads, field lookup, binary values, timestamps, decimals, vectors, and schema evolution. It also enables a collection path dictionary that can reduce storage and connect row fields to sidecar columns.

The format is also an irreversible surface. A premature layout could make every later storage, replication, and migration feature expensive. The semantic contract should therefore precede the byte layout.

### 6.2 Semantic questions that must be frozen first

Before HDoc v1 is frozen, the project needs explicit answers for:

- Missing versus null.
- Integer width and overflow.
- Decimal normalization.
- Floating-point NaN, infinity, negative zero, and comparison ordering.
- Timestamp precision and timezone normalization.
- Object field ordering and canonical hashing.
- Duplicate object keys.
- Array comparison and nested-array traversal.
- String normalization and collation.
- ObjectId, UUID, binary subtype, and vector dimensions.
- Maximum nesting, document size, field count, and path length.

A compact binary layout cannot compensate for ambiguous semantics. The recommended first artifact is a language-neutral corpus containing encoded values, canonical JSON-like renderings, comparison outcomes, and invalid inputs.

Those semantic questions are now frozen by the Phase 1 gate. [ADR 0012](docs/adr/0012-use-bounded-little-endian-hdoc-v1.md)
selects the HDoc v1 physical baseline: little-endian checked `u32` addressing under the portable
16 MiB limit, deterministic alignment/padding, separate CRC-32C stored-byte integrity and
BLAKE3-256 canonical typed content identity, bounded optional compression, and fail-closed
version/extension rules. Exact header, tag, payload, table, hash-framing, and compression-profile
bytes are dependency-ordered rather than guessed by the first codec implementation. The
[HDoc 1.0 envelope format](docs/formats/hdoc-v1.md) now fixes the `P03-002` 64-byte header,
32-byte section directory, canonical body placement, structural/feature flags, and 64-byte footer.
It deliberately leaves hash profile zero invalid until `P03-006`; after the tag registry below,
the remaining `P03-004`–`P03-007` contracts must land before any complete HDoc byte fixture or
writer claim.

The [HDoc 1.x type-tag registry](docs/formats/hdoc-v1-type-tags.md) now closes `P03-003` with one
stable byte for each of the 16 stored logical types. It deliberately excludes transient Missing,
splits the fixture-level vector umbrella into f32/f16 tags, and reserves standard, registered,
experimental/private, control/escape, and invalid ranges with fail-closed behavior. Payload and
container bytes remain `P03-004`/`P03-005`.

### 6.3 Field-path dictionaries

Path dictionaries can reduce repeated names and give sidecar columns stable identifiers, but they introduce collection-level state. The system must define:

- How a new path is registered during a write.
- Whether IDs are ever reused.
- How dictionary versions are pinned by documents and sidecars.
- How renamed or removed fields behave.
- How concurrent writers agree on path IDs in distributed mode.
- How imports preserve names without trusting external numeric IDs.

The safest default is monotonic, non-reused IDs with explicit dictionary versions. Old readers should either understand the version or reject it; they should not reinterpret IDs.

### 6.4 Sidecar lifecycle

A sidecar needs a validity contract, not only a file format. Each chunk should identify its source range, document/version bounds, dictionary version, schema/type profile, and build watermark. The planner must know whether a sidecar covers the whole visible snapshot.

A useful model is:

```text
immutable persisted sidecars
  + mutable in-memory column batch
  + row-store delta after sidecar watermark
  - tombstones and invisible MVCC versions
  = complete candidate space for a snapshot
```

This allows writes to remain durable without synchronously rewriting large columnar files. Queries can scan the sidecar and a smaller delta path, then merge and verify results.

### 6.5 Dynamic schema pressure

Document collections may contain one field with several types. A GPU column cannot safely pretend those values are homogeneous. The sidecar should either:

- split values by type with a type bitmap;
- mark a chunk ineligible for a kernel;
- coerce only under explicit query semantics; or
- send mixed values to CPU verification.

Silent coercion would undermine both compatibility and CPU/GPU equivalence.

## 7. Storage-engine study

### 7.1 Why an LSM-like design fits

The proposed workload includes document writes, range-partitioned keys, secondary indexes, TTL cleanup, sidecar generation, and eventual replication logs. An LSM-like design supports sequential WAL writes and immutable files that can be moved, backed up, checksummed, and compacted.

The fit does not remove the cost. A custom engine must solve:

- atomic manifest changes;
- torn and partial writes;
- WAL replay boundaries;
- memtable and flush ordering;
- block indexes and caches;
- bloom-filter correctness;
- value-log garbage collection;
- MVCC retention;
- secondary-index consistency;
- online compaction and backpressure;
- file-format migration; and
- corruption detection and repair diagnostics.

### 7.2 Derived artifacts and acknowledgement boundaries

The row record and WAL determine durability. Secondary indexes and sidecars may be updated synchronously, logged as part of the same transaction, or rebuilt later. Whichever model is chosen must be explicit.

A practical v1 strategy is:

1. WAL records the canonical mutation and enough metadata to replay it.
2. Memtables expose the latest row and index state.
3. Flush produces row, index, and sidecar files under a new manifest generation.
4. Manifest publication is the atomic visibility point for immutable files.
5. Any derived file missing after a crash is rebuilt or excluded by its watermark.

This strategy still requires proof that a query never omits a committed row while a sidecar or index is catching up.

### 7.3 Compaction as a semantic operation

Compaction is not merely file merging. It interprets MVCC visibility, active snapshots, TTL, tombstones, value-log references, indexes, and sidecar generations. It should be modeled as a deterministic transformation from a manifest snapshot and policy inputs to a new set of files.

Useful invariants include:

- Every live logical version is represented exactly once after compaction.
- Every active snapshot sees the same result before and after publication.
- No derived entry survives without a corresponding visible or retained row version.
- Expired cache data cannot be confused with durable data.
- Interrupted output is unreachable until a manifest commit.

### 7.4 Recommendation on “from scratch”

Owning the database format and state machine does not require reimplementing cryptography, checksums, compression, consensus theory, or every data structure. Mature low-level libraries should be used where they do not take ownership of HelixDB semantics. The project should write a custom storage engine only where the row/sidecar/range integration materially requires it.

## 8. Query semantics and planning

### 8.1 Semantics before syntax breadth

MongoDB-inspired JSON is easy to parse; compatible behavior is not. Arrays, missing fields, null, mixed numeric types, nested paths, collation, regex, projection, update operators, and sort stability create most of the complexity.

The first query milestone should cover a narrow operator set with a complete truth table:

```text
$eq $ne $gt $gte $lt $lte
$and $or $not
$exists $type
```

The truth table should cross value types, missing/null, arrays, numeric edge cases, and invalid operands. Only after CPU behavior is stable should operators be lowered into index or GPU implementations.

### 8.2 Logical and physical separation

Logical plans express meaning: scan, filter, project, sort, group, vector search. Physical plans choose a primary index, secondary index, column scan, CPU kernel, GPU kernel, row fetch, or verification stage.

This separation is essential because the same query should survive changes in hardware and data shape. A saved query must not acquire different semantics because a GPU appears or an index is built.

### 8.3 Planner cost model

The planner should compare end-to-end candidates, not choose from a fixed priority list. Relevant terms include:

- candidate rows and bytes after pruning;
- row width and selected column width;
- sidecar availability and freshness;
- index selectivity;
- CPU cache state and worker availability;
- GPU adapter capability and queue depth;
- buffer residency;
- upload and download volume;
- verification rate;
- sort, group, and row-fetch cost; and
- request deadline.

Initial estimates can be rule-based. Actual counts and timings from `explain()` should later calibrate per-device models. Learning must remain bounded and observable; an adaptive model should never make plan selection unexplainable.

### 8.4 Explainability as part of correctness

`explain()` should answer both “what ran?” and “why?” A useful output includes:

- eligible and rejected indexes;
- eligible and rejected GPU kernels with reason codes;
- estimated versus actual rows and bytes;
- sidecar versions and coverage;
- buffer residency and transfer bytes;
- exact versus candidate stages;
- final verification counts;
- fallback cause and point of occurrence; and
- end-to-end stage timings.

Without these facts, GPU regressions, stale statistics, and silent fallbacks will be difficult to distinguish.

### 8.5 Index strategy and online lifecycle

Indexes and columnar sidecars serve different selectivity regimes. A primary or highly selective secondary index should reduce work before any broad scan is considered. Sidecars are most valuable when an index is absent, when several moderately selective predicates need bitmap combination, or when an index produces a still-large candidate set.

The initial index set should remain small: primary `_id`, scalar, compound, and TTL indexes. Vector and broad columnar indexes should follow only after their update, memory, and rebuild costs are measured. Each index needs an independent generation, source watermark, build state, and validation result.

An online build should preserve the specification's phase model:

```text
REGISTER
  → BACKFILL_SCAN at snapshot S
  → BUILD_SEGMENTS
  → CATCH_UP mutations after S
  → VALIDATE against canonical rows
  → COMMIT generation atomically
```

Unique indexes need an additional proof: duplicates discovered during backfill or catch-up must prevent publication without blocking ordinary row recovery. A crash at any build phase should resume safely or discard unreachable output. Queries must use only a committed generation and should expose the chosen generation in `explain()`.

## 9. GPU acceleration economics

### 9.1 The real cost equation

A GPU plan is beneficial only when:

```text
T_gpu_total =
    T_prepare
  + T_upload
  + T_queue
  + T_kernel
  + T_download
  + T_verify
  + T_fetch_rows

T_gpu_total < T_cpu_total × required_ratio
```

Kernel time alone is not a decision metric. The specification's 20% required advantage is a reasonable starting guardrail, but the threshold is a hypothesis and should be calibrated by adapter and workload.

### 9.2 Three residency regimes

Benchmarks and planner statistics should distinguish:

1. **Cold**: sidecar bytes must be read from storage and uploaded.
2. **Warm host**: sidecar bytes are cached in host memory but not on the GPU.
3. **GPU-resident**: the required columns are already in device buffers.

A workload that wins only in the third regime can still be valuable, but the product must make residency visible and must not advertise the resident result as universal performance.

### 9.3 Best early kernels

The best prototype kernels are regular and easy to verify:

- Boolean equality.
- Fixed-width numeric comparison supported by the target capability profile.
- Timestamp comparison using a defined representation.
- Dictionary-code equality with a pinned dictionary version.
- Bitmap AND, OR, NOT, and count.

Vector distance is attractive but should follow basic predicate infrastructure. Top-k, mixed types, arrays, and string hashing introduce more scratch memory, numerical, and verification complexity.

### 9.4 Device capability profiles

Portable WebGPU code must not assume that every adapter supports every scalar width, limit, or optional feature required by the ideal column layout. The host should publish a capability profile to the planner. Kernels and encodings should declare required features, limits, workgroup assumptions, and exactness class.

Possible responses to a missing capability are:

- choose an alternate representation or kernel;
- split a value into supported words;
- use a narrower type only when semantics permit it;
- execute that predicate on CPU; or
- reject an explicitly GPU-required request with a typed error.

Semantic narrowing must never happen silently.

### 9.5 Candidate versus exact results

The exact/candidate distinction is a strong safety mechanism. Exact integer, Boolean, timestamp, pinned dictionary-code, and bitmap kernels may directly produce matches if their representation semantics are proven. Floating-point, hash-based string, collation, mixed-type, and complex-array kernels should normally produce candidates.

CPU verification changes the performance equation. A kernel that returns half the collection as candidates may be slower than a CPU scan even if its kernel time is excellent. Selectivity and verification cost belong in planning statistics.

### 9.6 Bounded execution and failure

GPU cancellation is not equivalent to cancelling a CPU loop. Queries should be divided into bounded chunks so deadlines can be checked between dispatches. Device loss, allocation failure, validation errors, and quota rejection should produce stable reason codes.

Fallback is safe only if the operation is idempotent and no partial result has escaped. Read-only scan stages fit this model. GPU writes or arbitrary client shaders would make recovery substantially harder and remain correctly outside v1.

## 10. CPU execution is a product, not a fallback stub

The CPU path must be complete before the GPU path is trusted. It serves four roles:

- Reference semantics for differential tests.
- Primary backend on unsupported hosts.
- Faster backend for small or irregular work.
- Recovery backend after device failure.

CPU operators should use the same typed sidecars when profitable, with SIMD and host-managed parallelism where available. This produces a fair comparison: the GPU should be compared with an optimized columnar CPU path, not with a deliberately weak row-by-row interpreter.

A useful execution hierarchy is:

```text
primary/secondary index
  → metadata pruning
  → CPU or GPU typed scan
  → candidate bitmap
  → row fetch and final verification
  → projection/sort/limit
```

## 11. Browser and local deployment

Browser mode is strategically important because it tests the portability claim more severely than native mode. It also combines the least predictable resources: storage quotas, lifecycle suspension, memory pressure, worker constraints, and optional GPU access.

### 11.1 Browser-specific obligations

The browser host needs explicit behavior for:

- OPFS capability and persistence detection.
- IndexedDB fallback and its different transaction model.
- Quota estimation, quota exhaustion, and user-visible recovery.
- Background or worker execution so database work does not block the UI.
- Abrupt tab/process termination.
- Wasm memory growth and large-buffer limits.
- GPU feature detection, device loss, and power policy.
- Upgrade coordination when several tabs open the same database.
- Secure storage of sync credentials.

### 11.2 Recommended sequencing

Browser work should begin early enough to validate the core/host boundary, but it should not become the first durability oracle. The recommended sequence is:

1. Define host conformance tests.
2. Prove native crash recovery with controllable failure injection.
3. Implement the browser adapter against the same conformance contract.
4. Add browser lifecycle and quota tests.
5. Compare identical semantic fixtures across both hosts.

This avoids designing a native-only core while preserving a tractable recovery environment for initial storage work.

## 12. Distributed architecture

### 12.1 Why ranges are a good abstraction

Range-local ownership aligns keyspace partitioning, replication, snapshots, and movement. The default hash partition can distribute arbitrary document IDs, while explicit range or tenant strategies support time-series and isolation needs.

A range descriptor needs at least an ID, bounds, epoch, replica set, leader, placement policy, and state. Routers must attach or validate epochs so stale routing produces a retry rather than a misdirected write.

### 12.2 Consensus is not the first scaling feature

A replicated log can order state-machine commands, but it does not automatically solve:

- storage durability beneath log acknowledgement;
- snapshot consistency with LSM manifests;
- membership changes;
- transaction timestamps;
- secondary-index and sidecar rebuilds;
- range splits;
- router retries; or
- backup coordination.

The single-node state machine and snapshot format must be stable enough to embed inside consensus before Phase 4 begins. Otherwise distribution multiplies every unresolved storage bug.

### 12.3 Range movement proof obligations

Online movement should be treated as a protocol with explicit phases and invariants:

```text
allocate learner
  → capture snapshot at index N
  → transfer and verify files
  → replay log after N
  → reach promotion condition
  → commit metadata epoch
  → route new traffic
  → retire old replica after safety window
```

Tests must cover leader loss, source loss, destination loss, concurrent split, index build, compaction, stale router, and retry at every phase. “No errors observed” is insufficient; histories must show no lost acknowledged write and no snapshot anomaly beyond the declared consistency model.

### 12.4 GPU placement in a cluster

GPU awareness should initially remain local to a shard. Each range executes its own physical plan using available CPU/GPU resources, and the router merges results. Scheduling a query to a remote GPU node solely for acceleration adds data movement and consistency complexity that is unlikely to pay off before the local model is mature.

### 12.5 Transactions and consistency

The staged transaction scope in the specification is sound. Atomic single-document writes, range-local batches, retryable writes, read-your-writes sessions, and snapshot reads are enough to validate the MVCC and session model before cross-range coordination exists.

Each named concern must correspond to a mechanical acknowledgement or read rule. For example, `durable` cannot mean merely “entered the process,” and `majority` cannot be implemented before the replicated log and storage durability boundary agree on what a committed index means. Session tokens should carry enough information to enforce monotonicity without requiring global coordination for every read.

Cross-shard transactions should remain a later feature because they introduce a coordinator log, participant recovery, idempotent prepare/commit, timeout ambiguity, garbage collection, and interaction with range movement. Before choosing two-phase commit or another mechanism, the project must define the timestamp oracle, transaction identity, retry model, and behavior when a participant changes ranges.

Consistency testing should generate histories at the public API and classify them against the exact advertised model. Internal Raft success is not evidence that session, snapshot, or transaction semantics are correct end to end.

## 13. Cache and local-first analysis

### 13.1 Storage classes are safer than hidden mode switches

The specification's explicit `durable`, `cache`, `local_replica`, and `memory_only` classes are important because durability and eviction must be visible policy. The same key cannot be assumed evictable in one code path and durable in another.

Storage-class metadata should be part of collection creation and backup manifests. Changing a durable collection to cache should require an explicit administrative operation and warnings because it changes data-loss expectations.

### 13.2 TTL is cross-cutting

TTL affects reads, indexes, compaction, replication, backup, restore, and change streams. A document that has logically expired should not reappear after restore or on a lagging replica without a documented clock and visibility policy.

The implementation must distinguish logical expiry from physical deletion. Reads can hide an expired version immediately according to the chosen time oracle; compaction may reclaim bytes later.

### 13.3 Offline writes are a separate distributed system

A local replica that only consumes change streams is much simpler than one that accepts offline writes. Offline mutation introduces causal ordering, conflict detection, duplicate suppression, schema evolution, authentication expiry, and user-facing resolution.

The recommended progression is:

1. Read-only resumable local replica.
2. Online write-through cache.
3. Offline queue for operations known to be commutative or conflict-free.
4. General offline writes only after conflict semantics are explicit.

Custom Wasm conflict resolvers should be later functionality because determinism, resource limits, and upgrade behavior must be defined first.

## 14. Compatibility strategy

### 14.1 Native semantics first

HelixDB needs a small native API whose behavior is fully owned and tested. MongoDB-like JSON syntax can inform it, but compatibility should not force undocumented behavior into the storage core.

A compatibility matrix should be generated from executable tests, not marketing prose. Each row should identify:

- syntax accepted;
- exact semantic match, deliberate difference, or unsupported status;
- error type;
- index behavior;
- transaction and consistency behavior; and
- upstream reference version.

### 14.2 MongoDB-like adapter

The adapter is feasible for basic CRUD, filters, projections, sorting, and selected aggregation. The expensive areas are array traversal, null/missing interaction, numeric coercion, collation, regex, update edge cases, change streams, and multi-document transactions.

Differential generation should begin with the first operator, even before a wire protocol exists. This makes semantic drift visible while it is still cheap to correct.

### 14.3 Redis-like adapter

A JSON-backed cache can support `GET`, `SET`, `DEL`, expiry, and counters, but Redis clients also rely on atomicity, exact error behavior, pipelining, pub/sub lifecycle, and specialized data structures. The adapter should expose only commands with a clear mapping to HelixDB transactions and TTL rules.

The adapter must not imply that a cache collection has the latency or memory model of an in-memory Redis deployment unless measured in that storage class.

### 14.4 Native API and SDK strategy

The native protocol should expose HelixDB's own semantics before compatibility protocols are attempted. A simple JSON or CBOR envelope over HTTP is adequate for early server work if it includes stable operation names, typed errors, request IDs, deadlines, session tokens, read/write concerns, and feature negotiation. Streaming and backpressure requirements should be proven before selecting a higher-performance framed protocol.

SDKs should be thin semantic clients rather than alternate planners. They may provide typed builders, retries allowed by server error metadata, cursor iteration, and host-specific convenience, but the server or embedded core remains authoritative for normalization and planning.

Protocol conformance tests should send the same fixture through the embedded API and the server API and compare normalized results and errors. This prevents the browser SDK, native SDKs, and later adapters from becoming subtly different products.

## 15. Security analysis

The architecture creates four important trust boundaries:

1. Client to server or browser sync endpoint.
2. Node to node in a distributed cluster.
3. Wasm core or plugin to host capabilities.
4. Host memory to GPU device and shared GPU scheduler.

### 15.1 Wasm capabilities

The core and future plugins should receive minimum capabilities. A query plugin should not automatically inherit filesystem or network access. Capability handles should be scoped, revocable where possible, and represented in audit logs.

### 15.2 GPU isolation

GPU buffer pools may retain tenant data after logical release. Buffers should be zeroed or safely reinitialized before cross-tenant reuse according to the threat model. Per-tenant memory, time, and queue quotas are necessary to prevent denial of service. Diagnostics should avoid exposing device timing detail that creates unnecessary cross-tenant leakage.

### 15.3 Persistent data and backups

Encryption must cover WAL, immutable files, local browser stores where promised, and backups. Key identifiers and rotation state belong in manifests, while raw key material remains in host-managed secure services. Restore tests must include missing, rotated, and revoked key cases.

### 15.4 Threat modeling milestones

A threat model is needed before remote server preview and should be revised before multi-tenancy, user Wasm components, distributed deployment, and managed browser sync. Security cannot be appended after file and protocol formats freeze.

## 16. Observability as an architectural feature

HelixDB's unusual behavior will often be invisible without explicit diagnostics. A query may use an index, CPU sidecar scan, GPU-resident scan, cold GPU upload, or CPU fallback and still return the same rows. Operators need to know which occurred.

### 16.1 Required evidence

For each query, the diagnostic path should be able to report:

- normalized query fingerprint;
- logical and physical plan identifiers;
- selected and rejected backends;
- stable reason codes;
- estimated and actual cardinality;
- bytes read, uploaded, and downloaded;
- sidecar and dictionary versions;
- GPU queue, kernel, and verification time;
- row fetch and result materialization time;
- fallback point; and
- deadline or quota influence.

### 16.2 Durable diagnostic artifacts

A debug trace should be exportable as a bounded structured artifact rather than requiring verbose live logs. It should omit document values and credentials by default while retaining plan decisions and failure causes. This is especially important for browser environments where reproducing device state may be difficult.

### 16.3 Planner feedback

Observed estimates and actuals may feed planner calibration, but telemetry used for planning should be versioned and resettable. A stale or corrupted performance model must degrade to conservative rules, not correctness failure.

### 16.4 Backup, restore, and upgrade evidence

Backups should be assembled from an explicit manifest snapshot, immutable files, required WAL ranges, checksums, format versions, and encryption metadata. Copying a live directory without a captured visibility boundary is not a backup protocol.

Restore is the real acceptance test. A clean environment should verify the manifest and every referenced artifact, reconstruct the intended timestamp, rebuild optional derived files when permitted, and run logical consistency checks before serving traffic. Point-in-time recovery must define the base snapshot, WAL interval, transaction boundary, and behavior of TTL during replay.

Browser deployments may use export/import rather than cluster-style backup, but they still need versioned artifacts, integrity checks, quota-failure behavior, and a path to recover user-owned data.

Upgrade tests should cover both successful migration and interruption at every persistent transition. Before distributed release, the matrix must also include mixed-version replicas, leadership eligibility, snapshot transfer, rolling upgrade, and the point after which rollback is no longer safe.

## 17. Testing and validation strategy

### 17.1 Test layers

| Layer | Primary purpose | Representative artifact |
| --- | --- | --- |
| Semantic fixtures | Define query and type behavior | Language-neutral JSON/CBOR cases with expected results |
| Codec tests and fuzzing | Protect HDoc and persistent parsers | Corpus, round-trip checks, malformed-input cases |
| Model-based storage tests | Verify logical state across operation sequences | Reference map/MVCC model and generated histories |
| Crash matrix | Verify acknowledgement and recovery boundaries | Fault point, acknowledged operations, recovered state |
| CPU/GPU differential tests | Prove backend equivalence | Inputs, adapter profile, CPU result, GPU result |
| Sidecar rebuild tests | Prove derived-state safety | Row files, deleted sidecars, rebuilt hashes/results |
| Compatibility differential tests | Bound MongoDB/Redis claims | Generated operations and normalized comparison |
| Browser conformance tests | Validate host portability | Same semantic/storage suite in browser host |
| Distributed fault tests | Validate consensus and movement | Event history, nemesis schedule, consistency checker |
| Backup/upgrade tests | Validate operational survival | Real artifacts restored or migrated in clean environments |

### 17.2 CPU/GPU differential discipline

Every GPU test should record:

- input generator seed;
- exact values and type profile;
- missing/null bitmaps;
- kernel and metadata version;
- adapter capability profile;
- workgroup and chunk configuration;
- CPU reference result;
- GPU candidate and verified result;
- tolerance rule where exact bits are not promised; and
- fallback behavior.

A mismatch must produce a compact replay artifact. Randomized testing without replayable inputs is not sufficient.

### 17.3 Crash testing

The write path should expose injectable fault points before and after WAL append, durability, memtable mutation, file creation, checksum completion, manifest publication, and acknowledgement. The recovery oracle compares only operations acknowledged under the selected write concern.

### 17.4 Distributed validation

Distributed correctness should be tested at two levels:

- Deterministic simulation or model checking for state-machine and protocol transitions.
- Process-level fault injection for storage, network, timing, and operational integration.

Jepsen-style histories validate externally promised behavior; they do not replace unit, simulation, or storage recovery tests.

## 18. Performance study design

### 18.1 What must be measured

Benchmarks should measure the full query path and its components:

```text
parse + plan
storage read
sidecar decode
host preparation
upload
queue wait
kernel
result download
CPU verification
row fetch
projection/sort
serialization
```

Throughput without tail latency, resource consumption, and durability settings is incomplete.

### 18.2 Workload dimensions

| Dimension | Required variations |
| --- | --- |
| Dataset scale | Fits cache, exceeds host memory, 1M/10M/100M rows where practical |
| Document shape | Flat, nested, sparse, mixed-type, arrays, large blobs |
| Predicate | Equality, range, bounded `$in`, bitmap combinations, vector distance |
| Selectivity | Near-zero, 0.1%, 1%, 10%, 50%, nearly all rows |
| Access path | Full scan, zone-map pruned, secondary index, hybrid index plus scan |
| Residency | Cold storage, warm host memory, GPU resident |
| Backend | Scalar CPU reference, optimized CPU/SIMD, WebGPU |
| Host | Browser and native capability profiles |
| Concurrency | Single query, CPU saturation, GPU queue contention, mixed reads/writes |
| Mutation | Static data, active ingest, compaction, sidecar rebuild |
| Result size | Count only, IDs, projection, full document fetch |

### 18.3 Experimental controls

Every published result should include hardware, OS/browser, runtime and driver versions, power mode, storage device, dataset generator, configuration, warm-up, run count, error bars or distribution, and raw output. GPU-resident and cold-transfer results must be labeled separately.

### 18.4 Success and pivot criteria

The GPU research path succeeds if supported workloads show a stable end-to-end crossover against an optimized CPU path and if the planner can predict it well enough to avoid frequent regressions. A fast isolated kernel is not sufficient.

If GPU wins only for rare or synthetic workloads, the architecture can pivot without discarding the database: keep sidecars for CPU analytics and expose GPU acceleration as an optional extension. If Wasm boundary cost dominates, the core may retain deterministic semantics while moving bulk physical operators into a native host module behind the same plan contract.

## 19. Build-versus-borrow analysis

“From scratch” should mean that HelixDB owns its semantics, durable formats, planner contracts, and product behavior. It should not mean replacing every mature primitive.

| Area | Recommended posture | Reason |
| --- | --- | --- |
| HDoc and semantic model | Build | Core differentiation and cross-platform contract |
| Query AST and planner | Build | Must integrate indexes, sidecars, CPU, GPU, and compatibility semantics |
| LSM integration | Build selectively | Sidecar/range integration is distinctive, but borrow proven low-level structures |
| Checksums and compression | Borrow mature implementations | Correctness and performance are not product differentiation |
| Encryption and TLS | Borrow audited implementations | Security-critical primitives should not be invented |
| WebGPU abstraction | Use wgpu/Dawn/browser APIs | Portability layer already exists |
| WGSL kernels | Build and audit | Workload-specific physical execution |
| Consensus | Prefer a mature, testable library or well-specified implementation | Consensus bugs are catastrophic and not the primary differentiator |
| Serialization for public protocols | Borrow where contracts fit | Reduce SDK and interoperability cost |
| MongoDB/Redis protocol parsing | Borrow cautiously | Parsing may be reusable; semantics still require HelixDB tests |
| Metrics and tracing export | Use standard ecosystems | Avoid proprietary operational dead ends |

Any borrowed library must be evaluated for deterministic behavior, Wasm support, license, format ownership, upgrade policy, and fault-injection hooks.

## 20. Recommended research and delivery program

### Stage A — Semantic laboratory

Deliverables:

- Type and comparison specification.
- Missing/null/array/numeric corpus.
- Minimal query AST and CPU interpreter.
- HDoc candidate encodings with golden vectors.

Exit evidence:

- Cross-language decoding agreement.
- Fuzzed round trips.
- Stable semantic hashes.
- Explicit unresolved format decisions.

### Stage B — Durable storage kernel

Deliverables:

- Host filesystem contract.
- WAL, memtable, one immutable row format, manifest generations.
- Primary-key operations and recovery.
- Fault-injection harness.

Exit evidence:

- Reproducible crash matrix.
- One million-document load/reopen/query workflow.
- Corruption diagnostics.
- No GPU or distribution dependency.

### Stage C — Columnar CPU engine

Deliverables:

- Field dictionary.
- Typed chunk format and watermarks.
- Zone maps and missing/null bitmaps.
- Optimized CPU predicate and bitmap operators.
- Sidecar delete/rebuild workflow.

Exit evidence:

- Complete results during sidecar lag.
- Identical row and column scan results.
- Measured write and storage amplification.

### Stage D — GPU proof

Deliverables:

- Capability profiles.
- Buffer manager.
- Initial exact kernels.
- Differential harness.
- End-to-end cost model and explain output.

Exit evidence:

- Reproducible cold, warm, and resident benchmarks.
- Correct device-loss fallback.
- Measured crossover against optimized CPU.
- Replay artifacts for randomized tests.

### Stage E — Portable embedded product

Deliverables:

- Native and browser hosts.
- OPFS plus IndexedDB fallback.
- TypeScript and Rust SDKs.
- Upgrade and quota behavior.

Exit evidence:

- Same semantic suite on both hosts.
- Browser lifecycle and quota tests.
- Fresh-consumer install examples.
- End-to-end backup/export appropriate to each host.

### Stage F — Hardened server

Deliverables:

- `helixd`, native protocol, auth, TLS, admin CLI.
- Online compaction, metrics, traces, backup/restore.
- Resource limits and stable error model.

Exit evidence:

- Clean install-to-restore proof.
- Load, soak, crash, upgrade, and security tests.
- Published compatibility and performance matrices.

### Stage G — Distribution

Deliverables:

- Replicated ranges, metadata group, router, snapshots.
- Range split and movement.
- Majority concerns and distributed query merge.

Exit evidence:

- Deterministic protocol tests.
- Three-node failure proof.
- Jepsen-style validation.
- Rolling upgrade and backup proof.

### Stage H — Cache, sync, and adapters

Deliverables:

- Explicit cache storage class, TTL, eviction.
- Read-only then writable local replicas.
- Redis-like and MongoDB-like adapters.

Exit evidence:

- No durable-data eviction path.
- Resume and duplicate-suppression proof.
- Conflict-policy tests.
- Executable compatibility matrices.

## 21. Experiment catalog

| ID | Hypothesis | Method | Decision signal |
| --- | --- | --- | --- |
| `EXP-001` | HDoc can preserve required types with fast field lookup. | Compare candidate layouts on representative documents and golden vectors. | Select layout only after semantics and corruption behavior pass. |
| `EXP-002` | Field IDs materially reduce row/sidecar overhead. | Measure size and lookup with raw names versus versioned IDs. | Retain dictionary only if gains justify coordination complexity. |
| `EXP-003` | Coarse Wasm host calls keep boundary overhead acceptable. | Compare copy, batch, and handle-based I/O on native/browser hosts. | Freeze host ABI after measured profiles. |
| `EXP-004` | Derived sidecars can lag without incomplete queries. | Inject writes during flush/rebuild and compare with row reference. | Require zero omitted visible rows. |
| `EXP-005` | CPU columnar scan beats row interpretation on target scans. | Benchmark same predicates and datasets. | Sidecars must justify write/storage amplification without GPU. |
| `EXP-006` | WebGPU numeric equality has a useful crossover. | Sweep rows, bytes, selectivity, residency, and adapter. | Establish per-profile crossover and variance. |
| `EXP-007` | Dictionary equality remains exact across versions. | Pin/mutate dictionaries and compare CPU/GPU outputs. | Exact status only if version enforcement is airtight. |
| `EXP-008` | Chunked dispatch enables bounded deadlines. | Cancel between varying chunk sizes under queue load. | Choose chunk size balancing overhead and responsiveness. |
| `EXP-009` | Device loss can transparently fall back. | Inject loss before upload, during dispatch, and before result use. | No partial results; stable reason and correct CPU result. |
| `EXP-010` | OPFS and fallback hosts satisfy the storage contract. | Run conformance, lifecycle, quota, and reopen tests. | Document unsupported durability or adjust host contract. |
| `EXP-011` | Compaction preserves snapshot and sidecar semantics. | Model-based histories with active snapshots and TTL. | Exact before/after logical-state equality. |
| `EXP-012` | Planner estimates predict backend winner. | Collect actual stage costs over workload grid. | GPU misselection rate below an agreed budget. |
| `EXP-013` | Basic MongoDB subset is semantically tractable. | Differential generated documents and queries. | Freeze a small green matrix before adding operators. |
| `EXP-014` | Three-node range survives one failure. | Fault leader/follower at every acknowledgement boundary. | No loss beyond declared write concern. |
| `EXP-015` | Range movement is retry-safe. | Concurrent workload plus failure at every protocol phase. | No lost/duplicated logical writes and correct epochs. |
| `EXP-016` | Local replica resume is duplicate-safe. | Replay overlapping change windows and crash checkpoints. | Identical final state across repeated resumes. |

### 21.1 `EXP-013` initial observation

`P01-021` now provides a reproducible first observation for `EXP-013` through the [`mongodb-6.0.5-initial-v1` harness](differential/mongodb/README.md). Six typed documents and 16 ordered query cases were executed through the independent native semantic oracle and a digest-pinned MongoDB Community Server 6.0.5 using a pinned `mongosh` 1.8.0 client. The report recorded 12 expected exact cases, four expected semantic differences, 14 direct translations, two proposed rewrites, zero failures, and zero skips.

The observation supports the architecture's “native semantics first” direction. `$all`, explicit `$elemMatch`, `$size`, explicit existence, one nested range, one projection, binary equality/order, and one finite cross-width numeric equality aligned over the selected documents. Direct scalar-on-array equality, nested whole-array equality, direct null equality, and order-insensitive native object equality did not align. The first and third differences can align in these fixtures through explicit element and existence rewrites; those rewrites still require applicability checks and adapter-level errors before they become product behavior.

The result is deliberately too small to close `EXP-013`. It uses a hand-selected query-only dataset and the semantic oracle rather than an implemented engine or adapter. It does not cover writes, errors, aggregation, indexes, collation, regex, cursors, transactions, wire behavior, or generated combinations. `P01-022` now freezes the first [versioned closed-world semantic/compatibility matrix](docs/compatibility/v1-semantic-compatibility-matrix.md), separating executable-reference, contract-only, excluded/deferred, experimental differential, and unsupported-adapter states. The experiment remains open until `P07-022` replays implemented query operators and `P22-008` completes generated adapter/protocol breadth.

## 22. Risk register

| Risk | Likelihood | Impact | Leading indicator | Primary mitigation |
| --- | --- | --- | --- | --- |
| Scope expansion | High | Critical | Several incomplete verticals, broad APIs without recovery proof | Enforce stage gates and v1 exclusions |
| GPU speedup does not survive end-to-end costs | Medium-high | High | Kernel wins but total query loses | Optimize CPU baseline, residency, pruning; preserve optionality |
| Query semantic drift | High | Critical | Backend or adapter disagreements | Semantic corpus and differential tests first |
| Custom LSM correctness defects | Medium-high | Critical | Recovery-only mismatches, index divergence | Narrow v1, fault injection, model-based tests |
| Sidecar write amplification | High | High | Ingest collapse or compaction backlog | Async batching, selective columns, measured policies |
| Wasm boundary overhead | Medium | High | Copies/host calls dominate profiles | Coarse APIs, buffer handles after measurement |
| Browser variability | High | High | Quota/lifecycle failures across environments | Capability profiles, conformance matrix, graceful fallback |
| GPU device heterogeneity | High | High | Kernels unavailable or numerically inconsistent | Versioned capability and exactness profiles |
| Distribution begins too early | Medium-high | Critical | Storage bugs reproduced across replicas | Block Phase 4 on single-node gates |
| Compatibility promise outgrows tests | High | High | “Mongo-compatible” without a green matrix | Versioned subset and explicit unsupported errors |
| Multi-tenant GPU leakage or starvation | Medium | Critical | Unbounded buffers/queue timing | Quotas, buffer hygiene, scheduler threat model |
| Upgrade format lock-in | Medium-high | Critical | Readers assume one unversioned layout | Version every durable artifact from first prototype |
| Offline conflict complexity | High | High | Ambiguous or non-idempotent queued writes | Read-only sync first, explicit conflict policy |
| Observability lag | Medium | High | Unexplained fallback or performance claims | Build explain/trace alongside planner |

## 23. Decision principles

When requirements conflict, the following order should guide decisions:

1. Correctness and recoverability.
2. Explicit semantic compatibility.
3. Portability and graceful degradation.
4. Operational explainability.
5. Predictable performance.
6. Peak benchmark performance.
7. Breadth of compatibility or deployment modes.

Practical consequences include:

- Do not weaken type semantics to fit one GPU.
- Do not acknowledge a write before its selected durability boundary.
- Do not make a sidecar authoritative to avoid a row fetch.
- Do not hide a CPU fallback to preserve a GPU marketing claim.
- Do not add consensus to compensate for an unstable local state machine.
- Do not expose compatibility syntax whose behavior is undefined.
- Do not freeze a public or persistent format without upgrade behavior.

## 24. Suggested initial repository architecture

The exact layout remains an implementation decision, but the following separation reflects the study's dependency order:

```text
crates/
  helix-doc/          HDoc, types, canonical semantics
  helix-query/        AST, normalization, logical plan, CPU reference
  helix-storage/      WAL, manifest, memtable, immutable files, MVCC
  helix-columnar/     field dictionary, chunks, zone maps, CPU operators
  helix-core/         portable orchestration and capability interfaces
  helix-host-native/  filesystem, scheduling, devices, server integration
  helix-gpu/          capability profiles, buffers, plans, kernel dispatch
  helix-server/       native API and process lifecycle

shaders/
  predicates/
  bitmaps/
  vectors/

packages/
  sdk-typescript/
  browser-host/

conformance/
  semantics/
  formats/
  host/
  compatibility/

benchmarks/
  datasets/
  cpu-columnar/
  webgpu/
  reports/

tests/
  crash/
  differential/
  browser/
  distributed/
```

The first executable vertical slice should touch only `helix-doc`, `helix-query`, a minimal host, and a benchmark/test harness. Empty future crates should not be mistaken for implemented architecture.

## 25. Recommended first vertical slice

The first end-to-end slice should answer one question: can the proposed representation and execution boundary produce correct, measurable value before the distributed and compatibility scope begins?

### Input

- One million generated flat and moderately nested documents.
- Required scalar edge cases, missing values, and nulls.
- Two indexed fields and two sidecar fields.
- One equality and one range predicate.

### Workflow

```text
generate semantic fixtures
  → encode HDoc
  → append durable local records
  → reopen after forced process termination
  → build typed chunks
  → execute optimized CPU scan
  → execute WebGPU scan when eligible
  → verify candidates against HDoc
  → print explain and benchmark artifacts
```

### Required outputs

- HDoc golden vectors and format version.
- Reproducible dataset manifest and seed.
- Crash-recovery report.
- CPU/GPU result hashes.
- Cold, warm-host, and GPU-resident timing breakdowns.
- Device capability profile.
- `explain()` output with selection or fallback reason.
- A browser-host smoke result using the same semantic fixtures.

### Decision at completion

Proceed to broader storage and GPU work only if correctness is stable and the cost breakdown identifies a plausible useful crossover. If not, preserve HDoc and CPU sidecars while revising the Wasm boundary, GPU representation, or product positioning.

## 26. Final conclusion

HelixDB's design is ambitious but not internally contradictory. Its success depends on preserving a small set of strong separations:

- canonical rows versus derived acceleration structures;
- logical semantics versus physical execution;
- deterministic Wasm core versus platform host;
- exact results versus GPU candidates;
- durable data versus evictable storage classes;
- native behavior versus compatibility adapters; and
- single-node proof versus distributed scale.

The GPU is neither the foundation nor a decorative feature. It is a testable optimization made possible by the sidecar architecture. The durable row engine, semantic corpus, CPU reference path, and recovery model remain the foundation.

The project should move forward as a sequence of falsifiable experiments and vertical product gates. The most valuable next step is not a broad server API or a Raft cluster. It is a reproducible single-node slice that proves HDoc semantics, crash recovery, typed sidecars, CPU correctness, GPU equivalence, and end-to-end cost accounting on real artifacts.

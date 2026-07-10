# HelixDB Product and Release Scope

- Status: Approved planning baseline
- Effective date: 2026-07-10
- Authority: [Specifications.md](../../Specifications.md)
- Execution ledger: [ImplementationPlan.md](../../ImplementationPlan.md)

This document freezes the implementation boundaries used to plan and evaluate releases. HelixDB/`helix-db` is the accepted development identity; public naming and package coordinates are re-evaluated under release-blocking task `P16-016`.

## Product definition

The product is one document database engine with shared data, query, MVCC, storage, and CPU semantics across deployment profiles. It is not four unrelated implementations presented under one API.

The long-term product comprises:

1. A portable, typed NoSQL document engine.
2. A durable single-node embedded and server product.
3. An adaptive CPU/WebGPU query engine over rebuildable typed sidecars.
4. A replicated and sharded distributed database.
5. Explicit cache, memory-only, and local-replica storage classes.
6. Tested MongoDB-like and Redis-like compatibility adapters.
7. Browser, native, mobile, edge, server, and managed-cloud operating profiles.

## v1 scope

v1 is a credible single-node release. It includes:

- The HDoc typed canonical document representation and versioned persistent formats.
- MongoDB-inspired JSON CRUD, a frozen query subset, projections, sorting, cursors, and the required aggregation subset.
- A custom LSM-like row store with WAL, memtables, immutable files, value logs, MVCC, crash recovery, compaction, and corruption diagnostics.
- Primary, scalar, compound, unique, TTL, columnar, and approved vector-index behavior required by the implementation plan.
- Typed columnar sidecars, optimized CPU scans, zone-map pruning, and rebuild guarantees.
- Optional WebGPU execution for supported workloads, with exact/candidate classification and complete CPU fallback.
- Native embedded, browser Wasm, native server, and the supported mobile/edge host profiles.
- OPFS browser storage with IndexedDB fallback.
- TypeScript and Rust embedded SDKs plus TypeScript, Rust, Go, and Python server SDKs.
- Authentication, authorization, encryption, sandboxing, observability, administration, backup, restore, and upgrade support appropriate to single-node deployments.
- Reproducible packaging, clean-consumer installation, compatibility matrices, and performance evidence.

v1 explicitly excludes:

- Replication, consensus, shard routing, range movement, and multi-region operation.
- Cross-shard transactions or distributed read/write concerns.
- General offline writable replicas and conflict resolution.
- Production MongoDB or Redis protocol compatibility claims beyond any separately marked experimental adapter.
- Arbitrary client-provided WGSL.
- A requirement for GPU hardware or GPU-resident data.
- Claims of full MongoDB, Redis, RocksDB, or wire-protocol compatibility.

File formats and APIs may reserve versioned fields for later ranges and replication, but v1 behavior must not depend on unimplemented distributed components.

## v2 scope

v2 builds on the released single-node state machine. It includes:

- Consensus-backed range replication and replicated metadata.
- Hash/range/tenant sharding, query routing, scatter/gather, range split, online movement, placement, and rebalancing.
- Majority/all write concerns and the supported distributed read concerns.
- Cross-range transactions and global snapshots where retained by the normative specification.
- Single-region, multi-availability-zone, read-replica, bounded-staleness, and explicitly scoped active-active policies.
- Durable, cache, local-replica, and memory-only storage classes with TTL and eviction.
- Resumable change streams, local replicas, offline queues, and explicit conflict policies.
- Tested MongoDB-like and Redis-like adapters and migration tools.
- Multi-tenant resource quotas, orchestration, autoscaling, and managed operational controls.

## Long-term ecosystem scope

The complete target also includes:

- Extended aggregation, collation, text search, and geospatial support described in the implementation plan.
- Java, C#, Swift, and Kotlin SDKs in addition to the core SDK set.
- Versioned Wasm UDF, trigger, plugin, and conflict-resolver facilities with capability isolation.
- Kubernetes or equivalent orchestration, object-storage cold tiering, managed control-plane APIs, and complete production release proof.

## Compatibility claim policy

The following terms have fixed meanings:

- **MongoDB-inspired query syntax** means HelixDB owns the semantics and uses familiar JSON shapes.
- **MongoDB-like adapter** means only the commands and behaviors marked green in a versioned executable compatibility matrix.
- **Redis-like adapter** means only the cache commands and behaviors marked green in a versioned executable compatibility matrix.
- **Compatible** must always name the tested subset, adapter version, upstream reference version, and known differences.

The project must not use “MongoDB-compatible,” “Redis-compatible,” “drop-in replacement,” or equivalent unqualified claims.

Unsupported commands, options, protocol versions, and semantic combinations must return explicit typed errors. They must not be accepted with approximate behavior.

The current [v1 semantic and compatibility matrix](../compatibility/v1-semantic-compatibility-matrix.md) is closed-world: it authorizes zero MongoDB adapter rows, treats exact differential fixtures as experimental evidence only, and classifies every unlisted MongoDB behavior as unsupported.

## Scope-change rule

A release-boundary change requires all of the following in one reviewed change:

1. An accepted architecture decision record explaining the motivation and consequences.
2. An update to `Specifications.md` when normative behavior changes.
3. An update to `Study.md` when feasibility conclusions or risks materially change.
4. An update to `ImplementationPlan.md`, including dependencies, checklist items, counts, and gates.
5. An update to the requirement traceability ledger and compatibility claim language.

No implementation convenience, benchmark result, or schedule pressure silently changes the approved scope.

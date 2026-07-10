# Requirement Traceability Ledger

- Status: Active
- Last updated: 2026-07-10
- Normative source: [Specifications.md](../../Specifications.md)
- Execution source: [ImplementationPlan.md](../../ImplementationPlan.md)

This ledger maps every stable specification requirement to planned implementation work and proof. It is updated when a task is completed, a requirement changes, or evidence is superseded.

## Status values

- `Planned`: mapped to implementation and proof, but not yet implemented.
- `In progress`: implementation has begun; the release evidence is incomplete.
- `Implemented`: code and focused tests exist; the governing phase gate is still open.
- `Verified`: the required evidence passed and the governing phase gate accepted it.
- `Deferred by ADR`: an accepted ADR moved the requirement to a named later release.
- `Not applicable by ADR`: an accepted scope change removed the requirement and updated the specification.

Only `Verified` satisfies a release gate. A pull request, code path, or passing unit test by itself does not justify that state.

## Architectural invariants

| Requirement | Summary | Implementation tasks | Planned tests and evidence | Status |
| --- | --- | --- | --- | --- |
| `INV-001` | HDoc rows are authoritative; indexes and sidecars are rebuildable. | `P03-*`, `P08-*`, `P09-*`, `P15-*` | Golden HDoc hashes, delete/rebuild proof, restore without derived files, `G03`, `G09`, `G15` | Planned |
| `INV-002` | CPU defines reference semantics; GPU returns exact results or verified candidates. | `P07-*`, `P09-*`, `P10-*`, `P24-003`–`P24-004` | Semantic corpus, CPU/column differential, CPU/GPU replay corpus, `G07`, `G09`, `G10` | Planned |
| `INV-003` | GPU is never required for correctness, durability, recovery, or availability. | `P10-016`, `P10-017`, `P10-026`, `P11-010`, `P16-005`, `P24-004` | GPU-disabled workflows, unsupported-device matrix, device-loss histories, `G10`, `G16` | Planned |
| `INV-004` | Deterministic logic stays in the Wasm core; ambient resources are host capabilities. | `P04-*`, `P13-013`, `P13-021`–`P13-024` | Host conformance, capability-denial, deterministic replay, ABI benchmarks, `G04`, `G13` | Planned |
| `INV-005` | Durable and evictable storage classes have explicit, separate policies. | `P20-001`–`P20-009`, `P24-007` | Storage-class transition matrix, eviction invariant, TTL histories, `G20` | Planned |
| `INV-006` | Clients cannot submit arbitrary WGSL; kernels are internal, bounded, and versioned. | `P10-004`, `P10-006`, `P10-015`, `P13-015`, `P24-010` | Shader registry/provenance, protocol rejection, resource tests, security review, `G10`, `G13` | Planned |
| `INV-007` | Persistent formats, commands, semantics, and protocols are versioned. | `P03-001`–`P03-007`, `P15-013`–`P15-017`, `P17-002`, `P24-002` | Golden versions, unknown-version rejection, migrations, rolling upgrades, `G15`, `G24` | Planned |
| `INV-008` | v1 is single-node; distribution is a later gated capability. | `P16-*`, `P17-*`, `P18-*`, `P19-*` | v1 unsupported-feature tests, published claim review, distributed gate evidence, `G16`–`G19` | Planned |
| `INV-009` | Every consistency/durability promise has a test oracle and failure gate. | `P06-*`, `P17-*`, `P19-*`, `P24-005`–`P24-006` | MVCC model histories, crash matrix, consensus simulation, Jepsen histories, `G06`, `G17`, `G19` | Planned |
| `INV-010` | Compatibility is limited to an explicit tested subset. | `P01-021`–`P01-022`, `P07-022`, `P22-*`, `P24-003`, `P24-012` | Executable matrices, differential reports, unsupported errors, claim audit, `G22`, `G24` | Planned |

## Platform and portable core

| Requirement | Summary | Implementation tasks | Planned tests and evidence | Status |
| --- | --- | --- | --- | --- |
| `PLAT-001` | Browser hosts feature-detect WebGPU and storage capabilities. | `P04-012`–`P04-013`, `P10-005`, `P11-005`–`P11-010` | Browser capability profiles, host matrix, fallback tests, `G11` | Planned |
| `PLAT-002` | Browser mode works without WebGPU and falls back from OPFS to IndexedDB. | `P11-005`–`P11-010`, `P11-013`–`P11-018`, `P24-003`–`P24-004` | OPFS/IndexedDB conformance, GPU-disabled browser proof, lifecycle/quota reports, `G11` | Planned |
| `PLAT-003` | Native hosts expose wgpu or Dawn behind the common abstraction. | `P10-001`–`P10-005`, `P10-024`–`P10-025` | GPU ADR, native capability profile, native/browser differential and benchmark reports, `G10` | Planned |
| `CORE-001` | The Wasm core owns deterministic codecs, semantics, MVCC, planning, metadata, and command application. | `P03-*`, `P04-001`–`P04-009`, `P06-*`, `P07-*`, `P17-004` | Core dependency audit, deterministic replay, cross-host conformance, `G04`, `G07`, `G17` | Planned |
| `CORE-002` | External resources reach the core only through explicit host interfaces. | `P01-005`, `P04-002`–`P04-014`, `P13-013` | Capability-denial tests, mock-host failure matrix, interface audit, `G04`, `G13` | In progress |
| `CORE-003` | Host optimization cannot change persistent or query semantics. | `P04-006`–`P04-017`, `P11-013`, `P12-012`, `P24-003` | Copy/handle equivalence, native/browser/server conformance, shared result hashes, `G04`, `G11`, `G12` | Planned |

## Data, query, and storage

| Requirement | Summary | Implementation tasks | Planned tests and evidence | Status |
| --- | --- | --- | --- | --- |
| `DATA-001` | Every document has `_id` and a canonical typed HDoc representation. | `P01-001`–`P01-011`, `P03-*`, `P05-013`, `P08-002` | Semantic fixtures, golden HDoc vectors, ID collision tests, `G01`, `G03`, `G08` | In progress |
| `DATA-002` | Missing and null stay distinct through every storage and query layer. | `P01-002`, `P01-019`, `P03-*`, `P07-*`, `P08-*`, `P09-*`, `P10-*` | Cross-layer semantic corpus, index/row/column/GPU differential hashes, `G07`–`G10` | In progress |
| `DATA-003` | Path-dictionary and persistent-format changes are versioned and recoverable. | `P03-013`–`P03-019`, `P15-013`–`P15-017`, `P24-002`, `P24-009` | Dictionary golden versions, migration interruption, rebuild/restore proof, `G03`, `G15` | Planned |
| `QUERY-001` | One normalized semantic definition is shared by APIs and backends. | `P01-*`, `P07-*`, `P09-*`, `P10-*`, `P12-012`, `P22-*` | Semantic oracle, protocol/SDK/backend differential suites, `G07`, `G10`, `G12`, `G22` | In progress |
| `QUERY-002` | Unsupported behavior fails explicitly and is never silently reinterpreted. | `P01-016`, `P07-002`, `P07-018`, `P12-009`, `P22-006`, `P22-012`, `P24-012` | Unsupported matrix, typed-error fixtures, adapter protocol tests, claim audit | Planned |
| `QUERY-003` | `explain()` reports indexes, CPU/GPU stages, fallback, verification, and material statistics. | `P07-019`, `P08-010`, `P08-019`, `P09-017`, `P10-021`, `P14-008` | Versioned explain fixtures, planner reason tests, operator exercise, `G14` | Planned |
| `STORE-001` | Acknowledged writes meet their selected failure/durability promise. | `P05-005`, `P05-019`–`P05-023`, `P06-011`–`P06-017`, `P17-008`, `P24-005` | Fault-point matrix, recovered hashes, concern histories, `G05`, `G06`, `G17` | Planned |
| `STORE-002` | Replay, flush, compaction, and derived rebuilds are idempotent or resumable. | `P05-006`–`P05-021`, `P08-011`–`P08-015`, `P09-008`–`P09-012`, `P15-016`–`P15-017` | Crash/replay histories, orphan cleanup, build resume, migration interruption, `G05`, `G08`, `G09`, `G15` | Planned |
| `STORE-003` | Compaction preserves snapshots and cannot evict durable live data. | `P06-004`, `P06-013`, `P08-014`, `P09-012`, `P20-003`–`P20-009` | Model-based snapshot/TTL histories, eviction invariant, `EXP-011`, `G09`, `G20` | Planned |

## GPU execution

| Requirement | Summary | Implementation tasks | Planned tests and evidence | Status |
| --- | --- | --- | --- | --- |
| `GPU-001` | GPU selection includes all preparation, transfer, queue, and materialization costs. | `P10-019`–`P10-025`, `P14-003`, `P16-007`–`P16-008` | Cold/warm/resident raw benchmarks, calibration/misselection report, `EXP-006`, `EXP-012`, `G10` | Planned |
| `GPU-002` | Every kernel has CPU reference, property, edge, and differential tests. | `P07-017`, `P09-013`–`P09-014`, `P10-009`–`P10-014`, `P10-022`, `P10-030` | Kernel replay corpus and result hashes for every capability profile, `G10` | Planned |
| `GPU-003` | Non-exact kernels return candidates that receive CPU verification. | `P10-011`–`P10-014`, `P10-021`–`P10-023` | Candidate/selectivity fixtures, verified result hashes, explain exactness evidence | Planned |
| `GPU-004` | GPU failures cause bounded fallback or typed error, never process crash. | `P10-015`–`P10-017`, `P10-023`, `P11-010`, `P16-005`, `P24-004` | Device-loss/OOM/deadline/quota histories, GPU-disabled workflow, `EXP-008`, `EXP-009` | Planned |
| `GPU-005` | GPU resources are quota-controlled per device, query, and tenant. | `P10-007`, `P10-015`, `P10-018`, `P13-016`, `P23-002`–`P23-003` | Quota/admission/fairness/isolation tests, security review, managed noisy-neighbor report | Planned |

## Distribution, cache, and synchronization

| Requirement | Summary | Implementation tasks | Planned tests and evidence | Status |
| --- | --- | --- | --- | --- |
| `DIST-001` | Every range has an epoch, authoritative replicas, leader, and ordered consensus stream. | `P17-002`–`P17-014`, `P18-002`, `P24-006` | Consensus simulations, three-node histories, descriptor validation, `EXP-014`, `G17` | Planned |
| `DIST-002` | Splits and moves preserve acknowledged writes, snapshots, and router retry safety. | `P18-005`, `P18-011`–`P18-020`, `P24-006` | Epoch assertions, concurrent split/move histories, `EXP-015`, `G18` | Planned |
| `DIST-003` | Distributed plans push work down and merge global sort/limit correctly. | `P18-006`–`P18-010`, `P24-003`, `P24-006` | Single-node/distributed differential results, partial aggregation and explain fixtures, `G18` | Planned |
| `CACHE-001` | Only explicitly evictable storage classes can be evicted. | `P20-001`–`P20-009`, `P24-007` | Storage-class transition corpus, durable-data eviction invariant, `G20` | Planned |
| `CACHE-002` | TTL is consistent across reads, indexes, compaction, replication, backup, and restore. | `P01-005`, `P06-014`, `P08-006`, `P20-003`–`P20-013`, `P24-007`–`P24-008` | TTL model histories across clocks/restart/restore/replication, `G20`, `G24` | In progress |
| `SYNC-001` | Local sync persists resumable progress and requires an explicit conflict policy for offline writes. | `P21-001`–`P21-015`, `P24-007` | Bootstrap/resume histories, conflict corpus, offline workflow, `G21` | Planned |
| `SYNC-002` | Change-stream and offline-queue replay are duplicate-safe. | `P21-002`, `P21-005`–`P21-011`, `P21-018`–`P21-019` | Overlap/crash/replay final-state hashes, `EXP-016`, `G21` | Planned |

## Security, operations, and quality

| Requirement | Summary | Implementation tasks | Planned tests and evidence | Status |
| --- | --- | --- | --- | --- |
| `SEC-001` | External and node operations are authenticated, authorized, encrypted, and auditable. | `P13-001`–`P13-008`, `P13-017`–`P13-020`, `P17-014`, `P23-010`, `P24-010` | Authn/authz/mTLS/audit corpus, independent review, cluster security proof, `G13`, `G23` | Planned |
| `SEC-002` | Tenant data and resources respect isolation and quotas across storage, GPU, telemetry, and administration. | `P10-018`, `P13-007`–`P13-017`, `P23-001`–`P23-003`, `P23-016`–`P23-018` | Cross-tenant denial/leak/fairness tests, GPU hygiene, noisy-neighbor report, independent review | Planned |
| `OPS-001` | Production releases expose health, metrics, logs, traces, backup/restore, and explain evidence. | `P12-007`, `P14-*`, `P15-*`, `P16-012`, `P23-014`–`P23-015` | Metric/log/trace schemas, diagnostic bundle, dashboards, operator exercise, `G14` | Planned |
| `OPS-002` | Restore procedures are tested from real produced artifacts. | `P15-001`–`P15-019`, `P16-009`, `P23-011`, `P24-008` | Clean full/incremental/PITR/browser restores, DR drills, artifact hashes, `G15`, `G24` | Planned |
| `QUAL-001` | CPU/GPU equivalence, crash recovery, index consistency, and backup/restore block release. | `P16-003`–`P16-015`, `P24-003`–`P24-009` | Full release reports and independent gate review, `G16`, `G24` | Planned |
| `QUAL-002` | Distributed consistency requires fault injection and Jepsen-style validation. | `P17-016`–`P17-018`, `P18-019`–`P18-020`, `P19-013`–`P19-014`, `P24-006` | Simulation, process chaos, movement histories, Jepsen reports, `G17`–`G19` | Planned |
| `COMPAT-001` | Every compatibility claim is versioned and backed by executable tests. | `P01-021`–`P01-022`, `P07-022`, `P22-*`, `P24-003`, `P24-012` | MongoDB/Redis matrices, differential/protocol captures, migration hashes, claim review, `G22` | Planned |

## Update procedure

When a task changes status:

1. Add the focused test or implementation evidence to this row.
2. Move `Planned` to `In progress` when implementation begins.
3. Move to `Implemented` only after focused proof passes.
4. Move to `Verified` only when the named gate accepts the complete requirement evidence.
5. Link any ADR that changes scope, semantics, compatibility, or the evidence obligation.

The ledger must contain exactly the same stable requirement-ID set as `Specifications.md`. CI will eventually enforce set equality and valid plan-task references.

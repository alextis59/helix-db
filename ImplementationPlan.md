# HelixDB Complete Implementation Plan

- Status: Active planning baseline
- Last updated: 2026-07-10
- Scope: Complete implementation from repository bootstrap through production distributed release
- Normative source: [Specifications.md](Specifications.md)
- Design analysis: [Study.md](Study.md)
- Source transcript: [ChatGPT shared-session transcript](docs/chatgpt-database-system-with-webgpu-transcript.md)

## Purpose and completion standard

This file is the implementation progress authority for HelixDB. It converts the specifications and study into dependency-ordered, checklisted work. A checked item means the implementation and its required proof exist in the repository or a durable linked artifact; it does not mean that code was merely drafted.

The project is completely implemented only when every applicable checklist item and the final gate `G24` are checked. Items may be declared not applicable only through an accepted architecture decision record that updates the specification, this plan, and the requirement traceability matrix.

## How to use this checklist

- Keep task IDs stable. If work is removed or replaced, record the decision instead of silently renumbering later items.
- Check an item only after its code, tests, documentation, and evidence are complete.
- Record evidence in the relevant phase evidence index, including commands, results, artifact paths, benchmark environment, and commit or pull-request identifiers.
- Close a phase gate only after every required item in that phase is checked and all gate evidence has been independently reviewed.
- If work exposes a new requirement, add a new unchecked item in the correct phase before implementing it.
- Update the progress snapshot whenever checkboxes change.
- Preserve CPU correctness, recovery, and graceful fallback as release blockers; performance alone cannot close a gate.

Useful progress commands:

```bash
rg -n '^\s*- \[ \]' ImplementationPlan.md
rg -n '^\s*- \[x\]' ImplementationPlan.md
rg -n '^\s*- \[[ x]\] \*\*[GP][0-9]{2}' ImplementationPlan.md
```

## Progress snapshot

- Completed checklist items: 25
- Open checklist items: 497
- Total checklist items: 522
- Current phase: Phase 1 — Semantic contract and compatibility corpus
- Next release gate: `G01` (`G02` may proceed in parallel)

| Phase | Deliverable | Release track | Status |
| --- | --- | --- | --- |
| 0 | Governance and project baseline | Foundation | Completed |
| 1 | Semantic contract and compatibility corpus | Foundation | In progress |
| 2 | Workspace, toolchain, and CI | Foundation | Not started |
| 3 | HDoc format and codec | Research prototype | Not started |
| 4 | Wasm core and host capability ABI | Research prototype | Not started |
| 5 | Single-node storage foundation | v1 | Not started |
| 6 | MVCC, transactions, and sessions | v1 | Not started |
| 7 | Query language and CPU reference engine | v1 | Not started |
| 8 | Primary and secondary indexing | v1 | Not started |
| 9 | Columnar sidecars and CPU scan engine | v1 | Not started |
| 10 | WebGPU execution engine | v1 | Not started |
| 11 | Embedded native and browser products | v1 | Not started |
| 12 | Server runtime, protocol, and core SDKs | v1 | Not started |
| 13 | Security and isolation | v1/v2 | Not started |
| 14 | Observability and administration | v1 | Not started |
| 15 | Backup, restore, formats, and upgrades | v1/v2 | Not started |
| 16 | Single-node v1 hardening and release | v1 gate | Not started |
| 17 | Distributed replication foundation | v2 | Not started |
| 18 | Sharding, routing, movement, and autoscaling | v2 | Not started |
| 19 | Distributed transactions and multi-region policies | v2 | Not started |
| 20 | Cache and ephemeral storage classes | v2 | Not started |
| 21 | Local replicas and offline synchronization | v2 | Not started |
| 22 | Compatibility adapters, migration, and SDK expansion | v2/ecosystem | Not started |
| 23 | Multi-tenancy, orchestration, and managed operations | Production cloud | Not started |
| 24 | Complete-product validation and release | Final gate | Not started |

## Dependency map

```text
P00 governance
 ├─→ P01 semantics ─→ P03 HDoc ─→ P05 storage ─→ P06 MVCC
 └─→ P02 toolchain ─→ P04 host ABI ────────────────┘

P06 + P01 ─→ P07 CPU query ─→ P08 indexes ─→ P09 sidecars ─→ P10 GPU
P04 + P05 + P07 + P09 + P10 ─→ P11 embedded/browser
P05 + P07 ─→ P12 server
P11 + P12 + P13 + P14 + P15 ─→ P16 v1

P16 ─→ P17 replication ─→ P18 sharding ─→ P19 distributed transactions
P16 ─→ P20 cache ─→ P21 local sync
P12 + P20 + P21 ─→ P22 adapters and ecosystem
P18 + P13 + P14 + P15 ─→ P23 managed operations
P19 + P21 + P22 + P23 ─→ P24 final validation
```

## Requirement and experiment coverage

| Specification family | Primary implementation phases |
| --- | --- |
| `INV-*` | All phases and gates |
| `PLAT-*` | 2, 4, 10, 11 |
| `CORE-*` | 3, 4, 5, 7 |
| `DATA-*` | 1, 3, 6, 9 |
| `QUERY-*` | 1, 7, 8, 9, 10, 14 |
| `STORE-*` | 5, 6, 8, 9, 15 |
| `GPU-*` | 10, 13, 14, 16 |
| `DIST-*` | 17, 18, 19, 24 |
| `CACHE-*` | 20, 22 |
| `SYNC-*` | 21, 22 |
| `SEC-*` | 13, 17, 23, 24 |
| `OPS-*` | 12, 14, 15, 23 |
| `QUAL-*` | Every gate, especially 16 and 24 |
| `COMPAT-*` | 1, 7, 22, 24 |

| Study experiments | Owning phases |
| --- | --- |
| `EXP-001`, `EXP-002` | 3 |
| `EXP-003` | 4 |
| `EXP-004`, `EXP-005`, `EXP-011` | 9 |
| `EXP-006`, `EXP-007`, `EXP-008`, `EXP-009`, `EXP-012` | 10 |
| `EXP-010` | 11 |
| `EXP-013` | 22 |
| `EXP-014` | 17 |
| `EXP-015` | 18 |
| `EXP-016` | 21 |

---

## Phase 0 — Governance and project baseline

Objective: establish authoritative scope, decision processes, evidence rules, and repository conventions before implementation branches diverge.

- [x] **P00-001** Archive the source ChatGPT session as a turn-accurate Markdown transcript.
- [x] **P00-002** Publish the detailed normative project specification.
- [x] **P00-003** Publish the technical and feasibility study with experiments and risks.
- [x] **P00-004** Establish this complete implementation checklist with stable task IDs and gates.
- [x] **P00-005** Approve the HelixDB product name, repository identity, and terminology used by formats, crates, packages, binaries, and protocols.
- [x] **P00-006** Approve v1, v2, and long-term scope boundaries, including explicit non-goals and compatibility claim language.
- [x] **P00-007** Designate `Specifications.md` as normative and document how accepted changes update specifications, study conclusions, and this plan.
- [x] **P00-008** Create an architecture-decision-record template and index covering context, options, decision, consequences, compatibility, and rollback.
- [x] **P00-009** Assign owners and deadlines for every open architecture decision in Specification section 28.
- [x] **P00-010** Create a requirement traceability ledger mapping every `INV-*`, `PLAT-*`, `CORE-*`, `DATA-*`, `QUERY-*`, `STORE-*`, `GPU-*`, `DIST-*`, `CACHE-*`, `SYNC-*`, `SEC-*`, `OPS-*`, `QUAL-*`, and `COMPAT-*` item to tests and artifacts.
- [x] **P00-011** Define the repository contribution workflow, review requirements, branch policy, release approval policy, and ownership boundaries.
- [x] **P00-012** Define evidence-retention conventions for test reports, benchmark reports, format fixtures, crash histories, compatibility matrices, and release proofs.
- [x] **P00-013** Define severity levels and stop-ship rules for correctness, data loss, security, compatibility, and performance regressions.
- [x] **P00-014** Define a documentation structure for architecture, formats, APIs, operations, security, testing, compatibility, and release notes.
- [x] **P00-015** Review the existing license and document third-party dependency, shader, benchmark-data, and generated-code licensing rules.
- [x] **P00-016** Create initial threat-model, performance-claim, and compatibility-claim templates.
- [x] **P00-017** Record a policy that persistent formats and public protocols are versioned from their first committed fixture.
- [x] **G00** Close the governance gate after scope, ownership, change control, evidence policy, and requirement traceability are approved.

Evidence required for `G00`: accepted scope record, ADR index, requirement ledger, ownership map, and review of all source-document links.

## Phase 1 — Semantic contract and compatibility corpus

Objective: define observable document and query behavior before encoding, indexing, GPU lowering, or compatibility adapters freeze accidental semantics.

Dependencies: `G00`.

- [x] **P01-001** Specify the complete value model for null, Boolean, signed integers, floating point, decimal, string, binary, object, array, timestamp, date, UUID, ObjectId, and vectors.
- [x] **P01-002** Define missing-field versus explicit-null behavior for reads, comparisons, sorting, projection, indexes, aggregation, and updates.
- [x] **P01-003** Define integer width, coercion, overflow, underflow, decimal promotion, and mixed numeric comparison rules.
- [x] **P01-004** Define floating-point NaN, infinities, negative zero, equality, ordering, hashing, aggregation, and CPU/GPU tolerance rules.
- [x] **P01-005** Define timestamp precision, time-zone normalization, date conversion, logical expiry time, and clock-source requirements.
- [x] **P01-006** Define string byte representation, Unicode validation, normalization, binary ordering, and v1 collation scope.
- [x] **P01-007** Define object field ordering, canonical hashing, duplicate-key rejection, and import-only duplicate behavior.
- [ ] **P01-008** Define array equality, ordering, path traversal, `$all`, `$size`, `$elemMatch`, and nested-array semantics.
- [ ] **P01-009** Define `_id` accepted types, automatic generation, immutability, ordering, and collision handling.
- [ ] **P01-010** Define vector dimension, element type, normalization, distance metric, invalid-value, and tolerance semantics.
- [ ] **P01-011** Set document-size, nesting-depth, field-count, field-name, path-length, array-length, vector-dimension, and command-size limits.
- [ ] **P01-012** Specify v1 comparison, logical, element/type, array, string, cache/time, and vector operator truth tables.
- [ ] **P01-013** Specify insert, replace, update, upsert, delete, projection, sort, limit, skip, and cursor semantics.
- [ ] **P01-014** Specify `$set`, `$unset`, `$inc`, array mutation, conflict, path-creation, and atomicity behavior for supported updates.
- [ ] **P01-015** Specify v1 aggregation behavior for `$match`, `$project`, `$sort`, `$limit`, `$skip`, `$count`, `$group`, and `$unwind`.
- [ ] **P01-016** Define stable error categories for parse, validation, type, conflict, uniqueness, authorization, capability, quota, deadline, durability, and internal failures.
- [ ] **P01-017** Define deterministic result ordering where no explicit sort is supplied and document when order is intentionally unspecified.
- [ ] **P01-018** Design a language-neutral semantic-fixture schema with input documents, commands, expected values, expected ordering, and expected errors.
- [ ] **P01-019** Populate fixtures for all scalar edge cases, missing/null combinations, arrays, nested paths, invalid commands, and limit boundaries.
- [ ] **P01-020** Build a reference semantic interpreter or executable oracle independent of optimized physical operators.
- [ ] **P01-021** Build the initial MongoDB differential harness for the declared overlapping semantic subset.
- [ ] **P01-022** Publish a versioned v1 semantic and compatibility matrix with every unsupported behavior explicit.
- [ ] **G01** Close the semantic gate after fixtures and the reference oracle agree, open semantic decisions are resolved, and the v1 subset is frozen.

Evidence required for `G01`: semantic corpus, oracle results, differential report, compatibility matrix, and ADRs for numeric, string, array, time, and identifier behavior.

## Phase 2 — Workspace, toolchain, and continuous integration

Objective: create reproducible native, Wasm, browser, shader, test, benchmark, and release workflows before feature code accumulates.

Dependencies: `G00`; may proceed in parallel with Phase 1.

- [ ] **P02-001** Create the Rust workspace and initial crate boundaries consistent with the study's proposed dependency direction.
- [ ] **P02-002** Select and pin the Rust toolchain, minimum supported version, Wasm targets, formatter, linter, and documentation tools.
- [ ] **P02-003** Select the JavaScript/TypeScript package manager, lockfile policy, Node.js support window, bundler, test runner, and browser harness.
- [ ] **P02-004** Create directories for crates, shaders, packages, conformance fixtures, benchmarks, tests, documentation, examples, and release evidence.
- [ ] **P02-005** Configure native debug, native release, Wasm, browser, sanitizer, coverage, and benchmark build profiles.
- [ ] **P02-006** Configure strict formatting, linting, warnings, unsafe-code review, dependency-policy, and license checks.
- [ ] **P02-007** Add unit, integration, conformance, fuzz, browser, crash, benchmark, and distributed-test commands with stable names.
- [ ] **P02-008** Establish deterministic fixture generation with committed seeds and artifact schemas.
- [ ] **P02-009** Add CI for supported operating systems, architectures, Rust targets, Node versions, and browser engines.
- [ ] **P02-010** Add Wasm component validation and browser bundle smoke tests to CI.
- [ ] **P02-011** Add WGSL parsing or validation and shader-fixture compilation to CI before GPU runtime work.
- [ ] **P02-012** Configure dependency vulnerability, provenance, license, and duplicate-version reporting.
- [ ] **P02-013** Add code coverage reporting with explicit exclusions and minimum thresholds for semantic and recovery-critical modules.
- [ ] **P02-014** Add benchmark result schemas and a non-gating baseline job that preserves raw results.
- [ ] **P02-015** Add artifact retention for golden formats, test replays, crash matrices, browser reports, and packaged releases.
- [ ] **P02-016** Create minimal native and browser examples that prove the toolchain without implying database functionality.
- [ ] **P02-017** Document clean-machine bootstrap, development commands, and troubleshooting.
- [ ] **G02** Close the toolchain gate after a clean checkout builds and tests native and browser skeletons using only documented commands.

Evidence required for `G02`: clean-machine transcript, CI matrix, dependency report, Wasm/browser smoke artifacts, and reproducible command list.

## Phase 3 — HDoc format, codec, and path dictionary

Objective: implement the canonical typed row representation and its evolution rules. Covers `DATA-*`, `INV-001`, `INV-007`, `EXP-001`, and `EXP-002`.

Dependencies: `G01`, `G02`.

- [ ] **P03-001** Write the HDoc format ADR covering endianness, alignment, offsets, maximum sizes, canonicalization, checksum, hash, and extension strategy.
- [ ] **P03-002** Define the HDoc header, flags, format version, total length, field count, checksum, body sections, and footer.
- [ ] **P03-003** Assign stable type tags for every required value type and reserve extension ranges.
- [ ] **P03-004** Define canonical encodings for integers, floats, decimals, timestamps, dates, UUIDs, ObjectIds, binary values, and vectors.
- [ ] **P03-005** Define field-table entries, name storage, nested object/array tables, value offsets, and length encodings.
- [ ] **P03-006** Define canonical document hashing and checksum coverage, including corruption versus semantic-hash behavior.
- [ ] **P03-007** Define optional compression blocks, supported algorithms, block boundaries, and unknown-codec rejection.
- [ ] **P03-008** Implement a safe HDoc encoder with limit enforcement and deterministic output.
- [ ] **P03-009** Implement a validating HDoc decoder that rejects unknown required features, invalid offsets, overlap, truncation, and checksum failure.
- [ ] **P03-010** Implement owned document values and borrowed read-only views without changing semantics.
- [ ] **P03-011** Implement fast field and nested-path lookup over raw HDoc views.
- [ ] **P03-012** Implement canonical JSON-like rendering and import conversion for debugging and SDK boundaries.
- [ ] **P03-013** Implement the collection field-path dictionary format, monotonic IDs, versions, and non-reuse rule.
- [ ] **P03-014** Implement path registration, resolution, dictionary snapshots, and version pinning.
- [ ] **P03-015** Define and implement HDoc feature negotiation and migration hooks without committing an unsupported compatibility window.
- [ ] **P03-016** Commit golden vectors covering every type, nesting pattern, boundary, invalid encoding, and format version.
- [ ] **P03-017** Add cross-language golden-vector readers for Rust and TypeScript.
- [ ] **P03-018** Add round-trip, canonicalization, malformed-input, property, and mutation tests.
- [ ] **P03-019** Add coverage-guided fuzzing for encoder, decoder, path lookup, rendering, and migration entry points.
- [ ] **P03-020** Benchmark encoding, decoding, field lookup, document size, and dictionary savings across representative shapes.
- [ ] **P03-021** Complete `EXP-001` and `EXP-002`, publish raw results, and record the selected format/dictionary decisions.
- [ ] **G03** Close the HDoc gate after golden vectors freeze HDoc v1, independent readers agree, fuzzing finds no open critical issue, and migration rejection is tested.

Evidence required for `G03`: format document, ADR, golden vector hashes, cross-language results, fuzz corpus, benchmark report, and corruption diagnostics.

## Phase 4 — Portable Wasm core and host capability ABI

Objective: implement the deterministic core boundary and coarse-grained native/browser host interfaces. Covers `CORE-*`, `PLAT-*`, `INV-004`, and `EXP-003`.

Dependencies: `G02`, enough of `G03` to expose the codec.

- [ ] **P04-001** Define the Wasm component interface and ABI versioning rules for values, buffers, handles, errors, cancellation, and capabilities.
- [ ] **P04-002** Separate deterministic core modules from all ambient file, network, time, randomness, thread, and device access.
- [ ] **P04-003** Define host capability interfaces for files, directory operations, durability, locks, timers, randomness, scheduling, metrics, and secrets.
- [ ] **P04-004** Define coarse-grained asynchronous read, write, sync, rename, list, and delete operations suitable for storage batches.
- [ ] **P04-005** Define immutable buffer, mutable staging buffer, and opaque-handle lifecycles across the Wasm boundary.
- [ ] **P04-006** Implement explicit-copy buffer transport as the correctness baseline.
- [ ] **P04-007** Prototype host-owned handle and shared-staging alternatives without making them required ABI features.
- [ ] **P04-008** Define cancellation, deadline, backpressure, partial-I/O, and host-shutdown behavior.
- [ ] **P04-009** Define deterministic injection of clocks, random IDs, memory budgets, and device profiles.
- [ ] **P04-010** Implement a mock host supporting deterministic failure injection for every capability call.
- [ ] **P04-011** Implement the native Wasmtime host skeleton and capability allowlist.
- [ ] **P04-012** Implement the browser host skeleton and JavaScript/TypeScript binding layer.
- [ ] **P04-013** Add ABI conformance tests shared by mock, native, and browser hosts.
- [ ] **P04-014** Add tests proving the core cannot reach ungranted files, sockets, clocks, or devices.
- [ ] **P04-015** Add tracing around boundary calls and buffer copies without logging document contents.
- [ ] **P04-016** Benchmark chatty calls, batched copies, opaque handles, and staging strategies on native and browser hosts.
- [ ] **P04-017** Complete `EXP-003`, select the initial transport, and record thresholds for revisiting it.
- [ ] **G04** Close the host-ABI gate after both hosts pass conformance, determinism and capability isolation are proven, and boundary costs are measured.

Evidence required for `G04`: versioned interface definition, host conformance matrix, capability-denial tests, benchmark report, and ABI ADR.

## Phase 5 — Single-node storage foundation

Objective: implement a crash-safe local row store with WAL, memtables, immutable files, value logs, manifests, caches, and fault injection. Covers `STORE-001`, `STORE-002`, and the v1 storage foundation.

Dependencies: `G03`, `G04`.

- [ ] **P05-001** Finalize the single-node data-directory layout, file naming, permissions, locking, temporary-file, and orphan-cleanup rules.
- [ ] **P05-002** Define versioned internal key encoding for tenant, database, collection, range placeholder, key kind, user key, and MVCC version.
- [ ] **P05-003** Define the MANIFEST and OPTIONS formats, generations, atomic publication, checksums, and recovery selection.
- [ ] **P05-004** Define WAL record framing, transaction grouping, sequence numbers, checksums, rotation, truncation, and replay rules.
- [ ] **P05-005** Implement WAL append, batching, sync policies, write concerns, rotation, and typed I/O failures.
- [ ] **P05-006** Implement deterministic WAL replay, duplicate suppression, tail truncation handling, and corruption diagnostics.
- [ ] **P05-007** Implement the mutable memtable, immutable memtable queue, sequence ordering, memory accounting, and flush triggers.
- [ ] **P05-008** Define and implement the SST block, index, metadata, checksum, compression, and footer formats.
- [ ] **P05-009** Implement SST writing through temporary output and atomic manifest publication.
- [ ] **P05-010** Implement SST readers, block indexes, bloom filters, iterators, range scans, and corruption handling.
- [ ] **P05-011** Define and implement VLOG storage for large HDoc values, references, checksums, and garbage-collection metadata.
- [ ] **P05-012** Implement a bounded block/value cache with accounting, eviction, pinning, and shutdown behavior.
- [ ] **P05-013** Implement primary-key put, get, replace, and delete over WAL, memtable, SST, and VLOG.
- [ ] **P05-014** Implement database open, close, clean shutdown, dirty recovery, exclusive writer locking, and read-only diagnostics mode.
- [ ] **P05-015** Implement background flush scheduling, backpressure, memory limits, disk-space checks, and foreground fairness.
- [ ] **P05-016** Implement initial leveled or size-tiered compaction policy behind an explicit ADR.
- [ ] **P05-017** Implement compaction output validation, manifest swap, obsolete-file retirement, interruption cleanup, and resume safety.
- [ ] **P05-018** Implement checksum verification, scrub, and inspect commands for every v1 storage artifact.
- [ ] **P05-019** Add injectable faults before and after WAL write, sync, memtable apply, file write, checksum, rename, manifest publish, and acknowledgement.
- [ ] **P05-020** Build a model-based storage test comparing generated operation histories with a reference map.
- [ ] **P05-021** Build crash/reopen tests for every acknowledgement boundary and corrupted/truncated artifact class.
- [ ] **P05-022** Benchmark point reads, writes, batches, reopen, flush, compaction, amplification, and cache behavior.
- [ ] **P05-023** Prove a one-million-document load, forced termination, reopen, and primary-key verification workflow.
- [ ] **G05** Close the storage gate after crash histories preserve every promised acknowledged write, corruption is diagnosed, and the million-document workflow is reproducible.

Evidence required for `G05`: format fixtures, fault matrix, recovered-state hashes, amplification report, benchmark environment, and clean-machine replay commands.

## Phase 6 — MVCC, transactions, sessions, and consistency

Objective: add version visibility and the v1 transaction/concern model without distribution assumptions. Covers `DATA-*`, `STORE-001`, `STORE-003`, and Specification section 16.

Dependencies: `G05`, `G01`.

- [ ] **P06-001** Define the single-node timestamp/version oracle, persistence, monotonicity, restart behavior, and exhaustion limits.
- [ ] **P06-002** Add created timestamp, optional deleted timestamp, transaction ID, write epoch, and sequence metadata to internal versions.
- [ ] **P06-003** Implement MVCC visibility for latest, local committed, durable, and snapshot reads.
- [ ] **P06-004** Implement snapshot acquisition, pinning, release, timeout, and minimum-retained-version accounting.
- [ ] **P06-005** Implement tombstones and logical delete without exposing obsolete or future versions.
- [ ] **P06-006** Implement atomic single-document insert, replace, update, upsert, and delete.
- [ ] **P06-007** Implement atomic batch writes within the single local range and define batch size/resource limits.
- [ ] **P06-008** Implement write-conflict detection and deterministic retryable versus terminal errors.
- [ ] **P06-009** Implement idempotency keys and retryable-write records across client reconnect and process restart.
- [ ] **P06-010** Implement sessions with read-your-writes, monotonic-read tokens, and last-seen transaction state.
- [ ] **P06-011** Implement `ack` and `durable` write concerns with exact acknowledgement boundaries.
- [ ] **P06-012** Reserve and reject unsupported `majority`, `all`, and `linearizable` concerns before distribution is enabled.
- [ ] **P06-013** Implement snapshot-aware compaction and obsolete-version garbage collection.
- [ ] **P06-014** Implement TTL visibility hooks without enabling cache eviction yet.
- [ ] **P06-015** Add model-based MVCC, concurrent writer, snapshot, tombstone, retry, and garbage-collection tests.
- [ ] **P06-016** Add crash tests around transaction grouping, idempotency persistence, and acknowledgement.
- [ ] **P06-017** Document the v1 consistency model and map every public concern to tests.
- [ ] **G06** Close the MVCC gate after generated histories match the reference model and every concern survives its promised failure boundary.

Evidence required for `G06`: MVCC model histories, concern matrix, concurrent/crash test report, and snapshot-compaction invariants.

## Phase 7 — Query language and CPU reference execution

Objective: implement the native JSON command model, normalized logical plans, complete v1 CPU semantics, CRUD, aggregation, and explainability. Covers `QUERY-*`, `INV-002`, and `COMPAT-001` foundations.

Dependencies: `G01`, `G03`, `G06`.

- [ ] **P07-001** Define versioned command envelopes, request metadata, database/collection addressing, options, and typed response/error envelopes.
- [ ] **P07-002** Implement strict command parsing, schema validation, size limits, duplicate-key rejection, and unknown-option handling.
- [ ] **P07-003** Implement dotted-path resolution through HDoc and field dictionary semantics.
- [ ] **P07-004** Implement the query AST and normalization for implicit equality, `$and`, `$or`, `$not`, and `$nor`.
- [ ] **P07-005** Implement CPU reference comparison operators `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, and `$nin`.
- [ ] **P07-006** Implement CPU reference element/type operators `$exists` and `$type`.
- [ ] **P07-007** Implement CPU reference array operators `$all`, `$size`, and `$elemMatch`.
- [ ] **P07-008** Implement `$prefix`, `$contains`, and CPU-only v1 `$regex` with explicit limits.
- [ ] **P07-009** Implement cache/time predicate syntax without enabling unsafe storage-class behavior.
- [ ] **P07-010** Implement vector query parsing, validation, CPU distance reference, and deterministic top-k ordering.
- [ ] **P07-011** Implement insertOne/Many, find, updateOne/Many, replace, deleteOne/Many, and count command handlers.
- [ ] **P07-012** Implement supported update operators with atomic path conflict and overflow semantics.
- [ ] **P07-013** Implement inclusion/exclusion projection, sort, stable tie-breaking, skip, limit, cursor batching, and cancellation.
- [ ] **P07-014** Implement v1 aggregation stages `$match`, `$project`, `$sort`, `$limit`, `$skip`, `$count`, `$group`, and `$unwind`.
- [ ] **P07-015** Define logical plan nodes and implement AST-to-logical-plan lowering.
- [ ] **P07-016** Implement the initial physical planner using collection scans and primary-key access only.
- [ ] **P07-017** Implement CPU row-scan, filter, fetch, project, sort, limit, group, unwind, and vector reference operators.
- [ ] **P07-018** Implement query resource limits for memory, result size, work, recursion, regex, group cardinality, and deadline.
- [ ] **P07-019** Implement logical and physical `explain()` with stable stage and reason identifiers.
- [ ] **P07-020** Run the full semantic corpus through command, logical-plan, and CPU physical-plan layers.
- [ ] **P07-021** Add parser, normalization, evaluator, aggregation, cursor, cancellation, and error property tests and fuzzing.
- [ ] **P07-022** Extend the MongoDB differential harness across every declared v1 overlapping operator.
- [ ] **G07** Close the CPU-query gate after all semantic fixtures pass, unsupported behavior fails explicitly, and differential mismatches are resolved or documented.

Evidence required for `G07`: semantic result hashes, fuzz corpus, differential matrix, explain fixtures, resource-limit tests, and API examples.

## Phase 8 — Primary, secondary, compound, unique, and TTL indexes

Objective: implement correct, recoverable indexes and online lifecycle before using them to prune GPU or distributed work.

Dependencies: `G06`, `G07`.

- [ ] **P08-001** Finalize versioned primary and secondary index key encodings, type ordering, descending encoding, and MVCC suffixes.
- [ ] **P08-002** Integrate the `_id` primary index with uniqueness, automatic ID generation, and atomic row visibility.
- [ ] **P08-003** Implement scalar secondary indexes on nested paths with missing/null and mixed-type semantics.
- [ ] **P08-004** Implement compound indexes, prefix rules, sort compatibility, and multikey restrictions.
- [ ] **P08-005** Implement unique secondary indexes with concurrent conflict detection and recovery-safe enforcement.
- [ ] **P08-006** Implement TTL index metadata and candidate enumeration while keeping logical expiry in the visibility layer.
- [ ] **P08-007** Implement atomic index mutation or replayable derived-index updates for insert, update, delete, and rollback paths.
- [ ] **P08-008** Add index statistics for cardinality, distinct values, min/max, null/missing, histograms, and update time.
- [ ] **P08-009** Implement index scan, range scan, compound-prefix scan, index-only eligibility, and row verification.
- [ ] **P08-010** Extend the physical planner and cost model to select or reject indexes with reason codes.
- [ ] **P08-011** Implement online index phases REGISTER, BACKFILL_SCAN, BUILD_SEGMENTS, CATCH_UP, VALIDATE, and COMMIT.
- [ ] **P08-012** Implement resumable index builds, crash cleanup, progress state, cancellation, and drop.
- [ ] **P08-013** Implement independent index validation, consistency checking, rebuild, and repair diagnostics.
- [ ] **P08-014** Ensure compaction and MVCC garbage collection keep index entries synchronized with retained versions.
- [ ] **P08-015** Add generated index-versus-row differential tests across mutations, snapshots, TTL, and crashes.
- [ ] **P08-016** Benchmark write amplification, index build/catch-up, point/range lookup, and planner selectivity.
- [ ] **P08-017** Decide the vector-index algorithm, persistence format, distance metrics, update model, rebuild policy, and compatibility contract.
- [ ] **P08-018** Implement vector-index build, insert/update/delete maintenance, crash recovery, validation, and resumable rebuild.
- [ ] **P08-019** Integrate vector index selection, scalar prefilters, sidecar/GPU postfilters, exact re-ranking, and `explain()` evidence.
- [ ] **P08-020** Add vector recall, distance, filter, mutation, recovery, rebuild, memory, and performance test suites against brute-force reference results.
- [ ] **G08** Close the index gate after every committed index survives crash/rebuild tests and never changes semantic results relative to row scan.

Evidence required for `G08`: online-build histories, validation reports, crash/recovery matrix, planner fixtures, and amplification benchmarks.

## Phase 9 — Columnar sidecars and optimized CPU scan engine

Objective: implement rebuildable typed chunks, delta coverage, CPU/SIMD operators, and planner integration before WebGPU. Covers `INV-001`, `INV-002`, `EXP-004`, `EXP-005`, and `EXP-011`.

Dependencies: `G03`, `G06`, `G07`, `G08`.

- [ ] **P09-001** Define collection configuration for selected sidecar fields, type policy, chunk sizing, compression, and rebuild priority.
- [ ] **P09-002** Define and version CSEG headers, dictionary version, source range, snapshot/watermark, document count, statistics, and checksum.
- [ ] **P09-003** Implement numeric, Boolean, timestamp, dictionary-string, vector, and array column layouts.
- [ ] **P09-004** Implement missing, null, deleted, type, and MVCC visibility bitmaps.
- [ ] **P09-005** Implement document-ID/version mappings and safe row-fetch references.
- [ ] **P09-006** Implement zone maps, selected bloom filters, dictionary summaries, and GPU/CPU eligibility metadata.
- [ ] **P09-007** Implement the mutable column batch and integrate it with WAL/memtable mutation without making it authoritative.
- [ ] **P09-008** Implement CSEG flush, checksum validation, temporary output, and atomic manifest publication.
- [ ] **P09-009** Implement source watermarks and a query delta path covering committed rows newer than persisted sidecars.
- [ ] **P09-010** Implement complete snapshot merge across immutable chunks, mutable batches, deltas, tombstones, and retained MVCC versions.
- [ ] **P09-011** Implement sidecar deletion, independent rebuild, generation validation, and planner exclusion during incomplete builds.
- [ ] **P09-012** Integrate sidecar rewrite and statistics recomputation with compaction.
- [ ] **P09-013** Implement optimized CPU numeric, Boolean, timestamp, dictionary equality/in, array, and vector column operators.
- [ ] **P09-014** Implement CPU bitmap AND, OR, NOT, count, and candidate iteration.
- [ ] **P09-015** Add SIMD and host worker-pool execution behind capability detection with scalar equivalence.
- [ ] **P09-016** Extend the planner to combine index pruning, zone maps, CPU sidecar scans, bitmaps, row fetch, and final verification.
- [ ] **P09-017** Extend `explain()` with sidecar generation, coverage, pruned chunks, rows, bytes, delta work, and CPU operator timing.
- [ ] **P09-018** Measure storage and write amplification for selected-field policies and active compaction.
- [ ] **P09-019** Complete `EXP-004`, `EXP-005`, and `EXP-011` with concurrent writes, rebuild, compaction, and snapshot histories.
- [ ] **P09-020** Add CPU row-versus-column differential tests for all supported types, operators, selectivities, and malformed chunks.
- [ ] **P09-021** Implement the public columnar-index create/list/alter/drop/rebuild API and map it to selected-field sidecar generations.
- [ ] **G09** Close the sidecar gate after deleting all sidecars and rebuilding them preserves results, lag never omits visible rows, and optimized CPU scans are measured.

Evidence required for `G09`: CSEG fixtures, source/embedded result hashes, rebuild proof, model histories, amplification report, and CPU scan benchmarks.

## Phase 10 — WebGPU execution engine

Objective: implement optional, adaptive, bounded GPU execution with exact/candidate classification, CPU verification, and complete fallback. Covers `GPU-*`, `INV-002`, `INV-003`, `INV-006`, and `EXP-006`–`EXP-009`/`EXP-012`.

Dependencies: `G04`, `G09`.

- [ ] **P10-001** Decide native GPU integration through wgpu, Dawn, or a host abstraction supporting both and record the ADR.
- [ ] **P10-002** Define versioned adapter capability profiles, required limits/features, supported scalar representations, and kernel eligibility.
- [ ] **P10-003** Define the core-to-host GPU plan, buffer, dispatch, result, error, cancellation, and device-loss interface.
- [ ] **P10-004** Define versioned WGSL kernel metadata, source hashes, feature requirements, exactness class, workgroup assumptions, and test vectors.
- [ ] **P10-005** Implement adapter/device discovery, secure default selection, feature validation, and browser runtime detection.
- [ ] **P10-006** Implement shader validation, compilation, pipeline caching, invalidation, and diagnostics.
- [ ] **P10-007** Implement per-device buffer pools, typed upload buffers, scratch buffers, result bitmaps, accounting, and LRU eviction.
- [ ] **P10-008** Implement host-memory and GPU-resident chunk caches with dictionary/generation pinning.
- [ ] **P10-009** Implement exact Boolean, timestamp, fixed-width numeric, dictionary-code equality/in, and bitmap kernel families where capabilities permit.
- [ ] **P10-010** Implement numeric comparison/between kernels and explicit CPU fallback for unsupported precision or width.
- [ ] **P10-011** Implement array contains/all candidate kernels with CPU verification.
- [ ] **P10-012** Implement vector L2, cosine, dot, and bounded local top-k kernels with documented numerical rules.
- [ ] **P10-013** Implement result bitmap/count/score download and candidate-to-row mapping.
- [ ] **P10-014** Implement final CPU verification for all non-exact kernels and mixed-type or collation-sensitive cases.
- [ ] **P10-015** Implement chunked bounded dispatch, deadline checks between chunks, cancellation, and no-partial-result publication.
- [ ] **P10-016** Implement fallback for unavailable adapters, unsupported plans, small inputs, allocation failure, validation failure, device loss, deadline, user disablement, and quota rejection.
- [ ] **P10-017** Implement device-loss recovery, pipeline/buffer invalidation, idempotent retry, and stable fallback reason codes.
- [ ] **P10-018** Implement per-device, per-query, and later per-tenant memory/time/queue quotas.
- [ ] **P10-019** Implement the end-to-end cost equation including preparation, upload, queue, kernel, download, verification, fetch, and result materialization.
- [ ] **P10-020** Treat 50,000 rows, 4 MiB, transfer ratio, and 20% required advantage as configurable seed values rather than claims.
- [ ] **P10-021** Extend planner statistics and `explain()` with eligibility, rejection, residency, transfer, queue, kernel, verification, and fallback evidence.
- [ ] **P10-022** Add CPU/GPU differential fixtures, property tests, randomized replay artifacts, edge cases, and tolerance enforcement per kernel.
- [ ] **P10-023** Add device-loss, out-of-memory, shader validation, quota, deadline, and cancellation fault tests.
- [ ] **P10-024** Benchmark cold storage, warm host, GPU-resident, browser, native, selectivity, result size, concurrency, and active-ingest regimes against optimized CPU.
- [ ] **P10-025** Complete `EXP-006`, `EXP-007`, `EXP-008`, `EXP-009`, and `EXP-012`; publish per-adapter crossover models and misselection rates.
- [ ] **P10-026** Prove that disabling or removing GPU support leaves every supported operation correct and available.
- [ ] **P10-027** Implement bounded string prefix/contains candidate kernels with encoding, Unicode, collision, and CPU-verification rules.
- [ ] **P10-028** Implement supported numeric reduction and partial-group kernels with overflow, null, grouping-cardinality, and fallback controls.
- [ ] **P10-029** Implement GPU-eligible column projection and numeric sort/top-k stages with bounded scratch memory and deterministic final ordering.
- [ ] **P10-030** Add differential, resource, cancellation, and crossover benchmarks for string, reduction, projection, and numeric top-k kernels.
- [ ] **G10** Close the GPU gate after all kernels pass differential tests, failure fallback is safe, and at least one representative workload has a reproducible end-to-end crossover.

Evidence required for `G10`: kernel registry, capability profiles, replay corpus, device-failure histories, cold/warm/resident raw benchmarks, calibrated planner report, and GPU-disabled proof.

## Phase 11 — Embedded native and browser products

Objective: ship the same semantic database as a native embedded library and browser Wasm package with OPFS/IndexedDB and optional WebGPU. Covers `PLAT-*` and `EXP-010`.

Dependencies: `G04`, `G05`, `G07`, `G09`, `G10`.

- [ ] **P11-001** Define the embedded lifecycle API for create/open, configure, close, destroy, inspect, compact, export, and recover.
- [ ] **P11-002** Implement the native filesystem host with directory permissions, durable sync, locks, memory limits, and graceful shutdown.
- [ ] **P11-003** Implement an in-memory host for tests and explicit `memory_only` deployments without confusing it with durable mode.
- [ ] **P11-004** Build and package the portable Wasm core and versioned JavaScript/TypeScript bindings.
- [ ] **P11-005** Implement OPFS capability detection, worker-based I/O, exclusive-writer coordination, reopen, and abrupt-termination handling.
- [ ] **P11-006** Implement IndexedDB fallback with documented durability, transaction, size, and performance differences.
- [ ] **P11-007** Implement browser quota estimation, quota errors, low-space warnings, cleanup, export, and user-visible recovery paths.
- [ ] **P11-008** Implement multi-tab/version coordination, stale-lock recovery, upgrade blocking, and read-only behavior where required.
- [ ] **P11-009** Implement browser lifecycle suspension, cancellation, pending-write completion, and safe reopen tests.
- [ ] **P11-010** Implement browser WebGPU feature detection, capability profile, optional enablement, and CPU fallback.
- [ ] **P11-011** Implement the TypeScript fluent collection/query API shown by the specifications.
- [ ] **P11-012** Implement the Rust embedded SDK with equivalent semantics and typed errors.
- [ ] **P11-013** Add native/browser host conformance tests using identical semantic and persistent-format fixtures.
- [ ] **P11-014** Add browser tests for OPFS, fallback, quota, lifecycle, multitab, device loss, memory pressure, and upgrade interruption.
- [ ] **P11-015** Implement optional local encryption hooks and define key-unavailable recovery behavior.
- [ ] **P11-016** Produce installable native and npm artifacts with size, contents, version, and provenance checks.
- [ ] **P11-017** Build clean-consumer examples for native Rust and browser TypeScript without repository-relative assumptions.
- [ ] **P11-018** Complete `EXP-010` and publish the host conformance/behavior matrix.
- [ ] **P11-019** Implement mobile app-shell host bindings for supported iOS and Android runtimes and run the embedded conformance suite on representative devices.
- [ ] **P11-020** Implement the supported edge/WASI host profile, including its filesystem or object-store capabilities, limits, lifecycle, and conformance tests.
- [ ] **G11** Close the embedded gate after native and browser clean consumers create, persist, reopen, query, compact, export, and recover the same fixture set with GPU disabled and enabled where available.

Evidence required for `G11`: packaged artifacts, clean-consumer transcripts, host matrix, browser reports, quota/lifecycle tests, and result hashes.

## Phase 12 — Server runtime, native protocol, and core SDKs

Objective: implement the production single-node process, native protocol, connection lifecycle, and required SDKs.

Dependencies: `G05`, `G06`, `G07`, `G08`, `G09`; security/operations work proceeds with Phases 13–15 before release.

- [ ] **P12-001** Decide the initial HTTP/JSON or CBOR protocol and the criteria for optional gRPC or binary framing.
- [ ] **P12-002** Define versioned request, response, error, cursor, streaming, session, concern, deadline, and feature-negotiation envelopes.
- [ ] **P12-003** Implement `helixd` startup, configuration layers, data-directory validation, process identity, PID/lock handling, and graceful shutdown.
- [ ] **P12-004** Implement database, collection, CRUD, query, aggregation, index, explain, session, and transaction endpoints.
- [ ] **P12-005** Implement cursor streaming, batching, backpressure, cancellation, deadlines, and client disconnect cleanup.
- [ ] **P12-006** Implement connection/request limits, concurrency queues, admission control, memory accounting, and overload errors.
- [ ] **P12-007** Implement stable health, readiness, liveness, version, capability, and build-info endpoints.
- [ ] **P12-008** Implement configuration validation for storage, GPU, cache, network, TLS, logging, metrics, backup, and limits.
- [ ] **P12-009** Implement server feature negotiation and explicit rejection of unsupported distributed concerns or adapters.
- [ ] **P12-010** Implement TypeScript and Rust server clients sharing embedded semantic fixtures.
- [ ] **P12-011** Implement required Go and Python SDKs with typed errors, sessions, cursors, retries, and cancellation.
- [ ] **P12-012** Add protocol conformance tests comparing embedded and server paths for results and errors.
- [ ] **P12-013** Add load, slow-client, cancellation, malformed-input, oversized-input, and graceful-restart tests.
- [ ] **P12-014** Build native binary, container, configuration example, and clean-machine install/smoke workflows.
- [ ] **P12-015** Document native API, configuration, error model, limits, and SDK support matrix.
- [ ] **G12** Close the server gate after clean clients perform the full v1 workflow under load and shutdown/restart without semantic divergence or resource leaks.

Evidence required for `G12`: protocol fixtures, SDK conformance matrix, binary/container contents, load report, restart histories, and clean-install proofs.

## Phase 13 — Security, sandboxing, encryption, and isolation

Objective: secure embedded, browser, server, GPU, plugin, node, tenant, backup, and administrative boundaries. Covers `SEC-*`, `INV-006`, and security portions of `GPU-005`.

Dependencies: begins after `G04`; server preview requires the applicable items before `G12` can feed `G16`.

- [ ] **P13-001** Produce threat models for embedded native, browser, single-node server, distributed nodes, GPU multi-tenancy, plugins, backups, and managed control plane.
- [ ] **P13-002** Define secure defaults, trust zones, attack surfaces, sensitive data classes, and audit requirements.
- [ ] **P13-003** Implement TLS for client/server traffic and mTLS for node-to-node traffic with certificate rotation hooks.
- [ ] **P13-004** Implement JWT/OIDC validation, issuer/audience policy, claim mapping, clock handling, and revocation/expiry errors.
- [ ] **P13-005** Implement service-account API keys with hashing, scoping, rotation, expiry, and audit.
- [ ] **P13-006** Implement short-lived signed browser/local-sync tokens without persistent high-privilege credentials.
- [ ] **P13-007** Implement RBAC for cluster, tenant, database, collection, cache, backup, and administrative actions.
- [ ] **P13-008** Implement tenant/database/collection authorization checks at every API and internal routing boundary.
- [ ] **P13-009** Design and later implement field-level and document-policy controls without bypass through indexes, projections, aggregation, or adapters.
- [ ] **P13-010** Implement encryption at rest for WAL, SST, VLOG, CSEG, IDX, manifests where needed, and local databases where promised.
- [ ] **P13-011** Implement host-managed key identifiers, envelope encryption, rotation, missing-key errors, and no raw keys in Wasm or logs.
- [ ] **P13-012** Implement encrypted backups and restore behavior for active, rotated, revoked, and unavailable keys.
- [ ] **P13-013** Enforce capability-scoped Wasm core, future UDF, trigger, and conflict-resolver execution.
- [ ] **P13-014** Define plugin signatures, provenance, resource limits, deterministic APIs, versioning, and disable/revoke workflow.
- [ ] **P13-015** Prevent arbitrary client WGSL and accept only versioned internal kernel bundles.
- [ ] **P13-016** Implement GPU buffer clearing/reinitialization, tenant ownership, memory/time/queue quotas, and safe device reuse.
- [ ] **P13-017** Redact credentials, document values, keys, tokens, and sensitive query literals from logs, metrics, traces, and debug artifacts.
- [ ] **P13-018** Add dependency, secret, static, dynamic, fuzz, malformed-protocol, authorization, and privilege-escalation tests.
- [ ] **P13-019** Conduct external or independent security review before remote production and repeat before multi-tenancy/plugins.
- [ ] **P13-020** Document vulnerability reporting, supported versions, incident response, key compromise, and emergency disablement.
- [ ] **P13-021** Implement a versioned Wasm component registry with install, signature verification, capability grant, enable/disable, upgrade, rollback, and revocation workflows.
- [ ] **P13-022** Implement deterministic CPU expression UDFs and approved query/aggregation extension points without permitting semantic bypass.
- [ ] **P13-023** Implement versioned triggers and conflict-resolver hooks with transaction boundaries, recursion limits, replay behavior, and failure policy.
- [ ] **P13-024** Add plugin/UDF/trigger conformance, determinism, resource-exhaustion, capability-denial, upgrade, replay, and security tests.
- [ ] **G13** Close the v1 security gate after remote access defaults secure, authn/authz/encryption/sandbox tests pass, and critical findings are resolved.

Evidence required for `G13`: threat models, control matrix, independent review, key-rotation/restore results, authorization corpus, GPU-isolation tests, and security runbook.

## Phase 14 — Observability, explainability, diagnostics, and administration

Objective: make every storage, planner, GPU, cache, replication, and operational decision diagnosable. Covers `QUERY-003` and `OPS-001`.

Dependencies: starts with Phase 5 and evolves through Phase 23.

- [ ] **P14-001** Define stable metric, log, trace, event, reason-code, and diagnostic-artifact schemas with versioning.
- [ ] **P14-002** Implement query counts and latency distributions by command, collection class, result, and backend without high-cardinality leakage.
- [ ] **P14-003** Implement GPU query/fallback counts, kernel/queue/upload/download/verification times, bytes, residency, buffer hits, and device-loss metrics.
- [ ] **P14-004** Implement storage write/read bytes, WAL, flush, compaction, cache, index-build, sidecar-build, backlog, amplification, and disk-space metrics.
- [ ] **P14-005** Implement cache, TTL, eviction, sync, replication, leader, range, router, and backup metrics as their phases land.
- [ ] **P14-006** Implement structured component logs with request/query/session/tenant correlation and redaction.
- [ ] **P14-007** Implement distributed traces for authorization, planning, indexes, storage, upload, kernel, verification, fetch, merge, replication, and backup.
- [ ] **P14-008** Extend `explain()` with chosen/rejected indexes and backends, estimates/actuals, versions, exactness, fallback, and stable reason codes.
- [ ] **P14-009** Implement bounded structured debug traces exportable as durable artifacts without document contents by default.
- [ ] **P14-010** Implement diagnostics bundles containing configuration summaries, format versions, device profile, metrics snapshot, safe logs, and integrity results.
- [ ] **P14-011** Implement the admin CLI commands `status`, `nodes`, `collections`, `indexes`, `explain`, `ranges`, `rebalance`, backup/restore, `compact`, and `gpu status` as relevant phases land.
- [ ] **P14-012** Implement Prometheus/OpenTelemetry or selected standard exporters and document compatibility.
- [ ] **P14-013** Create dashboards and alerts for availability, latency, durability, disk, compaction, GPU fallback, cache, replication, backup, and security signals.
- [ ] **P14-014** Implement planner calibration telemetry with reset, version, staleness, and conservative fallback.
- [ ] **P14-015** Add schema, redaction, cardinality, reason-code, exporter, and debug-artifact tests.
- [ ] **G14** Close the v1 observability gate after a clean operator can explain backend selection, recover a failure cause, and monitor all v1 release gates from produced evidence.

Evidence required for `G14`: metric catalog, log/trace fixtures, redaction tests, explain examples, diagnostic bundle, dashboards, alerts, and operator exercise report.

## Phase 15 — Backup, restore, disaster recovery, format evolution, and upgrades

Objective: prove data can survive operational loss and software evolution. Covers `OPS-002`, `INV-007`, and Specification sections 19 and 27.

Dependencies: `G05`, `G06`, `G08`, `G09`; distributed extensions follow Phases 17–19.

- [ ] **P15-001** Define a versioned backup manifest with database metadata, range placeholder, snapshot boundary, file hashes, WAL interval, encryption, and feature versions.
- [ ] **P15-002** Implement consistent full snapshots using manifest generations and immutable artifacts.
- [ ] **P15-003** Implement incremental snapshots with base identity, changed artifacts, dependency validation, and retention rules.
- [ ] **P15-004** Implement point-in-time recovery using a base snapshot and bounded WAL replay at transaction boundaries.
- [ ] **P15-005** Implement collection, database, and tenant export formats with type preservation and checksums.
- [ ] **P15-006** Implement object-storage upload/download with retries, multipart integrity, cancellation, credentials, and no partial publication.
- [ ] **P15-007** Implement encrypted backup creation, key metadata, rotation compatibility, and unavailable-key diagnostics.
- [ ] **P15-008** Implement clean restore for full, incremental, and point-in-time artifacts.
- [ ] **P15-009** Implement restore scopes for cluster placeholder, tenant, database, collection, timestamp, and forked environment.
- [ ] **P15-010** Validate every file, format, checksum, dependency, key, and snapshot boundary before serving restored data.
- [ ] **P15-011** Rebuild optional indexes and sidecars from canonical rows during restore where versions are incompatible or artifacts are omitted.
- [ ] **P15-012** Implement browser export/import with versioning, quota checks, interruption handling, and user-owned recovery.
- [ ] **P15-013** Version HDoc, WAL, MANIFEST/OPTIONS, SST, VLOG, CSEG, IDX, backup, protocol, change-stream, and kernel artifacts.
- [ ] **P15-014** Implement typed unknown-version/feature rejection for every persistent and public reader.
- [ ] **P15-015** Define the supported v1 read/write compatibility window and upgrade/downgrade rules.
- [ ] **P15-016** Implement a resumable migration framework with preflight, backup validation, checkpoints, rollback boundary, and post-validation.
- [ ] **P15-017** Add interrupted migration, insufficient space, corrupted source, missing key, and downgrade rejection tests.
- [ ] **P15-018** Define backup retention, restore-time, data-loss objectives, verification cadence, and disaster-recovery runbooks.
- [ ] **P15-019** Run scheduled clean-environment restore drills from actual produced artifacts.
- [ ] **G15** Close the v1 recovery/upgrade gate after full, incremental, PITR, browser import, and interrupted migration paths are proven in clean environments.

Evidence required for `G15`: backup manifests, artifact hashes, restore transcripts, logical result hashes, migration matrix, DR drill report, and key scenarios.

## Phase 16 — Single-node v1 hardening and release

Objective: integrate and release the smallest credible v1 defined by the specifications.

Dependencies: `G01`–`G15` as applicable; no distributed feature may be used to mask a failed v1 gate.

- [ ] **P16-001** Freeze the v1 feature, semantic, format, API, SDK, browser, GPU, and compatibility matrices.
- [ ] **P16-002** Complete all v1 requirement traceability rows and attach test/evidence identifiers.
- [ ] **P16-003** Run full semantic, codec, storage, MVCC, query, index, sidecar, CPU/GPU, browser, server, security, backup, and upgrade suites.
- [ ] **P16-004** Run sustained ingest/read/update/delete, compaction, index build, GPU, backup, and restart soak tests.
- [ ] **P16-005** Run disk-full, memory-pressure, quota, device-loss, corrupt-file, key-unavailable, slow-client, and abrupt-process chaos scenarios.
- [ ] **P16-006** Validate that every unsupported distributed, MongoDB, Redis, transaction, GPU, or browser capability fails explicitly.
- [ ] **P16-007** Produce reproducible performance reports for point reads, durable writes, ingest, cache-free CPU scans, GPU scans, and browser/native operation.
- [ ] **P16-008** Validate the GPU selection rule against optimized CPU across the required benchmark matrix and publish misselection rates.
- [ ] **P16-009** Complete clean-consumer install and end-to-end workflows for Rust, npm/browser, server binary, container, TypeScript, Go, and Python clients.
- [ ] **P16-010** Produce source, binary, Wasm, npm, container, checksum, signature, SBOM, provenance, and license artifacts.
- [ ] **P16-011** Validate package/tarball/container contents contain required assets and exclude local data, secrets, benchmarks not intended for release, and build debris.
- [ ] **P16-012** Complete user, API, format, administration, security, backup, upgrade, troubleshooting, and compatibility documentation.
- [ ] **P16-013** Complete independent release-candidate review of data loss, security, compatibility, performance claims, and operational readiness.
- [ ] **P16-014** Resolve all critical/high issues and explicitly defer lower issues with owners and release notes.
- [ ] **P16-016** Re-evaluate the public product name and migrate or confirm every repository, package, binary, SDK, container, protocol, telemetry, configuration, and operator identifier before publication.
- [ ] **P16-015** Tag and publish an immutable v1 release candidate, repeat install/restore proof from published artifacts, then promote the approved release.
- [ ] **G16** Close the v1 gate only when Specification section 29.2 is satisfied from real packaged artifacts and no claim depends on unimplemented distribution.

Evidence required for `G16`: requirement ledger, full suite report, soak/chaos results, raw benchmarks, package contents, SBOM/provenance, clean installs, clean restore, independent review, and release approval.

## Phase 17 — Distributed replication foundation

Objective: replicate the proven single-node state machine as consensus-backed range groups and metadata service. Covers `DIST-001`, distributed concerns, and `EXP-014`.

Dependencies: `G16`, `G13`, `G14`, `G15`.

- [ ] **P17-001** Decide consensus library/implementation strategy and document safety evidence, membership support, snapshot API, Wasm/host boundary, and operational maturity.
- [ ] **P17-002** Define versioned replicated command, result, idempotency, transaction, membership, and snapshot formats.
- [ ] **P17-003** Define range identity, bounds, epoch, replica roles, leader, term, commit index, applied index, and durable index.
- [ ] **P17-004** Implement a deterministic range state machine using existing row, MVCC, index, and sidecar semantics.
- [ ] **P17-005** Implement consensus log persistence, replay, truncation, compaction, and recovery over the storage engine.
- [ ] **P17-006** Implement leader election, heartbeats, term/vote persistence, and split-brain prevention.
- [ ] **P17-007** Implement append replication, quorum commit, ordered apply, duplicate suppression, and client result correlation.
- [ ] **P17-008** Align `ack`, `durable`, `majority`, and `all` write concerns with log and storage acknowledgement boundaries.
- [ ] **P17-009** Implement local, majority, snapshot, lease, and leader-confirmed linearizable read paths with explicit availability tradeoffs.
- [ ] **P17-010** Implement range snapshots that pin a consistent storage manifest, copy files, verify hashes, and resume log application.
- [ ] **P17-011** Implement snapshot install, interruption recovery, obsolete-state cleanup, and sidecar/index rebuild rules.
- [ ] **P17-012** Implement membership changes, learner add/catch-up, promotion, demotion, removal, and joint-consensus rules as required.
- [ ] **P17-013** Implement the small replicated metadata group for tenants, databases, collections, ranges, nodes, indexes, and backup catalog.
- [ ] **P17-014** Implement node identity, peer discovery/bootstrap, mTLS, protocol negotiation, and incompatible-version rejection.
- [ ] **P17-015** Implement node/range/consensus metrics, structured events, traces, diagnostics, and admin status.
- [ ] **P17-016** Add deterministic simulations for election, replication, partitions, duplication, reordering, snapshots, and membership.
- [ ] **P17-017** Add process-level kill, disk, corruption, network, slow-follower, snapshot, and restart tests.
- [ ] **P17-018** Complete `EXP-014` on a three-node cluster at every write acknowledgement boundary.
- [ ] **P17-019** Extend backup/restore and rolling-upgrade design to replicated range and metadata groups.
- [ ] **G17** Close the replication gate after a three-node group survives any one-node failure without losing majority-acknowledged writes and histories match promised concerns.

Evidence required for `G17`: consensus model/simulation results, three-node histories, snapshot hashes, membership tests, concern matrix, security proof, and upgrade/backup design.

## Phase 18 — Sharding, routing, range split/movement, and autoscaling

Objective: partition collections into movable ranges, route queries, merge distributed results, and rebalance safely. Covers `DIST-002`, `DIST-003`, and `EXP-015`.

Dependencies: `G17`.

- [ ] **P18-001** Implement hash `_id`, explicit range, tenant-hash, and approved custom shard-key encodings.
- [ ] **P18-002** Implement versioned range descriptors, non-overlap/coverage validation, epochs, states, placement, and replica sets.
- [ ] **P18-003** Implement router cluster-map loading, watch/update, caching, expiry, and safe behavior when metadata is unavailable.
- [ ] **P18-004** Implement point read/write routing and read-preference selection by shard key and concern.
- [ ] **P18-005** Implement stale-epoch detection, typed retry metadata, idempotent write retry, redirect limits, and loop prevention.
- [ ] **P18-006** Implement relevant-range discovery for shard-key bounds and conservative scatter for unbounded queries.
- [ ] **P18-007** Implement scatter/gather request fan-out, deadlines, cancellation, partial-failure policy, and backpressure.
- [ ] **P18-008** Implement global merge for projection, stable sort, skip, limit, count, and deduplication.
- [ ] **P18-009** Implement shard-local partial grouping and global reduction with deterministic merge semantics.
- [ ] **P18-010** Keep GPU planning shard-local and include local backend evidence in distributed explain output.
- [ ] **P18-011** Define size, write, read, hotspot, and tenant-policy split triggers with hysteresis.
- [ ] **P18-012** Implement atomic range split metadata, child snapshots/log positions, router transition, and parent retirement.
- [ ] **P18-013** Implement range movement phases: learner creation, snapshot, hash verification, log tail, catch-up, promotion, epoch commit, and old-replica removal.
- [ ] **P18-014** Implement resumable movement state, cancellation, rollback, throttling, bandwidth limits, and operator controls.
- [ ] **P18-015** Make index builds, compaction, backups, TTL, and active queries safe during split/movement.
- [ ] **P18-016** Implement node capacity, placement policies, zone constraints, tenant isolation, and replica-diversity validation.
- [ ] **P18-017** Implement hotspot detection, rebalancing plans, dry run, automatic execution, and safety limits.
- [ ] **P18-018** Implement add/remove/drain node workflows and no-under-replication checks.
- [ ] **P18-019** Add deterministic and process tests for stale routers, concurrent split/move, leader loss, destination loss, metadata loss, and retries.
- [ ] **P18-020** Complete `EXP-015` with a concurrent workload and injected failure at every movement phase.
- [ ] **G18** Close the sharding gate after adding a node and rebalancing preserves results, availability, concerns, indexes, and backups under failure.

Evidence required for `G18`: route/merge differential results, split/move histories, epoch assertions, rebalancer plans, add-node proof, and distributed explain artifacts.

## Phase 19 — Distributed transactions, global snapshots, and multi-region policies

Objective: add the later consistency features and regional policies required for a complete distributed product.

Dependencies: `G18`. These items remain required for the complete target unless an accepted scope-change ADR updates the specification and this plan.

- [ ] **P19-001** Decide the distributed timestamp/transaction oracle, clock assumptions, persistence, failover, and causality model.
- [ ] **P19-002** Define cross-range transaction IDs, coordinator records, participant records, states, idempotency, timeouts, and retention.
- [ ] **P19-003** Implement two-phase commit or the accepted alternative with durable prepare, commit, abort, and recovery.
- [ ] **P19-004** Implement coordinator failover, participant recovery, presumed outcome rules, client retry, and status inspection.
- [ ] **P19-005** Prevent or safely handle range movement, split, membership change, and node drain during active transactions.
- [ ] **P19-006** Implement cross-range snapshot acquisition, read timestamps, garbage-collection pins, and timeout/resource limits.
- [ ] **P19-007** Implement distributed session tokens for read-your-writes and monotonic reads.
- [ ] **P19-008** Implement single-region strong and multi-availability-zone strong placement policies.
- [ ] **P19-009** Implement multi-region read replicas with documented lag, read preference, and failover behavior.
- [ ] **P19-010** Implement bounded-staleness reads with measurable bound enforcement and typed unavailable errors.
- [ ] **P19-011** Limit active-active multi-region writes to storage classes and conflict models explicitly designed for them.
- [ ] **P19-012** Extend backup, restore, change streams, security, observability, and upgrades to global transaction state.
- [ ] **P19-013** Add deterministic transaction protocol tests, crash/partition histories, and garbage-collection safety tests.
- [ ] **P19-014** Run Jepsen-style validation for every advertised read, write, snapshot, session, and transaction guarantee.
- [ ] **G19** Close the distributed-consistency gate only after external histories validate each claim and ambiguous/in-doubt transactions are operable.

Evidence required for `G19`: transaction ADR, protocol histories, Jepsen reports, region policy tests, failover results, and operational runbooks.

## Phase 20 — Cache and ephemeral storage classes

Objective: implement explicit durable/cache/local-replica/memory-only policies, TTL, eviction, and cache commands without risking durable data. Covers `CACHE-*` and `INV-005`.

Dependencies: `G16`; distributed cache replication may depend on `G17`.

- [ ] **P20-001** Implement immutable storage-class metadata for `durable`, `cache`, `local_replica`, and `memory_only` collection creation.
- [ ] **P20-002** Define and guard administrative transitions between storage classes, including backup and data-loss warnings.
- [ ] **P20-003** Implement logical TTL visibility using the accepted time oracle and consistent index/query behavior.
- [ ] **P20-004** Implement physical TTL reclamation through background queues and compaction without resurrection after restart/restore.
- [ ] **P20-005** Implement cache collection configuration for optional WAL, async replication, memory/disk limits, and persistence.
- [ ] **P20-006** Implement `cacheSet`, `cacheGet`, delete, expiry, TTL inspection, increment, decrement, and multi-key primitives with atomicity rules.
- [ ] **P20-007** Implement TTL-priority, LRU, LFU, size-tiered, and manual-pinning eviction policies.
- [ ] **P20-008** Implement cache memory/byte accounting, tenant quotas, admission, backpressure, and out-of-space behavior.
- [ ] **P20-009** Enforce a hard invariant that eviction code cannot select live durable data.
- [ ] **P20-010** Implement optional cache replication and define consistency, failover, expiry-clock, and loss expectations.
- [ ] **P20-011** Implement cache metrics, traces, admin inspection, eviction reasons, and diagnostics.
- [ ] **P20-012** Extend backup/restore to include or deliberately omit cache state according to manifest policy.
- [ ] **P20-013** Add TTL/eviction/reference-model tests across restart, compaction, replication, backup, restore, and clock changes.
- [ ] **P20-014** Benchmark memory-only and persisted cache GET/SET/counter workloads with TTL and eviction pressure.
- [ ] **G20** Close the cache gate after stress and fault tests prove durable data cannot be evicted and TTL behavior is consistent across all enabled paths.

Evidence required for `G20`: storage-class transition tests, eviction invariant proof, TTL histories, cache benchmark report, and backup/restore behavior matrix.

## Phase 21 — Local replicas, change streams, and offline synchronization

Objective: implement resumable cloud-to-local replication, then carefully add offline writes and conflict policies. Covers `SYNC-*` and `EXP-016`.

Dependencies: `G16`, `G20`; cloud source may depend on `G18`.

- [ ] **P21-001** Define versioned change-event records, ordering, transaction grouping, schema/dictionary changes, retention, and resume tokens.
- [ ] **P21-002** Implement change-stream emission from committed canonical mutations without leaking uncommitted or duplicate logical events.
- [ ] **P21-003** Implement authorization, filtering, projection, backpressure, heartbeat, and retention-expired errors for streams.
- [ ] **P21-004** Implement local-replica bootstrap from a consistent snapshot plus change tail.
- [ ] **P21-005** Implement durable sync checkpoints containing collection, resume token, cloud/local timestamps, and pending state.
- [ ] **P21-006** Implement idempotent change apply and duplicate suppression across overlapping replay windows.
- [ ] **P21-007** Implement read-only local replicas first, including offline reads and reconnect/resume.
- [ ] **P21-008** Implement cache invalidation and delete/TTL propagation with deterministic ordering.
- [ ] **P21-009** Implement online write-through mode with server acknowledgement and local read-your-writes.
- [ ] **P21-010** Define offline mutation IDs, queue format, dependencies, authentication expiry, retry, cancellation, and retention.
- [ ] **P21-011** Implement the offline write queue with crash-safe checkpoints and no duplicate logical application.
- [ ] **P21-012** Define conflict detection inputs using accepted versions, timestamps, or version vectors.
- [ ] **P21-013** Implement `server_wins`, `client_wins`, `last_write_wins`, merge-patch, reject-conflict, and approved custom resolver policies.
- [ ] **P21-014** Sandbox custom Wasm resolvers with deterministic inputs, resource limits, versioning, capability denial, and replay tests.
- [ ] **P21-015** Implement user-visible conflict records, inspection, manual resolution, and audit.
- [ ] **P21-016** Implement short-lived token refresh, device revocation, local encryption, and tenant isolation.
- [ ] **P21-017** Implement sync metrics, lag, queue depth, conflicts, resume causes, diagnostics, and admin controls.
- [ ] **P21-018** Add snapshot-tail race, overlapping replay, crash, network flap, retention expiry, schema change, conflict, and revoked-token tests.
- [ ] **P21-019** Complete `EXP-016` and publish duplicate-suppression/final-state hashes.
- [ ] **G21** Close the sync gate after browser/edge replicas bootstrap, resume, work offline, reconcile according to policy, and never duplicate an accepted mutation.

Evidence required for `G21`: stream fixtures, resume histories, final-state hashes, conflict corpus, resolver sandbox tests, security results, and offline workflow proof.

## Phase 22 — Compatibility adapters, migration tooling, and SDK expansion

Objective: expose tested MongoDB-like and Redis-like subsets, migration paths, and the complete SDK ecosystem. Covers `COMPAT-001` and `EXP-013`.

Dependencies: `G12`, `G20`, `G21`; distributed adapter claims require `G18`/`G19` as applicable.

- [ ] **P22-001** Freeze versioned native API semantics as the adapter target and prevent adapters from bypassing authorization, planning, MVCC, or observability.
- [ ] **P22-002** Publish executable MongoDB and Redis compatibility-matrix schemas with exact, different, unsupported, and error states.
- [ ] **P22-003** Implement MongoDB adapter parsing, handshake, authentication mapping, cursor lifecycle, and version negotiation for the selected protocol subset.
- [ ] **P22-004** Map MongoDB find, insertOne/Many, updateOne/Many, deleteOne/Many, projection, sort, limit, and basic aggregation.
- [ ] **P22-005** Map basic index create/list/drop and change streams where HelixDB semantics are proven.
- [ ] **P22-006** Return explicit errors for unsupported MongoDB commands, options, transactions, collations, operators, and wire versions.
- [ ] **P22-007** Extend generated MongoDB differential tests across documents, commands, results, ordering, errors, arrays, null/missing, numbers, and indexes.
- [ ] **P22-008** Complete `EXP-013` and freeze the first green MongoDB compatibility subset.
- [ ] **P22-009** Implement Redis-like protocol parsing, authentication mapping, pipelining, errors, and version negotiation for the selected subset.
- [ ] **P22-010** Map GET, SET, DEL, EXPIRE, TTL, INCR, DECR, MGET, and MSET to cache transactions.
- [ ] **P22-011** Implement PUBLISH/SUBSCRIBE and optional stream commands only after lifecycle, ordering, retention, and backpressure semantics are specified.
- [ ] **P22-012** Return explicit errors for unsupported Redis data structures, scripts, transactions, cluster commands, and persistence expectations.
- [ ] **P22-013** Build differential/protocol tests for every advertised Redis-like command and error.
- [ ] **P22-014** Implement MongoDB import/migration with type mapping, checkpoint, resume, validation, and rollback guidance.
- [ ] **P22-015** Implement Redis cache migration with TTL preservation, type restrictions, checkpoint, and validation.
- [ ] **P22-016** Complete TypeScript, Rust, Go, and Python SDK production readiness and add Java, C#, Swift, and Kotlin SDKs for the complete ecosystem target.
- [ ] **P22-017** Ensure every SDK supports auth, sessions, concerns, cursors, cancellation, retries, feature negotiation, typed errors, and telemetry context.
- [ ] **P22-018** Generate or share conformance fixtures across SDKs without duplicating semantic logic.
- [ ] **P22-019** Publish adapter/SDK support, migration, limitation, performance, and troubleshooting documentation.
- [ ] **P22-020** Test common real client applications against each claimed adapter and SDK from clean packages.
- [ ] **P22-021** Implement the extended aggregation stages `$lookup`, `$facet`, `$bucket`, `$graphLookup`, `$geoNear`, and `$search` with resource, distribution, and compatibility semantics.
- [ ] **P22-022** Implement versioned collation profiles and the required text/geospatial index support without changing binary v1 semantics silently.
- [ ] **P22-023** Add semantic, index, distributed, compatibility, security, and performance suites for extended aggregation, collation, text search, and geospatial queries.
- [ ] **G22** Close the ecosystem gate after every claim is green in an executable matrix and migration round trips preserve supported data and behavior.

Evidence required for `G22`: protocol captures, differential reports, compatibility matrices, clean client examples, migration hashes, SDK package proofs, and unsupported-error tests.

## Phase 23 — Multi-tenancy, orchestration, and managed operations

Objective: turn the distributed engine into an operable multi-tenant cloud system with placement, quotas, orchestration, autoscaling, and service controls.

Dependencies: `G18`, `G13`, `G14`, `G15`; transaction features depend on `G19`.

- [ ] **P23-001** Implement tenant registry, database/collection ownership, lifecycle, suspension, deletion, retention, and audit.
- [ ] **P23-002** Implement per-tenant storage, request, CPU, memory, GPU, network, cursor, index, backup, and sync quotas.
- [ ] **P23-003** Implement fair scheduling and admission across tenants, queries, GPU queues, compaction, backup, and range movement.
- [ ] **P23-004** Implement placement policies for zones, regions, node classes, GPU capability, tenant isolation, and compliance constraints.
- [ ] **P23-005** Implement node registration, heartbeat, health, capability inventory, cordon, drain, replacement, and decommission.
- [ ] **P23-006** Implement automated under-replication repair, learner placement, rebalancing, and safety limits.
- [ ] **P23-007** Implement autoscaling signals and policies for storage, CPU, GPU, request load, range hotspots, and compaction backlog.
- [ ] **P23-008** Build a Kubernetes operator or accepted orchestrator integration with versioned custom resources and reconciliation.
- [ ] **P23-009** Implement rolling deploy, surge, drain, rollback, mixed-version enforcement, and data-format guardrails.
- [ ] **P23-010** Integrate secret/certificate/key management, rotation, backup credentials, and least-privilege service identities.
- [ ] **P23-011** Implement managed backup policies, cross-zone/region copies, retention, restore workflows, and scheduled drills.
- [ ] **P23-012** Implement service control-plane APIs for tenants, clusters, nodes, collections, indexes, placement, backups, and operations.
- [ ] **P23-013** Implement audit trails and approval controls for destructive, security, migration, range, and restore operations.
- [ ] **P23-014** Define service SLOs and error budgets for availability, durability, latency, backup, restore, and control-plane operation.
- [ ] **P23-015** Create dashboards, alerts, on-call runbooks, capacity models, and incident exercises for all SLOs.
- [ ] **P23-016** Run multi-tenant noisy-neighbor, quota, scheduler fairness, GPU isolation, placement, autoscaling, and rolling-upgrade tests.
- [ ] **P23-017** Run zone/region loss, control-plane loss, object-store loss, certificate expiry, key outage, and mass-node-restart exercises.
- [ ] **P23-018** Independently review managed-service security, privacy, isolation, disaster recovery, and operational access.
- [ ] **P23-019** Implement object-storage cold-tier policies, immutable artifact offload, metadata publication, cache/rehydration, integrity, cancellation, and cost controls.
- [ ] **P23-020** Test cold-tier reads, rehydration, lifecycle, backup interaction, object loss/corruption, access control, and performance under failure.
- [ ] **G23** Close the managed-operations gate after the service survives scaling, upgrades, tenant contention, infrastructure loss, and restore drills within declared SLOs.

Evidence required for `G23`: tenant/quota matrices, operator histories, autoscaling tests, SLO dashboards, chaos exercises, DR drills, security review, and runbooks.

## Phase 24 — Complete-product validation and production release

Objective: prove the entire specified product from real artifacts and close every remaining requirement, compatibility, security, consistency, and operational claim.

Dependencies: all applicable gates `G00`–`G23`.

- [ ] **P24-001** Reconcile every specification requirement and study experiment with a completed task, test, evidence artifact, or accepted scope-change ADR.
- [ ] **P24-002** Confirm every persistent format, protocol, SDK, adapter, kernel, backup, change stream, and replicated command has a version and upgrade policy.
- [ ] **P24-003** Run the complete semantic corpus through embedded native, browser, single-node server, distributed server, every SDK, and every advertised adapter.
- [ ] **P24-004** Run CPU/GPU differential, GPU-disabled, unsupported-device, device-loss, quota, and planner-misselection suites across the supported hardware/browser matrix.
- [ ] **P24-005** Run storage/MVCC/index/sidecar crash and corruption suites across all supported format and upgrade paths.
- [ ] **P24-006** Run three-node and multi-range fault suites, range movement, transactions, region policies, and Jepsen-style histories for every consistency claim.
- [ ] **P24-007** Run TTL, eviction, cache replication, local sync, offline queue, conflict, duplicate-suppression, and adapter tests end to end.
- [ ] **P24-008** Restore full, incremental, PITR, tenant, database, collection, browser, and forked-environment artifacts in clean supported environments.
- [ ] **P24-009** Run mixed-version rolling upgrade, interrupted migration, rollback boundary, node replacement, and incompatible-version rejection tests.
- [ ] **P24-010** Run complete security tests and independent reviews for clients, nodes, tenants, Wasm, GPU, plugins, backups, orchestration, and control plane.
- [ ] **P24-011** Produce final reproducible performance reports with raw data for native/browser, CPU/GPU, cold/warm/resident, single/distributed, cache, sync, and mixed workloads.
- [ ] **P24-012** Validate all product claims against results and remove or qualify any claim without direct evidence.
- [ ] **P24-013** Build final source, native, Wasm, npm, SDK, container, operator, checksum, signature, SBOM, provenance, and documentation artifacts.
- [ ] **P24-014** Install every final artifact in clean consumer and cluster environments and execute the documented user-facing workflows.
- [ ] **P24-015** Validate release contents, licenses, notices, dependencies, vulnerabilities, secrets, debug symbols, and excluded local/test data.
- [ ] **P24-016** Complete user, developer, API, format, compatibility, migration, administration, security, backup, upgrade, architecture, troubleshooting, and incident documentation.
- [ ] **P24-017** Resolve all release-blocking issues and record owners, impact, and workarounds for every accepted residual risk.
- [ ] **P24-018** Obtain independent sign-off from correctness, security, operations, compatibility, performance, and release owners.
- [ ] **P24-019** Publish a final release candidate, repeat install/upgrade/backup/restore/chaos proof from published artifacts, and compare artifact hashes.
- [ ] **P24-020** Promote the production release, publish support policy and release notes, and begin monitored rollout with rollback criteria.
- [ ] **G24** Declare complete implementation only after all applicable items are checked, all release proofs pass from published artifacts, and no normative requirement remains unimplemented or untracked.

Evidence required for `G24`: final traceability ledger, all gate artifacts, external consistency/security reports, raw benchmarks, compatibility matrices, published artifact hashes, clean deployment proofs, restore/upgrade histories, sign-offs, and monitored rollout record.

---

## Ongoing cross-cutting obligations

These obligations apply whenever relevant code or contracts change; they do not replace phase tasks.

- [ ] **X-001** Keep architecture, format, API, security, operations, compatibility, and troubleshooting documentation synchronized with implementation.
- [ ] **X-002** Add or update semantic, recovery, security, and compatibility tests in the same change as behavior.
- [ ] **X-003** Version every changed persistent/public contract and document upgrade, downgrade, and rollback consequences.
- [ ] **X-004** Preserve deterministic fixtures and replay artifacts for every discovered correctness failure.
- [ ] **X-005** Re-run affected CPU/GPU differential and backend-selection benchmarks after planner, encoding, kernel, or sidecar changes.
- [ ] **X-006** Re-run crash and restore tests after WAL, manifest, compaction, index, sidecar, MVCC, or backup changes.
- [ ] **X-007** Re-run authorization, isolation, redaction, and secret scans after API, plugin, GPU, tenant, or diagnostics changes.
- [ ] **X-008** Update requirement traceability and the progress snapshot whenever a checklist item changes.
- [ ] **X-009** Keep performance claims tied to reproducible raw reports and supported hardware/software profiles.
- [ ] **X-010** Keep compatibility claims tied to executable matrices and explicit upstream reference versions.
- [ ] **X-011** Preserve clean-consumer, package-content, container, browser, and cluster smoke tests for every release candidate.
- [ ] **X-012** Review and rehearse backup, restore, upgrade, incident, and rollback runbooks on the documented cadence.

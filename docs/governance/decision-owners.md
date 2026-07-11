# Architecture Decision Owners and Deadlines

- Status: Active
- Effective date: 2026-07-10
- Source: [Specifications section 28](../../Specifications.md#28-open-architecture-decisions)
- Process: [Architecture Decision Records](../adr/README.md)

This register assigns accountability and a latest safe decision point. Deadlines are dependency deadlines rather than speculative calendar dates: the named task or gate cannot close until its decision is accepted. If an individual has not been appointed to a role, the project maintainer is the acting owner and remains accountable for finding an independent reviewer before the dependent phase gate.

## Owner roles

| Role | Responsibility |
| --- | --- |
| Project maintainer | Product scope, cross-domain acceptance, owner assignment, and release decisions |
| Runtime architecture owner | Wasm component model, host ABI, portability, async execution, and platform conformance |
| Storage architecture owner | HDoc, WAL, manifests, immutable files, MVCC, compaction, backup, and migration |
| Query semantics owner | Value semantics, query language, collation, planner, indexes, compatibility, and SDK behavior |
| GPU architecture owner | WebGPU abstraction, WGSL kernels, buffers, cost model, device behavior, and scheduling |
| Distributed systems owner | Consensus, ranges, timestamps, transactions, routing, movement, and multi-region behavior |
| Browser/edge owner | Browser storage, quota, lifecycle, mobile/edge hosts, and embedded user experience |
| Sync architecture owner | Change streams, local replicas, offline writes, causality, and conflict resolution |
| Security owner | Threat models, capability boundaries, tenant isolation, cryptography, and review |
| Operations owner | Protocol operations, observability, backup/restore, upgrades, orchestration, and SLOs |

The project maintainer is the acting owner for every unfilled role at project start.

## Decision register

| Decision | Primary owner | Required reviewers | Deadline | Related plan work |
| --- | --- | --- | --- | --- |
| Development identity and final public product/package/protocol identity | Project maintainer | Query semantics, operations, legal/licensing review | Development matrix before `G00`; public matrix before `P16-015` | `P00-005`, `P16-016` |
| Native GPU integration: wgpu, Dawn, or a host abstraction supporting both | GPU architecture owner | Runtime, security, operations | Before `P10-003`; no later than Phase 0 research exit | `P10-001` |
| Server runtime and WASI component boundary | Runtime architecture owner | Storage, GPU, security | Before `G04` | `P04-001`–`P04-017` |
| [HDoc v1 physical baseline](../adr/0012-use-bounded-little-endian-hdoc-v1.md): checksum, compression, endianness, alignment, offsets, canonical hash, and extensions | Storage architecture owner | Query semantics, runtime, security | ADR 0012 accepted; exact subordinate layouts complete through `P03-007`; encoder, validating reader, borrowed/owned values, raw lookup, and lossless tagged conversion implemented at `P03-008`–`P03-012`; immutable fixtures remain | `P03-001`–`P03-012` |
| WAL, SST, VLOG, and CSEG physical encodings | Storage architecture owner | Runtime, query semantics, operations | Before the first writer for each format; no later than `P05-005`, `P05-009`, `P05-011`, and `P09-008` | `P05-*`, `P09-*` |
| Primary native protocol: HTTP/JSON, CBOR, gRPC, or custom framing | Operations owner | Query semantics, security, SDK maintainers | Before `P12-002` | `P12-001` |
| Timestamp and transaction oracle for local and distributed snapshots | Distributed systems owner | Storage, query semantics, sync | Local decision before `P06-002`; distributed extension before `P19-002` | `P06-001`, `P19-001` |
| Consensus library or implementation strategy | Distributed systems owner | Storage, security, operations | Before any replicated-format implementation; no later than `P17-002` | `P17-001` |
| Vector-index algorithm and persistence format | Query semantics owner | Storage, GPU, operations | Before `P08-018` | `P08-017` |
| String collation and Unicode compatibility model | Query semantics owner | Storage, GPU, adapter/SDK reviewers | Binary v1 scope before `G01`; extended profiles before `P22-022` | `P01-006`, `P22-022` |
| Cross-shard transaction coordinator | Distributed systems owner | Storage, query semantics, operations | Before `P19-002` | `P19-001`–`P19-006` |
| Local-sync version clock and default conflict policy | Sync architecture owner | Distributed systems, query semantics, security | Before accepting offline writes; no later than `P21-010` | `P21-010`–`P21-014` |
| Browser quota, persistence, and eviction user experience | Browser/edge owner | Storage, security, operations | Before browser storage API freeze; no later than `P11-007` | `P11-005`–`P11-009` |
| Tenant GPU accounting and scheduling policy | GPU architecture owner | Security, operations, distributed systems | Before multi-tenant GPU preview; no later than `P23-003` | `P10-018`, `P13-016`, `P23-002`–`P23-003` |

## Decision readiness rule

The owner must open the ADR early enough to gather the evidence listed in the specification and study. Reaching a deadline with insufficient evidence does not authorize an arbitrary default. The dependent task remains open, and the owner records the blocking experiment or missing authority.

Each accepted decision must include:

- Primary owner and recorded reviewers.
- A link to the applicable requirement and plan IDs.
- Considered alternatives and primary-source evidence.
- Compatibility, migration, rollback, security, and operational impact.
- Tests or experiments that make the choice falsifiable.
- Follow-up owners for deferred consequences.

## Maintenance

- Update this register when an owner changes or a new material decision is discovered.
- Add the corresponding ADR to the ADR index when work begins.
- Treat a missed dependency deadline as a phase blocker and surface it in the progress snapshot.
- Do not mark an owner assignment complete by naming an unavailable person; the acting project maintainer remains accountable until the role is accepted.

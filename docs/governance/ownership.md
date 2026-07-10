# Ownership and Review Boundaries

- Status: Active bootstrap ownership map
- Effective date: 2026-07-10

The repository owner `@alextis59` is the acting project maintainer and fallback owner until roles are delegated. A role assignment transfers day-to-day review responsibility but not the requirement for cross-domain review at phase gates.

## Domain ownership

| Domain | Acting owner | Required review focus | Planned repository areas |
| --- | --- | --- | --- |
| Product and governance | Project maintainer | Scope, specifications, ADRs, plan, claims, release approval | Root project docs, `docs/governance/`, `docs/adr/` |
| Semantics and compatibility | Query semantics owner | Types, queries, errors, indexes, adapters, SDK conformance | `conformance/semantics/`, query crates, compatibility docs |
| Formats and storage | Storage architecture owner | HDoc, WAL, manifests, SST/VLOG/CSEG/IDX, MVCC, recovery | Format docs/fixtures, storage crates, crash tests |
| Wasm and platform hosts | Runtime architecture owner | Component ABI, capability isolation, buffers, async, portability | Core/runtime crates, native/browser/mobile/edge hosts |
| CPU and GPU execution | GPU architecture owner with query reviewer | Sidecars, kernels, exactness, cost model, fallback, quotas | Columnar/GPU crates, `shaders/`, differential benchmarks |
| Distribution | Distributed systems owner | Consensus, ranges, routing, movement, transactions, regions | Replication/router/meta crates, distributed tests |
| Local sync and cache | Sync architecture owner with storage reviewer | TTL, eviction, streams, resume, offline conflicts | Cache/sync crates, browser/edge sync tests |
| Security | Security owner | Authn/authz, encryption, secrets, plugins, tenant/GPU isolation | Security crates/docs/tests, threat models |
| Operations | Operations owner | Protocol, telemetry, admin, backup, upgrades, orchestration, SLOs | Server/operator crates, operational docs/tests |
| Release engineering | Release owner | CI, packages, provenance, SBOM, install and artifact proof | CI config, packaging, release evidence |

The acting owner for every unfilled role is the project maintainer named above.

## Cross-domain review triggers

- Persistent-format changes require storage, query semantics, operations, and security review.
- Public-protocol or SDK changes require query semantics, compatibility, security, and operations review.
- GPU-kernel changes require GPU, query semantics, security, and performance review.
- Replicated-command or range changes require distributed, storage, operations, and upgrade review.
- Cache/TTL changes require storage, sync, backup, and compatibility review.
- Authentication, authorization, key, plugin, or tenant changes require security review regardless of owning directory.
- Release-claim changes require the evidence owner for the claimed property.

## Escalation

When owners disagree, the applicable normative requirement remains unchanged until an ADR resolves the conflict. The project maintainer cannot resolve a correctness or security objection by silently lowering a guarantee; that requires the normal scope/change process.

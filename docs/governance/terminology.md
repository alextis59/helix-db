# HelixDB Development Identity and Terminology

- Status: Accepted development baseline
- Effective date: 2026-07-10
- Decision: [ADR 0001](../adr/0001-public-product-identity.md)
- Public-name review: `P16-016`

The project owner has directed the repository to keep **HelixDB** and `helix-db` for development now and reconsider an alternative before public v1 publication. This document freezes internal terminology sufficiently to implement the project without claiming unoccupied public registry identities.

## Identity boundary

- **HelixDB** is the development product name and documentation name.
- **`helix-db`** is the current repository slug.
- These names are not represented as clear or exclusive public trademarks, registry namespaces, or package coordinates.
- The project must not publish to the existing `helix-db` npm package, `helix-db` crates.io package, or `@helix-db` npm scope.
- Public naming and package coordinates are a release blocker under `P16-016` and must be resolved before `P16-015` publishes a release candidate.
- The source transcript remains unchanged if the project later renames.

## Development identifier matrix

| Surface | Development identifier | Publication rule |
| --- | --- | --- |
| Product/documentation | `HelixDB` | Development name; re-evaluate under `P16-016` |
| Repository | `helix-db` | Keep current remote until an authorized rename |
| Rust workspace packages | `helix-*` | Set `publish = false` until `P16-016` assigns clear coordinates |
| TypeScript workspace packages | `@helix-db-internal/*` | Set `private: true`; never publish this scope |
| CLI | `helix` | Development binary; public collision review required |
| Server daemon | `helixd` | Development binary; public collision review required |
| Portable core | `helix-core.wasm` / `helix-core` | Development artifact/crate name |
| Native host | `helix-host` | Development component name |
| GPU subsystem | `helix-gpu` | Development component name |
| Router | `helix-router` | Development component name |
| Metadata service | `helix-meta` | Development component name |
| Sync service | `helix-sync` | Development component name |
| Native protocol/profile | `helix.internal.v0` | Explicitly non-public/unstable; public v1 identity deferred |
| Environment variables | `HELIX_*` | Development prefix; migration required if renamed |
| Telemetry namespace | `helix.*` | Development namespace; no public stability promise |
| Configuration file | `helix.toml` | Development name |
| Local data/config directory | `.helix` where platform conventions permit | Development name; migration required if renamed |
| Local container tag | `helix-db:dev` | Must not be presented as an official public image |
| Kubernetes API group | Unassigned | Requires a controlled public domain under `P16-016` |

## Technical terms

| Term | Meaning |
| --- | --- |
| **HDoc** | **Hybrid Document**, the canonical typed row representation. The name is deliberately product-neutral. |
| **Field-path dictionary** | Versioned collection mapping from dotted field paths to stable, non-reused IDs. |
| **Sidecar / CSEG** | Rebuildable typed columnar segment derived from canonical HDoc rows. |
| **WAL** | Write-ahead log containing replayable canonical mutations and transaction boundaries. |
| **SST** | Immutable sorted-table artifact for keys and small values. |
| **VLOG** | Value-log artifact for large canonical document values. |
| **IDX** | Secondary/vector index artifact or segment. |
| **MANIFEST** | Versioned atomic inventory of reachable storage artifacts and state. |
| **Range** | Key interval and, after distribution, the unit of replication, placement, split, and movement. |
| **Exact GPU operator** | Kernel whose output is a final semantic match set under its pinned representation/capability profile. |
| **Candidate GPU operator** | Kernel whose output must pass final CPU verification. |
| **Storage class** | Explicit `durable`, `cache`, `local_replica`, or `memory_only` policy. |

## Language conventions

- Use **WebAssembly** for the platform and **Wasm** as the short adjective/noun.
- Use **WebGPU** for the API and **WGSL** for its shader language.
- Use **NoSQL**, not “NO SQL.”
- Use **MongoDB-inspired** for native query syntax.
- Use **MongoDB-like adapter** or **Redis-like adapter** only with a linked executable compatibility matrix.
- Use **CPU fallback** for a complete supported execution path, not an error-only stub.
- Use **source of truth** only for canonical HDoc rows and authoritative metadata, never for sidecars or caches.
- Distinguish **logical expiry** from later **physical reclamation**.
- Distinguish **acknowledged**, **durable**, **committed**, and **applied** according to the selected concern.

## Rename constraints

If `P16-016` selects another public name, one reviewed migration change must update or explicitly preserve:

- Repository and documentation identity.
- Workspace/package names and publication metadata.
- CLI, daemon, container, SDK, operator, protocol/profile, configuration, environment, and telemetry identifiers.
- Local path/config migration and compatibility aliases where needed.
- Build, package, install, backup, upgrade, and rollback documentation.
- ADR/evidence/requirement/plan references.

HDoc remains “Hybrid Document” unless a separate format ADR changes it. Existing development artifacts carry no public compatibility promise, but rename tooling must still preserve developer data or state exactly when the project claims it will.

# Repository Layout and Artifact Boundaries

- Status: Accepted layout baseline; most implementation areas remain empty
- Last updated: 2026-07-12
- Owner: Runtime architecture owner
- Plan items: `P02-004`; examples activated by `P02-016`; WIT authority revised through `P04-009`
- Governing gate: `G02`
- Design source: [Study section 24](../../Study.md#24-suggested-initial-repository-architecture)
- Ownership source: [Ownership and review boundaries](../governance/ownership.md)

This document establishes stable, reviewable locations for source code, conformance assets, benchmarks, tests, examples, documentation, and release evidence. A tracked directory proves only that its boundary exists. The Phase 1 semantic corpus, eight Rust boundary crates, and two toolchain examples are executable authorities within their stated limits; none claims implemented database behavior.

## Tracked roots

| Root | Purpose | Initial tracked children | Current maturity |
| --- | --- | --- | --- |
| [`crates/`](../../crates/README.md) | Rust workspace source | Eight boundary crates from `P02-001` | Compilable boundary skeletons |
| [`shaders/`](../../shaders/README.md) | Internal WGSL source and shader fixtures | `predicates/`, `bitmaps/`, `vectors/`, `fixtures/` | Compile-only validation fixtures; no product kernels |
| [`packages/`](../../packages/README.md) | Private npm workspace packages | `sdk-typescript/`, `browser-host/` | Reserved directories; not npm packages yet |
| [`wit/`](../../wit/README.md) | Versioned WebAssembly Interface Type packages | `helix-core-abi-v1/` through `helix-core-abi-v7/` | Immutable ABI 1.0–6.0 plus current deterministic-injection ABI 7.0; bindings/hosts remain absent |
| [`conformance/`](../../conformance/README.md) | Cross-backend suite definitions and fixture bindings | `semantics/`, `formats/`, `host/`, `compatibility/` | Semantic corpus binding only |
| [`benchmarks/`](../../benchmarks/README.md) | Reproducible datasets, workloads, schemas, runners, and report indexes | `datasets/`, `workloads/`, `schema/`, `cpu-columnar/`, `webgpu/`, `reports/` | One integrity-only harness calibration; no database performance claim |
| [`tests/`](../../tests/README.md) | Toolchain and cross-crate/system tests | `toolchain/`, `integration/`, `fuzz/`, `crash/`, `differential/`, `browser/`, `distributed/` | Toolchain/unit/conformance commands plus explicit reserved system-test contracts |
| [`docs/`](../README.md) | Project documentation | Architecture, governance, quality, compatibility, ADRs, and future document classes | Active documentation system |
| [`examples/`](../../examples/README.md) | Minimal runnable usage and toolchain examples | `native-toolchain/`, `browser-toolchain/`, `examples.json` | Executable native/browser boundary examples; database functionality explicitly false |
| [`evidence/releases/`](../../evidence/releases/README.md) | Immutable release proof indexes | One child per release candidate or published version | Empty contract; no release artifacts |

The existing [`fixtures/`](../../fixtures/README.md), [`reference/`](../../reference/semantic-oracle/README.md), [`differential/`](../../differential/mongodb/README.md), [`compatibility/`](../../compatibility/v1/README.md), and task-scoped [`evidence/`](../../evidence/README.md) roots remain authoritative for the Phase 1 assets already committed. They are not moved merely to make the proposed tree visually uniform.

## Boundary rules

1. **Source is not evidence.** Source and test inputs live in the owning root; retained proof lives under `evidence/` or an approved immutable artifact store indexed from there.
2. **Conformance has one canonical input.** A suite under `conformance/` references canonical fixtures and schemas. It must not copy semantic cases into a second mutable corpus.
3. **Generated output is not source.** Rust targets, JavaScript dependencies/bundles, test reports, coverage, browser caches, and local benchmark output remain ignored unless a task deliberately promotes a compact artifact into evidence.
4. **Packages are private until proven.** The reserved package directories do not contain `package.json` files and therefore are not publishable workspaces. Public identity and coordinates remain blocked by `P16-016`.
5. **Shaders are internal.** Only repository-owned, bounded, versioned kernels may be added. Client-submitted WGSL is prohibited by `INV-006`.
6. **Benchmarks do not create claims.** The [foundation result contract](../quality/benchmark-results.md) is explicitly ineligible for a database claim. A later benchmark result supports a claim only through the environment, dataset, raw-result, and review requirements in the [evidence guide](../../evidence/README.md#benchmark-specific-rules).
7. **Tests are organized by failure boundary.** Unit tests stay beside their implementation where idiomatic; the top-level `tests/` tree is for cross-component, process, browser, and cluster behavior.
8. **Examples disclose maturity.** [`examples.json`](../../examples/examples.json) binds commands, sources, outputs, and the shared non-claim. An example may prove a toolchain or API slice but must not imply durability, compatibility, security, or production readiness beyond its linked evidence.
9. **WIT packages are ABI authorities.** Existing package versions are immutable in meaning;
   incompatible changes add a version, compatibility matrix, bindings, conformance, and evidence.

## Change rule

New top-level roots require a documented ownership and artifact-retention boundary. Renaming or combining one of these roots updates workspace configuration, CODEOWNERS, this document, clean-bootstrap guidance, and all affected evidence links in one reviewed change. Empty future areas remain tracked by a README so their intended scope and unimplemented status are explicit.

# Documentation Guide

This directory is the entry point for HelixDB project documentation. HelixDB/`helix-db` is the accepted development identity; a conflict-free public name and package matrix are reconsidered before v1 publication under `P16-016`.

## Authority and provenance

| Document | Role |
| --- | --- |
| [Specifications](../Specifications.md) | Normative product and technical contract |
| [Implementation plan](../ImplementationPlan.md) | Progress authority and gate ledger |
| [Study](../Study.md) | Feasibility analysis, risks, experiments, and recommendations |
| [Source transcript](chatgpt-database-system-with-webgpu-transcript.md) | Archived provenance, not active instructions |
| [Change control](governance/change-control.md) | Rules for changing normative behavior and contracts |
| [ADR index](adr/README.md) | Material technical/product decisions and alternatives |
| [Requirement ledger](governance/requirements.md) | Requirement-to-task/test/evidence traceability |
| [Evidence guide](../evidence/README.md) | Durable task and gate proof conventions |
| [Reference semantic oracle](../reference/semantic-oracle/README.md) | Independent executable semantic baseline and report commands |
| [Initial MongoDB differential result](compatibility/mongodb-initial-differential.md) | Experimental `P01-021` overlap/difference evidence; not a public compatibility claim |
| [V1 semantic and compatibility matrix](compatibility/v1-semantic-compatibility-matrix.md) | Versioned closed-world `P01-022` publication of semantic maturity and unsupported behavior |
| [Rust workspace boundaries](architecture/workspace-boundaries.md) | Initial unpublished crate graph, dependency direction, and boundary-only maturity contract |
| [Rust toolchain policy](architecture/rust-toolchain-policy.md) | Exact Rust/MSRV pin, components, formatter/linter baseline, and Wasm target/promotion rules |
| [JavaScript/TypeScript toolchain policy](architecture/javascript-toolchain-policy.md) | Node/npm support window, lockfile, compiler, bundler, test runner, and browser harness |
| [Repository layout](architecture/repository-layout.md) | Tracked source, conformance, benchmark, test, example, and release-evidence boundaries |
| [Build profiles](architecture/build-profiles.md) | Native, Wasm, browser, sanitizer, coverage, and benchmark build contracts |
| [Code quality and dependency policy](architecture/code-quality-and-dependency-policy.md) | Formatting, lints, warnings, unsafe review, dependency sources, licenses, and lifecycle scripts |
| [Stable test command surface](quality/test-command-surface.md) | Versioned unit, integration, conformance, fuzz, browser, crash, benchmark, and distributed entry points |
| [Deterministic fixture generation](quality/deterministic-fixture-generation.md) | Generator registry, seed/PRNG contract, schemas, byte identities, and external-artifact boundary |
| [Continuous integration matrix](architecture/continuous-integration.md) | Gating/nightly OS, architecture, target, Node, browser, action-pin, and trust boundaries |
| [Wasm/component/browser smoke validation](architecture/wasm-browser-smoke-validation.md) | Pinned component validator, browser core module, Vite artifact, and real-engine execution boundaries |
| [WGSL fixture validation](architecture/wgsl-fixture-validation.md) | Hash-bound trusted shaders, Dawn/SwiftShader parsing, validation, compilation, and security boundaries |
| [Dependency security reporting](architecture/dependency-security-reporting.md) | Deterministic lock/license/duplicate inventory plus dated vulnerability, signature, and provenance observations |
| [Rust product code coverage policy](quality/code-coverage-policy.md) | Compiler-matched LLVM reporting, explicit product/test classification, and workspace/critical thresholds |
| [Benchmark result and retention contract](quality/benchmark-results.md) | Versioned workload/raw/summary schemas, complete stage reporting, and the non-gating retained baseline |
| [CI artifact retention and durable promotion](quality/artifact-retention.md) | Versioned replay/browser bundles, reserved future classes, failure uploads, expiry, sensitivity, and durable evidence promotion |

When documents conflict, follow the authority order defined by change control rather than treating the newest file as automatically correct.

## Documentation structure

The repository uses the following structure as implementation lands:

```text
docs/
  README.md
  adr/                    architecture decision records
  architecture/           component, data-flow, deployment, and dependency design
  formats/                HDoc, WAL, MANIFEST, SST, VLOG, CSEG, IDX, backup, protocol formats
  api/                    native API, SDK, embedded, server, and error contracts
  operations/             configuration, admin, telemetry, backup, restore, upgrade, runbooks
  security/               threat models, trust boundaries, controls, disclosure guidance
  quality/                test strategy, conformance, benchmarks, compatibility, release gates
  compatibility/          MongoDB-like/Redis-like matrices, migrations, known differences
  releases/               version support, release notes, upgrade and rollback guidance
  governance/             scope, ownership, change control, severity, evidence policy
  chatgpt-...transcript.md source-session archive
```

Directories are created when their first substantive document is added. Placeholder files must not imply an unimplemented design is complete.

## Required document metadata

Normative, architectural, format, API, security, operational, compatibility, and release documents begin with enough metadata to establish:

- Title.
- Status: Draft, Proposed, Accepted/Approved, Deprecated, or Superseded.
- Last-updated or effective date.
- Owning role.
- Applicable version, phase, task, or gate.
- Superseding/superseded document where relevant.

Generated reference documentation instead identifies its generator, source version, and reproduction command.

## Content boundaries

### Architecture

Architecture documents explain component responsibilities, invariants, interfaces, dependencies, data flows, deployment modes, and failure boundaries. A material choice links to its accepted ADR.

### Formats

Every persistent or public format document includes:

- Version and feature-negotiation rules.
- Byte or field layout.
- Canonicalization and validation.
- Limits and malformed-input behavior.
- Checksums/hashes and corruption handling.
- Golden fixtures.
- Reader/writer compatibility.
- Migration, interruption, downgrade, and rollback behavior.

### API and SDK

API documentation defines request/response/error semantics, limits, sessions, concerns, cancellation, feature negotiation, streaming, and unsupported behavior. SDK docs link to shared conformance instead of redefining server semantics.

### Operations

Operational docs contain real commands, configuration precedence, safe defaults, expected outputs, health/metrics, capacity limits, backup/restore, upgrade/rollback, incident behavior, and validation steps.

### Security

Security docs identify assets, actors, trust boundaries, capabilities, threats, controls, residual risks, key/secrets behavior, audit events, and review status. Sensitive exploit evidence follows restricted retention policy.

### Quality and compatibility

Quality docs link claims to executable tests and evidence. Compatibility matrices name the exact adapter/upstream versions and label behavior exact, different, unsupported, or experimental.

### Releases

Release docs state supported platforms/versions, artifacts/digests, known issues, compatibility, migration, rollback boundary, security notices, and proof links.

## Writing and linking rules

- Use repository-relative Markdown links for repository documents.
- Link to authoritative definitions instead of copying them into several files.
- Use stable requirement, task, gate, experiment, ADR, format, protocol, and error IDs.
- Label proposed behavior as proposed; do not write future design in the present tense as if implemented.
- Include explicit unsupported and failure behavior.
- Do not include secrets, private data, mutable artifact links as sole evidence, or unverified benchmark claims.
- Keep examples executable or validate them through documentation tests once the toolchain exists.

## Review and maintenance

Documentation changes follow [CONTRIBUTING.md](../CONTRIBUTING.md) and the domain owners in [governance/ownership.md](governance/ownership.md). A behavior change updates its documentation, tests, traceability, and implementation-plan state in the same coherent step.

Broken-link, generated-doc drift, example, and metadata checks will be added to CI under Phase 2. Until then, each documentation commit performs an explicit local link and whitespace check.

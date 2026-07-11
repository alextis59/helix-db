# helix-db

HelixDB is the development name for a portable document database with a deterministic Wasm core, a durable LSM-like row store, typed columnar sidecars, adaptive CPU/WebGPU query execution, and later distributed, cache, and local-sync operating modes.

The project owner has chosen to keep `helix-db` during development. Existing database projects and registry packages already use HelixDB identifiers, so public naming/package coordinates must be re-evaluated before v1 publication under `P16-016`.

## Project documents

- [Specifications](Specifications.md) — normative product and technical contract.
- [Study](Study.md) — architecture and feasibility analysis.
- [Implementation plan](ImplementationPlan.md) — complete checklisted implementation ledger.
- [Reference semantic oracle](reference/semantic-oracle/README.md) — executable v1 fixture semantics and deterministic report.
- [Initial MongoDB differential harness](differential/mongodb/README.md) — pinned upstream observations for the first declared overlap and differences.
- [V1 semantic and compatibility matrix](docs/compatibility/v1-semantic-compatibility-matrix.md) — closed-world native maturity and explicit unsupported MongoDB surface.
- [Rust workspace boundaries](docs/architecture/workspace-boundaries.md) — initial unpublished crate graph and dependency rules.
- [Rust toolchain policy](docs/architecture/rust-toolchain-policy.md) — exact compiler/MSRV, components, formatter/linter, and Wasm target status.
- [JavaScript/TypeScript toolchain policy](docs/architecture/javascript-toolchain-policy.md) — Node/npm window, lockfile, compiler, bundler, test runner, and browser harness.
- [Repository layout](docs/architecture/repository-layout.md) — tracked source, conformance, benchmark, test, example, and evidence boundaries.
- [Build profiles](docs/architecture/build-profiles.md) — native, Wasm, browser, sanitizer, coverage, and benchmark build contracts.
- [Code quality and dependency policy](docs/architecture/code-quality-and-dependency-policy.md) — formatting, lints, warnings, unsafe review, sources, licenses, and lifecycle scripts.
- [Stable test command surface](docs/quality/test-command-surface.md) — maturity-labeled unit, integration, conformance, fuzz, browser, crash, benchmark, and distributed entry points.
- [Deterministic fixture generation](docs/quality/deterministic-fixture-generation.md) — versioned generators, committed seeds, artifact schemas, and byte-for-byte checks.
- [Continuous integration matrix](docs/architecture/continuous-integration.md) — fixed gating/nightly platforms, targets, Node lines, browser inventories, and action pins.
- [Documentation guide](docs/README.md) — documentation authority and structure.
- [Contributing](CONTRIBUTING.md) — contribution, review, commit, and release workflow.

Implementation is currently in the foundation toolchain phase. The Rust crates are boundary-only `0.0.0` skeletons, and the reference oracle and MongoDB differential harness are test authorities. None is a storage engine, adapter, or production database; the broader documentation describes intended work and must not be read as a claim that database functionality already exists.

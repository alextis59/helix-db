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
- [Documentation guide](docs/README.md) — documentation authority and structure.
- [Contributing](CONTRIBUTING.md) — contribution, review, commit, and release workflow.

Implementation is currently in the foundation semantic-contract phase. The reference oracle and initial MongoDB differential harness are test authorities, not a storage engine, adapter, or production database; the broader documentation describes intended work and must not be read as a claim that database functionality already exists.

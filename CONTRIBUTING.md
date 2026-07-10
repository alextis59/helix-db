# Contributing to HelixDB

HelixDB is developed against [Specifications.md](Specifications.md), analyzed in [Study.md](Study.md), and tracked through [ImplementationPlan.md](ImplementationPlan.md). Read the applicable requirements, phase dependencies, and gate evidence before changing behavior.

## Contribution principles

- Correctness, recoverability, explicit semantics, and security take priority over feature breadth and benchmark results.
- The canonical HDoc row representation remains authoritative; derived indexes and sidecars must be rebuildable.
- CPU behavior is the semantic reference for optimized CPU, GPU, adapter, and distributed paths.
- Unsupported behavior returns a typed error instead of an approximation.
- Persistent formats and public protocols are versioned from their first committed fixture.
- A checked plan item means implementation, tests, documents, and durable evidence are complete.

## Before starting work

1. Locate the stable task ID in `ImplementationPlan.md`.
2. Confirm that its dependency gates are closed.
3. Read the mapped rows in [the requirement ledger](docs/governance/requirements.md).
4. Check [the ADR index](docs/adr/README.md) for accepted or open decisions.
5. Add a new unchecked task if the work reveals a distinct requirement not already tracked.
6. Do not freeze an undecided public or persistent contract merely to unblock implementation.

## Branch and commit policy

- Use a focused branch for normal collaborative work: `feature/<task-id>-<summary>`, `fix/<task-id>-<summary>`, or `docs/<task-id>-<summary>`.
- Keep `main` releasable. Before the first external preview, enable branch protection, required checks, review, and non-force-push policy on the remote.
- During single-maintainer bootstrap, direct local commits are permitted when the user explicitly requests stepwise commits; each commit must still pass the same focused validation and remain independently reviewable.
- Do not force-push shared branches or rewrite published release history.
- Use one implementation-plan item per commit unless two items are technically inseparable; explain any exception in the commit and evidence record.
- Include the checklist state, focused tests, documentation, and evidence for a completed item in the same commit.
- Never check a gate in a feature-only commit. Gate commits contain or link the complete reviewed evidence set.

Commit subjects use an imperative Conventional Commit-style prefix where practical:

```text
feat: implement HDoc scalar encoding
fix: preserve snapshots during compaction
test: add GPU device-loss replay
docs: define storage format change control
```

## Change preparation

Changes that affect behavior, formats, protocols, architecture, compatibility, or release scope follow [Specification and Change Control](docs/governance/change-control.md).

An accepted ADR is required before implementing a material undecided contract. Implementation experiments may precede acceptance only when they remain private, reversible, and clearly marked non-production.

## Required change contents

A complete change includes, as applicable:

- Implementation code with bounded resource and failure behavior.
- Unit and integration tests.
- Semantic/conformance fixtures.
- Recovery, fault-injection, and corruption tests.
- CPU/reference or compatibility differential tests.
- Security and isolation tests.
- Reproducible benchmark artifacts when performance is claimed.
- Format/protocol versions, migration, and rollback behavior.
- API, architecture, operations, and troubleshooting documentation.
- Requirement-ledger and implementation-plan updates.

Generated artifacts identify their generator and are reproducible from a committed command. Do not hand-edit generated output.

## Validation order

Run the narrowest useful test first, then every affected broader suite:

1. Formatter and static checks.
2. Focused unit tests.
3. Semantic or format conformance.
4. Integration and recovery tests.
5. CPU/GPU or adapter differential tests.
6. Security and resource-limit tests.
7. Browser or distributed tests when affected.
8. Package/install/restore proof when a user-facing artifact changes.

Exact commands will be established by `P02-*` and documented in the repository bootstrap guide. Until then, record every manual verification command in the commit handoff.

## Review requirements

Every review checks:

- The task's dependencies and scope.
- Normative semantic and compatibility effects.
- Data-loss and crash behavior.
- Security, capability, and tenant boundaries.
- Resource limits and cancellation.
- Persistent/public versioning and migration.
- Observability and typed failure reasons.
- Test quality, including failure cases and real artifacts.
- Checklist and traceability accuracy.

Material changes require review from the corresponding role in [Ownership and Review Boundaries](docs/governance/ownership.md). A single maintainer may act in several roles during bootstrap, but phase gates require a distinct recorded review pass.

## Release approval

A release candidate is approved only when:

- Its implementation-plan gate is checked from published artifacts.
- Requirement traceability is complete for the release scope.
- Correctness, recovery, security, compatibility, operations, performance, and release owners record sign-off.
- Critical/high data-loss, correctness, and security issues are resolved.
- Accepted residual risks have owners, impact, workarounds, and release-note entries.
- Clean installation, upgrade, backup, restore, and rollback evidence exists.

The project maintainer performs promotion only after all required domain approvals. A tag, package upload, or green build alone is not release approval.

## Reporting security issues

Do not open public issues containing exploitable vulnerabilities, secrets, private data, or key material. Until a dedicated security contact is published under `P13-020`, contact the repository owner privately through the GitHub account associated with this repository.

## Licensing

Contributions are accepted under the repository's [MIT License](LICENSE). Contributors must have the right to submit their code, fixtures, shaders, and benchmark data and must record any required third-party notices.

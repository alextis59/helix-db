# Specification and Change Control

- Status: Approved
- Effective date: 2026-07-10
- Applies to: product behavior, persistent formats, protocols, architecture, security, compatibility, releases, and implementation progress

## Document authority

Project documents have distinct roles:

1. [Specifications.md](../../Specifications.md) is the normative product and technical contract.
2. Accepted architecture decision records explain why a choice was made and constrain its implementation. An ADR that changes normative behavior must update the specification in the same change.
3. [ImplementationPlan.md](../../ImplementationPlan.md) is the progress authority. It maps normative requirements to dependency-ordered work and evidence gates.
4. [Study.md](../../Study.md) is analytical. It records feasibility conclusions, risks, experiments, and recommendations but does not override the specification.
5. The [source transcript](../chatgpt-database-system-with-webgpu-transcript.md) is provenance. It is not an active instruction surface after the specification is adopted.
6. Code, tests, fixtures, packages, and operational artifacts are implementation evidence. They must conform to the documents above; their existence alone does not redefine the contract.
7. README files and generated reference pages are explanatory entry points. They must link to, not replace, authoritative documents.

When two sources conflict, work stops at the conflict boundary until the higher-authority document or an accepted change resolves it. The implementation must not silently choose whichever behavior is easiest.

## Change classes

### Normative behavior change

Examples include query semantics, consistency, durability, security defaults, storage-class behavior, compatibility claims, public errors, or deployment guarantees.

Required in one reviewed change:

- Motivation and impact analysis.
- An ADR when the change involves a material choice or tradeoff.
- Specification update.
- Semantic, compatibility, recovery, or security fixture updates as applicable.
- Implementation-plan tasks, dependencies, counts, and gate updates.
- Requirement traceability update.
- Migration, rollback, and release-note impact.

### Persistent format or protocol change

Examples include HDoc, WAL, manifest, SST, VLOG, CSEG, IDX, backup, replicated command, change stream, kernel metadata, or client protocol changes.

In addition to the normative-change requirements, the change must include:

- Old and new version identifiers.
- Reader/writer compatibility behavior.
- Golden fixtures for every affected version.
- Unknown-version rejection behavior.
- Upgrade, interruption, downgrade, and rollback tests.
- A declaration of the point after which rollback is unsafe.

### Architecture or dependency change

Examples include the Wasm boundary, storage policy, GPU backend, consensus system, protocol stack, cryptographic provider, or orchestrator.

Required:

- ADR with considered alternatives.
- Security, portability, licensing, operations, and performance consequences.
- Dependency and artifact impact.
- Study update if feasibility conclusions materially change.
- Revalidation of affected release gates.

### Implementation-only change

A change is implementation-only only when observable semantics, formats, errors, compatibility, and operational contracts remain unchanged.

Required:

- Tests proving the unchanged contract.
- Benchmark evidence when the stated purpose is performance.
- No unreviewed persistent bytes or public fields.
- Implementation-plan progress and evidence updates for completed work.

### Documentation correction

Typos and clarifications may avoid an ADR only when they do not alter meaning. If reasonable readers could implement different behavior before and after the edit, it is a normative change.

## Change workflow

1. Identify affected requirement IDs, checklist tasks, formats, APIs, and release gates.
2. Classify the change using this document.
3. Draft the required ADR and authoritative-document updates before implementation freezes a choice.
4. Add or update executable fixtures and failure cases.
5. Implement the smallest coherent change.
6. Run focused tests, then all affected conformance, recovery, security, compatibility, and benchmark suites.
7. Record commands, results, artifact hashes, and review decisions in the evidence index.
8. Update checklist states and progress counts only after proof passes.
9. Commit the coherent step with its code, tests, documents, and evidence.
10. Close a phase gate only after independent review of every required artifact.

## Review and acceptance

- Project maintainers accept normative documents and ADRs.
- The owner of each affected quality domain reviews its evidence: correctness, security, operations, compatibility, performance, or release engineering.
- The same person may implement and review during early single-maintainer development, but phase gates require a distinct recorded review pass, even if performed later.
- Open critical or high-severity data-loss, correctness, or security findings block acceptance.
- Benchmark improvements never waive semantic or recovery failures.

An ADR is accepted only when its status is `Accepted` and every required companion update is committed. A proposed ADR may guide experiments but cannot freeze public or persistent contracts.

## Emergency changes

An emergency may temporarily disable a feature, kernel, adapter, node role, or protocol version to protect data or security. It may not silently reinterpret stored data or query semantics.

The emergency change must:

- Use an explicit feature disablement or typed error.
- Preserve a rollback path where safe.
- Record the incident, affected versions, and user impact.
- Add a follow-up checklist item and owner.
- Complete the normal documentation, fixture, and review steps before permanent acceptance.

## Checklist discipline

- Task IDs are stable historical references.
- Removed or superseded tasks remain discoverable through an ADR and plan edit.
- New findings become new unchecked tasks; they are not hidden inside a completed item.
- A task is checked in the same commit that makes its proof durable.
- A gate is never checked merely because all feature code merged; its stated evidence must pass from real artifacts.

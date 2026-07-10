# ADR 0000: Decision title

- Status: Proposed
- Date: YYYY-MM-DD
- Decision owner: Role or maintainer
- Required before: Checklist item, gate, API freeze, or release
- Supersedes: None
- Superseded by: None

## Context

Describe the problem, constraints, affected users and operators, and why a decision is required now. Link the applicable specification requirements, study conclusions, implementation-plan tasks, experiments, and prior ADRs.

## Decision drivers

- Correctness and data-loss risk.
- Semantic and compatibility requirements.
- Portability and capability constraints.
- Security and isolation.
- Performance and resource behavior.
- Operational complexity and diagnosability.
- Upgrade, rollback, and long-term maintenance.
- Licensing and dependency policy.

Remove irrelevant generic drivers and add decision-specific ones.

## Considered options

### Option A — Name

Describe the option precisely enough to prototype or implement.

Advantages:

- Advantage.

Disadvantages:

- Disadvantage.

Evidence:

- Experiment, source, benchmark, or prototype.

### Option B — Name

Describe the option precisely enough to prototype or implement.

Advantages:

- Advantage.

Disadvantages:

- Disadvantage.

Evidence:

- Experiment, source, benchmark, or prototype.

## Decision

State the selected option and its required behavior. Include defaults, limits, failure behavior, feature negotiation, and what remains deliberately unspecified.

## Consequences

### Positive

- Consequence.

### Negative

- Consequence.

### Neutral or deferred

- Consequence or follow-up decision.

## Compatibility and migration

Describe effects on:

- Persistent formats and their versions.
- Public protocols and SDKs.
- Query or transaction semantics.
- Compatibility adapters.
- Existing data, backups, and restore.
- Rolling upgrade and downgrade.

State the migration procedure and the exact rollback boundary. If there is no persistent or public impact, say why.

## Security and operations

Describe capability changes, new trust boundaries, secrets, quotas, observability, incident behavior, and operational procedures.

## Validation plan

- [ ] Unit and conformance tests.
- [ ] Failure, recovery, and rollback tests.
- [ ] Security tests or review.
- [ ] Compatibility or differential tests.
- [ ] Performance experiments with raw artifacts.
- [ ] Clean install, upgrade, or restore proof where applicable.

Replace this generic list with decision-specific evidence before acceptance.

## Implementation impact

List affected crates, packages, formats, protocols, documents, checklist tasks, gates, and owners.

## Follow-up work

- [ ] Add a stable task ID and owner for each unresolved consequence.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- Additional primary sources and experiment artifacts.

# Finding Severity and Stop-Ship Policy

- Status: Approved
- Effective date: 2026-07-10
- Applies to: correctness, durability, security, compatibility, operations, performance, and release evidence

This policy classifies defects and defines which findings block task completion, phase gates, releases, or production rollout. Severity reflects the worst credible impact under supported use, not the ease of reproducing or fixing the issue.

## Severity levels

### Critical

A critical finding can plausibly cause one or more of:

- Loss, silent corruption, unauthorized disclosure, or unrecoverable unavailability of durable data under a promised configuration.
- Violation of an advertised linearizability, snapshot, transaction, or acknowledgement guarantee with no reliable detection.
- Remote unauthenticated code execution, privilege escalation to cluster/tenant administration, broad authentication bypass, or extraction of key material.
- Cross-tenant data access or GPU/storage buffer leakage.
- Backup/restore or upgrade behavior that destroys the only valid recovery path.
- A released persistent-format or replicated-command incompatibility that can split or corrupt supported deployments.
- Release artifacts that contain secrets, malicious/untrusted code, or cannot be linked to reviewed source.

Critical findings block the affected task, every dependent gate, every release, and production rollout. An already released affected feature is disabled or patched through the emergency-change process.

### High

A high finding can plausibly cause:

- Data loss, incorrect results, duplicate/lost accepted mutations, snapshot anomalies, or index/sidecar omission under a supported but bounded scenario.
- Authentication, authorization, isolation, encryption, quota, or sandbox bypass with meaningful preconditions.
- A crash loop, restore failure, migration dead end, or distributed availability failure within a promised fault model.
- Silent CPU/GPU, embedded/server, SDK, or compatibility divergence for supported behavior.
- A package, protocol, or upgrade incompatibility that breaks supported users without a safe documented recovery.
- Resource exhaustion allowing one request or tenant to deny service outside documented limits.
- A performance regression that violates an explicit SLO or makes a documented supported workload operationally unusable.

High findings block the affected task, dependent phase gates, release candidates, and promotion. They cannot be deferred from a release whose advertised behavior they affect.

### Medium

A medium finding causes material but bounded impact, such as:

- A wrong result that is detected and returned as a typed failure before use.
- Failure of a non-default or non-critical operation with a safe retry or workaround.
- Incomplete diagnostics that materially slows recovery but does not hide data loss or security impact.
- Compatibility divergence in a documented experimental or non-default subset.
- Resource/performance behavior outside targets without violating an explicit release claim or SLO.
- Upgrade, backup, browser, GPU, or adapter limitations with safe fallback and clear documentation.

Medium findings block the individual checklist task when the task promises the affected behavior. They may be deferred from a broader gate only with an owner, target phase, documented impact/workaround, tests preventing regression, and explicit gate-review acceptance.

### Low

A low finding has limited impact and no credible data-loss, security, semantic, compatibility, or operational-safety consequence. Examples include minor diagnostic wording, documentation presentation, non-material inefficiency, or a usability issue with an obvious safe workaround.

Low findings do not automatically block a gate, but they require tracking, ownership or explicit closure, and release-note inclusion when user-visible.

## Category-specific rules

### Correctness and data durability

- Silent incorrect results are at least High.
- Loss of data acknowledged under the selected concern is Critical.
- CPU/GPU or row/index/sidecar divergence is at least High for a supported operator.
- A detected corrupt artifact with a safe, documented recovery may be Medium; accepting it as valid is Critical or High.
- A non-replayable correctness failure remains open even if it cannot be reproduced manually.

### Security and privacy

- Score impact using the credible supported deployment, not only the reporter's environment.
- Secrets, exploit details, and private data follow restricted evidence handling.
- Authentication/authorization bypass, cross-tenant access, key exposure, and arbitrary client shader execution are Critical or High.
- Missing hardening without a reachable exploit may be Medium, but becomes blocking before the affected remote/multi-tenant feature ships.

### Compatibility

- Silent reinterpretation is at least High.
- Explicit unsupported errors matching the published matrix are not defects.
- A mismatch in a claimed green matrix cell is High unless the affected feature is clearly experimental and safely fails.
- Unqualified marketing claims that exceed executable coverage block release until corrected.

### Performance and resources

- A slower implementation is not automatically a correctness severity.
- Unbounded memory, disk, GPU, queue, or execution behavior that permits denial of service is evaluated as security/availability impact.
- A GPU plan that loses to CPU but remains correct is Medium when it violates the planner acceptance rule; it is High if it causes an SLO failure or resource outage.
- Benchmark-only regressions never justify weakening semantics, durability, or verification.

### Operations, backup, restore, and upgrade

- A failed clean restore of the only supported backup path is Critical before release.
- A rolling upgrade that can corrupt or permanently split a supported cluster is Critical.
- Missing diagnostics for a safe/recoverable failure are Medium or High depending on recovery impact.
- A runbook step that cannot be reproduced blocks the gate requiring that runbook.

## Stop-ship rules

A task, gate, or release must not close when any of the following applies:

1. An open Critical or High finding affects its scope.
2. Required evidence is missing, irreproducible, corrupted, or tied to a different artifact.
3. A correctness/security test is skipped without an accepted environment limitation and alternate proof.
4. A failure is hidden by changing a claim, expected result, or benchmark after implementation without the normative change process.
5. A persistent/public version, migration, rollback, backup, or restore obligation is unresolved.
6. A compatibility claim lacks an executable matrix and explicit unsupported behavior.
7. A performance claim lacks raw results and the complete end-to-end cost path.
8. A release artifact differs from the artifact that passed validation.

## Deferral requirements

Only Medium and Low findings may normally be deferred. A valid deferral records:

- Stable finding ID and severity rationale.
- Affected requirement, task, gate, release, and users.
- Safe workaround or fallback.
- Owner and target checklist item or release.
- Regression test or detection mechanism.
- Compatibility, migration, and release-note consequences.
- Gate/release reviewer approval.

Severity cannot be lowered solely to permit deferral. Critical/High scope can move to a later release only through an accepted scope-change ADR that removes the affected claim and ensures all reachable behavior fails safely and explicitly.

## Finding lifecycle

```text
Reported
  → Reproduced or bounded
  → Classified
  → Assigned
  → Fixed or formally deferred
  → Focused verification
  → Broader regression verification
  → Reviewed
  → Closed
```

A fix that reveals a distinct problem creates a new finding. It is not absorbed into the original finding without independent severity and ownership.

## Gate and release review

Every gate review lists all open findings in scope, their severity, disposition, owner, and evidence. Release approval independently confirms that:

- No Critical or High finding remains in the advertised scope.
- Deferred Medium/Low findings meet the rules above.
- Fixed findings passed real artifact, recovery, security, or compatibility paths as applicable.
- Published claims match the evidence after all dispositions.

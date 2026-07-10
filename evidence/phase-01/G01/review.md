# G01 Independent Semantic Gate Review

- Gate: `G01`
- Reviewed commit: `79c54e99754a31075ce47d6cd33d4a291be53449`
- Review date: 2026-07-10
- Reviewer: Codex gate-audit pass, performed after the individual Phase 1 task implementations and evidence commits
- Review mode: artifact-first review using independent schema, corpus, oracle, matrix, and live upstream checks
- Verdict: Pass

## Review question

Can Phase 1 close with a frozen, internally consistent v1 semantic subset whose fixtures agree with an independent reference oracle, whose initial upstream observations are reproducible, whose unsupported behavior is explicit, and whose remaining work is owned by later phases rather than hidden as an unresolved semantic decision?

## Acceptance criteria

- Every `P01-001` through `P01-022` item is checked only after a passing evidence manifest and immutable source commit exist.
- Numeric, temporal, string, array, identifier, vector, limit, error, ordering, and fixture-format decisions are accepted and indexed.
- Every semantic architecture contract is marked as an accepted baseline and contains no `TBD`, `TODO`, `FIXME`, open-question, or decision-needed marker.
- The committed semantic corpus is deterministic, schema-valid, complete for the explicit `P01-019` scope, and hash-bound.
- The independent oracle validates and executes every corpus step with no failure or skip.
- The initial MongoDB differential replays against the pinned upstream server/client with every expected exact/different relation accounted for.
- The v1 semantic/compatibility matrix is closed-world, versioned, deterministic, and does not convert experimental equivalence into adapter support.
- Specification and requirement-ledger IDs remain identical, implementation-plan counts reconcile, Markdown links resolve, and all JSON parses.
- Later physical, host, engine, cursor, TTL, GPU, protocol, and adapter obligations remain visibly open.

## Evidence examined

The review read all 22 Phase 1 evidence manifests and verified 167 recorded artifact hashes at their 22 distinct source commits. It also verified the seven committed task-verifier identities, every accepted semantic ADR, every accepted architecture contract, the implementation checklist, the requirement ledger, and all local Markdown links at the reviewed commit.

The executable replay covered:

- 17 semantic fixtures and 313 steps: 313 passed, zero failed, zero skipped;
- 382 independent oracle unit/property/negative assertions and four expectation mutation canaries;
- 23 exact compact limit boundaries, each below/at/above, and 74 registered errors;
- 16 pinned MongoDB 6.0.5 cases: 12 exact and four deliberate differences, with zero failures/skips;
- 263 native matrix rows, 56 explicit MongoDB unsupported categories, 33 explicit Redis unsupported categories, and three closed-world rules;
- two alternate timezone/locale profiles producing byte-identical matrix output; and
- live Docker cleanup with no residual differential container.

## Findings and dispositions

### G01-F01 — Stale acceptance bookkeeping

- Severity: Low documentation consistency
- Finding: Several accepted ADR validation/follow-up checkboxes still described completed `P01-019`, `P01-020`, `P01-021`, or `P01-022` work as open. The numeric contract also retained a conditional sentence that applied only before ADR 0002 and `P01-004` were accepted.
- Disposition: Fixed in commit `79c54e9`. Completed Phase 1 proof is checked or phrased narrowly; later engine/backend obligations remain separate and unchecked. The complete semantic/oracle/matrix suite and local-link checks passed after the correction.
- Gate effect: Resolved.

### G01-F02 — Superseded MongoDB storage-bounds attempt

- Severity: Evidence integrity
- Finding: The first post-commit P01-021 replay exhausted the Docker storage allocation and invalidated evidence commit `b7c62f0`; accepting that commit would have made the differential proof non-reproducible.
- Disposition: The failed attempt remains preserved at `evidence/phase-01/P01-021/attempts/2026-07-10-storage-bounds-failure.md`. Harness 1.0.1 introduced bounded memory/data storage, the final source commit is `e68d50a`, and the superseding evidence verifier repeats the live run and cleanup.
- Gate effect: Resolved; the failed evidence is not used.

### G01-F03 — Experimental equality could be mistaken for adapter support

- Severity: High compatibility-claim risk
- Finding: Twelve MongoDB cases match exactly, but no MongoDB or Redis adapter/protocol endpoint exists.
- Disposition: Matrix version 1.0.0 keeps all 16 experimental rows at `adapter_status=unsupported`, records zero supported adapter rows, prohibits product compatibility claims, and applies native/MongoDB/Redis closed-world rules. Exact observations are evidence about those cases only.
- Gate effect: Resolved by explicit claim boundary.

### G01-F04 — Identifier generation/collision execution is deferred

- Severity: Medium residual implementation risk
- Finding: UUIDv7/ObjectId byte, equality, order, parse, and boundary semantics are frozen, but the Phase 1 oracle does not execute the stateful generator, injected randomness/clock failures, eight-collision retry loop, or unique-index race.
- Disposition: Accepted as non-blocking for this semantic gate because the full behavior is normative in ADR 0006 and the identifier contract, while its executable dependencies do not exist yet. `P04-009` owns deterministic clock/random injection and `P08-002` owns generator/unique-index integration. Their later gates must add deterministic generator/collision histories before the feature ships. ADR 0006 retains those boxes unchecked.
- Gate effect: Tracked later; does not authorize generator implementation or support.

### G01-F05 — TTL histories and durable expiry oracle are deferred

- Severity: High durability risk, not yet an implemented surface
- Finding: Timestamp ranges and parsing execute in Phase 1, while clock-regression, restart, suspension, forward-skew, cleanup, backup, restore, and replication TTL histories require storage/runtime state.
- Disposition: The temporal ADR was corrected to distinguish passing timestamp fixtures from unimplemented expiry histories. `P06-014`, `P08-006`, `P20-003`–`P20-013`, and `G20` retain the executable TTL obligations.
- Gate effect: Tracked later; no TTL support claim is authorized.

### G01-F06 — Query/cursor/backend ordering proof is deferred

- Severity: Medium determinism risk
- Finding: Phase 1 executes the eight ordering bases, but not a production query engine, cursor lifecycle, every mixed-ID stream, spills, physical layouts, or distributed merge.
- Disposition: The normative `default_order_v1` contract is frozen and the Phase 1 profile fixtures pass. The ADR now separates those fixtures from later mixed-ID/filter/batch/cursor histories. `P07-*`, `P08-*`, `P09-*`, `P10-*`, `P12-*`, and later distributed gates retain equivalence proof.
- Gate effect: Tracked later; no backend implementation claim is authorized.

### G01-F07 — Reference-only rows are not product implementation

- Severity: High scope/claim risk
- Finding: The oracle can execute 41 semantic rows, 23 compact boundaries, 17 command rows, and 74 synthetic error rows, while the native product engine remains absent.
- Disposition: The matrix distinguishes `semantic_status` from `implementation_status`, marks the native product `not_implemented`, documents compact/synthetic proof limits, and assigns contract-only behavior to later plan phases.
- Gate effect: Resolved by status separation; G01 closes semantics only.

## Domain review

| Domain | Decision/evidence | Review result |
| --- | --- | --- |
| Numeric and floating special values | ADR 0002; exact numeric and floating-special contracts; scalar fixtures/oracle | Accepted; optimized/index/GPU equivalence remains open |
| Time and expiry | ADR 0003; temporal contract; timestamp range/parser fixtures | Accepted semantic contract; stateful TTL histories remain open |
| Strings and Unicode | ADR 0004; binary UTF-8 contract; malformed/equality/order fixtures; one upstream equality case | Accepted binary v1 profile; extended collation remains out of scope |
| Arrays and paths | ADR 0005; array contract; corpus/path evaluator; initial upstream exact/different cases | Accepted; generated/implemented adapter breadth remains open |
| Identifiers | ADR 0006; identifier contract; UUID/ObjectId boundary/equality/order fixtures | Accepted contract; generator/collision execution remains open |
| Vectors | ADR 0007; vector contract; f16/f32 boundaries and three metric actions | Accepted reference baseline; top-k/index/kernel proof remains open |
| Limits | ADR 0008; portable limit profile; 23 below/at/above generators | Accepted semantic boundaries; real allocation/parser enforcement remains open |
| Errors/outcomes | ADR 0009; 74-code registry; invalid-command precedence | Accepted registry/reference baseline; fault injection and transport mapping remain open |
| Ordering | ADR 0010; eight order bases; exact oracle order output | Accepted semantic profile; cursor/backend/distributed histories remain open |
| Fixture format | ADR 0011; schemas, canonical hashes, semantic lint, independent oracle | Accepted Phase 1 format; Rust/TypeScript/backend decoding remains open |

## Requirement-state review

The 17 requirement IDs named by Phase 1 evidence remain `In progress` when their complete requirement spans later formats, engines, hosts, GPU paths, security controls, or adapters. G01 accepts only their semantic/reference foundation; it does not justify changing a cross-phase requirement to `Verified`. The requirement ledger must link this gate while preserving those later tasks and gates.

## Gate conclusion

**Pass.** All Phase 1 tasks have immutable passing evidence. The corpus and independent oracle agree exactly, the pinned differential result is reproducible, the compatibility matrix is closed-world and claim-safe, the required semantic decisions are accepted, and no unresolved Phase 1 semantic decision remains. Residual implementation risks are explicitly assigned to later unchecked work and do not masquerade as completed product behavior. G01 may be checked after this review artifact is committed and the ADR review checkboxes, requirement ledger, progress snapshot, and checklist are updated together.

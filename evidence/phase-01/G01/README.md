# G01 Semantic Gate Evidence

- Gate: `G01` — close the semantic gate after fixtures and the reference oracle agree, open semantic decisions are resolved, and the v1 subset is frozen
- Reviewed commit: `79c54e99754a31075ce47d6cd33d4a291be53449`
- Recorded at: `2026-07-10T22:49:56Z`
- Reviewer: Codex gate-audit pass after all individual Phase 1 evidence commits
- Verdict: Pass

## Gate scope

G01 closes the Phase 1 semantic/reference foundation. It does not claim that a native database engine, persistent format, SDK, protocol, GPU kernel, MongoDB adapter, or Redis adapter exists. Those implementation and compatibility claims remain prohibited until their later tasks and gates pass.

The gate requires all 22 Phase 1 tasks, the deterministic semantic corpus, an independent all-pass oracle report, the pinned initial MongoDB differential, the versioned closed-world compatibility matrix, accepted semantic ADRs, reconciled traceability, and a recorded review of remaining risk.

## Task evidence index

| Task range | Result | Evidence | Source commits |
| --- | --- | --- | --- |
| `P01-001`–`P01-005` | Pass | Value, missing/null, numeric, floating-special, and temporal contracts | `87043c5`, `7ee095c`, `a6796a3`, `2f2627d`, `0c1db64` |
| `P01-006`–`P01-010` | Pass | String, object, array, identifier, and vector contracts | `afad0fe`, `c1238a2`, `7914c4b`, `5f031e0`, `564333a` |
| `P01-011`–`P01-015` | Pass | Limits, operators, CRUD/query, updates, and aggregation | `5fe3146`, `dfcd25c`, `7e572a2`, `1c3803c`, `87bdd94` |
| `P01-016`–`P01-018` | Pass | Errors, ordering, and semantic-fixture format | `bc68163`, `25dc994`, `90c3388` |
| `P01-019` | Pass | 17-fixture, 313-step semantic corpus | `a490395` |
| `P01-020` | Pass | Independent semantic oracle | `23e5fc2` |
| `P01-021` | Pass | Pinned MongoDB 6.0.5 differential harness | `e68d50a` |
| `P01-022` | Pass | V1 semantic/compatibility matrix | `1d9abd1` |

Each task has its own [evidence directory](../), manifest, source commit, artifact hashes, commands, result, limitations, and review. The aggregate verifier requires all 22 manifests to pass and independently re-hashes all 167 recorded artifacts at their source commits.

## Primary evidence

| Evidence | Result | Source identity |
| --- | --- | --- |
| [Semantic corpus manifest](../../../fixtures/semantic/manifest.json) | 17 fixtures; 313 steps; deterministic schema/hash/coverage pass | `ff4088a1d791dabb8ecc6ffd885f3d08c09c55e1a08871312163d915e6b843e8` |
| [Oracle report](../../../fixtures/semantic/oracle-report-v1.json) | 313 passed; 0 failed; 0 skipped; 382 replay assertions | source SHA-256 `8427fc0d3a5e3c09fc9d4c89018822898b45f94b7a9abaef659b6ba9607d8d1f` |
| [MongoDB report](../../../differential/mongodb/report-v1.json) | 16 passed; 12 exact; 4 deliberate differences; 0 failed/skipped | source SHA-256 `6a04b5d3cf93662ed9727de9dd5753d646acff12b914b785f6604cd61ef5b019` |
| [Compatibility matrix](../../../compatibility/v1/matrix-v1.json) | 263 native rows; 0 MongoDB/Redis support; 3 closed-world rules | `1f116e0e6702526854d22c4e473530817139ca36f7423653ecc76c8324916a60` |
| [Human-readable matrix](../../../docs/compatibility/v1-semantic-compatibility-matrix.md) | Byte-derived publication with explicit unsupported behavior | `c64d0421eac5a1d678dd5c716cc6f791f3774af13ba93b1f10a199cb1c7ae1d2` |
| [Independent gate review](review.md) | Seven findings resolved or assigned to later unchecked work | Pass |

## Accepted decisions

G01 binds accepted ADRs 0002 through 0011: numeric/floating, time, binary strings, arrays, identifiers, vectors, portable limits, stable errors/outcomes, default ordering, and the tagged semantic-fixture format. All 17 semantic architecture documents are accepted baselines with no unresolved-decision marker.

## Verification

From a checkout containing this evidence directory and the reviewed commit:

```bash
node --check evidence/phase-01/G01/verify.mjs
node evidence/phase-01/G01/verify.mjs 79c54e99754a31075ce47d6cd33d4a291be53449
```

The aggregate verifier:

- reconciles all 522 plan items and requires `P01-001` through `P01-022` complete;
- verifies 22 passing task manifests, 167 immutable artifact hashes, seven verifier identities, and commit ancestry;
- checks ten accepted ADRs, 17 accepted semantic documents, and the binary-collation deadline decision;
- validates exact corpus/oracle/differential/matrix identities, bindings, counts, failures, skips, and claim boundaries;
- compares all 44 stable requirement IDs in Specifications and the ledger;
- parses every tracked JSON file and checks every tracked Markdown file/local link at the reviewed commit; and
- runs the immutable P01-022 aggregate replay, including schema/inventory mutation canaries, 382 oracle assertions, all 313 corpus steps, deterministic alternate environments, the live pinned MongoDB differential, and residual-container cleanup.

Machine-readable gate metadata and primary artifact hashes are in [manifest.json](manifest.json).

## Limitations retained as open work

- Identifier generator, injected clock/random failure, collision/retry, and unique-index histories remain under `P04-009` and `P08-002`.
- Stateful TTL clock/restart/cleanup/backup/replication histories remain under `P06-014`, `P08-006`, and `P20-*`.
- Mixed-ID query, cursor, physical-backend, GPU, restore, and distributed order equivalence remains under the corresponding later phases.
- Compact boundary actions do not replace real maximum-size allocation/parser enforcement.
- Synthetic error actions do not replace future subsystem fault injection.
- The 16 MongoDB observations are a hand-selected experimental subset. No adapter endpoint or supported compatibility row exists, and Redis has no reference harness.

These limitations do not leave a Phase 1 semantic choice unresolved. They prevent G01 from being misread as product, backend, persistence, protocol, or adapter completion.

## Verdict

**Pass.** The v1 semantic subset is frozen, the corpus and independent oracle agree with zero failure/skip, the pinned differential and compatibility matrix reproduce, all required decisions are accepted, and every residual implementation obligation remains assigned to later unchecked work. G01 may be checked.

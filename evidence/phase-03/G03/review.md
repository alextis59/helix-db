# G03 Independent HDoc Gate Review

- Gate: `G03`
- Reviewed commit: `6f5b88a8e5f11ccc4fabc264a1fe76aba5109445`
- Review date: 2026-07-12
- Reviewer: Codex gate-audit pass after all Phase 3 task and evidence commits
- Review mode: artifact-first format, security, corruption, migration, portability, and claim audit
- Verdict: Pass

## Review question

Can Phase 3 close with a frozen HDoc 1.0 byte grammar, deterministic writer, bounded validating
reader, independent cross-language interpretation, stable dictionary lifecycle, explicit migration
rejection, and no open critical parser, corruption, migration, or portability issue?

## Acceptance criteria

- Every `P03-001` through `P03-021` item has immutable passing evidence and a source commit in the
  ancestry of the reviewed head.
- The HDoc 1.0 envelope, records, scalar payloads, integrity/hash, compression, tagged conversion,
  path dictionary, and compatibility authorities are versioned and mutually consistent.
- All 24 frozen files have exact hashes and outcomes: four complete positive vectors and 20 exact
  rejection vectors.
- Production Rust and independent TypeScript readers reconstruct the same four complete logical
  values and independently calculate the same four typed hashes.
- Corruption, truncation, overlap, unknown version/feature/codec, compression bounds, canonicality,
  checksum, hash, and repaired-mutation cases fail closed before publication.
- Migration accepts only exact current valid HDoc 1.0 as a no-op; unsupported, malformed, or future
  input rejects without rewrite or partial publication.
- Five stable libFuzzer entry points replay 57 committed/derived seeds for 640 bounded executions,
  with AddressSanitizer and three-browser seed replay passing.
- Representative measurements retain all 600 samples and 9,600 timed iterations without creating
  a latency/throughput SLO or a dictionary-reference row profile.
- The selected outcome keeps authoritative HDoc 1.0 rows self-contained and confines dictionary
  identifiers to derived structures until a separately negotiated profile satisfies five gates.
- Exact-head hosted CI is green across the complete 12-job matrix.

## Evidence examined

The audit executed all 21 task verifiers in order. The early format verifiers independently replay
the registries and thousands of mutation canaries; the implementation verifiers bind source trees,
coverage, native/Wasm/ASan results, golden artifacts, cross-reader parity, deterministic properties,
fuzzing, browser replay, raw benchmark results, and experiment decisions. Every task source commit
is an ancestor of the reviewed head and every task verdict is `pass`.

The final executable breadth includes 49 Rust tests, 512 generated codec cases, 512 tagged-JSON
cases, 256 presentation permutations, 2,656 checksum-repaired bit mutations, five fuzz targets,
640 bounded coverage-guided executions, six real browser executions, four cross-language complete
value/hash comparisons, five benchmark shapes, 30 operations, 600 samples, and 9,600 iterations.
Product coverage remains 4,565/4,565 lines for the active scope.

Hosted run [29186601834](https://github.com/alextis59/helix-db/actions/runs/29186601834)
executes the exact reviewed commit. Its matrix contract, two Node lanes, three native operating
systems, two portable Wasm targets, ASan, and Chromium/Firefox/WebKit jobs all passed.

## Findings and dispositions

### G03-F01 — P03-021 evidence metadata was incomplete

- Severity: Evidence consistency.
- Finding: The P03-021 evidence README named its requirements and ADR, but its machine manifest
  omitted the standard `requirements`, `accepted_adrs`, `source_commits`, and environment fields.
- Disposition: Fixed in reviewed commit `6f5b88a`. The task verifier now requires exact metadata,
  and the aggregate gate verifier rejects any Phase 3 task missing those fields.
- Gate effect: Resolved.

### G03-F02 — Bounded fuzzing is not an exhaustive safety proof

- Severity: Residual parser/security risk.
- Finding: The gate executes deterministic bounded campaigns; it cannot prove the absence of every
  possible defect.
- Disposition: Five stable entry points, immutable seed replay, ASan, repaired-bit mutation breadth,
  and fail-closed parsing provide the phase acceptance evidence. Longer campaigns may extend the
  corpus, and later release/security gates retain adversarial testing obligations.
- Gate effect: No known critical issue; tracked continuously and again by `G13`, `G15`, and `G24`.

### G03-F03 — Dictionary-reference rows are deliberately not implemented

- Severity: Scope/coordination risk.
- Finding: Repeated names can benefit from dictionary IDs for four modeled shapes but cost bytes for
  the minimal shape; row references would also couple authoritative rows to collection state.
- Disposition: P03-021 keeps HDoc 1.0 self-contained and uses dictionary IDs only in derived
  sidecars/indexes/planner metadata. A new profile requires real path frequency, atomic pins,
  amplification/recovery results, migration/rollback proof, and raw-name fallback.
- Gate effect: Resolved by exclusion from HDoc 1.0; no unsupported feature claim.

### G03-F04 — Durable rewrite/resume/rollback is deferred

- Severity: High migration/durability risk, not yet an implemented storage surface.
- Finding: Phase 3 has exact negotiation and no-rewrite rejection but no WAL/SST/value-log database
  exists on which to perform crash-safe format rewrites.
- Disposition: The migration hook returns only no-op or rejection. `P05-*`, `P15-013`–`P15-017`,
  `P24-002`, `P24-009`, `G15`, and `G24` retain interruption, recovery, rollback, and upgrade proof.
- Gate effect: Non-blocking for the codec gate; no durable migration support is claimed.

### G03-F05 — Timing observations are diagnostic, not performance claims

- Severity: Claim integrity.
- Finding: Measurements come from one source-bound environment and cannot establish cross-machine,
  storage, query, concurrency, or release performance.
- Disposition: Raw/summary schemas retain every observation and set the threshold to null. The
  decision record explicitly forbids performance SLO and cross-machine claims.
- Gate effect: Resolved by the machine-enforced claim boundary.

## Domain review

| Domain | Evidence | Result |
| --- | --- | --- |
| Byte grammar and values | P03-001–P03-007 registries and exact vectors | Frozen HDoc 1.0 baseline; unknown required semantics reject |
| Writer/reader/views/lookup | P03-008–P03-011 production Rust, Wasm, ASan, coverage | Deterministic, bounded, fail-before-publication, allocation-aware |
| Tagged conversion | P03-012 strict typed grammar and detached validation | Lossless internal boundary; not a public wire/API claim |
| Dictionary lifecycle | P03-013–P03-014 snapshots, atomic registration, recovery, pins | Append-only IDs and complete-chain recovery pass |
| Compatibility/migration | P03-015 exact-1.0 matrix and no-rewrite assessment | Current valid input no-ops; everything unsupported rejects |
| Frozen interoperability | P03-016–P03-017 immutable files and independent reader | Four complete values/hashes agree; 20 exact rejections |
| Corruption/security | P03-018–P03-019 properties, mutations, fuzz, ASan, browsers | No open critical issue found in retained and replayed scope |
| Experiments | P03-020–P03-021 raw results and closed decisions | Self-contained base/canonical compression; derived-only dictionary |
| Hosted portability | CI run 29186601834 | All 12 jobs green on exact reviewed commit |

## Residual boundaries

- HDoc is a row-format and codec foundation, not a database, query engine, storage engine, wire
  protocol, SDK, backup format, or compatibility adapter.
- HDoc 1.0 supports exact current-version no-op assessment and rejection, not online durable rewrite.
- Coverage is exact for the current active Rust product scope; future consumers add new denominators
  and must satisfy their own semantic/recovery thresholds.
- Performance and dictionary savings are fixed-workload observations without a product SLO.
- Continued fuzzing and later independent security review remain release obligations.

## Gate conclusion

**Pass.** HDoc 1.0 is frozen by versioned authorities and immutable vectors, production and
independent readers agree, corruption and migration rejection fail closed, bounded fuzz/ASan/browser
replay finds no open critical issue, decisions remain claim-safe, and the exact reviewed head is
green across the hosted matrix. G03 may be checked after the aggregate gate verifier and its
mutation canaries pass.

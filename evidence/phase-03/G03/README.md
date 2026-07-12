# G03 HDoc Gate Evidence

- Gate: `G03` — freeze HDoc 1.0 after independent readers agree, hardening finds no open critical
  issue, and migration rejection is tested
- Reviewed commit: `6f5b88a8e5f11ccc4fabc264a1fe76aba5109445`
- Reviewed tree: `1509de1c8ef7b1096b15ce2e1288f44ac650d510`
- Recorded at: `2026-07-12T09:01:00Z`
- Reviewer: Codex independent Phase 3 gate audit
- Verdict: **Pass**

## Gate outcome

All 21 Phase 3 task verifiers pass at immutable source commits in the reviewed ancestry. HDoc 1.0
is frozen by versioned format authorities and 24 complete immutable files. Four positive documents
reconstruct to identical full logical values and independently calculated typed hashes in production
Rust and an independent TypeScript reader; 20 malformed/version/feature/corruption cases reject with
exact outcomes.

The bounded validating reader, canonical writer, borrowed/owned values, lookup, tagged conversion,
dictionary lifecycle, and exact-1.0 migration assessment pass native, portable Wasm, ASan, property,
mutation, fuzz, coverage, and browser gates. Five stable libFuzzer targets replay 57 seeds for 640
bounded executions without a crash. No critical parser, corruption, migration-rejection, or
portability issue remains open in the gate scope.

The experiment decision accepts self-contained HDoc 1.0 base plus canonical compression profile 1.
Collection dictionary IDs remain limited to derived sidecars, indexes, and planner metadata; no
authoritative HDoc 1.0 row depends on external dictionary state. All 600 benchmark samples remain
diagnostic, with no performance threshold or cross-machine/product claim.

## Required evidence

| Required G03 input | Durable evidence | Result |
| --- | --- | --- |
| Format document and ADR | [ADR 0012](../../../docs/adr/0012-use-bounded-little-endian-hdoc-v1.md) and [HDoc 1.0](../../../docs/formats/hdoc-v1.md) | Exact grammar, values, integrity, compression, dictionary, and compatibility authorities accepted |
| Golden vector hashes | [P03-016](../P03-016/README.md) | 24 immutable files: four accept, 20 exact reject |
| Cross-language results | [P03-017](../P03-017/README.md) | Four complete values and four typed hashes agree |
| Corruption and property diagnostics | [P03-018](../P03-018/README.md) | 2,656 repaired-bit cases plus truncation/trailing/mutation breadth pass |
| Fuzz corpus and sanitizer/browser replay | [P03-019](../P03-019/README.md) | Five targets, 57 seeds, 640 executions, six browsers, no crash |
| Benchmark report | [P03-020](../P03-020/README.md) | Five shapes, 30 operations, 600 samples, 9,600 iterations retained |
| Experiment decisions | [P03-021](../P03-021/README.md) | Self-contained HDoc; derived-only dictionary; null performance SLO |
| Migration rejection | [P03-015](../P03-015/README.md) | Exact current valid input no-ops; unsupported/malformed input rejects without rewrite |
| Independent gate review | [review.md](review.md) | Five findings resolved or explicitly retained by later gates |
| Hosted portability | [run 29186601834](https://github.com/alextis59/helix-db/actions/runs/29186601834) and [observation](hosted-observation.json) | Exact reviewed head; 12/12 jobs green |

## Aggregate verification

The aggregate verifier checks the reviewed commit/tree and open-gate state, all 21 manifest
identities and source ancestry, 666 declared source-artifact records, every task-verifier hash, the
requirement/ADR union, all frozen file bytes/hashes, cross-reader and hardening counts, migration
markers, experiment claim boundaries, hosted job inventory, and review disposition. It then executes
all 21 task verifiers and five hosted-observation rejection canaries.

```bash
node --check evidence/phase-03/G03/verify.mjs
node evidence/phase-03/G03/verify.mjs 6f5b88a8e5f11ccc4fabc264a1fe76aba5109445
node evidence/phase-03/G03/test-verifier.mjs
```

## Residual boundaries

- Durable storage rewrite/resume/rollback remains owned by storage and upgrade phases; the current
  migration surface deliberately exposes only no-op or rejection.
- Bounded fuzzing and current-scope coverage do not replace later security/release testing.
- HDoc is not a query/storage/server/SDK/compatibility or public-performance claim.
- A dictionary-reference row profile requires a new negotiated format and all five P03-021
  prerequisites.

## Verdict

**Pass.** The Phase 3 codec and format foundation satisfies G03. The checklist may be updated only
after this aggregate verifier passes.

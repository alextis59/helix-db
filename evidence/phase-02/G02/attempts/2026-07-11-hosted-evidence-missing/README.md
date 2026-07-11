# G02 Attempt 2026-07-11 — Hosted Evidence Missing

- Gate: `G02`
- Reviewed commit: `2c252e0b8663fae198c15bef833417c8dd4c6dfe`
- Reviewed tree: `50c7d885d62b358e3c668eb8f820d2ebbd786f30`
- Recorded at: `2026-07-11T06:40:05.463Z`
- Reviewer: Codex gate-audit pass distinct from the individual Phase 2 task evidence passes
- Local worktree: clean before review artifacts
- Verdict: Blocked — gate remains unchecked

## Result

All `P02-001` through `P02-017` task manifests pass, and the latest aggregate verifier reproduces
the documented foundation, native, browser, Wasm, coverage, sanitizer, WGSL, dependency, and
rejection paths from clean source. The complete local side of the gate is ready.

The [independent review](review.md) cannot accept G02 because
[`continuous-integration.md`](../../../../../docs/architecture/continuous-integration.md) requires
the first hosted green results. The retained [remote observation](remote-state.json) records:

- zero GitHub Actions workflow runs;
- remote `main` at `1b95c8a5c93c76f1e79e08b8112ae5fcf831df83`;
- reviewed local `main` 103 commits ahead at
  `2c252e0b8663fae198c15bef833417c8dd4c6dfe`; and
- no branch protection or required checks.

No push, workflow dispatch, pull request, branch-setting change, or other external mutation was
performed without user authorization.

## Verification

```text
node evidence/phase-02/G02/attempts/2026-07-11-hosted-evidence-missing/verify.mjs \
  2c252e0b8663fae198c15bef833417c8dd4c6dfe
```

The verifier checks all 17 task manifests, immutable artifact and verifier identities, Phase 2 plan
state, gate input authorities, the retained remote observation, and the full P02-017 clean aggregate
replay. Its expected verdict is `blocked`, not `pass`.

## Required superseding evidence

A later immutable attempt must add:

1. the exact pushed head SHA and trigger event;
2. green conclusions for all gating jobs and the required extended native runs;
3. runner OS/architecture identities;
4. retained semantic/dependency, coverage, and three-engine browser artifact IDs, URLs, digests, and
   expiration dates;
5. any failure attempts and their dispositions;
6. confirmation that local and hosted source/lock/matrix identities agree; and
7. a fresh independent verdict before checking G02.

This failed attempt is additive evidence and must remain unchanged when the gate is later retried.

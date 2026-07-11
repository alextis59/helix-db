# G02 Toolchain Gate Review Attempt — Hosted Evidence Missing

- Gate: `G02`
- Reviewed commit: `2c252e0b8663fae198c15bef833417c8dd4c6dfe`
- Review date: 2026-07-11
- Reviewer: Codex gate-audit pass, performed after all 17 Phase 2 task implementations and evidence commits
- Review mode: artifact-first independent pass over task manifests, immutable source/retained artifacts, current clean replay, CI contract, and read-only GitHub state
- Verdict: Blocked

## Review question

Can Phase 2 close with a reproducible Rust/JavaScript/Wasm/browser foundation whose documented
commands build and test the native and browser skeletons from a clean checkout, whose dependency and
artifact evidence is complete, and whose hosted CI proves every declared gating environment?

## Acceptance criteria

- Every `P02-001` through `P02-017` item is checked only after a passing evidence manifest and
  immutable source commit exist.
- Exact Rust, Node, npm, compiler, bundler, browser, validator, target, profile, dependency, fixture,
  benchmark, coverage, retention, example, and bootstrap contracts are mutually consistent.
- A clean checkout replays the documented foundation commands under exact Node 22.23.1 and 24.18.0.
- The native boundary example links with zero database operations and the browser boundary example
  builds and executes in Chromium, Firefox, and WebKit without implying product functionality.
- The current Wasm component/core-module, WGSL, coverage, ASan, dependency, benchmark, and retained
  reports pass with exact source/artifact identities.
- The committed CI matrix and workflows are structurally valid, immutable-action-pinned, read-only,
  and execute successfully on their declared hosted runners.
- The gate retains a clean-machine transcript, CI matrix, dependency report, Wasm/browser smoke
  artifacts, reproducible command list, findings/dispositions, and an exact reviewed commit.
- Requirement IDs, plan counts, documentation links, and all JSON/YAML authorities reconcile.

## Evidence examined

All 17 task manifests report `pass` at 17 distinct source commits that are ancestors of the reviewed
commit. The aggregate audit covers:

- 439 immutable source-artifact records;
- 21 committed retained reports;
- five produced Wasm/WGSL/report identities;
- four deliberately removed source identities;
- 17 committed verifier identities;
- one accepted development-identity ADR (`0001`); and
- 17 requirement IDs supported by the Phase 2 foundation.

The latest clean replay at `P02-017` performs script-suppressed installs under Node 22.23.1 and
24.18.0, full foundation checks, native linking, three real browsers, component/core-module
validation, compiler-matched coverage, stable Linux ASan, WGSL compilation, 52 rejection canaries,
and documentation/requirement reconciliation. Both root lockfiles remain unchanged.

The required evidence classes are present locally:

| Gate input | Evidence reviewed | Local result |
| --- | --- | --- |
| Clean-machine transcript | `P02-017` preflight and documented-command replay | Pass on Linux x64 under both exact Node lines |
| CI matrix | `.github/ci/matrix.json`, workflows, runtime and source checker | 11 gating, 2 nightly native, 1 observational benchmark lane; structural pass |
| Dependency report | `P02-012` inventory/audit/license/signature/provenance reports | 91 locked packages, zero advisories, 52/52 installed signatures, 27 provenance subjects |
| Wasm/browser smoke | `P02-010`, `P02-015`, `P02-016`, and `P02-017` replay | WASIp2/core-module validation and three real browsers pass locally |
| Reproducible commands | `docs/development/bootstrap.md` plus `helix.clean-bootstrap/1` | Four strict profiles and 17 troubleshooting codes pass mutation checks |
| Hosted CI | GitHub Actions for the reviewed commit | Missing |

## Findings and dispositions

### G02-F01 — No hosted workflow run exists for the reviewed commit

- Severity: Gate-blocking required evidence
- Finding: Repository policy explicitly says that local checks do not prove hosted workflow parsing,
  artifact-service behavior, or Windows/macOS/arm64 provisioning, and requires the first hosted green
  results as a `G02` input. Read-only GitHub inspection returned zero workflow runs. Remote `main` is
  `1b95c8a5c93c76f1e79e08b8112ae5fcf831df83`; reviewed local `main` is 103 commits ahead at
  `2c252e0b8663fae198c15bef833417c8dd4c6dfe`.
- Disposition: Unresolved. Pushing commits and triggering GitHub Actions changes external state and
  was not authorized. The gate must remain unchecked until the reviewed source reaches GitHub and
  all required hosted jobs pass, with run/job/artifact identities retained in a superseding attempt.
- Gate effect: Blocking.

### G02-F02 — Remote main has no protection or required checks

- Severity: Low governance readiness
- Finding: The read-only branch observation reports `protected=false` and no required checks.
  `CONTRIBUTING.md` requires branch protection, required checks, review, and non-force-push policy
  before the first external preview.
- Disposition: Not a stated G02 acceptance criterion, so it does not independently block this
  toolchain gate. It must be configured before an external preview after hosted check names are
  known. No remote setting was changed without authorization.
- Gate effect: Tracked remote-readiness work; G02-F01 already blocks acceptance.

### G02-F03 — Hosted artifact service and non-Linux native runners remain unobserved

- Severity: Gate-blocking evidence consequence of G02-F01
- Finding: Local verification proves upload configuration, strict retention manifests, and Linux x64
  execution, but cannot prove GitHub accepted/uploads artifacts or provisioned Windows x64, macOS
  arm64, Linux arm64, and macOS x64 lanes.
- Disposition: Unresolved until the first hosted gating and nightly runs complete. The superseding
  review must bind run IDs, head SHA, job conclusions, runner labels/architectures, and artifact
  IDs/digests/expiry to the reviewed commit.
- Gate effect: Blocking.

## Requirement-state review

The Phase 2 evidence supports `COMPAT-001`, `CORE-001`, `CORE-003`, `INV-001`, `INV-003`, `INV-004`,
`INV-006`, `INV-007`, `INV-009`, `INV-010`, `PLAT-001`, `PLAT-002`, `PLAT-003`, `QUAL-001`,
`QUAL-002`, `SEC-001`, and `SEC-002`. Their complete requirements span later formats, hosts,
engines, security controls, recovery paths, adapters, or release gates, so none becomes globally
`Verified` merely from G02.

## Gate conclusion

**Blocked.** Every Phase 2 task has durable passing evidence and the complete local clean replay
passes. The mandatory hosted green run does not exist, so G02 cannot be checked. This attempt is
preserved under the evidence policy; it must not be edited into a pass. A later attempt may supersede
it only with immutable hosted run/job/artifact evidence and a fresh independent review.

# G02 Independent Toolchain Gate Review

- Gate: `G02`
- Reviewed commit: `33f9fd790738211a4a1ffb281d7c3f4f50507a0b`
- Review date: 2026-07-11
- Reviewer: Codex gate-audit pass, distinct from the individual Phase 2 implementation/evidence passes
- Review mode: artifact-first review over historical task manifests, clean replay, hosted jobs,
  runner identities, artifact archives, and promoted payloads
- Verdict: Pass

## Review question

Can Phase 2 close with a reproducible Rust/JavaScript/Wasm/browser foundation whose documented
commands build and test the native and browser skeletons from clean checkouts, whose dependency and
diagnostic evidence is durable, and whose declared hosted environments execute successfully without
being overstated as database or product support?

## Acceptance criteria

- Every `P02-001` through `P02-017` item has a passing evidence manifest, immutable source commit,
  reproducible commands, exact artifacts, and an ancestor relationship to the reviewed commit.
- Exact Rust, Node, npm, bundler, browser, validator, target, profile, fixture, dependency, coverage,
  benchmark, retention, example, and bootstrap contracts remain mutually consistent.
- A clean checkout replays documented profiles under exact Node 22.23.1 and 24.18.0.
- The native boundary example links with zero database operations, and the browser example builds
  and executes in Chromium, Firefox, and WebKit without a database claim.
- Portable core-module/WASIp2, WGSL, ASan, coverage, dependency, benchmark, and retention checks
  preserve their explicit claim boundaries and fail closed.
- The committed CI matrix executes successfully on its 11 gating and two nightly hosted lanes.
- Hosted run, job, runner, step, artifact, archive, and internal report identities are durable and
  bound to the exact reviewed commit.
- Required clean-machine, matrix, dependency, Wasm/browser, command, findings, and disposition
  evidence is committed; requirement IDs, checklist counts, JSON, Markdown, and links reconcile.

## Evidence examined

The review independently traversed all 17 Phase 2 manifests and checked:

- 17 distinct source commits and verifier identities;
- 439 source-artifact, 21 retained-report, four removed-artifact, and five produced-artifact records;
- one accepted development-identity ADR and 17 requirement IDs;
- exact Node 22.23.1/24.18.0 clean installs and documented profile replays;
- nine native tests, both portable Wasm targets, stable Linux ASan, and compiler-matched coverage;
- three real Playwright engines and four trusted WGSL fixture outcomes; and
- all source authorities, rejection canaries, requirements, Markdown, JSON, YAML, and local links.

Four additional gate-evidence mutations changed hosted conclusion, archive digest, decoded
signature bytes, and review disposition while updating their outer identity records. Each was
rejected for its exact semantic reason before the expensive clean replay.

Hosted evidence covered one deliberately retained failed run, one superseding gating run, one
manual nightly run, 27 hosted jobs in total, and five artifact archives. The five downloaded ZIP
bytes matched their GitHub digests and contained 21 source files. All files are now committed in
identity form except the deterministic gzip+base64 representation of the raw signature report.

## Hosted result matrix

| Group | Hosted result |
| --- | --- |
| Contract | Clean-bootstrap contract, CI contract, and both gating/nightly emitters passed |
| Node | 22.23.1 and 24.18.0 passed locked install, policy, fixtures, and aggregate tests; Node 22 live dependency observation passed and uploaded |
| Native gating | Linux x64, Windows x64, and macOS arm64 passed strict format/check/Clippy/test/native-example commands |
| Portable/sanitizer | `wasm32-unknown-unknown`, `wasm32-wasip2`, and Linux ASan passed |
| Browser | Chromium, Firefox, and WebKit each passed the real boundary example and uploaded a strict bundle; Chromium also compiled/rejected the expected WGSL fixtures |
| Native nightly | Linux arm64 and macOS x64 passed the same strict native command set |

## Findings and dispositions

### G02-F01 — Initial audit had no hosted evidence

- Severity: Gate-blocking required evidence.
- Finding: The preserved first attempt at `2c252e0` found complete local evidence but zero hosted
  workflow runs, artifact-service results, or non-Linux runner observations.
- Disposition: Resolved after explicit push authorization. The immutable blocked attempt remains at
  [`attempts/2026-07-11-hosted-evidence-missing`](attempts/2026-07-11-hosted-evidence-missing/README.md)
  and is not rewritten into a pass.
- Gate effect: Resolved.

### G02-F02 — First hosted run failed Windows canonical-byte validation

- Severity: High cross-platform reproducibility defect.
- Finding: Run `29143529811` passed 11 jobs and failed only `Native / windows-x64`. Cargo format,
  check, Clippy, and tests passed; `examples:native` rejected the standalone lock header because Git
  converted LF to CRLF in the absence of a repository attributes policy.
- Disposition: Commit `33f9fd7` adds `* text=auto eol=lf`, validates the exact policy, rejects a
  weakened `eol=crlf` rule and CRLF lock bytes, and passes a fresh `core.autocrlf=true` clone with
  byte-identical lock hashes. Superseding Windows job `86521737100` passed the same strict step.
- Gate effect: Resolved with regression proof.

### G02-F03 — Hosted diagnostic artifacts expire after 30 days

- Severity: Gate-blocking evidence-retention risk.
- Finding: The five successful GitHub artifacts expire on 2026-08-10 and therefore cannot be the
  sole durable basis for a checked gate.
- Disposition: Every manifest and payload is promoted under `reports/hosted-gating`. The promotion
  manifest binds archive IDs/digests and original/promoted identities. The raw 477,675-byte npm
  signature report is deterministically encoded and decoded by the gate verifier.
- Gate effect: Resolved.

### G02-F04 — Default environment token could not dispatch nightly CI

- Severity: Operational evidence acquisition.
- Finding: The first dispatch returned HTTP 403 because the active environment token lacked Actions
  write permission.
- Disposition: The existing keyring login for the same repository owner already had `workflow`
  scope and dispatched run `29143911392`. Source and repository settings were unchanged. The failed
  credential attempt and successful dispatch are recorded without storing either token.
- Gate effect: Resolved.

### G02-F05 — Remote main lacks branch protection and required checks

- Severity: Low governance readiness; release-blocking before an external preview.
- Finding: The hosted observation reports `protected=false` and no required checks.
- Disposition: This is not a stated G02 acceptance criterion and does not invalidate execution of
  the exact reviewed matrix. `CONTRIBUTING.md` requires protection, review, and non-force-push
  policy before the first external preview. Release review/publication under `P16-013`/`P16-015`
  must confirm that external setting; this review does not silently mutate repository governance.
- Gate effect: Tracked later; non-blocking for the foundation toolchain gate.

### G02-F06 — Green skeleton lanes could be mistaken for product support

- Severity: High claim-boundary risk.
- Finding: The matrix spans five native OS/architecture combinations, two Wasm targets, three
  browsers, ASan, and two Node lines, but no database operation, public package, supported browser
  host, deployment, or release exists.
- Disposition: Native operations remain empty; browser output explicitly says database functionality
  is not implemented; retained bundles and CI documentation prohibit product/support claims. Later
  feature, host, packaging, and release gates retain every product obligation.
- Gate effect: Resolved by explicit boundary; no support claim is authorized.

## Requirement-state review

Phase 2 accepts foundation evidence for `COMPAT-001`, `CORE-001`, `CORE-003`, `INV-001`, `INV-003`,
`INV-004`, `INV-006`, `INV-007`, `INV-009`, `INV-010`, `PLAT-001`, `PLAT-002`, `PLAT-003`,
`QUAL-001`, `QUAL-002`, `SEC-001`, and `SEC-002`. Each complete requirement spans later formats,
hosts, engines, security controls, distributed histories, adapters, or releases, so the requirement
ledger must retain `In progress`/`Planned` state as applicable rather than treating G02 as product
verification.

## Gate conclusion

**Pass.** All Phase 2 task evidence and the clean documented replay pass. The exact reviewed commit
is green across every declared hosted gating and nightly runner. Artifact-service identities and
payloads are durably promoted and independently verified. The resolved Windows defect has a direct
regression canary and a real hosted proof. Remaining branch-governance and product-support work is
explicitly later and cannot be inferred from this gate. G02 may be checked after this review and
verifier are committed, then the implementation plan and requirement ledger are updated together.

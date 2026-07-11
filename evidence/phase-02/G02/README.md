# G02 Toolchain Gate Evidence

- Gate: `G02` — close the toolchain gate after a clean checkout builds and tests native and browser skeletons using only documented commands
- Reviewed commit: `33f9fd790738211a4a1ffb281d7c3f4f50507a0b`
- Recorded at: `2026-07-11T07:12:00Z`
- Reviewer: Codex gate-audit pass after all Phase 2 evidence commits and hosted matrix execution
- Verdict: Pass

## Gate scope

G02 closes the reproducible foundation toolchain, CI, and clean-bootstrap gate. It proves the
boundary skeleton on the declared Node, native, portable Wasm, sanitizer, and browser lanes. It does
not claim that database document, query, storage, durability, GPU execution, network, package,
compatibility, or release functionality exists.

The initial audit correctly left G02 open because no hosted run existed. The first pushed run then
exposed a Windows CRLF checkout defect. Commit `33f9fd7` added a repository-wide LF checkout policy,
strict canaries, and a byte-identical `core.autocrlf=true` clone proof. The superseding gating and
nightly runs are green on that exact commit.

## Task evidence index

| Task range | Result | Foundation evidence |
| --- | --- | --- |
| `P02-001`–`P02-004` | Pass | Rust/JavaScript pins, workspace boundaries, and repository layout |
| `P02-005`–`P02-008` | Pass | Build profiles, code/dependency policy, stable test commands, and deterministic fixtures |
| `P02-009`–`P02-011` | Pass | Hosted matrix authority, portable Wasm/browser validation, and trusted WGSL fixtures |
| `P02-012`–`P02-015` | Pass | Dependency reports, coverage, benchmark schema/baseline, and diagnostic retention |
| `P02-016`–`P02-017` | Pass | Native/browser boundary examples and executable clean-machine bootstrap |

All 17 task manifests are under [`phase-02`](../). The aggregate verifier checks 439 immutable
source records, 21 committed retained reports, four removed artifacts, five produced identities,
and all 17 verifier identities at their historical source commits.

## Hosted execution evidence

| Execution | Exact source | Result |
| --- | --- | --- |
| [First gating run `29143529811`](https://github.com/alextis59/helix-db/actions/runs/29143529811) | `3c526f5` | Failed only on Windows x64 because checkout converted the standalone `Cargo.lock` to CRLF |
| [Superseding gating run `29143784086`](https://github.com/alextis59/helix-db/actions/runs/29143784086) | `33f9fd7` | Matrix contract plus all 11 emitted gating lanes passed; five artifacts uploaded |
| [Nightly architecture run `29143911392`](https://github.com/alextis59/helix-db/actions/runs/29143911392) | `33f9fd7` | Matrix contract, Linux arm64, and macOS x64 passed |

The machine-readable [hosted observation](hosted-observation.json) binds every run, job, runner
label, step conclusion, artifact ID, archive digest, expiry, and remediation commit. The five
downloaded archives were independently downloaded, ZIP-tested, and matched against their GitHub
SHA-256 digests.

## Durable report promotion

GitHub retains the source artifacts for 30 days, so every report used by this gate is promoted under
[`reports/hosted-gating`](reports/hosted-gating/). The
[promotion manifest](reports/hosted-gating/promotion-manifest.json) records the five archive
identities and all 21 internal files. Identity-promoted files retain their original byte count and
hash. The large npm signature report uses deterministic gzip plus base64; the verifier decodes it
and requires the original 477,675-byte SHA-256 identity.

Promoted proof includes:

- the Node 22.23.1 semantic replay and live dependency inventory, audit, signatures, and provenance
  observation;
- compiler-matched Rust coverage with the explicit empty-product boundary exception;
- Chromium, Firefox, and WebKit bundle, execution, and Wasm reports; and
- Chromium's two accepted/two rejected trusted WGSL fixture results.

## Required G02 evidence

| Required input | Durable evidence | Result |
| --- | --- | --- |
| Clean-machine transcript | [`P02-017` preflight and documented-command replay](../P02-017/README.md) | Exact Node 22.23.1/24.18.0 clean installs and four documented profiles pass |
| CI matrix | [`helix.ci-matrix/3`](../../../.github/ci/matrix.json) and hosted observation | 11 gating, two nightly native, one observational benchmark lane; declared hosted lanes pass |
| Dependency report | Promoted semantic bundle plus [`P02-012`](../P02-012/README.md) | 91 packages, zero advisories, 52 verified signatures, zero missing/invalid signatures |
| Wasm/browser smoke | Promoted browser bundles plus [`P02-010`](../P02-010/README.md) and [`P02-016`](../P02-016/README.md) | Both Wasm forms validate; three real engines pass one boundary test each |
| Reproducible command list | [`bootstrap.md`](../../../docs/development/bootstrap.md) and `helix.clean-bootstrap/1` | Four profiles and 17 stable troubleshooting codes pass strict canaries |
| Independent review | [G02 review](review.md) | Six findings resolved or assigned to later, still-unchecked release work |

## Verification

From a checkout containing this evidence and the reviewed commit:

```bash
node --check evidence/phase-02/G02/verify.mjs
node evidence/phase-02/G02/verify.mjs 33f9fd790738211a4a1ffb281d7c3f4f50507a0b
node evidence/phase-02/G02/test-verifier.mjs
```

The verifier replays the complete `P02-017` clean-bootstrap proof, validates all historical Phase 2
task artifacts, checks the hosted runner/job/artifact graph, reverses the encoded promotion,
validates every promoted bundle payload, reconciles requirements and documentation, and preserves
the failed prior attempt under [`attempts`](attempts/). Four isolated canaries update the outer
identity records and still prove that altered hosted status, archive digest, decoded signature
bytes, or review disposition cannot pass.

## Residual boundaries

- Remote `main` is not protected and has no required checks. That is not a G02 toolchain criterion,
  but the contribution policy requires protection, review, and non-force-push policy before the
  first external preview; `P16-013`/`P16-015` must not pass without that confirmation.
- Current coverage contains no product denominator because Phase 2 intentionally contains only
  boundary skeletons. The explicit exception expires at `P03-008`.
- Hosted artifacts are diagnostic foundation proof, not public OS/browser/package support claims.
  Product support and clean-consumer proof remain under `P11-*`, `P16-*`, and `G24`.
- The public product/package identity remains deliberately deferred to `P16-016`; HelixDB remains
  the accepted development name.

## Verdict

**Pass.** All 17 Phase 2 tasks have immutable passing evidence, documented clean bootstrap replays,
all declared hosted gating and nightly environments are green on the exact reviewed source, and
the expiring reports are durably promoted and independently checked. G02 may be checked.

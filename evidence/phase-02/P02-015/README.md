# P02-015 Artifact Retention Evidence

- Task: `P02-015` — add artifact retention for golden formats, test replays, crash matrices,
  browser reports, and packaged releases
- Requirements supported: `INV-007`, `QUAL-001`
- Source commits:
  `d87e8c3e996bf7d2a975ffa7ba9a49aaf9a8e3e2`,
  `b44bd478b2f7a13e8b99fea7ff622a94d730d69f`
- Final commit under test: `b44bd478b2f7a13e8b99fea7ff622a94d730d69f`
- Recorded at: `2026-07-11T05:07:46.691Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Accepted ADRs: none
- Verdict: Pass

## Scope and result

The source commits establish one executable retention boundary for all five artifact classes without
pretending that future database artifacts exist:

- three closed JSON Schema Draft 2020-12 contracts for policy, bundle manifests, and normalized
  browser execution;
- one exact five-profile machine policy with two active and three reserved classes;
- fixed semantic, coverage, and per-engine browser collectors;
- complete payload byte/SHA-256 inventories, clean/dirty source identity, environment identity,
  claim boundaries, failure lists, and coherent pass/fail verdicts;
- current dependency-report linkage and freshness checks in the GitHub semantic path;
- structured Chromium, Firefox, and WebKit execution reports with exact launcher-entrypoint
  identities;
- four full-SHA-pinned `upload-artifact` paths across the gating and observational workflows;
- `if: always()` collection and upload without `continue-on-error` or failure filtering;
- thirty-eight permanently executed source mutation canaries; and
- detailed expiry, sensitivity, reserved-activation, and durable-promotion documentation.

No dependency or lockfile changed. No persistent format, storage engine, fault point, recovery
matrix, package, container, SBOM, signature, release provenance, user-facing browser host, or
database behavior was added. The retained browser executions remain internal toolchain smoke.

## Five-profile policy

| Profile | State | CI retention | Durable rule | Activation |
| --- | --- | ---: | --- | --- |
| `golden-formats` | Reserved, zero producers | 90 days after activation | Permanent by format version | `P03-016` |
| `test-replays` | Active: semantic/dependency and coverage | 30 days | Permanent when used by a gate/release | Active |
| `crash-matrices` | Reserved, zero producers | 90 days after activation | Permanent by persistent-format/release line | `P05-021` |
| `browser-reports` | Active: Chromium/Firefox/WebKit toolchain smoke | 30 days | Supported-platform lifetime when used by a release | Active |
| `packaged-releases` | Reserved, zero producers | 90 days after activation | Permanent in release/provenance stores | `P16-010` |

Every profile requires promotion. The active 30-day GitHub copy is diagnostic and cannot by itself
check a task, close a gate, support a published claim, or prove a release. Such use requires the
committed or approved-immutable-store promotion described by the
[evidence policy](../../README.md). Sensitive crash evidence is preclassified for redacted public
or access-controlled storage; signing keys, secrets, raw customer/tenant data, and private inputs
are never public upload payloads.

## Promoted bundle manifests

Eight exact generated reports are committed in [`reports/`](reports/): five bundle manifests and
three structured browser executions. Their evidence-manifest entries bind the canonical bytes.

| Bundle/report | Payloads | Payload bytes | Promoted manifest/report SHA-256 |
| --- | ---: | ---: | --- |
| [`semantic`](reports/semantic-manifest.json) | 5 | 508,959 | `3ec7d202d2ed65926256084b42ef8296bc83527c1ea01484ecf08a1b9d27cacf` |
| [`coverage`](reports/coverage-manifest.json) | 1 | 15,650 | `f87e7c02761dc6028379430fd10dd3ac7adc64bee0bcafa9c11d840e5c1fa7bb` |
| [`browser/chromium`](reports/browser-chromium-manifest.json) | 4 | 5,960 | `67486880898a211f770922bf6cb45e9f13cce5050927a011d230b970742daa46` |
| [`browser/firefox`](reports/browser-firefox-manifest.json) | 3 | 2,630 | `3c7dd553ec32885b1072cb2280066533889021853c4817eae2a5d21e1a639464` |
| [`browser/webkit`](reports/browser-webkit-manifest.json) | 3 | 2,624 | `cd4f1ecb91cac7ef2b31775a33e62f2f3268120888d7eddae04df8c1b19553ec` |

The 16 named payloads total 535,823 bytes. The verifier reproduces their complete directories and
executes the source checker against them. Large/raw diagnostic payloads are not duplicated here
merely because the CI bundle names them; the promoted manifests retain their sizes and hashes,
while prior P02-012/P02-013 evidence provides durable dependency and coverage baselines.

The semantic manifest was produced from a clean final source commit under Node 22.23.1 with
`GITHUB_ACTIONS=true` and explicit simulated run/attempt values. That simulation proves the
GitHub-only collection branch, five-payload inventory, current-report checks, and manifest shape.
It is not a hosted workflow execution, artifact ID, artifact URL, or GitHub service digest. The
first real hosted uploads and Windows/macOS/arm64 results remain `G02` inputs.

## Dependency-report integrity

The semantic GitHub bundle retains exactly:

1. the sanitized conformance log;
2. deterministic dependency inventory;
3. raw zero-vulnerability audit;
4. raw registry-signature/provenance response; and
5. the compact observation linking all preceding report bytes.

Testing caught two integration defects before closure. First, the initial collector expected the
network-heavy license refresh even though routine CI deliberately does not generate it. The final
collector requires the four routine dependency reports instead. Second, filename presence alone
accepted stale local reports. The final contract checks current policy/lock/tool hashes, inventory
environment, raw audit/signature byte linkage, observation freshness relative to the bundle,
zero vulnerabilities, zero missing/invalid registry signatures, and all required direct
provenance attestations.

A stale set now produces a coherent `failed` manifest containing every available payload and the
exact validation reason, then exits nonzero. It cannot leave a `complete` manifest or make a failed
lane green. The source test permanently rejects stale policy linkage, raw audit substitution,
stale observation time, and missing registry signatures.

## Browser execution identity

Each browser runner used Playwright 1.61.1, one worker, zero retries, the exact Vite/Wasm bundle,
and one passing real-engine test. All reports contain zero skipped, unexpected, flaky, failed, or
attached results.

| Engine | Revision/version | Launcher entrypoint bytes | Launcher entrypoint SHA-256 | Report |
| --- | --- | ---: | --- | --- |
| Chromium | `1228` / `149.0.7827.55` | 278,568,152 | `2d18db9d8608b052b6a552ee00ec1e830f93692e928b65ecc67d693bd33fe801` | [report](reports/browser-execution-chromium.json) |
| Firefox | `1532` / `151.0` | 579,040 | `05fa1371ab7dd4ce2b2efea456aa0cc887f8c82a910d9ddc5ea5414071abbf03` | [report](reports/browser-execution-firefox.json) |
| WebKit | `2311` / `26.5` | 3,049 | `a85baad3d8c07173ac387a59b41500c382b21ed692afe0964d29aac247ccc63b` | [report](reports/browser-execution-webkit.json) |

These are the exact entrypoints Playwright invoked. They detect entrypoint substitution but are not
complete browser-distribution inventories, reproducible archives, or SBOMs. The Firefox and WebKit
entrypoints are small launch scripts, making that limitation especially important. `P16-010` owns
release-content/SBOM resolution.

Chromium additionally retains the trusted WGSL report: two reviewed compute pipelines created and
two intentional rejection fixtures rejected through Dawn/SwiftShader. No shader dispatch, GPU
correctness, WebGPU support, branded browser support, or performance result is claimed.

## Workflow retention controls

Independent YAML parsing found nine jobs and 55 steps across the three workflow files. Static
source validation found 22 full-SHA action uses and four upload steps. Every upload uses
`actions/upload-artifact` 7.0.1 at
`043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` with:

- exact run/attempt-specific names and fixed output directories;
- `if-no-files-found: error`;
- 30-day retention;
- compression level 9 and archive mode;
- no overwrite and no hidden files; and
- read-only workflow permission.

The three gating collectors and their uploads run with `if: always()`. The benchmark workflow keeps
its separate P02-014 raw/summary contract and the same service hardening. A collector or upload
failure remains red; `continue-on-error`, `|| true`, and missing-file warnings are prohibited.

## Independent clean replay

The committed [`verify.mjs`](verify.mjs) resolves the exact final source commit, verifies its
cumulative 31-file scope from the P02-014 evidence commit, checks both source-commit parents, and
recomputes every source/retained byte identity in [`manifest.json`](manifest.json). Both lockfiles
must be byte-identical to the base commit.

The verifier then extracts the final source to a temporary Git repository and performs:

- lifecycle-suppressed clean installs under exact Node 22.23.1 and 24.18.0;
- Biome, dependency policy/inventory, CI contract, TypeScript, deterministic fixtures, all named
  aggregate suites, retention policy, and all 38 source canaries on both Node lines;
- a fresh Node 22 live vulnerability/signature/provenance observation followed by the simulated
  GitHub semantic bundle and strict checker;
- native format, frozen check, Clippy with warnings denied, all-feature tests, and warning-free
  rustdoc;
- strict Clippy for both portable Rust targets, Linux x64 ASan, compiler-matched coverage, and the
  retained coverage bundle;
- pinned WASIp2 component and browser core-module validation;
- trusted Chromium WGSL validation and real Chromium/Firefox/WebKit execution/collection; and
- restored clean source and valid bundle checks after every evidence mutation.

Python independently validates the policy, five retained manifests, and three retained browser
reports with Draft 2020-12 plus format checking. PyYAML independently parses the workflows. The
verifier also reconciles all 44 specification requirement IDs, checks all 151 source-commit
Markdown files and 1,003 local links, and rejects tracked generated output.

## Negative verification

The permanent source suite rejects 38 service, profile, producer, reservation, engine, bundle,
payload, browser-report, and dependency-report mutations with exact reasons.

The evidence verifier adds 18 isolated canaries:

1. upload-action policy substitution;
2. active CI-retention shortening;
3. reserved-profile producer injection;
4. durable-promotion bypass;
5. semantic `always()` removal;
6. workflow action-SHA substitution;
7. workflow retention shortening;
8. workflow overwrite enablement;
9. hidden-file enablement;
10. archive disablement;
11. missing-file warning substitution;
12. best-effort `continue-on-error` injection;
13. bundle claim escalation;
14. bundle status contradiction;
15. coverage payload substitution;
16. stale dependency observation with recomputed payload identity;
17. browser verdict contradiction with recomputed payload identity; and
18. extra bundle-file injection.

All 56 canaries must reach their intended rejection reason. A parser, setup, network, or unrelated
test failure does not count. Every mutated file is restored and all clean bundle checks rerun before
the evidence verdict.

## Failure-path proof

Before the retained clean run, focused failure tests removed one required dependency report and one
browser execution report. In both cases the collector:

- exited nonzero;
- retained every available payload;
- wrote `status: failed` and `verdict: fail`;
- named the exact missing input; and
- returned to a complete passing bundle after restoration.

The separate stale-report test retained all five semantic payloads, recorded the cross-link failure,
and stayed red. This proves failure retention is diagnostic preservation, not result laundering.

## Limitations and next owners

- No GitHub-hosted upload was executed from this local evidence run. Hosted workflow parsing,
  artifact IDs/URLs/digests, service availability, and runner provisioning remain externally
  observable `G02` evidence.
- The semantic GitHub run ID is explicitly synthetic and is not cited as a service artifact.
- Thirty-day uploads are not permanent evidence. Promotion remains mandatory.
- Golden formats activate only with real versioned format vectors under `P03-016`.
- Crash matrices activate only with real fault points/histories under `P05-021`.
- Packaged-release retention activates only with real package/SBOM/signature/provenance outputs
  under `P16-010`.
- Browser execution proves internal toolchain smoke, not P11 browser-product support.

## Reproduction

```bash
corepack npm ci --ignore-scripts
corepack npm run artifacts:policy
corepack npm run artifacts:test
corepack npm run ci:check
corepack npm run dependencies:report
GITHUB_ACTIONS=true GITHUB_RUN_ID=24681015 GITHUB_RUN_ATTEMPT=1 \
  corepack npm run artifacts:test-replay
corepack npm run coverage:check
corepack npm run artifacts:coverage-replay
corepack npm run wgsl:validate
corepack npm run ci:browser-smoke -- chromium
corepack npm run artifacts:browser-report -- chromium
corepack npm run ci:browser-smoke -- firefox
corepack npm run artifacts:browser-report -- firefox
corepack npm run ci:browser-smoke -- webkit
corepack npm run artifacts:browser-report -- webkit
node evidence/phase-02/P02-015/verify.mjs \
  b44bd478b2f7a13e8b99fea7ff622a94d730d69f
```

Set the exact Node 22.23.1 environment for the live/GitHub-simulation commands. The verifier uses
NVM to select both supported Node lines and cleans its temporary repository automatically.

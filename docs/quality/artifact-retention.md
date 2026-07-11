# CI Artifact Retention and Durable Promotion

- Status: Accepted foundation retention contract; hosted uploads are transient diagnostics
- Last updated: 2026-07-11
- Owner: Quality owner with security and release review
- Plan items: `P02-015`; browser source binding extended by `P02-016`
- Governing requirements: `INV-007`, `QUAL-001`
- Governing gate: `G02`
- Machine authority:
  [`helix.artifact-retention-policy/1`](../../tests/toolchain/artifact-retention-policy.json)
- CI authority: [`helix.ci-matrix/3`](../../.github/ci/matrix.json)
- Collector: [`collect-retained-artifacts.mjs`](../../tests/toolchain/collect-retained-artifacts.mjs)
- Checker: [`check-retained-artifacts.mjs`](../../tests/toolchain/check-retained-artifacts.mjs)

## Purpose and claim boundary

The retention system preserves enough structured output to diagnose foundation CI failures and
replay the exact checks that produced them. It gives golden formats, test replays, crash matrices,
browser reports, and packaged releases one versioned policy before all five classes exist.

A GitHub Actions artifact is not durable project evidence. The active CI bundles expire after 30
days and may disappear sooner if a run or repository is deleted. Any artifact used to check an
implementation item, close a gate, support a compatibility/performance/security claim, or publish
a release must be promoted to committed evidence or an approved immutable external store under the
[evidence policy](../../evidence/README.md). Promotion records the byte size, SHA-256, source commit,
reproduction command, retention location, access boundary, and review result. The expiring CI copy
alone can never satisfy that rule.

The current bundles cover foundation semantic replay, dependency diagnostics, Rust coverage, Wasm
bundle validation, real-engine boundary-example execution, and Chromium WGSL compilation. They do
not prove a database, persistent format, crash recovery, browser product, supported platform,
packaged release, SBOM, signature, provenance statement, or release installation exists.

## Retention profiles

The machine policy fixes profile order, state, size ceiling, sensitivity, activation owner, CI
retention, and durable-retention rule. A reserved profile has no producer, so a workflow cannot
silently upload placeholder evidence for unimplemented functionality.

| Profile | State and current scope | CI copy | Durable rule | Activation owner |
| --- | --- | ---: | --- | --- |
| `golden-formats` | Active; 24 immutable HDoc 1.0 positive/rejection files plus schema/manifest | 90 days | Permanent by format version | Active at `P03-016` |
| `test-replays` | Active; semantic conformance/dependency diagnostics and Rust coverage | 30 days | Permanent when used by a gate or release | Active |
| `crash-matrices` | Reserved; no storage fault point, crash history, or recovery matrix exists | 90 days after activation | Permanent by persistent-format and release line | `P05-021` |
| `browser-reports` | Active; Chromium, Firefox, and WebKit boundary-example diagnostics | 30 days | Supported platform lifetime when used by a release | Active |
| `packaged-releases` | Reserved; no release package, container, SBOM, signature, or provenance artifact exists | 90 days after activation | Permanent in release and provenance stores | `P16-010` |

GitHub's service maximum in this policy is 90 days. That ceiling does not shorten a durable rule:
format, recovery, browser-support, and release evidence is promoted elsewhere before the CI copy
expires. A future producer may use less than the profile ceiling but may not weaken promotion,
sensitivity, or minimum project retention requirements.

## Versioned contracts

Three closed JSON Schemas define the accepted boundary:

- [`helix.artifact-retention-policy/1`](../../tests/toolchain/schema/artifact-retention-policy-v1.schema.json)
  describes service controls and all five profiles;
- [`helix.retained-artifact-bundle/1`](../../tests/toolchain/schema/retained-artifact-bundle-v1.schema.json)
  describes a source-bound bundle manifest; and
- [`helix.browser-execution-report/1`](../../tests/toolchain/schema/browser-execution-report-v1.schema.json)
  describes normalized Playwright execution and browser-launcher identities.

Every object is closed, every property is required, and every local schema reference resolves. The
Node contract independently checks the same shape plus invariants that JSON Schema cannot express:
exact profile order, active/reserved partition, approved producer commands, repository-contained
paths, source and payload byte identities, canonical artifact ordering, complete directory
inventory, bundle-size limits, report verdicts, and profile-specific required outputs.

Each bundle manifest records:

- exact source commit and whether the checkout was dirty;
- local or GitHub execution identity, platform, architecture, and Node version;
- fixed upstream and collector commands with the producer exit code;
- source paths, byte sizes, and SHA-256 hashes;
- every retained payload's role, media type, byte size, and SHA-256;
- retention, promotion, and sensitivity rules copied from the machine policy;
- bounded failures without filtering; and
- an explicit non-claim plus independently derived pass/fail verdict.

The collector replaces its fixed ignored output directory on each execution, rejects symlinks and
path escapes, caps manifests and payloads, and validates the finished directory before returning
success. It never selects an arbitrary command, input root, output root, profile, or browser engine.
The GitHub semantic collector additionally requires all four routine dependency reports, matches
their policy/lock/tool inputs to the current checkout, links the compact observation to the exact
raw inventory/audit/signature bytes, enforces its freshness relative to the bundle timestamp, and
rejects any vulnerability, missing/invalid registry signature, or required-provenance omission.

## Active bundles and CI placement

| Bundle | Upstream result | Retained payload | Gating lane |
| --- | --- | --- | --- |
| `test-replays/semantic` | Offline semantic conformance | Sanitized raw log; in GitHub Node 22, current deterministic inventory plus raw advisory, raw signature/provenance, and compact linked observation reports | Node 22 Linux x64 |
| `test-replays/coverage` | Compiler-matched Rust product coverage | Strict `helix.rust-coverage-report/1` | Native Linux x64 |
| `browser-reports/chromium` | Wasm/Vite boundary example in Chromium and trusted WGSL compilation | Example policy/source identities, Wasm report, bundle report, structured browser execution, WGSL report, and failure attachments | Chromium Linux x64 |
| `browser-reports/firefox` | Wasm/Vite boundary example in Firefox | Example policy/source identities, Wasm report, bundle report, structured browser execution, and failure attachments | Firefox Linux x64 |
| `browser-reports/webkit` | Wasm/Vite boundary example in WebKit | Example policy/source identities, Wasm report, bundle report, structured browser execution, and failure attachments | WebKit Linux x64 |

Collection and upload steps use `if: always()`. A failed upstream command therefore remains red,
the collector writes the available payloads and a failure manifest, and the upload step still runs.
The collector also exits nonzero for an incomplete bundle; retaining a failure never turns it into
success. If collection cannot create even the fixed bundle directory, upload fails because missing
files are an error.

Artifact names contain profile, variant, GitHub run ID, and run attempt. Uploads use
`actions/upload-artifact` 7.0.1 at full commit
`043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`, read-only workflow permission, exact directories,
30-day retention, compression level 9, archive mode, no overwrite, no hidden files, and missing-file
failure. The action's hosted artifact ID, URL, and digest are service outputs; only a hosted run can
prove those values and service behavior. Local checks prove the workflow source and bundle bytes,
not that GitHub accepted an upload.

The separate scheduled/manual benchmark upload remains governed by the
[benchmark contract](benchmark-results.md). It uses the same pinned service controls and 30-day
diagnostic boundary but retains its `P02-014` raw/summary schema rather than being relabeled as one
of the five `P02-015` bundles.

## Browser report boundary

The browser runner requests Playwright's JSON reporter in addition to its line reporter, converts
the raw output to the closed repository report, and deletes the raw reporter file. Paths are
repository-relative; repository/home prefixes are replaced; hostnames, users, actors, arbitrary
environment variables, credentials, and tokens are not recorded.

Each selected engine records Playwright's coupled revision and browser version plus the byte count
and SHA-256 of the exact launcher entrypoint returned by Playwright. This detects a changed invoked
entrypoint. It is not a complete inventory or SBOM of the downloaded browser distribution and does
not claim an independently reproducible browser archive. Failure screenshots, traces, videos, and
other Playwright attachments are retained only when the structured report names a bounded file
under `test-results/` with its byte identity.

## Sensitivity and access

Active foundation bundles accept only public repository data and sanitized tool output. The policy
rejects sensitive-looking manifest keys and the collectors do not copy arbitrary directories.
Before adding a payload, its owner must review logs, filenames, metadata, screenshots, traces, and
protocol captures for credentials, private paths, user/tenant data, or exploitable details.

Crash evidence is preclassified `redacted-public-or-access-controlled`. Sensitive evidence never
enters a public Actions artifact merely because the profile exists; it follows the restricted-store
and committed-redacted-manifest rules in the evidence policy. Packaged-release retention accepts
only public release material. Secrets, signing keys, unpublished credentials, and private build
inputs are never retention payloads.

## Activation and change rules

A reserved profile becomes active only in its named task and only when that change adds, together:

1. a real producer and upstream command for implemented behavior;
2. strict versioned schemas and source/payload identity checks;
3. bounded success and failure artifacts with negative canaries;
4. an `always()` CI collection/upload path with immutable action configuration;
5. sensitivity, access, expiry, durable promotion, and deletion rules;
6. reproduction documentation and requirement traceability; and
7. source-bound task evidence from the complete producer path.

Changing a schema identity or field meaning requires a new version. Adding an artifact class,
variant, media type, external store, or retention service requires policy, security, licensing,
workflow, checker, documentation, and evidence review. Reducing retention, permitting overwrite,
ignoring missing files, admitting hidden/arbitrary paths, filtering failures, or allowing a passing
manifest with missing required output is a hard contract failure.

## Local commands

```bash
corepack npm run artifacts:policy
corepack npm run artifacts:test
corepack npm run artifacts:golden-formats
corepack npm run artifacts:test-replay
corepack npm run artifacts:coverage-replay
corepack npm run artifacts:browser-report -- chromium
corepack npm run artifacts:browser-report -- firefox
corepack npm run artifacts:browser-report -- webkit
node tests/toolchain/check-retained-artifacts.mjs bundle test-replays semantic
node tests/toolchain/check-retained-artifacts.mjs bundle golden-formats hdoc-v1
node tests/toolchain/check-retained-artifacts.mjs bundle test-replays coverage
node tests/toolchain/check-retained-artifacts.mjs bundle browser-reports chromium
```

The upstream coverage and browser checks must run first when their ignored reports do not exist.
The semantic collector runs its own fixed conformance command. Locally generated bundles record a
dirty checkout honestly and remain ignored diagnostics until explicitly promoted under the evidence
policy.

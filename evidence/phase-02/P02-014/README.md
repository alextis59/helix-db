# P02-014 Benchmark Result and Retention Evidence

- Task: `P02-014` — add benchmark result schemas and a non-gating baseline job that preserves raw results
- Requirements supported: `INV-007`, `QUAL-001`
- Commit under test: `7a3a232a51cee61671952bd6c384bba70530739c`
- Recorded at: `2026-07-11T04:04:21.135Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Accepted ADRs: none
- Verdict: Pass

## Scope and result

The source commit adds one bounded benchmark foundation without claiming database performance:

- three closed JSON Schema Draft 2020-12 contracts for workload, raw result, and summary;
- one deterministic `harness.sha256-buffer/1` workload;
- one fixed-argument runner and an independent report checker;
- nineteen permanently executed mutation canaries;
- an active stable `test:benchmark` suite that compiles the optimized Rust profile and validates the
  harness result;
- one scheduled/manual observational Linux x64 lane; and
- a full-SHA-pinned `upload-artifact` step that retains raw and summary JSON for 30 days.

No npm or Cargo dependency, lockfile, database function, Cargo benchmark target, external dataset,
GPU path, or public package was added. The job has no push or pull-request trigger. No timing value
is an acceptance threshold.

## Workload and deterministic dataset

The accepted workload performs eight Node `crypto` SHA-256 operations per repetition over a
warm-host-memory 1 MiB buffer, with one thread, five retained warm-ups, and twenty retained
measurements. The dataset uses `helix.lcg32-byte-buffer/1` with:

| Field | Value |
| --- | --- |
| Seed | `3237998081` |
| Multiplier | `1664525` |
| Increment | `1013904223` |
| Output | High byte of each next 32-bit state |
| Bytes | `1,048,576` |
| Final state | `3348098561` |
| SHA-256 | `da1702703965eace2e9df275ec2e0f94654aa11a7c25421f643f299da42fad97` |
| Provenance/license | Repository-generated / MIT |

The verifier regenerates all 1,048,576 bytes independently and checks the final state and digest.
Python/jsonschema separately validates the workload against the committed Draft 2020-12 schema.

## Retained raw result

The retained [`raw.json`](reports/raw.json) is 53,031 bytes with SHA-256
`6a37d68358757c97e33222eec40e0fd071e0bd1e74a1834669cdcb76a73f1869`.
It binds the exact source commit with `dirty: false`, the workload and all three schemas, the runner
and contract source, dataset identity, full configuration, allowlisted environment, all
observations, all stages, failures, fallbacks, and integrity verdict.

| Raw count | Value |
| --- | ---: |
| Warm-up observations | 5 |
| Measured observations | 20 |
| Passed observations | 25 |
| Failed observations | 0 |
| Fallback observations | 0 |
| Measured operations | 160 |
| Measured input | 167,772,160 bytes |
| Verified measured digests | 20 |

Every observation contains the same fourteen-stage inventory. `execute`, `verify`, `materialize`,
and `end_to_end` are measured. Parse/plan, storage read, sidecar decode, prepare, transfer in, queue
wait, transfer out, row fetch, projection/sort, and serialization are explicitly non-applicable
with zero duration. No stage or failed/fallback record is filtered.

## Retained summary

The retained [`summary.json`](reports/summary.json) is 5,117 bytes with SHA-256
`4f7d4ce3f61324c5937e6b5dc138417aa3e6f664d96c77d978cace503d7423ad`.
It binds the exact raw bytes, reproduces their source/environment/count/correctness identities, and
contains independently recomputed min/nearest-rank p50/p95/p99/max/rounded-mean distributions.

The evidence verifier recomputes every summary distribution from raw measured observations with
integer arithmetic. The summary records:

```json
{
  "kind": "integrity-only",
  "performance_threshold": null,
  "integrity_passed": true
}
```

The recorded timings are machine-specific diagnostic facts. They are deliberately not copied into
this evidence narrative as a product result, comparison, regression threshold, or performance
claim.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64 / Node x64
CPU: 11th Gen Intel(R) Core(TM) i5-11300H @ 3.10GHz
logical CPUs: 8
reported memory: 16,503,111,680 bytes
rustc: 1.96.1 (31fca3adb 2026-06-26)
cargo: 1.96.1 (356927216 2026-06-26)
retained Node: v22.23.1
retained V8: 12.4.254.21-node.56
retained OpenSSL: 3.5.7
supported Node replay: 22.23.1, 24.18.0
Corepack: 0.34.0
npm through Corepack: 11.18.0
Python jsonschema: 4.23.0
PyYAML: 6.0
```

GPU and storage identities are `null`; background load and power/thermal state are explicitly
unknown; network is not used. The raw result contains no hostname, user, actor, email, token,
secret, password, or arbitrary environment dump.

## Non-gating workflow and retention

The machine CI authority now contains eleven gating lanes, two nightly native lanes, and one
observational benchmark lane. Independent YAML parsing found nine jobs and 49 steps across the
three workflows.

The benchmark workflow:

- runs only at `17 4 * * 1` or manual dispatch;
- uses fixed `ubuntu-24.04` and Node 22.23.1;
- has only `contents: read` permission;
- disables persisted checkout credentials and implicit package caching;
- performs a lifecycle-suppressed locked install;
- fails on schema, dependency, build, correctness, report, or upload error;
- uploads on `always()` so runner-created failure results survive;
- fails when the exact two-file output is absent;
- rejects overwrite and hidden files; and
- retains each run/attempt artifact for 30 days.

Official `actions/upload-artifact` tag `v7.0.1` was resolved with `git ls-remote` to
`043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`; the workflow and machine authority use only that
full commit. The verifier rejects mutable/wrong pins, push triggers, best-effort execution, missing
always-upload behavior, shortened retention, weakened missing-file handling, overwrite, wrong
artifact path, and an observational lane relabeled as gating.

`P02-015` still owns general golden-format, replay, crash, browser, and release artifact retention.
The 30-day observation is not sufficient retention for a future published performance claim.

## Independent clean replay

The committed [`verify.mjs`](verify.mjs) resolves the exact source commit and requires its exact
33-file scope. It verifies every source artifact byte/hash in [`manifest.json`](manifest.json),
confirms both lockfiles are unchanged, and checks the retained raw/summary byte identities.

Before trusting the source checker, the evidence verifier independently:

- regenerates the dataset;
- checks all 25 observations, 350 stage records, result digests, counts, costs, and claim fields;
- recomputes every summary distribution and raw linkage;
- validates no sensitive environment key exists;
- parses the three workflow YAML files through PyYAML's non-coercing loader;
- validates workload/raw/summary through Python Draft 2020-12 validation;
- reconciles all 44 specification requirement IDs with the ledger;
- checks all 149 source-commit Markdown files and 978 local links; and
- rejects tracked generated output.

It then extracts the source commit into a temporary repository and performs lifecycle-suppressed
clean installs under exact Node 22.23.1 and 24.18.0. Both run the benchmark suite and CI contract;
Node 22 additionally runs the full JavaScript policy, dependency inventory, TypeScript, fixtures,
and aggregate suite. Native format, frozen check, Clippy with warnings denied, and all-feature tests
also pass. The temporary repository is clean after every restored mutation.

The broader source gate additionally passed warning-free rustdoc, both portable Rust targets,
Linux x64 ASan, compiler-matched coverage, WASIp2 component and browser core-module validation,
trusted WGSL compilation, and real Chromium/Firefox/WebKit bundle execution.

## Negative verification

The source suite permanently rejects nineteen intended mutations covering workload versions,
claims, dataset identity, stages, raw schema/fields/environment/sources/counts/fallbacks/digests,
cost omission, failure filtering, verdicts, raw-summary linkage, statistics, and threshold injection.

The evidence verifier adds 23 isolated rejection canaries:

1. runner argument injection;
2. checker mode injection;
3. unknown raw schema;
4. incomplete observation inventory;
5. passing fallback;
6. wrong result digest;
7. non-applicable nonzero stage cost;
8. sensitive hostname retention;
9. wrong summary raw hash;
10. altered summary distribution;
11. injected performance threshold;
12. extra output file;
13. post-run source drift;
14. workload claim-eligibility escalation;
15. push-trigger addition;
16. `continue-on-error` addition;
17. wrong upload-action SHA;
18. missing `always()` upload;
19. one-day retention;
20. warning-only missing-file behavior;
21. overwrite enablement;
22. wrong artifact path; and
23. observational lane changed to gating.

All 42 source/evidence canaries must reach their intended rejection reason. An unrelated parser,
compiler, or setup failure does not count.

## Reproduction commands

```bash
corepack npm ci --ignore-scripts
corepack npm run benchmark:schemas
corepack npm run test:benchmark
corepack npm run benchmark:check
corepack npm run benchmark:test
corepack npm run ci:check
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run dependencies:check
corepack npm run toolchain:types
corepack npm run fixtures:check
corepack npm test
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
node evidence/phase-02/P02-014/verify.mjs 7a3a232a51cee61671952bd6c384bba70530739c
```

## Claim and review boundary

This evidence proves strict versioned benchmark artifacts, an honest complete calibration result,
failure/fallback retention, independent summary integrity, and a secured non-gating retention job.
It does not prove database functionality, benchmark representativeness, stable hosted-runner speed,
storage/network/GPU cost, CPU/GPU equivalence, browser product behavior, a published performance
claim, a successful hosted artifact upload, or `G02` closure. Hosted execution and independent gate
review remain pending.

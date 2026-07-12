# Benchmark Result, Baseline, and Retention Contract

- Status: Accepted foundation and HDoc v1 benchmark contracts; no release performance claim
- Last updated: 2026-07-11
- Owner: Performance owner with quality and release review
- Plan items: `P02-014`, extended by `P03-020`
- Governing requirements: `INV-007`, `QUAL-001`
- Governing gate: `G02`
- Workload authority: [`helix.benchmark-workload/1`](../../benchmarks/workloads/harness-calibration-v1.json)
- Raw-result schema: [`helix.benchmark-raw-result/1`](../../benchmarks/schema/raw-result-v1.schema.json)
- Summary schema: [`helix.benchmark-summary/1`](../../benchmarks/schema/summary-v1.schema.json)
- Observational workflow: [`benchmark-baseline.yml`](../../.github/workflows/benchmark-baseline.yml)

The P03-020 extension adds [`helix.hdoc-benchmark-workload/1`](../../benchmarks/workloads/hdoc-v1.json),
[`helix.hdoc-benchmark-raw/1`](../../benchmarks/schema/hdoc-raw-v1.schema.json), and
[`helix.hdoc-benchmark-summary/1`](../../benchmarks/schema/hdoc-summary-v1.schema.json). Its Rust
engine executes production codec/view APIs for five fixed shapes and six operations. Each operation
retains 20 samples of 16 iterations after five warm-ups: 600 samples and 9,600 timed iterations.
Exact base/canonical/tagged sizes and real path-dictionary snapshot overhead are correctness-checked.
The dictionary comparison models 10,000 documents with one u32 ID per registered path reference;
it is explicitly not an implemented dictionary-reference HDoc profile.

P03-020 records facts but makes no format decision. Every raw result binds seven source files, the
Git commit/dirty state, allowlisted host facts, every timing, verification checksum, compression
count, and dictionary equation. The summary links exact raw bytes and recomputes nearest-rank
p50/p95/p99 plus min/max/mean. Its timing threshold is always null and `P03-021` owns interpretation.

## Purpose and claim boundary

The Phase 2 benchmark exists to prove measurement, integrity checking, result summarization, failure
retention, and CI artifact preservation before database workloads exist. It hashes a deterministic
host-memory buffer through Node's standard cryptographic implementation. It does not execute any
HelixDB document, storage, query, columnar, WebGPU, server, browser, durability, or distributed code.

Every workload, raw result, and summary therefore carries this closed claim boundary:

```json
{
  "eligible": false,
  "scope": "harness-integrity-only",
  "reason": "The workspace contains no database implementation ..."
}
```

The baseline has no throughput, latency, regression, release, or comparison threshold. A slow run
passes when every required observation completes and verifies correctly; a fast incorrect,
fallback, incomplete, malformed, or unretained run fails. Raw timings may help diagnose runner or
harness drift, but cannot be quoted as HelixDB performance.

## Versioned authorities

| Artifact | Identity | Responsibility |
| --- | --- | --- |
| [Workload](../../benchmarks/workloads/harness-calibration-v1.json) | `helix.benchmark-workload/1`, workload `harness.sha256-buffer/1` version `1.0.0` | Dataset, scale, backend, residency, repetition counts, stage order, failure policy, claim boundary, and output bounds |
| [Workload schema](../../benchmarks/schema/workload-v1.schema.json) | JSON Schema Draft 2020-12 | Closed workload shape and exact foundation constants |
| [Raw-result schema](../../benchmarks/schema/raw-result-v1.schema.json) | `helix.benchmark-raw-result/1` | Environment, source identity, all observations/stages, failures, fallbacks, and integrity verdict |
| [Summary schema](../../benchmarks/schema/summary-v1.schema.json) | `helix.benchmark-summary/1` | Raw-byte linkage, environment identity, counts, distributions, validation, and threshold absence |
| [Contract module](../../benchmarks/benchmark-contract.mjs) | Source-bound by every raw result | Independent recomputation, strict field checks, statistics, file identities, and output inventory |
| [Runner](../../benchmarks/run-baseline.mjs) | Source-bound by every raw result | Bounded dataset generation, measurement, verification, and canonical output |
| [Checker](../../benchmarks/check-benchmark-artifacts.mjs) | Fixed `schemas` and `report` modes | Local/CI verification interface with no arbitrary path or command arguments |

All three schemas are closed: every object sets `additionalProperties: false`, every property is
required, and local references must resolve. The Node checker also rejects unknown fields,
non-integer or unsafe JSON numbers, control characters, sensitive environment keys, unknown
versions, source/hash drift, unexpected files, noncanonical JSON, oversized output, missing raw
linkage, and recomputed-summary differences. The schema files remain language-neutral authorities;
the Node checks are an independent executable interpretation, not permission to weaken them.

Changing a schema identity or observable field meaning requires versioning and migration/rejection
coverage. Changing a workload constant requires a new workload version or ID and cannot rewrite a
retained result into the new meaning.

## Deterministic dataset

The workload generates exactly 1,048,576 bytes in memory with the versioned
`helix.lcg32-byte-buffer/1` algorithm:

```text
state[0] = 3237998081
state[n+1] = (1664525 * state[n] + 1013904223) mod 2^32
byte[n] = state[n+1] >> 24
```

The expected final state is `3348098561`. The complete buffer SHA-256 is
`da1702703965eace2e9df275ec2e0f94654aa11a7c25421f643f299da42fad97`. The runner
recomputes both before timing, and the verifier independently regenerates the bytes. This is
original repository-generated MIT-licensed test data; no external benchmark corpus is committed.

## Workload and measurement method

| Dimension | Fixed value |
| --- | --- |
| Operation/backend | SHA-256 through `node:crypto` |
| Residency | Warm host memory |
| Scale | 1 MiB input per operation |
| Selectivity | Not applicable |
| Result | 32-byte digest |
| Concurrency | One |
| Warm-ups | Five, retained individually |
| Measured repetitions | Twenty, retained individually |
| Operations per repetition | Eight |
| Total measured work | 160 operations / 160 MiB input |
| Outlier policy | None; no observation is removed |
| Timeout | 120,000 ms for the complete run |
| Failure/fallback policy | Retain and fail |

Each repetition records the exact ordered stage inventory below. Non-applicable stages remain in
the raw result with `applicable: false` and a zero duration; they are never silently omitted or
reported as measured zero-cost product work.

| Stage | Foundation calibration behavior |
| --- | --- |
| `parse_plan` | Not applicable |
| `storage_read` | Not applicable |
| `sidecar_decode` | Not applicable |
| `prepare` | Not applicable; the verified resident dataset exists before observations |
| `transfer_in` | Not applicable |
| `queue_wait` | Not applicable |
| `execute` | Eight complete SHA-256 operations |
| `transfer_out` | Not applicable |
| `verify` | Constant-time comparison of all eight digests with the expected digest |
| `row_fetch` | Not applicable |
| `projection_sort` | Not applicable |
| `serialization` | Not applicable |
| `materialize` | Convert the final 32-byte digest to canonical lowercase hexadecimal |
| `end_to_end` | Execution through materialization and verification, including intervening overhead |

`end_to_end` must be at least the sum of the three applicable component durations. Every passing
observation must record eight operations, 8 MiB input, 32 output bytes, the expected digest, no
fallback, no error, and a verified result. Warm-ups are excluded from summary distributions but
retained in raw data and counted in the integrity verdict.

## Raw result contract

The raw result contains:

- UTC recording time and a local or GitHub execution identity;
- the exact workload byte size and SHA-256;
- byte sizes and SHA-256 hashes for the workload, three schemas, contract module, and runner;
- the 40-character Git source commit and whether the worktree was dirty;
- CPU architecture/model/count, total memory, OS platform/release, Node, V8, and OpenSSL;
- only allowlisted GitHub workflow/job/repository/ref/SHA/run metadata when applicable;
- explicit `null` GPU and storage identities because this harness does not measure them;
- unknown background-load and power/thermal state, isolation class, and unused-network state;
- the complete configuration and deterministic dataset identity;
- five warm-up plus twenty measurement observations in stable order;
- every applicable and non-applicable stage for every observation;
- failures and fallbacks without filtering; and
- recomputable totals and an integrity verdict.

Hostname, user name, actor, email, credentials, secrets, tokens, arbitrary environment variables,
and file lists from a dirty worktree are not recorded. This keeps the artifact useful without
turning a public CI upload into a host-identity or secret-exposure channel.

## Summary and statistics

The summary names the exact raw path, byte count, and SHA-256. It cannot be validated against a
different serialization or result. Counts, environment identity, correctness totals, and every
stage distribution are recomputed from raw observations.

For each stage, distributions use measured repetitions only:

- values are sorted as integer nanoseconds;
- p50, p95, and p99 use nearest rank, `ceil(p * n) - 1` in zero-based form;
- mean is the nearest integer nanosecond using integer arithmetic;
- minimum and maximum are observed values;
- applicable stages require twenty samples for a passing baseline; and
- non-applicable stages have zero samples and `null` statistics.

The summary explicitly records `kind: integrity-only`, `performance_threshold: null`, and whether
integrity passed. No statistical value participates in acceptance.

## Local commands and outputs

```bash
corepack npm run benchmark:schemas
corepack npm run benchmark:baseline
corepack npm run benchmark:check
corepack npm run benchmark:test
corepack npm run test:benchmark
```

`test:benchmark` first compiles all eight crates with the accepted optimized Cargo benchmark
profile and confirms that zero Cargo benchmark targets exist. It then validates the three schemas,
runs the one foundation workload, and independently verifies both artifacts. All entry points have
fixed argument sets and invoke no shell, installer, network service, browser, database, or GPU.

Each run replaces the ignored fixed directory `dist/benchmarks/baseline/` with exactly:

```text
raw.json
summary.json
```

The raw artifact is capped at 1 MiB and the summary at 128 KiB. Local results are ephemeral until
deliberately promoted to task evidence or another approved store. The runner never commits a
machine-specific result into `benchmarks/reports/` automatically.

## Non-gating CI and retention

The separate `Benchmark Baseline` workflow runs at 04:17 UTC each Monday or by manual dispatch. It
has no `push` or `pull_request` trigger, so it does not enter the required gating matrix. It remains
observable: schema, dependency, build, integrity, or upload failure makes the job red, and
`continue-on-error` is prohibited.

The workflow uses fixed `ubuntu-24.04`, Node 22.23.1, lifecycle-suppressed locked installation,
read-only repository permission, non-persisted checkout credentials, and disabled implicit package
cache. `actions/upload-artifact` 7.0.1 is pinned to full commit
`043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`. Its upload step runs with `if: always()` so a
runner-created failure report is preserved, fails if the two-file output is absent, refuses
overwrite, excludes hidden files, and retains each run/attempt artifact for 30 days. The action
produces an immutable artifact and SHA-256 artifact digest as described by its
[official documentation](https://github.com/actions/upload-artifact/tree/v7.0.1).

This benchmark remains the separate result contract owned by `P02-014`. The general
[artifact-retention policy](artifact-retention.md) established by `P02-015` uses the same pinned
service controls for semantic, coverage, and browser diagnostics and reserves future golden-format,
crash-matrix, and packaged-release profiles. A result supporting a published performance claim
must be promoted to the longer-lived evidence location required by the
[evidence guide](../../evidence/README.md#benchmark-specific-rules); the 30-day observational
artifact alone is insufficient.

## Failure and review rules

A run fails integrity if any of these occurs:

- schema, workload, source, dataset, environment, observation, or output inventory drift;
- incomplete warm-up or measurement counts;
- timeout, execution error, wrong digest, unsafe number, or invalid duration;
- any fallback or filtered failure;
- an end-to-end duration that omits an applicable measured stage;
- a raw/summary size overflow or raw digest mismatch;
- a performance threshold or claim-eligible flag appears;
- the CI workflow becomes push/PR-triggered, mutable, credentialed, or best-effort; or
- artifact upload is absent, mutable, shortened, or allowed to ignore missing files.

Performance comparisons, new datasets, cold-storage/warm-host/GPU-resident modes, product
operations, throughput derivations, regression thresholds, or publication language require their
own reviewed workload versions and raw evidence. Later benchmark suites extend this contract; they
do not reinterpret the foundation calibration as historical database performance.

## What this proves

This contract proves that the repository can define one strict workload, generate and verify its
dataset, record complete unfiltered observations and environment facts, derive a raw-linked
summary, reject integrity drift, and preserve results in a visible non-gating job.

It does not prove database functionality, representative workload selection, stable hosted-runner
performance, CPU/GPU equivalence, storage or network cost, browser behavior, release performance,
or `G02` closure.

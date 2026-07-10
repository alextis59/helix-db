# Performance Claim: CLAIM TITLE

- Status: Draft / Reproducible / Published / Superseded
- Owner: Performance owner
- Date: YYYY-MM-DD
- Applies to version/artifact: IMMUTABLE VERSION OR DIGEST
- Requirements/tasks: `TASK-ID`
- Evidence directory: LINK

## Exact claim

Write one bounded sentence naming operation, dataset, scale, configuration, hardware/software profile, comparison baseline, statistic, and observed range. Avoid “fast,” “faster,” or “GPU-accelerated” without the conditions that make the statement true.

## Non-claims

List common interpretations the evidence does not support, including different scales, selectivities, residency states, devices, browsers, concurrency, durability, result sizes, or workloads.

## Artifact under test

| Item | Value |
| --- | --- |
| Source commit | Full hash |
| Package/container/binary | Immutable locator and digest |
| Configuration | Path and hash |
| Format/protocol versions | Values |
| Build profile/features | Values |

The tested artifact must be the artifact named by any release claim.

## Environment

| Dimension | Value |
| --- | --- |
| OS/kernel/browser | ... |
| Architecture/CPU | ... |
| Memory | ... |
| Storage/filesystem | ... |
| GPU/driver/adapter features | ... |
| Rust/Node/Wasm runtime | ... |
| Power/thermal mode | ... |
| Network/topology | ... |

Record background load, isolation, clocks, and any unavailable information.

## Dataset

- Generator and source commit.
- Seed and manifest hash.
- Document count and total bytes.
- Shape, nesting, sparsity, type distribution, arrays, and blobs.
- Indexes and sidecar fields.
- Compression and format versions.
- License/provenance.

## Workload

- Operation/query and expected result hash.
- Selectivity and result size.
- Read/write concern and durability configuration.
- Concurrency and arrival model.
- Warm-up and cache/residency preparation.
- Compaction, ingest, backup, or background activity.
- Deadlines, quotas, and resource limits.

## Compared implementations

Describe scalar CPU, optimized CPU/SIMD, GPU, index, row scan, prior release, or external baseline configurations. Comparisons must preserve semantics, result materialization, durability, and correctness verification.

## Residency and cost path

Classify each run as cold storage, warm host memory, or GPU-resident. Report:

```text
parse/plan
storage read
sidecar decode
prepare
upload
queue wait
kernel
download
CPU verification
row fetch
projection/sort
serialization
end-to-end
```

Do not substitute kernel time for end-to-end time.

## Method

- Reproduction command.
- Warm-up iterations.
- Measured iterations and independent process runs.
- Randomization/order controls.
- Timeout and failure handling.
- Outlier policy defined before results.
- Statistical summaries and uncertainty.

## Raw results

| Artifact | Hash | Purpose |
| --- | --- | --- |
| LINK | SHA-256 | Raw run records |

Preserve failures and fallback runs.

## Results

Report distributions, not only best runs. Include p50/p95/p99 where meaningful, throughput, CPU, memory, disk, GPU memory, transfer bytes, energy/power if measured, and planner selection accuracy.

## Correctness validation

Record expected and actual result hashes, CPU/GPU differential status, fallback status, errors, skips, and any tolerance rule. A faster wrong result invalidates the claim.

## Acceptance or pivot decision

State whether the result meets the predeclared threshold, which planner/profile rule changes, and what evidence would invalidate the conclusion.

## Reproduction

Provide clean setup, dataset generation, execution, report generation, artifact verification, and teardown commands.

## Review and publication

- [ ] Environment and artifact identity verified.
- [ ] Raw data and hashes available.
- [ ] Correctness result verified.
- [ ] Baseline is optimized and semantically equivalent.
- [ ] Claim wording matches observed conditions.
- [ ] Non-claims and limitations are visible.
- [ ] Independent performance review recorded.

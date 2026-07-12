# Benchmarks

This root contains versioned workload/result schemas, a bounded runner, and compact report indexes. It does not contain a database performance claim.

- `datasets/` owns deterministic dataset specifications and manifests.
- `cpu-columnar/` owns row/CPU-columnar comparisons.
- `webgpu/` owns end-to-end GPU comparisons, including preparation and transfer.
- `reports/` owns compact retained summaries and immutable raw-result references.
- `schema/` owns strict Draft 2020-12 workload, raw-result, and summary schemas.
- `workloads/` owns reviewed versioned workload definitions.

Every publishable result must follow the [benchmark evidence rules](../evidence/README.md#benchmark-specific-rules) and the [result contract](../docs/quality/benchmark-results.md).

`npm run test:benchmark` compiles the eight-crate workspace through the fixed benchmark profile,
requires exactly zero Cargo benchmark targets, and runs two versioned workloads. The P02-014
SHA-256 calibration proves the reporting path. The P03-020 workload executes the production HDoc
encoder, validating decoder, direct-field lookup, and dotted-path lookup across five fixed shapes;
it also records exact base/compressed/tagged sizes and a real-snapshot-plus-u32-ID dictionary byte
model. Both retain five warm-ups and twenty raw measurement samples without a timing threshold.
The P03-021 decision checker binds those immutable inputs, selects the self-contained HDoc 1.0
base/canonical-compression profiles, and retains collection dictionary IDs only for derived data.
Its contract test rejects 13 kinds of decision, input, or claim-boundary drift.

P04-016 adds the host-boundary harness: 400 correctness-checked observations across native Rust,
Chromium, Firefox, and WebKit for chatty, batched-copy, opaque-handle, and shared-staging shapes.
Raw/summary output is written under `dist/benchmarks/host-boundary/`; the accepted local observation
is retained in `reports/host-boundary-2026-07-12.json`. Timing is observational until P04-017.

Focused commands:

```bash
corepack npm run benchmark:schemas
corepack npm run benchmark:baseline
corepack npm run benchmark:check
corepack npm run benchmark:test
corepack npm run benchmark:hdoc:policy
corepack npm run benchmark:hdoc
corepack npm run benchmark:hdoc:check
corepack npm run benchmark:hdoc:test
corepack npm run benchmark:hdoc:decisions
corepack npm run benchmark:hdoc:decisions:test
corepack npm run benchmark:host
corepack npm run benchmark:host:check
corepack npm run benchmark:host:test
```

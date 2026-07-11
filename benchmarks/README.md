# Benchmarks

This root contains versioned workload/result schemas, a bounded runner, and compact report indexes. It does not contain a database performance claim.

- `datasets/` owns deterministic dataset specifications and manifests.
- `cpu-columnar/` owns row/CPU-columnar comparisons.
- `webgpu/` owns end-to-end GPU comparisons, including preparation and transfer.
- `reports/` owns compact retained summaries and immutable raw-result references.
- `schema/` owns strict Draft 2020-12 workload, raw-result, and summary schemas.
- `workloads/` owns reviewed versioned workload definitions.

Every publishable result must follow the [benchmark evidence rules](../evidence/README.md#benchmark-specific-rules) and the [result contract](../docs/quality/benchmark-results.md).

`npm run test:benchmark` compiles the eight-crate workspace through the fixed benchmark profile, requires exactly zero Cargo benchmark targets, then runs one deterministic SHA-256 harness calibration. It retains five warm-ups and twenty measurements in ignored `dist/benchmarks/baseline/raw.json`, derives a raw-linked summary, and applies integrity checks only. This proves the reporting/retention path, not database performance.

Focused commands:

```bash
corepack npm run benchmark:schemas
corepack npm run benchmark:baseline
corepack npm run benchmark:check
corepack npm run benchmark:test
```

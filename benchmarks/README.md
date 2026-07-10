# Benchmarks

This root will contain reproducible workload definitions and compact report indexes. It does not contain a performance claim.

- `datasets/` owns deterministic dataset specifications and manifests.
- `cpu-columnar/` owns row/CPU-columnar comparisons.
- `webgpu/` owns end-to-end GPU comparisons, including preparation and transfer.
- `reports/` owns compact retained summaries and immutable raw-result references.

Every publishable result must follow the [benchmark evidence rules](../evidence/README.md#benchmark-specific-rules).

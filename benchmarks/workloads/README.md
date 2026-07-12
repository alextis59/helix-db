# Benchmark Workloads

Workloads are immutable-in-meaning, versioned inputs that fix dataset identity, scale, backend, residency, warm-ups, measurements, stages, failure handling, output bounds, and claim eligibility.

[`harness-calibration-v1.json`](harness-calibration-v1.json) validates the measurement/reporting
path with a deterministic host-memory SHA-256 operation. [`hdoc-v1.json`](hdoc-v1.json) adds the
first product-code workload: five fixed HDoc shapes, six codec/lookup operations, fixed repetition
bounds, exact size/dictionary-model checks, and an explicit `P03-021` decision boundary. Neither
workload creates a cross-machine or release performance claim.

```bash
corepack npm run test:benchmark
```

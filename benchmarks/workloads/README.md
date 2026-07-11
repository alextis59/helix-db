# Benchmark Workloads

Workloads are immutable-in-meaning, versioned inputs that fix dataset identity, scale, backend, residency, warm-ups, measurements, stages, failure handling, output bounds, and claim eligibility.

The only current workload, [`harness-calibration-v1.json`](harness-calibration-v1.json), validates the measurement/reporting path with a deterministic host-memory SHA-256 operation. It is not a database workload or performance claim.

```bash
corepack npm run test:benchmark
```

# Benchmark Schemas

The original three JSON Schema Draft 2020-12 documents define the versioned calibration workload,
raw-result, and summary contracts for `P02-014`. P03-020 adds closed HDoc raw and summary schemas;
its workload authority is interpreted by the source-bound contract module. Every report object is
closed and every field is required. Unknown versions and fields fail validation.

```bash
corepack npm run benchmark:schemas
corepack npm run benchmark:hdoc:policy
```

See the [benchmark result contract](../../docs/quality/benchmark-results.md) for semantics, statistics, claim boundaries, and change rules.

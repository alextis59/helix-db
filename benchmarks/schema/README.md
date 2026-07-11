# Benchmark Schemas

The three JSON Schema Draft 2020-12 documents define the versioned workload, raw-result, and summary contracts for `P02-014`. Every object is closed and every field is required. Unknown versions and fields fail validation.

```bash
corepack npm run benchmark:schemas
```

See the [benchmark result contract](../../docs/quality/benchmark-results.md) for semantics, statistics, claim boundaries, and change rules.

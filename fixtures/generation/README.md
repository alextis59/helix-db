# Deterministic Fixture Generation

This directory owns the versioned [`helix.fixture-generator-registry/1`](registry-v1.json), committed seed allocation, cross-language PRNG vectors, strict Draft 2020-12 schemas, and timestamp-free [generation report](report-v1.json).

The aggregate check runs four registered generators: the seeded SplitMix64 vector, semantic corpus, semantic oracle report, and v1 compatibility matrix. Their authority artifacts are hash-bound in the report; existing component checkers continue to validate the complete outputs behind each authority manifest.

```bash
npm run fixtures:check
npm run fixtures:generate
git diff -- fixtures/ compatibility/v1/ docs/compatibility/
npm run fixtures:check
```

`fixtures:generate` is an intentional write operation. Review every changed seed, schema, input identity, artifact byte/hash, semantic classification, and derived document before committing. The [deterministic generation policy](../../docs/quality/deterministic-fixture-generation.md) defines seed allocation, reproducibility, validation, and claim boundaries.

Live upstream observations, fuzz-discovered reproducers, benchmark measurements, crash histories, and security evidence are not deterministic generated fixtures merely because they are stored as JSON. They use their own provenance and evidence contracts.

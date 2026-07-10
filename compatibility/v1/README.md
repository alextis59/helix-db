# V1 Semantic and Compatibility Matrix

- Status: Published foundation semantic baseline
- Matrix version: 1.0.0
- Semantic profile: `helix-native-v1`
- Plan item: `P01-022`
- Requirements: `INV-010`, `DATA-001`, `DATA-002`, `QUERY-001`, `QUERY-002`, `COMPAT-001`

This directory owns the machine-readable source and deterministic publication of the v1 semantic/compatibility matrix. It separates four questions that must never be collapsed:

1. Is native behavior normatively specified?
2. Can the independent semantic oracle execute it?
3. Is a product engine implementation available?
4. What, if anything, has been observed against a pinned MongoDB reference?

At this milestone the answer to both MongoDB and Redis adapter support is always “unsupported”: no adapter or compatibility wire endpoint exists. The 16 MongoDB differential rows are experimental observations, even when their normalized results are exact; no Redis differential/protocol row exists yet. Closed-world rules classify every unlisted native, MongoDB, and Redis behavior as unsupported.

## Artifacts

- [Machine-readable matrix](matrix-v1.json)
- [Draft 2020-12 schema](schema/matrix-v1.schema.json)
- [Generated human-readable matrix](../../docs/compatibility/v1-semantic-compatibility-matrix.md)
- [Deterministic generator](generate-matrix.mjs)
- [Independent integrity checker](check-matrix.mjs)

## Reproduction

```bash
node compatibility/v1/generate-matrix.mjs --check
node compatibility/v1/check-matrix.mjs
```

`--write` is an intentional publication operation. Review all changed classifications and input hashes before committing:

```bash
node compatibility/v1/generate-matrix.mjs --write
git diff -- compatibility/v1/matrix-v1.json docs/compatibility/v1-semantic-compatibility-matrix.md
```

The generator derives registry inventories and MongoDB case results from hash-bound artifacts. The independent checker owns a separate expected inventory and rejects missing/duplicate rows, unsupported-policy weakening, hash/count drift, schema failures, noncanonical ordering, unaccounted errors/limits/operations, any supported adapter row, and any failed or skipped differential row.

## Change policy

A matrix change is a compatibility publication change. It requires a new matrix version when a classification, closed-world policy, semantic profile, upstream profile, or authorized claim changes. Updating a source hash without reviewing the resulting rows is prohibited.

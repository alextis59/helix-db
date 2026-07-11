# Immutable HDoc 1.0 Golden Vectors

This directory freezes the first supported HDoc byte artifacts under `P03-016`. The
[manifest](manifest.json) binds 24 complete files by exact byte length and SHA-256: four accepted
documents and 20 rejected inputs with stable public error/check outcomes.

The positive set covers all 16 logical type tags, nested and empty containers, Unicode without
normalization, numeric/decimal/temporal/vector boundaries, the base profile, and canonical bounded
compression profile 1/1. The invalid set covers magic, exact major/minor version negotiation,
document/required/optional features, truncation and trailing bytes, CRC, section overlap/version,
type tags, footer/hash profile/content identity, compression codec/expansion bounds, nonzero
padding/noncanonical layout, and a persistent field-count limit.

These files are immutable. The Rust producer creates missing files only; it never overwrites an
existing path. If the supported byte format changes, add a new versioned fixture root and migration
decision instead of regenerating this one.

```bash
node fixtures/hdoc/v1/check.mjs --check
cargo run --frozen -p helix-doc --example hdoc_v1_golden -- --check
```

`P03-017` adds an independent TypeScript reader over these exact bytes. `P03-018` expands
property/mutation breadth, and `P03-019` adds coverage-guided fuzzing; neither may rewrite v1 files.

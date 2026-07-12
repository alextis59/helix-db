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

`P03-017` adds an independent TypeScript reader over every positive file. The active integration
suite requires it to validate CRC-32C, expand the bounded LZ4 stream, reconstruct the complete
lossless logical tree, and recompute the recursive BLAKE3-256 identity independently; those values
must equal the production Rust reader's output. `P03-018` now replays every prefix, trailing-byte
case, sampled stored-byte corruption, and the minimal envelope's 2,656 checksum-repaired one-bit
mutations, alongside 512-seed generated round-trip/canonicalization properties. `P03-019` feeds all
24 immutable files into pinned decoder and migration libFuzzer targets and replays them through all
three real browser engines; fuzzing may retain new regression inputs but never rewrite v1 files.

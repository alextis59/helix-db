# Integration Tests

Cross-crate, cross-language, and multi-process behavior that cannot be proved by an in-crate unit
test. The stable `npm run test:integration` command is active under `P03-017`: it runs the
production Rust HDoc reader and an independent TypeScript reader across all four immutable positive
HDoc 1.0 golden vectors, then requires identical complete lossless logical values and independently
recomputed recursive BLAKE3-256 hashes. Rust integration-target inventory remains explicitly zero.

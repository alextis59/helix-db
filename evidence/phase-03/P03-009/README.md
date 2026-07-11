# P03-009 Evidence — Validating HDoc Decoder

- Task: `P03-009`
- Verdict: **PASS**
- Decoder source commit: `304b026941763b3b52efeede0b1cc1859df52dd1`
- Source base: `c5ed32fc6558658b6e7350992cb566d14d9e91f8`
- Final source tree: `741bdf0579afc5245571d1f0f6c6e5f29ff804bb`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-001`, `DATA-002`, `INV-001`, `INV-007`, `SEC-002`
- Governing gate: `G03`
- Recorded: 2026-07-11 UTC

## Outcome

P03-009 implements the portable whole-envelope HDoc 1.0 validation boundary. The decoder accepts
an exact byte slice, validates every required stored and canonical-logical invariant, and returns
only a borrowed `DecodedHDoc` wrapper with the original bytes, typed content hash, canonical
length, recursive field count, and compressed-section count.

The public decoder surface adds:

- `decode(&[u8]) -> Result<DecodedHDoc, DecodeError>`;
- 19 stable, redacted `DecodeCheck` stages;
- capability errors for unsupported format generations/features/codecs;
- corruption errors with bounded stage/offset metadata and no field names or values; and
- metadata access only after complete validation succeeds.

Owned decoded values, borrowed table/value views, lookup, and rendering remain explicitly outside
this task under `P03-010`–`P03-012`. The decoder does not publish a partial document, repair bytes,
silently migrate, or claim immutable release-format support before `P03-016`.

## Trust order and canonicality

The implementation preserves the accepted format trust dependencies:

1. recognize magic/version and prove supplied/declared length, footer, alignment, and 16 MiB bounds;
2. verify CRC-32C before interpreting required features or complex structure;
3. reject unknown required features, section versions, codec/profile pairs, and flag mismatches;
4. prove exact stored section order, gapless ranges, nonoverlap, zero padding, and footer copies;
5. derive canonical-logical section coordinates from independently checked logical lengths;
6. validate each compression header and complete block table before allocating fresh zeroed output;
7. decode exact bounded raw/LZ4 blocks and require exact returned lengths;
8. validate names, fields, containers, arrays, ownership, parents, depth, recursive counts, value
   occurrence/alignment/coverage, every payload grammar, portable limits, and root `_id`;
9. recompress and rebuild the selected stored profile byte-for-byte using the stored footer hash; and
10. recompute the profile-1 typed tree bottom-up and compare it with that footer hash.

This order distinguishes stored-byte corruption, unsupported capabilities, compression failures,
structural/payload corruption, noncanonical physical bytes, and typed-content disagreement without
allowing checksum success to excuse a later failure.

## Positive and malformed replay

Fifteen `helix-doc` tests, within a 23-test workspace inventory, cover:

| Path | Replayed inventory |
| --- | ---: |
| Public HDoc tags through encoder then decoder | 16 |
| Canonical noncontainer payload vectors | 41 |
| Registry payload rejection classes | 17 |
| Typed-node hash vectors | 23 |
| Structural record examples | 4 |
| LZ4 block vectors | 7 |
| Complete section streams | 5 |
| Compressed/uncompressed complete reference HDocs | 4 |
| Compression rejection classes | 18 |
| Stable decoder check stages | 19 |

The decoder accepts both mandatory uncompressed and optional canonical compressed profiles, all 16
assigned tags, nested object/array trees, depth 100, and an exact 16,777,216-byte canonical HDoc.
The full registry envelopes are passed through both the writer and reader and preserve exact typed
identity across physical presentation/compression variants.

The malformed corpus rejects every truncation of a 408-byte base HDoc and a checksum-refreshed bit
flip at each of its 404 non-checksum byte positions. Targeted cases cover unknown versions/features/
codecs, wrong lengths/offsets/overlap/padding/footer copies, malformed names/tables/tree ownership,
invalid `_id` and payloads, alternate valid LZ4 bytes, invalid/short decompression, compressed/raw
selection errors, typed-hash disagreement, and defensive internal invariant failures.

## Coverage, portability, and sanitizer proof

[rust-coverage-report.json](rust-coverage-report.json) is bound to the decoder source tree and the
`hdoc-codec` / `database-functionality = true` state:

| Metric | Covered | Total | Result |
| --- | ---: | ---: | ---: |
| Functions | 142 | 142 | 100% |
| Lines | 2,023 | 2,023 | 100% |
| Regions | 4,152 | 4,355 | 95.33% |

The semantic-critical aggregate and per-file policy therefore pass unchanged 100% function/line
and 95% region thresholds. The report used compiler-matched LLVM 22.1.2 from Rust 1.96.1 and records
23 executed tests across eight product test binaries.

Strict Clippy and profile builds pass for native x86-64, `wasm32-unknown-unknown`, and
`wasm32-wasip2`. The stable Linux x86-64 ASan profile executes all 23 workspace tests with no
address-safety or leak finding. `helix-doc` remains an unsafe-free portable leaf with no ambient
file, network, time, randomness, dictionary, callback, or host capability.

## Source-bound verifier

[manifest.json](manifest.json) binds the exact 29-file source diff, every final Git-object byte
count/SHA-256, the single source commit/tree/parent, retained coverage bytes, and this verifier.
[verify.mjs](verify.mjs) independently checks:

- the immutable source commit, parent, tree, diff inventory, and all source hashes;
- public decoder API/error/check markers and absence of unsafe/unchecked UTF-8 paths;
- CRC/feature/directory, compression-table/allocation/decode, and canonicality/hash trust order;
- exact registry counts, compatibility/specification provenance, suite/CI/maturity contracts;
- coverage source/policy/runner/lock bindings and exact semantic-critical metrics; and
- 14 isolated source, maturity, test-inventory, CI-history, and coverage-report mutations.

The verifier is network-free and passes under exact Node.js 22.23.1 and 24.18.0.

## Commands

```bash
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features
cargo doc --frozen --workspace --no-deps --all-features
cargo clippy --frozen --target wasm32-unknown-unknown --package helix-doc --all-features -- -D warnings
cargo clippy --frozen --target wasm32-wasip2 --package helix-doc --all-features -- -D warnings
node tests/toolchain/run-build-profile.mjs wasm
node tests/toolchain/run-build-profile.mjs browser
node tests/toolchain/run-build-profile.mjs sanitizer
corepack npm run coverage:check
corepack npm run fixtures:check
node compatibility/v1/check-matrix.mjs
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run dependencies:check
corepack npm run bootstrap:check
corepack npm run bootstrap:test
corepack npm run ci:check
corepack npm run test:commands
corepack npm test
/home/alextis/.nvm/versions/node/v22.23.1/bin/node evidence/phase-03/P03-009/verify.mjs 304b026941763b3b52efeede0b1cc1859df52dd1
/home/alextis/.nvm/versions/node/v24.18.0/bin/node evidence/phase-03/P03-009/verify.mjs 304b026941763b3b52efeede0b1cc1859df52dd1
```

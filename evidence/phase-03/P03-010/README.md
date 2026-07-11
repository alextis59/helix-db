# P03-010 Evidence — Owned HDoc Values and Borrowed Views

- Task: `P03-010`
- Verdict: **PASS**
- Value/view source commit: `0b2138d0c7f29738d6ba9f5750761ac54680bb27`
- Source base: `ad56a635db614bb92dbe2e8d2b79d0ac62c61947`
- Final source tree: `c844b774f7408d91a94658ddd6793efb554a3aa9`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-001`, `DATA-002`, `INV-001`, `INV-007`, `SEC-002`
- Governing gate: `G03`
- Recorded: 2026-07-11 UTC

## Outcome

P03-010 implements the logical value layer above the complete P03-009 validation boundary. A
successful `decode()` now retains validated logical-section backing and parsed record metadata.
`DecodedHDoc::view()` exposes read-only values whose lifetime cannot exceed that validated wrapper,
while `DecodedHDoc::to_owned_document()` recursively detaches an exact logical tree that survives
the encoded and decoded buffers.

The public surface adds:

- `ValueType` with the 16 stable HDoc tags and normative logical names;
- `DocumentView`, `ObjectView`, `FieldView`, `ArrayView`, and `ValueView`;
- exact-size double-ended object, array, f32-vector, and f16-vector iterators;
- `BinaryView`, `VectorF32View`, and `VectorF16View` over exact logical bytes/bits; and
- `OwnedDocument`, `OwnedField`, `OwnedObject`, and `OwnedValue` for detached recursive values.

There is deliberately no Missing variant. An absent object field has no record or view; a present
null is an explicit `ValueView::Null` / `OwnedValue::Null`. P03-011 still owns exact-name and
nested-path lookup, and P03-012 owns rendering/import. P03-010 adds only presentation-position and
dense-array-index access, so it does not pre-empt or fake those later contracts.

## Validation and storage boundary

The decoder still completes length/version/feature/CRC, directory, bounded decompression,
structure, payload, canonical rebuild, and typed-content hash checks before constructing
`DecodedHDoc`. Retained logical backing then follows one rule per base section:

- uncompressed sections are `Cow::Borrowed` slices of the exact validated input;
- compressed sections are `Cow::Owned` fresh exact-size buffers already produced and bounded by
  P03-009; and
- opening or traversing a view performs no decompression and allocates no payload storage.

Views borrow the wrapper rather than the caller's raw slice directly. A compressed logical string
therefore points into the decoder-owned section, repeated access returns the same address, and no
view can outlive that allocation. `DecodedHDoc` debug output contains bounded metadata only and does
not print names, payloads, or decompressed content.

## Semantic preservation

Validation builds one presentation-index permutation over each canonical-name-sorted object span.
`ObjectView::field_at()` and `ObjectFields` use that retained permutation, preserving full-read
presentation order without changing mapping/hash identity. Arrays use their validated dense direct
span. Recursive view-to-owned detachment preserves:

- exact `int32` versus `int64` type identity;
- every binary64 bit, including signed zero and NaN payload/signaling bits;
- canonical decimal128 finite tuples, signed zero, infinities, and NaN;
- exact UTF-8, binary subtype/data, timestamps, dates, UUIDs, and ObjectIds;
- vector family, dimension, order, and exact finite f32/f16 element bits;
- dense array positions and heterogeneous nested values; and
- unique object names plus the separately observable presentation sequence.

No host floating operation, UTF-8 unchecked conversion, normalization, implicit subtype inference,
Missing materialization, sparse-array hole, or presentation-to-canonical reorder enters either path.

## All-type and ownership replay

Seventeen `helix-doc` tests, within a 25-test workspace inventory, exercise the complete codec and
value layer. The two P03-010 tests add these focused checks:

| Path | Proof |
| --- | --- |
| Stable logical types | All 16 names/tags/container identities agree with the registry |
| Borrowed scalar views | Exact null, Boolean, integer, float, decimal, string, binary, temporal, and identifier values |
| Borrowed containers | Empty/nested objects and dense arrays retain count, order, and boundaries |
| Borrowed vectors | O(1) exact-bit access plus exact-size forward/reverse iteration for f32 and f16 |
| Presentation order | Input `b, _id, a` is returned in that order although physical fields are canonical-name sorted |
| Uncompressed backing | Every logical section borrows the validated HDoc input; string bytes point into it |
| Compressed backing | Exactly the compressed section is owned; repeated string views share its stable address |
| Owned detachment | All recursive names/payloads/vectors survive after both HDoc wrappers are dropped |
| Defensive access | Bounds, wrong container kinds, invalid internal tags, and vector length mismatches return no view |

The earlier complete-envelope, every-truncation, per-byte mutation, limit, canonicality, compression,
and typed-hash tests continue to prove that malformed bytes cannot reach these APIs.

## Coverage, portability, sanitizer, and dependency proof

[rust-coverage-report.json](rust-coverage-report.json) is source-bound to the `hdoc-values` /
`database-functionality = true` source tree:

| Metric | Covered | Total | Result |
| --- | ---: | ---: | ---: |
| Functions | 206 | 206 | 100% |
| Lines | 2,455 | 2,455 | 100% |
| Regions | 4,863 | 5,106 | 95.24% |

The unchanged semantic-critical policy passes its 100% function/line and 95% region thresholds for
every active file. The report uses compiler-matched LLVM 22.1.2 from Rust 1.96.1 and records 25
executed tests across eight product test binaries.

Strict native, `wasm32-unknown-unknown`, and `wasm32-wasip2` Clippy/build lanes pass. The Linux x64
ASan profile executes all 25 tests with no address-safety or leak finding. The browser and component
Wasm builds pass without adding unsafe code or host capabilities. Dependency policy remains the
same exact graph; the live observation reported zero npm vulnerabilities and zero Rust advisories or
warnings, with all configured registry-signature and SLSA checks passing.

## Source-bound verifier

[manifest.json](manifest.json) binds the exact 30-file source diff, source commit/tree/parent, every
final Git-object byte count and SHA-256, the retained coverage report, and this verifier.
[verify.mjs](verify.mjs) independently checks:

- the immutable source chain, complete diff inventory, and source hashes;
- validation-before-exposure and borrowed-versus-owned section behavior;
- the public type/view/iterator/owned surface and Missing exclusion;
- presentation, direct array/vector, exact payload, debug-redaction, and all-type test markers;
- registry counts, specification-derived compatibility binding, maturity, suites, and CI history;
- exact report source/policy/runner/lock hashes and coverage metrics; and
- isolated source, metadata, suite, CI, documentation, and coverage mutation canaries.

The verifier is network-free and passes under exact Node.js 22.23.1 and 24.18.0.

## Commands

```bash
cargo fmt --all -- --check
cargo check --frozen --workspace --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features
cargo doc --frozen --workspace --all-features --no-deps
cargo clippy --frozen --target wasm32-unknown-unknown --package helix-doc --all-features -- -D warnings
cargo clippy --frozen --target wasm32-wasip2 --package helix-doc --all-features -- -D warnings
node tests/toolchain/run-build-profile.mjs wasm
node tests/toolchain/run-build-profile.mjs browser
node tests/toolchain/run-build-profile.mjs sanitizer
corepack npm run coverage:check
node compatibility/v1/generate-matrix.mjs --write
node compatibility/v1/check-matrix.mjs
corepack npm run fixtures:generate
corepack npm run fixtures:check
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run dependencies:check
corepack npm run dependencies:report
corepack npm run bootstrap:check
corepack npm run bootstrap:test
corepack npm run ci:check
corepack npm run test:commands
corepack npm test
/home/alextis/.nvm/versions/node/v22.23.1/bin/node evidence/phase-03/P03-010/verify.mjs 0b2138d0c7f29738d6ba9f5750761ac54680bb27
/home/alextis/.nvm/versions/node/v24.18.0/bin/node evidence/phase-03/P03-010/verify.mjs 0b2138d0c7f29738d6ba9f5750761ac54680bb27
```

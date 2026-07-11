# P03-012 Evidence — Lossless HDoc Tagged JSON Conversion

- Task: `P03-012`
- Verdict: **PASS**
- Source commit: `c8039038a71925f4ae77d5c6116f26c9ecb4fdbf`
- Source base: `181fca7f1a72d57b44f10c48553967d7fcbc4096`
- Final source tree: `26f03ae92f44a46d570816f2958fa229ca3568ed`
- Accepted ADRs: `0011`, `0012`
- Requirements: `CORE-001`, `DATA-001`, `DATA-002`, `INV-001`, `INV-007`, `SEC-002`
- Governing gate: `G03`
- Recorded: 2026-07-11 UTC

## Outcome

P03-012 implements `helix.hdoc-tagged-json/1`, a lossless language-neutral conversion profile for
validated HDoc values. Borrowed document/object/value views and detached owned values render to the
same canonical compact JSON. Strict import parses only the registered tagged grammar and returns a
detached `OwnedDocument` after complete document and exact canonical-layout validation.

The profile reuses the semantic-fixture tagged representation without making it a public wire or
command contract. Missing is absent rather than stored. Every HDoc logical type preserves exact
integer width, float/vector bits, decimal class/tuple, binary subtype/data, identifiers, temporal
counts, dense array position, and object presentation order.

## Canonical rendering proof

The renderer emits JCS-key-ordered metadata with deterministic compact JSON escaping. Tests compare
borrowed and owned output for all 16 stored type tags, both vector families, control and
supplementary Unicode, all decimal classes, signed zero, exact identifier bytes, nested containers,
and multi-element arrays. Logical object field arrays remain in presentation order rather than hash
or lookup order.

## Strict bounded import proof

The streaming parser rejects leading BOMs, trailing input, malformed/truncated JSON, invalid or lone
surrogates, duplicate/unknown properties, wrong wrapper shapes, noncanonical integer/hex/identifier
payloads, invalid decimals/nonfinite vectors, Missing, and non-object roots. It enforces the 64 MiB
expanded-input cap, depth 100, 10,000 fields per object, 100,000 fields per document, 1,000,000 array
elements, and 4,096 vector elements during construction.

After parsing, validation enforces field grammar and sibling uniqueness, required/typed `_id`,
protected `_v`/`_ts`, temporal/decimal/vector domains, and every HDoc portable limit. A separate
exact layout pass accounts for field/name tables, unique name bytes, aligned scalar payloads,
container descriptors, array references, and the footer before enforcing the 16 MiB canonical HDoc
limit. No partial tree, HDoc bytes, database write, or persistence action escapes on failure.

## Stable errors and security

Parser failures use `PAR_TRUNCATED_INPUT`, `PAR_INVALID_JSON`, `PAR_INVALID_UTF8`,
`VAL_DUPLICATE_FIELD`, `PAR_INVALID_TYPED_VALUE`, or `QUOTA_LIMIT_EXCEEDED`. Logical document
failures reuse the encoder's redacted stable errors. Diagnostics contain at most stable codes,
limits, and bounded byte offsets; they do not retain or print field names or source values. The
implementation adds no unsafe block, dependency, host capability, ambient I/O, or network use.

## Coverage and portability

[rust-coverage-report.json](rust-coverage-report.json) is bound to the source commit and records 32
workspace tests. The new `tagged_json.rs` product source proves:

| Metric | Covered | Total | Result |
| --- | ---: | ---: | ---: |
| Functions | 117 | 117 | 100% |
| Lines | 1,178 | 1,178 | 100% |
| Regions | 2,380 | 2,493 | 95.46% |

The complete semantic-critical group proves 358/358 functions, 3,894/3,894 lines, and 7,673/8,040
regions (95.43%). Strict workspace Clippy/test/doc, `wasm32-unknown-unknown`, `wasm32-wasip2`, full
suite, compatibility, fixture, bootstrap, CI, dependency, browser-build, and coverage checks pass.

## Source-bound verifier

[verify.mjs](verify.mjs) binds the exact source commit, parent, tree, 34-file binary diff hash,
retained coverage report, verifier bytes, maturity/CI/test authorities, format/specification/study
contracts, implementation trust-boundary markers, source/report hashes, and isolated mutation
canaries. It is network-free and is replayed with exact Node.js 22.23.1 and 24.18.0.

## Commands

```bash
cargo fmt --all -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features
RUSTDOCFLAGS=-D warnings cargo doc --frozen --workspace --no-deps --all-features
cargo check --frozen --workspace --all-targets --all-features --target wasm32-unknown-unknown
cargo check --frozen --workspace --all-targets --all-features --target wasm32-wasip2
corepack npm run coverage:check
node compatibility/v1/generate-matrix.mjs --check
corepack npm run fixtures:check
corepack npm run bootstrap:check
corepack npm run bootstrap:test
corepack npm run ci:check
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run dependencies:check
corepack npm run examples:check
corepack npm test
/home/alextis/.nvm/versions/node/v22.23.1/bin/node evidence/phase-03/P03-012/verify.mjs c8039038a71925f4ae77d5c6116f26c9ecb4fdbf
/home/alextis/.nvm/versions/node/v24.18.0/bin/node evidence/phase-03/P03-012/verify.mjs c8039038a71925f4ae77d5c6116f26c9ecb4fdbf
```

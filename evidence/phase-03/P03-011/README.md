# P03-011 Evidence — Exact-name and Nested-path HDoc Lookup

- Task: `P03-011`
- Verdict: **PASS**
- Lookup source commit: `4a9829d30ea41faf45ae80b0b498fb8b73e8d41b`
- Source base: `230b15ebaa9c4342f9e48f8f428d7ccb0116e12b`
- Final source tree: `dfbfcb1f9c3eb123794e523e69a2a11d13a3e126`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-001`, `DATA-002`, `INV-001`, `INV-007`, `SEC-002`
- Governing gate: `G03`
- Recorded: 2026-07-11 UTC

## Outcome

P03-011 implements allocation-free exact-name and dotted-path lookup over the completely validated
borrowed HDoc views introduced by P03-010. It adds no alternate document representation and does
not weaken the P03-009 whole-envelope validation boundary.

The public surface adds:

- `DocumentView::get_field()` / `ObjectView::get_field()` for exact field access;
- `DocumentView::get()` / `ObjectView::get()` for exact borrowed values;
- reusable fixed-storage `FieldPath` parsing for the frozen v1 dotted grammar;
- `lookup_path()` and `lookup_path_text()` on document and object views;
- exact-size, fused `PathCandidates` iteration; and
- `PathCandidate` values with ordered explicit/fan-out array provenance.

An absent exact field is `None`; a path with no candidates is Missing. A present null remains one
candidate whose value is `ValueView::Null`. No Missing value is materialized or collapsed into
null.

## Raw-table lookup and complexity

Exact-name lookup uses the physical invariants frozen by P03-005 and enforced by P03-009:

1. binary-search the globally UTF-8-byte-sorted name pool to obtain the document-local field ID;
2. binary-search the current object's strictly field-ID-sorted contiguous span; and
3. construct the existing borrowed `FieldView` / `ValueView` only after both searches succeed.

The operation is `O(log N + log F)`, where `N` is the document name count and `F` is the immediate
object field count. It does not scan presentation order, normalize names, copy payloads, allocate a
map, or decompress a section. Full reads remain separately governed by the P03-010 presentation
permutation.

## Bounded path parser and traversal

`FieldPath::parse()` stores at most 100 UTF-8 segment-end offsets in a fixed array while borrowing
the caller's path text. It enforces the 4,096-byte path limit, 100-segment limit, nonempty dotted
syntax, and each segment's byte/scalar/control/dollar field-name rules. There is no escape syntax,
case fold, or Unicode normalization.

Traversal is a fixed-depth DFS over immutable validated views:

- object input consumes one exact-name segment;
- a canonical numeric segment on array input selects one dense index;
- actual array out-of-range produces no candidate;
- a nonnumeric array segment fans out across immediate object elements in source order;
- scalar/null elements contribute nothing to fan-out;
- nested arrays are not recursively flattened without an explicit consumed index; and
- every explicit or fan-out array crossing appends its zero-based index to candidate provenance.

Canonical numeric text outside the portable one-million-element index domain remains usable as an
exact object field name. It becomes redacted `VAL_INVALID_PATH` only when applied to an array. Path
syntax/index failures never print path text; byte/segment/field/candidate limit failures use
`QUOTA_LIMIT_EXCEEDED` with stable `limits-v1` identities.

## Fail-before-publication behavior

`PathCandidates` first audits the complete immutable traversal, including contextual numeric-index
validity and the `path.candidates = 1,000,000` cap. Only a successful audit publishes the
exact-size iterator. A later invalid array branch therefore rejects the complete lookup even when
an earlier branch could have yielded a value; callers never observe a truncated or partially
successful candidate sequence.

The audit and replay use the same fixed walker. Lookup allocates no heap storage after decode and
cannot outlive either `DecodedHDoc` or the borrowed path text. Compressed documents reuse the
decoder-owned logical section, while uncompressed documents continue borrowing the accepted HDoc
bytes.

## Semantic and defensive replay

Eighteen `helix-doc` tests, within a 26-test workspace inventory, exercise the complete codec and
lookup layer. The focused P03-011 test covers:

| Path | Proof |
| --- | --- |
| Exact root/object fields | Raw binary search finds low/high/nested names and rejects globally absent or sibling-only names |
| Missing versus null | Missing produces zero candidates; explicit null produces one `ValueView::Null` candidate |
| Direct indices | Canonical numeric segments select dense elements and retain index provenance |
| Array fan-out | Immediate objects yield ordered values/provenance; scalars and absent fields do not |
| Nested arrays | No implicit recursive flatten; explicit outer selection permits the next normal traversal step |
| Numeric object fields | `0`, noncanonical `00`, and oversized canonical text remain exact object names |
| Contextual invalid index | Applying the portable maximum or host-overflow numeric text to an array returns `VAL_INVALID_PATH` |
| Complete preflight | A first valid branch plus a later invalid array branch returns an error before iterator publication |
| Compressed backing | Nested lookup returns the exact large string from retained decompressed section storage |
| Parser limits | Empty/dotted/control/dollar, byte, scalar, segment, index, and candidate boundaries are typed and redacted |
| Iterator contract | Exact length/size hint, fused exhaustion, clone replay, value access, and array provenance |

Earlier complete-envelope, truncation, per-byte mutation, canonicality, compression, value, and
typed-hash tests continue to prove malformed bytes cannot reach lookup.

## Coverage, portability, sanitizer, browser, and dependency proof

[rust-coverage-report.json](rust-coverage-report.json) is source-bound to the
`hdoc-path-lookup` / `database-functionality = true` source tree:

| Metric | Covered | Total | Result |
| --- | ---: | ---: | ---: |
| Functions | 241 | 241 | 100% |
| Lines | 2,716 | 2,716 | 100% |
| Regions | 5,293 | 5,547 | 95.42% |

The semantic-critical policy passes its 100% function/line and 95% region thresholds. The report
uses compiler-matched LLVM 22.1.2 from Rust 1.96.1 and records 26 executed tests across eight
product test binaries.

Strict native, `wasm32-unknown-unknown`, and `wasm32-wasip2` Clippy/build lanes pass. Linux x64
ASan executes all 26 tests with no address-safety or leak finding. Component and browser Wasm
validation pass, and real Chromium, Firefox, and WebKit each execute the boundary bundle. No unsafe
code, unchecked UTF-8, dependency, or host capability was added. The live dependency observation
reports zero npm vulnerabilities and zero Rust advisories/warnings, 52 verified registry
signatures, and 27 verified SLSA attestations.

## Source-bound verifier

[manifest.json](manifest.json) binds the exact 30-file source diff, source commit/tree/parent, every
final Git-object byte count and SHA-256, retained coverage report, and verifier.
[verify.mjs](verify.mjs) independently checks:

- immutable source ancestry, complete diff inventory, and source hashes;
- the raw two-stage binary-search implementation and validation-before-view boundary;
- fixed path storage, grammar/limit errors, DFS/fan-out/index/provenance behavior, and preflight;
- Missing/null separation, compressed lookup, defensive tests, and unsafe/unchecked-UTF-8 absence;
- maturity, suite count, CI history, specification binding, and generated artifacts;
- exact coverage source/policy/runner/lock bindings and metrics; and
- isolated source, metadata, suite, CI, documentation, and coverage mutation canaries.

The verifier is network-free and passes under exact Node.js 22.23.1 and 24.18.0.

## Commands

```bash
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
RUSTDOCFLAGS=-D warnings cargo doc --frozen --workspace --all-features --no-deps
cargo clippy --frozen --target wasm32-unknown-unknown --package helix-core -- -D warnings
cargo clippy --frozen --target wasm32-wasip2 --package helix-core -- -D warnings
node tests/toolchain/run-build-profile.mjs wasm
node tests/toolchain/run-build-profile.mjs browser
node tests/toolchain/check-wasm-artifacts.mjs all
node tests/toolchain/run-build-profile.mjs sanitizer
corepack npm run coverage:check
node compatibility/v1/generate-matrix.mjs --check
node compatibility/v1/check-matrix.mjs
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
corepack npm run browser:smoke
/home/alextis/.nvm/versions/node/v22.23.1/bin/node evidence/phase-03/P03-011/verify.mjs 4a9829d30ea41faf45ae80b0b498fb8b73e8d41b
/home/alextis/.nvm/versions/node/v24.18.0/bin/node evidence/phase-03/P03-011/verify.mjs 4a9829d30ea41faf45ae80b0b498fb8b73e8d41b
```

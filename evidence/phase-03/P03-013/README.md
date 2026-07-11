# P03-013 Evidence — Collection Field-Path Dictionary Format

- Task: `P03-013`
- Verdict: **PASS**
- Source commit: `45e05d1c11143d52a2e91cab466af2115d46d66b`
- Hosted bootstrap correction: `11de2da9ec133cde18d2705c4443d2997d7ca520`
- Hosted CI-marker correction: `4aa386c351f5fd99c3683f8aedfc085c09778522`
- Source base: `7272da3790a82bb2fad39b757e59e1f5b428ac25`
- Final source tree: `559f2fe4ea37b53ec5b878cb83786060ab0b0d8f`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-003`, `INV-001`, `INV-007`, `SEC-002`
- Governing gate: `G03`
- Recorded: 2026-07-11 UTC

## Outcome

P03-013 implements `helix.path-dictionary/1.0`, a standalone canonical snapshot format for one
collection-lineage field-path dictionary. Version zero is empty. Nonempty snapshots use dense IDs
from one, bind ID one to `_id`, retain exact unique dotted paths, record each introduction version,
and require consecutive versions without gaps. The writer, whole-snapshot validating reader, and
borrowed view are public from `helix-doc`.

The explicit predecessor/successor validator proves same identity, exactly next version, a strict
entry-count increase, an identical retained prefix, and next-version introduction for every new
entry. IDs therefore cannot be removed, renamed, reinterpreted, or reused by a valid successor.
Mutable registration/publication/version pinning remains P03-014; HDoc reference records remain
P03-015, so base HDoc stays self-contained.

## Canonical format and limits proof

The normative format and machine companion fix a 64-byte header, dense 24-byte entry table,
concatenated UTF-8 path pool, minimum zero padding, and 64-byte footer. All integers are explicit
little-endian and offsets are absolute. CRC-32C covers exact stored bytes with its slot zeroed; a
domain-separated BLAKE3-256 hash covers identity, snapshot version, IDs, introduction versions,
and exact path bytes.

`dictionary.paths = 1,000,000` and `dictionary.snapshot_bytes = 67,108,864` are registered in
`limits-v1`, the independent oracle, below/at/above semantic fixtures, and the generated
compatibility matrix. Length/count arithmetic and limits are checked before allocation/traversal.

## Validation and mutation proof

Four focused Rust tests prove deterministic empty/versioned round trips, all public view accessors,
append-only lineage, invalid identity/version/ID/path/duplicate/limit input, truncation, unsupported
format, checksum, layout, entry, UTF-8, padding, footer/hash mutations, and rejected identity skip,
prefix replacement, backdating, and same-version successors. Failures expose only stable
`errors-v1` codes, validation stage, bounded offset, and safe limit metadata.

The implementation contains no unsafe block, ambient I/O, host capability, network use, or new
dependency. It compiles and passes strict lints on native, `wasm32-unknown-unknown`, and
`wasm32-wasip2` targets.

## Coverage and portability

[rust-coverage-report.json](rust-coverage-report.json) is source-bound and records 36 workspace
tests. The new `path_dictionary.rs` product source proves:

| Metric | Covered | Total | Result |
| --- | ---: | ---: | ---: |
| Functions | 42 | 42 | 100% |
| Lines | 361 | 361 | 100% |
| Regions | 703 | 715 | 98.32% |

The complete semantic-critical group proves 400/400 functions, 4,255/4,255 lines, and 8,376/8,755
regions (95.67%). Strict workspace formatting/check/Clippy/test/doc, full suite, deterministic
fixture/oracle/matrix/differential replay, bootstrap, CI, dependency, browser, coverage, and Wasm
artifact gates pass.

## Source-bound verifier

[verify.mjs](verify.mjs) binds the exact source commit, parent, tree, 47-file binary diff hash,
the two one-file hosted authority corrections, retained coverage report, verifier bytes,
maturity/CI/test authorities, format/specification/study
contracts, semantic limits and generated matrix, implementation trust-boundary markers, source
hashes, and isolated mutation canaries. It is network-free and replayed with exact Node.js 22.23.1
and 24.18.0.

Hosted run `29170249316` correctly rejected the first evidence head because the bootstrap JSON/guide
claim had advanced while the independent validator retained the previous claim string. The
correction changes only that validator authority and passes its complete rejection-canary suite on
both contract Node versions.
Hosted run `29170306940` then passed bootstrap and rejected the CI matrix check because its expected
bootstrap success marker still named the previous maturity. The second correction changes only
that exact marker; the complete CI contract passes on both Node versions.

## Commands

```bash
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
RUSTDOCFLAGS=-D warnings cargo doc --frozen --workspace --no-deps --all-features
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run fixtures:check
corepack npm run test:conformance
corepack npm run coverage:check
corepack npm run wasm:validate
corepack npm run ci:check
corepack npm run bootstrap:check
corepack npm run bootstrap:test
corepack npm test
/home/alextis/.nvm/versions/node/v22.23.1/bin/node evidence/phase-03/P03-013/verify.mjs 45e05d1c11143d52a2e91cab466af2115d46d66b
/home/alextis/.nvm/versions/node/v24.18.0/bin/node evidence/phase-03/P03-013/verify.mjs 45e05d1c11143d52a2e91cab466af2115d46d66b
```

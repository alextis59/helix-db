# P04-004 Evidence — Asynchronous Storage Batch ABI 3.0

- Task: `P04-004`
- Verdict: **PASS**
- Source commit: `cf95fc8f025c4988ca3021ea89c91fae3015b2f4`
- Source base: `4767d1725dc808790e593f2644b17860c1ce9f6c`
- Final source tree: `57d00900709877d04764f57ae859e114663fc543`
- Accepted ADR: `0013`
- Requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `STORE-001`, `STORE-002`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-004 preserves ABI 2.0 and defines exact `helix:core-abi@3.0.0` with six required asynchronous
batch calls: read, write, sync, rename, list, and delete. Each call borrows explicit capability and
cancellation resources and crosses the boundary once for up to 1,024 requests, 16 MiB copied data,
4,096 list entries, a 32-byte request ID, and a 64-byte optional idempotency key.

Success produces one result per input in input order. Reads may be short only at EOF, writes complete
every input byte, directory listings are unique and UTF-8-name sorted, and mutating batches require
idempotency keys. Errors release no success payload and preserve ambiguity in `helix-error.outcome`.

## Claim boundary

This defines WIT operations only. ABI 3.0 is not embedded in the component. Resource lifecycles,
copy implementation, partial-I/O/deadline/backpressure/shutdown rules, and mock/native/browser hosts
remain P04-005 onward. No database behavior is added.

## Validation

Pinned `wasm-tools` resolves 12 interfaces, 80 type entries, nine total functions, six
`async-freestanding` storage functions, 11 imports, and one export. ABI 2.0 and 3.0 sources are
byte/hash bound; 30 policy/resolution mutations reject.

Full local gates pass: strict format/Clippy, 49 Rust tests, warning-free docs, deterministic
fixtures, all aggregate suites, 640 HDoc fuzz executions, 4,565/4,565 product lines, both portable
artifacts, and six real Chromium/Firefox/WebKit executions.

## Commands

```bash
corepack npm run storage:batch:check
corepack npm run storage:batch:test
corepack npm run wasm:validate
cargo fmt --all -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
corepack npm run fixtures:check
corepack npm test
corepack npm run coverage:check
corepack npm run browser:smoke
node evidence/phase-04/P04-004/verify.mjs cf95fc8f025c4988ca3021ea89c91fae3015b2f4
```

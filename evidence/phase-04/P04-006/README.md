# P04-006 Evidence — Explicit-Copy Buffer Transport ABI 5.0

- Task: `P04-006`
- Verdict: **PASS**
- Source commit: `647b70a502ad48ac752977657937aab053dbd075`
- Source base: `823c901c27c08a647f9c09c0850b2e633bdb65ba`
- Final source tree: `afe75d1631d4a51864d084eb940df34f28783cd7`
- Accepted ADR: `0013`
- Requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-006 preserves ABI 4.0 and defines exact `helix:core-abi@5.0.0` with detached immutable reads,
contiguous staging writes, and exact immutable-to-staging copies. Every crossing uses copied
Canonical ABI `list<u8>` values. Reads shorten only at end-of-buffer; writes overwrite initialized
bytes or append at their exact end and cannot expose holes.

The safe Rust conformance model executes allocation, read, write, copy, duplicate, and seal
semantics. It checks offsets, arithmetic, ranges, transfer size, and capacity before mutation, so
every failure is target-atomic and immutable sources never change. Each buffer and call is bounded
to 16 MiB.

## Claim boundary

This implements portable reference semantics and WIT access definitions. ABI 5.0 is not embedded in
the component and no host executes it. Handles/shared staging, cancellation/deadline behavior,
budgets, bindings, mock/native/browser hosts, benchmarks, transport selection, and database behavior
remain later P04 work. No mapping, shared-memory, pointer, alias, or zero-copy claim is made.

## Validation

Pinned `wasm-tools` resolves 13 interfaces, 87 type entries, 19 functions, six async functions,
four resource methods, 12 imports, and one export. ABI 4.0/5.0 plus the Rust implementation are
byte/hash bound; 38 policy, resolution, and source mutations reject.

Full local gates pass: strict format/Clippy, 52 Rust tests, deterministic fixtures, all aggregate
suites, 640 HDoc fuzz executions, 4,652/4,652 semantic/recovery product lines, both portable
artifacts, and six real Chromium/Firefox/WebKit executions.

## Commands

```bash
corepack npm run buffers:copy:check
corepack npm run buffers:copy:test
corepack npm run wasm:validate
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --all-targets --locked
corepack npm run fixtures:check
corepack npm test
corepack npm run coverage:check
corepack npm run browser:smoke
node evidence/phase-04/P04-006/verify.mjs 647b70a502ad48ac752977657937aab053dbd075
```

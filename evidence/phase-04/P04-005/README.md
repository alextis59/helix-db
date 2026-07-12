# P04-005 Evidence — Wasm Resource Lifecycle ABI 4.0

- Task: `P04-005`
- Verdict: **PASS**
- Source commit: `ecf2e8e0bd35982291ea5fbb32917aaab834c962`
- Source base: `1746257f1dde145fa60a01e06a0a0988ac7fbcc1`
- Final source tree: `7c9455ff9a80d67ec61bdecd25e63e13c4a617a2`
- Accepted ADR: `0013`
- Requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-005 preserves ABI 3.0 and defines exact `helix:core-abi@4.0.0` with three host-owned resource
classes, four resource methods, and three lifecycle operations. Owned values transfer unique
ownership, borrows are call-scoped, and Canonical ABI drop is the only exactly-once close path.
Drop remains ABI-infallible and cannot rewrite an already returned result.

Mutable staging starts with initialized length zero, has fixed capacity, and seals by consuming
ownership. Successful seal returns one immutable buffer; failure returns no resource. Immutable
duplication borrows its input and produces equal bytes with a distinct identity. Opaque handles are
noncloneable and expose only stable redacted descriptors. Instance, resource, buffer, and descriptor
bounds are explicit.

## Claim boundary

This defines lifecycle ownership only. ABI 4.0 is not embedded in the component. Buffer access and
explicit-copy transport, mapping/shared memory, budget enforcement, cancellation/shutdown behavior,
and mock/native/browser hosts remain later P04 work. No database behavior is added.

## Validation

Pinned `wasm-tools` resolves 13 interfaces, 85 type entries, 16 total functions, six async
functions, four resource methods, 12 imports, and one export. ABI 3.0 and 4.0 sources are byte/hash
bound; 42 policy/resolution mutations reject.

Full local gates pass: strict format/Clippy, 49 Rust tests, deterministic fixtures, all aggregate
suites, 640 HDoc fuzz executions, 4,565/4,565 product lines, both portable artifacts, and six real
Chromium/Firefox/WebKit executions.

## Commands

```bash
corepack npm run resources:lifecycle:check
corepack npm run resources:lifecycle:test
corepack npm run wasm:validate
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --all-targets --locked
corepack npm run fixtures:check
corepack npm test
corepack npm run coverage:check
corepack npm run browser:smoke
node evidence/phase-04/P04-005/verify.mjs ecf2e8e0bd35982291ea5fbb32917aaab834c962
```

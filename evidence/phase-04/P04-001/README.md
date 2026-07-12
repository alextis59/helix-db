# P04-001 Evidence — Versioned Wasm Component ABI

- Task: `P04-001`
- Verdict: **PASS**
- Source commit: `514a926084a02d29d04f5c13532b07018fcb33d2`
- Source base: `00325c353207ef15c70f63678c9db595276d3961`
- Final source tree: `5516f532c07dd43305b31111ea219b39efe7dcc1`
- Accepted ADR: `0013`
- Requirements: `CORE-001`, `CORE-003`, `INV-003`, `INV-004`, `INV-007`, `PLAT-001`, `PLAT-002`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-001 defines the language-neutral component contract as WIT package
`helix:core-abi@1.0.0`, world `helix-core-v1`. Its three interfaces contain 17 named types/resources
and three functions covering exact ABI negotiation, bounded values, explicit-copy byte transport,
opaque buffer/handle identities, structured errors/retries, cooperative cancellation, and explicit
capability descriptors.

Only ABI 1.0 is accepted. Unknown majors/minors reject before resource use unless a future committed
matrix explicitly authorizes a minor. Successful negotiation cannot structurally encode an
unsupported state; unsupported outcomes exist only on the error path. Package SemVer does not imply
ABI compatibility and there is no previous-version window.

## Claim boundary

The source interface is accepted and machine-validated, but it is not yet bound into the component.
The current WASIp2 artifact still exposes intentionally empty WIT. No resource constructor, file,
network, clock, randomness, scheduling, secret, object-storage, or GPU operation exists. There is no
zero-copy, component-execution, public SDK/protocol, or added database-functionality claim.

P04-002/P04-003 own deterministic binding and concrete host capabilities. P04-005/P04-006 own
resource lifecycles and explicit-copy implementation. P04-008 owns full deadline, partial-I/O,
shutdown, and cancellation outcome behavior.

## Validation

The pinned official `wasm-tools` 1.253.0 parser requires one exact package/world, the three interface
inventory, 17 named types/resources, and three functions. A closed policy checker enforces the
version, value bounds, handle properties, cancellation meaning, capability inventory, negotiation
failure, and claim boundaries. Twenty mutations reject.

Full local gates also pass: strict formatting/Clippy, 49 Rust tests, warning-free documentation,
deterministic fixtures, all aggregate suites, 640 bounded HDoc fuzz executions, 4,565/4,565 active
product lines, both portable artifact forms, and six real Chromium/Firefox/WebKit executions.

## Commands

```bash
corepack npm run wasm:abi:check
corepack npm run wasm:abi:test
corepack npm run wasm:validate
cargo fmt --all -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
env RUSTDOCFLAGS='-D warnings' cargo doc --frozen --workspace --no-deps --all-features
corepack npm run fixtures:check
corepack npm test
corepack npm run coverage:check
corepack npm run browser:smoke
node evidence/phase-04/P04-001/verify.mjs 514a926084a02d29d04f5c13532b07018fcb33d2
```

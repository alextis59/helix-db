# P04-009 Evidence — Deterministic Input Injection

- Task: `P04-009`
- Verdict: **PASS**
- Source commit: `6e8b88c180815a3b06e2b417795b2c45922c9b34`
- Source base: `27c7539cd260cc14dccfc31bebcb9638d3b78a7c`
- Final source tree: `d2dbc93da6d3b517072b70bba50d1abe332bbcc1`
- Accepted ADRs: `0003`, `0006`, `0013`
- Requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `PLAT-001`, `PLAT-002`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-009 preserves immutable ABI 6.0 and defines exact `helix:core-abi@7.0.0`. Clock requests are
separated into wall UTC, monotonic, MVCC, and logical-expiry roles; random requests are separated
for request IDs, transaction IDs, UUIDv7, ObjectId, nonces, and sampling. Both use exact bounded
zero-based sequences so exhaustion, reordering, purpose/role mismatch, or length drift fails
without consuming input.

Every admitted operation pins a numeric memory budget and redacted device profile. The portable
reference model validates a 4 GiB/1,048,576-allocation envelope, performs fail-before-mutation
scratch/result accounting, and releases only exact opaque tokens bound to one deterministic ledger
identity. Device facts are bounded and sorted and cannot carry host-unique or tenant/document data.

## Claim boundary

This defines WIT operations, value shapes, and a portable reference oracle. It is not a component
binding, mock/native/browser host, GPU executor, identifier generator, capability-denial proof, or
database implementation. Those remain P04-010 onward. Device profiles may affect backend
eligibility but never semantic results.

## Validation

The immutable base and ABI 7.0 WIT are byte/hash bound. Sixty-four rejection mutations cover ABI
drift, clock role/value interchange, sequence/consumption weakening, weak randomness, ID
regeneration, non-atomic memory accounting, foreign allocation identity, device disclosure/semantic
drift, ambient APIs, and host/database overclaims.

Full local gates pass: strict format/Clippy, 59 Rust tests, deterministic fixtures, all aggregate
suites, 640 HDoc fuzz executions, 4,891/4,891 semantic/recovery product lines, both portable
artifacts, and six real Chromium/Firefox/WebKit executions.

```bash
corepack npm run inputs:deterministic:check
corepack npm run inputs:deterministic:test
corepack npm run wasm:validate
corepack npm test
corepack npm run coverage:check
corepack npm run browser:smoke
node evidence/phase-04/P04-009/verify.mjs 6e8b88c180815a3b06e2b417795b2c45922c9b34
```

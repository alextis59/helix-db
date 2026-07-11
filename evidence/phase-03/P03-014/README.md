# P03-014 Evidence — Path Registration, Resolution, Recovery, and Version Pins

- Task: `P03-014`
- Verdict: **PASS**
- Source commit: `833c40945eb27870437fc8f2c00715a1ea146af8`
- Source base: `f93e0d6449d5fadc28480f5b9e8b7b074c2260fc`
- Final source tree: `730ecb8ad17ea5edd1f1c04d67adb2f8d9c441d9`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-003`, `INV-001`, `INV-007`, `SEC-002`
- Governing gate: `G03`
- Recorded: 2026-07-11 UTC

## Outcome

P03-014 implements the portable mutable lifecycle around the P03-013 dictionary bytes.
`CollectionPathDictionary` prepares a complete registration batch without mutating authoritative
state, then publishes it only if the exact base identity, version, and content hash remain current.
Stale concurrent candidates fail as `CON_WRITE_CONFLICT`; they are never silently rebased onto
different numeric IDs.

Registration validates the complete request first, resolves existing paths and duplicates
idempotently, assigns new IDs in first-request order within one next version, and ensures `_id` is
ID 1 on the first nonempty batch. The prepared result contains request-order registrations and a
fully encoded/validated snapshot for durable staging. Exact no-op batches do not advance versions.

## Resolution, pinning, and recovery proof

An immutable `PathDictionaryPin` owns exact snapshot bytes, identity/version/content hash, a dense
ID vector, and an exact-path ordered map. Path-to-ID, ID-to-path, and introduction-version lookups
allocate nothing. Old pins remain byte- and result-stable after later publications.

External snapshots are fully validated before pinning. Standalone snapshots prove themselves but
not historical non-reuse, so `CollectionPathDictionary::recover` requires a complete
genesis-to-current chain, requires version zero first, and validates every adjacent P03-013
successor before exposing the last authoritative pin. Portable core performs no ambient I/O;
storage phases own physical write/sync/manifest publication around the candidate bytes.

## Atomicity and diagnostics

Four focused tests cover automatic/explicit `_id`, duplicate and existing requests, request-order
assignment, no mutation before publication, no-op publication, stale-writer conflict, invalid-path
rollback, exact old-pin stability, bidirectional resolution, introduction versions, complete-chain
recovery, missing genesis, skipped versions, corrupt bytes, and defensive invalid-candidate state.

Lifecycle failures retain no path text. They map invalid requests to `VAL_INVALID_PATH`, stale
publication to `CON_WRITE_CONFLICT`, empty recovery to `PAR_TRUNCATED_INPUT`, and format/lineage
failures to the existing redacted P03-013 codes.

## Coverage and portability

[rust-coverage-report.json](rust-coverage-report.json) records 40 workspace tests. The new
`path_dictionary_state.rs` product source proves:

| Metric | Covered | Total | Result |
| --- | ---: | ---: | ---: |
| Functions | 35 | 35 | 100% |
| Lines | 204 | 204 | 100% |
| Regions | 342 | 355 | 96.33% |

The complete semantic-critical group proves 435/435 functions, 4,459/4,459 lines, and
8,718/9,110 regions (95.69%). Native strict build/test/doc, both Wasm profiles, full npm suites,
fixture/matrix/differential replay, bootstrap/CI authorities on both Node lines, dependency policy,
and coverage gates pass.

## Source-bound verifier

[verify.mjs](verify.mjs) binds the exact source commit, parent, tree, 29-file binary diff hash,
retained coverage report, public API/maturity/test/CI authorities, lifecycle format/specification/
study contracts, source/report hashes, and isolated mutation canaries. It is network-free and is
replayed with exact Node.js 22.23.1 and 24.18.0.

## Commands

```bash
cargo fmt --all -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
RUSTDOCFLAGS=-D warnings cargo doc --frozen --workspace --no-deps --all-features
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run fixtures:check
corepack npm run coverage:check
corepack npm run wasm:validate
corepack npm test
/home/alextis/.nvm/versions/node/v22.23.1/bin/node evidence/phase-03/P03-014/verify.mjs 833c40945eb27870437fc8f2c00715a1ea146af8
/home/alextis/.nvm/versions/node/v24.18.0/bin/node evidence/phase-03/P03-014/verify.mjs 833c40945eb27870437fc8f2c00715a1ea146af8
```

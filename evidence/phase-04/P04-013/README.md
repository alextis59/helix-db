# P04-013 Evidence — Shared Host ABI Conformance

- Task: `P04-013`
- Verdict: **PASS**
- Source commit: `703b20d2ce9d17c9ad41ebf0b1c1e17f8c817212`
- CI remediation commit: `dd09f3c707212dacb134f8091dd6e83f23e0d22c`
- Source base: `38b379bd860b04ecf156173b7cc883b5516f8018`
- Source tree: `69dc633c8903089c2e8951003d15eab7346615d4`
- Accepted ADR: `0013`
- Requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `PLAT-001`, `QUAL-001`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-013 adds one 357-byte language-neutral ABI 7 transcript shared by the mock Rust host, native
Rust boundary, and TypeScript browser host. It fixes the exact 21 imported call names and all 12
capability kinds, then executes noncontiguous-write rejection, contiguous write/seal, detached
short-read bytes and end state, and exact immutable-to-staging copy.

The Rust conformance command runs the same file through both crates. Chromium, Firefox, and WebKit
each replay it through the browser host. The stable `test:conformance` suite now includes this host
step alongside semantic and compatibility differentials.

## Conformance-found correction

The shared inventory found that the P04-011 native skeleton had omitted WIT's `locks` capability
kind while describing its 11-kind list as complete. This source commit adds `Locks`, a canonical
12-kind inventory, and an exact 21-call inventory. The historical P04-011 source snapshot remains
unchanged and its evidence now carries an explicit correction note.

## Claim boundary

This first common transcript proves explicit-copy behavior and structural ABI inventory. It does
not claim that every platform I/O adapter executes through a linked Component Model instance.
P04-014 owns ungranted-resource isolation, P04-015 owns tracing, and P04-016/P04-017 own transport
measurement and selection.

## Validation

The source commit changes 34 artifacts. Twenty-five policy, 17 vector, and six host-source mutations
reject. The complete aggregate passes with 68 Rust tests, 12 browser executions, 640 fuzz
executions, 5,224/5,263 workspace-product lines, and 100% semantic/recovery-critical line coverage.
Native debug/release, browser, dependency/license, artifact retention, CI matrix, bootstrap, strict
lint/type, and warning-free documentation gates pass.

The first hosted run then applied pedantic Clippy to test targets and rejected six unchecked
`u64 as u32` vector-length casts before the conformance tests ran. The remediation uses explicit
`u32::try_from` fallbacks in both Rust parsers, updates their hash authorities, and passes the exact
workspace/all-target/all-feature Clippy command locally.

```bash
corepack npm run host:conformance:check
corepack npm run host:conformance:test
corepack npm run test:conformance
corepack npm run browser:smoke
corepack npm test
corepack npm run coverage:check
node evidence/phase-04/P04-013/verify.mjs 703b20d2ce9d17c9ad41ebf0b1c1e17f8c817212
```

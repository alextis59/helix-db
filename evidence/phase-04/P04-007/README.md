# P04-007 Evidence — Non-Required Buffer Transport Alternatives

- Task: `P04-007`
- Verdict: **PASS**
- Source commit: `d2efedc841cc7f8f5226f47c308cf150f8899d04`
- Source base: `8ea7dbaad7bc1375b68db02c64425ac2c0473107`
- Final source tree: `7827fdc5df6b4c89ef9511a37c8750fac324f41f`
- Accepted ADR: `0013`
- Requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-007 leaves required `helix:core-abi@5.0.0` byte-identical and implements two internal
prototypes. A 4,096-entry generational handle store rejects unknown/stale identities, prevents slot
reuse from aliasing old handles, transfers unique ownership on removal, and reuses explicit-copy
reads. A 16 MiB safe same-address-space region allows one exclusive mutable lease, zeroes its
initialized prefix, blocks snapshots during mutation, and returns detached snapshots afterward.

## Claim boundary

Neither prototype is a WIT feature, component binding, host implementation, mapping, shared Wasm
memory, `SharedArrayBuffer`, cross-process mechanism, performance result, or selected transport.
Explicit copy remains required. Real host integration, conformance, benchmarks, and selection remain
P04-011 through P04-017. No database behavior is added.

## Validation

The ABI 5.0 source and prototype implementation are byte/hash bound. Thirty-two policy/source
mutations reject, including ABI drift, public handle fields, generation removal, concurrent leases,
snapshot leakage, mapping/performance overclaims, and premature selection.

Full local gates pass: strict format/Clippy, 55 Rust tests, deterministic fixtures, all aggregate
suites, 640 HDoc fuzz executions, 4,738/4,738 semantic/recovery product lines, both portable
artifacts, and six real Chromium/Firefox/WebKit executions.

```bash
corepack npm run buffers:alternatives:check
corepack npm run buffers:alternatives:test
corepack npm run wasm:validate
corepack npm test
corepack npm run coverage:check
corepack npm run browser:smoke
node evidence/phase-04/P04-007/verify.mjs d2efedc841cc7f8f5226f47c308cf150f8899d04
```

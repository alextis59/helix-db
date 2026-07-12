# P04-011 Evidence — Native Wasmtime Host Skeleton

- Task: `P04-011`
- Verdict: **PASS**
- Source commit: `6c2bb1bfc20745959e2d3e393e40c2000f189393`
- CI remediation commit: `308b33c4f87f5ff4637609b21fa679d5523be774`
- Source base: `eb08c464dd11081120b8682e2be36fb9ba32611f`
- Final source tree: `aad1700bb560693d1c3e66799b1f5551895dc143`
- Accepted ADR: `0013`
- Requirements: `CORE-001`, `CORE-003`, `INV-004`, `INV-007`, `PLAT-001`, `QUAL-001`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-011 replaces the native boundary placeholder with exact Wasmtime 46.0.1. The default feature
set is disabled; only async Component Model, Cranelift, runtime, and standard-library support are
selected. A real engine compiles a bounded empty component, rejects a core module, enables fuel and
epoch interruption, and installs no WASI or ambient platform adapter.

The immutable capability policy admits at most 128 exact kind/scope grants across all eleven ABI
capability kinds. Empty, wildcard, control-bearing, oversized, duplicate, and absent grants reject.
Stable public errors retain no host-specific Wasmtime diagnostic text.

## Claim boundary

The skeleton validates components and grants but does not instantiate the Helix world or link any
ABI call. It performs no filesystem, durability, network, clock, entropy, GPU, or database work.
P04-012 owns the browser skeleton and P04-013 owns shared call conformance.

## Validation

The source commit contains 44 changed artifacts. Forty-one native policy/source mutations and 13
dependency/license mutations reject. The exact 121-package registry closure has 204 verified
license files, 14 reviewed missing-text exceptions, and a live zero-advisory result. Full local
gates pass with 66 Rust tests, all eight stable suites, 640 fuzz executions, six browser executions,
5,221/5,263 workspace-product lines, and 100% semantic/recovery-critical line coverage.

The first hosted run exposed that Wasmtime's `target-lexicon` rejects Rust's custom
`x86_64-unknown-linux-gnuasan` target name before Helix compilation. The remediation keeps ASan on
the seven compatible first-party crates, explicitly excludes only the native host/server closure,
and retains full native checks on Linux, macOS ARM64, and Windows x64. The exact package list is
machine-checked and the revised sanitizer command passes locally.

## Later conformance correction

P04-013 found that ABI 7 declares 12 capability kinds while this historical source snapshot
implemented and described only 11; `locks` was omitted. Source commit
`703b20d2ce9d17c9ad41ebf0b1c1e17f8c817212` restores `Locks`, adds exact 12-kind and 21-call
inventories, and makes the shared conformance suite enforce them. The P04-011 snapshot and hashes
remain unchanged so the original proof stays reproducible.

```bash
corepack npm run host:native:check
corepack npm run host:native:test
corepack npm run rust:dependencies:test
corepack npm run dependencies:report
corepack npm test
corepack npm run coverage:check
node evidence/phase-04/P04-011/verify.mjs 6c2bb1bfc20745959e2d3e393e40c2000f189393
```

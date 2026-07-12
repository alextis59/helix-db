# P04-010 Evidence — Deterministic Mock Host

- Task: `P04-010`
- Verdict: **PASS**
- Source commit: `7a075554df29eb2435d89b80d960969d6af35c1a`
- Source base: `a7fd9529d5b48beec234996a22d747ae6ddfbe79`
- Final source tree: `513fafae585541021f9010dbc437274f2ef2a3ed`
- Accepted ADRs: `0003`, `0006`, `0013`
- Requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `PLAT-001`, `PLAT-002`, `QUAL-001`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-010 adds the unpublished `helix-host-mock` crate as a deterministic in-memory oracle for all
21 imported ABI 7 host calls. Four resource methods, six resource operations, six storage batches,
clock/random input, and three control calls share one stable call inventory and total-order log. The
two `core-control` functions remain guest exports and are not misclassified as host calls.

Failure rules select a call kind and one-based occurrence. Invalid/duplicate selectors and excess
rules fail closed; injected failures carry stable codes and mutation outcomes. Draining and stopped
lifecycle failures have deterministic precedence. Storage is bounded, relative, sorted, detached on
read, and candidate-map atomic for write/rename/delete publication.

## Claim boundary

This is an in-process conformance oracle, not a component binding or native/browser host. It has no
filesystem, wall-clock, entropy-device, network, thread, process, GPU, or durability integration.
Mock sync success is observable test behavior only. P04-011/P04-012 own real hosts and P04-013 owns
shared cross-host conformance.

## Validation

The source commit contains 36 changed artifacts. The contract binds immutable ABI 7 and the mock
source by byte count and SHA-256. Five Rust tests cover successful resource/storage/input/lifecycle
behavior and exact injected failure for every call. Sixty policy, WIT-resolution, and Rust-source
mutations reject. Full local gates pass with 64 Rust tests, all eight stable suites, 640 fuzz
executions, six browser executions, 5,175/5,206 workspace-product lines, and 100% of 4,891
semantic-critical plus 326 recovery-critical lines.

```bash
corepack npm run host:mock:check
corepack npm run host:mock:test
corepack npm run wasm:validate
corepack npm test
corepack npm run coverage:check
node evidence/phase-04/P04-010/verify.mjs 7a075554df29eb2435d89b80d960969d6af35c1a
```

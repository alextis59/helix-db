# P04-012 Evidence — Browser Host and TypeScript Binding Skeleton

- Task: `P04-012`
- Verdict: **PASS**
- Source commits: `945631e9c9caa40a05795d9021790583bff467c2`, `cddd16a9899f4ea4df777069dce0ca9441dd9d90`
- Source base: `8bf7949da9f881a27d443df54f7c10232749427d`
- Final source tree: `ae05abe2ba9267d5721cc0619770cc0a97a89b23`
- Accepted ADR: `0013`
- Requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `PLAT-001`, `QUAL-001`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Recorded: 2026-07-12 UTC

## Outcome

P04-012 replaces the reserved browser-host directory with a strict-TypeScript ABI 7 skeleton. It
defines exact value types and all 21 imported call shapes, bounded host-owned explicit-copy buffers,
12-kind exact capability grants, explicit adapter injection, cooperative cancellation before
dispatch, and validated immutable execution/device profiles. The implementation has no external
runtime dependency and is not an installable package.

Six standards entry points are feature-detected without invocation. The browser host validates,
compiles, and instantiates the bounded zero-import core module; unknown raw imports reject, and raw
ABI-named imports also reject until generated Component Model bindings exist.

## Claim boundary

This step does not implement generated canonical ABI linkage, OPFS, IndexedDB, durability, GPU
execution, shared host conformance, or database functionality. P04-013 owns identical
mock/native/browser conformance. Browser persistence, fallback, quota, lifecycle, and multitab
behavior remain P11 work.

## Validation

The final two-commit source range changes 25 artifacts. Thirty-nine policy mutations and 12 source
mutations reject. Strict TypeScript and Biome gates pass. Chromium, Firefox, and WebKit each execute
the positive core-module path and the browser-host negative/adapter path, within nine total browser
suite executions. The complete aggregate passes with 66 Rust tests, 640 fuzz executions,
5,221/5,263 workspace-product lines, and 100% semantic/recovery-critical line coverage. Native
debug/release, browser, dependency/license, artifact retention, CI matrix, bootstrap, and
warning-free documentation gates also pass.

```bash
corepack npm run host:browser:check
corepack npm run host:browser:test
corepack npm run toolchain:types
corepack npm run browser:smoke
corepack npm test
corepack npm run coverage:check
node evidence/phase-04/P04-012/verify.mjs cddd16a9899f4ea4df777069dce0ca9441dd9d90
```

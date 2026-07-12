# Rust Workspace and Initial Crate Boundaries

- Status: Active boundaries; `helix-doc` codec, dictionary lifecycle, and feature negotiation implemented
- Last updated: 2026-07-11
- Owner: Runtime architecture owner
- Plan item: `P02-001`
- Governing requirements: `INV-001`, `INV-003`, `INV-004`, `CORE-001`, `CORE-003`
- Governing gate: `G02`
- Design source: [Study section 24](../../Study.md#24-suggested-initial-repository-architecture)
- Development identity: [ADR 0001](../adr/0001-public-product-identity.md)

This document fixes the Rust workspace boundaries and dependency direction. Every crate remains
unpublished at version `0.0.0`. The workspace carries machine-readable
`deterministic-injection-contract-v1` /
`database-functionality = true` metadata now that `P03-008`–`P03-021` have implemented
deterministic encoding, whole-envelope validation, borrowed/owned logical values, exact-name/path
lookup, canonical lossless tagged JSON rendering with strict detached import, and canonical
collection path-dictionary snapshots with non-reuse lineage validation plus atomic registration,
resolution, recovery, immutable version pins, exact-1.0 closed-world negotiation/no-rewrite
migration assessment, immutable HDoc 1.0 golden-vector production/checking, pinned fuzz/browser
replay, representative source-bound codec/lookup/size measurements, and the accepted
self-contained-format/derived-only-dictionary experiment boundary. `helix-core` now carries the
`deterministic-injection-contract-v1` composition, required explicit copy, non-ABI alternatives,
completion semantics, and executable deterministic input/budget validation and still reports
`database-functionality = false`; the other six
crates remain `boundary-skeleton` components. Public names and package coordinates remain blocked by
`P16-016`.

## Boundary inventory

| Crate | Responsibility boundary | Allowed direct internal dependencies | Current maturity |
| --- | --- | --- | --- |
| `helix-doc` | Logical values, HDoc codec, canonical value semantics | None | Safe deterministic HDoc codec/values/lookup/tagged conversion, collection dictionary format/lifecycle, closed-world negotiation, and immutable HDoc 1.0 vectors |
| `helix-query` | Query syntax, normalization, logical plans, CPU reference behavior | `helix-doc` | Boundary skeleton |
| `helix-storage` | Deterministic WAL/MVCC/manifest/memtable/immutable-file algorithms; no ambient I/O | `helix-doc` | Boundary skeleton |
| `helix-columnar` | Rebuildable field dictionaries, typed sidecars, and CPU column operators | `helix-doc`, `helix-query` | Boundary skeleton |
| `helix-core` | Portable deterministic orchestration and versioned capability ABI | `helix-columnar`, `helix-doc`, `helix-query`, `helix-storage` | Deterministic gate, nine capabilities, and six async operations defined; bindings absent |
| `helix-gpu` | Optional GPU profiles, buffers, plans, dispatch, candidates, and CPU verification integration | `helix-columnar`, `helix-doc`, `helix-query` | Boundary skeleton |
| `helix-host-native` | Native files, clocks, randomness, scheduling, networking, devices, and runtime integration | `helix-core`; optional `helix-gpu` feature | Boundary skeleton |
| `helix-server` | Native process lifecycle and future public/server protocol surface | `helix-host-native`; forwards optional GPU feature | Boundary skeleton |

The responsibility column describes ownership from the Study and Specifications. Only the maturity
column states current implementation; it does not imply that the remaining listed subsystems exist.

## Dependency direction

```text
helix-doc
  ├──> helix-query ──────┬──> helix-columnar ──┐
  └──> helix-storage ────┴─────────────────────┼──> helix-core ──> helix-host-native ──> helix-server
                         helix-query ──────────┘                     └─ optional ─> helix-gpu
helix-doc + helix-query + helix-columnar ──────────────────────────────────────> helix-gpu
```

Arrows point from dependency to consumer. The graph is acyclic and has these enforced architectural properties:

- `helix-doc` is the leaf semantic/value boundary.
- Query and storage do not depend on one another; portable orchestration composes them.
- Columnar code depends on semantic/query contracts but not on authoritative storage internals.
- The portable core has no dependency on native hosts, the server, or GPU code.
- GPU code has no dependency on authoritative storage or the portable core and can never become required for correctness.
- Ambient platform access enters through host crates only.
- The server is an outer leaf; deterministic crates never depend on it.

## Feature boundary

GPU integration is disabled by default. `helix-host-native/gpu` explicitly enables the optional `helix-gpu` edge, and `helix-server/gpu` forwards that feature. Default workspace builds therefore prove that the portable/native skeleton does not require GPU availability; all-feature builds prove that the optional edge remains valid.

No other optional feature is defined yet. Later tasks must add a feature only with a named capability, tests for enabled/disabled behavior, and a documented compatibility/security boundary.

## Forbidden edges

The initial graph rejects these dependency directions unless an accepted architecture change updates this document, the Study/specification impact, and boundary tests:

- deterministic/value/query/storage/columnar crates to `helix-host-native` or `helix-server`;
- `helix-core` to `helix-gpu`;
- `helix-gpu` to `helix-storage`, `helix-core`, `helix-host-native`, or `helix-server`;
- `helix-query` to physical storage or execution backends;
- any cycle among workspace crates.

The original `P02-001` boundary had no external dependencies. `P03-008` later adds only three exact
portable dependencies to the leaf `helix-doc` crate—BLAKE3, CRC, and bounded raw LZ4—and their ten
locked registry transitives. They do not add a workspace edge or grant an ambient host capability.
Their complete checksum/license/feature/build-script allowlist and fail-closed RustSec reporting live
under the dependency policy. The exact compiler, MSRV, components, formatter, linter, and Wasm
targets remain selected by the [Rust toolchain policy](rust-toolchain-policy.md); future dependencies
must preserve this graph unless an accepted architecture change says otherwise.

## Verification contract

`P02-001` evidence must run and retain:

```bash
cargo metadata --format-version 1 --no-deps
cargo check --workspace --all-targets --all-features
cargo test --workspace --all-features
cargo doc --workspace --no-deps --all-features
```

The evidence verifier independently reads Cargo metadata, requires exactly these eight unpublished
`0.0.0` packages, compares every direct internal dependency/feature edge with the table above,
rejects cycles and forbidden edges, and confirms each crate's current maturity markers. Historical
`P02-001` evidence remains source-bound to the all-skeleton state; current checks admit only the
documented `helix-doc` codec transition.

## Change rule

Crates may be split, combined, or given a new direct edge when implementation evidence demonstrates a clearer ownership boundary. A material change records why the old direction failed, checks for core/host or authoritative/derived inversion, updates CODEOWNERS and architecture documentation, and adds a boundary regression test in the same change.

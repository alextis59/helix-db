# Buffer Transport Alternatives Prototype

- Status: Executable non-required prototypes; no transport selection or performance claim
- Last updated: 2026-07-12
- Owner: Runtime architecture owner
- Plan item: `P04-007`
- Governing requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Machine authority: [`helix.buffer-transport-alternatives/1`](buffer-transport-alternatives-v1.json)
- Executable authority: [`transport_alternatives.rs`](../../crates/helix-core/src/transport_alternatives.rs)

## ABI boundary

The required ABI remains byte-identical `helix:core-abi@5.0.0`. Neither prototype is imported,
exported, negotiated, or represented as a WIT value. Explicit copy remains the only required
transport until P04-017 selects otherwise from conformance and benchmark evidence.

## Host-owned handle prototype

The bounded store holds up to 4,096 immutable buffers behind private store-local slot/generation
identities. Callers cannot construct fields through the public API. Reusing a slot increments its
generation, so removed identities remain stale rather than aliasing new contents. Unknown and stale
handles fail without changing the registry; removal transfers unique buffer ownership. Reads call
the accepted explicit-copy model and therefore return detached bytes under identical bounds.

## Shared-staging prototype

The safe same-address-space model allocates at most 16 MiB and permits one exclusive mutable lease.
Beginning a lease zeroes the declared initialized prefix. Snapshots are forbidden until the lease
ends and always copy the prefix. This tests lease and disclosure rules only: it is not OS mapping,
shared Wasm memory, cross-process memory, or browser `SharedArrayBuffer`, and no pointer crosses WIT.

## Decision boundary

Both prototypes must reproduce explicit-copy immutable bytes, initialized-prefix bytes, bounds,
unique ownership, and no-uninitialized-disclosure behavior. Timing thresholds and transport
selection are deliberately null. Native/browser integration, shared conformance, measurements, and
selection remain P04-011 through P04-017.

```bash
corepack npm run buffers:alternatives:check
corepack npm run buffers:alternatives:test
```

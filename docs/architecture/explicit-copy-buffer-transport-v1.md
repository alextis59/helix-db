# Explicit-Copy Buffer Transport ABI 5.0

- Status: Accepted executable reference; component bindings and hosts not implemented
- Last updated: 2026-07-12
- Owner: Runtime architecture owner
- Plan item: `P04-006`
- Governing requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Machine authority: [`helix.explicit-copy-buffer-transport/1`](explicit-copy-buffer-transport-v1.json)
- WIT authority: [`helix:core-abi@5.0.0`](../../wit/helix-core-abi-v5/world.wit)
- Executable authority: [`explicit_copy.rs`](../../crates/helix-core/src/explicit_copy.rs)

## Version and transport decision

ABI 4.0 remains immutable. Three required buffer-access imports change the world incompatibly, so
the current contract is exact ABI 5.0. The correctness baseline uses Canonical ABI `list<u8>` values:
every crossing copies bytes, and no pointer, alias, mapping, or shared-memory identity crosses it.

## Operations

- `read-immutable` returns a detached byte list, its source offset, and an end-of-buffer flag. It
  may shorten only at the buffer end; an offset past the end fails.
- `write-staging` overwrites the initialized prefix or appends exactly at its end. It cannot create
  an uninitialized hole and returns exact copied bytes plus the new initialized length.
- `copy-immutable-to-staging` requires the complete immutable source range and applies the same
  staging rules to the target.

One buffer and one operation transfer at most 16 MiB. Offsets are 64-bit and call lengths are
32-bit. Validation, including checked range arithmetic, completes before mutation, so every error
leaves the target unchanged and never mutates an immutable source.

## Executable reference

The safe Rust model provides fixed-capacity zeroed staging, contiguous writes, immutable reads,
exact buffer-to-buffer copies, sealing, and detached duplication. Its six failure classes map to
stable `BUF_*` error codes at later bindings. Mock, native, and browser hosts must run the same
conformance cases; the model does not substitute for those hosts.

## Claim boundary

P04-006 implements portable transport semantics and defines WIT access operations. ABI 5.0 is not
yet embedded in the component and no host executes it. Handle/shared-staging alternatives,
cancellation/deadline behavior, budgets, bindings, host conformance, benchmarks, transport
selection, and database behavior remain their owning P04 tasks.

## Executable enforcement

Pinned `wasm-tools` resolves 13 interfaces, 87 type entries, 19 functions, six async functions, four
resource methods, 12 imports, and one export. ABI 4.0/5.0 and the Rust model are byte/hash bound.

```bash
corepack npm run buffers:copy:check
corepack npm run buffers:copy:test
```

# Wasm Resource Lifecycle ABI 4.0

- Status: Accepted lifecycle definitions; buffer transport and hosts not implemented
- Last updated: 2026-07-12
- Owner: Runtime architecture owner
- Plan item: `P04-005`
- Governing requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Machine authority: [`helix.resource-lifecycle-abi/1`](resource-lifecycle-abi-v1.json)
- WIT authority: [`helix:core-abi@4.0.0`](../../wit/helix-core-abi-v4/world.wit)

## Version decision

ABI 3.0 remains immutable. Required resource methods and the imported `host-resources` interface
change the component world incompatibly, so P04-005 advances directly to exact ABI 4.0. Package
SemVer does not imply a 3.0 compatibility window; unsupported peers fail before resource use.

## Ownership and drop

The three host-owned resources are non-forgeable, non-serializable, non-persistent, and scoped to
one component instance. Passing an owned resource transfers its unique ownership; a borrow is valid
only for the call. Canonical ABI resource drop is the only close path and occurs exactly once. Drop
is ABI-infallible: a host may record a cleanup failure, but it cannot retroactively change an
already returned command result.

An instance may hold at most 4,096 live resources. Opaque handle descriptors expose only a stable
kind, a redacted name of at most 64 bytes, and a version. Handles are not cloneable; their native
identities, paths, descriptors, addresses, and credentials never cross the boundary.

## Buffer lifecycle

`allocate-staging` creates a fixed-capacity mutable staging buffer of at most 16 MiB with initialized
length zero. Bytes outside the host-tracked initialized range are zero initialized or unreadable.
The initialized length never exceeds capacity.

`seal-staging` consumes staging ownership on entry and returns either one immutable buffer or an
error with no resource. Its requested length must equal the host-tracked initialized length.
Immutable contents never change. `duplicate-immutable` borrows the source and returns a distinct
owned resource identity with identical bytes. P04-006 implements the explicit read, write, and copy
reference semantics in ABI 5.0.

## Claim boundary

P04-005 defines lifecycle state and ownership transitions, not buffer transport, mapping, shared
memory, resource budgets, host implementations, or database behavior. P04-007 evaluates transport
alternatives; P04-008 owns cancellation/deadline/shutdown completion; P04-009 owns budget policy;
P04-010 through P04-012 own mock, native, and browser hosts.

## Executable enforcement

Pinned `wasm-tools` 1.253.0 resolves 13 interfaces, 85 type entries, 16 functions, six async
functions, four resource methods, 12 imports, and one export. ABI 3.0 and 4.0 sources are byte/hash
bound, and policy plus WIT mutation canaries must reject drift.

```bash
corepack npm run resources:lifecycle:check
corepack npm run resources:lifecycle:test
```

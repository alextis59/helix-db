# Wasm Component ABI 1.0 Contract

- Status: Accepted interface definition; bindings and host operations not implemented
- Last updated: 2026-07-12
- Owner: Runtime architecture owner
- Plan item: `P04-001`
- Governing requirements: `CORE-001`, `CORE-003`, `INV-003`, `INV-004`, `INV-007`, `PLAT-001`, `PLAT-002`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- ADR: [0013](../adr/0013-use-versioned-wit-component-abi.md)
- WIT authority: [`helix:core-abi@1.0.0`](../../wit/helix-core-abi-v1/world.wit)
- Machine authority: [`helix.wasm-component-abi/1`](wasm-component-abi-v1.json)

## Boundary

The WIT package defines the language-neutral type and negotiation surface between the deterministic
core and a capability host. P04-002 now enforces the core's ambient-free source/dependency/import
boundary. It does not bind those interfaces into the current component binary,
implement files/network/time/randomness/GPU operations, or establish public SDK/protocol support.

The world imports `host-control` and exports `core-control`. WIT also imports its shared `types`
interface into the resolved world because both sides use those nominal types.

| Interface | Direction | P04-001 surface |
| --- | --- | --- |
| `types` | Shared nominal types | Versions, capability descriptors, errors/retries, five resource identities, component/host/negotiated descriptors |
| `host-control` | Core imports from host | `poll-cancellation(borrow<cancellation-token>) -> bool` |
| `core-control` | Host calls core | `describe()` and fail-closed `negotiate(host-descriptor)` |

## Version rules

ABI version and WIT package version are related but not interchangeable:

- current and accepted ABI: exactly major 1, minor 0;
- unknown major: `CAP_UNSUPPORTED_VERSION` before resource use;
- unknown minor: reject unless a future committed matrix proves compatibility;
- patch: documentation, bindings, or bug fix only—no WIT or observable semantic change;
- no implicit previous-version, same-major, downgrade, or mixed-version promise; and
- package/crate/application SemVer never authorizes ABI compatibility by inference.

Negotiation validates all bounds, profiles, version fields, and required capabilities before any
resource use. Failure creates no handle, mutates no state, and exposes no partial output.

## Values and buffers

Canonical ABI scalar/list/string lowering is the baseline. Lists and strings copy at the call
boundary. Document byte lists must contain validated canonical HDoc 1.0; generic JSON is not a
document-value route.

The WIT declares `immutable-buffer` and `mutable-staging-buffer` resources so their nominal IDs are
reserved. The immutable 1.0 package deliberately exposes no constructor/read/map/write operation;
P04-005 defines lifecycle operations in ABI 4.0, while P04-006 owns buffer access and explicit-copy
execution. Shared/mapped memory and zero-copy are not claimed.

## Handles

`opaque-handle`, `cancellation-token`, and `capability-set` are resource types. They are:

- non-forgeable;
- non-serializable and nonpersistent;
- scoped to one component instance; and
- unusable until a later interface explicitly creates or borrows them.

WIT `borrow<T>` grants call-scoped access without ownership transfer. An owned resource invokes its
destructor when dropped; the concrete creation/drop/error rules remain P04-005.

## Errors and cancellation

`helix-error` carries an ABI contract version, stable `helix.errors/v1` code, phase, mutation
outcome, retry advice, and bounded redacted detail pairs. It contains no human message. Boundary
validation enforces at most 16 detail pairs, 64-byte keys, 256-byte values, 1,024-byte strings, and
256-byte retry tokens.

Cancellation is explicit cooperative polling of a borrowed token. `true` maps to
`DEADLINE_CANCELLED` at the appropriate safe point. It does not imply rollback or prove that no
commit occurred. P04-004/P04-008 must define bounded operation safe points, deadline composition,
partial I/O, shutdown, and outcome reporting.

## Capabilities

The contract admits at most 128 descriptors with 64-byte names. Each descriptor has a kind,
major/minor version, and flags for required, deterministic input, asynchronous, and revocable
behavior. The declared kinds are files, directories, durability, timers, randomness, scheduling,
metrics, secrets, networking, object storage, and GPU.

Declaring a kind does not grant it. P04-003 defines concrete capability resource identities in ABI
2.0; operations are defined by P04-004 in ABI 3.0; resource lifecycles are defined by P04-005 in
ABI 4.0; explicit copy is defined by P04-006 in ABI 5.0; completion semantics are defined by
P04-008 in ABI 6.0, and deterministic input operations/profiles are defined by P04-009 in ABI 7.0.
P04-010 supplies a deterministic in-process oracle for all 21 imported calls, but all component,
native, and browser host bindings remain unbound.
There is no wildcard or ambient capability, and a missing required descriptor returns
`CAP_HOST_UNAVAILABLE` before resource use.

## Validation

```bash
corepack npm run wasm:abi:check
corepack npm run wasm:abi:test
corepack npm run wasm:validate
```

The checker runs the pinned official `wasm-tools component wit --json`, requires one exact package,
three interfaces, 17 named types/resources, three functions, and one world. The policy checker
enforces version, bounds, ownership, cancellation, capability, negotiation, and claim boundaries;
20 mutations must reject.

## Change rules

- Never rewrite `helix:core-abi@1.0.0` to mean an incompatible interface.
- Update WIT, machine policy, ADR/matrix, bindings, fixtures, native/browser tests, and evidence
  together for any observable change.
- Add a major for incompatible shape/semantics; add a minor only with a proven compatibility matrix.
- A new resource operation must name its owner task, lifecycle, error/outcome, cancellation, bounds,
  capability requirement, and rollback behavior.

P04-003 owns concrete capability definitions, P04-004 owns operations, P04-005 owns resource
lifecycles, and P04-006 owns explicit-copy reference execution. P04-007 onward own alternatives,
while P04-008 owns completion semantics and P04-009 owns injected inputs/budgets. P04-010 owns the
unbound mock oracle; P04-011 owns bounded native runtime construction and grants without linking
calls; P04-012 onward own browser bindings, shared conformance, and transport selection.

# ADR 0013: Use an exact-versioned WIT component ABI with explicit capabilities

- Status: Accepted
- Date: 2026-07-12
- Decision owner: Runtime architecture owner
- Required before: `P04-001`, `G04`
- Supersedes: None
- Superseded by: None

## Context

HelixDB needs one portable deterministic core across native, browser, edge, and server hosts. The
core must not gain ambient files, sockets, clocks, randomness, threads, secrets, or GPU access. At
the same time, a call-by-call low-level ABI would make copying, ownership, cancellation, and failure
semantics host-dependent and difficult to evolve.

Phase 2 proved that the Rust crate can emit a valid WASIp2 component with empty WIT and a browser
core module. Phase 3 froze HDoc 1.0. P04-001 is therefore the first safe point to define the real
component contract while keeping implementation, concrete I/O operations, and public support out
of scope.

The official Component Model WIT design defines packages, interfaces, worlds, canonical value
types, and abstract resources. Resource handles encode unique ownership or call-scoped borrowing,
which fits the required non-forgeable buffer/cancellation/capability identities. WIT package names
carry full semantic versions, but HelixDB still requires an explicit compatibility matrix rather
than inferring behavior from package SemVer alone.

## Decision drivers

- Deterministic core behavior and no ambient authority.
- One language-neutral contract for native and browser hosts.
- Fail-closed version/capability negotiation before resource use.
- Explicit ownership placeholders without premature zero-copy claims.
- Stable structured errors, mutation outcomes, retry scopes, and cancellation meaning.
- Coarse future operations and bounded cross-boundary values.
- Independent parsing by the pinned official `wasm-tools` release.

## Considered options

### Option A — Language-specific Rust traits only

Advantages:

- Simple for an initial native Rust host.
- No additional IDL or bindings toolchain.

Disadvantages:

- Does not define a language-neutral component boundary.
- Browser/native bindings can drift in ownership and error semantics.
- Rust crate versions would be mistaken for ABI compatibility.

### Option B — Flat custom numeric ABI over core Wasm exports

Advantages:

- Maximum control over memory layout and calling convention.
- Can be optimized for one toolchain.

Disadvantages:

- Reimplements string/list/resource lowering and lifecycle rules.
- Creates more unsafe host/guest glue and portability burden.
- Makes bindings and evolution bespoke.

### Option C — Versioned WIT package and world

Advantages:

- Standard Component Model types, packages, interfaces, worlds, and resources.
- Official tools can independently parse and package the interface.
- Owned/borrowed resources make handle intent explicit without choosing concrete host operations.

Disadvantages:

- Current tooling and async support continue to evolve.
- Canonical ABI lists/strings copy at the boundary unless a later resource strategy is selected.
- WIT conformance alone does not prove host execution or portability.

## Decision

Select Option C. The canonical source is
[`helix:core-abi@1.0.0`](../../wit/helix-core-abi-v1/world.wit), world `helix-core-v1`, with three
interfaces:

- `types` defines ABI versions, compatibility outcomes, capabilities, errors/retries, descriptors,
  and opaque buffer/handle/cancellation/capability resources;
- imported `host-control` exposes only cooperative cancellation polling; and
- exported `core-control` exposes component description and fail-closed negotiation.

Only ABI 1.0 is accepted. Unknown majors reject with `CAP_UNSUPPORTED_VERSION`. An unknown minor is
also rejected unless a future committed compatibility matrix explicitly permits it. Patch changes
cannot alter WIT shape or observable semantics. Package SemVer never substitutes for negotiation.

The initial value baseline is Canonical ABI scalars, strings, and lists. Byte lists use explicit
copying. Document bytes mean validated canonical HDoc 1.0, not generic JSON. Resource types are
declared so bindings reserve stable identities, but buffer/handle acquisition, mapping, sharing,
and lifecycle operations remain absent from immutable ABI 1.0; P04-005 defines them in ABI 4.0.
There is no zero-copy claim.

Errors carry the `helix.errors/v1` stable code, phase, mutation outcome, retry advice, bounded
redacted detail pairs, and no human message. Cancellation is an explicit borrowed resource polled
cooperatively; observing cancellation does not prove rollback or non-commit. Concrete deadlines and
partial-I/O semantics remain P04-008.

Capabilities are explicit versioned descriptors from a granted set. Missing required capabilities
fail with `CAP_HOST_UNAVAILABLE` before any resource use or state mutation. P04-003 owns the concrete
file/durability/timer/randomness/scheduling/metrics/secrets/network/object-storage/GPU interfaces.

## Consequences

### Positive

- Native and browser hosts share one parseable ABI authority.
- Version, capability, error, cancellation, and claim boundaries are machine-checked.
- Later interfaces can use stable resources without smuggling integer handles or ambient access.

### Negative

- Initial list/string transport copies.
- ABI changes require WIT/version/matrix/test/evidence updates.
- The component artifact remains empty until bindings and deterministic boundary implementation land.

### Neutral or deferred

- Async I/O, concrete host calls, resource lifecycles, and buffer optimization remain P04-003–P04-008.
- Public SDK/protocol stability is not established by this internal component ABI.

## Compatibility and migration

No persistent data changes. HDoc remains independently versioned. The ABI has no implicit previous
version window and no deployed component migration because no host operations are implemented.

An incompatible WIT or semantic change requires a new ABI major, side-by-side fixtures/bindings,
explicit negotiation, host/core compatibility tests, and a rollback boundary. A compatible minor
requires an accepted matrix proving older peers can ignore or reject every addition safely. The
1.0 source is never silently reinterpreted.

## Security and operations

- No ambient capability exists; a resource or descriptor must be explicitly granted.
- Handles are non-forgeable, non-serializable, nonpersistent, and instance-scoped.
- Negotiation failure creates no resource, changes no state, and releases no partial output.
- Detail counts/bytes, capability counts/names, strings, and retry tokens are bounded.
- This contract does not yet grant files, network, time, randomness, secrets, or GPU access.

## Validation plan

- [x] Parse the WIT package with pinned official `wasm-tools` 1.253.0.
- [x] Check exact package/world/interface/type/function inventories and exclude unsupported states
  from successful negotiation values.
- [x] Check the closed machine policy and 20 mutation canaries.
- [x] Bind the contract into the stable local and hosted Wasm validation commands.
- [x] Enforce the deterministic core source/dependency/import boundary under P04-002.
- [x] Define exact 2.0 guest/host capability interface identities under P04-003 without rewriting
  1.0 or overclaiming bindings.
- [x] Define the exact 3.0 bounded asynchronous storage operations under P04-004 without rewriting
  2.0 or overclaiming execution.
- [x] Define exact 4.0 buffer and opaque-handle lifecycles under P04-005 without rewriting 3.0 or
  overclaiming transport or host execution.
- [x] Define exact 5.0 explicit-copy operations and execute the safe Rust reference model under
  P04-006 without rewriting 4.0 or overclaiming bindings and hosts.
- [x] Prototype handles/shared staging under P04-007 without changing required ABI 5.0, selecting a
  transport, or claiming mapped/shared host integration.
- [x] Define exact ABI 6.0 completion/deadline/shutdown semantics under P04-008 without rewriting
  5.0 or claiming bindings and hosts.
- [x] Define exact ABI 7.0 deterministic clock/random/memory/device injection under P04-009 without
  rewriting 6.0 or claiming bindings and hosts.
- [x] Execute a deterministic bounded mock for all 21 ABI 7 host imports under P04-010 without
  claiming component, native, browser, durability, or GPU integration.
- [x] Build the exact bounded Wasmtime native skeleton and deny-by-default capability grants under
  P04-011 without claiming linked ABI calls, ambient adapters, or platform behavior.
- [x] Build the bounded strict-TypeScript browser host and all 21 imported binding shapes under
  P04-012, with real three-engine execution and no false Component Model or persistence claim.
- [x] Replay one language-neutral explicit-copy transcript through mock, native, and three browser
  engines under P04-013 while inventorying all 21 calls and all 12 capability kinds.
- [x] Prove the zero-import core and exact native/browser policies cannot reach ungranted files,
  sockets, clocks, or devices under P04-014.
- [x] Trace all executable mock/browser ABI calls and explicit copies with bounded structural,
  content-free records under P04-015.
- [ ] Bind generated guest/host operations into the component with their owning P04 tasks.
- [ ] Execute native/browser host conformance, cancellation, and resource lifecycle tests by G04.
- [ ] Benchmark explicit-copy and alternative buffer strategies under P04-016.

## Implementation impact

- WIT authority: `wit/helix-core-abi-v1`.
- Machine/human contract: `docs/architecture/wasm-component-abi-v1.*`.
- Validation: `tests/toolchain/check-wasm-abi.mjs` and mutation canaries.
- Metadata: workspace and `helix-core` maturity advance to `component-abi-v1` without claiming host
  or database implementation.
- Requirements: `CORE-001`, `CORE-003`, `INV-003`, `INV-004`, `INV-007`, `PLAT-001`, `PLAT-002`,
  `SEC-001`, `SEC-002`.

## Follow-up work

- [x] `P04-002`: enforce deterministic core separation from ambient services.
- [x] `P04-003`: define concrete host capability interfaces.
- [x] `P04-004`: define coarse asynchronous operations.
- [x] `P04-005`: freeze buffer/resource lifecycles.
- [x] `P04-006`: implement the explicit-copy correctness baseline.
- [x] `P04-007`: prototype non-required handle/shared-staging alternatives.
- [x] `P04-008`: freeze cancellation, deadline, partial-I/O, and shutdown behavior.
- [x] `P04-009`: freeze deterministic injected values, numeric memory budgets, and device profiles.
- [x] `P04-010`: implement the deterministic all-call mock and exact failure injection.
- [x] `P04-011`: configure the bounded native Wasmtime skeleton and exact capability grants.
- [x] `P04-012`: implement the bounded strict-TypeScript browser host skeleton.
- [x] `P04-013`: replay the shared explicit-copy transcript across all host boundaries.
- [x] `P04-014`: prove ungranted file, socket, clock, and device scopes are unreachable.
- [x] `P04-015`: add content-safe boundary tracing.
- [ ] `P04-016`: publish boundary-strategy measurements.

## References

- [WIT design specification](https://github.com/WebAssembly/component-model/blob/main/design/mvp/WIT.md)
- [Component Model design repository](https://github.com/WebAssembly/component-model)
- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [Error semantics](../architecture/error-semantics.md)
- [Versioning policy](../governance/versioning.md)

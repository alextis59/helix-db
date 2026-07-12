# Deterministic Core and Ambient Host Boundary

- Status: Accepted source/dependency/import boundary; capability interfaces not implemented
- Last updated: 2026-07-12
- Owner: Runtime architecture owner
- Plan item: `P04-002`
- Governing requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- ABI: [Component ABI 1.0](wasm-component-abi-v1.md)
- Machine authority: [`helix.deterministic-core-boundary/1`](deterministic-core-boundary-v1.json)

## Separation rule

The portable core may compute only from explicit arguments and deterministic internal state. It may
decide how to respond to a clock reading, random bytes, I/O completion, memory limit, or device
profile, but it must never discover those facts through ambient calls.

The physical composition module is
[`crates/helix-core/src/deterministic.rs`](../../crates/helix-core/src/deterministic.rs). Its only
direct workspace dependencies are `helix-columnar`, `helix-doc`, `helix-query`, and `helix-storage`.
The core dependency closure excludes host, server, GPU-device, async runtime, socket, random, WASI,
and browser-binding packages.

## Ambient ownership

The capability host owns files/directories, networking, wall and monotonic clocks, randomness,
threads/processes/environment, secrets, object storage, and GPU devices. These categories are
declared for later interfaces but none is implemented or granted by P04-002.

Ambient results may enter the core only as versioned bounded values returned by explicit capability
interfaces. Host failures enter as `helix.errors/v1` errors with mutation outcomes. P04-003 defines
the concrete imports; P04-004/P04-008 define asynchronous, partial-I/O, cancellation, and shutdown
behavior.

## Executable enforcement

The gate checks:

- the exact five-crate deterministic set and four allowed direct dependencies;
- absence of `helix-gpu`, `helix-host-native`, and `helix-server` from the core closure;
- absence of random, async-runtime, socket, WASI, wgpu, and shader packages;
- every Rust source file in the deterministic crates for file/network/time/random/thread/process/
  environment/browser/device access markers, unsafe blocks, and native extern boundaries; and
- the real `wasm32-unknown-unknown` core module for exactly zero imports.

The scan is a guardrail rather than a substitute for review: aliases or future APIs require the
forbidden registry to grow. Dependency-graph and real-Wasm checks make simple source obfuscation
insufficient to claim a pass.

## Claim boundary

This task proves physical separation and active rejection gates. It does not implement capability
interfaces, a native/browser host, deterministic database orchestration, storage, time/random
injection, or component execution. Those remain P04-003 onward.

## Commands

```bash
corepack npm run core:boundary:check
corepack npm run core:boundary:test
```

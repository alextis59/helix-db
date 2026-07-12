# Native Wasmtime Host Skeleton v1

- Status: Implemented bounded runtime skeleton; ABI adapters remain unlinked
- Last updated: 2026-07-12
- Plan item: `P04-011`
- Machine authority: [`helix.native-host-skeleton/1`](native-host-skeleton-v1.json)

The native host uses exact Wasmtime 46.0.1 with only async Component Model, Cranelift, runtime, and
standard-library features. Default features are disabled. No WASI, cache, profiler, pooling,
threads, WAT, filesystem, socket, clock, entropy, or GPU adapter is installed.

An immutable policy admits at most 128 exact kind/scope grants across the eleven ABI capability
kinds. Empty, wildcard, control-bearing, oversized, and duplicate scopes reject. Missing grants
deny. The engine compiles at most 16 MiB of Component Model bytes with fuel accounting and epoch
interruption configured; a core Wasm module is not accepted as a component.

This step proves runtime selection, bounded component validation, and capability-policy shape. It
does not link ABI calls, instantiate the Helix component, perform I/O, or claim durability,
conformance, GPU execution, or database functionality. P04-012 owns the browser skeleton and
P04-013 owns shared call conformance.

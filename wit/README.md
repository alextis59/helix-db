# WebAssembly Interface Types

This directory owns versioned WIT package sources for HelixDB component boundaries. A package is an
internal/public-like ABI authority from its first committed fixture: incompatible meaning changes
add a new version rather than rewriting an existing package.

Versioned packages:

- [`helix:core-abi@1.0.0`](helix-core-abi-v1/world.wit) defines the P04-001 value, resource, error,
  cancellation, capability, and negotiation baseline and remains immutable.
- [`helix:core-abi@1.1.0`](helix-core-abi-v1_1/world.wit) adds the nine P04-003 required capability
  interface/resource/policy identities without defining their operations.

The accepted sources are not yet embedded in the built component. P04-004 onward own operations,
lifecycles, bindings, and host implementation. Parse and contract checks are stable commands:

```bash
corepack npm run wasm:abi:check
corepack npm run wasm:abi:test
corepack npm run host:capabilities:check
corepack npm run host:capabilities:test
```

Every package must have an accepted ADR, a closed machine policy, exact-version negotiation rules,
mutation canaries, native/browser conformance before its gate, and explicit persistent/public claim
boundaries.

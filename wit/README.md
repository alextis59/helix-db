# WebAssembly Interface Types

This directory owns versioned WIT package sources for HelixDB component boundaries. A package is an
internal/public-like ABI authority from its first committed fixture: incompatible meaning changes
add a new version rather than rewriting an existing package.

Current package:

- [`helix:core-abi@1.0.0`](helix-core-abi-v1/world.wit) defines the P04-001 value, resource, error,
  cancellation, capability, and negotiation surface.

The accepted source is not yet embedded in the built component. P04-002/P04-003 own bindings and
host implementation. Parse and contract checks are stable commands:

```bash
corepack npm run wasm:abi:check
corepack npm run wasm:abi:test
```

Every package must have an accepted ADR, a closed machine policy, exact-version negotiation rules,
mutation canaries, native/browser conformance before its gate, and explicit persistent/public claim
boundaries.

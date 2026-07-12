# WebAssembly Interface Types

This directory owns versioned WIT package sources for HelixDB component boundaries. A package is an
internal/public-like ABI authority from its first committed fixture: incompatible meaning changes
add a new version rather than rewriting an existing package.

Versioned packages:

- [`helix:core-abi@1.0.0`](helix-core-abi-v1/world.wit) defines the P04-001 value, resource, error,
  cancellation, capability, and negotiation baseline and remains immutable.
- [`helix:core-abi@2.0.0`](helix-core-abi-v2/world.wit) adds the nine P04-003 required capability
  interface/resource/policy identities without defining their operations.
- [`helix:core-abi@3.0.0`](helix-core-abi-v3/world.wit) adds the six P04-004 bounded asynchronous
  storage batch operations without implementing or binding them.
- [`helix:core-abi@4.0.0`](helix-core-abi-v4/world.wit) adds the P04-005 host-owned buffer and opaque
  handle lifecycle methods and ownership transitions without implementing transport or hosts.
- [`helix:core-abi@5.0.0`](helix-core-abi-v5/world.wit) adds the P04-006 explicit-copy immutable
  read, staging write, and immutable-to-staging operations with an executable safe Rust model.

The accepted sources are not yet embedded in the built component. P04-007 onward own alternatives,
bindings, hosts, and transport selection. Parse and contract checks are stable commands:

```bash
corepack npm run wasm:abi:check
corepack npm run wasm:abi:test
corepack npm run host:capabilities:check
corepack npm run host:capabilities:test
corepack npm run storage:batch:check
corepack npm run storage:batch:test
corepack npm run resources:lifecycle:check
corepack npm run resources:lifecycle:test
corepack npm run buffers:copy:check
corepack npm run buffers:copy:test
```

Every package must have an accepted ADR, a closed machine policy, exact-version negotiation rules,
mutation canaries, native/browser conformance before its gate, and explicit persistent/public claim
boundaries.

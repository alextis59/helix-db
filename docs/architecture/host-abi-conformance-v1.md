# Shared Host ABI Conformance v1

- Status: First shared mock/native/browser transcript implemented
- Last updated: 2026-07-12
- Plan item: `P04-013`
- Machine authority: [`helix.host-abi-conformance/1`](host-abi-conformance-v1.json)

The mock host, Wasmtime-native boundary, and TypeScript browser host parse the same 357-byte ABI 7
vector authority. Each executes a noncontiguous-write rejection, contiguous write/seal, detached
short read with end-of-buffer, and exact immutable-to-staging copy. Chromium, Firefox, and WebKit
run the browser transcript; the two Rust hosts run it in their unit suites.

The conformance inventory also binds the exact 21 WIT imports and 12 capability kinds. This check
found and corrected the native skeleton's missing `locks` capability kind before the shared suite
was accepted.

## Claim boundary

The first common executable transcript covers explicit-copy ownership and bounds. It does not claim
that every file, directory, durability, timer, randomness, cancellation, or control call executes
through a linked Component Model instance on all hosts. P04-014 owns ungranted-resource isolation;
P04-015 owns boundary tracing, and P04-016/P04-017 own transport measurement and selection.

```bash
corepack npm run host:conformance:check
corepack npm run host:conformance:test
corepack npm run browser:smoke
```

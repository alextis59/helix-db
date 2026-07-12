# Browser Host and TypeScript Binding Skeleton v1

- Status: Implemented browser skeleton; generated Component Model linkage remains pending
- Last updated: 2026-07-12
- Plan item: `P04-012`
- Machine authority: [`helix.browser-host-skeleton/1`](browser-host-skeleton-v1.json)

The browser host is strict, standards-based TypeScript with no runtime dependency or child npm
package. It exposes all 21 ABI 7.0 imported call shapes. Host-owned staging and immutable buffers
implement the explicit-copy baseline with bounded, contiguous writes, detached reads, sealing, and
copy operations. File, directory, durability, timer, and random operations require both an exact
kind/scope grant and an explicitly injected adapter. Missing grants deny and missing adapters fail
closed.

Runtime detection reports only the presence of OPFS, IndexedDB, WebGPU, cryptographic randomness,
monotonic time, and Worker entry points. Detection does not invoke them, acquire permission, open
storage, create a GPU adapter, or feed ambient values into semantic execution. The execution profile
is supplied explicitly, validated against ABI 7 memory/device bounds, and snapshotted when the host
is constructed.

The browser can validate, compile, and instantiate the current zero-import core Wasm module within a
16 MiB bound. Unknown imports reject. Raw functions named like the ABI also reject because browser
engines do not provide a standardized WebAssembly Component Model loader; generated canonical ABI
bindings must not be impersonated with ad hoc core-module imports.

## Claim boundary

This task proves TypeScript binding shapes, buffer ownership, capability gating, feature detection,
and real Chromium/Firefox/WebKit core-module instantiation through the browser host. It does not
claim generated WIT linkage, shared host conformance, OPFS or IndexedDB access, durability, GPU
execution, or database functionality. P04-013 owns shared mock/native/browser conformance; P11 owns
browser persistence and lifecycle behavior.

```bash
corepack npm run host:browser:check
corepack npm run host:browser:test
corepack npm run browser:smoke
```

# Wasm Component and Browser Bundle Smoke Validation

- Status: Accepted foundation artifact-validation contract; no database or release support claim
- Last updated: 2026-07-11
- Owner: Runtime architecture owner with quality and release review
- Plan items: `P02-010`, validator licensing extended by `P02-012`, reporting retained by `P02-015`, boundary examples completed by `P02-016`
- Governing requirements: `PLAT-001`, `PLAT-002`, `PLAT-003`, `INV-003`, `INV-004`, `INV-007`, `CORE-001`, `CORE-003`, `QUAL-001`
- Governing gate: `G02`
- Component-validator authority: [`helix.wasm-tools/2`](../../.github/ci/wasm-tools.json)
- CI matrix authority: [`helix.ci-matrix/3`](../../.github/ci/matrix.json)

## Purpose and maturity boundary

This contract proves that the portable foundation crate emits two different valid WebAssembly artifact forms and that the browser form survives the complete Rust-to-Vite-to-real-browser path. `P02-016` exposes that toolchain path as an executable example whose visible and structured outputs deny database functionality. It does not define the production host ABI, implement database behavior, expose a product SDK, or establish a supported release platform.

`helix-core` emits both `rlib` and `cdylib` crate types. The `rlib` preserves ordinary Rust workspace composition. The `cdylib` makes the same boundary skeleton materialize as:

| Target/profile | Required artifact | Validation |
| --- | --- | --- |
| `wasm32-wasip2` / `wasm` | Component Model binary with header version `0x1000d` | Bytecode Alliance `wasm-tools validate`, metadata classification, single embedded core module, exact extracted WIT |
| `wasm32-unknown-unknown` / `browser` | Core module version 1 | Node `WebAssembly.validate`, compile/instantiate, zero imports, exact foundation exports; then byte-identical Vite bundling and the same checks in Chromium, Firefox, and WebKit |

The WASIp2 component's WIT is intentionally empty:

```wit
package root:component;

world root {
}
```

This remains the smallest honest component-validity proof for the current artifact. `P04-001` now
defines immutable [`helix:core-abi@1.0.0`](../../wit/helix-core-abi-v1/world.wit) and capability
[`2.0.0`](../../wit/helix-core-abi-v2/world.wit) sources plus current async-operation
[`3.0.0`](../../wit/helix-core-abi-v3/world.wit) and resource-lifecycle
[`4.0.0`](../../wit/helix-core-abi-v4/world.wit) sources,
including ownership, cancellation, buffer, handle, error, capability, and version rules. The
machine contract deliberately records that bindings are not yet embedded, so the built artifact's
WIT remains empty until later binding work. P04-002 separately proves the
deterministic core has no ambient dependencies/imports. WASIp2 remains a tooling bridge and
is not relabeled WASI 0.3 support.

## Validator supply-chain boundary

The component validator is the official Bytecode Alliance [`wasm-tools` 1.253.0 release](https://github.com/bytecodealliance/wasm-tools/releases/tag/v1.253.0), published 2026-07-07. The [versioned tool documentation](https://docs.rs/crate/wasm-tools/1.253.0) identifies `wasm-tools validate` as the WebAssembly validation command and documents component WIT extraction.

The machine authority records:

- repository, release tag, publication time, and release API;
- the only accepted host for this CI step (`linux-x64`);
- immutable download URL and exact archive name;
- GitHub-published archive byte count and SHA-256;
- exact archive inventory;
- extracted executable byte count and independently checked SHA-256; and
- exact `--version` output, including the upstream source revision/date; and
- exact byte counts and SHA-256 identities for the Apache-2.0, Apache-2.0-with-LLVM-exception, and MIT license files.

`npm run wasm:install-validator` downloads only when the ignored target-scoped installation is absent. It verifies the archive before extraction, rejects unexpected members, extracts without owner/permission restoration, verifies the executable and all license texts before and after its atomic move, and re-verifies every cached invocation. A corrupt cached archive, executable, or license file fails; it is never silently replaced and counted as a pass.

Only the Linux x64 component-validation lane downloads this binary. The browser core-module lane uses the host's built-in WebAssembly engine and the real browsers. Adding a validator host requires an official release asset with equivalent immutable identities plus evidence on that host.

## Browser bundle smoke

The committed app under [`examples/browser-toolchain/`](../../examples/browser-toolchain/README.md) is a boundary example, not a database or product example. Vite builds it from a fixed root into ignored `dist/browser` output with:

- one HTML entry;
- one minified ES2022 module;
- one hidden source map with no emitted `sourceMappingURL`; and
- one external `.wasm` asset whose bytes must equal the independently validated Rust output.

The bundle checker rejects extra/missing output, symlinks, an inlined or changed Wasm file, an exposed source-map URL, invalid source-map JSON, non-relative HTML assets, or removal of the visible non-database boundary. It emits a timestamp-free report under ignored `dist/validation`; each browser lane copies that report into its strict 30-day diagnostic bundle and binds the example policy/source identities.

Playwright serves only the built output on fixed loopback `127.0.0.1:4173`. Each pinned engine fetches the emitted `.wasm` with `application/wasm`, validates, compiles, and instantiates it; computes its SHA-256 using Web Crypto; asserts zero imports and exact foundation exports; and fails on browser console, page, or request errors. Descriptor results are normalized to portable `name`/`kind` fields because engines may expose additional proposal metadata.

The runner requests Playwright's line and JSON reporters, normalizes the raw JSON into closed
`helix.browser-execution-report/1`, and deletes the raw reporter file. The retained report binds
test status, duration, errors, bounded attachment hashes, the coupled browser revision/version, and
the exact launcher-entrypoint byte count and SHA-256 without recording repository/home paths. The
launcher identity is not a complete browser-distribution digest or SBOM and does not broaden this
boundary-example result into browser support.

The [Playwright browser guide](https://playwright.dev/docs/browsers) states that each Playwright version needs its coupled browser revisions. The [CI guide](https://playwright.dev/docs/ci) requires installing browsers/dependencies before execution and recommends one worker for reproducibility. CI therefore installs only the matrix-selected engine with `playwright install --with-deps` after the lifecycle-suppressed locked npm install.

## Commands

```bash
corepack npm ci --ignore-scripts
corepack npm run wasm:install-validator
corepack npm run wasm:validate
corepack npm run examples:policy
corepack npm run examples:native
corepack npm run examples:browser
corepack npm run browser:install
corepack npm run browser:build
corepack npm run browser:smoke
corepack npm run ci:browser-smoke -- chromium
corepack npm run ci:browser-smoke -- firefox
corepack npm run ci:browser-smoke -- webkit
corepack npm run test:browser
corepack npm run toolchain:types
```

`test:browser` is now active. It deterministically rebuilds and checks the boundary example, then requires exactly three project-expanded tests in one file through Playwright list mode without launching a browser. CI and `browser:smoke` execute those tests in the real pinned engines. Browser downloads remain an explicit provisioning step rather than an npm lifecycle side effect.

## Failure and change rules

- A malformed component, core module, archive, executable, bundle, MIME type, browser launch, request, compile, instantiate, or assertion is a hard failure.
- Component and browser artifacts are never substituted for one another; their headers and validation authorities differ.
- Changing Rust, validator, Vite, Playwright, browser revision, target, WIT, output shape, imports, exports, or hashes requires focused review and regenerated evidence.
- An engine-specific extra descriptor field is normalized only when the portable semantic fields agree; engine-specific validation/compile/instantiate failure is not normalized away.
- Network unavailability is a failed provisioning attempt, not proof that validation was skipped safely.
- Browser screenshots, traces, videos, or other attachments named by the structured report are copied from bounded `test-results/` paths. CI collects and uploads the full per-engine bundle on every outcome for 30 days; a gate or release must promote it under the [durable-retention policy](../quality/artifact-retention.md).

## Non-claims and next owners

These examples do not prove database functionality, JavaScript bindings, an ergonomic SDK, component execution in a WASI host, async/capability ABI correctness, storage/GPU capability detection, OPFS/IndexedDB fallback, branded Chrome/Edge/Safari support, packaging, offline installation, or release reproducibility. `P04-*` owns the component ABI/host, `P11-*` owns real browser lifecycle/capability/storage behavior, and `P16-*`/`P24-*` own packaged support claims.

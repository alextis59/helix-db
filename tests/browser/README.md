# Browser Tests

The `P02-016` [`browser-toolchain`](../../examples/browser-toolchain/README.md) boundary example proves that the real Rust core Wasm survives Vite bundling and validation/compilation/instantiation in pinned Chromium, Firefox, and WebKit. Its visible page and structured report explicitly state that database functionality is absent; it is not a browser-support claim.

`npm run test:browser` is the active binary-free example-build and inventory command; it requires exactly three project-expanded tests in one file. After the explicit `npm run browser:install` provisioning step, `npm run browser:smoke` builds and runs all three engines; CI uses `npm run ci:browser-smoke -- <engine>` to install/run one matrix-selected engine. `P11-*` owns lifecycle, capability, storage, quota, and fallback behavior.

The compile-only `P02-011` WGSL canaries are intentionally outside this boundary-example suite and run through `npm run wgsl:validate`. They use Chromium as a pinned Dawn validator, do not change the three-test browser inventory, and do not create a WebGPU browser-support claim.

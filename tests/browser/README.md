# Browser Tests

The internal `P02-010` smoke fixture proves that the real Rust core Wasm survives Vite bundling and validation/compilation/instantiation in pinned Chromium, Firefox, and WebKit. It is not a database example or browser-support claim.

`npm run test:browser` remains the stable binary-free inventory and requires exactly three project-expanded tests in one file. After the explicit `npm run browser:install` provisioning step, `npm run browser:smoke` builds and runs all three engines; CI uses `npm run ci:browser-smoke -- <engine>` to install/run one matrix-selected engine. `P02-016` expands and activates the suite with a user-facing minimal example; `P11-*` owns lifecycle, capability, storage, quota, and fallback behavior.

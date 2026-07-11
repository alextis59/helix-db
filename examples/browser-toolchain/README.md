# Browser Toolchain Boundary Example

- Status: Executable browser boundary example; no database functionality
- Plan item: `P02-016`
- Build check: `corepack npm run examples:browser`
- Real-engine check: `corepack npm run browser:smoke`

This minimal page loads the real `helix-core` boundary skeleton compiled for
`wasm32-unknown-unknown`, verifies its bytes, compiles and instantiates it, and renders a structured
report. The report and visible page both state `databaseFunctionality: false` and list document API,
query, persistence, durability, GPU execution, and network service behavior as not implemented.

The build command is offline once the pinned Rust/npm toolchains are installed. The real-engine
command requires the explicit `corepack npm run browser:install` provisioning step. Neither command
accepts an input document, storage path, query, server address, shader, or capability override.

Passing proves the Rust-to-Wasm-to-Vite plumbing and, when explicitly launched, execution in the
pinned Playwright engines. It does not claim OPFS/IndexedDB behavior, WebGPU support, branded
browser support, persistence, an SDK, packaging, security, or production readiness; those remain
`P04-*`, `P10-*`, `P11-*`, and `P16-*` work.

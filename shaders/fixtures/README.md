# WGSL Compilation Fixtures

These files are repository-owned inputs for the `P02-011` foundation validator. They are not
HelixDB product kernels and are never accepted from a client, request, plugin, or external path.

- `valid/` contains shaders that must parse, validate, and create a compute pipeline.
- `invalid/` contains deliberate syntax or resource-binding failures that the validator must
  reject with the markers recorded in `manifest.json`.
- `manifest.json` binds every source path and SHA-256 digest to an expected outcome.

Run `npm run wgsl:check` for the browser-free manifest and source-integrity check. After the
pinned Playwright Chromium is installed, run `npm run wgsl:validate` for real Dawn/SwiftShader
shader-module validation and compute-pipeline compilation. The latter compiles only; it does not
dispatch work or establish correctness, performance, native-GPU, or product-browser support.

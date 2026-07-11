# Internal Shaders

This root is reserved for repository-owned, versioned WGSL kernels and their source fixtures. Clients will not be allowed to submit arbitrary WGSL.

- `predicates/` owns bounded predicate/filter kernels.
- `bitmaps/` owns bitmap combination and selection kernels.
- `vectors/` owns vector-distance and candidate-generation kernels.
- `fixtures/` owns hash-bound `P02-011` compiler inputs and rejection canaries; these are not product kernels.

The three product-kernel directories remain contracts only: no product kernel, GPU execution, correctness, capability, or performance result is implemented or claimed. `P02-011` validates and compiles the separate trusted fixture set through pinned Chromium Dawn/SwiftShader; runtime work begins in Phase 10.

# Internal Shaders

This root is reserved for repository-owned, versioned WGSL kernels and their source fixtures. Clients will not be allowed to submit arbitrary WGSL.

- `predicates/` owns bounded predicate/filter kernels.
- `bitmaps/` owns bitmap combination and selection kernels.
- `vectors/` owns vector-distance and candidate-generation kernels.

All three directories are currently contracts only: no kernel, GPU capability, or performance result is implemented or claimed. Shader validation begins under `P02-011`; runtime work begins in Phase 10.

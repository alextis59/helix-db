# Third-Party Notices

HelixDB source is licensed under the [MIT License](LICENSE).

## Current locked development-tool inventory

The root npm workspace has six exact direct development tools:

| Package | Version | Declared license | Purpose |
| --- | ---: | --- | --- |
| `@biomejs/biome` | 2.5.3 | MIT OR Apache-2.0 | JavaScript/TypeScript/JSON formatting and linting |
| `@playwright/test` | 1.61.1 | Apache-2.0 | Future real-browser harness |
| `@types/node` | 22.20.1 | MIT | Lowest-supported Node.js type surface |
| `typescript` | 6.0.3 | Apache-2.0 | Static type checking |
| `vite` | 8.1.4 | MIT | Browser build configuration and future bundling |
| `vitest` | 4.1.10 | MIT | JavaScript/TypeScript test runner |

`package-lock.json` contains 91 locked npm development packages including platform-option variants. No npm dependency is a production/runtime dependency. The declared-license inventory is:

| SPDX form | Locked packages | Review disposition |
| --- | ---: | --- |
| MIT | 60 | Allowed development tooling |
| MIT OR Apache-2.0 | 9 | Allowed dual-permissive development tooling |
| Apache-2.0 | 6 | Allowed development tooling |
| MPL-2.0 | 12 | Reviewed build-only `lightningcss` family; must not be shipped without release/legal revalidation |
| ISC | 2 | Allowed development tooling |
| BSD-3-Clause | 1 | Allowed development tooling |
| 0BSD | 1 | Allowed development tooling |

The MPL-2.0 entries are `lightningcss` 1.32.0 and its eleven optional platform packages, reached through Vite. They are build tools, not runtime imports or intended packaged contents. `P02-012` revalidates their provenance/license obligations, and release package-content checks must fail if an unreviewed build tool is shipped.

The lock records two optional Darwin-only `fsevents` install scripts (2.3.2 and 2.3.3). Deterministic installs suppress lifecycle scripts; any future enablement requires a focused review.

No external Rust crate is locked: all eight Cargo packages are unpublished MIT workspace paths. No vendored code, third-party shader, generated SDK, benchmark dataset, or browser binary is committed.

The machine-readable allow/exception inventory and checker are in [`tests/toolchain/dependency-policy.json`](tests/toolchain/dependency-policy.json) and [`check-dependency-policy.mjs`](tests/toolchain/check-dependency-policy.mjs). Package license identifiers are screening metadata, not a substitute for retaining required upstream license texts in distributed artifacts.

This file is updated whenever dependencies or externally sourced material change. `P02-012` adds retained vulnerability, provenance, license-text, and duplicate-version reports; release automation later reconciles locked graphs, vendored assets, generated artifacts, packaged contents, and the production SBOM.

Documentation links and citations identify external references but do not assert ownership of or redistribute the linked material.

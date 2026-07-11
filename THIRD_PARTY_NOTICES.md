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

The MPL-2.0 entries are `lightningcss` 1.32.0 and its eleven optional platform packages, reached through Vite. They are build tools, not runtime imports or intended packaged contents. `P02-012` verified the same 15,648-byte root license text in all twelve integrity-checked tarballs. Release package-content checks must still fail if an unreviewed build tool is shipped.

The lock records two optional Darwin-only `fsevents` install scripts and the only duplicate-version family (2.3.2 at the root and 2.3.3 below Vite). Deterministic installs suppress both lifecycle scripts; `P02-012` revalidated their paths, versions, licenses, signature requirement when selected, and non-shipment boundary. Any future enablement or deduplication requires a focused review.

All 91 registry tarballs were downloaded from their locked URLs and reproduced their SHA-512 integrities. The license authority records 73 root license/notice files across 65 packages by path, size, and SHA-256. Twenty-six development-only tarballs omit root license text: eight Biome platform binaries, `@napi-rs/wasm-runtime`, fifteen Rolldown platform bindings, `@tybys/wasm-util`, and `stackback`. Those omissions are explicit reviewed exceptions through `P16-010`; none is eligible for shipment without resolved notice obligations.

No external Rust crate is locked: all eight Cargo packages are unpublished MIT workspace paths. No vendored code, third-party shader, generated SDK, benchmark dataset, component validator, or browser binary is committed.

## Explicit downloaded validation tools

`P02-010` selects the Bytecode Alliance `wasm-tools` 1.253.0 Linux x64 release binary solely as a CI/development component validator. Its upstream release carries Apache-2.0 with LLVM exception, Apache-2.0, and MIT license files. Revised [`helix.wasm-tools/2`](.github/ci/wasm-tools.json) records the official release source, exact archive/executable sizes and SHA-256 hashes, and exact byte/hash identities for all three license files. Installation stays under ignored `target/toolchain`, re-verifies the license texts, and is not a production dependency or shipped artifact.

Playwright 1.61.1 explicitly downloads its coupled Chromium, Firefox, or WebKit revision for real-browser smoke execution. Those binaries remain in the external Playwright cache, are not npm lifecycle downloads, and are not committed or packaged. Browser licenses and redistribution obligations must be re-evaluated if a later release ever embeds a browser rather than testing against one.

`P02-013` adds the `llvm-tools` component distributed with the exact Rust 1.96.1 development toolchain. The coverage runner uses only that toolchain's `llvm-profdata` and `llvm-cov`, records their exact binary identities, and never commits or packages them. The component is external build/test tooling, is not a Cargo dependency, and inherits the Rust/LLVM distribution's licensing and as-is tool-availability boundary; redistribution would require a separate notice/content review.

GitHub-hosted workflows execute the official `actions/checkout` 7.0.0, `actions/setup-node` 6.4.0, and `actions/upload-artifact` 7.0.1 actions from full reviewed commit SHAs. The upload action is used only by the scheduled/manual observational benchmark workflow to transfer ignored raw/summary JSON to GitHub's artifact service. These actions are CI service tooling, are not committed, installed as product dependencies, or included in release artifacts; their version/SHA authority and update review live in [`.github/ci/matrix.json`](.github/ci/matrix.json).

The `P02-014` calibration buffer is generated from an original repository-defined LCG32 specification and declared MIT. It contains no copied dataset, user data, or third-party benchmark content.

The machine-readable allow/exception inventory and checker are in [`tests/toolchain/dependency-policy.json`](tests/toolchain/dependency-policy.json) and [`check-dependency-policy.mjs`](tests/toolchain/check-dependency-policy.mjs). The [report policy](tests/toolchain/dependency-report-policy.json), [complete npm license authority](.github/ci/npm-license-inventory.json), and [report runner](tests/toolchain/check-dependency-reports.mjs) add deterministic inventory plus explicit live advisory/signature/provenance observations. Package license identifiers remain screening metadata, not a substitute for retaining required upstream license texts in distributed artifacts.

This file is updated whenever dependencies or externally sourced material change. `P02-012` established retained vulnerability, provenance, license-text, and duplicate-version reports; release automation later reconciles locked graphs, vendored assets, generated artifacts, packaged contents, and the production SBOM.

Documentation links and citations identify external references but do not assert ownership of or redistribute the linked material.

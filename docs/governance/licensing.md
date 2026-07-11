# Licensing and Third-Party Material Policy

- Status: Approved
- Effective date: 2026-07-11
- Project license: [MIT](../../LICENSE)
- Notice index: [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)

## Repository license review

The repository contains the standard MIT License with copyright held by `alextis59` for 2026. The license permits use, modification, distribution, sublicensing, and sale while requiring preservation of the copyright and permission notice. It provides the software without warranty.

Project source, original WGSL shaders, original fixtures, original examples, and original documentation are contributed under this repository license unless a file or generated artifact explicitly records another compatible license.

## Contribution rule

Contributors must have the right to submit all code, documentation, fixtures, shaders, schemas, generated output, benchmark data, and examples in their change. By contributing, they agree that their contribution is distributed under the repository's MIT License unless an accepted ADR and file-level notice explicitly establish a compatible exception.

Do not copy code, prompts, examples, tests, protocol descriptions, benchmark datasets, or shader implementations from a source merely because it is publicly visible. Record provenance and verify the license before inclusion.

## Dependency policy

Dependencies are evaluated for license, security, provenance, maintenance, Wasm/platform support, format ownership, and transitive obligations.

Generally acceptable with automated notice collection:

- MIT.
- Apache-2.0.
- BSD-2-Clause and BSD-3-Clause.
- ISC.
- Zlib.
- Unicode data licenses approved for the specific data/version used.
- Public-domain or CC0 material with recorded provenance.

Requires explicit legal/licensing review and an ADR before use in distributed artifacts:

- MPL-2.0 or other file-level copyleft.
- LGPL or dependencies with dynamic/static linking obligations.
- GPL, AGPL, SSPL, source-available, field-of-use, non-commercial, research-only, or custom licenses.
- Dual-licensed code when the selected option or commercial exception is unclear.
- Dependencies with missing, ambiguous, or conflicting metadata.

The review must consider every shipped form: Rust library, static/native binary, Wasm module, npm package, mobile framework, container, operator, SDK source, generated code, and managed-service deployment.

## Vendored and generated code

- Prefer package-manager dependencies with locked versions and provenance over vendoring.
- Vendored code retains its upstream license, copyright, source locator, version/commit, and local modification record.
- Generated files identify their generator, generator version/commit, source inputs, reproduction command, and applicable license.
- A generator's license and the generated output's license are evaluated separately.
- Generated SDKs, protocol code, fixtures, or shader metadata must not erase upstream notices.

## WGSL shaders and GPU assets

- Original HelixDB kernels use the repository MIT License.
- Ported algorithms or shader fragments record their precise source and license in `THIRD_PARTY_NOTICES.md` and, where required, adjacent file headers.
- Shader test vectors and benchmark inputs require the same provenance review as CPU code.
- Compiled shader artifacts retain a manifest linking them to reviewed source and notices.
- Client-supplied arbitrary shaders are prohibited by the specification and are not treated as third-party plugins.

## Format, protocol, and compatibility material

Interoperability work may study public protocol and behavior documentation, but implementations must be original or use properly licensed components. Compatibility fixtures should be generated from independently specified commands and observed results, not copied wholesale from upstream proprietary test suites.

Trademarks and project names are not granted by software licenses. Compatibility documentation uses third-party names only to identify tested interoperability and must not imply sponsorship or official status.

## Benchmark and test data

Every committed or externally retained dataset records:

- Owner/source and immutable locator.
- License and redistribution terms.
- Whether it contains personal, confidential, production, or regulated data.
- Generation or transformation procedure.
- Required attribution.
- Hash, version, and retention rule.

Synthetic deterministic data is preferred. Production/customer data is prohibited from the repository and public evidence. Public datasets with unclear redistribution rights are not committed; if evaluation is legally permitted, the evidence manifest records how an authorized reviewer obtains the data separately.

Benchmark results themselves identify the dataset version and must not imply ownership of third-party data.

## Documentation and media

Screenshots, diagrams, logos, fonts, icons, and copied documentation require provenance and license review. Original text and diagrams use MIT with the repository. Third-party trademarks remain the property of their owners and are used descriptively.

## Package and release requirements

Every published crate, npm package, binary archive, SDK, Wasm bundle, container, mobile artifact, and operator must include or link:

- The repository MIT License.
- Required third-party notices and license texts.
- Accurate package license metadata.
- Source/provenance information required by dependencies.
- An SBOM for production release artifacts.

Release validation compares packaged notices with the locked dependency graph and fails on unreviewed licenses or missing obligations.

## Review and automation

`P02-006` adds deterministic locked-license/source/lifecycle/duplicate screening and the current development-tool notice inventory. `P02-012` adds a complete integrity-verified npm tarball license authority, reviewed missing-text exceptions, deterministic duplicate/source reports, and dated vulnerability/registry-signature/SLSA-provenance observations. `P02-013` adds compiler-matched `llvm-tools` only as part of the pinned Rust development toolchain, records the exact coverage binaries, and does not ship them or add a Cargo dependency. `P02-014` adds only an original deterministic MIT calibration buffer and full-SHA-pinned official GitHub artifact-transfer tooling; neither is a product dependency or shipped content. Package/release tasks still reconcile actual shipped contents and the production SBOM. Every new dependency or external asset records a focused review in its change.

The release owner owns the aggregate notice/SBOM result. Domain owners remain responsible for declaring external material introduced in their areas.

### Approved pending HDoc codec dependency

`P03-007` approves `lz4_flex` exactly `0.13.1` for future HDoc codec/profile `1/1` use. The reviewed
crate is MIT-licensed; its crates.io archive has SHA-256
`7ef0d4ed8669f8f8826eb00dc878084aa8f253506c4fd5e8f58f5bce72ddb97e`, and the selected
`default-features = false`, `safe-encode`, `safe-decode` configuration has no runtime transitive
crate. The [compression registry](../formats/hdoc-v1-compression.md) records upstream commit,
source/license hashes, native/Wasm vectors, advisory review, and exact use boundary.

This is a reviewed pending dependency, not part of the current Cargo graph or shipped inventory.
`P03-008` must install a pinned fail-closed Rust advisory scanner/report before adding the first
external crate, pin `=0.13.1` and its lock checksum, update `THIRD_PARTY_NOTICES.md` and dependency
policy, and preserve the MIT license text/provenance in every shipped crate, binary, Wasm, npm, and
SBOM boundary. A different version or feature set requires a new focused review.

## Current third-party inventory

The exact current npm development-tool inventory and license counts are maintained in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md), enforced by [`helix.dependency-policy/1`](../../tests/toolchain/dependency-policy.json), and expanded by the [dependency reporting contract](../architecture/dependency-security-reporting.md). All locked npm entries are development-only; the twelve MPL-2.0 `lightningcss` entries are a bounded build-tool exception and cannot enter shipped artifacts without revalidation. Cargo currently contains only the eight unpublished MIT workspace packages and no external crate. No vendored code, third-party shader, generated SDK, benchmark dataset, or browser binary is committed.

The transcript contains source citations as documentation links; those links do not incorporate the cited content into distributed software.

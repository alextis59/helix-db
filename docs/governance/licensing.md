# Licensing and Third-Party Material Policy

- Status: Approved
- Effective date: 2026-07-10
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

Phase 2 adds dependency-license scanning and notice generation to CI. Until then, every new dependency or external asset records a manual review in the change.

The release owner owns the aggregate notice/SBOM result. Domain owners remain responsible for declaring external material introduced in their areas.

## Current third-party inventory

At this bootstrap step, no third-party source dependency, vendored code, shader, generated SDK, or benchmark dataset is committed. The transcript contains source citations as documentation links; those links do not incorporate the cited content into distributed software.

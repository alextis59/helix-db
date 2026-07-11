# Toolchain Profile Checks

This directory contains bounded verification entry points for foundation build profiles, policies, CI, Wasm artifacts, and browser plumbing.

- `run-build-profile.mjs` runs exactly one named Rust build/instrumentation profile with fixed Cargo arguments.
- `check-browser-profile.mjs` resolves the pinned Vite production configuration without creating a bundle.
- `check-dependency-policy.mjs` reconciles Cargo metadata and the complete npm lock with the machine policy.
- `dependency-policy.json` is the exact source/license/lifecycle/duplicate/unsafe exception authority.
- `check-dependency-reports.mjs` creates the deterministic lock/license/duplicate inventory, refreshes all integrity-verified npm tarball license identities, and obtains the dated npm advisory/signature/SLSA observation.
- `dependency-report-policy.json` fixes report schemas, vulnerability/signature thresholds, download limits, reviewed missing-license-text families, external-tool coverage, and freshness.
- `check-test-command-surface.mjs` validates all stable test aliases, suite states, activation owners, runner descriptions, documentation, and rejection behavior.
- `check-ci-matrix.mjs` validates gating/nightly lanes, immutable action pins, workflow security, emitted matrices, Playwright projects, and explicit exclusions.
- `emit-ci-matrix.mjs` emits compact trusted `fromJSON` matrices for gating or nightly workflow contract jobs.
- `check-ci-runtime.mjs` rejects a provisioned runner whose OS, architecture, Node version, or process identity differs from its matrix entry.
- `install-wasm-tools.mjs` downloads or reuses only the official hash-pinned Linux x64 component validator and verifies archive, inventory, executable, and version identities.
- `check-wasm-artifacts.mjs` builds and validates the WASIp2 component and browser core-module forms and emits deterministic ignored reports.
- `build-browser-smoke.mjs` checks the exact four-file Vite output and byte identity of its Wasm asset.
- `run-browser-smoke.mjs` executes the built bundle in one selected engine or all three pinned engines.
- `check-wgsl-fixtures.mjs` validates the strict trusted-source manifest without a browser or parses, validates, and creates compute pipelines for every fixture through pinned Chromium Dawn/SwiftShader.

These checks prove toolchain configuration, artifact plumbing, and compile-only WGSL acceptance/rejection only. They do not dispatch a shader or prove GPU correctness/support. The stable unit, integration, conformance, fuzz, browser, crash, benchmark, and distributed commands are defined by `P02-007`; user-facing browser examples and product-host behavior remain `P02-016`/`P11-*` work.

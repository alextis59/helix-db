# Toolchain Profile Checks

This directory contains bounded verification entry points for foundation build profiles, policies, CI, Wasm artifacts, and browser plumbing.

- `run-build-profile.mjs` runs exactly one named Rust build/instrumentation profile with fixed Cargo arguments.
- `bootstrap-contract.mjs`, `check-bootstrap.mjs`, and `test-bootstrap-contract.mjs` bind the [clean-machine bootstrap guide](../../docs/development/bootstrap.md) to exact tools, profiles, host limits, CI, troubleshooting codes, and rejection canaries; `preflight` additionally requires a clean worktree and real local prerequisite identities.
- `check-browser-profile.mjs` resolves the pinned Vite production configuration without creating a bundle.
- `examples-contract.mjs`, `check-examples.mjs`, and `test-examples-contract.mjs` bind the two executable example sources/commands/reports and reject inflated database claims.
- `check-dependency-policy.mjs` reconciles Cargo metadata and the complete npm lock with the machine policy.
- `dependency-policy.json` is the exact source/license/lifecycle/duplicate/unsafe exception authority.
- `check-dependency-reports.mjs` creates the deterministic lock/license/duplicate inventory, refreshes all integrity-verified npm tarball license identities, and obtains the dated npm advisory/signature/SLSA observation.
- `dependency-report-policy.json` fixes report schemas, vulnerability/signature thresholds, download limits, reviewed missing-license-text families, external-tool coverage, and freshness.
- `check-test-command-surface.mjs` validates all stable test aliases, suite states, activation owners, runner descriptions, documentation, and rejection behavior.
- `check-ci-matrix.mjs` validates gating/nightly lanes, immutable action pins, workflow security, emitted matrices, retained-artifact uploads, Playwright projects, and explicit exclusions.
- `emit-ci-matrix.mjs` emits compact trusted `fromJSON` matrices for gating or nightly workflow contract jobs.
- `check-ci-runtime.mjs` rejects a provisioned runner whose OS, architecture, Node version, or process identity differs from its matrix entry.
- `check-rust-coverage.mjs` validates or executes the compiler-matched LLVM coverage pipeline, removes only reviewed test-code ranges, and enforces workspace/semantic/recovery thresholds.
- `rust-coverage-policy.json` fixes the source inventory, exclusions, tool identities, report schema, threshold groups, execution bounds, historical boundary-skeleton exception, and active HDoc product scope.
- `install-wasm-tools.mjs` downloads or reuses only the official hash-pinned Linux x64 component validator and verifies archive, inventory, executable, and version identities.
- `check-wasm-artifacts.mjs` builds and validates the WASIp2 component and browser core-module forms and emits deterministic ignored reports.
- `check-deterministic-core.mjs` binds the portable core to its reviewed dependency closure, scans
  the deterministic Rust crates for ambient access, and proves that the browser core has zero
  imports; `test-deterministic-core-contract.mjs` rejects 30 policy/source mutations.
- `check-wasm-abi.mjs` validates the exact versioned WIT package and its explicit-copy,
  opaque-resource, cancellation, and capability boundary; its contract tests reject ABI drift.
- `check-host-capabilities.mjs` preserves immutable ABI 1.0 and validates exact ABI 2.0's nine
  capability resources/policies and operation non-claim; its contract tests reject policy and
  parsed-WIT drift.
- `check-storage-batch-abi.mjs` preserves ABI 2.0 and validates exact ABI 3.0's six bounded async
  storage calls and implementation non-claim; its contract tests reject policy and parsed-WIT drift.
- `build-browser-smoke.mjs` checks the exact four-file example output, visible non-database boundary, and byte identity of its Wasm asset.
- `run-browser-smoke.mjs` executes the built bundle in one selected engine or all three pinned engines and writes a sanitized, strict execution report with launcher-entrypoint identity.
- `check-wgsl-fixtures.mjs` validates the strict trusted-source manifest without a browser or parses, validates, and creates compute pipelines for every fixture through pinned Chromium Dawn/SwiftShader.
- `artifact-retention-policy.json` fixes the five retention profiles, active/reserved state, size/sensitivity limits, CI expiry, durable promotion, and immutable upload service controls.
- `artifact-retention-contract.mjs` validates the strict schemas, policy, bundle inventories, byte identities, browser reports, and pass/fail invariants shared by collectors and checkers.
- `collect-retained-artifacts.mjs` creates one fixed semantic, coverage, or browser diagnostic bundle and records incomplete/failing results without making them pass.
- `check-retained-artifacts.mjs` checks the policy or one complete generated bundle; `test-artifact-retention-contract.mjs` rejects service, profile, producer, reservation, engine, manifest, payload, browser-report, and dependency-report drift.

These checks prove toolchain configuration, artifact plumbing, compile-only WGSL acceptance/rejection, executable non-database boundary examples, and an armed product-coverage gate only. CI replay/browser bundles expire after 30 days and must be promoted under the [artifact-retention policy](../../docs/quality/artifact-retention.md) before supporting a gate or release. The current coverage denominator is honestly empty after test-only exclusions because the Rust crates remain boundary skeletons; it is not a 100% product-coverage claim. The checks do not dispatch a shader or prove GPU correctness/support. The stable unit, integration, conformance, fuzz, browser, crash, benchmark, and distributed commands are defined by `P02-007`; product-host behavior remains `P11-*` work.

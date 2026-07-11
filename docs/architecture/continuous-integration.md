# Continuous Integration Matrix and Trust Boundary

- Status: Accepted foundation CI contract; hosted results are not release support claims
- Last updated: 2026-07-10
- Owner: Runtime architecture owner with quality and release review
- Plan items: `P02-009`, revised by `P02-010`
- Governing gate: `G02`
- Machine authority: [`helix.ci-matrix/2`](../../.github/ci/matrix.json)
- Component validator authority: [`helix.wasm-tools/1`](../../.github/ci/wasm-tools.json)
- Gating workflow: [`ci.yml`](../../.github/workflows/ci.yml)
- Nightly workflow: [`ci-nightly.yml`](../../.github/workflows/ci-nightly.yml)

## Purpose and claim boundary

The CI matrix fixes which foundation toolchain lanes gate every `main` push/pull request and which broader architecture lanes run nightly. It tests the current boundary skeleton, semantic authorities, and toolchain contracts; it does not prove a database product, package, browser host, supported deployment platform, performance level, or release artifact exists.

Runner labels are explicit rather than mutable `*-latest` aliases. The selected labels and architectures follow GitHub's [hosted-runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). The repository is public, so the standard Linux arm64 runner is available; Windows arm64 remains public preview and is explicitly unsupported here rather than silently omitted.

## Gating matrix

| Group | Required lanes | Commands and boundary |
| --- | --- | --- |
| Node | 22.23.1 and 24.18.0 on `ubuntu-24.04` x64 | Clean script-suppressed install; formatting/dependency/types; deterministic fixtures; aggregate tests |
| Native Rust | `ubuntu-24.04` x64, `windows-2025` x64, `macos-15` arm64 | Exact Rust toolchain; format, check, Clippy, all-feature tests; docs additionally on Linux x64 |
| Portable Rust | `wasm32-unknown-unknown`, `wasm32-wasip2` on Linux x64 | Strict Clippy plus real core-module/component builds; Node validates the browser module and pinned `wasm-tools` validates/classifies the WASIp2 component |
| Sanitizer | `x86_64-unknown-linux-gnuasan` on Linux x64 | Stable fully instrumented standard-library build profile; no non-Linux sanitizer claim |
| Browser bundle smoke | Chromium, Firefox, WebKit on Linux x64 | Install only the Playwright-coupled engine/dependencies; build four-file Vite output; fetch, validate, compile, and instantiate the byte-identical core Wasm |

The 11 emitted gating lanes come from the committed JSON authority, not copied YAML arrays. A contract job validates the authority and writes compact matrices to `GITHUB_OUTPUT`; downstream jobs consume them through `fromJSON`. Each job verifies `RUNNER_OS`, `RUNNER_ARCH`, Node version, `process.platform`, and `process.arch` before doing useful work, preventing an image-label transition from being mistaken for the reviewed architecture.

The three browser entries are `toolchain-smoke` lanes. Following the [Playwright CI guidance](https://playwright.dev/docs/ci), each installs only its selected browser plus operating-system dependencies after the locked lifecycle-suppressed npm install. The [P02-010 validation contract](wasm-browser-smoke-validation.md) then builds and checks a real Vite/Wasm bundle before executing one test in that engine. These lanes prove the foundation toolchain path only; Playwright Chromium/WebKit are not branded Chrome/Edge/Safari claims, and product-host behavior remains `P02-016`/`P11-*` work.

## Nightly architecture matrix

The scheduled/manual nightly workflow adds:

- `ubuntu-24.04-arm` for Linux arm64; and
- `macos-15-intel` for macOS x64.

Both run the same strict native format/check/Clippy/test command set. A nightly failure is actionable and blocks a support claim, but it does not currently block every pull request. Promotion to gating requires stable capacity, acceptable duration, and a reviewed matrix change. Demotion requires an incident/owner/recovery date; `continue-on-error` is prohibited.

## Workflow security and reproducibility

- Workflow permissions are `contents: read`; no job receives write, package, deployment, OIDC, or artifact-attestation permission.
- Checkout credentials do not persist.
- `actions/checkout` 7.0.0 and `actions/setup-node` 6.4.0 use full immutable commit SHAs, recorded with their reviewed release versions in the matrix.
- Setup Node's automatic package cache is disabled. Clean installs use the repository lock and deny lifecycle scripts.
- Workflows use fixed runner labels, fixed Node versions, the exact `rust-toolchain.toml`, frozen Cargo operations, bounded timeouts, and fail-fast disabled so every matrix failure is visible.
- No third-party community action, service, container, mutable cache, or secret is used. P02-010 adds two explicit downloads: the matrix-selected Playwright browser revision from its documented CDN and the official Bytecode Alliance `wasm-tools` Linux x64 release archive. Neither occurs through an npm lifecycle script.
- The validator archive/executable are version-, size-, inventory-, and SHA-256-pinned by `helix.wasm-tools/1`. Playwright browser identity remains coupled to the exact locked Playwright package.
- Artifact retention is intentionally absent until `P02-015`; compact local reports are produced under ignored `dist/validation`, and failure screenshots/traces remain local outputs.

An action update requires confirming the tag-to-SHA mapping from the official action repository, reviewing release and runtime changes, updating both workflows and the machine authority together, and replaying all local CI-contract canaries. A full SHA prevents tag movement from changing accepted code but does not eliminate the need to review the action source and transitive runtime.

## Local verification

```bash
corepack npm run ci:check
node tests/toolchain/emit-ci-matrix.mjs gating
node tests/toolchain/emit-ci-matrix.mjs nightly
corepack npm run wasm:install-validator
corepack npm run wasm:validate
corepack npm run browser:install
corepack npm run ci:browser-smoke -- chromium
corepack npm run ci:browser-smoke -- firefox
corepack npm run ci:browser-smoke -- webkit
corepack npm run toolchain:types
```

Local checks validate exact matrix/workflow/action/validator configuration, lane identities, emitted JSON, security markers, both Wasm forms, bundle output, and real browser execution on Linux x64. GitHub itself remains the authority for hosted workflow parsing and Windows/macOS/arm64 provisioning. Therefore local evidence does not prove a hosted matrix passed; the first hosted green matrix and independent review remain required inputs to `G02`.

## Change policy

Adding, removing, gating, demoting, or relabeling an OS/architecture/target/Node/browser lane updates the matrix authority, workflows, this document, runtime checks, requirements ledger, and evidence together. A passing lane establishes tested build behavior only. Product support is declared later from packaged clean-consumer and release evidence under `P16-*`/`P24-*`.

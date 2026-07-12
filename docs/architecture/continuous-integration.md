# Continuous Integration Matrix and Trust Boundary

- Status: Accepted foundation CI contract; hosted results are not release support claims
- Last updated: 2026-07-12
- Owner: Runtime architecture owner with quality and release review
- Plan items: `P02-009`, revised by `P02-010` through `P02-017`, `P03-020`–`P03-021`, and `P04-001`–`P04-003`
- Governing gate: `G02`
- Accepted gate evidence: [`G02` hosted toolchain review](../../evidence/phase-02/G02/README.md)
- Machine authority: [`helix.ci-matrix/3`](../../.github/ci/matrix.json)
- Bootstrap authority: [`helix.clean-bootstrap/1`](../development/bootstrap.json)
- Component validator authority: [`helix.wasm-tools/2`](../../.github/ci/wasm-tools.json)
- Gating workflow: [`ci.yml`](../../.github/workflows/ci.yml)
- Nightly workflow: [`ci-nightly.yml`](../../.github/workflows/ci-nightly.yml)
- Observational benchmark workflow: [`benchmark-baseline.yml`](../../.github/workflows/benchmark-baseline.yml)
- Retention authority: [`helix.artifact-retention-policy/1`](../../tests/toolchain/artifact-retention-policy.json)

## Purpose and claim boundary

The CI matrix fixes which foundation toolchain lanes gate every `main` push/pull request, which broader architecture lanes run nightly, and which result-producing jobs are observational only. It tests the current boundary skeleton, semantic authorities, and toolchain contracts; it does not prove a database product, package, browser host, supported deployment platform, performance level, or release artifact exists.

Runner labels are explicit rather than mutable `*-latest` aliases. The selected labels and architectures follow GitHub's [hosted-runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). The repository is public, so the standard Linux arm64 runner is available; Windows arm64 remains public preview and is explicitly unsupported here rather than silently omitted.

## Gating matrix

| Group | Required lanes | Commands and boundary |
| --- | --- | --- |
| Node | 22.23.1 and 24.18.0 on `ubuntu-24.04` x64 | Clean script-suppressed install; formatting/dependency/types; deterministic dependency/license/duplicate inventory and fixtures; aggregate tests; Node 22 additionally records the live advisory/signature/provenance observation |
| Native Rust | `ubuntu-24.04` x64, `windows-2025` x64, `macos-15` arm64 | Exact Rust toolchain; format, check, Clippy, all-feature tests, and locked/offline native boundary-example execution; docs and compiler-matched source-based coverage thresholds additionally on Linux x64 |
| Portable Rust | `wasm32-unknown-unknown`, `wasm32-wasip2` on Linux x64 | Strict Clippy plus real core-module/component builds; the component lane checks immutable ABI 1.0, current capability ABI 2.0, their rejection canaries, then validates/classifies the still-unbound WASIp2 artifact |
| Sanitizer | `x86_64-unknown-linux-gnuasan` on Linux x64 | Stable fully instrumented standard-library build profile; no non-Linux sanitizer claim |
| Browser boundary example | Chromium, Firefox, WebKit on Linux x64 | Install only the Playwright-coupled engine/dependencies; all three build and execute the byte-identical core Wasm example with explicit non-database output; Chromium additionally validates and compiles hash-bound internal WGSL through Dawn/SwiftShader |

The 11 emitted gating lanes come from the committed JSON authority, not copied YAML arrays. A contract job validates the authority and writes compact matrices to `GITHUB_OUTPUT`; downstream jobs consume them through `fromJSON`. Each job verifies `RUNNER_OS`, `RUNNER_ARCH`, Node version, `process.platform`, and `process.arch` before doing useful work, preventing an image-label transition from being mistaken for the reviewed architecture.

The three browser entries are `boundary-example` lanes. Following the [Playwright CI guidance](https://playwright.dev/docs/ci), each installs only its selected browser plus operating-system dependencies after the locked lifecycle-suppressed npm install. The [P02-010/P02-016 validation contract](wasm-browser-smoke-validation.md) then builds and checks the real Vite/Wasm example before executing one test in that engine. These lanes prove the foundation toolchain path only; Playwright Chromium/WebKit are not branded Chrome/Edge/Safari claims, and product-host behavior remains `P11-*` work.

The Chromium lane additionally runs the [P02-011 WGSL fixture contract](wgsl-fixture-validation.md). It requires two reviewed shaders to create compute pipelines and two deliberate failures to produce diagnostics and pipeline rejection through pinned Chromium's Dawn/SwiftShader stack. It does not dispatch GPU work and is not a native adapter, cross-browser WebGPU, shader correctness, performance, or production SwiftShader claim.

## Nightly architecture matrix

The scheduled/manual nightly workflow adds:

- `ubuntu-24.04-arm` for Linux arm64; and
- `macos-15-intel` for macOS x64.

Both run the same strict native format/check/Clippy/test command set and the locked/offline native boundary example. A nightly failure is actionable and blocks a support claim, but it does not currently block every pull request. Promotion to gating requires stable capacity, acceptable duration, and a reviewed matrix change. Demotion requires an incident/owner/recovery date; `continue-on-error` is prohibited.

## Observational benchmark lane

The `benchmark-baseline-linux-x64` lane is a scheduled/manual, non-gating benchmark job on fixed
`ubuntu-24.04` with Node 22.23.1. It has no push or pull-request trigger and is not emitted into the
11-lane gating matrix. It compiles the benchmark profile, executes the integrity-only harness
calibration and the production HDoc v1 codec/lookup workload, validates both raw-linked result
contracts, and preserves both two-file directories for 30 days.

Non-gating does not mean best effort. A schema, dataset, digest, execution, report, or upload failure makes the job fail visibly; `continue-on-error` is forbidden. The [benchmark result contract](../quality/benchmark-results.md) fixes its workload, complete stage inventory, claim boundary, failure retention, output hashes, and absence of a performance threshold.

## Diagnostic artifact retention

The gating workflow collects four active classes after their upstream checks: immutable HDoc 1.0
golden formats, semantic replay plus Node 22 dependency reports, compiler-matched Linux x64
coverage, and one report bundle for each real browser engine. Collection and upload use
`if: always()`, so a failing upstream check remains red
while its available structured diagnostics and bounded failure attachments are preserved. The
collector also exits nonzero when a required output is absent or invalid; retention never converts
a failed lane into a passing one.

Every active bundle has a strict manifest binding the source commit, environment, fixed commands,
source hashes, complete payload inventory, byte sizes, SHA-256 hashes, failure list, retention rule,
and non-claim. Diagnostic CI artifacts expire after 30 days; golden formats retain their CI copy
for 90 days. Anything used for a task, gate, product claim, or release must be promoted before
expiry to committed evidence or an approved immutable store under
the [artifact-retention and durable-promotion contract](../quality/artifact-retention.md).

P03-016 activates the golden-format profile for the 24 immutable supported HDoc 1.0 files and its
strict manifest. Crash-matrix and packaged-release profiles remain reserved until `P05-021` and
`P16-010`; the policy rejects producers for those classes rather than uploading placeholders.

P03-017 activates the integration suite on every Node/native lane through the stable root test
command. Its dedicated Vitest configuration drives the production Rust fixture reader and the
independent TypeScript CRC/LZ4/logical-tree/hash reader over the four positive immutable vectors.

P03-018 expands the all-feature Rust unit inventory from 44 to 49. Every native lane runs the
deterministic generated round-trip, presentation-canonicalization, malformed-prefix/suffix,
stored-byte damage, checksum-repaired single-bit mutation, and tagged-JSON canonicalization suites;
the Linux lane additionally retains threshold-enforced coverage and ASan compilation remains
gating.

P03-019 activates the stable fuzz suite on both exact Node lanes. Setup installs exact
`nightly-2026-06-30` and `cargo-fuzz 0.13.2`, fetches the separate locked fuzz graph, validates 12
tool/authority rejection canaries, then returns to offline execution. Five libFuzzer/AddressSanitizer
targets execute 640 bounded units per aggregate run. The three browser jobs also replay all 24
immutable HDoc seeds through a bounds-checked CRC/directory probe in Chromium, Firefox, and WebKit.

P03-020 adds a five-shape HDoc workload to the stable benchmark suite and observational workflow.
The root suite gates only shape, operation, sample, correctness, size, dictionary-arithmetic, source,
and report integrity. The 600 retained timings have a null threshold. P03-021 adds a checked,
source-bound decision authority selecting self-contained HDoc base/canonical compression and
derived-only dictionary IDs; its mutation canaries prevent result drift or claim expansion.

P04-001 adds the accepted versioned WIT source and closed ABI policy to the component lane. The gate
requires the exact package/world/interface/type/function inventory plus 20 version, ownership,
error, cancellation, capability, negotiation, and claim mutations. This defines the contract but
does not conceal that the compiled component remains empty until later binding/host tasks.

P04-002 adds the deterministic-core checker and 30 rejection canaries to both Node policy lanes.
P04-003 adds exact 2.0 capability-interface parsing and 27 policy/resolution rejection canaries to
both Node policy lanes and the component lane.
It validates the live Cargo closure, scans 11 deterministic Rust files for ambient APIs, and builds
the real browser module to require zero imports. `wasm:validate` replays the same boundary before
the ABI and artifact checks.

## Workflow security and reproducibility

- Workflow permissions are `contents: read`; no job receives write, package, deployment, OIDC, or artifact-attestation permission.
- Checkout credentials do not persist.
- `actions/checkout` 7.0.0, `actions/setup-node` 6.4.0, and `actions/upload-artifact` 7.0.1 use full immutable commit SHAs, recorded with their reviewed release versions in the matrix.
- Setup Node's automatic package cache is disabled. Clean installs use the repository lock and deny lifecycle scripts.
- Workflows use fixed runner labels, fixed Node versions, the exact `rust-toolchain.toml`, frozen Cargo operations, bounded timeouts, and fail-fast disabled so every matrix failure is visible.
- No third-party community action, service, container, mutable cache, or secret is used. P02-010 adds two explicit downloads: the matrix-selected Playwright browser revision from its documented CDN and the official Bytecode Alliance `wasm-tools` Linux x64 release archive. Neither occurs through an npm lifecycle script. P02-011 reuses Chromium's bundled Dawn/SwiftShader implementation and adds no download or dependency.
- The validator archive/executable and three license texts are version-, size-, inventory-, and SHA-256-pinned by `helix.wasm-tools/2`. Playwright browser identity remains coupled to the exact locked Playwright package.
- SwiftShader is enabled only for small, committed, hash-bound repository fixtures. The validator accepts no external WGSL, URL, stdin, or environment-provided source; Chromium's documented lower-security software-renderer path is never exposed as a product interface.
- Every Node lane verifies the integrity-bound 91-package license/source/duplicate inventory. Node 22.23.1 alone performs the explicit npm advisory query and verifies all installed registry signatures plus available SLSA provenance attestations; missing/invalid signatures, any advisory, or network/malformed-response failure is gating.
- The Linux x64 native lane resolves `llvm-profdata`/`llvm-cov` from the exact Rust toolchain, separates explicitly marked unit-test code from product source, and enforces the [workspace, semantic-critical, and recovery-critical coverage policy](../quality/code-coverage-policy.md). `P03-008` activated the product denominator, and `P03-009`–`P03-016` expanded its executable contracts: the HDoc codec/values/lookup/tagged conversion, path-dictionary format/lifecycle, exact-1.0 negotiation, and immutable golden checks must meet the applicable 100% semantic-critical line/function and 95% region thresholds; the historical skeleton exception can no longer authorize an active empty scope.
- The retention service fails on missing files, never overwrites, excludes hidden files, archives at compression level 9, and retains diagnostic bundles for 30 days. Artifact names include the variant, run ID, and attempt. General CI uploads cover the exact semantic/dependency, coverage, and browser bundle directories; the `P02-014` benchmark workflow separately uploads only its raw-linked two-file result.
- Active foundation outputs accept only public repository data and sanitized diagnostics. Crash evidence is preclassified for redacted public or access-controlled storage, and release uploads may contain only public release material. Secrets, signing keys, raw customer/tenant data, and unredacted sensitive evidence are never public CI payloads.

An action update requires confirming the tag-to-SHA mapping from the official action repository, reviewing release and runtime changes, updating both workflows and the machine authority together, and replaying all local CI-contract canaries. A full SHA prevents tag movement from changing accepted code but does not eliminate the need to review the action source and transitive runtime.

## Local verification

The [clean-machine bootstrap guide](../development/bootstrap.md) is the human command authority and
separates cross-platform foundation work from Linux x64 browser/diagnostic proof. The CI contract
job validates its machine authority and rejection canaries before emitting the matrices below.

```bash
corepack npm run bootstrap:check
corepack npm run bootstrap:test
corepack npm run ci:check
corepack npm run examples:check
node tests/toolchain/emit-ci-matrix.mjs gating
node tests/toolchain/emit-ci-matrix.mjs nightly
corepack npm run wasm:install-validator
corepack npm run wasm:validate
corepack npm run dependencies:check
corepack npm run dependencies:report
corepack npm run coverage:policy
corepack npm run coverage:check
corepack npm run benchmark:schemas
corepack npm run test:benchmark
corepack npm run benchmark:check
corepack npm run artifacts:policy
corepack npm run artifacts:test
corepack npm run artifacts:test-replay
corepack npm run artifacts:coverage-replay
corepack npm run wgsl:check
corepack npm run browser:install
corepack npm run wgsl:validate
corepack npm run ci:browser-smoke -- chromium
corepack npm run artifacts:browser-report -- chromium
corepack npm run ci:browser-smoke -- firefox
corepack npm run artifacts:browser-report -- firefox
corepack npm run ci:browser-smoke -- webkit
corepack npm run artifacts:browser-report -- webkit
corepack npm run toolchain:types
```

Local checks validate exact matrix/workflow/action/validator configuration, lane identities, emitted JSON, registry signatures and provenance observations, lock/tarball license and duplicate reports, compiler-matched coverage reporting and thresholds, strict benchmark schemas/raw linkage, retained-bundle inventories and byte identities, both Wasm forms, WGSL manifest hashes/compiler outcomes, bundle output, and real browser execution on Linux x64. GitHub itself remains the authority for hosted workflow parsing, artifact IDs/URLs/digests, artifact-service behavior, and Windows/macOS/arm64 provisioning. Local evidence alone therefore never proves a hosted matrix or upload passed. The accepted [`G02` evidence](../../evidence/phase-02/G02/README.md) separately binds the first green gating and nightly runs, runner/job conclusions, artifact-service digests, durable report promotion, and independent review to the exact source commit.

## Change policy

Adding, removing, gating, demoting, or relabeling an OS/architecture/target/Node/browser lane updates the matrix authority, workflows, this document, runtime checks, requirements ledger, and evidence together. A passing lane establishes tested build behavior only. Product support is declared later from packaged clean-consumer and release evidence under `P16-*`/`P24-*`.

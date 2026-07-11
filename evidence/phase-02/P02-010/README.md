# P02-010 Wasm Component and Browser Bundle Smoke Evidence

- Task: `P02-010` — add Wasm component validation and browser bundle smoke tests to CI
- Requirements supported: `PLAT-001`, `PLAT-002`, `PLAT-003`, `INV-003`, `INV-004`, `INV-007`, `CORE-001`, `CORE-003`, `QUAL-001`
- Commit under test: `4d937801e68c73c0e5b46f209b7a59522c5ea5bf`
- Recorded at: `2026-07-10T22:30:00Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Verdict: Pass

## Scope

This step turns the P02-009 inventory-only portable/browser lanes into real artifact and execution checks while preserving their foundation-only claim boundary:

- `helix-core` now emits `rlib` plus `cdylib`, producing a real browser core module and a WASIp2 Component Model binary;
- the official Bytecode Alliance `wasm-tools` 1.253.0 Linux x64 archive and executable are pinned by source, tag, sizes, SHA-256 values, archive inventory, and exact version output;
- the validator accepts the 13,204-byte component, classifies its single embedded core module, and extracts the intentionally empty foundation WIT world;
- Node accepts, compiles, and instantiates the 86-byte import-free browser module with exact foundation exports;
- Vite emits exactly four deterministic files and preserves the validated Wasm bytes as an external asset; and
- Chromium, Firefox, and WebKit each fetch that emitted asset with the correct MIME type, validate, compile, instantiate, hash, and inspect it without console/page/request failures.

The normative artifact, supply-chain, browser, failure, and non-claim rules are in the [Wasm component and browser bundle smoke-validation contract](../../../docs/architecture/wasm-browser-smoke-validation.md).

## Deterministic artifact results

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| WASIp2 component | 13,204 | `ba534a6433571e8c3da9d284f80e5bb183d3c75d97e5bd6d48aabddaa61e7f5a` |
| Extracted empty WIT | 43 | `a7343b25ef27cc71c14ae2f275747d1b5023e9931839a11d0303733bb785975b` |
| Browser core module/source and bundle asset | 86 | `c3231bfcaaa248bda3c8a762c35f5f778e1e4f319b93eef3882e7a9c6a0fde93` |
| Emitted ES2022 JavaScript | 1,794 | `ca01cdcab10e22a61c74539340303859332e726459b3785bb7f4ff6478d0a4fa` |
| Hidden JavaScript source map | 3,010 | `0db8f309bc73957734f0c9376ad4025587897bf5f1b3ea4ba3a0dc2db0584789` |
| Emitted HTML | 433 | `610ed966d16d010425e25bfb1bf08d928a9a0d979fce42654350040bca7f94a1` |

The timestamp-free Wasm report hashes to `fa5d57b3331e2f7cabfff333ffdcca6f8443e9feb0bcb1bdb85b4c9438f761d3`; the bundle report hashes to `ee9291a79568d50fa5c8247f9be8e59d10929b9eb855493de5329f40388b15f2`. Node 22.23.1 and 24.18.0 reproduce those exact outputs from clean lifecycle-suppressed npm installs without changing the lock.

## Real-browser results

Playwright 1.61.1 installed its coupled external browser revisions outside the repository:

| Project | Coupled browser | Playwright revision | Result |
| --- | --- | ---: | --- |
| Chromium | Chrome for Testing 149.0.7827.55 | 1228 | Pass |
| Firefox | Firefox 151.0 | 1532 | Pass |
| WebKit | WebKit 26.5 | 2311 | Pass |

Every project ran the same emitted four-file bundle with one worker. Chromium and Firefox returned portable `name`/`kind` export descriptors directly. WebKit additionally exposed proposal `type` metadata; the app now deliberately projects the portable fields before cross-engine comparison. The underlying WebKit validation, compilation, and instantiation all passed.

## Negative verification

The clean-room verifier applies ten independent mutations and requires each one to fail:

1. change the pinned validator archive digest;
2. append a byte to the installed validator executable;
3. corrupt the component header and require `wasm-tools validate` to reject it;
4. corrupt the core-module version and require `WebAssembly.validate` to reject it;
5. disable the required hidden source map and require the bundle inventory to fail;
6. add an unexpected browser spec and require the stable reserved inventory to fail;
7. demote a browser CI lane back to `inventory-only`;
8. remove the explicit Playwright browser-install command from CI;
9. prevent the smoke app from reporting ready and require real Chromium execution to fail; and
10. leak the Playwright spec into Vitest unit discovery and require the unit command to fail.

Every source mutation is restored. Generated Wasm, validator, bundle, report, browser, screenshot, and trace outputs remain ignored; the temporary checkout must finish with no tracked or untracked source drift.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
rustc: 1.96.1 (31fca3adb 2026-06-26)
cargo: 1.96.1 (356927216 2026-06-26)
active Node.js: v22.19.0
Corepack: 0.34.0
npm through Corepack: 11.18.0
Python: 3.10.12
PyYAML: 6.0
validator: wasm-tools 1.253.0 (c799bb87b 2026-07-07)
JavaScript lanes: Node 22.23.1 and 24.18.0
real-browser host: Linux x86_64 loopback Vite preview
```

## Commands

```bash
corepack npm ci --ignore-scripts
corepack npm run ci:check
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run toolchain:types
corepack npm test
corepack npm run wasm:install-validator
corepack npm run wasm:validate
corepack npm run browser:install
corepack npm run browser:build
corepack npm run browser:smoke
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
RUSTDOCFLAGS="-D warnings" cargo doc --frozen --workspace --no-deps --all-features
cargo clippy --frozen --target wasm32-unknown-unknown --package helix-core -- -D warnings
cargo clippy --frozen --target wasm32-wasip2 --package helix-core -- -D warnings
node evidence/phase-02/P02-010/verify.mjs 4d937801e68c73c0e5b46f209b7a59522c5ea5bf
```

## Retained diagnostic attempts

1. The first validator install verified both downloaded hashes but moved the extracted archive directory one level above the authority's expected path, then exited 1 with `ENOENT`. The atomic destination now preserves the declared archive root and re-verifies the final executable.
2. The first component metadata assertion expected an older array response. `wasm-tools` 1.253.0 returned a component-root object with one module child; the checker now pins that actual structure after validation and exact WIT extraction.
3. The first three-engine run received `Cannot GET /` because Vite's intentional `custom` app type does not rewrite `/` to `index.html`. Readiness and navigation now target `/index.html` explicitly; no SPA fallback was enabled.
4. The second run used Playwright's input-only `toHaveValue` matcher for semantic `<output>`. The app and test now use visible text with `toHaveText`, which passed in all engines.
5. Chromium and Firefox passed the third run, while WebKit serialized additional export-descriptor `type` metadata. The portable report now projects only standardized `name`/`kind` fields; WebKit then passed without weakening validation, compile, instantiate, MIME, hash, import, or export checks.
6. The aggregate regression exposed that Vitest inherited the dedicated Vite smoke root. A separate explicit unit config restores repository-root discovery, excludes Playwright/browser/generated trees, and keeps zero JavaScript unit files under the intended patterns.
7. The first clean-room authority-digest canary passed because the checker required only a well-formed SHA-256 value while the authority itself supplied that value. The implementation commit was amended before evidence acceptance so publication time, license forms, archive/path names, both exact digests, and version output are independently hard-coded and mutation-gated.
8. The first Vitest-boundary canary added a browser include without removing the explicit browser exclude, so the unit command correctly remained green. The canary now removes the exclusion and adds the include together, causing Vitest to encounter/reject the Playwright spec as intended.

These failures are retained because they exercised real download, validator, Vite serving, DOM matcher, cross-engine API, and test-runner boundaries rather than synthetic success paths.

## Limitations

The local branch has not been pushed, so GitHub-hosted workflow execution, Windows/macOS native jobs, and Linux/macOS arm64 provisioning remain unproven until the first hosted green matrix. The evidence host reused/downloaded external Playwright browsers and the official validator release over the network; offline installation and durable CI artifact upload are not claimed.

The WIT world is intentionally empty and the browser module exposes only compiler foundation exports. This is not a database API, JavaScript binding, component runtime execution, WASI 0.3 claim, user-facing example, storage/GPU capability test, OPFS/IndexedDB fallback test, branded-browser claim, package, or release artifact. Those obligations remain with `P02-015`, `P02-016`, `P04-*`, `P11-*`, `P16-*`, and `P24-*`; `G02` remains open.

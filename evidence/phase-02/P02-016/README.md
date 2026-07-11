# P02-016 Native and Browser Toolchain Example Evidence

- Task: `P02-016` — create minimal native and browser examples that prove the toolchain without
  implying database functionality
- Requirements supported: `CORE-001`, `CORE-003`, `INV-003`, `INV-004`, `INV-007`, `PLAT-001`,
  `PLAT-002`, `PLAT-003`, `QUAL-001`
- Source commits:
  `bceba1253e612a7cfe8a26abbcf42c176c80824a`,
  `77bcc130615617d2f7d2269d275e3677ba1f8e27`
- Final commit under test: `77bcc130615617d2f7d2269d275e3677ba1f8e27`
- Recorded at: `2026-07-11T05:40:20.733Z`
- Source worktree: clean
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Accepted ADRs: none
- Verdict: Pass

## Scope and result

The source commits add two deliberately non-functional examples and make their maturity executable:

- [`native-toolchain`](../../../examples/native-toolchain/README.md) is a standalone, unpublished,
  locked Cargo package that links the real `helix-host-native` boundary without its optional GPU
  feature;
- [`browser-toolchain`](../../../examples/browser-toolchain/README.md) builds the real
  `helix-core` boundary skeleton for `wasm32-unknown-unknown`, emits a four-file Vite bundle, and
  validates/compiles/instantiates the Wasm in Chromium, Firefox, and WebKit;
- [`examples.json`](../../../examples/examples.json) is the versioned machine authority for both
  examples' fixed commands, source inventories, reports, and shared claim boundary;
- native output contains `database_functionality: false` and an exactly empty operation list;
- the browser page visibly says that database functionality is not implemented, while its runtime
  report lists document API, query, persistence, durability, GPU execution, and network service as
  absent; and
- twenty-eight source canaries reject policy, command, source, report, bundle, operation, import,
  omission, digest, verdict, and claim escalation.

No public package, native CLI, document API, query engine, storage path, persistence, durability,
GPU dispatch, network service, compatibility adapter, security control, or release artifact was
added. The root Cargo and npm lockfiles are byte-identical to the base commit. The standalone Cargo
lock contains only seven repository path packages and no registry source or checksum.

## Native boundary example

The fixed command is:

```bash
corepack npm run examples:native
```

It expands to locked/offline Cargo execution with output redirected to ignored
`target/examples/native-toolchain`. It accepts no caller-provided arguments and creates no storage
file or socket. On the retained local Linux x64 run it linked the required portable core closure and
emitted [`native-toolchain-example.json`](reports/native-toolchain-example.json):

| Field | Retained value |
| --- | --- |
| Schema/task | `helix.native-toolchain-example/1` / `P02-016` |
| Component/maturity | `helix-host-native` / `boundary-skeleton` |
| Target | `linux` / `x86_64` |
| Required dependency | `helix-core` |
| Database functionality | `false` |
| Operations | `[]` |
| Bytes / SHA-256 | `595` / `876e8289c6afef2d2542036a57f7d2e32c3d268e902460f662454853977e07e3` |

The CI contract runs the same command on three gating lanes—Linux x64, Windows x64, and macOS
arm64—and two nightly lanes—Linux arm64 and macOS x64. Local evidence executes Linux x64; the
hosted Windows/macOS/arm64 executions remain `G02` inputs rather than being inferred from matrix
source.

## Browser boundary example

The deterministic build report is retained as
[`browser-bundle-example.json`](reports/browser-bundle-example.json). It binds four output files:

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| core Wasm | 86 | `c3231bfcaaa248bda3c8a762c35f5f778e1e4f319b93eef3882e7a9c6a0fde93` |
| minified ES2022 module | 2,235 | `0f663224780847759751381ba901fef036ab3ac7ac06a0137cf66e1d274cdcf9` |
| hidden source map | 3,988 | `4b696f7c24cf5df1e906b5a06a9bb42d4d4b21ce3f7c0bd065a226905eed05cd` |
| HTML entry | 978 | `ec7d3685418713eabdc8e44af0253375f0148616487a0be4638d11f0c7abd718` |

The build rejects missing/extra output, symlinks, changed or inlined Wasm, source-map disclosure,
invalid maps, non-relative assets, removal of visible maturity text, and any bundle report that
claims database behavior. The Wasm has zero imports and exactly the current foundation exports.

The combined real-engine execution is retained as
[`browser-execution-all.json`](reports/browser-execution-all.json). The report remains under the
`P02-015` browser-retention schema while this evidence manifest binds it to the `P02-016` source
commit and test title.

| Engine | Revision/version | Result | Launcher entrypoint identity |
| --- | --- | --- | --- |
| Chromium | `1228` / `149.0.7827.55` | 1 passed | 278,568,152 bytes / `2d18db9d8608b052b6a552ee00ec1e830f93692e928b65ecc67d693bd33fe801` |
| Firefox | `1532` / `151.0` | 1 passed | 579,040 bytes / `05fa1371ab7dd4ce2b2efea456aa0cc887f8c82a910d9ddc5ea5414071abbf03` |
| WebKit | `2311` / `26.5` | 1 passed | 3,049 bytes / `a85baad3d8c07173ac387a59b41500c382b21ed692afe0964d29aac247ccc63b` |

All three executions had zero skipped, unexpected, flaky, retried, or failed tests. Playwright's
Chromium/WebKit engines are not branded Chrome/Edge/Safari support claims, and launcher entrypoint
hashes are not complete browser-distribution SBOMs.

## Stable suite and CI integration

`test:browser` is now one of four active stable suites. It performs a deterministic example build
and bundle contract check, then lists exactly one test expanded across the three engines without
installing or launching browsers. Real execution remains behind explicit `browser:install`,
`browser:smoke`, and per-engine CI commands. `P11-014` owns expansion to lifecycle, capability,
storage, quota, and fallback behavior.

The CI authority now labels the three browser lanes `boundary-example`, moves their expansion owner
to `P11-014`, and runs the native example in all five declared native lanes. The Chromium retained
bundle also requires the trusted WGSL report. All browser retention manifests bind
`examples.json`, the browser README, HTML, runtime source, and report type by byte identity.

## Failure-path hardening

The evidence mutation that changed `databaseFunctionality` to `true` correctly made the Chromium
assertion fail, but the first source commit exposed ANSI/control bytes in Playwright's failure text.
The existing strict report schema rejected those bytes before it could retain the failure. The
focused hardening commit `77bcc130615617d2f7d2269d275e3677ba1f8e27` now:

- redacts repository/home prefixes before retention;
- removes complete ANSI control sequences;
- removes prohibited C0/DEL characters while preserving permitted tab/newline text;
- caps each diagnostic at 2,000 characters; and
- permanently tests ANSI, NUL, vertical-tab, replacement, and length behavior.

The repeated deliberate claim escalation then exited nonzero, wrote a valid structured `fail`
report with sanitized errors and bounded attachment identities, and restored to a clean passing
Chromium report. A failed example therefore remains both red and diagnosable.

## Independent clean replay

[`verify.mjs`](verify.mjs) verifies the exact two-commit sequence, cumulative 49-path source scope,
46 present artifact byte identities, three promoted fixture deletions, source-tree identity, and
unchanged root lockfiles. It validates the three retained reports independently before trusting the
source checkers.

The verifier extracts the final source commit to a temporary Git repository and performs:

- script-suppressed clean installs under exact Node 22.23.1 and 24.18.0;
- JavaScript formatting/lint, dependency policy/inventory, TypeScript, CI, command-surface,
  example-policy, report, retention, and aggregate-suite replay on both Node lines;
- root and standalone Cargo formatting, frozen checks, Clippy with warnings denied, all-feature
  tests, and warning-free rustdoc;
- strict Clippy for both portable Rust targets, Linux x64 ASan, and compiler-matched coverage;
- pinned WASIp2 component plus browser core-module validation;
- trusted WGSL compilation and real Chromium/Firefox/WebKit execution;
- strict collection/checking of all three per-engine retained bundles;
- independent PyYAML parsing of 9 workflow jobs and 55 steps;
- reconciliation of all 44 specification requirement IDs;
- 154 source Markdown files and 1,030 local links; and
- rejection of tracked generated output or an unrestored mutation.

The clean replay reproduced the retained native and browser bundle reports byte-for-byte. Generated
targets, bundles, reports, browser results, and dependencies remained ignored.

## Negative verification

The verifier executes 84 task-relevant canaries:

- 28 example policy/native/browser/bundle source mutations;
- 38 retention policy/profile/producer/bundle/browser/dependency source mutations; and
- 18 isolated evidence mutations covering policy schema/claim, native command/operation/database
  inflation, visible browser-boundary removal, runtime claim/omission weakening, stale Vite root,
  suite deactivation, gating/nightly command removal, CI lane relabeling, retention-source removal,
  source-map disclosure, checker argument injection, and retained-report claim escalation.

Every isolated canary must reach its intended first rejection reason. Browser claim and omission
mutations execute in real Chromium; a parser, setup, compiler, or unrelated test failure does not
count. Each file is restored, and the example/CI/browser checks pass again before the verifier
returns success.

## Limitations and next owners

- This local run does not prove GitHub parsed or executed the workflows, accepted artifacts, or
  provisioned Windows/macOS/arm64 runners. Those hosted facts remain `G02` evidence.
- These examples use repository-relative source paths. Clean-consumer native/TypeScript examples
  without repository assumptions remain `P11-017` work.
- Browser storage capability detection, OPFS/IndexedDB fallback, WebGPU support, lifecycle, quota,
  and product APIs remain `P11-*` work.
- Public package identity remains deferred to `P16-016`; HelixDB/`helix-db` is only the accepted
  development name.
- No example result can support a compatibility, security, durability, performance, platform, or
  release claim.

## Reproduction

```bash
corepack npm ci --ignore-scripts
corepack npm run examples:test
corepack npm run examples:check
corepack npm run test:browser
corepack npm run browser:smoke
corepack npm run ci:check
corepack npm run artifacts:test
cargo clippy --manifest-path examples/native-toolchain/Cargo.toml \
  --locked --offline --target-dir target/examples/native-toolchain -- -D warnings
node evidence/phase-02/P02-016/verify.mjs \
  77bcc130615617d2f7d2269d275e3677ba1f8e27
```

The full verifier requires the pinned Rust targets/tools, exact NVM Node versions, Playwright's
three explicitly provisioned browser revisions, Python with PyYAML, and network access only when
the hash-pinned `wasm-tools` binary is absent from the temporary target tree.

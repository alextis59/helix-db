# JavaScript and TypeScript Toolchain Policy

- Status: Accepted toolchain baseline
- Last updated: 2026-07-10
- Owner: Runtime architecture owner
- Plan item: `P02-003`
- Governing requirements: `PLAT-001`, `PLAT-002`, `CORE-003`, `INV-007`
- Governing gate: `G02`
- Development identity: [ADR 0001](../adr/0001-public-product-identity.md)
- Rust counterpart: [Rust toolchain policy](rust-toolchain-policy.md)

This policy selects the private JavaScript/TypeScript workspace manager, lockfile behavior, supported Node.js lines, compiler, bundler, unit/conformance runner, and real-browser harness. It does not create a browser host, SDK, bundle, test suite, or database feature.

## Node.js support window

The supported development/CI lines are:

| Node line | Repository range | Role |
| --- | --- | --- |
| Node 22 LTS | `>=22.12.0 <23` | Oldest supported line and default `.nvmrc` development baseline (`22.23.1`) |
| Node 24 LTS | `>=24.11.0 <25` | Newest supported LTS line and required CI lane |
| Node 26 Current | Unsupported/canary only until it enters LTS | Early compatibility signal under `P02-009`; never a release claim yet |
| EOL and odd pre-27 lines | Unsupported | No CI, fixes, or install claim |

The [official Node release table](https://nodejs.org/en/about/previous-releases) lists Node 22 and 24 as LTS and Node 26 as Current on the selection date, and recommends production use of Active or Maintenance LTS. The [official Node 22-to-24 migration guidance](https://nodejs.org/en/blog/migrations/v22-to-v24) records Node 24's LTS transition and support through April 2028.

The lower bounds also satisfy Vite 8's published Node requirement. `.nvmrc` is a convenience pin for the oldest supported line, not the complete support declaration; `package.json` engines and the future CI matrix are authoritative.

Support follows release-line status, not an indefinite major-version promise. When Node 22 reaches EOL, one reviewed change removes it from engines/CI after packages and artifacts prove Node 24. When Node 26 enters LTS, it may be promoted only after clean install, build, unit, browser, and package checks pass.

## Package manager and lockfile

The workspace uses **npm 11.18.0**, selected because it supports both declared Node LTS ranges. npm 12.0.1 is not selected because its engine floor excludes supported Node 22 versions below 22.22.2 and Node 24 versions below 24.15.0.

`package.json` declares npm 11.18.0 in an integrity-pinned Corepack `packageManager` field, exact npm engines/devEngines, `private = true`, and only the internal `@helix-db-internal` development scope. It must never be published, especially not to the occupied public HelixDB coordinates.

Lock rules:

- Commit exactly one root `package-lock.json`, lockfile version 3.
- Commit exact direct development versions; semver ranges are prohibited in the root toolchain.
- Use `npm ci` for CI, evidence, packaging, and clean reproduction. The [npm CI documentation](https://docs.npmjs.com/cli/v11/commands/npm-ci/) states that it requires a matching lockfile, removes an existing install, and never rewrites package or lock files.
- Use `npm install --save-exact` only in a focused dependency-update change, then inspect package/lock diffs and rerun clean installs.
- Do not commit `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, Bun locks, or nested package locks.
- Keep lifecycle-script policy explicit per dependency. A clean install cannot silently download Playwright browsers; browser binaries are installed by a named later command and cached/retained as CI artifacts.
- The initial lock contains two optional `fsevents` install-script entries (one direct in the shared graph and one below Vite). Selection evidence suppresses both scripts and uses non-watch commands; `P02-006`/`P02-012` must explicitly review or allow them before any release workflow enables lifecycle scripts.
- Registry audit is disabled during ordinary deterministic install to avoid network/time-dependent results. `P02-012` owns an explicit, retained vulnerability/provenance report; disabling implicit audit does not waive that gate.

The workspace glob is `packages/*`. `P02-004` creates the package directories and `P02-016` adds the first non-functional browser example.

## Selected JavaScript/TypeScript tools

| Tool | Exact version | Role | Boundary |
| --- | ---: | --- | --- |
| TypeScript | 6.0.3 | Project/reference type checking and configuration contract | No emitted production bundle; strict no-emit base config |
| `@types/node` | 22.20.1 | Lowest-supported Node API type surface for tool configuration | Code cannot assume Node 24-only globals without a guarded profile |
| Vite | 8.1.4 | Browser dev server and production bundler | No framework plugin selected; no bundle claim until `P02-010`/`P02-016` |
| Vitest | 4.1.10 | Unit, property, and JS-side conformance test runner | Empty-run smoke only in P02-003; stable commands/suites land later |
| Playwright Test | 1.61.1 | Browser lifecycle and end-to-end harness | Browser binaries and real smoke tests land under `P02-010`/`P02-016` |

[Vite's official guide](https://vite.dev/guide/) describes its dev server/bundler roles and current Node floor. [Vitest](https://vitest.dev/guide/why.html) shares Vite's transform/config pipeline, avoiding a second incompatible TypeScript transform. [Playwright's browser documentation](https://playwright.dev/docs/browsers) defines its version-coupled browser installation and Chromium, Firefox, and WebKit support.

No UI framework is selected. The browser host begins as standards-based TypeScript, ES modules, WebAssembly, and Web APIs. A future framework requires a task-specific need, bundle/performance/security assessment, exact dependency evidence, and must not redefine database semantics.

## Why TypeScript 6, not TypeScript 7 yet

TypeScript 7.0.2 became the registry `latest` release immediately before this selection. The [TypeScript 7 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) states that 7.0 does not ship a programmatic API and recommends side-by-side TypeScript 6 for tools that need compiler APIs, including lint integrations.

The project therefore pins TypeScript 6.0.3 for the initial workspace so `P02-006` can select lint tooling without two compiler families or npm aliases. TypeScript 7 is reconsidered at 7.1 or when all selected build/lint/editor tools support its API. An upgrade must run the complete type, unit, browser, bundle, config, SDK declaration, and generated-schema checks; “10x faster” is not by itself compatibility evidence.

## TypeScript base configuration

`tsconfig.base.json` is a no-emit, strict, ESM/bundler-resolution baseline with:

- ES2022 plus browser DOM libraries;
- exact optional properties and unchecked indexed-access protection;
- isolated modules, verbatim module syntax, and side-effect import checking;
- case-consistent paths and full library checking; and
- no ambient `@types` packages unless a child project opts in explicitly.

The root `tsconfig.json` is an empty build-graph anchor. Package-specific configs added later extend the base, list explicit sources/types, and become project references. Vite transforms browser TypeScript, while `tsc --build` remains the type authority; transpilation success is never a substitute for type checking.

## Browser harness matrix

Playwright is selected for Chromium, Firefox, and WebKit. `P02-003` installs only the harness package and lists its empty suite; it does not download hundreds of megabytes of mutable browser binaries during npm install.

`P02-010` will pin/install the Playwright-coupled browser revisions, validate a real Vite/Wasm bundle, and retain reports. `P02-009` will define which browser/OS combinations gate every change versus nightly coverage. Branded Chrome/Edge and Safari are separate profiles; bundled Chromium/WebKit must not be mislabeled as those branded products.

## Browser build profile added by P02-005

The shared [`vite.config.ts`](../../vite.config.ts) establishes a framework-free production build boundary with a relative base, custom application type, explicit `HELIX_PUBLIC_` environment prefix, ES2022 transform target, external assets, hidden source maps, Oxc minification, and `dist/browser` output. The [build-profile policy](build-profiles.md) records why each option is selected.

No input entry is configured yet. Resolving the configuration is a build-profile check, while emitting and executing a real bundle remains blocked on `P02-010` and `P02-016`. ES2022 is a deterministic emitted-language target, not a branded-browser/version support claim.

## Required selection checks

```bash
corepack npm --version
corepack npm ci --ignore-scripts
corepack npm exec -- tsc --version
corepack npm exec -- vite --version
corepack npm exec -- vitest --version
corepack npm exec -- playwright --version
corepack npm run toolchain:types
corepack npm run toolchain:test-runner
corepack npm run toolchain:browser-harness
```

The evidence replays these commands on Node 22.23.1 and Node 24.18.0, checks a byte-identical lockfile before/after `npm ci`, rejects alternate lockfiles, verifies exact resolved direct/transitive versions and integrity fields, and confirms that no Playwright browser cache is created inside the repository.

## Upgrade procedure

One focused toolchain update must:

1. verify the Node line is LTS and supported by every selected tool;
2. read primary release/migration/security notes;
3. change exact direct versions and regenerate the root lock with the pinned npm only;
4. inspect added/removed packages, install scripts, licenses, engines, and integrity records;
5. run clean installs plus type/unit/browser/bundle checks on every supported Node line;
6. reinstall Playwright browser revisions and retain updated browser evidence when its version changes;
7. update `.nvmrc`, engines/devEngines, policy, CI, clean-bootstrap docs, and evidence together when the Node window changes; and
8. preserve prior lock/evidence commits for release reproduction.

No dependency update may silently widen package publication, Node/browser support, network access, or lifecycle scripts.

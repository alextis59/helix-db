# JavaScript and TypeScript Toolchain Policy

- Status: Accepted toolchain baseline
- Last updated: 2026-07-11
- Owner: Runtime architecture owner
- Plan items: `P02-003`, reporting extended by `P02-012`, browser boundary example added by `P02-016`, clean-host procedure bound by `P02-017`
- Governing requirements: `PLAT-001`, `PLAT-002`, `CORE-003`, `INV-007`
- Governing gate: `G02`
- Development identity: [ADR 0001](../adr/0001-public-product-identity.md)
- Rust counterpart: [Rust toolchain policy](rust-toolchain-policy.md)

This policy selects the private JavaScript/TypeScript workspace manager, lockfile behavior, supported Node.js lines, compiler, bundler, unit/conformance runner, and real-browser harness. The selection itself creates no database feature or product SDK; `P02-016` uses it only for an explicitly non-functional boundary example.

## Node.js support window

The supported development/CI lines are:

| Node line | Repository range | Role |
| --- | --- | --- |
| Node 22 LTS | `>=22.12.0 <23` | Oldest supported line and default `.nvmrc` development baseline (`22.23.1`) |
| Node 24 LTS | `>=24.11.0 <25` | Newest supported LTS line and required CI lane |
| Node 26 Current | Unsupported until it enters LTS | No CI, fixes, or install claim; reconsider only through the promotion procedure below |
| EOL and odd pre-27 lines | Unsupported | No CI, fixes, or install claim |

The [official Node release table](https://nodejs.org/en/about/previous-releases) lists Node 22 and 24 as LTS and Node 26 as Current on the selection date, and recommends production use of Active or Maintenance LTS. The [official Node 22-to-24 migration guidance](https://nodejs.org/en/blog/migrations/v22-to-v24) records Node 24's LTS transition and support through April 2028.

The lower bounds also satisfy Vite 8's published Node requirement. `.nvmrc` is a convenience pin for the oldest supported line, not the complete support declaration; `package.json` engines and the [committed CI matrix](continuous-integration.md) are authoritative.

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
- The lock contains two optional `fsevents` install-script entries (one direct in the shared graph and one below Vite). Selection evidence suppresses both scripts and uses non-watch commands; `P02-006` inventories/denies them and `P02-012` revalidates their exact duplicate paths, licenses, signatures when selected, and non-shipment boundary through `P16-010`.
- Registry audit is disabled during ordinary deterministic install to avoid network/time-dependent results. `P02-012` adds an explicit dated vulnerability and signature/provenance observation after the clean install; disabling implicit audit does not waive that CI gate.

The workspace glob is `packages/*`. `P02-004` creates the package directories; `P02-016` adds the first non-functional browser example outside that publishable workspace boundary.

## Selected JavaScript/TypeScript tools

| Tool | Exact version | Role | Boundary |
| --- | ---: | --- | --- |
| TypeScript | 6.0.3 | Project/reference type checking and configuration contract | No emitted production bundle; strict no-emit base config |
| `@types/node` | 22.20.1 | Lowest-supported Node API type surface for tool configuration | Code cannot assume Node 24-only globals without a guarded profile |
| Vite | 8.1.4 | Browser dev server and production bundler | No framework plugin selected; P02-016 boundary example only, no product bundle claim until later gates |
| Vitest | 4.1.10 | Unit, property, and JS-side conformance test runner | P02-007 stable unit inventory; currently no JavaScript unit files |
| Playwright Test | 1.61.1 | Browser lifecycle and end-to-end harness | P02-016 runs the boundary example in three engines; P11 expands to product-host behavior |

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

The root `tsconfig.json` is the build-graph anchor and currently references the browser-example/test type boundary. Package-specific configs added later extend the base, list explicit sources/types, and become project references. Vite transforms browser TypeScript, while `tsc --build` remains the type authority; transpilation success is never a substitute for type checking.

`vitest.config.ts` fixes JavaScript unit discovery at the repository root and excludes the Playwright browser tree, generated/evidence output, and dependencies. This prevents the dedicated Vite example root from silently redirecting unit discovery or causing Playwright specs to execute under Vitest.

## Browser harness matrix

Playwright is selected for Chromium, Firefox, and WebKit. `P02-003` installs only the harness package and lists its empty suite; it does not download hundreds of megabytes of mutable browser binaries during npm install.

The [CI matrix](continuous-integration.md) gives Chromium, Firefox, and WebKit separate gating boundary-example jobs on Linux x64 and records broader native architectures as gating or nightly. The [P02-010/P02-016 contract](wasm-browser-smoke-validation.md) installs only the Playwright-coupled selected engine, validates the real Vite/Wasm example, and executes it with one worker. Branded Chrome/Edge and Safari are separate profiles; bundled Chromium/WebKit must not be mislabeled as those branded products.

## Browser build profile added by P02-005

The shared [`vite.config.ts`](../../vite.config.ts) establishes a framework-free production build boundary with a relative base, custom application type, explicit `HELIX_PUBLIC_` environment prefix, ES2022 transform target, external assets, hidden source maps, Oxc minification, and `dist/browser` output. The [build-profile policy](build-profiles.md) records why each option is selected.

The fixed [`examples/browser-toolchain`](../../examples/browser-toolchain/README.md) root is an executable boundary example. Vite emits it to `dist/browser`, a deterministic checker validates the exact four-file output and source identities, and Playwright serves only that output on fixed loopback. Its visible page and structured report state that database functionality is absent. ES2022 is a deterministic emitted-language target, not a branded-browser/version support claim.

## Required selection checks

The executable [clean-machine bootstrap guide](../development/bootstrap.md) owns prerequisite,
install, shell, profile, output, and troubleshooting order. This policy remains authoritative for
the Node/npm/tool selections consumed by that procedure.

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
corepack npm run dependencies:check
corepack npm run dependencies:report
corepack npm run examples:check
corepack npm run browser:build
corepack npm run browser:smoke
```

The evidence replays deterministic commands on Node 22.23.1 and Node 24.18.0, checks a byte-identical lockfile before/after `npm ci`, rejects alternate lockfiles, verifies exact resolved direct/transitive versions and integrity fields, and confirms that no Playwright browser cache is created inside the repository. The Node 22 lane additionally obtains one fresh live advisory/signature/provenance observation; it is not duplicated merely to make both Node jobs query the registry.

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

Formatting, lint rules, lifecycle-script denial, locked registry/integrity/license screening, and reviewed dependency exceptions are defined separately in the [code quality and dependency policy](code-quality-and-dependency-policy.md).

# P02-003 JavaScript/TypeScript Toolchain Evidence

- Task: `P02-003` — select the JavaScript/TypeScript package manager, lockfile policy, Node.js support window, bundler, test runner, and browser harness
- Requirements: `PLAT-001`, `PLAT-002`, `CORE-003`, `INV-007`
- Accepted decision: [ADR 0001](../../../docs/adr/0001-public-product-identity.md)
- Commit under test: `f6a0aeb4c1aff07d68d66416bcb6ce2d897e767e`
- Recorded at: `2026-07-10T23:26:08Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Verdict: Pass

## Selection

The private `@helix-db-internal/workspace` uses integrity-pinned npm 11.18.0 with one committed lockfile-v3 root graph. It supports the Node 22 and Node 24 LTS lines, defaults local development to Node 22.23.1, and excludes Node 26 until it becomes LTS and passes the later CI matrix.

The exact initial tool set is:

- TypeScript 6.0.3 with a strict no-emit base and empty root build graph;
- Node 22.20.1 type declarations, keeping tool code on the oldest supported Node API family;
- Vite 8.1.4 as browser dev server/bundler;
- Vitest 4.1.10 as JS unit/conformance runner; and
- Playwright Test 1.61.1 as the Chromium/Firefox/WebKit lifecycle harness.

The rationale, support/update rules, TypeScript 7 deferral, lock policy, lifecycle-script boundary, and future browser-install ownership are in the accepted [JavaScript and TypeScript Toolchain Policy](../../../docs/architecture/javascript-toolchain-policy.md).

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
Node lane 1: 22.23.1 (bundled npm 10.9.8; Corepack 0.34.6)
Node lane 2: 24.18.0 (bundled npm 11.16.0; Corepack 0.35.0)
selected package manager: npm 11.18.0 via packageManager integrity pin
registry: https://registry.npmjs.org/
Playwright browser download: disabled
```

NVM supplied the two official Node binaries in this evidence environment. `.nvmrc` is not the sole support policy; package engines/devEngines and future CI lanes remain authoritative.

## Commands

```bash
git diff --check f6a0aeb4c1aff07d68d66416bcb6ce2d897e767e^ f6a0aeb4c1aff07d68d66416bcb6ce2d897e767e
corepack npm --version
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 corepack npm ci --ignore-scripts
corepack npm exec -- tsc --version
corepack npm exec -- vite --version
corepack npm exec -- vitest --version
corepack npm exec -- playwright --version
corepack npm run toolchain:types
corepack npm run toolchain:test-runner
corepack npm run toolchain:browser-harness
corepack npm ls --all --json
# Repeat install and smoke commands through nvm exec for 22.23.1 and 24.18.0.
node evidence/phase-02/P02-003/verify.mjs f6a0aeb4c1aff07d68d66416bcb6ce2d897e767e
```

## Results

- Exact artifact commit scope: 11 files; no unrelated change.
- Package boundary: private internal name/version, no publication coordinate.
- Package manager: npm 11.18.0 with Corepack SHA-512 identity.
- Lock: version 3, 83 total entries, 82 canonical npm-registry URLs and SHA-512 integrity records.
- Direct tools: five exact requested and resolved versions/integrities.
- Lifecycle scripts: exactly two optional Darwin-only `fsevents` entries; both suppressed in evidence installs.
- Lock determinism: byte-identical before/after clean installs on Node 22.23.1 and 24.18.0.
- Dependency graph: `npm ls --all` reports zero problems on both Node lines.
- TypeScript: exact version and empty project build pass on both Node lines.
- Vitest: exact version and explicit no-tests selection smoke pass on both Node lines.
- Playwright: exact version and explicit empty-suite list pass on both Node lines without browser download.
- Vite: exact version resolves on both Node lines; no bundle is claimed.
- Lock hygiene: one root `package-lock.json`; zero npm shrinkwrap/Yarn/pnpm/Bun/nested locks.
- Repository browser cache: zero Playwright browser artifacts.
- Documentation at source commit: 93 Markdown files and 731 resolving local links.
- Declared-check failures/skips: zero.

## Review and limitations

Focused review checked LTS status/ranges, npm-major compatibility, Corepack integrity, root/nested lock policy, exact direct and transitive integrity, lifecycle scripts, private naming, strict TypeScript base settings, TypeScript 7 API limitations, shared Vite/Vitest transformation, Playwright browser scope, Node 22/24 clean install behavior, and claim language. No blocking P02-003 finding remains.

This selection evidence intentionally contains zero real tests and zero real bundles. It does not prove:

- package directory boundaries (`P02-004`);
- stable test command taxonomy (`P02-007`);
- browser binary installation, Vite build, Wasm loading, or real browser execution (`P02-010`, `P02-016`);
- CI coverage on supported Node/browser/OS lanes (`P02-009`);
- dependency vulnerability, provenance, license, lifecycle-script, or duplicate-version acceptance (`P02-012`); or
- public npm/package coordinates, which remain blocked by `P16-016`.

Machine-readable commands, counts, exact artifact identities, and verifier identity are in [manifest.json](manifest.json).

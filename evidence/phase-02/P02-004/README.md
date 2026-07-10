# P02-004 Repository Layout Evidence

- Task: `P02-004` — create directories for crates, shaders, packages, conformance fixtures, benchmarks, tests, documentation, examples, and release evidence
- Requirements supported: `INV-001`, `INV-006`, `INV-007`, `CORE-003`, `QUAL-001`
- Commit under test: `78bf994e223e5c23b0bd7770afcb476f307686a6`
- Recorded at: `2026-07-10T23:37:47Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Verdict: Pass

## Scope

This step makes every repository area required by `P02-004` durable in Git and assigns a documented purpose, ownership boundary, artifact rule, and honest maturity statement. Git does not track empty directories, so each reserved area contains a small `README.md` rather than an ambiguous placeholder.

The accepted layout is documented in [Repository Layout and Artifact Boundaries](../../../docs/architecture/repository-layout.md). It preserves the Study's proposed crate, shader, package, conformance, benchmark, and test separation while retaining already-authoritative Phase 1 assets at their existing `fixtures/`, `reference/`, `differential/`, and `compatibility/` paths.

## Created or formalized boundaries

| Area | Tracked contract | Verification boundary |
| --- | ---: | --- |
| Rust workspace | `crates/README.md` plus eight existing crate directories | Exactly eight unpublished workspace packages remain discoverable and tested |
| Internal shaders | Root plus predicate, bitmap, and vector READMEs | No WGSL or other shader implementation is present; arbitrary client WGSL remains prohibited |
| npm packages | Root plus SDK and browser-host READMEs | No child `package.json`; npm discovers zero publishable/workspace packages |
| Conformance | Root plus semantic, format, host, and compatibility READMEs | Existing semantic corpus is linked, not copied |
| Benchmarks | Root plus dataset, CPU/columnar, WebGPU, and report READMEs | No dataset/result/performance claim exists |
| Cross-component tests | Root plus crash, differential, browser, and distributed READMEs | No system-test coverage claim exists |
| Documentation | Existing `docs/` guide plus the repository-layout document | All source-commit local links resolve |
| Examples | Root README | No executable or database-functionality example exists |
| Release evidence | `evidence/releases/README.md` | No release candidate or release artifact exists |

Explicit CODEOWNERS entries cover every new implementation root. Generated Rust/JavaScript/browser/test outputs remain ignored, and task/phase evidence stays separate from release evidence.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
Node.js: v22.19.0
Corepack: 0.34.0
npm through Corepack: 11.18.0
rustc: 1.96.1 (31fca3adb 2026-06-26)
cargo: 1.96.1 (356927216 2026-06-26)
```

The verifier reconstructs the exact source commit in a temporary directory. Cargo replay is frozen/offline; npm uses the committed lock with lifecycle scripts suppressed and performs no browser download.

## Commands

```bash
git diff --check 78bf994e223e5c23b0bd7770afcb476f307686a6^ 78bf994e223e5c23b0bd7770afcb476f307686a6
corepack npm ci --ignore-scripts
corepack npm query .workspace --json
corepack npm run toolchain:types
CARGO_NET_OFFLINE=true cargo metadata --frozen --format-version 1 --no-deps
CARGO_NET_OFFLINE=true cargo test --frozen --workspace --all-features
node evidence/phase-02/P02-004/verify.mjs 78bf994e223e5c23b0bd7770afcb476f307686a6
```

## Results

- Exact source-commit scope: 29 files, all immutable-hashed in [manifest.json](manifest.json).
- Required top-level boundaries: nine of nine present.
- Tracked boundary contracts: 25 READMEs across the required implementation/evidence roots.
- Reserved child boundaries: 17 across shader, package, conformance, benchmark, and system-test areas.
- npm discovery: zero child workspaces/packages; clean lockfile install and root TypeScript build pass.
- Rust discovery: eight workspace packages; all-feature frozen/offline test pass with nine unit tests.
- Shader implementation inventory: zero non-README files.
- Release artifact inventory: zero files beyond the release-evidence contract.
- Repository documentation at source commit: 120 Markdown files and 765 resolving local links.
- Generated-output check: no tracked `target`, `node_modules`, bundle, browser-report/cache, coverage, or TypeScript-build artifacts.

## Review and limitations

Focused review checked the Study layout, ownership, authoritative-versus-derived boundaries, conformance corpus reuse, publication risk, shader trust boundary, generated output, release evidence separation, link integrity, and false maturity claims. No blocking P02-004 finding remains.

This task does not configure build profiles, lint/dependency/license policy, stable test commands, CI, browser binaries, shader validation, coverage, benchmarks, retention automation, examples, or clean-machine bootstrap. Those obligations remain open in `P02-005` through `P02-017`. A directory contract is not evidence that its future subsystem works.

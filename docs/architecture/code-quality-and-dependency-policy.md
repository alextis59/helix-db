# Code Quality, Unsafe Review, and Dependency Policy

- Status: Accepted and executable bootstrap policy with dependency security reporting
- Last updated: 2026-07-11
- Owner: Runtime architecture owner with security and release review
- Plan items: `P02-006`, extended by `P02-012` and `P03-008`
- Governing requirements: `INV-003`, `INV-004`, `INV-006`, `INV-007`, `CORE-001`, `CORE-003`, `SEC-001`, `SEC-002`, `QUAL-001`
- Governing gate: `G02`
- Machine dependency policy: [`helix.dependency-policy/1`](../../tests/toolchain/dependency-policy.json)
- Dependency report policy: [`helix.dependency-report-policy/1`](../../tests/toolchain/dependency-report-policy.json)
- License inventory: [Third-party notices](../../THIRD_PARTY_NOTICES.md)

This policy makes formatting, compiler warnings, lints, unsafe-code review, dependency sources, lock integrity, license screening, lifecycle scripts, duplicate versions, explicit advisory checks, registry signatures, and provenance reporting executable before feature code accumulates. Passing these checks does not replace security analysis or release artifact review.

## Rust policy

Every workspace crate declares `[lints] workspace = true` and inherits the root policy. The [Cargo workspace lint contract](https://doc.rust-lang.org/cargo/reference/workspaces.html#the-lints-table) defines this inheritance.

The baseline is:

- all rustc warnings, future-incompatible lints, and Rust 2024 compatibility lints are errors;
- missing documentation and unreachable public items are errors;
- `unsafe_code` is forbidden;
- Clippy `all` and `pedantic` groups are errors;
- `unwrap`, `expect`, explicit panic, unfinished placeholders, debug macros, and stdout/stderr printing are denied; and
- an allow attribute without a written reason is denied.

The [Clippy usage guide](https://doc.rust-lang.org/stable/clippy/usage.html) documents `-D warnings`, the production-ready but opinionated `pedantic` group, and why restriction lints are selected individually rather than enabled as one contradictory group. Project commands still pass `-D warnings` explicitly as defense in depth.

Required checks are read-only:

```bash
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS="-D warnings" cargo doc --frozen --workspace --no-deps --all-features
```

### Unsafe exception workflow

All tracked or untracked first-party candidate `.rs` files must contain zero `unsafe` tokens, all workspace crates inherit `unsafe_code = "forbid"`, and first-party build scripts are absent. The exact external graph records the `blake3` and target-conditioned `libc` build-script presence instead of pretending it is first-party code. The machine checker scans candidate sources as well as compiling tracked crates, so an unreferenced Rust file cannot silently bypass the inventory.

A future need for unsafe code is a reviewed architecture/security change, not a local lint suppression. The change must:

1. explain why a safe implementation or reviewed dependency cannot satisfy the requirement;
2. bound the smallest module/function and state every caller/callee safety invariant;
3. add `// SAFETY:` reasoning at each block and targeted invalid-input/concurrency/fuzz tests;
4. record owner, reviewers, affected targets, Miri/sanitizer/fuzz plan, and rollback;
5. replace the workspace-wide forbid only with the narrowest enforceable lint exception; and
6. update `unsafe_exceptions`, threat model, CODEOWNERS, evidence, and this policy together.

An exception cannot be approved solely for benchmark performance. GPU/FFI/memory-mapping code remains outside the deterministic semantic authority and must preserve CPU correctness/fallback.

## JavaScript, TypeScript, and JSON policy

The project pins Biome 2.5.3 as an exact development dependency, following its [official exact-install guidance](https://biomejs.dev/guides/getting-started/). [`biome.json`](../../biome.json) enables formatting and the recommended linter preset, elevates diagnostics to failure, requires `node:` built-in imports, and rejects explicit TypeScript `any`. TypeScript strict checking remains a separate required authority.

```bash
corepack npm run policy:javascript
corepack npm run toolchain:types
```

The formatter uses LF, two spaces, 100 columns, single-quoted JavaScript, required semicolons, and trailing commas. CI/evidence uses check mode only; intentional formatting is a reviewed source change.

Biome covers active authored JavaScript/TypeScript and root JSON configuration. Exclusions are explicit:

- `evidence/` is immutable historical proof whose verifier hashes must not be rewritten by a new formatter;
- `package-lock.json` is npm-generated and is validated structurally/integrity-wise instead of reformatted;
- normative/generated fixture, report, and matrix JSON is owned byte-for-byte by its generator/schema checks; and
- ignored dependency, target, bundle, and report output is force-excluded.

The JavaScript generators/checkers themselves remain linted. Excluding generated data does not exclude the code that creates or validates it. Biome's [configuration reference](https://biomejs.dev/reference/configuration/) defines ordered include/negation and force-ignore behavior.

## Dependency and source policy

[`check-dependency-policy.mjs`](../../tests/toolchain/check-dependency-policy.mjs) reconciles the complete npm lock, root package, Cargo metadata, tracked Rust files, build scripts, license file, notices, and machine policy without querying mutable network state.

For npm it requires:

- a private root with zero production/optional dependencies and exact direct development versions;
- lockfile version 3, only `https://registry.npmjs.org/` tarballs, and SHA-512 integrity for every package;
- every transitive entry marked development-only with declared license metadata;
- six generally allowed permissive SPDX forms;
- one exact build-only MPL-2.0 `lightningcss` family exception, with count/scope/owner/revalidation task;
- exactly two reviewed optional `fsevents` lifecycle scripts, both explicitly denied by `allowScripts` and deterministic `--ignore-scripts` installs; and
- exactly one reviewed duplicate-version family (`fsevents` 2.3.2/2.3.3).

The [npm lock documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/) defines the committed exact-tree role. The [npm CI documentation](https://docs.npmjs.com/cli/v11/commands/npm-ci/) defines frozen installs and script controls. `.npmrc` enables strict script review, while `package.json` denies `fsevents`; a newly introduced script fails policy until reviewed.

For Rust it requires exactly eight unpublished MIT workspace paths and the 13 exact crates.io packages reached by `blake3 = 1.8.5`, `crc = 3.4.0`, and `lz4_flex = 0.13.1`. Every external version, checksum, license, selected feature, direct purpose, build script, and one of 26 source license files is deny-by-default policy data. Git sources, default-feature drift, extra packages, missing license text, local build scripts, and first-party unsafe tokens fail. Exact `cargo-audit 0.22.2`, built from its verified source archive and repository-owned reviewed lock, scans the workspace and its own tool graph with a fresh non-stale RustSec database and no exceptions.

Downloaded development executables are not smuggled into npm/Cargo product graphs. The P02-010 component validator has a separate machine authority that pins its official release URL, host, archive inventory, byte counts, archive/executable SHA-256 values, license forms/files, and exact version output. The P03-008 RustSec scanner similarly lives only under ignored `target/toolchain`, but is built from verified source using a full reviewed lock whose graph is self-audited on every live observation. Neither enters product artifacts.

## License boundary

The machine check validates SPDX metadata and the [notice inventory](../../THIRD_PARTY_NOTICES.md). The twelve MPL-2.0 entries are build-only Vite tooling and are not permitted in runtime/package contents without explicit revalidation. The complete npm tarball refresh verifies 73 root license/notice files and records 26 reviewed missing-text omissions instead of treating metadata as text.

The [dependency security reporting contract](dependency-security-reporting.md) defines the deterministic inventory, full tarball license refresh, dated npm advisory result, registry signatures, SLSA attestations, duplicates, and non-npm tool limitations. `P02-016` binds the real browser example sources and bundle output to its retained diagnostics; release tasks must additionally inspect and reconcile every shipped package. A clean policy check cannot be cited as an SBOM, continuing vulnerability-free claim, legal opinion, or production release approval.

## Suppressions and changes

Warnings are fixed or narrowly suppressed with a nearby reason; blanket file/crate/repository disables are prohibited. A suppression records the false-positive rationale, safe invariant, owner, and removal condition. Generated/foreign code uses a separate reviewed boundary rather than weakening first-party rules.

Tool/rule/profile upgrades are focused changes that inspect new diagnostics and dependency/license/lifecycle deltas, run all affected checks on both Node lines and pinned Rust targets, and update policy/evidence together. Reducing severity, broadening exclusions, allowing a source/license/script, or adding unsafe code is a material policy change and cannot be hidden in an unrelated feature commit.

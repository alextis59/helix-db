# P02-012 Dependency Vulnerability, Provenance, License, and Duplicate Evidence

- Task: `P02-012` — configure dependency vulnerability, provenance, license, and
  duplicate-version reporting
- Requirements supported: `INV-007`, `QUAL-001`, `SEC-001`
- Commit under test: `549025951e992ff6e93734eed661709766511ca0`
- Recorded at: `2026-07-11T02:59:56Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Accepted ADRs: none
- Verdict: Pass

## Scope and result

The source commit establishes a fail-closed dependency observation system around the already
locked development toolchain:

- [`helix.dependency-report-policy/1`](../../../tests/toolchain/dependency-report-policy.json)
  fixes the npm version and registry, zero-vulnerability thresholds, signature and provenance
  requirements, license-download resource limits, reviewed exceptions, Rust boundary, external
  tool disclosures, and report schemas;
- the deterministic offline inventory binds all 91 npm lock entries to public-registry URLs,
  SHA-512 integrity, declared licenses, exact root license/notice text, reviewed lifecycle scripts,
  and duplicate-version policy;
- the live observation uses npm 11.18.0 to submit the lock to the registry advisory endpoint and
  verify signatures plus SLSA provenance attestations for the installed Linux tree;
- the independent license refresh downloads all 91 exact tarballs, denies redirects, enforces
  per-file and aggregate bounds, verifies lockfile SHA-512 SRI, safely parses archives, and
  reproduces the committed license authority; and
- the pinned external wasm-tools archive now binds three license texts by path, SPDX expression,
  byte count, and SHA-256, while Playwright browser revisions remain explicitly disclosed as
  package-coupled external tools.

No npm or Cargo dependency changed. All 91 npm packages remain development-only and Cargo still
contains only the eight HelixDB workspace crates.

## Retained observations

The evidence directory retains five hash-bound report files:

| Artifact | Result |
| --- | --- |
| [`inventory-report.json`](reports/inventory-report.json) | 91 locked packages, 52 installed Linux packages, 73 license files, one duplicate family, two denied lifecycle scripts |
| [`npm-audit.json`](reports/npm-audit.json) | npm audit schema 2, 91 total dependencies, zero advisories at every severity |
| [`npm-license-refresh.json`](reports/npm-license-refresh.json) | 91 SHA-512-verified tarballs, 339,376,667 bytes, 65 packages with 73 texts, 26 reviewed omissions |
| [`npm-signatures.json.gz.b64`](reports/npm-signatures.json.gz.b64) | exact raw npm signature/provenance response, gzip-compressed and base64-wrapped |
| [`observation-report.json`](reports/observation-report.json) | 52/52 registry signatures verified, zero invalid or missing, 27 SLSA provenance subjects |

The signature wrapper is 199,795 bytes with SHA-256
`aaf45b7053516abd337bda878b7e3d9369bac0472ee222df57fb926cdb94a218`. Decoding yields a
147,900-byte gzip member with SHA-256
`9e31fb56fed5a1d8443985c08012d3358cfb8cf79008e7db14073a45e79971cb`; decompression yields
the exact 477,675-byte npm JSON response with SHA-256
`22d24606cf621894f5702999b2684f3972c7d5eb5592ee768b441209025c405d`. The verifier checks
all three boundaries and recomputes every compact attestation-bundle digest from the raw response.

## Policy decisions

The baseline intentionally distinguishes four cases:

1. Registry vulnerability and signature results apply to the npm dependency tree, not to every
   external binary used by CI.
2. Rust advisory status is `not-applicable-no-external-packages`, because no external crate exists
   and no scanner was falsely claimed to have run. The first external crate fails the report until
   an advisory scanner is configured.
3. Twenty-six platform/tool packages declare licenses but omit root license text in their exact
   tarballs. Five narrowly matched exception families record counts, rationales, and a `P16-010`
   revalidation deadline; none is eligible for a release artifact without reconciliation.
4. Playwright browser revisions and wasm-tools are external downloaded tools. Their exact coverage
   and limitations are visible instead of being represented as npm or Cargo audit findings.

The duplicate report records `fsevents` 2.3.2 at the root and 2.3.3 beneath Vite. Both are optional,
development-only, lifecycle-suppressed, and due for revalidation at `P16-010`.

## Independent clean replay

The committed [verifier](verify.mjs) resolves the exact source commit, requires its exact 23-file
scope, and verifies every byte count and digest in the [evidence manifest](manifest.json). It
decodes the retained signature response and cross-checks audit, observation, inventory, license,
lock, policy, provenance-subject, registry, external-tool, and requirement-ledger bindings.

It then extracts the source commit into a temporary repository and performs:

- independent YAML parsing of eight jobs and 41 workflow steps;
- clean lifecycle-suppressed installs under Node 22.23.1 and 24.18.0, both with npm 11.18.0;
- deterministic dependency inventory and CI-contract replay on both Node lines;
- JavaScript formatting/linting, dependency policy, TypeScript, fixtures, and the aggregate test
  command on Node 22;
- a fresh live registry advisory, registry-signature, and SLSA-provenance observation;
- a fresh 91-tarball license download whose report must reproduce the retained report byte for
  byte;
- a clean wasm-tools install that verifies the executable and all three extracted license files;
  and
- native formatting, frozen all-target check, all-feature Clippy, and all-feature tests.

The broader source gate also passed rustdoc with warnings denied, both portable-target Clippy
builds, sanitizer tests, both Wasm artifact forms, Chromium/Firefox/WebKit smoke, and the four
trusted WGSL fixtures.

## Negative verification

The clean verifier applies fourteen mutations and requires every one to fail:

1. roll a reviewed exception deadline back from `P16-010`;
2. weaken the zero-vulnerability threshold;
3. break the license authority's package-lock digest;
4. break an installed license-text digest;
5. remove an allowed duplicate version;
6. remove a missing-license exception family;
7. corrupt an extracted wasm-tools license;
8. replace the Node 22 live CI observation with the offline report;
9. redirect a lock entry away from the public npm registry;
10. replace a lock entry's SHA-512 SRI;
11. inject a high-severity live audit finding;
12. inject a missing registry signature;
13. change the configured live registry; and
14. remove the required `@biomejs/biome` provenance subject.

The four live failure cases use the retained raw npm responses behind a local command shim, so they
exercise the production parser and policy without fabricating network state. Every mutation is
restored, the real inventory and wasm-tools checks are rerun, and the temporary source repository
must finish clean.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
rustc: 1.96.1 (31fca3adb 2026-06-26)
cargo: 1.96.1 (356927216 2026-06-26)
active Node.js: v22.19.0
supported Node replay: 22.23.1, 24.18.0
Corepack: 0.34.0
npm through Corepack: 11.18.0
registry: https://registry.npmjs.org/
Playwright: 1.61.1
Chromium: 149.0.7827.55 / Playwright revision 1228
```

## Reproduction commands

```bash
corepack npm ci --ignore-scripts
corepack npm run dependencies:check
corepack npm run dependencies:report
corepack npm run dependencies:licenses
corepack npm run ci:check
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run toolchain:types
corepack npm run fixtures:check
corepack npm test
corepack npm run wasm:install-validator
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
node evidence/phase-02/P02-012/verify.mjs 549025951e992ff6e93734eed661709766511ca0
```

## Retained diagnostic attempts

1. The first signature query omitted `--include-attestations`. It could verify registry signatures
   but did not retain the complete Sigstore bundles needed to audit the provenance proof material.
   The final command includes and preserves those bundles.
2. The raw signature response was 477,675 bytes. Keeping it as pretty-printed evidence would make
   review needlessly unwieldy, so its exact bytes are gzip-compressed and base64-wrapped with
   digests at all three representation boundaries.
3. The npm lock contains 91 package paths, while the Linux install contains 52. The difference is
   39 optional packages for other platforms, not missing verification. The inventory covers all
   lock entries and the live signature policy covers every installed registry package.
4. Reporting zero Rust advisories would imply a scanner result. The accurate status is not
   applicable because there is no external Cargo dependency; the reporter fails closed on the
   first one.

## Limitations

This is a time-stamped dependency baseline, not a permanent claim that future registry state is
clean. The live report is refreshed in the Node 22 CI lane and has a 24-hour freshness contract;
the retained observation records what was verified at its timestamp.

The npm audit does not cover browser executables, the wasm-tools binary's transitive build graph,
operating-system packages, GitHub Actions implementations, or future product dependencies.
Playwright exposes exact package-coupled browser revisions but no standalone repository digest.
Wasm-tools has an exact release/archive/executable/license authority but no binary-transitive
advisory feed. These limitations and their `P02-015` or `P16-010` revalidation deadlines remain
explicit.

The local branch is not pushed, so the edited workflow has not run on GitHub-hosted
infrastructure. CI artifact retention remains `P02-015`, release content reconciliation remains
`P16-010`, and independent gate acceptance remains required before `G02` can close.

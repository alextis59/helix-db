# Dependency Vulnerability, Provenance, License, and Duplicate Reporting

- Status: Accepted foundation reporting policy; not a production SBOM or legal opinion
- Last updated: 2026-07-11
- Owner: Release owner with security review
- Plan item: `P02-012`
- Governing gate: `G02`
- Report policy: [`helix.dependency-report-policy/1`](../../tests/toolchain/dependency-report-policy.json)
- npm license authority: [`helix.npm-license-inventory/1`](../../.github/ci/npm-license-inventory.json)
- Lock/source policy: [`helix.dependency-policy/1`](../../tests/toolchain/dependency-policy.json)
- Report entry point: [`check-dependency-reports.mjs`](../../tests/toolchain/check-dependency-reports.mjs)

## Purpose and evidence classes

Dependency security has two different time models and therefore two different report classes:

1. `helix.dependency-inventory-report/1` is deterministic. It binds the exact Cargo/npm locks,
   source/integrity/license policies, complete npm tarball license authority, duplicate paths,
   lifecycle scripts, downloaded-tool authority, and Playwright-coupled browser revisions. It can
   run without network access or an installed npm tree.
2. `helix.dependency-observation-report/1` is dated and network-derived. It records a fresh npm
   advisory response plus registry-signature and Sigstore/SLSA provenance verification for the
   installed platform selection. It is valid as a current observation for at most 24 hours and is
   historical evidence after that point, not a continuing “vulnerability free” claim.

This split keeps ordinary clean installs frozen while ensuring that mutable advisory and signing
state is checked deliberately. npm's [lockfile documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/)
defines the committed exact dependency tree. npm's [audit documentation](https://docs.npmjs.com/cli/v11/commands/npm-audit/)
defines advisory submission, exit behavior, registry signatures, and provenance-attestation
verification.

The reports cover the current development toolchain. They are not a production SBOM, shipped-file
inventory, vulnerability warranty, legal conclusion, or permission to redistribute browsers or
build tools. `P16-010`, `P16-015`, and `P24-013` through `P24-015` own real release contents, SBOM,
signatures, provenance, notices, and final vulnerability review.

## Deterministic inventory

`npm run dependencies:check` validates and reports all 91 locked npm entries:

- every entry is development-only, exactly versioned, sourced from the public npm registry, and
  protected by SHA-512 Subresource Integrity;
- the seven declared SPDX forms reconcile exactly with the lock and third-party notice counts;
- the complete tarball-derived license/notice authority matches the package-lock digest and package
  order;
- 73 root license, notice, or third-party-notice files across 65 packages have exact path, size, and
  SHA-256 identity;
- 26 tarballs without a root license text match exactly five reviewed development-only exception
  families with counts, reasons, and a `P16-010` revalidation deadline;
- the two optional `fsevents` lifecycle scripts remain denied and separately visible; and
- the only duplicate name is `fsevents`, with exact 2.3.2 and nested 2.3.3 paths.

If `node_modules` exists, the checker also requires every selected installed package identity and
root license/notice file to match its integrity-verified tarball record. If the tree is absent, as
in the first CI contract job, lock/authority validation still runs and the report explicitly marks
the installed tree absent. A partially corrupted or substituted installed license file fails.

Cargo metadata must contain exactly the eight MIT workspace paths and zero registry/git/external
packages. Because there is no external Rust package to query, the Rust advisory result is explicitly
`not-applicable-no-external-packages`. The policy is fail-closed: introducing the first external
crate remains prohibited until that change also configures a version-pinned Rust advisory scanner
and reporting semantics. “Zero findings” is not synthesized for a graph that was not scanned.

## Full npm tarball license refresh

`npm run dependencies:licenses` is the deliberate, networked refresh command. It downloads the
exact `resolved` URL for all 91 lock entries with concurrency and byte ceilings, rejects redirects
or non-registry responses, verifies every complete tarball against its lock SHA-512 integrity, and
parses only safe regular tar paths.

For each archive it requires one root package manifest whose name, version, and declared license
equal the lock, then hashes root files named as licenses, licences, copying terms, notices, or
third-party notices. Archive root names are normalized because DefinitelyTyped packages do not all
use npm's common `package/` prefix. The result must exactly reproduce the committed authority; it
cannot silently rewrite it. A dependency update runs the refresh, reviews the generated candidate,
and promotes it only through a normal source diff.

The current refresh verifies 339,376,667 downloaded bytes. The 26 reviewed omissions are:

- eight Biome platform binaries;
- one optional `@napi-rs/wasm-runtime` package;
- fifteen Rolldown platform bindings;
- one optional `@tybys/wasm-util` package; and
- `stackback`.

All are development-only. Their SPDX metadata remains recorded, but missing tarball text is not
misrepresented as present. None may enter a shipped artifact without resolving and retaining the
applicable source/notice obligations. Conversely, the twelve MPL-2.0 `lightningcss` packages all
contain the same hash-verified root license text; their build-only exception still does not permit
shipment.

## Live advisory and provenance observation

`npm run dependencies:report` first reruns the deterministic inventory against a present installed
tree and requires npm 11.18.0. It then executes two read-only network operations:

- `npm audit --json --package-lock-only --ignore-scripts` submits the locked dependency description
  to the configured registry. The policy currently allows zero advisories at every severity and has
  no hidden exception list.
- `npm audit signatures --json --include-attestations` verifies registry signatures for every
  installed package and verifies available provenance attestations. Missing or invalid signatures
  fail. The full JSON, including Sigstore bundles, is retained as a raw report; the compact report
  hashes each package's bundles and records its SLSA provenance v1 predicate.

The initial Linux x64 observation covers 52 platform-selected installed packages: all 52 have
verified registry signatures, 27 have verified SLSA provenance attestations, and the four direct
tools that policy requires to be attested (`@biomejs/biome`, `@playwright/test`, Vite, and Vitest)
are present. Unattested-but-signed packages are listed rather than treated as attested. The 39
platform-optional packages absent on Linux remain protected by lock SRI and the complete tarball
license refresh; registry-signature verification is repeated when a platform selects them.

The raw `npm-audit.json`, raw `npm-signatures.json`, deterministic inventory, and compact dated
observation are written under ignored `dist/dependency`. The separately invoked license refresh
also writes its full result there. The first baseline is retained in task evidence. The Node 22 CI
lane copies the four routine outputs into its strict semantic-replay bundle, records their byte
identities, and retains the bundle for 30 days even when
the upstream lane fails. A gate or release must still promote the exact report under the
[durable-retention policy](../quality/artifact-retention.md); the expiring hosted copy is diagnostic.

## Downloaded tools and browser binaries

The Bytecode Alliance validator authority is revised to
[`helix.wasm-tools/2`](../../.github/ci/wasm-tools.json). In addition to the official release URL,
archive/executable identities, and version, it now pins the byte count and SHA-256 of all three
license files. The installer verifies those files both before atomic installation and on every
cached reuse.

This is provenance and license coverage, not an automated vulnerability scan of the validator's
compiled Rust dependency graph. The report says that explicitly; a release must update/review the
tool or configure an appropriate binary/source advisory process rather than counting it as “zero
vulnerabilities.”

Playwright's default Chromium, Chromium headless shell, Firefox, WebKit, and FFmpeg revisions are
recorded and checked against the exact installed `playwright-core` manifest when available. Their
download behavior remains coupled to the SHA-512-pinned npm package and upstream installer. Each
retained execution report additionally hashes the exact launcher entrypoint returned by Playwright.
That identity detects a changed invoked entrypoint but is not a complete browser-distribution
inventory or SBOM; packaged-release work must resolve that separate boundary under `P16-010`.

## CI and local commands

Both supported Node lanes run the deterministic report after a lifecycle-suppressed clean install.
Only Node 22.23.1 runs the live network observation, avoiding duplicate registry traffic while
retaining one required fresh result per CI execution. The full 339 MB license refresh is deliberate
review/update evidence and is not repeated on every pull request; any lock drift makes the small
offline authority check fail immediately.

```bash
corepack npm ci --ignore-scripts
corepack npm run policy:dependencies
corepack npm run dependencies:check
corepack npm run dependencies:report
corepack npm run dependencies:licenses
```

The live commands may fail because the registry, signing keys, transparency-log material, or
tarballs are unavailable. Network failure is not a clean security result. Ordinary installs keep
implicit audit disabled so network state cannot silently change install success; the explicit CI
step is the single auditable boundary.

## Failure and change rules

A report fails for lock/authority drift, mutable/non-registry source, absent integrity, changed
license text, unknown missing-text family, duplicate/script/license count drift, external Rust
package without scanner coverage, browser/tool authority drift, any advisory, any missing/invalid
installed registry signature, missing required direct attestation, stale tool version, malformed
raw response, or exceeded download/resource limit.

Dependency changes update the root manifest/lock, deterministic source policy, license authority,
third-party notices, vulnerability/provenance observation, and evidence together. A new exception
records owner, reason, affected paths/versions, shipment boundary, and deadline. A scanner outage,
upstream omission, or unsigned package is not handled with `|| true`, `continue-on-error`, an empty
report, or a reduced count.

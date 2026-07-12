# Clean-machine Bootstrap and Development Commands

- Status: Accepted foundation procedure
- Last updated: 2026-07-11
- Owner: Toolchain and release-engineering owner
- Plan item: `P02-017`
- Governing gate: `G02`
- Machine authority: [`bootstrap.json`](bootstrap.json), schema `helix.clean-bootstrap/1`
- Requirements supported: `INV-007`, `PLAT-001`, `PLAT-002`, `PLAT-003`, `QUAL-001`

This is the reproducible entry point for a new HelixDB contributor and for the independent `G02`
clean-checkout review. It separates ordinary cross-platform foundation work, real browser setup, and
the diagnostics that currently have a narrower host contract. Commands are written from the
repository root unless a step explicitly says otherwise.

This contract documents foundation setup and validation; HelixDB now includes safe deterministic HDoc encoding, whole-envelope validation, logical values, raw lookup, lossless tagged conversion, collection path-dictionary format/lifecycle, exact-1.0 closed-world negotiation, and immutable HDoc 1.0 golden vectors, while query, storage, durability, GPU execution, network service, public protocol/SDK, external compatibility adapters, security, performance, and release functionality remain unimplemented.

HelixDB is the accepted development name and `helix-db` is the repository directory. The public
name/package decision remains `P16-016`; bootstrap success must not be presented as public-name,
package, product, platform-support, or release approval.

## Supported bootstrap profiles

| Profile | Declared hosts | Network after prerequisites | Privilege | What it proves |
| --- | --- | --- | --- | --- |
| `contract` | `linux-x64`, `linux-arm64`, `windows-x64`, `macos-arm64`, `macos-x64` | `conditional-for-first-corepack-resolution` | `user` | Documentation, pins, aliases, CI linkage, claim boundary, and rejection canaries agree. |
| `foundation` | `linux-x64`, `linux-arm64`, `windows-x64`, `macos-arm64`, `macos-x64` | `required-for-first-tool-and-package-install` | `user-after-system-prerequisites` | Locked tools, static policy, fixture replay, aggregate foundation suites, and native boundary linking. |
| `browser` | `linux-x64` | `required-for-browser-install` | `linux-system-dependencies-only` | The boundary-only Wasm bundle executes in pinned Chromium, Firefox, and WebKit. |
| `linux-x64-gates` | `linux-x64` | `conditional-for-validator-and-browser-cache-misses` | `user-after-browser-system-dependencies` | Pinned component validation, compiler-matched coverage, stable ASan, and compile-only WGSL evidence. |

Linux arm64, Windows x64, and both declared macOS architectures are native foundation hosts, but not
declared three-browser or Linux diagnostic profiles. Windows arm64 is not declared. Contributors may
experiment with Playwright on other hosts, but only Linux x64 has repository execution evidence.
Playwright engines are not branded Chrome, Edge, or Safari support. The browser and
`linux-x64-gates` rows are deliberately not widened by a tool happening to run elsewhere.

## Exact tool contract

### Git

Use a maintained system Git; the machine policy is `supported-system-release` rather than an
invented minimum version. Install it using the
[official Git installation guidance](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git).
The contract checker records the executable identity but does not claim that every historical Git
release is supported.

### Node.js and npm

The supported Node range is `>=22.12.0 <23 || >=24.11.0 <25`. The recommended clean-bootstrap line
in [`.nvmrc`](../../.nvmrc) is `22.23.1`; CI replays exact `22.23.1` and `24.18.0`. Obtain Node from
the [official Node.js download page](https://nodejs.org/en/download). A version manager is optional
and local to the contributor; it is not a repository dependency.

The package manager is npm `11.18.0`, launched as `corepack npm`. The exact package-manager digest
is in [`package.json`](../../package.json). Do not replace it with a global `npm`, `npx`, another
package manager, or an unpinned Corepack download. The only clean install command is:

```text
corepack npm ci --ignore-scripts
```

The script suppression is a supply-chain boundary, not a troubleshooting toggle. The dependency
policy separately records the single denied optional lifecycle owner.

### Rust and native build tools

Install rustup from the
[official rustup installation page](https://rust-lang.github.io/rustup/installation/). Windows
contributors must also satisfy the
[official MSVC prerequisites](https://rust-lang.github.io/rustup/installation/windows-msvc.html)
and use a Developer PowerShell/Command Prompt where `cl.exe` is visible. Linux needs a working
`cc`; macOS needs Xcode Command Line Tools and discoverable Xcode `clang`.

Entering the repository selects Rust `1.96.1`, profile `minimal`, from
[`rust-toolchain.toml`](../../rust-toolchain.toml). Rustup must install exactly these components:
`clippy`, `llvm-tools`, `rust-docs`, `rust-src`, and `rustfmt`. It must also install
`wasm32-unknown-unknown`, `wasm32-wasip2`, and `x86_64-unknown-linux-gnuasan`. The last target can be
installed while bootstrapping another host, but it executes only in the declared Linux x64
diagnostic profile. The unavailable `wasm32-wasip3` destination is not a bootstrap target.

### Playwright browsers

The harness package is Playwright `1.61.1` and owns the pinned `chromium`, `firefox`, and `webkit`
revisions. The official browser/system-dependency model is documented in the
[Playwright browser guide](https://playwright.dev/docs/browsers). Browser downloads live in the
user's Playwright cache, can consume several gigabytes, and are intentionally separate from the
locked npm install.

The user-level browser install is:

```text
corepack npm run browser:install
```

On Linux, an administrator must first provision the browser libraries when the host image does not
already contain them:

```text
corepack npm exec -- playwright install-deps chromium firefox webkit
```

That second command is the only documented bootstrap step that may require system privilege. Do not
run the repository's npm, Cargo, test, browser-execution, or report commands as root.

## Clean checkout procedure

### 1. Clone the accepted development repository

Bash, PowerShell, and Command Prompt accept these commands as written:

```text
git clone --branch main --single-branch https://github.com/alextis59/helix-db.git
cd helix-db
```

Verify that `git rev-parse --show-toplevel` names this checkout and that `git status --short` is
empty. Do not reuse a working directory with unrelated changes for gate evidence.

### 2. Verify the externally installed prerequisites

Run:

```text
git --version
node --version
corepack --version
rustup --version
rustup show active-toolchain
rustc --version
cargo --version
```

On Bash, `command -v cc` proves the Linux linker is discoverable and `xcrun --find clang` does the
same on macOS. On Windows Developer PowerShell, use `Get-Command cl.exe`; in Command Prompt, use
`where cl.exe`. The repository checker uses the platform-equivalent discovery command.

An NVM user may run `nvm install` and `nvm use` to select `.nvmrc`. A contributor using another
version manager selects `22.23.1` through that manager. Those manager-specific commands are
conveniences, not part of the portable proof.

### 3. Install the locked JavaScript toolchain

```text
corepack npm ci --ignore-scripts
```

This requires registry access on a cold cache, verifies every locked tarball integrity, refuses
manifest/lock drift, suppresses lifecycle scripts, and installs only development tooling. The root
package is private and publishes nothing.

Fetch the exact locked Rust crate graph during the same explicit networked preparation window:

```text
cargo fetch --locked
```

All subsequent build, policy, test, and documentation commands keep the repository-wide frozen and
offline boundary. The fetch does not relax exact versions, checksums, source allowlists, licenses,
or the live RustSec gate.

### 4. Run the clean preflight before editing

```text
corepack npm run bootstrap:check
corepack npm run bootstrap:test
corepack npm run bootstrap:preflight
```

The checker implementations use Node built-ins only; their `corepack npm run` aliases may resolve the
pinned npm package on a cold Corepack cache. `bootstrap:preflight` additionally checks the current
host, Node range, exact npm, pinned Rust toolchain/components/targets, native linker, repository root,
and a clean Git worktree. It accepts another Node patch within the declared range but labels only
`22.23.1` and `24.18.0` as exact CI replay lines. Run it before making changes; for later clean
evidence, use a separate clean worktree or clone rather than discarding active work.

### 5. Run the cross-platform foundation profile

Execute in this order so failures stay attributable:

```text
cargo fetch --locked
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run dependencies:check
corepack npm run toolchain:types
corepack npm run fixtures:check
corepack npm test
corepack npm run examples:native
```

The stable aggregate currently runs the implemented foundation unit, conformance, browser-list,
and benchmark harness suites while keeping crash/distributed placeholders explicit. The native
example links an unpublished boundary package and reports zero database operations. It creates
`target/` and `dist/validation/native-toolchain-example.json`; neither is source or durable gate
evidence.

For a Rust-focused change, also run the native CI commands directly:

```text
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
```

On Bash, the warning-free documentation command is
`RUSTDOCFLAGS="-D warnings" cargo doc --frozen --workspace --no-deps --all-features`. On PowerShell,
set `$env:RUSTDOCFLAGS = "-D warnings"`, run
`cargo doc --frozen --workspace --no-deps --all-features`, and then remove the variable with
`Remove-Item Env:RUSTDOCFLAGS`. In Command Prompt, use `set RUSTDOCFLAGS=-D warnings` for that
process. Shell syntax changes only environment assignment; Cargo arguments stay identical.

## Browser profile

After the Linux system-dependency step, if applicable, install all three pinned engines once:

```text
corepack npm run browser:install
corepack npm run browser:smoke
```

`browser:smoke` rebuilds the four-file ES2022/Wasm boundary bundle, starts Vite preview strictly on
`127.0.0.1:4173`, executes the same assertion in the three engines, and writes
`dist/validation/browser-bundle-smoke.json` plus
`dist/validation/browser-execution-{engine}.json`. It does not exercise a document API, persistence,
OPFS/IndexedDB fallback, WebGPU dispatch, branded browsers, or release packaging.

Use `corepack npm run test:browser` when a change needs the fast build plus three-project test-list
contract without launching browsers. Use `corepack npm run ci:browser-smoke -- chromium` (or
`firefox`/`webkit`) only when reproducing one CI engine and its individual structured report.

## Linux x64 gate profile

These checks are intentionally Linux x64-only in the current foundation:

```text
corepack npm run wasm:validate
corepack npm run coverage:check
node tests/toolchain/run-build-profile.mjs sanitizer
corepack npm run wgsl:validate
```

- `wasm:validate` first checks the deterministic Cargo/source/zero-import boundary, then parses and
  contract-checks immutable `helix:core-abi@1.0.0` plus current capability ABI 1.1 and builds both
  portable forms.
  The core module uses the platform-independent built-in
  validator; the WASIp2 component uses the hash-pinned `wasm-tools` Linux x64 archive. The current
  binary still exposes empty WIT; capability operations, bindings, and hosts remain later P04 work.
- `coverage:check` uses only the compiler-matched `llvm-profdata` and `llvm-cov` shipped with Rust
  `1.96.1`; current product coverage remains honestly empty after boundary-test exclusions.
- `sanitizer` uses `x86_64-unknown-linux-gnuasan`; it is a diagnostic build, not a deployment target.
- `wgsl:validate` asks pinned Chromium Dawn/SwiftShader to parse, validate, and create pipelines for
  trusted fixtures. It does not dispatch work or prove WebGPU/GPU support.

The profile may read a pre-existing browser cache and
`target/toolchain/wasm-tools`. A cold validator or browser cache needs network access. Once those
exact artifacts and npm packages are present, source validation and test execution are otherwise
local.

## Development command map

| Need | Command | Network/privilege | Important output or boundary |
| --- | --- | --- | --- |
| Validate bootstrap authority | `corepack npm run bootstrap:check` | None / user | No output files |
| Exercise bootstrap rejection canaries | `corepack npm run bootstrap:test` | None / user | No output files |
| Verify a clean host | `corepack npm run bootstrap:preflight` | None after tools / user | Fails on dirty worktree |
| Check JavaScript formatting/lints | `corepack npm run policy:javascript` | None / user | Read-only |
| Check dependency policy | `corepack npm run policy:dependencies` | None / user | Read-only |
| Rebuild offline dependency inventory | `corepack npm run dependencies:check` | None / user | Ignored reports under `dist/validation/` |
| Install pinned Rust advisory scanner | `corepack npm run rust:audit:install` | Required on first run / user | Exact official source archive plus reviewed, self-audited tool lock under ignored `target/toolchain/` |
| Refresh live security observation | `corepack npm run dependencies:report` | Required / user | Time-stamped npm and RustSec reports; audits both workspace and scanner graphs |
| Check TypeScript | `corepack npm run toolchain:types` | None / user | Compiler build info under ignored output |
| Verify fixtures | `corepack npm run fixtures:check` | None / user | Rejects generator/source drift |
| Run stable aggregate | `corepack npm test` | None / user | Suite reports under `dist/validation/` |
| Run one stable suite | `corepack npm run test:unit` (replace suffix with a named suite) | None except explicit browser execution / user | Maturity is defined by the test-command contract |
| Validate both examples | `corepack npm run examples:check` | None after tools / user | Native JSON plus browser bundle report |
| Run native example | `corepack npm run examples:native` | None after tools / user | Zero-operation boundary report |
| Build browser example | `corepack npm run examples:browser` | None after tools / user | Four-file ignored bundle |
| Install browsers | `corepack npm run browser:install` | Required / user | User Playwright cache |
| Run real browsers | `corepack npm run browser:smoke` | None after install / user | Three strict engine reports |
| Validate portable artifacts | `corepack npm run wasm:validate` | Conditional validator cache / user | Linux x64 component-validator boundary |
| Run coverage gate | `corepack npm run coverage:check` | None / user | Linux x64 ignored raw/report output |
| Check WGSL source manifest | `corepack npm run wgsl:check` | None / user | No browser launch |
| Compile trusted WGSL | `corepack npm run wgsl:validate` | None after Chromium install / user | Compile-only Chromium report |
| Validate the full CI source contract | `corepack npm run ci:check` | None after packages / user | Does not prove hosted execution |

Pass arguments only to commands whose documented contract accepts them. Do not append arbitrary
Cargo, Playwright, Vite, path, output, retry, or filtering options to gate evidence; the bounded
entry points reject unknown modes intentionally.

## Generated output and cleanup discipline

`node_modules/`, `target/`, `dist/`, Playwright results, coverage data, tool caches, and browser
downloads are generated or external caches. Git ignores the repository-local forms. A passing local
run does not promote them into [`evidence/`](../../evidence/); promotion requires the artifact
retention policy, source commit identity, and a separate evidence commit.

The exact machine-profile output patterns are:

- `contract`: no repository output;
- `foundation`: `target/` and `dist/validation/native-toolchain-example.json`;
- `browser`: `dist/browser/`, `dist/validation/browser-bundle-smoke.json`, and
  `dist/validation/browser-execution-{engine}.json`; and
- `linux-x64-gates`: `target/wasm/`, `target/coverage/`, `target/sanitizer/`,
  `dist/validation/wasm-*.json`, `dist/validation/rust-coverage.json`, and
  `dist/validation/wgsl-chromium.json`.

Before removing a generated directory to diagnose drift, retain its error/report when useful and
confirm the path is ignored output. Never use `git reset --hard`, source checkout/replacement, broad
untracked-file deletion, or lockfile hand edits as a bootstrap remedy. Preserve other contributors'
work. Prefer a new worktree or clone for a clean replay.

## Troubleshooting

Each code is stable and duplicated in the machine authority so support notes and tests can name the
same failure class.

### `BOOT-NODE-RANGE` — Node engine rejection

Condition: Node is outside the supported major-line ranges. `npm` may report `EBADENGINE`, or the
preflight names the active version. Action: Select Node 22.23.1 or another version accepted by the declared engine range.

Run `node --version`, inspect `.nvmrc`, and change Node through the contributor's version manager.
Do not weaken `engines` or `devEngines` to accommodate an ambient shell.

### `BOOT-NPM-PIN` — Corepack or npm identity mismatch

Condition: Corepack is absent or npm is not 11.18.0. Action: Install an official supported Node distribution and invoke the package manager through corepack npm.

Run `corepack npm --version`; a global `npm --version` is not the contract identity. Do not edit the
package-manager digest or install `npm@latest` as a shortcut.

### `BOOT-NPM-LOCK` — frozen install disagreement

Condition: npm ci reports package.json and package-lock.json drift. Action: Do not edit the lock by hand; restore unintended drift or regenerate it in a focused dependency change.

Review `git diff -- package.json package-lock.json`. Dependency changes must also refresh the policy,
license inventory, offline report, live observation, tests, and evidence assigned to that change.

### `BOOT-NPM-SCRIPTS` — lifecycle-script request

Condition: A package lifecycle script is denied or requested. Action: Keep --ignore-scripts and the strict lifecycle policy; review any required script as a dependency-policy change.

Do not rerun installation without `--ignore-scripts`, disable `strict-allow-scripts`, or approve a
package interactively. The policy checker owns any deliberate exception.

### `BOOT-RUSTUP` — pinned toolchain activation failure

Condition: The pinned Rust toolchain does not activate. Action: Install rustup, enter the repository root, and let rust-toolchain.toml select Rust 1.96.1.

Run `rustup show active-toolchain` from this directory. A shell override such as `RUSTUP_TOOLCHAIN`,
a directory override, missing network access on first install, or an alternate `cargo` earlier on
`PATH` can explain the mismatch; remove the ambient override rather than changing the project pin.

### `BOOT-RUST-TARGET` — missing component or target

Condition: A required Rust component or target is missing. Action: Run rustup component list --installed and rustup target list --installed from the repository root before repairing the pinned toolchain.

The toolchain file normally provisions the exact inventory. If a partial installation was
interrupted, rerun `rustup show` with network access. Do not substitute a nightly toolchain or omit
the failing target from evidence.

### `BOOT-CARGO-FETCH` — locked registry crate absent

Condition: A frozen or offline Cargo command cannot find a locked registry crate. Action: With network access enabled for this explicit preparation step, run cargo fetch --locked; do not relax --frozen on validation commands.

Run the fetch once from the repository root before offline validation. A checksum, source, or lock
failure is a dependency-policy failure; do not switch registries, remove `--locked`, or enable
ambient network access for the build itself.

### `BOOT-RUST-AUDIT` — Rust advisory gate unavailable

Condition: The pinned cargo-audit binary, reviewed tool lock, or RustSec database is absent or rejected. Action: Run corepack npm run rust:audit:install, preserve any checksum or self-audit failure, and rerun the live dependency report with network access.

The installer verifies the official `cargo-audit 0.22.2` source archive and builds it from the
repository-owned patched tool lock. The live report fails on vulnerabilities, unmaintained or
unsound warnings, notices, yanks, stale database state, ignored advisories, or scanner self-audit
findings.

### `BOOT-LINKER` — native compiler/linker unavailable

Condition: A native link step cannot find a platform compiler or linker. Action: Install the platform build tools and use a shell where cc, Xcode clang, or MSVC cl.exe is discoverable.

On Windows, a normal PowerShell may have Rust but not the MSVC environment; use the Visual Studio
Developer shell. On Linux/macOS, verify the platform command listed in the prerequisite section.

### `BOOT-WASM-HOST` — component validator host mismatch

Condition: The pinned component validator rejects the local operating system or architecture. Action: Run component validation on Linux x64 or rely on the declared Linux x64 CI lane; do not bypass validation.

The browser core-module build can still be useful on other declared hosts. It is not equivalent to
the component-validator result.

### `BOOT-WASM-CACHE` — validator integrity/cache failure

Condition: The validator cache is incomplete or fails an integrity check. Action: Preserve the error, remove only target/toolchain/wasm-tools and its ignored download cache, then rerun the pinned installer.

Use `corepack npm run wasm:install-validator`; it checks the archive size/hash, executable
size/hash/version, and license inventory. Do not execute an unverified system `wasm-tools` instead.

### `BOOT-BROWSER-BINARY` — pinned browser missing

Condition: Playwright cannot find a pinned browser executable. Action: Run corepack npm run browser:install as the same user that will run the smoke test.

Installing as root and testing as an ordinary user creates different caches. Do not point the test
at an arbitrary system browser or relabel it as the pinned engine.

### `BOOT-BROWSER-DEPS` — Linux shared-library failure

Condition: A Linux browser fails because shared libraries or system packages are absent. Action: Run the documented Playwright install-deps command with the system privilege appropriate to the machine.

The exact command is `corepack npm exec -- playwright install-deps chromium firefox webkit`. Review
it under the host's package-management policy; repository test commands remain unprivileged.

### `BOOT-BROWSER-PORT` — preview port occupied

Condition: The browser preview cannot bind 127.0.0.1:4173. Action: Stop the conflicting local listener; the fixed address and strict port are part of the test contract.

Find the owning process with the operating system's normal socket tools. Do not change the Vite or
Playwright port merely to make one run pass because base URL identity is validated.

### `BOOT-BROWSER-NETWORK` — proxy or private CA

Condition: Browser download fails behind a proxy or private certificate authority. Action: Configure HTTPS_PROXY and NODE_EXTRA_CA_CERTS for the install; do not disable TLS verification.

Set secrets and certificate paths only in the local shell/approved secret store. Never commit proxy
credentials, private certificates, or a TLS-disable flag.

### `BOOT-LINUX-GATE` — diagnostic requested on another host

Condition: Coverage or AddressSanitizer is requested on another host profile. Action: Run the diagnostic on Linux x64 or use its CI lane; absence on another host is not a pass.

Native format/check/test/example work remains declared on the five native hosts. Widening coverage
or sanitizer support requires a separate pinned policy and CI update.

### `BOOT-WGSL` — Chromium/SwiftShader validation failure

Condition: WGSL validation cannot launch pinned Chromium with SwiftShader. Action: Provision the pinned Chromium browser and Linux dependencies, then keep the compile-only result distinct from GPU support.

First run `corepack npm run wgsl:check` to separate manifest drift from browser setup. Retain Dawn's
typed validation reason; do not replace rejected fixtures or add a hardware-GPU claim.

### `BOOT-REPORT-STALE` — source/report identity mismatch

Condition: A retained report no longer matches its source authority. Action: Regenerate the producing check and then recollect the retained bundle; never edit a report into agreement.

Use the report's owning command, then the relevant `artifacts:*` collector. A failure bundle remains
a failure and must not be rewritten to `pass`.

### `BOOT-WORKTREE` — clean preflight finds changes

Condition: Bootstrap preflight finds tracked or untracked changes. Action: Inspect and preserve the changes, then run the clean-checkout proof in a separate worktree or clone; never reset unknown work.

`git status --short` identifies the paths. Ignored build output does not fail the check, but tracked
or untracked source does. Commit intentional work in its assigned task or leave it untouched and use
another worktree for the replay.

## Gate evidence boundary

Closing `G02` requires more than this procedure existing or passing once locally. The reviewer must
use only the commands above in a clean checkout, bind the transcript and produced reports to a full
source commit, reconcile the CI matrix and dependency report, execute native/browser skeletons, and
record hosted-lane limitations honestly. The clean bootstrap does not approve `main`, publish a
package, create a database, or settle the deferred public name.

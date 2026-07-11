# P02-017 Clean-machine Bootstrap Evidence

- Task: `P02-017` — document clean-machine bootstrap, development commands, and troubleshooting
- Requirements supported: `INV-007`, `PLAT-001`, `PLAT-002`, `PLAT-003`, `QUAL-001`
- Source commit: `309b9c2d53d7340f6704b3d22a5356e21bab6765`
- Source tree: `5b8ccd4e23334fdb8e45ab84896d3a7cd45e8141`
- Recorded at: `2026-07-11T06:23:09.758Z`
- Source worktree: clean
- Local evidence host: Linux x64
- Hosted workflow execution: not claimed
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Accepted ADRs: none
- Verdict: Pass

## Scope and result

The source commit replaces the temporary “commands will be established” contribution text with an
executable bootstrap system:

- [`bootstrap.md`](../../../docs/development/bootstrap.md) is the human authority for prerequisites,
  a clean checkout, shell differences, development commands, generated output, platform limits, and
  17 stable troubleshooting codes;
- [`bootstrap.json`](../../../docs/development/bootstrap.json) is the strict
  `helix.clean-bootstrap/1` machine authority for repository identity, exact tools, four profiles,
  network/privilege boundaries, outputs, and troubleshooting actions;
- `bootstrap:check` binds that authority to `.nvmrc`, npm/Rust policy, Cargo metadata, Biome, CI,
  documentation links, and the accepted HelixDB development name;
- `bootstrap:preflight` verifies a clean Git root, supported Node patch, exact npm, Rust
  toolchain/components/targets, and the platform linker without writing source; and
- `bootstrap:test` exercises 35 contract/source mutations plus Node-range and host-profile
  boundaries.

The CI contract validates the bootstrap authority and canaries before emitting its lane matrix. The
guide is linked from the root, documentation, contribution, toolchain, GitHub, Rust, JavaScript, and
CI authorities. No dependency or lockfile changed.

This result proves documentation and foundation command execution only. It adds no document API,
query engine, persistence, durability, GPU dispatch, network service, compatibility adapter,
security control, performance threshold, package, or release. HelixDB remains the development name;
the public-name/package decision remains `P16-016`.

## Exact clean preflight

The retained [`clean-preflight.json`](reports/clean-preflight.json) binds all observations to the
full source commit and tree:

| Node | Classification | Corepack | npm | Rust | Result |
| --- | --- | ---: | ---: | ---: | --- |
| 22.19.0 | Supported development patch | 0.34.0 | 11.18.0 | 1.96.1 | Clean pass |
| 22.23.1 | Exact CI replay line | 0.34.6 | 11.18.0 | 1.96.1 | Clean pass |
| 24.18.0 | Exact CI replay line | 0.35.0 | 11.18.0 | 1.96.1 | Clean pass |

The first line demonstrates the deliberate range/exact-line distinction: a supported patch is not
misreported as the exact CI version. The two exact lines were selected through their installed NVM
distributions and each invoked the pinned npm through its own Corepack. All three runs identified
Linux x64, the same five Rust components, three non-host targets, the native `cc` linker, and a clean
worktree.

## Documented profile replay

[`documented-command-replay.json`](reports/documented-command-replay.json) records the four profiles
and their exact source-authority commands. The independent verifier extracts the source commit into
a temporary directory, initializes a new clean Git repository, and executes them rather than
trusting the retained verdict.

### Contract profile

Both exact Node lines pass:

```text
corepack npm run bootstrap:check
corepack npm run bootstrap:test
```

The contract reports four profiles, five native foundation hosts, one declared browser evidence
host, 17 troubleshooting codes, and database functionality false. The canary test rejects tool,
profile, naming, command, output, troubleshooting, guide-link, CI, Cargo, lock-policy, and stale
contribution drift.

### Foundation profile

The verifier runs `corepack npm ci --ignore-scripts` independently on Node 22.23.1 and 24.18.0,
then performs clean preflight, JavaScript and dependency policy, offline inventory, TypeScript,
fixtures, the aggregate stable suite, the locked/offline native example, and the complete CI source
contract. It additionally runs root Rust formatting, frozen all-feature check, strict Clippy,
all-feature tests, and warning-free rustdoc.

Both root lockfiles remain byte-identical. The stable aggregate contains nine native unit tests,
the full semantic/conformance authorities, the browser example build/list contract, the
integrity-only benchmark harness, and explicit reserved suite states. The native example reports
zero database operations.

### Browser profile

On Node 22.23.1 the verifier runs the documented user-level Playwright install and then
`browser:smoke`. Chromium, Firefox, and WebKit each execute one real boundary-example test against
the generated Vite/Wasm bundle. The host's system browser dependencies were already present; the
privileged Linux `install-deps` prerequisite was therefore not executed or represented as a
repository test.

This is Linux x64 evidence only. Windows/macOS browser execution remains undeclared even though
Playwright may be experimented with there. Bundled Chromium/WebKit are not branded Chrome, Edge, or
Safari support.

### Linux x64 diagnostic gates

The verifier executes the four exact commands documented for the narrow diagnostic profile:

- both portable Wasm forms, including the hash-pinned Linux x64 component validator;
- compiler-matched Rust coverage with its honest empty-product boundary exception;
- `x86_64-unknown-linux-gnuasan`; and
- trusted WGSL parsing/validation/pipeline compilation in pinned Chromium Dawn/SwiftShader.

These results are not generalized to Windows, macOS, Linux arm64, hardware GPU correctness, shader
dispatch, or deployment support.

## Negative verification

The committed source test performs 35 in-memory contract/source mutations, 11 Node range
boundaries, and seven host mappings. The evidence verifier adds 17 isolated real-file mutations:

1. contract schema;
2. HelixDB development identity;
3. deferred public-name task;
4. non-database claim boundary;
5. Node support range;
6. browser-host widening;
7. troubleshooting action weakening;
8. guide claim removal;
9. generated-output boundary removal;
10. preflight alias drift;
11. package-manager digest drift;
12. Cargo authority removal;
13. CI task-history removal;
14. workflow contract weakening;
15. root guide unlinking;
16. restoration of the obsolete contribution placeholder; and
17. a real untracked-file `BOOT-WORKTREE` failure.

Each canary must reach its intended first diagnostic. Every changed byte and the untracked file are
restored, after which the bootstrap contract, source canaries, CI checker, and clean Git status pass
again. The 52 total rejection canaries prevent a parser/setup failure from counting as the intended
negative proof.

## Documentation and source integrity

The verifier binds the exact 19-path source diff, source tree, file sizes, SHA-256 hashes, unchanged
Cargo/npm lockfiles, and both retained report identities. It independently checks:

- 156 tracked Markdown files, terminal newlines, trailing whitespace, and 1,060 repository-local
  links;
- all 44 specification requirement IDs against the governance ledger;
- three workflow files, nine jobs, and 56 YAML-parsed steps; and
- the strict development-name/public-name decision boundary.

The implementation adds no external package, lifecycle script, alternative lockfile, public npm
scope, native crate dependency, or source deletion.

## Limitations and next owner

- Local evidence is Linux x64. The five declared native lanes include hosted Windows/macOS/arm64
  executions that are not inferred from matrix source here.
- No GitHub workflow, artifact service, or hosted runner execution is claimed by this task.
- The browser system-dependency installation is a documented privileged prerequisite and was not
  rerun on the already provisioned evidence host.
- `G02` owns independent clean-checkout gate review and must decide whether its required hosted
  evidence is available; this task does not self-approve the gate.
- Browser storage capability detection, OPFS/IndexedDB fallback, WebGPU behavior, and lifecycle
  support remain `P11-*` work.
- The public product/package name remains deferred to `P16-016`; no alternative is selected here.

## Reproduction

Focused source checks:

```text
corepack npm ci --ignore-scripts
corepack npm run bootstrap:check
corepack npm run bootstrap:test
corepack npm run bootstrap:preflight
corepack npm run ci:check
```

Complete retained-evidence replay:

```text
node evidence/phase-02/P02-017/verify.mjs 309b9c2d53d7340f6704b3d22a5356e21bab6765
```

The complete verifier requires exact NVM Node 22.23.1 and 24.18.0 distributions, Rust 1.96.1 with
the committed components/targets, Git, `tar`, Python with PyYAML, a Linux x64 native linker, the
Playwright Linux system dependencies, and network access for a cold npm/browser/component-validator
cache. It never modifies the source checkout.

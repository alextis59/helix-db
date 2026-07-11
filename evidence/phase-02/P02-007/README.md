# P02-007 Stable Test Command Evidence

- Task: `P02-007` — add unit, integration, conformance, fuzz, browser, crash, benchmark, and distributed-test commands with stable names
- Requirements supported: `INV-003`, `INV-004`, `INV-007`, `INV-009`, `PLAT-001`, `PLAT-002`, `CORE-003`, `QUAL-001`, `QUAL-002`, `COMPAT-001`
- Commit under test: `0dbb58e323bf9b272e46d3e6e9cb2233ee3a0a2a`
- Recorded at: `2026-07-11T00:36:45Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Verdict: Pass

## Scope

This step establishes one versioned command surface before feature suites diverge:

- eight stable `test:*` category aliases, the aggregate `test`/`test:all` alias, and the structural `test:commands` checker;
- a machine-readable `helix.test-command-surface/1` manifest with exact order, state, roots, steps, counts, and activation tasks;
- a common shell-free runner with fixed program/argument arrays and offline Cargo execution;
- active unit and offline semantic-conformance authorities;
- explicit reserved-state inventories for integration, fuzz, browser, crash, benchmark, and distributed work; and
- a rule that unreviewed source or Cargo targets beneath a reserved category make its command fail.

The normative behavior and claim boundaries are documented in the [stable test command policy](../../../docs/quality/test-command-surface.md).

## Executed command surface

| Suite | State | Accepted bootstrap result | Activation boundary |
| --- | --- | --- | --- |
| Unit | Active | 9 Rust library tests pass; JavaScript inventory is exactly 0 files | Reviewed test additions update the exact manifest count |
| Integration | Reserved | 0 Cargo integration targets and only its contract README | `P03-017` |
| Conformance | Active | 4 positive/3 negative examples; 17 fixtures/313 steps; 382 oracle assertions; 263 matrix rows; 16 offline MongoDB cases | Later implementations bind to the same authorities |
| Fuzz | Reserved | 0 targets and only its contract README | `P03-019` |
| Browser | Reserved | Playwright lists 0 tests/0 files without installing or launching a browser | `P02-010`, `P02-016` |
| Crash | Reserved | 0 histories and only its contract README | `P05-021` |
| Benchmark | Reserved | 8-crate benchmark-profile compilation; 0 Cargo/root workloads | `P02-014` |
| Distributed | Reserved | 0 histories and only its contract README | `P17-016` |

Node 22.23.1 executes every named category alias separately. Node 24.18.0 executes the aggregate root command. Both lanes run a clean script-suppressed install, the structural checker, formatting/dependency/type policies, and preserve the exact lock hash.

The conformance command deliberately remains offline. It validates the complete retained MongoDB observation/report artifacts but does not start MongoDB or broaden the closed-world compatibility claim. The live pinned differential remains separate gate evidence.

## Negative verification

The clean-room verifier applies eight independent mutations and requires every one to fail:

1. drift the `test:unit` package alias;
2. remove one suite from the versioned manifest;
3. add an unreviewed file under the reserved crash root;
4. add a crate-local Cargo integration target;
5. add a crate-local Cargo benchmark target;
6. inject a failing Rust unit test;
7. add an unexpected passing JavaScript unit file while the inventory is zero; and
8. change the bytes of a hash-bound semantic fixture.

The source is restored after each mutation, and the verifier rejects any residual tracked or untracked source drift.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
rustc: 1.96.1 (31fca3adb 2026-06-26)
cargo: 1.96.1 (356927216 2026-06-26)
active Node.js: v22.19.0
Corepack: 0.34.0
npm through Corepack: 11.18.0
Vitest: 4.1.10
Playwright: 1.61.1
JavaScript validation lanes: Node 22.23.1 and 24.18.0
```

## Commands

```bash
corepack npm run test:commands
corepack npm run test:unit
corepack npm run test:integration
corepack npm run test:conformance
corepack npm run test:fuzz
corepack npm run test:browser
corepack npm run test:crash
corepack npm run test:benchmark
corepack npm run test:distributed
corepack npm run test:all
corepack npm test
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run toolchain:types
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS="-D warnings" cargo doc --frozen --workspace --no-deps --all-features
node evidence/phase-02/P02-007/verify.mjs 0dbb58e323bf9b272e46d3e6e9cb2233ee3a0a2a
```

## Retained diagnostic attempts

1. The first strict JavaScript-policy pass exited 1 on three mechanical diagnostics: one import-order fix and two formatter line wraps. Biome applied only those safe changes before the complete policy passed.
2. The first aggregate `npm test` exited 1 after unit, integration, conformance, fuzz, browser, and crash passed because recursive filesystem order differed from the canonical benchmark allowlist order. Reserved inventories now compare exact sorted sets; the allowed files and claim boundary did not change.

These attempts changed no accepted behavior outside the reviewed P02-007 source commit and are retained so a green command surface does not hide bootstrap defects.

## Limitations

Stable commands and explicit empty states do not implement the reserved suites. This step does not prove cross-language integration, fuzz coverage, browser execution, crash recovery, benchmark performance, distributed correctness, live MongoDB compatibility, CI coverage, or release readiness. Real cases, failure canaries, timeouts, isolation, result schemas, and retained reports remain owned by the activation tasks and later gates named above.

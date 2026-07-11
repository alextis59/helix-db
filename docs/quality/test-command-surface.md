# Stable Test Command Surface

- Status: Accepted bootstrap command contract; feature suites remain maturity-labeled
- Last updated: 2026-07-11
- Owner: Quality and release owner
- Plan item: `P02-007`; benchmark activation completed by `P02-014`; browser boundary activation completed by `P02-016`
- Governing gate: `G02`
- Machine authority: [`helix.test-command-surface/1`](../../tests/suites.json)
- Runner: [`tests/run-suite.mjs`](../../tests/run-suite.mjs)

## Purpose

HelixDB has one stable local entry point for each required test class before feature code accumulates. The names are durable automation interfaces; the suite manifest separately states whether a class is `active` or `reserved`, what it executes, its exact bootstrap inventory, and the plan item that must activate it.

A zero-target class is never presented as implemented coverage. A reserved command succeeds only after it proves that its source inventory is still exactly the reviewed manifest, optionally runs a bounded toolchain probe, and prints `RESERVED` with its activation task. Adding a file below a reserved suite root without updating the manifest and runner fails the command.

## Stable commands

| Command | Bootstrap state | Current behavior | Activation or expansion |
| --- | --- | --- | --- |
| `npm run test:unit` | Active | Runs all-feature Rust library tests and inventories JavaScript unit files; currently 18 Rust tests and 0 JavaScript files | Counts change with reviewed implementation tests |
| `npm run test:integration` | Reserved | Requires only the integration contract README | First cross-language golden readers under `P03-017` |
| `npm run test:conformance` | Active | Replays semantic examples, canonical bytes, the 17-fixture/313-step corpus, 382 oracle assertions, the 263-row compatibility matrix, and offline MongoDB artifacts | Later format, host, engine, and adapter bindings extend the same command |
| `npm run test:fuzz` | Reserved | Requires only the fuzz contract README; no property test is relabeled as fuzzing | First coverage-guided codec targets under `P03-019` |
| `npm run test:browser` | Active | Rebuilds and validates the non-database browser example, then lists exactly one case expanded across Chromium, Firefox, and WebKit (3 tests in 1 file) without downloading or launching browsers | `P11-014` expands the same suite to product lifecycle/capability/storage behavior |
| `npm run test:crash` | Reserved | Requires only the crash-history contract README | Storage crash/reopen histories under `P05-021` |
| `npm run test:benchmark` | Active | Compiles all eight crates through the fixed benchmark profile, requires 0 Cargo benchmark targets, then records and validates one 5-warm-up/20-measurement integrity-only baseline | Product workloads extend the versioned result contract without changing its claim boundary retroactively |
| `npm run test:distributed` | Reserved | Requires only the distributed-history contract README | Deterministic replication simulations under `P17-016` |

`npm run test:all` runs the eight commands in manifest order and is also the root `npm run test` behavior. It includes the benchmark-profile compilation, so focused development should use the narrowest relevant command. `npm run test:commands` validates the manifest, package aliases, Cargo metadata, list/describe interface, documentation, and rejection behavior without running the feature suites.

## Execution boundaries

The common runner invokes fixed program/argument arrays without a shell. Cargo commands are frozen/offline; suite scripts never install a dependency, browser binary, container image, or toolchain. A command may read existing cached tools selected by the pinned Rust and npm policies, but mutable setup remains an explicit bootstrap or CI responsibility.

The unit command selects Rust library targets so integration, examples, binaries, and doctests cannot drift into its count accidentally. JavaScript uses Vitest's explicit empty-suite switch only while the manifest records zero files. The conformance command is offline and deterministic: it validates committed MongoDB observations but does not start MongoDB. The separately retained Phase 1 live differential remains an evidence/gate workflow until a later differential command policy is accepted.

The [`P02-013` product coverage command](code-coverage-policy.md) is a quality gate over the same Rust library tests, not a ninth feature-suite alias. It recompiles with exact instrumentation, excludes test-only source ranges from the denominator, and enforces product/critical thresholds. `test:unit` remains the stable behavior command; `coverage:check` remains the bounded reporting command.

The active browser command first builds and structurally checks the fixed example and then uses Playwright list mode. It does not install or execute Chromium, Firefox, or WebKit; explicit `browser:install`, `browser:smoke`, and CI commands own that network/platform boundary under the [P02-010/P02-016 validation contract](../architecture/wasm-browser-smoke-validation.md).

The active benchmark command uses the accepted `bench` compilation profile and the [P02-014 result contract](benchmark-results.md). It times only a deterministic Node SHA-256 harness calibration, emits ignored raw/summary artifacts, and fails on integrity, completeness, fallback, or report drift. It does not time database code, compare machines/backends, apply a performance threshold, or create a performance claim.

The underlying CLI behavior follows the official [Cargo test command](https://doc.rust-lang.org/cargo/commands/cargo-test.html), [Vitest CLI](https://vitest.dev/guide/cli), [Playwright test CLI](https://playwright.dev/docs/test-cli), and [Rust Fuzz Book](https://rust-fuzz.github.io/book/) documentation. Tool versions remain governed by the Rust and JavaScript toolchain policies rather than by those mutable pages.

## Activation rule

Activating a reserved suite is one coherent change:

1. add real cases/targets and a deterministic local execution step;
2. change the manifest state, exact inventory/counts, steps, and activation ownership;
3. keep the stable npm command name and common runner path;
4. add failure canaries showing malformed inputs or failing cases make the command nonzero;
5. document prerequisites, isolation, timeouts, generated-output locations, and retained evidence;
6. run the command on every supported environment assigned by the CI matrix; and
7. update requirement traceability and the owning implementation-plan item.

An active suite may not use an empty-suite option unless the empty component is separately counted and explained, as the bootstrap JavaScript unit inventory is here. Removing or renaming a stable command requires an accepted compatibility decision and migration window; silently repurposing its meaning is prohibited.

## Claim boundary

This command surface proves stable orchestration, exact bootstrap inventories, and the executable authorities named above. It does not prove integration behavior, browser support, fuzz coverage, crash safety, benchmark performance, distributed correctness, production readiness, or `G02` closure. Those claims remain blocked on their named implementation tasks and retained evidence.

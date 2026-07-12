# Stable Test Command Surface

- Status: Accepted bootstrap command contract; feature suites remain maturity-labeled
- Last updated: 2026-07-11
- Owner: Quality and release owner
- Plan item: `P02-007`; benchmark activation completed by `P02-014`, extended with HDoc product-code measurements by `P03-020`, and decision validation by `P03-021`; browser boundary activation completed by `P02-016`; integration activation completed by `P03-017`; fuzz activation completed by `P03-019`
- Governing gate: `G02`
- Machine authority: [`helix.test-command-surface/1`](../../tests/suites.json)
- Runner: [`tests/run-suite.mjs`](../../tests/run-suite.mjs)

## Purpose

HelixDB has one stable local entry point for each required test class before feature code accumulates. The names are durable automation interfaces; the suite manifest separately states whether a class is `active` or `reserved`, what it executes, its exact bootstrap inventory, and the plan item that must activate it.

A zero-target class is never presented as implemented coverage. A reserved command succeeds only after it proves that its source inventory is still exactly the reviewed manifest, optionally runs a bounded toolchain probe, and prints `RESERVED` with its activation task. Adding a file below a reserved suite root without updating the manifest and runner fails the command.

## Stable commands

| Command | Bootstrap state | Current behavior | Activation or expansion |
| --- | --- | --- | --- |
| `npm run test:unit` | Active | Runs 55 all-feature Rust library tests and inventories 0 JavaScript unit files; three P04-006 tests cover explicit-copy success, bounds, and failure atomicity, three P04-007 tests cover handle/shared-staging prototypes, and five deterministic P03-018 property/mutation tests cover 512-seed codec and tagged-JSON properties, 256 presentation permutations, every positive-fixture prefix, sampled stored-byte damage, and 2,656 checksum-repaired one-bit mutations | Counts change with reviewed implementation tests |
| `npm run test:integration` | Active | Runs one five-case Vitest file: fixed inventory plus complete logical-value and independently recomputed typed-hash parity across all four immutable HDoc 1.0 positive vectors | Later cross-crate, language, and process boundaries extend the same command |
| `npm run test:conformance` | Active | Replays semantic examples, canonical bytes, the 17-fixture/319-step corpus, 382 oracle assertions, the 265-row compatibility matrix, and offline MongoDB artifacts | Later format, host, engine, and adapter bindings extend the same command |
| `npm run test:fuzz` | Active | Runs five pinned libFuzzer targets for decode, encode/decode invariants, path lookup, tagged render/import, and migration; the bounded gate executes 128 coverage-guided units each (640 total) from 57 assembled seeds | Longer campaigns and newly retained regression inputs extend the same targets |
| `npm run test:browser` | Active | Rebuilds and validates the non-database browser example, then lists two cases expanded across Chromium, Firefox, and WebKit (6 tests in 2 files): bundle instantiation plus bounded replay of all 24 immutable HDoc fuzz seeds through a real-browser CRC/directory probe | `P11-014` expands the same suite to product lifecycle/capability/storage behavior |
| `npm run test:crash` | Reserved | Requires only the crash-history contract README | Storage crash/reopen histories under `P05-021` |
| `npm run test:benchmark` | Active | Compiles all eight crates, validates the P02-014 calibration, records 600 samples/9,600 timed HDoc iterations, and verifies the two-experiment decision authority with 13 rejection canaries | No timing value gates this command; HDoc 1.0 remains self-contained |
| `npm run test:distributed` | Reserved | Requires only the distributed-history contract README | Deterministic replication simulations under `P17-016` |

`npm run test:all` runs the eight commands in manifest order and is also the root `npm run test` behavior. It includes the benchmark-profile compilation, so focused development should use the narrowest relevant command. `npm run test:commands` validates the manifest, package aliases, Cargo metadata, list/describe interface, documentation, and rejection behavior without running the feature suites.

## Execution boundaries

The common runner invokes fixed program/argument arrays without a shell. Cargo commands are frozen/offline; suite scripts never install a dependency, browser binary, container image, or toolchain. A command may read existing cached tools selected by the pinned Rust and npm policies, but mutable setup remains an explicit bootstrap or CI responsibility.

The unit command selects Rust library targets so integration, examples, binaries, and doctests cannot drift into its count accidentally. JavaScript uses Vitest's explicit empty-suite switch only while the manifest records zero files. The conformance command is offline and deterministic: it validates committed MongoDB observations but does not start MongoDB. The separately retained Phase 1 live differential remains an evidence/gate workflow until a later differential command policy is accepted.

The active integration command runs its dedicated Vitest configuration and invokes Cargo with a
fixed frozen/offline argument vector. The Rust oracle uses the production validating decoder and
lossless tagged renderer. The TypeScript reader independently validates the envelope CRC, expands
profile-1 LZ4 blocks, reconstructs every type/container, and recomputes the complete typed BLAKE3
tree; it does not treat the manifest or footer digest as its expected answer.

The active fuzz command requires exact `cargo-fuzz 0.13.2`, `libfuzzer-sys 0.4.13`, and
`nightly-2026-06-30` identities. It never installs tools or accesses the network: local setup and CI
perform that explicit mutable step first, then the common runner uses only the locked fuzz graph.
Each smoke works in ignored target directories, binds the 24 immutable HDoc files plus committed
entry-point seeds, requires libFuzzer coverage/final-stat markers, and fails on crashes, sanitizer
findings, timeouts, missing corpora, or tool drift. Fixed run/input/time/RSS bounds keep the root
suite deterministic in duration without relabeling P03-018 property loops as fuzzing.

The [`P02-013` product coverage command](code-coverage-policy.md) is a quality gate over the same Rust library tests, not a ninth feature-suite alias. It recompiles with exact instrumentation, excludes test-only source ranges from the denominator, and enforces product/critical thresholds. `test:unit` remains the stable behavior command; `coverage:check` remains the bounded reporting command.

The active browser command first builds and structurally checks the fixed example and then uses Playwright list mode. It does not install or execute Chromium, Firefox, or WebKit; explicit `browser:install`, `browser:smoke`, and CI commands own that network/platform boundary under the [P02-010/P02-016 validation contract](../architecture/wasm-browser-smoke-validation.md).

The active benchmark command uses the accepted `bench` compilation profile and the
[versioned result contract](benchmark-results.md). It retains the P02-014 Node SHA-256 calibration
and adds P03-020 production HDoc encode/decode/direct-field/path measurements over minimal,
mixed-type, nested-fanout, wide, and compressible shapes. Raw/summary artifacts bind exact source,
environment, sizes, dictionary arithmetic, and all 600 samples. Integrity and completeness gate;
timings do not. Storage, concurrency, cross-machine comparison, and decisions remain outside this
task.

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

This command surface proves stable orchestration, exact inventories, cross-language golden parity,
and bounded coverage-guided HDoc fuzz execution. It does not prove exhaustive fuzz coverage,
browser product support, crash safety, benchmark performance, distributed correctness, production
readiness, or `G02` closure. Those claims remain blocked on their named implementation tasks and
retained evidence.

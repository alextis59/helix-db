# Cross-Component Tests

Unit tests remain beside their implementation where idiomatic. This root is reserved for behavior spanning crates, processes, browser lifecycles, storage recovery, or cluster nodes.

- `crash/` owns deterministic fault-point and recovery histories.
- `differential/` owns backend/reference result comparisons.
- `browser/` owns real-browser lifecycle and capability tests.
- `distributed/` owns simulation, multi-process, and consistency histories.
- `fuzz/` owns coverage-guided targets, bounded smoke invocations, and reproducers.
- `integration/` owns cross-crate, cross-language, and multi-process behavior.
- `toolchain/` owns build-profile/configuration verification that precedes feature suites.

The versioned [`suites.json`](suites.json) manifest and [`run-suite.mjs`](run-suite.mjs) implement the [stable test command policy](../docs/quality/test-command-surface.md). Run `npm run test:commands` to verify the surface or `npm run test:all` to execute every active authority and reserved-state probe. The separate [product coverage gate](../docs/quality/code-coverage-policy.md) replays Rust library tests with compiler-matched instrumentation and does not turn empty system-test directories into coverage claims. CI retains the semantic replay and coverage report as strict 30-day diagnostic bundles; anything used by a gate or release must be promoted under the [artifact-retention contract](../docs/quality/artifact-retention.md).

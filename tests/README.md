# Cross-Component Tests

Unit tests remain beside their implementation where idiomatic. This root is reserved for behavior spanning crates, processes, browser lifecycles, storage recovery, or cluster nodes.

- `crash/` owns deterministic fault-point and recovery histories.
- `differential/` owns backend/reference result comparisons.
- `browser/` owns real-browser lifecycle and capability tests.
- `distributed/` owns simulation, multi-process, and consistency histories.
- `toolchain/` owns build-profile/configuration verification that precedes feature suites.

These are directory contracts only; no system-test coverage is claimed yet.

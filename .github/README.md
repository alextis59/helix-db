# GitHub Automation

- [`ci/matrix.json`](ci/matrix.json) is the machine authority for gating/nightly/observational runners, architectures, Node lines, Rust targets/artifacts, browser projects, action pins, and explicit exclusions.
- [`ci/wasm-tools.json`](ci/wasm-tools.json) pins the official component validator release archive, executable, and license texts by size and SHA-256.
- [`ci/npm-license-inventory.json`](ci/npm-license-inventory.json) binds all locked npm tarballs to verified root license/notice file identities and reviewed omissions.
- [`workflows/ci.yml`](workflows/ci.yml) runs the 11 gating lanes, including deterministic dependency inventory, a Node 22 advisory/signature/provenance observation, compiler-matched Rust coverage thresholds on Linux x64, validated Wasm artifacts, real three-engine bundle smoke, and Chromium Dawn/SwiftShader WGSL fixture compilation, on `main` pushes, pull requests, and manual dispatch. It collects semantic/dependency, coverage, and per-engine browser reports on every outcome and retains their strict bundles for 30 days.
- [`workflows/ci-nightly.yml`](workflows/ci-nightly.yml) runs the two extended native architecture lanes on schedule or manual dispatch.
- [`workflows/benchmark-baseline.yml`](workflows/benchmark-baseline.yml) runs one scheduled/manual non-gating benchmark harness calibration and preserves its integrity-checked raw result and summary for 30 days with full-SHA-pinned `upload-artifact`.

The [CI policy](../docs/architecture/continuous-integration.md) defines claim, security, update, and promotion boundaries. The [artifact-retention policy](../docs/quality/artifact-retention.md) defines bundle contents, failure behavior, expiry, sensitivity, and durable promotion. Workflow edits must keep full action SHAs, read-only permissions, fixed runner labels, bounded timeouts, and the matrix checker passing.

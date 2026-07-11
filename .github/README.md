# GitHub Automation

- [`ci/matrix.json`](ci/matrix.json) is the machine authority for gating/nightly runners, architectures, Node lines, Rust targets/artifacts, browser projects, action pins, and explicit exclusions.
- [`ci/wasm-tools.json`](ci/wasm-tools.json) pins the official component validator release archive and executable by size and SHA-256.
- [`workflows/ci.yml`](workflows/ci.yml) runs the 11 gating lanes, including validated Wasm artifacts, real three-engine bundle smoke, and Chromium Dawn/SwiftShader WGSL fixture compilation, on `main` pushes, pull requests, and manual dispatch.
- [`workflows/ci-nightly.yml`](workflows/ci-nightly.yml) runs the two extended native architecture lanes on schedule or manual dispatch.

The [CI policy](../docs/architecture/continuous-integration.md) defines claim, security, update, and promotion boundaries. Workflow edits must keep full action SHAs, read-only permissions, fixed runner labels, bounded timeouts, and the matrix checker passing.

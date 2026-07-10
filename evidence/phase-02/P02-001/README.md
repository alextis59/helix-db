# P02-001 Rust Workspace Boundary Evidence

- Task: `P02-001` — create the Rust workspace and initial crate boundaries consistent with the Study's proposed dependency direction
- Requirements: `INV-003`, `INV-004`, `CORE-001`, `CORE-003`
- Accepted decision: [ADR 0001](../../../docs/adr/0001-public-product-identity.md)
- Commit under test: `0537431900eb934b2bc260b492d16a3a4f8f4b43`
- Recorded at: `2026-07-10T23:03:50Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Verdict: Pass

## Scope

This step establishes eight unpublished Rust `0.0.0` crate boundaries and their allowed direct dependency graph. It creates only boundary constants, documentation, metadata, optional-feature wiring, and nine all-feature boundary tests. It does not implement a document codec, query engine, storage engine, host capability, GPU runtime, server, protocol, or other database behavior.

The workspace follows the Study's dependency direction:

- `helix-doc` is the leaf value/semantic boundary;
- query and storage are separate consumers of document semantics;
- rebuildable columnar code consumes semantic/query contracts, not storage internals;
- `helix-core` composes deterministic crates without depending on host, server, or GPU crates;
- `helix-gpu` sees only document/query/columnar boundaries and is not on the correctness path;
- `helix-host-native` owns the only optional GPU edge; and
- `helix-server` is an outer leaf over the native host.

The exact graph, forbidden edges, maturity boundary, and change rule are documented in [Rust Workspace and Initial Crate Boundaries](../../../docs/architecture/workspace-boundaries.md).

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
rustc: 1.96.1 (31fca3adb 2026-06-26)
cargo: 1.96.1 (356927216 2026-06-26)
rustup: 1.29.0 (28d1352db 2026-03-05)
network: CARGO_NET_OFFLINE=true for immutable replay
```

The active toolchain is recorded but not yet pinned by the repository. Toolchain/MSRV/target/component selection belongs to `P02-002`.

## Commands

```bash
git diff --check 0537431900eb934b2bc260b492d16a3a4f8f4b43^ 0537431900eb934b2bc260b492d16a3a4f8f4b43
cargo metadata --frozen --format-version 1 --no-deps
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets
cargo check --frozen --workspace --all-targets --all-features
cargo test --frozen --workspace
cargo test --frozen --workspace --all-features
RUSTDOCFLAGS='-D warnings' cargo doc --frozen --workspace --no-deps --all-features
node evidence/phase-02/P02-001/verify.mjs 0537431900eb934b2bc260b492d16a3a4f8f4b43
```

The committed verifier reconstructs the exact workspace in a temporary directory, forces Cargo offline/frozen mode, and runs the commands there. It independently parses Cargo metadata rather than trusting the source diagram.

## Results

- Exact artifact commit scope: 23 files; no unrelated file.
- Workspace inventory: eight packages, all version `0.0.0`, edition 2024, MIT, and `publish = false`.
- Maturity inventory: eight `boundary-skeleton` packages; eight `database-functionality = false` markers.
- Dependency inventory: 14 direct internal edges, exactly one optional edge, zero external dependencies, zero cycles.
- Portable-core boundary: no direct host, server, or GPU edge.
- GPU boundary: no storage, core, host, or server edge; native host feature is disabled by default and explicit when enabled.
- Default-feature build/test: pass; eight unit tests passed.
- All-feature build/test: pass; nine unit tests passed, including optional GPU wiring.
- Rust formatting: pass.
- Rust documentation with warnings denied: pass, zero warnings.
- Cargo lock: version 4 with only the eight workspace packages; frozen replay produces no drift.
- Repository documentation at source commit: 89 Markdown files and 705 resolving local links.
- Generated `target/` output is ignored and absent from Git status.

## Diagnostic attempt retained

An additional pre-policy command, `cargo clippy --locked --workspace --all-targets --all-features -- -D warnings`, exited 1 because `cargo-clippy` is not installed for the currently active unpinned toolchain. Clippy was not a `P02-001` acceptance command. `P02-002` must select/pin the toolchain and components; `P02-006` must configure the lint policy. This failure is recorded rather than silently omitted and does not weaken either later task.

## Review and limitations

Focused review checked dependency direction, cycles, authoritative/derived separation, deterministic core versus ambient host access, optional GPU isolation, publication prohibition, package identity, source/docs wording, default/all-feature behavior, and clean generated-output handling. No blocking P02-001 finding remains.

The workspace does not yet provide:

- a repository-pinned Rust toolchain, MSRV, formatter/linter components, or Wasm target policy (`P02-002`);
- JavaScript/TypeScript package management or browser tooling (`P02-003`);
- the full repository directory/test/benchmark layout (`P02-004` and later tasks);
- CI, coverage, dependency/license scanning, packaging, examples, or clean-machine proof; or
- database functionality of any kind.

Machine-readable commands, counts, artifact identities, the retained diagnostic attempt, and verifier identity are in [manifest.json](manifest.json).

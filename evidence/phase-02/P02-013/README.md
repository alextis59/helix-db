# P02-013 Rust Product Coverage Evidence

- Task: `P02-013` — add code coverage reporting with explicit exclusions and minimum thresholds
  for semantic and recovery-critical modules
- Requirements supported: `INV-007`, `QUAL-001`
- Commit under test: `1909ecc756d7ae6130213f4e4ac573cfe84659a8`
- Recorded at: `2026-07-11T03:30:44Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Accepted ADRs: none
- Verdict: Pass

## Scope and result

The source commit converts the existing raw Rust instrumentation profile into an enforceable,
versioned product-coverage gate:

- the exact Rust 1.96.1 toolchain now installs its matching `llvm-tools` component;
- [`helix.rust-coverage-policy/1`](../../../tests/toolchain/rust-coverage-policy.json) fixes the
  Linux x64 lane, Cargo arguments, tool identities, execution bounds, source classification,
  exclusions, group mappings, thresholds, output schema, and size cap;
- the [bounded runner](../../../tests/toolchain/check-rust-coverage.mjs) compiles and executes all
  eight library-test binaries, merges eight unique raw profiles, normalizes LLVM's export, and
  enforces integer threshold comparisons;
- all eight inline unit-test modules have validated start/end markers and are removed from the
  product denominator without removing their execution from the raw LLVM record; and
- the Linux x64 native CI lane executes the full report after the ordinary strict native suite.

No Cargo or npm dependency changed. `llvm-profdata` and `llvm-cov` are resolved directly from the
pinned compiler sysroot, not from a floating Cargo plugin or operating-system LLVM package.

## Threshold authority

| Group | Included sources | Lines | Functions | Regions | Branches | Per-file |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `workspace-product` | all crate `src/` files | 90% | 90% | 85% | 85% | No |
| `semantic-critical` | `helix-doc`, `helix-query`, `helix-core` | 100% | 100% | 95% | 95% | Yes |
| `recovery-critical` | `helix-storage`, `helix-core` | 100% | 100% | 95% | 95% | Yes |

Metrics are basis-point integers. The comparison uses exact covered/count multiplication, so
display rounding cannot turn a failure into a pass. A zero-count metric is `null`, never 100%.

## Honest bootstrap denominator

The retained [coverage report](reports/rust-coverage.json) distinguishes test reachability from
product reachability:

| Measurement | Functions | Lines | Regions | Branches |
| --- | ---: | ---: | ---: | ---: |
| Raw LLVM totals including unit tests | 9/9 | 36/36 | 38/38 | 0 |
| Product totals after reviewed exclusions | 0 | 0 | 0 | 0 |

The eight Phase 2 crates still contain constants and test harnesses but no executable database
function. Reporting the raw 100% total as product coverage would be misleading. Instead,
`helix.rust-coverage-report/1` records a bounded empty-product exception tied to
`status = "boundary-skeleton"`, `database-functionality = false`, and revalidation at `P03-008`.

The exception does not suppress nonempty code. Evidence adds an uncovered semantic function and an
uncovered recovery function independently; each activates the denominator and fails its aggregate
and per-file critical thresholds. A separate covered recovery function, invoked by the real unit
test, activates three product lines/three regions/one function and passes all applicable metrics at
100%. After restoring the source, the clean report returns byte for byte.

## Report identity

The retained report is 15,650 bytes with SHA-256
`2ff8c9fae4a3d8e5cb3f0063a0a76c1805afcc9f222caf01e578746bb87183f2`.
It binds:

- `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, the policy, and the runner source;
- Rust 1.96.1, compiler LLVM 22.1.2, LLVM export 3.1.0, and host triple;
- exact `llvm-cov` and `llvm-profdata` byte counts and SHA-256 hashes;
- eight test-binary identities, eight nonempty raw profiles, and nine executed tests;
- every product source path and SHA-256;
- eight exact inline exclusion line ranges and the single path-rule class;
- raw LLVM totals including test code;
- each group's source inventory, thresholds, per-file posture, empty/nonempty state, metrics, and
  verdict; and
- the top-level pass verdict.

Repeated runs under Node 22.23.1, Node 24.18.0, the working tree root, and a different temporary
checkout root all produced the exact same report digest.

## Independent clean replay

The committed [verifier](verify.mjs) resolves the exact source commit, requires its exact 28-file
scope, and verifies every byte count and digest in the [evidence manifest](manifest.json). It
validates the retained report independently, including its source/tool/policy bindings, honest
null metrics, exclusion markers/ranges, group mappings, threshold values, raw test totals, and
empty-scope deadline.

It then extracts the source commit into a temporary repository and performs:

- independent YAML parsing of eight jobs and 42 workflow steps;
- clean lifecycle-suppressed installs under Node 22.23.1 and 24.18.0, both with npm 11.18.0;
- policy and full coverage execution on both Node lines, with byte-for-byte retained-report
  comparison;
- JavaScript formatting/linting, dependency policy, CI contract, TypeScript, fixture, and aggregate
  suite replay on Node 22;
- native format, frozen all-target/all-feature check, Clippy, and all-feature tests; and
- the rejection and activation mutations below, followed by one final exact clean report and clean
  source status.

The broader source gate additionally passed warning-free rustdoc, both portable-target Clippy
builds, Linux x64 ASan, WASIp2 component and browser core-module validation, trusted WGSL
compilation, and Chromium/Firefox/WebKit bundle smoke.

## Negative verification

The verifier requires eighteen independent rejection canaries to fail:

1. pass an unsupported coverage mode;
2. lower the semantic-critical line threshold;
3. remove `helix-core` from the semantic-critical mapping;
4. remove `llvm-tools` from the pinned toolchain;
5. duplicate an inline exclusion start marker;
6. place `#[cfg(test)]` outside a reviewed exclusion;
7. append source after the supposedly terminal test-only range;
8. remove a critical source file from the source inventory;
9. inject ambient `RUSTFLAGS`;
10. inject ambient `CARGO_ENCODED_RUSTFLAGS`;
11. redirect `LLVM_PROFILE_FILE`;
12. redirect `CARGO_TARGET_DIR`;
13. replace `rustc` with a wrong-version command;
14. change the workspace `database-functionality` authority;
15. add an uncovered semantic product function;
16. add an uncovered recovery product function;
17. make a real unit test fail; and
18. replace full CI coverage execution with policy-only validation.

Every canary must reach its intended reason. A nonzero exit for an unrelated compiler, parser, or
setup failure does not count.

## Positive activation verification

The activation canary adds one temporary recovery function and calls it from the existing storage
unit test. The report must:

- remove the empty-product exception;
- inventory one product function, three product lines, and three product regions;
- record 100% for those metrics in both `workspace-product` and `recovery-critical`;
- keep semantic-critical honestly empty; and
- return to the retained empty-skeleton digest after restoration.

This proves that the exception is an honest bootstrap state, not a permanent threshold bypass.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
rustc: 1.96.1 (31fca3adb 2026-06-26)
cargo: 1.96.1 (356927216 2026-06-26)
compiler/report LLVM: 22.1.2-rust-1.96.1-stable
llvm-cov: 639,704 bytes / c7fdde9c0db66a68a4f55a4d757030c16c085c951593304ad8985fda92b955d0
llvm-profdata: 666,984 bytes / ac5964e5d8f2cd08c6c95a0413c6e3233dbbbc2100f1289c2d032d32acca413b
active Node.js: v22.19.0
supported Node replay: 22.23.1, 24.18.0
Corepack: 0.34.0
npm through Corepack: 11.18.0
```

## Reproduction commands

```bash
corepack npm ci --ignore-scripts
corepack npm run coverage:policy
corepack npm run coverage:check
jq . dist/coverage/rust-coverage.json
corepack npm run ci:check
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run toolchain:types
corepack npm run fixtures:check
corepack npm test
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
node evidence/phase-02/P02-013/verify.mjs 1909ecc756d7ae6130213f4e4ac573cfe84659a8
```

## Retained diagnostic attempts

1. LLVM's first unfiltered summary was a perfect 9/9 functions, 36/36 lines, and 38/38 regions.
   Inspection showed that every executable region was unit-test code. The final report preserves
   those totals but removes eight strictly validated inline test ranges from product metrics.
2. The first execution bound required exactly nine tests. That would make adding a legitimate test
   fail coverage setup before measuring it. The authority now requires at least nine and caps the
   run at 100,000, while evidence still records the exact current nine.
3. The report was run from two different checkout paths to test whether absolute LLVM source paths
   or Cargo object names leaked into output. Path normalization and stable objects reproduced the
   same digest.
4. The initial report input set omitted the runner's own hash. Because parser logic determines the
   denominator, the final schema binds the exact runner source as well as its policy.
5. The first evidence source-removal canary expected the semantic group minimum. The global
   eight-file inventory guard correctly failed earlier; evidence now asserts that stronger first
   boundary.
6. The first maturity canary expected the downstream empty-denominator guard. The authoritative
   workspace-metadata check rejected the changed functionality flag earlier, so evidence records
   that fail-closed ordering.

## Limitations

Coverage measures execution, not assertion strength, input diversity, mutation score, or semantic
correctness. There is currently no executable product code and therefore no product percentage.
The report proves the pipeline, classifications, thresholds, and failure behavior—not database
implementation coverage.

Branch metrics remain `null` until Rust/LLVM emits a mapped product branch. The configured branch
threshold then applies automatically. Doc tests, integration tests, examples, benchmarks, fuzz
targets, browser JavaScript, WGSL, external binaries, and future multi-process crash histories need
their own owning suites and coverage/evidence decisions; they are not silently included here.

The authoritative coverage lane is Linux x64. Windows/macOS/arm64 still run strict builds/tests but
their incompatible objects are not merged into this denominator. CI artifact retention remains
`P02-015`, first executable HDoc code must revalidate the empty-scope rule at `P03-008`, and
independent gate acceptance remains required before `G02` can close.

The local branch is not pushed, so the edited workflow has not run on GitHub-hosted infrastructure.

# Rust Product Code Coverage Policy

- Status: Active for the deterministic HDoc codec
- Last updated: 2026-07-11
- Owner: Quality owner with storage and query-semantics review
- Plan item: `P02-013`
- Governing requirements: `INV-007`, `QUAL-001`
- Governing gate: `G02`
- Machine authority:
  [`helix.rust-coverage-policy/1`](../../tests/toolchain/rust-coverage-policy.json)
- Report entry point:
  [`check-rust-coverage.mjs`](../../tests/toolchain/check-rust-coverage.mjs)
- Build profile: [Native, Wasm, browser, diagnostic, and benchmark profiles](../architecture/build-profiles.md)

This policy turns the raw `-C instrument-coverage` profile into a bounded, machine-enforced source
coverage report. It separates product code from test harness code, applies stricter thresholds to
semantic and recovery-critical crates, and fails closed when covered source, compiler tools,
thresholds, exclusions, or workspace maturity drift.

Coverage is evidence that executed tests reached instrumented code. It is not proof that assertions
are correct, that fault histories are complete, or that every input class was explored. Coverage
supplements semantic conformance, differential, corruption, crash, recovery, fuzz, and
CPU/GPU-equivalence gates; it never substitutes for them.

## Exact toolchain

The repository installs the `llvm-tools` rustup component through the exact Rust 1.96.1 toolchain.
The report runner resolves `llvm-profdata` and `llvm-cov` inside that toolchain's sysroot instead of
using an ambient operating-system LLVM or a floating Cargo plugin.

The accepted Linux x64 baseline is:

| Tool | Required identity |
| --- | --- |
| `rustc` | 1.96.1 |
| compiler LLVM | 22.1.2 |
| `llvm-profdata` | 22.1.2 built for Rust 1.96.1 stable |
| `llvm-cov` | 22.1.2 built for Rust 1.96.1 stable |
| LLVM coverage export | `llvm.coverage.json.export` 3.1.0 |

The runner records the exact reporting-binary sizes and SHA-256 hashes in each output. This is
important because raw profile compatibility may require the exact LLVM version used by `rustc`.
The component is still an as-is Rust distribution component whose individual tools are not covered
by Rust's normal stability promise. Toolchain upgrades must therefore replay the report parser and
all negative canaries.

## Bounded execution

`corepack npm run coverage:check` performs one fixed sequence:

1. reject ambient `RUSTFLAGS`, `CARGO_ENCODED_RUSTFLAGS`, `LLVM_PROFILE_FILE`, and
   `CARGO_TARGET_DIR`;
2. validate the machine policy, source inventory, explicit exclusions, Cargo profile, and rustup
   component declaration;
3. delete only ignored `target/coverage`, `target/coverage-profiles`, and `dist/coverage` outputs;
4. build every workspace library test binary with frozen/offline Cargo, the `coverage` profile,
   all features, and exactly `-C instrument-coverage`;
5. execute every discovered test binary once with a unique `%p-%m.profraw` destination;
6. merge all nonempty raw profiles with the compiler-matched `llvm-profdata`;
7. export all test objects together with the compiler-matched `llvm-cov`;
8. normalize repository paths, exclude only reviewed test-code ranges, calculate file/group
   product metrics, and enforce thresholds by integer cross multiplication; and
9. write a deterministic report to ignored `dist/coverage/rust-coverage.json`.

The runner accepts only `policy` or `run`. There are no passthrough Cargo arguments, object paths,
profile paths, source filters, threshold overrides, environment selectors, or skip flags. The
`policy` mode performs the static contract checks without building; CI-contract validation uses
that mode.

## Product source and explicit exclusions

Product coverage includes every Rust file matching:

```text
^crates/[^/]+/src/.+\.rs$
```

New source files under a crate's `src/` tree enter the denominator automatically. Coverage data for
another repository-owned path must match an explicit path rule or the runner fails it as
unclassified. The only path rule currently excludes Rust sources under crate `tests/`, `benches/`,
or `examples/` directories because those are harnesses/workloads, not product implementation.
There is no generic generated-code, difficult-code, platform-code, unsafe-code, or low-value-code
exclusion.

The current unit tests remain inline in `src/lib.rs`. Each is enclosed by the exact markers:

```rust
// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    // test-only code
}
// helix-coverage: exclude-end unit-tests
```

An inline exclusion is valid only when:

- the markers pair exactly and appear at most once in a source file;
- the start marker is immediately followed by `#[cfg(test)]` and `mod tests {`;
- the excluded unit-test module is the final source item;
- every `#[cfg(test)]` line is inside the declared range; and
- no LLVM region crosses from included product code into the excluded range.

These rules prevent a marker from hiding a production function or arbitrary uncovered block.
Moving tests to a separate test path is allowed and removes the need for an inline range; adding a
new exclusion category requires a reviewed machine-policy change and negative evidence.

The report retains every source path/hash and every excluded line interval/reason. It also keeps
LLVM's raw totals including tests separately, so a superficially perfect harness total cannot be
mistaken for product coverage.

## Threshold groups

Percentages are stored as integer basis points. A threshold passes only when
`covered * 10,000 >= threshold * count`; displayed rounding cannot turn a failure into a pass.
Metrics with no instrumented items are reported as `null` rather than `100%`.

| Group | Included product sources | Line | Function | Region | Branch | Per-file |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `workspace-product` | Every crate `src/` file | 90% | 90% | 85% | 85% | Aggregate |
| `semantic-critical` | `helix-doc`, `helix-query`, `helix-core` | 100% | 100% | 95% | 95% | Yes |
| `recovery-critical` | `helix-storage`, `helix-core` | 100% | 100% | 95% | 95% | Yes |

`helix-core` intentionally belongs to both critical groups: deterministic orchestration can change
semantic results and recovery decisions. Future code under the named crate source trees is covered
without editing this table. Moving critical behavior into another crate requires updating the
machine group before the move can pass review.

Line coverage is derived from executable LLVM source segments after exclusions. Function, region,
and branch records emitted into multiple Cargo test objects are deduplicated by source coordinates
before their execution counts are combined. Branch outcomes are counted only when the compiler
emits branch mappings. A zero-count metric is not a free pass for a nonempty metric: every
metric that exists is enforced, while absent branch instrumentation remains visible as `null`.

Critical groups enforce the same threshold on each file that has an instrumented product metric.
One fully covered file therefore cannot hide a second partially covered critical file.

## Historical Phase 2 empty scope and active HDoc value scope

At `P02-013` the eight Rust crates contain boundary constants and unit-test harnesses but no
executable product function. LLVM reports 9 covered test functions, 36 test lines, and 38 test
regions; after the required test-only exclusions the product denominator is zero.

The runner does not report that as 100%. It emits an explicit empty-scope exception only while
Cargo workspace metadata states:

```text
status = "boundary-skeleton"
database-functionality = false
```

That exception was revalidated and expired when `P03-008` introduced the safe deterministic HDoc
encoder. `P03-009` expanded the same active semantic-critical scope with the whole-envelope
validating decoder, `P03-010` added borrowed/owned logical values, `P03-011` added exact-name/path
lookup, `P03-012` added strict lossless tagged JSON rendering/import, and `P03-013` added canonical
field-path dictionary snapshots plus successor/non-reuse validation, and `P03-014` added atomic
registration/resolution/recovery with immutable version pins, and `P03-015` added exact-1.0
closed-world negotiation/no-rewrite migration assessment. The active workspace
metadata is now:

```text
status = "hdoc-feature-negotiation"
database-functionality = true
```

This active state requires a nonempty product denominator and enforces every applicable threshold.
The historical exception still exists in the machine authority so an earlier source-bound report
can explain its posture, but changing the current metadata back to the skeleton state violates the
workspace bootstrap and implementation contract. Maturity metadata cannot hide uncovered code:
an active empty scope fails, while a nonempty scope always activates its thresholds.

The current clean report proves measured HDoc encoder/decoder/value-access/raw-lookup,
tagged-JSON, path-dictionary lifecycle, and feature/migration-negotiation coverage. It records workspace maturity and
database-functionality metadata alongside the executed
test and source identities.

## Report contract

`helix.rust-coverage-report/1` records:

- SHA-256 identities for `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, the policy, and the report runner itself;
- Rust/LLVM/host/export identities and exact report-tool binary hashes;
- the fixed Cargo arguments, test-object identities, raw-profile count, tests executed, and active
  workspace maturity/functionality markers;
- path and inline exclusion authorities plus the bounded empty-scope decision;
- unfiltered LLVM totals including tests;
- each product source path/hash and its branch/function/line/region metrics;
- each group's source inventory, thresholds, aggregate metrics, per-file posture, and verdict; and
- one top-level pass verdict.

The report is capped at 2 MiB. Raw profiles, merged profile data, binaries, and the raw LLVM export
remain ignored diagnostics. The Linux x64 lane copies the strict report into a source-bound replay
bundle and retains it for 30 days on every outcome. `P16-*` and `P24-*` own release evidence
packaging; a task, gate, or release must promote the report under the
[durable-retention policy](artifact-retention.md), binding its exact source commit and digest.

## CI placement

The Linux x64 native gating lane runs the full report after the normal format/check/Clippy/test
suite. Other native lanes still compile and test all features but do not claim duplicate coverage
measurements with platform-specific LLVM objects. This keeps one authoritative denominator and
avoids merging incompatible host objects.

The pinned rustup component is installed on every contributor/CI host by `rust-toolchain.toml` so
clean bootstrap is consistent. The full coverage command remains Linux x64 gating policy; changing
that lane or merging platform-specific coverage requires a reviewed report-version change.

## Failure behavior

The command fails on any of the following:

- unsupported mode or ambient build/profile override;
- policy/schema/threshold/group/source/exclusion drift;
- wrong Rust/LLVM/export identity or missing compiler-matched tools;
- malformed workspace maturity metadata;
- too few/many test objects or raw profiles, an empty profile, or a failing test;
- source outside the inclusion/exclusion classification;
- unpaired, misplaced, multiple, or nonterminal inline exclusions;
- `#[cfg(test)]` outside an exclusion or a region crossing its boundary;
- active product metadata with an empty product scope, or an empty scope outside the historical
  boundary-skeleton exception;
- aggregate or critical per-file threshold failure; or
- oversized/unwritable report output.

Evidence canaries must include at least an untested semantic function, an untested recovery
function, threshold weakening, exclusion abuse, source-inventory loss, tool identity drift, and an
ambient override. A canary counts only when it reaches the intended failure and the clean report
returns to the recorded digest afterward.

## Local commands

```bash
corepack npm run coverage:policy
corepack npm run coverage:check
jq . dist/coverage/rust-coverage.json
```

The raw profile runner remains available for build-profile diagnostics:

```bash
node tests/toolchain/run-build-profile.mjs coverage
```

That command proves only that instrumentation emitted raw profiles. Only `coverage:check` merges,
classifies, reports, and enforces product thresholds.

## Change rule

A coverage-policy change must explain the effect on correctness risk and denominator, regenerate a
clean report, and run failure canaries. Lowering a threshold, adding an exclusion, moving a
critical path, accepting an empty group, or changing reporting tools is a quality-gate change, not
formatting or CI maintenance.

Coverage regressions are fixed with tests or a reviewed removal of unreachable/dead product code.
They are not fixed by excluding files, adding `coverage(off)`, weakening features, removing test
objects, changing optimization to erase regions, or relabeling product code as a harness.

# P03-021 Evidence — HDoc Format and Dictionary Experiment Decisions

- Task: `P03-021`
- Verdict: **PASS**
- Source commit: `82c83f7b972410bb77553484f260bb2ff09883cc`
- Source base: `e7bd0d7374ec07023ee995e59b46da91bcfc8c9d`
- Final source tree: `3a9b090c679e0afb8aa62d1445b89accf3fb9a97`
- Accepted ADR: `0012`
- Experiments: `EXP-001`, `EXP-002`
- Requirements: `CORE-001`, `DATA-001`, `DATA-003`, `INV-001`, `INV-007`, `QUAL-001`
- Governing gate: `G03`
- Recorded: 2026-07-12 UTC

## Outcome

P03-021 interprets the immutable, source-bound P03-020 measurements without rewriting them or
adding a retroactive performance threshold. The closed
[`helix.hdoc-experiment-decisions/1`](../../../benchmarks/reports/hdoc-v1-decisions.json) authority
binds the exact raw and summary bytes, their clean source commit, both experiment outcomes, and the
claim boundary. A strict Draft 2020-12 schema and 13 mutation canaries reject input, conclusion,
profile, prerequisite, and claim drift.

`EXP-001` is accepted without a performance SLO. HDoc 1.0 keeps its self-contained base profile and
optional canonical compression profile 1. This decision combines semantic, corruption,
cross-language, property, fuzz, sanitizer, browser, and representative measurement evidence; no
machine-specific timing is promoted to a release claim.

`EXP-002` is partially supported and shape-dependent. The 10,000-document model retains one
negative minimal shape and four positive shapes. The collection path dictionary remains selected
for stable identifiers in derived sidecars, indexes, and planner metadata, but authoritative HDoc
1.0 rows do not store dictionary references and remain independently readable.

## Future row-reference boundary

A dictionary-reference row profile remains unimplemented. It requires all five conditions before
it can be proposed as a new negotiated profile:

1. A real-workload path-frequency corpus.
2. Atomic row/dictionary version-pin integration.
3. Read/write amplification and recovery benchmarks.
4. Cross-version migration and rollback proof.
5. A net-benefit policy that permits raw-name fallback.

## Verification

The verifier binds the source parent, tree, 34-file binary diff, and five decision authorities. It
then independently checks the exact P03-020 inputs, experiment outcomes, selected profiles,
shape-dependent dictionary facts, future prerequisites, documentation alignment, benchmark/CI
integration, offline JSON Schema validation, and all 13 rejection canaries.

Full local source gates also passed before the source commit: format, Clippy with warnings denied,
49 Rust tests, warning-free documentation, JavaScript policy, deterministic fixtures, all stable
test suites, 640 bounded fuzz executions, 600 HDoc benchmark samples/9,600 timed iterations,
4,565/4,565 product lines covered, and six real Chromium/Firefox/WebKit executions.

## Commands

```bash
cargo fmt --all -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
env RUSTDOCFLAGS='-D warnings' cargo doc --frozen --workspace --no-deps --all-features
corepack npm run policy:javascript
corepack npm run fixtures:check
corepack npm test
corepack npm run coverage:check
corepack npm run browser:smoke
python3 -m jsonschema -i benchmarks/reports/hdoc-v1-decisions.json benchmarks/schema/hdoc-decisions-v1.schema.json
node evidence/phase-03/P03-021/verify.mjs 82c83f7b972410bb77553484f260bb2ff09883cc
```

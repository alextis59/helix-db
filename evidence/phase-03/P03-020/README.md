# P03-020 Evidence — Representative HDoc Codec Benchmarks

- Task: `P03-020`
- Verdict: **PASS**
- Source commit: `fc95bb38d08be185775f96112f7cd018096aad1b`
- Source base: `fa9eb91a7c048786fa42a05fb3e07992c609f63b`
- Final source tree: `de2ef2c90a5478dbde79cf1d3b043000d549cb1e`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-001`, `DATA-003`, `INV-001`, `INV-007`, `QUAL-001`
- Governing gate: `G03`
- Recorded: 2026-07-12 UTC

## Outcome

P03-020 adds a source-bound production HDoc benchmark engine, two closed self-contained Draft
2020-12 report schemas, one exact workload authority, a raw-linked summary, and thirteen rejection
canaries. Five fixed shapes cover the minimal envelope, mixed logical types, 16-candidate nested
fan-out, 128 wide fields, and a 32-KiB compressible value. Each shape measures base and canonical
encoding, base and canonical validating decode, direct-field lookup, and dotted-path lookup.

The retained run records five warm-ups and 20 measurement samples of 16 iterations for all 30
shape/operation pairs: 600 raw samples and 9,600 timed iterations. Every operation is
correctness-checked and every size, content identity, candidate count, source identity, summary
distribution, and dictionary equation is validated. No timing value is an acceptance threshold;
`P03-021` owns interpretation.

## Exact size observations

| Shape | Base/logical bytes | Canonical stored bytes | Tagged JSON bytes | Compressed sections |
| --- | ---: | ---: | ---: | ---: |
| `minimal` | 336 | 336 | 74 | 0 |
| `mixed_types` | 888 | 888 | 942 | 0 |
| `nested_fanout` | 3,296 | 1,496 | 3,951 | 3 |
| `wide_128` | 8,464 | 4,056 | 9,108 | 3 |
| `compressible_32k` | 34,992 | 712 | 34,753 | 1 |

These are exact format facts for the fixed inputs, not machine-dependent timing claims.

## Dictionary byte model

The model encodes a real `helix.path-dictionary/1.0` snapshot, then compares 10,000 documents using
raw path-name bytes once per registered reference with the snapshot plus one u32 path ID per
reference. It does not claim that HDoc currently stores dictionary references.

| Shape | Snapshot bytes | Raw repeated names | Snapshot + IDs | Savings | Basis points |
| --- | ---: | ---: | ---: | ---: | ---: |
| `minimal` | 160 | 30,000 | 40,160 | -10,160 | -3,386 |
| `mixed_types` | 496 | 780,000 | 480,496 | 299,504 | 3,839 |
| `nested_fanout` | 440 | 900,000 | 360,440 | 539,560 | 5,995 |
| `wide_128` | 6,256 | 30,510,000 | 5,126,256 | 25,383,744 | 8,319 |
| `compressible_32k` | 224 | 180,000 | 120,224 | 59,776 | 3,320 |

The negative minimal result is retained rather than filtered. It is important input to P03-021's
coordination-complexity decision.

## Retained reports and verifier

- [`raw.json`](reports/raw.json): 24,725 bytes, exact environment/source identities and all samples.
- [`summary.json`](reports/summary.json): 14,033 bytes, exact raw hash and recomputed distributions.
- [`verify.mjs`](verify.mjs): binds the source commit/parent/tree/43-file binary diff, both retained
  report hashes, exact workload breadth and size/dictionary equations, live engine replay, all
  thirteen report mutations, and offline schema validation.

## Commands

```bash
cargo fmt --all -- --check
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
cargo test --frozen --workspace --all-features --no-fail-fast
env RUSTDOCFLAGS='-D warnings' cargo doc --frozen --workspace --no-deps --all-features
corepack npm run benchmark:hdoc:policy
corepack npm run benchmark:hdoc
corepack npm run benchmark:hdoc:check
corepack npm run benchmark:hdoc:test
corepack npm run test:benchmark
corepack npm test
corepack npm run coverage:check
node evidence/phase-03/P03-020/verify.mjs fc95bb38d08be185775f96112f7cd018096aad1b
```

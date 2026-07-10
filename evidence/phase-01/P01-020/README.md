# P01-020 Independent Semantic Oracle Evidence

- Task: `P01-020` — build a reference semantic interpreter or executable oracle independent of optimized physical operators
- Requirements: `INV-002`, `INV-007`, `CORE-002`, `DATA-001`, `DATA-002`, `QUERY-001`, `QUERY-002`, `GPU-002`, `SEC-002`
- Accepted decisions: [ADR 0008](../../../docs/adr/0008-use-one-portable-v1-limit-profile.md), [ADR 0010](../../../docs/adr/0010-use-id-order-as-the-native-default.md), [ADR 0011](../../../docs/adr/0011-use-tagged-json-semantic-fixtures.md)
- Commit under test: `23e5fc2d30aa3c5f1e81acd284008126020ce040`
- Recorded at: `2026-07-10T21:33:33Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the committed `helix-reference-oracle/1` implementation validates and independently executes the complete populated `helix-native-v1` corpus without importing its generator, integrity checker, an optimized/runtime operator, planner, codec, index, GPU kernel, or adapter. Action execution receives only the action and a fresh cloned sandbox; `step.expect` enters only the final comparison layer.

The oracle independently declares and reconciles all 17 value operations, 23 stable limits, 74 errors, strict raw JSON decoding, typed values, exact mixed-numeric comparison/arithmetic, Missing-aware paths, arrays, timestamps, vectors, command validation/query behavior, result ordering, state, manifests, and reports. Its committed deterministic report binds corpus manifest `ff4088…43e8`, records all 17 fixtures and 313 steps, and reports 313 pass, 0 fail, 0 skip.

Four mutation canaries alter expected value, error, order, and state independently and each produces its exact mismatch diagnostic. Unit/property/negative coverage totals 382 assertions, including comparison symmetry/antisymmetry/transitivity, decimal rounding, raw duplicate/prototype/Unicode/depth behavior, semantic-negative diagnostics, time offsets, vector scores, and unused capabilities.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
Git: 2.34.1
Node: v22.19.0
Python: 3.10.12
jsonschema: 4.23.0
```

Determinism was replayed under `TZ=Pacific/Kiritimati, LANG=C` and `TZ=America/Los_Angeles, LANG=tr_TR.UTF-8` (both with `LC_ALL=C`). Both produced the same checked canonical report hash.

## Commands

```bash
git diff --check 23e5fc2d30aa3c5f1e81acd284008126020ce040^ 23e5fc2d30aa3c5f1e81acd284008126020ce040
git diff-tree --no-commit-id --name-status -r 23e5fc2d30aa3c5f1e81acd284008126020ce040
node --check evidence/phase-01/P01-020/verify.mjs
node evidence/phase-01/P01-020/verify.mjs 23e5fc2d30aa3c5f1e81acd284008126020ce040
node reference/semantic-oracle/test-oracle.mjs
node reference/semantic-oracle/cli.mjs --check-report
node fixtures/semantic/generate-corpus.mjs --check
node fixtures/semantic/check-corpus.mjs
```

The committed [verify.mjs](verify.mjs) resolves the supplied commit, requires the exact 21-file artifact scope, checks formatting/JSON/local links/schema identity/document integration, and rejects forbidden generator/runtime/ambient imports. It extracts the committed oracle and complete semantic fixture tree to a temporary directory, syntax-checks every module, runs the 382-assertion test suite, checks/prints/reparses the report, repeats it under two environment profiles, replays all prior generator/corpus/example checks, validates three Draft 2020-12 schemas plus 17 cases/manifest/report, and prints immutable artifact hashes and sizes.

## Results

- Exact implementation artifact scope: 21 files, no unrelated path.
- Oracle unit/property/negative suite: 382 assertions passed.
- Expectation mutation canaries: value, error, order, and state all detected.
- Corpus execution: 17 fixtures; 313 passed; 0 failed; 0 skipped.
- Action execution: 15 structured commands, 18 raw inputs, and 280 value operations.
- Independent registries: 17 value operations, 23 limits, and all 74 errors reconciled.
- Draft 2020-12: 3 schemas, 17 cases, corpus manifest, and oracle report passed.
- Corpus manifest source SHA-256: `ff4088a1d791dabb8ecc6ffd885f3d08c09c55e1a08871312163d915e6b843e8`.
- Oracle report source SHA-256: `8427fc0d3a5e3c09fc9d4c89018822898b45f94b7a9abaef659b6ba9607d8d1f`.
- Oracle report canonical SHA-256: `155dc909a2a5133e1807937f745c3d2ff7ca7d5882529c3de55fe1a1197fac84`.
- Report bytes were identical when regenerated and under both alternate environment profiles.
- Original corpus generation/integrity, semantic negative, RFC 8785, and canonical example checks remained green.
- Strict parsing rejects duplicate keys, unpaired escapes, prototype pollution, invalid UTF-8, unsafe typed payloads, excessive depth/nodes, and report/path escapes.
- Formatting, terminal newlines, JSON parsing, and every changed local Markdown link passed.

## Artifacts

| Path | SHA-256 | Bytes |
| --- | --- | ---: |
| `README.md` | `b85126c5736cb57fd4fbb337aa65cdd2c066bc7d927f1f4787582c0337a853c2` | 1,363 |
| `Specifications.md` | `72a219f0cc7d8fd92961a17de5bde1016c5102c214ad4f099b2a1ad2fa6ac10d` | 72,992 |
| `docs/README.md` | `20e8f1f3461215dcea231e0c1108209e7612e486620c995a17704a02181e5248` | 5,885 |
| `docs/adr/0008-use-one-portable-v1-limit-profile.md` | `a2f6e40f82d0ffa185b86b28fd7fb1cbe2276d62fb44fde52ac6cf9c304d4a66` | 6,542 |
| `docs/adr/0010-use-id-order-as-the-native-default.md` | `ecd6b7153e175cd5dbf2d5ed29e1bc3ec6ce2fd3a4fb13372109bdc6289602f0` | 8,553 |
| `docs/adr/0011-use-tagged-json-semantic-fixtures.md` | `cac300761591d90e48374f87043ebcdc96b059d7e51dedf8d151b28da510ef26` | 9,805 |
| `docs/quality/semantic-fixture-format.md` | `6fae599990e0836a99c783adb468ee5062698fe5d1334c21e6effb3ba5163825` | 24,425 |
| `fixtures/semantic/COVERAGE.md` | `a8ca1ad9cfa45d276b9a2526380d1dcbef466e901156deb319fde36ba4d720c7` | 8,188 |
| `fixtures/semantic/README.md` | `cb442263b34e7207196eae9038b1118ac2413b6a905612e0d51f5b56b56b1b3a` | 2,163 |
| `fixtures/semantic/oracle-report-v1.json` | `8427fc0d3a5e3c09fc9d4c89018822898b45f94b7a9abaef659b6ba9607d8d1f` | 4,863 |
| `fixtures/semantic/schema/semantic-oracle-report-v1.schema.json` | `6e380cdcc574dd3de74437fdc4b1785679ddf72d6a10616071294856394947aa` | 2,864 |
| `reference/semantic-oracle/README.md` | `c9cb9117e1a4c6ff15ac376fb64cb9a1c1f46906c7e8dbd9050c6fb09a662c3b` | 7,628 |
| `reference/semantic-oracle/canonical.mjs` | `99872bde86c7744140eef65b62dac77a87e4fab2e4d263eaa4c3dc2615da0b12` | 880 |
| `reference/semantic-oracle/cli.mjs` | `54ec79146f6c5b5065b6754871bc6804f66863638232a9e6dbcb76c81e1f8aed` | 3,289 |
| `reference/semantic-oracle/command.mjs` | `8518401683b3dc5ed18f10af92ffac854673650fb3271c3b795f38ab9216e273` | 12,714 |
| `reference/semantic-oracle/oracle.mjs` | `2be2ad0a6514550ceae36e7fea4398fd0453720155d871d2ae43b2111d2f96bd` | 15,441 |
| `reference/semantic-oracle/raw-json.mjs` | `068815063b8cfce1e69f3c7133cf0bea2d57e1243e667f34f3cfb421630f1a1c` | 9,440 |
| `reference/semantic-oracle/registry.mjs` | `f017675077c49bdbc3972cfa1b02cb8a502e633d8fb05b814aac21a4f6b8e5b9` | 7,831 |
| `reference/semantic-oracle/test-oracle.mjs` | `1555684f77e48a2fda2082adb996b47a2265a7cdf2c1308ffaa786a32e4f18c9` | 11,939 |
| `reference/semantic-oracle/validate.mjs` | `5236b411be2d3a83f5abc70f6cb94363cb6d7c047b8cd7e5666ae9cf746213ec` | 22,320 |
| `reference/semantic-oracle/value.mjs` | `1bb0e20120cc44913385a7e6f0c56430a7b2a396a45c5ae9743315158c6d3c01` | 33,058 |
| `evidence/phase-01/P01-020/verify.mjs` | `93dc0c7e2866021725f613585897bebff1bc915cd7789ebbdb0db52a5080b9ed` | 13,236 |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- The first property-test pass compared mathematical comparator zero with JavaScript `-0`; the assertion was corrected to normalize zero. No oracle result changed.
- The first semantic-negative pass let an example-only operation ID mask its intended duplicate/vector diagnostic. Typed-value semantic lint was moved ahead of operation-registry lint, matching the documented validation layers.
- Security review before the artifact commit added `__proto__`-safe property construction, universal unpaired-escape rejection, raw AST bounds, strict field-name/root-ID rules, path-candidate bounds, and canonical float NaN output, each with regression coverage.
- The first immutable evidence replay omitted two architecture-document dependencies required only by the supplemental legacy corpus checker. The evidence verifier's temporary extraction list was corrected; the commit under test did not change.
- No finalized required check failed and no corpus step was skipped.
- This is an executable test authority, not a storage engine or production database. The populated command corpus includes successful reference reads and validation failures; a valid successful update deliberately remains unsupported until later stateful CRUD/query work.
- Compact boundary actions do not materialize 64 MiB/million-element objects, and synthetic registered errors are not real authorization/GPU/durability/recovery fault injection. Later phases retain those proof duties.
- Draft validation currently invokes Python `jsonschema`; Phase 2 must lock tool versions and add independent Rust/TypeScript schema/JCS cross-checks.
- Only the current registered corpus action surface is frozen. Aggregation, mutation histories, cursors, persistence, MVCC, indexes, GPU, protocols, and adapters remain assigned to their plan phases.
- MongoDB differential evidence (`P01-021`), the published semantic/compatibility matrix (`P01-022`), and independent `G01` review remain open.

## Review

Focused review checked the action/expectation separation, registry independence, exact numeric rational comparison, decimal bounds/rounding, signed zero/NaN handling, type/object/array/vector order, strict RFC-shaped time parsing, Missing/path fan-out, normalized query behavior/order, error precedence/outcomes/retries, source/JCS hashes, schema/report reconciliation, prototype/Unicode/decompression/AST/path/file/report safety, capability isolation, deterministic output, explicit unsupported behavior, and later-phase ownership. No blocking finding remained in the committed oracle artifact.

## Reproduction

From a repository revision containing this evidence directory, verify that commit `23e5fc2d30aa3c5f1e81acd284008126020ce040` exists and run the commands above from the repository root. The verifier reconstructs the exact committed oracle/corpus tree in a temporary directory and prints the same pass markers and 21 artifact hashes/sizes recorded here and in [manifest.json](manifest.json).

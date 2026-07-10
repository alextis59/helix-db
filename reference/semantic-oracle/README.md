# HelixDB V1 Reference Semantic Oracle

- Status: Executable reference baseline
- Oracle profile: `helix-reference-oracle/1`
- Oracle version: `1.0.0`
- Semantic profile: `helix-native-v1`
- Fixture schema: `helix.semantic-fixture/1`
- Report schema: `helix.semantic-oracle-report/1`
- Plan item: `P01-020`
- Governing gate: `G01`

This directory contains the independent executable meaning of the populated semantic corpus. It validates exact fixture inputs, executes registered actions without an optimized database operator, and compares independently produced values, errors, order, and state with the normative expectations.

## Independence boundary

The oracle does not import or execute `generate-corpus.mjs`, `check-corpus.mjs`, a production query engine, an index codec, an HDoc codec, a planner, SIMD code, a GPU kernel, or a backend adapter. Its error, limit, operation, type-rank, numeric, path, command, and report registries are separately declared under `reference/semantic-oracle/` and reconciled against the committed corpus registries during validation.

The oracle reads expected values only in the final comparison layer. Action execution receives the action, a cloned sandbox state, and deterministic capabilities; it does not receive `step.expect`. Mutation canaries alter expected value, error, order, and state independently and must produce four exact failures.

`fixture.echo-order` is a synthetic registered test operation, not a database operator. For row index `i`, its profile contract derives keys without reading expectations: explicit sort uses `(1, i+2)`, vector rank uses `(float64(i+1), int32(i+1))`, pipeline order uses `(int32(1), i)`, input order uses `i`, and singleton/set forms use their named canonical shapes.

## Modules

| Module | Responsibility |
| --- | --- |
| `registry.mjs` | Frozen profiles, 17 operation arities, 23 limits, 74 error defaults, diagnostics |
| `canonical.mjs` | Independent fixture-profile RFC 8785 canonical bytes and SHA-256 |
| `value.mjs` | Typed validation, exact rational numeric comparison, decimal/integer arithmetic, equality/identity/order, paths, time, arrays, vectors |
| `raw-json.mjs` | Fatal UTF-8 decoding, duplicate-aware recursive JSON parsing, compression bounds, typed-wrapper validation |
| `command.mjs` | Registered normalized command grammar, invalid-command precedence, reference `find` filtering/projection/order |
| `validate.mjs` | Strict source, Draft 2020-12, semantic, registry, manifest/hash/coverage, and report validation |
| `oracle.mjs` | Sandboxes, action dispatch, normalized observations, expectation/state comparison, deterministic report assembly |
| `cli.mjs` | Reproduction, byte-for-byte report checking/writing, concise verdict output |
| `test-oracle.mjs` | Unit, property, semantic-negative, mutation-canary, and complete-corpus tests |

## Validation and execution layers

The CLI applies these layers in order:

1. Strict UTF-8 JSON token parsing with duplicate-property and unpaired-surrogate rejection.
2. Draft 2020-12 metaschema and instance validation for fixtures, corpus manifest, and oracle report.
3. Cross-field semantic lint for typed domains, profiles, canonical lists, collections/IDs, actions, errors, order, state, registries, and capabilities.
4. Exact source/canonical SHA-256, byte-size, disk/manifest, count, and requirement-coverage reconciliation.
5. Fresh per-fixture state/capability sandbox and independent action execution.
6. Exact value/order/error/state comparison with stable diagnostic and expected/actual hashes.
7. Zero-failure/zero-skip report reconciliation and byte-for-byte committed-report comparison.

Malformed fixtures are harness failures. Only `OracleExecutionError` becomes a normalized expected database error. Unknown profiles/operations and unused deterministic capability inputs fail explicitly.

## Implemented action surface

The v1 reference baseline executes all 17 registered value operations, strict raw JSON command input, invalid normalized commands, and the populated reference `find` subset. It covers exact typed round trips; semantic equality/identity/total order; checked integer/decimal/float operations; array predicates; Missing-aware path resolution; strict timestamp parsing; exact f16/f32 widening and vector scores; compact limit arithmetic; error envelopes; query predicates `$eq`, `$ne`, ranges, `$exists`, `$size`, `$all`, `$elemMatch`, and vector-combination validation; projection; explicit/default ordering; skip; and limit.

This does not claim that a production database exists. Successful update execution, aggregation, cursor lifecycle, persistence, MVCC, indexes, GPU kernels, protocols, adapters, and real fault injection remain assigned to their implementation phases. The current update command surface deliberately executes validation failures only; a valid update returns an unsupported-capability error until the later stateful reference engine exists.

Compact boundary actions prove independent maximum/relation/envelope arithmetic. They do not replace later real parser/allocation/decompression/atomicity boundary tests. Synthetic `fixture.raise-error` proves registry normalization, not the physical failure that would produce the error.

## Deterministic report

[oracle-report-v1.json](../../fixtures/semantic/oracle-report-v1.json) contains no wall clock, duration, hostname, path, locale, random value, or mutable tool version. It binds:

- oracle/report/fixture/semantic profile versions;
- exact SHA-256 of the corpus manifest source;
- fixture/step/pass/fail/skip totals;
- exact action and operation counts;
- one ordered observation hash per fixture;
- an all-or-error verdict.

The [report schema](../../fixtures/semantic/schema/semantic-oracle-report-v1.schema.json) rejects unknown fields. Any corpus, oracle, registry, observation, count, or formatting drift changes the checked output.

## Commands

```bash
node reference/semantic-oracle/test-oracle.mjs
node reference/semantic-oracle/cli.mjs --check-report
```

Maintainers regenerate only after an accepted semantic/corpus/oracle change:

```bash
node reference/semantic-oracle/cli.mjs --write-report
git diff -- fixtures/semantic/oracle-report-v1.json
node reference/semantic-oracle/cli.mjs --check-report
```

`--print-report` writes the deterministic report to stdout. `--no-draft-validation` is only a focused development option; recorded evidence and CI must keep Draft validation enabled.

## Security and resource behavior

- Corpus paths are resolved below the repository and case root; report paths cannot escape the repository.
- Raw bytes are size-checked before and after decompression; decoding is fatal and occurs exactly once.
- No fixture supplies code, callback, module path, network reference, ambient clock, randomness, locale, or timezone database.
- Every fixture receives cloned state and capability queues; no cache/state/capability leaks between fixtures.
- Error comparison excludes human messages, stacks, request identifiers, and opaque token contents.
- Reports contain only stable IDs, counts, and hashes; unit failures print bounded fixture/step diagnostics.

## Gate boundary

`P01-020` closes when the immutable artifact and its isolated evidence replay pass. `G01` remains open for the MongoDB differential harness (`P01-021`), published semantic/compatibility matrix (`P01-022`), resolution of any resulting semantic decision, and independent review. Later implementations consume this report and identify the same corpus manifest hash; they never turn an optimized implementation into the reference expectation source.

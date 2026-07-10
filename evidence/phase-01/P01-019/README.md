# P01-019 Populated Semantic Corpus Evidence

- Task: `P01-019` — populate scalar edges, Missing/null combinations, arrays, nested paths, invalid commands, and limit boundaries
- Requirements: `INV-002`, `INV-007`, `CORE-002`, `DATA-001`, `DATA-002`, `QUERY-001`, `QUERY-002`, `STORE-001`, `GPU-002`, `GPU-003`, `GPU-004`, `SEC-001`, `SEC-002`
- Accepted fixture-format decision: [ADR 0011](../../../docs/adr/0011-use-tagged-json-semantic-fixtures.md)
- Commit under test: `a490395e61f0f626abc4744f72f774a969da4632`
- Recorded at: `2026-07-10T20:58:26Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the committed `helix-native-v1` corpus has an exact, generated inventory of 17 schema-valid fixtures and 313 uniquely identified steps: 183 successes and 130 structured errors. The corpus covers all 16 observable value tags (15 logical types plus Missing), all 3 action kinds, all 8 ordering bases, 17 registered value operations, 23 stable `limits-v1` identifiers at below/at/above boundaries, and every one of the 74 `errors-v1` codes in 11 categories.

The cases include null, booleans, integer widths/bounds, binary64 special values, decimal128 finite/special bounds, mixed numeric behavior, strings/binary, time/date/identifiers, vectors, objects, dense/nested arrays, Missing/null/path fan-out, query array operators, projection/order interaction, invalid commands, malformed raw inputs, error envelopes, and deterministic result-order profiles.

The generator, source hashes, RFC 8785 fixture-profile hashes, manifest, coverage contract, operation registry, error-case registry, and human coverage ledger are byte-stable. This task freezes normative inputs and expectations; the independent executable semantic oracle is `P01-020`.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
Git: 2.34.1
Node: v22.19.0
Python: 3.10.12
jsonschema: 4.23.0
```

## Commands

```bash
git diff --check a490395e61f0f626abc4744f72f774a969da4632^ a490395e61f0f626abc4744f72f774a969da4632
git diff-tree --no-commit-id --name-status -r a490395e61f0f626abc4744f72f774a969da4632
node --check evidence/phase-01/P01-019/verify.mjs
node evidence/phase-01/P01-019/verify.mjs a490395e61f0f626abc4744f72f774a969da4632
python3 --version
python3 -c 'from importlib.metadata import version; print(version("jsonschema"))'
```

The committed [verify.mjs](verify.mjs) resolves the supplied commit, requires its exact 31-file scope, checks formatting/JSON/local links and hard-coded breadth contracts, independently recounts cases/outcomes/boundaries/errors, extracts the committed fixture tree to a temporary directory, validates both Draft 2020-12 schemas plus all 17 cases and the manifest, and executes the committed generator/corpus/semantic/canonical checkers there. It prints every immutable artifact hash and size.

## Results

- Exact artifact scope: 31 files, with no unrelated path.
- Draft 2020-12 validation: 2 schemas, 17 cases, and 1 manifest passed.
- Deterministic generation: all cases and four registries/manifests matched byte-for-byte.
- Independent recount: 17 fixtures, 313 unique steps, 183 successes, and 130 errors.
- Value/action/order breadth: 16 observable tags, 3 action kinds, 8 order bases, and all 17 registered operations.
- Limit breadth: all 23 documented stable limit IDs have exactly `below`, `at`, and `above` cases.
- Error breadth: all 74 documented codes in 11 categories match the structured registry cases.
- Integrity: all 17 source and canonical hashes, byte sizes, requirements, tags, paths, and counts reconcile.
- Safety: the generator contains no locale comparator, random source, or wall-clock API; raw-invalid and compact-boundary inputs remain bounded in repository size.
- Formatting, terminal newlines, JSON parsing, and all changed local Markdown links passed.

## Artifacts

| Path | SHA-256 | Bytes |
| --- | --- | ---: |
| `docs/architecture/error-semantics.md` | `641997fabcd4d1bc218f1a2d3ef10317a19c00926a23f7463d50591767536fdf` | 26,195 |
| `docs/architecture/floating-special-semantics.md` | `7326f9c17ec785a574dd15ab7622b0985665bbae61fd5bc01b5b214464c881a7` | 16,378 |
| `docs/architecture/limits-v1.md` | `afd00456f6582cbdc5197107c10557cf5317fd86fa88aa46e6d005358c616a4d` | 16,530 |
| `docs/architecture/numeric-semantics.md` | `fe76218e36b90e8889d598db6964853fc7bc062b9e5aabca31132b336da31be9` | 13,038 |
| `docs/quality/semantic-fixture-format.md` | `ae2b172d842a25e70fa051fd9c3fc6a266880e269beba2fe9204e7c7eeb757f9` | 22,144 |
| `fixtures/semantic/COVERAGE.md` | `996fcf7c4f4f072afd3994b201acc1ac9638a1bcb039e24758cef863020c4624` | 8,045 |
| `fixtures/semantic/README.md` | `c5570252e9952710cb27ef538982b9f191f8a9171928fb10032eb8729a0a4271` | 1,859 |
| `fixtures/semantic/cases/errors/registry.json` | `d17ce274018b27850c01b25fc6728fe243c95cf940e6b1d6600efc639f68b661` | 62,341 |
| `fixtures/semantic/cases/invalid/commands.json` | `2f1c6f578763ace0c5dfafa5b9193b15161f404fab49521aa5e16b5c7bb9ac3f` | 7,471 |
| `fixtures/semantic/cases/invalid/raw-inputs.json` | `0500ce98382cfd4e0d3e6a27817fdc5f6743bd8ff086ddde93f4d5dcf9c74e1b` | 16,262 |
| `fixtures/semantic/cases/limits/commands-queries.json` | `cb655502aa32bbf1eb0c3c21c9416b291c2732f2e1d070047d726eb698bbc319` | 59,436 |
| `fixtures/semantic/cases/limits/document-values.json` | `7488b899c5891125aa22ece2001dbf984ff7aa366eee5a3a3bef618084fa3d6f` | 54,726 |
| `fixtures/semantic/cases/ordering/profiles.json` | `4855bf9e979871f0186274e5ae44979767f0a8e9f94f3e147903bbec8786a798` | 10,190 |
| `fixtures/semantic/cases/presence/missing-null-paths.json` | `4cd2d9bf953c28dd3ac051d01d57a28dc1f7395998c2c42bb1ad65696e570fb5` | 21,491 |
| `fixtures/semantic/cases/query/missing-array-nested.json` | `5cab03c2b93ed826a8644a6bb6fbc20bf88ce704e1ef0e54813fde0bd376105d` | 36,500 |
| `fixtures/semantic/cases/scalar/decimal128-specials.json` | `92ae5b4b0cbac419b8c3337bdf10a1247120cba7f82849013b1127104cb67ff9` | 12,944 |
| `fixtures/semantic/cases/scalar/float64-specials.json` | `55a7ec4ee2c96f1d3ae5b0e4f5ee1306d96671c099249e1b1c5403a156b421a0` | 13,084 |
| `fixtures/semantic/cases/scalar/integers.json` | `7eaad5e906511765c2b7887fff030f6b78bad3dc909f4193e4d2b6db0d40d9b0` | 10,165 |
| `fixtures/semantic/cases/scalar/mixed-numeric.json` | `b60957b27028958d85389f8721e4687011104ef3261051dfca5285e66db066ae` | 6,133 |
| `fixtures/semantic/cases/scalar/null-bool.json` | `922bca2fc9b7e04a688362da21c5fd5c56abb6d7f264c06793520cc1731ea708` | 5,525 |
| `fixtures/semantic/cases/scalar/string-binary.json` | `e793ced930da09e09e723025008a902822ed7dc1364054670ec2e0608e5707c6` | 10,321 |
| `fixtures/semantic/cases/scalar/temporal-identifiers.json` | `e35f4bd0f0229994449ec011185fbc4689492b692b67b2babcd646d34c7bcc8f` | 11,305 |
| `fixtures/semantic/cases/scalar/vectors.json` | `44ef43fb4adf9b45a039af322cfcaf2abc5b0a932c7e10f6b085671818cc2fc1` | 11,022 |
| `fixtures/semantic/cases/values/objects-arrays.json` | `b13f66e858639a0c8ec5661bdbaaaff6ed6365fe8a31b8fe68d8319a0422e649` | 18,315 |
| `fixtures/semantic/check-corpus.mjs` | `76bda22fbffa149995e708e1672b12168d67cfbc93baa24005304252db568642` | 8,695 |
| `fixtures/semantic/coverage-v1.json` | `81e9cb30e88786f9bab38abfa69ab04a2395181c7c01928809703aac96c4c5ef` | 4,494 |
| `fixtures/semantic/error-cases-v1.json` | `798d6d47afcc5992373acb98ae4ebbda22379c25ea986c6da50816d5d9859f68` | 16,242 |
| `fixtures/semantic/generate-corpus.mjs` | `5c1ce426ca670927f49b6ef9fb83e025ae4f45a57fe5b96c784835434dab71cc` | 50,713 |
| `fixtures/semantic/manifest.json` | `ff4088a1d791dabb8ecc6ffd885f3d08c09c55e1a08871312163d915e6b843e8` | 10,974 |
| `fixtures/semantic/operations-v1.json` | `d5aaa5ecb693d58607635a94f6e7361613ce4fa42922ce8bb331fe25ec365474` | 3,066 |
| `fixtures/semantic/schema/check-semantic-examples.mjs` | `f8c11ca0a3602d89c5bfa174c99178fc92843f844ca57f8dc25bd6617a707331` | 11,847 |
| `evidence/phase-01/P01-019/verify.mjs` | `0ca7ce5e48b943e59737f847ac6542185b706eacf8c8e6e9761d21fafaeae46d` | 14,985 |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- During corpus development, projected rows without visible `_id` initially lacked explicit source order keys. The generator was corrected to carry hidden source-order rows, matching `default_order_v1` even when projection hides `_id`.
- The first pre-generation `--check` correctly reported absent generated outputs; after `--write`, every subsequent byte-for-byte check passed.
- A generator finalization call was initially placed before all case declarations. It was moved to the end before the artifact commit was frozen.
- One supplemental Python command used the pre-`P01-018` schema filenames and failed before validation; rerunning it with the committed schema names validated all 17 cases and the manifest.
- The first evidence replay expected `default_order` instead of the actual versioned `default_order_v1` basis. The evidence verifier was corrected; the corpus under test did not change.
- No finalized required check failed and no required corpus family was skipped.
- Compact `fixture.generate-boundary` cases prove the exact limit relation and expected envelope without storing multi-megabyte/million-element payloads. Later parser/runtime gates must stream or materialize real boundaries and prove allocation safety and atomic state.
- `fixture.raise-error` proves envelope registry breadth, not real authorization, device-loss, durability, corruption, or recovery fault injection. Those failures remain assigned to their runtime phases.
- Expected results are normative corpus inputs, not independent execution proof. `P01-020` must agree through a separately implemented oracle before `G01` can close.
- MongoDB differential evidence (`P01-021`), the published compatibility matrix (`P01-022`), and independent gate review remain open.

## Review

Focused review checked exact scalar payload bounds and special values, decimal tuple range, typed value preservation, Missing/null separation, array and nested-path cases, projection/order keys, invalid raw encodings and commands, stable limit IDs, below/at/above arithmetic, error category/code/retry/state coverage, deterministic generation, source/canonical hashes, registry/document reconciliation, bounded repository inputs, and explicit follow-up ownership. No blocking finding remained in the committed corpus artifact.

## Reproduction

From a repository revision containing this evidence directory, verify that commit `a490395e61f0f626abc4744f72f774a969da4632` exists and run the commands above from the repository root. The verifier reconstructs the exact committed fixture tree in a temporary directory and prints the same pass markers and 31 artifact hashes/sizes recorded here and in [manifest.json](manifest.json).

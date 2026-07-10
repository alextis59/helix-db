# P01-018 Language-Neutral Semantic Fixture Schema Evidence

- Task: `P01-018` — design a language-neutral schema for documents, commands, expected values/order/errors, and state
- Requirements: `INV-002`, `INV-007`, `DATA-001`, `DATA-002`, `QUERY-001`, `QUERY-002`
- Accepted decision: [ADR 0011](../../../docs/adr/0011-use-tagged-json-semantic-fixtures.md)
- Commit under test: `90c3388e63e061f810592377cbff68034b9e37d3`
- Recorded at: `2026-07-10T20:28:31Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the committed artifact defines immutable `helix.semantic-fixture/1` and `helix.semantic-corpus/1` Draft 2020-12 schemas; exact tagged values; deterministic state/capabilities; structured command/raw/value-operation actions; success and `errors-v1` expectations; exact/set/not-applicable ordering; all state modes; requirement/profile metadata; source/RFC 8785 canonical SHA-256 rules; manifest coverage; semantic lint; versioning; and security/resource boundaries.

It also proves 4 accepted examples, 3 structural rejections, 3 schema-valid semantic rejections with exact diagnostics, all logical/action/error/order/state branches, canonical property-order/hash stability, ADR alternatives/impact, Specifications section 20.6, and ADR-index integration.

This task defines and verifies the format. The normative case corpus/manifest is `P01-019`; the complete independent validator/reference oracle is `P01-020`.

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
git status --porcelain=v1
git diff --check 90c3388e63e061f810592377cbff68034b9e37d3^ 90c3388e63e061f810592377cbff68034b9e37d3
git diff-tree --no-commit-id --name-status -r 90c3388e63e061f810592377cbff68034b9e37d3
node evidence/phase-01/P01-018/verify.mjs 90c3388e63e061f810592377cbff68034b9e37d3
python3 --version
python3 -c 'from importlib.metadata import version; print(version("jsonschema"))'
```

The committed [verify.mjs](verify.mjs) verifier resolves the supplied commit, requires its exact 21-file scope, validates formatting/JSON/local links/internal `$ref` targets/registry coverage, extracts the committed schema subtree to a temporary directory, metaschema-validates with Python `jsonschema`, executes the committed semantic and canonical checkers there, validates exact expected diagnostics/hashes, checks documentation/ADR/specification integration, and prints every immutable artifact hash/size.

## Results

- The worktree was clean before evidence creation; every finalized recorded command exited with status 0.
- Both schema files parsed and passed Draft 2020-12 metaschema checks.
- All 80 fixture-schema and 11 manifest-schema references were internal and resolved to committed definitions.
- Accepted structural examples: 4 of 4; rejected schema-negative examples: 3 of 3.
- Schema-valid semantic negatives: 3 of 3 rejected with exact `fixture.object.duplicate_field`, `fixture.state.document_order`, and `fixture.vector.dimension_mismatch` diagnostics.
- Coverage includes 15 logical value tags plus Missing, all 3 actions, success/error, 11 error categories, 15 phases, 4 outcomes, 7 retry scopes, exact/set/not-applicable order, and unchanged/exact/unknown/not-observed state.
- The RFC 8785 UTF-16 property-order vector passed.
- Four accepted examples produced stable source and canonical hashes after property insertion reversal and canonical parse/re-encode.
- Artifact scope, formatting, JSON parsing, local links, format/ADR/specification/index integration, and no-network schema references passed.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `Specifications.md` | `b85420a89287982250e38fc5c371559d0a6a3c522c25f2bfa282d1b597ab5c86` | 72,456 | Normative semantic-corpus requirement |
| `docs/adr/0011-use-tagged-json-semantic-fixtures.md` | `45914bbc4b0754d8a37624869685ed79f343d90157bee056f6051f3eb8a65066` | 9,805 | Accepted fixture-format decision |
| `docs/adr/README.md` | `187b177b521012ea82ada48bf14b967113ec63013fbdb42e955192c2c3fd61f0` | 4,246 | ADR 0011 index entry |
| `docs/quality/semantic-fixture-format.md` | `9a766dcb91a92de23c12e920c1651bbe8356babc5df176d5d43fb0697dee7ff0` | 22,022 | Normative fixture/corpus contract |
| `fixtures/semantic/README.md` | `7458bd7d8ba9d091dde29b8583d3246beda25a049b654221737c8a73b862acfe` | 1,446 | Fixture entry point/reproduction commands |
| `fixtures/semantic/schema/semantic-fixture-v1.schema.json` | `6afcb0b18a3472c54823d1a10320c0f0c54e7bb79f29fa2c7b0c76d435f489bf` | 28,824 | Fixture Draft 2020-12 schema |
| `fixtures/semantic/schema/semantic-corpus-manifest-v1.schema.json` | `17d7b070b06a451e797635564c4189e7425eb6995c06e2baa153fbda5b69ee10` | 3,900 | Corpus manifest Draft 2020-12 schema |
| `fixtures/semantic/schema/fixture-jcs.mjs` | `8cad46d5c577026e53a0990413feecd516e42fce734998963b88c50f6bd6b173` | 1,307 | Restricted exact fixture-profile JCS helper |
| `fixtures/semantic/schema/check-canonical-examples.mjs` | `cfa2e042b92085b79dba059fb8707ef5462f09c1111ccd900c4c5e7de340b0ff` | 2,362 | RFC property/hash stability checker |
| `fixtures/semantic/schema/check-semantic-examples.mjs` | `5336ac6c9635de22882e2611d97e2e24bb9f4c3b1854185e7b6ceb7c65632829` | 11,356 | Cross-field semantic example checker |
| `fixtures/semantic/schema/examples/README.md` | `8b6f0ba80bedbb0d17b80213e139c5fe28e8ae9fc58d50083bee6dfda8ea690e` | 1,506 | Expected example validation layers |
| `fixtures/semantic/schema/examples/valid/all-value-types.json` | `f486ce839cef522eb9c3322ca95ccd093407a4f81459b8d1ec65df7dd9843b13` | 2,785 | All logical type branches plus Missing |
| `fixtures/semantic/schema/examples/valid/command-default-order.json` | `39beb0f2ce90a6a66eb1f67f51bc75ebd68af177cbd70a41a4986016935daf85` | 3,739 | Structured command/literal/exact order |
| `fixtures/semantic/schema/examples/valid/expectation-variants.json` | `5d4d643556fc6b50ae3f56e2b3f2a6de6a88b6b1fc0068eb4537c03104ac3c32` | 3,835 | Order/state/error/detail/cause variants |
| `fixtures/semantic/schema/examples/valid/raw-error.json` | `a4ea2d17957e00d2d3535b626efd1b3a6b4835323e7376517846e6ec0e48d472` | 1,313 | Raw input/structured parse error |
| `fixtures/semantic/schema/examples/invalid-schema/bare-integer-payload.json` | `92b353c3f91c0cab9be7bac7fbc43366db2d6ceefb0005bba7db48e28fd7f021` | 1,025 | Reject unsafe logical JSON number |
| `fixtures/semantic/schema/examples/invalid-schema/error-message-forbidden.json` | `736de21c6243d6f4838343cbc945acd25d227ac94b4075fb446e9898ab7048a9` | 1,301 | Reject non-normative message expectation |
| `fixtures/semantic/schema/examples/invalid-schema/exact-order-without-keys.json` | `65740a64341f7f79b5219bf80d768c55878706a86d87b0d849ae9922f5c85648` | 976 | Reject incomplete exact order |
| `fixtures/semantic/schema/examples/invalid-semantic/duplicate-logical-object-field.json` | `2415e9407a958c9646ee5152724f87911c6f05567022d74ac57294e6a5dba8b7` | 1,235 | Semantic duplicate-field negative |
| `fixtures/semantic/schema/examples/invalid-semantic/initial-documents-out-of-order.json` | `cd20df86d0e3a42eab896dce3ea1e70546c81a0fa58ed0ad6674f964c850e2f7` | 1,430 | Semantic setup-order negative |
| `fixtures/semantic/schema/examples/invalid-semantic/vector-dimension-mismatch.json` | `f3409b3fd66071a493d068f3aab1b65d77e087c396989c3e398f9beabe294969` | 1,143 | Semantic vector-shape negative |
| `evidence/phase-01/P01-018/verify.mjs` | `ae8504f0831a727bb288ef27ba5489ed6523d311f85bf054b3de8d01125f1119` | 10,609 | Immutable-commit schema/example verifier |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- During checker development, one canonical test incorrectly inspected reparsed JavaScript `Object.keys()` order; integer-like key `"1"` is enumerated specially by ECMAScript. The check was corrected to compare canonical bytes directly, which then matched RFC 8785. No committed artifact had yet been frozen.
- One supplemental pre-commit `$ref` shell snippet had an extra brace; the corrected check found all references resolving. The metaschema suite was already passing.
- No finalized validation failed and no required schema branch was skipped.
- The four accepted files are schema examples, not the normative `P01-019` corpus.
- `fixture-jcs.mjs` deliberately implements the stricter fixture-profile subset (safe bare structural integers); Phase 2 still requires locked independent Rust/TypeScript RFC 8785 cross-checks.
- Strict token-level duplicate JSON-property detection and the complete command/value-operation registry remain part of the full `P01-020` validator/oracle.
- The semantic example checker proves selected cross-field boundaries, not every `limits-v1`/command/state rule.
- No production engine/backend/host/protocol/adapter has consumed the format yet; later gates must identify exact manifest hashes and results.
- Independent semantic/corpus review remains required for `G01`.

## Review

Focused review checked JSON/I-JSON/JCS boundaries, safe structural versus logical numbers, every exact type/payload, ordered object fields, Missing storage boundary, deterministic capabilities, command literal disambiguation, invalid raw bytes, success/error message exclusion/retry/state, explicit order cardinality/keys, state outcome certainty, structural-versus-semantic negative cases, manifest counts/coverage/hashes, schema/profile evolution, path/network/code/secrets/resource safety, and follow-up ownership. No blocking finding remained in the schema artifact.

## Reproduction

From a repository revision containing this evidence directory, verify that commit `90c3388e63e061f810592377cbff68034b9e37d3` exists and run the commands above from the repository root. The verifier reconstructs the exact committed fixture subtree in a temporary directory and prints the same 21 immutable artifact hashes/sizes recorded here and in [manifest.json](manifest.json).

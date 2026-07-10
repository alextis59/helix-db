# Semantic Conformance Fixtures

The language-neutral semantic fixture contract is defined in [Semantic Fixture and Corpus Format](../../docs/quality/semantic-fixture-format.md).

Current contents:

- [Fixture JSON Schema v1](schema/semantic-fixture-v1.schema.json)
- [Corpus manifest JSON Schema v1](schema/semantic-corpus-manifest-v1.schema.json)
- [Schema examples and expected validation layers](schema/examples/README.md)
- [Dependency-free semantic example checker](schema/check-semantic-examples.mjs)
- [Fixture-profile RFC 8785 helper](schema/fixture-jcs.mjs) and [canonical example checker](schema/check-canonical-examples.mjs)

`P01-018` defines and verifies the format. `P01-019` creates `cases/` plus the deterministic `manifest.json`; `P01-020` supplies the complete independent fixture validator/oracle. Schema examples are not normative corpus cases.

The committed v1 corpus inventory and integrity files are:

- [Corpus manifest](manifest.json)
- [Human-readable coverage ledger](COVERAGE.md)
- [Coverage contract](coverage-v1.json)
- [Value-operation registry](operations-v1.json)
- [Structured error-case registry](error-cases-v1.json)
- [Generated case files](cases/)

Focused local checks available before Phase 2 toolchain automation:

```bash
python3 -c 'import json; from jsonschema import Draft202012Validator; s=json.load(open("fixtures/semantic/schema/semantic-fixture-v1.schema.json")); Draft202012Validator.check_schema(s)'
node fixtures/semantic/schema/check-semantic-examples.mjs
node fixtures/semantic/schema/check-canonical-examples.mjs
node fixtures/semantic/generate-corpus.mjs --check
node fixtures/semantic/check-corpus.mjs
```

Corpus consumers must reject unknown schema/profile/action behavior, validate source and canonical hashes, preserve exact typed values/order/errors/state, and report skips/failures explicitly.

# Semantic Fixture Schema Examples

These files prove the two validation layers defined by [the semantic fixture format](../../../../docs/quality/semantic-fixture-format.md): JSON Schema structure first, then cross-field/domain semantic linting.

## Expected results

| Directory/file | JSON Schema | Semantic lint | Purpose |
| --- | --- | --- | --- |
| `valid/*.json` | Accept | Accept | Command/order, typed-value, and structured-error smoke cases |
| `invalid-schema/bare-integer-payload.json` | Reject | Not run | Logical integer payload incorrectly uses an imprecise JSON number |
| `invalid-schema/error-message-forbidden.json` | Reject | Not run | Non-normative human error message appears in an expectation |
| `invalid-schema/exact-order-without-keys.json` | Reject | Not run | Exact order omits required key tuples |
| `invalid-semantic/duplicate-logical-object-field.json` | Accept | Reject `fixture.object.duplicate_field` | JSON Schema cannot express uniqueness by field-name member |
| `invalid-semantic/vector-dimension-mismatch.json` | Accept | Reject `fixture.vector.dimension_mismatch` | Declared dimension differs from exact component count |
| `invalid-semantic/initial-documents-out-of-order.json` | Accept | Reject `fixture.state.document_order` | Canonical setup state violates `default_order_v1` |

The negative files are test inputs, not members of the semantic corpus. `P01-019` places accepted normative cases under `fixtures/semantic/cases/` and generates the corpus manifest.

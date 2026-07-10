# V1 Semantic Corpus Coverage

- Status: Normative populated corpus baseline
- Fixture schema: `helix.semantic-fixture/1`
- Manifest schema: `helix.semantic-corpus/1`
- Semantic profile: `helix-native-v1`
- Generator: `generate-semantic-corpus` 1.0.0
- Plan item: `P01-019`
- Governing gate: `G01`

The generated [manifest](manifest.json) is the machine authority for exact IDs, files, hashes, byte sizes, counts, requirement coverage, and tags. This ledger explains why the inventory satisfies the requested scalar, Missing/null, array, nested-path, invalid-input/command, ordering, error, and limit-boundary breadth.

## Corpus totals

```text
fixtures:  17
steps:     313
successes: 183
errors:    130
```

The [coverage contract](coverage-v1.json) independently lists the exact 17 case IDs, 17 registered value operations, 23 stable limit IDs, 74 error codes, 16 observable value tags (15 logical types plus Missing), 3 action kinds, 8 order bases, required family tags, and expected totals.

## Case inventory

| Fixture ID | Steps | Primary coverage |
| --- | ---: | --- |
| `errors.registry` | 74 | Every `errors-v1` category/code with phase/outcome/retry/token/state shape |
| `invalid.commands` | 7 | Unknown command/operator/option, invalid sort, protected/conflicting update, unsupported vector+sort |
| `invalid.raw-inputs` | 18 | Empty/truncated/invalid JSON/UTF-8, duplicate field, integer/decimal/time/ID/binary/vector typed boundaries, bad compression |
| `limits.commands-queries` | 36 | Below/at/above 12 command, AST, pipeline, regex, top-k, and candidate limits |
| `limits.document-values` | 33 | Below/at/above 11 document, depth, field/name/path, array/vector/ID limits |
| `ordering.profiles` | 6 | Explicit sort, vector rank, pipeline ordinal, input order, singleton, explicit set semantics |
| `presence.missing-null-paths` | 9 | Missing/null distinction, exists, nested resolve, array fan-out, presence ordering |
| `query.missing-array-nested` | 8 | Native null-only equality, exists, size/all/elemMatch, nested filter, hidden order after projection |
| `scalar.decimal128-specials` | 15 | Zeros, subnormal/normal/exponent/max, infinities, NaN, equality/identity/add/overflow |
| `scalar.float64-specials` | 19 | Zeros, subnormal/normal/max, infinities, signaling/quiet/payload NaNs, equality/identity/order |
| `scalar.integers` | 14 | int32/int64 min/max/zero, width equality, widening/negation, overflow/underflow |
| `scalar.mixed-numeric` | 7 | Exact cross-type equality, decimal/binary tenth difference, exact/inexact float promotion |
| `scalar.null-bool` | 8 | Null/false/true identity, equality, and type/value order |
| `scalar.string-binary` | 15 | Empty/NUL/supplementary/decomposed/composed strings, bytes, binary order, scalar containment |
| `scalar.temporal-identifiers` | 16 | Timestamp/date min/epoch/max, offset/microsecond parsing, leap rejection, UUID/ObjectId/type order |
| `scalar.vectors` | 12 | f16/f32 signed-zero/subnormal/max, family/dimension, L2/dot, cosine zero-norm |
| `values.objects-arrays` | 16 | Object presentation versus equality, empty/mixed/nested dense arrays, size/all/elemMatch/order |

## Scalar/value edge matrix

| Domain | Required boundaries represented |
| --- | --- |
| Missing/null/bool | Missing, null, false, true; identity/equality/order/presence |
| Integers | Both signed minima/maxima, -1/0/1, cross-width aliases, widening and checked failure |
| Binary64 | Both zeros, minimum/maximum subnormal, minimum normal, ±max finite, ±infinity, sNaN/qNaN/sign/payload |
| Decimal128 | Both zeros, `1e-6176`, `1e-6143`, 0.1, 1, max 34-digit × `10^6111`, ±infinity, NaN |
| Mixed numeric | Equal 1 across int32/int64/float/decimal, exact rational comparison, 2^53 exact/inexact boundary, forbidden decimal/float mix |
| String | Empty, ASCII, NUL, supplementary scalar, composed/decomposed preservation and binary order |
| Binary | Empty, zero, prefix/mixed/max byte, type distinction from string |
| Timestamp/date | Inclusive payload bounds, epoch, exact microsecond, offset normalization, invalid leap second |
| UUID/ObjectId | All-zero/all-one payloads and cross-type ID order |
| Object | Empty, presentation permutations, equality/canonical compare/typed identity |
| Array | Empty, null/mixed/nested values, sequence equality/order, immediate size/all/elemMatch |
| Vectors | Both families, dimension identity, signed zero, minimum subnormal, maximum finite, exact simple metrics/error |

Every exact payload is tagged; no host JSON number or map iteration is used as a logical expectation.

## Limit boundary matrix

Every stable ID in [limits-v1](../../docs/architecture/limits-v1.md) has exactly three `fixture.generate-boundary` steps:

```text
below = maximum - 1 → success with exact measured summary
at    = maximum     → success with exact measured summary
above = maximum + 1 → QUOTA_LIMIT_EXCEEDED with limit_id/max/observed/unit
```

The compact generator operation avoids checking accidental 64 MiB/million-element files into the repository. `P01-020` verifies the mathematical generator/oracle; later parser/format/runtime gates must materialize or stream the real boundary shape and prove identical accept/reject behavior, allocation safety, and atomic state.

## Error registry matrix

[error-cases-v1.json](error-cases-v1.json) and `errors.registry` contain all 74 codes in all 11 categories. Each case fixes category, stable code, phase, read-only fixture outcome, retryable flag/scope, token-presence expectation, order applicability, and state certainty. `DUR_ACK_UNKNOWN` specifically asserts unknown outcome/state and same-idempotency recovery.

These registry cases prove envelope metadata breadth. Command/raw/numeric/vector/limit cases additionally exercise representative errors from actual semantic actions. Later crash/security/protocol/backend phases must exercise the real failure state that produces each code; `fixture.raise-error` alone is not runtime fault-injection proof.

## Ordering and state

- Default query results carry ascending `_id` keys even when projection removes visible `_id`.
- Explicit sort, vector rank, pipeline ordinal, input index, singleton, and explicit set comparison shapes are present.
- Every step declares order mode/basis/row count/keys and state mode.
- Invalid/read-only/limit registry cases assert unchanged or unknown state according to outcome.
- Actual successful mutation/exact post-state, cursor batching, repeated aggregation sort/unwind/group provenance, and fault-resolved committed/unknown histories receive deeper executable coverage in `P01-020`, CRUD/query phases, MVCC, and recovery gates.

## Determinism and validation

```bash
node fixtures/semantic/generate-corpus.mjs --check
node fixtures/semantic/check-corpus.mjs
```

The generator check compares all case/manifest/coverage/operation/error files byte-for-byte. The corpus checker validates semantic case invariants, exact source/JCS hashes, disk/manifest inventory, counts, requirement coverage, registered operation arity/use, all value/action/order tags, 23 × 3 limit relations, and exact equality with the normative limit/error documents.

Draft 2020-12 validation is additionally required for every case and the manifest until Phase 2 makes it a locked CI command.

## Explicit follow-up boundary

- `P01-020` supplies the independent executable oracle; current expected outputs are committed normative inputs awaiting that independent agreement.
- These are semantic fixtures, not HDoc/protocol/WAL/backup byte fixtures.
- Compact boundaries do not replace real allocation/decompression/stream/atomicity tests.
- `fixture.raise-error` does not replace real authorization, GPU loss, corruption, durability, or recovery fault injection.
- The initial MongoDB differential subset/report is `P01-021`; native/upstream differences remain explicit.
- The published semantic/compatibility matrix is `P01-022`.
- `G01` remains open until corpus, oracle, differential report, matrix, and independent review agree.

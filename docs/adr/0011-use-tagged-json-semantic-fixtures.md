# ADR 0011: Use tagged JSON semantic fixtures with schema and canonical hashes

- Status: Accepted
- Date: 2026-07-10
- Decision owner: Query semantics owner
- Required before: `P01-018` and `G01`
- Supersedes: None
- Superseded by: None

## Context

HelixDB's semantic corpus must drive independent reference, optimized CPU, Wasm, browser, server, GPU, SDK, format, and compatibility implementations. Native language test code or ordinary JSON cannot preserve int width, full int64, float bits/NaN payloads, decimal tuples, Missing, object field presentation, binary/time/identifier/vector types, stable order keys, mutation outcome, or structured retry behavior consistently.

The corpus also needs malformed JSON/UTF-8/encoded bytes, deterministic clocks/randomness/quotas, sequential state transitions, explicit order and state assertions, immutable hashes, and requirement coverage. A schema alone cannot enforce semantic cross-fields such as duplicate logical field names, vector dimension equality, primary-ID order, or error outcome/state consistency.

This decision implements `P01-018` and contributes to `INV-002`, `INV-007`, `DATA-001`, `DATA-002`, `QUERY-001`, and `QUERY-002`.

## Decision drivers

- Lossless representation of every accepted/observable semantic state.
- Identical parsing and comparison across Rust, TypeScript, browsers, SDK languages, and test infrastructure.
- Exact values, ordered streams, errors/retries, and post-state—not Boolean-only pass cases.
- Deterministic capability inputs and raw malformed bytes.
- Strict versioning, additive corpus growth, and immutable evidence hashes.
- Human reviewability without host-language execution.
- Structural and cross-field validation with actionable stable diagnostics.
- No network schema resolution, arbitrary code, secrets, or unsafe huge-input handling.

## Considered options

### Option A — Language-native unit tests and serializers

Advantages:

- Idiomatic and easy for each implementation.
- Direct access to native types/test frameworks.

Disadvantages:

- Every runtime becomes its own expectation source.
- Host numbers/maps/errors/Unicode/iteration erase or change semantics.
- Browser/server/GPU/adapters cannot consume one neutral corpus.
- Hard to hash, diff, audit coverage, or independently generate.

### Option B — Plain or extended JSON with inferred values

Advantages:

- Simple authoring and widespread parsers.
- Familiar query/document shapes.

Disadvantages:

- Bare JSON numbers cannot carry full exact domains and special bits.
- JSON objects cannot simultaneously make metadata order irrelevant and preserve logical object field presentation/duplicate tests.
- Missing, binary, decimal, time, IDs, vectors, raw malformed input, order keys, and mutation outcomes need ad hoc conventions.
- Different Extended JSON libraries/dialects may reinterpret values.

### Option C — Strict tagged JSON envelope, JSON Schema, semantic lint, and RFC 8785 hashes

Advantages:

- Exact explicit types/bits/state/order/errors in ordinary portable JSON.
- Draft 2020-12 catches structure; semantic lint handles cross-field/domain invariants.
- Raw bytes cover invalid input without making the fixture invalid.
- JCS canonical hashes compare across formatting/languages while source hashes preserve artifact identity.
- One corpus can be consumed at every implementation layer.

Disadvantages:

- More verbose than natural query JSON.
- Requires generated helpers/adapters and two validation layers.
- JCS and exact bit/decimal/ordinal handling need cross-language conformance.
- Schema evolution is intentionally strict and may require new versions.

## Decision

Accept Option C and the exact [Semantic Fixture and Corpus Format](../quality/semantic-fixture-format.md):

- fixture schema `helix.semantic-fixture/1` and manifest `helix.semantic-corpus/1`;
- umbrella semantic profile `helix-native-v1` plus exact limits/collation/errors/default-order profiles;
- strict UTF-8/I-JSON and pinned JSON Schema Draft 2020-12 with only internal references;
- RFC 8785 canonical UTF-8 plus SHA-256, alongside exact source bytes/hash;
- tagged logical values using decimal strings or exact bits rather than unsafe bare JSON numbers;
- logical objects as ordered field-entry arrays and raw invalid inputs as lowercase hex bytes;
- deterministic initial state/capability streams and sequential action/expectation steps;
- structured command, raw input, and registered value-operation actions;
- exact success value/order/state or stable structured error/retry/order/state expectations;
- generated manifest counts, requirement coverage, paths, sizes, and hashes;
- schema validation followed by normative semantic lint before execution.

## Consequences

### Positive

- Reference and optimized implementations share exact typed expectations rather than translated test code.
- CPU/GPU/browser/server/SDK/adapter differential reports can compare the same ordered hashes/errors.
- Missing/null, numeric payloads, object presentation, vectors, and unknown mutation outcomes remain observable.
- Structural mistakes and semantic fixture mistakes fail before database execution.
- Manifests make coverage, selection, drift, and artifact integrity auditable.
- Pretty-print changes remain distinguishable from semantic canonical changes.

### Negative

- Hand-authored cases are verbose; builders/generators are needed later.
- Command grammar positions still require semantic lint to distinguish structure from `$value` literals.
- A complete validator/oracle is a substantive maintained implementation.
- Schema/profile/operation readers must be supported across multiple languages.

### Neutral or deferred

- P01-019 populates the normative case corpus/manifest.
- P01-020 implements the complete independent validator/oracle/operation registry.
- Phase 2 selects locked cross-language schema/JCS tooling and CI integration.
- HDoc/protocol/backup/kernel fixtures keep separate versioned schemas and may reference semantic case IDs.

## Compatibility and migration

No prior semantic fixture/corpus format exists, so no migration is required. Schema URNs and profile strings are frozen from their first committed examples.

Schema v1 rejects unknown fields/actions/types. Reinterpreting or adding schema behavior requires a new schema ID and reader matrix; changing semantic behavior also requires a new semantic/subprofile and regenerated/superseding fixtures. New cases under unchanged v1 contracts are additive.

Historical gate/release fixtures and hashes remain immutable. A correction after acceptance adds a superseding case/change record rather than rewriting evidence. Older runners reject unsupported schema/profile/operation behavior explicitly. Rollback is safe while the runner retains/rejects every committed schema/profile; it may not silently parse v2 as v1.

## Security and operations

- Strict parsing detects duplicate meta/command properties and invalid Unicode before maps/normalizers.
- Schemas use committed internal references; network fetch is disabled.
- Raw/compressed bytes and recursive structures are capped before allocation/decode.
- Fixtures contain synthetic/public data and no secrets/customer data/host paths.
- Command/value operations cannot carry arbitrary source code or callbacks.
- Corpus paths are normalized repository-relative paths without traversal.
- Reports preserve redaction and bounded output while identifying fixture/step/diagnostic/hash.
- Parallel execution cannot reorder manifest/report results or share state across fixtures.

## Validation plan

- [x] Define fixture/corpus schemas, profiles, typed values, setup/capabilities, actions, success/error/order/state expectations, hashing, manifests, semantic lint, evolution, and security rules.
- [x] Add positive structural examples, schema-negative examples, and schema-valid semantic-negative examples.
- [x] Metaschema-check both Draft 2020-12 schemas and run the dependency-free semantic example checker.
- [x] Populate every scalar/path/array/command/limit family under `P01-019` and generate exact manifest coverage/hashes.
- [x] Implement the complete independent validator/oracle and registered value/command actions under `P01-020`.
- [ ] Validate identical corpus decoding/canonical hashes in Rust and TypeScript under Phase 2/query work.
- [ ] Run the corpus through every backend/host/protocol/adapter and preserve reports at later gates.
- [ ] Complete independent semantic/corpus review at `G01`.

## Implementation impact

- Semantic corpus/oracle/matrix: `P01-018`–`P01-022`.
- Toolchain/generation: `P02-004`, `P02-008`, `P02-015`.
- Formats/storage/query/index/GPU: `P03-*`, `P05-*`–`P10-*`.
- Hosts/protocol/SDK/security/observability/recovery: `P11-*`–`P16-*`.
- Distributed/cache/sync/adapters/final validation: `P17-*`–`P24-*`.
- Requirements: `INV-002`, `INV-007`, `DATA-001`, `DATA-002`, `QUERY-001`, `QUERY-002`.
- Gates: `G01` and every later conformance gate consuming semantic cases.

## Follow-up work

- [ ] Generate typed-value/action builders so authors do not hand-copy wrappers.
- [ ] Add locked Rust/TypeScript Draft 2020-12 and RFC 8785 cross-checks.
- [x] Generate manifest/coverage and fail on unlisted/duplicate/drifted cases.
- [ ] Keep format/protocol byte fixtures linked but separately versioned.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [Semantic fixture format](../quality/semantic-fixture-format.md)
- [Versioning policy](../governance/versioning.md)
- [Evidence policy](../../evidence/README.md)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [RFC 8785 JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785)

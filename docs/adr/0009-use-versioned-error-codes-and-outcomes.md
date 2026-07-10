# ADR 0009: Use versioned error codes, mutation outcomes, and retry scopes

- Status: Accepted
- Date: 2026-07-10
- Decision owner: Query semantics owner
- Required before: `P01-016` and `G01`
- Supersedes: None
- Superseded by: None

## Context

HelixDB will expose the same semantics through native, Wasm, browser, server, GPU-assisted, SDK, and compatibility-adapter paths. Human messages, host exceptions, HTTP/gRPC status alone, and broad categories cannot tell a caller whether a write committed, whether retry is safe, which semantic condition occurred, or whether CPU/GPU/adapter behavior agrees.

Ambiguous acknowledgement is especially dangerous: treating an unknown result as an abort can duplicate a mutation, while treating an abort as committed can lose work. Rich details can also expose commands, document data, paths, resource existence, secrets, or internals unless the contract makes redaction normative.

This decision implements `P01-016` and contributes to `QUERY-002`, `STORE-001`, `GPU-004`, and `SEC-001`.

## Decision drivers

- Deterministic behavior across hosts, backends, worker schedules, and adapters.
- Explicit mutation outcome certainty and safe bounded retries.
- Stable SDK/protocol automation independent of wording/localization.
- No resource-existence, document-value, secret, filesystem, or stack disclosure.
- Low-cardinality observability with diagnostic correlation.
- Additive evolution and safe behavior for unknown future errors.
- Testable primary-error precedence and transport mappings.

## Considered options

### Option A — Human messages and host/transport exceptions

Advantages:

- Minimal registry work.
- Natural integration with each implementation language.

Disadvantages:

- Wording/localization becomes accidental API.
- Host/backend/adapter behavior diverges.
- Retry and commit outcome remain ambiguous.
- Messages and stacks create disclosure/cardinality risk.

### Option B — Stable broad categories only

Advantages:

- Small cross-language enum.
- Better than matching messages.

Disadvantages:

- One category contains incompatible retry/outcome/detail cases.
- Cannot map compatibility protocols precisely.
- Category-only metrics cannot diagnose specific contractual failures.
- Future behavior changes would overload existing identifiers.

### Option C — Versioned category/code registry plus outcome and retry metadata

Advantages:

- Stable precise automation and compatibility mapping.
- Proved abort/commit/unknown outcomes prevent unsafe write retries.
- Deterministic precedence is independently testable.
- Registered bounded details and messages support redaction.
- Unknown values have conservative forward-compatible behavior.

Disadvantages:

- Requires shared registry generation and conformance fixtures.
- Every protocol/SDK/adapter must preserve structured metadata.
- Adding/changing codes requires governance and compatibility review.

## Decision

Accept Option C and the exact [`errors-v1`](../architecture/error-semantics.md) contract.

Core choices:

- Eleven exhaustive stable categories and unique code identifiers.
- A versioned structured envelope with stable phase, mutation outcome certainty, retry advice, bounded details/causes, and correlation IDs.
- Outcomes `not_applicable`, `not_committed`, `committed`, and `unknown`.
- Retry scope explicit per error/outcome; unknown writes may only use the same idempotency identity or status recovery.
- Deterministic primary-error precedence independent of scheduling/backend.
- Native envelope authoritative; transport/upstream statuses are lossy mappings.
- Registered safe messages/details, authorization existence masking, and conservative unknown-code handling.

## Consequences

### Positive

- SDKs can retry only when semantics prove it safe.
- CPU/GPU/Wasm/server/adapters can be differentially tested on exact structured errors.
- Operators can correlate diagnostics without placing high-cardinality/sensitive data in metrics.
- Public wording can improve/localize without breaking clients.
- Future additive codes fail safely on older clients.

### Negative

- The registry, schemas, generators, mappings, and fixtures become maintained compatibility artifacts.
- Internal failures must be deliberately classified and scrubbed instead of forwarding exceptions.
- Commit/idempotency state must persist enough proof to report accurate outcomes.
- Exact precedence can require bounded extra work after parallel/optimized failure discovery.

### Neutral or deferred

- Exact HTTP/gRPC/upstream numeric mappings are frozen with their protocol/adapter profiles.
- Localization catalogs and operator-only diagnostic schemas are later implementation artifacts.
- A new registry version may eventually add or restructure semantics but must preserve negotiated compatibility.

## Compatibility and migration

No released protocol, SDK, retry store, or persistent error record exists, so no current migration is required. The first versions record envelope schema `1` and registry `errors-v1`.

Codes are never reused. Adding a conservatively handled code may be additive; changing category, meaning, outcome, retry safety, precedence, or disclosure requires a new negotiated profile and compatibility/migration review. Persisted idempotency/status records retain registry/code/outcome rather than only messages/exceptions.

Rollback is safe before external/persistent consumers rely on `errors-v1`. After that point, rollback requires an implementation that still reads/preserves the negotiated envelope/registry and never converts an unknown write outcome to a proved abort.

## Security and operations

- Generate client messages from safe templates and allow only registered bounded details.
- Mask absent versus forbidden resources when authorization requires it.
- Never expose secrets, values, raw commands/keys/paths, stacks, filesystem/host/tenant data.
- Use `error_id` to locate restricted diagnostics; keep it out of metric labels.
- Audit durability-unknown, corruption, invariant, device-loss-without-fallback, and redaction failures.
- Treat unsafe retry advice or false mutation-outcome certainty as stop-ship correctness/durability defects.

## Validation plan

- [x] Define envelope, all categories/codes, phases, outcomes, retry scopes, precedence, registered details, redaction, mappings, observability, and evolution rules.
- [ ] Generate language-neutral registry/envelope fixtures under `P01-018`–`P01-019`.
- [ ] Make the independent reference oracle select exact primary errors under `P01-020`.
- [ ] Prove native/Wasm/browser/server/CPU/GPU/fallback equivalence.
- [ ] Prove commit/abort/unknown behavior through idempotency, crash, timeout, disconnect, and sync fault injection.
- [ ] Prove HTTP/gRPC/SDK/adapter mapping and unknown-code preservation.
- [ ] Run redaction canaries and observability-cardinality tests.
- [ ] Complete independent semantic/security/durability review at `G01` and later gates.

## Implementation impact

- Semantic corpus/oracle: `P01-018`–`P01-022`.
- Core/host/storage/query/GPU: `P03-*`–`P10-*`.
- Products/protocol/SDK/security/operations/recovery: `P11-*`–`P16-*`.
- Distributed/cache/sync/adapters/cloud: `P17-*`–`P24-*`.
- Requirements: `QUERY-002`, `STORE-001`, `GPU-004`, `SEC-001`.
- Gates: `G01` and every later gate exposing errors or mutation outcomes.

## Follow-up work

- [ ] Generate one shared registry for Rust, TypeScript, schemas, protocol docs, and tests.
- [ ] Implement persisted idempotency/status lookup before automatic write retries ship.
- [ ] Freeze exact transport and adapter mappings with executable round-trip matrices.
- [ ] Add redaction/cause/cardinality property tests and fault-injection outcomes.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [Stable error semantics](../architecture/error-semantics.md)
- [Evidence policy](../../evidence/README.md)
- [Finding severity](../governance/severity.md)

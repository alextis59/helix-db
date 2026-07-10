# ADR 0004: Preserve UTF-8 and use one binary v1 collation

- Status: Accepted
- Date: 2026-07-10
- Decision owner: Query semantics owner
- Required before: `P01-006` and `G01`
- Supersedes: None
- Superseded by: None

## Context

String behavior affects HDoc bytes, hashes, indexes, grouping, uniqueness, sidecars, GPU filters, SDKs, query compatibility, and user-visible order. Implicit Unicode normalization, locale collation, case folding, invalid-input replacement, or host-library defaults could make identical data behave differently across Rust, Wasm, JavaScript, browsers, servers, and upgrades.

V1 needs deterministic correct string semantics before fixtures and physical key formats. Locale-aware search remains valuable, but it requires a versioned collation provider, larger indexes, adapter decisions, and upgrade/rebuild policy not yet justified by the core slice.

This decision implements `P01-006`, contributes to `DATA-001`, `QUERY-001`, and `CORE-003`, and pins version-sensitive Unicode 17.0.0 data while keeping native equality independent of Unicode-version changes.

## Decision drivers

- Byte-exact round trip and stable persistent/index keys.
- Identical equality/order across native, Wasm, browser, server, and GPU-assisted paths.
- Explicit invalid Unicode errors without silent data repair.
- No process-locale or host-library drift.
- Collision-safe dictionary/GPU acceleration.
- Clear compatibility limits and future collation migration path.
- Bounded validation, normalization, and regex work on untrusted input.

## Considered options

### Option A — Normalize on write and use locale collation by default

Advantages:

- Canonically equivalent strings compare together.
- More natural user-facing sort/search for a chosen locale.

Disadvantages:

- Rewrites user bytes and loses distinctions/round-trip identity.
- No single locale fits all collections/tenants.
- Unicode/collation upgrades can change equality/order and require index rebuilds.
- CPU/GPU/browser/library implementations may diverge.
- Case/accent strength adds a large configuration and compatibility surface.

### Option B — Preserve canonical UTF-8 and use unsigned byte collation

Advantages:

- Simple, exact, portable equality/order/hashing.
- Native results do not drift with Unicode releases.
- Efficient index/dictionary/GPU candidate implementation.
- Explicit transforms can provide normalization without rewriting source data.

Disadvantages:

- Linguistically equivalent/case variants remain distinct.
- Order is not natural-language order.
- MongoDB locale/collation behavior is unsupported unless separately implemented.
- Applications may need derived normalized/search fields.

### Option C — Treat arbitrary bytes as strings

Advantages:

- Accepts all input without validation cost.
- Exact byte preservation.

Disadvantages:

- Breaks Unicode SDK/JSON expectations.
- Makes scalar regex, display, length, slicing, and logs unsafe/ambiguous.
- Allows multiple malformed encodings and cross-host decoder divergence.
- Duplicates the existing binary type.

## Decision

Accept Option B with the normative details in [String, Unicode, Normalization, and Collation Semantics](../architecture/string-semantics.md):

- String values are Unicode scalar sequences encoded as canonical shortest-form UTF-8.
- Invalid UTF-8/UTF-16 is rejected; arbitrary bytes use `binary`.
- Stored bytes are preserved and never normalized/case-folded implicitly.
- V1 supports only `binary_utf8_v1`: unsigned byte equality/order, no locale, normalization, case folding, or numeric collation.
- Explicit normalization uses named forms and pinned Unicode 17.0.0 data and produces a new value.
- String length measures are labeled; native user slices use scalar rather than UTF-16 indices.
- Prefix/contains are exact; regex property data is pinned and resource bounded.
- Index/dictionary/GPU optimizations are exact or conservative candidates with byte verification.

## Consequences

### Positive

- HDoc, indexes, grouping, uniqueness, and hashes have stable exact inputs.
- Browser/native/server results do not depend on locale or Unicode library defaults.
- Original user text round-trips exactly.
- Invalid text cannot leak through replacement-character ambiguity.

### Negative

- Users expecting case/accent-insensitive search need explicit derived values or future features.
- Natural language sort is not available in v1.
- SDKs must validate JavaScript/UTF-16 surrogates explicitly.
- Compatibility adapters must declare many upstream collation cases different/unsupported.

### Neutral or deferred

- Field-name/path restrictions remain later semantic tasks.
- A future ICU4X/ICU or custom collation experiment may add versioned opt-in collations.
- Search/full-text analysis is not implied by native string comparison.

## Compatibility and migration

No persistent string/index fixture or public protocol exists yet, so no current data migration is required. The first HDoc/index/protocol fixtures record canonical UTF-8 and `binary_utf8_v1`.

Adding a collation creates a new explicit identifier and separate index compatibility. Changing an existing collation, normalization version, or regex property version requires new semantic/format metadata, regenerated fixtures, index/sidecar rebuilds, cursor/plan-cache invalidation, adapter-matrix updates, and a superseding ADR where behavior changes. Existing binary indexes are never reinterpreted in place.

## Security and operations

- Logs/admin UIs escape control and bidirectional content.
- Security identifiers use a separate pinned identifier/confusable policy.
- UTF-8 validation, normalization, regex, and string-size work obey resource/deadline limits.
- Unicode data artifacts have pinned version/hash/license and appear in SBOM/provenance.
- Unsupported collation requests fail before execution and are observable without logging sensitive values.

## Validation plan

- [x] Define UTF-8 validation, preservation, normalization, equality, order, hashing, collation, search boundaries, and security behavior.
- [ ] Commit malformed/boundary/equality/order fixtures under `P01-019`.
- [ ] Make the reference interpreter pass them under `P01-020`.
- [ ] Prove HDoc/SDK/protocol/backup byte-exact round trips.
- [ ] Prove index/dictionary/sidecar/GPU candidate and collision behavior.
- [ ] Differential-test only the declared binary-compatible adapter subset.
- [ ] Complete independent string/Unicode review at `G01`.

## Implementation impact

- Semantic tasks: `P01-006`, `P01-007`, `P01-011`–`P01-012`, `P01-016`, `P01-019`–`P01-020`.
- Physical/query work: `P03-*`, `P07-*`, `P08-*`, `P09-*`, `P10-027`, `P12-*`, `P22-*`.
- Requirements: `DATA-001`, `QUERY-001`, `CORE-003`.
- Gate: `G01` and later format/backend/compatibility gates.

## Follow-up work

- [ ] Implement the executable Unicode/string corpus and oracle.
- [ ] Evaluate a versioned opt-in collation provider only after v1 binary semantics ship.
- [ ] Publish explicit adapter collation/regex differences before compatibility claims.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [String semantic contract](../architecture/string-semantics.md)
- [Unicode Standard 17.0.0](https://www.unicode.org/versions/Unicode17.0.0/)

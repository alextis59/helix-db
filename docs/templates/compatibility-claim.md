# Compatibility Claim: ADAPTER OR API

- Status: Draft / Experimental / Supported / Superseded
- HelixDB version/artifact: IMMUTABLE VERSION OR DIGEST
- Adapter/SDK version: VERSION
- Upstream reference product/version: NAME AND VERSION
- Owner: Compatibility owner
- Requirements/tasks: `COMPAT-ID`, `TASK-ID`
- Evidence directory: LINK

## Claim wording

State the exact tested subset. Do not use unqualified “compatible,” “drop-in replacement,” or equivalent language.

Approved forms distinguish:

- **Inspired syntax**: familiar shape, HelixDB-owned semantics.
- **Adapter support**: commands and behavior marked green in this matrix.
- **Migration support**: data/operations covered by the named migration tool and validation procedure.

## Scope

### Supported

- Protocol/wire versions.
- Commands/operators/options.
- Authentication/session/cursor behavior.
- Types, limits, and errors.
- Transactions/consistency where applicable.
- Indexes, aggregation, TTL, streams, or migration behavior.

### Explicitly unsupported

- List every known unsupported category and the typed/protocol error returned.

### Experimental

- List behavior that is testable but not a supported release claim.

## Semantic differences

Document at minimum:

- Missing versus null.
- Arrays and nested paths.
- Numeric types, coercion, overflow, NaN, and ordering.
- Strings, Unicode, collation, regex, text, and geospatial behavior.
- Projection, sorting, tie-breaking, aggregation, and updates.
- Transactions, sessions, consistency, retries, and duplicate handling.
- TTL, eviction, persistence, pub/sub, streams, and failover.
- Limits, cancellation, resource errors, and partial results.

## Executable matrix

| Feature/case ID | Syntax/protocol | Expected reference result/error | HelixDB result/error | Classification | Evidence |
| --- | --- | --- | --- | --- | --- |
| `CMP-001` | Example | ... | ... | Exact / Different / Unsupported / Experimental | LINK |

Every published green/exact cell maps to a deterministic test.

## Environment and fixtures

- Reference product image/package and immutable digest.
- HelixDB and adapter artifact digests.
- Configuration and feature flags.
- Fixture generator/seed and data hashes.
- Normalization applied before comparison.
- Ordering/tolerance rules.

## Differential method

Describe command generation, reference execution, HelixDB execution, result/error normalization, comparison, shrinking/replay, and artifact retention. Preserve mismatches and their minimal replay cases.

## Error behavior

Map parse, validation, authentication, authorization, conflict, uniqueness, unsupported, quota, deadline, availability, and internal errors. Silent acceptance with approximate behavior is a failed compatibility case.

## Migration behavior

Document supported source types/features, transformations, checkpoint/resume, validation, TTL/version preservation, unsupported-data handling, rollback, and clean round-trip evidence.

## Operational differences

Document connection lifecycle, topology discovery, retries, failover, observability, performance model, backup/restore, and administrative differences relevant to client expectations.

## Known issues and residual risk

List finding IDs, severity, affected cases, workarounds, owners, and target versions.

## Evidence

- Executable matrix artifact and hash.
- Protocol captures where allowed.
- Differential raw results and replay corpus.
- Real client/application smoke tests.
- Migration source/destination hashes.
- Security and resource-limit tests.

## Publication checklist

- [ ] Upstream reference version is explicit and reproducible.
- [ ] Every supported cell has an executable test.
- [ ] Unsupported behavior returns the documented error.
- [ ] Differences are visible near the claim.
- [ ] Migration limits and rollback are documented.
- [ ] Claim wording was compared with the evidence.
- [ ] Independent compatibility review is recorded.

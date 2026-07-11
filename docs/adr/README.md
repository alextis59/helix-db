# Architecture Decision Records

Architecture decision records capture material technical and product choices that affect HelixDB semantics, persistent formats, protocols, security, portability, compatibility, operations, or delivery gates.

The process is governed by [Specification and Change Control](../governance/change-control.md). Copy [0000-template.md](0000-template.md) for a new decision and assign the next four-digit number. Numbers are never reused.

## Status values

- `Proposed`: under evaluation; experiments may rely on it, but it does not freeze a public or persistent contract.
- `Accepted`: approved and accompanied by every required specification, plan, fixture, compatibility, and migration update.
- `Rejected`: considered and declined, with the reason preserved.
- `Superseded`: replaced by a later ADR; both records link to each other.
- `Deprecated`: still historically valid but scheduled for removal or no longer recommended.

## Index

| ADR | Title | Status | Decision owner | Required before |
| --- | --- | --- | --- | --- |
| [0000](0000-template.md) | Template | Template | Project maintainers | N/A |
| [0001](0001-public-product-identity.md) | Retain HelixDB as a temporary development identity | Accepted | Project maintainer | `P00-005`, `G00`; revisit at `P16-016` |
| [0002](0002-exact-numeric-semantics.md) | Use exact mixed numeric comparison and checked arithmetic | Accepted | Query semantics owner | `P01-003`, `P01-004`, `G01` |
| [0003](0003-utc-microseconds-and-injected-clocks.md) | Use UTC microseconds and injected clock capabilities | Accepted | Query semantics owner | `P01-005`, `G01` |
| [0004](0004-preserve-utf8-and-use-binary-collation.md) | Preserve UTF-8 and use one binary v1 collation | Accepted | Query semantics owner | `P01-006`, `G01` |
| [0005](0005-explicit-array-matching.md) | Use explicit whole-array and element matching | Accepted | Query semantics owner | `P01-008`, `G01` |
| [0006](0006-default-to-uuidv7-identifiers.md) | Default native generated identifiers to UUIDv7 | Accepted | Query semantics owner | `P01-009`, `G01` |
| [0007](0007-exact-vector-results-with-cpu-reranking.md) | Keep vector results exact with CPU reference reranking | Accepted | Query semantics owner | `P01-010`, `G01` |
| [0008](0008-use-one-portable-v1-limit-profile.md) | Use one portable v1 limit profile | Accepted | Query semantics owner | `P01-011`, `G01` |
| [0009](0009-use-versioned-error-codes-and-outcomes.md) | Use versioned error codes, mutation outcomes, and retry scopes | Accepted | Query semantics owner | `P01-016`, `G01` |
| [0010](0010-use-id-order-as-the-native-default.md) | Use ascending semantic `_id` order as the native default | Accepted | Query semantics owner | `P01-017`, `G01` |
| [0011](0011-use-tagged-json-semantic-fixtures.md) | Use tagged JSON semantic fixtures with schema and canonical hashes | Accepted | Query semantics owner | `P01-018`, `G01` |
| [0012](0012-use-bounded-little-endian-hdoc-v1.md) | Use a bounded little-endian HDoc v1 envelope with separate integrity and content hashes | Accepted | Storage architecture owner | `P03-002`–`P03-011`, `G03` |

## Naming and file rules

- File name: `NNNN-short-kebab-title.md`.
- Title: `ADR NNNN: Concise decision statement`.
- Dates use `YYYY-MM-DD`.
- Decision owners are roles or named maintainers accountable for closing the decision.
- “Required before” names a checklist item, phase gate, API freeze, or release.
- Links are repository-relative and must resolve in CI.

## Acceptance checklist

Before an ADR becomes `Accepted`, verify that it:

- States the decision in implementable terms.
- Records all serious alternatives and why they were not selected.
- Identifies affected requirement and implementation-plan IDs.
- Describes correctness, security, portability, performance, operational, and licensing consequences.
- Defines persistent/public compatibility and migration consequences.
- Defines rollback or the point at which rollback becomes unsafe.
- Lists tests, experiments, and artifacts that validate the choice.
- Updates the specification and plan in the same change when behavior or scope changes.
- Updates this index.

## Review rule

An ADR can be implemented experimentally while `Proposed`, but no public protocol, persistent format, compatibility claim, or production default is frozen until the ADR is accepted. Phase gates must link to the accepted ADRs on which they depend.

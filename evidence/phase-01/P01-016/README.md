# P01-016 Stable Error Semantics Evidence

- Task: `P01-016` — define stable error categories for parse, validation, type, conflict, uniqueness, authorization, capability, quota, deadline, durability, and internal failures
- Requirements: `QUERY-002`, `STORE-001`, `GPU-004`, `SEC-001`
- Accepted decision: [ADR 0009](../../../docs/adr/0009-use-versioned-error-codes-and-outcomes.md)
- Commit under test: `bc68163788d653d1cb73af8f63bd973704dae794`
- Recorded at: `2026-07-10T19:50:45Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the committed semantic baseline defines an `errors-v1` envelope; all 11 required categories; 74 unique category-correct stable codes; phases; four mutation-outcome values; seven retry scopes; bounded detail/cause schemas; deterministic eight-class primary-error precedence; redaction/disclosure rules; transport/SDK/adapter mapping rules; low-cardinality observability; compatibility evolution; and required fixtures.

It also proves that ADR 0009 records alternatives, consequences, migration, security, validation, and implementation impact; the specification binds the error contract; and the ADR index contains the accepted decision.

This task freezes semantics. It does not claim that production parsers, execution engines, commit/idempotency records, protocols, SDKs, GPU fallback, adapters, or fault injection already implement the contract.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
Git: 2.34.1
Node: v22.19.0
```

## Commands

```bash
git status --porcelain=v1
git diff --check bc68163788d653d1cb73af8f63bd973704dae794^ bc68163788d653d1cb73af8f63bd973704dae794
git diff-tree --no-commit-id --name-status -r bc68163788d653d1cb73af8f63bd973704dae794
node evidence/phase-01/P01-016/verify.mjs bc68163788d653d1cb73af8f63bd973704dae794
git show bc68163788d653d1cb73af8f63bd973704dae794:docs/architecture/error-semantics.md | sha256sum
git show bc68163788d653d1cb73af8f63bd973704dae794:docs/adr/0009-use-versioned-error-codes-and-outcomes.md | sha256sum
git show bc68163788d653d1cb73af8f63bd973704dae794:Specifications.md | sha256sum
git show bc68163788d653d1cb73af8f63bd973704dae794:docs/adr/README.md | sha256sum
```

The committed [verify.mjs](verify.mjs) verifier resolves the supplied commit, requires the exact four-file artifact scope, runs `git diff --check`, reads every artifact through `git show`, validates Markdown formatting and local links through `git cat-file`, and checks the registry, envelope, outcomes, retries, precedence, safety markers, ADR, specification, and index.

## Results

- The worktree was clean before evidence creation; every recorded command exited with status 0.
- Artifact scope was exactly the two new semantic/decision documents plus the specification and ADR-index refinements.
- Categories: 11 of 11, in the required stable taxonomy.
- Codes: 74 unique codes, all under the registered category prefix and expected per-category count.
- Envelope fields: 13 of 13, including independent schema and `errors-v1` registry identifiers.
- Mutation outcomes: 4 of 4 (`not_applicable`, `not_committed`, `committed`, `unknown`).
- Retry scopes: 7 of 7, with preserved write idempotency identity and conservative unknown-code/outcome behavior.
- Deterministic precedence: 8 of 8 classes, including stable target/batch selection and commit/durability priority.
- Safety checks found the required acknowledgement-unknown, authorization-existence masking, bounded disclosure, and low-cardinality rules.
- ADR alternatives/impact, specification refinement, ADR index, formatting, and local links all passed.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/error-semantics.md` | `f1c37813e6af11521ecdd4837202fd6ad26556ef511cc1b56156829744c84657` | 24,626 | Normative `errors-v1` contract and registry |
| `docs/adr/0009-use-versioned-error-codes-and-outcomes.md` | `694fee511a7792eac5c05c15a6c12a6f61df413e0394705014fc048b2ee1dbb7` | 8,050 | Accepted design decision and consequences |
| `Specifications.md` | `3cade93f42d99fa54715ba83d5bc17a480b2b42ff9f145d28ed69165de07b1fe` | 69,539 | Normative error-contract refinement link |
| `docs/adr/README.md` | `8f1bf28c37b07860cea2fb2246d99d2b5392283644f808e345d3fba1407accea` | 3,901 | ADR 0009 index entry |
| `evidence/phase-01/P01-016/verify.mjs` | `4ee2e59e424e5a67e3fd6150ed991f918e994534e3579461286780b1973745a5` | 7,971 | Reproducible committed-artifact verifier |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No recorded validation failed and no required category was skipped.
- The verifier checks the committed contract's internal completeness and integration; it is not an implementation conformance test.
- Language-neutral error fixtures, the executable reference oracle, and cross-runtime/backend comparisons remain `P01-018`–`P01-020` and later runtime gates.
- Commit/abort/unknown outcomes still require crash, timeout, disconnect, sync, and idempotency fault injection.
- Exact code-level HTTP, gRPC, SDK, Mongo-like, and Redis-like mappings remain owned by their versioned protocol/adapter profiles.
- Redaction canaries, restricted diagnostic handling, metrics cardinality, and independent security/durability review remain later gates.
- Independent semantic review remains required for `G01`.

## Review

Focused review checked category/code coverage, prefix uniqueness, schema versus registry versioning, outcome certainty, unsafe fresh-write retry prevention, deterministic competing-error selection, GPU/optimized equivalence obligations, authorization existence masking, bounded details/causes, client/log/metric disclosure boundaries, lossy transport mappings, unknown-client behavior, and ADR rollback/migration consequences. No blocking finding remained in the semantic artifact.

## Reproduction

From a repository revision containing this evidence directory, verify that commit `bc68163788d653d1cb73af8f63bd973704dae794` exists and run the commands above from the repository root. The verifier prints the same four immutable artifact hashes and byte sizes recorded here and in [manifest.json](manifest.json).

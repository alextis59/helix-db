# P03-003 HDoc 1.x Logical Type Tag Evidence

- Task: `P03-003` — assign stable type tags for every required value type and reserve extension
  ranges
- Requirements supported: `INV-001`, `INV-007`, `CORE-001`, `DATA-001`, `DATA-002`
- Accepted decision: [ADR 0012](../../../docs/adr/0012-use-bounded-little-endian-hdoc-v1.md)
- Normative format: [HDoc 1.x logical type tags](../../../docs/formats/hdoc-v1-type-tags.md)
- Machine companion: [hdoc-v1-type-tags.json](../../../docs/formats/hdoc-v1-type-tags.json)
- Parent format: [HDoc 1.0 envelope](../../../docs/formats/hdoc-v1.md)
- Commit under test: `dc2122875b80d7d958c9b598fc4fd2dc8f7d0ce2`
- Recorded at: `2026-07-11T08:41:11.627Z`
- Source worktree: clean
- Recorder: Codex implementation agent
- Reviewer: pending independent `G03` format/security review
- Verdict: Pass

## Scope and result

The source commit fixes one stable unsigned byte of type identity for every stored HDoc 1.x logical
type. It deliberately does not define the payload following a tag, the containing field/container
record, a valid content-hash profile, a complete HDoc fixture, or an encoder/decoder claim.

| Tag class | Exact result |
| --- | --- |
| Invalid sentinel | `0x00`; always rejected, never Missing |
| Core HDoc 1.x | `0x01`–`0x10`; 16 contiguous, distinct assignments |
| Future standard | `0x11`–`0x3f`; reject while unassigned |
| Registered semantic extensions | `0x40`–`0x7f`; require understood feature and registry entry |
| Experimental/private | `0x80`–`0xef`; forbidden in supported HDoc |
| Future control/escape | `0xf0`–`0xfe`; forbidden in HDoc 1.x |
| Permanently invalid | `0xff`; never allocated |

Together, the 16 assigned bytes and six reserved ranges classify every value from `0x00` through
`0xff` exactly once, without gaps or overlap. Unknown/unassigned tags fail closed before value
exposure, allocations are global to HDoc major 1, and assigned or retired bytes are never reused.

## Core assignments

| Tag | Type | Tag | Type |
| ---: | --- | ---: | --- |
| `0x01` | null | `0x09` | object |
| `0x02` | Boolean | `0x0a` | array |
| `0x03` | int32 | `0x0b` | timestamp |
| `0x04` | int64 | `0x0c` | date |
| `0x05` | float64 | `0x0d` | UUID |
| `0x06` | decimal128 | `0x0e` | ObjectId |
| `0x07` | string | `0x0f` | `vector<f32,N>` |
| `0x08` | binary | `0x10` | `vector<f16,N>` |

The tag is semantic identity, not a host enum ordinal, comparison rank, payload length, or compact
encoding. Null is a present stored value. Missing remains a transient path-evaluation result with
no stored tag. Numeric widths, string/binary, object/array, temporal, identifier, and vector element
families therefore cannot substitute tags even when a particular operator can compare or convert
them explicitly.

## Semantic fixture reconciliation

The Phase 1 semantic coverage authority contains 16 fixture value tags, including transient
`missing` and one umbrella `vector` tag. The verifier derives the stored HDoc set by:

1. removing `missing`;
2. expanding `vector` to `vector<f32,N>` and `vector<f16,N>`; and
3. retaining the other 14 logical types exactly.

That derivation produces exactly the machine registry's 16 logical types. This proves the registry
did not silently add a storable Missing value, omit a required type, or collapse the two accepted
vector representations.

## Identity, extension, and hashing boundaries

The registry fixes ten governing rules:

- exactly one tag per stored logical type and no compact/inline aliases;
- no Missing tag and no payload-shape coercion;
- fail-closed handling for every unknown/unassigned tag;
- stable registry plus required-feature negotiation for semantic extensions;
- permanent no-reuse of assigned or retired bytes;
- inclusion of the tag in later canonical typed-hash framing;
- separation of stored identity from semantic comparison normalization; and
- explicit `P03-004`/`P03-005` ownership of payload and container bytes.

The experimental/private range is a containment boundary, not a vendor-extension API. It cannot
enter supported databases, backups, replication, or release fixtures. Promotion requires a new
registered byte and migration. There is no HDoc 1.x multi-byte escape.

## Source artifacts and generated authority

The exact 11-file source commit:

- adds the 371-line normative type-tag document and 293-line canonical JSON registry;
- links the registry from the specification, study, format/docs indexes, parent envelope, and
  accepted ADR;
- checks the ADR's `P03-003` validation/follow-up rows while leaving the implementation-plan task
  open until this evidence exists;
- regenerates the specification-bound 263-row semantic compatibility matrix and rendered document;
  and
- refreshes the deterministic fixture-generation report with both generated artifact identities.

It changes no Rust/TypeScript source, crate/package manifest, dependency, lockfile, HDoc payload or
container bytes, valid persistent fixture, public API, or compatibility claim.

## Focused machine validation

The [verifier](verify.mjs) extracts only the immutable source commit and proves:

- the exact 11-artifact diff, parent/tree identity, byte counts, and SHA-256 identities;
- canonical two-space JSON with schema, 8-bit format identity, maturity flags, and later owners;
- the exact tag number, hexadecimal spelling, machine name, logical type, family, width class, and
  payload owner for all 16 types;
- uniqueness of tag numbers, tag names, and logical types;
- exact endpoints, hexadecimal spellings, classes, reader/writer behavior, and allocation owners
  for all six reserved ranges;
- complete single classification of all 256 possible bytes;
- exact reconciliation with `fixtures/semantic/coverage-v1.json`;
- all ten identity/extension/hash/ownership rules and all 29 normative headings;
- core/range tables, maturity brakes, unknown-tag rejection, and subordinate task boundaries in
  prose;
- specification, study, index, parent-format, and ADR backlinks/state;
- the source plan's still-open `P03-003` state;
- compatibility-matrix binding to the changed specification and deterministic-generation-report
  binding to both generated artifacts;
- all 167 Markdown files, terminal newlines, trailing-whitespace absence, and 1,173 local links; and
- an isolated, network-free replay of the 263-row compatibility generator from source-commit bytes.

## Negative verification

The verifier executes 44 isolated in-memory mutation canaries. They separately corrupt:

- JSON canonicalization, schema, tag width, unknown behavior, Missing/payload maturity flags, and
  later owner;
- assigned byte, hexadecimal spelling, machine/logical name, family, width class, owner, type
  inventory, and f32/f16 split;
- sentinel, future-standard, registered-extension, private, control, and permanent-invalid range
  endpoints, classes, behaviors, and owners;
- rule identity and the permanent no-reuse rule;
- fixture inventory, Missing exclusion, vector expansion, derived count, and semantic-authority
  binding;
- tag-field, Missing, typed-hash, unknown-extension, core-table, and range-table prose;
- specification, study, format-index, docs-index, parent-envelope, and ADR links/state;
- the source plan's required open state;
- the generated compatibility matrix's specification identity; and
- the fixture-generation report's matrix identity.

Every canary must reach its intended first rejection reason. Mutations operate only on extracted
in-memory strings and never touch the workspace.

## Broader validation

Before the source commit:

- canonical registry formatting and direct 16-tag/six-range/full-domain validation passed;
- the current tree contained 167 Markdown files and 1,173 resolving local links;
- the compatibility generator/checker passed with 263 rows, zero failures/skips, and seven matrix
  mutation canaries;
- `fixtures:check` passed all four generators, five authority artifacts, schemas, independent
  SplitMix64 reproduction, and deterministic subordinate checks;
- JavaScript/dependency policy passed; and
- `test:all` passed nine Rust tests, 17 semantic fixtures/313 steps/382 oracle assertions, 16
  MongoDB cases, Wasm/browser bundle checks, three declared browser tests, benchmark schema/raw
  validation, 19 benchmark rejection canaries, and all reserved-suite claim boundaries.

The evidence verifier passed under exact Node.js 22.23.1 and 24.18.0.

## Commands

```bash
node compatibility/v1/generate-matrix.mjs --check
node compatibility/v1/check-matrix.mjs
corepack npm run fixtures:check
corepack npm run policy:javascript
corepack npm run test:all
/home/alextis/.nvm/versions/node/v22.23.1/bin/node \
  evidence/phase-03/P03-003/verify.mjs \
  dc2122875b80d7d958c9b598fc4fd2dc8f7d0ce2
/home/alextis/.nvm/versions/node/v24.18.0/bin/node \
  evidence/phase-03/P03-003/verify.mjs \
  dc2122875b80d7d958c9b598fc4fd2dc8f7d0ce2
```

## Failures, skips, and limitations

- No final focused, fixture, policy, aggregate, or evidence-verifier check failed or skipped.
- Canonical payload bytes remain `P03-004`; the registry's width classes are ownership boundaries,
  not encodings.
- Field/name/object/array/container records and exact tag positions remain `P03-005`.
- Exact checksum/hash framing and the first valid content-hash profile remain `P03-006`.
- Compression and extension-feature record grammars remain `P03-007`/`P03-015`.
- No valid HDoc golden fixture exists yet, so no data migration or reader/writer compatibility
  claim is made.
- Encoders, decoders, cross-language readers, malformed/property tests, fuzzing, and benchmarks
  remain `P03-008`–`P03-021` and block `G03`.
- This task distinguishes Missing from null at the type-identity boundary only; physical presence
  records under `P03-005` and every later storage/query representation remain required for
  `DATA-002`.

## Reproduction

Check out `dc2122875b80d7d958c9b598fc4fd2dc8f7d0ce2`, run the commands above, and compare the 11 source
identities in [manifest.json](manifest.json). The verifier extracts the source commit for its
generator replay and requires no network access.

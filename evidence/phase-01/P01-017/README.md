# P01-017 Deterministic Default Ordering Evidence

- Task: `P01-017` — define deterministic result ordering without explicit sort and document intentionally unspecified order
- Requirements: `QUERY-001`, `INV-002`
- Accepted decision: [ADR 0010](../../../docs/adr/0010-use-id-order-as-the-native-default.md)
- Commit under test: `25dc994148437491d72ccc78fb252671828fbc39`
- Recorded at: `2026-07-10T20:04:34Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the committed `default_order_v1` baseline defines ascending semantic `_id` as the native unsorted collection order; explicit and vector tie rules; command-input versus collection ordering; one/many write selection; typed hidden pipeline ordinals; repeated stable sort; unwind/group/count transforms; cursor continuation; backend/index/GPU/distributed equivalence; resource/error behavior; compatibility/versioning; and the limited internal/concurrent surfaces whose order is intentionally unspecified.

It also proves that ADR 0010 records alternatives and impact, Specifications section 8.6 binds the profile, ADR 0010 is indexed, and the existing CRUD, aggregation, and identifier contracts are linked/refined consistently.

This task freezes semantics. It does not claim that storage/index/query/GPU/cursor implementations, persistent ordinal codecs, or distributed merge code already enforce the order.

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
git diff --check 25dc994148437491d72ccc78fb252671828fbc39^ 25dc994148437491d72ccc78fb252671828fbc39
git diff-tree --no-commit-id --name-status -r 25dc994148437491d72ccc78fb252671828fbc39
node evidence/phase-01/P01-017/verify.mjs 25dc994148437491d72ccc78fb252671828fbc39
git show 25dc994148437491d72ccc78fb252671828fbc39:docs/architecture/default-ordering-semantics.md | sha256sum
git show 25dc994148437491d72ccc78fb252671828fbc39:docs/adr/0010-use-id-order-as-the-native-default.md | sha256sum
git show 25dc994148437491d72ccc78fb252671828fbc39:Specifications.md | sha256sum
git show 25dc994148437491d72ccc78fb252671828fbc39:docs/architecture/crud-query-semantics.md | sha256sum
git show 25dc994148437491d72ccc78fb252671828fbc39:docs/architecture/aggregation-semantics.md | sha256sum
git show 25dc994148437491d72ccc78fb252671828fbc39:docs/architecture/identifier-semantics.md | sha256sum
git show 25dc994148437491d72ccc78fb252671828fbc39:docs/adr/README.md | sha256sum
```

The committed [verify.mjs](verify.mjs) verifier resolves the supplied commit; requires the exact seven-file artifact scope; runs `git diff --check`; reads files through `git show`; validates formatting and local links through `git cat-file`; checks sections, surfaces, ordinal forms, ID order, unspecified/safety rules, refinements, ADR/specification/index integration; and executes ordering sanity cases.

## Results

- The worktree was clean before evidence creation; every finalized recorded command exited with status 0.
- Artifact scope was exactly seven ordering/decision/specification/integration files.
- Contract sections: 14 of 14; command/stage surfaces: 17 of 17; typed ordinal forms: 6 of 6.
- Primary-ID order classes: 5 of 5 in the accepted order; explicitly unspecified internal/concurrent surfaces: 7 of 7.
- Three different physical permutations produced the same mixed-type ID order.
- Unsorted rows reordered by `_id`; explicit ties used `_id`; a second stable sort retained the immediately prior sort order rather than reverting to source order.
- Unwind kept parent order and ascending element provenance; equal semantic group keys retained the first exact representation by current ordinal.
- Input-correlated batch IDs retained input position while cursor batches concatenated to the exact one-shot default sequence.
- CRUD/aggregation/identifier refinements, ADR alternatives/impact, specification refinement, ADR index, formatting, and links passed.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/default-ordering-semantics.md` | `d33636eeaa46bf5daee8adcb54e56799f32b6f75776e2bbfd5d1b48744db4172` | 20,822 | Normative `default_order_v1` contract |
| `docs/adr/0010-use-id-order-as-the-native-default.md` | `5d1d40b5b0b76bbbc761b6249a80ce8258eb5657f826a27c3573808f122e3777` | 8,553 | Accepted default-order decision |
| `Specifications.md` | `1024b3e2e717defc4a690ac172f51271afdab95a5a20467bd5eebf8d38d60cba` | 70,868 | Normative ordering refinement link |
| `docs/architecture/crud-query-semantics.md` | `e72d1ea5f4353b0861a55d798bb31575177ada287b05dd5c5aed8f2eb1de6455` | 21,415 | CRUD target/default/tie integration |
| `docs/architecture/aggregation-semantics.md` | `fc9a416878dce81181d40e90c1e4dfc909c7c8c97fb1ffa72349eea9ca398b6e` | 17,567 | Structured repeated-sort ordinal and group representative refinement |
| `docs/architecture/identifier-semantics.md` | `c0296c0279ce17631f433f24d807380794e5484987a468d7ce3dcf4b087ba5d9` | 16,399 | Primary-ID order integration |
| `docs/adr/README.md` | `c4e8f79c9870f05a987839a0541d8a299845230e08a4ce6afd46cb4f65ebf52f` | 4,069 | ADR 0010 index entry |
| `evidence/phase-01/P01-017/verify.mjs` | `7baaab809b1adc2487ae839a19773e695977d387ce04fdacbf245488211533f5` | 10,804 | Reproducible committed-artifact/order sanity verifier |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- One verifier-development run failed because its expected phrase came from the specification rather than the ordering document; the matcher was corrected to the exact committed invariant and the full verifier was rerun successfully. The semantic artifact was unchanged.
- No finalized validation failed and no required ordering surface was skipped.
- JavaScript sanity models the frozen comparisons/provenance; it is not the later independent semantic interpreter or production query engine.
- Language-neutral executable cases and the independent oracle remain `P01-018`–`P01-020`.
- Primary/secondary/index/row/column/bitmap/hash/spill/GPU and rebuild/restore ordered-hash proof remains later implementation gates.
- Cursor/idempotency/protocol token and ordinal-codec implementations do not yet exist.
- Future distributed global merge and change-stream ordering remain their named v2 phases.
- Independent semantic review remains required for `G01`.

## Review

Focused review checked order-domain separation, mixed `_id` classes, lack of chronology/natural-order promise, explicit/vector ties, input-correlated inserts, single/multi-write target order, count triviality, repeated pipeline sort stability, unwind provenance, semantic group equality representatives, cursor continuation, physical/backend/resource behavior, deliberately unspecified interleavings, compatibility claims, and profile migration/rollback. No blocking finding remained in the semantic artifact.

## Reproduction

From a repository revision containing this evidence directory, verify that commit `25dc994148437491d72ccc78fb252671828fbc39` exists and run the commands above from the repository root. The verifier prints the same seven immutable hashes/byte sizes recorded here and in [manifest.json](manifest.json).

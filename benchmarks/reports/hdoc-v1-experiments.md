# HDoc v1 Experiment Decisions

- Status: Accepted P03-021 decision record
- Date: 2026-07-12
- Experiments: `EXP-001`, `EXP-002`
- Machine authority: [`helix.hdoc-experiment-decisions/1`](hdoc-v1-decisions.json)
- Raw evidence: [`P03-020`](../../evidence/phase-03/P03-020/README.md)
- Governing ADR: [ADR 0012](../../docs/adr/0012-use-bounded-little-endian-hdoc-v1.md)

## EXP-001 — HDoc layout

Select `helix.hdoc/1.0` with its self-contained base profile and optional canonical compression
profile 1. The decision rests on the combined semantic, byte-canonicality, corruption,
cross-language, property, fuzz, sanitizer, browser, and representative measurement evidence. The
raw timing observations demonstrate that every selected lookup path executes over fixed validated
tables, but no machine-specific number becomes a performance SLO or release claim.

The selected direct-field algorithm remains binary search over the validated name table followed
by the owning object's sorted field span. Nested paths remain bounded borrowed traversal with
preflighted candidate counts and array provenance. The experiment does not relax whole-document
validation or introduce an alternate logical representation.

## EXP-002 — Collection path dictionary

Retain `helix.path-dictionary/1.0` for stable identifiers in derived sidecars, indexes, planner
metadata, and later negotiated formats. Do not add dictionary references to authoritative HDoc 1.0
rows. HDoc 1.0 remains self-contained.

The P03-020 model encodes a real dictionary snapshot and amortizes it with one u32 reference per
registered path over 10,000 documents. Four representative shapes save 33.20% to 83.19% of the
modeled repeated-name bytes, while the one-field minimal shape costs 33.86% more. That mixed result
supports optional, workload-sensitive use; it does not justify mandatory coordination.

A future row-reference profile requires a new negotiated profile plus a real path-frequency
corpus, atomic row/dictionary version pins, read/write/recovery amplification measurements,
migration/rollback proof, and a policy that retains raw-name fallback when net benefit is absent.

## Claim boundary

These decisions select format behavior, not a latency/throughput SLO. They do not claim storage,
WAL, query, concurrency, cross-machine, or release performance. Those require their owning phases
and fresh retained evidence.

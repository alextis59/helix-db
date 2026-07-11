# Deterministic Fixture Generation and Seed Policy

- Status: Accepted foundation generation contract
- Last updated: 2026-07-11
- Owner: Quality and release owner
- Plan item: `P02-008`
- Governing gate: `G02`
- Registry: [`helix.fixture-generator-registry/1`](../../fixtures/generation/registry-v1.json)
- Aggregate report: [`helix.fixture-generation-report/1`](../../fixtures/generation/report-v1.json)

## Purpose

Committed fixtures must be reproducible from reviewed inputs without wall time, host identity, locale, timezone, filesystem order, network state, or ambient randomness. The generator registry makes each active generator's identity, version, check/write command, randomness mode, seed, algorithm, authority artifacts, schemas, and owning task reviewable as data.

`npm run fixtures:check` is read-only. It validates the registry, every registered JSON artifact against Draft 2020-12, the report's raw byte/SHA-256 identities, the seeded vector through an independent Python implementation, and the component generators/checkers for the semantic corpus, oracle report, and compatibility matrix. It then proves no registered artifact changed.

`npm run fixtures:generate` is an intentional write command. It currently writes only the seeded vector and aggregate report directly; the other registry entries retain their component-specific write commands because semantic and compatibility changes require domain review. A successful write is never acceptance by itself.

## Registered generators

| Generator | Randomness | Authority artifact | Independent check |
| --- | --- | --- | --- |
| `toolchain.splitmix64-vectors` 1.0.0 | Seeded | Portable 16-word vector | Independent Python recomputation plus schema/hash checks |
| `semantics.corpus-v1` 1.0.0 | None | Corpus manifest binding 17 fixtures/313 steps | Corpus generator and independent corpus checker |
| `semantics.oracle-report-v1` 1.0.0 | None | Oracle report | Oracle generation check and 382-assertion oracle tests |
| `compatibility.matrix-v1` 1.0.0 | None | Matrix JSON plus derived Markdown | Matrix generator and independent matrix checker |

The authority artifact may bind a larger output set. For example, the semantic manifest carries every case path, byte count, source/canonical hash, coverage ID, and count; the registry does not duplicate that mutable inventory.

## Seed and PRNG contract

Seeded generators use a registry-unique unsigned 64-bit seed rendered as `0x` plus exactly 16 lowercase hexadecimal digits. The v1 bootstrap seed is `0x48454c4958444231` (the bytes for `HELIXDB1`) and is the initial state before the first increment.

The algorithm ID `helix.splitmix64-fixed-gamma/1` defines this exact unsigned modulo-2^64 sequence:

1. add `0x9e3779b97f4a7c15` to state;
2. xor with the value shifted right 30, then multiply by `0xbf58476d1ce4e5b9`;
3. xor with the value shifted right 27, then multiply by `0x94d049bb133111eb`;
4. xor with the value shifted right 31; and
5. render the low 64 bits as 16 lowercase hexadecimal digits.

The algorithm derives from the SplitMix work described in [Fast Splittable Pseudorandom Number Generators](https://gee.cs.oswego.edu/dl/papers/oopsla14.pdf). It is frozen here only for portable, replayable fixture construction. It is non-cryptographic, does not supply identifiers/keys/nonces, does not justify statistical quality claims, and is not database semantics.

A seed belongs to one generator ID/profile. Parallel shards derive reviewed child seeds through a future versioned derivation rule; they do not add worker indexes ad hoc. Changing a seed, algorithm, first-output convention, word width, byte order, or output encoding is an artifact-format change requiring regenerated vectors, report hashes, consumer checks, and review.

## Artifact and schema rules

The registry, seeded vector, and aggregate report each have a strict [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12) schema with unknown fields rejected. Every registered JSON authority names its schema; generated Markdown is hash-bound and names `null` rather than pretending to have a JSON schema.

Generated JSON uses UTF-8, two-space indentation, LF endings, stable insertion order declared by its generator, and one terminal newline. SHA-256 uses raw committed bytes through Node's stable [`crypto.createHash`](https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options) API. Reports contain no timestamp, duration, hostname, absolute path, locale, or mutable tool output.

Every new generator must:

1. receive a stable ID, version, owner task, and exact check/write commands;
2. declare `none` or a registry-unique seed plus a versioned algorithm;
3. name every authority artifact and every JSON schema;
4. generate entirely in memory before check/write reconciliation;
5. provide an independent consumer/reproduction check rather than trusting only itself;
6. reject unknown schema versions, missing outputs, stale hashes, and unreviewed paths;
7. keep check mode byte-for-byte read-only and network-free; and
8. update the aggregate report and retained task evidence.

## External and discovered artifacts

The pinned MongoDB observations are reproducible evidence from a controlled external implementation, not deterministic generation: their provenance includes image/server/client identities and a live run. Fuzz crashes, benchmark results, crash/recovery histories, distributed histories, and security findings likewise retain real environment/provenance data under their own schemas. They must not be laundered into a timestamp-free generated report.

## Claim boundary

This policy proves repeatable generator orchestration, schema enforcement, committed seed meaning, and exact current artifacts. It does not prove fixture completeness, statistical randomness, semantic correctness beyond the existing independent checks, cross-platform database behavior, external-system stability, or release readiness.

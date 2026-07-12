# Collection Field-Path Dictionary 1.0

- Status: Implemented canonical codec, lineage proof, registration, resolution, recovery, and pins
- Last updated: 2026-07-11
- Owner: Storage architecture owner
- Format identity: `helix.path-dictionary/1.0`
- Plan item: `P03-013`
- Governing gate: `G03`
- Governing decision: [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)
- Machine-readable companion: [path-dictionary-v1.json](path-dictionary-v1.json)

## Scope and maturity boundary

This document fixes the collection-scoped append-only mapping from exact canonical dotted field
paths to dense numeric IDs. It defines snapshot bytes, versions, identity, canonical ordering,
limits, validation order, integrity, semantic identity, and the cross-snapshot rule that prevents
ID reuse or reinterpretation.

`P03-013` implements complete snapshot encoding/decoding and explicit successor validation in
`helix-doc`. `P03-014` implements optimistic atomic registration/publication, resolution indexes,
durable snapshot handoff, complete-chain recovery, and immutable version pins. The
[P03-015 matrix](hdoc-v1-compatibility.md) explicitly rejects HDoc dictionary-reference records
because their body grammar is not implemented. Base HDoc 1.0 remains self-contained and does not
emit the reserved dictionary feature bit.

## Implemented registration and publication lifecycle

`CollectionPathDictionary` owns one authoritative `PathDictionaryPin`. A new collection starts at
the canonical empty version-zero snapshot. `prepare_registration(paths)` validates every requested
path before changing state, resolves existing and duplicate requests idempotently, assigns new IDs
in first-request order, and creates at most one next version for the complete batch. The first
nonempty batch inserts `_id` at ID 1 automatically unless it was explicitly requested.

Preparation returns `PreparedPathDictionaryUpdate` containing:

- exact base dictionary identity, version, and semantic content hash;
- request-order ID/introduction-version results, including duplicates;
- a completely encoded and validated candidate snapshot suitable for durable staging; and
- an explicit changed/no-op version result.

`publish(update)` compares all three base coordinates with the still-authoritative pin. Drift from
another publication fails atomically as `CON_WRITE_CONFLICT`; it never rebases or silently assigns
different IDs. A changed candidate must pass the P03-013 predecessor/successor validator again.
An idempotent no-op must have bytes exactly equal to the current snapshot. Only then is the
authoritative pin replaced. `register_paths` is the single-owner prepare-plus-publish convenience;
concurrent callers use the split durable-staging boundary.

## Resolution and version pinning

`PathDictionaryPin` owns exact validated snapshot bytes, a dense ID-indexed entry vector, and an
exact-path ordered map. `resolve_path` and `resolve_id` allocate nothing and never consult newer
state. Introduction-version lookup is equally pinned. Cloning a pin preserves the exact identity,
version, content hash, bytes, and resolution result after the collection publishes later versions.

`PathDictionarySnapshot::from_bytes` and `PathDictionaryPin::from_snapshot` validate externally
retained bytes. A standalone pin proves one snapshot but cannot prove historical non-reuse.
`CollectionPathDictionary::recover` therefore requires a nonempty genesis-to-current chain,
requires version zero first, validates every snapshot, and proves every adjacent successor before
exposing the final authoritative pin. The core performs no ambient filesystem I/O: storage phases
own durable write/sync/manifest selection and pass exact snapshots into this recovery primitive.

## Logical model and invariants

A dictionary has one nonzero 16-byte `dictionary_id` bound to one collection lineage. Snapshot
version zero is empty. Every nonempty snapshot obeys all of these rules:

- IDs are dense unsigned integers `1..entry_count` in ascending storage order.
- ID 1 is the exact path `_id`, introduced at version 1.
- Every path is valid under `limits-v1`, is stored as exact UTF-8, and appears once.
- `introduced_version` starts at 1, never decreases, and advances by at most one; multiple paths
  may be introduced in the same version.
- The snapshot version equals the final entry's `introduced_version`.
- Versions have no empty gaps. A committed successor advances exactly one version and adds at
  least one entry.
- Existing entries remain byte-for-byte identical in every successor. Deletion, rename, schema
  removal, or collection compaction never removes an entry and never makes its ID reusable.

The numeric ID is derived collection metadata, not field meaning. Imports resolve and validate
exact path text; they never trust an external numeric ID without the exact dictionary identity and
version.

## Stored layout

All integers are unsigned little-endian. All offsets are absolute from snapshot byte zero. The
complete layout is:

```text
byte 0
┌────────────────────────────────────────────┐
│ fixed header: 64 bytes                     │
├────────────────────────────────────────────┤
│ entry table: entry_count × 24 bytes        │
├────────────────────────────────────────────┤
│ exact UTF-8 path pool, concatenated by ID  │
├────────────────────────────────────────────┤
│ minimum zero padding to 8-byte alignment   │
├────────────────────────────────────────────┤
│ footer: 64 bytes                           │
└────────────────────────────────────────────┘
byte total_length
```

The empty snapshot is exactly 128 bytes. `dictionary.snapshot_bytes` caps the complete stored form
at 67,108,864 bytes and `dictionary.paths` caps `entry_count` at 1,000,000. Checked wide arithmetic
precedes allocation and table traversal.

## Header

Header magic is the exact eight bytes `48 50 44 49 43 54 0d 0a` (`HPDICT\r\n`).

| Offset | Bytes | Field | Required value/meaning |
| ---: | ---: | --- | --- |
| 0 | 8 | `magic` | Exact header magic |
| 8 | 2 | `major_version` | `1` |
| 10 | 2 | `minor_version` | `0` |
| 12 | 2 | `header_bytes` | `64` |
| 14 | 2 | `entry_bytes` | `24` |
| 16 | 4 | `flags` | `0`; all v1 bits reserved |
| 20 | 4 | `total_length` | Exact complete supplied byte length |
| 24 | 8 | `dictionary_version` | Zero only for the empty snapshot |
| 32 | 16 | `dictionary_id` | Nonzero collection-lineage identity |
| 48 | 4 | `entry_count` | Retained entries |
| 52 | 4 | `maximum_path_id` | Exactly equal to `entry_count` |
| 56 | 4 | `footer_offset` | Absolute, 8-byte aligned footer start |
| 60 | 4 | `crc32c` | Stored-byte checksum described below |

An unknown major/minor or wrong magic is `CAP_FORMAT_UNSUPPORTED`. A recognized header with wrong
widths, flags, identity, or copies is corruption; a declared complete length beyond supplied bytes
is truncated input.

## Entry table and path pool

| Entry offset | Bytes | Field | Required value/meaning |
| ---: | ---: | --- | --- |
| 0 | 4 | `path_id` | One-based table position |
| 4 | 2 | `flags` | `0`; all v1 bits reserved |
| 6 | 2 | `segment_count` | Exact dot-separated segment count |
| 8 | 8 | `introduced_version` | First version containing this path |
| 16 | 4 | `path_offset` | Absolute start of exact path bytes |
| 20 | 2 | `path_length` | Exact UTF-8 byte count |
| 22 | 2 | `reserved` | `0` |

The first path starts immediately after the entry table. Every next path starts at the preceding
path's end; there are no separators, terminators, aliases, gaps, or deduplication references. The
pool ends after the last path and only the minimum zero bytes needed to align the footer may
follow. Readers validate UTF-8, dotted-path grammar, byte/segment limits, uniqueness, dense IDs,
and version continuity before exposing a view.

## Footer, checksum, and semantic hash

Footer magic is `48 50 44 45 4e 44 0d 0a` (`HPDEND\r\n`).

| Footer offset | Bytes | Field | Required value/meaning |
| ---: | ---: | --- | --- |
| 0 | 8 | `magic` | Exact footer magic |
| 8 | 2 | `footer_bytes` | `64` |
| 10 | 2 | `hash_algorithm_id` | `1` = BLAKE3-256 |
| 12 | 2 | `hash_profile_id` | `1` |
| 14 | 2 | `footer_version` | `1` |
| 16 | 4 | `total_length_copy` | Exact header `total_length` |
| 20 | 4 | `entry_count_copy` | Exact header `entry_count` |
| 24 | 8 | `dictionary_version_copy` | Exact header version |
| 32 | 32 | `content_hash` | Profile-1 semantic hash |

CRC-32C Castagnoli covers the complete stored snapshot while header bytes `[60,64)` are treated as
zero. It detects physical byte corruption and includes the footer hash. The profile-1 semantic hash
is BLAKE3-256 over this unambiguous sequence:

1. ASCII domain plus NUL: `HELIX-PATH-DICTIONARY-V1\0`;
2. 16 raw dictionary-ID bytes;
3. `dictionary_version` as `u64-le`;
4. `entry_count` as `u32-le`; and
5. for each entry: `path_id:u32-le`, `introduced_version:u64-le`, `path_length:u32-le`, then exact
   path bytes.

The hash identifies logical snapshot content independently of offsets and padding. It is unkeyed
identity, not authentication.

## Canonical writer and validating reader

`encode_path_dictionary` accepts the complete logical snapshot, proves all invariants and limits,
measures the exact layout, emits minimal zero padding, writes the footer/hash, and finally writes
the CRC. Equivalent input produces identical bytes.

`decode_path_dictionary` validates in trust order: minimum header and supported format; exact
length and snapshot-byte limit; CRC; table/footer placement; entry records and path pool; logical
identity/version/path invariants; then footer copies and semantic hash. Success returns a borrowed
`PathDictionaryView`; no path view escapes earlier. Failures expose stable error code, bounded
check stage, and offset without retaining path text.

`validate_path_dictionary_successor` separately proves same identity, next consecutive version,
strictly larger entry count, exact retained prefix, and next-version introduction for every
appended entry. Decoding a snapshot alone cannot prove non-reuse because lineage is a relation
between two otherwise valid artifacts.

## Recovery, negotiation, and migration

A recovery path validates each candidate snapshot and its relationship to the previously
authoritative snapshot before publication. An interrupted append may leave an unreferenced valid
candidate, but cannot replace the prior authoritative version until durability metadata commits.
The in-memory preparation/publication and chain-validation lifecycle is implemented under
`P03-014`; storage phases own physical write/sync/manifest selection around these exact primitives.

Readers reject unsupported versions and unknown flags. They never repair paths, renumber IDs,
accept a different dictionary identity, or infer lineage from filename/order. A future compaction
that changes IDs requires a new dictionary identity plus explicit HDoc/sidecar migration; it is not
a v1 successor. HDoc dictionary references remain unsupported under the P03-015 closed-world
matrix; enabling them requires a future exact record, capability, preservation, downgrade, and
rollback decision with new fixtures.

## Verification obligations

The implementation tests deterministic empty/nonempty snapshots, multi-entry versions, borrowed
access, checksum/hash separation, every validation stage, invalid paths/IDs/version gaps,
path/snapshot limits, and successor identity/version/prefix/backdating failures. P03-016 now freezes
immutable HDoc golden bytes, `P03-017` owns an independent reader, `P03-018` adds deterministic
property/mutation and malformed-corpus expansion, and `P03-019` owns coverage-guided fuzzing.

Lifecycle tests additionally prove request-order/duplicate registration, automatic and explicit
`_id`, unchanged state before publish, stale-writer conflict, invalid-path rollback, exact no-op
publication, old-pin stability, bidirectional/introduction-version resolution, full-chain recovery,
missing genesis, skipped successor, corrupt snapshot, and defensive invalid-candidate rejection.

## References

- [Portable v1 limits](../architecture/limits-v1.md)
- [HDoc 1.0 envelope](hdoc-v1.md)
- [Specifications section 7.4](../../Specifications.md#74-field-path-dictionary)
- [Study section 6.3](../../Study.md#63-field-path-dictionaries)
- [Implementation plan Phase 3](../../ImplementationPlan.md#phase-3--hdoc-format-codec-and-path-dictionary)

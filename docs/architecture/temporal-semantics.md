# Timestamp, Date, Expiry, and Clock Semantics

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-005`
- Governing requirements: `QUERY-001`, `CORE-002`, `CACHE-002`
- Governing gate: `G01`
- Decision: [ADR 0003](../adr/0003-utc-microseconds-and-injected-clocks.md)
- Normative parent: [logical value model](value-model.md)

This document defines timestamp precision and range, timezone normalization, date conversion, logical expiry time, and every clock source visible to deterministic core logic. It separates civil time, absolute time, durations, MVCC order, and expiry so no host API or deployment mode silently changes meaning.

## Temporal type inventory

| Concept | Logical representation | Semantic purpose |
| --- | --- | --- |
| `timestamp` | Signed integer microseconds since Unix epoch, bounded to years 0001–9999 | Absolute UTC instant |
| `date` | Signed integer days since Unix epoch, bounded to years 0001–9999 | Calendar date without time/zone |
| `duration` | Checked signed integer microseconds in expression/runtime APIs; not a v1 stored value type | Elapsed amount |
| MVCC/logical timestamp | Versioned opaque transaction-order value | Snapshot/commit ordering |
| Monotonic instant | Host-scoped opaque counter | Deadline/elapsed-time measurement |

Only `timestamp` and `date` are stored logical value types. An MVCC timestamp, hybrid logical clock, monotonic instant, sequence number, or TTL duration cannot be inserted where a `timestamp` is expected without an explicit defined conversion—and most have no valid conversion at all.

## Timestamp representation

The v1 timestamp unit is one microsecond. Its epoch is:

```text
1970-01-01T00:00:00.000000Z = 0
```

The supported civil range is inclusive:

```text
0001-01-01T00:00:00.000000Z
through
9999-12-31T23:59:59.999999Z
```

The corresponding inclusive integer payload bounds are:

```text
-62_135_596_800_000_000
through
253_402_300_799_999_999
```

The canonical logical payload is a signed `i64` count of elapsed SI-like Unix microseconds from the epoch, excluding leap seconds. Physical formats store the integer in their specified canonical endianness and never a host `time_t`, JavaScript millisecond number, language object layout, or locale string.

Consequences:

- Timestamps compare and hash by their exact signed microsecond count.
- Inputs with finer precision are rejected unless an explicit conversion names a rounding policy; they are never silently truncated.
- A host with millisecond resolution supplies values whose lower three decimal digits are zero. It must not fabricate precision.
- JavaScript SDKs use `bigint`, `Temporal` where available with range checks, or an exact wrapper; unsafe `number` conversion is forbidden.
- Timestamp arithmetic is checked for range overflow/underflow and publishes no partial mutation on failure.

## Timestamp parsing and canonical formatting

Text input uses the [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) date-time shape with the stricter v1 profile below:

- Four-digit year in `0001` through `9999`.
- Uppercase `T` separator and uppercase `Z`, or an explicit numeric offset `±HH:MM`.
- Hour `00`–`23`, minute `00`–`59`, second `00`–`59`.
- Optional fractional seconds of one through six digits.
- Offset range `-14:00` through `+14:00`; when the hour is `14`, minutes must be `00`.
- `-00:00` is rejected because it denotes an unknown local offset rather than a known UTC instant; `Z` and `+00:00` are accepted.
- Named zones, abbreviations, implicit local time, locale formats, week dates, ordinal dates, and whitespace are rejected by the core parser.
- The complete token must be consumed.

The parser converts the stated offset to UTC using checked arithmetic and then range-checks the normalized instant. Different valid spellings of the same instant produce the same timestamp.

Canonical output is always UTC with exactly six fractional digits:

```text
YYYY-MM-DDTHH:MM:SS.ffffffZ
```

Canonical formatting never emits a local offset or named zone. User-facing SDKs may format a timestamp in a requested zone, but that is a presentation operation and does not change the stored value.

## Timezone normalization and daylight-saving behavior

The core accepts an explicit offset, not a named timezone database identifier. Therefore parsing has no ambiguous or nonexistent local-time case.

An SDK that accepts `Europe/Paris`, `America/New_York`, or another named zone must:

1. Use a documented timezone-database version.
2. Require a caller disambiguation policy for repeated or skipped local times.
3. Resolve the local civil time to one absolute instant before calling the core.
4. Submit the resolved instant/offset and expose the chosen zone/version in diagnostics when relevant.

The database stores neither the input offset nor zone name in a bare timestamp. Applications that need the original zone or appointment-time semantics store those fields separately.

## Leap seconds and Unix timeline

HelixDB uses the conventional Unix timeline and has no representable `23:59:60` timestamp:

- Text seconds value `60` is rejected.
- There is no leap-second table in canonical comparison or storage.
- Host clock step/smear behavior is an operational property reported by the host; it does not create extra stored instants.
- Importers must explicitly map a leap-second source according to their documented policy before insertion.

This keeps timestamp encoding portable across Rust, Wasm, browsers, operating systems, indexes, and GPU candidate paths.

## Date representation

`date` is a proleptic Gregorian calendar date with year, month, and day only. Its range is inclusive:

```text
0001-01-01 through 9999-12-31
```

The logical payload is a signed `i32` count of civil days relative to `1970-01-01 = 0`. Gregorian leap-year rules apply uniformly before and after the epoch within the supported range.

The inclusive date payload bounds are `-719_162` through `2_932_896`.

Canonical text is exactly `YYYY-MM-DD`. Date parsing rejects time-of-day, offsets, named zones, incomplete dates, invalid month/day combinations, locale order, and trailing input.

A date is not midnight in any implicit timezone. It compares/hashes by its day payload and remains a different logical type from timestamp.

## Date and timestamp conversion

No implicit date/timestamp conversion exists.

| Conversion | Rule |
| --- | --- |
| `date → timestamp` | Explicit `toTimestampUtc` maps the date to `00:00:00.000000Z` |
| `timestamp → date` | Explicit `toDateUtc` selects the UTC civil date containing the instant |
| Named-zone local date/time → timestamp | SDK/adapter resolves with named timezone database/version/disambiguation, then submits an absolute instant |
| Timestamp → named-zone date | Presentation/SDK operation using a named timezone database; not core equality or storage |

For instants before the epoch, day selection uses mathematical floor division, not truncation toward zero. Every conversion checks the target range.

Adding calendar months/years is not equivalent to adding a duration and is not implied by v1. A future calendar-arithmetic operator must define end-of-month, leap-day, zone, and overflow behavior explicitly.

## Clock capability roles

Deterministic core logic receives clocks only through explicit host capabilities. These roles are not interchangeable:

### `wall_time_utc()`

- Returns the host's best trusted UTC timestamp plus declared resolution and quality state.
- Supplies timestamp defaults, `now` expressions, and input to the expiry oracle.
- Is never called implicitly from a pure codec, comparator, hash, or replay function.

### `monotonic_now()`

- Returns an opaque nondecreasing process/host instant suitable only for elapsed durations, deadlines, scheduling, and benchmark stages.
- Has no epoch and is never persisted, compared across hosts, serialized as timestamp, or used for TTL expiration.

### `mvcc_now()` / transaction oracle

- Returns an opaque ordered value used for snapshots, versions, and commits.
- Is deterministic/injectable for tests and replay.
- Is not a user timestamp and cannot be inferred from `wall_time_utc()` even if a future hybrid clock contains physical bits.

### `logical_expiry_now()`

- Returns a trusted, nondecreasing UTC microsecond cutoff derived by the host's expiry oracle.
- Is durable/non-regressing across restart for durable storage profiles.
- Is sampled/pinned as described below and cannot be supplied by an ordinary client.

Tests may inject all capabilities with explicit fixture values. Production command fields cannot override them; an authorized administrative time-control mode must be visibly non-production and audited.

## Stable `now` evaluation

Ambient clock reads inside expression evaluation are forbidden.

- A top-level non-transactional command captures `statement_now` once before semantic execution.
- Every `now` expression/default in that command receives the same value.
- A multi-command transaction captures `transaction_now` at transaction start for expression semantics.
- Commit/version time is obtained separately from the transaction oracle and does not rewrite user timestamps.
- Retry of an idempotent command reuses the original captured `statement_now` from its canonical command record when the result must be identical.
- WAL/replicated commands contain resolved timestamp values or the captured time, never an instruction to read the receiver's clock during replay.

This makes batch writes, retries, replication, recovery, and differential tests deterministic.

## Logical expiry semantics

An expiring document/index entry stores an absolute `timestamp` named here as `expires_at`. A duration such as “TTL 60 seconds” is resolved to `expires_at` using checked arithmetic at the canonical mutation time; replay never recomputes it.

For a read snapshot with pinned expiry cutoff `E`:

```text
visible_by_ttl = expires_at is missing OR expires_at > E
expired        = expires_at is present AND expires_at <= E
```

The equality boundary is therefore expired. Explicit null is not a valid expiry timestamp unless a particular schema declares null to mean “no expiry”; the native TTL index contract uses missing for no expiry and reports a type error for present non-timestamp values.

Rules:

- A command/read transaction samples `logical_expiry_now()` once and pins it with the read snapshot.
- Cursor batches retain the original pinned cutoff, so one snapshot cannot lose rows merely because wall time advances.
- Visibility filtering applies before physical TTL deletion and on every row/index/sidecar path.
- TTL scanning, compaction, indexes, sidecars, backup, restore, synchronization, and replication use the same absolute expiration value and snapshot cutoff contract.
- Physical cleanup is idempotent maintenance; it does not define the logical moment of expiry.
- Inserting an already-expired timestamp is allowed as an explicit value but the document is invisible to later TTL-filtered snapshots; command result/return behavior is specified by CRUD tasks.
- Backup/export preserves `expires_at`; restore does not reset a TTL duration.

Point-in-time restore and historical snapshot tools must state which pinned expiry cutoff they use. They cannot silently substitute the restore machine's local clock while claiming historical query reproduction.

## Expiry clock safety

The host expiry oracle protects durable data from clock regression and suspicious forward jumps:

- Backward wall-clock movement is clamped to the last safe logical expiry cutoff.
- Durable profiles persist sufficient oracle state so restart cannot regress the cutoff and resurrect logically expired data.
- Forward movement is checked against monotonic elapsed time and host quality signals.
- A forward skew beyond the configured safety threshold (default: five minutes beyond monotonic elapsed time) enters `ClockUnsafe` instead of advancing expiry.
- While `ClockUnsafe`, TTL visibility remains pinned at the last safe cutoff, destructive TTL cleanup pauses, health/metrics report the condition, and an operator or trusted clock recovery must clear it.
- Suspension/resume and platforms without trustworthy elapsed-time comparison require host revalidation before advancing the cutoff.

The default threshold is a safety policy, not timestamp precision. It is versioned/configurable by deployment policy and must be recorded in diagnostic/backup evidence. Choosing availability with stale-but-not-prematurely-expired data during clock uncertainty avoids irreversible mass deletion.

## Deadlines, timeout, and elapsed metrics

Deadlines and durations use `monotonic_now()`:

- A request converts its allowed duration to a monotonic deadline at admission.
- CPU/GPU/storage/network stages check the same deadline and propagate cancellation.
- Wall-clock steps do not extend or shorten an admitted timeout.
- Logs may include both UTC timestamps and monotonic elapsed durations but never subtract unrelated clock domains.
- Persisted retry/backoff schedules store an absolute UTC resume timestamp only when cross-restart behavior is required; in-process waits use monotonic time.

## Ordering, indexes, and backend behavior

- Timestamps order by signed microsecond payload; dates order by signed day payload.
- Date and timestamp do not compare as equal or ordered without explicit conversion.
- Index keys, sort, group, distinct, min/max, and hashes preserve their distinct type tags.
- GPU/column sidecars may store exact split integer words if native `i64` is unavailable; any approximate float encoding is candidate-only and must not create false negatives.
- Zone maps use exact minima/maxima and separate missing/null metadata.
- CPU, Wasm, server, browser, adapter, and distributed paths receive the same normalized payload/captured clock values.

## Required fixtures

The semantic corpus includes:

- Epoch, pre-epoch, min/max supported timestamp, and one-microsecond boundary cases.
- Leap years/centuries (`2000` valid, `1900` invalid leap day), month ends, and date range limits.
- Every accepted offset edge, UTC rollover in both directions, `Z`/`+00:00` equivalence, and `-00:00` rejection.
- Fractional inputs of zero through seven digits, with explicit rejection above six without rounding policy.
- Leap-second, named-zone, local-time, invalid calendar, trailing-data, and overflow rejection.
- Date payload conversions before/at/after epoch using floor division.
- Once-per-command/transaction `now`, retry, WAL, replay, and replication determinism.
- TTL cases immediately before/at/after `E`, missing/null/wrong type, cursor pinning, delayed cleanup, backup, and restore.
- Backward clock, suspicious forward skew, restart, suspend/resume, `ClockUnsafe`, and recovery histories.
- Cross-host normalized values, order, type, error, and canonical result hashes.

## Follow-up ownership

| Plan item | Remaining temporal responsibility |
| --- | --- |
| `P01-012` | Time/cache predicate operator truth tables |
| `P01-013`–`P01-015` | Command, update, cursor, aggregation, and expression integration |
| `P01-016` | Stable parse/range/clock error codes |
| `P01-019`–`P01-020` | Executable temporal fixtures and reference oracle |
| `P03-*` | HDoc temporal tags/bytes and golden vectors |
| `P04-009` | Host clock capability ABI and deterministic injection |
| `P06-*` | MVCC oracle and snapshot/transaction integration |
| `P20-*` | TTL index, cleanup, cache storage-class, and clock fault histories |

No follow-up may use local timezone, millisecond truncation, ambient time, replay-time clock reads, or wall time for deadlines without a superseding ADR and semantic-version assessment.

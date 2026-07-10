# ADR 0003: Use UTC microseconds and injected clock capabilities

- Status: Accepted
- Date: 2026-07-10
- Decision owner: Query semantics owner
- Required before: `P01-005` and `G01`
- Supersedes: None
- Superseded by: None

## Context

HelixDB must represent absolute timestamps and calendar dates consistently across Rust, Wasm, browsers, servers, indexes, GPU sidecars, recovery, backups, TTL, future distribution, and compatibility adapters. Host date/time APIs differ in range, precision, timezone database, leap-second handling, monotonicity, and restart behavior.

The deterministic Wasm core also cannot read an ambient clock without violating the capability boundary. TTL makes a clock error potentially destructive: backward movement can resurrect data, while a forward jump can expire/delete data prematurely. A decision is required before temporal fixtures, HDoc tags, command defaults, MVCC, and TTL implementation.

This decision implements `P01-005` and contributes to `QUERY-001`, `CORE-002`, and `CACHE-002`.

## Decision drivers

- Lossless, sortable absolute instants with useful application precision.
- Portable behavior in native, browser, Wasm, protocol, index, and backup paths.
- No implicit local timezone or mutable timezone database in stored equality.
- Deterministic command/retry/replay behavior.
- Separate clock domains for wall time, deadlines, MVCC order, and TTL.
- No expiry resurrection on backward clock movement and no mass early deletion on suspicious forward jumps.
- Practical exact representation in signed integers and typed SDKs.

## Considered options

### Option A — Store host-native date/time objects or milliseconds

Advantages:

- Direct JavaScript `Date` and many platform APIs.
- Simple initial serialization.

Disadvantages:

- Millisecond precision is insufficient for the intended database/versioning diagnostics.
- Host ranges, rounding, timezones, and parsing differ.
- JavaScript numbers and system structs are not stable persistent formats.
- Ambient clocks break deterministic replay and Wasm capability isolation.

### Option B — Store original timestamp strings and named zones

Advantages:

- Retains user spelling and zone labels.
- Defers calendar/offset parsing.

Disadvantages:

- Equal instants have many strings and mutable zone-rule interpretations.
- Ordering/indexing requires parsing and timezone database state.
- Named-zone updates could change query results without data changes.
- Does not solve deadlines, MVCC, or safe TTL clocks.

### Option C — Store UTC microseconds/days and inject distinct clock capabilities

Advantages:

- Exact integer comparison and stable canonical formatting.
- Microseconds balance useful precision and broad range.
- Explicit offsets normalize before storage; date remains timezone-free.
- Clock capabilities make deterministic tests/replay possible.
- A dedicated non-regressing expiry oracle can fail safe under clock faults.

Disadvantages:

- SDKs need typed wrappers/`bigint` rather than only JavaScript `Date`.
- Named-zone conversion requires a versioned SDK/adapter timezone database.
- The core rejects convenient but ambiguous local-time strings.
- Durable expiry-oracle state and `ClockUnsafe` operations add implementation work.

## Decision

Accept Option C with the normative details in [Timestamp, Date, Expiry, and Clock Semantics](../architecture/temporal-semantics.md):

- Timestamp is signed microseconds since `1970-01-01T00:00:00Z`, bounded to UTC years 0001–9999.
- Date is a proleptic-Gregorian signed day count, bounded to years 0001–9999.
- Input requires `Z` or a known numeric offset and normalizes to UTC; named/local time is not a core timestamp.
- Leap-second text is rejected; canonical output is UTC with six fractional digits.
- Date/timestamp conversion is explicit and UTC-specific in the core.
- Wall, monotonic, MVCC, and expiry clocks are separate injected capabilities.
- `now` is captured once per statement/transaction and resolved before replay.
- Absolute `expires_at <= pinned_expiry_cutoff` is logically expired; cleanup is secondary.
- Durable expiry time cannot regress; suspicious forward skew enters `ClockUnsafe` and pauses advancement/deletion.

## Consequences

### Positive

- Timestamp/date equality and ordering are stable and cheap.
- No deployment's local timezone changes stored meaning.
- Browser/native/server/replay paths can receive identical exact payloads.
- Deadline clock steps cannot corrupt timeout behavior.
- TTL fails toward retaining data during unsafe time rather than deleting early.

### Negative

- Public SDKs require exact temporal wrappers and explicit conversion APIs.
- Timezone-aware appointment data needs additional application fields.
- The expiry oracle needs durable non-regression and operational recovery.
- Compatibility adapters must translate upstream time ranges/precision explicitly.

### Neutral or deferred

- MVCC/transaction timestamp representation remains `P06-*` and is not a stored user timestamp.
- Physical endian/tag choices remain `P03-*`.
- Calendar arithmetic beyond UTC date conversion is not enabled in v1.

## Compatibility and migration

No temporal persistent fixture or public protocol exists yet, so no data migration is required now. The first HDoc/protocol/index/backup fixtures encode the microsecond/day payloads and range rules.

A future precision, epoch, range, leap-second, or expiry-boundary change requires a versioned semantic/format migration, regenerated index/sidecar keys, adapter-matrix update, backup/restore compatibility proof, and superseding ADR. Downgrade is safe only when the old binary understands every temporal format/semantic version present.

MongoDB/BSON dates use a different declared precision/range. A compatibility adapter must range-check and explicitly translate milliseconds; it cannot claim exact support outside its executable matrix.

## Security and operations

- Ordinary clients cannot provide engine clock capability values.
- Administrative time injection is privileged, audited, and disabled in normal production mode.
- `ClockUnsafe` surfaces in health, metrics, logs, traces, diagnostic bundles, and runbooks.
- Logs redact document values but retain clock source, quality, skew, cutoff, request ID, and stable reason code as policy permits.
- Timezone-database downloads/updates live outside the core and follow dependency/supply-chain policy.
- Clock arithmetic is checked to prevent crafted offset/range overflow.

## Validation plan

- [x] Define precision, epoch, range, parsing, normalization, date conversion, clock roles, expiry boundary, and unsafe-clock behavior.
- [x] Commit executable temporal range and parser fixtures under `P01-019`.
- [x] Make the reference interpreter pass the committed temporal fixtures under `P01-020`.
- [ ] Prove host clock capability injection and denial under `P04-009`/`G04`.
- [ ] Prove MVCC and timestamp separation under `P06-*`/`G06`.
- [ ] Run backward/forward/restart/suspend TTL histories under `P20-*`/`G20`.
- [ ] Prove HDoc/SDK/protocol/backup/restore round trips in their gates.
- [x] Complete independent temporal review at [`G01`](../../evidence/phase-01/G01/review.md).

## Implementation impact

- Semantic tasks: `P01-005`, `P01-012`–`P01-020`.
- Core/host work: `P03-*`, `P04-009`, `P06-*`, `P07-*`.
- TTL/recovery work: `P08-006`, `P15-*`, `P20-*`, `P24-007`–`P24-008`.
- Requirements: `QUERY-001`, `CORE-002`, `CACHE-002`.
- Gates: `G01`, `G04`, `G06`, `G20`, and release proof.

## Follow-up work

- [x] Implement the executable timestamp range/parser fixtures and oracle before temporal operators ship.
- [ ] Add executable expiry/TTL state histories with the durable expiry oracle under `P20-*` before TTL support ships.
- [ ] Specify durable expiry-oracle persistence/recovery mechanism in its storage phase.
- [ ] Publish adapter precision/range differences before compatibility claims.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [Temporal semantic contract](../architecture/temporal-semantics.md)
- [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339)

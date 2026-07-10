# ADR 0006: Default native generated identifiers to UUIDv7

- Status: Accepted
- Date: 2026-07-10
- Decision owner: Query semantics owner
- Required before: `P01-009` and `G01`
- Supersedes: None
- Superseded by: None

## Context

Every document requires an immutable unique `_id`. The project supports explicit UUID and ObjectId values, embedded/server clients, retries/replay, future distribution, and a MongoDB adapter. Choosing a default affects locality, information leakage, SDK behavior, primary-index keys, compatibility, and collision handling.

ObjectId is familiar and compact but has a seconds timestamp, process seed, and counter specific to MongoDB compatibility. Random UUIDv4 avoids clock order but causes scattered inserts. RFC 9562 UUIDv7 provides a standardized, time-ordered 128-bit format with a millisecond prefix and 74 non-version/variant payload bits.

The default must still use injected clock/CSPRNG capabilities, resolve before WAL/replay, and treat primary uniqueness as authoritative. This decision implements `P01-009` and contributes to `DATA-001` and `QUERY-001`.

## Decision drivers

- Standard, portable typed ID with broad SDK support.
- Good primary-index insertion locality without process/MAC identity.
- Strong cross-generator collision resistance and same-instance monotonicity.
- Deterministic retry/replay and atomic primary uniqueness.
- Explicit MongoDB compatibility without making its layout the native core default.
- Clear clock/random failure and privacy behavior.
- Stable byte/text order and fixed-size parsing.

## Considered options

### Option A — ObjectId as the universal default

Advantages:

- Compact 12-byte value and familiar MongoDB behavior.
- Rough timestamp order and straightforward adapter mapping.

Disadvantages:

- Seconds precision and 24-bit per-process counter.
- Layout/generation is ecosystem-specific rather than the modern UUID standard.
- Client/process seed/counter lifecycle adds compatibility assumptions.
- Native API identity would be unnecessarily tied to MongoDB behavior.

### Option B — UUIDv4 as the universal default

Advantages:

- Simple standard random generation.
- No generation timestamp leakage beyond operation context.
- Excellent collision resistance with CSPRNG.

Disadvantages:

- Random leading bytes scatter primary-index inserts and range locality.
- No monotonic same-generator order.
- Still requires a separate ObjectId adapter profile.

### Option C — UUIDv7 native default with explicit ObjectId profile

Advantages:

- RFC-standard 128-bit value with millisecond-ordered prefix.
- Strong random payload and monotonic same-generator method.
- Better primary-index locality than UUIDv4.
- Keeps ObjectId exact and available for explicit/MongoDB compatibility use.
- Uses the same UUID logical type/SDK ecosystem as explicit UUIDs.

Disadvantages:

- Leaks approximate generation time.
- Time prefixes can create range/shard hotspots.
- Requires clock-regression handling and per-generator state.
- Native missing-ID behavior differs from MongoDB.

## Decision

Accept Option C with the normative details in [`_id`, UUID, ObjectId, Generation, and Collision Semantics](../architecture/identifier-semantics.md):

- Accepted v1 IDs are int32/int64, string, generic binary, UUID, and ObjectId.
- Primary equality unifies equal int32/int64 values and otherwise preserves type/payload classes.
- Native missing `_id` generates RFC 9562 UUIDv7 using injected trusted time plus CSPRNG-backed 74-bit monotonic payload state.
- ObjectId generation is an explicit native profile and the default for the claimed MongoDB adapter path.
- Generation resolves once before WAL/retry/replication; replay never generates.
- Root `_id` is immutable, with exact typed identity required in replacements.
- User collisions error; generated collisions receive at most eight attempts before atomic failure.
- Primary unique index enforcement is authoritative.

## Consequences

### Positive

- Native IDs are standard, typed, fixed-size, and index-local.
- Exact ObjectId compatibility remains possible without infecting native semantics.
- Retry/replay/backup preserve one resolved ID.
- Clock/random/collision failures have explicit safe behavior.

### Negative

- SDK/adapters must expose two generation profiles clearly.
- UUIDv7 time prefixes reveal approximate insertion time and may hotspot range partitions.
- Generator state/clock rollback/CSPRNG health need observability and tests.
- Some MongoDB clients see different native defaults outside the adapter.

### Neutral or deferred

- Physical primary-key encoding remains `P08-*`.
- Future sharding may hash/salt/route IDs independently of logical order.
- IDs are not authentication secrets or causal timestamps.

## Compatibility and migration

No persistent ID fixture or public protocol exists yet, so no current data migration is required. The first semantic/HDoc/primary-index/SDK fixtures encode accepted types, equality/order, UUID network bytes, and ObjectId bytes.

Changing the native generation profile, UUID algorithm, accepted `_id` types, equality, order, collision attempts, or immutability later requires a semantic/config version, regenerated fixtures, primary-index rebuild/migration assessment, retry/replication/backup proof, adapter-matrix update, and a superseding ADR. Existing IDs are never rewritten merely because the default generator changes.

## Security and operations

- CSPRNG is a required host capability with no weak fallback.
- Generator clock regression, random failure, collision attempts, counter/sequence exhaustion, and profile are metric/log/health events.
- IDs expose approximate time and are never authorization tokens.
- Repeated collisions or entropy-health failure disable generation/fail requests rather than risk duplicates.
- Full identifiers are redacted/digested in telemetry according to policy.

## Validation plan

- [x] Define accepted types, equality/order, UUID/ObjectId bytes/text/generation, immutability, collision/retry, and security behavior.
- [ ] Commit executable ID/generator/collision fixtures under `P01-019`.
- [ ] Make the reference interpreter/generator pass them under `P01-020`.
- [ ] Prove clock/CSPRNG capability injection/failure under `P04-009`/`G04`.
- [ ] Prove HDoc/WAL/primary-index/recovery/backup exactness and uniqueness.
- [ ] Differential-test the MongoDB ObjectId/ID subset.
- [ ] Complete independent identifier review at `G01`.

## Implementation impact

- Semantic tasks: `P01-009`, `P01-011`–`P01-021`.
- Core/storage/index: `P03-*`, `P04-009`, `P05-*`, `P08-002`.
- SDK/adapter/distributed: `P12-*`, `P17-*`–`P19-*`, `P22-*`.
- Requirements: `DATA-001`, `QUERY-001`.
- Gate: `G01` and later host/storage/index/compatibility gates.

## Follow-up work

- [ ] Implement the exact UUIDv7/ObjectId generator fixture corpus and reference generator.
- [ ] Freeze primary index bytes only after equality/order fixtures pass.
- [ ] Publish native/MongoDB ID differences and generation profiles in SDK docs/matrices.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [Identifier semantic contract](../architecture/identifier-semantics.md)
- [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562)
- [MongoDB BSON ObjectId structure](https://www.mongodb.com/docs/manual/reference/bson-types/)

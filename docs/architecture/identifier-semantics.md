# `_id`, UUID, ObjectId, Generation, and Collision Semantics

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-009`
- Governing requirements: `DATA-001`, `QUERY-001`
- Governing gate: `G01`
- Decision: [ADR 0006](../adr/0006-default-to-uuidv7-identifiers.md)
- Normative parents: [logical value model](value-model.md), [numeric semantics](numeric-semantics.md), and [temporal semantics](temporal-semantics.md)

This document defines accepted root `_id` types, UUID/ObjectId bytes and text, native/compatibility generation, immutability, equality, total ordering, primary-key encoding obligations, collision handling, retries, and identifier security boundaries.

## Root `_id` invariant

Every normal stored document has exactly one root field named `_id` after insertion/upsert normalization.

- `_id` is required in canonical HDoc, WAL, primary index, replication, backup, restore, and change events.
- If an insert/upsert does not supply an ID under the rules below, the command coordinator generates one before publishing any mutation.
- `_id: null`, missing after normalization, duplicate `_id` fields, and unsupported logical types are validation errors.
- Nested fields also named `_id` are ordinary application fields unless a schema reserves them; only the root field is the primary key.
- The root `_id` is immutable for the lifetime of the document.
- One collection cannot contain two IDs equal under primary-ID equality, even when their stored numeric widths differ.

For presentation order, an explicit input `_id` retains its input position. A generated ID or an existing ID inherited into a replacement that omitted it is prepended before the provided root fields. This addition preserves the relative presentation order of every user-provided field and does not affect order-independent object equality/hashing.

## Accepted v1 `_id` types

V1 accepts only these logical types:

| Type | Accepted domain |
| --- | --- |
| `int32` | Entire signed 32-bit domain |
| `int64` | Entire signed 64-bit domain |
| `string` | Any valid string within the `_id` byte limit, including empty |
| `binary` | Generic subtype `0` only, within the `_id` byte limit, including empty |
| `uuid` | Any 128-bit UUID logical payload |
| `objectId` | Any 12-byte ObjectId logical payload |

Boolean, null, float64, decimal128, timestamp, date, non-generic binary subtypes, object, array, and vector are not v1 root IDs. This excludes NaN/signed-zero equivalence, mutable containers, and temporal/user-value ambiguity from the primary-key surface while retaining common portable scalar choices.

The exact string/binary byte cap is set by `P01-011`. A value accepted under one type is never inferred as another from shape: a 16-byte binary is not UUID, a 12-byte binary is not ObjectId, and a UUID-looking string remains string unless explicitly parsed/converted.

## Primary-ID equality

IDs of the same nonnumeric type are equal only when their logical payloads are equal:

- string: exact canonical UTF-8 bytes;
- binary: subtype plus exact bytes (the accepted subtype is `0`);
- UUID: exact 16 canonical bytes;
- ObjectId: exact 12 bytes.

`int32` and `int64` share exact mathematical numeric equality. Therefore `int32(1)` and `int64(1)` identify the same primary-key slot and conflict under uniqueness. A lookup using either width finds the stored document while a covering/read result preserves the stored width.

Different logical type classes never compare equal, even when text/bytes resemble one another.

## Total `_id` order

Primary key scans and [`default_order_v1`](default-ordering-semantics.md) use this ascending type-class order:

```text
numeric int32/int64
< string
< generic binary
< uuid
< objectId
```

Within classes:

- Numeric IDs use exact mixed integer order; equal-width variants share a key and cannot coexist.
- Strings use `binary_utf8_v1` unsigned-byte order.
- Binary compares subtype then length then unsigned bytes. V1 IDs all use subtype `0`, but the encoding retains the subtype domain.
- UUID compares its 16 network-order bytes lexicographically as unsigned bytes.
- ObjectId compares its 12 bytes lexicographically as unsigned bytes.

Descending scans reverse the complete encoded key. Primary index encodings retain a stable class/type tag and stored payload for covering reads while preserving numeric equality/range behavior.

This order is a database key order, not a guarantee that arbitrary user-supplied UUID/ObjectId values reflect creation chronology.

## UUID logical representation and text

UUID is exactly 16 bytes in network byte order. [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562) defines the relevant field/variant/version layouts and big-endian binary convention.

Stored UUID values may contain any 128-bit payload, including nil/max values and non-v7 versions/variants imported explicitly. Storage does not rewrite version/variant bits. Generation support is narrower than storage support.

Canonical text is lower-case hexadecimal with required `8-4-4-4-12` hyphens:

```text
018f4f9a-7b2c-7abc-8def-0123456789ab
```

Native text parsing accepts upper/lower ASCII hex with exactly those hyphens and full consumption. Braces, `urn:uuid:` prefixes, missing hyphens, whitespace, non-ASCII lookalikes, and malformed hex are rejected unless an explicit compatibility parser is selected. Output is always canonical lower-case.

UUID version/timestamp extraction is metadata inspection only. User-supplied bits are not trusted as actual creation time, identity provenance, authorization, or randomness quality.

## Native automatic ID: UUIDv7

The default native generated `_id` is an RFC 9562 UUID version 7 with the IETF variant.

V1 generation uses:

```text
48-bit Unix epoch millisecond timestamp
4-bit version = 7
74-bit monotonic random payload across rand_a/rand_b positions
2-bit IETF variant = 10
```

The timestamp is the floor of the injected trusted UTC microsecond clock divided by 1,000. It excludes leap seconds and must fit the 48-bit UUIDv7 domain.

### Monotonic generator state

Each generator instance holds `(last_ms, payload74)`:

1. When `now_ms > last_ms`, set `last_ms = now_ms` and seed `payload74` uniformly from the host cryptographic-random capability.
2. When `now_ms == last_ms`, increment `payload74` as one unsigned 74-bit number while skipping/filling the fixed version/variant positions during encoding.
3. When `now_ms < last_ms`, clamp to `last_ms`, increment `payload74`, and report a clock-regression metric/diagnostic.
4. If the 74-bit space is exhausted for one millisecond, wait for a later safe millisecond under the request deadline or return `IdentifierSequenceExhausted`.
5. Failure/unavailability of cryptographic randomness is a typed generation error; there is no weak fallback.

The initial random payload provides cross-process/host entropy; monotonic increment provides strict byte order within one generator/millisecond and avoids same-instance collision. On restart, a fresh cryptographic seed is used. Generator state is never derived from process IDs, MAC addresses, tenant values, or noncryptographic PRNGs.

UUIDv7 order is useful for locality but is only approximate chronology across generators/hosts. It is not a transaction timestamp, total event order, or causality proof.

## Explicit ObjectId generation profile

ObjectId is an exact 12-byte opaque value. Native callers may request the explicit `objectId` generation profile, and the MongoDB compatibility adapter may select it before submitting a canonical insert.

The generated layout follows the [documented MongoDB ObjectId structure](https://www.mongodb.com/docs/manual/reference/bson-types/):

```text
4 bytes  unsigned Unix seconds, big-endian
5 bytes  cryptographic process/generator random seed
3 bytes  counter, big-endian, initialized randomly
```

Rules:

- Generation accepts seconds from `0` through `2^32 - 1`; outside that range is a typed error.
- A generator creates the five-byte seed and initial counter from cryptographic randomness.
- The counter increments modulo `2^24` for each ID.
- If the counter would wrap while using the same second, the generator atomically rotates the five-byte seed and reseeds the counter; random failure is an error.
- Backward clock movement clamps to the last generator second and emits a diagnostic.
- Restart creates a fresh seed/counter.
- Ordering is unsigned lexicographic bytes and is only roughly chronological across generators.

Canonical ObjectId text is exactly 24 lower-case hexadecimal digits. Native parsing accepts upper/lower ASCII hex of exactly 24 digits with full consumption; output is lower-case. Arbitrary explicit 12-byte values are valid, so timestamp extraction never proves actual creation time.

## Generation point and determinism

ID generation occurs once at the canonical command coordinator before validation/publication that depends on `_id`:

- Generated `_id` is inserted into the normalized document/command.
- WAL, replicated command, retry record, change event, and backup carry the resolved ID, never “generate on apply.”
- Idempotent command replay/retry reuses the original generated ID and result.
- A batch assigns IDs in stable input-document order before parallel storage execution.
- SDK/client-generated UUID/ObjectId values are treated as explicit IDs and checked normally.
- The reference interpreter uses injected deterministic clock/random sequences so fixtures reproduce exact bytes.

No follower, restore process, offline sync target, or adapter regenerates an already resolved ID.

## Insert, replacement, update, and upsert

### Insert

- Accepted explicit `_id` is preserved exactly.
- Missing `_id` receives the selected generation profile, defaulting to UUIDv7.
- A duplicate primary key follows collision handling below.

### Replacement

- If replacement includes `_id`, it must have exact typed payload identity with the existing stored `_id`, not merely primary-ID numeric equality.
- If replacement omits `_id`, the engine prepends the existing `_id` to the normalized replacement while preserving the relative order of provided fields.
- A type-width change such as `int32(1)` to `int64(1)` is rejected as immutable even though the primary key compares equal.

### Update

- `$set`, `$unset`, rename, arithmetic, array, positional, computed, or pipeline updates targeting root `_id` or any attempted descendant are rejected before mutation.
- Updating other fields cannot reorder, retag, or regenerate `_id`.

### Upsert

Precedence for a new upserted document is:

1. Explicit accepted `_id` in the replacement/update seed.
2. One unambiguous root `_id` equality literal in the normalized filter, if its type is accepted.
3. Generated ID using the selected/default profile.

Conflicting/ambiguous ID sources are validation errors. Upsert synthesis and other filter-field extraction are finalized by `P01-013`/`P01-014` without weakening this precedence.

## Collision and duplicate handling

The primary unique index is the authoritative collision check and is atomic with document visibility.

### User-supplied IDs

An existing equal ID returns a typed duplicate-primary-key conflict. It never replaces, merges, updates, or silently selects the existing document unless the command is an explicitly recognized idempotent retry of the same committed operation.

### Automatically generated IDs

Before any mutation is published, a generated collision triggers a fresh generation attempt. V1 permits at most eight generation/unique-check attempts per document.

- Success records the final resolved ID in the canonical command/retry result.
- Eight collisions return `IdentifierCollisionExhausted` and publish no document/index/WAL mutation for that document.
- Ordered/unordered batch continuation is governed by the batch contract; each document remains atomic.
- Collision counters and generator-profile/attempt metadata are observable without logging full identifiers.
- Repeated collision rates above policy threshold are a security/entropy health incident and may disable the generator.

An idempotent retry never generates another ID merely because its original ID now exists; it resolves through the retry/idempotency record first.

## Primary index and partitioning obligations

- The primary index encodes the equality/order rules above with a versioned key format.
- Numeric width aliases map to one comparison key but retain stored type/payload in row/covering metadata.
- UUID/ObjectId keys are exact unsigned bytes; text is never the physical comparison intermediate.
- The primary index rejects conflicts during concurrent writes and recovery/replay.
- Compaction, rebuild, restore, migration, replication, sync, and range movement cannot introduce a second equal ID or change an ID.
- Shard/range key policies may use `_id` but must account for UUIDv7/ObjectId time-prefix hotspots; chronology does not override load-balancing safety.
- Hashed partitioning, if selected, uses a versioned primary-ID comparison hash, not a host hash.

## Security and privacy

- UUIDv7 and ObjectId reveal approximate generation time. APIs/documentation must not claim they are opaque against traffic analysis.
- IDs are identifiers, not bearer secrets, authorization tokens, tenant boundaries, or proof of creation time.
- CSPRNG capabilities are host-injected, health-checked, and never fall back to `Math.random`, timestamps alone, MAC/process IDs, or counters alone.
- Error/log/trace output redacts full IDs by policy while retaining type, short digest, request ID, and reason.
- User-controlled long string/binary IDs obey size/index/amplification quotas.
- Parsing is constant-bounded by fixed UUID/ObjectId lengths and rejects Unicode lookalike hex.

## Compatibility boundary

MongoDB clients commonly generate ObjectId for missing `_id`; native HelixDB defaults to UUIDv7. The MongoDB adapter may generate/submit ObjectId under its explicit profile and differential tests. Native APIs/documentation must not call UUIDv7 ObjectId-compatible.

MongoDB permits a broader BSON `_id` domain than this v1 contract. The adapter rejects unsupported types explicitly or maps them only through an approved lossless migration policy. Numeric cross-width equality/order differences are recorded in the compatibility matrix.

## Required fixtures

The semantic corpus includes:

- Every accepted/unsupported `_id` type, extrema, empty string/binary, and shape-inference rejection.
- Numeric width equality/conflict/lookup and exact-identity immutability.
- Cross-type total order and byte-boundary scans.
- UUID nil/max, versions/variants, text case/format errors, network bytes, and canonical output.
- RFC UUIDv7 timestamp/version/variant bits, same-millisecond monotonic sequence, new-millisecond random seed, rollback clamp, exhaustion, CSPRNG failure, restart, and cross-generator collision cases.
- ObjectId explicit bytes/text, second/seed/counter layout, rollover rotation, clock rollback, range, and extraction caveats.
- Insert/replacement/update/upsert precedence and immutable-path failures.
- Eight-attempt generated collision success/failure, user collision, concurrent unique conflict, and idempotent retry.
- WAL/replay/replication/backup/restore/sync/index rebuild retaining exact IDs.
- MongoDB adapter ObjectId generation and unsupported-type differential cases.
- Cross-host exact bytes, type, order, error, retry result, and canonical hash agreement.

## Follow-up ownership

| Plan item | Remaining identifier responsibility |
| --- | --- |
| `P01-011` | String/binary `_id` byte and command/document limits |
| `P01-012`–`P01-016` | Operators, CRUD/upsert/cursor/error integration |
| `P01-019`–`P01-021` | Executable fixtures, oracle, differential cases |
| `P03-*`, `P05-*`, `P08-002` | HDoc/WAL/primary key bytes, atomic uniqueness, recovery |
| `P04-009` | Clock/CSPRNG capability injection and failure |
| `P12-*`, `P22-*` | SDK/protocol and MongoDB adapter generation/types |
| `P17-*`–`P19-*` | Replicated/sharded uniqueness and routing |

No implementation may mutate/regenerate `_id`, use weak randomness, infer identifier type from shape, trust embedded creation time, broaden accepted types, or change equality/order without a superseding identifier ADR and primary-index/format/compatibility migration.

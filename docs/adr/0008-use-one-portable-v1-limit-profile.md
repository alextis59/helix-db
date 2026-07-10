# ADR 0008: Use one portable v1 limit profile

- Status: Accepted
- Date: 2026-07-10
- Decision owner: Query semantics owner
- Required before: `P01-011` and `G01`
- Supersedes: None
- Superseded by: None

## Context

HelixDB spans native, Wasm, browser, server, GPU-assisted, import, backup, adapter, and future distributed paths. Host-dependent or unspecified limits would let one deployment persist values another cannot decode/reopen and would expose parsers/planners/kernels to amplification/stack/memory attacks.

Document bytes alone do not bound depth, tiny-field count, traversal fan-out, command decompression, AST expansion, vector work, or regex compilation. Limits must be semantic/versioned and checked before allocation/publication. This decision implements `P01-011` and contributes to `DATA-001`, `QUERY-001`, `QUERY-002`, and `SEC-002`.

## Decision drivers

- Portable reopen/restore across supported hosts.
- Deterministic accept/reject behavior and errors.
- Bounded memory, recursion, CPU, GPU, and decompression work.
- Atomic failure without truncation/repair.
- Practical MongoDB interchange for document size/depth.
- Capability negotiation for smaller hosts without widening persistent semantics.
- Clear future profile/migration boundary.

## Considered options

### Option A — Let each host/backend choose limits

Advantages:

- Maximum use of powerful servers/devices.
- Minimal central policy.

Disadvantages:

- Browser/native/server databases cease to be portable.
- Query/backend selection could change errors/results.
- Backups/restores/upgrades fail unpredictably.
- Attack surface follows weakest host/library default.

### Option B — Limit only encoded document and command bytes

Advantages:

- Simple two-limit implementation.
- Bounds storage/network volume.

Disadvantages:

- Does not bound deep recursion, huge field/array counts, traversal fan-out, AST expansion, regex/vector work, or decompression amplification.
- Small encoded inputs can still exhaust stack/CPU/metadata.

### Option C — One versioned multi-dimensional portable profile

Advantages:

- Same semantic value domain on every host.
- Independent amplification dimensions are bounded/testable.
- Hosts/tenants can advertise lower operational quotas without corrupting persistent data.
- Format/protocol/backup manifests can name one profile.

Disadvantages:

- Some server workloads must chunk/model large values externally.
- Every parser/mutation/restore path needs coordinated checks.
- Future increases require profile/version/migration work.

## Decision

Accept Option C and the exact [`limits-v1`](../architecture/limits-v1.md) table.

Core choices include:

- 16 MiB uncompressed canonical HDoc per document and 100 container levels.
- Per-object/whole-document field, field-name, path, array, and vector caps.
- 64 MiB raw and expanded command caps.
- Independent batch, pipeline, AST, literal-list, sort, projection, regex, vector-k, and path-candidate caps.
- Validated field-name/path grammar with no dot/leading-dollar normal fields.
- Checked streaming/encoding enforcement before publication.
- Smaller negotiated operational quotas permitted; `limits-v1` persistent maxima never raised implicitly.

## Consequences

### Positive

- Valid databases remain reopenable across supported deployment classes.
- Oversized/amplifying inputs fail deterministically and atomically.
- Browser/GPU limitations cause quota/fallback instead of semantic drift.
- Boundary fixtures and stable limit IDs can cover every entry.

### Negative

- Very large documents/arrays/vectors require application chunk/blob modeling.
- Some field names accepted by other databases need import mapping.
- A future higher-capacity profile needs explicit migration/version work.
- Multiple independent counters add parser/command complexity.

### Neutral or deferred

- Memory, transaction, cursor, index-key, group/sort spill, tenant, and concurrency quotas receive additional later limits.
- A host may set lower advertised operational quotas but not reinterpret stored values.

## Compatibility and migration

No persistent HDoc fixture/protocol exists yet, so no current data migration is required. The 16 MiB/100-depth choices align with documented MongoDB ceilings but do not imply other limit/field-name compatibility.

The first HDoc/protocol/backup manifests record `limits-v1`. Raising a persistent maximum or changing grammar/count measurement requires a new profile, format/offset and host capability review, boundary fixtures, migration/restore proof, adapter-matrix update, security/performance tests, and a superseding ADR. Existing data is never truncated to downgrade.

## Security and operations

- Check limits before large allocation/recursion/decompression/GPU dispatch.
- Use checked arithmetic and bounded streaming.
- Return stable redacted limit diagnostics and metrics.
- Treat repeated limit/decompression/AST attacks as rate-limit/security signals.
- Lower tenant quotas remain authorization/configuration data and cannot leak other tenants' sizes.

## Validation plan

- [x] Define every requested limit, exact measurement/counting, grammar, atomicity, lower-quota, and migration behavior.
- [x] Commit below/at/above executable fixtures under `P01-019`.
- [x] Make the reference interpreter/parser pass them under `P01-020`.
- [ ] Prove HDoc exact-size, parser/decompression, update, import, backup, and restore boundaries.
- [ ] Prove native/Wasm/browser/server/adapter error equivalence.
- [ ] Run resource/security tests for all amplification dimensions.
- [x] Complete independent Phase 1 limit/security review at [`G01`](../../evidence/phase-01/G01/review.md).
- [ ] Repeat limit/security review at every later gate that consumes externally supplied data.

## Implementation impact

- Semantic tasks: `P01-011`–`P01-020`.
- Format/core/storage/query: `P03-*`–`P10-*`.
- Hosts/protocol/security/operations: `P11-*`–`P16-*`, `P20-*`, `P23-*`.
- Requirements: `DATA-001`, `QUERY-001`, `QUERY-002`, `SEC-002`.
- Gates: `G01` and every later artifact/runtime gate that consumes external data.

## Follow-up work

- [ ] Implement a shared limit-ID/counter library used by all parsers/core paths.
- [x] Add exact semantic boundary generators before HDoc/protocol formats freeze.
- [ ] Record every later operational quota separately without weakening `limits-v1`.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [Portable V1 limits](../architecture/limits-v1.md)
- [MongoDB Limits and Thresholds](https://www.mongodb.com/docs/manual/reference/limits/)

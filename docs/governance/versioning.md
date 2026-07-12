# Persistent Format and Public Protocol Versioning Policy

- Status: Approved
- Effective date: 2026-07-10
- Governing invariant: `INV-007`
- Change process: [Specification and Change Control](change-control.md)

Every persistent format and public protocol is versioned from its first committed fixture. “Prototype,” “internal,” or “not released yet” does not justify writing unversioned bytes that tests, backups, or later code may treat as durable.

## Covered contracts

The policy applies to:

- HDoc documents and field-path dictionaries.
- WAL records and transaction groups.
- MANIFEST and OPTIONS files.
- SST, VLOG, CSEG, and IDX artifacts.
- Range/consensus logs, commands, metadata, and snapshots.
- Backup/export manifests and change-stream/resume-token records.
- Native client/server protocol envelopes and typed errors.
- SDK wire contracts and embedded host ABI/component interfaces.
- MongoDB-like and Redis-like adapter compatibility profiles.
- WGSL kernel bundles, metadata, capability requirements, and result layouts.
- Plugin/UDF/trigger/conflict-resolver component contracts.
- Evidence, benchmark, semantic-fixture, and migration manifest schemas.

## Version identity

### Persistent formats

Each persistent artifact carries:

- A magic or independently validated artifact kind where binary ambiguity is possible.
- A format version.
- Required and optional feature identifiers or flags.
- Length/boundary information sufficient to reject truncation and unsafe skipping.
- Integrity metadata defined by the format.

The exact field widths and encoding are decided by each format ADR. Version zero is not an implicit “unversioned” production format; if used in experiments, it is encoded and documented explicitly.

### Public protocols and component ABIs

Protocols expose a negotiated major/minor contract or an equivalent explicit version/profile:

- Major changes may be incompatible and require explicit negotiation or rejection.
- Minor changes are backward-compatible only when an older peer can safely ignore or reject optional additions under the published rules.
- Required unknown fields/features cause a typed incompatible-version error.
- Peers never infer compatibility only from package or binary version.

The first concrete component authority is
[`helix:core-abi@1.0.0`](../../wit/helix-core-abi-v1/world.wit). Its P04-001 matrix accepted only ABI
1.0; package SemVer did not authorize another major/minor, and negotiation fails before resource
use when version or required capabilities are unsupported.

P04-003 preserves that source and adds
[`helix:core-abi@2.0.0`](../../wit/helix-core-abi-v2/world.wit) for the required capability
interface identities. The current matrix accepts only ABI 2.0; the package version alone does
not make a 1.0 peer compatible.

P04-004 similarly preserves ABI 2.0 and adds
[`helix:core-abi@3.0.0`](../../wit/helix-core-abi-v3/world.wit). Six required async imports are an
incompatible world-shape change, so the current matrix accepts only ABI 3.0.

P04-005 preserves ABI 3.0 and adds
[`helix:core-abi@4.0.0`](../../wit/helix-core-abi-v4/world.wit). Required resource methods and the
`host-resources` import are incompatible, so the current matrix accepts only ABI 4.0.

P04-006 preserves ABI 4.0 and adds
[`helix:core-abi@5.0.0`](../../wit/helix-core-abi-v5/world.wit). Three required explicit-copy access
imports are incompatible, so the current matrix accepts only ABI 5.0.

### Packages and releases

Published crates, npm packages, SDKs, binaries, containers, operators, and managed APIs follow semantic versioning once their public contract is declared stable. Pre-1.0 artifacts still carry independent format/protocol versions and do not receive permission to reinterpret them silently.

### Semantic and compatibility profiles

Query semantics, collation, error contracts, and adapters identify the profile/version against which fixtures and matrices were run. A change in behavior updates that identity even if the request syntax remains valid.

## Required reader behavior

A reader must:

1. Validate artifact kind before interpreting payload fields.
2. Read and validate the version and required features.
3. Accept only versions/features covered by its documented compatibility policy.
4. Reject unknown required behavior with a typed diagnostic before mutation or partial apply.
5. Verify lengths, checksums/hashes, and structural invariants.
6. Avoid guessing a version from size, filename, package version, or surrounding directory.
7. Preserve the source artifact when a migration fails.

An older reader may ignore an unknown optional feature only when the enclosing format defines how to skip it safely and doing so cannot change semantics.

## Required writer behavior

A writer must:

- Emit one explicitly selected current version and required feature set.
- Never emit a new required feature under an old version/flag combination.
- Record the writer build/protocol metadata where the format specifies it.
- Use atomic publication and migration rules defined by the owning format.
- Avoid in-place destructive conversion unless an accepted ADR and tested migration require it.
- Refuse to modify a store containing unsupported required features.

## Compatibility windows

No global “current and previous” promise is assumed. Before a release, each artifact defines:

- Versions it can read.
- Versions it can write.
- Whether reading causes migration.
- Online, offline, or rolling upgrade behavior.
- Mixed-version restrictions.
- Downgrade behavior.
- The rollback boundary after new bytes or commands are committed.

The requirement ledger and release notes link to this matrix.

## Golden fixtures

The first implementation of each format/protocol commits golden fixtures before its gate closes.

Fixture identity includes:

```text
artifact kind
format/protocol/profile version
required/optional features
generator commit/version
semantic input
encoded bytes or message
expected decoded form/result/error
SHA-256
```

Golden fixtures are immutable. A legitimate behavior change adds a new versioned fixture; it does not rewrite the historical expectation.

Malformed, truncated, unknown-version, unknown-required-feature, checksum, and limit fixtures are required alongside successful examples.

## Migration

A migration has a versioned plan and checkpoint record. It defines:

- Source and target versions/features.
- Preflight compatibility, key, space, backup, and integrity checks.
- Unit of progress and durable checkpoint.
- Idempotent resume behavior.
- Validation of converted semantics and hashes.
- Cleanup timing for old artifacts.
- Downgrade and rollback boundary.
- Behavior after interruption at every persistent transition.

Derived indexes and sidecars should be rebuilt from canonical data when safer than byte migration. Canonical rows, replicated commands, and authoritative metadata require stronger compatibility proof.

## Distributed upgrades

Before replicated deployment, command and snapshot versions also define:

- Which versions may vote, lead, follow, learn, or install snapshots.
- How feature activation is coordinated after every required node understands it.
- Whether old leaders are barred after activation.
- Membership and range-movement restrictions during upgrade.
- Backup/restore interaction.
- The point after which rolling rollback is unsafe.

## Kernel and device contracts

Kernel metadata identifies shader/source hash, metadata version, required WebGPU features/limits, input/output layouts, exactness class, workgroup assumptions, and CPU reference version. A pipeline cache key includes these identities; it is never reused solely because the query text matches.

## Experimental artifacts

Experiments may use an explicitly marked experimental version/profile. Such artifacts:

- Are never accepted silently by production readers.
- Carry no upgrade promise unless one is documented.
- Are excluded from user backups and release claims unless converted through a tested tool.
- Remain reproducible for the experiment evidence.

## Enforcement and release gate

Phase 2 introduces automated scans for known artifact definitions lacking a version field/profile. Later format/protocol suites enforce golden versions and rejection behavior.

A gate cannot close when its persistent/public contract lacks:

- Explicit version identity.
- Golden success and failure fixtures.
- Reader/writer compatibility rules.
- Unknown-version behavior.
- Migration/rollback consequences.
- Traceability and release documentation.

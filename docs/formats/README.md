# Persistent and Public Format Specifications

- Status: Active index
- Last updated: 2026-07-11
- Owner: Storage architecture owner
- Governing policy: [Persistent format and public protocol versioning](../governance/versioning.md)
- Governing gate: `G03` for HDoc; later format-specific gates for other artifacts

This directory contains normative byte/field specifications for persistent artifacts and public
protocols. A document's presence does not imply that its writer, reader, fixture, migration, or
support claim exists; each document states its own maturity boundary and owning plan/gate IDs.

## Current formats

| Format | Version | Status | Machine companion | Owner task |
| --- | --- | --- | --- | --- |
| [HDoc envelope](hdoc-v1.md) | 1.0 outer envelope | Writer, validating reader, views, lookup, and tagged conversion implemented; immutable fixtures pending | [Envelope registry](hdoc-v1-envelope.json) | `P03-002` |
| [HDoc logical type tags](hdoc-v1-type-tags.md) | 1.x one-byte tag registry | Accepted type identity | [Type-tag registry](hdoc-v1-type-tags.json) | `P03-003` |
| [HDoc noncontainer payloads](hdoc-v1-payloads.md) | 1.0 payload registry | Accepted scalar/byte/vector payloads | [Payload registry](hdoc-v1-payloads.json) | `P03-004` |
| [HDoc field/name/container records](hdoc-v1-records.md) | 1.0 base record registry | Accepted tables, references, value packing, and container tree | [Record registry](hdoc-v1-records.json) | `P03-005` |
| [HDoc CRC and typed-content hashing](hdoc-v1-integrity.md) | 1.0 integrity/profile registry | Accepted CRC-32C coverage and BLAKE3 profile 1 | [Integrity registry](hdoc-v1-integrity.json) | `P03-006` |
| [HDoc bounded section compression](hdoc-v1-compression.md) | 1.0 codec/profile registry | Accepted LZ4 profile `1/1`, 32 KiB blocks, coordinates, and selection | [Compression registry](hdoc-v1-compression.json) | `P03-007` |
| [HDoc lossless tagged JSON](hdoc-v1-tagged-json.md) | `helix.hdoc-tagged-json/1` | Implemented canonical debug/SDK-boundary rendering and strict detached import | None; reuses semantic fixture value shapes | `P03-012` |
| [Collection field-path dictionary](path-dictionary-v1.md) | `helix.path-dictionary/1.0` | Implemented canonical snapshots, non-reuse proof, atomic registration/resolution/recovery, and version pins | [Dictionary registry](path-dictionary-v1.json) | `P03-013`–`P03-014` |

HDoc's byte grammar, Rust writer/reader/value/lookup path, lossless tagged conversion, and the
standalone collection dictionary format/lifecycle are implemented. HDoc dictionary references,
immutable golden documents, independent readers, fuzzing, and migrations remain
subsequent `P03-*` work. No WAL, MANIFEST, SST, VLOG, CSEG, IDX, backup, or public
protocol format has been specified here yet.

## Format document rule

Every entry must define or explicitly defer, with a stable owner:

- magic, version, features, byte/field layout, lengths, offsets, alignment, and limits;
- canonicalization, checksum/hash coverage, malformed input, and diagnostic behavior;
- exact reader/writer compatibility, unknown-version/feature behavior, and support window;
- golden positive/negative fixtures and independent readers;
- migration, interruption, downgrade, and rollback boundary; and
- security, resource, and artifact-retention consequences.

Machine companions are normative only when their document says so and a verifier proves they agree.
Generated registries identify their generator; hand-authored registries require mutation tests and
review before a phase gate.

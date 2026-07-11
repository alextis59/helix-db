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
| [HDoc envelope](hdoc-v1.md) | 1.0 outer envelope | Accepted outer layout; incomplete byte format | [Envelope registry](hdoc-v1-envelope.json) | `P03-002` |
| [HDoc logical type tags](hdoc-v1-type-tags.md) | 1.x one-byte tag registry | Accepted type identity | [Type-tag registry](hdoc-v1-type-tags.json) | `P03-003` |
| [HDoc noncontainer payloads](hdoc-v1-payloads.md) | 1.0 payload registry | Accepted scalar/byte/vector payloads | [Payload registry](hdoc-v1-payloads.json) | `P03-004` |
| [HDoc field/name/container records](hdoc-v1-records.md) | 1.0 base record registry | Accepted tables, references, value packing, and container tree | [Record registry](hdoc-v1-records.json) | `P03-005` |

HDoc hash framing, compression, dictionary, complete golden documents,
codec implementations, fuzzing, and migrations remain the subsequent `P03-*` work listed in the
format documents. No WAL, MANIFEST, SST, VLOG, CSEG, IDX, backup, or public protocol format has
been specified here yet.

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

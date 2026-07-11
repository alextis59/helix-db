# HDoc 1.0 Reader, Writer, Feature, and Migration Matrix

- Status: Implemented closed-world negotiation and migration assessment
- Last updated: 2026-07-11
- Owner: Storage architecture owner
- Plan item: `P03-015`
- Governing gate: `G03`
- Governing policy: [Persistent format and public protocol versioning](../governance/versioning.md)
- Governing decision: [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)
- Machine-readable companion: [hdoc-v1-compatibility.json](hdoc-v1-compatibility.json)

## Claim boundary

This matrix publishes only capabilities implemented and tested by the current `helix-doc` reader
and writer. It does not promise “current and previous,” same-major minor compatibility, rolling
upgrade, mixed versions, downgrade, automatic migration, extension preservation, or HDoc path-
dictionary references. Package/crate versions do not broaden this matrix.

The only readable and writable byte-format version is exact HDoc `1.0`. Both the uncompressed base
profile and bounded section-compression codec/profile `1/1` are supported because they share the
same exact logical grammar and the validating decoder implements both. Every other version,
required feature, optional feature, structural flag, section kind/version, codec/profile, type tag,
hash profile, or extension remains rejected.

## Reader/writer matrix

| Concern | Reader | Writer | Current result |
| --- | --- | --- | --- |
| HDoc `1.0`, four uncompressed base sections | Yes | Yes | Fully validating read; canonical write |
| HDoc `1.0`, required feature bit 0 / compression `1/1` | Yes | Yes | Bounded decode; canonical beneficial-only selection or explicit disabled write |
| Any major other than 1 | No | No | `CAP_UNSUPPORTED_VERSION` |
| Any minor other than 0, including same-major 1.x | No | No | `CAP_UNSUPPORTED_VERSION`; no implied minor window |
| Required bit 1 / path-dictionary references | No | No | `CAP_FORMAT_UNSUPPORTED`; standalone dictionary existence does not enable HDoc references |
| Required bit 2 / semantic extensions | No | No | `CAP_FORMAT_UNSUPPORTED` |
| Optional bit 0 / nonsemantic extensions | No | No | `CAP_FORMAT_UNSUPPORTED`; no skip/preserve grammar is registered |
| Any unassigned required/optional bit or document flag | No | No | `CAP_FORMAT_UNSUPPORTED` |
| Unknown section, codec/profile, type tag, or hash profile | No | No | Typed capability rejection before value exposure |
| Read causes mutation/migration | Never | N/A | Source bytes remain unchanged |

The accepted masks are exact:

```text
document_flags       = 0x00000001
required_features    = 0x0000000000000001
optional_features    = 0x0000000000000000
```

Masks describe the union of understood capabilities, not bits every document must set. A base
document sets all three header fields to zero. A compressed document sets document flag 0 and
required feature 0 together. The ordinary decoder additionally proves their exact structural
agreement with the section directory.

## Negotiation algorithm

`HDocCapabilities` exposes the exact read/write version and accepted masks.
`HDocCapabilities::supports` returns true only for `SectionCompression`; allocated dictionary and
extension enum identities return false so callers cannot mistake reservation for implementation.

`negotiate_hdoc(bytes)` is not a permissive header parser. It runs the complete existing validating
decoder—magic, exact version, length, CRC, feature/flag/directory agreement, bounded decompression,
canonical rebuild, tables/payloads/limits, and typed content hash—before returning
`HDocNegotiatedProfile`. The successful profile contains exact version, flags, required/optional
bits, base-versus-compressed storage profile, and typed content hash. No capability/profile object
escapes for corrupt or partially validated input.

Failure order remains the HDoc reader's trust order. Wrong magic is `CAP_FORMAT_UNSUPPORTED`;
unknown major/minor is `CAP_UNSUPPORTED_VERSION`; unsupported features/profiles are
`CAP_FORMAT_UNSUPPORTED`; recognized malformed bytes are `DUR_CORRUPTION`. Diagnostics retain no
field names, values, or input fragments.

## Path dictionary and extension decision

P03-013/P03-014 implement a standalone collection dictionary and lifecycle. They do not define an
HDoc body reference record, add a fifth base section, remove exact name bytes, or change typed hash
framing. Therefore `USES_PATH_DICTIONARY_REFERENCES` and required feature bit 1 stay unsupported.
Enabling them requires a future exact record grammar, dictionary identity/version binding,
content-hash equivalence proof, golden vectors, migration and rollback plan, and a new matrix row;
the reserved bits alone are not permission.

No semantic or nonsemantic extension record is registered. Although the envelope reserves an
`extension_area` section kind and feature identities, a reader cannot yet prove skip safety,
canonical ordering, preservation on re-encode, or hash contribution. It rejects all such bytes.

## Migration assessment and rollback boundary

`assess_hdoc_migration(source, target)` is the implemented fail-closed hook:

1. Reject any trusted target other than exact `1.0` before reading untrusted source bytes.
2. Fully negotiate and validate the source as exact supported canonical HDoc `1.0`.
3. Return `NoMigrationRequired` with source content hash and storage profile.

The assessment always reports `requires_rewrite = false`. It does not copy, rewrite, publish,
delete, rename, or checkpoint source bytes. Invalid source uses the decoder's typed error;
unsupported target uses `CAP_UNSUPPORTED_VERSION`. An operator can therefore call one stable hook
now without receiving a false migration promise.

There is no rollback boundary because there is no implemented migration and no newer byte version
can be written. The first future migration must add a version-specific ADR/plan, immutable old/new
fixtures, source preservation, staged output, semantic/hash equivalence, interruption checkpoints,
atomic publication, downgrade eligibility, and a precise point after which rollback is forbidden.
It must extend this matrix; it cannot change the meaning of the current no-op assessment.

## Verification obligations

Tests prove exact capability masks, supported/unsupported feature identities, base and compressed
negotiated profiles, version rejection, required/optional feature rejection, corruption rejection,
no profile before full validation, exact-current no-op assessment, unsupported target rejection,
source error propagation, stable codes/source chaining, and no rewrite claim. P03-016 now freezes
immutable version/feature/malformed vectors, and P03-017 adds an independent reader.

## References

- [HDoc 1.0 envelope](hdoc-v1.md)
- [HDoc bounded compression](hdoc-v1-compression.md)
- [Collection path dictionary](path-dictionary-v1.md)
- [Versioning policy](../governance/versioning.md)
- [Implementation plan Phase 3](../../ImplementationPlan.md#phase-3--hdoc-format-codec-and-path-dictionary)

# ADR 0012: Use a bounded little-endian HDoc v1 envelope with separate integrity and content hashes

- Status: Accepted
- Date: 2026-07-11
- Decision owner: Storage architecture owner
- Required reviewers: Query semantics owner, Runtime architecture owner, Security owner
- Required before: `P03-002`–`P03-008` and `G03`
- Supersedes: None
- Superseded by: None

## Context

HDoc is the authoritative typed row representation. Its bytes must round-trip every accepted
logical type, remain deterministic across native Rust, Wasm, JavaScript, browsers, operating
systems, and future SDK readers, and be safe to inspect when the input is corrupt or hostile.
The format must also preserve exact field names and presentation order while verifying the
order-independent canonical typed content hash defined by the accepted object semantics.

The transcript and specification sketched a header, field table, value area, nested tables,
optional compression, checksum, and document hash, but deliberately left the physical rules
open. Host endianness, native struct layout, ambiguous relative offsets, unchecked decompression,
or one overloaded digest would make the first fixtures platform-dependent or give a checksum a
security role it cannot provide.

The accepted portable limit profile caps a complete uncompressed canonical HDoc at exactly
16,777,216 bytes, including its header, tables, names, values, padding, checksum, and hash. That
bound makes 32-bit offsets sufficient and lets the format favor a small portable layout over
speculative large-document addressing.

This decision implements `P03-001` and contributes to `INV-001`, `INV-007`, `DATA-001`,
`DATA-002`, `CORE-001`, `SEC-001`, and `SEC-002`. Tasks `P03-002` through `P03-007` must turn
these invariants into exact field layouts, registries, byte encodings, hash framing, and
compression profiles before a writer is accepted.

## Decision drivers

- One deterministic byte representation for a selected HDoc version/profile and ordered logical
  document, independent of host ABI, map iteration, allocator, or CPU.
- Exact reconstruction of logical type, payload, field-name bytes, array order, and object
  presentation order.
- Format-independent canonical typed content identity that follows the accepted semantic model.
- Bounds and arithmetic that can be validated before allocation, pointer creation, or value
  exposure.
- Cheap detection of accidental stored-byte corruption without pretending to authenticate
  attacker-controlled bytes.
- Native, Wasm, browser, and future cross-language readers with no unaligned/native-struct loads.
- Explicit version and extension behavior that fails closed for unknown semantics.
- Optional compression without compression-bomb, size-limit, checksum, or hash ambiguity.
- A layout that supports direct field lookup and later path dictionaries without making derived
  numeric IDs part of document meaning.
- Borrowed mature checksum, hash, and compression implementations under the dependency policy.

## Considered options

### Option A — Use BSON, deterministic CBOR, or another general interchange format directly

Advantages:

- Existing parsers and ecosystem tooling.
- Mature basic framing and type support.
- Less custom codec code at the start.

Disadvantages:

- The project would still need an application profile for exact HelixDB types, presentation
  order versus mapping identity, canonical typed hashes, field IDs, path dictionaries, limits,
  required features, and corruption diagnostics.
- Deterministic CBOR requires an exact deterministic-encoding profile and uses map-order rules
  that do not by themselves express HelixDB's separately preserved presentation order.
- BSON does not provide the planned field table/path-dictionary relationship or the complete
  HelixDB type and canonical-hash contract.
- Accepting a library's permissive reader behavior could broaden the persistent contract.

### Option B — Persist native Rust/C/host structs or a memory-mapped object graph

Advantages:

- Minimal decode work on the producing host.
- Natural alignment and direct pointer access in one build.

Disadvantages:

- Endianness, padding, enum layout, pointer width, compiler version, target ABI, and alignment
  become persistent format behavior.
- Unaligned or invalid pointers make hostile-input validation unsafe.
- Wasm, JavaScript, browsers, and SDK languages cannot share the representation reliably.
- Schema evolution and deterministic hashing become coupled to compiler layout.

### Option C — Use a custom portable, offset-based HDoc envelope

Advantages:

- Exact control of typed values, field lookup, presentation metadata, canonical hashing,
  versioning, and path-dictionary integration.
- Every reference is bounds-checkable before use.
- A single byte contract can be read on native and Wasm targets.
- Stored-byte integrity and logical content identity can have distinct, auditable purposes.

Disadvantages:

- The project owns a security-sensitive parser and migration surface.
- Golden vectors, independent readers, fuzzing, and long-term compatibility become mandatory.
- The initial layout must resist premature optimization and extension exhaustion.

### Offset and alignment alternatives

The decision considered packed variable-length integers, 64-bit offsets, host-relative pointers,
container-relative offsets, and fully packed unaligned fixed-width data. Variable integers save a
small amount but create multiple representations unless strictly canonicalized. Sixty-four-bit
offsets double common table fields despite the 16 MiB limit. Mixed offset bases complicate review,
and host pointers are not portable. Fully packed data reduces padding but makes every direct
fixed-width load unaligned and weakens predictable CPU/Wasm access.

### Integrity and identity alternatives

- **CRC32C only** is fast and useful for accidental corruption, but it is not collision resistant
  and cannot identify typed logical content across physical layouts.
- **A cryptographic hash only** can serve content identity, but recalculating logical framing is
  more expensive than checking stored bytes and does not by itself distinguish physical damage
  from a noncanonical semantic representation.
- **SHA-256 plus no checksum** has broad interoperability, but HDoc's hot portable codec benefits
  from BLAKE3's incremental, parallel, SIMD, and Wasm-friendly implementations while still
  needing a cheap stored-byte checksum.
- **CRC32C plus BLAKE3-256** gives the two mechanisms explicit non-overlapping jobs.

## Decision

Accept Option C with the following normative HDoc v1 baseline.

| Concern | HDoc v1 rule |
| --- | --- |
| Byte order | Little-endian for envelope metadata, tables, offsets, lengths, and numeric payloads unless a logical type has an explicitly defined canonical opaque byte order |
| Offset width/base | Unsigned 32-bit absolute byte offsets measured from byte zero of the HDoc envelope |
| Length/count width | Unsigned fixed-width fields selected by the owning sub-format; all arithmetic checked in a wider host type |
| Document limit | At most 16,777,216 bytes for the complete uncompressed canonical HDoc under `limits-v1` |
| Section alignment | Every top-level variable section starts at an 8-byte boundary |
| Payload alignment | Fixed-width payloads use natural alignment capped at 8 bytes |
| Padding | Minimal required padding only; every padding byte is zero and validated |
| Stored-byte checksum | CRC-32C (Castagnoli) over the complete stored envelope with the checksum field treated as zero |
| Typed content hash | Unkeyed, domain-separated BLAKE3-256 over canonical typed logical content |
| Compression | Optional, versioned, bounded, and deterministic per selected profile; uncompressed reading/writing is mandatory |
| Evolution | Explicit version plus required/optional feature and length-delimited extension registries; unknown semantics fail closed |

Normative requirement words in this ADR use their ordinary standards meaning: **MUST** is required,
**MUST NOT** is forbidden, **SHOULD** is the default unless a reviewed reason is recorded, and
**MAY** is optional within the stated constraints.

### Endianness and scalar bytes

All HDoc multi-byte integers and IEEE binary floating payloads are encoded little-endian. This
includes header fields, counts, flags wider than one byte, offsets, lengths, timestamps, dates,
integer values, vector dimensions, and `f16`/`f32` vector elements. Writers MUST use explicit
byte encoding, and readers MUST use checked byte reads; neither may serialize or cast a host
struct as HDoc.

The rule does not reinterpret types whose logical contract defines an opaque canonical byte
sequence. UUID remains its documented 16-byte network/canonical value, ObjectId remains its 12
opaque bytes, binary remains subtype plus exact bytes, and decimal128 uses the canonical byte
mapping fixed by `P03-004`. Those payloads MUST NOT be copied from an implementation struct until
that implementation proves its memory order is the specified HDoc order.

Little-endian is selected because WebAssembly loads and stores multi-byte numeric values in
little-endian order and the targeted CPUs efficiently support it. A big-endian host remains
supported by explicit conversion; it never changes persisted bytes.

### Alignment and padding

An HDoc envelope can begin at any byte address. The decoder MUST NOT require the document base to
be aligned and MUST NOT form a typed reference before validating the referenced byte range and
alignment rule.

Within the envelope:

- top-level table, name, value, compression, extension, and footer sections begin at offsets
  divisible by 8;
- fixed-width values use natural alignment of 1, 2, 4, or 8 bytes, capped at 8;
- variable byte/string/container data has byte alignment unless its internal table states a
  stronger rule;
- an encoder emits only the minimum padding required by the next item;
- every padding byte is `0x00`, participates in the stored-byte checksum, and is rejected when
  nonzero; and
- no v1 value or table may require alignment greater than 8.

These rules give deterministic bytes and predictable access without assuming the caller's base
address. P03-002 through P03-005 define the exact ordered sections and therefore the exact padding
locations.

### Offsets, lengths, and bounds

Every v1 cross-reference is an absolute unsigned `u32` byte offset from the first magic byte.
Every v1 byte length needed to address document contents is representable as `u32`. Container-
relative offsets, signed offsets, native pointers, and implicit current-position references are
forbidden in v1.

Offset zero is not an absent-value sentinel. Presence, null, inline values, and optional sections
are represented by explicit tags, flags, counts, or directory entries. An offset/length pair MUST
be canonical for its type and MUST identify exactly one permitted region.

Before accessing a referenced region, a reader MUST:

1. validate magic, supported version, required features, declared total length, and the minimum
   header needed to interpret the rest;
2. convert fields without narrowing and perform addition/multiplication in a wider checked type;
3. prove `offset <= total_length`, `length <= total_length`, and
   `offset + length <= total_length` without overflow;
4. validate the target's required alignment, section membership, and permitted ownership;
5. reject forbidden overlaps, aliases, gaps, duplicate entries, non-minimal padding, and references
   into the header/footer when the field kind does not permit them; and
6. enforce recursion, field, name, array, vector, and other `limits-v1` constraints before
   allocation or publication.

No borrowed view or decoded logical value is exposed until complete structural, checksum,
canonicality, type, limit, and content-hash validation succeeds. Implementations MAY stage safe
header metadata internally while validating, but callers cannot observe partial document data.

### Maximum sizes and resource accounting

The exact `document.canonical_bytes` maximum is 16,777,216 bytes. It includes header, all tables,
all exact name and value bytes, required presentation metadata, extensions, alignment padding,
checksum, and footer hash in the complete uncompressed canonical representation. Every other
accepted `limits-v1` document/depth/field/name/path/array/vector constraint also applies.

Compression, transport framing, a value log, a page boundary, a path dictionary, or an import path
MUST NOT make an oversized document valid. A writer first validates logical limits, encodes into
bounded unpublished staging, and validates the exact uncompressed HDoc size before publication.
A reader rejects an expanded document at the first point it would exceed a limit; it does not
allocate the claimed expanded size first.

A compressed representation MUST be smaller than its canonical uncompressed representation,
including compression metadata and padding. Therefore v1 does not use compression as permission
for a stored envelope larger than the canonical limit. P03-007 may set a smaller block or stored-
envelope limit but cannot raise `limits-v1`.

### Canonical physical encoding

For a selected HDoc major/minor version, feature/profile set, dictionary version, and complete
ordered logical document, there is exactly one accepted uncompressed byte representation.
Canonical writers and validating readers enforce all of the following:

- every logical type has exactly one stable type tag and payload representation;
- logical type identity is retained: `int32`, `int64`, `float64`, and `decimal128` do not collapse
  merely because values compare numerically equal;
- accepted floating special values, signed zero, decimal cohorts, temporal values, identifiers,
  binary subtypes, and vectors use their previously accepted canonical semantic rules;
- strings and field names are exact valid UTF-8 bytes with no normalization or case folding;
- normal objects contain unique names and retain presentation order metadata;
- arrays retain element order and exact element types;
- counts, lengths, offsets, flags, padding, and section/directory ordering are minimal and exact;
- reserved bits and reserved fields are zero unless a supported feature assigns them; and
- duplicate sections, duplicate extension IDs, alternate encodings, unused trailing bytes, and
  nonzero padding are noncanonical and rejected.

Object presentation order is part of the ordered stored document and therefore can change HDoc
bytes. It is not part of object mapping equality or the canonical typed content hash. A path-
dictionary encoding MUST resolve to the same exact field-name bytes and content hash; dictionary
numeric IDs never become object meaning. P03-013 through P03-015 define the dictionary's own
authoritative version, recovery, and negotiation rules.

### CRC-32C stored-byte checksum

HDoc v1 uses CRC-32C with the Castagnoli polynomial. The parameter set is width 32, polynomial
`0x1EDC6F41` (reflected representation `0x82F63B78`), initial register `0xFFFFFFFF`, reflected
input/output, and final XOR `0xFFFFFFFF`. The standard check value for the ASCII bytes
`123456789` is `0xE3069283`. The resulting `u32` is stored little-endian.

The checksum is calculated over exactly the declared stored envelope bytes from offset zero
through `total_length`, including flags, stored compressed bytes, extensions, padding, and footer
hash, while the checksum field's bytes are treated as zero. Bytes outside `total_length` are not
part of the HDoc and are rejected by an exact blob reader or owned by an explicitly separate
container format.

CRC-32C detects accidental corruption and helps distinguish a damaged stored envelope before
semantic decoding. It is not collision resistant, authentication, authorization, a MAC, or a
substitute for authenticated encryption/signatures at an untrusted boundary. P03-006 fixes the
checksum field location and golden coverage vectors without changing this algorithm/parameter
choice.

### BLAKE3-256 canonical typed content hash

The footer stores the 32-byte output of unkeyed BLAKE3 in its default hash mode. Its input is a
domain-separated, length-delimited canonical typed logical tree, not the physical HDoc byte slice.
The domain identifies HDoc typed content and its hash-framing version. P03-006 freezes the exact
domain bytes and recursive framing before the first golden HDoc vector.

The canonical typed content hash:

- includes every exact field-name byte, logical type tag, canonical logical payload, array
  position, and recursively typed value;
- traverses object fields in canonical exact UTF-8 byte order rather than presentation order;
- retains numeric width and canonical floating/decimal payload identity, following the accepted
  typed content hash rather than the separate semantic comparison hash;
- ignores physical offsets, padding, physical section placement, compression, dictionary numeric
  IDs, and nonsemantic optional extensions;
- includes a semantic extension only through a registered canonical logical contribution; every
  semantic extension is therefore required/critical for a reader that verifies the document; and
- is never treated as proof of equality without comparing the canonical typed content when
  collision-sensitive correctness requires it.

This hash gives the same typed content identity to documents that differ only in object
presentation order or an allowed physical storage profile. It does not authenticate a document:
an attacker who can replace bytes can also replace an unkeyed hash and CRC. Keyed integrity,
encryption, backup signatures, and transport authentication are separate versioned security
contracts.

Implementations MUST use a reviewed BLAKE3 implementation and official test vectors rather than
new cryptographic code. Platform-specific SIMD is allowed only behind the same portable output;
the scalar/native/Wasm paths must agree byte-for-byte.

### Compression strategy

Every conforming HDoc implementation must read and write the uncompressed base profile.
Compression is an optional required feature of a stored encoding profile, never an implicit
heuristic that changes reader behavior.

P03-007 selects codec IDs, exact library/version/settings, independent block boundaries, and
golden compressed bytes. Every accepted compression profile must satisfy these invariants:

- codec and profile IDs are explicit and covered by version/feature negotiation;
- the same canonical input and profile produce the same stored bytes;
- each block has exact stored and expanded lengths and is independently bounds-checked;
- total expanded bytes are bounded before/during decompression and remain subject to
  `limits-v1`;
- unknown codec/profile IDs are rejected before decompression;
- CRC-32C covers the stored compressed envelope while the BLAKE3 hash covers decoded canonical
  typed content;
- checksum success does not excuse decompression, canonical, or content-hash failure;
- compression is emitted only when the complete stored result is smaller; and
- decoders do not execute user-provided dictionaries/code or fetch codec material from a network.

No compression algorithm is selected by this ADR. Until P03-007 is accepted, v1 writers emit only
the uncompressed base profile and readers reject compression-required features.

### Version and extension strategy

HDoc begins with an independently validated magic and explicit major/minor version. It also carries
required and optional feature identities and explicit algorithm/profile identities where needed.
P03-002 assigns exact widths and bit/ID values; version zero is never interpreted as implicit v1.

The following evolution rules apply:

- an unknown major version is rejected with `CAP_UNSUPPORTED_VERSION`;
- a newer minor version is accepted only when the reader's published compatibility rule permits
  it and every required feature is understood; otherwise it is rejected rather than guessed;
- an unknown required feature, type tag, semantic extension, checksum/hash profile, compression
  profile, or changed interpretation is rejected with `CAP_FORMAT_UNSUPPORTED` before value
  exposure;
- optional nonsemantic extensions are length-delimited and may be skipped only when their bytes
  cannot affect decoded meaning, limits, addressing, or required validation;
- extensions live in a discoverable directory ordered by ascending stable extension ID;
- extension and feature IDs are registered, never reused, and duplicates are rejected;
- every critical extension is explicitly marked required; there is no guessed criticality;
- an implementation that mutates or re-encodes a document containing an unknown optional
  extension must preserve that extension's exact bytes and ordering canonically or reject the
  operation; silently dropping it is forbidden;
- the CRC covers every stored extension byte, while the typed content hash includes only registered
  semantic contributions; and
- a change that alters existing meaning, canonical bytes, required validation, hash framing, or
  extension interpretation requires a new compatible profile/minor or incompatible major version
  under the versioning policy and new immutable fixtures.

A writer cannot hide required behavior behind a minor number alone: it must also emit the assigned
required feature/profile identity. An older minor reader therefore never treats unrecognized
semantics as an ignorable addition merely because the major number matches.

Readers do not guess a version from length, filename, surrounding storage file, or package version.
Migrations create and validate new bytes before atomic publication; an old artifact is retained
until the owning migration/rollback policy permits cleanup.

### Validation and failure behavior

Validation order may optimize cheap checks, but its observable contract is fail-closed and
atomic. A decoder validates enough header to bound the input, verifies stored-byte integrity,
validates all structural/type/canonical/limit invariants, reconstructs the canonical typed hash,
and only then exposes a document/view.

Failures use the accepted stable error families:

- unsupported version uses `CAP_UNSUPPORTED_VERSION`;
- unsupported required format behavior uses `CAP_FORMAT_UNSUPPORTED`;
- checksum, content-hash, structural, overlap, padding, duplicate-name, and other proven durable
  corruption uses `DUR_CORRUPTION` with redacted bounded format/offset metadata; and
- user input that cannot be canonically encoded is rejected before durable publication under its
  applicable parse/type/limit code, not mislabeled as existing-storage corruption.

A query, scan, backup, replication, compaction, or migration that encounters a corrupt authoritative
HDoc fails the applicable operation. It must not skip the row, substitute null/missing, expose a
partially decoded value, repair bytes silently, or trust a derived index/sidecar instead.

## Consequences

### Positive

- Native and Wasm readers share one explicit byte order and bounded offset model.
- The 16 MiB cap makes compact `u32` references sufficient with no v1 large-document ambiguity.
- Zero padding and exact section alignment support deterministic bytes and safe optimized access.
- CRC-32C diagnoses stored-byte damage cheaply; BLAKE3-256 identifies canonical typed content
  across allowed physical/presentation differences.
- Object mapping semantics remain independent of preserved field presentation.
- Compression and extensions cannot silently broaden limits or change meaning.
- Unknown required behavior fails before any caller sees values.

### Negative

- Two integrity computations and strict canonical validation add CPU cost to decode/write paths.
- Absolute `u32` offsets and the 16 MiB profile require a new format/profile if larger documents
  are ever supported.
- Eight-byte section alignment and natural payload alignment add bounded padding.
- Opaque optional-extension preservation complicates mutation and may force explicit rejection.
- The project owns cross-language parsers, registries, golden vectors, fuzz targets, and migration
  compatibility indefinitely.

### Neutral or deferred

- P03-002 fixes exact header/footer fields, widths, section directory, and magic/version bytes.
- P03-003 assigns stable type tags and extension ranges.
- P03-004 fixes every logical payload encoding.
- P03-005 fixes field/nested tables, section order, and overlap rules.
- P03-006 fixes the BLAKE3 domain/framing and exact checksum/hash fields/vectors.
- P03-007 selects compression codecs and deterministic profiles.
- P03-013 through P03-015 define path-dictionary bytes, negotiation, and migrations.
- Performance remains an experiment: alignment or compression profiles are retained only if
  `EXP-001`/`EXP-002` evidence justifies them without weakening correctness.

## Compatibility and migration

No committed HDoc fixture or database exists before this decision, so there is no existing HDoc
data to migrate. The accepted baseline is HDoc major version 1 with an initial minor/profile
assigned by P03-002; it creates no promise to read an unversioned prototype.

Before the first immutable golden vector, this ADR can be superseded with ordinary source rollback
because no supported persistent bytes exist. Once `P03-016` freezes HDoc v1 fixtures or a gate
accepts persisted HDoc data, changing any normative byte/hash rule requires a superseding ADR,
new version/profile, new golden and malformed fixtures, reader/writer compatibility matrix, and a
tested migration/rollback plan. Historical fixtures remain immutable.

A reader advertises exact readable versions/features and one writable version/profile. Reading
does not silently rewrite. A migration writes a new bounded artifact, validates CRC/structure/
canonical typed hash and logical equivalence, atomically publishes it, and retains the source until
the documented rollback boundary. Derived indexes and sidecars are rebuilt rather than trusted as
the authority.

HDoc version negotiation is independent of package, protocol, WAL, SST, backup, and replication
versions. Those containers must record enough identity to reject an HDoc version/feature they
cannot safely carry, but they do not reinterpret HDoc bytes.

## Security and operations

- All byte-derived counts, offsets, lengths, block sizes, and allocation sizes use checked
  arithmetic and hard limits before allocation/reference construction.
- A checksum/hash mismatch is a corruption signal and operational event; neither primitive grants
  authenticity for attacker-controlled storage or transport.
- Encrypted storage, transport authentication, backup signatures, and key management bind HDoc
  bytes through their own versioned authenticated metadata.
- Error metadata names the format/version/check class and bounded byte offset/section without
  logging document values, names, secrets, or entire corrupt payloads.
- Readers retain/quarantine the original artifact for recovery policy; automatic repair never
  overwrites the only authoritative bytes.
- Decompression is streaming/bounded, uses no network or user code, and aborts as soon as declared
  or actual output violates a limit.
- Checksum/hash/compression dependencies require locked versions, approved licenses, provenance,
  advisory review, native/Wasm support, and independent vectors under the repository dependency
  policy.
- Unsafe/SIMD fast paths are optional optimizations behind the same validating portable behavior;
  they receive differential tests and fuzz/sanitizer coverage before use.

## Validation plan

- [x] Record implementable endianness, alignment, offset, maximum-size, canonicalization,
  checksum, content-hash, compression, extension, rejection, and rollback decisions in this ADR.
- [ ] Freeze exact header/footer and feature/version fields under `P03-002`.
- [ ] Freeze type tags and payload encodings under `P03-003` and `P03-004`.
- [ ] Freeze table/offset/section/padding rules under `P03-005`.
- [ ] Reproduce RFC CRC-32C and official BLAKE3 vectors; freeze domain/framing and corruption
  diagnostics under `P03-006`.
- [ ] Select and validate deterministic bounded compression profiles under `P03-007`.
- [ ] Implement the bounded encoder/validating decoder and independent owned/borrowed paths under
  `P03-008`–`P03-012`.
- [ ] Commit immutable positive, boundary, noncanonical, unknown-feature/version, checksum, hash,
  overlap, truncation, padding, compression-bomb, and limit golden vectors under `P03-016`.
- [ ] Prove Rust and TypeScript readers produce identical logical values and hashes under
  `P03-017`.
- [ ] Run property/mutation tests, coverage-guided fuzzing, ASan, and Wasm/browser replay under
  `P03-018` and `P03-019`.
- [ ] Publish raw encode/decode/lookup/size/alignment/compression results for `EXP-001` and
  `EXP-002` under `P03-020`/`P03-021`.
- [ ] Complete independent format/security review and close `G03` only with no open critical
  parser, corruption, migration, or portability issue.

## Implementation impact

- Format and codec work: `P03-002`–`P03-012`, `helix-doc`, format fixtures, and fuzz targets.
- Dictionary/evolution work: `P03-013`–`P03-019`.
- Experiments/gate: `P03-020`, `P03-021`, `EXP-001`, `EXP-002`, and `G03`.
- Later authoritative consumers: storage, WAL/value-log/SST, replication, backup/restore,
  migration, browser persistence, SDK/protocols, and compatibility adapters.
- Requirements: `INV-001`, `INV-007`, `DATA-001`, `DATA-002`, `CORE-001`, `SEC-001`, `SEC-002`.
- Owners/reviewers: storage architecture, query semantics, runtime architecture, and security.

## Follow-up work

- [ ] `P03-002`: assign exact magic, header/footer, directory, version, flag, algorithm, and feature
  fields.
- [ ] `P03-003`: publish stable type-tag and reserved-extension registries.
- [ ] `P03-004`: publish exact canonical scalar/container payload bytes.
- [ ] `P03-005`: publish the complete offset/section/alignment/overlap grammar.
- [ ] `P03-006`: publish exact CRC coverage and BLAKE3 domain/framing vectors.
- [ ] `P03-007`: select compression algorithms/settings after dependency and benchmark review.
- [ ] `P03-015`: publish the HDoc reader/writer/feature migration matrix.
- [ ] `P03-016`–`P03-021`: freeze independent fixtures, fuzz/corruption evidence, and experiment
  conclusions before `G03`.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [Logical value model](../architecture/value-model.md)
- [Object ordering, equality, canonical hashing, and duplicate keys](../architecture/object-semantics.md)
- [Portable v1 semantic and command limits](../architecture/limits-v1.md)
- [Floating special-value semantics](../architecture/floating-special-semantics.md)
- [Identifier semantics](../architecture/identifier-semantics.md)
- [Temporal semantics](../architecture/temporal-semantics.md)
- [Persistent format and public protocol versioning policy](../governance/versioning.md)
- [Versioned error semantics](../architecture/error-semantics.md)
- [RFC 3385: Internet Checksum Considered Harmful?](https://www.rfc-editor.org/rfc/rfc3385)
- [RFC 3720: iSCSI CRC-32C parameters and examples](https://www.rfc-editor.org/rfc/rfc3720)
- [BLAKE3 official implementation and test vectors](https://github.com/BLAKE3-team/BLAKE3)
- [BLAKE3 specification](https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf)
- [WebAssembly Core Specification: memory instructions](https://webassembly.github.io/spec/core/syntax/instructions.html)
- [RFC 8949: CBOR, including deterministic encoding](https://www.rfc-editor.org/rfc/rfc8949.html)

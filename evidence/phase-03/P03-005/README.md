# P03-005 Evidence — HDoc Field, Name, Value, and Container Records

- Task: `P03-005`
- Verdict: **PASS**
- Source commit: `6d919c39af9ae126de3f152f3a7178bf44489c05`
- Source parent: `cd8e4bd102968061b5ee0349a93854fa888943ac`
- Source tree: `31edf6657c3fbe8a085eba697657ff51b7b1c4be`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-001`, `DATA-002`, `INV-001`, `INV-007`
- Gate: `G03`
- Recorded: 2026-07-11 UTC

## Outcome

P03-005 fixes the complete HDoc 1.0 base-profile grammar for all four required body sections:

- 24-byte object `FieldEntry` records;
- 8-byte document-local `NameRecord` records followed by exact deduplicated UTF-8 bytes;
- canonically ordered noncontainer payload occurrences with exact P03-004 alignment and minimum
  zero padding;
- 32-byte object/array `ContainerDescriptor` records; and
- 12-byte dense `ArrayEntry` records.

The source snapshot defines exact offsets, lengths, `item_count` meanings, field/name IDs,
presentation ordinals, root and child numbering, parent ownership, recursive field counts,
zero-length cursor behavior, container references, structural limits, construction order, and
fail-closed validation. It leaves only typed hash/CRC vectors (`P03-006`) and compression
(`P03-007`) before the byte format can become complete.

No valid complete HDoc fixture or writer is claimed. Footer hash profile zero remains invalid.

## Source artifacts

The exact 16-artifact source diff is hash-bound in [manifest.json](manifest.json):

| Artifact | Role |
| --- | --- |
| [Specifications](../../../Specifications.md) | Normative summary and field/path-ID namespace boundary |
| [Study](../../../Study.md) | Feasibility/layout conclusion and remaining work |
| [Record document](../../../docs/formats/hdoc-v1-records.md) | Complete normative table/container grammar |
| [Record registry](../../../docs/formats/hdoc-v1-records.json) | Executable fixed layouts, rules, limits, and vectors |
| [Envelope document](../../../docs/formats/hdoc-v1.md) | Exact `item_count`, minimum-root, and ownership reconciliation |
| [Envelope registry](../../../docs/formats/hdoc-v1-envelope.json) | Machine record-registry binding and 288-byte structural minimum |
| [Payload document](../../../docs/formats/hdoc-v1-payloads.md) | Containing-reference/value-area completion |
| [Payload registry](../../../docs/formats/hdoc-v1-payloads.json) | Machine containing-record completion state |
| [Type-tag document](../../../docs/formats/hdoc-v1-type-tags.md) | Object/array position and Missing/null completion |
| [Type-tag registry](../../../docs/formats/hdoc-v1-type-tags.json) | Machine P03-005 completion/registry binding |
| [ADR 0012](../../../docs/adr/0012-use-bounded-little-endian-hdoc-v1.md) | Checked P03-005 validation/follow-up state |
| [Format index](../../../docs/formats/README.md) | Published record-format entry |
| [Documentation index](../../../docs/README.md) | Top-level discoverability |
| [Compatibility matrix](../../../compatibility/v1/matrix-v1.json) | Regenerated hash-bound specification authority |
| [Rendered compatibility document](../../../docs/compatibility/v1-semantic-compatibility-matrix.md) | Regenerated human-readable matrix identity |
| [Generation report](../../../fixtures/generation/report-v1.json) | Regenerated artifact hashes and pass verdict |

## Fixed layout decisions

### Object fields and presentation

Every object owns one contiguous field span sorted strictly by document-local `field_id`. Each
field ID is the zero-based exact-name record index; it is not a collection path-dictionary ID.
Each entry also carries a presentation ordinal whose set must be exactly `0..item_count-1`.

This gives deterministic binary lookup and mapping identity while reproducing accepted field
presentation exactly. Changing presentation order changes the physical HDoc/CRC but does not
change canonical typed content identity under the P03-006 object-hash contract.

### Exact names

Distinct names across the whole document are sorted by `binary_utf8_v1`, assigned dense IDs, and
stored once. Eight-byte records contain absolute byte offset, byte length, and Unicode scalar
count. The exact name suffix has no terminators, normalization, gaps, padding, aliases, or unused
records. Field tuples redundantly match the selected name record for fast validated access.

### Dense arrays

Arrays store one 12-byte entry per immediate element in exact zero-based index order. There is no
Missing tag, hole, omitted element, or sparse offset. Array spans grouped by ascending container ID
exactly cover the suffix after all descriptors.

### Unique container tree

Descriptor zero is the root object at depth one. Child IDs are assigned by a deterministic
breadth-first queue; object children are discovered in canonical field order and array children in
index order. Every nonroot container has exactly one reference and matching parent ID/slot/depth.

This rejects unreachable descriptors, aliases, cycles, alternate numbering, and shared on-disk
graphs. Repeated host subgraphs serialize by value as distinct trees.

### Values and zero-length payloads

Noncontainer occurrences are scanned by container ID, then canonical object field or array index.
Each occurrence is emitted separately at its P03-004 alignment; only the minimum intervening zero
padding is legal. Nonzero payloads cannot overlap, alias, deduplicate, or leave gaps.

Null and empty string still increment `value_area.item_count`. They record the replayed aligned
cursor and own no bytes, so equal offsets are legal only for zero-length ownership. A later
nonempty payload may begin at that same cursor. Container references point to the exact child
descriptor and always carry length 32; they consume no value-area bytes.

## Machine validation

[verify.mjs](verify.mjs) is 58,288 bytes with SHA-256
`8f77b66b28fbd5e91e1d67d1480ea8529be0f862d3f2ea61fef2dcbe0e39d5e0`.

It verifies from the immutable source commit rather than the worktree:

- exact parent/tree/source scope, byte counts, and SHA-256 identities for all 16 artifacts;
- format identity, self-contained base profile, incomplete hash/compression boundary, and owners;
- all four section equations and `item_count` meanings;
- complete nonoverlapping byte coverage of the 24/8/12/32-byte record layouts;
- object/array kind rules, name-pool grammar, container-tree grammar, and value-reference union;
- eight canonical construction steps, 23 validation rules, five exact deferrals, and all portable
  limit values;
- envelope, type-tag, payload, and record-registry reconciliation;
- exact bytes and independent parsing of all four structural examples;
- strict UTF-8/name validation, name suffix coverage, field-ID order, name tuple agreement, and
  presentation permutations;
- descriptor/root/span/array-suffix validation, deterministic breadth-first reachability, unique
  ownership, parent slots, depths, and bottom-up recursive field counts;
- payload occurrence order, exact lengths, alignment, zero padding, zero-length cursors, complete
  value-area coverage, and container references;
- normal root `_id` versus the deliberately rejected empty-root boundary;
- all 28 normative headings and required semantic markers/backlinks;
- all 171 source Markdown files and 1,269 resolving local links; and
- isolated network-free replay of the 263-row generated compatibility matrix.

## Structural vectors

| Vector | Total structural size | Fields | Names | Values | Containers | Array entries | Boundary proved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `empty-root-structure` | 288 | 0 | 0 | 0 | 1 | 0 | Unique zero-span root bytes; normal row rejects missing `_id` |
| `root-scalars-presentation` | 408 | 3 | 3 | 3 | 1 | 0 | Canonical `_id,n,s` versus presentation `s,_id,n`; null/empty string share cursor |
| `internal-payload-alignment` | 424 | 3 | 3 | 3 | 1 | 0 | Boolean at 312, exactly seven zero bytes, aligned int64 at 320 |
| `nested-object-array` | 552 | 4 | 3 | 3 | 4 | 2 | Empty span, dense array, nested object, BFS IDs, zero-before-nonzero cursor |

Across them, the verifier parses 636 exact section bytes, 10 field entries, nine distinct-name
records, nine noncontainer occurrences, seven descriptors, and two dense array entries.

These are section-local structural vectors. P03-016 will embed them in immutable complete HDocs
after P03-006/P03-007 assign valid hash/compression profiles.

## Negative verification

The verifier executes 60 isolated in-memory mutation canaries covering:

- JSON/schema/profile/completion ownership;
- every record stride and root/tag/flag/sentinel constant;
- each section equation/count meaning/minimum;
- representative field/name/array/descriptor offsets, limits, reserved values, registries, and tag
  domains;
- object canonical order, name deduplication, dictionary namespace separation, tree numbering and
  ownership;
- noncontainer occurrence order, zero-length cursor, container length, and Missing exclusion;
- construction/validation inventories and portable document/array limits;
- structural-vector inventory, metadata, field/name/value/container bytes, internal padding, and
  total length;
- heading and semantic prose for field IDs, presentation, dense arrays, tree ownership, and
  zero-length behavior;
- specification/study/index/envelope/payload/type-tag/ADR/plan links and completion states; and
- generated compatibility matrix/report identities.

Each mutation must reach its intended first rejection reason. Mutations operate only on extracted
in-memory strings and never touch the workspace.

## Broader validation

Before the source commit:

- the independent record parser accepted all four exact vectors and reconstructed their logical
  names, presentation, dense arrays, container tree, payloads, and counts;
- compatibility generation/checking passed 263 rows with zero failures/skips;
- fixture generation/checking passed four generators, five authority artifacts, schemas, and
  independent SplitMix64 reproduction;
- JavaScript/dependency policy passed; and
- `test:all` passed nine Rust tests, 17 semantic fixtures/313 steps/382 oracle assertions, 16
  MongoDB cases, Wasm/browser bundle checks, three declared browser tests, benchmark validation,
  19 benchmark rejection canaries, and all reserved-suite claim boundaries.

The immutable evidence verifier passed under exact Node.js 22.23.1 and 24.18.0 with all 60
mutations rejected.

## Commands

```bash
node compatibility/v1/generate-matrix.mjs --check
node compatibility/v1/check-matrix.mjs
corepack npm run fixtures:check
corepack npm run policy:javascript
corepack npm run test:all

/home/alextis/.nvm/versions/node/v22.23.1/bin/node \
  evidence/phase-03/P03-005/verify.mjs \
  6d919c39af9ae126de3f152f3a7178bf44489c05

/home/alextis/.nvm/versions/node/v24.18.0/bin/node \
  evidence/phase-03/P03-005/verify.mjs \
  6d919c39af9ae126de3f152f3a7178bf44489c05
```

## Maturity boundary

This evidence proves the P03-005 specification and structural vector contract. It does not claim:

- a valid nonzero HDoc content-hash profile (`P03-006`);
- a supported compression block/codec profile (`P03-007`);
- a safe encoder, validating decoder, owned/borrowed API, or raw lookup implementation
  (`P03-008`–`P03-011`);
- immutable complete HDoc golden files (`P03-016`);
- independent Rust/TypeScript codecs, property tests, fuzzing, or sanitizer proof
  (`P03-017`–`P03-019`); or
- measured field-lookup, size, alignment, or compression performance (`P03-020`–`P03-021`).

Those boundaries remain explicit so the record specification cannot be mistaken for implemented
database functionality.

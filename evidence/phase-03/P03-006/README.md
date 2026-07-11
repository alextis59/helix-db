# P03-006 Evidence — HDoc CRC-32C and Canonical Typed-Content Hashing

- Task: `P03-006`
- Verdict: **PASS**
- Source commit: `ea16bca2f6b3cacbb4a73e11d0f1c212b3d3853a`
- Source parent: `37a6e5e27c140406bbec75b4d8896f8ada330d50`
- Source tree: `f7e146d8943b530fe4379efd5af0f675cb87c88a`
- Accepted ADR: `0012`
- Requirements: `CORE-001`, `DATA-001`, `DATA-002`, `INV-001`, `INV-007`
- Gate: `G03`
- Recorded: 2026-07-11 UTC

## Outcome

P03-006 assigns HDoc footer hash algorithm/profile `1/1` and fixes the two distinct integrity
contracts needed by later codecs:

- reflected CRC-32C detects accidental corruption in the complete exact stored envelope while
  treating header bytes `[32,36)` as zero; and
- default-unkeyed BLAKE3 profile 1 identifies the canonical typed logical tree independently of
  presentation order and permitted physical encoding.

The accepted profile is `hdoc-typed-content-tree-v1`. Every node hashes a 27-byte NUL-terminated
domain, little-endian profile ID, one-byte type tag, little-endian `u64` body length, and exact
type-specific body. Noncontainers contribute the canonical P03-004 payload. Objects contribute
canonical field names plus child digests; arrays contribute every dense index plus child digest.

The source snapshot includes 6 CRC vectors, 7 official BLAKE3 boundary vectors, 23 typed-node
vectors, and two complete 408-byte uncompressed integrity-reference envelopes. It differentiates
stored-byte corruption, structural canonicality failure, typed-content mismatch, presentation-only
physical change, and the explicit non-authentication boundary.

Compression remains `P03-007`, so the overall HDoc byte-format gate is still open. The complete
envelopes here are normative integrity references, not the immutable supported P03-016 fixture
corpus or a production codec claim.

## Source artifacts

The exact 18-artifact source diff is hash-bound in [manifest.json](manifest.json):

| Artifact | Role |
| --- | --- |
| [Specifications](../../../Specifications.md) | Normative CRC and typed-content identity summary |
| [Study](../../../Study.md) | Feasibility conclusion and remaining compression boundary |
| [Integrity document](../../../docs/formats/hdoc-v1-integrity.md) | Complete normative checksum/hash contract |
| [Integrity registry](../../../docs/formats/hdoc-v1-integrity.json) | Executable algorithms, frames, vectors, references, and failure order |
| [Envelope document](../../../docs/formats/hdoc-v1.md) | Footer profile assignment and validation integration |
| [Envelope registry](../../../docs/formats/hdoc-v1-envelope.json) | Machine profile-1 and integrity-registry binding |
| [Record document](../../../docs/formats/hdoc-v1-records.md) | Table/container interaction with logical hashing |
| [Record registry](../../../docs/formats/hdoc-v1-records.json) | Machine integrity completion and P03-007-only remaining owner |
| [Payload document](../../../docs/formats/hdoc-v1-payloads.md) | Exact payload contribution to typed nodes |
| [Payload registry](../../../docs/formats/hdoc-v1-payloads.json) | Machine integrity-registry binding |
| [Type-tag document](../../../docs/formats/hdoc-v1-type-tags.md) | Tag identity contribution and profile-zero rejection |
| [Type-tag registry](../../../docs/formats/hdoc-v1-type-tags.json) | Machine integrity-registry binding |
| [ADR 0012](../../../docs/adr/0012-use-bounded-little-endian-hdoc-v1.md) | Checked P03-006 validation/follow-up state |
| [Format index](../../../docs/formats/README.md) | Published integrity-format entry |
| [Documentation index](../../../docs/README.md) | Top-level discoverability |
| [Compatibility matrix](../../../compatibility/v1/matrix-v1.json) | Regenerated hash-bound specification authority |
| [Rendered compatibility document](../../../docs/compatibility/v1-semantic-compatibility-matrix.md) | Regenerated human-readable matrix identity |
| [Generation report](../../../fixtures/generation/report-v1.json) | Regenerated artifact hashes and pass verdict |

## CRC-32C contract

The fixed Castagnoli parameters are normal polynomial `0x1edc6f41`, reflected polynomial
`0x82f63b78`, initial/final XOR `0xffffffff`, reflected input/output, and little-endian `u32`
storage. The standard ASCII `123456789` check is numeric `0xe3069283`, stored as `839206e3`.

Coverage is the exact `[0,total_length)` slice and includes header, directory, stored section
bytes, every padding byte, footer metadata, and all 32 content-hash bytes. Only `[32,36)` is
logically zero during calculation. Bytes outside the exact HDoc slice are not implicitly covered.

The verifier independently replays the standard check plus all five RFC 3720 appendix-B.4 vectors,
including their little-endian stored forms. It also recomputes both complete-envelope CRC values:

| Reference | Numeric CRC | Stored bytes |
| --- | --- | --- |
| Presentation `s,_id,n` | `0xf2666c12` | `126c66f2` |
| Presentation `_id,n,s` | `0x5f209897` | `9798205f` |

## BLAKE3 and typed-tree contract

The portable evidence oracle replays official default-mode inputs at 0, 1, 63, 64, 1,023, 1,024,
and 1,025 bytes, crossing empty, block, and chunk boundaries. During source validation, the same
inputs and every typed-node frame agreed among:

1. the evidence JavaScript oracle;
2. the official BLAKE3 C example built from commit
   `8aa5145039b972ba30e98e788752d37d14568824`; and
3. the official Rust `b3sum` implementation built from that same commit.

The source registry pins four external reference snapshots by exact byte count and SHA-256:

| Reference | Bytes | SHA-256 |
| --- | ---: | --- |
| RFC 3720 text | 578,468 | `0c014dbc041bfc2308c1990387aabffdb21050c3ec140c96522c12005b572db3` |
| Official BLAKE3 test vectors | 31,922 | `dcb91ea8accc77e6d6e632af7cdc1a99a9f3ae78cf648da595c7d064db32f624` |
| Official BLAKE3 C example | 868 | `280e37e4afa96a97d1cf31411bb6d956352f561d2d10893f413eb2cdfa003121` |
| BLAKE3 specification PDF | 304,371 | `ce179e62f29a6e43ec1ac2fe62b5e063a18632cf936c430d1373bfa0b81fb349` |

The immutable evidence replay is network-free. The compact JavaScript implementation is an
evidence oracle validated by the official vectors; it is not a recommendation to ship handwritten
cryptographic production code.

The 23 typed vectors prove:

- null, empty string, and empty generic binary remain distinct;
- Boolean values, int32/int64, float zero signs, decimal, temporal, identifier, and vector families
  retain exact type/payload identity;
- empty object and empty array differ;
- array position and order contribute explicitly;
- object fields hash in strict UTF-8 name order; and
- a nested object containing an array composes through exact child digest bytes.

## Complete-envelope replay

Both 408-byte references encode `{_id:uuid-nil,n:null,s:string-empty}`. Their only differing bytes
are the four stored CRC bytes and one byte in each of the three presentation-ordinal fields:

```text
[32,33,34,35,212,236,260]
```

Independent parsing proves exact header/directory/footer fields, section offsets and lengths,
canonical name records, field tags/value ranges, presentation permutations, root descriptor,
CRC, SHA-256, and bottom-up content-hash reconstruction. The physical bytes and CRCs differ, while
the root typed digest is equal:

```text
b3c73f825bbc1f2fecd295a9ee93bff822dae8ba50f9209e5b85fd31b928ba74
```

## Corruption and identity replay

The verifier executes every documented outcome:

| Mutation | Repaired field | First required result |
| --- | --- | --- |
| Covered stored byte flip | None | `stored-crc32c` rejection; typed hash not evaluated |
| UUID payload byte flip | CRC only | `typed-content-hash` rejection |
| Footer digest byte flip | CRC only | `typed-content-hash` rejection |
| Nonzero canonical padding | CRC only | `structural-canonicality` rejection |
| Canonical presentation permutation | CRC recomputed | Both references parse; same typed hash |
| Logical content replacement | CRC and unkeyed hash | Integrity fields can pass; no authentication claim |

This proves the intended validation priority without claiming that CRC or unkeyed BLAKE3 protects
against an attacker. Trust still requires a versioned authenticated enclosing layer.

## Machine validation

[verify.mjs](verify.mjs) is 58,584 bytes with SHA-256
`d5cc3476183bec2f7d3ca568d78fff97dd452263e16a20cebaa5885528a06346`.

It verifies from the immutable source commit rather than the worktree:

- exact parent/tree/source scope, byte counts, and SHA-256 identities for all 18 source artifacts;
- complete checksum parameters, coverage inventory, standard/RFC vectors, and endian storage;
- official BLAKE3 boundary vectors using an independent portable implementation;
- exact profile name/domain/frame widths/order, body grammars, exclusions, and extension/collision
  rules;
- all 23 typed-node bodies, structural child references, frame lengths, and digests;
- both complete HDocs, all internal layout fields, presentation-only byte differences, CRCs,
  SHA-256 values, and root typed hash;
- every corruption/identity class, including a successful recomputation demonstrating the
  non-authentication boundary;
- envelope/payload/record/type-tag registry reconciliation and the P03-007-only completion owner;
- all 24 normative integrity-document headings and required cross-document markers;
- 173 source Markdown files and 1,332 resolving local links;
- isolated network-free replay of the 263-row generated compatibility matrix; and
- 94 isolated mutation canaries with exact first-rejection reasons.

Mutations operate only on extracted in-memory strings and never modify the source commit or
workspace. The immutable verifier passed under exact Node.js 22.23.1 and 24.18.0.

## Broader validation

Across the source and closeout snapshots:

- compatibility generation/checking passed 263 rows with zero failures/skips;
- fixture generation/checking passed four generators, five authority artifacts, schemas, and
  independent SplitMix64 reproduction;
- JavaScript/dependency policy passed;
- `test:all` passed nine Rust tests, 17 semantic fixtures/313 steps/382 oracle assertions, 16
  MongoDB cases, Wasm/browser bundle checks, three declared browser tests, benchmark validation,
  19 benchmark rejection canaries, and all reserved-suite claim boundaries; and
- all format JSON parsed, all changed-file whitespace checks passed, and the official external
  snapshot byte counts/hashes matched the registry.

## Commands

```bash
node compatibility/v1/generate-matrix.mjs --check
node compatibility/v1/check-matrix.mjs
corepack npm run fixtures:check
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run dependencies:check
corepack npm run test:all

/home/alextis/.nvm/versions/node/v22.23.1/bin/node \
  evidence/phase-03/P03-006/verify.mjs \
  ea16bca2f6b3cacbb4a73e11d0f1c212b3d3853a

/home/alextis/.nvm/versions/node/v24.18.0/bin/node \
  evidence/phase-03/P03-006/verify.mjs \
  ea16bca2f6b3cacbb4a73e11d0f1c212b3d3853a
```

## Maturity boundary

This evidence proves the P03-006 integrity and canonical typed-content specification. It does not
claim:

- a supported deterministic compression block/codec profile (`P03-007`);
- a safe encoder, validating decoder, owned/borrowed API, or raw lookup implementation
  (`P03-008`–`P03-011`);
- immutable supported complete positive/malformed HDoc fixture files (`P03-016`);
- production Rust/TypeScript BLAKE3/CRC integration or independent codecs (`P03-008`, `P03-009`,
  `P03-017`);
- property tests, fuzzing, sanitizer proof, or exhaustive corruption replay (`P03-018`–`P03-019`);
- measured integrity-inclusive encode/decode/lookup/compression performance (`P03-020`–`P03-021`);
  or
- authentication, authorization, encryption, signatures, or an authenticated storage envelope.

Those boundaries remain explicit so integrity reference bytes cannot be mistaken for a complete
database format implementation or a security protocol.

## Primary external references

- [RFC 3720 appendix B.4](https://www.rfc-editor.org/rfc/rfc3720#appendix-B.4)
- [Official BLAKE3 repository and test vectors](https://github.com/BLAKE3-team/BLAKE3)
- [BLAKE3 specification](https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf)

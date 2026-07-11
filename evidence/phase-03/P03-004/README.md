# P03-004 HDoc 1.0 Canonical Noncontainer Payload Evidence

- Task: `P03-004` — define canonical encodings for integers, floats, decimals, timestamps, dates,
  UUIDs, ObjectIds, binary values, and vectors
- Requirements supported: `INV-001`, `INV-007`, `CORE-001`, `DATA-001`, `DATA-002`
- Accepted decision: [ADR 0012](../../../docs/adr/0012-use-bounded-little-endian-hdoc-v1.md)
- Normative format: [HDoc 1.0 canonical noncontainer payloads](../../../docs/formats/hdoc-v1-payloads.md)
- Machine companion: [hdoc-v1-payloads.json](../../../docs/formats/hdoc-v1-payloads.json)
- Type registry: [HDoc 1.x logical type tags](../../../docs/formats/hdoc-v1-type-tags.md)
- Commit under test: `ef663fff9b396b649408479830e20afc7ce8a75a`
- Recorded at: `2026-07-11T09:13:07.889Z`
- Source worktree: clean
- Recorder: Codex implementation agent
- Reviewer: pending independent `G03` format/security review
- Verdict: Pass

## Scope and result

The source commit fixes the exact intrinsic bytes, length equation, alignment, and canonical
validation for all 14 HDoc 1.0 noncontainer types. It deliberately does not define the containing
field/array/container record, value-area order/offsets/padding, object/array tables, hash framing,
compression, a complete HDoc fixture, or an encoder/decoder support claim.

| Type | Exact payload result |
| --- | --- |
| null | Zero bytes; distinct from Missing by the containing tag/record |
| Boolean | One byte: `00` false or `01` true; every other byte rejected |
| int32/int64 | Exact two's-complement 4/8-byte little-endian width |
| float64 | Exact eight IEEE binary64 bytes little-endian; all NaN/zero/sign bits preserved |
| decimal128 | One canonical 16-byte IEEE BID value little-endian with cohort re-encoding check |
| string | Complete canonical UTF-8 bytes; no prefix, terminator, repair, or normalization |
| binary | Assigned subtype byte then exact data; only generic `0x00` assigned in the base profile |
| timestamp | Range-checked signed `i64-le` Unix microseconds |
| date | Range-checked signed `i32-le` Unix-relative civil days |
| UUID | Exact 16 RFC 9562 network-order octets |
| ObjectId | Exact 12 opaque octets in logical order |
| f32 vector | `u32-le N` then `N` finite binary32 little-endian bit patterns |
| f16 vector | `u32-le N` then `N` finite binary16 little-endian bit patterns |

Strings and binary values rely on the one containing `value_length`; there is no duplicate length
prefix. Vectors carry dimension because it is part of logical type identity, and their containing
length must equal `4 + 4N` or `4 + 2N`. Every payload rejects trailing bytes.

## Alignment and maturity boundary

The registry assigns alignment one for byte/opaque sequences, four for int32/date/vectors, and
eight for int64/float64/decimal128/timestamp. P03-005 must place each payload at the first canonical
offset satisfying that alignment and put only minimum zero padding outside payload bytes.

Object/array tags remain container references owned by P03-005 and are not counted among the 14
completed payloads. Footer hash profile zero remains invalid until P03-006. Consequently the 41
machine payload vectors are normative payload inputs but cannot be concatenated into a canonical
value area or called complete golden HDocs.

## Decimal128 decision and proof

HDoc selects a 16-byte IEEE decimal128 binary-integer-decimal profile named
`hdoc-decimal128-bid-canonical-v1`. The logical decimal rules already remove coefficient trailing
zeros, discard declared scale/quantum, retain zero sign, and admit only three specials: positive
infinity, negative infinity, and one unsigned canonical quiet NaN.

For nonzero canonical tuple `(sign, C, e)`:

```text
shift = max(0, e - 6111)
Cwire = C * 10^shift
ewire = e - shift
E     = ewire + 6176
B     = (sign << 127) | (E << 113) | Cwire
payload = B as 16 little-endian bytes
```

The accepted coefficient is below `10^34 < 2^113`, so canonical finite values use the BID normal
form. Logical exponent up to 6144 is represented uniquely by shifting trailing zeroes into the
wire coefficient at maximum quantum exponent 6111. Zero forces logical exponent zero. The decoder
decodes, removes wire coefficient trailing zeros, reconstructs the logical tuple, re-encodes, and
requires byte equality. This rejects cohort aliases, zero-exponent aliases, steering patterns,
oversized coefficients, noncanonical special bits, signed/payload/signaling decimal NaNs, and
out-of-domain tuples.

Independent arithmetic reproduces the payloads for:

- positive/negative zero;
- one, `-12345`, and `12.34`;
- `1 × 10^-6176`;
- `(10^34 - 1) × 10^6111`;
- clamped `1 × 10^6144`;
- positive/negative infinity; and
- canonical decimal NaN.

Seven zero/special/subnormal/clamped/maximum payloads were independently compared byte-for-byte
with the official MongoDB BID corpus at pinned `mongodb/specifications` commit
`d75d82b18b6f267dc00e75103105d48980181ef1`. The exponent/coefficient/special mapping was also
reviewed against libbson at pinned `mongodb/mongo-c-driver` commit
`d9691e85a8b5f70eca91a1a94d249a5accdc785a`. HDoc intentionally differs from BSON by rejecting
alternate cohort/quantum representations and admitting only its single logical decimal NaN.

The machine registry retains these exact source snapshots and roles. The evidence verifier itself
uses no network: it independently reconstructs the canonical equations and selected official
payload constants from the source commit.

## Binary subtype and vector domains

The binary subtype byte is completely classified:

| Range | Result |
| --- | --- |
| `0x00` | Assigned generic exact octets |
| `0x01`–`0x3f` | Future standard; reject while unassigned |
| `0x40`–`0x7f` | Registered semantic extensions; require understood feature/registry |
| `0x80`–`0xef` | Experimental/private; forbidden in supported HDoc |
| `0xf0`–`0xfe` | Future control; forbidden |
| `0xff` | Permanently invalid |

All 256 values have exactly one assignment/reservation. Unknown subtype semantics affect equality,
ordering, and hashes, so a normal reader fails closed rather than preserving them as generic data.

Both vector profiles require dimension 1 through 4,096, exact length, dense ordered elements, and
finite bits. f32 exponent `0xff` and f16 exponent `0x1f` are rejected, while normal/subnormal values
and both signed zeros preserve exact bits. f16 widening during execution never retags or rewrites
stored data.

## Payload vector validation

The machine registry includes 41 positive vectors covering:

- null and both Boolean values;
- signed integer boundaries;
- float zeros, one, infinities, canonical quiet NaN, and a signaling NaN payload;
- 11 decimal zero/ordinary/boundary/clamped/special cases;
- empty/NUL/decomposed/supplementary strings;
- empty and mixed generic binary;
- timestamp/date epoch and inclusive bounds;
- RFC UUID and ObjectId bytes; and
- f32/f16 dimension prefixes with one, negative zero, and minimum subnormal element bits.

The independent validating decoder accepts all 41 with exact byte/type rules. It rejects 17
negative vectors with exact reasons:

- invalid Boolean and overlong UTF-8;
- missing/unassigned binary subtype;
- decimal cohort alias, noncanonical zero exponent, and negative NaN;
- timestamp/date values immediately outside both bounds;
- wrong UUID/ObjectId lengths; and
- zero dimension, vector length mismatch, f32 infinity, and f16 NaN.

## Source artifacts and generated authority

The exact 12-file source commit:

- adds the 637-line normative payload document and 813-line canonical JSON registry;
- links the payload format from the specification, study, documentation/format indexes, parent
  envelope, type-tag registry, and accepted ADR;
- checks the ADR's P03-004 validation/follow-up rows while leaving the implementation-plan task
  open until this evidence exists;
- regenerates the specification-bound 263-row semantic compatibility matrix and rendered document;
  and
- refreshes the deterministic fixture-generation report with both generated artifact identities.

It changes no Rust/TypeScript source, crate/package manifest, dependency, lockfile, containing
record/table bytes, hash/compression profile, complete HDoc fixture, public API, or compatibility
claim.

## Machine verification

The [verifier](verify.mjs) extracts only the immutable source commit and proves:

- exact 12-artifact diff, parent/tree identity, byte counts, and SHA-256 identities;
- canonical JSON schema, HDoc version/maturity/owner fields, and exact reconciliation with the
  noncontainer type-tag inventory;
- all 14 tag/name/type/alignment/length/encoding/validation tuples;
- portable alignment cap and exact fixed/variable/dimensioned length rules;
- one assigned plus five reserved binary-subtype classes covering 256/256 bytes without gaps or
  overlap;
- decimal precision/ranges/bias/formula/canonicalization, three specials, and eight rejection
  classes;
- both vector family/dimension/element-bit profiles and 14 governing rules;
- all 41 positive and 17 rejection-vector identities and independent decode results;
- seven pinned primary reference snapshots and the no-complete-HDoc fixture brake;
- all 35 normative headings, required semantic equations/boundaries, tables, links, and task
  ownership markers;
- specification, study, format/docs indexes, envelope, type-tag document, and ADR backlinks/state;
- the source plan's still-open P03-004 state;
- generated compatibility/report binding;
- all 169 source Markdown files and 1,219 resolving local links; and
- isolated, network-free replay of the 263-row compatibility generator.

## Negative verification

The verifier runs 67 isolated in-memory mutation canaries across:

- registry JSON/schema/version/maturity/owner and endian fields;
- every payload family, alignment, width, length equation, encoding, and validation boundary;
- payload inventory/type-tag reconciliation;
- binary subtype width, assignment, range endpoints/classes/behaviors/owners;
- decimal bias, coefficient bound, formula, zero/cohort/clamp rules, specials, and rejection
  inventory;
- vector element/exponent/dimension rules;
- governing rule identity and host-layout prohibition;
- positive/rejection vector bytes, identities, reasons, and counts;
- pinned external source identity and complete-fixture brake;
- scope, empty/null, Boolean, float-bit, decimal, subtype, temporal, UUID, vector, and P03-005
  boundary prose;
- specification, study, format/docs index, parent-envelope, type-tag, and ADR links/state;
- source plan open state; and
- generated matrix/report hashes.

Every mutation must reach its intended first rejection reason. Mutations operate only on extracted
in-memory strings and never touch the workspace.

## Broader validation

Before the source commit:

- canonical JSON, all 14 payload entries, 256/256 subtype classification, and type-tag
  reconciliation passed;
- the independent validating decoder accepted 41/41 vectors and rejected 17/17 with exact reasons;
- seven official BID corpus comparisons passed at the pinned external commit;
- the source tree contained 169 Markdown files and 1,219 resolving local links;
- the compatibility generator/checker passed with 263 rows, zero failures/skips, and seven matrix
  mutation canaries;
- `fixtures:check` passed all four generators, five authority artifacts, schemas, independent
  SplitMix64 reproduction, and deterministic subordinate checks;
- JavaScript/dependency policy passed; and
- `test:all` passed nine Rust tests, 17 semantic fixtures/313 steps/382 oracle assertions, 16
  MongoDB cases, Wasm/browser bundle checks, three declared browser tests, benchmark schema/raw
  validation, 19 benchmark rejection canaries, and all reserved-suite claim boundaries.

The evidence verifier passed under exact Node.js 22.23.1 and 24.18.0.

## Commands

```bash
node compatibility/v1/generate-matrix.mjs --check
node compatibility/v1/check-matrix.mjs
corepack npm run fixtures:check
corepack npm run policy:javascript
corepack npm run test:all
/home/alextis/.nvm/versions/node/v22.23.1/bin/node \
  evidence/phase-03/P03-004/verify.mjs \
  ef663fff9b396b649408479830e20afc7ce8a75a
/home/alextis/.nvm/versions/node/v24.18.0/bin/node \
  evidence/phase-03/P03-004/verify.mjs \
  ef663fff9b396b649408479830e20afc7ce8a75a
```

## Failures, skips, and limitations

- No final focused, fixture, policy, aggregate, or evidence-verifier check failed or skipped.
- P03-005 still owns field/array/object/container records, value-area ordering, offsets, and
  external zero padding; zero-length payloads therefore do not yet have a complete placement rule.
- P03-006 still owns CRC/hash framing and the first valid hash profile.
- P03-007 still owns deterministic bounded compression codecs and blocks.
- No complete HDoc golden fixture, persisted row, encoder, decoder, borrowed view, migration, or
  compatibility window exists yet.
- Binary subtype extensions remain unassigned until an accepted format/feature change.
- Complete Rust/TypeScript readers, malformed/property tests, fuzzing, and benchmarks remain
  P03-008–P03-021 and block G03.
- Missing/null is fixed at tag/payload identity only; P03-005 and every later physical/query layer
  remain required for complete DATA-002 proof.

## Reproduction

Check out `ef663fff9b396b649408479830e20afc7ce8a75a`, run the commands above, and compare the 12 source
identities in [manifest.json](manifest.json). The verifier extracts the source commit for all
payload and generator replay and requires no network access.

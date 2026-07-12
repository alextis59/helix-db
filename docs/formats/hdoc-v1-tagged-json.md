# HDoc Lossless Tagged JSON Profile 1

- Status: Implemented internal debug and SDK-boundary conversion profile
- Last updated: 2026-07-11
- Owner: Storage format owner and SDK owner
- Plan item: `P03-012`
- Profile identity: `helix.hdoc-tagged-json/1`
- Parent format: [HDoc 1.0](hdoc-v1.md)
- Semantic authority: [Semantic Fixture and Corpus Format](../quality/semantic-fixture-format.md)

## Purpose and boundary

This profile converts every stored HDoc logical value to a lossless JSON text and imports the same
typed representation into a detached validated document. It is intended for deterministic debug
output, developer tools, fixture comparison, and future SDK adapters that need a language-neutral
value boundary.

This is not the public command grammar, an HTTP response contract, MongoDB Extended JSON, or a
promise that every SDK exposes these wrapper objects directly. `P07-*` owns protocol framing and
`P12-*` owns language-specific SDK ergonomics. Those layers may carry this profile only after they
version and negotiate it explicitly; they must not infer types from ordinary JSON numbers or
objects.

The profile reuses the tagged logical values selected by [ADR 0011](../adr/0011-use-tagged-json-semantic-fixtures.md).
It excludes observable Missing because HDoc stores field presence structurally. A missing field is
represented by absence from an object's `fields` array, never by `{"t":"missing"}`.

## Canonical JSON output

Rendering emits compact UTF-8 JSON with no insignificant whitespace. Object metadata keys are
ordered lexicographically by Unicode code point as required by RFC 8785/JCS. The profile currently
uses ASCII metadata keys, so byte order and code-point order agree. Logical object fields remain in
their preserved presentation order; their `name` strings are not sorted or normalized.

Strings use JSON escapes for quotation mark, reverse solidus, and control characters. The renderer
uses the short escapes `\b`, `\t`, `\n`, `\f`, and `\r` where applicable and lowercase `\u00xx` for
other U+0000–U+001F characters. All other Unicode scalar values are emitted unchanged. The output
never emits a byte-order mark, invalid Unicode, a lone surrogate, nonfinite JSON number, or a
noncanonical integer token.

Canonical rendering is deterministic for the logical value, but object field presentation remains
observable. Two HDoc documents that have the same mapping identity/content hash but different
presentation ordinals therefore produce different tagged JSON text. This is intentional and keeps
debug/SDK round trips lossless.

## Exact tagged value registry

Every value is one JSON object with exactly the properties listed below. Property order shown is
canonical output order; strict import accepts any property order but rejects missing, duplicate, or
additional properties.

| Logical type | Canonical tagged JSON shape |
| --- | --- |
| null | `{"t":"null"}` |
| bool | `{"t":"bool","value":true}` |
| int32 | `{"t":"int32","value":"-1"}` |
| int64 | `{"t":"int64","value":"-1"}` |
| float64 | `{"bits":"8000000000000000","t":"float64"}` |
| decimal128 finite | `{"class":"finite","coefficient":"123","exponent":"-2","sign":"negative","t":"decimal128"}` |
| decimal128 zero | `{"class":"finite","coefficient":"0","exponent":"0","sign":"positive","t":"decimal128"}` |
| decimal128 infinity | `{"class":"infinity","sign":"positive","t":"decimal128"}` |
| decimal128 NaN | `{"class":"nan","t":"decimal128"}` |
| string | `{"t":"string","value":"text"}` |
| binary subtype 0 | `{"hex":"00ff","subtype":0,"t":"binary"}` |
| object | `{"fields":[{"name":"x","value":...}],"t":"object"}` |
| array | `{"t":"array","values":[...]}` |
| timestamp | `{"microseconds":"0","t":"timestamp"}` |
| date | `{"days":"0","t":"date"}` |
| UUID | `{"t":"uuid","value":"00000000-0000-0000-0000-000000000000"}` |
| ObjectId | `{"t":"objectId","value":"000000000000000000000000"}` |
| vector f32 | `{"bits":["3f800000"],"dimension":1,"element":"f32","t":"vector"}` |
| vector f16 | `{"bits":["3c00"],"dimension":1,"element":"f16","t":"vector"}` |

### Numeric and bit rules

- int32, int64, timestamp, date, decimal coefficient, and decimal exponent strings use canonical
  base-10 spelling: `0` or an optional minus sign followed by a nonzero digit and remaining digits.
  `-0`, leading zeroes, plus signs, whitespace, fractions, and exponent notation are rejected.
- int32/int64 and temporal values must fit the exact domains in the value and temporal contracts.
- float64 uses exactly 16 lowercase hexadecimal digits containing all IEEE-754 bits. Signed zero,
  infinities, and NaN payloads round-trip without JSON-number conversion.
- decimal128 uses the canonical HDoc tuple. Finite nonzero coefficients contain 1–34 digits, have no
  leading/trailing zero, and satisfy the decimal128 exponent/cohort domain. Zero has coefficient and
  exponent exactly `"0"`; its sign remains observable. There is one admitted NaN representation.
- vector bit strings contain exactly eight lowercase hex digits for f32 or four for f16. Dimension
  is a canonical nonnegative JSON integer token, equals `bits.length`, is 1–4096, and every element
  is finite.

### Binary and identifier rules

- Binary subtype is the JSON integer `0`, matching the only HDoc 1.0 registered binary subtype.
  `hex` has even length and lowercase hex digits.
- UUID text is exactly lowercase 8-4-4-4-12 form and maps to RFC/network-order octets.
- ObjectId text is exactly 24 lowercase hexadecimal digits.
- A root `_id` remains required and accepts only the identifier types defined by the HDoc encoder:
  int32, int64, bounded string/binary, UUID, or ObjectId.

### Container rules

An object contains an ordered `fields` array. Each field entry has exactly `name` and `value`.
Names preserve their Unicode scalar sequence, must satisfy the HDoc field grammar/limits, and must
be unique among siblings by exact code-point sequence. Arrays are dense and ordered. Stored
containers cannot contain Missing. Root `_v` and `_ts` remain protected engine fields.

## Strict import algorithm

`import_tagged_json` first enforces the expanded-input byte limit, rejects a leading U+FEFF, and
then parses the known tagged grammar directly. It does not build an unrestricted generic JSON AST.
The parser:

1. accepts only RFC JSON whitespace and one complete top-level value;
2. validates strings as Unicode scalar sequences, including paired surrogate escapes;
3. rejects duplicate JSON metadata and field-entry properties before conversion;
4. parses only registered wrapper properties and typed recursive values;
5. enforces depth, per-object field, total field, array element, and vector limits while parsing;
6. requires a top-level object tagged value;
7. validates root IDs, protected fields, duplicate logical names, temporal/vector/decimal domains;
8. computes the exact uncompressed canonical HDoc layout, including aligned tables, unique name
   pool, payloads, container descriptors, array references, and footer, before returning; and
9. returns a detached `OwnedDocument` only after every check succeeds.

The exact-layout pass prevents a small-looking tagged wrapper from bypassing
`document.canonical_bytes` through table, alignment, name, vector, binary, or container overhead.
No partial document or borrowed view escapes on failure. Import does not silently encode, persist,
insert, repair, normalize, or publish HDoc bytes.

## Rust API

`helix-doc` exposes:

```rust
pub const HDOC_TAGGED_JSON_PROFILE: &str = "helix.hdoc-tagged-json/1";
pub fn import_tagged_json(source: &str) -> Result<OwnedDocument, JsonImportError>;
```

Canonical rendering is available on `DocumentView`, `ObjectView`, `ValueView`, `OwnedDocument`,
`OwnedObject`, and `OwnedValue` through `to_canonical_tagged_json`. Borrowed views render directly
from already validated HDoc logical sections; owned values render from detached exact payloads.

The importer intentionally returns the existing owned logical representation. A future convenience
API may encode it to HDoc, but it must reuse the same encoder and cannot create a second byte
grammar or weaker validation path.

## Stable errors and redaction

| Condition | Stable code |
| --- | --- |
| End of input while a token/container is incomplete | `PAR_TRUNCATED_INPUT` |
| Invalid JSON token, delimiter, escape, or trailing bytes | `PAR_INVALID_JSON` |
| Leading BOM, lone surrogate, or invalid Unicode escape | `PAR_INVALID_UTF8` |
| Duplicate JSON metadata/field-entry property | `VAL_DUPLICATE_FIELD` |
| Unknown tag/property, wrong wrapper shape, or noncanonical typed payload | `PAR_INVALID_TYPED_VALUE` |
| Expanded JSON or HDoc portable limit exceeded | `QUOTA_LIMIT_EXCEEDED` |
| Imported logical document violates an HDoc rule | Existing encoder code such as `VAL_INVALID_SHAPE`, `TYPE_MISMATCH`, `VAL_INVALID_FIELD_NAME`, `VAL_PROTECTED_FIELD`, or `TYPE_TEMPORAL_RANGE` |

Parser diagnostics expose at most a bounded byte offset and stable code. They do not retain or print
source JSON, field names, values, binary data, credentials, or document fragments. Document-rule
errors reuse the encoder's redacted error type. The expanded-input limit is
`command.expanded_bytes = 67,108,864`; all HDoc limits remain those in `limits-v1`.

## Determinism and validation evidence

The unit suite covers all 16 stored logical tags, every decimal class, control/Unicode escaping,
property reordering, exact borrowed/owned agreement, presentation retention, malformed JSON,
Unicode, duplicate properties, noncanonical numeric/bit/identifier payloads, count/depth/size
limits, and root document rules. The semantic-critical coverage policy requires 100% product lines
and functions and at least 95% regions for this implementation on the compiler-matched LLVM tools.

P03-016 freezes immutable supported HDoc byte fixtures. `P03-017` implements an independent
TypeScript reader and proves its complete tagged logical values equal the production Rust renderer
for every positive fixture. `P03-018` now proves 512 generated documents survive canonical render,
whitespace-tolerant strict import, and owned-value equality, while its codec properties cover both
stored profiles. `P03-019` adds a pinned coverage-guided tagged render/import target under
libFuzzer AddressSanitizer plus immutable-seed browser replay. Longer campaigns can extend the
retained regression corpus without changing this profile.

## Change and compatibility rule

The profile name includes its major version. A compatible implementation may change internal
parsing/rendering algorithms only if canonical text and accepted/rejected meanings remain exact.
Adding a stored type, changing a wrapper/key, accepting a new spelling, changing string escaping,
or changing a typed domain requires a new negotiated profile plus old/new fixtures and migration
analysis. An SDK/protocol must name the profile it carries; “JSON” alone is insufficient.

## References

- [Specifications section 7](../../Specifications.md#7-data-model)
- [Study section 6](../../Study.md#6-hdoc-and-the-data-model)
- [Semantic fixture tagged values](../quality/semantic-fixture-format.md#exact-typed-value-representation)
- [HDoc type tags](hdoc-v1-type-tags.md)
- [HDoc payloads](hdoc-v1-payloads.md)
- [HDoc records](hdoc-v1-records.md)
- [Portable limits](../architecture/limits-v1.md)
- [Error semantics](../architecture/error-semantics.md)
- [ADR 0011](../adr/0011-use-tagged-json-semantic-fixtures.md)
- [ADR 0012](../adr/0012-use-bounded-little-endian-hdoc-v1.md)

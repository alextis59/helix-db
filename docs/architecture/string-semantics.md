# String, Unicode, Normalization, and Collation Semantics

- Status: Accepted semantic baseline
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-006`
- Governing requirements: `DATA-001`, `QUERY-001`, `CORE-003`
- Governing gate: `G01`
- Decision: [ADR 0004](../adr/0004-preserve-utf8-and-use-binary-collation.md)
- Normative parent: [logical value model](value-model.md)
- Unicode data version for version-sensitive v1 algorithms: [17.0.0](https://www.unicode.org/versions/Unicode17.0.0/)

This document defines valid string data, UTF-8 storage, byte preservation, normalization, equality, ordering, hashing, string-search boundaries, and the complete v1 collation scope. Field-name/path restrictions are refined separately by `P01-007` and `P01-011`; string values themselves use the rules here.

## Logical domain and canonical bytes

A `string` is a finite sequence of Unicode scalar values. Its canonical stored representation is the corresponding shortest-form UTF-8 byte sequence.

Accepted scalar values include:

- `U+0000` and other control characters;
- assigned and currently unassigned scalar values;
- Unicode noncharacters;
- combining marks, variation selectors, join controls, and bidirectional controls;
- supplementary-plane characters through `U+10FFFF`.

Rejected inputs include:

- malformed/truncated UTF-8;
- overlong UTF-8 encodings;
- UTF-8 encodings of surrogate code points `U+D800`–`U+DFFF`;
- code points above `U+10FFFF`;
- isolated UTF-16 high/low surrogates at SDK boundaries.

Noncharacters and controls are valid data even when an application should restrict them. Rejecting them at the database string layer would make binary/text round trips and future Unicode assignments unpredictable. Field names, identifiers, UI display, logs, and security-sensitive application schemas may apply stricter explicit policies.

There is exactly one valid UTF-8 byte representation for a given scalar sequence. Invalid bytes use the `binary` logical type and are never repaired, replaced with `U+FFFD`, decoded with a locale, or guessed as another character encoding during ordinary insertion.

## Input and SDK validation

Validation occurs before a mutation is accepted:

- Byte-oriented APIs validate the complete byte sequence as canonical UTF-8.
- Rust APIs accept `str`/validated owned strings; arbitrary `Vec<u8>` is binary unless explicitly validated.
- JavaScript/TypeScript APIs scan UTF-16 code units, combine valid surrogate pairs, and reject unpaired surrogates before UTF-8 encoding.
- Other UTF-16/UTF-32 SDKs reject invalid scalar values rather than substituting.
- JSON escape processing must produce valid scalar sequences; a lone `\uD800` is invalid, while a valid surrogate-pair escape is one supplementary scalar.
- Parsers consume the complete string and enforce the byte/field/document limits from `P01-011` before allocating unbounded output.

Validation error offsets are byte offsets in UTF-8 inputs and code-unit offsets in an SDK's native input, clearly labeled. Diagnostics do not echo untrusted control/bidirectional content without escaping.

## Preservation and normalization

HelixDB does not normalize strings on write, read, comparison, hashing, indexing, grouping, or replication.

For example, these are distinct native v1 strings:

```text
U+00E9                 "é"
U+0065 U+0301          "e" + COMBINING ACUTE ACCENT
```

They remain distinct even though Unicode NFC can normalize the second sequence to the first. Likewise, compatibility characters, width variants, ligatures, and case variants are not folded.

Normalization is permitted only through an explicit versioned transform that produces a new string. If normalization operators are introduced:

- They name `NFC`, `NFD`, `NFKC`, or `NFKD` explicitly.
- v1 uses Unicode Normalization data/version 17.0.0.
- The function identity includes the Unicode version, for example `NFC@17.0.0`.
- Callers choose whether to store/index the transformed result; existing values are not rewritten silently.
- A Unicode-data upgrade creates a new transform version and requires migration/differential evidence before derived indexes change.

Native binary equality never performs normalization, so its semantics do not drift when Unicode publishes a new version.

## V1 collation scope

V1 supports exactly one native collation:

```text
collation id: binary_utf8_v1
strength: exact bytes
locale: none
normalization: none
case folding: none
numeric ordering: none
alternate/ignorable handling: none
```

The collation identifier is part of normalized queries, index metadata, plan/cache keys, cursor/resume metadata where ordering matters, explain output, fixtures, and compatibility matrices.

Locale-aware, case-insensitive, accent-insensitive, natural/numeric, phonebook, canonical-equivalence, or user-defined collations are unsupported in v1. A request naming one returns a typed unsupported-collation error; the engine does not approximate it with lowercasing, normalization, host locale, or an index built under `binary_utf8_v1`.

Compatibility adapters may translate an upstream operation only when the executable matrix proves the same binary behavior. They must report other collations as different/unsupported rather than labeling binary results compatible.

## Equality

Native string equality is exact equality of canonical UTF-8 bytes. Because every valid scalar sequence has one shortest-form encoding, this is also exact scalar-sequence equality.

Consequences:

- Case, accents, normalization forms, variation selectors, zero-width characters, and embedded NULs are significant.
- String never equals binary even when binary bytes are valid UTF-8.
- Equality is reflexive, symmetric, transitive, and stable across Unicode-data upgrades.
- `$eq`, `$ne`, `$in`, grouping, distinct, unique indexes, dictionary encoding, Bloom/hash filters, and comparison hashes use the same equality.

## Binary ordering

Ascending string order compares canonical UTF-8 bytes as unsigned octets, lexicographically:

1. Compare the first differing byte.
2. The lower unsigned byte sorts first.
3. If one sequence is an exact prefix, the shorter sequence sorts first.
4. Equal bytes are equal comparison keys; stable result tie-breaking comes from `P01-017`.

For canonical valid UTF-8, unsigned byte lexicographic order is consistent with lexicographic Unicode scalar-value order. It is not linguistic order.

Examples:

```text
"" < "A" < "a" < "é" < "😀"
"e\u0301" < "é"              (different scalar/byte sequences)
"a" < "aa" < "b"
```

Descending order reverses the complete comparison key. String type rank relative to other logical types is frozen with the full type-order contract under `P01-012`.

## Hashing and canonical keys

String typed/comparison hashing uses:

```text
domain/version tag || string type tag || byte length || canonical UTF-8 bytes
```

The hash algorithm/physical byte layout is versioned later, but all implementations must feed exactly those logical bytes. A hash collision never proves equality; the bytes are compared.

Dictionary/secondary-index keys preserve full bytes or use collision-safe verified identifiers. Prefix compression, dictionary codes, and GPU hashes cannot change equality/order or make an index-only read lose the original bytes.

## Length and slicing measures

The engine distinguishes:

| Measure | Definition | V1 status |
| --- | --- | --- |
| Byte length | Canonical UTF-8 octet count | Required/internal and explicit API where exposed |
| Scalar length | Unicode scalar-value count | Required when a string-length operator is exposed |
| Grapheme-cluster length | User-perceived cluster segmentation | Unsupported in v1 unless a versioned Unicode algorithm is added |
| UTF-16 code-unit length | Host representation detail | Never native string semantics |

Substring/slice operators must name whether indexes are byte or scalar positions. V1 user-facing string slices, if introduced, use scalar indexes and reject out-of-range/invalid boundaries; storage internals may use byte ranges only at known scalar boundaries.

## Prefix, contains, and regex boundary

`$prefix` and `$contains` in native binary mode search exact canonical UTF-8 pattern bytes:

- Query patterns are themselves valid strings.
- Matching is case/normalization/locale sensitive.
- Matches correspond to whole scalar boundaries because both haystack and pattern are canonical valid UTF-8.
- Empty-pattern behavior and invalid operator forms are frozen by `P01-012`.
- Index/GPU acceleration may return collision-safe conservative candidates; final CPU verification compares bytes.

`$regex` is CPU reference behavior in v1 except separately proven prefix/contains acceleration. The later regex contract must:

- operate on Unicode scalar values, not arbitrary bytes or UTF-16 units;
- use Unicode 17.0.0 for any supported property/general-category syntax;
- remain case-sensitive without canonical equivalence unless an explicit supported flag says otherwise;
- reject unsupported syntax/flags explicitly;
- enforce compilation, input, step/backtracking, memory, and deadline bounds;
- never depend on process locale or a library's unpinned default Unicode tables.

This document does not pre-approve a regex engine or syntax beyond those invariants.

## Index, sidecar, and GPU behavior

- String secondary indexes record `binary_utf8_v1` and compare unsigned bytes.
- A query/index collation mismatch makes that index ineligible; it is not silently scanned under another order.
- Unique indexes use exact bytes, so canonically equivalent but byte-distinct strings do not conflict.
- Dictionary sidecars store exact validated strings; codes are local physical identifiers, not global semantic order unless dictionary metadata proves it.
- Zone maps use exact minimum/maximum bytes and separate missing/null metadata.
- GPU equality/prefix/contains paths use exact bytes or conservative hash/candidate filters with CPU verification.
- Hash collision, truncated prefix, unsupported scalar width, or device limitation cannot create a false negative.
- No shader performs locale collation, normalization, case folding, or regex interpretation in v1.

## Serialization, export, and logs

- HDoc/protocol/SDK/backup encodings round-trip canonical UTF-8 bytes exactly.
- JSON output uses valid escaping without changing the scalar sequence; escaping choice is presentation, decoded value is semantic.
- Exports state their encoding as UTF-8 and fail rather than replace unrepresentable data in a requested legacy encoding.
- Logs/diagnostics escape control, bidi-control, newline, and delimiter-sensitive characters and include byte/scalar lengths when useful.
- Truncation occurs only at scalar boundaries and is visibly marked; hashes/byte counts may identify the full redacted value without leaking it.

## Security considerations

Valid Unicode can still be deceptive. Native storage accepts confusables, mixed scripts, bidi controls, and invisible characters, but security-sensitive layers must not present them unsafely.

- Authentication/authorization identifiers require a separate pinned identifier policy; raw display-string equality is not assumed safe.
- Field-name restrictions and path parsing are defined under `P01-007`/`P01-011`.
- Admin UIs expose escaped/code-point inspection for suspicious names/values.
- Regex and normalization work is resource bounded.
- Collation identifiers are validated enums, not dynamic library/plugin names.
- Unicode data artifacts are hashed, licensed, versioned, and included in the dependency/SBOM process.

## Required fixtures

The semantic corpus includes:

- Empty, ASCII, embedded NUL/control, 1/2/3/4-byte scalars, max scalar, noncharacter, combining, variation selector, emoji/ZWJ, bidi control, and unassigned-code-point strings.
- Valid UTF-8 boundaries and malformed, overlong, truncated, surrogate, and out-of-range sequences.
- Valid/invalid UTF-16 surrogate cases for SDKs.
- Normalized/decomposed and compatibility/case/width variants that must remain distinct.
- Equality/order/hash/unique/group/distinct/index/range/prefix/contains cases with exact expected bytes.
- Byte versus scalar lengths and slice boundaries.
- JSON escape and HDoc/SDK/protocol/backup round trips.
- Unicode property/regex version and unsupported-collation errors.
- Dictionary/hash collision, GPU candidate, and CPU verification cases.
- Cross-host result IDs, order, exact bytes, type, error, and canonical hash agreement.

## Follow-up ownership

| Plan item | Remaining string responsibility |
| --- | --- |
| `P01-007`, `P01-011` | Field-name/path grammar and size limits |
| `P01-012` | Complete operator/regex truth tables and empty-pattern behavior |
| `P01-016` | Stable UTF-8/collation/regex error codes |
| `P01-019`–`P01-020` | Executable fixtures and reference oracle |
| `P03-*` | HDoc string tag/length/bytes and golden vectors |
| `P08-*`, `P09-*`, `P10-027` | Physical index/dictionary/sidecar/GPU candidate implementations |
| `P22-*` | Adapter collation/regex compatibility matrix |

No implementation may normalize, case-fold, replace invalid input, use process locale, update Unicode data in place, or apply approximate string equality without a superseding ADR and compatibility/index migration assessment.

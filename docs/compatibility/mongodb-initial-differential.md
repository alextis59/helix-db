# MongoDB 6.0.5 Initial Differential Result

- Status: Experimental evidence; not an adapter compatibility declaration
- Last updated: 2026-07-10
- Owner: Query and compatibility domain
- Applies to: `P01-021`, initial evidence for `EXP-013`
- Profile: `mongodb-6.0.5-initial-v1`
- Requirements: `INV-010`, `DATA-002`, `QUERY-001`, `COMPAT-001`
- Evidence source: [executable harness and complete artifacts](../../differential/mongodb/README.md)

## Result

The initial differential slice passed all 16 declared expectations against a digest-pinned MongoDB Community Server 6.0.5: 12 cases produced exact normalized results and four produced the deliberate differences already declared by the case profile. Fourteen cases used direct query forms and two used proposed adapter rewrites. Nothing failed or skipped.

This supports a narrow conclusion for `EXP-013`: a small MongoDB-like query slice is tractable when HelixDB keeps native semantics authoritative, records semantic differences, and permits explicit adapter rewrites only where their preconditions are proven. The [P01-022 v1 matrix](v1-semantic-compatibility-matrix.md) now freezes these observations while keeping every adapter row unsupported; no adapter or engine exists.

## Exact rows in this dataset

| Behavior | Cases | Boundaries |
| --- | --- | --- |
| Explicit array membership | `$all`, scalar `$elemMatch` | Immediate scalar elements in the six-document dataset only |
| Array length | `$size: 2` | Dense immediate arrays only |
| Missing/present tests | `$exists: false`, `$exists: true` | One optional top-level field |
| Explicit null rewrite | existence plus null equality | Proposed rewrite, not direct null equality |
| Numeric equality | the value 1 as int32/int64/double/Decimal128 | No ranges, overflow, NaN, infinity, or rounding claim |
| Nested scalar range | `profile.age >= 18` | One object path with present int32 leaves |
| Projection | exclude `_id` | One exclusion projection |
| Ordering | binary string ascending plus `_id` tie-break | Explicit sort only; no natural-order claim |
| String equality | decomposed `e` plus combining acute | Binary equality only |
| Scalar-array rewrite | explicit element equality | Proposed rewrite for the proven all-array subset |

## Deliberate native differences

| Behavior | HelixDB native result | MongoDB 6.0.5 result | Consequence |
| --- | --- | --- | --- |
| Scalar equality applied to an array | Whole-value comparison; no matches | Matches documents with an equal array element | A MongoDB-like adapter needs a guarded explicit-element rewrite; native semantics do not change. |
| Whole-array equality with nested arrays | Matches only a field exactly equal to the query array | Also matches a field containing that query array as an immediate nested element | Direct translation is not exact for nested arrays. |
| Direct equality to null | Matches explicit null only | Matches explicit null and missing | An adapter needs an explicit presence predicate when it intends null only. |
| Object equality with reordered fields | Field order is ignored | Field order participates in embedded-document equality | Direct document-equality translation is not exact when insertion order differs. |

These differences are first-class results, not failures to hide. A future adapter must either perform a proven rewrite, expose the difference in its matrix, or reject the shape explicitly.

## Evidence integrity

The committed report binds:

- harness 1.0.1 and the exact case source (`c848f62c41ab817c4d29fcfe64ffb9aa3f6da9973f18402e5e7470eaa0fbfcc5`);
- the semantic corpus and independent-oracle source hashes;
- MongoDB server version, Git revision, FCV, wire version, image digest/ID, and empty module set;
- MongoDB Shell 1.8.0;
- 34,775 bytes of complete upstream Extended JSON observations (`462b9c239c222dcba3f7b0371e9afccb0c556238d5197b8b196ab1183586dfc8`); and
- all normalized case hashes, IDs, counts, relations, translations, and comparison modes.

The live check recreates both generated files byte-for-byte. The offline check replays the native oracle from the case source and rejects mutated expectations, counts, observation bytes, and case order. A separate live canary changes one expected relation in memory and succeeds only when the contradiction is detected.

## Compatibility status

No MongoDB-compatible product or protocol claim is authorized by this result. In particular:

- “MongoDB compatible,” “drop-in replacement,” and wire-compatible remain prohibited;
- unlisted operators, options, data shapes, errors, commands, and server versions are untested, not implicitly supported;
- exact rows describe only their committed fixtures;
- rewrite rows are design evidence, not implemented translation rules; and
- the native HelixDB semantics remain those in the semantic corpus and ADRs.

The [P01-022 matrix](v1-semantic-compatibility-matrix.md) is the current publication authority and uses a closed-world unsupported rule. `P07-022` extends executable overlap across the implemented query engine, while `P22-*` owns adapters, protocol behavior, generated breadth, migration, and the first potentially user-facing compatibility subset.

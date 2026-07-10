# Initial MongoDB Differential Harness

- Status: Implemented experimental evidence; not a public compatibility matrix
- Last updated: 2026-07-10
- Owner: Query and compatibility domain
- Task: `P01-021`
- Requirements: `INV-010`, `DATA-002`, `QUERY-001`, `COMPAT-001`
- Experiment: `EXP-013` initial slice
- Profile: `mongodb-6.0.5-initial-v1`

## Purpose and claim boundary

This harness executes a small, declared query subset twice: once through the independent HelixDB semantic oracle and once against a pinned MongoDB Community Server. It retains the complete upstream Extended JSON rows, compares deterministic ordered results, and publishes both matches and intentional differences.

The result proves only the 16 committed cases over the six committed documents. It does not prove general MongoDB compatibility, a working MongoDB adapter, wire-protocol compatibility, production readiness, or behavior outside this exact profile. The first user-facing semantic/compatibility matrix remains `P01-022`; broader generated and protocol coverage remains `P07-022` and `P22-*`.

## Frozen profile

| Component | Frozen identity |
| --- | --- |
| Harness | `helix-mongodb-differential` 1.0.0 |
| MongoDB server | Community Server 6.0.5 |
| Server Git revision | `c9a99c120371d4d4c52cbb15dac34a36ce8d3b1d` |
| Feature compatibility version | 6.0 |
| Maximum wire version | 17 |
| Server modules | none |
| Container image | `mongo@sha256:928347070dc089a596f869a22a4204c0feace3eb03470a6a2de6814f11fb7309` |
| Container image ID | `sha256:8b33e239cde686e9378f9d8941eafa167fdf73527e9e006ab1fe9174c9622797` |
| Observation client | MongoDB Shell (`mongosh`) 1.8.0 |
| Native authority | `helix-reference-oracle/1` |
| Semantic profile | `helix-native-v1` |

The runner refuses a different image ID, digest, server version, server Git revision, feature-compatibility version, wire version, module set, or `mongosh` version. It uses `--pull=never`; a missing image is a hard failure rather than an implicit upstream change.

## Architecture

The [case source](cases-v1.json) contains canonical Extended JSON datasets, both query forms, comparison shape, requirement IDs, expected relationship, translation classification, and a reason for every row.

The two execution paths are deliberately separate:

1. [run.mjs](run.mjs) converts logical Extended JSON into the reference oracle's typed value model and calls the independent semantic command executor.
2. [mongosh-runner.js](mongosh-runner.js) inserts the Extended JSON documents into an isolated MongoDB database and executes the MongoDB query forms.
3. Every query supplies an explicit stable sort. Natural collection order is never treated as compatible behavior.
4. MongoDB rows are serialized as canonical Extended JSON and retained in [upstream-observations-v1.json](upstream-observations-v1.json).
5. Native and upstream rows or `_id` sequences are converted to the same typed model, hashed, compared, and summarized in [report-v1.json](report-v1.json).
6. Three strict Draft 2020-12 schemas validate the case source, observations, and report. Cross-artifact checks additionally recompute the native results and all report counts and hashes.

The runner never reads expected native result rows from the case file. An expectation states whether independently produced results should be exact or different; it does not provide either result.

## Initial results

The pinned run contains 16 passing cases: 12 expected exact matches and four expected deliberate differences. Fourteen cases use the same direct query shape; two exact cases demonstrate a possible adapter rewrite. No case failed or skipped.

| Case | Translation | Expected/observed | Native IDs | MongoDB IDs | Finding |
| --- | --- | --- | --- | --- | --- |
| `array.all.direct` | Direct | Exact | 1, 2, 5 | 1, 2, 5 | `$all` over the tested immediate scalar elements agrees. |
| `array.elem-match.direct` | Direct | Exact | 1, 2, 5 | 1, 2, 5 | Explicit same-element scalar equality agrees. |
| `array.scalar-equality.direct` | Direct | Different | none | 1, 2, 5 | MongoDB scalar equality implicitly examines array elements; native equality compares the whole value. |
| `array.scalar-equality.rewrite` | Adapter rewrite | Exact | 1, 2, 5 | 1, 2, 5 | Rewriting the proven all-array subset to explicit `$elemMatch` aligns these cases. |
| `array.size.direct` | Direct | Exact | 1, 2, 4 | 1, 2, 4 | Immediate dense-array length agrees. |
| `array.whole-equality.direct` | Direct | Different | 1 | 1, 4 | MongoDB also matches an immediate nested array equal to the query array. |
| `missing.exists-false.direct` | Direct | Exact | 1 | 1 | Explicit field absence agrees. |
| `missing.exists-true.direct` | Direct | Exact | 2–6 | 2–6 | Field presence, including explicit null, agrees. |
| `missing.null-equality.direct` | Direct | Different | 2 | 1, 2 | Direct MongoDB null equality includes missing; native equality does not. |
| `missing.null-equality.rewrite` | Adapter rewrite | Exact | 2 | 2 | Adding explicit existence isolates null in the tested subset. |
| `numeric.cross-width-equality.direct` | Direct | Exact | 1–4 | 1–4 | Equality of the tested numeric value across int32, int64, double, and Decimal128 agrees. |
| `object.field-order-equality.direct` | Direct | Different | 1, 2, 5 | 1, 5 | Native object equality ignores field insertion order; MongoDB document equality does not. |
| `path.nested-range.direct` | Direct | Exact | 1, 2, 5 | 1, 2, 5 | The tested nested scalar range agrees. |
| `projection.exclude-id.direct` | Direct | Exact rows | six rows | six rows | The tested `_id` exclusion returns identical ordered rows. |
| `sort.explicit-stable.direct` | Direct | Exact | 2, 4, 5, 6, 1, 3 | 2, 4, 5, 6, 1, 3 | Binary string sort with an `_id` tie-break agrees. |
| `string.binary-equality.direct` | Direct | Exact | 1, 5 | 1, 5 | Byte-preserving equality distinguishes composed and decomposed strings in this profile. |

“Exact” is local to the committed documents, query, sort, projection, and comparison mode. The rewrite rows are evidence that a translation can align this dataset; they are not an implemented or universally valid adapter rule.

## Artifacts and identities

| Artifact | Role | SHA-256 or canonical identity |
| --- | --- | --- |
| [cases-v1.json](cases-v1.json) | Versioned inputs and expectations | source `31125f8841bd1b6f3789d54608e531e88304d9dedcfcf5e71f1dd92566521235` |
| [upstream-observations-v1.json](upstream-observations-v1.json) | Complete MongoDB EJSON rows | source `31ba5e000c14a6a504dcf2b12c9cb2c5f832ab930c3af89e93f4d92574aeb693`, 34,775 bytes |
| [report-v1.json](report-v1.json) | Normalized differential result | source `e35a60c6554ff4e38a44b0dbbb724f93528ddfe1b730ad4dac331afce4f9a1a9`; canonical `01297f534627feee0256e0daf418bc7bd3f9c29aefba6dba0d8f411e02e61eca` |
| Semantic corpus manifest | Native semantic input | source `ff4088a1d791dabb8ecc6ffd885f3d08c09c55e1a08871312163d915e6b843e8` |
| Semantic oracle report | Native executable authority | source `8427fc0d3a5e3c09fc9d4c89018822898b45f94b7a9abaef659b6ba9607d8d1f` |

The case source hash is embedded in both generated artifacts. The report also binds the exact observation byte length/hash and the semantic corpus/oracle hashes.

## Reproduction

Prerequisites are Node.js, Python with `jsonschema`, Docker, `mongosh` 1.8.0, and the exact cached image. The normal check does not mutate committed artifacts:

```bash
node differential/mongodb/check-artifacts.mjs
node differential/mongodb/run.mjs --check-report
node differential/mongodb/run.mjs --canary-expected-relation
```

The first command is offline: it validates all schemas, hashes, identities, inventories, counts, complete native replay, complete upstream rows, and four mutation canaries. The second starts the pinned server and requires byte-identical generated artifacts. The third changes one expectation only in memory and passes only when the live differential detects that exact contradiction.

Regeneration is an intentional review operation:

```bash
node differential/mongodb/run.mjs --write-report
git diff -- differential/mongodb/upstream-observations-v1.json differential/mongodb/report-v1.json
```

Never accept a regenerated report based only on its zero exit code. Review changed upstream identity, row observations, case relations, counts, and source hashes.

## Container and data safety

Each live run:

- creates a uniquely named container and uniquely named `helix_p01_021_*` database;
- refuses a pre-existing container of that name;
- publishes MongoDB only to a random loopback port;
- runs as unprivileged UID/GID 999 with a read-only root filesystem;
- uses bounded `noexec,nosuid` tmpfs storage, 512 MiB memory, two CPUs, and no Linux capabilities;
- disables MongoDB's background diagnostic archive inside this disposable, space-bounded test server;
- caps each query at five seconds and the relevant host subprocesses at bounded timeouts;
- requires consecutive readiness probes, captures logs before cleanup on failure, drops the isolated database in a `finally` block, and removes the container; and
- never contacts or modifies the unrelated MongoDB service on the default port.

The stock MongoDB 6.0 image entrypoint cannot execute under Docker's `no-new-privileges` setting after switching to UID 999, so that setting is not applied. The other isolation controls above remain mandatory. This harness is a local development test, not a container-hardening certification.

## Authoritative MongoDB references

The case source records the exact archived 6.0 documentation URLs used to define the upstream expectation:

- [comparison and sort order](https://www.mongodb.com/docs/v6.0/reference/bson-type-comparison-order/);
- [`$sort`](https://www.mongodb.com/docs/v6.0/reference/operator/aggregation/sort/);
- [`$all`](https://www.mongodb.com/docs/v6.0/reference/operator/query/all/);
- [`$elemMatch`](https://www.mongodb.com/docs/v6.0/reference/operator/query/elemmatch/);
- [`$size`](https://www.mongodb.com/docs/v6.0/reference/operator/query/size/);
- [query projection](https://www.mongodb.com/docs/v6.0/tutorial/project-fields-from-query-results/);
- [array queries](https://www.mongodb.com/docs/v6.0/tutorial/query-arrays/); and
- [null and missing queries](https://www.mongodb.com/docs/v6.0/tutorial/query-for-null-fields/).

The executable observation is authoritative for this report; documentation explains why the observed behavior is expected but does not replace the run.

## Explicit limitations and follow-up

- MongoDB 6.0 is an archived upstream line. This profile stays pinned for replay; a newer server requires a new profile and side-by-side report.
- The dataset has six hand-selected documents. It is not randomized, exhaustive, or representative of workload distribution.
- Only `find` filters, projection, and explicit sort are exercised. There are no writes, update operators, aggregation pipelines, indexes, collation, regex, cursors, transactions, sessions, change streams, errors, timeouts, or wire-protocol tests.
- Numeric coverage is one finite cross-width equality value plus one double/decimal distinction elsewhere; it does not establish general MongoDB numeric compatibility.
- String coverage is binary equality and ordering only. Locale collation and normalization options are outside the profile.
- Array and object observations prove only the shown shapes. Nested traversal, compound array predicates, multikey indexes, and larger generated combinations remain open.
- The harness executes the semantic oracle, not a built HelixDB engine. Engine/backend conformance begins in `P07-*`.
- The two proposed rewrites do not define applicability checks, errors, explain output, or an adapter implementation.
- `mongosh` is version-pinned but host-installed. A future hermetic toolchain may package the client separately.
- `P01-022` must publish every exact, different, unsupported, and untested behavior before even a narrow user-facing compatibility statement is made.

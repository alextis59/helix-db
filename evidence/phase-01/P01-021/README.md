# P01-021 Initial MongoDB Differential Evidence

- Task: `P01-021` — build the initial MongoDB differential harness for the declared overlapping semantic subset
- Requirements: `INV-010`, `DATA-002`, `QUERY-001`, `COMPAT-001`
- Accepted decisions: [ADR 0002](../../../docs/adr/0002-exact-numeric-semantics.md), [ADR 0004](../../../docs/adr/0004-preserve-utf8-and-use-binary-collation.md), [ADR 0005](../../../docs/adr/0005-explicit-array-matching.md), [ADR 0010](../../../docs/adr/0010-use-id-order-as-the-native-default.md), [ADR 0011](../../../docs/adr/0011-use-tagged-json-semantic-fixtures.md)
- Commit under test: `26b0b2634f6988ed9b9ae362d7239ec6e78423bd`
- Recorded at: `2026-07-10T22:10:15Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves the committed `mongodb-6.0.5-initial-v1` differential profile, not MongoDB product or wire-protocol compatibility. The harness independently executes the same six typed source documents and 16 declared query cases through `helix-reference-oracle/1` and a pinned MongoDB Community Server 6.0.5. It retains complete canonical Extended JSON upstream rows, compares ordered typed rows or `_id` sequences, and requires every expected exact or deliberate-difference relation to pass without skips.

The profile freezes the MongoDB image digest/ID, server Git revision, feature-compatibility version, wire version, empty module set, and MongoDB Shell 1.8.0. It also binds semantic corpus manifest `ff4088…43e8`, semantic oracle report `8427fc…8d1f`, case source `31125f…1235`, upstream observations `31ba5e…b693`, and the complete normalized report.

Fourteen cases use direct translations. Two proposed rewrites demonstrate exact results only for their proven fixture preconditions: explicit element matching for scalar-on-array equality and explicit existence for null-only equality. The four direct semantic differences—scalar-on-array equality, nested whole-array equality, direct null equality, and object equality with reordered fields—remain visible first-class results.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
Git: 2.34.1
Node: v22.19.0
Python: 3.10.12
jsonschema: 4.23.0
Docker server: 29.3.1
MongoDB Shell: 1.8.0
MongoDB server: 6.0.5 / c9a99c120371d4d4c52cbb15dac34a36ce8d3b1d
MongoDB image: mongo@sha256:928347070dc089a596f869a22a4204c0feace3eb03470a6a2de6814f11fb7309
MongoDB image ID: sha256:8b33e239cde686e9378f9d8941eafa167fdf73527e9e006ab1fe9174c9622797
```

Determinism was replayed from committed bytes under `TZ=Pacific/Kiritimati, LANG=C, LC_ALL=C` and `TZ=America/Los_Angeles, LANG=tr_TR.UTF-8, LC_ALL=C`. Both produced identical normalized output, observation hash, byte length, and canonical report hash.

## Commands

```bash
git diff --check 26b0b2634f6988ed9b9ae362d7239ec6e78423bd^ 26b0b2634f6988ed9b9ae362d7239ec6e78423bd
git diff-tree --no-commit-id --name-status -r 26b0b2634f6988ed9b9ae362d7239ec6e78423bd
node --check evidence/phase-01/P01-021/verify.mjs
node evidence/phase-01/P01-021/verify.mjs 26b0b2634f6988ed9b9ae362d7239ec6e78423bd
node differential/mongodb/check-artifacts.mjs
node differential/mongodb/run.mjs --check-report
node differential/mongodb/run.mjs --canary-expected-relation
node reference/semantic-oracle/test-oracle.mjs
node reference/semantic-oracle/cli.mjs --check-report
node fixtures/semantic/generate-corpus.mjs --check
node fixtures/semantic/check-corpus.mjs
docker ps -a --filter name=helix-p01-021
```

The committed [verify.mjs](verify.mjs) resolves the supplied commit, requires its exact 20-file scope, checks formatting, strict JSON, local links, schemas, documentation markers, static safety properties, profile identities, complete case inventories, relations, hashes, and counts. It extracts the committed differential/oracle/corpus tree to a temporary directory; syntax-checks all executable files; replays the 382-assertion oracle suite, 313-step oracle report, corpus generator/integrity checks, and offline artifact checker; executes live MongoDB checks under both environment profiles; runs the live expectation canary; rejects unsafe CLI combinations; verifies no committed differential byte changed; and requires no residual container before or after execution.

## Results

- Exact implementation artifact scope: 20 files, no unrelated path.
- Differential cases: 16; 12 expected/observed exact and four expected/observed different.
- Translation classifications: 14 direct and two proposed adapter rewrites.
- Results: 16 passed, 0 failed, 0 skipped.
- Upstream observations: 16 complete case entries, 34,775 bytes.
- Draft 2020-12 validation: three strict schemas plus case, observation, and report artifacts passed.
- Offline integrity mutations: expected relation, count, observation bytes, and case order all detected.
- Live mutation: one in-memory expected relation change was isolated and detected at `array.all.direct`.
- Native baseline: 382 assertions and 313/313 corpus steps passed; zero failures/skips.
- Corpus baseline: 17 fixtures, 17 operations, 23 × 3 limit relations, and 74 error codes remained green.
- Environment profiles: two immutable live replays produced byte-identical artifacts and identical output.
- Additional hardening: six consecutive live stress replays passed after disabling ephemeral FTDC collection.
- CLI misuse: an unknown option and a canary/write combination were rejected before container execution.
- Container cleanup: zero `helix-p01-021` containers remained after every finalized replay.
- Case source SHA-256: `31125f8841bd1b6f3789d54608e531e88304d9dedcfcf5e71f1dd92566521235`.
- Upstream observation SHA-256: `31ba5e000c14a6a504dcf2b12c9cb2c5f832ab930c3af89e93f4d92574aeb693`.
- Report source SHA-256: `e35a60c6554ff4e38a44b0dbbb724f93528ddfe1b730ad4dac331afce4f9a1a9`.
- Report canonical SHA-256: `01297f534627feee0256e0daf418bc7bd3f9c29aefba6dba0d8f411e02e61eca`.

## Artifacts

| Path | SHA-256 | Bytes |
| --- | --- | ---: |
| `README.md` | `dd0534cc28aa3cd91ad36248e99a5c30d6f38ee3f4b21e0b022319979e6df79a` | 1,569 |
| `Specifications.md` | `3dee6b8012fe53a0a628203bc96a49e93c6778e8b1963c9ccc0d8fcc3ac20ae1` | 74,169 |
| `Study.md` | `072f11b90843f1253b9c64e13682659211630c7a23d10df185fd35d1f96386b0` | 61,187 |
| `differential/mongodb/README.md` | `47d5a2331771852bfa5845017931fe942169e6a216e27e0e858171b206e603d4` | 12,050 |
| `differential/mongodb/cases-v1.json` | `31125f8841bd1b6f3789d54608e531e88304d9dedcfcf5e71f1dd92566521235` | 13,825 |
| `differential/mongodb/check-artifacts.mjs` | `7d01f177a8015a407ad92186a61f7d57cdebf31c73b0a8e7c01c91bbee04d753` | 10,031 |
| `differential/mongodb/ejson.mjs` | `4c5cf92fd1c6a69f7cc5160dc627d21c09224293042abca9067ca418b8b53a99` | 2,983 |
| `differential/mongodb/mongosh-runner.js` | `1696ff51f2b9d575aa502847a78cfb2cf3fda4d3537cf88275bd4cba139b319e` | 2,781 |
| `differential/mongodb/report-v1.json` | `e35a60c6554ff4e38a44b0dbbb724f93528ddfe1b730ad4dac331afce4f9a1a9` | 11,604 |
| `differential/mongodb/run.mjs` | `a578d99a4f369872e69e4e8513d14ea1fa2ba6305253cf3f37b2b0a84c2cd4f8` | 18,591 |
| `differential/mongodb/schema/cases-v1.schema.json` | `f56a952082a7e564bb176cc3f3b598be1be9c36d6e9b53888a44edbbef9352d7` | 4,454 |
| `differential/mongodb/schema/observations-v1.schema.json` | `d6a220fa09c642f9e6ffbb26f444d33c9ea9989510960dd6c9bb968a43224a5e` | 2,299 |
| `differential/mongodb/schema/report-v1.schema.json` | `444a79c63c628215ed555235a0ddfa41e53b1ac2f41ac636af13a4ca501c4956` | 5,544 |
| `differential/mongodb/upstream-observations-v1.json` | `31ba5e000c14a6a504dcf2b12c9cb2c5f832ab930c3af89e93f4d92574aeb693` | 34,775 |
| `docs/README.md` | `7b7349e0a33e27ca0b9a07e471d352e7646fa48dd5aa82ff1beee84bc5668079` | 6,061 |
| `docs/adr/0002-exact-numeric-semantics.md` | `e5299bd972b81a574f523c81b8dd8a74deb17ca7a8bb7a02215ead7cde99d0ef` | 9,083 |
| `docs/adr/0005-explicit-array-matching.md` | `1d37e610710ac919fbad84e6b26b4a244fbf0d2743e0d3651f07b352a7782ba3` | 7,439 |
| `docs/compatibility/mongodb-initial-differential.md` | `721a27073e60cf72d41c8d5e28947b5464a8ef088b212a770acaaef9987b5bbd` | 5,200 |
| `docs/governance/requirements.md` | `d010e8316aad8e628c097d703edaa5973aab2beb35421b9e5b178fb1693e3cd0` | 13,936 |
| `fixtures/semantic/COVERAGE.md` | `57d7c2415aeae9ad8b9ed23367acff7b36c1b873a20bc6d8365ab7a1751a684b` | 8,335 |
| `evidence/phase-01/P01-021/verify.mjs` | `1784b6205a8ab2445a99e4a2125115c34254ee59e618ceb35dc5d6818a34472f` | 17,134 |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- Early hardening attempts used Docker `no-new-privileges` with the stock image entrypoint and unprivileged UID 999. The entrypoint could not execute under that combination, so the finalized profile uses a read-only root filesystem, unprivileged UID/GID, capability drop, bounded tmpfs, memory/CPU limits, and loopback-only publication without that incompatible option.
- The first exploratory whole-array case assumed a direct exact match. Real MongoDB also matched a document whose outer array contained the query array as an immediate nested element. The case was corrected to a deliberate difference before the artifact commit.
- An early replay observed a connection refusal after one successful readiness ping. Consecutive readiness probes and retained-on-failure container logs exposed the root cause during immutable verification: MongoDB 6.0.5 FTDC could fail writing its archive on the intentionally small ephemeral tmpfs and terminate the process. The finalized server disables background diagnostic collection, passed six consecutive stress replays, and retains explicit query/process timeouts. Database query observations did not change.
- No finalized required check failed, and no case or semantic step was skipped.
- The six-document, query-only limitations and prohibited compatibility claims are detailed in the [harness documentation](../../../differential/mongodb/README.md) and [result document](../../../docs/compatibility/mongodb-initial-differential.md).
- This executes the independent semantic oracle, not a HelixDB engine or adapter. Engine, generated-query, protocol, error, index, migration, and user-facing matrix work remains assigned to `P01-022`, `P07-022`, and `P22-*`.
- MongoDB 6.0 is archived. A newer upstream requires a new profile; this evidence must not be silently regenerated against another server or client.
- The local unauthenticated server exists only on a random loopback port for the bounded test lifetime. This is not a production container or hardening certification.

## Review

Focused review checked native/upstream independence, Extended JSON conversion, exact numeric widths, Missing/null behavior, object/array boundaries, explicit ordering, projection rows, source/corpus/oracle hash binding, server/image/client identity, schema strictness, complete observation retention, result/count reconciliation, mutation sensitivity, container name/database isolation, loopback publication, unprivileged/read-only/capability/resource controls, startup stability, subprocess/query timeouts, cleanup, compatibility-claim language, and later-phase ownership. No blocking finding remained in the committed artifact.

## Reproduction

From a repository revision containing this evidence directory, verify that commit `26b0b2634f6988ed9b9ae362d7239ec6e78423bd` exists and run the verifier command above from the repository root. The exact Docker image and `mongosh` 1.8.0 must already be available. The verifier reconstructs the committed implementation in a temporary directory and prints the same pass markers and 20 artifact hashes/sizes recorded here and in [manifest.json](manifest.json).

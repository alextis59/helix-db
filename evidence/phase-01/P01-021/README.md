# P01-021 Initial MongoDB Differential Evidence

- Task: `P01-021` — build the initial MongoDB differential harness for the declared overlapping semantic subset
- Requirements: `INV-010`, `DATA-002`, `QUERY-001`, `COMPAT-001`
- Accepted decisions: [ADR 0002](../../../docs/adr/0002-exact-numeric-semantics.md), [ADR 0004](../../../docs/adr/0004-preserve-utf8-and-use-binary-collation.md), [ADR 0005](../../../docs/adr/0005-explicit-array-matching.md), [ADR 0010](../../../docs/adr/0010-use-id-order-as-the-native-default.md), [ADR 0011](../../../docs/adr/0011-use-tagged-json-semantic-fixtures.md)
- Initial artifact commit: `26b0b2634f6988ed9b9ae362d7239ec6e78423bd`
- Storage-stabilization commit under test: `e68d50ad398c16b44227ed3bfcb297af8456cf05`
- Superseded evidence commit: `b7c62f0b5a28b7f6fda05b696b4a235827a113f1`
- Recorded at: `2026-07-10T22:18:30Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves the committed `mongodb-6.0.5-initial-v1` differential profile using harness 1.0.1, not MongoDB product or wire-protocol compatibility. The harness independently executes the same six typed source documents and 16 declared query cases through `helix-reference-oracle/1` and a pinned MongoDB Community Server 6.0.5. It retains complete canonical Extended JSON upstream rows, compares ordered typed rows or `_id` sequences, and requires every expected exact or deliberate-difference relation to pass without skips.

The profile freezes the MongoDB image digest/ID, server Git revision, feature-compatibility version, wire version, empty module set, and MongoDB Shell 1.8.0. It also binds semantic corpus manifest `ff4088…43e8`, semantic oracle report `8427fc…8d1f`, case source `c848f6…fcc5`, upstream observations `462b9c…dfc8`, and the complete normalized report.

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
git diff --check e68d50ad398c16b44227ed3bfcb297af8456cf05^ e68d50ad398c16b44227ed3bfcb297af8456cf05
git diff-tree --no-commit-id --name-status -r e68d50ad398c16b44227ed3bfcb297af8456cf05
node --check evidence/phase-01/P01-021/verify.mjs
node evidence/phase-01/P01-021/verify.mjs e68d50ad398c16b44227ed3bfcb297af8456cf05
node differential/mongodb/check-artifacts.mjs
node differential/mongodb/run.mjs --check-report
node differential/mongodb/run.mjs --canary-expected-relation
for attempt in {1..10}; do node differential/mongodb/run.mjs --check-report; done
for attempt in {11..20}; do if (( attempt % 2 == 0 )); then env TZ=Pacific/Kiritimati LANG=C LC_ALL=C node differential/mongodb/run.mjs --check-report; else env TZ=America/Los_Angeles LANG=tr_TR.UTF-8 LC_ALL=C node differential/mongodb/run.mjs --check-report; fi; done
node reference/semantic-oracle/test-oracle.mjs
node reference/semantic-oracle/cli.mjs --check-report
node fixtures/semantic/generate-corpus.mjs --check
node fixtures/semantic/check-corpus.mjs
docker ps -a --filter name=helix-p01-021
```

The committed [verify.mjs](verify.mjs) resolves the supplied commit, requires the exact initial 20-file scope and exact eight-file stabilization scope, checks formatting, strict JSON, local links, schemas, documentation markers, static safety/resource properties, profile identities, complete case inventories, relations, hashes, and counts. It extracts the committed differential/oracle/corpus tree to a temporary directory; syntax-checks all executable files; replays the 382-assertion oracle suite, 313-step oracle report, corpus generator/integrity checks, and offline artifact checker; executes live MongoDB checks under both environment profiles; runs the live expectation canary; rejects unsafe CLI combinations; verifies no committed differential byte changed; and requires no residual container before or after execution.

## Results

- Exact implementation scopes: 20 initial artifact files and eight storage-stabilization files, with no unrelated path in either commit.
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
- Additional hardening: 20 consecutive harness 1.0.1 live stress replays passed; 10 used alternating timezone/locale extremes.
- CLI misuse: an unknown option and a canary/write combination were rejected before container execution.
- Container cleanup: zero `helix-p01-021` containers remained after every finalized replay.
- Case source SHA-256: `c848f62c41ab817c4d29fcfe64ffb9aa3f6da9973f18402e5e7470eaa0fbfcc5`.
- Upstream observation SHA-256: `462b9c239c222dcba3f7b0371e9afccb0c556238d5197b8b196ab1183586dfc8`.
- Report source SHA-256: `6a04b5d3cf93662ed9727de9dd5753d646acff12b914b785f6604cd61ef5b019`.
- Report canonical SHA-256: `22173d344e6b894444b53f2ff158b7d1cf6cf6c2a0c916deff58e1b2ad1ed8e5`.

## Artifacts

| Path | SHA-256 | Bytes |
| --- | --- | ---: |
| `README.md` | `dd0534cc28aa3cd91ad36248e99a5c30d6f38ee3f4b21e0b022319979e6df79a` | 1,569 |
| `Specifications.md` | `3dee6b8012fe53a0a628203bc96a49e93c6778e8b1963c9ccc0d8fcc3ac20ae1` | 74,169 |
| `Study.md` | `072f11b90843f1253b9c64e13682659211630c7a23d10df185fd35d1f96386b0` | 61,187 |
| `differential/mongodb/README.md` | `faf15ff8dcc8b95b92d296fd600fb2db7da1ed4e1db8fe04476222f1f0db7914` | 12,171 |
| `differential/mongodb/cases-v1.json` | `c848f62c41ab817c4d29fcfe64ffb9aa3f6da9973f18402e5e7470eaa0fbfcc5` | 13,825 |
| `differential/mongodb/check-artifacts.mjs` | `7d01f177a8015a407ad92186a61f7d57cdebf31c73b0a8e7c01c91bbee04d753` | 10,031 |
| `differential/mongodb/ejson.mjs` | `4c5cf92fd1c6a69f7cc5160dc627d21c09224293042abca9067ca418b8b53a99` | 2,983 |
| `differential/mongodb/mongosh-runner.js` | `1696ff51f2b9d575aa502847a78cfb2cf3fda4d3537cf88275bd4cba139b319e` | 2,781 |
| `differential/mongodb/report-v1.json` | `6a04b5d3cf93662ed9727de9dd5753d646acff12b914b785f6604cd61ef5b019` | 11,604 |
| `differential/mongodb/run.mjs` | `28a91ffb1c7e67165250c2a5cf5c51ba660b3cf467de54dfe2f6db183e4dc4f0` | 18,643 |
| `differential/mongodb/schema/cases-v1.schema.json` | `f7c179e8dcbeb5df2c6ea5b252501f3d072a74a66216de9c8aa45ed988ce0d0f` | 4,454 |
| `differential/mongodb/schema/observations-v1.schema.json` | `d6a220fa09c642f9e6ffbb26f444d33c9ea9989510960dd6c9bb968a43224a5e` | 2,299 |
| `differential/mongodb/schema/report-v1.schema.json` | `247e1799b12f4b514aea6a0d0be9f48c80de540e6919bbc9fc76f940c2239432` | 5,544 |
| `differential/mongodb/upstream-observations-v1.json` | `462b9c239c222dcba3f7b0371e9afccb0c556238d5197b8b196ab1183586dfc8` | 34,775 |
| `docs/README.md` | `7b7349e0a33e27ca0b9a07e471d352e7646fa48dd5aa82ff1beee84bc5668079` | 6,061 |
| `docs/adr/0002-exact-numeric-semantics.md` | `e5299bd972b81a574f523c81b8dd8a74deb17ca7a8bb7a02215ead7cde99d0ef` | 9,083 |
| `docs/adr/0005-explicit-array-matching.md` | `1d37e610710ac919fbad84e6b26b4a244fbf0d2743e0d3651f07b352a7782ba3` | 7,439 |
| `docs/compatibility/mongodb-initial-differential.md` | `3aa7215005eb2b68cbb610b2615646c83e44cc2f7934b5b3f2c8ff84a00dd894` | 5,218 |
| `docs/governance/requirements.md` | `d010e8316aad8e628c097d703edaa5973aab2beb35421b9e5b178fb1693e3cd0` | 13,936 |
| `fixtures/semantic/COVERAGE.md` | `57d7c2415aeae9ad8b9ed23367acff7b36c1b873a20bc6d8365ab7a1751a684b` | 8,335 |
| `evidence/phase-01/P01-021/verify.mjs` | `51932907eff1cd1518f5ec307c43f499513c8704d347ded32b9ca5103b5e0ee0` | 18,283 |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- Early hardening attempts used Docker `no-new-privileges` with the stock image entrypoint and unprivileged UID 999. The entrypoint could not execute under that combination, so the finalized profile uses a read-only root filesystem, unprivileged UID/GID, capability drop, bounded tmpfs, memory/CPU limits, and loopback-only publication without that incompatible option.
- The first exploratory whole-array case assumed a direct exact match. Real MongoDB also matched a document whose outer array contained the query array as an immediate nested element. The case was corrected to a deliberate difference before the artifact commit.
- A pre-freeze replay observed a connection refusal after one successful readiness ping. Consecutive readiness probes and retained-on-failure logs exposed an FTDC archive-write termination, so the initial artifact disabled background diagnostic collection and added explicit query/process timeouts.
- The first committed evidence (`b7c62f0`) was invalidated immediately by its post-commit replay: WiredTiger filled the remaining 256 MiB data tmpfs while creating the test collection even with FTDC disabled. The exact failure and disposition are preserved in the [failed-attempt record](attempts/2026-07-10-storage-bounds-failure.md). Harness 1.0.1 uses a 512 MiB data tmpfs, 1 GiB memory limit, pinned 0.25 GiB cache, and no journal for this query-only test.
- No finalized required check failed, and no case or semantic step was skipped.
- The six-document, query-only limitations and prohibited compatibility claims are detailed in the [harness documentation](../../../differential/mongodb/README.md) and [result document](../../../docs/compatibility/mongodb-initial-differential.md).
- This executes the independent semantic oracle, not a HelixDB engine or adapter. Engine, generated-query, protocol, error, index, migration, and user-facing matrix work remains assigned to `P01-022`, `P07-022`, and `P22-*`.
- MongoDB 6.0 is archived. A newer upstream requires a new profile; this evidence must not be silently regenerated against another server or client.
- The local unauthenticated server exists only on a random loopback port for the bounded test lifetime. This is not a production container or hardening certification.

## Review

Focused review checked native/upstream independence, Extended JSON conversion, exact numeric widths, Missing/null behavior, object/array boundaries, explicit ordering, projection rows, source/corpus/oracle hash binding, server/image/client identity, schema strictness, complete observation retention, result/count reconciliation, mutation sensitivity, container name/database isolation, loopback publication, unprivileged/read-only/capability/resource controls, startup stability, subprocess/query timeouts, cleanup, compatibility-claim language, and later-phase ownership. No blocking finding remained in the committed artifact.

## Reproduction

From a repository revision containing this evidence directory, verify that commits `26b0b2634f6988ed9b9ae362d7239ec6e78423bd` and `e68d50ad398c16b44227ed3bfcb297af8456cf05` exist and run the verifier command above from the repository root. The exact Docker image and `mongosh` 1.8.0 must already be available. The verifier reconstructs the stabilized committed implementation in a temporary directory and prints the same pass markers and 20 final artifact hashes/sizes recorded here and in [manifest.json](manifest.json).

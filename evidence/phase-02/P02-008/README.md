# P02-008 Deterministic Fixture Generation Evidence

- Task: `P02-008` — establish deterministic fixture generation with committed seeds and artifact schemas
- Requirements supported: `INV-004`, `INV-007`, `INV-010`, `CORE-003`, `QUAL-001`, `COMPAT-001`
- Commit under test: `8a415657e15fd450b109adc6ad6565124a24b2ff`
- Recorded at: `2026-07-11T00:57:06Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G02` gate review
- Verdict: Pass

## Scope

This step makes fixture generation a versioned, independently checked contract:

- `helix.fixture-generator-registry/1` records four active generators, exact check/write commands, five authority artifacts, schemas, randomness modes, versions, and owner tasks;
- one registry-unique 64-bit seed (`0x48454c4958444231`) drives a frozen 16-word `helix.splitmix64-fixed-gamma/1` vector;
- JavaScript generates the vector while an independent Python implementation recomputes every word;
- strict Draft 2020-12 schemas reject unknown registry, vector, and aggregate-report fields;
- the timestamp-free aggregate report binds raw registry/artifact byte counts and SHA-256 hashes; and
- the existing semantic corpus, oracle report, and compatibility matrix generators plus independent checkers run beneath one read-only command.

The normative seed, artifact, external-evidence, and activation rules are in the [deterministic fixture generation policy](../../../docs/quality/deterministic-fixture-generation.md).

## Deterministic results

| Property | Verified result |
| --- | --- |
| Registered generators | 4 active |
| Registered authority artifacts | 5 |
| Committed seeds | 1 unique 64-bit seed |
| Portable PRNG vector | 16 unique unsigned 64-bit words |
| New strict schemas | Registry, PRNG vector, aggregate report |
| Existing schema-bound authorities | Semantic corpus manifest, oracle report, compatibility matrix |
| Semantic replay | 17 fixtures, 313 steps |
| Oracle replay | 382 assertions, 313/313 corpus steps |
| Compatibility replay | 263 native rows, 16 pinned MongoDB observation cases |
| Biome inventory | 39 active code/configuration files |
| Supported Node lanes | 22.23.1 and 24.18.0 |

An isolated clean checkout deletes the vector, report, and vector directory, then runs write mode. The generator recreates only the declared parents and produces the committed hashes. A second write under `TZ=Pacific/Kiritimati, LANG=C` and a third check under `TZ=America/Adak, LANG=C.UTF-8` remain byte-identical:

- vector SHA-256: `15f0859962651223d64eb641e2c919022ad7a18d9afcf94280b1dab2920946cd`;
- report SHA-256: `e3cdbb6dc2cc44eab2a17fae3fbc3a68e676282ea5d8f0397ea27a5c4dd64bb5`.

The aggregate intentionally excludes live MongoDB observations, fuzz discoveries, benchmarks, crash histories, distributed histories, and security findings. Those artifacts preserve real environment/provenance data instead of being mislabeled deterministic generation.

## Negative verification

The clean-room verifier applies eight independent mutations and requires each one to fail:

1. change the committed seed without regenerating artifacts;
2. change one generated vector word;
3. change a report artifact hash;
4. replace a registered check mode with write mode;
5. assign the same seed to a second generator;
6. loosen a schema's unknown-field rejection;
7. introduce ambient `Math.random` use in the generator; and
8. change raw bytes of the hash-bound semantic manifest.

Every file is restored after its canary, and the clean checkout must end with no tracked or untracked source drift.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
rustc: 1.96.1 (31fca3adb 2026-06-26)
cargo: 1.96.1 (356927216 2026-06-26)
active Node.js: v22.19.0
Corepack: 0.34.0
npm through Corepack: 11.18.0
Python: 3.10.12
jsonschema: 4.23.0
JavaScript validation lanes: Node 22.23.1 and 24.18.0
```

## Commands

```bash
corepack npm run fixtures:check
corepack npm run fixtures:generate
node fixtures/generation/generate.mjs --check
corepack npm run policy:javascript
corepack npm run policy:dependencies
corepack npm run toolchain:types
corepack npm test
cargo fmt --all -- --check
cargo check --frozen --workspace --all-targets --all-features
cargo clippy --frozen --workspace --all-targets --all-features -- -D warnings
RUSTDOCFLAGS="-D warnings" cargo doc --frozen --workspace --no-deps --all-features
node evidence/phase-02/P02-008/verify.mjs 8a415657e15fd450b109adc6ad6565124a24b2ff
```

## Retained diagnostic attempts

1. The first isolated `--write` exited 1 with `ENOENT` because the declared vector parent did not yet exist. Write mode now creates only each already-validated artifact parent; check mode remains read-only and still rejects a missing output.
2. After the six generation JSON files were deliberately added to Biome's strict scope, the first policy pass exited 1 on two schema line-wrap differences. Biome applied only those mechanical formatting changes; all 39 active files then passed.
3. The first sealed evidence replay exited 1 before clean-room execution because its policy marker expected the phrase `Live upstream observations` while the committed policy says `The pinned MongoDB observations`. The verifier now checks the exact source wording; no source or generation behavior changed.

These attempts changed no accepted semantic or compatibility artifact and are retained so a green report does not hide generation-bootstrap failures.

## Limitations

This step does not claim that the seeded vector is cryptographically secure or statistically suitable, that current fixtures are complete, or that deterministic generation replaces independent semantic validation. It does not make external observations deterministic, add fuzz corpora, generate benchmark datasets, provide cross-language database bindings, configure CI, or close `G02`.

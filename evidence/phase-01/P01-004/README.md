# P01-004 Floating Special Semantics Evidence

- Task: `P01-004` — define floating-point specials, equality, ordering, hashing, aggregation, and CPU/GPU tolerance
- Requirements: `QUERY-001`, `CORE-003`, `INV-002`, `GPU-002`
- Commit under test: `2f2627d8130342ee8caae020e35d7ba7051eaf89`
- Accepted decision: [ADR 0002](../../../docs/adr/0002-exact-numeric-semantics.md)
- Recorded at: `2026-07-10T17:38:37Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the accepted numeric decision now covers admitted binary64/decimal128 specials, bit/canonical identity, database equality, total order, both hash purposes, arithmetic results, serialization, indexes, uniqueness, deterministic aggregation, and exact CPU/GPU authority with a non-semantic diagnostic envelope.

It does not prove executable arithmetic, decimal codecs, reduction, index, or GPU behavior. Those use the required fixture matrix in later tasks.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
Git: 2.34.1
Node: v22.19.0
```

## Commands

```bash
git status --porcelain=v1
git diff --check 2f2627d^ 2f2627d
git diff-tree --no-commit-id --name-status -r 2f2627d
git show 2f2627d:docs/architecture/floating-special-semantics.md | sha256sum
git show 2f2627d:docs/architecture/numeric-semantics.md | sha256sum
git show 2f2627d:docs/adr/0002-exact-numeric-semantics.md | sha256sum
git show 2f2627d:Specifications.md | sha256sum
git show 2f2627d:docs/adr/README.md | sha256sum
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","2f2627d:docs/architecture/floating-special-semantics.md"],{encoding:"utf8"}),required=["Binary64 (`float64`)","Decimal128 (`decimal128`)","Database numeric equality","Total numeric order","typed_value_hash","numeric_comparison_hash","Binary64 arithmetic","Decimal128 arithmetic with specials","Aggregation and deterministic reduction","1,024","CPU/GPU exactness and tolerance","0 ULP","4 ULP","Required fixtures","0x7ff8_0000_0000_0000"];for(const x of required)if(!s.includes(x))throw Error("missing coverage: "+x);console.log("PASS: 15/15 special-value coverage markers")'
node -e 'const b=new ArrayBuffer(8),v=new DataView(b);v.setBigUint64(0,0x7ff8000000000000n,false);if(!Number.isNaN(v.getFloat64(0,false)))throw Error("canonical NaN bits");if(Object.is(-0,0))throw Error("zero sign unavailable");if(-Infinity>=-Number.MAX_VALUE||Infinity<=Number.MAX_VALUE)throw Error("infinity order");console.log("PASS: canonical NaN class, signed-zero identity, infinity bounds")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/numeric-semantics.md","docs/architecture/floating-special-semantics.md","docs/adr/0002-exact-numeric-semantics.md","docs/adr/README.md"];for(const f of files){const s=cp.execFileSync("git",["show","2f2627d:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- Special-value semantic coverage markers: 15 of 15 present.
- The chosen `0x7ff8000000000000` canonical bits decode as binary64 NaN.
- Runtime checks confirm signed zero has distinct payload identity and infinities bound finite binary64 values.
- ADR 0002 now requires both `P01-003` and `P01-004`, and its accepted decision/index link the special-value contract.
- Authoritative predicates, keys, mutations, and aggregates require exact results; 4 ULP is diagnostic-only and cannot affect database truth.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/floating-special-semantics.md` | `54e15ec61b4e2eb8d9e00040bdf6e7b2cf4757f7710f9b1a4b7c675c404f07e3` | 15,493 | Normative special-value/tolerance contract |
| `docs/architecture/numeric-semantics.md` | `c76b2a0405904a68f2e586520f54e3a155e6297c4803e3d716204ec7e0dd5fd9` | 12,901 | Parent numeric contract link |
| `docs/adr/0002-exact-numeric-semantics.md` | `bb1dbb23b4d7f8217e908185e81dcd97c5b8c7a569a3794143440e84cee78161` | 9,075 | Extended accepted numeric decision |
| `Specifications.md` | `0afb4f85cff95d339394cc9773c66106782a146876a4f10003952244b7d515c6` | 63,804 | Normative refinement links |
| `docs/adr/README.md` | `611a87ab45681a4bd68337ed4846ceae94bb5e3aaa3bbdef8981b53d4ef1d05c` | 2,781 | Updated ADR index |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no requested `P01-004` subject was skipped.
- Executable float payload, decimal, index, reduction, and backend proof remains pending under the linked tasks and gates.
- Vector tolerance is intentionally owned by `P01-010`, not generalized from scalar binary64.
- Independent semantic review remains required for `G01`.

## Review

Focused review checked NaN reflexivity, zero equality versus identity, infinity order, hash/equality consistency, unique-index implications, deterministic reduction independent of scheduling, and that tolerance never changes membership or public values. No blocking finding remained.

## Reproduction

Check out `2f2627d8130342ee8caae020e35d7ba7051eaf89`, run the commands above from the repository root, and compare all five hashes with this file and [manifest.json](manifest.json).

# P01-007 Object and Duplicate-Key Semantics Evidence

- Task: `P01-007` — define object field order, canonical hashing, duplicate rejection, and import-only duplicate behavior
- Requirements: `DATA-001`, `QUERY-001`
- Commit under test: `c1238a280d7f23291b9728aa5c628aa6de39a042`
- Recorded at: `2026-07-10T18:33:33Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the accepted object contract separates presentation/canonical/result order, defines recursive order-independent mapping equality and two canonical hash purposes, rejects decoded duplicate names atomically on every normal path, and confines legacy duplicate preservation/resolution to a non-queryable import quarantine.

It does not prove HDoc, parsers, query/update execution, import tooling, or cross-host hash implementations; later tasks consume the required fixture matrix.

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
git diff --check c1238a2^ c1238a2
git diff-tree --no-commit-id --name-status -r c1238a2
git show c1238a2:docs/architecture/object-semantics.md | sha256sum
git show c1238a2:Specifications.md | sha256sum
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","c1238a2:docs/architecture/object-semantics.md"],{encoding:"utf8"}),required=["Object model","presentation_order","Three orders","Presentation order","Canonical field order","Equality and comparison","Compatibility boundary","Canonical hashes","Canonical typed content hash","Semantic comparison hash","Duplicate definition","Normal-write duplicate rejection","Import-only duplicate preservation","keep_first","keep_last","Field-name boundary","Projection and update ordering","Required fixtures"];for(const x of required)if(!s.includes(x))throw Error("missing coverage: "+x);console.log("PASS: 18/18 object coverage markers")'
node -e 'const enc=new TextEncoder(),cmp=(a,b)=>{a=enc.encode(a);b=enc.encode(b);for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];return a.length-b.length},canon=o=>Object.entries(o).sort(([a],[b])=>cmp(a,b)).map(([k,v])=>[k,v]);const x={a:1,b:2},y={b:2,a:1};if(JSON.stringify(canon(x))!==JSON.stringify(canon(y)))throw Error("order-dependent canonical mapping");const decoded=["a","\\u0061"].map(x=>JSON.parse("\""+x+"\""));if(decoded[0]!==decoded[1]||new Set(decoded).size!==1)throw Error("escape duplicate");const composed=["é","e\u0301"];if(new Set(composed).size!==2)throw Error("normalization collapse");console.log("PASS: order-independent canonical mapping and decoded duplicate examples")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/object-semantics.md"];for(const f of files){const s=cp.execFileSync("git",["show","c1238a2:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- Object semantic coverage markers: 18 of 18 present.
- Canonical entry sorting produced identical content for different presentation orders.
- Decoded `"a"` and `"\u0061"` names collide as required, while composed/decomposed names remain distinct.
- The contract defines exact recursive hash inputs and collision confirmation.
- Normal writes never choose first/last implicitly; quarantine resolution has explicit `reject`, `keep_first`, and `keep_last` reports.
- The official MongoDB embedded-document equality difference is linked at the compatibility boundary.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/object-semantics.md` | `6ddcdfa9390b8c135d9fce233ac5ed82355ca89c0ca27a0ec1f49417c8bacdd7` | 13,910 | Normative object/duplicate-key contract |
| `Specifications.md` | `5e808d9f4243f46c45960b3a0ee7d8fb680506efa6e650a5fe5927da53d55a5f` | 64,962 | Normative refinement link |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no requested `P01-007` subject was skipped.
- The small JavaScript check validates documented examples, not a future token-preserving decoder.
- Executable HDoc/parser/update/import/hash proof remains pending under the named tasks/gates.
- Independent object-semantic review remains required for `G01`.

## Review

Focused review checked equality/hash consistency, field-name byte order, presentation stability, JSON escape duplicates, host-map loss hazards, atomic rejection, quarantine isolation, deterministic lossy policy, and the MongoDB adapter difference. No blocking finding remained.

## Reproduction

Check out `c1238a280d7f23291b9728aa5c628aa6de39a042`, run the commands above from the repository root, and compare both hashes with this file and [manifest.json](manifest.json).

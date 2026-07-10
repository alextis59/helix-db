# P01-008 Array Semantics Evidence

- Task: `P01-008` — define array equality, ordering, traversal, `$all`, `$size`, `$elemMatch`, and nested arrays
- Requirements: `DATA-001`, `DATA-002`, `QUERY-001`
- Commit under test: `7914c4b05e893cdf52425cade1e7536f13f532dd`
- Accepted decision: [ADR 0005](../../../docs/adr/0005-explicit-array-matching.md)
- Recorded at: `2026-07-10T18:43:29Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the accepted array contract defines dense ordered values, recursive equality/order/hashes, provenance-aware dotted traversal, numeric index selection, candidate reduction, `$all`, `$size`, value/object `$elemMatch`, nested-array boundaries, compatibility differences, and physical obligations.

It does not prove the production reference interpreter, query parser, HDoc, multikey indexes, sidecars, updates, aggregation, or GPU execution. Later tasks implement the required fixture matrix.

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
git diff --check 7914c4b^ 7914c4b
git diff-tree --no-commit-id --name-status -r 7914c4b
git show 7914c4b:docs/architecture/array-semantics.md | sha256sum
git show 7914c4b:docs/adr/0005-explicit-array-matching.md | sha256sum
git show 7914c4b:Specifications.md | sha256sum
git show 7914c4b:docs/adr/README.md | sha256sum
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","7914c4b:docs/architecture/array-semantics.md"],{encoding:"utf8"}),required=["Logical array model","Equality","Ordering","Canonical hashes","Path-result model","array_position_vector","Dotted-path traversal","canonical numeric segment","Predicate reduction over candidates","`$all`","vacuously true","`$size`","`$elemMatch`","Value form","Object form","Nested-array semantics","Compatibility boundary","Index and sidecar obligations","Required fixtures"];for(const x of required)if(!s.includes(x))throw Error("missing coverage: "+x);console.log("PASS: 19/19 array coverage markers")'
node -e 'const own=(x,k)=>x!==null&&!Array.isArray(x)&&typeof x==="object"&&Object.hasOwn(x,k),numeric=s=>/^(0|[1-9][0-9]*)$/.test(s),walk=(v,segs,pos=[])=>{if(!segs.length)return [{v,pos}];const [h,...t]=segs;if(Array.isArray(v)){if(numeric(h)){const i=Number(h);return Number.isSafeInteger(i)&&i<v.length?walk(v[i],t,pos.concat(i)):[]}return v.flatMap((e,i)=>own(e,h)?walk(e[h],t,pos.concat(i)):[])}return own(v,h)?walk(v[h],t,pos):[]},vals=x=>walk(x,["items","price"]).map(x=>x.v);if(JSON.stringify(vals({items:[{price:1},{price:2}]}))!=="[1,2]")throw Error("fanout");if(JSON.stringify(vals({items:[{price:null},{}]}))!=="[null]")throw Error("null/missing");if(vals({items:[[{price:1}]]}).length)throw Error("nested flatten");if(walk({items:[{price:1}]},["items","0","price"])[0].v!==1)throw Error("numeric path");console.log("PASS: documented fan-out, null/missing, nested boundary, and numeric path examples")'
node -e 'const eq=(a,b)=>Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((x,i)=>eq(x,b[i])):Object.is(a,b),all=(a,r)=>Array.isArray(a)&&r.every(x=>a.some(y=>eq(x,y)));if(!eq([1,2],[1,2])||eq([1,2],[2,1])||eq([[1,2]],[1,2]))throw Error("equality");if(!all([1,2,3],[1,3])||!all([1],[1,1])||!all([],[])||!all([[1,2]],[[1,2]])||all([1,2],[[1,2]]))throw Error("all");if([1,[2,3]].length!==2)throw Error("size");const scores=[65,75,85],split=[65,85];if(!scores.some(x=>x>=70&&x<80)||!(split.some(x=>x>=70)&&split.some(x=>x<80))||split.some(x=>x>=70&&x<80))throw Error("elemMatch");console.log("PASS: ordered equality, $all, $size basis, and same-element predicate examples")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/array-semantics.md","docs/adr/0005-explicit-array-matching.md","docs/adr/README.md"];for(const f of files){const s=cp.execFileSync("git",["show","7914c4b:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- Array semantic coverage markers: 19 of 19 present.
- The sanity path evaluator reproduced immediate object-array fan-out, null versus missing, nested non-flattening, and explicit numeric-index selection.
- Ordered equality kept element positions/nesting significant.
- `$all` examples passed for duplicates, empty requirements, nested-array elements, and non-flattening.
- The same-element range example passed only through one element predicate evaluation.
- ADR 0005 is accepted, indexed, and linked from the normative specification.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/array-semantics.md` | `9b3754ecfb3e9b4ee3c8c81d9e24073e7e23e11acb75aa7bfa23f35430fe54e6` | 14,315 | Normative array/path/operator contract |
| `docs/adr/0005-explicit-array-matching.md` | `beb322faf1f324a39eeec94909f78169c9b9fa6e10f12f136a64fed22d4efd42` | 7,045 | Accepted array decision |
| `Specifications.md` | `e654c12798664a74521201892f67b9451d8e584b7d11f13468216d3faedcfa15` | 65,362 | Normative refinement links |
| `docs/adr/README.md` | `b1cf5a7282eae78052b78549f9415c667134b3101134cd9e9b8b43b086a78a61` | 3,255 | ADR index entry |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no requested `P01-008` subject was skipped.
- The JavaScript checks are focused sanity oracles for documented examples, not the production semantic interpreter.
- Numeric cross-type equality and full type ordering rely on the already accepted numeric/full-operator contracts.
- Executable parser/index/backend and MongoDB differential proof remains pending under the named tasks/gates.
- Independent array-semantic review remains required for `G01`.

## Review

Focused review checked whole-value versus element equality, order/hash consistency, numeric/object fan-out, missing/null candidates, complement semantics, same-element provenance, vacuous `$all`, top-level `$size`, nested `$elemMatch`, non-flattening, multivalue sort ambiguity, and adapter rewrites. No blocking finding remained.

## Reproduction

Check out `7914c4b05e893cdf52425cade1e7536f13f532dd`, run the commands above from the repository root, and compare all four hashes with this file and [manifest.json](manifest.json).

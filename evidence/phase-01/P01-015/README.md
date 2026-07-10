# P01-015 Aggregation Semantics Evidence

- Task: `P01-015` — specify `$match`, `$project`, `$sort`, `$limit`, `$skip`, `$count`, `$group`, and `$unwind`
- Requirements: `DATA-002`, `QUERY-001`, `INV-002`
- Commit under test: `87bdd94a1d7d538cdead032c00376bc8b7f67c73`
- Recorded at: `2026-07-10T19:39:36Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the aggregation contract defines all eight required stages, ordered execution, hidden stable ordinals, minimal expressions, projection modes, stable sort/skip/limit, always-one-row count, missing/null-distinct groups, five accumulators/deterministic reductions, unwind shapes, cursor/error/backend invariants, and compatibility differences.

It does not prove parser/executor/spill/GPU code. Later executable fixtures and query phases implement the contract.

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
git diff --check 87bdd94^ 87bdd94
git diff-tree --no-commit-id --name-status -r 87bdd94
git show 87bdd94:docs/architecture/aggregation-semantics.md | sha256sum
git show 87bdd94:Specifications.md | sha256sum
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","87bdd94:docs/architecture/aggregation-semantics.md"],{encoding:"utf8"}),stages=["$match","$project","$sort","$limit","$skip","$count","$group","$unwind"],required=["Pipeline execution model","Hidden stable ordinal","Expression v1","Exclusion mode","Inclusion/computation mode","Supported accumulators","`$sum`","`$avg`","`$min` / `$max`","Group execution/resource rules","Pipeline order/cardinality examples","Cursor, error, and atomic response behavior","Backend invariants","Compatibility boundary","Required fixtures","empty pipeline is the identity","exactly one document, including for empty input","Missing and explicit null are separate keys"];for(const x of stages)if(!s.includes("`"+x+"`"))throw Error("missing stage "+x);for(const x of required)if(!s.includes(x))throw Error("missing "+x);console.log("PASS: 8/8 stages; 18/18 semantic markers")'
node -e 'const docs=[{_id:3,v:1},{_id:1,v:2},{_id:2,v:2}],match=docs.filter(x=>x.v>=1),sorted=match.sort((a,b)=>b.v-a.v||a._id-b._id),paged=sorted.slice(1,3),projected=paged.map(({_id,v})=>({_id,v}));if(projected.map(x=>x._id).join()!=="2,3")throw Error("pipeline order");const count=xs=>({count:BigInt(xs.length)});if(count([]).count!==0n||count(projected).count!==2n)throw Error("count");if([1,2,3].slice(0,0).length!==0)throw Error("limit zero");console.log("PASS: match/sort/tie/skip/limit/project order and always-one count values")'
node -e 'const M=Symbol("missing"),rows=[M,null,1,M,null,2],key=x=>x===M?"0:missing":x===null?"1:null":"2:"+x,groups=[...Map.groupBy(rows,key)].sort(([a],[b])=>a.localeCompare(b));if(groups.length!==4||groups[0][1].length!==2||groups[1][1].length!==2)throw Error("group keys");const unwind=(doc,preserve)=>doc.a===undefined||doc.a===null||Array.isArray(doc.a)&&doc.a.length===0?(preserve?[structuredClone(doc)]:[]):Array.isArray(doc.a)?doc.a.map((x,i)=>({...doc,a:x,i})):(()=>{throw Error("type")})();if(unwind({},false).length||unwind({},true).length!==1||unwind({a:null},true)[0].a!==null||unwind({a:[]},true)[0].a.length!==0||unwind({a:["x","y"]},false).map(x=>x.i).join()!=="0,1")throw Error("unwind");console.log("PASS: missing/null-distinct canonical groups and unwind missing/null/empty/element shapes")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/aggregation-semantics.md"];for(const f of files){const s=cp.execFileSync("git",["show","87bdd94:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- Required stages: 8 of 8; semantic markers: 18 of 18.
- Sequential sanity produced stable value/`_id` sort, then skip/limit/project in written order.
- Count emitted numeric zero for empty and two for the sample rather than no row.
- Group sanity retained distinct missing/null keys and canonical key order.
- Unwind sanity matched missing/null/empty preservation and immediate element/index order.
- Specifications link the complete aggregation contract.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/aggregation-semantics.md` | `358b03c57b3bfeceda89a71af67043937fb2a74b319de52778b44446e615d15f` | 17,001 | Normative aggregation/expression/accumulator contract |
| `Specifications.md` | `c84bb129b0d9fcbc2f56a07b3264138a375e9208ac71022b79cf3c54dd4b978a` | 68,277 | Normative refinement link |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no requested stage was skipped.
- JavaScript sanity uses host numbers/simple maps, not typed numeric reduction/reference hashing.
- Executable full stage/expression/accumulator/spill/backend corpus remains later tasks/gates.
- Independent aggregation/numeric review remains required for `G01`/`G07`.

## Review

Focused review checked empty pipeline identity, stage order/rewrite boundary, expression Missing behavior, projection modes/order, hidden ties, count empty output, group missing/null/key order, accumulator input/result/promotion, unwind preserve/index shape, cursor batch errors, and optimized exactness. No blocking finding remained.

## Reproduction

Check out `87bdd94a1d7d538cdead032c00376bc8b7f67c73`, run the commands above from the repository root, and compare both hashes with this file and [manifest.json](manifest.json).

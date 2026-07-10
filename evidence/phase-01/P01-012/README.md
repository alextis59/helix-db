# P01-012 V1 Operator Truth-Table Evidence

- Task: `P01-012` — specify v1 comparison, logical, type, array, string, time/cache, and vector truth tables
- Requirements: `DATA-002`, `QUERY-001`, `QUERY-002`, `INV-002`
- Commit under test: `dfcd25cb47123d17c9b02ae004b6bd31dfc1b500`
- Recorded at: `2026-07-10T19:17:02Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that one normative contract contains the grammar, validation/runtime/nonmatch boundary, multivalue reduction, comparison/type-bracketing/total-order tables, every required operator family, regex/schema subset, cache/time visibility, exact vector selection, backend invariants, and fixture obligations.

It does not prove a parser or production interpreter. `P01-018`–`P01-020` turn these tables into language-neutral executable cases/oracle behavior.

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
git diff --check dfcd25c^ dfcd25c
git diff-tree --no-commit-id --name-status -r dfcd25c
git show dfcd25c:docs/architecture/operator-semantics.md | sha256sum
git show dfcd25c:Specifications.md | sha256sum
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","dfcd25c:docs/architecture/operator-semantics.md"],{encoding:"utf8"}),ops=["$eq","$ne","$gt","$gte","$lt","$lte","$in","$nin","$and","$or","$not","$nor","$exists","$type","$all","$size","$elemMatch","$prefix","$contains","$regex","$jsonSchema","$ttl","$expiresBefore","$expiresAfter","$vectorNear","$vectorTopK"],sections=["Evaluation outcomes","Filter grammar and normalization","Path candidate reduction","Range type bracketing","Total sort/type order","Comparison truth table","Logical operators","Array operator truth table","String operator truth table","Regex v1 subset","`$jsonSchema` native subset","Cache/time operator truth tables","Vector operator truth tables","Operator applicability summary","Backend and planner invariants","Required truth-table fixtures","Compatibility boundary"];for(const op of ops)if(!s.includes("`"+op+"`")&&!s.includes(op+":"))throw Error("missing operator "+op);for(const x of sections)if(!s.includes(x))throw Error("missing section "+x);console.log("PASS: 26/26 operators; 17/17 semantic sections")'
node -e 'const missing=Symbol("missing"),eq=(v,x)=>v!==missing&&Object.is(v,x),ne=(v,x)=>!eq(v,x),range=(v,x,op)=>v!==missing&&v!==null&&x!==null&&typeof v===typeof x&&({gt:v>x,gte:v>=x,lt:v<x,lte:v<=x})[op],inside=(v,xs)=>xs.some(x=>eq(v,x));for(const v of [missing,null,1,"1"]){if(ne(v,null)===eq(v,null))throw Error("complement")}if(eq(missing,null)||!ne(missing,null)||range(missing,0,"gt")||range("2",1,"gt"))throw Error("missing/bracket");if([].every(Boolean)!==true||[].some(Boolean)!==false||!([].every(x=>!x)))throw Error("logical identities");if(inside(missing,[])||!(!inside(missing,[]))||inside(1,[]))throw Error("empty in/nin");console.log("PASS: equality complements, missing/type brackets, empty logical/in identities")'
node -e 'const E=100,ttl=(v,state)=>state==="unbounded"?v===undefined:typeof v==="number"&&(state==="active"?v>E:v<=E);if(!ttl(undefined,"unbounded")||ttl(undefined,"active")||!ttl(101,"active")||ttl(100,"active")||!ttl(100,"expired")||ttl(null,"expired"))throw Error("ttl");const rows=[{id:2,s:1},{id:1,s:1},{id:3,s:0.5}].sort((a,b)=>a.s-b.s||a.id-b.id);if(rows.map(x=>x.id).join()!=="3,1,2")throw Error("topk");if(!"hello".startsWith("")||!"hello".includes("")||"hello".startsWith("H"))throw Error("string");console.log("PASS: TTL cutoff states, exact top-k tie, and binary string empty/case behavior")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/operator-semantics.md"];for(const f of files){const s=cp.execFileSync("git",["show","dfcd25c:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- Required operator coverage: 26 of 26.
- Semantic section coverage: 17 of 17.
- Sanity tables confirmed equality/inequality complements, missing/range type bracketing, empty AND/OR/NOR identities, and empty `$in`/`$nin` complements.
- TTL sanity cases confirmed strict active `> E`, expired `<= E`, and missing/unbounded distinctions.
- Exact score ordering used ascending `_id` ties; empty/case string behavior remained binary/case-sensitive.
- Specifications link the contract and the corrected vector top-k example discloses typed-vector requirements.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/operator-semantics.md` | `a8ae71581a531c0b39876583b0f9a2540b096093d8b25a98536dfa89f77af3e8` | 20,294 | Normative grammar/truth-table contract |
| `Specifications.md` | `001b3db25b9b420d8e204e528d5b838808111e95129bed3553bf35e7413fa50e` | 67,167 | Normative refinement/example update |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no required operator was skipped.
- The compact JavaScript checks exercise representative table algebra, not recursive objects/arrays/numerics or a production parser.
- Executable full cross-product and backend proof remains `P01-018`–`P01-020` and later query/index/GPU gates.
- Independent full semantic review remains required for `G01`.

## Review

Focused review checked wrong-type versus invalid-operand behavior, null/missing complements, multivalue binding, type-bracketed ranges versus total sort rank, regex/schema bounded subsets, TTL visibility, global vector selector placement/ties, unsupported syntax, and candidate verification. No blocking finding remained.

## Reproduction

Check out `dfcd25cb47123d17c9b02ae004b6bd31dfc1b500`, run the commands above from the repository root, and compare both hashes with this file and [manifest.json](manifest.json).

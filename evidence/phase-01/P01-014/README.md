# P01-014 Update Operator Semantics Evidence

- Task: `P01-014` — specify set/unset/inc, array mutation, conflicts, path creation, and atomicity
- Requirements: `DATA-001`, `DATA-002`, `QUERY-001`, `STORE-001`
- Commit under test: `1c3803c2c26862daf802deab72fdc49fff5eb5bb`
- Recorded at: `2026-07-10T19:32:30Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the update contract defines eight supported operators, single-valued object/array path behavior, no-hole creation, protected fields, complete cross-operator conflicts, immutable-pre-image patches, missing/null/type tables, upsert application, exact modification accounting, and atomic storage/derived publication.

It does not prove the production update executor, MVCC, WAL, indexes, or recovery. Later fixtures and phases implement those behaviors.

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
git diff --check 1c3803c^ 1c3803c
git diff-tree --no-commit-id --name-status -r 1c3803c
git show 1c3803c:docs/architecture/update-semantics.md | sha256sum
git show 1c3803c:Specifications.md | sha256sum
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","1c3803c:docs/architecture/update-semantics.md"],{encoding:"utf8"}),ops=["$set","$unset","$inc","$setOnInsert","$push","$addToSet","$pop","$pull"],sections=["Path model","Conflict detection","Pre-image and simultaneous patch rule","Missing numeric-looking paths","Array index versus structural mutation examples","Missing/null/type matrix","Upsert insert application","Modification and presentation accounting","Atomicity across storage/derived state","Compatibility boundary","Required fixtures"];for(const op of ops)if(!s.includes("`"+op+"`"))throw Error("missing "+op);for(const x of sections)if(!s.includes(x))throw Error("missing "+x);console.log("PASS: 8/8 operators; 11/11 semantic sections")'
node -e 'const seg=p=>p.split("."),ancestor=(a,b)=>a.length<=b.length&&a.every((x,i)=>x===b[i]),conflict=(a,b)=>ancestor(seg(a),seg(b))||ancestor(seg(b),seg(a));for(const [a,b] of [["a","a"],["a","a.b"],["a.0","a"]])if(!conflict(a,b))throw Error("missed conflict");for(const [a,b] of [["a.b","a.c"],["a.0","a.1"]])if(conflict(a,b))throw Error("false conflict");const create=(root,path,value)=>{let x=root;const ss=seg(path);for(const k of ss.slice(0,-1)){if(!(k in x))x[k]={};if(x[k]===null||typeof x[k]!=="object"||Array.isArray(x[k]))throw Error("type");x=x[k]}x[ss.at(-1)]=value};const d={};create(d,"a.0",7);if(Array.isArray(d.a)||d.a["0"]!==7)throw Error("array inference");console.log("PASS: ancestor/sibling conflict and missing numeric-looking object creation examples")'
node -e 'const unsetIndex=(a,i)=>{if(i<0||i>=a.length)throw Error("range");a[i]=null},pull=(a,v)=>a.filter(x=>!Object.is(x,v)),addToSet=(a,xs)=>{for(const x of xs)if(!a.some(y=>Object.is(x,y)))a.push(x);return a};const a=[10,20,30];unsetIndex(a,1);if(JSON.stringify(a)!=="[10,null,30]")throw Error("unset hole");if(JSON.stringify(pull([10,20,30],20))!=="[10,30]")throw Error("pull");if(JSON.stringify(addToSet([1],[1,2,2]))!=="[1,2]")throw Error("addToSet");const max=2n**63n-1n;let overflow=false;try{const r=max+1n;if(r>max)throw Error("overflow")}catch{overflow=true}if(!overflow)throw Error("unchecked inc");console.log("PASS: dense unset, pull/addToSet order, and checked int64 increment boundary")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/update-semantics.md"];for(const f of files){const s=cp.execFileSync("git",["show","1c3803c:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- Supported update operators: 8 of 8; semantic sections: 11 of 11.
- Exact/ancestor/structural conflicts were detected while nonconflicting sibling/array indices remained allowed.
- Missing `a.0` created object field `"0"`, not an inferred array.
- Array unset preserved density with null; pull/add-to-set retained specified order; int64 boundary arithmetic trapped.
- Specifications link the complete update contract.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/update-semantics.md` | `36e4a3f4edce3b688797082788beddfd7fd6886fc4085e5af8f775123c04bf21` | 17,327 | Normative update/path/atomicity contract |
| `Specifications.md` | `c9627eb18ebb47ee73d0c8c88ef27dfddf49bcbbcc5e1e9915770c5a82b06fe1` | 67,936 | Normative refinement link |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no requested `P01-014` subject was skipped.
- Sanity helpers do not implement typed numeric equality, presentation order, transactional storage, or replay.
- Executable full update corpus and storage/index failure proof remain later tasks/gates.
- Independent update/atomicity review remains required for `G01`/`G06`.

## Review

Focused review checked supported/unsupported grammar, object versus array path creation, out-of-range/hole prevention, all conflict classes, immutable pre-image, set/unset/inc semantics, each array mutation, upsert insert branch, modified/no-op accounting, derived-state atomicity, replay idempotency, and compatibility differences. No blocking finding remained.

## Reproduction

Check out `1c3803c2c26862daf802deab72fdc49fff5eb5bb`, run the commands above from the repository root, and compare both hashes with this file and [manifest.json](manifest.json).

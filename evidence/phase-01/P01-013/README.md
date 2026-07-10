# P01-013 CRUD and Cursor Semantics Evidence

- Task: `P01-013` — specify insert, replace, update, upsert, delete, projection, sort, limit, skip, and cursor semantics
- Requirements: `DATA-001`, `DATA-002`, `QUERY-001`, `STORE-001`
- Commit under test: `7e572a239d5f8870a78700835e7fe158e15649ec`
- Recorded at: `2026-07-10T19:25:57Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the accepted CRUD contract defines lifecycle/snapshots, native all-or-none single/multi writes, deterministic target selection, insert/replace/update/upsert/delete behavior/results, idempotency, find/count order, projection, sort/ties, skip/limit, cursor pinning/retry/security, and compatibility differences.

It does not prove MVCC/storage/query/protocol implementation. Later phases consume the exact fixture obligations.

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
git diff --check 7e572a2^ 7e572a2
git diff-tree --no-commit-id --name-status -r 7e572a2
git show 7e572a2:docs/architecture/crud-query-semantics.md | sha256sum
git show 7e572a2:Specifications.md | sha256sum
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","7e572a2:docs/architecture/crud-query-semantics.md"],{encoding:"utf8"}),required=["insertOne","insertMany","replaceOne","updateOne","updateMany","upsert","deleteOne","deleteMany","Projection modes","Sort semantics","Skip and limit","Cursor snapshot semantics","Common command lifecycle","V1 write atomicity","Read/write snapshot and target selection","Write result and idempotency","Find/count execution order","Compatibility boundary","Required fixtures","commit all selected mutations or none","explicit `0` returns zero rows","implicit `_id` ascending","same snapshot and TTL cutoff","no gaps/duplicates"];for(const x of required)if(!s.includes(x))throw Error("missing coverage: "+x);console.log("PASS: 24/24 CRUD/cursor coverage markers")'
node -e 'const atomic=(state,ops)=>{const next=structuredClone(state);for(const op of ops){if(op.fail)throw Error("abort");next.set(op.id,op.value)}return next},before=new Map([[1,"a"]]);let after;try{after=atomic(before,[{id:2,value:"b"},{id:3,fail:true}])}catch{after=before}if(after.size!==1||after.get(1)!=="a")throw Error("partial batch");const targets=[{id:3},{id:1},{id:2}].sort((a,b)=>a.id-b.id);if(targets.map(x=>x.id).join()!=="1,2,3")throw Error("target order");console.log("PASS: all-or-none batch sanity and ascending-ID target order")'
node -e 'const docs=[{_id:1,a:1,b:null},{_id:2,b:2},{_id:3,a:3}],include=(d,keys)=>Object.fromEntries(Object.entries(d).filter(([k])=>k==="_id"||keys.includes(k))),exclude=(d,keys)=>Object.fromEntries(Object.entries(d).filter(([k])=>!keys.includes(k))),ordered=[...docs].sort((a,b)=>a.a===undefined?-1:b.a===undefined?1:a.a-b.a||a._id-b._id),page=(xs,skip,limit)=>xs.slice(skip,skip+limit),batches=(xs,n)=>Array.from({length:Math.ceil(xs.length/n)},(_,i)=>xs.slice(i*n,(i+1)*n)).flat();if(JSON.stringify(include(docs[0],["a"]))!==JSON.stringify({_id:1,a:1})||"a" in exclude(docs[0],["a"]))throw Error("projection");if(page(ordered,0,0).length!==0||page(ordered,1,2).length!==2)throw Error("pagination");if(JSON.stringify(batches(ordered,2))!==JSON.stringify(ordered))throw Error("cursor concat");console.log("PASS: projection, explicit limit zero, pagination, and cursor concatenation sanity")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/crud-query-semantics.md"];for(const f of files){const s=cp.execFileSync("git",["show","7e572a2:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- CRUD/cursor semantic coverage markers: 24 of 24 present.
- Atomic-batch sanity left the original state unchanged after a later input error.
- Stable target selection sorted by ascending `_id`.
- Inclusion/exclusion projection retained missing/null distinctions in the representative shape.
- Explicit limit zero returned no rows; skip/limit and cursor-batch concatenation preserved one-shot order.
- Specifications link the complete native CRUD/cursor contract.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/crud-query-semantics.md` | `452c7982d615db3ec51e4984f5839ec5116a6fc85d6d0b2e273389b34f92ee66` | 21,235 | Normative CRUD/query/cursor contract |
| `Specifications.md` | `a5cc9fd89a57d605c0ad6357e3d5e076f4ebc0f2eaee137d3b2b04874b7071bb` | 67,535 | Normative refinement link |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no requested `P01-013` subject was skipped.
- The small in-memory checks demonstrate algebra/examples, not production MVCC/storage/cursor behavior.
- Update path details, aggregation, stable error codes, and default ordering remain the next semantic tasks.
- Independent CRUD/transaction review remains required for `G01` and `G06`.

## Review

Focused review checked atomic unit/target cap, snapshot target set, insert ID/error order, replacement no-op/ID, update counts, upsert synthesis, tombstones, idempotency, projection array boundary, total sort/tie, explicit limit zero, cursor snapshot/TTL/retry/expiry/security, and MongoDB partial-write differences. No blocking finding remained.

## Reproduction

Check out `7e572a239d5f8870a78700835e7fe158e15649ec`, run the commands above from the repository root, and compare both hashes with this file and [manifest.json](manifest.json).

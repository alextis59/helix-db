# P01-002 Missing and Null Evidence

- Task: `P01-002` — define missing-field versus explicit-null behavior
- Requirements: `DATA-002`, `QUERY-001`
- Commit under test: `7ee095c2d97f1b3bafdf2c2ba804a03ff3b00124`
- Recorded at: `2026-07-10T17:26:32Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the accepted semantic contract distinguishes `Missing` from `Present(null)` across path reads, serialization, comparisons, sorting, projection, indexes, sidecars, aggregation, mutation, recovery, and cross-backend execution. It also records the deliberate native/MongoDB null-equality boundary.

It does not prove executable behavior; language-neutral fixtures, the reference oracle, and physical cross-path conformance remain later Phase 1 and implementation tasks.

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
git diff --check 7ee095c^ 7ee095c
git diff-tree --no-commit-id --name-status -r 7ee095c
git show 7ee095c:docs/architecture/missing-null-semantics.md | sha256sum
git show 7ee095c:Specifications.md | sha256sum
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","7ee095c:docs/architecture/missing-null-semantics.md"],{encoding:"utf8"}),required=["Reads and serialization","Comparison interaction","Sorting","Projection and expressions","Indexes and sidecars","Aggregation","Inserts, replacements, and updates","$exists: true","$exists: false","Present(null)","Missing","missing_bitmap","null_bitmap","P01-019"];for(const x of required)if(!s.includes(x))throw Error("missing coverage: "+x);console.log("PASS: 14/14 semantic coverage markers")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/missing-null-semantics.md"];for(const f of files){const s=cp.execFileSync("git",["show","7ee095c:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- Requested layer coverage: reads, comparisons, sorting, projection, indexes, aggregation, and updates all present.
- State model and presence/type/comparison/projection truth tables are explicit.
- Index, sidecar, storage, replay, backup, restore, and cross-backend invariants prohibit silent collapse.
- The fixture matrix identifies the cases later executable tasks must implement.
- The official MongoDB behavior used to describe the adapter difference is linked from the contract.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/missing-null-semantics.md` | `9463defd269b0a7d62916e0a8188a44b3b0978a076fc8af60b90e35ef6bf3b72` | 13,003 | Missing/null truth tables and invariants |
| `Specifications.md` | `9b642dbe93287da729fcb852c19f5c268630eba1366429beb0fe46da85852462` | 63,241 | Normative parent and refinement link |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no requested semantic layer was skipped.
- Array traversal is intentionally constrained by this contract but completed by `P01-008`.
- Executable fixtures and independent review remain required before `G01`.

## Review

Focused review checked that missing remains non-storable, null remains a present typed value, filter negation is internally coherent, sort/index keys remain distinct, mutations distinguish set-null from removal, and adapters cannot redefine native semantics. No blocking finding remained.

## Reproduction

Check out `7ee095c2d97f1b3bafdf2c2ba804a03ff3b00124`, run the commands above from the repository root, and compare the artifact hashes with this file and [manifest.json](manifest.json).

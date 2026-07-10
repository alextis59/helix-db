# P01-001 Logical Value Model Evidence

- Task: `P01-001` — specify the complete logical value model
- Requirements: `DATA-001`, `QUERY-001`
- Commit under test: `87043c5cf84442189400e00d52f92ce0122f2ad9`
- Recorded at: `2026-07-10T17:20:51Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the semantic baseline defines the complete required v1 logical type inventory, stable machine names, value domains, missing-value boundary, container/vector identity, lossless transport obligations, and ownership of every deferred semantic refinement.

It does not freeze comparison, arithmetic, temporal encoding, collation, object canonicalization, array operators, identifier generation, vector metrics, physical HDoc tags, or wire wrappers. Those contracts remain owned by `P01-002` through `P01-011`, `P03-*`, `P07-*`, and `P12-*` as stated in the artifact.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
Git: 2.34.1
Node: v22.19.0
Rust: rustc 1.96.1 (31fca3adb 2026-06-26)
Cargo: cargo 1.96.1 (356927216 2026-06-26)
```

No browser, GPU, storage, or network capability is material to this documentation contract.

## Commands

All commands ran from the repository root.

```bash
git status --porcelain=v1
git diff --check 87043c5^ 87043c5
git diff-tree --no-commit-id --name-status -r 87043c5
git show 87043c5:docs/architecture/value-model.md | sha256sum
git show 87043c5:Specifications.md | sha256sum
node -e 'const cp=require("child_process"),p="87043c5:docs/architecture/value-model.md",s=cp.execFileSync("git",["show",p],{encoding:"utf8"}),types=["null","bool","int32","int64","float64","decimal128","string","binary","object","array","timestamp","date","uuid","objectId","vector<f32,N>","vector<f16,N>"];for(const t of types)if(!s.includes("`"+t+"`"))throw Error("missing type "+t);for(let n=2;n<=11;n++){const id="P01-"+String(n).padStart(3,"0");if(!s.includes("`"+id+"`"))throw Error("missing owner "+id)}console.log("PASS: 16/16 types; 10/10 follow-up owners")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/value-model.md"];for(const f of files){const s=cp.execFileSync("git",["show","87043c5:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": final newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- All commands exited with status 0.
- The worktree was clean before evidence files were added.
- The artifact commit changes only `Specifications.md` and `docs/architecture/value-model.md`.
- Required logical type coverage: 16 of 16 stable type forms present.
- Follow-up semantic ownership: 10 of 10 tasks from `P01-002` through `P01-011` present.
- Both reviewed Markdown files have final newlines, no trailing whitespace, and resolving local links.
- The specification identifies the value-model document as its normative refinement.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/value-model.md` | `4f7a67151b77d17be36c3f156f4045a28cea460351d2ed8656adfe8b298896cb` | 15,344 | Complete logical type and domain contract |
| `Specifications.md` | `ce81d65e5be2ab97f4d88fac51657bd41f01f48a2fd2e7da6f14f333fe0f765b` | 62,894 | Normative parent and refinement link |

Machine-readable metadata is recorded in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No command failed and no required type was skipped.
- This is a semantic documentation task; executable fixture/oracle validation is intentionally deferred to later Phase 1 tasks.
- Independent semantic acceptance remains a requirement of `G01` and is not claimed here.

## Review

The focused review checked exhaustiveness, stable naming, domain boundaries, explicit separation of missing from stored null, recursive containers, vector type identity, transport losslessness, and the absence of premature physical tag or operator decisions. No blocking finding remained.

The `G01` reviewer must revisit this contract together with the executable semantic corpus and reference oracle before marking the requirement rows `Verified`.

## Reproduction

No setup or generated state is required. Check out commit `87043c5cf84442189400e00d52f92ce0122f2ad9` and run the commands above from the repository root. Compare the two SHA-256 values with the artifact table and manifest.

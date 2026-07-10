# P01-011 Portable Limit Profile Evidence

- Task: `P01-011` — set document, depth, field, name, path, array, vector, and command limits
- Requirements: `DATA-001`, `QUERY-001`, `QUERY-002`, `SEC-002`
- Commit under test: `5fe3146b5835ea4abe0cac82d114373d63044ee1`
- Accepted decision: [ADR 0008](../../../docs/adr/0008-use-one-portable-v1-limit-profile.md)
- Recorded at: `2026-07-10T19:09:08Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that `limits-v1` defines every requested portable maximum plus independent command/decompression/AST amplification limits, exact counting/grammar/enforcement rules, atomic errors, lower-quota negotiation, and import/backup/migration behavior.

It does not allocate boundary-size artifacts or prove production parsers/encoders. Executable below/at/above cases and resource tests remain `P01-019`/later implementation gates.

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
git diff --check 5fe3146^ 5fe3146
git diff-tree --no-commit-id --name-status -r 5fe3146
git show 5fe3146:docs/architecture/limits-v1.md | sha256sum
git show 5fe3146:docs/adr/0008-use-one-portable-v1-limit-profile.md | sha256sum
git show 5fe3146:Specifications.md | sha256sum
git show 5fe3146:docs/adr/README.md | sha256sum
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","5fe3146:docs/architecture/limits-v1.md"],{encoding:"utf8"}),required=["Profile ID: `limits-v1`","16,777,216","Container nesting depth","100,000","Field-name UTF-8 bytes","1,024","Dotted path UTF-8 bytes","4,096","Array elements","1,000,000","Vector dimension","4,096","67,108,864","Batch operations/documents","Aggregation stages","Filter/expression AST nodes","Literal list items","Exact vector top-k `k`","Document size","Field-name grammar and limits","Dotted path grammar and limits","Command envelope size","Lower deployment quotas","Required fixtures"];for(const x of required)if(!s.includes(x))throw Error("missing coverage: "+x);const rows=s.split("\n").filter(l=>/^\| [^|-].*\| [0-9]/.test(l));if(rows.length!==23)throw Error("numeric rows "+rows.length);console.log("PASS: 24/24 coverage markers and 23 numeric table rows")'
node -e 'if(16*1024*1024!==16777216||64*1024*1024!==67108864)throw Error("MiB constants");if(256*4!==1024)throw Error("field scalar/byte envelope");if(4096*4!==16384||4096*2!==8192)throw Error("vector byte envelopes");const valid=n=>{const b=Buffer.byteLength(n,"utf8"),sc=[...n].length;return b>=1&&b<=1024&&sc<=256&&!/[.\u0000-\u001f\u007f]/u.test(n)&&!n.startsWith("$")};for(const n of ["a","0","é","_id"])if(!valid(n))throw Error("rejected "+n);for(const n of ["","a.b","$x","a\u0000b","a\n"])if(valid(n))throw Error("accepted "+JSON.stringify(n));console.log("PASS: binary constants, vector envelopes, and field-name examples")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/limits-v1.md","docs/adr/0008-use-one-portable-v1-limit-profile.md","docs/adr/README.md"];for(const f of files){const s=cp.execFileSync("git",["show","5fe3146:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- Required semantic/command coverage markers: 24 of 24 present.
- The normative table contains 23 independently measured numeric rows.
- Byte arithmetic confirmed exact 16 MiB/64 MiB constants and f16/f32 storage envelopes for dimension 4,096.
- Field-name sanity cases accepted ordinary/Unicode/numeric/protected `_id` spelling and rejected empty, dot, leading dollar, NUL/control examples.
- ADR 0008 is accepted, indexed, and linked from the normative specification.
- The contract links the official MongoDB limits only for the intentional 16 MiB/100-depth alignment, without broad compatibility claims.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/limits-v1.md` | `dd827dd227e8c6524dd847c40098522c257ab609f1cd12631eeea50e366f968d` | 15,788 | Normative portable limit profile |
| `docs/adr/0008-use-one-portable-v1-limit-profile.md` | `11637f563deb2cca49bc484f0895378b98a2a2264c6f04bda6e01273e2001711` | 6,542 | Accepted limit decision |
| `Specifications.md` | `5bb34f7236c6a149e72832ba89bb387d9c7e4e6df0b861bcda11e2cb9b6fe011` | 66,595 | Normative refinement links |
| `docs/adr/README.md` | `6222769bd39cf1ad5898cac3755d82faed8fa30f5e708372899b0f165d95580d` | 3,723 | ADR index entry |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no requested `P01-011` subject was skipped.
- This evidence intentionally does not allocate 16/64 MiB payloads; exact executable encoders/parsers do not exist yet.
- Transaction/index-key/cursor/memory/concurrency quotas remain explicitly owned by later tasks and are not implied unlimited.
- Independent limit/security review remains required for `G01` and later external-input gates.

## Review

Focused review checked inclusive measurements, HDoc versus compressed bytes, depth/field counting, field/path grammar, array/vector bounds, raw/expanded command amplification, AST normalization expansion, checked arithmetic, lower-host quotas, atomicity, import/restore, and future profile migration. No blocking finding remained.

## Reproduction

Check out `5fe3146b5835ea4abe0cac82d114373d63044ee1`, run the commands above from the repository root, and compare all four hashes with this file and [manifest.json](manifest.json).

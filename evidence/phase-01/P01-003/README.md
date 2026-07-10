# P01-003 Exact Numeric Semantics Evidence

- Task: `P01-003` — define integer width, coercion, overflow, underflow, decimal promotion, and mixed numeric comparison
- Requirements: `DATA-001`, `QUERY-001`, `CORE-003`
- Commit under test: `a6796a3ce48df8808617a5f311f06ea26cc4c0e2`
- Accepted decision: [ADR 0002](../../../docs/adr/0002-exact-numeric-semantics.md)
- Recorded at: `2026-07-10T17:31:48Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that one accepted contract defines all behavior requested by `P01-003`: four numeric types, JSON/typed literal inference, limited implicit coercion, integer widening, overflow/underflow failure, decimal128 promotion/context, exact mixed finite comparison, comparison versus typed hashes, explicit conversion, backend fallback, and required fixtures.

Floating special values and arithmetic results remain deliberately closed until `P01-004`; physical encodings and executable behavior remain later tasks.

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
git diff --check a6796a3^ a6796a3
git diff-tree --no-commit-id --name-status -r a6796a3
git show a6796a3:docs/architecture/numeric-semantics.md | sha256sum
git show a6796a3:docs/adr/0002-exact-numeric-semantics.md | sha256sum
git show a6796a3:Specifications.md | sha256sum
git show a6796a3:docs/adr/README.md | sha256sum
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","a6796a3:docs/architecture/numeric-semantics.md"],{encoding:"utf8"}),required=["Literal and input typing","Implicit coercion boundary","Integer overflow and underflow","Decimal128 promotion and arithmetic","Exact mixed numeric comparison","Explicit numeric conversion","Backend obligations","int32","int64","float64","decimal128","2^53","P01-004"];for(const x of required)if(!s.includes(x))throw Error("missing coverage: "+x);console.log("PASS: 13/13 numeric coverage markers")'
node -e 'const exact=9007199254740992n,inexact=9007199254740993n;if(BigInt(Number(exact))!==exact)throw Error("exact boundary");if(BigInt(Number(inexact))===inexact)throw Error("inexact boundary");const i32min=-(2n**31n),i32max=2n**31n-1n,i64min=-(2n**63n),i64max=2n**63n-1n;if(i32min<i64min||i32max>i64max)throw Error("integer containment");if(-i32min>i64max)throw Error("negation widening");console.log("PASS: integer containment, widening, and 2^53 examples")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/numeric-semantics.md","docs/adr/0002-exact-numeric-semantics.md","docs/adr/README.md"];for(const f of files){const s=cp.execFileSync("git",["show","a6796a3:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- Numeric semantic coverage markers: 13 of 13 present.
- BigInt checks confirm the documented exact/inexact integer-to-binary64 boundary examples.
- BigInt checks confirm `int32` containment in `int64` and safe `int32::MIN` negation widening.
- ADR 0002 is accepted, indexed, and linked from the normative specification.
- The contract forbids wrapping, saturation, host-dependent casts, implicit decimal/float mixing, and accelerator-driven narrowing.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/numeric-semantics.md` | `f5e31e9aa08c1a9b1fc9c30a60c8e31a8a58a8b4f04dec2fea1c4daf9605411b` | 12,835 | Normative numeric contract |
| `docs/adr/0002-exact-numeric-semantics.md` | `5507be8c033c5ef8c913897b95ccd40f63fc87e3d53aab86346e82f9eb502de0` | 8,298 | Accepted numeric decision |
| `Specifications.md` | `93a58950d07607b12305bbc58cb7b52db4b12c4cff69f7978fe1d1ed3d4c98fb` | 63,627 | Normative refinement link |
| `docs/adr/README.md` | `74842ee82dc94f90710bed326c0475ce016885db5bb5be139277f25aab8d4941` | 2,770 | ADR index entry |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no `P01-003` subject was skipped.
- No decimal arithmetic library exists in the repository yet; decimal boundary fixtures and executable validation remain `P01-019`/`P01-020`.
- NaN, infinity, signed-zero, and floating underflow behavior remains `P01-004` and is not pre-approved by this verdict.
- Independent semantic review remains required for `G01`.

## Review

Focused review rejected host-dependent and unconditional-widening alternatives; checked operand-order symmetry, exactness boundaries, atomic failure, index/group/hash consistency, and CPU/GPU fallback obligations. No blocking finding remained.

## Reproduction

Check out `a6796a3ce48df8808617a5f311f06ea26cc4c0e2`, run the commands above from the repository root, and compare all four hashes with this file and [manifest.json](manifest.json).

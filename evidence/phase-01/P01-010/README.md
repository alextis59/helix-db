# P01-010 Vector Semantics Evidence

- Task: `P01-010` — define vector dimension, element type, normalization, metrics, invalid values, and tolerance
- Requirements: `QUERY-001`, `INV-002`, `GPU-002`, `GPU-003`
- Commit under test: `564333a8fa73463de160510faeee851999263086`
- Accepted decision: [ADR 0007](../../../docs/adr/0007-exact-vector-results-with-cpu-reranking.md)
- Recorded at: `2026-07-10T19:02:16Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the accepted vector contract defines f16/f32 dimension identity, finite element domains/casts, equality/hashes, explicit normalization, deterministic float64 L2/dot/cosine, candidate eligibility, exact thresholds/top-k/ties, zero semantic tolerance, conservative GPU error intervals, and vector-index constraints.

It does not prove f16 conversion code, correctly rounded reference math, HDoc/sidecars, GPU kernels, error bounds, or a vector index. Later tasks implement the required fixture/differential/recovery evidence.

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
git diff --check 564333a^ 564333a
git diff-tree --no-commit-id --name-status -r 564333a
git show 564333a:docs/architecture/vector-semantics.md | sha256sum
git show 564333a:docs/adr/0007-exact-vector-results-with-cpu-reranking.md | sha256sum
git show 564333a:Specifications.md | sha256sum
git show 564333a:docs/adr/README.md | sha256sum
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","564333a:docs/architecture/vector-semantics.md"],{encoding:"utf8"}),required=["Logical vector types","vector<f32,N>","vector<f16,N>","Element representation and admitted values","NaN and positive/negative infinity are rejected","Checked vector casts","No implicit normalization","Reference arithmetic","L2 metric","Dot metric","Cosine metric","Query eligibility","Exact `$vectorTopK`","`$vectorNear` thresholds","CPU/GPU tolerance and candidate contract","0 ULP","score intervals","Vector index boundary","Required fixtures"];for(const x of required)if(!s.includes(x))throw Error("missing coverage: "+x);console.log("PASS: 19/19 vector coverage markers")'
node -e 'const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),l2=(a,b)=>Math.sqrt(a.reduce((s,x,i)=>s+(x-b[i])*(x-b[i]),0)),cos=(a,b)=>{const aa=dot(a,a),bb=dot(b,b);if(aa===0||bb===0)throw Error("zero norm");return 1-Math.max(-1,Math.min(1,dot(a,b)/(Math.sqrt(aa)*Math.sqrt(bb))))};if(l2([0,0],[3,4])!==5||dot([1,2],[3,4])!==11||cos([1,0],[0,1])!==1||cos([1,0],[1,0])!==0)throw Error("metric");let zero=false;try{cos([0,0],[1,0])}catch{zero=true}if(!zero)throw Error("zero norm accepted");if([0,Number.MIN_VALUE,Number.MAX_VALUE].some(x=>!Number.isFinite(x))||[NaN,Infinity,-Infinity].some(Number.isFinite))throw Error("finite classification");console.log("PASS: L2/dot/cosine, zero-norm, and finite classification examples")'
node -e 'const overlapsLower=(gpu,error,max)=>gpu-error<=max,rows=[{id:2,s:1},{id:1,s:1},{id:3,s:0.5}].sort((a,b)=>a.s-b.s||a.id-b.id);if(JSON.stringify(rows.map(x=>x.id))!=="[3,1,2]")throw Error("top-k tie");if(!overlapsLower(1.1,0.2,1)||overlapsLower(1.3,0.2,1))throw Error("candidate interval");console.log("PASS: exact score/_id ordering and conservative threshold interval examples")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/vector-semantics.md","docs/adr/0007-exact-vector-results-with-cpu-reranking.md","docs/adr/README.md"];for(const f of files){const s=cp.execFileSync("git",["show","564333a:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- Vector semantic coverage markers: 19 of 19 present.
- Hand-checkable examples produced L2 `5`, dot `11`, orthogonal cosine distance `1`, identical cosine distance `0`, and zero-norm failure.
- Finite classification separated admitted finite numbers from NaN/infinities.
- Exact equal-score ordering used ascending `_id`, and conservative lower-is-better intervals included only boundary-overlapping candidates.
- ADR 0007 is accepted, indexed, and linked from the normative specification.
- Exact public behavior is separated from registered candidate error bounds and future approximate recall profiles.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/vector-semantics.md` | `8722eb1699212bf717a6e11f3a70c620460f13ab238fa1bd51b4175315df9d39` | 16,109 | Normative vector/metric/tolerance contract |
| `docs/adr/0007-exact-vector-results-with-cpu-reranking.md` | `7f962394c203c4870fec6a5159e8dd181d6ab363d355e028cd9b41b6f1135808` | 7,150 | Accepted vector exactness decision |
| `Specifications.md` | `0d2b537e574d4c307edaae6468cc54487da65b0152cadadf148e13813e27e87b` | 66,217 | Normative refinement links |
| `docs/adr/README.md` | `ce8518c670dce584601c8ece0ff994e1d12eb493d521c40c6c619e5eb477681e` | 3,579 | ADR index entry |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no requested `P01-010` subject was skipped.
- JavaScript metric examples are sanity checks, not the future bit-frozen reference implementation.
- Executable f16/rounding/error-bound/false-negative/GPU/index/recovery proof remains pending under the named tasks/gates.
- Independent vector review remains required for `G01`.

## Review

Focused review checked type/dimension identity, nonfinite rejection, zero/subnormal preservation, explicit casts/normalization, metric direction/formula, zero cosine norm, schema-free eligibility, exact score/tie/threshold rules, conservative intervals, false-negative fallback, ANN separation, and resource/security limits. No blocking finding remained.

## Reproduction

Check out `564333a8fa73463de160510faeee851999263086`, run the commands above from the repository root, and compare all four hashes with this file and [manifest.json](manifest.json).

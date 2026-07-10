# P01-006 String and Collation Semantics Evidence

- Task: `P01-006` — define string bytes, Unicode validation, normalization, binary ordering, and v1 collation
- Requirements: `DATA-001`, `QUERY-001`, `CORE-003`
- Commit under test: `afad0fec7331970174e52a9c907c73a274ba6d25`
- Accepted decision: [ADR 0004](../../../docs/adr/0004-preserve-utf8-and-use-binary-collation.md)
- Recorded at: `2026-07-10T17:48:57Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the accepted string contract defines the logical scalar domain, canonical UTF-8, invalid byte/UTF-16 rejection, byte preservation, explicit versioned normalization, exact equality/order/hash, length units, search boundaries, one v1 binary collation, backend constraints, and security/fixture obligations.

It does not prove an executable database codec, regex engine, index, SDK, or GPU kernel. Those implementations must consume the fixture matrix later.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
Git: 2.34.1
Node: v22.19.0
Unicode data contract: 17.0.0
```

## Commands

```bash
git status --porcelain=v1
git diff --check afad0fe^ afad0fe
git diff-tree --no-commit-id --name-status -r afad0fe
git show afad0fe:docs/architecture/string-semantics.md | sha256sum
git show afad0fe:docs/adr/0004-preserve-utf8-and-use-binary-collation.md | sha256sum
git show afad0fe:Specifications.md | sha256sum
git show afad0fe:docs/adr/README.md | sha256sum
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","afad0fe:docs/architecture/string-semantics.md"],{encoding:"utf8"}),required=["Logical domain and canonical bytes","shortest-form UTF-8","Input and SDK validation","Preservation and normalization","17.0.0","binary_utf8_v1","Equality","Binary ordering","unsigned octets","Hashing and canonical keys","Length and slicing measures","Prefix, contains, and regex boundary","Index, sidecar, and GPU behavior","Security considerations","Required fixtures"];for(const x of required)if(!s.includes(x))throw Error("missing coverage: "+x);console.log("PASS: 15/15 string coverage markers")'
node -e 'const enc=new TextEncoder(),cmp=(a,b)=>{a=enc.encode(a);b=enc.encode(b);for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];return a.length-b.length};for(const [a,b] of [["","A"],["A","a"],["a","é"],["é","😀"],["e\u0301","é"],["a","aa"],["aa","b"]])if(!(cmp(a,b)<0))throw Error("order "+JSON.stringify([a,b]));const fatal=new TextDecoder("utf-8",{fatal:true});for(const bytes of [[0xc0,0x80],[0xed,0xa0,0x80],[0xf4,0x90,0x80,0x80]]){let rejected=false;try{fatal.decode(Uint8Array.from(bytes))}catch{rejected=true}if(!rejected)throw Error("accepted invalid "+bytes)}if("é"==="e\u0301")throw Error("normalization collapse");console.log("PASS: ordering, invalid UTF-8 rejection, and no normalization collapse")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/string-semantics.md","docs/adr/0004-preserve-utf8-and-use-binary-collation.md","docs/adr/README.md"];for(const f of files){const s=cp.execFileSync("git",["show","afad0fe:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- String semantic coverage markers: 15 of 15 present.
- Unsigned UTF-8 comparison produced every documented sample order.
- Fatal decoding rejected overlong NUL, encoded surrogate, and code point above `U+10FFFF` examples.
- Composed/decomposed `é` examples remained distinct without normalization.
- ADR 0004 is accepted, indexed, and linked from the normative specification.
- The contract links the official Unicode 17.0.0 release for version-sensitive transforms/properties.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/string-semantics.md` | `fd5e6da45e59c37fa695d6bb2138eecddf02329943d09aeaa75320c781020752` | 13,342 | Normative string/Unicode/collation contract |
| `docs/adr/0004-preserve-utf8-and-use-binary-collation.md` | `9d4da4ec2f0e5cb9b891031030c934f373e3cb996fc483aab9efa8aee3837d1d` | 7,365 | Accepted string decision |
| `Specifications.md` | `05c532b7cc19a1d5e9c62bf8abb48ca53cf30a5bb094dd70d4f5b8c33aaa2e4d` | 64,601 | Normative refinement links |
| `docs/adr/README.md` | `c0399710bd890495290314fa808ee7b763fa57d39acf3225f3d2b75a43dc0162` | 3,109 | ADR index entry |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no requested `P01-006` subject was skipped.
- Node's decoder is a boundary sanity check, not the future reference database codec.
- Executable SDK/codec/regex/index/GPU and adapter compatibility proof remains pending under the named tasks/gates.
- Independent Unicode/string review remains required for `G01`.

## Review

Focused review checked scalar-versus-byte domain, malformed/replacement behavior, normalization/case drift, collation identity, byte-prefix ordering, hash/equality consistency, SDK surrogate boundaries, version pinning, conservative acceleration, and Unicode display/security risks. No blocking finding remained.

## Reproduction

Check out `afad0fec7331970174e52a9c907c73a274ba6d25`, run the commands above from the repository root, and compare all four hashes with this file and [manifest.json](manifest.json).

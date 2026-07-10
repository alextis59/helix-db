# P01-009 Identifier Semantics Evidence

- Task: `P01-009` — define `_id` accepted types, generation, immutability, ordering, and collision handling
- Requirements: `DATA-001`, `QUERY-001`
- Commit under test: `5f031e007d8fa1a26803b044efb539c4e6bab2b2`
- Accepted decision: [ADR 0006](../../../docs/adr/0006-default-to-uuidv7-identifiers.md)
- Recorded at: `2026-07-10T18:52:30Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that the accepted identifier contract defines the root invariant, exact accepted type domain, equality/order, UUID/ObjectId bytes/text, UUIDv7 native generation, ObjectId compatibility generation, generation/replay point, CRUD/upsert immutability, collision retries, primary-index obligations, and security/compatibility boundaries.

It does not prove a production CSPRNG/generator, primary index, WAL/retry store, SDK, adapter, or distributed uniqueness implementation. Later tasks implement the required fixtures and fault histories.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
Git: 2.34.1
Node: v22.19.0
UUID standard: RFC 9562
```

## Commands

```bash
git status --porcelain=v1
git diff --check 5f031e0^ 5f031e0
git diff-tree --no-commit-id --name-status -r 5f031e0
git show 5f031e0:docs/architecture/identifier-semantics.md | sha256sum
git show 5f031e0:docs/adr/0006-default-to-uuidv7-identifiers.md | sha256sum
git show 5f031e0:Specifications.md | sha256sum
git show 5f031e0:docs/adr/README.md | sha256sum
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","5f031e0:docs/architecture/identifier-semantics.md"],{encoding:"utf8"}),required=["Root `_id` invariant","Accepted v1 `_id` types","Primary-ID equality","Total `_id` order","UUID logical representation and text","RFC 9562","Native automatic ID: UUIDv7","74-bit monotonic random payload","Monotonic generator state","Explicit ObjectId generation profile","4 bytes","5 bytes","3 bytes","Generation point and determinism","Insert, replacement, update, and upsert","Collision and duplicate handling","eight generation/unique-check attempts","Primary index and partitioning obligations","Compatibility boundary","Required fixtures"];for(const x of required)if(!s.includes(x))throw Error("missing coverage: "+x);console.log("PASS: 20/20 identifier coverage markers")'
node -e 'const mask62=(1n<<62n)-1n,make=(ms,p)=>(ms<<80n)|(7n<<76n)|((p>>62n)<<64n)|(2n<<62n)|(p&mask62),bytes=n=>{const a=new Uint8Array(16);for(let i=15;i>=0;i--){a[i]=Number(n&255n);n>>=8n}return a},cmp=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0},ms=0x0123456789abn,p=0x123456789abcdefn,a=bytes(make(ms,p)),b=bytes(make(ms,p+1n)),c=bytes(make(ms+1n,0n));let got=0n;for(let i=0;i<6;i++)got=(got<<8n)|BigInt(a[i]);if(got!==ms||(a[6]>>4)!==7||(a[8]&0xc0)!==0x80||cmp(a,b)>=0||cmp(b,c)>=0)throw Error("uuidv7 layout/order");console.log("PASS: UUIDv7 timestamp/version/variant and monotonic byte order")'
node -e 'const seconds=0x01020304,seed=[5,6,7,8,9],counter=0xa0b0c0,b=Uint8Array.from([seconds>>>24,(seconds>>>16)&255,(seconds>>>8)&255,seconds&255,...seed,counter>>>16,(counter>>>8)&255,counter&255]),hex=Buffer.from(b).toString("hex");if(b.length!==12||hex!=="010203040506070809a0b0c0"||hex.length!==24)throw Error("objectId layout");console.log("PASS: ObjectId 4-byte seconds, 5-byte seed, 3-byte counter layout")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/identifier-semantics.md","docs/adr/0006-default-to-uuidv7-identifiers.md","docs/adr/README.md"];for(const f of files){const s=cp.execFileSync("git",["show","5f031e0:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- Identifier semantic coverage markers: 20 of 20 present.
- The UUIDv7 sanity encoder reproduced the 48-bit timestamp, version `7`, IETF variant `10`, and increasing network-byte order for payload/millisecond increments.
- The ObjectId sanity encoder reproduced exactly 12 bytes/24 hex digits with the documented 4-byte seconds, 5-byte seed, and 3-byte counter split.
- ADR 0006 is accepted, indexed, and linked from the normative specification.
- The contract links RFC 9562 and the official MongoDB ObjectId structure.
- Missing native IDs resolve once to UUIDv7; explicit/MongoDB profile generation resolves ObjectId; all uniqueness remains primary-index authoritative.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/identifier-semantics.md` | `451de51bbb1b76e20def1dc64178e6bea104ee35b27d6e3055fe9894377cbc2c` | 16,379 | Normative ID/generation/collision contract |
| `docs/adr/0006-default-to-uuidv7-identifiers.md` | `e310feed69fa79dd7ab31b4a7123708454368a2632783aa12e869e0f4b4edeb3` | 7,419 | Accepted identifier decision |
| `Specifications.md` | `853f40c9747948475d6df34a88c3799dc655bb9bd76316ac3e7340c326de23c9` | 65,781 | Normative refinement links |
| `docs/adr/README.md` | `39f6c4650dfc4377c2ecf143faa75feec253998fa43ba2ef59cbfe9373041e63` | 3,408 | ADR index entry |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no requested `P01-009` subject was skipped.
- The JavaScript bit encoders validate layout examples, not cryptographic randomness or concurrency.
- Executable CSPRNG/clock/retry/index/recovery/adapter proof remains pending under the named tasks/gates.
- Independent identifier review remains required for `G01`.

## Review

Focused review checked type-domain narrowing, numeric width aliases, exact immutability, cross-type order, network-byte/text forms, UUIDv7 monotonic state/rollback/exhaustion, ObjectId range/counter rotation, once-only replay generation, upsert precedence, eight-attempt collisions, and information-leak/authorization boundaries. No blocking finding remained.

## Reproduction

Check out `5f031e007d8fa1a26803b044efb539c4e6bab2b2`, run the commands above from the repository root, and compare all four hashes with this file and [manifest.json](manifest.json).

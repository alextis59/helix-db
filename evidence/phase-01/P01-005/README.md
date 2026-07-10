# P01-005 Temporal and Clock Semantics Evidence

- Task: `P01-005` — define timestamp precision, timezone/date conversion, logical expiry, and clock-source requirements
- Requirements: `QUERY-001`, `CORE-002`, `CACHE-002`
- Commit under test: `0c1db64b8a1606d34e25fe1884b3a8e17089c9c7`
- Accepted decision: [ADR 0003](../../../docs/adr/0003-utc-microseconds-and-injected-clocks.md)
- Recorded at: `2026-07-10T17:44:01Z`
- Recorder: Codex implementation agent
- Reviewer: pending independent `G01` gate review
- Verdict: Pass

## Scope

This evidence proves that one accepted temporal contract defines microsecond timestamp precision/range, canonical input/output and offset normalization, Gregorian dates and explicit conversion, leap-second handling, separate wall/monotonic/MVCC/expiry clocks, deterministic `now`, TTL boundary/pinning, and unsafe-clock behavior.

It does not prove parsers, host capabilities, MVCC, TTL maintenance, recovery, or adapter conversions; later tasks implement the required fixtures and histories.

## Environment

```text
OS: Linux 6.8.0-124-generic
architecture: x86_64
Git: 2.34.1
Node: v22.19.0
GNU coreutils date: host-installed version
```

## Commands

```bash
git status --porcelain=v1
git diff --check 0c1db64^ 0c1db64
git diff-tree --no-commit-id --name-status -r 0c1db64
git show 0c1db64:docs/architecture/temporal-semantics.md | sha256sum
git show 0c1db64:docs/adr/0003-utc-microseconds-and-injected-clocks.md | sha256sum
git show 0c1db64:Specifications.md | sha256sum
git show 0c1db64:docs/adr/README.md | sha256sum
date -u -d '0001-01-01T00:00:00Z' +%s
date -u -d '9999-12-31T23:59:59Z' +%s
node -e 'const min=-62135596800n*1000000n,max=253402300799n*1000000n+999999n;if(min!==-62135596800000000n||max!==253402300799999999n)throw Error("microsecond bounds");if(-62135596800n/86400n!==-719162n||253402300799n/86400n!==2932896n)throw Error("day bounds");console.log("PASS: timestamp and date payload bounds")'
node -e 'const cp=require("child_process"),s=cp.execFileSync("git",["show","0c1db64:docs/architecture/temporal-semantics.md"],{encoding:"utf8"}),required=["Timestamp representation","microsecond","0001-01-01","9999-12-31","Timezone normalization","Leap seconds","Date representation","Date and timestamp conversion","Clock capability roles","wall_time_utc()","monotonic_now()","mvcc_now()","logical_expiry_now()","Stable `now` evaluation","Logical expiry semantics","expires_at <= E","Expiry clock safety","ClockUnsafe","Required fixtures"];for(const x of required)if(!s.includes(x))throw Error("missing coverage: "+x);console.log("PASS: 19/19 temporal coverage markers")'
node -e 'const cp=require("child_process"),fs=require("fs"),path=require("path"),files=["Specifications.md","docs/architecture/temporal-semantics.md","docs/adr/0003-utc-microseconds-and-injected-clocks.md","docs/adr/README.md"];for(const f of files){const s=cp.execFileSync("git",["show","0c1db64:"+f],{encoding:"utf8"});if(!s.endsWith("\n"))throw Error(f+": newline");for(const [i,l] of s.split("\n").entries())if(/[ \t]+$/.test(l))throw Error(f+":"+(i+1)+": whitespace");for(const m of s.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const t=m[1].split("#")[0];if(!t||/^(https?:|mailto:)/.test(t))continue;if(!fs.existsSync(path.resolve(path.dirname(f),decodeURIComponent(t))))throw Error(f+": broken "+m[1])}}console.log("PASS: formatting and local links")'
```

## Results

- Every command exited with status 0; the worktree was clean before evidence creation.
- GNU `date` returned epoch seconds `-62135596800` and `253402300799` for the documented civil endpoints.
- BigInt conversion confirmed the inclusive microsecond payload range `-62135596800000000` through `253402300799999999`.
- BigInt division confirmed the date payload range `-719162` through `2932896`.
- Temporal semantic coverage markers: 19 of 19 present.
- ADR 0003 is accepted, indexed, and linked from the normative specification.
- Clock roles prohibit ambient/replay-time reads and make suspicious expiry time fail safe through `ClockUnsafe`.

## Artifacts

| Path | SHA-256 | Bytes | Purpose |
| --- | --- | ---: | --- |
| `docs/architecture/temporal-semantics.md` | `1c8e9d6ea921206297b1f3d6f3609734201ff9ea8c3d5ea311c105fc66bb004b` | 15,790 | Normative temporal/expiry/clock contract |
| `docs/adr/0003-utc-microseconds-and-injected-clocks.md` | `3463721a79d1ae362dd2cebbf3c39e7be71676a5e0b8d7cf4e75a3e9191948f6` | 8,008 | Accepted temporal decision |
| `Specifications.md` | `fc0a96d638ca7c312d7f00df9fc4e91cc611dd3e6d9de45e500862ddd57d8210` | 64,198 | Normative refinement links |
| `docs/adr/README.md` | `a802d6045289c320cfdaff32580c8d4eb74cc38815ae23fbc0725faec7dc7940` | 2,947 | ADR index entry |

Machine-readable metadata is in [manifest.json](manifest.json).

## Failures, skips, and limitations

- No validation failed and no requested `P01-005` subject was skipped.
- Named-zone rules are intentionally an SDK/adapter concern; the core stores absolute UTC instants.
- Executable parser, clock-fault, TTL, recovery, and compatibility proof remains pending under the named tasks/gates.
- Independent temporal review remains required for `G01`.

## Review

Focused review checked unit/range fit, pre-epoch floor behavior, offset and leap boundaries, date/timestamp non-coercion, clock-domain separation, once-only `now`, TTL equality/cursor pinning, backward regression, forward-skew fail-safe behavior, and replay determinism. No blocking finding remained.

## Reproduction

Check out `0c1db64b8a1606d34e25fe1884b3a8e17089c9c7`, run the commands above from the repository root, and compare all four hashes with this file and [manifest.json](manifest.json).

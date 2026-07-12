# Host Capability ABI 2.0

- Status: Accepted interface/type definition; operations and hosts not implemented
- Last updated: 2026-07-12
- Owner: Runtime architecture owner
- Plan item: `P04-003`
- Governing requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Machine authority: [`helix.host-capability-abi/1`](host-capability-abi-v1.json)
- WIT authority: [`helix:core-abi@2.0.0`](../../wit/helix-core-abi-v2/world.wit)

## Version decision

The accepted P04-001 package `helix:core-abi@1.0.0` is immutable. Adding required imported
interfaces changes the component shape incompatibly, so P04-003 creates `2.0.0` and advances the
negotiated ABI to exact `2.0`; it does not rewrite 1.0 or infer compatibility from SemVer. No deployed compatibility
window exists, and a 1.0 peer fails with `CAP_UNSUPPORTED_VERSION` before resource use.

## Capability identities

Nine imported interfaces define one host-owned, non-forgeable resource identity and a bounded policy
record each:

| Interface | Resource | Frozen policy boundary |
| --- | --- | --- |
| `host-files` | `file-capability` | Namespace, read/write/create/truncate rights, open/file-size ceilings |
| `host-directories` | `directory-capability` | Relative-root enumeration/create/rename/remove rights and depth/list ceilings |
| `host-durability` | `durability-capability` | Memory through data/metadata/directory sync levels and atomic replacement |
| `host-locks` | `lock-capability` | Shared/exclusive, process/machine/backend scope, optional fencing |
| `host-timers` | `timer-capability` | Distinct wall/monotonic availability, resolution, maximum delay |
| `host-randomness` | `randomness-capability` | Request/transaction IDs, nonces, sampling, bounded bytes |
| `host-scheduling` | `scheduling-capability` | In-flight/queue ceilings and cooperative yield without thread authority |
| `host-metrics` | `metrics-capability` | Counter/gauge/histogram, bounded names/labels, no document contents |
| `host-secrets` | `secrets-capability` | Namespace/size bounds and explicit non-enumerable/non-exportable policy |

The resources are nominal authority tokens, not integer handles or ambient namespaces. Paths are
relative to one granted namespace, reject parent traversal, and never reveal a host root. Secret
values cannot enter descriptors, errors, metrics, or logs. Revocation fails closed.

## Deferred operation boundary

P04-003 intentionally defines no capability functions. P04-004 owns coarse asynchronous file,
directory, durability, and lock operations; P04-005 owns resource acquisition/drop; P04-008 owns
cancellation, deadlines, partial I/O, and shutdown; P04-009 owns deterministic injected values.
Mock/native/browser implementations and cross-host conformance remain P04-010 through P04-013.

Networking, object storage, and GPU remain reserved descriptor kinds but gain no concrete interface
in this task. The built WASIp2 component remains empty and the browser module remains import-free;
binding and execution cannot be claimed from an IDL definition.

## Executable enforcement

The checker parses both immutable 1.0 and current 2.0 sources with pinned `wasm-tools` 1.253.0,
requires 12 interfaces, 56 resolved type entries, three control functions, nine capability resources,
11 world imports, and one export, and rejects policy/WIT drift through 27 mutation canaries. Both
WIT revisions are byte/hash-bound by the machine policy.

```bash
corepack npm run host:capabilities:check
corepack npm run host:capabilities:test
```

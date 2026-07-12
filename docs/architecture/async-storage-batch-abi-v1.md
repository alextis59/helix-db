# Asynchronous Storage Batch ABI 3.0

- Status: Accepted operation definitions; bindings and hosts not implemented
- Last updated: 2026-07-12
- Owner: Runtime architecture owner
- Plan item: `P04-004`
- Governing requirements: `CORE-001`, `CORE-002`, `CORE-003`, `INV-004`, `INV-007`, `STORE-001`, `STORE-002`, `SEC-001`, `SEC-002`
- Governing gate: `G04`
- Machine authority: [`helix.async-storage-batch-abi/1`](async-storage-batch-abi-v1.json)
- WIT authority: [`helix:core-abi@3.0.0`](../../wit/helix-core-abi-v3/world.wit)

## Version decision

ABI 2.0 remains immutable. Adding six required imported functions changes the component world
incompatibly, so P04-004 advances directly to exact ABI 3.0. Package SemVer does not create a 2.0
compatibility window; unsupported peers fail before resource use.

## Operation surface

The host surface is exactly six `async func` calls:

| Interface | Operation | Batch input and successful output |
| --- | --- | --- |
| `host-files` | `read-batch` | Relative path/range requests to ordered copied byte results |
| `host-files` | `write-batch` | Relative path/offset/copied-byte requests to ordered completed lengths |
| `host-durability` | `sync-batch` | Relative path/durability-level requests to ordered achieved levels |
| `host-directories` | `rename-batch` | Relative source/destination/replace requests to ordered replacement results |
| `host-directories` | `list-batch` | Relative directories to ordered lists of deterministic entries |
| `host-directories` | `delete-batch` | Relative typed paths to ordered deletion results |

Each call crosses the component boundary once for the entire batch. Every call borrows its explicit
capability and cancellation resource, carries a bounded request ID plus optional idempotency key,
and returns either one result per input in input order or one structured `helix-error`. Mutating
write/rename/delete batches require an idempotency key.

## Bounds and deterministic success

- At most 1,024 requests and 16 MiB of copied transfer data cross in one call.
- List output contains at most 4,096 entries across the batch.
- Request IDs are at most 32 bytes; idempotency keys are at most 64 bytes.
- Successful reads preserve the requested offset and may be short only at end-of-file.
- Successful writes report exactly every request byte; short writes use the error path.
- List entries are unique and sorted by UTF-8 name bytes, independent of host enumeration order.
- A successful batch covers every request. An error releases no success payload.

Mutation ambiguity is carried only by the existing `helix-error.outcome`; a caller must not infer
rollback from cancellation or transport failure. P04-008 defines exact partial-I/O, deadline,
backpressure, and shutdown behavior in ABI 6.0.

## Claim boundary

P04-004 defines WIT operations, not executable bindings. Resource acquisition/drop remains
P04-005, explicit-copy implementation P04-006, failure/cancellation completion rules P04-008, and
mock/native/browser hosts P04-010 through P04-012. The current component remains empty and no
database functionality is added.

## Executable enforcement

Pinned `wasm-tools` 1.253.0 resolves 12 interfaces, 80 type entries, nine total functions, six
async storage functions, 11 imports, and one export. Both ABI 2.0 and 3.0 sources are byte/hash
bound, and 30 policy/resolution mutations must reject.

```bash
corepack npm run storage:batch:check
corepack npm run storage:batch:test
```

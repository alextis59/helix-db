# Browser Host Skeleton

This private workspace directory contains the standards-based TypeScript browser-host skeleton for
ABI 7.0. It provides exact capability grants, bounded host-owned buffers, all 21 imported binding
call shapes, explicit injected capability adapters, runtime feature detection, and guarded core-Wasm
compilation/instantiation.

It is not an installable package. OPFS, IndexedDB, durability, generated Component Model bindings,
GPU execution, shared conformance, and database behavior remain owned by later plan items. See the
[browser host contract](../../docs/architecture/browser-host-skeleton-v1.md) for the exact claim
boundary and verification commands.

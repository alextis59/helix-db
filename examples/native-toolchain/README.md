# Native Toolchain Boundary Example

- Status: Executable boundary example; no database functionality
- Plan item: `P02-016`
- Command: `corepack npm run examples:native`

This standalone Cargo package links the real `helix-host-native` crate without its optional GPU
feature and therefore includes only the required portable-core dependency closure. It emits one JSON report that names
the linked boundary, target architecture/operating system, maturity, empty operation inventory, and
explicit `database_functionality: false` value.

It does not accept a path, document, query, network address, GPU option, or arbitrary Cargo
argument. It creates no file or socket and performs no storage or database operation. A successful
run proves only that the pinned Rust toolchain can compile, link, and execute the current native
boundary skeleton on that host.

Run it through the repository's fixed checker:

```bash
corepack npm run examples:native
```

The lower-level locked/offline command is recorded in [`examples.json`](../examples.json). Public
installation, a native CLI, persistence, server behavior, and packaged release support remain
future `P05-*`, `P11-*`, `P12-*`, and `P16-*` work.

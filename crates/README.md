# Rust Crates

This root contains the unpublished Rust workspace. The exact eight boundary crates, dependency direction, maturity markers, and forbidden edges are defined in the [workspace boundary document](../docs/architecture/workspace-boundaries.md).

No crate name or `0.0.0` skeleton is a public package or database-functionality claim.

`npm run test:unit` is the stable workspace unit entry point. It runs every Rust library test with all features and separately reports the still-empty JavaScript unit inventory.

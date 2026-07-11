# Toolchain Profile Checks

This directory contains bounded verification entry points for the build profiles selected by `P02-005`.

- `run-build-profile.mjs` runs exactly one named Rust build/instrumentation profile with fixed Cargo arguments.
- `check-browser-profile.mjs` resolves the pinned Vite production configuration without creating a bundle.
- `check-dependency-policy.mjs` reconciles Cargo metadata and the complete npm lock with the machine policy.
- `dependency-policy.json` is the exact source/license/lifecycle/duplicate/unsafe exception authority.

These checks prove toolchain configuration only. Stable unit, integration, conformance, fuzz, browser, crash, benchmark, and distributed commands are added under `P02-007`; real bundles and browser execution remain `P02-010`/`P02-016` work.

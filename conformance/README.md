# Conformance Suites

This root owns cross-backend suite definitions, runner configuration, and bindings to canonical fixtures.

- `semantics/` binds the frozen semantic corpus to implementations.
- `formats/` will validate persistent/public encodings and version handling.
- `host/` will validate portable host-capability behavior.
- `compatibility/` will validate explicitly claimed upstream/adapter subsets.

Canonical Phase 1 semantic inputs remain under [`fixtures/semantic/`](../fixtures/semantic/README.md). Conformance code references that corpus and must not fork it into a second mutable copy.

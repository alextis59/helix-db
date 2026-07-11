# Fixture Roots

- [`semantic/`](semantic/README.md) contains the frozen v1 semantic corpus, schemas, coverage, and oracle report.
- [`generation/`](generation/README.md) contains the deterministic generator registry, committed seeds, portable PRNG vectors, and aggregate report.

Canonical fixture inputs and generated outputs remain versioned separately. A generator may consume a canonical source, but it cannot silently overwrite the source of its own expected behavior.

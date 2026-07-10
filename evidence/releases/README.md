# Release Evidence

This root indexes immutable proof for release candidates and published versions. Task and phase-gate evidence remains in sibling `phase-NN/` directories.

Each future release directory must identify the exact source commit/tag; package, image, and binary digests; SBOM/provenance/signatures; supported-platform tests; clean installation; upgrade/rollback; backup/restore; compatibility; known issues; and approval records. Large artifacts live in an approved immutable store and are referenced by hash.

No release candidate, package, or production-readiness claim exists yet.

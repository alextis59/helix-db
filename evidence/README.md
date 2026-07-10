# Implementation Evidence

This directory is the durable index for proof used to check `ImplementationPlan.md` items and phase gates. Evidence must let another maintainer reproduce or independently assess a claim without relying on transient terminal output.

## Directory convention

```text
evidence/
  README.md
  templates/
  phase-00/
    P00-006/
      README.md
      manifest.json
    G00/
      README.md
      manifest.json
  phase-01/
    ...
```

Use lowercase `phase-NN` directories and the exact stable task or gate ID. One directory may index several artifacts produced by the same task, but evidence for different checklist items remains independently addressable.

Small, reviewable evidence is committed directly. Large binary corpora, long fuzz outputs, browser recordings, benchmark datasets, container images, and release packages may live in an approved artifact store. Their committed manifest must record immutable hashes, size, retention location, access requirements, and reproduction commands.

## Required task evidence

Every checked implementation task records:

- Task ID, title, and governing requirement IDs.
- Commit under test and clean/dirty worktree state.
- Date in UTC and tool/runtime versions.
- Relevant operating system, architecture, browser, device, GPU, driver, storage, and network profile.
- Exact commands and meaningful configuration/environment inputs.
- Exit status and summarized result.
- Paths and SHA-256 hashes for produced artifacts.
- Focused tests plus affected broader suites.
- Known limitations, skipped tests, and accepted ADRs.
- Reviewer identity/role and review date when required.

Checking an item and adding its evidence occur in the same commit unless the evidence is generated from the committed artifact itself. In that case, the immediate follow-up evidence commit references the exact immutable commit/package hash and the checklist remains open until that commit lands.

## Required gate evidence

A phase gate directory contains:

- A complete list of phase task IDs and their evidence links.
- Requirement-ledger rows governed by the gate.
- Accepted ADRs and unresolved risks.
- All mandated conformance, recovery, security, compatibility, benchmark, package, install, backup, restore, or distributed reports.
- Independent review findings and dispositions.
- A gate verdict with the exact artifact/commit set reviewed.

Gate evidence is additive. Do not rewrite a failed gate attempt; preserve it under a dated subdirectory and add a later attempt.

## Evidence classes and retention

| Class | Examples | Repository rule | Minimum retention |
| --- | --- | --- | --- |
| Normative fixtures | HDoc vectors, protocol fixtures, semantic cases | Commit source and expected hashes | Permanent |
| Correctness reports | Differential results, model histories, index validation | Commit compact report and replay inputs | Permanent for every release line |
| Recovery reports | Crash matrix, restore, migration interruption | Commit report, seeds, fault points, hashes | Permanent for every persistent version |
| Security evidence | Threat models, control tests, review dispositions | Commit redacted report; restrict exploit detail if needed | Supported release lifetime plus incident policy |
| Compatibility evidence | Executable matrices, protocol captures, upstream versions | Commit matrix and reproducible generators | Permanent for every claimed adapter version |
| Benchmarks | Raw results, dataset manifests, environment profiles | Commit manifests/summary; hash large raw data | All published claims and release baselines |
| Browser/device evidence | Capability profiles, lifecycle/quota runs | Commit structured report; hash large recordings | Supported platform/version lifetime |
| Distributed evidence | Simulation histories, Jepsen results, movement traces | Commit checker output and replay configuration | Permanent for every consistency claim |
| Release evidence | Package contents, SBOM, provenance, signatures, install/restore proof | Commit manifests and immutable public links | Permanent |

Evidence required to support a published semantic, durability, consistency, compatibility, security, or performance claim is never deleted merely because a newer result exists.

## Artifact integrity

- Use SHA-256 for repository evidence manifests unless an accepted ADR selects an additional hash.
- Record byte size and media type.
- Store raw tool output before post-processing when practical.
- Record the generator version or source commit.
- Keep deterministic seeds and minimal replay cases.
- Do not cite mutable “latest” URLs as sole evidence.
- Published packages and containers use their registry digest in addition to file hashes.

## Sensitive evidence

Do not commit secrets, tokens, private keys, raw customer data, exploitable unpatched details, or unredacted tenant identifiers.

Sensitive evidence uses an access-controlled store with a committed redacted manifest containing:

- Classification and owner.
- Immutable artifact hash.
- Storage location identifier without credentials.
- Authorized reviewer roles.
- Retention and deletion rule.
- Public/redacted conclusion.

Redaction must not remove the facts needed to evaluate the gate verdict.

## Benchmark-specific rules

A benchmark manifest records dataset generator/seed, workload, scale, selectivity, result size, backend, residency, warm-up, repetitions, raw distributions, configuration, hardware/software profile, and all transfer/verification stages. A summary without raw result linkage cannot support a performance claim.

Cold, warm-host, and GPU-resident results remain distinct. Failed and fallback runs are retained, not filtered from the report.

## Verification

Before checking a task:

1. Re-run the recorded command from the stated commit or artifact.
2. Verify every committed and external artifact hash.
3. Confirm the report describes failures and skips.
4. Confirm the requirement and plan links resolve.
5. Confirm no sensitive material is present.
6. Update the requirement ledger and progress counts.

Use [the task evidence template](templates/task-evidence.md) and [manifest example](templates/manifest.example.json) until automated evidence tooling replaces them.

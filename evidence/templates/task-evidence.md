# TASK-ID: Evidence title

- Task: `TASK-ID`
- Requirements: `REQ-ID`
- Commit or artifact: `FULL_HASH_OR_DIGEST`
- Recorded at: `YYYY-MM-DDTHH:MM:SSZ`
- Recorder: `ROLE_OR_MAINTAINER`
- Reviewer: `ROLE_OR_MAINTAINER`
- Verdict: Pass / Fail / Incomplete

## Scope

Describe exactly what behavior or artifact this evidence proves and what it does not prove.

## Environment

```text
OS:
architecture:
CPU:
memory:
storage:
Rust:
Node:
browser:
GPU/driver:
other tools:
```

Omit irrelevant fields and add task-specific capability/version data.

## Commands

```bash
exact command
```

Record material environment variables and configuration without secrets.

## Results

Summarize exit status, counts, timings, result hashes, recovered state, compatibility differences, or security findings. Link raw artifacts through `manifest.json`.

## Artifacts

| Path or immutable locator | SHA-256/digest | Bytes | Purpose |
| --- | --- | --- | --- |
| `path` | `hash` | 0 | Description |

## Failures, skips, and limitations

- None, or describe every failure/skip and why it does not invalidate the stated verdict.

## Review

Record the independent checks performed, findings, and disposition. A phase gate links the review that accepted this evidence.

## Reproduction

Describe setup and teardown not captured by the command, including how to regenerate fixtures and verify hashes.

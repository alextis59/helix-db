# G02 Toolchain Gate Evidence

- Gate status: Open
- Checklist state: Unchecked
- Current blocker: first hosted green CI results do not exist for the reviewed local source

## Attempts

| Attempt | Reviewed commit | Verdict | Blocking finding |
| --- | --- | --- | --- |
| [2026-07-11 hosted evidence missing](attempts/2026-07-11-hosted-evidence-missing/README.md) | `2c252e0b8663fae198c15bef833417c8dd4c6dfe` | Blocked | No hosted workflow, artifact-service, or non-Linux runner evidence |

All 17 Phase 2 task evidence manifests and the complete local clean replay pass. The gate remains
open because [`continuous-integration.md`](../../../docs/architecture/continuous-integration.md)
requires the first hosted green results and an independent review. A superseding attempt must retain
immutable run/job/artifact evidence for the exact pushed source; it must not rewrite the blocked
attempt.

# Threat Model: SYSTEM OR FEATURE

- Status: Draft
- Owner: Security owner
- Reviewers: Domain owners
- Date: YYYY-MM-DD
- Applies to versions/phases: VERSION OR GATE
- Requirements/tasks: `SEC-ID`, `TASK-ID`
- Related ADRs: ADR links

## Executive conclusion

Summarize the protected behavior, highest risks, release blockers, accepted residual risk, and the gate this model informs. Do not declare a system secure merely because controls are planned.

## Scope

### Included

- Components, deployments, APIs, formats, data flows, identities, devices, and operational paths assessed.

### Excluded

- Explicit exclusions, why they are excluded, and the model that owns them.

## Security objectives

- Confidentiality objectives.
- Integrity objectives.
- Availability and bounded-resource objectives.
- Authentication and authorization objectives.
- Tenant, process, Wasm, GPU, node, and backup isolation objectives.
- Audit, detection, response, recovery, and non-repudiation objectives.

Link each objective to a specification requirement and executable evidence obligation.

## Assets and sensitivity

| Asset | Classification | Owner | Required protections | Recovery source |
| --- | --- | --- | --- | --- |
| Example | Public/Internal/Confidential/Secret | Role | Controls | Artifact or process |

Include canonical documents, WAL/files, indexes/sidecars, credentials, keys, tokens, tenant metadata, GPU buffers, logs/traces, backups, plugins, configuration, build/release artifacts, and control-plane state where applicable.

## Actors and trust assumptions

| Actor | Legitimate capabilities | Potentially malicious behavior | Trust assumptions |
| --- | --- | --- | --- |
| Client | ... | ... | ... |

Consider unauthenticated clients, tenant users, tenant admins, cluster operators, node processes, browser scripts/extensions, plugins/UDFs, compromised hosts, dependency/build systems, object stores, and external identity/key providers.

Every assumption must be testable or explicitly accepted as environmental risk.

## Architecture and data flows

Provide a diagram and enumerate flows with protocols, authentication, encryption, authorization, data classes, persistence, logging, quotas, cancellation, and failure behavior.

```text
actor
  → trust boundary
  → component
  → persistent/device/external resource
```

## Trust boundaries and capabilities

| Boundary | Entry points | Granted capabilities | Validation | Isolation/cleanup | Audit |
| --- | --- | --- | --- | --- | --- |
| Example | ... | ... | ... | ... | ... |

Explicitly assess:

- Client/server and adapter boundaries.
- Node-to-node and control-plane boundaries.
- Wasm core/plugin to host capabilities.
- Host to filesystem, object store, key service, and GPU device.
- Tenant-to-tenant resource reuse.
- Browser origin, worker, storage, and sync-token boundaries.
- Build/sign/package/deploy supply chain.

## Threat inventory

| ID | Threat | Preconditions | Impact | Severity | Existing controls | Required work | Detection/evidence | Residual risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `TM-001` | Threat statement | ... | ... | Critical/High/Medium/Low | ... | Task IDs | Test/artifact | ... |

Assess at minimum:

- Spoofing and credential/token theft.
- Authorization and tenant-isolation bypass.
- Tampering with commands, files, logs, backups, manifests, kernels, plugins, and releases.
- Repudiation and audit gaps.
- Data disclosure through storage, logs, diagnostics, GPU memory, timing, errors, backups, and crashes.
- CPU, memory, disk, GPU, queue, network, cursor, regex, aggregation, sync, and compaction denial of service.
- Elevation through plugins, Wasm capabilities, shaders, parsers, dependencies, host calls, and administrative APIs.
- Rollback, downgrade, replay, duplicate, stale-epoch, and confused-deputy attacks.
- Supply-chain and provenance compromise.

## Abuse and failure cases

Describe concrete attacker/user stories and expected safe behavior. Include malformed/truncated data, oversized requests, cancellation, device loss, quota exhaustion, key unavailability, certificate expiry, compromised tenant credentials, stale clients, and partial upgrades.

## Controls

### Preventive

- Input validation, typed errors, authentication, authorization, encryption, capability restriction, quotas, signatures, version negotiation, and safe defaults.

### Detective

- Audit events, metrics, alerts, integrity checks, provenance verification, anomaly detection, and diagnostics.

### Recovery

- Disablement, key/token rotation, restore, rollback, isolation, tenant suspension, node drain, artifact revocation, and incident workflows.

## Secrets and cryptographic material

Document creation, storage, access, rotation, revocation, expiry, backup, logging prohibition, compromise response, and unavailable-key behavior. State which material may enter Wasm or GPU memory and why.

## Resource and tenant isolation

List all accounted resources, owner identifiers, admission rules, hard/soft limits, cleanup, cross-tenant reuse hygiene, and noisy-neighbor tests.

## Logging, diagnostics, and privacy

Define allowed fields, prohibited data, redaction, retention, access, export, tenant correlation, and how useful evidence is preserved without leaking values or credentials.

## Validation plan

- [ ] Unit and policy tests.
- [ ] Authentication and authorization corpus.
- [ ] Malformed-input and parser fuzzing.
- [ ] Capability-denial and sandbox tests.
- [ ] Resource/quota/denial-of-service tests.
- [ ] Encryption/key/backup/restore scenarios.
- [ ] Cross-tenant and buffer-reuse tests.
- [ ] Static/dependency/secret/provenance scans.
- [ ] Independent security review.
- [ ] Incident and emergency-disablement exercise.

Replace generic items with stable task/evidence IDs.

## Residual risk and acceptance

List each accepted risk, severity, owner, affected release, mitigation, detection, workaround, review date, and accepted ADR. Critical/High risk cannot be accepted merely to ship.

## Change triggers

This model must be revisited when trust boundaries, formats, protocols, auth, keys, plugins, GPU scheduling, tenant behavior, dependencies, deployment topology, or release artifacts change.

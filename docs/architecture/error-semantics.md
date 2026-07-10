# Stable V1 Error Categories, Codes, Outcomes, and Retry Semantics

- Status: Accepted semantic baseline
- Registry version: `errors-v1`
- Last updated: 2026-07-10
- Owner: Query semantics owner
- Plan item: `P01-016`
- Governing requirements: `QUERY-002`, `STORE-001`, `GPU-004`, `SEC-001`
- Governing gate: `G01`
- Decision: [ADR 0009](../adr/0009-use-versioned-error-codes-and-outcomes.md)

This document defines the stable native error taxonomy/envelope, code registry, primary-error precedence, mutation outcome certainty, retry scope, redaction, observability, and compatibility mapping. Machine behavior depends on category/code/outcome/retry metadata, never message text.

## Error envelope

Conceptual versioned envelope:

```text
ErrorV1 {
  schema_version: 1
  registry: errors-v1
  category: ErrorCategory
  code: StableErrorCode
  message: safe human summary
  request_id: opaque ID
  trace_id: optional opaque ID
  error_id: opaque diagnostic ID
  phase: ErrorPhase
  outcome: OutcomeCertainty
  retry: RetryAdvice
  details: bounded code-specific object
  causes: bounded [ErrorV1Cause]
}
```

Rules:

- `category` and `code` are stable machine identifiers.
- `registry` selects the code/metadata registry; schema version and registry version evolve independently.
- `message` is safe/localizable/non-normative and may improve without version change.
- `request_id` correlates client attempts; `error_id` locates diagnostics without exposing internals.
- `details` uses only the code's registered schema and is size/depth/redaction bounded.
- Causes contain category/code/phase/error ID and safe details, not recursive unbounded full envelopes; maximum cause depth/count is 8.
- Unknown additive detail keys must be ignored by compatible clients; unknown category/code is handled as nonretryable unless negotiated metadata safely says otherwise.
- Success responses never embed errors as success-looking values for failed atomic commands.

## Stable categories

Exact lowercase category values:

| Category | Meaning |
| --- | --- |
| `parse` | Bytes/framing/text/typed representation could not become a command value |
| `validation` | Parsed command/value/schema/path/operator/options are structurally or semantically invalid |
| `type` | Valid operation encountered or requested an incompatible/out-of-domain typed value/arithmetic |
| `conflict` | Valid operation conflicts with concurrent/state/idempotency/snapshot/transaction state |
| `uniqueness` | Primary/secondary/generated identifier uniqueness could not be satisfied |
| `authorization` | Authentication, credential, scope, policy, or permission denied |
| `capability` | Requested version/feature/host/storage/GPU/clock/format capability unavailable/unsupported |
| `quota` | Hard semantic or configured resource/rate/size/count/storage/memory/concurrency limit exceeded |
| `deadline` | Deadline, cancellation, cursor expiry, or bounded-wait expiry stopped work |
| `durability` | I/O, sync, space, corruption, recovery, backup/restore, or acknowledgement durability failure |
| `internal` | Invariant/bug/panic/unexpected serialization/runtime failure not attributable to valid user behavior |

Categories are exhaustive in `errors-v1`. Specific codes disambiguate behavior; a client must not infer retryability from category alone.

## Error phases

Stable phase values:

```text
wire decode validate authorize admit snapshot plan execute
commit acknowledge cursor backup restore recover internal
```

The phase records where the primary error became authoritative, not every stack frame. Adapter/protocol layers may add their transport phase in a cause while preserving the native phase/code.

## Outcome certainty

Exact outcome values:

| Outcome | Meaning |
| --- | --- |
| `not_applicable` | Operation is read-only or outcome is not a mutation claim |
| `not_committed` | Engine proves the requested atomic mutation did not commit |
| `committed` | Engine proves mutation committed at the reported concern boundary despite response-side error |
| `unknown` | Engine cannot currently prove commit/abort at the requested boundary; caller must use idempotency/status recovery |

`no_effect` is represented as a successful command with zero counts, not an error outcome. Errors before write commit are `not_committed`; timeout/disconnect/fsync failures near an acknowledgement boundary may be `unknown`; a post-commit serialization failure may be `committed` if the retry record proves it.

Clients must not retry an `unknown` write as a fresh command. They reuse the same idempotency/session/transaction identity or query status.

## Retry advice

```text
RetryAdvice {
  retryable: bool
  scope: never | same_request | same_idempotency_key | new_snapshot
       | after_delay | after_capability_change | after_operator_action
  min_delay_ms: optional nonnegative integer
  max_attempts_hint: optional positive integer
  retry_token: optional opaque bound token
}
```

Advice is code/outcome-specific and security bounded:

- `same_request` means replay the identical idempotent read/control request with its bound retry token and existing snapshot/session state.
- Input/schema/type errors are generally `never` until the request changes.
- Write conflicts may use `new_snapshot` or `same_idempotency_key` under a bounded policy.
- Quota/rate/deadline/capability errors may require delay, smaller work, longer deadline, or operator action.
- Unknown write outcomes require the same idempotency key/token.
- Internal errors default nonretryable automatically; operators may diagnose/recover before retry.
- SDKs enforce attempt/deadline/backoff ceilings and never retry non-idempotent writes from category guesses.
- Every write retry preserves the original idempotency/session/transaction identity even when another scope such as `new_snapshot`, `after_delay`, or `after_capability_change` describes the required state change.

## Stable code registry

Codes are uppercase ASCII, never reused, and keep their registered category/meaning/outcome semantics. Prefix is mnemonic; category field remains authoritative.

### Parse (`parse`)

| Code | Meaning |
| --- | --- |
| `PAR_MALFORMED_ENVELOPE` | Invalid framing/envelope/header |
| `PAR_TRUNCATED_INPUT` | Input ended before a complete value/frame |
| `PAR_INVALID_JSON` | JSON lexical/syntactic failure |
| `PAR_INVALID_CBOR` | CBOR/binary syntax/tag failure |
| `PAR_INVALID_UTF8` | Text/name/pattern is not canonical valid UTF-8 |
| `PAR_INVALID_TYPED_VALUE` | Typed wrapper/tag/payload cannot decode to its declared logical type |
| `PAR_COMPRESSION_FAILED` | Compressed command cannot be safely decoded |

### Validation (`validation`)

| Code | Meaning |
| --- | --- |
| `VAL_UNKNOWN_COMMAND` | Command name not recognized |
| `VAL_UNKNOWN_OPTION` | Option/flag not recognized for command/version |
| `VAL_UNKNOWN_OPERATOR` | Query/update/stage/expression operator not recognized |
| `VAL_INVALID_SHAPE` | Object/array/operand/envelope shape invalid |
| `VAL_INVALID_LITERAL` | Literal form/range/spelling invalid independent of stored row |
| `VAL_INVALID_FIELD_NAME` | Field name violates `limits-v1` grammar |
| `VAL_INVALID_PATH` | Dotted path syntax/index/protected traversal invalid |
| `VAL_PROTECTED_FIELD` | Client attempted protected `_id`/metadata mutation |
| `VAL_DUPLICATE_FIELD` | Duplicate decoded object/command/output field |
| `VAL_CONFLICTING_PATHS` | Update/projection paths conflict |
| `VAL_SCHEMA_MISMATCH` | Document fails an accepted schema |
| `VAL_RESOURCE_NOT_FOUND` | Authorized addressed database/collection/index/resource absent |
| `VAL_UNSUPPORTED_COMBINATION` | Individually known options/operators cannot compose in this profile |

### Type (`type`)

| Code | Meaning |
| --- | --- |
| `TYPE_MISMATCH` | Present value is not the required logical type/domain |
| `TYPE_COERCION_LOSS` | Implicit/exact requested conversion would lose information |
| `TYPE_NUMERIC_OVERFLOW` | Numeric result exceeds supported upper domain |
| `TYPE_NUMERIC_UNDERFLOW` | Numeric result exceeds supported lower/tiny domain policy |
| `TYPE_INVALID_SPECIAL` | NaN/infinity/signed/special state invalid for this type/operator |
| `TYPE_TEMPORAL_RANGE` | Date/timestamp/offset/conversion outside accepted domain |
| `TYPE_VECTOR_DIMENSION` | Vector family/dimension mismatch or invalid dimension |
| `TYPE_VECTOR_ZERO_NORM` | Operation requires a nonzero vector norm |
| `TYPE_EXPRESSION_MISSING` | Expression attempted to materialize Missing where a value is required |

### Conflict (`conflict`)

| Code | Meaning |
| --- | --- |
| `CON_WRITE_CONFLICT` | Snapshot/version changed under a write |
| `CON_IDEMPOTENCY_MISMATCH` | Same idempotency key bound to different command/scope |
| `CON_TRANSACTION_STATE` | Operation invalid for transaction/session state |
| `CON_SNAPSHOT_EXPIRED` | Required snapshot no longer retained |
| `CON_CURSOR_STATE` | Cursor token/sequence/state conflicts with request |
| `CON_STALE_EPOCH` | Future range/routing epoch is stale |
| `CON_RETRY_EXHAUSTED` | Bounded semantic/state retry attempts exhausted |

### Uniqueness (`uniqueness`)

| Code | Meaning |
| --- | --- |
| `UNQ_PRIMARY_DUPLICATE` | Equal root `_id` already exists/conflicts |
| `UNQ_SECONDARY_DUPLICATE` | Unique secondary key conflicts |
| `UNQ_GENERATED_ID_EXHAUSTED` | Generated ID collision/sequence attempts exhausted |

### Authorization (`authorization`)

| Code | Meaning |
| --- | --- |
| `AUTH_UNAUTHENTICATED` | No valid authenticated principal |
| `AUTH_CREDENTIAL_EXPIRED` | Token/key/session credential expired/revoked |
| `AUTH_FORBIDDEN` | Principal lacks requested action |
| `AUTH_SCOPE_DENIED` | Credential/session/tenant/resource scope mismatch |
| `AUTH_POLICY_DENIED` | Document/field/administrative policy denies operation |

### Capability (`capability`)

| Code | Meaning |
| --- | --- |
| `CAP_UNSUPPORTED_FEATURE` | Requested feature is outside the negotiated semantic profile |
| `CAP_UNSUPPORTED_VERSION` | Envelope/protocol/format/registry version is unsupported |
| `CAP_HOST_UNAVAILABLE` | Required host capability is absent or unavailable |
| `CAP_STORAGE_UNAVAILABLE` | Required storage capability/backend is unavailable |
| `CAP_GPU_UNAVAILABLE` | Requested GPU execution cannot run and policy forbids CPU fallback |
| `CAP_GPU_DEVICE_LOST` | GPU device was lost and bounded fallback/recovery did not complete |
| `CAP_CLOCK_UNSAFE` | Required wall/monotonic/logical clock guarantee is unavailable |
| `CAP_FORMAT_UNSUPPORTED` | Persistent/import/export/backup format cannot be safely consumed |

### Quota (`quota`)

| Code | Meaning |
| --- | --- |
| `QUOTA_LIMIT_EXCEEDED` | Named semantic/configured size/count/work limit exceeded |
| `QUOTA_RATE_LIMITED` | Request/rate budget exhausted |
| `QUOTA_MEMORY` | Host/tenant/operation memory budget exhausted |
| `QUOTA_STORAGE` | Storage capacity or tenant allocation exhausted without a lower-level durability fault |
| `QUOTA_CONCURRENCY` | Connection/session/transaction/cursor/work concurrency budget exhausted |
| `QUOTA_GPU` | GPU memory/work/dispatch budget exhausted and fallback policy cannot satisfy the command |
| `QUOTA_RESULT` | Result/batch/group/sort/intermediate output budget exceeded |

### Deadline (`deadline`)

| Code | Meaning |
| --- | --- |
| `DEADLINE_EXCEEDED` | Request/operation deadline expired |
| `DEADLINE_CANCELLED` | Authorized caller/system cancellation stopped work |
| `DEADLINE_CURSOR_EXPIRED` | Cursor lifetime/idle/snapshot retention deadline expired |

### Durability (`durability`)

| Code | Meaning |
| --- | --- |
| `DUR_IO` | Read/write/rename/metadata I/O failed |
| `DUR_SYNC` | Requested sync/write-concern boundary could not be proven |
| `DUR_NO_SPACE` | Durable storage could not allocate required bytes |
| `DUR_CORRUPTION` | Hash/checksum/structure/invariant proves durable artifact corruption |
| `DUR_RECOVERY_REQUIRED` | Safe service requires WAL/manifest/storage recovery or repair first |
| `DUR_ACK_UNKNOWN` | Commit may have occurred but acknowledgement outcome cannot be proved |
| `DUR_BACKUP_INVALID` | Backup creation/verification cannot produce a valid complete artifact |
| `DUR_RESTORE_INVALID` | Restore input/result cannot be proved complete and valid |

### Internal (`internal`)

| Code | Meaning |
| --- | --- |
| `INT_INVARIANT` | Engine invariant failed outside a classified corruption case |
| `INT_PANIC` | Panic/trap/unhandled runtime failure was contained |
| `INT_SERIALIZATION` | Internal result/state could not be encoded despite valid inputs |
| `INT_UNEXPECTED` | Unexpected implementation failure has no safer registered classification |

## Registered detail shapes

Every code selects one category-level base shape and may further restrict its fields. Values remain bounded by `limits-v1`; byte offsets/counts use nonnegative integers and never expose raw input.

| Category | Permitted detail fields |
| --- | --- |
| `parse` | `format`, `byte_offset`, `frame_index`, `expected_token_class` |
| `validation` | `field_path`, `operator`, `option`, `limit_id`, `expected_shape` |
| `type` | `field_path`, `operator`, `expected_types`, `actual_type`, `numeric_domain`, `dimension_expected`, `dimension_actual` |
| `conflict` | `resource_kind`, `snapshot_version`, `current_version`, `retry_token`, `batch_index` |
| `uniqueness` | `index_id`, `key_digest`, `batch_index`, `generated_attempts` |
| `authorization` | `action`, `required_scope`, `policy_id`; resource existence/value/path details are omitted when disclosure is not authorized |
| `capability` | `feature_id`, `requested_profile`, `available_profile`, `fallback_policy`, `device_class` |
| `quota` | `limit_id`, `maximum`, `observed`, `unit`, `retry_after_ms`; tenant/global utilization is not exposed |
| `deadline` | `deadline_ms`, `elapsed_ms`, `phase`, `cursor_id_digest` |
| `durability` | `concern`, `artifact_kind`, `artifact_digest`, `recovery_action`, `outcome` |
| `internal` | No implementation text/stack in the client envelope; only `error_id` and optional public `incident_class` |

`field_path` is a normalized escaped path only when the caller may observe it. `index_id`, resource IDs, cursor IDs, keys, commands, and artifacts use stable public IDs or one-way keyed digests—not raw tenant data. Numeric limit values are exposed only for the caller's own effective limit.

## Deterministic primary-error selection

A command returns one primary error. Additional causes are diagnostic context and never competing outcomes. The authoritative primary error is selected by the first applicable precedence class, independent of map iteration, backend, device, worker scheduling, or batch parallelism:

1. Wire/framing/decompression and parse failures, at the lowest input byte/frame offset.
2. Static command/value/limit/path/operator validation, by canonical command field/operator/path order.
3. Authentication and authorization. These precede resource lookup or data-dependent diagnostics when required to prevent an existence oracle.
4. Admission capability, quota, cancellation, and already-expired deadline checks, in category/code order.
5. Snapshot/session/cursor acquisition and logical/physical planning failures.
6. Target-dependent execution errors, by stable input batch index, then canonical document key/path, then stable code—not worker completion order.
7. Commit, durability, and acknowledgement failures, using the actual mutation outcome certainty.
8. Contained internal invariant/runtime failure when no more specific safe classification is authoritative.

Within a precedence class, stable code ASCII order is the final tie breaker unless the command contract names a more specific order. Validation may collect bounded diagnostics, but returns the deterministic first as primary. Native multi-document writes in the v1 atomic range fail as one unit: one target error aborts all targets and the response reports `not_committed` unless commit outcome is genuinely uncertain.

An optimized/GPU path may discover a later error first internally, but must drain/verify enough bounded reference state to select the same primary error as the CPU reference path or abandon the optimized path before publication.

## Outcome and retry matrix

The registry implementation stores a default phase/outcome/retry record per code. Runtime state may narrow retryability or change an applicable write outcome only when it has proof from the commit/idempotency record.

| Situation | Outcome | Retryable | Required scope |
| --- | --- | --- | --- |
| Parse/validation/type error before a recognized write | `not_committed` | No | `never`; change command |
| Input cannot identify an operation class | `not_applicable` | No | `never`; repair envelope/input |
| Read-only command error | `not_applicable` | Code-specific | Never imply mutation status |
| Authentication/authorization denial | `not_committed` or `not_applicable` | No automatic retry | `never`; obtain valid authority outside the SDK loop |
| Write conflict with no commit | `not_committed` | Yes when bounded policy permits | `new_snapshot` or `same_idempotency_key` |
| Rate/concurrency quota with no admission | `not_committed` or `not_applicable` | Maybe | `after_delay` with a bounded hint |
| Unsupported/missing capability with no fallback | `not_committed` or `not_applicable` | Only after environment change | `after_capability_change` |
| Deadline/cancellation before commit | `not_committed` | Only if caller supplies a new adequate deadline | Same idempotency identity for writes |
| Commit proven, response encoding/transport fails | `committed` | Response/status recovery only | `same_idempotency_key` |
| Commit/ack boundary cannot be proven | `unknown` | Status/idempotent recovery only | `same_idempotency_key`, never a fresh write |
| Corruption/recovery/internal invariant | State-specific | No automatic retry | `after_operator_action` or `never` |

`DUR_ACK_UNKNOWN` always has `outcome: unknown` unless a later status lookup returns a separate conclusive success/error response. A selected write concern that fails before commit uses `not_committed`; after commit, the engine must not lie by reporting it as aborted.

## Redaction and disclosure rules

- Client `message`, `details`, and `causes` never contain credentials, tokens, encryption material, document values, query literals, raw keys, raw command/input bytes, filesystem paths, stack traces, host addresses, tenant identifiers, or unescaped attacker-controlled text.
- Public messages come from registered templates. Dynamic identifiers are opaque public handles or bounded escaped/digested values.
- Authorization may deliberately return the same `AUTH_FORBIDDEN` response for absent and forbidden resources. Only an authorized caller receives `VAL_RESOURCE_NOT_FOUND`.
- Parse diagnostics expose safe location/token classes, not neighboring raw input.
- Internal logs/traces may contain richer restricted diagnostics keyed by `error_id`, but follow data-classification, retention, access, and evidence-redaction policy.
- Cause chains are cycle-free, maximum eight entries/depth, deterministically ordered, and truncated with an internal diagnostic flag that is never client-controlled.

## Protocol, SDK, and adapter mapping

The native envelope is authoritative. HTTP, gRPC, CLI/process exits, language exceptions, Mongo/Redis-style adapters, and future node protocols map it without changing native `category`, `code`, `phase`, `outcome`, or retry advice.

| Native category | Default HTTP class | Default gRPC class |
| --- | ---: | --- |
| `parse`, `validation`, `type` | 400 | `INVALID_ARGUMENT` |
| `authorization` unauthenticated/authenticated | 401/403 | `UNAUTHENTICATED`/`PERMISSION_DENIED` |
| `uniqueness`, `conflict` | 409 | `ALREADY_EXISTS`/`ABORTED` |
| `capability` | 400 or 503 by code/state | `UNIMPLEMENTED` or `UNAVAILABLE` |
| `quota` | 429 or 413/507 by code | `RESOURCE_EXHAUSTED` |
| `deadline` | 408/499/410 by code | `DEADLINE_EXCEEDED`/`CANCELLED`/`FAILED_PRECONDITION` |
| `durability` | 500 or 503 by state | `DATA_LOSS`, `FAILED_PRECONDITION`, or `UNAVAILABLE` |
| `internal` | 500 | `INTERNAL` |

Transport status is lossy presentation, not the semantic contract. Each transport profile publishes an exact code-level mapping later; the table above is only the default class. HTTP response bodies and gRPC status details carry `ErrorV1`; SDK exceptions expose it as structured fields. An adapter may translate to an upstream error number/name only when its compatibility matrix defines the mapping, and must retain the native envelope in a diagnostic extension where the protocol permits.

A transport disconnect has no envelope and therefore no claimed outcome; SDKs resolve it through the idempotency/status protocol. Adapter wording or upstream numeric codes never become native stable identifiers.

## Observability and cardinality

- Metrics label only stable low-cardinality `category`, `code`, `phase`, `outcome`, operation class, and deployment/backend class.
- Metrics/logs/traces never label raw message, path, key, resource, request, error, user, or tenant IDs.
- Logs and traces correlate through `request_id`, `trace_id`, and `error_id`; these are fields, not metric labels.
- Retry/fallback observations record attempt number, selected scope, final code/outcome, and whether CPU reference fallback occurred.
- Every durability `unknown`, corruption, invariant, device-loss-without-fallback, and redaction failure emits an auditable operational event.

## Registry and compatibility rules

- Registry identifier is `errors-v1`; every protocol/SDK capability manifest advertises supported envelope/registry versions.
- A code is never deleted/reused within a supported registry. Adding a code with conservative unknown-client behavior is additive.
- Changing a code's category, meaning, default outcome, retry safety, detail interpretation, precedence, or disclosure is breaking and requires a new registry/envelope profile plus migration/compatibility review.
- Messages may change without version change; clients must not match them.
- Unknown detail keys are ignored. Unknown codes/categories default to nonretryable; unknown write outcome defaults to `unknown`, never `not_committed`.
- Persisted retry/idempotency/error-status records store stable code/outcome/registry version, not only localized text or host exception types.
- Proxies/adapters preserve unknown structured values whenever the transport can; they never remap unknown errors to success.

## Required conformance fixtures

`P01-018`–`P01-020` must provide language-neutral cases for:

- every registered category and code with schema-valid safe details;
- malformed/truncated/invalid UTF-8 inputs and deterministic offsets;
- competing parse/validation/auth/admission/target/commit failures and exact precedence;
- parallel batch failures proving input-index rather than completion ordering;
- read-only, proved-abort, proved-commit, and unknown mutation outcomes;
- retry scopes/tokens and an SDK refusing unsafe fresh-write retry;
- redaction canaries for secrets, values, paths, IDs, filesystem/stack text, and malicious control characters;
- bounded/cyclic/deep cause handling;
- CPU/GPU/fallback and native/Wasm/browser/server equivalence;
- HTTP/gRPC/SDK/adapter round trips preserving the native envelope;
- unknown future code/detail handling and registry negotiation.

Silent success, incorrect result, unsafe retry advice, false `not_committed`/`committed` claims, nondeterministic primary codes, or sensitive disclosure are blocking correctness/security findings. Message punctuation/localization differences are non-normative when structured fields match.

## Follow-up ownership

- `P01-018`–`P01-020`: fixture schema/corpus and independent reference oracle.
- `P04-*`, `P07-*`, `P10-*`: shared registry, CPU/Wasm/GPU execution equivalence, and bounded fallback.
- `P12-*`: native protocol, idempotency/status recovery, HTTP/gRPC mappings, and SDK exception/retry policy.
- `P13-*` and `P14-*`: redaction, audit, metrics/logging/tracing, diagnostics, and chaos/fault coverage.
- `P15-*`: corruption/recovery/backup/restore/durability outcome codes.
- `P22-*`: adapter/upstream error mapping matrices and differential tests.

## References

- [Specifications](../../Specifications.md)
- [Implementation plan](../../ImplementationPlan.md)
- [Finding severity and stop-ship policy](../governance/severity.md)
- [Evidence policy](../../evidence/README.md)
- [limits-v1](limits-v1.md)
- [CRUD and cursor semantics](crud-query-semantics.md)

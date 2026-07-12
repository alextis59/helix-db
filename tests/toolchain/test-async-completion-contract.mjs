#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateCompletionPolicy,
  validateCompletionResolution,
  validateCompletionSource,
} from './check-async-completion-contract.mjs';
import { ensureWasmTools } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(
    new URL('../../docs/architecture/async-completion-contract-v1.json', import.meta.url),
  ),
);
const source = readFileSync(path.join(repository, policy.current.path), 'utf8');
const executable = await ensureWasmTools();
const resolution = JSON.parse(
  execFileSync(executable, ['component', 'wit', policy.current.path, '--json'], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }),
);
const policyMutations = [
  ['schema', (v) => (v.schema = 'helix.async-completion-contract/2')],
  ['owner', (v) => (v.plan_item = 'P04-009')],
  ['base rewrite', (v) => (v.base.immutable = false)],
  ['package', (v) => (v.current.package = 'helix:core-abi@6.1.0')],
  ['accepted base', (v) => v.current.accepted.push({ major: 5, minor: 0 })],
  ['safe point', (v) => v.safe_points.pop()],
  ['precedence', (v) => v.terminal_precedence_at_same_safe_point.reverse()],
  ['wall clock', (v) => (v.deadlines.wall_clock_forbidden = false)],
  ['deadline edge', (v) => (v.deadlines.expires_when_current_tick_greater_than_or_equal = false)],
  ['deadline rollback', (v) => (v.deadlines.expiration_never_implies_rollback = false)],
  ['eager cancellation', (v) => (v.cancellation.polled_only_at_safe_points = false)],
  ['cancel rollback', (v) => (v.cancellation.never_implies_rollback = false)],
  ['published cancellation', (v) => (v.cancellation.success_wins_only_after_publication = false)],
  ['late backpressure', (v) => (v.backpressure.rejection_occurs_before_dispatch = false)],
  ['busy wait', (v) => (v.backpressure.busy_wait_forbidden = false)],
  [
    'retroactive pressure',
    (v) => (v.backpressure.admitted_work_not_retroactively_rejected = false),
  ],
  ['short read', (v) => (v.partial_io.read_short_success_only_at_eof = false)],
  ['short write', (v) => (v.partial_io.write_retries_until_every_byte_written = false)],
  ['zero progress', (v) => (v.partial_io.zero_progress_before_completion_is_error = false)],
  ['partial payload', (v) => (v.partial_io.error_releases_no_success_payload = false)],
  ['new key', (v) => (v.partial_io.batch_retry_requires_same_idempotency_key = false)],
  ['shutdown reverse', (v) => (v.shutdown.transitions_are_monotonic = false)],
  ['drain admission', (v) => (v.shutdown.draining_rejects_new_admission = false)],
  ['drop twice', (v) => (v.shutdown.resources_drop_exactly_once = false)],
  ['cleanup rewrite', (v) => (v.shutdown.cleanup_failure_never_rewrites_result = false)],
  ['error drift', (v) => (v.errors.cancelled = 'CANCELLED')],
  ['implicit window', (v) => (v.versioning.implicit_5_0_acceptance = true)],
  ['binding overclaim', (v) => (v.claim_boundary.operation_bindings_present = true)],
  ['host overclaim', (v) => (v.claim_boundary.host_implementations_present = true)],
  ['budget overclaim', (v) => (v.claim_boundary.numeric_budgets_defined = true)],
  ['database overclaim', (v) => (v.claim_boundary.database_functionality_added = true)],
];
for (const [label, mutate] of policyMutations) {
  const candidate = structuredClone(policy);
  mutate(candidate);
  try {
    validateCompletionPolicy(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} policy mutation unexpectedly accepted`);
}

const interfaces = Object.fromEntries(
  resolution.interfaces.map((value, index) => [value.name, index]),
);
const resolutionMutations = [
  ['package', (v) => (v.packages[0].name = 'helix:core-abi@6.1.0')],
  ['deadline type', (v) => delete v.interfaces[interfaces.types].types['monotonic-deadline']],
  ['lifecycle type', (v) => delete v.interfaces[interfaces.types].types['host-lifecycle']],
  [
    'lifecycle function',
    (v) => delete v.interfaces[interfaces['host-control']].functions.lifecycle,
  ],
  [
    'lifecycle kind',
    (v) =>
      (v.interfaces[interfaces['host-control']].functions.lifecycle.kind = 'async-freestanding'),
  ],
  [
    'lifecycle parameter',
    (v) =>
      v.interfaces[interfaces['host-control']].functions.lifecycle.params.push({
        name: 'x',
        type: 'u8',
      }),
  ],
  ['import', (v) => delete v.worlds[0].imports[Object.keys(v.worlds[0].imports)[0]]],
  ['export', (v) => delete v.worlds[0].exports[Object.keys(v.worlds[0].exports)[0]]],
];
for (const [label, mutate] of resolutionMutations) {
  const candidate = structuredClone(resolution);
  mutate(candidate);
  try {
    validateCompletionResolution(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} resolution mutation unexpectedly accepted`);
}

const sourceMutations = [
  ['package source', (v) => v.replace('@6.0.0', '@6.1.0')],
  ['deadline source', (v) => v.replace('record monotonic-deadline {', 'record deadline {')],
  ['context source', (v) => v.replaceAll('deadline: option<monotonic-deadline>,', '')],
  ['lifecycle source', (v) => v.replace('lifecycle: func() -> host-lifecycle;', '')],
];
for (const [label, mutate] of sourceMutations) {
  try {
    validateCompletionSource(mutate(source));
  } catch {
    continue;
  }
  throw new Error(`${label} source mutation unexpectedly accepted`);
}
process.stdout.write(
  `PASS async completion rejection canaries: ${policyMutations.length + resolutionMutations.length + sourceMutations.length} mutations rejected\n`,
);

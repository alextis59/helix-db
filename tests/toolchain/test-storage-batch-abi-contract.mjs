#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateStorageBatchPolicy,
  validateStorageBatchResolution,
} from './check-storage-batch-abi.mjs';
import { ensureWasmTools } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(new URL('../../docs/architecture/async-storage-batch-abi-v1.json', import.meta.url)),
);
const executable = await ensureWasmTools();
const resolution = JSON.parse(
  execFileSync(executable, ['component', 'wit', policy.current.path, '--json'], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }),
);
const policyMutations = [
  ['schema', (value) => (value.schema = 'helix.async-storage-batch-abi/2')],
  ['owner', (value) => (value.plan_item = 'P04-005')],
  ['base rewrite', (value) => (value.base.immutable = false)],
  ['current package', (value) => (value.current.package = 'helix:core-abi@2.1.0')],
  ['accepted base', (value) => value.current.accepted.push({ major: 2, minor: 0 })],
  ['remove operation', (value) => value.operations.pop()],
  ['operation interface', (value) => (value.operation_interfaces['sync-batch'] = 'host-files')],
  ['unbounded items', (value) => (value.bounds.maximum_batch_items = 0)],
  ['transfer drift', (value) => (value.bounds.maximum_transfer_bytes += 1)],
  ['sync operation', (value) => (value.rules.all_operations_are_async = false)],
  ['chatty calls', (value) => (value.rules.one_crossing_per_batch = false)],
  ['result reorder', (value) => (value.rules.results_preserve_request_order = false)],
  ['incomplete success', (value) => (value.rules.success_covers_every_request = false)],
  ['short write', (value) => (value.rules.successful_write_lengths_equal_requests = false)],
  ['short read', (value) => (value.rules.successful_read_short_only_at_eof = false)],
  ['unordered list', (value) => (value.rules.list_entries_sorted_unique_by_utf8_name = false)],
  [
    'missing idempotency',
    (value) => (value.rules.mutating_batches_require_idempotency_key = false),
  ],
  ['partial output', (value) => (value.rules.error_releases_no_success_payload = false)],
  ['implicit window', (value) => (value.versioning.implicit_2_0_acceptance = true)],
  ['operation overclaim', (value) => (value.claim_boundary.operations_bound_or_implemented = true)],
  ['lifecycle overclaim', (value) => (value.claim_boundary.resource_lifecycles_defined = true)],
  ['host overclaim', (value) => (value.claim_boundary.host_implementations_present = true)],
  ['database overclaim', (value) => (value.claim_boundary.database_functionality_added = true)],
];
for (const [label, mutate] of policyMutations) {
  const candidate = structuredClone(policy);
  mutate(candidate);
  try {
    validateStorageBatchPolicy(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} policy mutation unexpectedly accepted`);
}

const resolutionMutations = [
  ['package', (value) => (value.packages[0].name = 'helix:core-abi@3.1.0')],
  ['type', (value) => delete value.interfaces[1].types['read-request']],
  ['operation', (value) => delete value.interfaces[1].functions['read-batch']],
  ['synchronous', (value) => (value.interfaces[1].functions['read-batch'].kind = 'freestanding')],
  ['parameter', (value) => value.interfaces[1].functions['read-batch'].params.pop()],
  ['import', (value) => delete value.worlds[0].imports[Object.keys(value.worlds[0].imports)[0]]],
  ['export', (value) => delete value.worlds[0].exports[Object.keys(value.worlds[0].exports)[0]]],
];
for (const [label, mutate] of resolutionMutations) {
  const candidate = structuredClone(resolution);
  mutate(candidate);
  try {
    validateStorageBatchResolution(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} resolution mutation unexpectedly accepted`);
}

process.stdout.write(
  `PASS storage batch ABI rejection canaries: ${policyMutations.length + resolutionMutations.length} mutations rejected\n`,
);

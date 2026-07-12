#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateResourceLifecyclePolicy,
  validateResourceLifecycleResolution,
} from './check-resource-lifecycle-abi.mjs';
import { ensureWasmTools } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(new URL('../../docs/architecture/resource-lifecycle-abi-v1.json', import.meta.url)),
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
  ['schema', (v) => (v.schema = 'helix.resource-lifecycle-abi/2')],
  ['owner', (v) => (v.plan_item = 'P04-006')],
  ['base rewrite', (v) => (v.base.immutable = false)],
  ['current package', (v) => (v.current.package = 'helix:core-abi@4.1.0')],
  ['accepted base', (v) => v.current.accepted.push({ major: 3, minor: 0 })],
  ['resource removed', (v) => v.resources.pop()],
  ['operation removed', (v) => v.operations.pop()],
  ['method removed', (v) => v.methods.pop()],
  ['unbounded buffer', (v) => (v.bounds.maximum_buffer_bytes = 0)],
  ['resource drift', (v) => (v.bounds.maximum_live_resources_per_instance += 1)],
  ['forgeable', (v) => (v.rules.owned_resources_are_nonforgeable = false)],
  ['shared owner', (v) => (v.rules.owned_transfer_has_unique_owner = false)],
  ['long borrow', (v) => (v.rules.borrows_are_call_scoped = false)],
  ['alternate close', (v) => (v.rules.canonical_abi_drop_is_only_close_path = false)],
  ['double drop', (v) => (v.rules.drop_occurs_exactly_once = false)],
  ['fallible drop', (v) => (v.rules.drop_is_infallible_at_abi = false)],
  ['result mutation', (v) => (v.rules.cleanup_failure_never_changes_command_result = false)],
  ['nonzero staging', (v) => (v.rules.staging_starts_with_initialized_length_zero = false)],
  ['mutable capacity', (v) => (v.rules.staging_capacity_is_fixed = false)],
  ['length overflow', (v) => (v.rules.initialized_length_never_exceeds_capacity = false)],
  ['seal borrow', (v) => (v.rules.seal_consumes_staging_on_entry = false)],
  ['seal resource error', (v) => (v.rules.seal_failure_returns_no_resource = false)],
  ['seal mismatch', (v) => (v.rules.seal_length_matches_host_tracked_length = false)],
  ['mutable immutable', (v) => (v.rules.immutable_buffer_never_mutates = false)],
  ['duplicate alias', (v) => (v.rules.duplicate_has_distinct_identity_and_equal_bytes = false)],
  ['clone handle', (v) => (v.rules.opaque_handle_is_noncloneable = false)],
  ['descriptor leak', (v) => (v.rules.opaque_descriptor_is_redacted = false)],
  [
    'persistence',
    (v) => (v.rules.resources_are_nonserializable_nonpersistent_and_instance_scoped = false),
  ],
  [
    'uninitialized read',
    (v) => (v.rules.new_staging_bytes_are_zero_initialized_or_unreadable = false),
  ],
  ['implicit window', (v) => (v.versioning.implicit_3_0_acceptance = true)],
  ['transport overclaim', (v) => (v.claim_boundary.buffer_transport_implemented = true)],
  ['mapping overclaim', (v) => (v.claim_boundary.mapping_or_shared_memory_defined = true)],
  ['host overclaim', (v) => (v.claim_boundary.host_implementations_present = true)],
  ['database overclaim', (v) => (v.claim_boundary.database_functionality_added = true)],
];
for (const [label, mutate] of policyMutations) {
  const candidate = structuredClone(policy);
  mutate(candidate);
  try {
    validateResourceLifecyclePolicy(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} policy mutation unexpectedly accepted`);
}

const interfaces = Object.fromEntries(
  resolution.interfaces.map((value, index) => [value.name, index]),
);
const resolutionMutations = [
  ['package', (v) => (v.packages[0].name = 'helix:core-abi@4.1.0')],
  ['resource', (v) => delete v.interfaces[interfaces.types].types['immutable-buffer']],
  [
    'method',
    (v) => delete v.interfaces[interfaces.types].functions['[method]immutable-buffer.length'],
  ],
  [
    'method kind',
    (v) =>
      (v.interfaces[interfaces.types].functions['[method]immutable-buffer.length'].kind =
        'freestanding'),
  ],
  [
    'operation',
    (v) => delete v.interfaces[interfaces['host-resources']].functions['allocate-staging'],
  ],
  [
    'operation kind',
    (v) =>
      (v.interfaces[interfaces['host-resources']].functions['allocate-staging'].kind =
        'async-freestanding'),
  ],
  ['import', (v) => delete v.worlds[0].imports[Object.keys(v.worlds[0].imports)[0]]],
  ['export', (v) => delete v.worlds[0].exports[Object.keys(v.worlds[0].exports)[0]]],
];
for (const [label, mutate] of resolutionMutations) {
  const candidate = structuredClone(resolution);
  mutate(candidate);
  try {
    validateResourceLifecycleResolution(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} resolution mutation unexpectedly accepted`);
}

process.stdout.write(
  `PASS resource lifecycle ABI rejection canaries: ${policyMutations.length + resolutionMutations.length} mutations rejected\n`,
);

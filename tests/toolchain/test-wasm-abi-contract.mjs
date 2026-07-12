#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { validatePolicy } from './check-wasm-abi.mjs';

const policy = JSON.parse(
  readFileSync(new URL('../../docs/architecture/wasm-component-abi-v1.json', import.meta.url)),
);
const mutations = [
  ['schema', (value) => (value.schema = 'helix.wasm-component-abi/2')],
  ['package', (value) => (value.package = 'helix:core-abi@2.0.0')],
  ['world', (value) => (value.world = 'other')],
  ['accepted minor', (value) => value.versioning.accepted.push({ major: 1, minor: 1 })],
  [
    'implicit version window',
    (value) => (value.versioning.no_implicit_previous_version_window = false),
  ],
  ['JSON document values', (value) => (value.values.generic_json_document_values = true)],
  ['unbounded details', (value) => (value.values.maximum_error_details = 17)],
  ['zero copy claim', (value) => (value.buffers.zero_copy_claim = true)],
  ['buffer operations', (value) => (value.buffers.resource_operations_enabled = true)],
  ['shared memory', (value) => (value.buffers.shared_or_mapped_memory_enabled = true)],
  ['forgeable handles', (value) => (value.handles.forgeable = true)],
  ['serializable handles', (value) => (value.handles.serializable = true)],
  ['human messages', (value) => (value.errors.human_message_in_abi = true)],
  ['fresh unknown retry', (value) => (value.errors.unknown_write_retry_as_fresh_command = true)],
  ['cancellation rollback', (value) => (value.cancellation.implies_rollback = true)],
  ['cancellation no commit', (value) => (value.cancellation.implies_no_commit = true)],
  ['ambient authority', (value) => (value.capabilities.ambient_authority = true)],
  ['capability kind', (value) => value.capabilities.kinds.push('ambient-everything')],
  [
    'partial negotiation output',
    (value) => (value.negotiation.failure_releases_partial_output = true),
  ],
  [
    'implementation overclaim',
    (value) => (value.claim_boundary.host_operations_implemented = true),
  ],
];

for (const [label, mutate] of mutations) {
  const candidate = structuredClone(policy);
  mutate(candidate);
  try {
    validatePolicy(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} mutation unexpectedly accepted`);
}

process.stdout.write(`PASS Wasm ABI rejection canaries: ${mutations.length} mutations rejected\n`);

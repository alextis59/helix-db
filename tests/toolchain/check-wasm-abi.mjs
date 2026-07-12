#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureWasmTools, validateWasmToolsAuthority } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policyPath = 'docs/architecture/wasm-component-abi-v1.json';
const policy = JSON.parse(readFileSync(path.join(repository, policyPath), 'utf8'));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
};
const exactKeys = (value, keys, label) => same(Object.keys(value), keys, `${label} fields`);

export const validatePolicy = (candidate = policy) => {
  exactKeys(
    candidate,
    [
      'schema',
      'plan_item',
      'package',
      'world',
      'wit',
      'versioning',
      'profiles',
      'values',
      'buffers',
      'handles',
      'errors',
      'cancellation',
      'capabilities',
      'negotiation',
      'claim_boundary',
    ],
    'ABI policy',
  );
  assert(candidate.schema === 'helix.wasm-component-abi/1', 'ABI policy schema');
  assert(candidate.plan_item === 'P04-001', 'ABI policy owner');
  assert(candidate.package === 'helix:core-abi@1.0.0', 'WIT package');
  assert(candidate.world === 'helix-core-v1', 'WIT world');
  same(candidate.wit.interfaces, ['types', 'host-control', 'core-control'], 'WIT interfaces');
  same(candidate.wit.imports, ['host-control'], 'WIT imports');
  same(candidate.wit.exports, ['core-control'], 'WIT exports');
  same(candidate.versioning.current, { major: 1, minor: 0 }, 'current ABI');
  same(candidate.versioning.accepted, [{ major: 1, minor: 0 }], 'accepted ABIs');
  assert(candidate.versioning.unknown_major.startsWith('reject-'), 'unknown major rejection');
  assert(candidate.versioning.unknown_minor.startsWith('reject-'), 'unknown minor rejection');
  assert(candidate.versioning.package_semver_does_not_imply_abi_compatibility, 'semver boundary');
  assert(candidate.versioning.no_implicit_previous_version_window, 'version window boundary');
  same(
    candidate.profiles,
    {
      semantic: 'helix.semantic-profile/v1',
      errors: 'helix.errors/v1',
      hdoc: 'helix.hdoc/1.0',
    },
    'ABI profiles',
  );
  assert(candidate.values.canonical_abi_scalars, 'canonical ABI scalars');
  assert(candidate.values.document_bytes === 'canonical-validated-HDoc-1.0-only', 'HDoc values');
  assert(candidate.values.generic_json_document_values === false, 'generic JSON exclusion');
  assert(candidate.values.maximum_string_bytes === 1024, 'string bound');
  assert(candidate.values.maximum_error_details === 16, 'error detail count');
  assert(candidate.values.maximum_error_detail_key_bytes === 64, 'error detail key bound');
  assert(candidate.values.maximum_error_detail_value_bytes === 256, 'error detail value bound');
  assert(candidate.values.maximum_retry_token_bytes === 256, 'retry token bound');
  assert(candidate.buffers.enabled_baseline === 'list-u8-explicit-copy', 'copy baseline');
  same(
    candidate.buffers.declared_resources,
    ['immutable-buffer', 'mutable-staging-buffer'],
    'buffer resources',
  );
  assert(candidate.buffers.resource_operations_enabled === false, 'buffer operation boundary');
  assert(candidate.buffers.shared_or_mapped_memory_enabled === false, 'shared memory boundary');
  assert(candidate.buffers.zero_copy_claim === false, 'zero-copy boundary');
  same(
    candidate.handles.declared_resources,
    ['opaque-handle', 'cancellation-token', 'capability-set'],
    'handle resources',
  );
  assert(
    candidate.handles.forgeable === false &&
      candidate.handles.serializable === false &&
      candidate.handles.persistent === false &&
      candidate.handles.cross_instance === false,
    'handle boundary',
  );
  assert(candidate.errors.stable_identity === 'code', 'error identity');
  assert(candidate.errors.human_message_in_abi === false, 'human error boundary');
  same(
    candidate.errors.outcomes,
    ['not-applicable', 'not-committed', 'committed', 'unknown'],
    'mutation outcomes',
  );
  assert(candidate.errors.unknown_write_retry_as_fresh_command === false, 'unknown retry boundary');
  assert(
    candidate.cancellation.model === 'explicit-resource-cooperative-polling',
    'cancellation model',
  );
  assert(candidate.cancellation.result_code === 'DEADLINE_CANCELLED', 'cancellation code');
  assert(candidate.cancellation.implies_rollback === false, 'cancellation rollback boundary');
  assert(candidate.cancellation.implies_no_commit === false, 'cancellation commit boundary');
  assert(candidate.capabilities.ambient_authority === false, 'ambient authority boundary');
  assert(candidate.capabilities.maximum_descriptors === 128, 'capability count bound');
  assert(candidate.capabilities.maximum_name_bytes === 64, 'capability name bound');
  same(
    candidate.capabilities.kinds,
    [
      'files',
      'directories',
      'durability',
      'timers',
      'randomness',
      'scheduling',
      'metrics',
      'secrets',
      'networking',
      'object-storage',
      'gpu',
    ],
    'capability kinds',
  );
  same(
    candidate.capabilities.flags,
    ['required', 'deterministic-input', 'asynchronous', 'revocable'],
    'capability flags',
  );
  assert(
    candidate.capabilities.missing_required_result === 'CAP_HOST_UNAVAILABLE',
    'capability error',
  );
  assert(candidate.negotiation.component_export === 'core-control.negotiate', 'negotiation export');
  assert(
    candidate.negotiation.success === 'exact-1.0-and-every-required-capability-present',
    'negotiation success',
  );
  assert(
    candidate.negotiation.failure_mutates_state === false &&
      candidate.negotiation.failure_creates_resources === false &&
      candidate.negotiation.failure_releases_partial_output === false,
    'negotiation failure boundary',
  );
  same(
    candidate.claim_boundary,
    {
      wit_contract_defined: true,
      wit_bound_into_component: false,
      host_operations_implemented: false,
      component_execution_proven: false,
      public_sdk_or_protocol: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-003',
    },
    'claim boundary',
  );
  return candidate;
};

export const validateWitResolution = (resolution) => {
  assert(resolution.packages.length === 1, 'WIT package count');
  assert(resolution.packages[0].name === policy.package, 'parsed WIT package');
  same(Object.keys(resolution.packages[0].interfaces), policy.wit.interfaces, 'parsed interfaces');
  same(Object.keys(resolution.packages[0].worlds), [policy.world], 'parsed worlds');
  assert(resolution.interfaces.length === 3, 'parsed interface count');
  const types = resolution.interfaces.find(({ name }) => name === 'types');
  const host = resolution.interfaces.find(({ name }) => name === 'host-control');
  const core = resolution.interfaces.find(({ name }) => name === 'core-control');
  same(
    Object.keys(types.types),
    [
      'abi-version',
      'capability-kind',
      'capability-flags',
      'capability-descriptor',
      'mutation-outcome',
      'retry-scope',
      'retry-advice',
      'error-detail',
      'helix-error',
      'immutable-buffer',
      'mutable-staging-buffer',
      'opaque-handle',
      'cancellation-token',
      'capability-set',
      'component-descriptor',
      'host-descriptor',
      'negotiated-abi',
    ],
    'parsed types',
  );
  same(Object.keys(host.functions), ['poll-cancellation'], 'host functions');
  same(Object.keys(core.functions), ['describe', 'negotiate'], 'core functions');
  const world = resolution.worlds[0];
  assert(world.name === policy.world, 'parsed world name');
  assert(Object.keys(world.imports).length === 2, 'world imports types plus host-control');
  assert(Object.keys(world.exports).length === 1, 'world exports core-control');
  return resolution;
};

const run = async () => {
  assert(process.argv.length === 2, 'usage: node tests/toolchain/check-wasm-abi.mjs');
  validatePolicy();
  const executable = await ensureWasmTools();
  assert(validateWasmToolsAuthority().authority.version === '1.253.0', 'WIT validator version');
  const resolution = JSON.parse(
    execFileSync(executable, ['component', 'wit', policy.wit.path, '--json'], {
      cwd: repository,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  validateWitResolution(resolution);
  process.stdout.write(
    'PASS Wasm component ABI: helix:core-abi@1.0.0, 3 interfaces, 17 types, 3 functions\n',
  );
  process.stdout.write(
    'PASS Wasm ABI boundary: exact 1.0, explicit copies, opaque resources, cooperative cancellation, no ambient capabilities\n',
  );
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

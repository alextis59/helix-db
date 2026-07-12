#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureWasmTools, validateWasmToolsAuthority } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(repository, 'docs/architecture/async-storage-batch-abi-v1.json')),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const operations = [
  'read-batch',
  'write-batch',
  'sync-batch',
  'rename-batch',
  'list-batch',
  'delete-batch',
];
const operationInterfaces = {
  'read-batch': 'host-files',
  'write-batch': 'host-files',
  'sync-batch': 'host-durability',
  'rename-batch': 'host-directories',
  'list-batch': 'host-directories',
  'delete-batch': 'host-directories',
};

export const validateStorageBatchPolicy = (candidate = policy) => {
  same(
    Object.keys(candidate),
    [
      'schema',
      'plan_item',
      'base',
      'current',
      'operations',
      'operation_interfaces',
      'bounds',
      'rules',
      'versioning',
      'deferred',
      'claim_boundary',
    ],
    'policy fields',
  );
  assert(candidate.schema === 'helix.async-storage-batch-abi/1', 'policy schema');
  assert(candidate.plan_item === 'P04-004', 'policy owner');
  assert(candidate.base.package === 'helix:core-abi@2.0.0', 'base package');
  assert(candidate.base.path === 'wit/helix-core-abi-v2/world.wit', 'base path');
  assert(candidate.base.immutable === true, 'base immutability');
  assert(candidate.current.package === 'helix:core-abi@3.0.0', 'current package');
  assert(candidate.current.path === 'wit/helix-core-abi-v3/world.wit', 'current path');
  assert(candidate.current.world === 'helix-core-v1', 'current world');
  same(candidate.current.abi, { major: 3, minor: 0 }, 'current ABI');
  same(candidate.current.accepted, [{ major: 3, minor: 0 }], 'accepted ABI');
  same(candidate.operations, operations, 'operations');
  same(candidate.operation_interfaces, operationInterfaces, 'operation interfaces');
  same(
    candidate.bounds,
    {
      maximum_batch_items: 1024,
      maximum_transfer_bytes: 16_777_216,
      maximum_list_entries: 4096,
      maximum_request_id_bytes: 32,
      maximum_idempotency_key_bytes: 64,
    },
    'bounds',
  );
  assert(Object.keys(candidate.rules).length === 13, 'rule count');
  assert(
    Object.values(candidate.rules).every((value) => value === true),
    'closed rules',
  );
  assert(candidate.versioning.change.startsWith('incompatible-'), 'major change');
  assert(candidate.versioning.same_patch_rewrite_forbidden, 'patch rewrite');
  assert(candidate.versioning.package_semver_alone_is_not_compatibility, 'SemVer boundary');
  assert(candidate.versioning.implicit_2_0_acceptance === false, '2.0 window');
  same(
    candidate.deferred,
    {
      resource_lifecycles: 'P04-005',
      buffer_transport_implementation: 'P04-006',
      cancellation_deadlines_backpressure_partial_io_shutdown: 'P04-008',
      mock_host: 'P04-010',
      native_host: 'P04-011',
      browser_host: 'P04-012',
    },
    'deferred owners',
  );
  same(
    candidate.claim_boundary,
    {
      operations_defined: true,
      operations_bound_or_implemented: false,
      resource_lifecycles_defined: false,
      host_implementations_present: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-005',
    },
    'claim boundary',
  );
  return candidate;
};

export const validateStorageBatchResolution = (resolution) => {
  assert(resolution.packages.length === 1, 'package count');
  assert(resolution.packages[0].name === policy.current.package, 'package identity');
  assert(resolution.interfaces.length === 12, 'interface count');
  const resolvedTypes = resolution.interfaces.reduce(
    (count, entry) => count + Object.keys(entry.types).length,
    0,
  );
  const functions = resolution.interfaces.flatMap((entry) =>
    Object.values(entry.functions).map((fn) => ({ interface: entry.name, ...fn })),
  );
  assert(resolvedTypes === 80, 'resolved type count');
  assert(functions.length === 9, 'function count');
  for (const operation of operations) {
    const fn = functions.find(({ name }) => name === operation);
    assert(fn, `${operation}: absent`);
    assert(fn.interface === operationInterfaces[operation], `${operation}: interface`);
    assert(fn.kind === 'async-freestanding', `${operation}: async kind`);
    assert(fn.params.length === (operation === 'sync-batch' ? 5 : 4), `${operation}: parameters`);
    assert(fn.result !== null, `${operation}: result`);
  }
  const world = resolution.worlds[0];
  assert(world.name === policy.current.world, 'world identity');
  assert(Object.keys(world.imports).length === 11, 'world import count');
  assert(Object.keys(world.exports).length === 1, 'world export count');
  return resolution;
};

const run = async () => {
  assert(process.argv.length === 2, 'usage: node tests/toolchain/check-storage-batch-abi.mjs');
  validateStorageBatchPolicy();
  for (const source of [policy.base, policy.current]) {
    const bytes = readFileSync(path.join(repository, source.path));
    assert(bytes.length === source.bytes, `${source.package}: source bytes`);
    assert(sha256(bytes) === source.sha256, `${source.package}: source hash`);
  }
  const executable = await ensureWasmTools();
  assert(validateWasmToolsAuthority().authority.version === '1.253.0', 'validator version');
  const resolution = JSON.parse(
    execFileSync(executable, ['component', 'wit', policy.current.path, '--json'], {
      cwd: repository,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  validateStorageBatchResolution(resolution);
  process.stdout.write('PASS storage batch ABI: exact 3.0, 6 bounded async operations\n');
  process.stdout.write(
    'PASS batch boundary: 80 resolved types, 9 total functions, 11 imports, 0 implementations\n',
  );
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

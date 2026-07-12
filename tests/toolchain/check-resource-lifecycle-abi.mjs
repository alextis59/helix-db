#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureWasmTools, validateWasmToolsAuthority } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(repository, 'docs/architecture/resource-lifecycle-abi-v1.json')),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const resources = ['immutable-buffer', 'mutable-staging-buffer', 'opaque-handle'];
const operations = ['allocate-staging', 'seal-staging', 'duplicate-immutable'];
const methods = [
  'immutable-buffer.length',
  'mutable-staging-buffer.capacity',
  'mutable-staging-buffer.initialized-length',
  'opaque-handle.descriptor',
];

export const validateResourceLifecyclePolicy = (candidate = policy) => {
  same(
    Object.keys(candidate),
    [
      'schema',
      'plan_item',
      'base',
      'current',
      'resources',
      'operations',
      'methods',
      'bounds',
      'rules',
      'versioning',
      'deferred',
      'claim_boundary',
    ],
    'policy fields',
  );
  assert(candidate.schema === 'helix.resource-lifecycle-abi/1', 'policy schema');
  assert(candidate.plan_item === 'P04-005', 'policy owner');
  assert(candidate.base.package === 'helix:core-abi@3.0.0', 'base package');
  assert(candidate.base.path === 'wit/helix-core-abi-v3/world.wit', 'base path');
  assert(candidate.base.immutable === true, 'base immutability');
  assert(candidate.current.package === 'helix:core-abi@4.0.0', 'current package');
  assert(candidate.current.path === 'wit/helix-core-abi-v4/world.wit', 'current path');
  assert(candidate.current.world === 'helix-core-v1', 'current world');
  same(candidate.current.abi, { major: 4, minor: 0 }, 'current ABI');
  same(candidate.current.accepted, [{ major: 4, minor: 0 }], 'accepted ABI');
  same(candidate.resources, resources, 'resources');
  same(candidate.operations, operations, 'operations');
  same(candidate.methods, methods, 'methods');
  same(
    candidate.bounds,
    {
      maximum_buffer_bytes: 16_777_216,
      maximum_live_resources_per_instance: 4096,
      maximum_handle_name_bytes: 64,
    },
    'bounds',
  );
  assert(Object.keys(candidate.rules).length === 20, 'rule count');
  assert(
    Object.values(candidate.rules).every((value) => value === true),
    'closed rules',
  );
  assert(candidate.versioning.change.startsWith('incompatible-'), 'major change');
  assert(candidate.versioning.same_patch_rewrite_forbidden, 'patch rewrite');
  assert(candidate.versioning.package_semver_alone_is_not_compatibility, 'SemVer boundary');
  assert(candidate.versioning.implicit_3_0_acceptance === false, '3.0 window');
  same(
    candidate.deferred,
    {
      buffer_read_write_copy_implementation: 'P04-006',
      buffer_transport_alternatives: 'P04-007',
      cancellation_deadlines_drop_during_shutdown: 'P04-008',
      resource_budgets: 'P04-009',
      mock_host: 'P04-010',
      native_host: 'P04-011',
      browser_host: 'P04-012',
    },
    'deferred owners',
  );
  same(
    candidate.claim_boundary,
    {
      resource_lifecycles_defined: true,
      buffer_transport_implemented: false,
      mapping_or_shared_memory_defined: false,
      host_implementations_present: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-006',
    },
    'claim boundary',
  );
  return candidate;
};

export const validateResourceLifecycleResolution = (resolution) => {
  assert(resolution.packages.length === 1, 'package count');
  assert(resolution.packages[0].name === policy.current.package, 'package identity');
  assert(resolution.interfaces.length === 13, 'interface count');
  const resolvedTypes = resolution.interfaces.reduce(
    (count, entry) => count + Object.keys(entry.types).length,
    0,
  );
  const functions = resolution.interfaces.flatMap((entry) =>
    Object.entries(entry.functions).map(([name, fn]) => ({ interface: entry.name, name, ...fn })),
  );
  assert(resolvedTypes === 85, 'resolved type count');
  assert(functions.length === 16, 'function count');
  assert(functions.filter(({ kind }) => kind === 'async-freestanding').length === 6, 'async count');
  const typeInterface = resolution.interfaces.find(({ name }) => name === 'types');
  const hostResources = resolution.interfaces.find(({ name }) => name === 'host-resources');
  assert(typeInterface && hostResources, 'lifecycle interfaces');
  same(
    resources.map((name) => typeof typeInterface.types[name] === 'number'),
    [true, true, true],
    'resource identities',
  );
  for (const method of methods) {
    const fn = typeInterface.functions[`[method]${method}`];
    assert(fn && typeof fn.kind?.method === 'number', `${method}: method kind`);
  }
  same(Object.keys(hostResources.functions), operations, 'host resource operations');
  for (const operation of operations) {
    assert(
      hostResources.functions[operation].kind === 'freestanding',
      `${operation}: function kind`,
    );
    assert(hostResources.functions[operation].result !== null, `${operation}: result`);
  }
  const world = resolution.worlds[0];
  assert(world.name === policy.current.world, 'world identity');
  assert(Object.keys(world.imports).length === 12, 'world import count');
  assert(Object.keys(world.exports).length === 1, 'world export count');
  return resolution;
};

const run = async () => {
  assert(process.argv.length === 2, 'usage: node tests/toolchain/check-resource-lifecycle-abi.mjs');
  validateResourceLifecyclePolicy();
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
  validateResourceLifecycleResolution(resolution);
  process.stdout.write('PASS resource lifecycle ABI: exact 4.0, 3 resources, 7 transitions\n');
  process.stdout.write(
    'PASS lifecycle boundary: 85 resolved types, 16 functions, 12 imports, 0 implementations\n',
  );
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

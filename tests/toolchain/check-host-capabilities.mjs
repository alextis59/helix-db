#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureWasmTools, validateWasmToolsAuthority } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(repository, 'docs/architecture/host-capability-abi-v1.json')),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
};
const exactKeys = (value, keys, label) => same(Object.keys(value), keys, `${label} fields`);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const interfaces = [
  'types',
  'host-files',
  'host-directories',
  'host-durability',
  'host-locks',
  'host-timers',
  'host-randomness',
  'host-scheduling',
  'host-metrics',
  'host-secrets',
  'host-control',
  'core-control',
];
const capabilityInterfaces = {
  'host-files': 'file-capability',
  'host-directories': 'directory-capability',
  'host-durability': 'durability-capability',
  'host-locks': 'lock-capability',
  'host-timers': 'timer-capability',
  'host-randomness': 'randomness-capability',
  'host-scheduling': 'scheduling-capability',
  'host-metrics': 'metrics-capability',
  'host-secrets': 'secrets-capability',
};

export const validateCapabilityPolicy = (candidate = policy) => {
  exactKeys(
    candidate,
    [
      'schema',
      'plan_item',
      'base',
      'current',
      'interfaces',
      'capability_kinds',
      'capability_interfaces',
      'bounds',
      'rules',
      'versioning',
      'deferred',
      'claim_boundary',
    ],
    'capability policy',
  );
  assert(candidate.schema === 'helix.host-capability-abi/1', 'policy schema');
  assert(candidate.plan_item === 'P04-003', 'policy owner');
  same(
    candidate.base,
    {
      package: 'helix:core-abi@1.0.0',
      path: 'wit/helix-core-abi-v1/world.wit',
      bytes: 2867,
      sha256: '14db9898827f1e6cc84038100257d30fdf69654e9501390f1836b041f79ff5a9',
      immutable: true,
    },
    'base package',
  );
  same(candidate.current.abi, { major: 1, minor: 1 }, 'current ABI');
  same(candidate.current.accepted, [{ major: 1, minor: 1 }], 'accepted ABI');
  assert(candidate.current.package === 'helix:core-abi@1.1.0', 'current package');
  assert(candidate.current.bytes === 6076, 'current WIT bytes');
  assert(
    candidate.current.sha256 === 'cdffa3263bbaed6bc9c19d3859c3ed5cb5235996c169eb5a6c53a334b85865b8',
    'current WIT hash',
  );
  assert(candidate.current.world === 'helix-core-v1', 'current world');
  same(candidate.interfaces, interfaces, 'interfaces');
  same(
    candidate.capability_kinds,
    [
      'files',
      'directories',
      'durability',
      'locks',
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
  same(candidate.capability_interfaces, capabilityInterfaces, 'capability interfaces');
  assert(Object.keys(candidate.bounds).length === 8, 'bounds count');
  assert(
    Object.values(candidate.bounds).every((value) => Number.isSafeInteger(value) && value > 0),
    'bounds',
  );
  assert(Object.keys(candidate.rules).length === 11, 'rules count');
  assert(
    Object.values(candidate.rules).every((value) => value === true),
    'closed rules',
  );
  assert(candidate.versioning.same_patch_rewrite_forbidden, 'patch rewrite');
  assert(candidate.versioning.package_semver_alone_is_not_compatibility, 'SemVer boundary');
  assert(candidate.versioning.implicit_1_0_acceptance === false, '1.0 window');
  assert(candidate.versioning.unsupported_result === 'CAP_UNSUPPORTED_VERSION', 'version error');
  same(
    candidate.deferred,
    {
      coarse_io_operations: 'P04-004',
      resource_lifecycles: 'P04-005',
      cancellation_deadlines_partial_io_shutdown: 'P04-008',
      deterministic_value_injection: 'P04-009',
      mock_host: 'P04-010',
      native_host: 'P04-011',
      browser_host: 'P04-012',
      shared_conformance: 'P04-013',
    },
    'deferred owners',
  );
  same(
    candidate.claim_boundary,
    {
      capability_types_and_imports_defined: true,
      capability_operations_defined: false,
      wit_bound_into_component: false,
      host_implementations_present: false,
      component_execution_proven: false,
      network_object_storage_gpu_interfaces_defined: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-004',
    },
    'claim boundary',
  );
  return candidate;
};

export const validateCapabilityResolution = (resolution) => {
  assert(resolution.packages.length === 1, 'package count');
  assert(resolution.packages[0].name === policy.current.package, 'package identity');
  same(Object.keys(resolution.packages[0].interfaces), interfaces, 'parsed interfaces');
  same(Object.keys(resolution.packages[0].worlds), [policy.current.world], 'parsed worlds');
  assert(resolution.interfaces.length === 12, 'interface count');
  const resolvedTypes = resolution.interfaces.reduce(
    (count, entry) => count + Object.keys(entry.types).length,
    0,
  );
  const resolvedFunctions = resolution.interfaces.reduce(
    (count, entry) => count + Object.keys(entry.functions).length,
    0,
  );
  assert(resolvedTypes === 56, 'resolved type count');
  assert(resolvedFunctions === 3, 'function count');
  const capabilityKindId = resolution.interfaces[0].types['capability-kind'];
  same(
    resolution.types[capabilityKindId].kind.enum.cases.map(({ name }) => name),
    policy.capability_kinds,
    'parsed capability kinds',
  );
  for (const [interfaceName, resource] of Object.entries(capabilityInterfaces)) {
    const entry = resolution.interfaces.find(({ name }) => name === interfaceName);
    assert(entry && Object.hasOwn(entry.types, resource), `${interfaceName} resource`);
    assert(Object.keys(entry.functions).length === 0, `${interfaceName} operation boundary`);
  }
  const world = resolution.worlds[0];
  assert(Object.keys(world.imports).length === 11, 'world import count');
  assert(Object.keys(world.exports).length === 1, 'world export count');
  return resolution;
};

const run = async () => {
  assert(process.argv.length === 2, 'usage: node tests/toolchain/check-host-capabilities.mjs');
  validateCapabilityPolicy();
  const executable = await ensureWasmTools();
  assert(validateWasmToolsAuthority().authority.version === '1.253.0', 'validator version');
  for (const source of [policy.base, policy.current]) {
    const bytes = readFileSync(path.join(repository, source.path));
    assert(bytes.length === source.bytes, `${source.package}: source bytes`);
    assert(sha256(bytes) === source.sha256, `${source.package}: source hash`);
  }
  const base = JSON.parse(
    execFileSync(executable, ['component', 'wit', policy.base.path, '--json'], {
      cwd: repository,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  assert(base.packages[0].name === policy.base.package, 'immutable base package');
  const resolution = JSON.parse(
    execFileSync(executable, ['component', 'wit', policy.current.path, '--json'], {
      cwd: repository,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  validateCapabilityResolution(resolution);
  process.stdout.write(
    'PASS host capability ABI: exact 1.1, 9 capability interfaces/resources, 11 imports\n',
  );
  process.stdout.write(
    'PASS capability boundary: 56 resolved types, 3 control functions, 0 capability operations\n',
  );
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

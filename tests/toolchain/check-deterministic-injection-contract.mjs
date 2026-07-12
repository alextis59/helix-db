#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureWasmTools, validateWasmToolsAuthority } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(
    path.join(repository, 'docs/architecture/deterministic-injection-contract-v1.json'),
    'utf8',
  ),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const validateInjectionPolicy = (candidate = policy) => {
  same(
    Object.keys(candidate),
    [
      'schema',
      'plan_item',
      'base',
      'current',
      'bounds',
      'clocks',
      'randomness',
      'memory',
      'device',
      'reference_model',
      'versioning',
      'deferred',
      'claim_boundary',
    ],
    'policy fields',
  );
  assert(candidate.schema === 'helix.deterministic-injection-contract/1', 'schema');
  assert(candidate.plan_item === 'P04-009', 'owner');
  assert(candidate.base.package === 'helix:core-abi@6.0.0', 'base package');
  assert(candidate.base.immutable === true, 'base immutable');
  assert(candidate.current.package === 'helix:core-abi@7.0.0', 'current package');
  same(candidate.current.abi, { major: 7, minor: 0 }, 'current ABI');
  same(candidate.current.accepted, [{ major: 7, minor: 0 }], 'accepted ABI');
  same(
    candidate.bounds,
    {
      maximum_clock_samples_per_operation: 1024,
      maximum_random_samples_per_operation: 1024,
      maximum_random_bytes_per_request: 65536,
      maximum_memory_budget_bytes: 4294967296,
      maximum_memory_allocations: 1048576,
      maximum_device_features: 64,
      maximum_input_name_bytes: 64,
      maximum_ordered_clock_token_bytes: 32,
    },
    'bounds',
  );
  same(
    candidate.clocks.roles,
    ['wall-time-utc', 'monotonic', 'mvcc', 'logical-expiry'],
    'clock roles',
  );
  same(
    candidate.clocks.value_by_role,
    {
      'wall-time-utc': 'utc-microseconds',
      monotonic: 'monotonic-tick',
      mvcc: 'ordered-token',
      'logical-expiry': 'utc-microseconds',
    },
    'clock values',
  );
  same(candidate.clocks.qualities, ['trusted', 'degraded', 'unsafe'], 'clock qualities');
  assert(candidate.clocks.unsafe_safety_clock_error === 'CAP_CLOCK_UNSAFE', 'clock error');
  assert(
    Object.values(candidate.clocks).filter((value) => value === true).length === 7,
    'clock rules',
  );
  same(
    candidate.randomness.purposes,
    ['request-id', 'transaction-id', 'uuid-v7', 'object-id', 'nonce', 'sampling'],
    'random purposes',
  );
  assert(candidate.randomness.unavailable_error === 'CAP_HOST_UNAVAILABLE', 'random error');
  assert(
    Object.values(candidate.randomness).filter((value) => value === true).length === 7,
    'random rules',
  );
  same(candidate.memory.classes, ['scratch', 'result'], 'memory classes');
  assert(candidate.memory.exhaustion_error === 'QUOTA_MEMORY', 'memory error');
  assert(
    Object.values(candidate.memory).filter((value) => value === true).length === 6,
    'memory rules',
  );
  same(candidate.device.classes, ['cpu-only', 'cpu-and-gpu'], 'device classes');
  assert(
    Object.values(candidate.device).filter((value) => value === true).length === 8,
    'device rules',
  );
  same(
    candidate.reference_model,
    {
      path: 'crates/helix-core/src/deterministic_inputs.rs',
      ambient_discovery_present: false,
      clock_and_random_queues_executable: true,
      memory_ledger_executable: true,
      device_profile_validation_executable: true,
    },
    'reference model',
  );
  assert(candidate.versioning.change.startsWith('incompatible-'), 'major change');
  assert(candidate.versioning.same_patch_rewrite_forbidden, 'patch rewrite');
  assert(candidate.versioning.package_semver_alone_is_not_compatibility, 'SemVer boundary');
  assert(candidate.versioning.implicit_6_0_acceptance === false, '6.0 window');
  same(
    candidate.deferred,
    {
      mock_host_execution: 'P04-010',
      native_host_execution: 'P04-011',
      browser_host_execution: 'P04-012',
      shared_host_conformance: 'P04-013',
      capability_denial_proof: 'P04-014',
      transport_benchmarks: 'P04-016',
      transport_selection: 'P04-017',
    },
    'deferred owners',
  );
  same(
    candidate.claim_boundary,
    {
      deterministic_value_operations_defined: true,
      numeric_memory_budgets_defined: true,
      portable_reference_model_present: true,
      operation_bindings_present: false,
      host_implementations_present: false,
      gpu_execution_present: false,
      identifier_generation_implemented: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-010',
    },
    'claim boundary',
  );
  return candidate;
};

export const validateInjectionSource = (source) => {
  for (const marker of [
    'package helix:core-abi@7.0.0;',
    'record memory-budget {',
    'record device-profile {',
    'record execution-profile {',
    'enum clock-role {',
    'variant clock-value {',
    'read-clock: async func(',
    'uuid-v7,',
    'object-id,',
    'read-random: async func(',
    'capture-execution-profile: func() -> result<execution-profile, helix-error>;',
  ])
    assert(source.includes(marker), `WIT marker ${marker}`);
  return source;
};

export const validateInjectionRust = (source) => {
  for (const marker of [
    'pub const MAXIMUM_CLOCK_SAMPLES: usize = 1024;',
    'pub const MAXIMUM_RANDOM_BYTES: usize = 65_536;',
    'pub const MAXIMUM_MEMORY_BUDGET_BYTES: u64 = 4_294_967_296;',
    'pub struct DeterministicInputs {',
    'pub struct AllocationId {',
    'ledger_id: u64,',
    'pub struct MemoryLedger {',
    'pub struct DeviceProfile {',
    'pub struct ExecutionProfile {',
    'return Err(InjectionError::InputMismatch);',
    'return Err(InjectionError::MemoryBudgetExceeded);',
    '.position(|record| record.id == id)',
  ])
    assert(source.includes(marker), `Rust marker ${marker}`);
  for (const forbidden of ['std::time', 'getrandom', 'thread_rng', 'navigator.gpu', 'unsafe {']) {
    assert(!source.includes(forbidden), `ambient Rust marker ${forbidden}`);
  }
  return source;
};

export const validateInjectionResolution = (resolution) => {
  assert(resolution.packages.length === 1, 'package count');
  assert(resolution.packages[0].name === policy.current.package, 'package identity');
  assert(resolution.interfaces.length === 13, 'interface count');
  const types = resolution.interfaces.reduce(
    (count, entry) => count + Object.keys(entry.types).length,
    0,
  );
  const functions = resolution.interfaces.flatMap((entry) => Object.values(entry.functions));
  assert(types === 106, 'resolved type count');
  assert(functions.length === 23, 'function count');
  assert(functions.filter(({ kind }) => kind === 'async-freestanding').length === 8, 'async count');
  const typeInterface = resolution.interfaces.find(({ name }) => name === 'types');
  const timers = resolution.interfaces.find(({ name }) => name === 'host-timers');
  const randomness = resolution.interfaces.find(({ name }) => name === 'host-randomness');
  const control = resolution.interfaces.find(({ name }) => name === 'host-control');
  assert(typeInterface && timers && randomness && control, 'injection interfaces');
  for (const name of ['memory-budget', 'device-class', 'device-profile', 'execution-profile']) {
    assert(typeof typeInterface.types[name] === 'number', `${name}: type`);
  }
  for (const name of [
    'clock-role',
    'clock-quality',
    'clock-value',
    'clock-request',
    'clock-sample',
  ]) {
    assert(typeof timers.types[name] === 'number', `${name}: timer type`);
  }
  assert(timers.functions['read-clock']?.kind === 'async-freestanding', 'clock operation');
  assert(randomness.functions['read-random']?.kind === 'async-freestanding', 'random operation');
  assert(
    control.functions['capture-execution-profile']?.kind === 'freestanding',
    'profile operation',
  );
  const world = resolution.worlds[0];
  assert(Object.keys(world.imports).length === 12, 'world import count');
  assert(Object.keys(world.exports).length === 1, 'world export count');
  return resolution;
};

const run = async () => {
  assert(
    process.argv.length === 2,
    'usage: node tests/toolchain/check-deterministic-injection-contract.mjs',
  );
  validateInjectionPolicy();
  for (const source of [policy.base, policy.current]) {
    const bytes = readFileSync(path.join(repository, source.path));
    assert(bytes.length === source.bytes, `${source.path}: bytes`);
    assert(sha256(bytes) === source.sha256, `${source.path}: hash`);
  }
  validateInjectionSource(readFileSync(path.join(repository, policy.current.path), 'utf8'));
  validateInjectionRust(readFileSync(path.join(repository, policy.reference_model.path), 'utf8'));
  const executable = await ensureWasmTools();
  assert(validateWasmToolsAuthority().authority.version === '1.253.0', 'validator version');
  const resolution = JSON.parse(
    execFileSync(executable, ['component', 'wit', policy.current.path, '--json'], {
      cwd: repository,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  validateInjectionResolution(resolution);
  process.stdout.write(
    'PASS deterministic injection contract: exact ABI 7.0, 4 clocks, 6 random purposes\n',
  );
  process.stdout.write(
    'PASS execution profile: 4 GiB envelope, 2 memory classes, 2 device classes\n',
  );
};

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await run();
}

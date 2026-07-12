#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureWasmTools, validateWasmToolsAuthority } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(repository, 'docs/architecture/mock-host-contract-v1.json'), 'utf8'),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const calls = [
  'immutable-buffer.length',
  'mutable-staging-buffer.capacity',
  'mutable-staging-buffer.initialized-length',
  'opaque-handle.descriptor',
  'host-resources.allocate-staging',
  'host-resources.seal-staging',
  'host-resources.duplicate-immutable',
  'host-resources.read-immutable',
  'host-resources.write-staging',
  'host-resources.copy-immutable-to-staging',
  'host-files.read-batch',
  'host-files.write-batch',
  'host-directories.rename-batch',
  'host-directories.list-batch',
  'host-directories.delete-batch',
  'host-durability.sync-batch',
  'host-timers.read-clock',
  'host-randomness.read-random',
  'host-control.poll-cancellation',
  'host-control.lifecycle',
  'host-control.capture-execution-profile',
];

export const validateMockHostPolicy = (candidate = policy) => {
  same(
    Object.keys(candidate),
    [
      'schema',
      'plan_item',
      'abi',
      'implementation',
      'calls',
      'bounds',
      'failure_injection',
      'behavior',
      'lifecycle',
      'validation',
      'deferred',
      'claim_boundary',
    ],
    'policy fields',
  );
  assert(candidate.schema === 'helix.mock-host-contract/1', 'schema');
  assert(candidate.plan_item === 'P04-010', 'owner');
  same(
    candidate.abi,
    {
      package: 'helix:core-abi@7.0.0',
      path: 'wit/helix-core-abi-v7/world.wit',
      bytes: 12413,
      sha256: '80b9e2de39338377aa8e71ca603ac75cbda801c3822ef948b5c0e86539dc79a0',
      immutable: true,
    },
    'ABI pin',
  );
  same(
    candidate.implementation,
    {
      crate: 'helix-host-mock',
      path: 'crates/helix-host-mock/src/lib.rs',
      bytes: 43824,
      sha256: 'bd52813faf45df6f7d75cf9478cb205f3df6da58150a1bb70a86eed701375a2d',
      workspace_dependency: 'helix-core',
      external_dependencies: 0,
    },
    'implementation pin',
  );
  same(candidate.calls, calls, 'call inventory');
  same(
    candidate.bounds,
    {
      maximum_failure_rules: 4096,
      maximum_call_records: 16384,
      maximum_batch_requests: 1024,
      maximum_file_bytes: 16777216,
      maximum_path_bytes: 4096,
    },
    'bounds',
  );
  assert(
    candidate.failure_injection.selector === 'call-kind-plus-one-based-occurrence',
    'selector',
  );
  assert(
    Object.entries(candidate.failure_injection)
      .filter(
        ([key]) =>
          key.endsWith('rejected') ||
          key.endsWith('once') ||
          key.endsWith('recorded') ||
          key.endsWith('outcome'),
      )
      .every(([, value]) => value === true),
    'failure rules',
  );
  same(
    candidate.failure_injection.faults,
    [
      'CAP_HOST_UNAVAILABLE',
      'AUTH_SCOPE_DENIED',
      'IO_HOST_FAILURE',
      'CAP_CLOCK_UNSAFE',
      'QUOTA_MEMORY',
      'DEADLINE_CANCELLED',
      'DEADLINE_EXCEEDED',
      'CAP_GPU_DEVICE_LOST',
    ],
    'faults',
  );
  assert(
    Object.values(candidate.behavior).every((value) => typeof value === 'boolean'),
    'behavior booleans',
  );
  assert(Object.values(candidate.behavior).filter(Boolean).length === 9, 'behavior rules');
  assert(candidate.behavior.ambient_discovery_present === false, 'ambient behavior');
  assert(
    Object.values(candidate.lifecycle).every((value) => value === true),
    'lifecycle rules',
  );
  assert(candidate.validation.unit_tests === 6, 'unit-test count');
  assert(
    Object.entries(candidate.validation)
      .filter(([key]) => key !== 'unit_tests')
      .every(([, value]) => value === true),
    'validation claims',
  );
  same(
    candidate.deferred,
    {
      native_host_execution: 'P04-011',
      browser_host_execution: 'P04-012',
      shared_host_conformance: 'P04-013',
      capability_denial_proof: 'P04-014',
      boundary_tracing: 'P04-015',
      transport_benchmarks: 'P04-016',
      transport_selection: 'P04-017',
    },
    'deferred owners',
  );
  same(
    candidate.claim_boundary,
    {
      all_current_imported_calls_modeled: true,
      deterministic_failure_injection_present: true,
      in_memory_storage_behavior_present: true,
      component_binding_present: false,
      native_host_present: false,
      browser_host_present: false,
      real_durability_present: false,
      gpu_execution_present: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-011',
    },
    'claim boundary',
  );
  return candidate;
};

export const validateMockHostRust = (source) => {
  for (const marker of [
    'pub const MAXIMUM_FAILURE_RULES: usize = 4096;',
    'pub const MAXIMUM_CALL_RECORDS: usize = 16_384;',
    'pub const MAXIMUM_BATCH_REQUESTS: usize = 1024;',
    'pub const MAXIMUM_FILE_BYTES: usize = 16 * 1024 * 1024;',
    'pub enum CapabilityCall {',
    'pub const ALL_CAPABILITY_CALLS: [CapabilityCall; 21] = [',
    'pub struct FailureRule {',
    'pub struct CallRecord {',
    '.position(|rule| rule.call == call && rule.occurrence == ticket.occurrence)',
    'let mut candidate = self.files.clone();',
    'self.files = candidate;',
    'MockLifecycle::Stopped if call != CapabilityCall::Lifecycle',
    'MockLifecycle::Draining if Self::is_admission_call(call)',
    'pub fn read_clock(',
    'pub fn read_random(',
    'every_imported_call_kind_accepts_failure_injection',
    'abi-v7-explicit-copy.vectors',
  ])
    assert(source.includes(marker), `Rust marker ${marker}`);
  for (const forbidden of [
    'std::fs',
    'std::time',
    'std::net',
    'std::thread',
    'getrandom',
    'thread_rng',
    'navigator.gpu',
    'unsafe {',
  ])
    assert(!source.includes(forbidden), `ambient Rust marker ${forbidden}`);
  assert(
    (source.match(/CapabilityCall::/g) ?? []).length >= 63,
    'call-kind implementation coverage',
  );
  return source;
};

export const validateMockHostResolution = (resolution) => {
  assert(resolution.packages.length === 1, 'package count');
  assert(resolution.packages[0].name === policy.abi.package, 'package identity');
  assert(resolution.interfaces.length === 13, 'interface count');
  const functions = resolution.interfaces.flatMap((entry) => Object.values(entry.functions));
  assert(functions.length === 23, 'total WIT function count');
  assert(functions.filter(({ kind }) => kind === 'async-freestanding').length === 8, 'async count');
  const control = resolution.interfaces.find(({ name }) => name === 'core-control');
  assert(control && Object.keys(control.functions).length === 2, 'two guest control exports');
  const world = resolution.worlds[0];
  assert(Object.keys(world.imports).length === 12, 'world import count');
  assert(Object.keys(world.exports).length === 1, 'world export count');
  for (const [name, count] of Object.entries({
    'host-resources': 6,
    'host-files': 2,
    'host-directories': 3,
    'host-durability': 1,
    'host-timers': 1,
    'host-randomness': 1,
    'host-control': 3,
  })) {
    const entry = resolution.interfaces.find((value) => value.name === name);
    assert(entry && Object.keys(entry.functions).length === count, `${name} call count`);
  }
  return resolution;
};

const run = async () => {
  assert(process.argv.length === 2, 'usage: node tests/toolchain/check-mock-host-contract.mjs');
  validateMockHostPolicy();
  for (const pinned of [policy.abi, policy.implementation]) {
    const bytes = readFileSync(path.join(repository, pinned.path));
    assert(bytes.length === pinned.bytes, `${pinned.path}: bytes`);
    assert(sha256(bytes) === pinned.sha256, `${pinned.path}: hash`);
  }
  validateMockHostRust(readFileSync(path.join(repository, policy.implementation.path), 'utf8'));
  const cargo = readFileSync(path.join(repository, 'Cargo.toml'), 'utf8');
  assert(cargo.includes('"crates/helix-host-mock"'), 'workspace member');
  assert(
    cargo.includes('helix-host-mock = { path = "crates/helix-host-mock" }'),
    'workspace dependency',
  );
  const manifest = readFileSync(path.join(repository, 'crates/helix-host-mock/Cargo.toml'), 'utf8');
  assert(manifest.includes('helix-core.workspace = true'), 'core dependency');
  assert(
    (manifest.match(/\.workspace = true/g) ?? []).length === 7,
    'manifest workspace inheritance',
  );
  const executable = await ensureWasmTools();
  assert(validateWasmToolsAuthority().authority.version === '1.253.0', 'validator version');
  const resolution = JSON.parse(
    execFileSync(executable, ['component', 'wit', policy.abi.path, '--json'], {
      cwd: repository,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  validateMockHostResolution(resolution);
  process.stdout.write('PASS mock host contract: all 21 ABI 7 host calls modeled and bounded\n');
  process.stdout.write(
    'PASS mock host boundary: deterministic injection, no ambient host discovery\n',
  );
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureWasmTools, validateWasmToolsAuthority } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(repository, 'docs/architecture/explicit-copy-buffer-transport-v1.json')),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const operations = ['read-immutable', 'write-staging', 'copy-immutable-to-staging'];

export const validateExplicitCopyPolicy = (candidate = policy) => {
  same(
    Object.keys(candidate),
    [
      'schema',
      'plan_item',
      'base',
      'current',
      'implementation',
      'operations',
      'bounds',
      'rules',
      'errors',
      'versioning',
      'deferred',
      'claim_boundary',
    ],
    'policy fields',
  );
  assert(candidate.schema === 'helix.explicit-copy-buffer-transport/1', 'policy schema');
  assert(candidate.plan_item === 'P04-006', 'policy owner');
  assert(candidate.base.package === 'helix:core-abi@4.0.0', 'base package');
  assert(candidate.base.path === 'wit/helix-core-abi-v4/world.wit', 'base path');
  assert(candidate.base.immutable === true, 'base immutability');
  assert(candidate.current.package === 'helix:core-abi@5.0.0', 'current package');
  assert(candidate.current.path === 'wit/helix-core-abi-v5/world.wit', 'current path');
  assert(candidate.current.world === 'helix-core-v1', 'current world');
  same(candidate.current.abi, { major: 5, minor: 0 }, 'current ABI');
  same(candidate.current.accepted, [{ major: 5, minor: 0 }], 'accepted ABI');
  same(
    candidate.implementation,
    {
      crate: 'helix-core',
      path: 'crates/helix-core/src/explicit_copy.rs',
      bytes: 12_270,
      sha256: 'b1c4c9b06b5ccda52a5d74f1019cd9f6e2768e59442fbc3b15e45a3e7c9de48c',
      model: 'portable-host-conformance-reference',
    },
    'implementation',
  );
  same(candidate.operations, operations, 'operations');
  same(
    candidate.bounds,
    {
      maximum_buffer_bytes: 16_777_216,
      maximum_transfer_bytes_per_call: 16_777_216,
      offset_width_bits: 64,
      length_width_bits: 32,
    },
    'bounds',
  );
  assert(Object.keys(candidate.rules).length === 18, 'rule count');
  assert(
    Object.values(candidate.rules).every((value) => value === true),
    'closed rules',
  );
  assert(Object.keys(candidate.errors).length === 6, 'error count');
  assert(
    Object.values(candidate.errors).every((value) => value.startsWith('BUF_')),
    'error codes',
  );
  assert(candidate.versioning.change.startsWith('incompatible-'), 'major change');
  assert(candidate.versioning.same_patch_rewrite_forbidden, 'patch rewrite');
  assert(candidate.versioning.package_semver_alone_is_not_compatibility, 'SemVer boundary');
  assert(candidate.versioning.implicit_4_0_acceptance === false, '4.0 window');
  same(
    candidate.deferred,
    {
      handle_and_shared_staging_alternatives: 'P04-007',
      cancellation_deadlines_backpressure_partial_io_shutdown: 'P04-008',
      resource_budgets: 'P04-009',
      mock_host: 'P04-010',
      native_host: 'P04-011',
      browser_host: 'P04-012',
      transport_benchmarks: 'P04-016',
      transport_selection: 'P04-017',
    },
    'deferred owners',
  );
  same(
    candidate.claim_boundary,
    {
      buffer_access_operations_defined: true,
      portable_reference_implementation_present: true,
      component_binding_present: false,
      host_implementations_present: false,
      alternative_transport_implemented: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-007',
    },
    'claim boundary',
  );
  return candidate;
};

export const validateExplicitCopySource = (source) => {
  for (const marker of [
    'pub const MAXIMUM_BUFFER_BYTES: usize = 16 * 1024 * 1024;',
    'pub struct ImmutableBuffer',
    'pub struct MutableStagingBuffer',
    'pub fn read(',
    'pub fn write(',
    'pub fn copy_from(',
    'pub fn seal(',
    '.copy_from_slice(source);',
  ])
    assert(source.includes(marker), `source marker ${marker}`);
  for (const forbidden of ['unsafe {', 'from_raw_parts', 'std::fs', 'std::net', 'memmap']) {
    assert(!source.includes(forbidden), `forbidden source marker ${forbidden}`);
  }
  return source;
};

export const validateExplicitCopyResolution = (resolution) => {
  assert(resolution.packages.length === 1, 'package count');
  assert(resolution.packages[0].name === policy.current.package, 'package identity');
  assert(resolution.interfaces.length === 13, 'interface count');
  const resolvedTypes = resolution.interfaces.reduce(
    (count, entry) => count + Object.keys(entry.types).length,
    0,
  );
  const functions = resolution.interfaces.flatMap((entry) => Object.values(entry.functions));
  assert(resolvedTypes === 87, 'resolved type count');
  assert(functions.length === 19, 'function count');
  assert(functions.filter(({ kind }) => kind === 'async-freestanding').length === 6, 'async count');
  const hostResources = resolution.interfaces.find(({ name }) => name === 'host-resources');
  assert(hostResources, 'host resources interface');
  for (const operation of operations) {
    assert(hostResources.functions[operation]?.kind === 'freestanding', `${operation}: kind`);
    assert(hostResources.functions[operation]?.result !== null, `${operation}: result`);
  }
  assert(Object.keys(hostResources.functions).length === 6, 'host resource function count');
  const world = resolution.worlds[0];
  assert(world.name === policy.current.world, 'world identity');
  assert(Object.keys(world.imports).length === 12, 'world import count');
  assert(Object.keys(world.exports).length === 1, 'world export count');
  return resolution;
};

const run = async () => {
  assert(process.argv.length === 2, 'usage: node tests/toolchain/check-explicit-copy-buffer.mjs');
  validateExplicitCopyPolicy();
  for (const source of [policy.base, policy.current, policy.implementation]) {
    const bytes = readFileSync(path.join(repository, source.path));
    assert(bytes.length === source.bytes, `${source.path}: bytes`);
    assert(sha256(bytes) === source.sha256, `${source.path}: hash`);
  }
  validateExplicitCopySource(
    readFileSync(path.join(repository, policy.implementation.path), 'utf8'),
  );
  const executable = await ensureWasmTools();
  assert(validateWasmToolsAuthority().authority.version === '1.253.0', 'validator version');
  const resolution = JSON.parse(
    execFileSync(executable, ['component', 'wit', policy.current.path, '--json'], {
      cwd: repository,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  validateExplicitCopyResolution(resolution);
  process.stdout.write('PASS explicit-copy transport: exact ABI 5.0, 3 bounded copy operations\n');
  process.stdout.write(
    'PASS copy reference: safe Rust, detached reads, contiguous atomic staging writes\n',
  );
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

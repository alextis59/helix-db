#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(root, 'docs/architecture/host-abi-conformance-v1.json')),
);
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const same = (actual, expected, label) =>
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const vectorKeys = [
  'schema',
  'abi-major',
  'abi-minor',
  'imported-calls',
  'capability-kinds',
  'case',
  'capacity',
  'gap-offset',
  'gap-hex',
  'write-offset',
  'write-hex',
  'read-offset',
  'read-length',
  'expected-read-hex',
  'expected-read-end',
  'copy-source-offset',
  'copy-target-offset',
  'copy-length',
  'expected-copy-hex',
];
export const abiCalls = [
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
export const capabilityKinds = [
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
];
export const parseVectors = (text) => {
  const entries = text
    .trim()
    .split('\n')
    .map((line) => line.split('=', 2));
  assert(
    entries.every(([key, value]) => key && value !== undefined),
    'vector syntax',
  );
  const result = Object.fromEntries(entries);
  same(Object.keys(result), vectorKeys, 'vector keys');
  assert(result.schema === 'helix.host-abi-v7-conformance/1', 'vector schema');
  assert(result['abi-major'] === '7' && result['abi-minor'] === '0', 'vector ABI');
  assert(result['imported-calls'] === '21' && result['capability-kinds'] === '12', 'inventory');
  assert(result.case === 'explicit-copy-round-trip', 'case');
  for (const key of [
    'capacity',
    'gap-offset',
    'write-offset',
    'read-offset',
    'read-length',
    'copy-source-offset',
    'copy-target-offset',
    'copy-length',
  ])
    assert(/^\d+$/u.test(result[key]), `numeric vector ${key}`);
  for (const key of ['gap-hex', 'write-hex', 'expected-read-hex', 'expected-copy-hex'])
    assert(/^(?:[0-9a-f]{2})+$/u.test(result[key]), `hex vector ${key}`);
  assert(result['expected-read-end'] === 'true', 'read end');
  assert(Number(result['gap-offset']) > Number(result['write-offset']), 'gap case');
  assert(
    result['expected-read-hex'] === '020304' && result['expected-copy-hex'] === '020304',
    'observations',
  );
  return result;
};
export const validateConformancePolicy = (candidate = policy) => {
  same(
    Object.keys(candidate),
    [
      'schema',
      'plan_item',
      'abi',
      'vector',
      'hosts',
      'observations',
      'validation',
      'claim_boundary',
    ],
    'policy fields',
  );
  assert(
    candidate.schema === 'helix.host-abi-conformance/1' && candidate.plan_item === 'P04-013',
    'identity',
  );
  assert(
    candidate.abi.package === 'helix:core-abi@7.0.0' &&
      candidate.abi.imported_calls === 21 &&
      candidate.abi.capability_kinds === 12,
    'ABI',
  );
  assert(
    candidate.vector.path === 'conformance/host/abi-v7-explicit-copy.vectors' &&
      candidate.vector.bytes === 357 &&
      candidate.vector.sha256 ===
        'aee7b9e4fd29c562d929497daecf1ba068e1f8722a78610dd51019be68de067f',
    'vector identity',
  );
  same(
    candidate.hosts,
    {
      mock: {
        implementation: 'crates/helix-host-mock/src/lib.rs',
        test: 'shared_abi_v7_explicit_copy_vectors_match_mock_host',
        language: 'rust',
      },
      native: {
        implementation: 'crates/helix-host-native/src/lib.rs',
        test: 'shared_abi_v7_explicit_copy_vectors_match_native_boundary',
        language: 'rust',
      },
      browser: {
        implementation: 'packages/browser-host/src/index.ts',
        test: 'tests/browser/host-conformance.spec.ts',
        language: 'typescript',
        engines: ['chromium', 'firefox', 'webkit'],
      },
    },
    'hosts',
  );
  same(
    candidate.observations,
    [
      'noncontiguous-write-rejected',
      'detached-short-read-bytes',
      'end-of-buffer',
      'exact-immutable-to-staging-copy',
    ],
    'observations',
  );
  same(
    candidate.validation,
    {
      shared_vector_cases: 1,
      host_executions: 5,
      policy_mutation_canaries: 25,
      vector_mutation_canaries: 17,
      source_mutation_canaries: 6,
    },
    'validation',
  );
  same(
    candidate.claim_boundary,
    {
      shared_explicit_copy_conformance_present: true,
      all_call_shapes_inventoried: true,
      all_imported_calls_executed_cross_host: false,
      component_model_linked: false,
      platform_storage_adapters_present: false,
      capability_isolation_complete: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-014',
    },
    'claim boundary',
  );
  return candidate;
};
validateConformancePolicy();
const vectorBytes = readFileSync(path.join(root, policy.vector.path));
assert(
  vectorBytes.length === policy.vector.bytes && sha256(vectorBytes) === policy.vector.sha256,
  'vector hash',
);
parseVectors(vectorBytes.toString());
export const validateHostSources = ({ mock, native, browser, browserTest }) => {
  for (const [name, source, markers] of [
    [
      'mock',
      mock,
      [
        'ALL_CAPABILITY_CALLS: [CapabilityCall; 21]',
        policy.hosts.mock.test,
        'abi-v7-explicit-copy.vectors',
      ],
    ],
    [
      'native',
      native,
      [
        'NATIVE_ABI_CALLS: [&str; 21]',
        'ALL_NATIVE_CAPABILITIES: [NativeCapability; 12]',
        policy.hosts.native.test,
        'abi-v7-explicit-copy.vectors',
      ],
    ],
    [
      'browser',
      browser,
      ['export interface BrowserHostBindings', 'BrowserStagingBuffer', 'copyImmutableToStaging'],
    ],
    [
      'browser test',
      browserTest,
      [
        'replays the shared ABI 7 explicit-copy vectors',
        'capabilityKinds: 12',
        "copyHex: '020304'",
      ],
    ],
  ])
    for (const marker of markers) assert(source.includes(marker), `${name} marker ${marker}`);
  const nativeCallBlock = native.match(
    /pub const NATIVE_ABI_CALLS: \[&str; 21\] = \[([\s\S]*?)\];/,
  )?.[1];
  assert(nativeCallBlock, 'native call block');
  same(
    [...nativeCallBlock.matchAll(/"([^"]+)"/gu)].map((match) => match[1]),
    abiCalls,
    'native call names',
  );
};
validateHostSources({
  mock: readFileSync(path.join(root, policy.hosts.mock.implementation), 'utf8'),
  native: readFileSync(path.join(root, policy.hosts.native.implementation), 'utf8'),
  browser: readFileSync(path.join(root, policy.hosts.browser.implementation), 'utf8'),
  browserTest: readFileSync(path.join(root, policy.hosts.browser.test), 'utf8'),
});
const mockPolicy = JSON.parse(
  readFileSync(path.join(root, 'docs/architecture/mock-host-contract-v1.json')),
);
const nativePolicy = JSON.parse(
  readFileSync(path.join(root, 'docs/architecture/native-host-skeleton-v1.json')),
);
const browserPolicy = JSON.parse(
  readFileSync(path.join(root, 'docs/architecture/browser-host-skeleton-v1.json')),
);
same(mockPolicy.calls, abiCalls, 'mock call names');
same(browserPolicy.calls, abiCalls, 'browser call names');
same(nativePolicy.capabilities, capabilityKinds, 'native capability names');
same(browserPolicy.capability_kinds, capabilityKinds, 'browser capability names');
const matrix = JSON.parse(readFileSync(path.join(root, '.github/ci/matrix.json')));
assert(matrix.plan_items.includes('P04-013'), 'CI implementation history');
process.stdout.write(
  'PASS shared host conformance: ABI 7.0, 21 calls, 12 capabilities, 1 vector across mock/native/3 browsers\n',
);

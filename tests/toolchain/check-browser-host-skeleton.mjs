#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const authorityPath = path.join(root, 'docs/architecture/browser-host-skeleton-v1.json');
const policy = JSON.parse(readFileSync(authorityPath));
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const same = (actual, expected, message) =>
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message} mismatch`);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const calls = [
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
const kinds = [
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

export const validateBrowserHostPolicy = (candidate = policy) => {
  same(
    Object.keys(candidate),
    [
      'schema',
      'plan_item',
      'abi',
      'implementation',
      'capability_kinds',
      'calls',
      'bounds',
      'allowlist',
      'feature_detection',
      'bindings',
      'validation',
      'claim_boundary',
    ],
    'policy fields',
  );
  assert(candidate.schema === 'helix.browser-host-skeleton/1', 'schema');
  assert(candidate.plan_item === 'P04-012', 'owner');
  same(
    candidate.abi,
    {
      package: 'helix:core-abi@7.0.0',
      path: 'wit/helix-core-abi-v7/world.wit',
      bytes: 12413,
      sha256: '80b9e2de39338377aa8e71ca603ac75cbda801c3822ef948b5c0e86539dc79a0',
    },
    'ABI',
  );
  same(
    candidate.implementation,
    {
      path: 'packages/browser-host/src/index.ts',
      bytes: 24287,
      sha256: '513194056b68c497731f6112f0d52f49386b6270116e27824cfebc14d6425453',
      language: 'strict-typescript',
      installable_package: false,
      external_runtime_dependencies: 0,
    },
    'implementation',
  );
  same(candidate.capability_kinds, kinds, 'capability kinds');
  same(candidate.calls, calls, 'call inventory');
  same(
    candidate.bounds,
    {
      maximum_wasm_bytes: 16777216,
      maximum_capability_grants: 128,
      maximum_scope_bytes: 4096,
      maximum_buffer_bytes: 16777216,
    },
    'bounds',
  );
  assert(
    Object.values(candidate.allowlist).every((value) => value === true),
    'allowlist',
  );
  assert(candidate.feature_detection.detection_invokes_capability === false, 'feature side effect');
  assert(
    Object.values(candidate.bindings).every((value) => value === true),
    'binding guarantees',
  );
  same(candidate.validation.browser_engines, ['chromium', 'firefox', 'webkit'], 'engines');
  assert(candidate.validation.browser_execution_count === 3, 'browser executions');
  assert(candidate.validation.policy_mutation_canaries === 39, 'policy canaries');
  assert(candidate.validation.source_mutation_canaries === 12, 'source canaries');
  same(
    candidate.claim_boundary,
    {
      typescript_binding_shapes_present: true,
      bounded_core_module_instantiation_present: true,
      component_model_linked: false,
      opfs_adapter_present: false,
      indexed_db_adapter_present: false,
      durability_present: false,
      gpu_execution_present: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-013',
    },
    'claim boundary',
  );
  return candidate;
};

export const validateBrowserHostSource = (source) => {
  for (const marker of [
    'export class BrowserCapabilityPolicy',
    'export class BrowserImmutableBuffer',
    'export class BrowserStagingBuffer',
    'export class BrowserHost {',
    'export interface BrowserHostBindings',
    'export interface BrowserReadRequest',
    'export interface BrowserClockSample',
    'detectBrowserRuntimeFeatures',
    "'ABI_COMPONENT_BINDING_PENDING'",
    "'AUTH_IMPORT_DENIED'",
    'const bindings: BrowserHostBindings = {',
    'const validateExecutionProfile =',
    'const safeU32 =',
  ])
    assert(source.includes(marker), `source marker ${marker}`);
  for (const marker of ['eval(', 'new Function(', 'document.cookie', 'localStorage.', 'fetch('])
    assert(!source.includes(marker), `ambient source marker ${marker}`);
  for (const name of [
    'immutableBufferLength',
    'mutableStagingBufferCapacity',
    'mutableStagingBufferInitializedLength',
    'opaqueHandleDescriptor',
    'allocateStaging',
    'sealStaging',
    'duplicateImmutable',
    'readImmutable',
    'writeStaging',
    'copyImmutableToStaging',
    'readBatch',
    'writeBatch',
    'renameBatch',
    'listBatch',
    'deleteBatch',
    'syncBatch',
    'readClock',
    'readRandom',
    'pollCancellation',
    'lifecycle',
    'captureExecutionProfile',
  ])
    assert(source.includes(`${name}:`), `binding ${name}`);
  return source;
};

validateBrowserHostPolicy();
const implementation = readFileSync(path.join(root, policy.implementation.path));
assert(implementation.length === policy.implementation.bytes, 'implementation bytes');
assert(sha256(implementation) === policy.implementation.sha256, 'implementation hash');
validateBrowserHostSource(implementation.toString());
const browserExample = readFileSync(path.join(root, 'examples/browser-toolchain/main.ts'), 'utf8');
for (const marker of [
  'detectBrowserRuntimeFeatures(window)',
  'new BrowserHost({',
  'host.bindings.allocateStaging(4n)',
  'host.compileAndInstantiate(bytes)',
  'componentModelLinked: false',
])
  assert(browserExample.includes(marker), `browser execution marker ${marker}`);
const matrix = JSON.parse(readFileSync(path.join(root, '.github/ci/matrix.json')));
assert(matrix.plan_items.includes('P04-012'), 'CI implementation history');
process.stdout.write(
  'PASS browser host skeleton: 21 ABI call shapes, exact grants, six feature probes, bounded real-browser module execution\n',
);

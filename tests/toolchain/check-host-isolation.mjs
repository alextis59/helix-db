#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(root, 'docs/architecture/host-capability-isolation-v1.json')),
);
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const same = (actual, expected, label) =>
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);

export const validateIsolationPolicy = (candidate = policy) => {
  same(
    Object.keys(candidate),
    [
      'schema',
      'plan_item',
      'abi',
      'resource_classes',
      'proofs',
      'tests',
      'validation',
      'claim_boundary',
    ],
    'policy fields',
  );
  assert(
    candidate.schema === 'helix.host-capability-isolation/1' && candidate.plan_item === 'P04-014',
    'identity',
  );
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
  same(candidate.resource_classes, ['files', 'sockets', 'clocks', 'devices'], 'classes');
  assert(
    Object.values(candidate.proofs).every((value) => value === true),
    'proofs',
  );
  same(
    candidate.tests,
    {
      native: 'ungranted_file_socket_clock_and_device_scopes_are_unreachable',
      browser: 'tests/browser/capability-isolation.spec.ts',
      browser_engines: ['chromium', 'firefox', 'webkit'],
    },
    'tests',
  );
  same(
    candidate.validation,
    {
      resource_classes: 4,
      host_executions: 4,
      policy_mutation_canaries: 22,
      source_mutation_canaries: 8,
    },
    'validation',
  );
  same(
    candidate.claim_boundary,
    {
      ungranted_classes_unreachable: true,
      ambient_authority_added: false,
      socket_adapter_present: false,
      gpu_device_adapter_present: false,
      platform_storage_adapter_present: false,
      component_model_linked: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-015',
    },
    'claim boundary',
  );
  return candidate;
};
export const validateIsolationSources = ({ wit, native, browserExample, browserTest }) => {
  for (const marker of ['files,', 'timers,', 'networking,', 'gpu,'])
    assert(wit.includes(marker), `WIT kind ${marker}`);
  for (const forbidden of [
    'interface host-networking',
    'interface host-gpu',
    'import host-networking',
    'import host-gpu',
  ])
    assert(!wit.includes(forbidden), `WIT operation ${forbidden}`);
  for (const marker of [
    'ungranted_file_socket_clock_and_device_scopes_are_unreachable',
    'NativeCapability::Files, "ungranted/file"',
    'NativeCapability::Networking, "ungranted/socket"',
    'NativeCapability::Timers, "ungranted/clock"',
    'NativeCapability::Gpu, "ungranted/device"',
  ])
    assert(native.includes(marker), `native ${marker}`);
  for (const marker of [
    "file: !host.policy.permits('files'",
    "socket: !host.policy.permits('networking'",
    "clock: !host.policy.permits('timers'",
    "device: !host.policy.permits('gpu'",
    'coreImports: WebAssembly.Module.imports(module)',
  ])
    assert(browserExample.includes(marker), `browser ${marker}`);
  for (const marker of [
    'keeps ungranted files, sockets, clocks, and devices unreachable',
    'coreImports: []',
    'file: true',
    'socket: true',
    'clock: true',
    'device: true',
  ])
    assert(browserTest.includes(marker), `browser test ${marker}`);
};
validateIsolationPolicy();
validateIsolationSources({
  wit: readFileSync(path.join(root, policy.abi.path), 'utf8'),
  native: readFileSync(path.join(root, 'crates/helix-host-native/src/lib.rs'), 'utf8'),
  browserExample: readFileSync(path.join(root, 'examples/browser-toolchain/main.ts'), 'utf8'),
  browserTest: readFileSync(path.join(root, policy.tests.browser), 'utf8'),
});
const coreCheck = execFileSync('node', ['tests/toolchain/check-deterministic-core.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
assert(
  coreCheck.includes('0 forbidden ambient patterns') &&
    coreCheck.includes('browser core has zero imports'),
  'portable core proof',
);
const matrix = JSON.parse(readFileSync(path.join(root, '.github/ci/matrix.json')));
assert(matrix.plan_items.at(-1) === 'P04-014', 'CI implementation history');
process.stdout.write(
  'PASS host capability isolation: zero-import core; ungranted files, sockets, clocks, and devices unreachable\n',
);

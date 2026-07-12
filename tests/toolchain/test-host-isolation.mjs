#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIsolationPolicy, validateIsolationSources } from './check-host-isolation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(root, 'docs/architecture/host-capability-isolation-v1.json')),
);
const policyMutations = [
  ['field', (v) => (v.extra = true)],
  ['schema', (v) => (v.schema += 'x')],
  ['owner', (v) => (v.plan_item = 'P04-015')],
  ['ABI', (v) => (v.abi.package = 'helix:core-abi@6.0.0')],
  ['class', (v) => v.resource_classes.pop()],
  ...Object.keys(policy.proofs).map((key) => [`proof ${key}`, (v) => (v.proofs[key] = false)]),
  ['native test', (v) => (v.tests.native = 'missing')],
  ['browser test', (v) => (v.tests.browser = 'missing')],
  ['engine', (v) => v.tests.browser_engines.pop()],
  ['class count', (v) => (v.validation.resource_classes = 0)],
  ['executions', (v) => (v.validation.host_executions = 0)],
  ['policy canaries', (v) => (v.validation.policy_mutation_canaries = 0)],
  ['source canaries', (v) => (v.validation.source_mutation_canaries = 0)],
  ['isolation claim', (v) => (v.claim_boundary.ungranted_classes_unreachable = false)],
  ['ambient claim', (v) => (v.claim_boundary.ambient_authority_added = true)],
  ['adapter claim', (v) => (v.claim_boundary.socket_adapter_present = true)],
  ['next owner', (v) => (v.claim_boundary.next_implementation_owner = 'P04-014')],
];
if (policyMutations.length !== 22) throw new Error(`policy mutations ${policyMutations.length}`);
for (const [label, mutate] of policyMutations) {
  const value = structuredClone(policy);
  mutate(value);
  try {
    validateIsolationPolicy(value);
  } catch {
    continue;
  }
  throw new Error(`${label} accepted`);
}
const sources = {
  wit: readFileSync(path.join(root, policy.abi.path), 'utf8'),
  native: readFileSync(path.join(root, 'crates/helix-host-native/src/lib.rs'), 'utf8'),
  browserExample: readFileSync(path.join(root, 'examples/browser-toolchain/main.ts'), 'utf8'),
  browserTest: readFileSync(path.join(root, policy.tests.browser), 'utf8'),
};
const sourceMutations = [
  ['WIT files', 'wit', 'files,'],
  ['WIT socket', 'wit', 'networking,'],
  ['native test', 'native', policy.tests.native],
  ['native socket', 'native', 'ungranted/socket'],
  ['browser file', 'browserExample', "permits('files'"],
  ['browser device', 'browserExample', "permits('gpu'"],
  ['browser imports', 'browserTest', 'coreImports: []'],
  ['browser socket', 'browserTest', 'socket: true'],
];
for (const [label, key, marker] of sourceMutations) {
  const value = { ...sources, [key]: sources[key].replace(marker, 'BROKEN') };
  try {
    validateIsolationSources(value);
  } catch {
    continue;
  }
  throw new Error(`${label} source mutation accepted`);
}
execFileSync(
  'cargo',
  [
    'test',
    '--frozen',
    '--offline',
    '--package',
    'helix-host-native',
    'ungranted_file_socket_clock_and_device_scopes_are_unreachable',
  ],
  { cwd: root, stdio: 'inherit', env: { ...process.env, CARGO_NET_OFFLINE: 'true' } },
);
process.stdout.write(
  `PASS host isolation rejection canaries: ${policyMutations.length + sourceMutations.length} mutations rejected\n`,
);

#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseVectors,
  validateConformancePolicy,
  validateHostSources,
  vectorKeys,
} from './check-host-conformance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(root, 'docs/architecture/host-abi-conformance-v1.json')),
);
const original = readFileSync(path.join(root, policy.vector.path), 'utf8');
const policyMutations = [
  ['field', (v) => (v.extra = true)],
  ['schema', (v) => (v.schema += 'x')],
  ['owner', (v) => (v.plan_item = 'P04-014')],
  ['ABI', (v) => (v.abi.package = 'helix:core-abi@6.0.0')],
  ['call count', (v) => (v.abi.imported_calls = 20)],
  ['capabilities', (v) => (v.abi.capability_kinds = 11)],
  ['vector path', (v) => (v.vector.path = 'missing')],
  ['vector bytes', (v) => (v.vector.bytes = 0)],
  ['vector hash', (v) => (v.vector.sha256 = '0'.repeat(64))],
  ['mock host', (v) => (v.hosts.mock.language = 'typescript')],
  ['native host', (v) => (v.hosts.native.language = 'typescript')],
  ['browser host', (v) => (v.hosts.browser.language = 'rust')],
  ['engine', (v) => v.hosts.browser.engines.pop()],
  ['observation', (v) => v.observations.pop()],
  ['cases', (v) => (v.validation.shared_vector_cases = 0)],
  ['executions', (v) => (v.validation.host_executions = 0)],
  ['policy canaries', (v) => (v.validation.policy_mutation_canaries = 0)],
  ['vector canaries', (v) => (v.validation.vector_mutation_canaries = 0)],
  ['source canaries', (v) => (v.validation.source_mutation_canaries = 0)],
  ['shared claim', (v) => (v.claim_boundary.shared_explicit_copy_conformance_present = false)],
  ['inventory claim', (v) => (v.claim_boundary.all_call_shapes_inventoried = false)],
  ['all calls claim', (v) => (v.claim_boundary.all_imported_calls_executed_cross_host = true)],
  ['component claim', (v) => (v.claim_boundary.component_model_linked = true)],
  ['isolation claim', (v) => (v.claim_boundary.capability_isolation_complete = true)],
  ['next owner', (v) => (v.claim_boundary.next_implementation_owner = 'P04-013')],
];
if (policyMutations.length !== 25) throw new Error(`policy mutations ${policyMutations.length}`);
for (const [label, mutate] of policyMutations) {
  const value = structuredClone(policy);
  mutate(value);
  try {
    validateConformancePolicy(value);
  } catch {
    continue;
  }
  throw new Error(`${label} accepted`);
}
const vectorMutations = vectorKeys
  .slice(0, 17)
  .map((key) => [key, (value) => value.replace(new RegExp(`^${key}=.*$`, 'mu'), `${key}=`)]);
for (const [label, mutate] of vectorMutations) {
  try {
    parseVectors(mutate(original));
  } catch {
    continue;
  }
  throw new Error(`${label} vector accepted`);
}
const hostSources = {
  mock: readFileSync(path.join(root, policy.hosts.mock.implementation), 'utf8'),
  native: readFileSync(path.join(root, policy.hosts.native.implementation), 'utf8'),
  browser: readFileSync(path.join(root, policy.hosts.browser.implementation), 'utf8'),
  browserTest: readFileSync(path.join(root, policy.hosts.browser.test), 'utf8'),
};
const sourceMutations = [
  ['mock call inventory', 'mock', 'ALL_CAPABILITY_CALLS: [CapabilityCall; 21]'],
  ['mock test', 'mock', 'shared_abi_v7_explicit_copy_vectors_match_mock_host'],
  ['native call inventory', 'native', 'NATIVE_ABI_CALLS: [&str; 21]'],
  ['native capabilities', 'native', 'ALL_NATIVE_CAPABILITIES: [NativeCapability; 12]'],
  ['native test', 'native', 'shared_abi_v7_explicit_copy_vectors_match_native_boundary'],
  ['browser test', 'browserTest', "copyHex: '020304'"],
];
for (const [label, host, marker] of sourceMutations) {
  const candidate = { ...hostSources, [host]: hostSources[host].replace(marker, 'BROKEN') };
  try {
    validateHostSources(candidate);
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
    'helix-host-mock',
    '--package',
    'helix-host-native',
    'shared_abi_v7_explicit_copy_vectors',
  ],
  { cwd: root, stdio: 'inherit', env: { ...process.env, CARGO_NET_OFFLINE: 'true' } },
);
process.stdout.write(
  `PASS shared host conformance rejection canaries: ${policyMutations.length + vectorMutations.length + sourceMutations.length} mutations rejected\n`,
);

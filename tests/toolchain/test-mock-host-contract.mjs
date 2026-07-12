#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateMockHostPolicy,
  validateMockHostResolution,
  validateMockHostRust,
} from './check-mock-host-contract.mjs';
import { ensureWasmTools } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(repository, 'docs/architecture/mock-host-contract-v1.json')),
);
const rust = readFileSync(path.join(repository, policy.implementation.path), 'utf8');
const executable = await ensureWasmTools();
const resolution = JSON.parse(
  execFileSync(executable, ['component', 'wit', policy.abi.path, '--json'], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }),
);

const policyMutations = [
  ['schema', (v) => (v.schema = 'helix.mock-host-contract/2')],
  ['owner', (v) => (v.plan_item = 'P04-011')],
  ['ABI package', (v) => (v.abi.package = 'helix:core-abi@7.1.0')],
  ['ABI rewrite', (v) => (v.abi.immutable = false)],
  ['implementation crate', (v) => (v.implementation.crate = 'helix-host-native')],
  ['external dependency', (v) => (v.implementation.external_dependencies = 1)],
  ['call removed', (v) => v.calls.pop()],
  ['call reordered', (v) => v.calls.reverse()],
  ['rule bound', (v) => (v.bounds.maximum_failure_rules = 0)],
  ['record bound', (v) => (v.bounds.maximum_call_records = 0)],
  ['batch bound', (v) => (v.bounds.maximum_batch_requests = 0)],
  ['file bound', (v) => (v.bounds.maximum_file_bytes = 0)],
  ['path bound', (v) => (v.bounds.maximum_path_bytes = 0)],
  ['selector', (v) => (v.failure_injection.selector = 'sequence')],
  ['duplicate selector', (v) => (v.failure_injection.duplicate_selectors_rejected = false)],
  ['zero selector', (v) => (v.failure_injection.zero_occurrence_rejected = false)],
  ['repeat rule', (v) => (v.failure_injection.rule_fires_exactly_once = false)],
  ['failure record', (v) => (v.failure_injection.failure_occurrence_is_recorded = false)],
  ['outcome', (v) => (v.failure_injection.result_includes_mutation_outcome = false)],
  ['fault removed', (v) => v.failure_injection.faults.pop()],
  ...Object.keys(policy.behavior).map((key) => [
    `behavior ${key}`,
    (v) => (v.behavior[key] = !v.behavior[key]),
  ]),
  ...Object.keys(policy.lifecycle).map((key) => [
    `lifecycle ${key}`,
    (v) => (v.lifecycle[key] = false),
  ]),
  ['unit tests', (v) => (v.validation.unit_tests = 0)],
  ['success coverage', (v) => (v.validation.every_call_has_success_coverage = false)],
  ['failure coverage', (v) => (v.validation.every_call_has_injected_failure_coverage = false)],
  ['ambient acceptance', (v) => (v.validation.foreign_ambient_apis_forbidden = false)],
  ['shared vectors', (v) => (v.validation.shared_conformance_vectors_present = false)],
  ['native overclaim', (v) => (v.claim_boundary.native_host_present = true)],
  ['browser overclaim', (v) => (v.claim_boundary.browser_host_present = true)],
  ['binding overclaim', (v) => (v.claim_boundary.component_binding_present = true)],
  ['durability overclaim', (v) => (v.claim_boundary.real_durability_present = true)],
  ['GPU overclaim', (v) => (v.claim_boundary.gpu_execution_present = true)],
  ['database overclaim', (v) => (v.claim_boundary.database_functionality_added = true)],
];
for (const [label, mutate] of policyMutations) {
  const candidate = structuredClone(policy);
  mutate(candidate);
  try {
    validateMockHostPolicy(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} policy mutation unexpectedly accepted`);
}

const interfaces = Object.fromEntries(
  resolution.interfaces.map((value, index) => [value.name, index]),
);
const resolutionMutations = [
  ['package', (v) => (v.packages[0].name = 'helix:core-abi@7.1.0')],
  ['interface', (v) => v.interfaces.pop()],
  [
    'resource call',
    (v) => delete v.interfaces[interfaces['host-resources']].functions['allocate-staging'],
  ],
  ['storage call', (v) => delete v.interfaces[interfaces['host-files']].functions['read-batch']],
  ['control export', (v) => delete v.interfaces[interfaces['core-control']].functions.describe],
  ['import', (v) => delete v.worlds[0].imports[Object.keys(v.worlds[0].imports)[0]]],
  ['export', (v) => delete v.worlds[0].exports[Object.keys(v.worlds[0].exports)[0]]],
];
for (const [label, mutate] of resolutionMutations) {
  const candidate = structuredClone(resolution);
  mutate(candidate);
  try {
    validateMockHostResolution(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} resolution mutation unexpectedly accepted`);
}

const rustMutations = [
  [
    'rule bound',
    (v) => v.replace('MAXIMUM_FAILURE_RULES: usize = 4096', 'MAXIMUM_FAILURE_RULES: usize = 0'),
  ],
  [
    'call inventory',
    (v) =>
      v.replace(
        'ALL_CAPABILITY_CALLS: [CapabilityCall; 21]',
        'ALL_CAPABILITY_CALLS: [CapabilityCall; 20]',
      ),
  ],
  [
    'failure selector',
    (v) =>
      v.replace(
        '.position(|rule| rule.call == call && rule.occurrence == ticket.occurrence)',
        '.position(|_| true)',
      ),
  ],
  [
    'candidate map',
    (v) =>
      v.replaceAll(
        'let mut candidate = self.files.clone();',
        'let mut candidate = BTreeMap::new();',
      ),
  ],
  [
    'stopped precedence',
    (v) =>
      v.replace(
        'MockLifecycle::Stopped if call != CapabilityCall::Lifecycle',
        'MockLifecycle::Stopped',
      ),
  ],
  [
    'failure test',
    (v) =>
      v.replace('every_imported_call_kind_accepts_failure_injection', 'incomplete_failure_test'),
  ],
  ['ambient filesystem', (v) => `${v}\nconst X: &str = "std::fs";`],
  ['ambient time', (v) => `${v}\nconst X: &str = "std::time";`],
  ['unsafe', (v) => `${v}\nunsafe { core::hint::unreachable_unchecked() }`],
  ['shared vectors', (v) => v.replace('abi-v7-explicit-copy.vectors', 'missing.vectors')],
];
for (const [label, mutate] of rustMutations) {
  try {
    validateMockHostRust(mutate(rust));
  } catch {
    continue;
  }
  throw new Error(`${label} Rust mutation unexpectedly accepted`);
}

execFileSync(
  'cargo',
  ['test', '--locked', '--package', 'helix-host-mock', '--all-features', '--offline'],
  {
    cwd: repository,
    stdio: 'inherit',
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
  },
);
process.stdout.write(
  `PASS mock-host rejection canaries: ${policyMutations.length + resolutionMutations.length + rustMutations.length} mutations rejected\n`,
);

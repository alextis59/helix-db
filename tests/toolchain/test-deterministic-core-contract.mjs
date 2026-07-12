#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { validatePolicy, validateSourceText } from './check-deterministic-core.mjs';

const policy = JSON.parse(
  readFileSync(
    new URL('../../docs/architecture/deterministic-core-boundary-v1.json', import.meta.url),
  ),
);
const mutations = [
  ['schema', (value) => (value.schema = 'helix.deterministic-core-boundary/2')],
  ['owner', (value) => (value.plan_item = 'P04-003')],
  ['core module', (value) => (value.core_module = 'crates/helix-host-native/src/lib.rs')],
  ['host dependency', (value) => value.allowed_direct_dependencies.push('helix-host-native')],
  ['GPU dependency', (value) => value.allowed_direct_dependencies.push('helix-gpu')],
  ['remove forbidden host', (value) => value.forbidden_workspace_dependencies.pop()],
  ['remove forbidden crate', (value) => value.forbidden_dependency_names.pop()],
  ['remove source pattern', (value) => value.forbidden_source_patterns.pop()],
  ['allow Wasm imports', (value) => (value.forbidden_browser_wasm_imports = false)],
  ['remove ambient category', (value) => value.ambient_categories.pop()],
  ['Wasm import', (value) => value.wasm.required_imports.push({ module: 'wasi', name: 'clock' })],
  [
    'capability overclaim',
    (value) => (value.claim_boundary.capability_interfaces_implemented = true),
  ],
  ['host overclaim', (value) => (value.claim_boundary.host_implementations_present = true)],
  [
    'database overclaim',
    (value) => (value.claim_boundary.deterministic_database_orchestration_present = true),
  ],
];
for (const [label, mutate] of mutations) {
  const candidate = structuredClone(policy);
  mutate(candidate);
  try {
    validatePolicy(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} policy mutation unexpectedly accepted`);
}

for (const pattern of policy.forbidden_source_patterns) {
  try {
    validateSourceText(`fn injected() { /* ${pattern} */ }`, policy, pattern);
  } catch {
    continue;
  }
  throw new Error(`${pattern} source mutation unexpectedly accepted`);
}

for (const pattern of ['unsafe {', 'extern "C"']) {
  try {
    validateSourceText(`fn injected() { /* ${pattern} */ }`, policy, pattern);
  } catch {
    continue;
  }
  throw new Error(`${pattern} source mutation unexpectedly accepted`);
}

process.stdout.write(
  `PASS deterministic core rejection canaries: ${mutations.length + policy.forbidden_source_patterns.length + 2} mutations rejected\n`,
);

#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateBrowserHostPolicy,
  validateBrowserHostSource,
} from './check-browser-host-skeleton.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(root, 'docs/architecture/browser-host-skeleton-v1.json')),
);
const source = readFileSync(path.join(root, policy.implementation.path), 'utf8');
const mutations = [
  ['field', (value) => (value.extra = true)],
  ['schema', (value) => (value.schema += 'x')],
  ['owner', (value) => (value.plan_item = 'P04-013')],
  ['ABI', (value) => (value.abi.package = 'helix:core-abi@6.0.0')],
  ['implementation path', (value) => (value.implementation.path = 'packages/sdk-typescript')],
  ['installable', (value) => (value.implementation.installable_package = true)],
  ['dependency', (value) => (value.implementation.external_runtime_dependencies = 1)],
  ['capability', (value) => value.capability_kinds.pop()],
  ['call', (value) => value.calls.pop()],
  ...Object.keys(policy.bounds).map((key) => [`bound ${key}`, (value) => (value.bounds[key] = 0)]),
  ...Object.keys(policy.allowlist).map((key) => [
    `allowlist ${key}`,
    (value) => (value.allowlist[key] = false),
  ]),
  ['feature side effect', (value) => (value.feature_detection.detection_invokes_capability = true)],
  ...Object.keys(policy.bindings).map((key) => [
    `binding ${key}`,
    (value) => (value.bindings[key] = false),
  ]),
  ['engine', (value) => value.validation.browser_engines.pop()],
  ['executions', (value) => (value.validation.browser_execution_count = 0)],
  ['policy canaries', (value) => (value.validation.policy_mutation_canaries = 0)],
  ['source canaries', (value) => (value.validation.source_mutation_canaries = 0)],
  ['linked claim', (value) => (value.claim_boundary.component_model_linked = true)],
  ['OPFS claim', (value) => (value.claim_boundary.opfs_adapter_present = true)],
  ['database claim', (value) => (value.claim_boundary.database_functionality_added = true)],
  ['next owner', (value) => (value.claim_boundary.next_implementation_owner = 'P04-012')],
];
if (mutations.length !== 39) throw new Error(`policy mutation count is ${mutations.length}`);
for (const [label, mutate] of mutations) {
  const candidate = structuredClone(policy);
  mutate(candidate);
  try {
    validateBrowserHostPolicy(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} mutation accepted`);
}
const sourceMutations = [
  ['policy', (value) => value.replace('export class BrowserCapabilityPolicy', 'class Policy')],
  ['buffer', (value) => value.replace('export class BrowserStagingBuffer', 'class Buffer')],
  ['host', (value) => value.replace('export class BrowserHost {', 'class Host {')],
  ['bindings', (value) => value.replace('export interface BrowserHostBindings', 'interface X')],
  ['import denial', (value) => value.replace("'AUTH_IMPORT_DENIED'", "'AUTH_ALLOWED' ")],
  ['binding pending', (value) => value.replace("'ABI_COMPONENT_BINDING_PENDING'", "'ABI_OK'")],
  ['ambient fetch', (value) => `${value}\nfetch('https://example.invalid');`],
  ['call', (value) => value.replaceAll('captureExecutionProfile:', 'captureProfile:')],
  [
    'profile validation',
    (value) => value.replace('const validateExecutionProfile =', 'const validateProfile ='),
  ],
  ['runtime length', (value) => value.replace('const safeU32 =', 'const uncheckedU32 =')],
  ['read type', (value) => value.replace('export interface BrowserReadRequest', 'interface Read')],
  [
    'clock type',
    (value) => value.replace('export interface BrowserClockSample', 'interface Clock'),
  ],
];
for (const [label, mutate] of sourceMutations) {
  try {
    validateBrowserHostSource(mutate(source));
  } catch {
    continue;
  }
  throw new Error(`${label} source mutation accepted`);
}
process.stdout.write(
  `PASS browser host rejection canaries: ${mutations.length + sourceMutations.length} mutations rejected\n`,
);

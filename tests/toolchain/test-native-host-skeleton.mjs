#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateNativePolicy, validateNativeSource } from './check-native-host-skeleton.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const p = JSON.parse(
  readFileSync(path.join(root, 'docs/architecture/native-host-skeleton-v1.json')),
);
const s = readFileSync(path.join(root, p.implementation.path), 'utf8');
const mutations = [
  ['policy field', (v) => (v.extra = true)],
  ['schema', (v) => (v.schema += 'x')],
  ['owner', (v) => (v.plan_item = 'P04-012')],
  ['implementation', (v) => (v.implementation.path = 'crates/helix-core/src/lib.rs')],
  ['version', (v) => (v.runtime.version = '46.0.0')],
  ['defaults', (v) => (v.runtime.default_features = true)],
  ['WASI', (v) => (v.runtime.wasi_adapters_installed = true)],
  ['feature', (v) => v.runtime.features.pop()],
  ['capability', (v) => v.capabilities.pop()],
  ['component bound', (v) => (v.bounds.maximum_component_bytes = 0)],
  ['grant bound', (v) => (v.bounds.maximum_capability_grants = 0)],
  ['scope bound', (v) => (v.bounds.maximum_scope_bytes = 0)],
  ...Object.keys(p.allowlist).map((k) => [`allowlist ${k}`, (v) => (v.allowlist[k] = false)]),
  ['allowlist field', (v) => (v.allowlist.extra = true)],
  ...Object.keys(p.engine).map((k) => [`engine ${k}`, (v) => (v.engine[k] = false)]),
  ['engine field', (v) => (v.engine.extra = true)],
  ['tests', (v) => (v.validation.unit_tests = 0)],
  ['dependency canaries', (v) => (v.validation.dependency_mutation_canaries = 0)],
  ['native canaries', (v) => (v.validation.native_host_mutation_canaries = 0)],
  ...[
    'abi_calls_linked',
    'component_instantiation_present',
    'filesystem_present',
    'durability_present',
    'network_present',
    'entropy_present',
    'gpu_execution_present',
    'database_functionality_added',
  ].map((k) => [`claim ${k}`, (v) => (v.claim_boundary[k] = true)]),
  ['next owner', (v) => (v.claim_boundary.next_implementation_owner = 'P04-013')],
];
for (const [l, m] of mutations) {
  const v = structuredClone(p);
  m(v);
  try {
    validateNativePolicy(v);
  } catch {
    continue;
  }
  throw new Error(`${l} accepted`);
}
const sm = [
  ['capability', (v) => v.replace('pub enum NativeCapability {', 'enum NativeCapability {')],
  ['fuel', (v) => v.replace('config.consume_fuel(true);', '')],
  ['component', (v) => v.replace('Component::new(&self.engine, bytes)', 'Ok(())')],
  ['filesystem', (v) => `${v}\nconst X:&str="std::fs";`],
  ['WASI', (v) => `${v}\nconst X:&str="wasmtime_wasi";`],
];
for (const [l, m] of sm) {
  try {
    validateNativeSource(m(s));
  } catch {
    continue;
  }
  throw new Error(`${l} source accepted`);
}
process.stdout.write(
  `PASS native-host rejection canaries: ${mutations.length + sm.length} mutations rejected\n`,
);

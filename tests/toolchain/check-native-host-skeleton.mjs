#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(root, 'docs/architecture/native-host-skeleton-v1.json')),
);
const assert = (v, m) => {
  if (!v) throw new Error(m);
};
const same = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m} mismatch`);
export const validateNativePolicy = (v = policy) => {
  same(
    Object.keys(v),
    [
      'schema',
      'plan_item',
      'implementation',
      'runtime',
      'capabilities',
      'bounds',
      'allowlist',
      'engine',
      'validation',
      'claim_boundary',
    ],
    'policy fields',
  );
  assert(v.schema === 'helix.native-host-skeleton/1' && v.plan_item === 'P04-011', 'identity');
  same(
    v.implementation,
    {
      path: 'crates/helix-host-native/src/lib.rs',
      bytes: 14357,
      sha256: '040145386b5ed6518dee432e1906db078bbdac7116c2149c3ffd42c47efd8a45',
    },
    'implementation',
  );
  same(
    v.runtime,
    {
      crate: 'wasmtime',
      version: '46.0.1',
      minimum_rust: '1.94.0',
      default_features: false,
      features: [
        'async',
        'component-model',
        'component-model-async',
        'cranelift',
        'runtime',
        'std',
      ],
      wasi_adapters_installed: false,
    },
    'runtime',
  );
  same(
    v.capabilities,
    [
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
    ],
    'capabilities',
  );
  same(
    v.bounds,
    {
      maximum_component_bytes: 16777216,
      maximum_capability_grants: 128,
      maximum_scope_bytes: 4096,
    },
    'bounds',
  );
  same(
    v.allowlist,
    {
      exact_kind_and_scope: true,
      deny_by_default: true,
      wildcards_rejected: true,
      duplicates_rejected: true,
      control_text_rejected: true,
    },
    'allowlist',
  );
  same(
    v.engine,
    {
      component_model: true,
      async_component_model: true,
      fuel_accounting: true,
      epoch_interruption: true,
      core_modules_rejected_as_components: true,
    },
    'engine',
  );
  same(
    v.validation,
    { unit_tests: 5, dependency_mutation_canaries: 13, native_host_mutation_canaries: 44 },
    'validation',
  );
  same(
    v.claim_boundary,
    {
      bounded_component_compilation_present: true,
      abi_calls_linked: false,
      component_instantiation_present: false,
      filesystem_present: false,
      durability_present: false,
      network_present: false,
      entropy_present: false,
      gpu_execution_present: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-012',
    },
    'claim boundary',
  );
  return v;
};
export const validateNativeSource = (s) => {
  for (const m of [
    'pub enum NativeCapability {',
    'pub struct CapabilityPolicy {',
    'pub struct NativeHost {',
    'config.wasm_component_model(true);',
    'config.consume_fuel(true);',
    'config.epoch_interruption(true);',
    'Component::new(&self.engine, bytes)',
    'grant.scope == "*"',
    'pub const ALL_NATIVE_CAPABILITIES: [NativeCapability; 12]',
    'pub const NATIVE_ABI_CALLS: [&str; 21]',
    'abi-v7-explicit-copy.vectors',
  ])
    assert(s.includes(m), `source marker ${m}`);
  for (const m of ['wasmtime_wasi', 'std::fs', 'std::net', 'getrandom', 'unsafe {'])
    assert(!s.includes(m), `ambient marker ${m}`);
  return s;
};
validateNativePolicy();
const bytes = readFileSync(path.join(root, policy.implementation.path));
assert(bytes.length === policy.implementation.bytes, 'source bytes');
assert(
  createHash('sha256').update(bytes).digest('hex') === policy.implementation.sha256,
  'source hash',
);
validateNativeSource(bytes.toString());
const manifest = readFileSync(path.join(root, 'crates/helix-host-native/Cargo.toml'), 'utf8');
for (const m of ['wasmtime.workspace = true', 'status = "wasmtime-host-skeleton-v1"'])
  assert(manifest.includes(m), `manifest ${m}`);
process.stdout.write(
  'PASS native host skeleton: Wasmtime 46.0.1, 12 exact capability kinds, no ambient adapters\n',
);

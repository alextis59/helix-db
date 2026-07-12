#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(repository, 'docs/architecture/buffer-transport-alternatives-v1.json')),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const validateAlternativesPolicy = (candidate = policy) => {
  same(
    Object.keys(candidate),
    [
      'schema',
      'plan_item',
      'required_abi',
      'implementation',
      'prototypes',
      'bounds',
      'handle_rules',
      'shared_staging_rules',
      'comparison',
      'deferred',
      'claim_boundary',
    ],
    'policy fields',
  );
  assert(candidate.schema === 'helix.buffer-transport-alternatives/1', 'policy schema');
  assert(candidate.plan_item === 'P04-007', 'policy owner');
  same(
    candidate.required_abi,
    {
      package: 'helix:core-abi@5.0.0',
      path: 'wit/helix-core-abi-v5/world.wit',
      bytes: 10_490,
      sha256: '2d92cc7bf4e4b190af2dc96e7fbb4a5800303416982021a8c656c19a07977963',
      accepted: [{ major: 5, minor: 0 }],
      changed_by_prototype: false,
    },
    'required ABI',
  );
  same(
    candidate.implementation,
    {
      crate: 'helix-core',
      path: 'crates/helix-core/src/transport_alternatives.rs',
      bytes: 11_906,
      sha256: 'f5b61f3d2cd5d1566ae38e8013fdcb12113a897572ea727920b453d4b12d5a23',
    },
    'implementation',
  );
  same(
    candidate.prototypes,
    ['host-owned-generational-handles', 'exclusive-shared-staging'],
    'prototypes',
  );
  same(
    candidate.bounds,
    {
      maximum_live_handles: 4096,
      maximum_shared_staging_bytes: 16_777_216,
      maximum_active_leases_per_region: 1,
    },
    'bounds',
  );
  assert(Object.keys(candidate.handle_rules).length === 8, 'handle rule count');
  assert(
    Object.values(candidate.handle_rules).every((value) => value === true),
    'handle rules',
  );
  assert(Object.keys(candidate.shared_staging_rules).length === 8, 'staging rule count');
  assert(
    Object.values(candidate.shared_staging_rules).every((value) => value === true),
    'staging rules',
  );
  assert(candidate.comparison.semantic_oracle === 'explicit-copy-buffer-v1', 'semantic oracle');
  assert(candidate.comparison.required_equivalence.length === 5, 'equivalence count');
  assert(candidate.comparison.timing_threshold === null, 'timing threshold');
  assert(candidate.comparison.selected_transport === null, 'transport selection');
  same(
    candidate.deferred,
    {
      cancellation_deadlines_backpressure_partial_io_shutdown: 'P04-008',
      resource_budgets: 'P04-009',
      mock_host: 'P04-010',
      native_mapping_or_handle_integration: 'P04-011',
      browser_shared_memory_or_handle_integration: 'P04-012',
      shared_host_conformance: 'P04-013',
      transport_benchmarks: 'P04-016',
      transport_selection: 'P04-017',
    },
    'deferred owners',
  );
  same(
    candidate.claim_boundary,
    {
      alternatives_prototyped: true,
      required_abi_feature_added: false,
      component_binding_present: false,
      actual_shared_memory_or_mapping_present: false,
      host_implementations_present: false,
      performance_claim_present: false,
      transport_selected: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-008',
    },
    'claim boundary',
  );
  return candidate;
};

export const validateAlternativesSource = (source) => {
  for (const marker of [
    'pub const MAXIMUM_PROTOTYPE_HANDLES: usize = 4096;',
    'pub struct PrototypeHandle {',
    'pub struct HostOwnedHandleStore {',
    'pub struct SharedStagingPrototype {',
    'entry.generation = entry.generation.wrapping_add(1).max(1);',
    'pub fn begin_lease(',
    'pub fn leased_bytes_mut(',
    'pub fn snapshot_copy(',
  ])
    assert(source.includes(marker), `source marker ${marker}`);
  for (const forbidden of [
    'unsafe {',
    'from_raw_parts',
    'memmap',
    'SharedArrayBuffer',
    'pub slot:',
  ]) {
    assert(!source.includes(forbidden), `forbidden source marker ${forbidden}`);
  }
  return source;
};

const run = () => {
  assert(
    process.argv.length === 2,
    'usage: node tests/toolchain/check-buffer-transport-alternatives.mjs',
  );
  validateAlternativesPolicy();
  for (const source of [policy.required_abi, policy.implementation]) {
    const bytes = readFileSync(path.join(repository, source.path));
    assert(bytes.length === source.bytes, `${source.path}: bytes`);
    assert(sha256(bytes) === source.sha256, `${source.path}: hash`);
  }
  validateAlternativesSource(
    readFileSync(path.join(repository, policy.implementation.path), 'utf8'),
  );
  process.stdout.write(
    'PASS buffer alternatives: 2 bounded executable prototypes, required ABI unchanged\n',
  );
  process.stdout.write(
    'PASS prototype boundary: generational handles, exclusive lease, no mapping claim\n',
  );
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

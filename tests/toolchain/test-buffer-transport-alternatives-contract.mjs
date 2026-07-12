#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateAlternativesPolicy,
  validateAlternativesSource,
} from './check-buffer-transport-alternatives.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(
    new URL('../../docs/architecture/buffer-transport-alternatives-v1.json', import.meta.url),
  ),
);
const source = readFileSync(path.join(repository, policy.implementation.path), 'utf8');
const policyMutations = [
  ['schema', (v) => (v.schema = 'helix.buffer-transport-alternatives/2')],
  ['owner', (v) => (v.plan_item = 'P04-008')],
  ['ABI package', (v) => (v.required_abi.package = 'helix:core-abi@6.0.0')],
  ['ABI change', (v) => (v.required_abi.changed_by_prototype = true)],
  ['implementation', (v) => (v.implementation.path = 'crates/helix-core/src/lib.rs')],
  ['prototype removed', (v) => v.prototypes.pop()],
  ['handle bound', (v) => (v.bounds.maximum_live_handles += 1)],
  ['lease bound', (v) => (v.bounds.maximum_active_leases_per_region = 2)],
  ['public identity', (v) => (v.handle_rules.identity_fields_are_private = false)],
  ['slot alias', (v) => (v.handle_rules.slot_reuse_increments_generation = false)],
  ['stale accepted', (v) => (v.handle_rules.stale_handles_fail_closed = false)],
  ['copied reads', (v) => (v.handle_rules.reads_reuse_explicit_copy_semantics = false)],
  [
    'real sharing',
    (v) => (v.shared_staging_rules.prototype_is_safe_same_address_space_only = false),
  ],
  ['concurrent lease', (v) => (v.shared_staging_rules.one_exclusive_mutable_lease = false)],
  [
    'snapshot during lease',
    (v) => (v.shared_staging_rules.snapshot_forbidden_during_lease = false),
  ],
  ['pointer crossing', (v) => (v.shared_staging_rules.no_pointer_or_mapping_crosses_wit = false)],
  ['oracle', (v) => (v.comparison.semantic_oracle = 'shared-staging')],
  ['timing claim', (v) => (v.comparison.timing_threshold = 1)],
  ['selection', (v) => (v.comparison.selected_transport = 'shared-staging')],
  ['required feature', (v) => (v.claim_boundary.required_abi_feature_added = true)],
  ['binding overclaim', (v) => (v.claim_boundary.component_binding_present = true)],
  ['mapping overclaim', (v) => (v.claim_boundary.actual_shared_memory_or_mapping_present = true)],
  ['host overclaim', (v) => (v.claim_boundary.host_implementations_present = true)],
  ['performance overclaim', (v) => (v.claim_boundary.performance_claim_present = true)],
  ['selected overclaim', (v) => (v.claim_boundary.transport_selected = true)],
  ['database overclaim', (v) => (v.claim_boundary.database_functionality_added = true)],
];
for (const [label, mutate] of policyMutations) {
  const candidate = structuredClone(policy);
  mutate(candidate);
  try {
    validateAlternativesPolicy(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} policy mutation unexpectedly accepted`);
}

const sourceMutations = [
  ['handle bound', (v) => v.replace('usize = 4096', 'usize = 8192')],
  ['private identity', (v) => v.replace('slot: u32', 'pub slot: u32')],
  ['generation', (v) => v.replace('.wrapping_add(1).max(1)', '.max(1)')],
  ['lease', (v) => v.replace('pub fn begin_lease(', 'fn begin_lease(')],
  ['snapshot', (v) => v.replace('pub fn snapshot_copy(', 'fn snapshot_copy(')],
  ['unsafe', (v) => `${v}\nunsafe { core::hint::unreachable_unchecked() }`],
];
for (const [label, mutate] of sourceMutations) {
  try {
    validateAlternativesSource(mutate(source));
  } catch {
    continue;
  }
  throw new Error(`${label} source mutation unexpectedly accepted`);
}

execFileSync(
  'cargo',
  ['test', '--locked', '--package', 'helix-core', 'transport_alternatives::tests'],
  {
    cwd: repository,
    stdio: 'inherit',
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
  },
);
process.stdout.write(
  `PASS buffer alternative rejection canaries: ${policyMutations.length + sourceMutations.length} mutations rejected\n`,
);

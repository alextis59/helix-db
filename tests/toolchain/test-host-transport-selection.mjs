#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTransportSelection } from './check-host-transport-selection.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(root, 'docs/architecture/host-transport-selection-v1.json')),
);
const mutations = [
  ['schema', (v) => (v.schema += 'x')],
  ['owner', (v) => (v.plan_item = 'P04-016')],
  ['experiment', (v) => (v.experiment = 'EXP-004')],
  ['transport', (v) => (v.decision.required_transport = 'opaque-handle')],
  ['granularity', (v) => (v.decision.required_call_granularity = 'chatty')],
  ['ABI', (v) => (v.decision.required_abi = 'helix:core-abi@6.0.0')],
  ['handle', (v) => (v.decision.host_owned_handles_required = true)],
  ['staging', (v) => (v.decision.shared_staging_required = true)],
  ['mapped', (v) => (v.decision.mapped_or_shared_memory_required = true)],
  ['runtimes', (v) => (v.evidence.runtimes = 3)],
  ['strategies', (v) => (v.evidence.strategies = 3)],
  ['samples', (v) => (v.evidence.measured_samples = 0)],
  ['chatty', (v) => (v.evidence.chatty_slower_than_coarse_in_every_runtime = false)],
  ['alternative', (v) => (v.evidence.alternative_consistently_beats_explicit_copy = true)],
  ['share', (v) => (v.revisit_triggers.boundary_share_of_representative_end_to_end_percent = 0)],
  ['native p95', (v) => (v.revisit_triggers.native_coarse_copy_p95_nanoseconds = 0)],
  ['browser p95', (v) => (v.revisit_triggers.browser_coarse_copy_p95_nanoseconds = 0)],
  ['runs', (v) => (v.revisit_triggers.consecutive_qualifying_runs = 0)],
  ['runtime count', (v) => (v.alternative_acceptance.minimum_supported_runtimes_measured = 3)],
  [
    'measurement count',
    (v) => (v.alternative_acceptance.minimum_measurements_per_strategy_runtime = 0),
  ],
  ['improvement', (v) => (v.alternative_acceptance.minimum_median_improvement_percent = 0)],
  ['improved runtimes', (v) => (v.alternative_acceptance.minimum_runtimes_with_improvement = 0)],
  [
    'regression',
    (v) => (v.alternative_acceptance.maximum_median_regression_percent_any_runtime = 100),
  ],
  ['equivalence', (v) => (v.alternative_acceptance.exact_output_equivalence_required = false)],
  ['isolation', (v) => (v.alternative_acceptance.capability_isolation_regression_allowed = true)],
  [
    'lifecycle',
    (v) => (v.alternative_acceptance.new_uninitialized_or_stale_handle_failure_allowed = true),
  ],
  ['per byte', (v) => (v.operational_rules.per_byte_host_calls_forbidden = false)],
  ['batch', (v) => (v.operational_rules.storage_batch_request_limit = 0)],
  ['copy', (v) => (v.operational_rules.explicit_copy_limit_bytes = 0)],
  ['trace', (v) => (v.operational_rules.trace_copy_counts_required = false)],
  ['fallback', (v) => (v.operational_rules.fallback_to_explicit_copy_required = false)],
  ['claim', (v) => (v.claim_boundary.initial_transport_selected = false)],
  ['zero copy', (v) => (v.claim_boundary.zero_copy_claimed = true)],
  ['next', (v) => (v.claim_boundary.next_implementation_owner = 'P04-017')],
];
for (const [label, mutate] of mutations) {
  const value = structuredClone(policy);
  mutate(value);
  try {
    validateTransportSelection(value);
  } catch {
    continue;
  }
  throw new Error(`${label} accepted`);
}
process.stdout.write(
  `PASS host transport selection rejection canaries: ${mutations.length} mutations rejected\n`,
);

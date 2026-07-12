#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));
const policy = json('docs/architecture/host-transport-selection-v1.json');
const assert = (v, m) => {
  if (!v) throw new Error(m);
};
const same = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m} mismatch`);
const sha = (b) => createHash('sha256').update(b).digest('hex');
export const validateTransportSelection = (value) => {
  assert(
    value.schema === 'helix.host-transport-selection/1' &&
      value.plan_item === 'P04-017' &&
      value.experiment === 'EXP-003',
    'identity',
  );
  same(
    value.decision,
    {
      required_transport: 'explicit-copy',
      required_call_granularity: 'coarse-batched',
      required_abi: 'helix:core-abi@7.0.0',
      host_owned_handles_required: false,
      shared_staging_required: false,
      mapped_or_shared_memory_required: false,
    },
    'decision',
  );
  assert(
    value.evidence.runtimes === 4 &&
      value.evidence.strategies === 4 &&
      value.evidence.measured_samples === 320 &&
      value.evidence.chatty_slower_than_coarse_in_every_runtime &&
      !value.evidence.alternative_consistently_beats_explicit_copy,
    'evidence',
  );
  same(
    value.revisit_triggers,
    {
      boundary_share_of_representative_end_to_end_percent: 15,
      native_coarse_copy_p95_nanoseconds: 100000,
      browser_coarse_copy_p95_nanoseconds: 1000000,
      consecutive_qualifying_runs: 3,
    },
    'triggers',
  );
  same(
    value.alternative_acceptance,
    {
      minimum_supported_runtimes_measured: 4,
      minimum_measurements_per_strategy_runtime: 30,
      minimum_median_improvement_percent: 20,
      minimum_runtimes_with_improvement: 3,
      maximum_median_regression_percent_any_runtime: 10,
      exact_output_equivalence_required: true,
      capability_isolation_regression_allowed: false,
      new_uninitialized_or_stale_handle_failure_allowed: false,
    },
    'acceptance',
  );
  same(
    value.operational_rules,
    {
      per_byte_host_calls_forbidden: true,
      storage_batch_request_limit: 1024,
      explicit_copy_limit_bytes: 16777216,
      trace_copy_counts_required: true,
      fallback_to_explicit_copy_required: true,
    },
    'operations',
  );
  same(
    value.claim_boundary,
    {
      initial_transport_selected: true,
      zero_copy_claimed: false,
      mapped_memory_claimed: false,
      production_native_linkage_present: false,
      platform_storage_present: false,
      database_functionality_added: false,
      next_implementation_owner: 'G04',
    },
    'claims',
  );
  return value;
};
validateTransportSelection(policy);
const reportBytes = read(policy.evidence.report);
assert(
  reportBytes.length === policy.evidence.bytes && sha(reportBytes) === policy.evidence.sha256,
  'report identity',
);
const report = JSON.parse(reportBytes);
const runtimes = [report.native, ...Object.values(report.browsers)];
for (const runtime of runtimes) {
  assert(
    runtime.chatty.median_ns_per_iteration > runtime['batched-copy'].median_ns_per_iteration,
    'chatty observation',
  );
}
for (const strategy of ['opaque-handle', 'shared-staging']) {
  assert(
    runtimes.some(
      (runtime) =>
        runtime[strategy].median_ns_per_iteration >=
        runtime['batched-copy'].median_ns_per_iteration,
    ),
    `${strategy} consistency observation`,
  );
}
assert(json('.github/ci/matrix.json').plan_items.at(-1) === 'P04-017', 'CI history');
process.stdout.write(
  'PASS host transport selection: coarse explicit copy required; 9 quantitative revisit/acceptance thresholds\n',
);

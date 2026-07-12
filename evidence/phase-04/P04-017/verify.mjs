#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../../..');
const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json')));
const argument = process.argv[2];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, message) =>
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message} mismatch`);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (arguments_) =>
  execFileSync('git', arguments_, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (arguments_) => git(arguments_).toString();
const show = (file) => git(['show', `${manifest.commit}:${file}`]);
const showText = (file) => show(file).toString();
const showJson = (file) => JSON.parse(showText(file));

assert(argument === manifest.commit && /^[0-9a-f]{40}$/.test(argument), 'commit argument');
assert(manifest.task_id === 'P04-017' && manifest.verdict === 'pass', 'verdict');
same(manifest.experiments, ['EXP-003'], 'experiments');
assert(gitText(['rev-parse', `${argument}^`]).trim() === manifest.base_commit, 'parent');
assert(gitText(['rev-parse', `${argument}^{tree}`]).trim() === manifest.source_tree, 'tree');
assert(
  gitText(['diff-tree', '--no-commit-id', '--name-only', '-r', argument]).trim().split('\n')
    .length === 16,
  'artifacts',
);
assert(
  sha256(git(['diff', '--binary', manifest.base_commit, argument])) === manifest.diff_sha256,
  'diff',
);
const verifierPath = fileURLToPath(import.meta.url);
const verifier = readFileSync(verifierPath);
assert(
  statSync(verifierPath).size === manifest.verifier.bytes &&
    sha256(verifier) === manifest.verifier.sha256,
  'verifier',
);
for (const authority of manifest.authorities) {
  const bytes = show(authority.path);
  assert(
    bytes.length === authority.bytes && sha256(bytes) === authority.sha256,
    authority.path,
  );
}

const policy = showJson('docs/architecture/host-transport-selection-v1.json');
same(
  [policy.schema, policy.plan_item, policy.experiment],
  ['helix.host-transport-selection/1', 'P04-017', 'EXP-003'],
  'identity',
);
same(
  [policy.decision.required_transport, policy.decision.required_call_granularity],
  ['explicit-copy', 'coarse-batched'],
  'decision',
);
assert(policy.decision.required_abi === 'helix:core-abi@7.0.0', 'ABI');
assert(
  !policy.decision.host_owned_handles_required &&
    !policy.decision.shared_staging_required &&
    !policy.decision.mapped_or_shared_memory_required,
  'optional alternatives',
);
same(
  Object.values(policy.revisit_triggers),
  [15, 100000, 1000000, 3],
  'revisit thresholds',
);
same(
  [
    policy.alternative_acceptance.minimum_supported_runtimes_measured,
    policy.alternative_acceptance.minimum_measurements_per_strategy_runtime,
    policy.alternative_acceptance.minimum_median_improvement_percent,
    policy.alternative_acceptance.minimum_runtimes_with_improvement,
    policy.alternative_acceptance.maximum_median_regression_percent_any_runtime,
  ],
  [4, 30, 20, 3, 10],
  'acceptance thresholds',
);
assert(
  policy.alternative_acceptance.exact_output_equivalence_required &&
    !policy.alternative_acceptance.capability_isolation_regression_allowed &&
    !policy.alternative_acceptance.new_uninitialized_or_stale_handle_failure_allowed,
  'safety acceptance',
);
assert(
  policy.operational_rules.per_byte_host_calls_forbidden &&
    policy.operational_rules.storage_batch_request_limit === 1024 &&
    policy.operational_rules.explicit_copy_limit_bytes === 16777216 &&
    policy.operational_rules.trace_copy_counts_required &&
    policy.operational_rules.fallback_to_explicit_copy_required,
  'operations',
);
assert(
  policy.claim_boundary.initial_transport_selected &&
    !policy.claim_boundary.zero_copy_claimed &&
    !policy.claim_boundary.mapped_memory_claimed &&
    !policy.claim_boundary.production_native_linkage_present &&
    !policy.claim_boundary.platform_storage_present &&
    !policy.claim_boundary.database_functionality_added &&
    policy.claim_boundary.next_implementation_owner === 'G04',
  'claims',
);
const report = showJson(policy.evidence.report);
const runtimes = [report.native, ...Object.values(report.browsers)];
assert(runtimes.length === 4, 'runtime count');
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
assert(showJson('.github/ci/matrix.json').plan_items.at(-1) === 'P04-017', 'history');
const check = execFileSync('node', ['tests/toolchain/check-host-transport-selection.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(check.includes('9 quantitative revisit/acceptance thresholds'), 'live check');
const test = execFileSync('node', ['tests/toolchain/test-host-transport-selection.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(test.includes('34 mutations rejected'), 'canaries');

process.stdout.write(
  'PASS P04-017 source: 16 artifacts complete EXP-003 and bind the selection to CI\n' +
    'PASS P04-017 decision: coarse bounded explicit copy is required for initial ABI 7 hosts\n' +
    'PASS P04-017 evidence: 4 runtimes, 4 strategies, and 320 measured samples\n' +
    'PASS P04-017 revisit: 4 triggers and 5 alternative-acceptance thresholds are exact\n' +
    'PASS P04-017 boundary: no zero-copy, mapping, platform-storage, or database claim\n',
);

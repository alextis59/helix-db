#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const policy = JSON.parse(read('docs/architecture/host-boundary-benchmark-v1.json'));
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const same = (actual, expected, label) =>
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
export const validateHostBenchmarkPolicy = (value = policy) => {
  assert(
    value.schema === 'helix.host-boundary-benchmark/1' &&
      value.plan_item === 'P04-016' &&
      value.experiment === 'EXP-003',
    'identity',
  );
  same(
    value.strategies,
    ['chatty', 'batched-copy', 'opaque-handle', 'shared-staging'],
    'strategies',
  );
  same(value.runtimes, ['native', 'chromium', 'firefox', 'webkit'], 'runtimes');
  same(
    value.configuration,
    {
      bytes_per_iteration: 65536,
      chatty_chunk_bytes: 64,
      chatty_calls_per_iteration: 1024,
      chatty_iterations_per_sample: 1,
      coarse_iterations_per_sample: 256,
      warmups_per_strategy_runtime: 5,
      measurements_per_strategy_runtime: 20,
    },
    'configuration',
  );
  same(
    value.correctness,
    {
      deterministic_dataset: true,
      expected_fnv1a32: 574135749,
      output_bytes_checked_every_sample: true,
      checksum_checked_every_sample: true,
    },
    'correctness',
  );
  assert(
    value.report.total_samples === 400 && value.report.measured_samples === 320,
    'sample inventory',
  );
  same(
    value.report.promoted_observation,
    {
      path: 'benchmarks/reports/host-boundary-2026-07-12.json',
      bytes: 3089,
      sha256: '2f8c8bd3c102679aa7201ef8e49b9f1f962e2783e0fbd0727e53c9e4ca71397f',
    },
    'promoted report',
  );
  assert(
    value.claim_boundary.observational_only &&
      value.claim_boundary.timing_threshold === null &&
      !value.claim_boundary.transport_selected &&
      value.claim_boundary.next_implementation_owner === 'P04-017',
    'claims',
  );
  return value;
};
export const validateHostBenchmarkSources = ({ native, browser, runner }) => {
  for (const marker of [
    'const CHATTY_ITERATIONS: usize = 1;',
    'const COARSE_ITERATIONS: usize = 256;',
    'HostOwnedHandleStore::default()',
    'SharedStagingPrototype::allocate',
    'benchmark correctness mismatch',
  ])
    assert(native.includes(marker), `native ${marker}`);
  for (const marker of [
    'window.__HELIX_BOUNDARY_BENCHMARK__ = () =>',
    "strategy === 'chatty'",
    "strategy === 'batched-copy'",
    "strategy === 'opaque-handle'",
    "'shared-staging'",
    'expectedChecksum',
  ])
    assert(browser.includes(marker), `browser ${marker}`);
  for (const marker of [
    "import { chromium, firefox, webkit } from '@playwright/test';",
    '400 correctness-checked samples',
    'median_ns_per_iteration',
    'sample checksum',
  ])
    assert(runner.includes(marker), `runner ${marker}`);
};
export const validateHostBenchmarkReport = (report) => {
  assert(
    report.schema === 'helix.host-boundary-benchmark-summary/1' && report.plan_item === 'P04-016',
    'report identity',
  );
  same(
    report.configuration,
    {
      byteLength: 65536,
      chunkBytes: 64,
      chattyIterations: 1,
      coarseIterations: 256,
      warmups: 5,
      measurements: 20,
      expectedChecksum: 574135749,
    },
    'report configuration',
  );
  assert(
    typeof report.environment.platform === 'string' &&
      typeof report.environment.architecture === 'string' &&
      typeof report.environment.node === 'string' &&
      typeof report.environment.rustc === 'string' &&
      Object.keys(report.environment.browsers).length === 3,
    'report environment',
  );
  for (const runtime of [report.native, ...Object.values(report.browsers)])
    for (const strategy of policy.strategies)
      assert(
        runtime[strategy].median_ns_per_iteration > 0 && runtime[strategy].samples === 20,
        `report ${strategy}`,
      );
  assert(
    report.claim_boundary.observational_only &&
      report.claim_boundary.timing_threshold === null &&
      !report.claim_boundary.transport_selected,
    'report claims',
  );
};
validateHostBenchmarkPolicy();
validateHostBenchmarkSources({
  native: read(policy.implementation.native),
  browser: read(policy.implementation.browser),
  runner: read(policy.implementation.runner),
});
if (existsSync(path.join(root, policy.report.summary_output)))
  validateHostBenchmarkReport(JSON.parse(read(policy.report.summary_output)));
const promotedBytes = readFileSync(path.join(root, policy.report.promoted_observation.path));
assert(
  promotedBytes.length === policy.report.promoted_observation.bytes &&
    sha256(promotedBytes) === policy.report.promoted_observation.sha256,
  'promoted report identity',
);
validateHostBenchmarkReport(JSON.parse(promotedBytes));
assert(JSON.parse(read('.github/ci/matrix.json')).plan_items.includes('P04-016'), 'CI history');
process.stdout.write(
  'PASS host boundary benchmark contract: 4 strategies, native plus 3 browsers, 400 correctness-checked samples\n',
);

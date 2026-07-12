#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateHostBenchmarkPolicy,
  validateHostBenchmarkSources,
} from './check-host-boundary-benchmark.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const policy = JSON.parse(read('docs/architecture/host-boundary-benchmark-v1.json'));
const mutations = [
  ['schema', (v) => (v.schema += 'x')],
  ['owner', (v) => (v.plan_item = 'P04-017')],
  ['experiment', (v) => (v.experiment = 'EXP-004')],
  ['strategy', (v) => v.strategies.pop()],
  ['runtime', (v) => v.runtimes.pop()],
  ['bytes', (v) => (v.configuration.bytes_per_iteration = 0)],
  ['chunk', (v) => (v.configuration.chatty_chunk_bytes = 0)],
  ['calls', (v) => (v.configuration.chatty_calls_per_iteration = 0)],
  ['chatty iterations', (v) => (v.configuration.chatty_iterations_per_sample = 0)],
  ['coarse iterations', (v) => (v.configuration.coarse_iterations_per_sample = 0)],
  ['warmups', (v) => (v.configuration.warmups_per_strategy_runtime = 0)],
  ['measurements', (v) => (v.configuration.measurements_per_strategy_runtime = 0)],
  ['dataset', (v) => (v.correctness.deterministic_dataset = false)],
  ['checksum', (v) => (v.correctness.expected_fnv1a32 = 0)],
  ['length check', (v) => (v.correctness.output_bytes_checked_every_sample = false)],
  ['checksum check', (v) => (v.correctness.checksum_checked_every_sample = false)],
  ['samples', (v) => (v.report.total_samples = 0)],
  ['measured', (v) => (v.report.measured_samples = 0)],
  ['report hash', (v) => (v.report.promoted_observation.sha256 = '0'.repeat(64))],
  ['observational', (v) => (v.claim_boundary.observational_only = false)],
  ['threshold', (v) => (v.claim_boundary.timing_threshold = 1)],
  ['selection', (v) => (v.claim_boundary.transport_selected = true)],
  ['next', (v) => (v.claim_boundary.next_implementation_owner = 'P04-016')],
];
for (const [label, mutate] of mutations) {
  const value = structuredClone(policy);
  mutate(value);
  try {
    validateHostBenchmarkPolicy(value);
  } catch {
    continue;
  }
  throw new Error(`${label} accepted`);
}
const sources = {
  native: read(policy.implementation.native),
  browser: read(policy.implementation.browser),
  runner: read(policy.implementation.runner),
};
const sourceMutations = [
  ['native chatty', 'native', 'const CHATTY_ITERATIONS: usize = 1;'],
  ['native staging', 'native', 'SharedStagingPrototype::allocate'],
  ['browser hook', 'browser', 'window.__HELIX_BOUNDARY_BENCHMARK__ = () =>'],
  ['browser handle', 'browser', "strategy === 'opaque-handle'"],
  ['runner engines', 'runner', "import { chromium, firefox, webkit } from '@playwright/test';"],
  ['runner samples', 'runner', '400 correctness-checked samples'],
  ['runner median', 'runner', 'median_ns_per_iteration'],
  ['runner checksum', 'runner', 'sample checksum'],
];
for (const [label, key, marker] of sourceMutations) {
  const value = { ...sources, [key]: sources[key].replace(marker, 'BROKEN') };
  try {
    validateHostBenchmarkSources(value);
  } catch {
    continue;
  }
  throw new Error(`${label} accepted`);
}
process.stdout.write(
  `PASS host boundary benchmark rejection canaries: ${mutations.length + sourceMutations.length} mutations rejected\n`,
);

#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateRaw,
  validateSummary,
} from '../../../benchmarks/hdoc-contract.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../../..');
const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
const argument = process.argv[2];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (args) =>
  execFileSync('git', args, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (args) => gitBytes(args).toString('utf8');
const showText = (file) => gitText(['show', `${manifest.commit}:${file}`]);
const showJson = (file) => JSON.parse(showText(file));

assert(argument, 'usage: node evidence/phase-03/P03-020/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-020' && manifest.verdict === 'pass', 'evidence verdict');
assert(gitText(['rev-parse', `${argument}^{commit}`]).trim() === argument, 'source commit');
assert(gitText(['rev-parse', `${argument}^`]).trim() === manifest.base_commit, 'source parent');
assert(gitText(['rev-parse', `${argument}^{tree}`]).trim() === manifest.source_tree, 'source tree');
const changes = gitText(['diff-tree', '--no-commit-id', '--name-only', '-r', argument])
  .trim()
  .split('\n');
assert(changes.length === manifest.verification.source_artifacts, 'source artifact count');
assert(
  sha256(gitBytes(['diff', '--binary', manifest.base_commit, argument])) === manifest.diff_sha256,
  'source diff hash',
);

const verifierPath = fileURLToPath(import.meta.url);
const verifier = readFileSync(verifierPath);
assert(statSync(verifierPath).size === manifest.verifier.bytes, 'verifier bytes');
assert(sha256(verifier) === manifest.verifier.sha256, 'verifier hash');
const rawBytes = readFileSync(path.join(directory, manifest.raw_report.path));
const summaryBytes = readFileSync(path.join(directory, manifest.summary_report.path));
assert(rawBytes.length === manifest.raw_report.bytes, 'raw report bytes');
assert(summaryBytes.length === manifest.summary_report.bytes, 'summary report bytes');
assert(sha256(rawBytes) === manifest.raw_report.sha256, 'raw report hash');
assert(sha256(summaryBytes) === manifest.summary_report.sha256, 'summary report hash');
const raw = JSON.parse(rawBytes);
const summary = JSON.parse(summaryBytes);
validateRaw(raw);
validateSummary(summary, raw, rawBytes);
assert(raw.source_control.commit === argument && raw.source_control.dirty === false, 'clean source binding');

const workload = showJson('benchmarks/workloads/hdoc-v1.json');
const suites = showJson('tests/suites.json');
const matrix = showJson('.github/ci/matrix.json');
const root = showText('Cargo.toml');
const engine = showText('crates/helix-doc/examples/hdoc_v1_benchmark.rs');
const workflow = showText('.github/workflows/benchmark-baseline.yml');
assert(root.includes('plan-item = "P03-020"') && root.includes('status = "hdoc-benchmark-v1"'), 'source maturity');
assert(workload.shapes.length === 5 && workload.operations.length === 6, 'workload breadth');
assert(workload.warmups === 5 && workload.measurements === 20 && workload.iterations_per_sample === 16, 'measurement bounds');
assert(workload.claim_boundary.timing_threshold === null, 'null timing threshold');
assert(engine.includes('encode_with_options') && engine.includes('decode('), 'production codec engine');
assert(engine.includes('lookup_path_text') && engine.includes('get(direct_field)'), 'production lookup engine');
assert(engine.includes('encode_path_dictionary'), 'real dictionary snapshot engine');
const benchmarkSuite = suites.suites.find(({ id }) => id === 'benchmark');
assert(benchmarkSuite?.expectations.hdoc_shapes === 5, 'suite shape count');
assert(benchmarkSuite?.expectations.hdoc_measurement_samples === 600, 'suite sample count');
assert(matrix.plan_items.at(-1) === 'P03-020', 'CI task history');
assert(matrix.observational.benchmark[0].workload.includes('hdoc-v1/1'), 'observational workload');
assert(workflow.includes('path: dist/benchmarks/'), 'complete benchmark retention path');

assert(raw.totals.shapes === 5 && raw.totals.operations === 30, 'retained inventory');
assert(raw.totals.measurement_samples === 600 && raw.totals.timed_iterations === 9600, 'retained execution count');
assert(summary.acceptance.timing_threshold === null, 'retained threshold');
const expectedSizes = [
  ['minimal', 336, 336],
  ['mixed_types', 888, 888],
  ['nested_fanout', 3296, 1496],
  ['wide_128', 8464, 4056],
  ['compressible_32k', 34992, 712],
];
for (const [index, [id, baseBytes, storedBytes]] of expectedSizes.entries()) {
  const shape = raw.engine.shapes[index];
  assert(shape.id === id, `retained shape ${id}`);
  assert(shape.sizes.base_bytes === baseBytes, `retained base size ${id}`);
  assert(shape.sizes.canonical_stored_bytes === storedBytes, `retained stored size ${id}`);
  assert(shape.operations.length === 6, `retained operation count ${id}`);
  assert(shape.operations.every(({ durations_ns: durations }) => durations.length === 20), `retained samples ${id}`);
}
assert(raw.engine.shapes[0].dictionary_model.savings_bytes < 0, 'negative minimal dictionary result retained');
assert(raw.engine.shapes[3].dictionary_model.savings_basis_points === 8319, 'wide dictionary result');

const policy = execFileSync('node', ['benchmarks/check-hdoc.mjs', 'policy'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(policy.includes('2 schemas, 5 shapes, 6 operations'), 'live policy replay');
const run = execFileSync('node', ['benchmarks/run-hdoc.mjs'], {
  cwd: repository,
  encoding: 'utf8',
  env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
  maxBuffer: 128 * 1024 * 1024,
});
assert(run.includes('600 samples, 9600 timed iterations'), 'live benchmark replay');
const canaries = execFileSync('node', ['tests/toolchain/test-hdoc-benchmark-contract.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(canaries.includes('13 report/authority mutations rejected'), 'live mutation canaries');
for (const [schema, instance] of [
  ['benchmarks/schema/hdoc-raw-v1.schema.json', 'dist/benchmarks/hdoc-v1/raw.json'],
  ['benchmarks/schema/hdoc-summary-v1.schema.json', 'dist/benchmarks/hdoc-v1/summary.json'],
]) {
  const validation = spawnSync('python3', ['-m', 'jsonschema', '-i', instance, schema], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert(validation.status === 0, `offline JSON Schema validation ${schema}`);
}

process.stdout.write('PASS P03-020 source: 43 artifacts bind the production HDoc benchmark contract\n');
process.stdout.write('PASS P03-020 breadth: 5 shapes, 30 operations, 600 samples, 9600 iterations\n');
process.stdout.write('PASS P03-020 gates: retained raw/summary, offline schemas, 13 mutation canaries\n');

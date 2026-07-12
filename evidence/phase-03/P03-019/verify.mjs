#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

assert(argument, 'usage: node evidence/phase-03/P03-019/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-019' && manifest.verdict === 'pass', 'evidence verdict');
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
const reportBytes = readFileSync(path.join(directory, manifest.fuzz_report.path));
assert(reportBytes.length === manifest.fuzz_report.bytes, 'fuzz report bytes');
assert(sha256(reportBytes) === manifest.fuzz_report.sha256, 'fuzz report hash');
const report = JSON.parse(reportBytes);

const root = showText('Cargo.toml');
const fuzzManifest = showText('fuzz/Cargo.toml');
const fuzzLock = showText('fuzz/Cargo.lock');
const authority = showJson('tests/fuzz/toolchain.json');
const suites = showJson('tests/suites.json');
const matrix = showJson('.github/ci/matrix.json');
const workflow = showText('.github/workflows/ci.yml');
const runner = showText('tests/toolchain/check-hdoc-fuzz.mjs');
const browser = showText('tests/browser/hdoc-fuzz-replay.spec.ts');
const targets = [
  'hdoc_decode',
  'hdoc_encode',
  'hdoc_path_lookup',
  'hdoc_tagged_render',
  'hdoc_migration',
];

assert(root.includes('plan-item = "P03-019"'), 'root task maturity');
assert(root.includes('status = "hdoc-fuzz-v1"'), 'root status maturity');
assert(root.includes('exclude = ["fuzz", "target/toolchain"]'), 'separate fuzz workspace');
assert(fuzzManifest.includes('cargo-fuzz = true'), 'cargo-fuzz metadata');
assert(fuzzManifest.includes('libfuzzer-sys = "=0.4.13"'), 'libfuzzer pin');
assert(fuzzLock.includes('version = "0.4.13"'), 'locked libfuzzer version');
for (const target of targets) {
  assert(fuzzManifest.includes(`name = "${target}"`), `manifest target ${target}`);
  const source = showText(`fuzz/fuzz_targets/${target}.rs`);
  assert(source.includes('fuzz_target!'), `libFuzzer entry point ${target}`);
  assert(!source.includes('unsafe {'), `unsafe fuzz target ${target}`);
}
assert(authority.schema === 'helix.hdoc-fuzz-toolchain/1', 'authority schema');
assert(authority.cargo_fuzz === '0.13.2', 'cargo-fuzz authority');
assert(authority.libfuzzer_sys === '0.4.13', 'libfuzzer authority');
assert(authority.rust_toolchain === 'nightly-2026-06-30', 'nightly authority');
assert(authority.bounded_smoke.runs_per_target === 128, 'run bound');
assert(authority.bounded_smoke.maximum_input_bytes === 1048576, 'input bound');
assert(authority.bounded_smoke.timeout_seconds === 10, 'timeout bound');
assert(authority.bounded_smoke.rss_limit_mb === 2048, 'RSS bound');
assert(authority.bounded_smoke.seed === 1212436291, 'fixed seed');
assert(JSON.stringify(authority.targets) === JSON.stringify(targets), 'authority target order');
const fuzzSuite = suites.suites.find(({ id }) => id === 'fuzz');
assert(fuzzSuite?.state === 'active', 'active fuzz suite');
assert(fuzzSuite?.expectations.fuzz_targets === 5, 'suite target count');
assert(fuzzSuite?.expectations.bounded_executions === 640, 'suite execution count');
assert(fuzzSuite?.expectations.seed_files === 57, 'suite seed count');
assert(matrix.plan_items.at(-1) === 'P03-019', 'CI task history');
for (const marker of [
  'rustup toolchain install nightly-2026-06-30 --profile minimal',
  'cargo install cargo-fuzz --locked --version 0.13.2',
  'corepack npm run fuzz:policy',
  'corepack npm run fuzz:test',
]) {
  assert(workflow.includes(marker), `CI marker ${marker}`);
}
assert(runner.includes('INFO: Loaded 1 modules'), 'coverage marker required');
assert(runner.includes('stat::number_of_executed_units'), 'final stats required');
assert(browser.includes('immutable HDoc fuzz seeds'), 'browser replay case');
assert(browser.includes('const checksum ='), 'browser checksum probe');

assert(report.schema === 'helix.hdoc-fuzz-report/1', 'report schema');
assert(report.verdict === 'pass', 'report verdict');
assert(report.total_executions === 640, 'report executions');
assert(JSON.stringify(report.toolchain) === JSON.stringify({
  cargo_fuzz: '0.13.2',
  libfuzzer_sys: '0.4.13',
  rust_toolchain: 'nightly-2026-06-30',
  rustc_commit: '096694416a41840709140eb0fd0ca193d1a3e6ba',
}), 'report toolchain');
assert(report.targets.length === 5, 'report target count');
assert(report.targets.reduce((sum, target) => sum + target.seed_files, 0) === 57, 'report seeds');
for (const [index, target] of report.targets.entries()) {
  assert(target.target === targets[index], `report target ${targets[index]}`);
  assert(target.units === 128, `report units ${targets[index]}`);
  assert(target.coverage_edges > 0 && target.feature_edges > 0, `report coverage ${targets[index]}`);
  assert(target.peak_rss_mb <= 2048, `report RSS ${targets[index]}`);
}

const policyOutput = execFileSync('node', ['tests/toolchain/check-hdoc-fuzz.mjs', 'policy'], {
  cwd: repository,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
assert(policyOutput.includes('5 libFuzzer targets'), 'live policy replay');
const canaryOutput = execFileSync('node', ['tests/toolchain/test-hdoc-fuzz-contract.mjs'], {
  cwd: repository,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
assert(canaryOutput.includes('12 authority mutations'), 'live mutation canaries');
const fuzzOutput = execFileSync('node', ['tests/run-suite.mjs', 'fuzz'], {
  cwd: repository,
  encoding: 'utf8',
  env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
  maxBuffer: 128 * 1024 * 1024,
});
assert(fuzzOutput.includes('"bounded_executions":640'), 'live fuzz execution');
assert(fuzzOutput.includes('"seed_files":57'), 'live seed execution');

process.stdout.write('PASS P03-019 source: 61 artifacts bind five locked libFuzzer entry points\n');
process.stdout.write('PASS P03-019 execution: 57 seeds, 5 targets, 640 bounded coverage-guided units\n');
process.stdout.write('PASS P03-019 gates: retained report, live replay, 12 mutation canaries\n');

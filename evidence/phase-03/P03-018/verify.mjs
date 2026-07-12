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

assert(argument, 'usage: node evidence/phase-03/P03-018/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-018' && manifest.verdict === 'pass', 'evidence verdict');
assert(gitText(['rev-parse', `${argument}^{commit}`]).trim() === argument, 'source commit');
assert(gitText(['rev-parse', `${argument}^`]).trim() === manifest.base_commit, 'source parent');
assert(gitText(['rev-parse', `${argument}^{tree}`]).trim() === manifest.source_tree, 'source tree');

const expectedChanges = [
  'M\t.github/ci/matrix.json',
  'M\tCargo.toml',
  'M\tSpecifications.md',
  'M\tStudy.md',
  'M\tcompatibility/v1/matrix-v1.json',
  'M\tcrates/helix-doc/Cargo.toml',
  'M\tcrates/helix-doc/src/lib.rs',
  'A\tcrates/helix-doc/src/property_tests.rs',
  'M\tdocs/adr/0012-use-bounded-little-endian-hdoc-v1.md',
  'M\tdocs/adr/README.md',
  'M\tdocs/architecture/continuous-integration.md',
  'M\tdocs/architecture/workspace-boundaries.md',
  'M\tdocs/compatibility/v1-semantic-compatibility-matrix.md',
  'M\tdocs/formats/README.md',
  'M\tdocs/formats/hdoc-v1-compression.md',
  'M\tdocs/formats/hdoc-v1-integrity.md',
  'M\tdocs/formats/hdoc-v1-payloads.md',
  'M\tdocs/formats/hdoc-v1-records.md',
  'M\tdocs/formats/hdoc-v1-tagged-json.md',
  'M\tdocs/formats/hdoc-v1-type-tags.md',
  'M\tdocs/formats/hdoc-v1.md',
  'M\tdocs/formats/path-dictionary-v1.md',
  'M\tdocs/governance/decision-owners.md',
  'M\tdocs/quality/code-coverage-policy.md',
  'M\tdocs/quality/test-command-surface.md',
  'M\tfixtures/generation/report-v1.json',
  'M\tfixtures/hdoc/v1/README.md',
  'M\ttests/suites.json',
  'M\ttests/toolchain/bootstrap-contract.mjs',
  'M\ttests/toolchain/check-ci-matrix.mjs',
  'M\ttests/toolchain/check-rust-coverage.mjs',
  'M\ttests/toolchain/rust-coverage-policy.json',
];
const actualChanges = gitText(['diff-tree', '--no-commit-id', '--name-status', '-r', argument])
  .trim()
  .split('\n');
assert(JSON.stringify(actualChanges) === JSON.stringify(expectedChanges), 'source diff inventory');
assert(
  sha256(gitBytes(['diff', '--binary', manifest.base_commit, argument])) === manifest.diff_sha256,
  'source diff hash',
);

const verifierPath = fileURLToPath(import.meta.url);
const verifier = readFileSync(verifierPath);
assert(statSync(verifierPath).size === manifest.verifier.bytes, 'verifier bytes');
assert(sha256(verifier) === manifest.verifier.sha256, 'verifier hash');
const coverageBytes = readFileSync(path.join(directory, manifest.coverage_report.path));
assert(coverageBytes.length === manifest.coverage_report.bytes, 'coverage report bytes');
assert(sha256(coverageBytes) === manifest.coverage_report.sha256, 'coverage report hash');
const coverageReport = JSON.parse(coverageBytes);

const root = showText('Cargo.toml');
const crate = showText('crates/helix-doc/Cargo.toml');
const library = showText('crates/helix-doc/src/lib.rs');
const properties = showText('crates/helix-doc/src/property_tests.rs');
const suites = showJson('tests/suites.json');
const matrix = showJson('.github/ci/matrix.json');
const policy = showJson('tests/toolchain/rust-coverage-policy.json');
const specifications = showText('Specifications.md');
const study = showText('Study.md');

const validateContract = (
  candidateRoot = root,
  candidateCrate = crate,
  candidateLibrary = library,
  candidateProperties = properties,
  candidateSuites = suites,
  candidateMatrix = matrix,
  candidatePolicy = policy,
) => {
  assert(candidateRoot.includes('plan-item = "P03-018"'), 'root task maturity');
  assert(candidateRoot.includes('status = "hdoc-properties-v1"'), 'root status maturity');
  assert(candidateCrate.includes('status = "hdoc-properties-v1"'), 'crate status maturity');
  assert(candidateLibrary.includes('pub const MATURITY: &str = "hdoc-properties-v1"'), 'library maturity');
  assert(candidateLibrary.includes('mod property_tests;'), 'property module registration');
  assert(candidateProperties.includes('const GENERATED_CASES: u64 = 512;'), 'generated case count');
  for (const test of [
    'deterministic_generated_round_trip_property',
    'presentation_permutations_preserve_canonical_identity',
    'malformed_prefix_suffix_and_byte_mutation_corpus_rejects',
    'checksum_repaired_single_bit_mutation_property',
    'tagged_json_generated_canonicalization_property',
  ]) {
    assert(candidateProperties.includes(`fn ${test}()`), `property test ${test}`);
  }
  assert(candidateProperties.includes('for seed in 0..GENERATED_CASES'), '512-seed loops');
  assert(candidateProperties.includes('for seed in 0..256_u64'), 'presentation permutations');
  assert(candidateProperties.includes('for length in 0..fixture.len()'), 'complete prefix corpus');
  assert(candidateProperties.includes('for bit in 0..8'), 'single-bit mutation breadth');
  assert(candidateProperties.includes('refresh_crc(&mut mutation)'), 'checksum-repaired mutations');
  assert(candidateProperties.includes('include_bytes!("../../../fixtures/hdoc/v1/cases/positive-compression-profile-1.hdoc")'), 'compressed fixture mutation');
  assert(!candidateProperties.includes('unsafe {'), 'unsafe property harness');
  const unit = candidateSuites.suites.find(({ id }) => id === 'unit');
  assert(unit?.expectations.rust_tests === 49, 'Rust test inventory');
  assert(candidateMatrix.plan_items.at(-1) === 'P03-018', 'CI task history');
  assert(candidatePolicy.active_product_scope.allowed_status === 'hdoc-properties-v1', 'coverage maturity');
  assert(
    candidatePolicy.source.excluded_path_rules.some(
      ({ reason }) => reason === 'cfg-test-only-deterministic-property-module',
    ),
    'exact test-only coverage exclusion',
  );
};
validateContract();

assert(specifications.includes('checksum-repaired single-bit mutations'), 'specification binding');
assert(study.includes('presentation-permutation hash invariance'), 'study binding');
assert(coverageReport.execution.tests_executed === 49, 'retained coverage test count');
assert(coverageReport.verdict === 'pass', 'retained coverage verdict');
assert(
  coverageReport.groups.every(({ verdict }) => verdict === 'pass'),
  'retained coverage groups',
);

const testOutput = execFileSync(
  'cargo',
  ['test', '--frozen', '-p', 'helix-doc', 'property_tests'],
  {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
    maxBuffer: 64 * 1024 * 1024,
  },
);
assert(testOutput.includes('5 passed; 0 failed'), 'focused property suite pass');

const mutations = [
  () => validateContract(root.replace('P03-018', 'P03-017')),
  () => validateContract(root, crate.replace('hdoc-properties-v1', 'hdoc-cross-language-v1')),
  () => validateContract(root, crate, library.replace('mod property_tests;', '')),
  () => validateContract(root, crate, library, properties.replace('512', '511')),
  () => validateContract(root, crate, library, properties.replace('for bit in 0..8', 'for bit in 0..7')),
  () => validateContract(root, crate, library, properties.replace('refresh_crc(&mut mutation)', '')),
  () => validateContract(root, crate, library, properties, { ...suites, suites: suites.suites.map((suite) => suite.id === 'unit' ? { ...suite, expectations: { ...suite.expectations, rust_tests: 48 } } : suite) }),
  () => validateContract(root, crate, library, properties, suites, { ...matrix, plan_items: matrix.plan_items.slice(0, -1) }),
  () => validateContract(root, crate, library, properties, suites, matrix, { ...policy, active_product_scope: { ...policy.active_product_scope, allowed_status: 'hdoc-cross-language-v1' } }),
  () => validateContract(root, crate, library, properties.replace('use crc::', 'unsafe { use crc::')),
];
for (const mutate of mutations) {
  let rejected = false;
  try {
    mutate();
  } catch {
    rejected = true;
  }
  assert(rejected, 'mutation canary unexpectedly passed');
}

process.stdout.write('PASS P03-018 source: 32 artifacts bind deterministic property hardening\n');
process.stdout.write(
  'PASS P03-018 breadth: 512 codec, 512 tagged, 256 presentation, 4 prefix, and 2656 repaired-bit cases\n',
);
process.stdout.write('PASS P03-018 gates: 49 tests, retained coverage, 10 mutation canaries\n');

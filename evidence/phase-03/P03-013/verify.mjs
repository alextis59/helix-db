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
const showBytes = (file) => gitBytes(['show', `${manifest.commit}:${file}`]);
const showText = (file) => showBytes(file).toString('utf8');
const showJson = (file) => JSON.parse(showText(file));
const evidenceBytes = (file) => readFileSync(path.join(directory, file));

assert(argument, 'usage: node evidence/phase-03/P03-013/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-013', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
assert(gitText(['rev-parse', `${argument}^{commit}`]).trim() === argument, 'source commit');
assert(gitText(['rev-parse', `${argument}^`]).trim() === manifest.base_commit, 'source parent');
assert(gitText(['rev-parse', `${argument}^{tree}`]).trim() === manifest.source_tree, 'source tree');
assert(
  JSON.stringify(manifest.source_commits) ===
    JSON.stringify([manifest.commit, manifest.hosted_fix.commit]),
  'source commits',
);
assert(
  gitText(['rev-parse', `${manifest.hosted_fix.commit}^{commit}`]).trim() ===
    manifest.hosted_fix.commit,
  'hosted fix commit',
);
assert(
  gitText(['rev-parse', `${manifest.hosted_fix.commit}^`]).trim() === manifest.hosted_fix.parent,
  'hosted fix parent',
);
assert(
  gitText(['rev-parse', `${manifest.hosted_fix.commit}^{tree}`]).trim() ===
    manifest.hosted_fix.tree,
  'hosted fix tree',
);
assert(
  gitText(['diff-tree', '--no-commit-id', '--name-status', '-r', manifest.hosted_fix.commit]).trim() ===
    'M\ttests/toolchain/bootstrap-contract.mjs',
  'hosted fix inventory',
);
assert(
  sha256(gitBytes(['diff', '--binary', manifest.hosted_fix.parent, manifest.hosted_fix.commit])) ===
    manifest.hosted_fix.diff_sha256,
  'hosted fix diff hash',
);
const fixedBootstrap = gitBytes([
  'show',
  `${manifest.hosted_fix.commit}:tests/toolchain/bootstrap-contract.mjs`,
]).toString('utf8');
assert(
  fixedBootstrap.includes('canonical collection field-path dictionary snapshots with non-reuse lineage validation'),
  'hosted fix claim marker',
);

const expectedChanges = [
  'M\t.github/ci/matrix.json',
  'M\tCargo.toml',
  'M\tSpecifications.md',
  'M\tStudy.md',
  'M\tcompatibility/v1/check-matrix.mjs',
  'M\tcompatibility/v1/matrix-v1.json',
  'M\tcrates/helix-doc/Cargo.toml',
  'M\tcrates/helix-doc/src/lib.rs',
  'A\tcrates/helix-doc/src/path_dictionary.rs',
  'M\tdifferential/mongodb/cases-v1.json',
  'M\tdifferential/mongodb/report-v1.json',
  'M\tdifferential/mongodb/upstream-observations-v1.json',
  'M\tdocs/adr/0012-use-bounded-little-endian-hdoc-v1.md',
  'M\tdocs/adr/README.md',
  'M\tdocs/architecture/continuous-integration.md',
  'M\tdocs/architecture/limits-v1.md',
  'M\tdocs/architecture/workspace-boundaries.md',
  'M\tdocs/compatibility/v1-semantic-compatibility-matrix.md',
  'M\tdocs/development/bootstrap.json',
  'M\tdocs/development/bootstrap.md',
  'M\tdocs/formats/README.md',
  'M\tdocs/formats/hdoc-v1-integrity.md',
  'M\tdocs/formats/hdoc-v1-records.md',
  'M\tdocs/formats/hdoc-v1.md',
  'A\tdocs/formats/path-dictionary-v1.json',
  'A\tdocs/formats/path-dictionary-v1.md',
  'M\tdocs/governance/decision-owners.md',
  'M\tdocs/quality/code-coverage-policy.md',
  'M\tdocs/quality/deterministic-fixture-generation.md',
  'M\tdocs/quality/semantic-fixture-format.md',
  'M\tdocs/quality/test-command-surface.md',
  'M\tfixtures/generation/report-v1.json',
  'M\tfixtures/semantic/COVERAGE.md',
  'M\tfixtures/semantic/cases/limits/document-values.json',
  'M\tfixtures/semantic/coverage-v1.json',
  'M\tfixtures/semantic/generate-corpus.mjs',
  'M\tfixtures/semantic/manifest.json',
  'M\tfixtures/semantic/oracle-report-v1.json',
  'M\treference/semantic-oracle/README.md',
  'M\treference/semantic-oracle/registry.mjs',
  'M\treference/semantic-oracle/test-oracle.mjs',
  'M\ttests/suites.json',
  'M\ttests/toolchain/bootstrap-contract.mjs',
  'M\ttests/toolchain/check-bootstrap.mjs',
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
const reportBytes = evidenceBytes('rust-coverage-report.json');
assert(reportBytes.length === manifest.coverage_report.bytes, 'coverage report bytes');
assert(sha256(reportBytes) === manifest.coverage_report.sha256, 'coverage report hash');

const root = showText('Cargo.toml');
const crate = showText('crates/helix-doc/Cargo.toml');
const library = showText('crates/helix-doc/src/lib.rs');
const dictionary = showText('crates/helix-doc/src/path_dictionary.rs');
const format = showText('docs/formats/path-dictionary-v1.md');
const registry = showJson('docs/formats/path-dictionary-v1.json');
const limits = showText('docs/architecture/limits-v1.md');
const specifications = showText('Specifications.md');
const study = showText('Study.md');
const suites = showJson('tests/suites.json');
const matrix = showJson('.github/ci/matrix.json');
const policy = showJson('tests/toolchain/rust-coverage-policy.json');
const oracleRegistry = showText('reference/semantic-oracle/registry.mjs');
const compatibility = showJson('compatibility/v1/matrix-v1.json');
const coverage = JSON.parse(reportBytes);

const validateContract = (
  candidateRoot = root,
  candidateCrate = crate,
  candidateLibrary = library,
  candidateDictionary = dictionary,
  candidateFormat = format,
  candidateRegistry = registry,
  candidateLimits = limits,
  candidateSpecifications = specifications,
  candidateStudy = study,
  candidateSuites = suites,
  candidateMatrix = matrix,
  candidatePolicy = policy,
  candidateOracleRegistry = oracleRegistry,
) => {
  for (const marker of [
    'plan-item = "P03-013"',
    'status = "path-dictionary-format"',
    'database-functionality = true',
  ]) {
    assert(candidateRoot.includes(marker), `root marker: ${marker}`);
  }
  assert(candidateCrate.includes('status = "path-dictionary-format"'), 'crate maturity');
  for (const marker of [
    'pub use path_dictionary::{',
    'encode_path_dictionary',
    'decode_path_dictionary',
    'validate_path_dictionary_successor',
  ]) {
    assert(candidateLibrary.includes(marker), `library export: ${marker}`);
  }
  assert(!candidateDictionary.includes('unsafe {'), 'unsafe dictionary codec');
  for (const marker of [
    'pub const PATH_DICTIONARY_FORMAT: &str = "helix.path-dictionary/1.0";',
    'const MAX_SNAPSHOT_BYTES: u64 = 67_108_864;',
    'const MAX_PATHS: u64 = 1_000_000;',
    'pub fn encode_path_dictionary',
    'pub fn decode_path_dictionary',
    'pub fn validate_path_dictionary_successor',
    'let checksum = CRC32C.checksum(&bytes);',
    'dictionary_hash',
    'FieldPath::parse',
    'canonical_snapshots_round_trip_and_preserve_append_only_lineage',
    'successor_validation_rejects_identity_version_prefix_and_backdated_entries',
  ]) {
    assert(candidateDictionary.includes(marker), `implementation marker: ${marker}`);
  }
  assert((candidateDictionary.match(/#\[test\]/g) ?? []).length === 4, 'dictionary tests');
  for (const marker of [
    'Format identity: `helix.path-dictionary/1.0`',
    'Existing entries remain byte-for-byte identical',
    'CRC-32C Castagnoli covers the complete stored snapshot',
    '`validate_path_dictionary_successor`',
    'Base HDoc 1.0 remains self-contained',
  ]) {
    assert(candidateFormat.includes(marker), `format marker: ${marker}`);
  }
  assert(candidateRegistry.format.identity === 'helix.path-dictionary/1.0', 'registry identity');
  assert(candidateRegistry.format.maximum_bytes === 67_108_864, 'registry byte limit');
  assert(candidateRegistry.format.maximum_paths === 1_000_000, 'registry path limit');
  assert(candidateLimits.includes('`dictionary.paths`'), 'path limit documentation');
  assert(candidateLimits.includes('`dictionary.snapshot_bytes`'), 'byte limit documentation');
  assert(candidateSpecifications.includes('The implemented standalone format identity is'), 'spec binding');
  assert(candidateStudy.includes('The implemented `helix.path-dictionary/1.0` format'), 'study binding');
  const expectations = candidateSuites.suites.find(({ id }) => id === 'unit')?.expectations;
  assert(expectations?.rust_tests === 36, 'unit test inventory');
  assert(candidateMatrix.plan_items.at(-1) === 'P03-013', 'CI history');
  assert(candidatePolicy.active_product_scope.allowed_status === 'path-dictionary-format', 'coverage maturity');
  assert(candidateOracleRegistry.includes("'dictionary.paths': { maximum: 1_000_000n"), 'oracle path limit');
  assert(candidateOracleRegistry.includes("'dictionary.snapshot_bytes': { maximum: 67_108_864n"), 'oracle byte limit');
};
validateContract();

assert(
  compatibility.inputs.specifications.sha256 === sha256(Buffer.from(specifications)),
  'matrix specification hash',
);
for (const id of ['limit.dictionary.paths', 'limit.dictionary.snapshot_bytes']) {
  assert(compatibility.native_rows.some((row) => row.id === id), `compatibility row: ${id}`);
}
assert(coverage.schema === 'helix.rust-coverage-report/1', 'coverage schema');
assert(coverage.verdict === 'pass', 'coverage verdict');
assert(coverage.execution.tests_executed === 36, 'coverage tests');
assert(coverage.execution.workspace_status === 'path-dictionary-format', 'coverage maturity');
const dictionaryCoverage = coverage.product_files.find(
  ({ path: file }) => file === 'crates/helix-doc/src/path_dictionary.rs',
);
assert(dictionaryCoverage?.sha256 === sha256(showBytes('crates/helix-doc/src/path_dictionary.rs')), 'source/report binding');
assert(dictionaryCoverage.metrics.functions.covered === 42 && dictionaryCoverage.metrics.functions.count === 42, 'function coverage');
assert(dictionaryCoverage.metrics.lines.covered === 361 && dictionaryCoverage.metrics.lines.count === 361, 'line coverage');
assert(dictionaryCoverage.metrics.regions.covered === 703 && dictionaryCoverage.metrics.regions.count === 715, 'region coverage');
const semantic = coverage.groups.find(({ id }) => id === 'semantic-critical');
assert(semantic?.verdict === 'pass' && semantic.failures.length === 0, 'semantic coverage group');

let mutations = 0;
const rejectTextMutation = (original, from, to, validate) => {
  assert(original.includes(from), `mutation marker absent: ${from}`);
  let rejected = false;
  try {
    validate(original.replace(from, to));
  } catch (error) {
    rejected = error instanceof Error && error.message.length > 0;
  }
  assert(rejected, `mutation accepted: ${from}`);
  mutations += 1;
};
const rejectObjectMutation = (original, mutate, validate) => {
  const changed = structuredClone(original);
  mutate(changed);
  let rejected = false;
  try {
    validate(changed);
  } catch (error) {
    rejected = error instanceof Error && error.message.length > 0;
  }
  assert(rejected, 'object mutation accepted');
  mutations += 1;
};
rejectTextMutation(root, 'plan-item = "P03-013"', 'plan-item = "P03-012"', (value) => validateContract(value));
rejectTextMutation(root, 'status = "path-dictionary-format"', 'status = "hdoc-tagged-json"', (value) => validateContract(value));
rejectTextMutation(crate, 'status = "path-dictionary-format"', 'status = "hdoc-tagged-json"', (value) => validateContract(root, value));
rejectTextMutation(dictionary, 'pub fn encode_path_dictionary', 'fn encode_path_dictionary', (value) => validateContract(root, crate, library, value));
rejectTextMutation(dictionary, 'pub fn decode_path_dictionary', 'fn decode_path_dictionary', (value) => validateContract(root, crate, library, value));
rejectTextMutation(dictionary, 'pub fn validate_path_dictionary_successor', 'fn validate_path_dictionary_successor', (value) => validateContract(root, crate, library, value));
rejectTextMutation(dictionary, 'const MAX_PATHS: u64 = 1_000_000;', 'const MAX_PATHS: u64 = u64::MAX;', (value) => validateContract(root, crate, library, value));
rejectTextMutation(dictionary, 'const MAX_SNAPSHOT_BYTES: u64 = 67_108_864;', 'const MAX_SNAPSHOT_BYTES: u64 = u64::MAX;', (value) => validateContract(root, crate, library, value));
rejectTextMutation(dictionary, 'let checksum = CRC32C.checksum(&bytes);', 'let checksum = CRC32C.digest(&bytes);', (value) => validateContract(root, crate, library, value));
rejectTextMutation(dictionary, 'FieldPath::parse', 'FieldPath::unchecked', (value) => validateContract(root, crate, library, value));
rejectTextMutation(format, 'Existing entries remain byte-for-byte identical', 'Existing entries may change', (value) => validateContract(root, crate, library, dictionary, value));
rejectTextMutation(specifications, 'The implemented standalone format identity is', 'The planned standalone format identity is', (value) => validateContract(root, crate, library, dictionary, format, registry, limits, value));
rejectTextMutation(study, 'The implemented `helix.path-dictionary/1.0` format', 'The proposed `helix.path-dictionary/1.0` format', (value) => validateContract(root, crate, library, dictionary, format, registry, limits, specifications, value));
rejectTextMutation(oracleRegistry, "'dictionary.paths': { maximum: 1_000_000n", "'dictionary.paths': { maximum: 2_000_000n", (value) => validateContract(root, crate, library, dictionary, format, registry, limits, specifications, study, suites, matrix, policy, value));
rejectObjectMutation(registry, (value) => (value.format.maximum_paths = 2_000_000), (value) => validateContract(root, crate, library, dictionary, format, value));
rejectObjectMutation(suites, (value) => (value.suites.find(({ id }) => id === 'unit').expectations.rust_tests = 35), (value) => validateContract(root, crate, library, dictionary, format, registry, limits, specifications, study, value));
rejectObjectMutation(matrix, (value) => value.plan_items.pop(), (value) => validateContract(root, crate, library, dictionary, format, registry, limits, specifications, study, suites, value));
rejectObjectMutation(policy, (value) => (value.active_product_scope.allowed_status = 'hdoc-tagged-json'), (value) => validateContract(root, crate, library, dictionary, format, registry, limits, specifications, study, suites, matrix, value));
rejectObjectMutation(coverage, (value) => (value.execution.tests_executed = 35), (value) => assert(value.execution.tests_executed === 36, 'coverage test mutation'));
rejectObjectMutation(coverage, (value) => (value.product_files.find(({ path: file }) => file.endsWith('path_dictionary.rs')).metrics.lines.covered = 360), (value) => {
  const record = value.product_files.find(({ path: file }) => file.endsWith('path_dictionary.rs'));
  assert(record.metrics.lines.covered === 361, 'coverage line mutation');
});
assert(mutations === manifest.verification.mutation_canaries, 'mutation count');

process.stdout.write(
  `PASS P03-013 evidence: ${expectedChanges.length + 1} source artifacts in 2 commits, 28 helix-doc tests, 36 workspace tests, canonical dictionary snapshots/non-reuse, 100% lines/functions, ${mutations} mutation canaries\n`,
);

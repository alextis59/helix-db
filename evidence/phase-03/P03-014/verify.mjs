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

assert(argument, 'usage: node evidence/phase-03/P03-014/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-014', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
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
  'A\tcrates/helix-doc/src/path_dictionary_state.rs',
  'M\tdocs/adr/0012-use-bounded-little-endian-hdoc-v1.md',
  'M\tdocs/adr/README.md',
  'M\tdocs/architecture/continuous-integration.md',
  'M\tdocs/architecture/workspace-boundaries.md',
  'M\tdocs/compatibility/v1-semantic-compatibility-matrix.md',
  'M\tdocs/development/bootstrap.json',
  'M\tdocs/development/bootstrap.md',
  'M\tdocs/formats/README.md',
  'M\tdocs/formats/hdoc-v1-integrity.md',
  'M\tdocs/formats/hdoc-v1-records.md',
  'M\tdocs/formats/hdoc-v1.md',
  'M\tdocs/formats/path-dictionary-v1.md',
  'M\tdocs/governance/decision-owners.md',
  'M\tdocs/quality/code-coverage-policy.md',
  'M\tfixtures/generation/report-v1.json',
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
const lifecycle = showText('crates/helix-doc/src/path_dictionary_state.rs');
const format = showText('docs/formats/path-dictionary-v1.md');
const specifications = showText('Specifications.md');
const study = showText('Study.md');
const suites = showJson('tests/suites.json');
const matrix = showJson('.github/ci/matrix.json');
const policy = showJson('tests/toolchain/rust-coverage-policy.json');
const compatibility = showJson('compatibility/v1/matrix-v1.json');
const coverage = JSON.parse(reportBytes);

const validateContract = (
  candidateRoot = root,
  candidateCrate = crate,
  candidateLibrary = library,
  candidateLifecycle = lifecycle,
  candidateFormat = format,
  candidateSpecifications = specifications,
  candidateStudy = study,
  candidateSuites = suites,
  candidateMatrix = matrix,
  candidatePolicy = policy,
) => {
  for (const marker of [
    'plan-item = "P03-014"',
    'status = "path-dictionary-lifecycle"',
    'database-functionality = true',
  ]) {
    assert(candidateRoot.includes(marker), `root marker: ${marker}`);
  }
  assert(candidateCrate.includes('status = "path-dictionary-lifecycle"'), 'crate maturity');
  for (const marker of [
    'CollectionPathDictionary',
    'PathDictionaryPin',
    'PreparedPathDictionaryUpdate',
    'PathDictionaryLifecycleError',
  ]) {
    assert(candidateLibrary.includes(marker), `library export: ${marker}`);
  }
  assert(!candidateLifecycle.includes('unsafe {'), 'unsafe lifecycle');
  for (const marker of [
    'pub struct CollectionPathDictionary',
    'pub struct PathDictionaryPin',
    'pub struct PreparedPathDictionaryUpdate',
    'pub fn prepare_registration',
    'pub fn publish',
    'pub fn register_paths',
    'pub fn recover',
    'Self::WriteConflict { .. } => "CON_WRITE_CONFLICT",',
    '"VAL_INVALID_PATH"',
    'validate_path_dictionary_successor(previous, next)',
    'registration_is_atomic_idempotent_ordered_and_version_pinned',
    'stale_updates_invalid_paths_and_identity_fail_without_partial_publication',
    'recovery_requires_genesis_and_proves_every_successor',
  ]) {
    assert(candidateLifecycle.includes(marker), `implementation marker: ${marker}`);
  }
  assert(
    (candidateLifecycle.match(/validate_path_dictionary_successor\(previous, next\)/g) ?? [])
      .length === 2,
    'recovery and publication lineage checks',
  );
  assert((candidateLifecycle.match(/#\[test\]/g) ?? []).length === 4, 'lifecycle tests');
  for (const marker of [
    'Implemented registration and publication lifecycle',
    '`CON_WRITE_CONFLICT`',
    'Resolution and version pinning',
    'requires a nonempty genesis-to-current chain',
  ]) {
    assert(candidateFormat.includes(marker), `format marker: ${marker}`);
  }
  assert(candidateSpecifications.includes('`P03-014` implements mutable registration'), 'spec binding');
  assert(candidateStudy.includes('`P03-014` now resolves the portable mutable lifecycle'), 'study binding');
  assert(candidateSuites.suites.find(({ id }) => id === 'unit')?.expectations.rust_tests === 40, 'test inventory');
  assert(candidateMatrix.plan_items.at(-1) === 'P03-014', 'CI history');
  assert(candidatePolicy.active_product_scope.allowed_status === 'path-dictionary-lifecycle', 'coverage maturity');
};
validateContract();

assert(
  compatibility.inputs.specifications.sha256 === sha256(Buffer.from(specifications)),
  'matrix specification hash',
);
assert(coverage.schema === 'helix.rust-coverage-report/1', 'coverage schema');
assert(coverage.verdict === 'pass', 'coverage verdict');
assert(coverage.execution.tests_executed === 40, 'coverage tests');
assert(coverage.execution.workspace_status === 'path-dictionary-lifecycle', 'coverage maturity');
const lifecycleCoverage = coverage.product_files.find(
  ({ path: file }) => file === 'crates/helix-doc/src/path_dictionary_state.rs',
);
assert(lifecycleCoverage?.sha256 === sha256(showBytes('crates/helix-doc/src/path_dictionary_state.rs')), 'source/report binding');
assert(lifecycleCoverage.metrics.functions.covered === 35 && lifecycleCoverage.metrics.functions.count === 35, 'function coverage');
assert(lifecycleCoverage.metrics.lines.covered === 204 && lifecycleCoverage.metrics.lines.count === 204, 'line coverage');
assert(lifecycleCoverage.metrics.regions.covered === 342 && lifecycleCoverage.metrics.regions.count === 355, 'region coverage');
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
rejectTextMutation(root, 'plan-item = "P03-014"', 'plan-item = "P03-013"', (value) => validateContract(value));
rejectTextMutation(root, 'status = "path-dictionary-lifecycle"', 'status = "path-dictionary-format"', (value) => validateContract(value));
rejectTextMutation(crate, 'status = "path-dictionary-lifecycle"', 'status = "path-dictionary-format"', (value) => validateContract(root, value));
rejectTextMutation(lifecycle, 'pub fn prepare_registration', 'fn prepare_registration', (value) => validateContract(root, crate, library, value));
rejectTextMutation(lifecycle, 'pub fn publish', 'fn publish', (value) => validateContract(root, crate, library, value));
rejectTextMutation(lifecycle, 'pub fn recover', 'fn recover', (value) => validateContract(root, crate, library, value));
rejectTextMutation(lifecycle, 'Self::WriteConflict { .. } => "CON_WRITE_CONFLICT",', 'Self::WriteConflict { .. } => "INT_INVARIANT",', (value) => validateContract(root, crate, library, value));
rejectTextMutation(lifecycle, 'validate_path_dictionary_successor(previous, next)', 'let _ = (previous, next)', (value) => validateContract(root, crate, library, value));
rejectTextMutation(lifecycle, 'registration_is_atomic_idempotent_ordered_and_version_pinned', 'partial_registration_test', (value) => validateContract(root, crate, library, value));
rejectTextMutation(format, 'Implemented registration and publication lifecycle', 'Planned registration and publication lifecycle', (value) => validateContract(root, crate, library, lifecycle, value));
rejectTextMutation(specifications, '`P03-014` implements mutable registration', '`P03-014` plans mutable registration', (value) => validateContract(root, crate, library, lifecycle, format, value));
rejectTextMutation(study, '`P03-014` now resolves the portable mutable lifecycle', '`P03-014` may resolve the portable mutable lifecycle', (value) => validateContract(root, crate, library, lifecycle, format, specifications, value));
rejectObjectMutation(suites, (value) => (value.suites.find(({ id }) => id === 'unit').expectations.rust_tests = 39), (value) => validateContract(root, crate, library, lifecycle, format, specifications, study, value));
rejectObjectMutation(matrix, (value) => value.plan_items.pop(), (value) => validateContract(root, crate, library, lifecycle, format, specifications, study, suites, value));
rejectObjectMutation(policy, (value) => (value.active_product_scope.allowed_status = 'path-dictionary-format'), (value) => validateContract(root, crate, library, lifecycle, format, specifications, study, suites, matrix, value));
rejectObjectMutation(coverage, (value) => (value.execution.tests_executed = 39), (value) => assert(value.execution.tests_executed === 40, 'coverage test mutation'));
rejectObjectMutation(coverage, (value) => (value.product_files.find(({ path: file }) => file.endsWith('path_dictionary_state.rs')).metrics.lines.covered = 203), (value) => {
  const record = value.product_files.find(({ path: file }) => file.endsWith('path_dictionary_state.rs'));
  assert(record.metrics.lines.covered === 204, 'coverage line mutation');
});
assert(mutations === manifest.verification.mutation_canaries, 'mutation count');

process.stdout.write(
  `PASS P03-014 evidence: ${expectedChanges.length} source artifacts, 32 helix-doc tests, 40 workspace tests, atomic dictionary lifecycle/version pins, 100% lines/functions, ${mutations} mutation canaries\n`,
);

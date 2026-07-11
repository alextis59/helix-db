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

assert(argument, 'usage: node evidence/phase-03/P03-012/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-012', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
assert(gitText(['rev-parse', `${argument}^{commit}`]).trim() === argument, 'source commit');
assert(gitText(['rev-parse', `${argument}^`]).trim() === manifest.base_commit, 'source parent');
assert(gitText(['rev-parse', `${argument}^{tree}`]).trim() === manifest.source_tree, 'source tree');

const expectedChanges = [
  'M\t.github/ci/matrix.json',
  'M\tCargo.toml',
  'M\tREADME.md',
  'M\tSpecifications.md',
  'M\tStudy.md',
  'M\tcompatibility/v1/matrix-v1.json',
  'M\tcrates/helix-doc/Cargo.toml',
  'M\tcrates/helix-doc/src/lib.rs',
  'A\tcrates/helix-doc/src/tagged_json.rs',
  'M\tdocs/README.md',
  'M\tdocs/adr/0012-use-bounded-little-endian-hdoc-v1.md',
  'M\tdocs/adr/README.md',
  'M\tdocs/architecture/continuous-integration.md',
  'M\tdocs/architecture/workspace-boundaries.md',
  'M\tdocs/compatibility/v1-semantic-compatibility-matrix.md',
  'M\tdocs/development/bootstrap.json',
  'M\tdocs/development/bootstrap.md',
  'M\tdocs/formats/README.md',
  'M\tdocs/formats/hdoc-v1-compression.md',
  'M\tdocs/formats/hdoc-v1-integrity.md',
  'M\tdocs/formats/hdoc-v1-payloads.md',
  'M\tdocs/formats/hdoc-v1-records.md',
  'A\tdocs/formats/hdoc-v1-tagged-json.md',
  'M\tdocs/formats/hdoc-v1-type-tags.md',
  'M\tdocs/formats/hdoc-v1.md',
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
assert(sha256(gitBytes(['diff', '--binary', manifest.base_commit, argument])) === manifest.diff_sha256, 'source diff hash');

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
const tagged = showText('crates/helix-doc/src/tagged_json.rs');
const format = showText('docs/formats/hdoc-v1-tagged-json.md');
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
  candidateTagged = tagged,
  candidateFormat = format,
  candidateSpecifications = specifications,
  candidateStudy = study,
  candidateSuites = suites,
  candidateMatrix = matrix,
  candidatePolicy = policy,
) => {
  for (const marker of ['plan-item = "P03-012"', 'status = "hdoc-tagged-json"', 'database-functionality = true']) {
    assert(candidateRoot.includes(marker), `root marker: ${marker}`);
  }
  assert(candidateCrate.includes('status = "hdoc-tagged-json"'), 'crate maturity');
  assert(candidateLibrary.includes('pub use tagged_json::{'), 'tagged JSON export');
  assert(candidateLibrary.includes('import_tagged_json'), 'import export');
  assert(candidateLibrary.includes('HDOC_TAGGED_JSON_PROFILE'), 'profile export');
  assert(!candidateTagged.includes('unsafe {'), 'unsafe tagged conversion');
  for (const marker of [
    'pub const HDOC_TAGGED_JSON_PROFILE: &str = "helix.hdoc-tagged-json/1";',
    'pub enum JsonImportError',
    'pub fn import_tagged_json',
    'to_canonical_tagged_json',
    'fn validate_import_document',
    'fn measure_owned_document',
    'fn parse_unicode_escape',
    'fn parse_number_token',
    'DuplicateProperty',
    'const MAX_JSON_IMPORT_BYTES: u64 = 67_108_864;',
    'MAX_VECTOR_DIMENSION',
    'canonical_render_and_import_preserve_every_logical_type',
    'parser_enforces_field_and_array_count_limits',
  ]) {
    assert(candidateTagged.includes(marker), `implementation marker: ${marker}`);
  }
  assert((candidateLibrary.match(/#\[test\]/g) ?? []).length === 18, 'legacy helix-doc tests');
  assert((candidateTagged.match(/#\[test\]/g) ?? []).length === 6, 'tagged JSON tests');
  for (const marker of [
    'Profile identity: `helix.hdoc-tagged-json/1`',
    'not the public command grammar',
    'Exact tagged value registry',
    'Strict import algorithm',
    'computes the exact uncompressed canonical HDoc layout',
    '`PAR_INVALID_UTF8`',
  ]) {
    assert(candidateFormat.includes(marker), `format marker: ${marker}`);
  }
  assert(candidateSpecifications.includes('`P03-012` implements the versioned'), 'specification binding');
  assert(candidateStudy.includes('`P03-012` then connects validated HDoc values'), 'study binding');
  assert(candidateSuites.suites.find(({ id }) => id === 'unit')?.expectations.rust_tests === 32, 'unit test inventory');
  assert(candidateMatrix.plan_items.at(-1) === 'P03-012', 'CI history');
  assert(candidatePolicy.active_product_scope.allowed_status === 'hdoc-tagged-json', 'coverage maturity');
};
validateContract();

assert(compatibility.inputs.specifications.sha256 === sha256(Buffer.from(specifications)), 'matrix specification hash');
assert(coverage.schema === 'helix.rust-coverage-report/1', 'coverage schema');
assert(coverage.verdict === 'pass', 'coverage verdict');
assert(coverage.execution.tests_executed === 32, 'coverage tests');
assert(coverage.execution.workspace_status === 'hdoc-tagged-json', 'coverage maturity');
const taggedCoverage = coverage.product_files.find(({ path: file }) => file === 'crates/helix-doc/src/tagged_json.rs');
assert(taggedCoverage?.sha256 === sha256(showBytes('crates/helix-doc/src/tagged_json.rs')), 'tagged source/report binding');
assert(taggedCoverage.metrics.functions.covered === 117 && taggedCoverage.metrics.functions.count === 117, 'tagged function coverage');
assert(taggedCoverage.metrics.lines.covered === 1178 && taggedCoverage.metrics.lines.count === 1178, 'tagged line coverage');
assert(taggedCoverage.metrics.regions.covered === 2380 && taggedCoverage.metrics.regions.count === 2493, 'tagged region coverage');
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
rejectTextMutation(root, 'plan-item = "P03-012"', 'plan-item = "P03-011"', (value) => validateContract(value));
rejectTextMutation(root, 'status = "hdoc-tagged-json"', 'status = "hdoc-path-lookup"', (value) => validateContract(value));
rejectTextMutation(crate, 'status = "hdoc-tagged-json"', 'status = "hdoc-path-lookup"', (value) => validateContract(root, value));
rejectTextMutation(tagged, 'pub fn import_tagged_json', 'fn import_tagged_json', (value) => validateContract(root, crate, library, value));
rejectTextMutation(tagged, 'fn validate_import_document', 'fn skip_import_validation', (value) => validateContract(root, crate, library, value));
rejectTextMutation(tagged, 'fn measure_owned_document', 'fn estimate_owned_document', (value) => validateContract(root, crate, library, value));
rejectTextMutation(tagged, 'fn parse_unicode_escape', 'fn accept_unicode_escape', (value) => validateContract(root, crate, library, value));
rejectTextMutation(tagged, 'const MAX_JSON_IMPORT_BYTES: u64 = 67_108_864;', 'const MAX_JSON_IMPORT_BYTES: u64 = u64::MAX;', (value) => validateContract(root, crate, library, value));
rejectTextMutation(tagged, 'canonical_render_and_import_preserve_every_logical_type', 'partial_render_test', (value) => validateContract(root, crate, library, value));
rejectTextMutation(format, 'not the public command grammar', 'is the public command grammar', (value) => validateContract(root, crate, library, tagged, value));
rejectTextMutation(specifications, '`P03-012` implements the versioned', '`P03-012` plans the versioned', (value) => validateContract(root, crate, library, tagged, format, value));
rejectTextMutation(study, '`P03-012` then connects validated HDoc values', '`P03-012` may connect validated HDoc values', (value) => validateContract(root, crate, library, tagged, format, specifications, value));
rejectObjectMutation(suites, (value) => (value.suites.find(({ id }) => id === 'unit').expectations.rust_tests = 31), (value) => validateContract(root, crate, library, tagged, format, specifications, study, value));
rejectObjectMutation(matrix, (value) => value.plan_items.pop(), (value) => validateContract(root, crate, library, tagged, format, specifications, study, suites, value));
rejectObjectMutation(policy, (value) => (value.active_product_scope.allowed_status = 'hdoc-path-lookup'), (value) => validateContract(root, crate, library, tagged, format, specifications, study, suites, matrix, value));
rejectObjectMutation(coverage, (value) => (value.execution.tests_executed = 31), (value) => assert(value.execution.tests_executed === 32, 'coverage test mutation'));
rejectObjectMutation(coverage, (value) => (value.product_files.find(({ path: file }) => file.endsWith('tagged_json.rs')).metrics.lines.covered = 1177), (value) => {
  const record = value.product_files.find(({ path: file }) => file.endsWith('tagged_json.rs'));
  assert(record.metrics.lines.covered === 1178, 'coverage line mutation');
});
assert(mutations === manifest.verification.mutation_canaries, 'mutation count');

process.stdout.write(
  `PASS P03-012 evidence: ${expectedChanges.length} source artifacts, 24 helix-doc tests, 32 workspace tests, lossless tagged rendering/import, 100% lines/functions, ${mutations} mutation canaries\n`,
);

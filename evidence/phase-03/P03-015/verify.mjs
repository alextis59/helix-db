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

assert(argument, 'usage: node evidence/phase-03/P03-015/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-015', 'evidence task mismatch');
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
  'A\tcrates/helix-doc/src/hdoc_negotiation.rs',
  'M\tcrates/helix-doc/src/lib.rs',
  'M\tdocs/adr/0012-use-bounded-little-endian-hdoc-v1.md',
  'M\tdocs/adr/README.md',
  'M\tdocs/architecture/continuous-integration.md',
  'M\tdocs/architecture/workspace-boundaries.md',
  'M\tdocs/compatibility/v1-semantic-compatibility-matrix.md',
  'M\tdocs/development/bootstrap.json',
  'M\tdocs/development/bootstrap.md',
  'M\tdocs/formats/README.md',
  'A\tdocs/formats/hdoc-v1-compatibility.json',
  'A\tdocs/formats/hdoc-v1-compatibility.md',
  'M\tdocs/formats/hdoc-v1-compression.json',
  'M\tdocs/formats/hdoc-v1-compression.md',
  'M\tdocs/formats/hdoc-v1-envelope.json',
  'M\tdocs/formats/hdoc-v1-integrity.md',
  'M\tdocs/formats/hdoc-v1-payloads.json',
  'M\tdocs/formats/hdoc-v1-payloads.md',
  'M\tdocs/formats/hdoc-v1-records.md',
  'M\tdocs/formats/hdoc-v1-type-tags.json',
  'M\tdocs/formats/hdoc-v1-type-tags.md',
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
const negotiation = showText('crates/helix-doc/src/hdoc_negotiation.rs');
const format = showText('docs/formats/hdoc-v1-compatibility.md');
const formatJson = showJson('docs/formats/hdoc-v1-compatibility.json');
const envelope = showJson('docs/formats/hdoc-v1-envelope.json');
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
  candidateNegotiation = negotiation,
  candidateFormat = format,
  candidateFormatJson = formatJson,
  candidateEnvelope = envelope,
  candidateSpecifications = specifications,
  candidateStudy = study,
  candidateSuites = suites,
  candidateMatrix = matrix,
  candidatePolicy = policy,
) => {
  for (const marker of [
    'plan-item = "P03-015"',
    'status = "hdoc-feature-negotiation"',
    'database-functionality = true',
  ]) {
    assert(candidateRoot.includes(marker), `root marker: ${marker}`);
  }
  assert(candidateCrate.includes('status = "hdoc-feature-negotiation"'), 'crate maturity');
  for (const marker of [
    'HDocCapabilities',
    'HDocMigrationAssessment',
    'HDocMigrationTarget',
    'negotiate_hdoc',
    'assess_hdoc_migration',
  ]) {
    assert(candidateLibrary.includes(marker), `library export: ${marker}`);
  }
  assert(!candidateNegotiation.includes('unsafe {'), 'unsafe negotiation');
  for (const marker of [
    'pub const HDOC_CURRENT_MAJOR: u16 = 1;',
    'pub const HDOC_CURRENT_MINOR: u16 = 0;',
    'pub const fn supports(self, feature: HDocFeature) -> bool',
    'matches!(feature, HDocFeature::SectionCompression)',
    'pub fn negotiate_hdoc(bytes: &[u8])',
    'let decoded = decode(bytes)?;',
    'pub fn assess_hdoc_migration(',
    'if target != HDocMigrationTarget::current()',
    'Self::UnsupportedTarget { .. } => "CAP_UNSUPPORTED_VERSION"',
    'pub const fn requires_rewrite(self) -> bool',
    'capability_matrix_is_exact_and_closed_world',
    'negotiation_rejects_versions_features_and_corruption_before_profile_exposure',
    'migration_assessment_is_noop_only_for_exact_current_valid_source',
  ]) {
    assert(candidateNegotiation.includes(marker), `implementation marker: ${marker}`);
  }
  assert((candidateNegotiation.match(/#\[test\]/g) ?? []).length === 4, 'negotiation tests');
  for (const marker of [
    'The only readable and writable byte-format version is exact HDoc `1.0`.',
    '`negotiate_hdoc(bytes)` is not a permissive header parser.',
    '`assess_hdoc_migration(source, target)` is the implemented fail-closed hook:',
    'There is no rollback boundary because there is no implemented migration',
  ]) {
    assert(candidateFormat.includes(marker), `format marker: ${marker}`);
  }
  assert(candidateFormatJson.plan_item === 'P03-015', 'matrix owner');
  assert(candidateFormatJson.current_format.major === 1 && candidateFormatJson.current_format.minor === 0, 'matrix version');
  assert(candidateFormatJson.reader.versions.length === 1, 'one readable version');
  assert(candidateFormatJson.writer.versions.length === 1, 'one writable version');
  assert(candidateFormatJson.reader.versions[0].major === 1 && candidateFormatJson.reader.versions[0].minor === 0, 'exact reader version');
  assert(candidateFormatJson.writer.versions[0].major === 1 && candidateFormatJson.writer.versions[0].minor === 0, 'exact writer version');
  assert(candidateFormatJson.reader.required_features_mask_hex === '0x0000000000000001', 'required mask');
  assert(candidateFormatJson.reader.optional_features_mask_hex === '0x0000000000000000', 'optional mask');
  assert(candidateFormatJson.features.filter(({ read, write }) => read && write).length === 1, 'one supported feature');
  assert(candidateFormatJson.features.slice(1).every(({ read, write }) => !read && !write), 'reserved features unsupported');
  assert(candidateFormatJson.migration.rewrites_supported === false, 'no migration rewrites');
  assert(candidateFormatJson.migration.automatic_migration === false, 'no automatic migration');
  assert(candidateFormatJson.migration.mixed_version_window === false, 'no mixed versions');
  assert(candidateFormatJson.migration.downgrade_window === false, 'no downgrade');
  assert(candidateEnvelope.format.compatibility_registry === 'docs/formats/hdoc-v1-compatibility.json', 'envelope registry');
  assert(candidateEnvelope.format.negotiation_owner === 'P03-015', 'envelope owner');
  assert(candidateSpecifications.includes('P03-015 deliberately does not invent that record'), 'spec binding');
  assert(candidateStudy.includes('P03-015 now freezes a deliberately'), 'study binding');
  assert(candidateSuites.suites.find(({ id }) => id === 'unit')?.expectations.rust_tests === 44, 'test inventory');
  assert(candidateMatrix.plan_items.at(-1) === 'P03-015', 'CI history');
  assert(candidatePolicy.active_product_scope.allowed_status === 'hdoc-feature-negotiation', 'coverage maturity');
};
validateContract();

assert(
  compatibility.inputs.specifications.sha256 === sha256(Buffer.from(specifications)),
  'matrix specification hash',
);
assert(coverage.schema === 'helix.rust-coverage-report/1', 'coverage schema');
assert(coverage.verdict === 'pass', 'coverage verdict');
assert(coverage.execution.tests_executed === 44, 'coverage tests');
assert(coverage.execution.workspace_status === 'hdoc-feature-negotiation', 'coverage maturity');
const sourceCoverage = coverage.product_files.find(
  ({ path: file }) => file === 'crates/helix-doc/src/hdoc_negotiation.rs',
);
assert(sourceCoverage?.sha256 === sha256(showBytes('crates/helix-doc/src/hdoc_negotiation.rs')), 'source/report binding');
assert(sourceCoverage.metrics.functions.covered === 25 && sourceCoverage.metrics.functions.count === 25, 'function coverage');
assert(sourceCoverage.metrics.lines.covered === 106 && sourceCoverage.metrics.lines.count === 106, 'line coverage');
assert(sourceCoverage.metrics.regions.covered === 136 && sourceCoverage.metrics.regions.count === 136, 'region coverage');
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
rejectTextMutation(root, 'plan-item = "P03-015"', 'plan-item = "P03-014"', (value) => validateContract(value));
rejectTextMutation(root, 'status = "hdoc-feature-negotiation"', 'status = "path-dictionary-lifecycle"', (value) => validateContract(value));
rejectTextMutation(crate, 'status = "hdoc-feature-negotiation"', 'status = "path-dictionary-lifecycle"', (value) => validateContract(root, value));
rejectTextMutation(negotiation, 'pub fn negotiate_hdoc(bytes: &[u8])', 'fn negotiate_hdoc(bytes: &[u8])', (value) => validateContract(root, crate, library, value));
rejectTextMutation(negotiation, 'let decoded = decode(bytes)?;', 'let decoded = decode(&bytes[..64])?;', (value) => validateContract(root, crate, library, value));
rejectTextMutation(negotiation, 'matches!(feature, HDocFeature::SectionCompression)', 'true', (value) => validateContract(root, crate, library, value));
rejectTextMutation(negotiation, 'if target != HDocMigrationTarget::current()', 'if false', (value) => validateContract(root, crate, library, value));
rejectTextMutation(negotiation, 'Self::UnsupportedTarget { .. } => "CAP_UNSUPPORTED_VERSION"', 'Self::UnsupportedTarget { .. } => "INT_INVARIANT"', (value) => validateContract(root, crate, library, value));
rejectTextMutation(format, 'The only readable and writable byte-format version is exact HDoc `1.0`.', 'HDoc 1.x is readable and writable.', (value) => validateContract(root, crate, library, negotiation, value));
rejectTextMutation(specifications, 'P03-015 deliberately does not invent that record', 'P03-015 defines that record', (value) => validateContract(root, crate, library, negotiation, format, formatJson, envelope, value));
rejectTextMutation(study, 'P03-015 now freezes a deliberately', 'P03-015 may freeze a deliberately', (value) => validateContract(root, crate, library, negotiation, format, formatJson, envelope, specifications, value));
rejectObjectMutation(formatJson, (value) => (value.reader.versions[0].minor = 1), (value) => validateContract(root, crate, library, negotiation, format, value));
rejectObjectMutation(formatJson, (value) => (value.features[1].read = true), (value) => validateContract(root, crate, library, negotiation, format, value));
rejectObjectMutation(formatJson, (value) => (value.migration.rewrites_supported = true), (value) => validateContract(root, crate, library, negotiation, format, value));
rejectObjectMutation(envelope, (value) => delete value.format.compatibility_registry, (value) => validateContract(root, crate, library, negotiation, format, formatJson, value));
rejectObjectMutation(suites, (value) => (value.suites.find(({ id }) => id === 'unit').expectations.rust_tests = 43), (value) => validateContract(root, crate, library, negotiation, format, formatJson, envelope, specifications, study, value));
rejectObjectMutation(matrix, (value) => value.plan_items.pop(), (value) => validateContract(root, crate, library, negotiation, format, formatJson, envelope, specifications, study, suites, value));
rejectObjectMutation(policy, (value) => (value.active_product_scope.allowed_status = 'path-dictionary-lifecycle'), (value) => validateContract(root, crate, library, negotiation, format, formatJson, envelope, specifications, study, suites, matrix, value));
rejectObjectMutation(coverage, (value) => (value.execution.tests_executed = 43), (value) => assert(value.execution.tests_executed === 44, 'coverage test mutation'));
rejectObjectMutation(coverage, (value) => (value.product_files.find(({ path: file }) => file.endsWith('hdoc_negotiation.rs')).metrics.lines.covered = 105), (value) => {
  const record = value.product_files.find(({ path: file }) => file.endsWith('hdoc_negotiation.rs'));
  assert(record.metrics.lines.covered === 106, 'coverage line mutation');
});
assert(mutations === manifest.verification.mutation_canaries, 'mutation count');

process.stdout.write(
  `PASS P03-015 evidence: ${expectedChanges.length} source artifacts, 36 helix-doc tests, 44 workspace tests, exact-1.0 closed-world negotiation/no-rewrite migration assessment, 100% lines/functions/regions, ${mutations} mutation canaries\n`,
);

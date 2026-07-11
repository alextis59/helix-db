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

assert(argument, 'usage: node evidence/phase-03/P03-016/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-016', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
assert(gitText(['rev-parse', `${argument}^{commit}`]).trim() === argument, 'source commit');
assert(gitText(['rev-parse', `${argument}^`]).trim() === manifest.base_commit, 'source parent');
assert(gitText(['rev-parse', `${argument}^{tree}`]).trim() === manifest.source_tree, 'source tree');

const golden = showJson('fixtures/hdoc/v1/manifest.json');
const beforeCases = [
  'M\t.github/ci/matrix.json',
  'M\t.github/workflows/ci.yml',
  'M\tCargo.toml',
  'M\tSpecifications.md',
  'M\tStudy.md',
  'M\tcompatibility/v1/matrix-v1.json',
  'M\tcrates/helix-doc/Cargo.toml',
  'A\tcrates/helix-doc/examples/hdoc_v1_golden.rs',
  'M\tcrates/helix-doc/src/lib.rs',
  'M\tdocs/adr/0012-use-bounded-little-endian-hdoc-v1.md',
  'M\tdocs/adr/README.md',
  'M\tdocs/architecture/continuous-integration.md',
  'M\tdocs/architecture/workspace-boundaries.md',
  'M\tdocs/compatibility/v1-semantic-compatibility-matrix.md',
  'M\tdocs/development/bootstrap.json',
  'M\tdocs/development/bootstrap.md',
  'M\tdocs/formats/README.md',
  'M\tdocs/formats/hdoc-v1-compatibility.json',
  'M\tdocs/formats/hdoc-v1-compatibility.md',
  'M\tdocs/formats/hdoc-v1-compression.md',
  'M\tdocs/formats/hdoc-v1-envelope.json',
  'M\tdocs/formats/hdoc-v1-integrity.md',
  'M\tdocs/formats/hdoc-v1-payloads.md',
  'M\tdocs/formats/hdoc-v1-records.md',
  'M\tdocs/formats/hdoc-v1-tagged-json.md',
  'M\tdocs/formats/hdoc-v1-type-tags.md',
  'M\tdocs/formats/hdoc-v1.md',
  'M\tdocs/formats/path-dictionary-v1.md',
  'M\tdocs/governance/decision-owners.md',
  'M\tdocs/quality/artifact-retention.md',
  'M\tdocs/quality/code-coverage-policy.md',
  'M\tfixtures/README.md',
  'M\tfixtures/generation/check.mjs',
  'M\tfixtures/generation/registry-v1.json',
  'M\tfixtures/generation/report-v1.json',
  'M\tfixtures/generation/schema/report-v1.schema.json',
  'A\tfixtures/hdoc/v1/README.md',
];
const afterCases = [
  'A\tfixtures/hdoc/v1/check.mjs',
  'A\tfixtures/hdoc/v1/manifest.json',
  'A\tfixtures/hdoc/v1/schema/manifest-v1.schema.json',
  'M\tpackage.json',
  'M\ttests/toolchain/artifact-retention-contract.mjs',
  'M\ttests/toolchain/artifact-retention-policy.json',
  'M\ttests/toolchain/bootstrap-contract.mjs',
  'M\ttests/toolchain/check-bootstrap.mjs',
  'M\ttests/toolchain/check-ci-matrix.mjs',
  'M\ttests/toolchain/check-retained-artifacts.mjs',
  'M\ttests/toolchain/check-rust-coverage.mjs',
  'M\ttests/toolchain/collect-retained-artifacts.mjs',
  'M\ttests/toolchain/rust-coverage-policy.json',
  'M\ttests/toolchain/test-artifact-retention-contract.mjs',
];
const expectedChanges = [
  ...beforeCases,
  ...golden.cases.map(({ path: file }) => `A\t${file}`).sort(),
  ...afterCases,
];
const actualChanges = gitText(['diff-tree', '--no-commit-id', '--name-status', '-r', argument])
  .trim()
  .split('\n');
assert(JSON.stringify(actualChanges) === JSON.stringify(expectedChanges), 'source diff inventory');
assert(expectedChanges.length === 75, 'source artifact count');
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
const producer = showText('crates/helix-doc/examples/hdoc_v1_golden.rs');
const checker = showText('fixtures/hdoc/v1/check.mjs');
const schema = showJson('fixtures/hdoc/v1/schema/manifest-v1.schema.json');
const generation = showJson('fixtures/generation/registry-v1.json');
const retention = showJson('tests/toolchain/artifact-retention-policy.json');
const collector = showText('tests/toolchain/collect-retained-artifacts.mjs');
const workflow = showText('.github/workflows/ci.yml');
const specifications = showText('Specifications.md');
const study = showText('Study.md');
const matrix = showJson('.github/ci/matrix.json');
const policy = showJson('tests/toolchain/rust-coverage-policy.json');
const compatibility = showJson('compatibility/v1/matrix-v1.json');
const coverage = JSON.parse(reportBytes);

const validateContract = (
  candidateRoot = root,
  candidateCrate = crate,
  candidateLibrary = library,
  candidateProducer = producer,
  candidateChecker = checker,
  candidateGolden = golden,
  candidateSchema = schema,
  candidateGeneration = generation,
  candidateRetention = retention,
  candidateCollector = collector,
  candidateWorkflow = workflow,
  candidateSpecifications = specifications,
  candidateStudy = study,
  candidateMatrix = matrix,
  candidatePolicy = policy,
) => {
  for (const marker of [
    'plan-item = "P03-016"',
    'status = "hdoc-golden-v1"',
    'database-functionality = true',
  ]) {
    assert(candidateRoot.includes(marker), `root marker: ${marker}`);
  }
  assert(candidateCrate.includes('status = "hdoc-golden-v1"'), 'crate maturity');
  assert(candidateLibrary.includes('pub const MATURITY: &str = "hdoc-golden-v1";'), 'library maturity');
  for (const marker of [
    'fn encode_all_types()',
    'fn encode_boundaries()',
    'fn encode_compressed()',
    'if mode == "--write" && !path.exists()',
    'immutable fixture drift; add a new format version instead of overwriting',
    'invalid-compression-expansion-limit',
    'invalid-field-count-limit',
    'invalid-nonzero-padding',
  ]) {
    assert(candidateProducer.includes(marker), `producer marker: ${marker}`);
  }
  assert(!candidateProducer.includes('unsafe {'), 'unsafe producer');
  assert(candidateChecker.includes('manifest.cases.length === 24'), 'checker case count');
  assert(candidateChecker.includes('4 accepted, 20 exact rejections'), 'checker outcomes');
  assert(candidateGolden.schema === 'helix.hdoc-golden-manifest/1', 'golden schema');
  assert(candidateGolden.format.major === 1 && candidateGolden.format.minor === 0, 'golden version');
  assert(candidateGolden.format.frozen === true, 'golden freeze');
  assert(candidateGolden.producer.write_policy === 'create-missing-only-never-overwrite', 'write policy');
  assert(candidateGolden.cases.length === 24, 'golden count');
  assert(candidateGolden.cases.filter(({ kind }) => kind === 'positive').length === 4, 'positive count');
  assert(candidateGolden.cases.filter(({ kind }) => kind === 'invalid').length === 20, 'invalid count');
  assert(new Set(candidateGolden.cases.map(({ id }) => id)).size === 24, 'case IDs');
  assert(candidateSchema.properties.cases.minItems === 24, 'schema case floor');
  const goldenGenerator = candidateGeneration.generators.find(({ id }) => id === 'hdoc.golden-v1');
  assert(goldenGenerator?.owner_task === 'P03-016', 'generator owner');
  assert(goldenGenerator?.artifacts[0].path === 'fixtures/hdoc/v1/manifest.json', 'generator manifest');
  const goldenRetention = candidateRetention.profiles.find(({ id }) => id === 'golden-formats');
  assert(goldenRetention?.state === 'active' && goldenRetention.activation_task === null, 'retention activation');
  assert(goldenRetention?.ci_retention_days === 90, 'golden CI retention');
  assert(goldenRetention?.durable_retention === 'permanent-by-format-version', 'durable retention');
  assert(goldenRetention?.producers[0].variant === 'hdoc-v1', 'retention producer');
  assert(candidateCollector.includes("golden.cases?.length === 24"), 'collector case count');
  assert(candidateCollector.includes("'golden-format-positive' : 'golden-format-rejection'"), 'collector roles');
  assert(candidateWorkflow.includes('corepack npm run artifacts:golden-formats'), 'hosted collector');
  assert(candidateWorkflow.includes('retention-days: 90'), 'hosted retention');
  assert(candidateWorkflow.includes('path: dist/retention/golden-formats/hdoc-v1/'), 'hosted payload');
  assert(candidateSpecifications.includes('immutable golden vectors'), 'spec binding');
  assert(candidateStudy.includes('P03-016 now freezes 24'), 'study binding');
  assert(candidateMatrix.plan_items.at(-1) === 'P03-016', 'CI history');
  assert(candidatePolicy.active_product_scope.allowed_status === 'hdoc-golden-v1', 'coverage maturity');
};
validateContract();

const expectedCoverage = new Set();
for (const fixture of golden.cases) {
  const bytes = showBytes(fixture.path);
  assert(bytes.length === fixture.bytes, `${fixture.id}: bytes`);
  assert(sha256(bytes) === fixture.sha256, `${fixture.id}: SHA-256`);
  fixture.coverage.forEach((item) => expectedCoverage.add(item));
  if (fixture.kind === 'positive') {
    assert(fixture.expected.result === 'accept', `${fixture.id}: accept result`);
    assert(bytes.subarray(0, 8).equals(Buffer.from('48444f430d0a1a0a', 'hex')), `${fixture.id}: header`);
    const footer = bytes.readUInt32LE(44);
    assert(bytes.subarray(footer, footer + 8).equals(Buffer.from('48444f43454e440a', 'hex')), `${fixture.id}: footer`);
    assert(bytes.readUInt32LE(20) === fixture.expected.total_length, `${fixture.id}: total length`);
    assert(bytes.readUInt32LE(24) === fixture.expected.canonical_length, `${fixture.id}: canonical length`);
    assert(bytes.readUInt32LE(28) === fixture.expected.field_count, `${fixture.id}: field count`);
    assert(bytes.subarray(footer + 32, footer + 64).toString('hex') === fixture.expected.content_hash_hex, `${fixture.id}: content hash`);
  } else {
    assert(fixture.expected.result === 'reject', `${fixture.id}: reject result`);
    assert(['CAP_FORMAT_UNSUPPORTED', 'CAP_UNSUPPORTED_VERSION', 'DUR_CORRUPTION'].includes(fixture.expected.code), `${fixture.id}: code`);
  }
}
assert(expectedCoverage.size === 40, 'coverage identity count');
for (const marker of ['all-16-type-tags', 'object-in-array', 'array-in-array', 'decimal-domain-edges', 'temporal-min-max', 'compression-bomb-claim', 'field-count-limit', 'nonzero-padding']) {
  assert(expectedCoverage.has(marker), `coverage marker: ${marker}`);
}
assert(
  compatibility.inputs.specifications.sha256 === sha256(Buffer.from(specifications)),
  'matrix specification hash',
);
assert(coverage.schema === 'helix.rust-coverage-report/1' && coverage.verdict === 'pass', 'coverage verdict');
assert(coverage.execution.tests_executed === 44, 'coverage tests');
assert(coverage.execution.workspace_status === 'hdoc-golden-v1', 'coverage maturity');
const semantic = coverage.groups.find(({ id }) => id === 'semantic-critical');
assert(semantic?.verdict === 'pass' && semantic.metrics.lines.covered === 4565 && semantic.metrics.lines.count === 4565, 'semantic coverage');

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
rejectTextMutation(root, 'plan-item = "P03-016"', 'plan-item = "P03-015"', (value) => validateContract(value));
rejectTextMutation(root, 'status = "hdoc-golden-v1"', 'status = "hdoc-feature-negotiation"', (value) => validateContract(value));
rejectTextMutation(producer, 'if mode == "--write" && !path.exists()', 'if mode == "--write"', (value) => validateContract(root, crate, library, value));
rejectTextMutation(producer, 'immutable fixture drift; add a new format version instead of overwriting', 'fixture drift; overwriting', (value) => validateContract(root, crate, library, value));
rejectTextMutation(checker, 'manifest.cases.length === 24', 'manifest.cases.length >= 1', (value) => validateContract(root, crate, library, producer, value));
rejectTextMutation(collector, "golden.cases?.length === 24", "golden.cases?.length > 0", (value) => validateContract(root, crate, library, producer, checker, golden, schema, generation, retention, value));
rejectTextMutation(workflow, 'retention-days: 90', 'retention-days: 1', (value) => validateContract(root, crate, library, producer, checker, golden, schema, generation, retention, collector, value));
rejectTextMutation(specifications, 'immutable golden vectors', 'mutable sample vectors', (value) => validateContract(root, crate, library, producer, checker, golden, schema, generation, retention, collector, workflow, value));
rejectTextMutation(study, 'P03-016 now freezes 24', 'P03-016 may freeze 24', (value) => validateContract(root, crate, library, producer, checker, golden, schema, generation, retention, collector, workflow, specifications, value));
rejectObjectMutation(golden, (value) => (value.format.frozen = false), (value) => validateContract(root, crate, library, producer, checker, value));
rejectObjectMutation(golden, (value) => value.cases.pop(), (value) => validateContract(root, crate, library, producer, checker, value));
rejectObjectMutation(golden, (value) => (value.cases[0].id = value.cases[1].id), (value) => validateContract(root, crate, library, producer, checker, value));
rejectObjectMutation(schema, (value) => (value.properties.cases.minItems = 1), (value) => validateContract(root, crate, library, producer, checker, golden, value));
rejectObjectMutation(generation, (value) => value.generators.pop(), (value) => validateContract(root, crate, library, producer, checker, golden, schema, value));
rejectObjectMutation(retention, (value) => (value.profiles[0].state = 'reserved'), (value) => validateContract(root, crate, library, producer, checker, golden, schema, generation, value));
rejectObjectMutation(retention, (value) => (value.profiles[0].ci_retention_days = 30), (value) => validateContract(root, crate, library, producer, checker, golden, schema, generation, value));
rejectObjectMutation(retention, (value) => (value.profiles[0].durable_retention = 'delete-after-ci'), (value) => validateContract(root, crate, library, producer, checker, golden, schema, generation, value));
rejectObjectMutation(matrix, (value) => value.plan_items.pop(), (value) => validateContract(root, crate, library, producer, checker, golden, schema, generation, retention, collector, workflow, specifications, study, value));
rejectObjectMutation(policy, (value) => (value.active_product_scope.allowed_status = 'hdoc-feature-negotiation'), (value) => validateContract(root, crate, library, producer, checker, golden, schema, generation, retention, collector, workflow, specifications, study, matrix, value));
rejectObjectMutation(coverage, (value) => (value.execution.workspace_status = 'hdoc-feature-negotiation'), (value) => assert(value.execution.workspace_status === 'hdoc-golden-v1', 'coverage status mutation'));
assert(mutations === manifest.verification.mutation_canaries, 'mutation count');

process.stdout.write(
  `PASS P03-016 evidence: ${expectedChanges.length} source artifacts, 24 immutable HDoc files, 4 accepted, 20 exact rejections, 40 coverage identities, active retained golden bundle, ${mutations} mutation canaries\n`,
);

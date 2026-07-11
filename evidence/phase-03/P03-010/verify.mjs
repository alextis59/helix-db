#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const evidenceDirectory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(evidenceDirectory, '../../..');
const manifest = JSON.parse(readFileSync(path.join(evidenceDirectory, 'manifest.json'), 'utf8'));
const commitArgument = process.argv[2];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};
const same = (actual, expected, label) => {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (arguments_) =>
  execFileSync('git', arguments_, {
    cwd: repository,
    maxBuffer: 128 * 1024 * 1024,
  });
const gitText = (arguments_) => gitBytes(arguments_).toString('utf8');
const showBytes = (file) => gitBytes(['show', `${manifest.commit}:${file}`]);
const showText = (file) => showBytes(file).toString('utf8');
const showJson = (file) => JSON.parse(showText(file));
const readEvidence = (file) => readFileSync(path.join(evidenceDirectory, file));

assert(commitArgument, 'usage: node evidence/phase-03/P03-010/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-010', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(
  manifest.requirements,
  ['CORE-001', 'DATA-001', 'DATA-002', 'INV-001', 'INV-007', 'SEC-002'],
  'requirements inventory',
);
same(manifest.accepted_adrs, ['0012'], 'accepted ADR inventory');
same(manifest.source_commits, [manifest.commit], 'source commits');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(gitText(['rev-parse', `${commitArgument}^`]).trim() === manifest.base_commit, 'source parent');
assert(
  gitText(['rev-parse', `${commitArgument}^{tree}`]).trim() === manifest.source_tree,
  'source tree mismatch',
);

const sourceChanges = gitText(['diff', '--name-status', manifest.base_commit, manifest.commit])
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, file] = line.split('\t');
    return { file, status };
  });
same(
  sourceChanges,
  manifest.source_artifacts.map(({ path: file, status }) => ({ file, status })),
  'source diff inventory',
);
for (const artifact of manifest.source_artifacts) {
  const bytes = showBytes(artifact.path);
  assert(bytes.length === artifact.bytes, `${artifact.path}: byte count`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: SHA-256`);
}

const verifierPath = fileURLToPath(import.meta.url);
const verifierBytes = readFileSync(verifierPath);
assert(statSync(verifierPath).size === manifest.verifier.bytes, 'verifier bytes');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256');
for (const reportRecord of manifest.retained_reports) {
  const bytes = readEvidence(reportRecord.path);
  assert(bytes.length === reportRecord.bytes, `${reportRecord.path}: byte count`);
  assert(sha256(bytes) === reportRecord.sha256, `${reportRecord.path}: SHA-256`);
}

const rootManifest = showText('Cargo.toml');
const crateManifest = showText('crates/helix-doc/Cargo.toml');
const source = showText('crates/helix-doc/src/lib.rs');
const formatGuide = showText('docs/formats/hdoc-v1.md');
const specifications = showText('Specifications.md');
const coveragePolicy = showJson('tests/toolchain/rust-coverage-policy.json');
const suites = showJson('tests/suites.json');
const matrix = showJson('.github/ci/matrix.json');
const compatibility = showJson('compatibility/v1/matrix-v1.json');
const typeTags = showJson('docs/formats/hdoc-v1-type-tags.json');
const payloads = showJson('docs/formats/hdoc-v1-payloads.json');
const records = showJson('docs/formats/hdoc-v1-records.json');
const compression = showJson('docs/formats/hdoc-v1-compression.json');
const coverage = JSON.parse(readEvidence('rust-coverage-report.json'));

const sourceArtifact = (file) => {
  const record = manifest.source_artifacts.find(({ path: candidate }) => candidate === file);
  assert(record, `${file}: source artifact absent`);
  return record;
};

const validateValueContract = (
  candidate,
  root,
  crate,
  policy,
  suiteAuthority,
  ciMatrix,
  guide,
) => {
  for (const marker of [
    'plan-item = "P03-010"',
    'status = "hdoc-values"',
    'database-functionality = true',
  ]) {
    assert(root.includes(marker), `root metadata marker absent: ${marker}`);
  }
  for (const marker of ['status = "hdoc-values"', 'database-functionality = true']) {
    assert(crate.includes(marker), `helix-doc manifest marker absent: ${marker}`);
  }
  for (const marker of [
    'pub enum ValueType',
    'pub struct OwnedDocument',
    'pub struct OwnedField',
    'pub struct OwnedObject',
    'pub enum OwnedValue',
    "pub struct BinaryView<'a>",
    "pub struct VectorF32View<'a>",
    "pub struct VectorF16View<'a>",
    "pub struct DocumentView<'a>",
    "pub struct ObjectView<'a>",
    "pub struct FieldView<'a>",
    "pub struct ObjectFields<'a>",
    "pub struct ArrayView<'a>",
    "pub struct ArrayElements<'a>",
    "pub enum ValueView<'a>",
    "logical_sections: [Cow<'a, [u8]>; 4]",
    'sections[index] = Cow::Borrowed(stored);',
    'sections[index] = Cow::Owned(decode_compressed_section(stored, entry)?);',
    'presentation_fields: Vec<usize>',
    'pub fn view(&self) -> DocumentView',
    'pub fn to_owned_document(&self) -> OwnedDocument',
    'borrowed_and_owned_values_preserve_every_logical_type',
    'views_preserve_presentation_and_own_only_decoded_sections',
    '.finish_non_exhaustive()',
  ]) {
    assert(candidate.includes(marker), `value/view source marker absent: ${marker}`);
  }
  for (const name of [
    '"null"',
    '"bool"',
    '"int32"',
    '"int64"',
    '"float64"',
    '"decimal128"',
    '"string"',
    '"binary"',
    '"object"',
    '"array"',
    '"timestamp"',
    '"date"',
    '"uuid"',
    '"objectId"',
    '"vector<f32,N>"',
    '"vector<f16,N>"',
  ]) {
    assert(candidate.includes(name), `logical type name absent: ${name}`);
  }
  const ownedStart = candidate.indexOf('pub enum OwnedValue');
  const ownedEnd = candidate.indexOf('impl OwnedValue', ownedStart);
  const viewStart = candidate.indexOf("pub enum ValueView<'a>");
  const viewEnd = candidate.indexOf("impl ValueView<'_>", viewStart);
  assert(ownedStart >= 0 && ownedEnd > ownedStart, 'owned value inventory bounds');
  assert(viewStart >= 0 && viewEnd > viewStart, 'borrowed value inventory bounds');
  assert(!candidate.slice(ownedStart, ownedEnd).includes('Missing'), 'owned Missing variant');
  assert(!candidate.slice(viewStart, viewEnd).includes('Missing'), 'borrowed Missing variant');
  assert(!candidate.includes('unsafe {'), 'value source contains unsafe block');
  assert(!candidate.includes('from_utf8_unchecked'), 'value source bypasses UTF-8 validation');
  assert(
    (candidate.match(/presentation_fields: Vec<usize>/g) ?? []).length === 2,
    'presentation metadata inventory',
  );
  assert((candidate.match(/#\[test\]/g) ?? []).length === 17, 'helix-doc unit-test count');

  const decodeStart = candidate.indexOf('pub fn decode(bytes:');
  const validateLogical = candidate.indexOf('validate_logical_sections', decodeStart);
  const validateCanonical = candidate.indexOf('validate_canonical_envelope', decodeStart);
  const hashCompare = candidate.indexOf('if validated.content_hash != envelope.footer_hash', decodeStart);
  const expose = candidate.indexOf('Ok(DecodedHDoc {', decodeStart);
  assert(decodeStart >= 0 && validateLogical > decodeStart, 'logical validation stage absent');
  assert(
    validateLogical < validateCanonical && validateCanonical < hashCompare && hashCompare < expose,
    'complete validation must precede view backing exposure',
  );
  const presentationBuild = candidate.indexOf('let mut presentation_fields = vec!');
  const presentationPublish = candidate.indexOf('Ok((root_id_field, presentation_fields))');
  assert(
    presentationBuild >= 0 && presentationPublish > presentationBuild,
    'presentation permutation validation/build order',
  );

  assert(policy.execution.minimum_tests === 25, 'coverage minimum test count');
  assert(policy.active_product_scope.allowed_status === 'hdoc-values', 'coverage maturity');
  assert(
    suiteAuthority.suites.find(({ id }) => id === 'unit')?.expectations.rust_tests === 25,
    'unit suite inventory',
  );
  assert(ciMatrix.plan_items.at(-1) === 'P03-010', 'CI task history');
  for (const marker of [
    'Implemented P03-010 value and view layer',
    '`DecodedHDoc::view()`',
    'an uncompressed section is a borrowed slice',
    "a compressed section is the decoder's existing fresh",
    'Missing deliberately has no variant',
    '`P03-011` owns allocation-free name/path resolution',
  ]) {
    assert(guide.includes(marker), `format value/view marker absent: ${marker}`);
  }
};
validateValueContract(
  source,
  rootManifest,
  crateManifest,
  coveragePolicy,
  suites,
  matrix,
  formatGuide,
);

assert(typeTags.tags.length === 16, 'type-tag count');
assert(payloads.test_vectors.length === 41, 'payload vector count');
assert(payloads.rejection_vectors.length === 17, 'payload rejection count');
assert(records.structural_examples.length === 4, 'structural example count');
assert(compression.block_vectors.length === 7, 'compression block vector count');
assert(compression.section_vectors.length === 5, 'compression stream vector count');
assert(compression.complete_hdoc_vectors.length === 2, 'compression HDoc count');
assert(compression.negative_cases.length === 18, 'compression rejection inventory');
assert(
  compatibility.inputs.specifications.sha256 === sha256(Buffer.from(specifications)),
  'matrix specification binding',
);
assert(
  compatibility.inputs.specifications.sha256 === sourceArtifact('Specifications.md').sha256,
  'matrix/source artifact binding',
);

const validateCoverage = (report) => {
  assert(report.schema === 'helix.rust-coverage-report/1', 'coverage schema');
  assert(report.verdict === 'pass', 'coverage verdict');
  assert(report.execution.tests_executed === 25, 'coverage test count');
  assert(report.execution.workspace_status === 'hdoc-values', 'coverage workspace maturity');
  assert(report.execution.workspace_database_functionality === true, 'coverage product state');
  assert(
    report.inputs.cargo_manifest_sha256 === sourceArtifact('Cargo.toml').sha256,
    'coverage Cargo manifest binding',
  );
  assert(
    report.inputs.coverage_policy_sha256 ===
      sourceArtifact('tests/toolchain/rust-coverage-policy.json').sha256,
    'coverage policy binding',
  );
  assert(
    report.inputs.coverage_runner_sha256 ===
      sourceArtifact('tests/toolchain/check-rust-coverage.mjs').sha256,
    'coverage runner binding',
  );
  assert(report.inputs.cargo_lock_sha256 === sha256(showBytes('Cargo.lock')), 'coverage lock binding');
  const product = report.product_files.find(
    ({ path: file }) => file === 'crates/helix-doc/src/lib.rs',
  );
  assert(product?.sha256 === sourceArtifact('crates/helix-doc/src/lib.rs').sha256, 'coverage source binding');
  assert(product.metrics.functions.covered === 206, 'covered functions');
  assert(product.metrics.functions.count === 206, 'function count');
  assert(product.metrics.functions.percent_basis_points === 10_000, 'function coverage');
  assert(product.metrics.lines.covered === 2455, 'covered lines');
  assert(product.metrics.lines.count === 2455, 'line count');
  assert(product.metrics.lines.percent_basis_points === 10_000, 'line coverage');
  assert(product.metrics.regions.covered === 4863, 'covered regions');
  assert(product.metrics.regions.count === 5106, 'region count');
  assert(product.metrics.regions.percent_basis_points === 9524, 'region coverage');
  const semantic = report.groups.find(({ id }) => id === 'semantic-critical');
  assert(semantic?.verdict === 'pass', 'semantic-critical coverage verdict');
  assert(semantic?.failures.length === 0, 'semantic-critical coverage failures');
};
validateCoverage(coverage);

let mutationCanaries = 0;
const textMutation = (label, original, from, to, validate) => {
  assert(original.includes(from), `${label}: source mutation marker absent`);
  let rejected = false;
  try {
    validate(original.replace(from, to));
  } catch (error) {
    rejected = error instanceof Error && error.message.length > 0;
  }
  assert(rejected, `${label}: mutation was accepted`);
  mutationCanaries += 1;
};
const objectMutation = (label, original, mutate, validate) => {
  const changed = structuredClone(original);
  mutate(changed);
  let rejected = false;
  try {
    validate(changed);
  } catch (error) {
    rejected = error instanceof Error && error.message.length > 0;
  }
  assert(rejected, `${label}: mutation was accepted`);
  mutationCanaries += 1;
};
const contract = (
  candidateSource = source,
  candidateRoot = rootManifest,
  candidateCrate = crateManifest,
  candidatePolicy = coveragePolicy,
  candidateSuites = suites,
  candidateMatrix = matrix,
  candidateGuide = formatGuide,
) =>
  validateValueContract(
    candidateSource,
    candidateRoot,
    candidateCrate,
    candidatePolicy,
    candidateSuites,
    candidateMatrix,
    candidateGuide,
  );

textMutation('plan item', rootManifest, 'plan-item = "P03-010"', 'plan-item = "P03-009"', (value) => contract(source, value));
textMutation('root maturity', rootManifest, 'status = "hdoc-values"', 'status = "hdoc-codec"', (value) => contract(source, value));
textMutation('crate maturity', crateManifest, 'status = "hdoc-values"', 'status = "hdoc-codec"', (value) => contract(source, rootManifest, value));
textMutation('borrowed section', source, 'sections[index] = Cow::Borrowed(stored);', 'sections[index] = Cow::Owned(stored.to_vec());', (value) => contract(value));
textMutation('owned section', source, 'sections[index] = Cow::Owned(decode_compressed_section(stored, entry)?);', 'sections[index] = Cow::Borrowed(stored);', (value) => contract(value));
textMutation('presentation metadata', source, 'presentation_fields: Vec<usize>', 'presentation_order: Vec<usize>', (value) => contract(value));
textMutation('Missing variant', source, 'pub enum OwnedValue {', 'pub enum OwnedValue {\n    Missing,', (value) => contract(value));
textMutation('all-type test inventory', source, '#[test]', '#[allow(dead_code)]', (value) => contract(value));
textMutation('format guide', formatGuide, 'Implemented P03-010 value and view layer', 'Planned P03-010 value and view layer', (value) => contract(source, rootManifest, crateManifest, coveragePolicy, suites, matrix, value));
objectMutation('coverage policy tests', coveragePolicy, (value) => (value.execution.minimum_tests = 24), (value) => contract(source, rootManifest, crateManifest, value));
objectMutation('unit suite inventory', suites, (value) => (value.suites.find(({ id }) => id === 'unit').expectations.rust_tests = 24), (value) => contract(source, rootManifest, crateManifest, coveragePolicy, value));
objectMutation('CI history', matrix, (value) => value.plan_items.pop(), (value) => contract(source, rootManifest, crateManifest, coveragePolicy, suites, value));
objectMutation('coverage status', coverage, (value) => (value.execution.workspace_status = 'hdoc-codec'), validateCoverage);
objectMutation('coverage test count', coverage, (value) => (value.execution.tests_executed = 24), validateCoverage);
objectMutation('coverage line loss', coverage, (value) => (value.product_files.find(({ path: file }) => file === 'crates/helix-doc/src/lib.rs').metrics.lines.covered = 2454), validateCoverage);
objectMutation('coverage region loss', coverage, (value) => (value.product_files.find(({ path: file }) => file === 'crates/helix-doc/src/lib.rs').metrics.regions.covered = 4862), validateCoverage);
objectMutation('coverage source hash', coverage, (value) => (value.product_files.find(({ path: file }) => file === 'crates/helix-doc/src/lib.rs').sha256 = '0'.repeat(64)), validateCoverage);
assert(mutationCanaries === manifest.verification.mutation_canaries, 'mutation canary count');

process.stdout.write(
  `PASS P03-010 evidence: ${manifest.source_artifacts.length} source artifacts, 17 helix-doc tests, 25 workspace tests, 16 logical types, 100% lines/functions, ${mutationCanaries} mutation canaries\n`,
);

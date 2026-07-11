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

assert(commitArgument, 'usage: node evidence/phase-03/P03-011/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-011', 'evidence task mismatch');
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
const coverage = JSON.parse(readEvidence('rust-coverage-report.json'));

const sourceArtifact = (file) => {
  const record = manifest.source_artifacts.find(({ path: candidate }) => candidate === file);
  assert(record, `${file}: source artifact absent`);
  return record;
};

const validateLookupContract = (
  candidate,
  root,
  crate,
  policy,
  suiteAuthority,
  ciMatrix,
  guide,
  specification,
) => {
  for (const marker of [
    'plan-item = "P03-011"',
    'status = "hdoc-path-lookup"',
    'database-functionality = true',
  ]) {
    assert(root.includes(marker), `root metadata marker absent: ${marker}`);
  }
  for (const marker of ['status = "hdoc-path-lookup"', 'database-functionality = true']) {
    assert(crate.includes(marker), `helix-doc manifest marker absent: ${marker}`);
  }

  for (const marker of [
    'const MAX_PATH_BYTES: u64 = 4_096;',
    'const MAX_PATH_SEGMENTS: usize = 100;',
    'const MAX_PATH_CANDIDATES: u64 = 1_000_000;',
    'pub enum PathError',
    "pub struct FieldPath<'a>",
    'segment_ends: [u16; MAX_PATH_SEGMENTS]',
    'pub fn get_field(self, name: &str)',
    "pub fn lookup_path<'p>",
    "pub struct PathCandidate<'a>",
    "pub struct PathCandidates<'data, 'path>",
    "struct PathWalker<'data, 'path>",
    'fanouts: [FanoutFrame; MAX_PATH_SEGMENTS]',
    'array_positions: [u32; MAX_PATH_SEGMENTS]',
    'fn lookup_name_id',
    'fn lookup_object_field_index',
    'candidate.cmp(needle)',
    'candidate.cmp(&field_id)',
    'while audit.advance()?.is_some()',
    'enforce_path_candidate_limit(candidate_count)?;',
    'ValueView::Object(object)',
    'ArrayIndexSegment::Index(index)',
    'ArrayIndexSegment::NotNumeric',
    'ArrayIndexSegment::Invalid',
    'PathError::InvalidArrayIndex { segment_index }',
    'if let Some(ValueView::Object(object)) = array.get(index)',
    'raw_views_support_bounded_exact_name_and_nested_path_lookup',
    'mixed.value.1000000',
    'path-lookup-compressed-sentinel-',
  ]) {
    assert(candidate.includes(marker), `lookup source marker absent: ${marker}`);
  }

  assert(!candidate.includes('unsafe {'), 'lookup source contains unsafe block');
  assert(!candidate.includes('from_utf8_unchecked'), 'lookup source bypasses UTF-8 validation');
  assert((candidate.match(/#\[test\]/g) ?? []).length === 18, 'helix-doc unit-test count');
  const pathStart = candidate.indexOf("pub struct FieldPath<'a>");
  const pathEnd = candidate.indexOf('/// An owned root document', pathStart);
  assert(pathStart >= 0 && pathEnd > pathStart, 'FieldPath implementation bounds');
  assert(!candidate.slice(pathStart, pathEnd).includes('Vec<'), 'FieldPath heap storage');
  const candidatesStart = candidate.indexOf("pub struct PathCandidates<'data, 'path>");
  const candidatesEnd = candidate.indexOf('/// A completely validated `HDoc`', candidatesStart);
  assert(candidatesStart >= 0 && candidatesEnd > candidatesStart, 'PathCandidates implementation bounds');
  assert(!candidate.slice(candidatesStart, candidatesEnd).includes('Vec<'), 'path walker heap storage');
  const viewStart = candidate.indexOf("pub enum ValueView<'a>");
  const viewEnd = candidate.indexOf("impl ValueView<'_>", viewStart);
  assert(viewStart >= 0 && viewEnd > viewStart, 'borrowed value inventory bounds');
  assert(!candidate.slice(viewStart, viewEnd).includes('Missing'), 'borrowed Missing variant');

  const decodeStart = candidate.indexOf('pub fn decode(bytes:');
  const validateLogical = candidate.indexOf('validate_logical_sections', decodeStart);
  const validateCanonical = candidate.indexOf('validate_canonical_envelope', decodeStart);
  const hashCompare = candidate.indexOf('if validated.content_hash != envelope.footer_hash', decodeStart);
  const expose = candidate.indexOf('Ok(DecodedHDoc {', decodeStart);
  assert(decodeStart >= 0 && validateLogical > decodeStart, 'logical validation stage absent');
  assert(
    validateLogical < validateCanonical && validateCanonical < hashCompare && hashCompare < expose,
    'complete validation must precede lookup view exposure',
  );

  assert(policy.execution.minimum_tests === 25, 'coverage minimum test count');
  assert(policy.active_product_scope.allowed_status === 'hdoc-path-lookup', 'coverage maturity');
  assert(
    suiteAuthority.suites.find(({ id }) => id === 'unit')?.expectations.rust_tests === 26,
    'unit suite inventory',
  );
  assert(ciMatrix.plan_items.at(-1) === 'P03-011', 'CI task history');
  for (const marker of [
    'Implemented P03-011 exact-name and dotted-path lookup',
    '`FieldPath::parse()`',
    '`PathCandidates` iterator',
    'arrays are not implicitly flattened',
    '`path.candidates = 1,000,000`',
    '`P03-020` owns formal',
  ]) {
    assert(guide.includes(marker), `format lookup marker absent: ${marker}`);
  }
  for (const marker of [
    '`P03-011` adds allocation-free lookup',
    'first binary-search the globally sorted UTF-8 name table',
    'complete traversal before publishing',
    'Zero candidates is Missing',
  ]) {
    assert(specification.includes(marker), `specification lookup marker absent: ${marker}`);
  }
};

validateLookupContract(
  source,
  rootManifest,
  crateManifest,
  coveragePolicy,
  suites,
  matrix,
  formatGuide,
  specifications,
);

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
  assert(report.execution.tests_executed === 26, 'coverage test count');
  assert(report.execution.workspace_status === 'hdoc-path-lookup', 'coverage workspace maturity');
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
  assert(product.metrics.functions.covered === 241, 'covered functions');
  assert(product.metrics.functions.count === 241, 'function count');
  assert(product.metrics.functions.percent_basis_points === 10_000, 'function coverage');
  assert(product.metrics.lines.covered === 2716, 'covered lines');
  assert(product.metrics.lines.count === 2716, 'line count');
  assert(product.metrics.lines.percent_basis_points === 10_000, 'line coverage');
  assert(product.metrics.regions.covered === 5293, 'covered regions');
  assert(product.metrics.regions.count === 5547, 'region count');
  assert(product.metrics.regions.percent_basis_points === 9542, 'region coverage');
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
  candidateSpecifications = specifications,
) =>
  validateLookupContract(
    candidateSource,
    candidateRoot,
    candidateCrate,
    candidatePolicy,
    candidateSuites,
    candidateMatrix,
    candidateGuide,
    candidateSpecifications,
  );

textMutation('plan item', rootManifest, 'plan-item = "P03-011"', 'plan-item = "P03-010"', (value) => contract(source, value));
textMutation('root maturity', rootManifest, 'status = "hdoc-path-lookup"', 'status = "hdoc-values"', (value) => contract(source, value));
textMutation('crate maturity', crateManifest, 'status = "hdoc-path-lookup"', 'status = "hdoc-values"', (value) => contract(source, rootManifest, value));
textMutation('name binary search', source, 'fn lookup_name_id', 'fn scan_name_id', (value) => contract(value));
textMutation('field binary search', source, 'fn lookup_object_field_index', 'fn scan_object_field_index', (value) => contract(value));
textMutation('fixed path storage', source, 'segment_ends: [u16; MAX_PATH_SEGMENTS]', 'segment_ends: Vec<u16>', (value) => contract(value));
textMutation('fixed walker storage', source, 'fanouts: [FanoutFrame; MAX_PATH_SEGMENTS]', 'fanouts: Vec<FanoutFrame>', (value) => contract(value));
textMutation('candidate preflight', source, 'while audit.advance()?.is_some()', 'while false', (value) => contract(value));
textMutation('candidate cap', source, 'enforce_path_candidate_limit(candidate_count)?;', 'let _ = candidate_count;', (value) => contract(value));
textMutation('Missing variant', source, "pub enum ValueView<'a> {", "pub enum ValueView<'a> {\n    Missing,", (value) => contract(value));
textMutation('focused test', source, 'raw_views_support_bounded_exact_name_and_nested_path_lookup', 'raw_views_skip_lookup', (value) => contract(value));
textMutation('compressed lookup', source, 'path-lookup-compressed-sentinel-', 'path-lookup-uncompressed-sentinel-', (value) => contract(value));
textMutation('format guide', formatGuide, 'Implemented P03-011 exact-name and dotted-path lookup', 'Planned P03-011 exact-name and dotted-path lookup', (value) => contract(source, rootManifest, crateManifest, coveragePolicy, suites, matrix, value));
textMutation('specification', specifications, '`P03-011` adds allocation-free lookup', '`P03-011` plans allocation-free lookup', (value) => contract(source, rootManifest, crateManifest, coveragePolicy, suites, matrix, formatGuide, value));
objectMutation('coverage policy tests', coveragePolicy, (value) => (value.execution.minimum_tests = 24), (value) => contract(source, rootManifest, crateManifest, value));
objectMutation('unit suite inventory', suites, (value) => (value.suites.find(({ id }) => id === 'unit').expectations.rust_tests = 25), (value) => contract(source, rootManifest, crateManifest, coveragePolicy, value));
objectMutation('CI history', matrix, (value) => value.plan_items.pop(), (value) => contract(source, rootManifest, crateManifest, coveragePolicy, suites, value));
objectMutation('coverage status', coverage, (value) => (value.execution.workspace_status = 'hdoc-values'), validateCoverage);
objectMutation('coverage test count', coverage, (value) => (value.execution.tests_executed = 25), validateCoverage);
objectMutation('coverage line loss', coverage, (value) => (value.product_files.find(({ path: file }) => file === 'crates/helix-doc/src/lib.rs').metrics.lines.covered = 2715), validateCoverage);
objectMutation('coverage region loss', coverage, (value) => (value.product_files.find(({ path: file }) => file === 'crates/helix-doc/src/lib.rs').metrics.regions.covered = 5292), validateCoverage);
objectMutation('coverage source hash', coverage, (value) => (value.product_files.find(({ path: file }) => file === 'crates/helix-doc/src/lib.rs').sha256 = '0'.repeat(64)), validateCoverage);
assert(mutationCanaries === manifest.verification.mutation_canaries, 'mutation canary count');

process.stdout.write(
  `PASS P03-011 evidence: ${manifest.source_artifacts.length} source artifacts, 18 helix-doc tests, 26 workspace tests, allocation-free exact/path lookup, 100% lines/functions, ${mutationCanaries} mutation canaries\n`,
);

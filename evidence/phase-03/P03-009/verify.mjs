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

assert(commitArgument, 'usage: node evidence/phase-03/P03-009/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-009', 'evidence task mismatch');
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
const coveragePolicy = showJson('tests/toolchain/rust-coverage-policy.json');
const suites = showJson('tests/suites.json');
const matrix = showJson('.github/ci/matrix.json');
const compatibility = showJson('compatibility/v1/matrix-v1.json');
const integrity = showJson('docs/formats/hdoc-v1-integrity.json');
const payloads = showJson('docs/formats/hdoc-v1-payloads.json');
const records = showJson('docs/formats/hdoc-v1-records.json');
const compression = showJson('docs/formats/hdoc-v1-compression.json');
const coverage = JSON.parse(readEvidence('rust-coverage-report.json'));

const sourceArtifact = (file) => {
  const record = manifest.source_artifacts.find(({ path: candidate }) => candidate === file);
  assert(record, `${file}: source artifact absent`);
  return record;
};

const validateDecoderContract = (candidate, root, crate, policy, suiteAuthority, ciMatrix, guide) => {
  for (const marker of [
    'plan-item = "P03-009"',
    'status = "hdoc-codec"',
    'database-functionality = true',
  ]) {
    assert(root.includes(marker), `root metadata marker absent: ${marker}`);
  }
  for (const marker of [
    'status = "hdoc-codec"',
    'database-functionality = true',
    'lz4_flex.workspace = true',
  ]) {
    assert(crate.includes(marker), `helix-doc manifest marker absent: ${marker}`);
  }
  for (const marker of [
    'pub enum DecodeCheck',
    'pub enum DecodeError',
    "pub struct DecodedHDoc<'a>",
    "pub fn decode(bytes: &[u8]) -> Result<DecodedHDoc<'_>, DecodeError>",
    'CAP_FORMAT_UNSUPPORTED',
    'CAP_UNSUPPORTED_VERSION',
    'DUR_CORRUPTION',
    'fn decode_compressed_section',
    'lz4_flex::block::decompress_into',
    'fn validate_records_and_tree',
    'fn validate_value_area',
    'fn hash_decoded_document',
    'fn validate_canonical_envelope',
    'decoder_rejects_header_length_feature_checksum_directory_and_footer_mutations',
    'decoder_rejects_name_record_tree_value_and_payload_mutations',
    'decoder_bounds_decompression_and_rejects_noncanonical_streams',
    'decoder_defensive_rejection_paths_fail_closed',
    'for length in 0..base.len()',
    'for index in (0..base.len()).filter',
  ]) {
    assert(candidate.includes(marker), `decoder source marker absent: ${marker}`);
  }
  assert((candidate.match(/#\[test\]/g) ?? []).length === 15, 'helix-doc unit-test count');
  assert(!candidate.includes('unsafe {'), 'decoder source contains unsafe block');
  assert(!candidate.includes('from_utf8_unchecked'), 'decoder bypasses UTF-8 validation');

  const parseStart = candidate.indexOf('fn parse_envelope');
  const checksum = candidate.indexOf('validate_checksum(bytes, expected_checksum)?', parseStart);
  const feature = candidate.indexOf('let unknown_required = required_features & !1', parseStart);
  const directory = candidate.indexOf('for (index, entry_slot)', parseStart);
  assert(parseStart >= 0 && checksum > parseStart, 'parse/checksum stage absent');
  assert(checksum < feature && feature < directory, 'CRC/feature/directory trust order');

  const compressedStart = candidate.indexOf('fn decode_compressed_section');
  const tableCheck = candidate.indexOf('let mut descriptors = Vec::with_capacity', compressedStart);
  const freshOutput = candidate.indexOf('let mut output = vec![0_u8;', compressedStart);
  const decodeBlock = candidate.indexOf('lz4_flex::block::decompress_into', compressedStart);
  assert(
    compressedStart >= 0 && tableCheck < freshOutput && freshOutput < decodeBlock,
    'compression table/allocation/decode trust order',
  );

  const publicDecode = candidate.slice(
    candidate.indexOf('pub fn decode(bytes:'),
    candidate.indexOf('#[allow(', candidate.indexOf('pub fn decode(bytes:')),
  );
  assert(
    publicDecode.indexOf('validate_canonical_envelope') <
      publicDecode.indexOf('if content_hash != envelope.footer_hash'),
    'canonical stored form must precede typed-hash comparison',
  );

  assert(policy.execution.minimum_tests === 23, 'coverage minimum test count');
  assert(policy.active_product_scope.allowed_status === 'hdoc-codec', 'coverage maturity');
  assert(
    suiteAuthority.suites.find(({ id }) => id === 'unit')?.expectations.rust_tests === 23,
    'unit suite inventory',
  );
  assert(ciMatrix.plan_items.at(-1) === 'P03-009', 'CI task history');
  for (const marker of [
    'Implemented P03-009 validating reader',
    '`helix_doc::decode(&[u8])`',
    'zero-initialized, exact-size allocation',
    'compare it with the footer',
  ]) {
    assert(guide.includes(marker), `format implementation marker absent: ${marker}`);
  }
};
validateDecoderContract(
  source,
  rootManifest,
  crateManifest,
  coveragePolicy,
  suites,
  matrix,
  formatGuide,
);

assert(integrity.typed_node_vectors.length === 23, 'typed-node vector count');
assert(integrity.uncompressed_integrity_reference_vectors.length === 2, 'integrity HDoc count');
assert(payloads.test_vectors.length === 41, 'payload vector count');
assert(payloads.rejection_vectors.length === 17, 'payload rejection count');
assert(records.structural_examples.length === 4, 'structural example count');
assert(compression.block_vectors.length === 7, 'compression block vector count');
assert(compression.section_vectors.length === 5, 'compression stream vector count');
assert(compression.complete_hdoc_vectors.length === 2, 'compression HDoc count');
assert(compression.negative_cases.length === 18, 'compression rejection inventory');
assert(compatibility.inputs.specifications.sha256 === sourceArtifact('Specifications.md').sha256, 'matrix specification binding');

const validateCoverage = (report) => {
  assert(report.schema === 'helix.rust-coverage-report/1', 'coverage schema');
  assert(report.verdict === 'pass', 'coverage verdict');
  assert(report.execution.tests_executed === 23, 'coverage test count');
  assert(report.execution.workspace_status === 'hdoc-codec', 'coverage workspace maturity');
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
  assert(product.metrics.functions.covered === 142, 'decoder covered functions');
  assert(product.metrics.functions.percent_basis_points === 10_000, 'decoder function coverage');
  assert(product.metrics.lines.covered === 2023, 'decoder covered lines');
  assert(product.metrics.lines.percent_basis_points === 10_000, 'decoder line coverage');
  assert(product.metrics.regions.percent_basis_points === 9_533, 'decoder region coverage');
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
const contract = (candidateSource = source, candidateRoot = rootManifest, candidateCrate = crateManifest, candidatePolicy = coveragePolicy, candidateSuites = suites, candidateMatrix = matrix, candidateGuide = formatGuide) =>
  validateDecoderContract(
    candidateSource,
    candidateRoot,
    candidateCrate,
    candidatePolicy,
    candidateSuites,
    candidateMatrix,
    candidateGuide,
  );

textMutation('plan item', rootManifest, 'plan-item = "P03-009"', 'plan-item = "P03-008"', (value) => contract(source, value));
textMutation('workspace maturity', rootManifest, 'status = "hdoc-codec"', 'status = "hdoc-encoder"', (value) => contract(source, value));
textMutation('public decoder API', source, 'pub fn decode(bytes:', 'fn decode(bytes:', (value) => contract(value));
textMutation(
  'fresh output',
  source,
  'let mut output = vec![0_u8; bounded_u64_to_usize(u64::from(entry.logical_length))];',
  'let mut output = vec![1_u8; bounded_u64_to_usize(u64::from(entry.logical_length))];',
  (value) => contract(value),
);
textMutation('bounded LZ4 decode', source, 'lz4_flex::block::decompress_into', 'lz4_flex::block::decompress', (value) => contract(value));
textMutation('truncation corpus', source, 'for length in 0..base.len()', 'for length in 0..1', (value) => contract(value));
textMutation('unsafe prohibition', source, '// helix-coverage: exclude-start unit-tests', 'unsafe { }\n// helix-coverage: exclude-start unit-tests', (value) => contract(value));
objectMutation('coverage minimum tests', coveragePolicy, (value) => (value.execution.minimum_tests = 22), (value) => contract(source, rootManifest, crateManifest, value));
objectMutation('suite inventory', suites, (value) => (value.suites.find(({ id }) => id === 'unit').expectations.rust_tests = 22), (value) => contract(source, rootManifest, crateManifest, coveragePolicy, value));
objectMutation('CI history', matrix, (value) => value.plan_items.pop(), (value) => contract(source, rootManifest, crateManifest, coveragePolicy, suites, value));
objectMutation('coverage status', coverage, (value) => (value.execution.workspace_status = 'hdoc-encoder'), validateCoverage);
objectMutation('coverage test count', coverage, (value) => (value.execution.tests_executed = 22), validateCoverage);
objectMutation('coverage line loss', coverage, (value) => (value.product_files.find(({ path: file }) => file === 'crates/helix-doc/src/lib.rs').metrics.lines.covered = 2022), validateCoverage);
objectMutation('coverage source hash', coverage, (value) => (value.product_files.find(({ path: file }) => file === 'crates/helix-doc/src/lib.rs').sha256 = '0'.repeat(64)), validateCoverage);
assert(mutationCanaries === manifest.verification.mutation_canaries, 'mutation canary count');

process.stdout.write(
  `PASS P03-009 evidence: ${manifest.source_artifacts.length} source artifacts, 15 helix-doc tests, 23 workspace tests, 19 rejection stages, 100% lines/functions, ${mutationCanaries} mutation canaries\n`,
);

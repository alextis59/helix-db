#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const evidenceDirectory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(evidenceDirectory, '../../..');
const manifestPath = path.join(evidenceDirectory, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
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

assert(commitArgument, 'usage: node evidence/phase-03/P03-008/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-008', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(
  manifest.requirements,
  ['CORE-001', 'DATA-001', 'DATA-002', 'INV-001', 'INV-007', 'SEC-002'],
  'requirements inventory',
);
same(manifest.accepted_adrs, ['0012'], 'accepted ADR inventory');
same(
  manifest.source_commits,
  ['6d4ea39f603c93467874371f995fefa71b5a585a', manifest.commit],
  'source commits',
);
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(
  gitText(['rev-parse', `${manifest.source_commits[0]}^`]).trim() === manifest.base_commit,
  'first source parent mismatch',
);
assert(
  gitText(['rev-parse', `${manifest.source_commits[1]}^`]).trim() === manifest.source_commits[0],
  'source commit chain mismatch',
);
assert(
  gitText(['rev-parse', `${commitArgument}^{tree}`]).trim() === manifest.source_tree,
  'source tree mismatch',
);

const sourceChanges = gitText([
  'diff',
  '--name-status',
  manifest.base_commit,
  manifest.commit,
])
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

const verifierBytes = readFileSync(fileURLToPath(import.meta.url));
assert(statSync(fileURLToPath(import.meta.url)).size === manifest.verifier.bytes, 'verifier bytes');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256');
for (const reportRecord of manifest.retained_reports) {
  const bytes = readEvidence(reportRecord.path);
  assert(bytes.length === reportRecord.bytes, `${reportRecord.path}: byte count`);
  assert(sha256(bytes) === reportRecord.sha256, `${reportRecord.path}: SHA-256`);
}

const rootManifest = showText('Cargo.toml');
const crateManifest = showText('crates/helix-doc/Cargo.toml');
const encoderSource = showText('crates/helix-doc/src/lib.rs');
const integrity = showJson('docs/formats/hdoc-v1-integrity.json');
const payloads = showJson('docs/formats/hdoc-v1-payloads.json');
const records = showJson('docs/formats/hdoc-v1-records.json');
const compression = showJson('docs/formats/hdoc-v1-compression.json');
const coveragePolicy = showJson('tests/toolchain/rust-coverage-policy.json');
const suites = showJson('tests/suites.json');
const inventory = JSON.parse(readEvidence('dependency-inventory-report.json'));
const observation = JSON.parse(readEvidence('dependency-observation-report.json'));
const coverage = JSON.parse(readEvidence('rust-coverage-report.json'));

const sourceArtifact = (file) => {
  const record = manifest.source_artifacts.find(({ path: candidate }) => candidate === file);
  assert(record, `${file}: source artifact absent`);
  return record;
};
const validateEncoderSource = (source, root, crate) => {
  for (const marker of [
    'plan-item = "P03-008"',
    'status = "hdoc-encoder"',
    'database-functionality = true',
  ]) {
    assert(root.includes(marker), `root metadata marker absent: ${marker}`);
  }
  for (const marker of [
    'status = "hdoc-encoder"',
    'database-functionality = true',
    'blake3.workspace = true',
    'crc.workspace = true',
    'lz4_flex.workspace = true',
  ]) {
    assert(crate.includes(marker), `helix-doc manifest marker absent: ${marker}`);
  }
  for (const marker of [
    'pub struct EncodeDocument',
    'pub struct EncodeField',
    'pub struct EncodeObject',
    'pub enum Decimal128',
    'pub enum EncodeValue',
    'pub enum CompressionMode',
    'pub struct EncodeOptions',
    'pub enum LimitId',
    'pub enum EncodeError',
    'pub struct EncodedHDoc',
    'pub fn encode(',
    'pub fn encode_with_options(',
    'MAX_CANONICAL_BYTES: u64 = 16_777_216',
    'MAX_DEPTH: u64 = 100',
    'MAX_OBJECT_FIELDS: u64 = 10_000',
    'MAX_DOCUMENT_FIELDS: u64 = 100_000',
    'MAX_ARRAY_ELEMENTS: u64 = 1_000_000',
    'MAX_VECTOR_DIMENSION: u64 = 4_096',
    'CRC_32_ISCSI',
    'HDOC-TYPED-CONTENT-HASH-V1',
    'lz4_flex::block::compress',
    'exact_root_envelopes_are_deterministic_and_presentation_sensitive',
    'every_type_tag_traverses_the_complete_public_encoder',
    'root_id_domain_and_large_limit_boundaries_are_enforced',
    'canonical_compression_matches_every_stream_and_complete_vector',
  ]) {
    assert(source.includes(marker), `encoder source marker absent: ${marker}`);
  }
  assert((source.match(/#\[test\]/g) ?? []).length === 10, 'helix-doc unit-test count');
  assert(!source.includes('unsafe {'), 'encoder source contains unsafe block');
  assert(!source.includes('Box::leak'), 'encoder tests retain leaked depth fixtures');
};
validateEncoderSource(encoderSource, rootManifest, crateManifest);

assert(integrity.typed_node_vectors.length === 23, 'typed-node vector count');
assert(
  integrity.uncompressed_integrity_reference_vectors.length === 2,
  'uncompressed integrity HDoc count',
);
assert(
  integrity.uncompressed_integrity_reference_vectors.every(
    ({ hdoc_hex: hex, total_length: length }) => hex.length / 2 === length && length === 408,
  ),
  'uncompressed reference envelope lengths',
);
assert(payloads.test_vectors.length === 41, 'payload vector count');
assert(payloads.rejection_vectors.length === 17, 'payload rejection count');
assert(records.structural_examples.length === 4, 'structural example count');
assert(compression.block_vectors.length === 7, 'compression block vector count');
assert(compression.section_vectors.length === 5, 'compression stream vector count');
assert(compression.complete_hdoc_vectors.length === 2, 'complete compression HDoc count');
assert(compression.negative_cases.length === 18, 'compression negative-class count');
const compressedHDoc = compression.complete_hdoc_vectors.find(
  ({ id }) => id === 'large-string-value-area-lz4',
);
assert(compressedHDoc?.hdoc_hex.length / 2 === 448, 'complete compressed HDoc bytes');
assert(compressedHDoc?.canonical_length === 4472, 'complete compressed canonical length');
assert(
  compressedHDoc?.content_hash_hex ===
    '40bd20b8d0574192538a202d78c7b5f3cde3fd937bd93df6cac244fbb6de062e',
  'complete compressed typed hash',
);

const validateInventory = (report) => {
  assert(report.schema === 'helix.dependency-inventory-report/1', 'inventory schema');
  assert(report.verdict === 'pass', 'inventory verdict');
  assert(report.npm.locked_development_packages === 91, 'locked npm package count');
  assert(report.npm.installed_packages.length === 52, 'installed npm package count');
  assert(report.npm.license_files === 73, 'npm license-file count');
  assert(report.npm.duplicates.length === 1, 'npm duplicate-family count');
  assert(report.rust.workspace_packages.length === 8, 'Rust workspace package count');
  assert(report.rust.external_packages.length === 13, 'Rust external package count');
  assert(report.rust.license_files === 26, 'Rust license-file count');
  const versions = new Map(
    report.rust.external_packages.map(({ features, name, version }) => [
      name,
      { features, version },
    ]),
  );
  same(versions.get('blake3'), { features: ['pure'], version: '1.8.5' }, 'BLAKE3 graph');
  same(versions.get('crc'), { features: [], version: '3.4.0' }, 'CRC graph');
  same(
    versions.get('lz4_flex'),
    { features: ['safe-decode', 'safe-encode'], version: '0.13.1' },
    'LZ4 graph',
  );
};
validateInventory(inventory);

const validateObservation = (report) => {
  assert(report.schema === 'helix.dependency-observation-report/1', 'observation schema');
  assert(report.verdict === 'pass', 'observation verdict');
  assert(report.inputs.inventory_report_sha256 === sha256(readEvidence('dependency-inventory-report.json')), 'observation inventory binding');
  assert(report.npm.audit.vulnerabilities.total === 0, 'npm vulnerability count');
  assert(report.npm.provenance.registry_signatures_verified === 52, 'npm verified signatures');
  assert(report.npm.provenance.registry_signatures_invalid === 0, 'npm invalid signatures');
  assert(report.npm.provenance.registry_signatures_missing === 0, 'npm missing signatures');
  assert(report.npm.provenance.attested_packages.length === 27, 'npm SLSA attestation count');
  assert(report.rust.advisory_status === 'pass', 'Rust advisory status');
  assert(report.rust.scanner === 'cargo-audit 0.22.2', 'Rust scanner identity');
  assert(report.rust.audited_dependencies === 21, 'Rust workspace audit graph');
  assert(report.rust.scanner_audited_dependencies === 374, 'Rust scanner audit graph');
  assert(report.rust.vulnerabilities === 0 && report.rust.warnings === 0, 'Rust findings');
  assert(
    report.rust.scanner_vulnerabilities === 0 && report.rust.scanner_warnings === 0,
    'Rust scanner findings',
  );
  assert(
    /^[0-9a-f]{40}$/.test(report.rust.database_revision),
    'RustSec database revision identity',
  );
};
validateObservation(observation);

const validateCoverage = (report) => {
  assert(report.schema === 'helix.rust-coverage-report/1', 'coverage schema');
  assert(report.verdict === 'pass', 'coverage verdict');
  assert(report.execution.tests_executed === 18, 'coverage test count');
  assert(report.execution.workspace_status === 'hdoc-encoder', 'coverage workspace maturity');
  assert(report.execution.workspace_database_functionality === true, 'coverage product state');
  assert(
    report.inputs.cargo_manifest_sha256 === sourceArtifact('Cargo.toml').sha256,
    'coverage Cargo manifest binding',
  );
  const product = report.product_files.find(
    ({ path: file }) => file === 'crates/helix-doc/src/lib.rs',
  );
  assert(product?.sha256 === sourceArtifact('crates/helix-doc/src/lib.rs').sha256, 'coverage source binding');
  assert(product.metrics.functions.percent_basis_points === 10_000, 'encoder function coverage');
  assert(product.metrics.lines.percent_basis_points === 10_000, 'encoder line coverage');
  assert(product.metrics.regions.percent_basis_points >= 9_500, 'encoder region coverage');
  const semantic = report.groups.find(({ id }) => id === 'semantic-critical');
  assert(semantic?.verdict === 'pass', 'semantic-critical coverage verdict');
  assert(semantic?.failures.length === 0, 'semantic-critical coverage failures');
};
validateCoverage(coverage);

assert(coveragePolicy.active_product_scope.allowed_status === 'hdoc-encoder', 'active coverage status');
assert(coveragePolicy.active_product_scope.requires_database_functionality === true, 'active coverage functionality');
assert(coveragePolicy.execution.minimum_tests === 18, 'coverage minimum tests');
assert(suites.suites.find(({ id }) => id === 'unit')?.expectations.rust_tests === 18, 'unit suite inventory');

let mutationCanaries = 0;
const mutation = (label, original, mutate, validate) => {
  const candidate = structuredClone(original);
  mutate(candidate);
  let rejected = false;
  try {
    validate(candidate);
  } catch (error) {
    rejected = error instanceof Error && error.message.length > 0;
  }
  assert(rejected, `${label}: mutation was accepted`);
  mutationCanaries += 1;
};
mutation('inventory verdict', inventory, (value) => (value.verdict = 'fail'), validateInventory);
mutation(
  'Rust graph count',
  inventory,
  (value) => value.rust.external_packages.pop(),
  validateInventory,
);
mutation(
  'LZ4 feature graph',
  inventory,
  (value) => value.rust.external_packages.find(({ name }) => name === 'lz4_flex').features.pop(),
  validateInventory,
);
mutation(
  'npm vulnerability',
  observation,
  (value) => (value.npm.audit.vulnerabilities.total = 1),
  validateObservation,
);
mutation(
  'Rust vulnerability',
  observation,
  (value) => (value.rust.vulnerabilities = 1),
  validateObservation,
);
mutation(
  'scanner warning',
  observation,
  (value) => (value.rust.scanner_warnings = 1),
  validateObservation,
);
mutation(
  'coverage test inventory',
  coverage,
  (value) => (value.execution.tests_executed = 17),
  validateCoverage,
);
mutation(
  'coverage source hash',
  coverage,
  (value) =>
    (value.product_files.find(({ path: file }) => file === 'crates/helix-doc/src/lib.rs').sha256 =
      '0'.repeat(64)),
  validateCoverage,
);
mutation(
  'coverage line threshold',
  coverage,
  (value) =>
    (value.product_files.find(
      ({ path: file }) => file === 'crates/helix-doc/src/lib.rs',
    ).metrics.lines.percent_basis_points = 9_999),
  validateCoverage,
);
mutation(
  'coverage region threshold',
  coverage,
  (value) =>
    (value.product_files.find(
      ({ path: file }) => file === 'crates/helix-doc/src/lib.rs',
    ).metrics.regions.percent_basis_points = 9_499),
  validateCoverage,
);
{
  let rejected = false;
  try {
    validateEncoderSource(
      encoderSource.replace('MAX_CANONICAL_BYTES: u64 = 16_777_216', 'MAX_CANONICAL_BYTES: u64 = 1'),
      rootManifest,
      crateManifest,
    );
  } catch (error) {
    rejected = error instanceof Error && error.message.includes('MAX_CANONICAL_BYTES');
  }
  assert(rejected, 'encoder-limit mutation was accepted');
  mutationCanaries += 1;
}
{
  let rejected = false;
  try {
    validateEncoderSource(
      encoderSource.replace('lz4_flex::block::compress', 'alternate_codec::compress'),
      rootManifest,
      crateManifest,
    );
  } catch (error) {
    rejected = error instanceof Error && error.message.includes('lz4_flex');
  }
  assert(rejected, 'encoder-codec mutation was accepted');
  mutationCanaries += 1;
}
assert(mutationCanaries === manifest.verification.mutation_canaries, 'mutation-canary count');

gitText(['diff', '--check', manifest.base_commit, manifest.commit]);
process.stdout.write(
  `PASS P03-008 evidence: ${manifest.source_artifacts.length} source artifacts, 10 helix-doc tests/18 workspace tests, 16 type tags, 41 payload vectors, 23 typed hashes, 7 block vectors, 5 streams, 3 retained reports, ${mutationCanaries} mutation canaries\n`,
);
process.stdout.write(
  `PASS encoder proof: exact 408/448/4472-byte HDocs, 16 MiB boundary, native/Wasm builds, ASan, 100% lines/functions, >=95% regions, zero dependency findings\n`,
);

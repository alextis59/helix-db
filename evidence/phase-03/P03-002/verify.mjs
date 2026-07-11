#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const evidenceDirectory = path.dirname(scriptPath);
const repository = path.resolve(evidenceDirectory, '../../..');
const manifest = JSON.parse(readFileSync(path.join(evidenceDirectory, 'manifest.json'), 'utf8'));
const commitArgument = process.argv[2];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, message) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: ${JSON.stringify(actual)}`);
  }
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const gitBytes = (arguments_) =>
  execFileSync('git', arguments_, {
    cwd: repository,
    maxBuffer: 128 * 1024 * 1024,
  });
const gitText = (arguments_) => gitBytes(arguments_).toString('utf8');
const showBytes = (file, commit = manifest.commit) =>
  gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.commit) =>
  new TextDecoder('utf-8', { fatal: true }).decode(showBytes(file, commit));
const sorted = (values) => [...values].sort();

assert(commitArgument, 'usage: node evidence/phase-03/P03-002/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-002', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(
  manifest.requirements,
  ['CORE-001', 'DATA-001', 'INV-001', 'INV-007', 'SEC-002'],
  'requirements inventory mismatch',
);
same(manifest.accepted_adrs, ['0012'], 'accepted ADR inventory mismatch');
same(manifest.source_commits, [manifest.commit], 'source commit inventory mismatch');
assert(
  gitText(['rev-parse', `${commitArgument}^`]).trim() === manifest.base_commit,
  'source parent mismatch',
);
assert(
  gitText(['rev-parse', `${commitArgument}^{tree}`]).trim() === manifest.source_tree,
  'source tree mismatch',
);

const verifierBytes = readFileSync(scriptPath);
assert(statSync(scriptPath).size === manifest.verifier.bytes, 'verifier byte count mismatch');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256 mismatch');

gitText(['diff', '--check', `${commitArgument}^`, commitArgument]);
const changedRecords = gitText([
  'diff-tree',
  '--no-commit-id',
  '--name-status',
  '-r',
  commitArgument,
])
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...names] = line.split('\t');
    return { status, path: names.at(-1) };
  });
same(
  sorted(changedRecords.map((record) => JSON.stringify(record))),
  sorted(
    manifest.source_artifacts.map(({ status, path: artifactPath }) =>
      JSON.stringify({ status, path: artifactPath }),
    ),
  ),
  'exact source scope mismatch',
);
assert(
  manifest.source_artifacts.length === manifest.verification.source_artifacts,
  'source artifact count mismatch',
);
const sourceBytes = new Map();
for (const artifact of manifest.source_artifacts) {
  const bytes = showBytes(artifact.path);
  assert(bytes.length === artifact.bytes, `${artifact.path}: byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: SHA-256 mismatch`);
  sourceBytes.set(artifact.path, bytes);
}
const sourceText = (file) => {
  const bytes = sourceBytes.get(file) ?? showBytes(file);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};

const snapshot = {
  layoutSource: sourceText('docs/formats/hdoc-v1-envelope.json'),
  formatDocument: sourceText('docs/formats/hdoc-v1.md'),
  formatIndex: sourceText('docs/formats/README.md'),
  specifications: sourceText('Specifications.md'),
  study: sourceText('Study.md'),
  docsIndex: sourceText('docs/README.md'),
  adr: sourceText('docs/adr/0012-use-bounded-little-endian-hdoc-v1.md'),
  matrix: sourceText('compatibility/v1/matrix-v1.json'),
  compatibilityDocument: sourceText('docs/compatibility/v1-semantic-compatibility-matrix.md'),
  generationReport: sourceText('fixtures/generation/report-v1.json'),
  plan: showText('ImplementationPlan.md'),
};

const expectedHeadings = [
  '## Scope and maturity boundary',
  '## Normative notation',
  '## Envelope overview',
  '## Header magic',
  '## Fixed 64-byte header',
  '### `total_length`',
  '### `canonical_length`',
  '### `field_count`',
  '### `crc32c`',
  '## Document flags',
  '## Feature bitmaps',
  '### Required features',
  '### Optional features',
  '### Flag/feature invariants',
  '## Section directory',
  '### Directory entry layout',
  '### Section flags',
  '### Compression fields',
  '### `item_count`',
  '## Top-level section registry',
  '## Canonical body placement',
  '## Worked structural placement example',
  '## Fixed 64-byte footer',
  '## Base profile',
  '## Validation order and atomic exposure',
  '## Rejection and diagnostics',
  '## Version and compatibility behavior',
  '## Migration and rollback',
  '## Subordinate format ownership',
  '## Required validation fixtures',
  '## References',
];

const expectedHeaderFields = [
  ['magic', 0, 8, 'octets'],
  ['major_version', 8, 2, 'u16-le'],
  ['minor_version', 10, 2, 'u16-le'],
  ['header_bytes', 12, 2, 'u16-le'],
  ['directory_entry_bytes', 14, 2, 'u16-le'],
  ['document_flags', 16, 4, 'u32-le'],
  ['total_length', 20, 4, 'u32-le'],
  ['canonical_length', 24, 4, 'u32-le'],
  ['field_count', 28, 4, 'u32-le'],
  ['crc32c', 32, 4, 'u32-le'],
  ['section_count', 36, 2, 'u16-le'],
  ['reserved_0', 38, 2, 'u16-le'],
  ['directory_offset', 40, 4, 'u32-le'],
  ['footer_offset', 44, 4, 'u32-le'],
  ['required_features', 48, 8, 'u64-le'],
  ['optional_features', 56, 8, 'u64-le'],
];
const expectedDirectoryFields = [
  ['section_kind', 0, 2, 'u16-le'],
  ['section_flags', 2, 2, 'u16-le'],
  ['section_offset', 4, 4, 'u32-le'],
  ['stored_length', 8, 4, 'u32-le'],
  ['logical_length', 12, 4, 'u32-le'],
  ['item_count', 16, 4, 'u32-le'],
  ['codec_id', 20, 2, 'u16-le'],
  ['codec_profile_id', 22, 2, 'u16-le'],
  ['section_version', 24, 2, 'u16-le'],
  ['reserved_0', 26, 2, 'u16-le'],
  ['reserved_1', 28, 4, 'u32-le'],
];
const expectedFooterFields = [
  ['magic', 0, 8, 'octets'],
  ['footer_bytes', 8, 2, 'u16-le'],
  ['footer_version', 10, 2, 'u16-le'],
  ['hash_algorithm_id', 12, 2, 'u16-le'],
  ['hash_profile_id', 14, 2, 'u16-le'],
  ['hash_length', 16, 4, 'u32-le'],
  ['total_length_copy', 20, 4, 'u32-le'],
  ['canonical_length_copy', 24, 4, 'u32-le'],
  ['field_count_copy', 28, 4, 'u32-le'],
  ['content_hash', 32, 32, 'octets'],
];
const expectedDocumentFlags = [
  [0, '0x00000001', 'has_compressed_sections', 'P03-007'],
  [1, '0x00000002', 'has_extension_area', 'P03-015'],
  [2, '0x00000004', 'uses_path_dictionary_references', 'P03-013'],
  [3, '0x00000008', 'has_semantic_extensions', 'P03-015'],
  [4, '0x00000010', 'has_nonsemantic_extensions', 'P03-015'],
];
const expectedRequiredFeatures = [
  [0, '0x0000000000000001', 'section_compression', 'P03-007'],
  [1, '0x0000000000000002', 'path_dictionary_references', 'P03-013'],
  [2, '0x0000000000000004', 'semantic_extensions', 'P03-015'],
];
const expectedOptionalFeatures = [
  [0, '0x0000000000000001', 'nonsemantic_extensions', 'P03-015'],
];
const expectedSectionFlags = [
  [0, '0x0001', 'compressed'],
  [1, '0x0002', 'critical'],
  [2, '0x0004', 'semantic'],
  [3, '0x0008', 'opaque_preserve'],
];
const expectedSectionKinds = [
  [1, '0x0001', 'field_table', true, 0, 1, '0x0006', 'P03-005'],
  [2, '0x0002', 'name_pool', true, 1, 1, '0x0006', 'P03-005'],
  [3, '0x0003', 'value_area', true, 2, 1, '0x0006', 'P03-004'],
  [4, '0x0004', 'container_tables', true, 3, 1, '0x0006', 'P03-005'],
  [32767, '0x7fff', 'extension_area', false, 4, 1, '0x0000', 'P03-015'],
];
const expectedCanonicalRules = [
  ['header-size', 'header_bytes = 64 + section_count * 32'],
  ['directory-position', 'directory_offset = 64'],
  ['section-placement', 'section_offset[i] = align8(previous_section_end), first previous end = header_bytes'],
  ['footer-position', 'footer_offset = align8(last_section_end)'],
  ['stored-length', 'total_length = footer_offset + 64 = exact supplied HDoc slice length'],
  ['length-bounds', '256 <= total_length <= canonical_length <= 16777216'],
  ['uncompressed-length', 'without compressed sections, total_length = canonical_length'],
  ['footer-copies', 'footer length/count copies equal header total_length, canonical_length, and field_count'],
  ['checksum-coverage', 'CRC32C covers bytes [0,total_length), treating bytes [32,36) as zero'],
  ['field-count', 'field_count is the total recursive object-field entry count and equals field_table item_count'],
  ['padding', 'all canonical gaps are the minimum align8 padding and contain only zero bytes'],
  ['directory-order', 'directory entries are unique and ordered by section kind in canonical section order'],
];

const fieldTuples = (fields) =>
  fields.map(({ name, offset, bytes, encoding }) => [name, offset, bytes, encoding]);
const flagTuples = (entries) =>
  entries.map(({ bit, mask_hex: mask, name, owner }) =>
    owner === undefined ? [bit, mask, name] : [bit, mask, name, owner],
  );
const sectionKindTuples = (entries) =>
  entries.map(({ id, id_hex: idHex, name, required, canonical_order: order, section_version: version, base_flags_hex: flags, owner }) =>
    [id, idHex, name, required, order, version, flags, owner],
  );

function crc32c(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0x82f63b78 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const buildStructuralSkeleton = (layout) => {
  const bytes = Buffer.alloc(256);
  Buffer.from(layout.magic.header_hex, 'hex').copy(bytes, 0);
  bytes.writeUInt16LE(1, 8);
  bytes.writeUInt16LE(0, 10);
  bytes.writeUInt16LE(192, 12);
  bytes.writeUInt16LE(32, 14);
  bytes.writeUInt32LE(0, 16);
  bytes.writeUInt32LE(256, 20);
  bytes.writeUInt32LE(256, 24);
  bytes.writeUInt32LE(0, 28);
  bytes.writeUInt16LE(4, 36);
  bytes.writeUInt16LE(0, 38);
  bytes.writeUInt32LE(64, 40);
  bytes.writeUInt32LE(192, 44);
  for (let index = 0; index < 4; index += 1) {
    const offset = 64 + index * 32;
    bytes.writeUInt16LE(index + 1, offset);
    bytes.writeUInt16LE(0x0006, offset + 2);
    bytes.writeUInt32LE(192, offset + 4);
    bytes.writeUInt16LE(1, offset + 24);
  }
  Buffer.from(layout.magic.footer_hex, 'hex').copy(bytes, 192);
  bytes.writeUInt16LE(64, 200);
  bytes.writeUInt16LE(1, 202);
  bytes.writeUInt16LE(1, 204);
  bytes.writeUInt16LE(0, 206);
  bytes.writeUInt32LE(32, 208);
  bytes.writeUInt32LE(256, 212);
  bytes.writeUInt32LE(256, 216);
  bytes.writeUInt32LE(0, 220);
  const checksum = crc32c(bytes);
  bytes.writeUInt32LE(checksum, 32);
  return { bytes, checksum };
};

const validateContract = (candidate) => {
  const layout = JSON.parse(candidate.layoutSource);
  assert(
    candidate.layoutSource === jsonBytes(layout).toString('utf8'),
    'layout JSON formatting mismatch',
  );
  same(
    Object.keys(layout).sort(),
    [
      'base_profile',
      'canonical_rules',
      'codec_registry',
      'directory',
      'document_flags',
      'footer',
      'format',
      'header',
      'magic',
      'optional_feature_bits',
      'required_feature_bits',
      'schema',
      'section_flags',
      'section_kinds',
    ],
    'layout top-level fields mismatch',
  );
  assert(layout.schema === 'helix.hdoc-envelope-layout/1', 'layout schema mismatch');
  assert(
    layout.format.name === 'HDoc' &&
      layout.format.major_version === 1 &&
      layout.format.minor_version === 0 &&
      layout.format.byte_order === 'little-endian' &&
      layout.format.offset_base === 'document-start' &&
      layout.format.offset_width_bits === 32 &&
      layout.format.section_alignment_bytes === 8,
    'layout format identity mismatch',
  );
  assert(
    layout.format.maximum_canonical_bytes === 16_777_216,
    'maximum canonical bytes mismatch',
  );
  assert(
    layout.format.minimum_envelope_bytes_without_section_payloads === 256,
    'minimum envelope bytes mismatch',
  );
  assert(
    layout.format.complete_byte_format === false && layout.format.completion_gate === 'P03-007',
    'layout maturity boundary mismatch',
  );
  assert(
    layout.magic.header_hex === '48444f430d0a1a0a' &&
      Buffer.from(layout.magic.header_hex, 'hex').length === 8,
    'header magic mismatch',
  );
  assert(
    layout.magic.footer_hex === '48444f43454e440a' &&
      Buffer.from(layout.magic.footer_hex, 'hex').length === 8,
    'footer magic mismatch',
  );
  assert(layout.header.bytes === 64, 'header byte width mismatch');
  assert(layout.header.directory_offset === 64, 'header directory offset mismatch');
  assert(
    layout.header.checksum_field_offset === 32 && layout.header.checksum_field_bytes === 4,
    'checksum field location mismatch',
  );
  same(fieldTuples(layout.header.fields), expectedHeaderFields, 'header field layout mismatch');
  assert(layout.header.fields.find(({ name }) => name === 'header_bytes').derived === '64 + section_count * 32', 'header size derivation mismatch');
  assert(layout.header.fields.find(({ name }) => name === 'directory_entry_bytes').constant === 32, 'header directory stride constant mismatch');
  assert(layout.header.fields.find(({ name }) => name === 'section_count').minimum === 4 && layout.header.fields.find(({ name }) => name === 'section_count').maximum === 32, 'header section-count range mismatch');
  assert(layout.header.fields.find(({ name }) => name === 'directory_offset').constant === 64, 'header directory field constant mismatch');
  assert(layout.header.fields.find(({ name }) => name === 'reserved_0').constant === 0, 'header reserved field mismatch');

  assert(layout.directory.entry_bytes === 32, 'directory entry width mismatch');
  assert(layout.directory.minimum_entries === 4 && layout.directory.maximum_entries === 32, 'directory entry-count range mismatch');
  same(fieldTuples(layout.directory.fields), expectedDirectoryFields, 'directory field layout mismatch');
  assert(layout.directory.fields.find(({ name }) => name === 'section_version').base_value === 1, 'section version base mismatch');
  assert(layout.directory.fields.filter(({ name }) => name.startsWith('reserved_')).every(({ constant }) => constant === 0), 'directory reserved field mismatch');

  assert(layout.footer.bytes === 64, 'footer byte width mismatch');
  assert(layout.footer.version === 1, 'footer version mismatch');
  assert(
    layout.footer.hash_algorithm_id === 1 &&
      layout.footer.hash_algorithm === 'blake3-256' &&
      layout.footer.hash_bytes === 32,
    'footer hash algorithm mismatch',
  );
  assert(
    layout.footer.hash_profile_id === 0 &&
      layout.footer.hash_profile_status === 'unassigned-until-P03-006',
    'footer hash-profile maturity mismatch',
  );
  same(fieldTuples(layout.footer.fields), expectedFooterFields, 'footer field layout mismatch');
  assert(layout.footer.fields.find(({ name }) => name === 'hash_profile_id').valid_document === false, 'hash profile zero validity mismatch');
  assert(layout.footer.fields.find(({ name }) => name === 'hash_profile_id').assignment_owner === 'P03-006', 'hash profile owner mismatch');

  same(flagTuples(layout.document_flags), expectedDocumentFlags, 'document flag registry mismatch');
  same(flagTuples(layout.required_feature_bits), expectedRequiredFeatures, 'required feature registry mismatch');
  same(flagTuples(layout.optional_feature_bits), expectedOptionalFeatures, 'optional feature registry mismatch');
  same(flagTuples(layout.section_flags), expectedSectionFlags, 'section flag registry mismatch');
  same(sectionKindTuples(layout.section_kinds), expectedSectionKinds, 'section kind registry mismatch');
  same(
    layout.codec_registry,
    [
      {
        id: 0,
        profile_id: 0,
        name: 'none',
        valid_when: 'compressed flag is clear and stored_length equals logical_length',
      },
    ],
    'codec zero registry mismatch',
  );
  same(
    layout.base_profile,
    {
      document_flags_hex: '0x00000000',
      required_features_hex: '0x0000000000000000',
      optional_features_hex: '0x0000000000000000',
      section_count: 4,
      header_bytes: 192,
      section_kinds: [1, 2, 3, 4],
      compression: false,
      extensions: false,
      path_dictionary_references: false,
    },
    'base profile mismatch',
  );
  same(
    layout.canonical_rules.map(({ id, expression }) => [id, expression]),
    expectedCanonicalRules,
    'canonical rule registry mismatch',
  );

  same(
    candidate.formatDocument.split('\n').filter((line) => /^#{2,3} /.test(line)),
    expectedHeadings,
    'format document heading contract mismatch',
  );
  for (const marker of [
    '- Status: Accepted envelope layout; not yet a complete HDoc byte format',
    '- Format identity: HDoc major `1`, minor `0`',
    '- Plan item: `P03-002`',
    'complete_byte_format` to `false`',
    'using hash profile zero MUST be',
    'No example in this document is a golden HDoc',
    'field_count = 5',
    '256 <= total_length <= canonical_length <= 16,777,216',
    'The four bytes at `[32,36)` hold the little-endian CRC-32C',
    'while treating `[32,36)` as four zero bytes',
    '`CAP_FORMAT_UNSUPPORTED`',
    '`CAP_UNSUPPORTED_VERSION`',
    '`DUR_CORRUPTION`',
    'Only major 1/minor 0 writing is defined here.',
    'No valid HDoc fixture or persisted HDoc row exists at P03-002',
  ]) assert(candidate.formatDocument.includes(marker), `format maturity/semantic marker absent: ${marker}`);
  for (const [name] of [...expectedHeaderFields, ...expectedDirectoryFields, ...expectedFooterFields]) {
    assert(candidate.formatDocument.includes(`\`${name}\``), `format field absent from prose: ${name}`);
  }
  for (const [, , name] of [...expectedDocumentFlags, ...expectedRequiredFeatures, ...expectedOptionalFeatures, ...expectedSectionFlags]) {
    assert(candidate.formatDocument.toLowerCase().includes(name.toLowerCase()), `format flag absent from prose: ${name}`);
  }
  for (const [, , name] of expectedSectionKinds) {
    assert(candidate.formatDocument.includes(`\`${name}\``), `format section absent from prose: ${name}`);
  }
  for (const task of ['`P03-003`', '`P03-004`', '`P03-005`', '`P03-006`', '`P03-007`', '`P03-013`–`P03-015`']) {
    assert(candidate.formatDocument.includes(task), `subordinate owner absent: ${task}`);
  }

  const formatPath = 'docs/formats/hdoc-v1.md';
  const layoutPath = 'docs/formats/hdoc-v1-envelope.json';
  assert(candidate.specifications.includes(formatPath), 'specification format backlink absent');
  assert(candidate.specifications.includes(layoutPath), 'specification machine-layout backlink absent');
  assert(candidate.specifications.includes('Fixed header (64 bytes)'), 'specification header summary absent');
  assert(candidate.specifications.includes('Section directory (section_count × 32 bytes)'), 'specification directory summary absent');
  assert(candidate.specifications.includes('Footer (64 bytes)'), 'specification footer summary absent');
  assert(candidate.study.includes('docs/formats/hdoc-v1.md'), 'study format backlink absent');
  assert(candidate.formatIndex.includes('[HDoc envelope](hdoc-v1.md)'), 'format index entry absent');
  assert(candidate.formatIndex.includes('[Envelope registry](hdoc-v1-envelope.json)'), 'format machine entry absent');
  assert(candidate.docsIndex.includes('[HDoc 1.0 envelope format](formats/hdoc-v1.md)'), 'documentation index entry absent');
  assert(candidate.adr.includes('- [x] Freeze exact header/footer and feature/version fields under `P03-002`.'), 'ADR validation state mismatch');
  assert(candidate.adr.includes('- [x] `P03-002`: assign exact magic, header/footer, directory, version, flag, algorithm, and feature'), 'ADR follow-up state mismatch');
  assert(candidate.adr.includes('../formats/hdoc-v1.md'), 'ADR format reference absent');
  assert(candidate.plan.includes('- [ ] **P03-002** Define the HDoc header, flags, format version, total length, field count, checksum, body sections, and footer.'), 'source plan state/task text mismatch');

  const specificationBytes = Buffer.from(candidate.specifications, 'utf8');
  const matrix = JSON.parse(candidate.matrix);
  same(
    matrix.inputs.specifications,
    {
      path: 'Specifications.md',
      bytes: specificationBytes.length,
      sha256: sha256(specificationBytes),
    },
    'matrix specification identity mismatch',
  );
  assert(matrix.verdict === 'pass' && matrix.counts.native_rows === 263, 'matrix verdict/count mismatch');
  assert(matrix.counts.failed === 0 && matrix.counts.skipped === 0, 'matrix failure/skip mismatch');
  assert(
    candidate.compatibilityDocument.includes(
      `| \`specifications\` | [Specifications.md](../../Specifications.md) | \`${sha256(specificationBytes)}\` | ${specificationBytes.length} |`,
    ),
    'rendered compatibility specification identity mismatch',
  );
  const generationReport = JSON.parse(candidate.generationReport);
  const compatibilityGenerator = generationReport.generators.find(
    ({ id }) => id === 'compatibility.matrix-v1',
  );
  assert(compatibilityGenerator, 'generation report compatibility generator absent');
  same(
    compatibilityGenerator.artifacts,
    [
      {
        path: 'compatibility/v1/matrix-v1.json',
        format: 'json',
        schema_path: 'compatibility/v1/schema/matrix-v1.schema.json',
        bytes: Buffer.byteLength(candidate.matrix),
        sha256: sha256(Buffer.from(candidate.matrix, 'utf8')),
      },
      {
        path: 'docs/compatibility/v1-semantic-compatibility-matrix.md',
        format: 'markdown',
        schema_path: null,
        bytes: Buffer.byteLength(candidate.compatibilityDocument),
        sha256: sha256(Buffer.from(candidate.compatibilityDocument, 'utf8')),
      },
    ],
    'generation report compatibility identities mismatch',
  );
  assert(generationReport.verdict === 'pass', 'generation report verdict mismatch');

  const skeleton = buildStructuralSkeleton(layout);
  const zeroed = Buffer.from(skeleton.bytes);
  zeroed.fill(0, 32, 36);
  assert(crc32c(zeroed) === skeleton.checksum, 'structural skeleton CRC replay mismatch');
  assert(
    skeleton.checksum.toString(16).padStart(8, '0') === manifest.verification.structural_skeleton_crc32c,
    'structural skeleton CRC identity mismatch',
  );
  assert(skeleton.bytes.length === manifest.verification.structural_skeleton_bytes, 'structural skeleton byte count mismatch');
  assert(sha256(skeleton.bytes) === manifest.verification.structural_skeleton_sha256, 'structural skeleton SHA-256 mismatch');
  assert(skeleton.bytes.subarray(0, 8).toString('hex') === layout.magic.header_hex, 'structural skeleton header magic mismatch');
  assert(skeleton.bytes.subarray(192, 200).toString('hex') === layout.magic.footer_hex, 'structural skeleton footer magic mismatch');
  assert(skeleton.bytes.readUInt32LE(20) === 256 && skeleton.bytes.readUInt32LE(24) === 256, 'structural skeleton length mismatch');
  assert(skeleton.bytes.readUInt16LE(206) === 0, 'structural skeleton accidentally claims a valid hash profile');
  assert(crc32c(Buffer.from('123456789', 'ascii')) === 0xe3069283, 'CRC32C standard vector mismatch');
};

validateContract(snapshot);

const withLayoutMutation = (candidate, mutate) => {
  const value = JSON.parse(candidate.layoutSource);
  mutate(value);
  candidate.layoutSource = jsonBytes(value).toString('utf8');
};
const replaceOnce = (source, from, to) => {
  assert(source.includes(from), `canary source absent: ${from}`);
  assert(source.indexOf(from) === source.lastIndexOf(from), `canary source not unique: ${from}`);
  return source.replace(from, to);
};
const expectRejection = (label, mutate, expectedReason) => {
  const candidate = { ...snapshot };
  mutate(candidate);
  let rejection;
  try {
    validateContract(candidate);
  } catch (error) {
    rejection = error;
  }
  assert(rejection, `${label}: mutation was accepted`);
  assert(rejection.message.includes(expectedReason), `${label}: wrong rejection: ${rejection.message}`);
};

const canaries = [
  ['completion state', (c) => withLayoutMutation(c, (v) => { v.format.complete_byte_format = true; }), 'layout maturity boundary mismatch'],
  ['maximum bytes', (c) => withLayoutMutation(c, (v) => { v.format.maximum_canonical_bytes += 1; }), 'maximum canonical bytes mismatch'],
  ['header magic', (c) => withLayoutMutation(c, (v) => { v.magic.header_hex = '00444f430d0a1a0a'; }), 'header magic mismatch'],
  ['footer magic', (c) => withLayoutMutation(c, (v) => { v.magic.footer_hex = '00444f43454e440a'; }), 'footer magic mismatch'],
  ['header width', (c) => withLayoutMutation(c, (v) => { v.header.bytes = 63; }), 'header byte width mismatch'],
  ['header field offset', (c) => withLayoutMutation(c, (v) => { v.header.fields.find((f) => f.name === 'canonical_length').offset = 25; }), 'header field layout mismatch'],
  ['directory width', (c) => withLayoutMutation(c, (v) => { v.directory.entry_bytes = 31; }), 'directory entry width mismatch'],
  ['directory field offset', (c) => withLayoutMutation(c, (v) => { v.directory.fields.find((f) => f.name === 'logical_length').offset = 13; }), 'directory field layout mismatch'],
  ['footer width', (c) => withLayoutMutation(c, (v) => { v.footer.bytes = 63; }), 'footer byte width mismatch'],
  ['footer field offset', (c) => withLayoutMutation(c, (v) => { v.footer.fields.find((f) => f.name === 'content_hash').offset = 33; }), 'footer field layout mismatch'],
  ['checksum offset', (c) => withLayoutMutation(c, (v) => { v.header.checksum_field_offset = 31; }), 'checksum field location mismatch'],
  ['directory offset', (c) => withLayoutMutation(c, (v) => { v.header.directory_offset = 65; }), 'header directory offset mismatch'],
  ['document flag', (c) => withLayoutMutation(c, (v) => { v.document_flags[0].mask_hex = '0x00000002'; }), 'document flag registry mismatch'],
  ['required feature', (c) => withLayoutMutation(c, (v) => { v.required_feature_bits[1].bit = 2; }), 'required feature registry mismatch'],
  ['optional feature', (c) => withLayoutMutation(c, (v) => { v.optional_feature_bits[0].mask_hex = '0x0000000000000002'; }), 'optional feature registry mismatch'],
  ['section flag', (c) => withLayoutMutation(c, (v) => { v.section_flags[2].mask_hex = '0x0008'; }), 'section flag registry mismatch'],
  ['section ID', (c) => withLayoutMutation(c, (v) => { v.section_kinds[1].id = 1; }), 'section kind registry mismatch'],
  ['section order', (c) => withLayoutMutation(c, (v) => { v.section_kinds[2].canonical_order = 3; }), 'section kind registry mismatch'],
  ['base section flags', (c) => withLayoutMutation(c, (v) => { v.section_kinds[0].base_flags_hex = '0x0002'; }), 'section kind registry mismatch'],
  ['base section inventory', (c) => withLayoutMutation(c, (v) => { v.base_profile.section_kinds.pop(); }), 'base profile mismatch'],
  ['base header', (c) => withLayoutMutation(c, (v) => { v.base_profile.header_bytes = 193; }), 'base profile mismatch'],
  ['hash algorithm', (c) => withLayoutMutation(c, (v) => { v.footer.hash_algorithm_id = 2; }), 'footer hash algorithm mismatch'],
  ['hash profile', (c) => withLayoutMutation(c, (v) => { v.footer.hash_profile_id = 1; }), 'footer hash-profile maturity mismatch'],
  ['footer rule', (c) => withLayoutMutation(c, (v) => { v.canonical_rules.find((r) => r.id === 'footer-position').expression = 'footer_offset = last_section_end'; }), 'canonical rule registry mismatch'],
  ['field-count rule', (c) => withLayoutMutation(c, (v) => { v.canonical_rules.find((r) => r.id === 'field-count').expression = 'field_count is root-only'; }), 'canonical rule registry mismatch'],
  ['format maturity', (c) => { c.formatDocument = replaceOnce(c.formatDocument, 'No example in this document is a golden HDoc', 'This example is a golden HDoc'); }, 'format maturity/semantic marker absent'],
  ['recursive field count', (c) => { c.formatDocument = replaceOnce(c.formatDocument, 'field_count = 5', 'field_count = 4'); }, 'format maturity/semantic marker absent'],
  ['specification link', (c) => { c.specifications = replaceOnce(c.specifications, 'docs/formats/hdoc-v1.md', 'docs/formats/missing.md'); }, 'specification format backlink absent'],
  ['study link', (c) => { c.study = replaceOnce(c.study, 'docs/formats/hdoc-v1.md', 'docs/formats/missing.md'); }, 'study format backlink absent'],
  ['format index', (c) => { c.formatIndex = replaceOnce(c.formatIndex, '[HDoc envelope](hdoc-v1.md)', 'HDoc envelope omitted'); }, 'format index entry absent'],
  ['documentation index', (c) => { c.docsIndex = replaceOnce(c.docsIndex, '[HDoc 1.0 envelope format](formats/hdoc-v1.md)', 'HDoc format omitted'); }, 'documentation index entry absent'],
  ['ADR completion', (c) => { c.adr = replaceOnce(c.adr, '- [x] Freeze exact header/footer and feature/version fields under `P03-002`.', '- [ ] Freeze exact header/footer and feature/version fields under `P03-002`.'); }, 'ADR validation state mismatch'],
  ['source plan state', (c) => { c.plan = replaceOnce(c.plan, '- [ ] **P03-002**', '- [x] **P03-002**'); }, 'source plan state/task text mismatch'],
  ['matrix specification hash', (c) => { const value = JSON.parse(c.matrix); value.inputs.specifications.sha256 = '0'.repeat(64); c.matrix = jsonBytes(value).toString('utf8'); }, 'matrix specification identity mismatch'],
  ['generation report hash', (c) => { const value = JSON.parse(c.generationReport); value.generators.find(({ id }) => id === 'compatibility.matrix-v1').artifacts[0].sha256 = '0'.repeat(64); c.generationReport = jsonBytes(value).toString('utf8'); }, 'generation report compatibility identities mismatch'],
];

for (const [label, mutate, reason] of canaries) expectRejection(label, mutate, reason);
assert(canaries.length === manifest.verification.mutation_canaries, 'mutation-canary count mismatch');

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', commitArgument])
  .trim()
  .split('\n')
  .filter(Boolean);
const markdownFiles = trackedFiles.filter((file) => file.endsWith('.md'));
let localLinks = 0;
for (const file of markdownFiles) {
  const source = showText(file);
  assert(source.endsWith('\n'), `${file}: missing terminal newline`);
  for (const [index, line] of source.split('\n').entries()) {
    assert(!/[ \t]+$/.test(line), `${file}:${index + 1}: trailing whitespace`);
  }
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let rawTarget = match[1].split('#')[0];
    if (!rawTarget || /^(https?:|mailto:)/.test(rawTarget)) continue;
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) rawTarget = rawTarget.slice(1, -1);
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)),
    );
    assert(target !== '..' && !target.startsWith('../'), `${file}: link escapes repository`);
    gitText(['cat-file', '-e', `${commitArgument}:${target}`]);
    localLinks += 1;
  }
}
assert(markdownFiles.length === manifest.verification.markdown_files, 'Markdown count mismatch');
assert(localLinks === manifest.verification.local_links, 'local-link count mismatch');
assert(
  snapshot.formatDocument.split('\n').length - 1 === manifest.verification.format_document_lines,
  'format document line count mismatch',
);
assert(expectedHeadings.length === manifest.verification.format_document_headings, 'format heading count mismatch');
assert(snapshot.layoutSource.split('\n').length - 1 === manifest.verification.layout_registry_lines, 'layout registry line count mismatch');
assert(Buffer.byteLength(snapshot.layoutSource) === manifest.verification.layout_registry_bytes, 'layout registry byte count mismatch');

const matrixReplayPaths = [
  'Specifications.md',
  'compatibility/v1/generate-matrix.mjs',
  'compatibility/v1/matrix-v1.json',
  'docs/compatibility/v1-semantic-compatibility-matrix.md',
  ...Object.values(JSON.parse(snapshot.matrix).inputs).map(({ path: inputPath }) => inputPath),
  ...trackedFiles.filter((file) => file.startsWith('reference/semantic-oracle/')),
];
const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p03-002-'));
try {
  for (const file of new Set(matrixReplayPaths)) {
    const destination = path.join(temporary, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, showBytes(file));
  }
  const generatorOutput = execFileSync(
    process.execPath,
    ['compatibility/v1/generate-matrix.mjs', '--check'],
    { cwd: temporary, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  assert(generatorOutput.includes('PASS semantic compatibility matrix: 263 native rows'), 'isolated matrix replay did not pass');
  assert(generatorOutput.includes('PASS matrix inputs: 9 hash-bound artifacts'), 'isolated matrix input count mismatch');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact ${manifest.source_artifacts.length}-artifact P03-002 scope at ${commitArgument}`);
console.log(`PASS HDoc envelope partitions: ${manifest.verification.header_fields}/${manifest.verification.directory_fields}/${manifest.verification.footer_fields} fields in 64/32/64 bytes`);
console.log(`PASS flags/features/sections/rules: ${manifest.verification.document_flags}/${manifest.verification.required_feature_bits}/${manifest.verification.optional_feature_bits}/${manifest.verification.section_flags}/${manifest.verification.section_kinds}/${manifest.verification.canonical_rules}`);
console.log(`PASS structural skeleton: ${manifest.verification.structural_skeleton_bytes} bytes, CRC32C ${manifest.verification.structural_skeleton_crc32c}, invalid hash profile 0`);
console.log(`PASS mutation canaries: ${canaries.length}/${canaries.length} intended rejections`);
console.log(`PASS documentation: ${markdownFiles.length} Markdown files and ${localLinks} local links`);
console.log('PASS generated authority: 263-row matrix, rendered document, and fixture-generation report');
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

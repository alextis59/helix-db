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
const sorted = (values) => [...values].sort();
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const align = (value, alignment) => (value + alignment - 1) & ~(alignment - 1);
const gitBytes = (arguments_) =>
  execFileSync('git', arguments_, {
    cwd: repository,
    maxBuffer: 128 * 1024 * 1024,
  });
const gitText = (arguments_) => gitBytes(arguments_).toString('utf8');
const showBytes = (file, commit = manifest.commit) => gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.commit) =>
  new TextDecoder('utf-8', { fatal: true }).decode(showBytes(file, commit));

assert(commitArgument, 'usage: node evidence/phase-03/P03-005/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-005', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(
  manifest.requirements,
  ['CORE-001', 'DATA-001', 'DATA-002', 'INV-001', 'INV-007'],
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
  registrySource: sourceText('docs/formats/hdoc-v1-records.json'),
  recordDocument: sourceText('docs/formats/hdoc-v1-records.md'),
  envelopeRegistrySource: sourceText('docs/formats/hdoc-v1-envelope.json'),
  envelopeDocument: sourceText('docs/formats/hdoc-v1.md'),
  payloadRegistrySource: sourceText('docs/formats/hdoc-v1-payloads.json'),
  payloadDocument: sourceText('docs/formats/hdoc-v1-payloads.md'),
  tagRegistrySource: sourceText('docs/formats/hdoc-v1-type-tags.json'),
  tagDocument: sourceText('docs/formats/hdoc-v1-type-tags.md'),
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

const expectedFormat = {
  name: 'HDoc',
  major_version: 1,
  minor_version: 0,
  profile: 'base-self-contained',
  byte_order: 'little-endian',
  offset_base: 'document-start',
  offset_width_bits: 32,
  complete_table_and_container_format: true,
  complete_hdoc_format: false,
  remaining_completion_owners: ['P03-006', 'P03-007'],
};
const expectedConstants = {
  field_entry_bytes: 24,
  name_record_bytes: 8,
  array_entry_bytes: 12,
  container_descriptor_bytes: 32,
  root_container_id: 0,
  root_parent_sentinel: 4_294_967_295,
  object_type_tag: 9,
  array_type_tag: 10,
  base_reference_flags: 0,
  base_container_flags: 0,
};
const expectedSections = [
  [
    'field_table',
    1,
    'total-recursive-object-field-entry-count',
    'item_count * 24',
    8,
    true,
    null,
    null,
  ],
  [
    'name_pool',
    2,
    'distinct-document-local-name-record-count',
    'item_count * 8 + sum(name_length)',
    8,
    true,
    null,
    null,
  ],
  [
    'value_area',
    3,
    'noncontainer-value-reference-occurrence-count-including-zero-length-payloads',
    'minimal-aligned-concatenation-of-each-noncontainer-payload-occurrence',
    1,
    true,
    null,
    null,
  ],
  [
    'container_tables',
    4,
    'container-descriptor-count-including-root',
    'item_count * 32 + total-array-element-count * 12',
    8,
    false,
    32,
    1,
  ],
];
const sectionTuples = (sections) =>
  sections.map((section) => [
    section.kind,
    section.kind_id,
    section.item_count_meaning,
    section.length_equation,
    section.internal_alignment_bytes,
    section.empty_allowed,
    section.minimum_length ?? null,
    section.minimum_item_count ?? null,
  ]);
const expectedLayouts = {
  field_entry: [
    24,
    'field_table',
    null,
    [
      ['field_id', 0, 4, 'u32-le', null, null, 'zero-based-document-local-name-record-id'],
      ['field_name_offset', 4, 4, 'u32-le', null, null, 'absolute-offset-of-exact-name-bytes'],
      ['field_name_length', 8, 2, 'u16-le', 1, 1024, null],
      ['type_tag', 10, 1, 'u8', null, null, null],
      ['flags', 11, 1, 'u8', null, null, null],
      ['value_offset', 12, 4, 'u32-le', null, null, 'absolute-payload-or-container-descriptor-offset'],
      ['value_length', 16, 4, 'u32-le', null, null, 'exact-payload-length-or-32-for-container-reference'],
      ['presentation_ordinal', 20, 4, 'u32-le', null, null, 'zero-based-position-in-owning-object-presentation-order'],
    ],
  ],
  name_record: [
    8,
    'name_pool',
    'zero-based-record-index',
    [
      ['name_offset', 0, 4, 'u32-le', null, null, 'absolute-offset-into-name-byte-suffix'],
      ['name_length', 4, 2, 'u16-le', 1, 1024, null],
      ['scalar_count', 6, 2, 'u16-le', 1, 256, null],
    ],
  ],
  array_entry: [
    12,
    'container_tables-array-entry-suffix',
    null,
    [
      ['type_tag', 0, 1, 'u8', null, null, null],
      ['flags', 1, 1, 'u8', null, null, null],
      ['reserved_0', 2, 2, 'u16-le', null, null, null],
      ['value_offset', 4, 4, 'u32-le', null, null, 'absolute-payload-or-container-descriptor-offset'],
      ['value_length', 8, 4, 'u32-le', null, null, 'exact-payload-length-or-32-for-container-reference'],
    ],
  ],
  container_descriptor: [
    32,
    'container_tables-descriptor-prefix',
    null,
    [
      ['container_id', 0, 4, 'u32-le', null, null, 'zero-based-descriptor-index'],
      ['type_tag', 4, 1, 'u8', null, null, null],
      ['flags', 5, 1, 'u8', null, null, null],
      ['depth', 6, 2, 'u16-le', 1, 100, null],
      ['item_offset', 8, 4, 'u32-le', null, null, 'absolute-first-field-or-array-entry-cursor'],
      ['item_count', 12, 4, 'u32-le', null, null, 'immediate-object-fields-or-dense-array-elements'],
      ['recursive_field_count', 16, 4, 'u32-le', null, null, 'object-field-count-in-this-container-subtree'],
      ['parent_container_id', 20, 4, 'u32-le', null, null, 'owning-container-id-or-root-sentinel'],
      ['parent_slot', 24, 4, 'u32-le', null, null, 'canonical-object-member-ordinal-or-array-index-or-root-sentinel'],
      ['reserved_0', 28, 4, 'u32-le', null, null, null],
    ],
  ],
};
const layoutTuple = (layout) => [
  layout.bytes,
  layout.section,
  layout.id_source ?? null,
  layout.fields.map((field) => [
    field.name,
    field.offset,
    field.bytes,
    field.encoding,
    field.minimum ?? null,
    field.maximum ?? null,
    field.meaning ?? null,
  ]),
];
const expectedLayoutMetadata = {
  field_entry: [
    [null, null, null],
    [null, null, null],
    [null, null, null],
    [null, null, 'docs/formats/hdoc-v1-type-tags.json'],
    [0, null, null],
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ],
  name_record: [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ],
  array_entry: [
    [null, null, 'docs/formats/hdoc-v1-type-tags.json'],
    [0, null, null],
    [0, null, null],
    [null, null, null],
    [null, null, null],
  ],
  container_descriptor: [
    [null, null, null],
    [null, [9, 10], null],
    [0, null, null],
    [null, null, null],
    [null, null, null],
    [null, null, null],
    [null, null, null],
    [null, null, null],
    [null, null, null],
    [0, null, null],
  ],
};
const layoutMetadata = (layout) =>
  layout.fields.map((field) => [
    field.constant ?? null,
    field.allowed ?? null,
    field.registry ?? null,
  ]);
const expectedContainerKinds = [
  [
    9,
    '0x09',
    'object',
    'field_entry',
    'field_table',
    'strictly-increasing-field-id-canonical-name-order',
    10_000,
  ],
  [
    10,
    '0x0a',
    'array',
    'array_entry',
    'container_tables-array-entry-suffix',
    'dense-zero-based-logical-element-order',
    1_000_000,
  ],
];
const containerKindTuples = (kinds) =>
  kinds.map((kind) => [
    kind.type_tag,
    kind.tag_hex,
    kind.name,
    kind.item_record,
    kind.item_table,
    kind.item_order,
    kind.maximum_immediate_items,
  ]);
const expectedNamePool = {
  deduplication_scope: 'whole-document-exact-name-bytes',
  record_order: 'strict-binary_utf8_v1-ascending',
  record_table_offset: 'name_pool.section_offset',
  byte_suffix_offset: 'name_pool.section_offset + item_count * 8',
  byte_suffix_order: 'record-order-exact-concatenation',
  terminators: false,
  internal_padding: false,
  normalization: false,
  unused_records_allowed: false,
  field_id_meaning: 'name-record-index',
  collection_path_dictionary_id: 'not-the-same-namespace-deferred-to-P03-013',
};
const expectedContainerTree = {
  root: {
    container_id: 0,
    type_tag: 9,
    depth: 1,
    parent_container_id: 4_294_967_295,
    parent_slot: 4_294_967_295,
  },
  id_assignment: 'breadth-first-root-queue',
  child_scan_order: 'object-canonical-field-order-or-array-index-order',
  ownership: 'every-nonroot-container-has-exactly-one-reference-and-matching-parent-tuple',
  cycles: 'reject',
  aliases: 'reject-and-serialize-repeated-host-subgraphs-by-value',
  descriptor_order: 'container-id-ascending',
  object_field_span_order: 'object-descriptor-container-id-ascending',
  array_entry_span_order: 'array-descriptor-container-id-ascending',
};
const expectedValidationRules = [
  'all-count-length-products-and-offset-additions-use-checked-wide-arithmetic',
  'field-table-length-equals-directory-item-count-times-24',
  'field-table-item-count-equals-header-and-footer-field-count',
  'name-record-table-and-name-byte-suffix-exactly-fill-name-pool',
  'name-records-are-strictly-sorted-distinct-valid-canonical-utf8-names',
  'every-name-record-is-referenced-and-every-field-name-tuple-matches-its-record',
  'each-object-field-id-span-is-strictly-increasing-without-duplicates',
  'each-object-presentation-ordinal-set-is-exactly-zero-through-item-count-minus-one',
  'array-entry-spans-are-dense-contiguous-and-completely-cover-the-array-entry-suffix',
  'container-descriptor-prefix-and-array-entry-suffix-exactly-fill-container-tables',
  'container-zero-is-the-only-root-and-is-an-object-at-depth-one',
  'every-nonroot-container-has-one-matching-reference-parent-and-depth',
  'container-ids-and-physical-descriptor-order-follow-the-canonical-breadth-first-assignment',
  'recursive-field-counts-match-bottom-up-and-root-matches-document-field-count',
  'noncontainer-reference-count-equals-value-area-directory-item-count',
  'noncontainer-payloads-and-only-minimum-zero-padding-exactly-fill-value-area',
  'nonzero-payload-ranges-never-overlap-alias-or-leave-gaps',
  'zero-length-payloads-use-the-current-canonical-cursor-and-own-no-byte-range',
  'container-references-target-the-exact-matching-32-byte-descriptor',
  'base-profile-flags-and-reserved-fields-are-zero',
  'missing-has-no-record-and-null-has-a-tagged-zero-length-record',
  'normal-root-document-contains-exactly-one-valid-protected-_id-field',
  'complete-structure-payload-semantics-limits-checksum-and-content-hash-pass-before-exposure',
];
const expectedCanonicalization = [
  'validate-root-object-tree-names-types-and-limits-before-byte-allocation',
  'sort-distinct-exact-field-name-bytes-and-assign-dense-field-ids',
  'assign-container-ids-by-root-first-breadth-first-canonical-child-scan',
  'emit-object-field-records-by-container-id-and-strict-field-id-order',
  'emit-name-records-then-exact-name-bytes-in-field-id-order',
  'emit-each-noncontainer-payload-occurrence-in-container-child-scan-order-with-minimal-zero-alignment-padding',
  'emit-container-descriptors-by-id-then-array-entries-by-array-container-id-and-index',
  'validate-exact-section-coverage-tree-reachability-recursive-counts-and-root-id-semantics',
];
const expectedLimits = {
  canonical_document_bytes: 16_777_216,
  container_depth: 100,
  object_fields: 10_000,
  document_fields: 100_000,
  field_name_bytes: 1024,
  field_name_scalars: 256,
  array_elements: 1_000_000,
  checked_arithmetic_minimum_bits: 64,
};
const expectedExampleSummaries = [
  {
    id: 'empty-root-structure',
    semantic_status: 'reject-normal-document-missing-_id',
    logical_presentation: '{}',
    directory: {
      field_table: { offset: 192, length: 0, item_count: 0 },
      name_pool: { offset: 192, length: 0, item_count: 0 },
      value_area: { offset: 192, length: 0, item_count: 0 },
      container_tables: { offset: 192, length: 32, item_count: 1 },
    },
    footer_offset: 224,
    total_length: 288,
    hashes: [
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      '04ed820653f5060d93ce58fbddf75a7d0687352540ddfa0f1b4252f582c04603',
    ],
  },
  {
    id: 'root-scalars-presentation',
    semantic_status: 'structurally-and-logically-valid-before-hash-profile',
    logical_presentation:
      '{s:string(""),_id:uuid(00000000-0000-0000-0000-000000000000),n:null}',
    directory: {
      field_table: { offset: 192, length: 72, item_count: 3 },
      name_pool: { offset: 264, length: 29, item_count: 3 },
      value_area: { offset: 296, length: 16, item_count: 3 },
      container_tables: { offset: 312, length: 32, item_count: 1 },
    },
    footer_offset: 344,
    total_length: 408,
    hashes: [
      'cf0283d3fa359ef6cba584d0e61e9d0629215bd9a27c61349a12b7770ce06f1a',
      '2f2f4e95554755171921eeb151eb82109fea3d763271984449728b4a3422c7e1',
      '374708fff7719dd5979ec875d56cd2286f6d3cf7ec317a3b25632aab28ec37bb',
      '64b55edcf8ecb4b67bd317eb608225fbb6cee4e19a18be3d7ba00df3a8ded55d',
    ],
  },
  {
    id: 'internal-payload-alignment',
    semantic_status: 'structurally-and-logically-valid-before-hash-profile',
    logical_presentation:
      '{b:int64(1),_id:uuid(00000000-0000-0000-0000-000000000000),a:true}',
    directory: {
      field_table: { offset: 192, length: 72, item_count: 3 },
      name_pool: { offset: 264, length: 29, item_count: 3 },
      value_area: { offset: 296, length: 32, item_count: 3 },
      container_tables: { offset: 328, length: 32, item_count: 1 },
    },
    footer_offset: 360,
    total_length: 424,
    hashes: [
      '47aa57834b0146ba74685dc265418823dc958b267573038eed65969cd0b224ac',
      'e6dd2079e6f70ed316231affe6041b82510c6f50382e7557e029a69527d287c3',
      'b64c0d4ec2af5aba75d0e38754bd4da29669e6bd54220441f3710964fdb4ece3',
      '64b55edcf8ecb4b67bd317eb608225fbb6cee4e19a18be3d7ba00df3a8ded55d',
    ],
  },
  {
    id: 'nested-object-array',
    semantic_status: 'structurally-and-logically-valid-before-hash-profile',
    logical_presentation:
      '{z:[null,{a:true}],_id:objectId(000102030405060708090a0b),a:{}}',
    directory: {
      field_table: { offset: 192, length: 96, item_count: 4 },
      name_pool: { offset: 288, length: 29, item_count: 3 },
      value_area: { offset: 320, length: 13, item_count: 3 },
      container_tables: { offset: 336, length: 152, item_count: 4 },
    },
    footer_offset: 488,
    total_length: 552,
    hashes: [
      '717295aa06645e37a6433044719acf3a7f3904fa3e25ea5142541c20526a7a6a',
      '6ab0c5fd426ebb12f5c53204e08116dd04bf0d50299983818d860286910ad899',
      'cc04e327ae71750cb7857c08f6a45850f4886b2b2f4718e0ab9db8fc5e30dc95',
      '90fcb4451f2cefc99555f8e76a776359ec542f8501d3e22cc87bd00eb534dbc2',
    ],
  },
];
const expectedHeadings = [
  '## Normative status and notation',
  '## Base-profile overview',
  '## Canonical identity and ordering model',
  '## Document-local name IDs',
  '## `FieldEntry` — 24 bytes',
  '## `NameRecord` — 8 bytes',
  '## `ArrayEntry` — 12 bytes',
  '## `ContainerDescriptor` — 32 bytes',
  '## Canonical container IDs and ownership',
  '## Value-reference union',
  '### Noncontainer values',
  '### Container values',
  '### Missing and null',
  '## Canonical value-area packing',
  '## Complete canonical construction order',
  '## Root object and `_id`',
  '## Structural worked vectors',
  '### Empty root structure',
  '### Presentation-preserving scalar root',
  '### Internal payload alignment',
  '### Nested object and array',
  '## Validation order and fail-closed behavior',
  '## Required rejection classes',
  '## Lookup and access consequences',
  '## Version, migration, and rollback',
  '## Subordinate ownership',
  '## Required later fixtures',
  '## References',
];

const u16 = (bytes, offset) => bytes.readUInt16LE(offset);
const u32 = (bytes, offset) => bytes.readUInt32LE(offset);

const validateExample = (example, registry, payloadRegistry, tagRegistry) => {
  const sectionNames = ['field_table', 'name_pool', 'value_area', 'container_tables'];
  const buffers = Object.fromEntries(
    sectionNames.map((name) => [name, Buffer.from(example[`${name}_hex`], 'hex')]),
  );
  let outerCursor = 192;
  for (const name of sectionNames) {
    outerCursor = align(outerCursor, 8);
    assert(example.directory[name].offset === outerCursor, `${example.id}: ${name} offset mismatch`);
    assert(
      buffers[name].length === example.directory[name].length,
      `${example.id}: ${name} byte length mismatch`,
    );
    outerCursor += buffers[name].length;
  }
  assert(example.footer_offset === align(outerCursor, 8), `${example.id}: footer offset mismatch`);
  assert(example.total_length === example.footer_offset + 64, `${example.id}: total length mismatch`);

  const fieldBytes = buffers.field_table;
  const nameBytes = buffers.name_pool;
  const valueBytes = buffers.value_area;
  const containerBytes = buffers.container_tables;
  assert(
    fieldBytes.length === example.directory.field_table.item_count * 24,
    `${example.id}: field table equation mismatch`,
  );

  const names = [];
  const nameCount = example.directory.name_pool.item_count;
  let nameCursor = example.directory.name_pool.offset + nameCount * 8;
  for (let index = 0; index < nameCount; index += 1) {
    const recordOffset = index * 8;
    const nameOffset = u32(nameBytes, recordOffset);
    const nameLength = u16(nameBytes, recordOffset + 4);
    const scalarCount = u16(nameBytes, recordOffset + 6);
    assert(nameOffset === nameCursor, `${example.id}: name ${index} cursor mismatch`);
    assert(nameLength >= 1 && nameLength <= 1024, `${example.id}: name length limit`);
    assert(scalarCount >= 1 && scalarCount <= 256, `${example.id}: scalar count limit`);
    const localOffset = nameOffset - example.directory.name_pool.offset;
    const raw = nameBytes.subarray(localOffset, localOffset + nameLength);
    const textValue = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    assert([...textValue].length === scalarCount, `${example.id}: scalar count mismatch`);
    assert(
      !/[\u0000-\u001f\u007f.]/u.test(textValue) && !textValue.startsWith('$'),
      `${example.id}: field-name grammar mismatch`,
    );
    if (index > 0) {
      assert(Buffer.compare(names[index - 1].raw, raw) < 0, `${example.id}: name order mismatch`);
    }
    names.push({ offset: nameOffset, length: nameLength, raw: Buffer.from(raw), text: textValue });
    nameCursor += nameLength;
  }
  assert(
    nameCursor === example.directory.name_pool.offset + nameBytes.length,
    `${example.id}: name suffix coverage mismatch`,
  );

  const containerCount = example.directory.container_tables.item_count;
  assert(containerCount >= 1, `${example.id}: missing root descriptor`);
  assert(containerBytes.length >= containerCount * 32, `${example.id}: descriptor prefix truncated`);
  const descriptors = [];
  for (let index = 0; index < containerCount; index += 1) {
    const offset = index * 32;
    const descriptor = {
      id: u32(containerBytes, offset),
      tag: containerBytes[offset + 4],
      flags: containerBytes[offset + 5],
      depth: u16(containerBytes, offset + 6),
      itemOffset: u32(containerBytes, offset + 8),
      itemCount: u32(containerBytes, offset + 12),
      recursiveFieldCount: u32(containerBytes, offset + 16),
      parentId: u32(containerBytes, offset + 20),
      parentSlot: u32(containerBytes, offset + 24),
      reserved: u32(containerBytes, offset + 28),
      references: [],
      children: [],
    };
    assert(descriptor.id === index, `${example.id}: descriptor ID mismatch`);
    assert(descriptor.tag === 9 || descriptor.tag === 10, `${example.id}: descriptor tag mismatch`);
    assert(descriptor.flags === 0 && descriptor.reserved === 0, `${example.id}: descriptor reserved`);
    assert(descriptor.depth >= 1 && descriptor.depth <= 100, `${example.id}: descriptor depth`);
    descriptors.push(descriptor);
  }
  same(
    [
      descriptors[0].tag,
      descriptors[0].depth,
      descriptors[0].parentId,
      descriptors[0].parentSlot,
    ],
    [9, 1, 4_294_967_295, 4_294_967_295],
    `${example.id}: root descriptor mismatch`,
  );

  const assignedTags = new Set(tagRegistry.tags.map(({ tag }) => tag));
  const payloadByTag = new Map(payloadRegistry.payloads.map((payload) => [payload.tag, payload]));
  const usedNames = new Set();
  let fieldCursor = example.directory.field_table.offset;
  let arrayCursor = example.directory.container_tables.offset + containerCount * 32;
  for (const descriptor of descriptors) {
    if (descriptor.tag === 9) {
      assert(descriptor.itemOffset === fieldCursor, `${example.id}: object span cursor mismatch`);
      assert(descriptor.itemCount <= 10_000, `${example.id}: object field limit`);
      const ordinals = [];
      let priorId = -1;
      for (let slot = 0; slot < descriptor.itemCount; slot += 1) {
        const offset = fieldCursor - example.directory.field_table.offset + slot * 24;
        const fieldId = u32(fieldBytes, offset);
        const nameOffset = u32(fieldBytes, offset + 4);
        const nameLength = u16(fieldBytes, offset + 8);
        const tag = fieldBytes[offset + 10];
        const flags = fieldBytes[offset + 11];
        const valueOffset = u32(fieldBytes, offset + 12);
        const valueLength = u32(fieldBytes, offset + 16);
        const presentationOrdinal = u32(fieldBytes, offset + 20);
        assert(fieldId < names.length && fieldId > priorId, `${example.id}: object field order`);
        priorId = fieldId;
        assert(
          nameOffset === names[fieldId].offset && nameLength === names[fieldId].length,
          `${example.id}: field/name tuple mismatch`,
        );
        assert(flags === 0, `${example.id}: field flags mismatch`);
        assert(presentationOrdinal < descriptor.itemCount, `${example.id}: ordinal range mismatch`);
        assert(assignedTags.has(tag) && tag !== 0, `${example.id}: field tag mismatch`);
        ordinals.push(presentationOrdinal);
        usedNames.add(fieldId);
        descriptor.references.push({
          tag,
          flags,
          valueOffset,
          valueLength,
          slot,
          fieldId,
        });
      }
      same(
        [...ordinals].sort((left, right) => left - right),
        Array.from({ length: descriptor.itemCount }, (_, index) => index),
        `${example.id}: presentation permutation mismatch`,
      );
      fieldCursor += descriptor.itemCount * 24;
    } else {
      assert(descriptor.itemOffset === arrayCursor, `${example.id}: array span cursor mismatch`);
      assert(descriptor.itemCount <= 1_000_000, `${example.id}: array element limit`);
      for (let slot = 0; slot < descriptor.itemCount; slot += 1) {
        const offset = arrayCursor - example.directory.container_tables.offset + slot * 12;
        const tag = containerBytes[offset];
        const flags = containerBytes[offset + 1];
        assert(flags === 0 && u16(containerBytes, offset + 2) === 0, `${example.id}: array reserved`);
        assert(assignedTags.has(tag) && tag !== 0, `${example.id}: array tag mismatch`);
        descriptor.references.push({
          tag,
          flags,
          valueOffset: u32(containerBytes, offset + 4),
          valueLength: u32(containerBytes, offset + 8),
          slot,
        });
      }
      arrayCursor += descriptor.itemCount * 12;
    }
  }
  assert(
    fieldCursor === example.directory.field_table.offset + fieldBytes.length,
    `${example.id}: field span coverage mismatch`,
  );
  assert(
    arrayCursor === example.directory.container_tables.offset + containerBytes.length,
    `${example.id}: array suffix coverage mismatch`,
  );
  assert(usedNames.size === names.length, `${example.id}: unused name record`);

  let nextChildId = 1;
  let valueCursor = example.directory.value_area.offset;
  let valueCount = 0;
  for (const descriptor of descriptors) {
    for (const reference of descriptor.references) {
      if (reference.tag === 9 || reference.tag === 10) {
        assert(reference.valueLength === 32, `${example.id}: container reference length`);
        const delta = reference.valueOffset - example.directory.container_tables.offset;
        assert(
          delta >= 0 && delta < containerCount * 32 && delta % 32 === 0,
          `${example.id}: container reference target`,
        );
        const childId = delta / 32;
        assert(childId === nextChildId, `${example.id}: noncanonical breadth-first ID`);
        nextChildId += 1;
        const child = descriptors[childId];
        assert(child.tag === reference.tag, `${example.id}: child tag mismatch`);
        assert(
          child.parentId === descriptor.id &&
            child.parentSlot === reference.slot &&
            child.depth === descriptor.depth + 1,
          `${example.id}: child parent/depth mismatch`,
        );
        descriptor.children.push(childId);
        continue;
      }

      const payload = payloadByTag.get(reference.tag);
      assert(payload, `${example.id}: noncontainer payload missing from registry`);
      const aligned = align(valueCursor, payload.alignment_bytes);
      const paddingStart = valueCursor - example.directory.value_area.offset;
      const paddingEnd = aligned - example.directory.value_area.offset;
      assert(
        valueBytes.subarray(paddingStart, paddingEnd).every((byte) => byte === 0),
        `${example.id}: nonzero/minimal alignment padding`,
      );
      assert(reference.valueOffset === aligned, `${example.id}: payload offset mismatch`);
      const localOffset = aligned - example.directory.value_area.offset;
      assert(
        localOffset >= 0 && localOffset + reference.valueLength <= valueBytes.length,
        `${example.id}: payload range mismatch`,
      );
      const payloadBytes = valueBytes.subarray(localOffset, localOffset + reference.valueLength);
      if (payload.length.kind === 'fixed') {
        assert(reference.valueLength === payload.length.bytes, `${example.id}: fixed payload length`);
      } else if (payload.length.kind === 'containing-value-length') {
        assert(
          reference.valueLength >= payload.length.minimum_bytes,
          `${example.id}: variable payload minimum`,
        );
      } else {
        assert(false, `${example.id}: unexpected dimensioned structural payload`);
      }
      if (reference.tag === 2) {
        assert(
          payloadBytes.length === 1 && (payloadBytes[0] === 0 || payloadBytes[0] === 1),
          `${example.id}: Boolean payload mismatch`,
        );
      }
      if (reference.tag === 7) {
        new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes);
      }
      valueCursor = aligned + reference.valueLength;
      valueCount += 1;
    }
  }
  assert(nextChildId === containerCount, `${example.id}: unreachable/aliased container`);
  assert(
    valueCursor === example.directory.value_area.offset + valueBytes.length,
    `${example.id}: value-area coverage mismatch`,
  );
  assert(
    valueCount === example.directory.value_area.item_count,
    `${example.id}: value occurrence count mismatch`,
  );

  for (let index = descriptors.length - 1; index >= 0; index -= 1) {
    const descriptor = descriptors[index];
    const expected =
      (descriptor.tag === 9 ? descriptor.itemCount : 0) +
      descriptor.children.reduce(
        (count, childId) => count + descriptors[childId].recursiveFieldCount,
        0,
      );
    assert(
      descriptor.recursiveFieldCount === expected,
      `${example.id}: recursive field count mismatch`,
    );
  }
  assert(
    descriptors[0].recursiveFieldCount === example.directory.field_table.item_count,
    `${example.id}: root field count mismatch`,
  );
  const rootIdReference = descriptors[0].references.find(
    ({ fieldId }) => fieldId !== undefined && names[fieldId].text === '_id',
  );
  if (example.semantic_status.startsWith('reject')) {
    assert(!rootIdReference, `${example.id}: rejection status does not match root _id`);
  } else {
    assert(
      rootIdReference && (rootIdReference.tag === 13 || rootIdReference.tag === 14),
      `${example.id}: required root _id mismatch`,
    );
  }
};

const validateContract = (candidate) => {
  const registry = JSON.parse(candidate.registrySource);
  assert(
    candidate.registrySource.endsWith('\n') && candidate.registrySource.includes('\n  "schema":'),
    'machine registry formatting mismatch',
  );
  assert(registry.schema === 'helix.hdoc-record-layout/1', 'registry schema mismatch');
  same(registry.format, expectedFormat, 'format maturity/ownership mismatch');
  same(registry.constants, expectedConstants, 'record constants mismatch');
  same(sectionTuples(registry.sections), expectedSections, 'section grammar mismatch');
  same(Object.keys(registry.record_layouts), Object.keys(expectedLayouts), 'record layout inventory mismatch');
  for (const [name, expected] of Object.entries(expectedLayouts)) {
    same(layoutTuple(registry.record_layouts[name]), expected, `${name} layout mismatch`);
    same(
      layoutMetadata(registry.record_layouts[name]),
      expectedLayoutMetadata[name],
      `${name} layout mismatch`,
    );
    const occupied = new Set();
    for (const field of registry.record_layouts[name].fields) {
      for (let offset = field.offset; offset < field.offset + field.bytes; offset += 1) {
        assert(!occupied.has(offset), `${name}: overlapping field bytes`);
        occupied.add(offset);
      }
    }
    assert(occupied.size === registry.record_layouts[name].bytes, `${name}: incomplete byte coverage`);
  }
  same(containerKindTuples(registry.container_kinds), expectedContainerKinds, 'container kinds mismatch');
  same(registry.name_pool, expectedNamePool, 'name-pool grammar mismatch');
  same(registry.container_tree, expectedContainerTree, 'container-tree grammar mismatch');
  same(
    registry.value_references,
    {
      noncontainer: {
        target_section: 'value_area',
        value_length: 'exact-P03-004-payload-length',
        value_offset: 'absolute-canonical-packed-payload-cursor',
        occurrence_order: 'container-id-then-object-canonical-field-or-array-index',
        deduplication: false,
        nonzero_aliasing: false,
        zero_length_rule: 'offset-is-current-aligned-cursor-and-equal-offsets-are-permitted',
        alignment_rule:
          'align-current-cursor-to-P03-004-payload-alignment-with-minimum-zero-padding',
      },
      container: {
        target_section: 'container_tables-descriptor-prefix',
        value_offset: 'container_tables.section_offset + child_container_id * 32',
        value_length: 32,
        tag_must_match_descriptor: true,
        payload_bytes_in_value_area: false,
      },
      missing: { field_entry: false, array_entry: false, stored_tag: false },
    },
    'value-reference grammar mismatch',
  );
  same(
    registry.canonicalization.map(({ step, rule }) => [step, rule]),
    expectedCanonicalization.map((rule, index) => [index + 1, rule]),
    'canonical construction order mismatch',
  );
  same(registry.validation_rules, expectedValidationRules, 'validation rule inventory mismatch');
  same(registry.limits, expectedLimits, 'portable limit reconciliation mismatch');
  assert(registry.structural_examples.length === expectedExampleSummaries.length, 'example inventory mismatch');

  const payloadRegistry = JSON.parse(candidate.payloadRegistrySource);
  const tagRegistry = JSON.parse(candidate.tagRegistrySource);
  const envelopeRegistry = JSON.parse(candidate.envelopeRegistrySource);
  assert(
    envelopeRegistry.format.minimum_base_structural_root_bytes_before_hash_profile === 288 &&
      envelopeRegistry.format.record_registry === 'docs/formats/hdoc-v1-records.json',
    'envelope/record registry reconciliation mismatch',
  );
  assert(
    payloadRegistry.format.complete_container_payload_format === true &&
      payloadRegistry.format.containing_record_registry === 'docs/formats/hdoc-v1-records.json',
    'payload/record registry reconciliation mismatch',
  );
  assert(
    tagRegistry.format.complete_payload_format === true &&
      tagRegistry.format.payload_completion_owner === 'P03-005' &&
      tagRegistry.format.record_registry === 'docs/formats/hdoc-v1-records.json',
    'tag/record registry reconciliation mismatch',
  );
  same(
    tagRegistry.tags
      .filter(({ tag }) => tag === 9 || tag === 10)
      .map(({ tag, tag_name: tagName, payload_owner: owner }) => [tag, tagName, owner]),
    [
      [9, 'object', 'P03-005'],
      [10, 'array', 'P03-005'],
    ],
    'container-tag ownership mismatch',
  );

  for (let index = 0; index < registry.structural_examples.length; index += 1) {
    const example = registry.structural_examples[index];
    const expected = expectedExampleSummaries[index];
    same(
      {
        id: example.id,
        semantic_status: example.semantic_status,
        logical_presentation: example.logical_presentation,
        directory: example.directory,
        footer_offset: example.footer_offset,
        total_length: example.total_length,
      },
      {
        id: expected.id,
        semantic_status: expected.semantic_status,
        logical_presentation: expected.logical_presentation,
        directory: expected.directory,
        footer_offset: expected.footer_offset,
        total_length: expected.total_length,
      },
      `structural example ${index} metadata mismatch`,
    );
    same(
      ['field_table', 'name_pool', 'value_area', 'container_tables'].map((name) =>
        sha256(Buffer.from(example[`${name}_hex`], 'hex')),
      ),
      expected.hashes,
      `structural example ${index} bytes mismatch`,
    );
    validateExample(example, registry, payloadRegistry, tagRegistry);
  }

  same(
    registry.deferrals.map(({ owner, scope }) => [owner, scope]),
    [
      ['P03-006', 'crc-replay-content-hash-profile-domain-framing-and-complete-envelope-vectors'],
      ['P03-007', 'compressed-section-block-grammar-codecs-and-profiles'],
      ['P03-013', 'feature-gated-collection-path-dictionary-ids-and-name-elision-profile'],
      ['P03-015', 'extension-and-reader-writer-feature-migration-matrix'],
      ['P03-016', 'immutable-complete-hdoc-golden-and-malformed-fixtures'],
    ],
    'deferral inventory mismatch',
  );

  const headings = candidate.recordDocument.split('\n').filter((line) => /^#{2,3} /.test(line));
  same(headings, expectedHeadings, 'record document heading inventory mismatch');
  for (const marker of [
    'field_id(name) = zero-based NameRecord index',
    'The physical field span for each object is in canonical name order.',
    'Arrays are finite dense ordered sequences.',
    'The logical value is a tree, never an on-disk graph.',
    'A zero-byte payload still performs its alignment step',
    'normal HDoc row document nevertheless must contain exactly one root `_id`',
    'Footer\nhash profile zero therefore remains invalid.',
    'not a collection path-dictionary ID',
    'Any shorter, longer, or nonzero internal pad',
  ]) {
    assert(candidate.recordDocument.includes(marker), `record semantic marker absent: ${marker}`);
  }

  const recordPath = 'docs/formats/hdoc-v1-records.md';
  const registryPath = 'docs/formats/hdoc-v1-records.json';
  assert(candidate.specifications.includes(recordPath), 'specification record backlink absent');
  assert(candidate.specifications.includes(registryPath), 'specification machine-record backlink absent');
  assert(candidate.specifications.includes('presentation_ordinal: u32'), 'specification field layout mismatch');
  assert(candidate.study.includes(recordPath), 'study record backlink absent');
  assert(candidate.study.includes('32-byte uniquely owned breadth-first container descriptors'), 'study record summary absent');
  assert(candidate.formatIndex.includes('[HDoc field/name/container records](hdoc-v1-records.md)'), 'format index record entry absent');
  assert(candidate.formatIndex.includes('[Record registry](hdoc-v1-records.json)'), 'format index machine entry absent');
  assert(candidate.docsIndex.includes('[HDoc 1.0 field/name/container records](formats/hdoc-v1-records.md)'), 'documentation index record entry absent');
  assert(candidate.envelopeDocument.includes('[HDoc 1.0 record registry](hdoc-v1-records.md)'), 'parent envelope record backlink absent');
  assert(candidate.payloadDocument.includes('[HDoc 1.0 record registry](hdoc-v1-records.md)'), 'payload document record backlink absent');
  assert(candidate.tagDocument.includes('[HDoc 1.0 record registry](hdoc-v1-records.md)'), 'type-tag document record backlink absent');
  assert(candidate.adr.includes('- [x] Freeze table/offset/section/padding rules under `P03-005`.'), 'ADR validation state mismatch');
  assert(candidate.adr.includes('../formats/hdoc-v1-records.md'), 'ADR record reference absent');
  assert(
    candidate.plan.includes(
      '- [ ] **P03-005** Define field-table entries, name storage, nested object/array tables, value offsets, and length encodings.',
    ),
    'source plan state/task text mismatch',
  );

  const specificationBytes = Buffer.from(candidate.specifications, 'utf8');
  const matrix = JSON.parse(candidate.matrix);
  same(
    matrix.inputs.specifications,
    { path: 'Specifications.md', bytes: specificationBytes.length, sha256: sha256(specificationBytes) },
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
};

validateContract(snapshot);

const withRegistryMutation = (candidate, mutate) => {
  const value = JSON.parse(candidate.registrySource);
  mutate(value);
  candidate.registrySource = jsonBytes(value).toString('utf8');
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
  assert(
    rejection.message.includes(expectedReason),
    `${label}: wrong rejection: ${rejection.message}`,
  );
};

const canaries = [
  ['registry formatting', (c) => { c.registrySource = JSON.stringify(JSON.parse(c.registrySource)); }, 'machine registry formatting mismatch'],
  ['schema', (c) => withRegistryMutation(c, (v) => { v.schema = 'helix.hdoc-record-layout/2'; }), 'registry schema mismatch'],
  ['profile', (c) => withRegistryMutation(c, (v) => { v.format.profile = 'host-native'; }), 'format maturity/ownership mismatch'],
  ['completion owner', (c) => withRegistryMutation(c, (v) => { v.format.remaining_completion_owners.pop(); }), 'format maturity/ownership mismatch'],
  ['field stride', (c) => withRegistryMutation(c, (v) => { v.constants.field_entry_bytes = 32; }), 'record constants mismatch'],
  ['name stride', (c) => withRegistryMutation(c, (v) => { v.constants.name_record_bytes = 12; }), 'record constants mismatch'],
  ['array stride', (c) => withRegistryMutation(c, (v) => { v.constants.array_entry_bytes = 16; }), 'record constants mismatch'],
  ['descriptor stride', (c) => withRegistryMutation(c, (v) => { v.constants.container_descriptor_bytes = 24; }), 'record constants mismatch'],
  ['root ID', (c) => withRegistryMutation(c, (v) => { v.constants.root_container_id = 1; }), 'record constants mismatch'],
  ['root sentinel', (c) => withRegistryMutation(c, (v) => { v.constants.root_parent_sentinel = 0; }), 'record constants mismatch'],
  ['field section equation', (c) => withRegistryMutation(c, (v) => { v.sections[0].length_equation = 'item_count * 32'; }), 'section grammar mismatch'],
  ['name count meaning', (c) => withRegistryMutation(c, (v) => { v.sections[1].item_count_meaning = 'field-count'; }), 'section grammar mismatch'],
  ['value count meaning', (c) => withRegistryMutation(c, (v) => { v.sections[2].item_count_meaning = 'nonempty-payload-count'; }), 'section grammar mismatch'],
  ['container minimum', (c) => withRegistryMutation(c, (v) => { v.sections[3].minimum_item_count = 0; }), 'section grammar mismatch'],
  ['field offset', (c) => withRegistryMutation(c, (v) => { v.record_layouts.field_entry.fields[1].offset = 5; }), 'field_entry layout mismatch'],
  ['field flags', (c) => withRegistryMutation(c, (v) => { v.record_layouts.field_entry.fields[4].constant = 1; }), 'field_entry layout mismatch'],
  ['name scalar maximum', (c) => withRegistryMutation(c, (v) => { v.record_layouts.name_record.fields[2].maximum = 255; }), 'name_record layout mismatch'],
  ['array reserved', (c) => withRegistryMutation(c, (v) => { v.record_layouts.array_entry.fields[2].constant = 1; }), 'array_entry layout mismatch'],
  ['descriptor tag domain', (c) => withRegistryMutation(c, (v) => { v.record_layouts.container_descriptor.fields[1].allowed.push(11); }), 'container_descriptor layout mismatch'],
  ['descriptor depth', (c) => withRegistryMutation(c, (v) => { v.record_layouts.container_descriptor.fields[3].maximum = 101; }), 'container_descriptor layout mismatch'],
  ['object order', (c) => withRegistryMutation(c, (v) => { v.container_kinds[0].item_order = 'presentation-order'; }), 'container kinds mismatch'],
  ['name deduplication', (c) => withRegistryMutation(c, (v) => { v.name_pool.deduplication_scope = 'per-object'; }), 'name-pool grammar mismatch'],
  ['path ID conflation', (c) => withRegistryMutation(c, (v) => { v.name_pool.collection_path_dictionary_id = 'same-namespace'; }), 'name-pool grammar mismatch'],
  ['tree ID assignment', (c) => withRegistryMutation(c, (v) => { v.container_tree.id_assignment = 'depth-first'; }), 'container-tree grammar mismatch'],
  ['tree ownership', (c) => withRegistryMutation(c, (v) => { v.container_tree.ownership = 'shared-graph'; }), 'container-tree grammar mismatch'],
  ['value occurrence order', (c) => withRegistryMutation(c, (v) => { v.value_references.noncontainer.occurrence_order = 'host-order'; }), 'value-reference grammar mismatch'],
  ['zero length', (c) => withRegistryMutation(c, (v) => { v.value_references.noncontainer.zero_length_rule = 'offset-zero'; }), 'value-reference grammar mismatch'],
  ['container length', (c) => withRegistryMutation(c, (v) => { v.value_references.container.value_length = 24; }), 'value-reference grammar mismatch'],
  ['Missing materialization', (c) => withRegistryMutation(c, (v) => { v.value_references.missing.stored_tag = true; }), 'value-reference grammar mismatch'],
  ['construction order', (c) => withRegistryMutation(c, (v) => { v.canonicalization[2].rule = 'assign-depth-first'; }), 'canonical construction order mismatch'],
  ['validation inventory', (c) => withRegistryMutation(c, (v) => { v.validation_rules.pop(); }), 'validation rule inventory mismatch'],
  ['document limit', (c) => withRegistryMutation(c, (v) => { v.limits.canonical_document_bytes += 1; }), 'portable limit reconciliation mismatch'],
  ['array limit', (c) => withRegistryMutation(c, (v) => { v.limits.array_elements -= 1; }), 'portable limit reconciliation mismatch'],
  ['example inventory', (c) => withRegistryMutation(c, (v) => { v.structural_examples.pop(); }), 'example inventory mismatch'],
  ['empty descriptor bytes', (c) => withRegistryMutation(c, (v) => { v.structural_examples[0].container_tables_hex = `01${v.structural_examples[0].container_tables_hex.slice(2)}`; }), 'structural example 0 bytes mismatch'],
  ['scalar field bytes', (c) => withRegistryMutation(c, (v) => { v.structural_examples[1].field_table_hex = `01${v.structural_examples[1].field_table_hex.slice(2)}`; }), 'structural example 1 bytes mismatch'],
  ['scalar status', (c) => withRegistryMutation(c, (v) => { v.structural_examples[1].semantic_status = 'reject'; }), 'structural example 1 metadata mismatch'],
  ['alignment directory', (c) => withRegistryMutation(c, (v) => { v.structural_examples[2].directory.value_area.offset = 304; }), 'structural example 2 metadata mismatch'],
  ['alignment padding byte', (c) => withRegistryMutation(c, (v) => { const e = v.structural_examples[2]; e.value_area_hex = `${e.value_area_hex.slice(0, 34)}01${e.value_area_hex.slice(36)}`; }), 'structural example 2 bytes mismatch'],
  ['nested name bytes', (c) => withRegistryMutation(c, (v) => { const e = v.structural_examples[3]; e.name_pool_hex = `${e.name_pool_hex.slice(0, -2)}62`; }), 'structural example 3 bytes mismatch'],
  ['nested container bytes', (c) => withRegistryMutation(c, (v) => { const e = v.structural_examples[3]; e.container_tables_hex = `${e.container_tables_hex.slice(0, -2)}01`; }), 'structural example 3 bytes mismatch'],
  ['nested total length', (c) => withRegistryMutation(c, (v) => { v.structural_examples[3].total_length += 8; }), 'structural example 3 metadata mismatch'],
  ['heading inventory', (c) => { c.recordDocument = replaceOnce(c.recordDocument, '## Document-local name IDs', '## Field IDs'); }, 'record document heading inventory mismatch'],
  ['field-ID prose', (c) => { c.recordDocument = replaceOnce(c.recordDocument, 'field_id(name) = zero-based NameRecord index', 'field_id(name) = collection path ID'); }, 'record semantic marker absent'],
  ['presentation prose', (c) => { c.recordDocument = replaceOnce(c.recordDocument, 'The physical field span for each object is in canonical name order.', 'The physical field span follows host order.'); }, 'record semantic marker absent'],
  ['array prose', (c) => { c.recordDocument = replaceOnce(c.recordDocument, 'Arrays are finite dense ordered sequences.', 'Arrays may contain sparse holes.'); }, 'record semantic marker absent'],
  ['tree prose', (c) => { c.recordDocument = replaceOnce(c.recordDocument, 'The logical value is a tree, never an on-disk graph.', 'The logical value may share descriptors.'); }, 'record semantic marker absent'],
  ['zero cursor prose', (c) => { c.recordDocument = replaceOnce(c.recordDocument, 'A zero-byte payload still performs its alignment step', 'A zero-byte payload uses offset zero'); }, 'record semantic marker absent'],
  ['specification link', (c) => { c.specifications = replaceOnce(c.specifications, 'docs/formats/hdoc-v1-records.json', 'docs/formats/missing.json'); }, 'specification machine-record backlink absent'],
  ['specification layout', (c) => { c.specifications = replaceOnce(c.specifications, 'presentation_ordinal: u32', 'presentation_ordinal: u16'); }, 'specification field layout mismatch'],
  ['study link', (c) => { c.study = replaceOnce(c.study, 'docs/formats/hdoc-v1-records.md', 'docs/formats/missing.md'); }, 'study record backlink absent'],
  ['format index', (c) => { c.formatIndex = replaceOnce(c.formatIndex, '[HDoc field/name/container records](hdoc-v1-records.md)', 'HDoc records omitted'); }, 'format index record entry absent'],
  ['documentation index', (c) => { c.docsIndex = replaceOnce(c.docsIndex, '[HDoc 1.0 field/name/container records](formats/hdoc-v1-records.md)', 'HDoc records omitted'); }, 'documentation index record entry absent'],
  ['parent envelope link', (c) => { c.envelopeDocument = replaceOnce(c.envelopeDocument, '[HDoc 1.0 record registry](hdoc-v1-records.md)', 'HDoc record registry'); }, 'parent envelope record backlink absent'],
  ['payload link', (c) => { c.payloadDocument = replaceOnce(c.payloadDocument, '[HDoc 1.0 record registry](hdoc-v1-records.md)', 'HDoc record registry'); }, 'payload document record backlink absent'],
  ['tag link', (c) => { c.tagDocument = replaceOnce(c.tagDocument, '[HDoc 1.0 record registry](hdoc-v1-records.md)', 'HDoc record registry'); }, 'type-tag document record backlink absent'],
  ['ADR completion', (c) => { c.adr = replaceOnce(c.adr, '- [x] Freeze table/offset/section/padding rules under `P03-005`.', '- [ ] Freeze table/offset/section/padding rules under `P03-005`.'); }, 'ADR validation state mismatch'],
  ['source plan state', (c) => { c.plan = replaceOnce(c.plan, '- [ ] **P03-005**', '- [x] **P03-005**'); }, 'source plan state/task text mismatch'],
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
  snapshot.recordDocument.split('\n').length - 1 === manifest.verification.record_document_lines,
  'record document line count mismatch',
);
assert(
  expectedHeadings.length === manifest.verification.record_document_headings,
  'record heading count mismatch',
);
assert(
  snapshot.registrySource.split('\n').length - 1 === manifest.verification.registry_lines,
  'machine registry line count mismatch',
);
assert(
  Buffer.byteLength(snapshot.registrySource) === manifest.verification.registry_bytes,
  'machine registry byte count mismatch',
);

const matrixReplayPaths = [
  'Specifications.md',
  'compatibility/v1/generate-matrix.mjs',
  'compatibility/v1/matrix-v1.json',
  'docs/compatibility/v1-semantic-compatibility-matrix.md',
  ...Object.values(JSON.parse(snapshot.matrix).inputs).map(({ path: inputPath }) => inputPath),
  ...trackedFiles.filter((file) => file.startsWith('reference/semantic-oracle/')),
];
const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p03-005-'));
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
  assert(
    generatorOutput.includes('PASS semantic compatibility matrix: 263 native rows'),
    'isolated matrix replay did not pass',
  );
  assert(
    generatorOutput.includes('PASS matrix inputs: 9 hash-bound artifacts'),
    'isolated matrix input count mismatch',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact ${manifest.source_artifacts.length}-artifact P03-005 scope at ${commitArgument}`);
console.log(
  `PASS record registry: ${manifest.verification.sections} sections, ${manifest.verification.record_layouts} fixed layouts, ${manifest.verification.validation_rules} validation rules`,
);
console.log(
  `PASS structural vectors: ${manifest.verification.structural_examples}/${manifest.verification.structural_examples} parsed with exact section bytes, names, spans, values, ownership, and counts`,
);
console.log('PASS canonical edge cases: presentation permutation, empty spans, zero-length cursors, internal alignment, dense arrays, breadth-first tree');
console.log(`PASS mutation canaries: ${canaries.length}/${canaries.length} intended rejections`);
console.log(`PASS documentation: ${markdownFiles.length} Markdown files and ${localLinks} local links`);
console.log('PASS generated authority: 263-row matrix, rendered document, and fixture-generation report');
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

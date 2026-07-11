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
const gitBytes = (arguments_) =>
  execFileSync('git', arguments_, {
    cwd: repository,
    maxBuffer: 128 * 1024 * 1024,
  });
const gitText = (arguments_) => gitBytes(arguments_).toString('utf8');
const showBytes = (file, commit = manifest.commit) => gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.commit) =>
  new TextDecoder('utf-8', { fatal: true }).decode(showBytes(file, commit));

assert(commitArgument, 'usage: node evidence/phase-03/P03-003/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-003', 'evidence task mismatch');
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
  registrySource: sourceText('docs/formats/hdoc-v1-type-tags.json'),
  tagDocument: sourceText('docs/formats/hdoc-v1-type-tags.md'),
  envelopeDocument: sourceText('docs/formats/hdoc-v1.md'),
  formatIndex: sourceText('docs/formats/README.md'),
  specifications: sourceText('Specifications.md'),
  study: sourceText('Study.md'),
  docsIndex: sourceText('docs/README.md'),
  adr: sourceText('docs/adr/0012-use-bounded-little-endian-hdoc-v1.md'),
  matrix: sourceText('compatibility/v1/matrix-v1.json'),
  compatibilityDocument: sourceText('docs/compatibility/v1-semantic-compatibility-matrix.md'),
  generationReport: sourceText('fixtures/generation/report-v1.json'),
  semanticCoverage: sourceText('fixtures/semantic/coverage-v1.json'),
  plan: showText('ImplementationPlan.md'),
};

const expectedTags = [
  [1, '0x01', 'null', 'null', 'singleton', 'none', 'P03-004'],
  [2, '0x02', 'bool', 'bool', 'scalar', 'fixed', 'P03-004'],
  [3, '0x03', 'int32', 'int32', 'numeric', 'fixed', 'P03-004'],
  [4, '0x04', 'int64', 'int64', 'numeric', 'fixed', 'P03-004'],
  [5, '0x05', 'float64', 'float64', 'numeric', 'fixed', 'P03-004'],
  [6, '0x06', 'decimal128', 'decimal128', 'numeric', 'fixed', 'P03-004'],
  [7, '0x07', 'string', 'string', 'byte-sequence', 'variable', 'P03-004'],
  [8, '0x08', 'binary', 'binary', 'byte-sequence', 'variable', 'P03-004'],
  [9, '0x09', 'object', 'object', 'container', 'container-reference', 'P03-005'],
  [10, '0x0a', 'array', 'array', 'container', 'container-reference', 'P03-005'],
  [11, '0x0b', 'timestamp', 'timestamp', 'temporal', 'fixed', 'P03-004'],
  [12, '0x0c', 'date', 'date', 'temporal', 'fixed', 'P03-004'],
  [13, '0x0d', 'uuid', 'uuid', 'identifier', 'fixed-opaque', 'P03-004'],
  [14, '0x0e', 'object_id', 'objectId', 'identifier', 'fixed-opaque', 'P03-004'],
  [15, '0x0f', 'vector_f32', 'vector<f32,N>', 'vector', 'dimensioned', 'P03-004'],
  [16, '0x10', 'vector_f16', 'vector<f16,N>', 'vector', 'dimensioned', 'P03-004'],
];
const expectedRanges = [
  [0, 0, '0x00', '0x00', 'invalid-sentinel', 'reject', 'forbidden', 'none'],
  [17, 63, '0x11', '0x3f', 'future-standard-logical-types', 'reject-unassigned', 'forbidden-until-registered', 'accepted-format-change'],
  [64, 127, '0x40', '0x7f', 'registered-semantic-extensions', 'reject-unless-feature-and-registry-understood', 'forbidden-until-registered', 'P03-015-or-successor'],
  [128, 239, '0x80', '0xef', 'experimental-private', 'reject-in-supported-hdoc', 'forbidden-in-supported-hdoc', 'explicit-experimental-profile-only'],
  [240, 254, '0xf0', '0xfe', 'future-control-or-escape', 'reject', 'forbidden', 'future-major-format-only'],
  [255, 255, '0xff', '0xff', 'permanently-invalid', 'reject', 'forbidden', 'none'],
];
const expectedFixtureTags = [
  'array',
  'binary',
  'bool',
  'date',
  'decimal128',
  'float64',
  'int32',
  'int64',
  'missing',
  'null',
  'object',
  'objectId',
  'string',
  'timestamp',
  'uuid',
  'vector',
];
const expectedRules = [
  ['one-tag-per-logical-type', 'Each accepted stored logical type has exactly one HDoc 1.x tag.'],
  ['no-missing-tag', 'Missing is path-evaluation state and has no storable HDoc type tag.'],
  ['no-compact-alias-tags', 'Inline, short, compressed, dictionary, or common-value encodings do not receive alternate logical type tags.'],
  ['tag-does-not-coerce', 'A tag selects exact logical type; readers never infer or coerce a different type from payload shape.'],
  ['unknown-is-critical', 'Every unknown or unassigned value tag changes semantics and is rejected before value exposure.'],
  ['extension-requires-feature', 'A registered extension tag requires an understood required feature and stable registry assignment.'],
  ['never-reuse', 'Assigned and retired tag values are never reused for another logical meaning.'],
  ['typed-hash-includes-tag', 'The canonical typed content hash includes the stable tag and canonical payload framing.'],
  ['comparison-separate', 'Semantic comparison equality/hash may normalize across numeric types but never changes the stored HDoc tag.'],
  ['payload-owned-later', 'This registry assigns type identity only; P03-004 and P03-005 define payload and container bytes.'],
];
const expectedHeadings = [
  '## Scope and maturity boundary',
  '## Tag field contract',
  '## Governing rules',
  '## Core HDoc 1.x assignments',
  '### Stable names versus public syntax',
  '## Per-family boundaries',
  '### Null and Boolean',
  '### Numeric types',
  '### String and binary',
  '### Object and array',
  '### Temporal values',
  '### Identifiers',
  '### Vectors',
  '## Missing is deliberately untagged',
  '## Semantic fixture reconciliation',
  '## Reserved and extension ranges',
  '### Future standard logical types (`0x11`–`0x3f`)',
  '### Registered semantic extensions (`0x40`–`0x7f`)',
  '### Experimental/private (`0x80`–`0xef`)',
  '### Control/escape and invalid values (`0xf0`–`0xff`)',
  '## Extension allocation checklist',
  '## Decoder and writer behavior',
  '### Writer',
  '### Reader',
  '## Hashing, equality, and ordering',
  '## Version, migration, and rollback',
  '## Subordinate ownership',
  '## Required validation cases',
  '## References',
];

const tagTuples = (tags) =>
  tags.map(({ tag, tag_hex: tagHex, tag_name: tagName, logical_type: logicalType, family, width_class: widthClass, payload_owner: payloadOwner }) =>
    [tag, tagHex, tagName, logicalType, family, widthClass, payloadOwner],
  );
const rangeTuples = (ranges) =>
  ranges.map(({ start, end, start_hex: startHex, end_hex: endHex, class: rangeClass, read_behavior: readBehavior, write_behavior: writeBehavior, allocation_owner: allocationOwner }) =>
    [start, end, startHex, endHex, rangeClass, readBehavior, writeBehavior, allocationOwner],
  );
const ruleTuples = (rules) => rules.map(({ id, rule }) => [id, rule]);

const validateContract = (candidate) => {
  const registry = JSON.parse(candidate.registrySource);
  assert(
    candidate.registrySource === jsonBytes(registry).toString('utf8'),
    'machine registry is not canonical JSON',
  );
  assert(registry.schema === 'helix.hdoc-type-tag-registry/1', 'registry schema mismatch');
  same(
    registry.format,
    {
      name: 'HDoc',
      major_version: 1,
      minor_version: 0,
      tag_width_bits: 8,
      unknown_tag_behavior: 'reject-cap-format-unsupported',
      missing_is_storable: false,
      complete_payload_format: false,
      payload_completion_owner: 'P03-004',
    },
    'format boundary mismatch',
  );
  same(tagTuples(registry.tags), expectedTags, 'core tag registry mismatch');
  same(rangeTuples(registry.reserved_ranges), expectedRanges, 'reserved range registry mismatch');
  same(ruleTuples(registry.rules), expectedRules, 'governing rule registry mismatch');

  assert(registry.tags.length === manifest.verification.assigned_tags, 'assigned tag count mismatch');
  assert(registry.reserved_ranges.length === manifest.verification.reserved_ranges, 'reserved range count mismatch');
  assert(registry.rules.length === manifest.verification.registry_rules, 'registry rule count mismatch');
  assert(new Set(registry.tags.map(({ tag }) => tag)).size === registry.tags.length, 'duplicate numeric tag');
  assert(new Set(registry.tags.map(({ tag_name: name }) => name)).size === registry.tags.length, 'duplicate tag name');
  assert(new Set(registry.tags.map(({ logical_type: type }) => type)).size === registry.tags.length, 'duplicate logical type');
  for (const tag of registry.tags) {
    assert(Number.isInteger(tag.tag) && tag.tag > 0 && tag.tag < 256, 'assigned tag outside u8 value domain');
    assert(tag.tag_hex === `0x${tag.tag.toString(16).padStart(2, '0')}`, 'assigned tag hex mismatch');
  }
  const classified = Array(256).fill(null);
  for (const tag of registry.tags) {
    assert(classified[tag.tag] === null, `tag ${tag.tag} classified twice`);
    classified[tag.tag] = `assigned:${tag.tag_name}`;
  }
  for (const range of registry.reserved_ranges) {
    assert(Number.isInteger(range.start) && Number.isInteger(range.end), 'reserved range endpoint is not integral');
    assert(range.start >= 0 && range.end <= 255 && range.start <= range.end, 'reserved range endpoint invalid');
    assert(range.start_hex === `0x${range.start.toString(16).padStart(2, '0')}`, 'reserved range start hex mismatch');
    assert(range.end_hex === `0x${range.end.toString(16).padStart(2, '0')}`, 'reserved range end hex mismatch');
    for (let value = range.start; value <= range.end; value += 1) {
      assert(classified[value] === null, `tag ${value} classified twice`);
      classified[value] = `reserved:${range.class}`;
    }
  }
  assert(classified.every(Boolean), 'tag byte space has an unclassified value');
  assert(classified.length === manifest.verification.classified_tag_bytes, 'classified byte count mismatch');

  const fixtureMapping = registry.fixture_mapping;
  const semanticCoverage = JSON.parse(candidate.semanticCoverage);
  same(semanticCoverage.required_value_tags, expectedFixtureTags, 'semantic coverage tag authority mismatch');
  same(fixtureMapping.fixture_required_tags, semanticCoverage.required_value_tags, 'fixture tag binding mismatch');
  same(fixtureMapping.nonstorable_fixture_tags, ['missing'], 'nonstorable fixture tag mismatch');
  same(fixtureMapping.expanded_fixture_tags, { vector: ['vector<f32,N>', 'vector<f16,N>'] }, 'vector fixture expansion mismatch');
  assert(fixtureMapping.resulting_hdoc_logical_type_count === 16, 'fixture result count mismatch');
  const reconciled = semanticCoverage.required_value_tags.flatMap((tag) => {
    if (fixtureMapping.nonstorable_fixture_tags.includes(tag)) return [];
    return fixtureMapping.expanded_fixture_tags[tag] ?? [tag];
  });
  same(sorted(reconciled), sorted(registry.tags.map(({ logical_type: type }) => type)), 'fixture-to-HDoc reconciliation mismatch');
  assert(!registry.tags.some(({ logical_type: type, tag_name: name }) => type === 'missing' || name === 'missing'), 'stored Missing tag present');

  const headings = candidate.tagDocument.split('\n').filter((line) => /^#{2,3} /.test(line));
  same(headings, expectedHeadings, 'type-tag document heading inventory mismatch');
  for (const marker of [
    'Every stored value position carries exactly one unsigned 8-bit `type_tag`.',
    '`missing` is path-evaluation state, not a stored value, and has no tag.',
    '`0x00` is invalid/uninitialized, not Missing.',
    'The result is exactly the 16 assigned HDoc tags.',
    'full-256-byte classification checks',
    'An unknown extension tag cannot be\nskipped',
    'These bytes are a containment boundary, not a vendor extension API.',
    'HDoc 1.x does not have a multibyte tag escape.',
    'The canonical typed content hash includes the assigned tag',
    'No valid HDoc golden fixture exists at P03-003',
    'It does not define the bytes following a tag. Canonical scalar/vector payloads remain `P03-004`;',
  ]) assert(candidate.tagDocument.includes(marker), `type-tag semantic marker absent: ${marker}`);
  for (const [, tagHex, tagName, logicalType] of expectedTags) {
    assert(candidate.tagDocument.includes(`| \`${tagHex}\` | \`${tagName}\` | \`${logicalType}\``), `type-tag table row absent: ${tagName}`);
  }
  for (const [, , startHex, endHex, rangeClass] of expectedRanges) {
    const display = startHex === endHex ? `\`${startHex}\`` : `\`${startHex}\`–\`${endHex}\``;
    assert(candidate.tagDocument.includes(`| ${display} |`), `reserved range table row absent: ${rangeClass}`);
  }

  const registryPath = 'docs/formats/hdoc-v1-type-tags.json';
  const documentPath = 'docs/formats/hdoc-v1-type-tags.md';
  assert(candidate.specifications.includes(documentPath), 'specification type-tag backlink absent');
  assert(candidate.specifications.includes(registryPath), 'specification machine-registry backlink absent');
  assert(candidate.specifications.includes('Missing has no stored tag'), 'specification Missing boundary absent');
  assert(candidate.study.includes(documentPath), 'study type-tag backlink absent');
  assert(candidate.study.includes('splits the fixture-level vector umbrella into f32/f16 tags'), 'study vector split absent');
  assert(candidate.formatIndex.includes('[HDoc logical type tags](hdoc-v1-type-tags.md)'), 'format index type-tag entry absent');
  assert(candidate.formatIndex.includes('[Type-tag registry](hdoc-v1-type-tags.json)'), 'format index machine entry absent');
  assert(candidate.docsIndex.includes('[HDoc 1.x logical type tags](formats/hdoc-v1-type-tags.md)'), 'documentation index type-tag entry absent');
  assert(candidate.envelopeDocument.includes('[HDoc 1.x type-tag registry](hdoc-v1-type-tags.md)'), 'parent envelope type-tag backlink absent');
  assert(candidate.envelopeDocument.includes('canonical scalar/vector/container payloads (`P03-004`)'), 'parent envelope payload boundary absent');
  assert(candidate.adr.includes('- [x] Freeze stable type tags and extension ranges under `P03-003`.'), 'ADR validation state mismatch');
  assert(candidate.adr.includes('- [x] `P03-003`: publish stable type-tag and reserved-extension registries.'), 'ADR follow-up state mismatch');
  assert(candidate.adr.includes('../formats/hdoc-v1-type-tags.md'), 'ADR type-tag reference absent');
  assert(candidate.plan.includes('- [ ] **P03-003** Assign stable type tags for every required value type and reserve extension ranges.'), 'source plan state/task text mismatch');

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
  const compatibilityGenerator = generationReport.generators.find(({ id }) => id === 'compatibility.matrix-v1');
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
  assert(rejection.message.includes(expectedReason), `${label}: wrong rejection: ${rejection.message}`);
};

const canaries = [
  ['canonical JSON', (c) => { c.registrySource = JSON.stringify(JSON.parse(c.registrySource)); }, 'machine registry is not canonical JSON'],
  ['schema', (c) => withRegistryMutation(c, (v) => { v.schema = 'helix.hdoc-type-tag-registry/2'; }), 'registry schema mismatch'],
  ['tag width', (c) => withRegistryMutation(c, (v) => { v.format.tag_width_bits = 16; }), 'format boundary mismatch'],
  ['unknown behavior', (c) => withRegistryMutation(c, (v) => { v.format.unknown_tag_behavior = 'skip'; }), 'format boundary mismatch'],
  ['stored Missing flag', (c) => withRegistryMutation(c, (v) => { v.format.missing_is_storable = true; }), 'format boundary mismatch'],
  ['payload completion', (c) => withRegistryMutation(c, (v) => { v.format.complete_payload_format = true; }), 'format boundary mismatch'],
  ['payload owner', (c) => withRegistryMutation(c, (v) => { v.format.payload_completion_owner = 'P03-003'; }), 'format boundary mismatch'],
  ['numeric tag', (c) => withRegistryMutation(c, (v) => { v.tags.find((t) => t.tag_name === 'int64').tag = 3; }), 'core tag registry mismatch'],
  ['tag hex', (c) => withRegistryMutation(c, (v) => { v.tags.find((t) => t.tag_name === 'float64').tag_hex = '0x06'; }), 'core tag registry mismatch'],
  ['tag name', (c) => withRegistryMutation(c, (v) => { v.tags.find((t) => t.tag_name === 'object_id').tag_name = 'objectId'; }), 'core tag registry mismatch'],
  ['logical type', (c) => withRegistryMutation(c, (v) => { v.tags.find((t) => t.tag_name === 'uuid').logical_type = 'binary'; }), 'core tag registry mismatch'],
  ['family', (c) => withRegistryMutation(c, (v) => { v.tags.find((t) => t.tag_name === 'string').family = 'scalar'; }), 'core tag registry mismatch'],
  ['width class', (c) => withRegistryMutation(c, (v) => { v.tags.find((t) => t.tag_name === 'null').width_class = 'fixed'; }), 'core tag registry mismatch'],
  ['per-tag payload owner', (c) => withRegistryMutation(c, (v) => { v.tags.find((t) => t.tag_name === 'object').payload_owner = 'P03-004'; }), 'core tag registry mismatch'],
  ['stored Missing tag', (c) => withRegistryMutation(c, (v) => { v.tags.push({ ...v.tags[0], tag: 17, tag_hex: '0x11', tag_name: 'missing', logical_type: 'missing' }); }), 'core tag registry mismatch'],
  ['collapsed vector family', (c) => withRegistryMutation(c, (v) => { v.tags.pop(); }), 'core tag registry mismatch'],
  ['invalid sentinel range', (c) => withRegistryMutation(c, (v) => { v.reserved_ranges[0].end = 1; }), 'reserved range registry mismatch'],
  ['future standard start', (c) => withRegistryMutation(c, (v) => { v.reserved_ranges[1].start = 18; }), 'reserved range registry mismatch'],
  ['extension range class', (c) => withRegistryMutation(c, (v) => { v.reserved_ranges[2].class = 'vendor-private'; }), 'reserved range registry mismatch'],
  ['private reader behavior', (c) => withRegistryMutation(c, (v) => { v.reserved_ranges[3].read_behavior = 'accept'; }), 'reserved range registry mismatch'],
  ['control writer behavior', (c) => withRegistryMutation(c, (v) => { v.reserved_ranges[4].write_behavior = 'allowed'; }), 'reserved range registry mismatch'],
  ['permanent invalid owner', (c) => withRegistryMutation(c, (v) => { v.reserved_ranges[5].allocation_owner = 'future-major'; }), 'reserved range registry mismatch'],
  ['rule ID', (c) => withRegistryMutation(c, (v) => { v.rules[0].id = 'many-tags-per-type'; }), 'governing rule registry mismatch'],
  ['no-reuse rule', (c) => withRegistryMutation(c, (v) => { v.rules.find((r) => r.id === 'never-reuse').rule = 'Retired tags may be reused.'; }), 'governing rule registry mismatch'],
  ['fixture tag inventory', (c) => withRegistryMutation(c, (v) => { v.fixture_mapping.fixture_required_tags.pop(); }), 'fixture tag binding mismatch'],
  ['nonstorable Missing', (c) => withRegistryMutation(c, (v) => { v.fixture_mapping.nonstorable_fixture_tags = []; }), 'nonstorable fixture tag mismatch'],
  ['vector expansion', (c) => withRegistryMutation(c, (v) => { v.fixture_mapping.expanded_fixture_tags.vector = ['vector<f32,N>']; }), 'vector fixture expansion mismatch'],
  ['fixture result count', (c) => withRegistryMutation(c, (v) => { v.fixture_mapping.resulting_hdoc_logical_type_count = 15; }), 'fixture result count mismatch'],
  ['semantic coverage binding', (c) => { const v = JSON.parse(c.semanticCoverage); v.required_value_tags.pop(); c.semanticCoverage = jsonBytes(v).toString('utf8'); }, 'semantic coverage tag authority mismatch'],
  ['tag field prose', (c) => { c.tagDocument = replaceOnce(c.tagDocument, 'Every stored value position carries exactly one unsigned 8-bit `type_tag`.', 'Stored positions may omit a type tag.'); }, 'type-tag semantic marker absent'],
  ['Missing prose', (c) => { c.tagDocument = replaceOnce(c.tagDocument, '`0x00` is invalid/uninitialized, not Missing.', '`0x00` represents Missing.'); }, 'type-tag semantic marker absent'],
  ['typed hash prose', (c) => { c.tagDocument = replaceOnce(c.tagDocument, 'The canonical typed content hash includes the assigned tag', 'The canonical typed content hash omits the assigned tag'); }, 'type-tag semantic marker absent'],
  ['unknown extension prose', (c) => { c.tagDocument = replaceOnce(c.tagDocument, 'An unknown extension tag cannot be\nskipped', 'An unknown extension tag can be skipped'); }, 'type-tag semantic marker absent'],
  ['core table row', (c) => { c.tagDocument = replaceOnce(c.tagDocument, '| `0x0f` | `vector_f32` | `vector<f32,N>`', '| `0x0f` | `vector` | `vector<N>`'); }, 'type-tag table row absent'],
  ['reserved table row', (c) => { c.tagDocument = replaceOnce(c.tagDocument, '| `0x40`–`0x7f` |', '| `0x40`–`0x7e` |'); }, 'reserved range table row absent'],
  ['specification link', (c) => { c.specifications = replaceOnce(c.specifications, 'docs/formats/hdoc-v1-type-tags.json', 'docs/formats/missing.json'); }, 'specification machine-registry backlink absent'],
  ['study link', (c) => { c.study = replaceOnce(c.study, 'docs/formats/hdoc-v1-type-tags.md', 'docs/formats/missing.md'); }, 'study type-tag backlink absent'],
  ['format index', (c) => { c.formatIndex = replaceOnce(c.formatIndex, '[HDoc logical type tags](hdoc-v1-type-tags.md)', 'HDoc tags omitted'); }, 'format index type-tag entry absent'],
  ['documentation index', (c) => { c.docsIndex = replaceOnce(c.docsIndex, '[HDoc 1.x logical type tags](formats/hdoc-v1-type-tags.md)', 'HDoc tags omitted'); }, 'documentation index type-tag entry absent'],
  ['parent envelope link', (c) => { c.envelopeDocument = replaceOnce(c.envelopeDocument, '[HDoc 1.x type-tag registry](hdoc-v1-type-tags.md)', 'HDoc type tags'); }, 'parent envelope type-tag backlink absent'],
  ['ADR completion', (c) => { c.adr = replaceOnce(c.adr, '- [x] Freeze stable type tags and extension ranges under `P03-003`.', '- [ ] Freeze stable type tags and extension ranges under `P03-003`.'); }, 'ADR validation state mismatch'],
  ['source plan state', (c) => { c.plan = replaceOnce(c.plan, '- [ ] **P03-003**', '- [x] **P03-003**'); }, 'source plan state/task text mismatch'],
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
assert(snapshot.tagDocument.split('\n').length - 1 === manifest.verification.type_document_lines, 'type-tag document line count mismatch');
assert(expectedHeadings.length === manifest.verification.type_document_headings, 'type-tag heading count mismatch');
assert(snapshot.registrySource.split('\n').length - 1 === manifest.verification.registry_lines, 'machine registry line count mismatch');
assert(Buffer.byteLength(snapshot.registrySource) === manifest.verification.registry_bytes, 'machine registry byte count mismatch');

const matrixReplayPaths = [
  'Specifications.md',
  'compatibility/v1/generate-matrix.mjs',
  'compatibility/v1/matrix-v1.json',
  'docs/compatibility/v1-semantic-compatibility-matrix.md',
  ...Object.values(JSON.parse(snapshot.matrix).inputs).map(({ path: inputPath }) => inputPath),
  ...trackedFiles.filter((file) => file.startsWith('reference/semantic-oracle/')),
];
const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p03-003-'));
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

console.log(`PASS exact ${manifest.source_artifacts.length}-artifact P03-003 scope at ${commitArgument}`);
console.log(`PASS type tags: ${manifest.verification.assigned_tags} assigned one-byte tags, ${manifest.verification.reserved_ranges} reserved ranges, ${manifest.verification.classified_tag_bytes}/256 bytes classified`);
console.log(`PASS fixture reconciliation: ${manifest.verification.fixture_tags} semantic tags - Missing + f32/f16 vector expansion = ${manifest.verification.assigned_tags} stored HDoc types`);
console.log(`PASS registry rules: ${manifest.verification.registry_rules} stable identity, extension, rejection, hashing, and ownership contracts`);
console.log(`PASS mutation canaries: ${canaries.length}/${canaries.length} intended rejections`);
console.log(`PASS documentation: ${markdownFiles.length} Markdown files and ${localLinks} local links`);
console.log('PASS generated authority: 263-row matrix, rendered document, and fixture-generation report');
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

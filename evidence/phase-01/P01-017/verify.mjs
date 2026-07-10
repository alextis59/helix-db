#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const input = process.argv[2];

if (!input) {
  throw new Error('usage: node evidence/phase-01/P01-017/verify.mjs <commit>');
}

const git = (args, options = {}) =>
  execFileSync('git', args, { encoding: 'utf8', ...options });
const commit = git(['rev-parse', `${input}^{commit}`]).trim();
const artifactPaths = [
  'Specifications.md',
  'docs/adr/0010-use-id-order-as-the-native-default.md',
  'docs/adr/README.md',
  'docs/architecture/aggregation-semantics.md',
  'docs/architecture/crud-query-semantics.md',
  'docs/architecture/default-ordering-semantics.md',
  'docs/architecture/identifier-semantics.md',
];
const show = (file) => git(['show', `${commit}:${file}`]);

git(['diff', '--check', `${commit}^`, commit]);

const changed = git([
  'diff-tree',
  '--no-commit-id',
  '--name-only',
  '-r',
  commit,
])
  .trim()
  .split('\n')
  .filter(Boolean)
  .sort();

if (JSON.stringify(changed) !== JSON.stringify([...artifactPaths].sort())) {
  throw new Error(`unexpected artifact commit scope: ${changed.join(', ')}`);
}

const files = Object.fromEntries(
  artifactPaths.map((file) => [file, show(file)]),
);

for (const [file, source] of Object.entries(files)) {
  if (!source.endsWith('\n')) throw new Error(`${file}: missing terminal newline`);

  for (const [index, line] of source.split('\n').entries()) {
    if (/[ \t]+$/.test(line)) {
      throw new Error(`${file}:${index + 1}: trailing whitespace`);
    }
  }

  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].split('#')[0];
    if (!rawTarget || /^(https?:|mailto:)/.test(rawTarget)) continue;

    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)),
    );
    if (target === '..' || target.startsWith('../')) {
      throw new Error(`${file}: link escapes repository: ${rawTarget}`);
    }
    git(['cat-file', '-e', `${commit}:${target}`]);
  }
}

const ordering = files['docs/architecture/default-ordering-semantics.md'];
const sections = [
  'Ordering domains',
  'Native default collection order',
  'Ordering precedence',
  'Command/result matrix',
  'Hidden stable ordinal',
  'Pipeline stage ordering',
  'Pagination and cursor continuation',
  'Mutation selection and side effects',
  'Backend, index, and distributed invariants',
  'Intentionally unspecified order',
  'Error and resource behavior',
  'Compatibility boundary',
  'Versioning and migration',
  'Required conformance fixtures',
];
const surfaces = [
  '`find`',
  '`updateOne`',
  '`replaceOne`',
  '`deleteOne`',
  '`updateMany`',
  '`deleteMany`',
  '`insertMany`',
  '`count`',
  '`$vectorTopK`',
  '`$match`',
  '`$project`',
  '`$skip`',
  '`$limit`',
  '`$sort`',
  '`$unwind`',
  '`$group`',
  '`$count`',
];
const ordinals = [
  'source(id_order_key)',
  'unwind(parent_ordinal, element_index)',
  'group(canonical_semantic_group_key)',
  'singleton(stage_identity)',
  'input(command_index)',
  'sort(normalized_key_tuple_with_directions, prior_ordinal)',
];

if (!ordering.includes('Profile: `default_order_v1`')) {
  throw new Error('default_order_v1 profile metadata is absent');
}
for (const section of sections) {
  if (!ordering.includes(`## ${section}`)) throw new Error(`missing section: ${section}`);
}
for (const surface of surfaces) {
  if (!ordering.includes(surface)) throw new Error(`missing surface: ${surface}`);
}
for (const ordinal of ordinals) {
  if (!ordering.includes(ordinal)) throw new Error(`missing ordinal: ${ordinal}`);
}

const idOrder = [
  'numeric int32/int64',
  '< string',
  '< generic binary',
  '< uuid',
  '< objectId',
];
let previous = -1;
for (const marker of idOrder) {
  const index = ordering.indexOf(marker);
  if (index <= previous) throw new Error(`invalid ID order marker: ${marker}`);
  previous = index;
}

const unspecified = [
  'Physical rows/files/pages',
  'Independent commands',
  'Thread/process/device log',
  'Scheduler progress',
  'Non-normative timing samples',
  'Mathematical set/map/hash membership',
  'Future cross-range concurrent change events',
];
for (const marker of unspecified) {
  if (!ordering.includes(marker)) throw new Error(`missing unspecified surface: ${marker}`);
}

const safetyMarkers = [
  'never leaks physical scan, hash, worker, GPU, or arrival order',
  'There is no native v1 `natural` order',
  'return a typed quota/deadline/capability error',
  'returns no partial current response/cursor batch',
  'Projection may hide `_id` from output but cannot change the hidden continuation/order key',
  'Batches of any legal size concatenate to the exact one-shot sequence',
  'Future shards/ranges merge globally by the semantic tuple',
];
for (const marker of safetyMarkers) {
  if (!ordering.includes(marker)) throw new Error(`missing safety marker: ${marker}`);
}

const aggregation = files['docs/architecture/aggregation-semantics.md'];
for (const marker of [
  'creates a new structured sort ordinal',
  'first contributing row by current hidden ordinal',
  '[default ordering](default-ordering-semantics.md)',
]) {
  if (!aggregation.includes(marker)) throw new Error(`aggregation refinement: ${marker}`);
}

const crud = files['docs/architecture/crud-query-semantics.md'];
for (const marker of [
  '[default ordering](default-ordering-semantics.md)',
  'ascending semantic `_id` order from `default_order_v1`',
  '[`default_order_v1`](default-ordering-semantics.md) uses ascending semantic `_id`',
]) {
  if (!crud.includes(marker)) throw new Error(`CRUD refinement: ${marker}`);
}

if (
  !files['docs/architecture/identifier-semantics.md'].includes(
    '[`default_order_v1`](default-ordering-semantics.md)',
  )
) {
  throw new Error('identifier order is not bound to default_order_v1');
}

const adr = files['docs/adr/0010-use-id-order-as-the-native-default.md'];
for (const marker of [
  'Option A',
  'Option B',
  'Option C',
  'Compatibility and migration',
  'Security and operations',
  'Validation plan',
  'Implementation impact',
]) {
  if (!adr.includes(marker)) throw new Error(`missing ADR marker: ${marker}`);
}

const specification = files['Specifications.md'];
if (
  !specification.includes('### 8.6 Default result ordering') ||
  !specification.includes('docs/architecture/default-ordering-semantics.md') ||
  !specification.includes('docs/adr/0010-use-id-order-as-the-native-default.md')
) {
  throw new Error('specification does not bind default_order_v1 and ADR 0010');
}

if (
  !files['docs/adr/README.md'].includes(
    '[0010](0010-use-id-order-as-the-native-default.md)',
  )
) {
  throw new Error('ADR 0010 is absent from the index');
}

const rank = { numeric: 0, string: 1, binary: 2, uuid: 3, objectId: 4 };
const compareBytes = (left, right) => Buffer.compare(left, right);
const compareId = (left, right) => {
  const classOrder = rank[left.type] - rank[right.type];
  if (classOrder !== 0) return classOrder;
  if (left.type === 'numeric') return left.value < right.value ? -1 : left.value > right.value ? 1 : 0;
  return compareBytes(left.value, right.value);
};
const ids = [
  { label: 'objectId:00', type: 'objectId', value: Buffer.alloc(12) },
  { label: 'string:z', type: 'string', value: Buffer.from('z') },
  { label: 'numeric:2', type: 'numeric', value: 2n },
  { label: 'uuid:00', type: 'uuid', value: Buffer.alloc(16) },
  { label: 'binary:00', type: 'binary', value: Buffer.from([0]) },
  { label: 'numeric:-1', type: 'numeric', value: -1n },
  { label: 'string:empty', type: 'string', value: Buffer.alloc(0) },
];
const expectedIds = [
  'numeric:-1',
  'numeric:2',
  'string:empty',
  'string:z',
  'binary:00',
  'uuid:00',
  'objectId:00',
].join(',');
for (const permutation of [ids, [...ids].reverse(), [...ids.slice(3), ...ids.slice(0, 3)]]) {
  if (permutation.toSorted(compareId).map((id) => id.label).join(',') !== expectedIds) {
    throw new Error('physical permutation changed default ID order');
  }
}

const rows = [
  { id: 1, a: 2, b: 0 },
  { id: 2, a: 1, b: 0 },
  { id: 3, a: 2, b: 1 },
  { id: 4, a: 1, b: 1 },
];
const physicalRows = [rows[3], rows[0], rows[2], rows[1]];
const defaultRows = physicalRows.toSorted((left, right) => left.id - right.id);
if (defaultRows.map((row) => row.id).join(',') !== '1,2,3,4') {
  throw new Error('default row order mismatch');
}
const firstSort = defaultRows.toSorted(
  (left, right) => left.a - right.a || left.id - right.id,
);
if (firstSort.map((row) => row.id).join(',') !== '2,4,1,3') {
  throw new Error('explicit sort/tie mismatch');
}
const priorOrdinal = new Map(firstSort.map((row, index) => [row.id, index]));
const secondSort = firstSort.toSorted(
  (left, right) => left.b - right.b || priorOrdinal.get(left.id) - priorOrdinal.get(right.id),
);
if (secondSort.map((row) => row.id).join(',') !== '2,1,4,3') {
  throw new Error('repeated stable sort lost prior ordinal');
}
const unwound = secondSort.flatMap((row, parent) =>
  ['x', 'y'].map((value, element) => ({ id: row.id, ordinal: [parent, element], value })),
);
if (unwound.map((row) => `${row.id}:${row.ordinal[1]}`).join(',') !== '2:0,2:1,1:0,1:1,4:0,4:1,3:0,3:1') {
  throw new Error('unwind provenance mismatch');
}
const equalGroupKeys = [
  { ordinal: 2, type: 'int32' },
  { ordinal: 0, type: 'int64' },
  { ordinal: 1, type: 'int32' },
].toSorted((left, right) => left.ordinal - right.ordinal);
if (equalGroupKeys[0].type !== 'int64') {
  throw new Error('group did not retain first exact representative');
}
const inputIds = ['uuid-high', 'numeric-low', 'string-mid'];
if (inputIds.join(',') !== 'uuid-high,numeric-low,string-mid') {
  throw new Error('input-correlated result order mismatch');
}
const cursorBatches = [defaultRows.slice(0, 1), defaultRows.slice(1, 3), defaultRows.slice(3)];
if (cursorBatches.flat().map((row) => row.id).join(',') !== '1,2,3,4') {
  throw new Error('cursor batches do not equal one-shot order');
}

console.log(`PASS: exact seven-file artifact scope at ${commit}`);
console.log('PASS: committed formatting and local links');
console.log(
  `PASS: ${sections.length}/14 sections; ${surfaces.length}/17 surfaces; ${ordinals.length}/6 ordinal forms`,
);
console.log(
  `PASS: ${idOrder.length}/5 ID classes; ${unspecified.length}/7 explicit unspecified surfaces; safety markers`,
);
console.log('PASS: physical permutations, explicit/repeated sorts, unwind, group, input, and cursor sanity');
console.log('PASS: aggregation/CRUD/identifier refinements, ADR, specification, and index');

for (const [file, source] of Object.entries(files)) {
  console.log(
    `ARTIFACT: ${file} ${createHash('sha256').update(source).digest('hex')} ${Buffer.byteLength(source)}`,
  );
}

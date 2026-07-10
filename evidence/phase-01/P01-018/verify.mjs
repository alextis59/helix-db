#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const input = process.argv[2];

if (!input) {
  throw new Error('usage: node evidence/phase-01/P01-018/verify.mjs <commit>');
}

const git = (args, options = {}) =>
  execFileSync('git', args, { encoding: 'utf8', ...options });
const commit = git(['rev-parse', `${input}^{commit}`]).trim();
const artifactPaths = [
  'Specifications.md',
  'docs/adr/0011-use-tagged-json-semantic-fixtures.md',
  'docs/adr/README.md',
  'docs/quality/semantic-fixture-format.md',
  'fixtures/semantic/README.md',
  'fixtures/semantic/schema/check-canonical-examples.mjs',
  'fixtures/semantic/schema/check-semantic-examples.mjs',
  'fixtures/semantic/schema/examples/README.md',
  'fixtures/semantic/schema/examples/invalid-schema/bare-integer-payload.json',
  'fixtures/semantic/schema/examples/invalid-schema/error-message-forbidden.json',
  'fixtures/semantic/schema/examples/invalid-schema/exact-order-without-keys.json',
  'fixtures/semantic/schema/examples/invalid-semantic/duplicate-logical-object-field.json',
  'fixtures/semantic/schema/examples/invalid-semantic/initial-documents-out-of-order.json',
  'fixtures/semantic/schema/examples/invalid-semantic/vector-dimension-mismatch.json',
  'fixtures/semantic/schema/examples/valid/all-value-types.json',
  'fixtures/semantic/schema/examples/valid/command-default-order.json',
  'fixtures/semantic/schema/examples/valid/expectation-variants.json',
  'fixtures/semantic/schema/examples/valid/raw-error.json',
  'fixtures/semantic/schema/fixture-jcs.mjs',
  'fixtures/semantic/schema/semantic-corpus-manifest-v1.schema.json',
  'fixtures/semantic/schema/semantic-fixture-v1.schema.json',
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
const markdownPaths = artifactPaths.filter((file) => file.endsWith('.md'));

for (const [file, source] of Object.entries(files)) {
  if (!source.endsWith('\n')) throw new Error(`${file}: missing terminal newline`);
  for (const [index, line] of source.split('\n').entries()) {
    if (/[ \t]+$/.test(line)) {
      throw new Error(`${file}:${index + 1}: trailing whitespace`);
    }
  }
  if (file.endsWith('.json')) JSON.parse(source);
}

for (const file of markdownPaths) {
  const source = files[file];
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

const fixtureSchema = JSON.parse(
  files['fixtures/semantic/schema/semantic-fixture-v1.schema.json'],
);
const manifestSchema = JSON.parse(
  files['fixtures/semantic/schema/semantic-corpus-manifest-v1.schema.json'],
);
for (const [name, schema] of [
  ['fixture', fixtureSchema],
  ['manifest', manifestSchema],
]) {
  const refs = [...JSON.stringify(schema).matchAll(/"\$ref":"([^"]+)"/g)].map(
    (match) => match[1],
  );
  for (const ref of refs) {
    if (!ref.startsWith('#/$defs/')) throw new Error(`${name}: external ref ${ref}`);
    if (!schema.$defs[ref.slice(8)]) throw new Error(`${name}: broken ref ${ref}`);
  }
}

const logicalTags = [
  'null',
  'bool',
  'int32',
  'int64',
  'float64',
  'decimal128',
  'string',
  'binary',
  'object',
  'array',
  'timestamp',
  'date',
  'uuid',
  'objectId',
  'vector',
];
const schemaText = JSON.stringify(fixtureSchema);
for (const tag of logicalTags) {
  if (!schemaText.includes(`"${tag}"`)) throw new Error(`missing logical tag ${tag}`);
}
const requiredDefinitions = [
  'command_action',
  'raw_input_action',
  'value_operation_action',
  'success_expectation',
  'error_expectation',
  'order_expectation',
  'state_expectation',
  'command_literal',
  'observable_value',
];
for (const definition of requiredDefinitions) {
  if (!fixtureSchema.$defs[definition]) throw new Error(`missing definition ${definition}`);
}

const categories = fixtureSchema.$defs.error_expectation.properties.category.enum;
const phases = fixtureSchema.$defs.error_expectation.properties.phase.enum;
const outcomes = fixtureSchema.$defs.error_expectation.properties.outcome.enum;
const retries = fixtureSchema.$defs.retry_expectation.properties.scope.enum;
if (
  categories.length !== 11 ||
  phases.length !== 15 ||
  outcomes.length !== 4 ||
  retries.length !== 7
) {
  throw new Error('error registry shape mismatch');
}
if (
  fixtureSchema.$id !== 'urn:helix-db:schema:semantic-fixture:1' ||
  manifestSchema.$id !== 'urn:helix-db:schema:semantic-corpus-manifest:1'
) {
  throw new Error('schema URN mismatch');
}

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p01-018-'));
try {
  for (const artifact of artifactPaths.filter((file) => file.startsWith('fixtures/'))) {
    const target = path.join(temporary, artifact);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, files[artifact]);
  }

  const pythonProgram = String.raw`
import glob,json,sys
from jsonschema import Draft202012Validator
root=sys.argv[1]
schemas=sorted(glob.glob(root+'/fixtures/semantic/schema/*schema.json'))
if len(schemas)!=2: raise SystemExit('expected two schemas')
for p in schemas:
  with open(p,encoding='utf-8') as f: schema=json.load(f)
  Draft202012Validator.check_schema(schema)
with open(root+'/fixtures/semantic/schema/semantic-fixture-v1.schema.json',encoding='utf-8') as f: schema=json.load(f)
validator=Draft202012Validator(schema)
counts={}
for group,accepted in [('valid',True),('invalid-schema',False),('invalid-semantic',True)]:
  paths=sorted(glob.glob(root+'/fixtures/semantic/schema/examples/'+group+'/*.json'))
  counts[group]=len(paths)
  for p in paths:
    with open(p,encoding='utf-8') as f: value=json.load(f)
    errors=list(validator.iter_errors(value))
    if (not errors)!=accepted: raise SystemExit(f'{p}: accepted={(not errors)} expected={accepted}')
if counts!={'valid':4,'invalid-schema':3,'invalid-semantic':3}: raise SystemExit(str(counts))
print('PASS Draft 2020-12 schemas/examples',counts)
`;
  const pythonOutput = execFileSync('python3', ['-c', pythonProgram, temporary], {
    encoding: 'utf8',
  }).trim();

  const semanticOutput = execFileSync(
    'node',
    ['fixtures/semantic/schema/check-semantic-examples.mjs'],
    { cwd: temporary, encoding: 'utf8' },
  ).trim();
  const canonicalOutput = execFileSync(
    'node',
    ['fixtures/semantic/schema/check-canonical-examples.mjs'],
    { cwd: temporary, encoding: 'utf8' },
  ).trim();

  for (const marker of [
    'PASS semantic examples: 4 accepted; 3 rejected with exact rules',
    'fixture.object.duplicate_field',
    'fixture.state.document_order',
    'fixture.vector.dimension_mismatch',
  ]) {
    if (!semanticOutput.includes(marker)) throw new Error(`semantic output: ${marker}`);
  }
  for (const marker of [
    'PASS RFC 8785 property-order vector',
    'PASS canonical examples: 4 stable source/canonical hashes',
    'canonical=acd2d518be9d51c3e1d07a30eb5fcc2578ece09fbf1ce2de61ec15eec938d0cf',
    'canonical=f932f5f26a922bb26026a2268e8be1fd78055446de67b05f06a322352f3110b0',
    'canonical=333f3a8c04149b96ecb0fb02b1c174371738710d5c42026bf204010b85d06760',
    'canonical=2ed21f5c8705484a2efa9ac2828062126a1cda0c8a5c1db7baf9f56826468ea0',
  ]) {
    if (!canonicalOutput.includes(marker)) throw new Error(`canonical output: ${marker}`);
  }

  console.log(pythonOutput);
  console.log(semanticOutput);
  console.log(canonicalOutput);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

const format = files['docs/quality/semantic-fixture-format.md'];
for (const marker of [
  'Fixture schema: `helix.semantic-fixture/1`',
  'Corpus manifest schema: `helix.semantic-corpus/1`',
  'Exact typed value representation',
  'Initial state and deterministic capabilities',
  'Structured command',
  'Raw input',
  'Registered value operation',
  'Success expectations',
  'Error expectations',
  'Ordering expectations',
  'State expectations',
  'Semantic validation beyond JSON Schema',
  'Corpus manifest',
  'Versioning and change policy',
  'Security and resource rules',
]) {
  if (!format.includes(marker)) throw new Error(`format marker: ${marker}`);
}

const adr = files['docs/adr/0011-use-tagged-json-semantic-fixtures.md'];
for (const marker of [
  'Option A',
  'Option B',
  'Option C',
  'Compatibility and migration',
  'Security and operations',
  'Validation plan',
  'Implementation impact',
]) {
  if (!adr.includes(marker)) throw new Error(`ADR marker: ${marker}`);
}
const specification = files['Specifications.md'];
if (
  !specification.includes('### 20.6 Language-neutral semantic corpus') ||
  !specification.includes('docs/quality/semantic-fixture-format.md') ||
  !specification.includes('docs/adr/0011-use-tagged-json-semantic-fixtures.md')
) {
  throw new Error('specification fixture integration is incomplete');
}
if (
  !files['docs/adr/README.md'].includes(
    '[0011](0011-use-tagged-json-semantic-fixtures.md)',
  )
) {
  throw new Error('ADR 0011 is absent from the index');
}

console.log(`PASS: exact ${artifactPaths.length}-file artifact scope at ${commit}`);
console.log('PASS: committed formatting, JSON parsing, and local links');
console.log(
  `PASS: ${logicalTags.length} logical tags + Missing; 3 actions; success/error/order/state`,
);
console.log(
  `PASS: ${categories.length} categories; ${phases.length} phases; ${outcomes.length} outcomes; ${retries.length} retry scopes`,
);
console.log('PASS: format/ADR/specification/index integration');

for (const [file, source] of Object.entries(files)) {
  console.log(
    `ARTIFACT: ${file} ${createHash('sha256').update(source).digest('hex')} ${Buffer.byteLength(source)}`,
  );
}

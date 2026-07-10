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
import { fileURLToPath } from 'node:url';

const input = process.argv[2];

if (!input) {
  throw new Error('usage: node evidence/phase-01/P01-019/verify.mjs <commit>');
}

const gitText = (args, options = {}) =>
  execFileSync('git', args, { encoding: 'utf8', ...options });
const gitBytes = (args, options = {}) => execFileSync('git', args, options);
const commit = gitText(['rev-parse', `${input}^{commit}`]).trim();
const artifactPaths = [
  'docs/architecture/error-semantics.md',
  'docs/architecture/floating-special-semantics.md',
  'docs/architecture/limits-v1.md',
  'docs/architecture/numeric-semantics.md',
  'docs/quality/semantic-fixture-format.md',
  'fixtures/semantic/COVERAGE.md',
  'fixtures/semantic/README.md',
  'fixtures/semantic/cases/errors/registry.json',
  'fixtures/semantic/cases/invalid/commands.json',
  'fixtures/semantic/cases/invalid/raw-inputs.json',
  'fixtures/semantic/cases/limits/commands-queries.json',
  'fixtures/semantic/cases/limits/document-values.json',
  'fixtures/semantic/cases/ordering/profiles.json',
  'fixtures/semantic/cases/presence/missing-null-paths.json',
  'fixtures/semantic/cases/query/missing-array-nested.json',
  'fixtures/semantic/cases/scalar/decimal128-specials.json',
  'fixtures/semantic/cases/scalar/float64-specials.json',
  'fixtures/semantic/cases/scalar/integers.json',
  'fixtures/semantic/cases/scalar/mixed-numeric.json',
  'fixtures/semantic/cases/scalar/null-bool.json',
  'fixtures/semantic/cases/scalar/string-binary.json',
  'fixtures/semantic/cases/scalar/temporal-identifiers.json',
  'fixtures/semantic/cases/scalar/vectors.json',
  'fixtures/semantic/cases/values/objects-arrays.json',
  'fixtures/semantic/check-corpus.mjs',
  'fixtures/semantic/coverage-v1.json',
  'fixtures/semantic/error-cases-v1.json',
  'fixtures/semantic/generate-corpus.mjs',
  'fixtures/semantic/manifest.json',
  'fixtures/semantic/operations-v1.json',
  'fixtures/semantic/schema/check-semantic-examples.mjs',
];
const expectedCaseSteps = new Map([
  ['errors.registry', 74],
  ['invalid.commands', 7],
  ['invalid.raw-inputs', 18],
  ['limits.commands-queries', 36],
  ['limits.document-values', 33],
  ['ordering.profiles', 6],
  ['presence.missing-null-paths', 9],
  ['query.missing-array-nested', 8],
  ['scalar.decimal128-specials', 15],
  ['scalar.float64-specials', 19],
  ['scalar.integers', 14],
  ['scalar.mixed-numeric', 7],
  ['scalar.null-bool', 8],
  ['scalar.string-binary', 15],
  ['scalar.temporal-identifiers', 16],
  ['scalar.vectors', 12],
  ['values.objects-arrays', 16],
]);
const expectedCounts = { fixtures: 17, steps: 313, successes: 183, errors: 130 };
const expectedLimitIds = [
  'array.elements',
  'ast.depth',
  'ast.nodes',
  'batch.items',
  'command.expanded_bytes',
  'command.raw_bytes',
  'document.canonical_bytes',
  'document.depth',
  'document.total_fields',
  'field_name.scalars',
  'field_name.utf8_bytes',
  'id.payload_bytes',
  'literal_list.items',
  'object.fields',
  'path.candidates',
  'path.segments',
  'path.utf8_bytes',
  'pipeline.stages',
  'projection.paths',
  'regex.pattern_bytes',
  'sort.keys',
  'vector.dimension',
  'vector.top_k',
];
const expectedRequirements = [
  'CORE-002',
  'DATA-001',
  'DATA-002',
  'GPU-002',
  'GPU-003',
  'GPU-004',
  'INV-002',
  'QUERY-001',
  'QUERY-002',
  'SEC-001',
  'SEC-002',
  'STORE-001',
];
const expectedValueTags = [
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
const expectedOrderBases = [
  'default_order_v1',
  'explicit_sort',
  'input_order',
  'not_applicable',
  'pipeline_ordinal',
  'set_semantics',
  'singleton',
  'vector_rank',
];
const same = (left, right, label) => {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label} mismatch: ${JSON.stringify(left)}`);
  }
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const showBytes = (file) => gitBytes(['show', `${commit}:${file}`]);

gitText(['diff', '--check', `${commit}^`, commit]);

const changed = gitText([
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
same(changed, [...artifactPaths].sort(), 'artifact commit scope');

const files = Object.fromEntries(
  artifactPaths.map((file) => [file, showBytes(file)]),
);

for (const [file, bytes] of Object.entries(files)) {
  const source = bytes.toString('utf8');
  if (!source.endsWith('\n')) throw new Error(`${file}: missing terminal newline`);
  for (const [index, line] of source.split('\n').entries()) {
    if (/[ \t]+$/.test(line)) {
      throw new Error(`${file}:${index + 1}: trailing whitespace`);
    }
  }
  if (file.endsWith('.json')) JSON.parse(source);
}

for (const file of artifactPaths.filter((entry) => entry.endsWith('.md'))) {
  const source = files[file].toString('utf8');
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].split('#')[0];
    if (!rawTarget || /^(https?:|mailto:)/.test(rawTarget)) continue;
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)),
    );
    if (target === '..' || target.startsWith('../')) {
      throw new Error(`${file}: link escapes repository: ${rawTarget}`);
    }
    gitText(['cat-file', '-e', `${commit}:${target}`]);
  }
}

const parse = (file) => JSON.parse(files[file].toString('utf8'));
const manifest = parse('fixtures/semantic/manifest.json');
const coverage = parse('fixtures/semantic/coverage-v1.json');
const operations = parse('fixtures/semantic/operations-v1.json');
const errorCases = parse('fixtures/semantic/error-cases-v1.json');

same(manifest.counts, expectedCounts, 'manifest counts');
same(coverage.expected_counts, expectedCounts, 'coverage counts');
same(
  manifest.fixtures.map((fixture) => [fixture.id, fixture.steps]),
  [...expectedCaseSteps],
  'case IDs and step counts',
);
same(Object.keys(manifest.coverage), expectedRequirements, 'requirement coverage');
same(coverage.required_limit_ids, expectedLimitIds, 'limit IDs');
same(coverage.required_value_tags, expectedValueTags, 'observable value tags');
same(coverage.required_action_kinds, ['command', 'raw_input', 'value_operation'], 'actions');
same(coverage.required_order_bases, expectedOrderBases, 'order bases');
if (coverage.required_operations.length !== 17 || operations.operations.length !== 17) {
  throw new Error('expected 17 registered and required value operations');
}
if (coverage.required_error_codes.length !== 74 || errorCases.cases.length !== 74) {
  throw new Error('expected all 74 error codes');
}

const casePaths = artifactPaths.filter((file) => file.startsWith('fixtures/semantic/cases/'));
same(manifest.fixtures.map((fixture) => fixture.path), casePaths, 'manifest case paths');
for (const fixture of manifest.fixtures) {
  const bytes = files[fixture.path];
  if (bytes.length !== fixture.bytes || sha256(bytes) !== fixture.source_sha256) {
    throw new Error(`${fixture.id}: committed source hash/size mismatch`);
  }
}

const allCases = manifest.fixtures.map((entry) => parse(entry.path));
const seenSteps = new Set();
const boundaryRelations = new Map();
const errorCodes = new Set();
const errorCategories = new Set();
let successCount = 0;
let errorCount = 0;
for (const fixture of allCases) {
  for (const step of fixture.steps) {
    const key = `${fixture.id}/${step.id}`;
    if (seenSteps.has(key)) throw new Error(`duplicate step ${key}`);
    seenSteps.add(key);
    if (step.expect.kind === 'success') successCount += 1;
    else {
      errorCount += 1;
      errorCodes.add(step.expect.code);
      errorCategories.add(step.expect.category);
    }
    if (
      step.action.kind === 'value_operation' &&
      step.action.operation === 'fixture.generate-boundary'
    ) {
      const limitId = step.action.arguments[0].value;
      const relation = step.action.arguments[1].value;
      if (!boundaryRelations.has(limitId)) boundaryRelations.set(limitId, []);
      boundaryRelations.get(limitId).push(relation);
    }
  }
}
if (seenSteps.size !== 313 || successCount !== 183 || errorCount !== 130) {
  throw new Error('independent step/outcome recount mismatch');
}
same([...boundaryRelations.keys()].sort(), expectedLimitIds, 'boundary limit coverage');
for (const [limitId, relations] of boundaryRelations) {
  same(relations.sort(), ['above', 'at', 'below'], `${limitId} boundary relations`);
}
if (errorCodes.size !== 74 || errorCategories.size !== 11) {
  throw new Error('error registry breadth mismatch');
}

const errorDocument = files['docs/architecture/error-semantics.md'].toString('utf8');
const documentedErrors = [...errorDocument.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|/gm)]
  .map((match) => match[1])
  .sort();
same(documentedErrors, coverage.required_error_codes, 'documented error codes');
for (const marker of [
  'Every code defaults to `retryable: false`, scope `never` unless listed below.',
  '`new_snapshot`',
  '`same_idempotency_key`',
  '`after_capability_change`',
  '`after_delay`',
  '`after_operator_action`',
]) {
  if (!errorDocument.includes(marker)) throw new Error(`error registry marker: ${marker}`);
}

const limitDocument = files['docs/architecture/limits-v1.md'].toString('utf8');
const limitSection = limitDocument.slice(
  limitDocument.indexOf('| Stable limit ID |'),
  limitDocument.indexOf('The document/depth choices'),
);
const documentedLimits = [...limitSection.matchAll(/^\| `([a-z][a-z0-9_.]+)` \|/gm)]
  .map((match) => match[1])
  .sort();
same(documentedLimits, expectedLimitIds, 'documented stable limit IDs');

const floating = files['docs/architecture/floating-special-semantics.md'].toString('utf8');
for (const marker of [
  'precision p = 34 decimal digits',
  '-6176 <= exponent',
  'exponent + coefficient_digits - 1 <= 6144',
  '1 × 10^-6176',
  '(10^34 - 1) × 10^6111',
]) {
  if (!floating.includes(marker)) throw new Error(`decimal boundary marker: ${marker}`);
}

const coverageLedger = files['fixtures/semantic/COVERAGE.md'].toString('utf8');
for (const marker of [
  'fixtures:  17',
  'steps:     313',
  'successes: 183',
  'errors:    130',
  '23 × 3 limit relations',
  'all 74 codes',
  'P01-020',
]) {
  if (!coverageLedger.includes(marker)) throw new Error(`coverage marker: ${marker}`);
}

const generator = files['fixtures/semantic/generate-corpus.mjs'].toString('utf8');
for (const forbidden of [
  'localeCompare',
  'Math.random',
  'randomUUID',
  'new Date',
  'Date.now',
]) {
  if (generator.includes(forbidden)) throw new Error(`nondeterministic generator API: ${forbidden}`);
}

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p01-019-'));
try {
  const fixtureTree = gitText([
    'ls-tree',
    '-r',
    '--name-only',
    commit,
    '--',
    'fixtures/semantic',
  ])
    .trim()
    .split('\n')
    .filter(Boolean);
  for (const file of [
    ...fixtureTree,
    'docs/architecture/error-semantics.md',
    'docs/architecture/limits-v1.md',
  ]) {
    const target = path.join(temporary, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, showBytes(file));
  }

  const pythonProgram = String.raw`
import glob,json,sys
from jsonschema import Draft202012Validator
root=sys.argv[1]
with open(root+'/fixtures/semantic/schema/semantic-fixture-v1.schema.json',encoding='utf-8') as f: fixture_schema=json.load(f)
with open(root+'/fixtures/semantic/schema/semantic-corpus-manifest-v1.schema.json',encoding='utf-8') as f: manifest_schema=json.load(f)
Draft202012Validator.check_schema(fixture_schema)
Draft202012Validator.check_schema(manifest_schema)
fixture_validator=Draft202012Validator(fixture_schema)
manifest_validator=Draft202012Validator(manifest_schema)
case_paths=sorted(glob.glob(root+'/fixtures/semantic/cases/**/*.json',recursive=True))
if len(case_paths)!=17: raise SystemExit(f'expected 17 cases, got {len(case_paths)}')
for p in case_paths:
  with open(p,encoding='utf-8') as f: value=json.load(f)
  errors=list(fixture_validator.iter_errors(value))
  if errors: raise SystemExit(f'{p}: {errors[0].message}')
with open(root+'/fixtures/semantic/manifest.json',encoding='utf-8') as f: manifest=json.load(f)
errors=list(manifest_validator.iter_errors(manifest))
if errors: raise SystemExit(f'manifest: {errors[0].message}')
print('PASS Draft 2020-12: 2 schemas, 17 cases, 1 manifest')
`;
  const pythonOutput = execFileSync('python3', ['-c', pythonProgram, temporary], {
    encoding: 'utf8',
  }).trim();
  const runNode = (script, args = []) =>
    execFileSync('node', [script, ...args], { cwd: temporary, encoding: 'utf8' }).trim();
  const generationOutput = runNode('fixtures/semantic/generate-corpus.mjs', ['--check']);
  const corpusOutput = runNode('fixtures/semantic/check-corpus.mjs');
  const semanticOutput = runNode('fixtures/semantic/schema/check-semantic-examples.mjs');
  const canonicalOutput = runNode('fixtures/semantic/schema/check-canonical-examples.mjs');

  for (const [output, marker] of [
    [generationOutput, 'PASS corpus generation: 17 fixtures, 313 steps, 183 successes, 130 errors'],
    [generationOutput, 'PASS coverage: 17 operations, 23 limits, 74 error codes, 12 required tags'],
    [corpusOutput, 'PASS corpus: 17 fixtures, 313 steps, 183 successes, 130 errors'],
    [corpusOutput, 'PASS boundaries/registry: 23 limits x3 and 74 documented error codes'],
    [semanticOutput, 'PASS semantic examples: 4 accepted; 3 rejected with exact rules'],
    [canonicalOutput, 'PASS canonical examples: 4 stable source/canonical hashes'],
  ]) {
    if (!output.includes(marker)) throw new Error(`replay output missing: ${marker}`);
  }

  console.log(pythonOutput);
  console.log(generationOutput);
  console.log(corpusOutput);
  console.log(semanticOutput);
  console.log(canonicalOutput);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact 31-file artifact scope at ${commit}`);
console.log('PASS committed formatting, JSON parsing, and local links');
console.log('PASS independent recount: 17 fixtures, 313 unique steps, 183 successes, 130 errors');
console.log('PASS breadth: 16 observable tags, 3 actions, 8 order bases, 17 operations');
console.log('PASS boundaries/registry: 23 limits x3 and all 74 codes in 11 categories');
for (const file of artifactPaths) {
  console.log(`ARTIFACT ${file} ${sha256(files[file])} ${files[file].length}`);
}
const verifierBytes = readFileSync(fileURLToPath(import.meta.url));
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

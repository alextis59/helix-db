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
if (!input) throw new Error('usage: node evidence/phase-01/P01-020/verify.mjs <commit>');

const gitText = (args, options = {}) =>
  execFileSync('git', args, { encoding: 'utf8', ...options });
const gitBytes = (args, options = {}) => execFileSync('git', args, options);
const commit = gitText(['rev-parse', `${input}^{commit}`]).trim();
const artifactPaths = [
  'README.md',
  'Specifications.md',
  'docs/README.md',
  'docs/adr/0008-use-one-portable-v1-limit-profile.md',
  'docs/adr/0010-use-id-order-as-the-native-default.md',
  'docs/adr/0011-use-tagged-json-semantic-fixtures.md',
  'docs/quality/semantic-fixture-format.md',
  'fixtures/semantic/COVERAGE.md',
  'fixtures/semantic/README.md',
  'fixtures/semantic/oracle-report-v1.json',
  'fixtures/semantic/schema/semantic-oracle-report-v1.schema.json',
  'reference/semantic-oracle/README.md',
  'reference/semantic-oracle/canonical.mjs',
  'reference/semantic-oracle/cli.mjs',
  'reference/semantic-oracle/command.mjs',
  'reference/semantic-oracle/oracle.mjs',
  'reference/semantic-oracle/raw-json.mjs',
  'reference/semantic-oracle/registry.mjs',
  'reference/semantic-oracle/test-oracle.mjs',
  'reference/semantic-oracle/validate.mjs',
  'reference/semantic-oracle/value.mjs',
];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const showBytes = (file) => gitBytes(['show', `${commit}:${file}`]);
const same = (left, right, label) => {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label} mismatch: ${JSON.stringify(left)}`);
  }
};

gitText(['diff', '--check', `${commit}^`, commit]);
const changed = gitText(['diff-tree', '--no-commit-id', '--name-only', '-r', commit])
  .trim()
  .split('\n')
  .filter(Boolean)
  .sort();
same(changed, [...artifactPaths].sort(), 'artifact scope');

const files = Object.fromEntries(artifactPaths.map((file) => [file, showBytes(file)]));
for (const [file, bytes] of Object.entries(files)) {
  const source = bytes.toString('utf8');
  if (!source.endsWith('\n')) throw new Error(`${file}: missing terminal newline`);
  for (const [index, line] of source.split('\n').entries()) {
    if (/[ \t]+$/.test(line)) throw new Error(`${file}:${index + 1}: trailing whitespace`);
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
    if (target === '..' || target.startsWith('../')) throw new Error(`${file}: link escape ${rawTarget}`);
    gitText(['cat-file', '-e', `${commit}:${target}`]);
  }
}

const report = JSON.parse(files['fixtures/semantic/oracle-report-v1.json']);
same(report.counts, { fixtures: 17, steps: 313, passed: 313, failed: 0, skipped: 0 }, 'report counts');
same(
  report.action_counts,
  { command: 15, raw_input: 18, value_operation: 280 },
  'action counts',
);
if (
  report.report_schema !== 'helix.semantic-oracle-report/1' ||
  report.oracle.profile !== 'helix-reference-oracle/1' ||
  report.oracle.version !== '1.0.0' ||
  report.fixture_schema !== 'helix.semantic-fixture/1' ||
  report.semantic_profile !== 'helix-native-v1' ||
  report.corpus_manifest_sha256 !== 'ff4088a1d791dabb8ecc6ffd885f3d08c09c55e1a08871312163d915e6b843e8' ||
  report.verdict !== 'pass'
) throw new Error('oracle report identity mismatch');
if (Object.keys(report.operation_counts).length !== 19) throw new Error('operation count breadth');
if (Object.values(report.operation_counts).reduce((sum, count) => sum + count, 0) !== 313) {
  throw new Error('operation totals');
}
if (report.fixtures.length !== 17) throw new Error('fixture report count');
same(
  report.fixtures.map((entry) => entry.id),
  [...report.fixtures.map((entry) => entry.id)].sort(),
  'report fixture order',
);
for (const entry of report.fixtures) {
  if (
    entry.passed !== entry.steps ||
    entry.failed !== 0 ||
    entry.skipped !== 0 ||
    !/^[0-9a-f]{64}$/.test(entry.observations_sha256)
  ) throw new Error(`${entry.id}: invalid observation result`);
}

const reportSchema = JSON.parse(
  files['fixtures/semantic/schema/semantic-oracle-report-v1.schema.json'],
);
if (
  reportSchema.$schema !== 'https://json-schema.org/draft/2020-12/schema' ||
  reportSchema.$id !== 'urn:helix-db:schema:semantic-oracle-report:1' ||
  reportSchema.additionalProperties !== false
) throw new Error('oracle report schema identity');
for (const ref of [...JSON.stringify(reportSchema).matchAll(/"\$ref":"([^"]+)"/g)].map((match) => match[1])) {
  if (!ref.startsWith('#/$defs/') || !reportSchema.$defs[ref.slice(8)]) {
    throw new Error(`nonlocal/broken report schema ref ${ref}`);
  }
}

const modulePaths = artifactPaths.filter((file) => file.endsWith('.mjs'));
const moduleSource = modulePaths.map((file) => files[file].toString('utf8')).join('\n');
for (const forbidden of [
  "from '../../fixtures",
  'generate-corpus',
  'check-corpus',
  'fixture-jcs',
  'schema/check-semantic',
  'localeCompare',
  'Math.random',
  'Date.now',
  'new Date',
  'process.env',
  'fetch(',
  'eval(',
  'new Function',
]) {
  if (moduleSource.includes(forbidden)) throw new Error(`oracle independence/ambient violation: ${forbidden}`);
}
const oracleSource = files['reference/semantic-oracle/oracle.mjs'].toString('utf8');
const executionSection = oracleSource.slice(
  oracleSource.indexOf('const executeAction'),
  oracleSource.indexOf('const subset'),
);
if (executionSection.includes('expect')) throw new Error('action execution reads expectations');
if (!oracleSource.includes('executeAction(step.action, sandbox)')) {
  throw new Error('runner does not isolate action from expectation');
}
if (!oracleSource.includes('compareExpectation(step.expect, actual, preState, postState)')) {
  throw new Error('expectation is absent from final comparison layer');
}

const requiredDocumentationMarkers = [
  ['reference/semantic-oracle/README.md', 'Independence boundary'],
  ['reference/semantic-oracle/README.md', 'Validation and execution layers'],
  ['reference/semantic-oracle/README.md', 'Implemented action surface'],
  ['reference/semantic-oracle/README.md', 'Deterministic report'],
  ['reference/semantic-oracle/README.md', 'Security and resource behavior'],
  ['docs/quality/semantic-fixture-format.md', 'Independent reference oracle'],
  ['Specifications.md', 'helix.semantic-oracle-report/1'],
  ['fixtures/semantic/COVERAGE.md', 'agrees with all 313 committed expectations'],
];
for (const [file, marker] of requiredDocumentationMarkers) {
  if (!files[file].toString('utf8').includes(marker)) throw new Error(`${file}: missing ${marker}`);
}

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p01-020-'));
try {
  const dependencyPaths = gitText([
    'ls-tree',
    '-r',
    '--name-only',
    commit,
    '--',
    'fixtures/semantic',
    'reference/semantic-oracle',
  ])
    .trim()
    .split('\n')
    .filter(Boolean);
  const supportingPaths = [
    'docs/architecture/error-semantics.md',
    'docs/architecture/limits-v1.md',
  ];
  for (const file of [...dependencyPaths, ...supportingPaths]) {
    const target = path.join(temporary, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, showBytes(file));
  }

  for (const file of dependencyPaths.filter((entry) => entry.startsWith('reference/') && entry.endsWith('.mjs'))) {
    execFileSync('node', ['--check', file], { cwd: temporary, encoding: 'utf8' });
  }
  const runNode = (script, args = [], options = {}) =>
    execFileSync('node', [script, ...args], {
      cwd: temporary,
      encoding: 'utf8',
      ...options,
    }).trim();
  const tests = runNode('reference/semantic-oracle/test-oracle.mjs');
  for (const marker of [
    'PASS oracle unit/property/negative tests: 382 assertions',
    'PASS expectation mutation canaries: value, error, order, state',
    'PASS semantic oracle corpus: 17 fixtures, 313 passed, 0 failed, 0 skipped',
  ]) if (!tests.includes(marker)) throw new Error(`test output missing ${marker}`);

  const cli = runNode('reference/semantic-oracle/cli.mjs', ['--check-report']);
  for (const marker of [
    'PASS oracle: 17 fixtures, 313 steps, 313 passed, 0 failed, 0 skipped',
    'PASS actions: command=15 raw_input=18 value_operation=280',
    'PASS corpus manifest: ff4088a1d791dabb8ecc6ffd885f3d08c09c55e1a08871312163d915e6b843e8',
    'PASS oracle report: 155dc909a2a5133e1807937f745c3d2ff7ca7d5882529c3de55fe1a1197fac84',
  ]) if (!cli.includes(marker)) throw new Error(`CLI output missing ${marker}`);

  const printed = runNode('reference/semantic-oracle/cli.mjs', ['--print-report']);
  same(JSON.parse(printed), report, 'printed report');
  const committedReport = readFileSync(
    path.join(temporary, 'fixtures/semantic/oracle-report-v1.json'),
    'utf8',
  );
  if (`${printed}\n` !== committedReport) throw new Error('printed/committed report byte drift');

  for (const environment of [
    { TZ: 'Pacific/Kiritimati', LANG: 'C', LC_ALL: 'C' },
    { TZ: 'America/Los_Angeles', LANG: 'tr_TR.UTF-8', LC_ALL: 'C' },
  ]) {
    const output = runNode('reference/semantic-oracle/cli.mjs', ['--check-report'], {
      env: { ...process.env, ...environment },
    });
    if (!output.includes('PASS oracle report: 155dc909a2a5133e1807937f745c3d2ff7ca7d5882529c3de55fe1a1197fac84')) {
      throw new Error(`environment drift ${JSON.stringify(environment)}`);
    }
  }

  const generation = runNode('fixtures/semantic/generate-corpus.mjs', ['--check']);
  const corpus = runNode('fixtures/semantic/check-corpus.mjs');
  const examples = runNode('fixtures/semantic/schema/check-semantic-examples.mjs');
  const canonical = runNode('fixtures/semantic/schema/check-canonical-examples.mjs');
  if (!generation.includes('PASS corpus generation: 17 fixtures, 313 steps, 183 successes, 130 errors')) {
    throw new Error('generator replay failed');
  }
  if (!corpus.includes('PASS boundaries/registry: 23 limits x3 and 74 documented error codes')) {
    throw new Error('corpus replay failed');
  }
  if (!examples.includes('PASS semantic examples: 4 accepted; 3 rejected with exact rules')) {
    throw new Error('semantic example replay failed');
  }
  if (!canonical.includes('PASS canonical examples: 4 stable source/canonical hashes')) {
    throw new Error('canonical example replay failed');
  }

  const pythonProgram = String.raw`
import glob,json,sys
from jsonschema import Draft202012Validator
root=sys.argv[1]
schemas=sorted(glob.glob(root+'/fixtures/semantic/schema/*schema.json'))
if len(schemas)!=3: raise SystemExit(f'expected 3 schemas, got {len(schemas)}')
values={}
for p in schemas:
  with open(p,encoding='utf-8') as f: schema=json.load(f)
  Draft202012Validator.check_schema(schema)
  values[p]=schema
fixture_schema=values[root+'/fixtures/semantic/schema/semantic-fixture-v1.schema.json']
manifest_schema=values[root+'/fixtures/semantic/schema/semantic-corpus-manifest-v1.schema.json']
report_schema=values[root+'/fixtures/semantic/schema/semantic-oracle-report-v1.schema.json']
cases=sorted(glob.glob(root+'/fixtures/semantic/cases/**/*.json',recursive=True))
for p in cases:
  with open(p,encoding='utf-8') as f: value=json.load(f)
  errors=list(Draft202012Validator(fixture_schema).iter_errors(value))
  if errors: raise SystemExit(f'{p}: {errors[0].message}')
for relative,schema in [('manifest.json',manifest_schema),('oracle-report-v1.json',report_schema)]:
  with open(root+'/fixtures/semantic/'+relative,encoding='utf-8') as f: value=json.load(f)
  errors=list(Draft202012Validator(schema).iter_errors(value))
  if errors: raise SystemExit(f'{relative}: {errors[0].message}')
print('PASS Draft 2020-12: 3 schemas, 17 cases, manifest, oracle report')
`;
  const python = execFileSync('python3', ['-c', pythonProgram, temporary], {
    encoding: 'utf8',
  }).trim();

  console.log(python);
  console.log(tests);
  console.log(cli);
  console.log(generation);
  console.log(corpus);
  console.log(examples);
  console.log(canonical);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact 21-file artifact scope at ${commit}`);
console.log('PASS independent executor boundary and no forbidden generator/runtime/ambient imports');
console.log('PASS deterministic report bytes under two alternate TZ/LANG environments');
for (const file of artifactPaths) {
  console.log(`ARTIFACT ${file} ${sha256(files[file])} ${files[file].length}`);
}
const verifierBytes = readFileSync(fileURLToPath(import.meta.url));
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

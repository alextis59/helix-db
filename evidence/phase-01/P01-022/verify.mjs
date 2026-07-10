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
if (!input) throw new Error('usage: node evidence/phase-01/P01-022/verify.mjs <commit>');

const gitText = (args, options = {}) =>
  execFileSync('git', args, { encoding: 'utf8', ...options });
const gitBytes = (args, options = {}) => execFileSync('git', args, options);
const commit = gitText(['rev-parse', `${input}^{commit}`]).trim();
const artifactPaths = [
  'README.md',
  'Specifications.md',
  'Study.md',
  'compatibility/v1/README.md',
  'compatibility/v1/check-matrix.mjs',
  'compatibility/v1/generate-matrix.mjs',
  'compatibility/v1/matrix-v1.json',
  'compatibility/v1/schema/matrix-v1.schema.json',
  'differential/mongodb/README.md',
  'docs/README.md',
  'docs/architecture/operator-semantics.md',
  'docs/compatibility/mongodb-initial-differential.md',
  'docs/compatibility/v1-semantic-compatibility-matrix.md',
  'docs/governance/requirements.md',
  'docs/governance/scope.md',
  'fixtures/semantic/COVERAGE.md',
];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const showBytes = (file) => gitBytes(['show', `${commit}:${file}`]);
const same = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};

gitText(['diff', '--check', `${commit}^`, commit]);
const changed = gitText(['diff-tree', '--no-commit-id', '--name-only', '-r', commit])
  .trim()
  .split('\n')
  .filter(Boolean)
  .sort();
same(changed, [...artifactPaths].sort(), 'artifact commit scope');

const files = Object.fromEntries(artifactPaths.map((file) => [file, showBytes(file)]));
for (const [file, bytes] of Object.entries(files)) {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!source.isWellFormed()) throw new Error(`${file}: invalid Unicode scalar sequence`);
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
    if (target === '..' || target.startsWith('../')) {
      throw new Error(`${file}: local link escapes repository: ${rawTarget}`);
    }
    gitText(['cat-file', '-e', `${commit}:${target}`]);
  }
}

const matrix = JSON.parse(files['compatibility/v1/matrix-v1.json']);
const schema = JSON.parse(files['compatibility/v1/schema/matrix-v1.schema.json']);
const document = files['docs/compatibility/v1-semantic-compatibility-matrix.md'].toString('utf8');
if (
  matrix.matrix_schema !== 'helix.semantic-compatibility-matrix/1' ||
  matrix.matrix_version !== '1.0.0' ||
  matrix.semantic_profile !== 'helix-native-v1' ||
  matrix.publication_status !== 'foundation_semantic_baseline' ||
  matrix.verdict !== 'pass'
) throw new Error('matrix identity/verdict mismatch');
same(matrix.requirements, [
  'COMPAT-001', 'DATA-001', 'DATA-002', 'INV-010', 'QUERY-001', 'QUERY-002',
], 'matrix requirements');
same(matrix.counts, {
  native_rows: 263,
  native_by_status: {
    contract_only: 56,
    deferred_post_v1: 12,
    explicitly_unsupported_v1: 39,
    oracle_boundary: 23,
    oracle_command: 17,
    oracle_executable: 41,
    oracle_primitive: 1,
    oracle_registry: 74,
  },
  mongodb_experimental_cases: 16,
  mongodb_experimental_by_relation: { different: 4, exact: 12 },
  mongodb_adapter_supported: 0,
  mongodb_unsupported_rows: 56,
  redis_adapter_supported: 0,
  redis_unsupported_rows: 33,
  failed: 0,
  skipped: 0,
}, 'matrix counts');
same(matrix.claims, {
  native_product_status: 'not_implemented',
  unlisted_native_behavior: 'unsupported',
  native_unknown_behavior_error_profile: 'errors-v1',
  mongodb_product_claim: 'prohibited',
  mongodb_adapter_status: 'not_implemented',
  mongodb_wire_versions: [],
  mongodb_driver_versions: [],
  exact_differential_relation_implies_adapter_support: false,
  unlisted_mongodb_behavior: 'unsupported',
  current_unsupported_behavior: 'no_adapter_endpoint',
  required_future_default_error: 'CAP_UNSUPPORTED_FEATURE',
  redis_product_claim: 'prohibited',
  redis_adapter_status: 'not_implemented',
  redis_wire_versions: [],
  redis_client_versions: [],
  unlisted_redis_behavior: 'unsupported',
}, 'closed-world claims');
same(matrix.references.redis, {
  status: 'not_tested',
  reference_product: 'none',
  reference_version: null,
  protocol_versions: [],
}, 'Redis reference status');
if (
  matrix.references.mongodb.profile !== 'mongodb-6.0.5-initial-v1' ||
  matrix.references.mongodb.server_version !== '6.0.5' ||
  matrix.references.mongodb.client_version !== '1.8.0' ||
  matrix.references.mongodb.harness_version !== '1.0.1'
) throw new Error('MongoDB reference identity mismatch');
if (
  matrix.native_rows.some((row) => !['reference_only', 'not_implemented', 'not_applicable'].includes(row.implementation_status)) ||
  matrix.mongodb_experimental_cases.some((row) => row.adapter_status !== 'unsupported') ||
  matrix.mongodb_unsupported.some((row) => row.adapter_status !== 'unsupported') ||
  matrix.redis_unsupported.some((row) => row.adapter_status !== 'unsupported')
) throw new Error('matrix contains an unauthorized implementation/adapter state');
if (
  matrix.mongodb_experimental_cases.some((row) => row.test_status !== 'pass') ||
  matrix.counts.failed !== 0 ||
  matrix.counts.skipped !== 0
) throw new Error('matrix contains a failed or skipped row');
if (
  schema.$schema !== 'https://json-schema.org/draft/2020-12/schema' ||
  schema.$id !== 'urn:helix-db:schema:semantic-compatibility-matrix:1' ||
  schema.additionalProperties !== false
) throw new Error('matrix schema identity mismatch');

const matrixHash = sha256(files['compatibility/v1/matrix-v1.json']);
const documentHash = sha256(files['docs/compatibility/v1-semantic-compatibility-matrix.md']);
if (matrixHash !== '1f116e0e6702526854d22c4e473530817139ca36f7423653ecc76c8324916a60') {
  throw new Error('matrix source hash mismatch');
}
if (documentHash !== 'c64d0421eac5a1d678dd5c716cc6f791f3774af13ba93b1f10a199cb1c7ae1d2') {
  throw new Error('generated document hash mismatch');
}
for (const marker of [
  'Currently supported MongoDB adapter rows: 0',
  'Currently supported Redis adapter rows: 0',
  'Every unlisted native, MongoDB, and Redis behavior is unsupported',
  'Failed experimental rows: 0; skipped rows: 0',
]) if (!document.includes(marker)) throw new Error(`document claim marker absent: ${marker}`);

const generatorSource = files['compatibility/v1/generate-matrix.mjs'].toString('utf8');
const checkerSource = files['compatibility/v1/check-matrix.mjs'].toString('utf8');
if (checkerSource.includes('generate-matrix')) throw new Error('independent checker imports/references generator');
for (const forbidden of [
  'Math.random', 'Date.now', 'new Date', 'localeCompare', 'toLocaleString',
  'fetch(', 'eval(', 'new Function', 'shell: true',
]) {
  if (`${generatorSource}\n${checkerSource}`.includes(forbidden)) {
    throw new Error(`matrix ambient/unsafe source marker: ${forbidden}`);
  }
}
for (const marker of [
  'PASS matrix mutation canaries: native, claim, adapter, input, MongoDB, Redis, skip',
  'expectedRedisUnsupportedIds',
  'expectedStatus',
  'Draft202012Validator',
]) if (!checkerSource.includes(marker)) throw new Error(`checker marker absent: ${marker}`);

const documentationMarkers = [
  ['README.md', 'V1 semantic and compatibility matrix'],
  ['Specifications.md', 'helix.semantic-compatibility-matrix/1'],
  ['Study.md', 'versioned closed-world semantic/compatibility matrix'],
  ['compatibility/v1/README.md', 'four questions that must never be collapsed'],
  ['differential/mongodb/README.md', 'adapter support still `unsupported`'],
  ['docs/governance/scope.md', 'zero MongoDB adapter rows'],
  ['fixtures/semantic/COVERAGE.md', 'closed-world unsupported rule'],
];
for (const [file, marker] of documentationMarkers) {
  if (!files[file].toString('utf8').includes(marker)) throw new Error(`${file}: missing ${marker}`);
}

const existingContainers = () => execFileSync(
  'docker',
  ['ps', '-a', '--filter', 'name=helix-p01-021', '--format', '{{.Names}}'],
  { encoding: 'utf8', timeout: 10_000 },
).trim();
if (existingContainers()) throw new Error('residual differential container exists before replay');

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p01-022-'));
try {
  const dependencyPaths = gitText([
    'ls-tree',
    '-r',
    '--name-only',
    commit,
    '--',
    'compatibility/v1',
    'differential/mongodb',
    'docs/architecture',
    'docs/compatibility/v1-semantic-compatibility-matrix.md',
    'docs/governance',
    'docs/templates',
    'fixtures/semantic',
    'reference/semantic-oracle',
  ])
    .trim()
    .split('\n')
    .filter(Boolean);
  for (const file of [...dependencyPaths, 'Specifications.md']) {
    const target = path.join(temporary, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, showBytes(file));
  }

  for (const file of dependencyPaths.filter((entry) => /\.(?:mjs|js)$/.test(entry))) {
    execFileSync('node', ['--check', file], { cwd: temporary, encoding: 'utf8' });
  }
  const runNode = (script, args = [], options = {}) => execFileSync(
    'node',
    [script, ...args],
    {
      cwd: temporary,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: 120_000,
      ...options,
    },
  ).trim();
  const requireMarkers = (output, markers, label) => {
    for (const marker of markers) {
      if (!output.includes(marker)) throw new Error(`${label}: output missing ${marker}`);
    }
  };

  const environmentProfiles = [
    { TZ: 'Pacific/Kiritimati', LANG: 'C', LC_ALL: 'C' },
    { TZ: 'America/Los_Angeles', LANG: 'tr_TR.UTF-8', LC_ALL: 'C' },
  ];
  const generationOutputs = environmentProfiles.map((environment) =>
    runNode('compatibility/v1/generate-matrix.mjs', ['--check'], {
      env: { ...process.env, ...environment },
    }));
  same(generationOutputs[0], generationOutputs[1], 'generator output across environments');
  requireMarkers(generationOutputs[0], [
    'PASS semantic compatibility matrix: 263 native rows, 16 MongoDB cases, 56 MongoDB unsupported, 33 Redis unsupported',
    'PASS matrix inputs: 9 hash-bound artifacts',
    'PASS matrix verdict: pass, 0 failed, 0 skipped',
  ], 'matrix generation');

  const matrixCheck = runNode('compatibility/v1/check-matrix.mjs');
  requireMarkers(matrixCheck, [
    'PASS matrix integrity: 263 native rows, 16 MongoDB cases, 56 MongoDB unsupported, 33 Redis unsupported',
    'PASS registry reconciliation: 16 values, 17 primitives, 23 limits, 74 errors',
    'PASS matrix mutation canaries: native, claim, adapter, input, MongoDB, Redis, skip',
    'PASS matrix source: 1f116e0e6702526854d22c4e473530817139ca36f7423653ecc76c8324916a60 217132 bytes',
    'PASS generated document: c64d0421eac5a1d678dd5c716cc6f791f3774af13ba93b1f10a199cb1c7ae1d2 103065 bytes',
  ], 'matrix checker');

  for (const [script, args] of [
    ['compatibility/v1/generate-matrix.mjs', ['--unknown']],
    ['compatibility/v1/check-matrix.mjs', ['unexpected']],
  ]) {
    try {
      execFileSync('node', [script, ...args], { cwd: temporary, stdio: 'ignore', timeout: 10_000 });
    } catch {
      continue;
    }
    throw new Error(`${script}: unsafe arguments accepted`);
  }

  const oracleTests = runNode('reference/semantic-oracle/test-oracle.mjs');
  const oracle = runNode('reference/semantic-oracle/cli.mjs', ['--check-report']);
  const corpusGeneration = runNode('fixtures/semantic/generate-corpus.mjs', ['--check']);
  const corpus = runNode('fixtures/semantic/check-corpus.mjs');
  requireMarkers(oracleTests, [
    'PASS oracle unit/property/negative tests: 382 assertions',
    'PASS semantic oracle corpus: 17 fixtures, 313 passed, 0 failed, 0 skipped',
  ], 'oracle tests');
  requireMarkers(oracle, [
    'PASS oracle: 17 fixtures, 313 steps, 313 passed, 0 failed, 0 skipped',
  ], 'oracle report');
  requireMarkers(corpusGeneration, [
    'PASS corpus generation: 17 fixtures, 313 steps, 183 successes, 130 errors',
  ], 'corpus generation');
  requireMarkers(corpus, [
    'PASS boundaries/registry: 23 limits x3 and 74 documented error codes',
  ], 'corpus integrity');

  const differentialArtifacts = runNode('differential/mongodb/check-artifacts.mjs');
  const differential = runNode('differential/mongodb/run.mjs', ['--check-report']);
  requireMarkers(differentialArtifacts, [
    'PASS MongoDB differential artifacts: 3 schemas, 16 cases, 0 failed, 0 skipped',
  ], 'differential artifacts');
  requireMarkers(differential, [
    'PASS MongoDB differential: 16 cases, 12 exact, 4 deliberate differences, 0 failed, 0 skipped',
    'PASS report: 22173d344e6b894444b53f2ff158b7d1cf6cf6c2a0c916deff58e1b2ad1ed8e5',
  ], 'live differential');

  for (const file of [
    'compatibility/v1/matrix-v1.json',
    'docs/compatibility/v1-semantic-compatibility-matrix.md',
  ]) {
    if (sha256(readFileSync(path.join(temporary, file))) !== sha256(files[file])) {
      throw new Error(`${file}: replay modified generated artifact`);
    }
  }
  if (existingContainers()) throw new Error('residual differential container exists after replay');

  console.log(generationOutputs[0]);
  console.log(matrixCheck);
  console.log(oracleTests);
  console.log(oracle);
  console.log(corpusGeneration);
  console.log(corpus);
  console.log(differentialArtifacts);
  console.log(differential);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

if (existingContainers()) throw new Error('residual differential container exists after cleanup');
console.log(`PASS exact 16-file artifact scope at ${commit}`);
console.log('PASS three closed-world rules and zero MongoDB/Redis adapter support');
console.log('PASS deterministic matrix/document bytes under two alternate TZ/LANG environments');
for (const file of artifactPaths) {
  console.log(`ARTIFACT ${file} ${sha256(files[file])} ${files[file].length}`);
}
const verifierBytes = readFileSync(fileURLToPath(import.meta.url));
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

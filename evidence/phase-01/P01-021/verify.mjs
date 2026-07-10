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
if (!input) throw new Error('usage: node evidence/phase-01/P01-021/verify.mjs <commit>');

const gitText = (args, options = {}) =>
  execFileSync('git', args, { encoding: 'utf8', ...options });
const gitBytes = (args, options = {}) => execFileSync('git', args, options);
const commit = gitText(['rev-parse', `${input}^{commit}`]).trim();
const initialArtifactCommit = '26b0b2634f6988ed9b9ae362d7239ec6e78423bd';
const artifactPaths = [
  'README.md',
  'Specifications.md',
  'Study.md',
  'differential/mongodb/README.md',
  'differential/mongodb/cases-v1.json',
  'differential/mongodb/check-artifacts.mjs',
  'differential/mongodb/ejson.mjs',
  'differential/mongodb/mongosh-runner.js',
  'differential/mongodb/report-v1.json',
  'differential/mongodb/run.mjs',
  'differential/mongodb/schema/cases-v1.schema.json',
  'differential/mongodb/schema/observations-v1.schema.json',
  'differential/mongodb/schema/report-v1.schema.json',
  'differential/mongodb/upstream-observations-v1.json',
  'docs/README.md',
  'docs/adr/0002-exact-numeric-semantics.md',
  'docs/adr/0005-explicit-array-matching.md',
  'docs/compatibility/mongodb-initial-differential.md',
  'docs/governance/requirements.md',
  'fixtures/semantic/COVERAGE.md',
];
const stabilizationPaths = [
  'differential/mongodb/README.md',
  'differential/mongodb/cases-v1.json',
  'differential/mongodb/report-v1.json',
  'differential/mongodb/run.mjs',
  'differential/mongodb/schema/cases-v1.schema.json',
  'differential/mongodb/schema/report-v1.schema.json',
  'differential/mongodb/upstream-observations-v1.json',
  'docs/compatibility/mongodb-initial-differential.md',
];
const expectedCaseIds = [
  'array.all.direct',
  'array.elem-match.direct',
  'array.scalar-equality.direct',
  'array.scalar-equality.rewrite',
  'array.size.direct',
  'array.whole-equality.direct',
  'missing.exists-false.direct',
  'missing.exists-true.direct',
  'missing.null-equality.direct',
  'missing.null-equality.rewrite',
  'numeric.cross-width-equality.direct',
  'object.field-order-equality.direct',
  'path.nested-range.direct',
  'projection.exclude-id.direct',
  'sort.explicit-stable.direct',
  'string.binary-equality.direct',
];
const expectedDifferent = [
  'array.scalar-equality.direct',
  'array.whole-equality.direct',
  'missing.null-equality.direct',
  'object.field-order-equality.direct',
];
const expectedRewrites = [
  'array.scalar-equality.rewrite',
  'missing.null-equality.rewrite',
];
const expectedSources = [
  'https://www.mongodb.com/docs/v6.0/reference/bson-type-comparison-order/',
  'https://www.mongodb.com/docs/v6.0/reference/operator/aggregation/sort/',
  'https://www.mongodb.com/docs/v6.0/reference/operator/query/all/',
  'https://www.mongodb.com/docs/v6.0/reference/operator/query/elemmatch/',
  'https://www.mongodb.com/docs/v6.0/reference/operator/query/size/',
  'https://www.mongodb.com/docs/v6.0/tutorial/project-fields-from-query-results/',
  'https://www.mongodb.com/docs/v6.0/tutorial/query-arrays/',
  'https://www.mongodb.com/docs/v6.0/tutorial/query-for-null-fields/',
];
const expectedUpstream = {
  product: 'MongoDB Community Server',
  version: '6.0.5',
  git_version: 'c9a99c120371d4d4c52cbb15dac34a36ce8d3b1d',
  feature_compatibility_version: '6.0',
  max_wire_version: 17,
  modules: [],
  image: 'mongo@sha256:928347070dc089a596f869a22a4204c0feace3eb03470a6a2de6814f11fb7309',
  image_id: 'sha256:8b33e239cde686e9378f9d8941eafa167fdf73527e9e006ab1fe9174c9622797',
};
const expectedCounts = {
  cases: 16,
  expected_exact: 12,
  expected_different: 4,
  observed_exact: 12,
  observed_different: 4,
  direct: 14,
  adapter_rewrite: 2,
  passed: 16,
  failed: 0,
  skipped: 0,
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const showBytes = (file) => gitBytes(['show', `${commit}:${file}`]);
const same = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};

gitText(['merge-base', '--is-ancestor', initialArtifactCommit, commit]);
gitText(['diff', '--check', `${initialArtifactCommit}^`, initialArtifactCommit]);
const initialChanged = gitText([
  'diff-tree',
  '--no-commit-id',
  '--name-only',
  '-r',
  initialArtifactCommit,
])
  .trim()
  .split('\n')
  .filter(Boolean)
  .sort();
same(initialChanged, [...artifactPaths].sort(), 'initial artifact commit scope');
gitText(['diff', '--check', `${commit}^`, commit]);
const stabilizationChanged = gitText([
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
same(stabilizationChanged, [...stabilizationPaths].sort(), 'stabilization commit scope');

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

const parse = (file) => JSON.parse(files[file].toString('utf8'));
const cases = parse('differential/mongodb/cases-v1.json');
const observations = parse('differential/mongodb/upstream-observations-v1.json');
const report = parse('differential/mongodb/report-v1.json');
if (
  cases.cases_schema !== 'helix.mongodb-differential-cases/1' ||
  cases.profile !== 'mongodb-6.0.5-initial-v1' ||
  cases.harness_version !== '1.0.1'
) throw new Error('case profile identity mismatch');
same(cases.client, { product: 'MongoDB Shell', version: '1.8.0' }, 'case client');
same(cases.sources, expectedSources, 'MongoDB source inventory');
same(cases.cases.map((entry) => entry.id), expectedCaseIds, 'case inventory');
same(
  cases.cases.filter((entry) => entry.expected_relation === 'different').map((entry) => entry.id),
  expectedDifferent,
  'declared differences',
);
same(
  cases.cases.filter((entry) => entry.translation === 'adapter_rewrite').map((entry) => entry.id),
  expectedRewrites,
  'declared rewrites',
);
if (cases.datasets.length !== 1 || cases.datasets[0].documents.length !== 6) {
  throw new Error('dataset breadth mismatch');
}

same(report.counts, expectedCounts, 'report counts');
same(report.client, cases.client, 'report client');
same(report.upstream, expectedUpstream, 'report upstream');
same(observations.upstream, expectedUpstream, 'observation upstream');
same(observations.client, cases.client, 'observation client');
same(observations.cases.map((entry) => entry.id), expectedCaseIds, 'observation inventory');
same(report.cases.map((entry) => entry.id), expectedCaseIds, 'report inventory');
if (report.verdict !== 'pass' || report.cases.some((entry) => entry.status !== 'pass')) {
  throw new Error('differential report is not a complete pass');
}
same(
  report.cases.filter((entry) => entry.observed_relation === 'different').map((entry) => entry.id),
  expectedDifferent,
  'observed differences',
);
same(
  report.cases.filter((entry) => entry.translation === 'adapter_rewrite').map((entry) => entry.id),
  expectedRewrites,
  'observed rewrites',
);

const casesBytes = files['differential/mongodb/cases-v1.json'];
const observationBytes = files['differential/mongodb/upstream-observations-v1.json'];
const reportBytes = files['differential/mongodb/report-v1.json'];
if (sha256(casesBytes) !== 'c848f62c41ab817c4d29fcfe64ffb9aa3f6da9973f18402e5e7470eaa0fbfcc5') {
  throw new Error('case source hash mismatch');
}
if (
  observationBytes.length !== 34_775 ||
  sha256(observationBytes) !== '462b9c239c222dcba3f7b0371e9afccb0c556238d5197b8b196ab1183586dfc8'
) throw new Error('observation source identity mismatch');
if (sha256(reportBytes) !== '6a04b5d3cf93662ed9727de9dd5753d646acff12b914b785f6604cd61ef5b019') {
  throw new Error('report source hash mismatch');
}
same(report.inputs, {
  cases_path: 'differential/mongodb/cases-v1.json',
  cases_sha256: sha256(casesBytes),
  corpus_manifest_sha256: 'ff4088a1d791dabb8ecc6ffd885f3d08c09c55e1a08871312163d915e6b843e8',
  oracle_report_sha256: '8427fc0d3a5e3c09fc9d4c89018822898b45f94b7a9abaef659b6ba9607d8d1f',
}, 'report inputs');
same(report.observations, {
  path: 'differential/mongodb/upstream-observations-v1.json',
  bytes: observationBytes.length,
  sha256: sha256(observationBytes),
}, 'report observation binding');
if (observations.cases_source_sha256 !== sha256(casesBytes)) {
  throw new Error('observation case binding mismatch');
}

for (const schemaFile of [
  'differential/mongodb/schema/cases-v1.schema.json',
  'differential/mongodb/schema/observations-v1.schema.json',
  'differential/mongodb/schema/report-v1.schema.json',
]) {
  const schema = parse(schemaFile);
  if (
    schema.$schema !== 'https://json-schema.org/draft/2020-12/schema' ||
    schema.additionalProperties !== false ||
    !schema.$id.startsWith('urn:helix-db:schema:mongodb-')
  ) throw new Error(`${schemaFile}: schema identity mismatch`);
}

const sourceText = [
  'differential/mongodb/check-artifacts.mjs',
  'differential/mongodb/ejson.mjs',
  'differential/mongodb/mongosh-runner.js',
  'differential/mongodb/run.mjs',
].map((file) => files[file].toString('utf8')).join('\n');
for (const forbidden of [
  'shell: true',
  'Math.random',
  'Date.now',
  'new Date',
  'localeCompare',
  'fetch(',
  'eval(',
  'new Function',
]) {
  if (sourceText.includes(forbidden)) throw new Error(`ambient/unsafe source marker: ${forbidden}`);
}
const runnerSource = files['differential/mongodb/run.mjs'].toString('utf8');
for (const required of [
  "'--pull=never'",
  "'--read-only'",
  "'--cap-drop=ALL'",
  "'127.0.0.1::27017'",
  "'/data/db:rw,noexec,nosuid,size=512m",
  "'--memory=1g'",
  "'--nojournal'",
  "'--wiredTigerCacheSizeGB'",
  "'diagnosticDataCollectionEnabled=false'",
  "'--canary-expected-relation'",
  "['rm', '--force', containerName]",
  'timeout: 30_000',
]) {
  if (!runnerSource.includes(required)) throw new Error(`runner safety marker absent: ${required}`);
}
const shellSource = files['differential/mongodb/mongosh-runner.js'].toString('utf8');
for (const required of [
  "databaseName.startsWith('helix_p01_021_')",
  'cursor.maxTimeMS(5000)',
  'db.dropDatabase()',
]) {
  if (!shellSource.includes(required)) throw new Error(`mongosh safety marker absent: ${required}`);
}

const documentationMarkers = [
  ['README.md', 'initial MongoDB differential harness'],
  ['Specifications.md', 'mongodb-6.0.5-initial-v1'],
  ['Study.md', '`EXP-013` initial observation'],
  ['differential/mongodb/README.md', '12 expected exact matches'],
  ['docs/compatibility/mongodb-initial-differential.md', 'No MongoDB-compatible product or protocol claim'],
  ['docs/governance/requirements.md', 'Initial MongoDB 6.0.5 differential report'],
  ['fixtures/semantic/COVERAGE.md', 'passes 16/16 declared relations'],
];
for (const [file, marker] of documentationMarkers) {
  if (!files[file].toString('utf8').includes(marker)) throw new Error(`${file}: missing ${marker}`);
}

const existingContainers = () => execFileSync(
  'docker',
  ['ps', '-a', '--filter', 'name=helix-p01-021', '--format', '{{.Names}}'],
  { encoding: 'utf8', timeout: 10_000 },
).trim();
if (existingContainers()) throw new Error('residual P01-021 container exists before evidence replay');

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p01-021-'));
try {
  const dependencyPaths = gitText([
    'ls-tree',
    '-r',
    '--name-only',
    commit,
    '--',
    'differential/mongodb',
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

  const syntaxPaths = dependencyPaths.filter((file) => /\.(?:mjs|js)$/.test(file));
  for (const file of syntaxPaths) {
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

  const oracleTests = runNode('reference/semantic-oracle/test-oracle.mjs');
  requireMarkers(oracleTests, [
    'PASS oracle unit/property/negative tests: 382 assertions',
    'PASS expectation mutation canaries: value, error, order, state',
    'PASS semantic oracle corpus: 17 fixtures, 313 passed, 0 failed, 0 skipped',
  ], 'oracle tests');
  const oracle = runNode('reference/semantic-oracle/cli.mjs', ['--check-report']);
  requireMarkers(oracle, [
    'PASS oracle: 17 fixtures, 313 steps, 313 passed, 0 failed, 0 skipped',
    'PASS oracle report: 155dc909a2a5133e1807937f745c3d2ff7ca7d5882529c3de55fe1a1197fac84',
  ], 'oracle report');
  const generation = runNode('fixtures/semantic/generate-corpus.mjs', ['--check']);
  const corpus = runNode('fixtures/semantic/check-corpus.mjs');
  requireMarkers(generation, [
    'PASS corpus generation: 17 fixtures, 313 steps, 183 successes, 130 errors',
  ], 'corpus generation');
  requireMarkers(corpus, [
    'PASS boundaries/registry: 23 limits x3 and 74 documented error codes',
  ], 'corpus integrity');

  const artifactCheck = runNode('differential/mongodb/check-artifacts.mjs');
  requireMarkers(artifactCheck, [
    'PASS MongoDB differential artifacts: 3 schemas, 16 cases, 0 failed, 0 skipped',
    'PASS artifact mutation canaries: expected relation, count, observation bytes, case order',
  ], 'artifact check');

  const environments = [
    { TZ: 'Pacific/Kiritimati', LANG: 'C', LC_ALL: 'C' },
    { TZ: 'America/Los_Angeles', LANG: 'tr_TR.UTF-8', LC_ALL: 'C' },
  ];
  const liveOutputs = [];
  for (const environment of environments) {
    const output = runNode('differential/mongodb/run.mjs', ['--check-report'], {
      env: { ...process.env, ...environment },
    });
    requireMarkers(output, [
      'PASS MongoDB differential: 16 cases, 12 exact, 4 deliberate differences, 0 failed, 0 skipped',
      'PASS upstream: MongoDB 6.0.5 git=c9a99c120371d4d4c52cbb15dac34a36ce8d3b1d wire=17',
      'PASS observations: 462b9c239c222dcba3f7b0371e9afccb0c556238d5197b8b196ab1183586dfc8 34775 bytes',
      'PASS report: 22173d344e6b894444b53f2ff158b7d1cf6cf6c2a0c916deff58e1b2ad1ed8e5',
    ], `live differential ${JSON.stringify(environment)}`);
    liveOutputs.push(output);
  }
  same(liveOutputs[0], liveOutputs[1], 'live output across environment profiles');

  const canary = runNode('differential/mongodb/run.mjs', ['--canary-expected-relation']);
  requireMarkers(canary, [
    'PASS expected-relation mutation canary detected: array.all.direct',
  ], 'live mutation canary');
  for (const args of [
    ['--unknown-option'],
    ['--write-report', '--canary-expected-relation'],
  ]) {
    try {
      execFileSync('node', ['differential/mongodb/run.mjs', ...args], {
        cwd: temporary,
        stdio: 'ignore',
        timeout: 10_000,
      });
    } catch {
      continue;
    }
    throw new Error(`unsafe CLI arguments accepted: ${args.join(' ')}`);
  }

  for (const [file, bytes] of Object.entries(files)) {
    const extracted = path.join(temporary, file);
    if (file.startsWith('differential/') && sha256(readFileSync(extracted)) !== sha256(bytes)) {
      throw new Error(`${file}: evidence replay modified committed artifact bytes`);
    }
  }
  if (existingContainers()) throw new Error('residual P01-021 container exists after evidence replay');

  console.log(oracleTests);
  console.log(oracle);
  console.log(generation);
  console.log(corpus);
  console.log(artifactCheck);
  console.log(liveOutputs[0]);
  console.log(canary);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

if (existingContainers()) throw new Error('residual P01-021 container exists after temporary cleanup');
console.log(`PASS exact 20-file initial artifact scope at ${initialArtifactCommit}`);
console.log(`PASS exact 8-file storage-stabilization scope at ${commit}`);
console.log('PASS pinned server image/client identity and complete upstream observation binding');
console.log('PASS byte-identical live report under two alternate TZ/LANG environments');
console.log('PASS bounded container lifecycle with no residual differential containers');
for (const file of artifactPaths) {
  console.log(`ARTIFACT ${file} ${sha256(files[file])} ${files[file].length}`);
}
const verifierBytes = readFileSync(fileURLToPath(import.meta.url));
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

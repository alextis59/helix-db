#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidenceDirectory = path.join(repository, 'evidence/phase-02/P02-014');
const manifest = JSON.parse(readFileSync(path.join(evidenceDirectory, 'manifest.json'), 'utf8'));
const commitArgument = process.argv[2];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sorted = (values) => [...values].sort();
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
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const gitBytes = (arguments_) =>
  execFileSync('git', arguments_, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (arguments_) => gitBytes(arguments_).toString('utf8');
const showBytes = (file, commit = manifest.commit) => gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.commit) => showBytes(file, commit).toString('utf8');

assert(commitArgument, 'usage: node evidence/phase-02/P02-014/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P02-014', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(manifest.requirements, ['INV-007', 'QUAL-001'], 'evidence requirements');
same(manifest.accepted_adrs, [], 'accepted ADR inventory');

const artifactPaths = manifest.artifacts.map(({ path: artifactPath }) => artifactPath);
same(sorted(artifactPaths), sorted(new Set(artifactPaths)), 'unique source artifact paths');
assert(manifest.artifacts.length === 33, 'source artifact count mismatch');
const changedRecords = gitText([
  'diff-tree',
  '--no-commit-id',
  '--name-status',
  '-r',
  `${commitArgument}^`,
  commitArgument,
])
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...parts] = line.split('\t');
    return { status, path: parts.at(-1) };
  });
same(
  sorted(changedRecords.map(({ path: changedPath }) => changedPath)),
  sorted(artifactPaths),
  'exact source-commit scope',
);
assert(
  changedRecords.every(({ status }) => ['A', 'M'].includes(status)),
  `source commit contains unsupported status: ${JSON.stringify(changedRecords)}`,
);
for (const artifact of manifest.artifacts) {
  const bytes = showBytes(artifact.path);
  assert(bytes.length === artifact.bytes, `${artifact.path}: byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: SHA-256 mismatch`);
}
assert(
  sha256(showBytes('package-lock.json')) ===
    sha256(showBytes('package-lock.json', `${commitArgument}^`)),
  'P02-014 changed the npm lock despite adding no dependency',
);
assert(
  sha256(showBytes('Cargo.lock')) === sha256(showBytes('Cargo.lock', `${commitArgument}^`)),
  'P02-014 changed the Cargo lock despite adding no dependency',
);

assert(manifest.retained_artifacts.length === 2, 'retained artifact count mismatch');
const retainedByPath = new Map(
  manifest.retained_artifacts.map((artifact) => [artifact.path, artifact]),
);
const rawRetained = retainedByPath.get('reports/raw.json');
const summaryRetained = retainedByPath.get('reports/summary.json');
assert(rawRetained && summaryRetained, 'retained raw/summary inventory mismatch');
const rawPath = path.join(evidenceDirectory, rawRetained.path);
const summaryPath = path.join(evidenceDirectory, summaryRetained.path);
const rawBytes = readFileSync(rawPath);
const summaryBytes = readFileSync(summaryPath);
for (const [artifact, bytes] of [
  [rawRetained, rawBytes],
  [summaryRetained, summaryBytes],
]) {
  assert(bytes.length === artifact.bytes, `${artifact.path}: retained byte count`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: retained SHA-256`);
}
const verifierPath = path.join(evidenceDirectory, 'verify.mjs');
const verifierBytes = readFileSync(verifierPath);
assert(statSync(verifierPath).size === manifest.verifier.bytes, 'verifier byte count mismatch');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256 mismatch');

const raw = JSON.parse(rawBytes);
const summary = JSON.parse(summaryBytes);
assert(rawBytes.equals(jsonBytes(raw)), 'retained raw result is not canonical pretty JSON');
assert(summaryBytes.equals(jsonBytes(summary)), 'retained summary is not canonical pretty JSON');
same(
  Object.keys(raw).sort(),
  [
    'schema',
    'plan_item',
    'recorded_at',
    'execution_id',
    'claim_boundary',
    'workload',
    'sources',
    'source_control',
    'environment',
    'configuration',
    'dataset',
    'observations',
    'totals',
    'failures',
    'verdict',
  ].sort(),
  'retained raw fields',
);
assert(raw.schema === 'helix.benchmark-raw-result/1', 'retained raw schema');
assert(raw.plan_item === 'P02-014' && raw.verdict === 'pass', 'retained raw verdict');
assert(new Date(raw.recorded_at).toISOString() === raw.recorded_at, 'retained timestamp');
same(
  raw.claim_boundary,
  {
    eligible: false,
    scope: 'harness-integrity-only',
    reason:
      'The workspace contains no database implementation, so this calibration cannot support a database, product, backend-comparison, or release performance claim.',
  },
  'retained claim boundary',
);
same(
  raw.source_control,
  { commit: commitArgument, dirty: false },
  'retained clean source identity',
);

const sourcePaths = [
  'benchmarks/workloads/harness-calibration-v1.json',
  'benchmarks/schema/workload-v1.schema.json',
  'benchmarks/schema/raw-result-v1.schema.json',
  'benchmarks/schema/summary-v1.schema.json',
  'benchmarks/benchmark-contract.mjs',
  'benchmarks/run-baseline.mjs',
];
same(
  raw.sources.map(({ path: sourcePath }) => sourcePath),
  sourcePaths,
  'retained source inventory',
);
for (const source of raw.sources) {
  const bytes = showBytes(source.path);
  same(
    source,
    { path: source.path, bytes: bytes.length, sha256: sha256(bytes) },
    `${source.path}: retained source identity`,
  );
}
const workloadBytes = showBytes('benchmarks/workloads/harness-calibration-v1.json');
same(
  raw.workload,
  {
    id: 'harness.sha256-buffer/1',
    version: '1.0.0',
    path: 'benchmarks/workloads/harness-calibration-v1.json',
    bytes: workloadBytes.length,
    sha256: sha256(workloadBytes),
  },
  'retained workload identity',
);

let datasetState = 3237998081 >>> 0;
const datasetBytes = Buffer.alloc(1048576);
for (let index = 0; index < datasetBytes.length; index += 1) {
  datasetState = (Math.imul(datasetState, 1664525) + 1013904223) >>> 0;
  datasetBytes[index] = datasetState >>> 24;
}
const datasetDigest = 'da1702703965eace2e9df275ec2e0f94654aa11a7c25421f643f299da42fad97';
assert(datasetState === 3348098561, 'independent dataset final state');
assert(sha256(datasetBytes) === datasetDigest, 'independent dataset SHA-256');
same(
  raw.dataset,
  {
    generator: 'helix.lcg32-byte-buffer/1',
    seed: 3237998081,
    bytes: 1048576,
    sha256: datasetDigest,
    final_state: 3348098561,
    provenance: 'repository-generated',
    license: 'MIT',
  },
  'retained dataset',
);

const stageOrder = [
  'parse_plan',
  'storage_read',
  'sidecar_decode',
  'prepare',
  'transfer_in',
  'queue_wait',
  'execute',
  'transfer_out',
  'verify',
  'row_fetch',
  'projection_sort',
  'serialization',
  'materialize',
  'end_to_end',
];
const applicableStages = new Set(['execute', 'verify', 'materialize', 'end_to_end']);
same(raw.configuration.stage_order, stageOrder, 'retained stage authority');
same(
  {
    operation: raw.configuration.operation,
    backend: raw.configuration.backend,
    residency: raw.configuration.residency,
    selectivity: raw.configuration.selectivity,
    result_size_bytes: raw.configuration.result_size_bytes,
    concurrency: raw.configuration.concurrency,
    operations_per_repetition: raw.configuration.operations_per_repetition,
    warmup_repetitions: raw.configuration.warmup_repetitions,
    measured_repetitions: raw.configuration.measured_repetitions,
    timeout_ms: raw.configuration.timeout_ms,
    failure_policy: raw.configuration.failure_policy,
    fallback_policy: raw.configuration.fallback_policy,
    outlier_policy: raw.configuration.outlier_policy,
  },
  {
    operation: 'sha256',
    backend: 'node:crypto',
    residency: 'warm-host-memory',
    selectivity: 'not-applicable',
    result_size_bytes: 32,
    concurrency: 1,
    operations_per_repetition: 8,
    warmup_repetitions: 5,
    measured_repetitions: 20,
    timeout_ms: 120000,
    failure_policy: 'retain-and-fail',
    fallback_policy: 'retain-and-fail',
    outlier_policy: 'none',
  },
  'retained benchmark configuration',
);
assert(raw.observations.length === 25, 'retained observation count');
for (const [position, observation] of raw.observations.entries()) {
  const expectedKind = position < 5 ? 'warmup' : 'measurement';
  const expectedIndex = position < 5 ? position + 1 : position - 4;
  assert(observation.kind === expectedKind, `observation ${position}: kind`);
  assert(observation.index === expectedIndex, `observation ${position}: index`);
  assert(
    observation.status === 'pass' && !observation.fallback && observation.error === null,
    `observation ${position}: pass/fallback/error`,
  );
  same(
    observation.result,
    {
      input_bytes: 8388608,
      operations: 8,
      output_bytes: 32,
      digest_sha256: datasetDigest,
      verified: true,
    },
    `observation ${position}: result`,
  );
  same(
    observation.stages.map(({ name }) => name),
    stageOrder,
    `observation ${position}: stages`,
  );
  const durations = {};
  for (const stage of observation.stages) {
    const applicable = applicableStages.has(stage.name);
    assert(stage.applicable === applicable, `observation ${position}: ${stage.name} applicability`);
    assert(
      Number.isSafeInteger(stage.duration_ns) && stage.duration_ns >= 0,
      `observation ${position}: ${stage.name} duration`,
    );
    if (!applicable) {
      assert(stage.duration_ns === 0, `observation ${position}: ${stage.name} nonzero`);
    }
    durations[stage.name] = stage.duration_ns;
  }
  assert(durations.execute > 0, `observation ${position}: execute duration`);
  assert(durations.end_to_end > 0, `observation ${position}: end-to-end duration`);
  assert(
    durations.end_to_end >= durations.execute + durations.verify + durations.materialize,
    `observation ${position}: incomplete end-to-end duration`,
  );
}
same(
  raw.totals,
  {
    warmup_observations: 5,
    measured_observations: 20,
    passed_observations: 25,
    failed_observations: 0,
    fallback_observations: 0,
    measured_input_bytes: 167772160,
    measured_operations: 160,
  },
  'retained totals',
);
same(raw.failures, [], 'retained failure inventory');
assert(raw.environment.software.node === 'v22.23.1', 'retained Node lane');
assert(raw.environment.execution.provider === 'local', 'retained execution provider');
assert(raw.environment.conditions.network === 'not-used', 'retained network condition');
assert(raw.environment.hardware.gpu === null, 'retained GPU non-observation');
assert(raw.environment.hardware.storage === null, 'retained storage non-observation');
const sensitiveKey = /(?:^|_)(?:actor|email|host_?name|password|secret|token|user_?name)(?:_|$)/i;
const walkKeys = (value) => {
  if (Array.isArray(value)) value.forEach(walkKeys);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assert(!sensitiveKey.test(key), `retained sensitive key: ${key}`);
      walkKeys(child);
    }
  }
};
walkKeys(raw);

const measured = raw.observations.slice(5);
const nearestRank = (values, percentile) => values[Math.ceil(percentile * values.length) - 1];
const expectedDistribution = (name) => {
  const applicable = applicableStages.has(name);
  const values = applicable
    ? measured
        .map(({ stages }) => stages.find((stage) => stage.name === name).duration_ns)
        .sort((left, right) => left - right)
    : [];
  if (!applicable) {
    return {
      name,
      unit: 'nanoseconds',
      applicable: false,
      samples: 0,
      min: null,
      p50: null,
      p95: null,
      p99: null,
      max: null,
      mean: null,
    };
  }
  const sum = values.reduce((total, value) => total + BigInt(value), 0n);
  const count = BigInt(values.length);
  return {
    name,
    unit: 'nanoseconds',
    applicable: true,
    samples: 20,
    min: values[0],
    p50: nearestRank(values, 0.5),
    p95: nearestRank(values, 0.95),
    p99: nearestRank(values, 0.99),
    max: values.at(-1),
    mean: Number((sum + count / 2n) / count),
  };
};
assert(summary.schema === 'helix.benchmark-summary/1', 'retained summary schema');
assert(summary.plan_item === 'P02-014' && summary.verdict === 'pass', 'retained summary verdict');
assert(summary.recorded_at === raw.recorded_at, 'summary recording time');
assert(summary.execution_id === raw.execution_id, 'summary execution identity');
same(summary.claim_boundary, raw.claim_boundary, 'summary claim boundary');
same(
  summary.raw_result,
  {
    path: 'dist/benchmarks/baseline/raw.json',
    bytes: rawBytes.length,
    sha256: sha256(rawBytes),
  },
  'summary raw linkage',
);
same(
  summary.stage_distributions,
  stageOrder.map(expectedDistribution),
  'independently recomputed distributions',
);
same(
  summary.result_validation,
  {
    expected_digest_sha256: datasetDigest,
    verified_measurements: 20,
    failed_measurements: 0,
    fallback_measurements: 0,
  },
  'summary correctness',
);
same(
  summary.acceptance,
  { kind: 'integrity-only', performance_threshold: null, integrity_passed: true },
  'summary acceptance boundary',
);

const matrix = JSON.parse(showText('.github/ci/matrix.json'));
assert(matrix.schema === 'helix.ci-matrix/3', 'CI matrix schema');
same(
  matrix.plan_items,
  ['P02-009', 'P02-010', 'P02-011', 'P02-012', 'P02-013', 'P02-014'],
  'CI task history',
);
same(
  matrix.actions.upload_artifact,
  {
    repository: 'actions/upload-artifact',
    version: '7.0.1',
    sha: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  },
  'upload action authority',
);
assert(matrix.observational.benchmark.length === 1, 'observational lane count');
assert(matrix.observational.benchmark[0].gating === false, 'observational lane became gating');
const benchmarkWorkflow = showText('.github/workflows/benchmark-baseline.yml');
for (const marker of [
  'cron: "17 4 * * 1"',
  'workflow_dispatch:',
  'permissions:\n  contents: read',
  'if: always()',
  'if-no-files-found: error',
  'retention-days: 30',
  'overwrite: false',
  'include-hidden-files: false',
  'path: dist/benchmarks/baseline/',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
]) {
  assert(benchmarkWorkflow.includes(marker), `benchmark workflow marker absent: ${marker}`);
}
for (const forbidden of ['pull_request:', 'push:', 'continue-on-error']) {
  assert(!benchmarkWorkflow.includes(forbidden), `benchmark workflow gating marker: ${forbidden}`);
}
assert(
  showText('ImplementationPlan.md').includes(
    '- [ ] **P02-014** Add benchmark result schemas and a non-gating baseline job that preserves raw results.',
  ),
  'source task was checked before evidence closure',
);

const requirementFamilies =
  'INV|PLAT|CORE|DATA|QUERY|STORE|GPU|DIST|CACHE|SYNC|SEC|OPS|QUAL|COMPAT';
const requirementPattern = new RegExp(`\\b(?:${requirementFamilies})-\\d{3}\\b`, 'g');
const specificationRequirements = new Set(showText('Specifications.md').match(requirementPattern) ?? []);
const ledgerRequirements = new Set(
  showText('docs/governance/requirements.md').match(requirementPattern) ?? [],
);
assert(specificationRequirements.size === 44, 'specification requirement count');
same(sorted(ledgerRequirements), sorted(specificationRequirements), 'requirement ledger ID set');

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', commitArgument])
  .trim()
  .split('\n')
  .filter(Boolean);
const generatedPath =
  /(^|\/)(target|node_modules|dist|coverage|playwright-report|test-results|blob-report|\.vitest|\.vite)(\/|$)/;
same(
  trackedFiles.filter(
    (file) => generatedPath.test(file) || /\.(?:profraw|profdata|tsbuildinfo|tgz)$/.test(file),
  ),
  [],
  'tracked generated-output inventory',
);
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
assert(markdownFiles.length === manifest.verification.markdown_files, 'Markdown inventory mismatch');
assert(localLinks === manifest.verification.local_links, 'local link count mismatch');

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-014-'));
try {
  const archive = gitBytes(['archive', '--format=tar', commitArgument]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const baseEnvironment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  for (const name of [
    'FORCE_COLOR',
    'NO_COLOR',
    'GITHUB_ACTIONS',
    'GITHUB_RUN_ATTEMPT',
    'GITHUB_RUN_ID',
    'GITHUB_SHA',
    'RUSTFLAGS',
    'CARGO_ENCODED_RUSTFLAGS',
  ]) {
    delete baseEnvironment[name];
  }
  const run = (program, arguments_, options = {}) =>
    execFileSync(program, arguments_, {
      cwd: temporary,
      encoding: 'utf8',
      env: baseEnvironment,
      maxBuffer: 128 * 1024 * 1024,
      timeout: 900_000,
      ...options,
    });
  const runResult = (program, arguments_, options = {}) =>
    spawnSync(program, arguments_, {
      cwd: temporary,
      encoding: 'utf8',
      env: baseEnvironment,
      maxBuffer: 128 * 1024 * 1024,
      timeout: 900_000,
      ...options,
    });
  const requireText = (output, marker, label) => {
    assert(output.includes(marker), `${label}: output marker absent: ${marker}`);
  };
  const shellQuote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
  const nvm = path.join(os.homedir(), '.nvm', 'nvm.sh');
  assert(existsSync(nvm), 'NVM installation absent for supported Node-lane replay');
  const nvmCommand = (version, arguments_) =>
    `source ${shellQuote(nvm)} && nvm exec ${shellQuote(version)} ${arguments_.map(shellQuote).join(' ')}`;
  const runNvm = (version, arguments_, options = {}) =>
    run('bash', ['-lc', nvmCommand(version, arguments_)], options);
  const runNvmResult = (version, arguments_, options = {}) =>
    runResult('bash', ['-lc', nvmCommand(version, arguments_)], options);
  const expectFailure = (result, label, marker) => {
    assert(result.status !== 0, `${label}: mutation unexpectedly passed`);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    assert(output.includes(marker), `${label}: failure marker absent: ${marker}\n${output}`);
  };
  const expectNvmFailure = (arguments_, label, marker) =>
    expectFailure(runNvmResult('22.23.1', arguments_), label, marker);

  run('git', ['init', '--quiet']);
  run('git', ['add', '--all']);
  run('git', [
    '-c',
    'commit.gpgsign=false',
    '-c',
    'user.name=Helix Evidence',
    '-c',
    'user.email=evidence@invalid.example',
    'commit',
    '--quiet',
    '--no-verify',
    '-m',
    'source snapshot',
  ]);

  const yamlSummary = JSON.parse(
    run('python3', [
      '-c',
      [
        'import json, pathlib, yaml',
        "paths = sorted(pathlib.Path('.github/workflows').glob('*.yml'))",
        'out = []',
        'for p in paths:',
        "  data = yaml.load(p.read_text(encoding='utf-8'), Loader=yaml.BaseLoader)",
        "  out.append({'path': str(p), 'root': sorted(data), 'jobs': sorted(data['jobs']), 'steps': sum(len(job['steps']) for job in data['jobs'].values())})",
        'print(json.dumps(out))',
      ].join('\n'),
    ]),
  );
  same(
    yamlSummary,
    [
      {
        path: '.github/workflows/benchmark-baseline.yml',
        root: ['concurrency', 'env', 'jobs', 'name', 'on', 'permissions'],
        jobs: ['baseline'],
        steps: 7,
      },
      {
        path: '.github/workflows/ci-nightly.yml',
        root: ['concurrency', 'env', 'jobs', 'name', 'on', 'permissions'],
        jobs: ['contract', 'native'],
        steps: 8,
      },
      {
        path: '.github/workflows/ci.yml',
        root: ['concurrency', 'env', 'jobs', 'name', 'on', 'permissions'],
        jobs: ['browser', 'contract', 'native', 'node', 'portable', 'sanitizer'],
        steps: 34,
      },
    ],
    'independent workflow parse',
  );

  run('python3', [
    '-c',
    [
      'import json, sys',
      'from jsonschema import Draft202012Validator, FormatChecker',
      'pairs = [("benchmarks/schema/workload-v1.schema.json", "benchmarks/workloads/harness-calibration-v1.json"), ("benchmarks/schema/raw-result-v1.schema.json", sys.argv[1]), ("benchmarks/schema/summary-v1.schema.json", sys.argv[2])]',
      'for schema_path, value_path in pairs:',
      "  schema = json.load(open(schema_path, encoding='utf-8'))",
      "  value = json.load(open(value_path, encoding='utf-8'))",
      '  Draft202012Validator.check_schema(schema)',
      '  errors = list(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(value))',
      '  assert not errors, [(list(error.absolute_path), error.message) for error in errors]',
    ].join('\n'),
    rawPath,
    summaryPath,
  ]);

  const lockPath = path.join(temporary, 'package-lock.json');
  const lockHash = sha256(readFileSync(lockPath));
  runNvm('22.23.1', ['corepack', 'npm', 'ci', '--ignore-scripts']);
  requireText(runNvm('22.23.1', ['corepack', 'npm', '--version']), '11.18.0', 'Node 22 npm');
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'policy:javascript']),
    `Checked ${manifest.verification.biome_files} files`,
    'Node 22 JavaScript policy',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'benchmark:schemas']),
    'PASS benchmark schemas: 3 strict schemas',
    'Node 22 benchmark schemas',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'test:benchmark']),
    'PASS benchmark rejection canaries: 19 intended mutations rejected with exact reasons',
    'Node 22 benchmark suite',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'ci:check']),
    'PASS benchmark baseline: scheduled/manual only, integrity-gated raw artifact retention',
    'Node 22 CI contract',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'policy:dependencies']),
    'PASS npm policy: 91 dev packages',
    'Node 22 dependency policy',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'dependencies:check']),
    'PASS dependency inventory: 91 npm development packages',
    'Node 22 dependency inventory',
  );
  runNvm('22.23.1', ['corepack', 'npm', 'run', 'toolchain:types']);
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'fixtures:check']),
    'PASS fixture registry: 4 generators',
    'Node 22 fixtures',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'test']),
    'PASS all test suites:',
    'Node 22 aggregate tests',
  );
  assert(sha256(readFileSync(lockPath)) === lockHash, 'Node 22 install changed package lock');

  const generatedRawPath = path.join(temporary, 'dist/benchmarks/baseline/raw.json');
  const generatedRaw = JSON.parse(readFileSync(generatedRawPath, 'utf8'));
  assert(generatedRaw.source_control.dirty === false, 'clean replay recorded a dirty source');
  assert(generatedRaw.totals.measured_operations === 160, 'clean replay operation count');
  assert(generatedRaw.claim_boundary.eligible === false, 'clean replay claim eligibility');

  runNvm('24.18.0', ['corepack', 'npm', 'ci', '--ignore-scripts']);
  requireText(runNvm('24.18.0', ['corepack', 'npm', '--version']), '11.18.0', 'Node 24 npm');
  requireText(
    runNvm('24.18.0', ['corepack', 'npm', 'run', 'test:benchmark']),
    'PASS benchmark rejection canaries: 19 intended mutations rejected with exact reasons',
    'Node 24 benchmark suite',
  );
  requireText(
    runNvm('24.18.0', ['corepack', 'npm', 'run', 'ci:check']),
    'PASS CI matrix: 11 gating lanes, 2 nightly native lanes, 1 observational benchmark lane',
    'Node 24 CI contract',
  );
  assert(sha256(readFileSync(lockPath)) === lockHash, 'Node 24 install changed package lock');

  run('cargo', ['fmt', '--all', '--', '--check']);
  run('cargo', ['check', '--frozen', '--workspace', '--all-targets', '--all-features']);
  run('cargo', [
    'clippy',
    '--frozen',
    '--workspace',
    '--all-targets',
    '--all-features',
    '--',
    '-D',
    'warnings',
  ]);
  run('cargo', ['test', '--frozen', '--workspace', '--all-features', '--no-fail-fast']);

  runNvm('22.23.1', ['node', 'benchmarks/run-baseline.mjs']);
  const rawOutputPath = path.join(temporary, 'dist/benchmarks/baseline/raw.json');
  const summaryOutputPath = path.join(temporary, 'dist/benchmarks/baseline/summary.json');
  const rawOriginal = readFileSync(rawOutputPath);
  const summaryOriginal = readFileSync(summaryOutputPath);
  const workloadPath = path.join(temporary, 'benchmarks/workloads/harness-calibration-v1.json');
  const workloadOriginal = readFileSync(workloadPath);
  const runnerPath = path.join(temporary, 'benchmarks/run-baseline.mjs');
  const runnerOriginal = readFileSync(runnerPath);
  const workflowPath = path.join(temporary, '.github/workflows/benchmark-baseline.yml');
  const workflowOriginal = readFileSync(workflowPath);
  const matrixPath = path.join(temporary, '.github/ci/matrix.json');
  const matrixOriginal = readFileSync(matrixPath);

  expectNvmFailure(
    ['node', 'benchmarks/run-baseline.mjs', 'unexpected'],
    'runner argument canary',
    'usage: node benchmarks/run-baseline.mjs',
  );
  expectNvmFailure(
    ['node', 'benchmarks/check-benchmark-artifacts.mjs', 'unexpected'],
    'checker mode canary',
    'usage: node benchmarks/check-benchmark-artifacts.mjs <schemas|report>',
  );

  const mutateJson = (file, original, change) => {
    const value = JSON.parse(original);
    change(value);
    writeFileSync(file, jsonBytes(value));
  };
  const rawCanaries = [
    ['raw schema canary', 'raw result schema mismatch', (value) => (value.schema = 'helix.benchmark-raw-result/2')],
    ['observation count canary', 'raw result totals mismatch', (value) => value.observations.pop()],
    [
      'fallback canary',
      'passing calibration used a fallback',
      (value) => (value.observations[5].fallback = true),
    ],
    [
      'digest canary',
      'passing result mismatch',
      (value) => (value.observations[5].result.digest_sha256 = '0'.repeat(64)),
    ],
    [
      'stage-cost canary',
      'non-applicable duration is nonzero',
      (value) => (value.observations[5].stages[0].duration_ns = 1),
    ],
    [
      'sensitive-key canary',
      'forbidden sensitive key hostname',
      (value) => (value.environment.hostname = 'forbidden'),
    ],
  ];
  for (const [label, marker, change] of rawCanaries) {
    mutateJson(rawOutputPath, rawOriginal, change);
    expectNvmFailure(
      ['node', 'benchmarks/check-benchmark-artifacts.mjs', 'report'],
      label,
      marker,
    );
    writeFileSync(rawOutputPath, rawOriginal);
  }

  const summaryCanaries = [
    [
      'raw-link canary',
      'summary fields mismatch',
      (value) => (value.raw_result.sha256 = '0'.repeat(64)),
    ],
    [
      'distribution canary',
      'recomputed distribution mismatch',
      (value) => (value.stage_distributions.at(-1).p95 += 1),
    ],
    [
      'threshold canary',
      'summary fields mismatch',
      (value) => (value.acceptance.performance_threshold = 1),
    ],
  ];
  for (const [label, marker, change] of summaryCanaries) {
    mutateJson(summaryOutputPath, summaryOriginal, change);
    expectNvmFailure(
      ['node', 'benchmarks/check-benchmark-artifacts.mjs', 'report'],
      label,
      marker,
    );
    writeFileSync(summaryOutputPath, summaryOriginal);
  }

  writeFileSync(path.join(temporary, 'dist/benchmarks/baseline/unexpected.json'), '{}\n');
  expectNvmFailure(
    ['node', 'benchmarks/check-benchmark-artifacts.mjs', 'report'],
    'output inventory canary',
    'benchmark output inventory mismatch',
  );
  rmSync(path.join(temporary, 'dist/benchmarks/baseline/unexpected.json'));

  writeFileSync(runnerPath, Buffer.concat([runnerOriginal, Buffer.from('\n// source drift canary\n')]));
  expectNvmFailure(
    ['node', 'benchmarks/check-benchmark-artifacts.mjs', 'report'],
    'source identity canary',
    'raw source 5 current identity mismatch',
  );
  writeFileSync(runnerPath, runnerOriginal);

  mutateJson(workloadPath, workloadOriginal, (value) => {
    value.claim_boundary.eligible = true;
  });
  expectNvmFailure(
    ['node', 'benchmarks/check-benchmark-artifacts.mjs', 'schemas'],
    'claim escalation canary',
    'workload claim boundary mismatch',
  );
  writeFileSync(workloadPath, workloadOriginal);

  const workflowCanaries = [
    [
      'push-trigger canary',
      'benchmark workflow became gating: push:',
      (text) => text.replace('on:\n', 'on:\n  push:\n'),
    ],
    [
      'continue-on-error canary',
      'forbidden marker continue-on-error: true',
      (text) => text.replace('    runs-on: ubuntu-24.04', '    runs-on: ubuntu-24.04\n    continue-on-error: true'),
    ],
    [
      'upload pin canary',
      'unapproved action pin',
      (text) => text.replace('043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', '0'.repeat(40)),
    ],
    [
      'always-upload canary',
      'benchmark workflow marker absent: if: always()',
      (text) => text.replace('        if: always()\n', ''),
    ],
    [
      'retention canary',
      'benchmark workflow marker absent: retention-days: 30',
      (text) => text.replace('retention-days: 30', 'retention-days: 1'),
    ],
    [
      'missing-file canary',
      'benchmark workflow marker absent: if-no-files-found: error',
      (text) => text.replace('if-no-files-found: error', 'if-no-files-found: warn'),
    ],
    [
      'overwrite canary',
      'benchmark workflow marker absent: overwrite: false',
      (text) => text.replace('overwrite: false', 'overwrite: true'),
    ],
    [
      'artifact-path canary',
      'benchmark workflow marker absent: path: dist/benchmarks/baseline/',
      (text) => text.replace('path: dist/benchmarks/baseline/', 'path: dist/benchmarks/summary.json'),
    ],
  ];
  for (const [label, marker, change] of workflowCanaries) {
    writeFileSync(workflowPath, change(workflowOriginal.toString('utf8')));
    expectNvmFailure(['node', 'tests/toolchain/check-ci-matrix.mjs'], label, marker);
    writeFileSync(workflowPath, workflowOriginal);
  }

  mutateJson(matrixPath, matrixOriginal, (value) => {
    value.observational.benchmark[0].gating = true;
  });
  expectNvmFailure(
    ['node', 'tests/toolchain/check-ci-matrix.mjs'],
    'observational-gating canary',
    'observational benchmark authority mismatch',
  );
  writeFileSync(matrixPath, matrixOriginal);

  requireText(
    runNvm('22.23.1', ['node', 'benchmarks/check-benchmark-artifacts.mjs', 'report']),
    'PASS benchmark claim boundary: integrity-only calibration',
    'post-canary benchmark report',
  );
  requireText(
    runNvm('22.23.1', ['node', 'tests/toolchain/check-ci-matrix.mjs']),
    'PASS benchmark baseline: scheduled/manual only, integrity-gated raw artifact retention',
    'post-canary CI contract',
  );
  const status = run('git', ['status', '--short', '--untracked-files=no']).trim();
  assert(status === '', `clean replay source drift: ${status}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write(
  'PASS P02-014 evidence: exact 33-file source commit, schema-valid retained raw/summary, independent dataset/statistics/workflow checks, clean Node 22/24 and native replay, 19 in-source plus 23 evidence rejection canaries\n',
);

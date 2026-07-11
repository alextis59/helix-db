import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const paths = Object.freeze({
  outputDirectory: 'dist/benchmarks/baseline',
  rawOutput: 'dist/benchmarks/baseline/raw.json',
  rawSchema: 'benchmarks/schema/raw-result-v1.schema.json',
  runner: 'benchmarks/run-baseline.mjs',
  summaryOutput: 'dist/benchmarks/baseline/summary.json',
  summarySchema: 'benchmarks/schema/summary-v1.schema.json',
  workload: 'benchmarks/workloads/harness-calibration-v1.json',
  workloadSchema: 'benchmarks/schema/workload-v1.schema.json',
});

export const stageOrder = Object.freeze([
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
]);

export const applicableStages = Object.freeze(['execute', 'verify', 'materialize', 'end_to_end']);

export const sourcePaths = Object.freeze([
  paths.workload,
  paths.workloadSchema,
  paths.rawSchema,
  paths.summarySchema,
  'benchmarks/benchmark-contract.mjs',
  paths.runner,
]);

const shaPattern = /^[0-9a-f]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;
const forbiddenEnvironmentKey =
  /(?:^|_)(?:actor|email|host_?name|password|secret|token|user_?name)(?:_|$)/i;

export const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const canonical = (value) => {
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

export const same = (actual, expected, label) => {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const resolveRepositoryPath = (relativePath) => {
  assert(typeof relativePath === 'string' && relativePath.length > 0, 'empty repository path');
  assert(!path.isAbsolute(relativePath), `absolute repository path: ${relativePath}`);
  const resolved = path.resolve(repository, relativePath);
  assert(
    resolved.startsWith(`${repository}${path.sep}`),
    `repository path escapes: ${relativePath}`,
  );
  return resolved;
};

export const readBytes = (relativePath) => readFileSync(resolveRepositoryPath(relativePath));
export const readJson = (relativePath) => JSON.parse(readBytes(relativePath).toString('utf8'));
export const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

export const fileIdentity = (relativePath) => {
  const bytes = readBytes(relativePath);
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
};

const strictKeys = (value, expected, label) => {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`);
  same(Object.keys(value).sort(), [...expected].sort(), `${label} fields`);
};

const safeInteger = (value, minimum, maximum, label) => {
  assert(Number.isSafeInteger(value), `${label}: expected safe integer`);
  assert(value >= minimum && value <= maximum, `${label}: ${value} outside bounds`);
};

const shortString = (value, label, maximum = 500) => {
  assert(typeof value === 'string' && value.length >= 1, `${label}: expected nonempty string`);
  assert(value.length <= maximum, `${label}: exceeds ${maximum} characters`);
  assert(
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    }),
    `${label}: contains a control character`,
  );
};

const nullableShortString = (value, label, maximum = 500) => {
  if (value !== null) shortString(value, label, maximum);
};

const validateJsonSafe = (value, label = '$') => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isSafeInteger(value), `${label}: non-integer or unsafe JSON number`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      validateJsonSafe(child, `${label}[${index}]`);
    });
    return;
  }
  assert(value && typeof value === 'object', `${label}: unsupported JSON value`);
  for (const [key, child] of Object.entries(value)) {
    assert(!forbiddenEnvironmentKey.test(key), `${label}: forbidden sensitive key ${key}`);
    validateJsonSafe(child, `${label}.${key}`);
  }
};

const resolveLocalReference = (schema, reference, label) => {
  assert(reference.startsWith('#/'), `${label}: only local schema references are allowed`);
  let value = schema;
  for (const token of reference
    .slice(2)
    .split('/')
    .map((entry) => entry.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    assert(
      value && Object.hasOwn(value, token),
      `${label}: unresolved schema reference ${reference}`,
    );
    value = value[token];
  }
};

const validateStrictSchemaTree = (schema, value, label = '$') => {
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      validateStrictSchemaTree(schema, child, `${label}[${index}]`);
    });
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (value.$ref !== undefined) resolveLocalReference(schema, value.$ref, label);
  if (value.type === 'object') {
    assert(value.additionalProperties === false, `${label}: object schema is not closed`);
    assert(value.properties && typeof value.properties === 'object', `${label}: properties absent`);
    same(value.required ?? [], Object.keys(value.properties), `${label} required properties`);
  }
  for (const [key, child] of Object.entries(value)) {
    validateStrictSchemaTree(schema, child, `${label}.${key}`);
  }
};

const expectedDataset = Object.freeze({
  generator: 'helix.lcg32-byte-buffer/1',
  word_bits: 32,
  multiplier: 1664525,
  increment: 1013904223,
  output_byte: 'state-high-byte',
  seed: 3237998081,
  bytes: 1048576,
  sha256: 'da1702703965eace2e9df275ec2e0f94654aa11a7c25421f643f299da42fad97',
  final_state: 3348098561,
  provenance: 'repository-generated',
  license: 'MIT',
});

const expectedConfiguration = Object.freeze({
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
  stage_order: stageOrder,
  failure_policy: 'retain-and-fail',
  fallback_policy: 'retain-and-fail',
  outlier_policy: 'none',
});

const expectedClaimBoundary = Object.freeze({
  eligible: false,
  scope: 'harness-integrity-only',
  reason:
    'The workspace contains no database implementation, so this calibration cannot support a database, product, backend-comparison, or release performance claim.',
});

export const validateSchemas = () => {
  const specifications = [
    [paths.workloadSchema, 'helix.benchmark-workload/1'],
    [paths.rawSchema, 'helix.benchmark-raw-result/1'],
    [paths.summarySchema, 'helix.benchmark-summary/1'],
  ];
  for (const [schemaPath, identity] of specifications) {
    const schema = readJson(schemaPath);
    assert(
      schema.$schema === 'https://json-schema.org/draft/2020-12/schema',
      `${schemaPath}: draft mismatch`,
    );
    assert(
      typeof schema.$id === 'string' && schema.$id.startsWith('https://schemas.helix-db.invalid/'),
      `${schemaPath}: stable schema ID absent`,
    );
    assert(schema.properties.schema.const === identity, `${schemaPath}: identity mismatch`);
    validateStrictSchemaTree(schema, schema);
  }
  return specifications.length;
};

export const validateWorkload = (workload) => {
  validateJsonSafe(workload);
  strictKeys(
    workload,
    [
      'schema',
      'id',
      'version',
      'owner_task',
      'status',
      'description',
      'claim_boundary',
      'dataset',
      'workload',
      'output',
    ],
    'workload',
  );
  assert(workload.schema === 'helix.benchmark-workload/1', 'workload schema mismatch');
  assert(workload.id === 'harness.sha256-buffer/1', 'workload ID mismatch');
  assert(workload.version === '1.0.0', 'workload version mismatch');
  assert(workload.owner_task === 'P02-014', 'workload owner mismatch');
  assert(workload.status === 'active', 'workload is not active');
  shortString(workload.description, 'workload description');
  same(workload.claim_boundary, expectedClaimBoundary, 'workload claim boundary');
  same(workload.dataset, expectedDataset, 'workload dataset');
  same(
    workload.workload,
    {
      ...expectedConfiguration,
      scale_input_bytes: expectedDataset.bytes,
      expected_digest_sha256: expectedDataset.sha256,
    },
    'workload configuration',
  );
  same(
    workload.output,
    {
      directory: paths.outputDirectory,
      raw_path: paths.rawOutput,
      summary_path: paths.summaryOutput,
      raw_schema: 'helix.benchmark-raw-result/1',
      summary_schema: 'helix.benchmark-summary/1',
      max_raw_bytes: 1048576,
      max_summary_bytes: 131072,
    },
    'workload output contract',
  );
  return workload;
};

export const loadWorkload = () => validateWorkload(readJson(paths.workload));

const validateFileIdentity = (identity, label, compareCurrent = true) => {
  strictKeys(identity, ['path', 'bytes', 'sha256'], label);
  shortString(identity.path, `${label} path`, 200);
  safeInteger(identity.bytes, 1, 2097152, `${label} bytes`);
  assert(shaPattern.test(identity.sha256), `${label}: invalid SHA-256`);
  if (compareCurrent) same(identity, fileIdentity(identity.path), `${label} current identity`);
};

const validateRecordedAt = (value) => {
  shortString(value, 'recorded_at', 40);
  const parsed = new Date(value);
  assert(
    !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value,
    'recorded_at is not UTC ISO',
  );
};

const validateEnvironment = (environment) => {
  strictKeys(environment, ['hardware', 'software', 'execution', 'conditions'], 'environment');
  strictKeys(
    environment.hardware,
    ['architecture', 'cpu_model', 'logical_cpus', 'memory_bytes', 'gpu', 'storage'],
    'environment hardware',
  );
  shortString(environment.hardware.architecture, 'hardware architecture', 40);
  nullableShortString(environment.hardware.cpu_model, 'CPU model');
  safeInteger(environment.hardware.logical_cpus, 1, 1048576, 'logical CPU count');
  safeInteger(environment.hardware.memory_bytes, 1, Number.MAX_SAFE_INTEGER, 'memory bytes');
  assert(environment.hardware.gpu === null, 'calibration must not infer a GPU identity');
  assert(environment.hardware.storage === null, 'calibration must not infer a storage identity');

  strictKeys(
    environment.software,
    ['platform', 'os_release', 'node', 'v8', 'openssl'],
    'environment software',
  );
  for (const key of ['platform', 'os_release', 'node', 'v8', 'openssl']) {
    shortString(environment.software[key], `software ${key}`, 200);
  }
  assert(/^v?\d+\.\d+\.\d+/.test(environment.software.node), 'Node version format');

  strictKeys(
    environment.execution,
    [
      'provider',
      'runner_environment',
      'workflow',
      'job',
      'repository',
      'ref',
      'github_sha',
      'run_id',
      'run_attempt',
    ],
    'environment execution',
  );
  assert(
    ['local', 'github-actions'].includes(environment.execution.provider),
    'execution provider',
  );
  for (const key of ['runner_environment', 'workflow', 'job', 'repository', 'ref', 'run_id']) {
    nullableShortString(environment.execution[key], `execution ${key}`);
  }
  if (environment.execution.github_sha !== null) {
    assert(commitPattern.test(environment.execution.github_sha), 'GitHub SHA format');
  }
  if (environment.execution.run_id !== null) {
    assert(/^\d+$/.test(environment.execution.run_id), 'GitHub run ID format');
  }
  if (environment.execution.run_attempt !== null) {
    safeInteger(environment.execution.run_attempt, 1, 1000000, 'GitHub run attempt');
  }
  if (environment.execution.provider === 'local') {
    same(
      Object.fromEntries(
        Object.entries(environment.execution).filter(([key]) => key !== 'provider'),
      ),
      {
        runner_environment: null,
        workflow: null,
        job: null,
        repository: null,
        ref: null,
        github_sha: null,
        run_id: null,
        run_attempt: null,
      },
      'local execution metadata',
    );
  } else {
    assert(environment.execution.run_id !== null, 'GitHub run ID absent');
    assert(environment.execution.run_attempt !== null, 'GitHub run attempt absent');
    assert(environment.execution.github_sha !== null, 'GitHub source SHA absent');
  }

  strictKeys(
    environment.conditions,
    ['background_load', 'isolation', 'power_thermal', 'network'],
    'environment conditions',
  );
  assert(environment.conditions.background_load === 'unknown', 'background load must be unknown');
  assert(
    environment.conditions.isolation ===
      (environment.execution.provider === 'github-actions'
        ? 'github-hosted-runner'
        : 'uncontrolled-local'),
    'environment isolation mismatch',
  );
  assert(environment.conditions.power_thermal === 'unknown', 'power/thermal must be unknown');
  assert(environment.conditions.network === 'not-used', 'network condition mismatch');
};

const validateStage = (stage, expectedName, label) => {
  strictKeys(stage, ['name', 'applicable', 'duration_ns'], label);
  assert(stage.name === expectedName, `${label}: stage name mismatch`);
  const applicable = applicableStages.includes(stage.name);
  assert(stage.applicable === applicable, `${label}: applicability mismatch`);
  safeInteger(stage.duration_ns, 0, Number.MAX_SAFE_INTEGER, `${label} duration`);
  if (!applicable) assert(stage.duration_ns === 0, `${label}: non-applicable duration is nonzero`);
};

const validateObservation = (observation, expectedKind, expectedIndex, workload, label) => {
  strictKeys(
    observation,
    ['kind', 'index', 'status', 'fallback', 'error', 'stages', 'result'],
    label,
  );
  assert(observation.kind === expectedKind, `${label}: observation kind mismatch`);
  assert(observation.index === expectedIndex, `${label}: observation index mismatch`);
  assert(['pass', 'fail'].includes(observation.status), `${label}: status mismatch`);
  assert(typeof observation.fallback === 'boolean', `${label}: fallback must be Boolean`);
  nullableShortString(observation.error, `${label} error`);
  assert(Array.isArray(observation.stages), `${label}: stages must be an array`);
  same(
    observation.stages.map(({ name }) => name),
    stageOrder,
    `${label} stage order`,
  );
  observation.stages.forEach((stage, index) => {
    validateStage(stage, stageOrder[index], `${label} stage ${stageOrder[index]}`);
  });
  strictKeys(
    observation.result,
    ['input_bytes', 'operations', 'output_bytes', 'digest_sha256', 'verified'],
    `${label} result`,
  );
  for (const key of ['input_bytes', 'operations', 'output_bytes']) {
    safeInteger(observation.result[key], 0, Number.MAX_SAFE_INTEGER, `${label} result ${key}`);
  }
  assert(typeof observation.result.verified === 'boolean', `${label}: verified must be Boolean`);
  if (observation.result.digest_sha256 !== null) {
    assert(shaPattern.test(observation.result.digest_sha256), `${label}: invalid result digest`);
  }
  if (observation.status === 'pass') {
    assert(observation.error === null, `${label}: passing observation has an error`);
    assert(!observation.fallback, `${label}: passing calibration used a fallback`);
    same(
      observation.result,
      {
        input_bytes: workload.dataset.bytes * workload.workload.operations_per_repetition,
        operations: workload.workload.operations_per_repetition,
        output_bytes: workload.workload.result_size_bytes,
        digest_sha256: workload.workload.expected_digest_sha256,
        verified: true,
      },
      `${label} passing result`,
    );
    const durations = Object.fromEntries(
      observation.stages.map(({ name, duration_ns: duration }) => [name, duration]),
    );
    assert(durations.execute > 0, `${label}: execution duration is not positive`);
    assert(durations.end_to_end > 0, `${label}: end-to-end duration is not positive`);
    assert(
      durations.end_to_end >= durations.execute + durations.materialize + durations.verify,
      `${label}: end-to-end duration omits an applicable stage`,
    );
  } else {
    assert(observation.error !== null, `${label}: failed observation lacks a reason`);
    assert(!observation.result.verified, `${label}: failed observation is marked verified`);
  }
};

const gitOutput = (arguments_) =>
  execFileSync('git', arguments_, {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  }).trim();

export const currentSourceControl = () => ({
  commit: gitOutput(['rev-parse', 'HEAD']),
  dirty: gitOutput(['status', '--porcelain=v1', '--untracked-files=all']).length > 0,
});

const recomputeTotals = (observations) => {
  const measurements = observations.filter(({ kind }) => kind === 'measurement');
  return {
    warmup_observations: observations.filter(({ kind }) => kind === 'warmup').length,
    measured_observations: measurements.length,
    passed_observations: observations.filter(({ status }) => status === 'pass').length,
    failed_observations: observations.filter(({ status }) => status === 'fail').length,
    fallback_observations: observations.filter(({ fallback }) => fallback).length,
    measured_input_bytes: measurements.reduce((total, { result }) => total + result.input_bytes, 0),
    measured_operations: measurements.reduce((total, { result }) => total + result.operations, 0),
  };
};

export const validateRawResult = (
  raw,
  { compareCurrentSources = true, requireComplete = true } = {},
) => {
  const workload = loadWorkload();
  validateJsonSafe(raw);
  strictKeys(
    raw,
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
    ],
    'raw result',
  );
  assert(raw.schema === 'helix.benchmark-raw-result/1', 'raw result schema mismatch');
  assert(raw.plan_item === 'P02-014', 'raw result plan item mismatch');
  validateRecordedAt(raw.recorded_at);
  shortString(raw.execution_id, 'execution ID', 160);
  same(raw.claim_boundary, expectedClaimBoundary, 'raw result claim boundary');
  same(
    raw.workload,
    { id: workload.id, version: workload.version, ...fileIdentity(paths.workload) },
    'raw result workload identity',
  );
  assert(Array.isArray(raw.sources), 'raw result sources must be an array');
  same(
    raw.sources.map(({ path: sourcePath }) => sourcePath),
    sourcePaths,
    'raw result source inventory',
  );
  raw.sources.forEach((identity, index) => {
    validateFileIdentity(identity, `raw source ${index}`, compareCurrentSources);
  });
  strictKeys(raw.source_control, ['commit', 'dirty'], 'source control');
  assert(commitPattern.test(raw.source_control.commit), 'source commit format');
  assert(typeof raw.source_control.dirty === 'boolean', 'source dirty state');
  if (compareCurrentSources) {
    assert(
      raw.source_control.commit === currentSourceControl().commit,
      'raw result source commit differs from current checkout',
    );
  }
  validateEnvironment(raw.environment);
  same(raw.configuration, expectedConfiguration, 'raw result configuration');
  same(
    raw.dataset,
    {
      generator: expectedDataset.generator,
      seed: expectedDataset.seed,
      bytes: expectedDataset.bytes,
      sha256: expectedDataset.sha256,
      final_state: expectedDataset.final_state,
      provenance: expectedDataset.provenance,
      license: expectedDataset.license,
    },
    'raw result dataset',
  );
  assert(Array.isArray(raw.observations), 'raw observations must be an array');
  assert(raw.observations.length <= 25, 'too many raw observations');
  const warmups = raw.observations.filter(({ kind }) => kind === 'warmup');
  const measurements = raw.observations.filter(({ kind }) => kind === 'measurement');
  assert(warmups.length <= 5 && measurements.length <= 20, 'observation class count exceeded');
  warmups.forEach((observation, index) => {
    validateObservation(observation, 'warmup', index + 1, workload, `warmup ${index + 1}`);
  });
  measurements.forEach((observation, index) => {
    validateObservation(
      observation,
      'measurement',
      index + 1,
      workload,
      `measurement ${index + 1}`,
    );
  });
  same(raw.observations, [...warmups, ...measurements], 'raw observation ordering');
  same(raw.totals, recomputeTotals(raw.observations), 'raw result totals');
  assert(Array.isArray(raw.failures), 'raw failures must be an array');
  same(
    raw.failures,
    raw.observations.filter(({ status }) => status === 'fail').map(({ error }) => error),
    'raw result failure inventory',
  );
  const complete = warmups.length === 5 && measurements.length === 20;
  const passed =
    complete && raw.totals.failed_observations === 0 && raw.totals.fallback_observations === 0;
  assert(raw.verdict === (passed ? 'pass' : 'fail'), 'raw result verdict mismatch');
  if (requireComplete) assert(passed, 'raw result is not a complete passing baseline');
  return raw;
};

const nearestRank = (sortedValues, percentile) =>
  sortedValues[Math.max(0, Math.ceil(percentile * sortedValues.length) - 1)];

const distribution = (name, measurements) => {
  const applicable = applicableStages.includes(name);
  const values = applicable
    ? measurements
        .map(({ stages }) => stages.find((stage) => stage.name === name))
        .filter((stage) => stage?.applicable)
        .map(({ duration_ns: duration }) => duration)
        .sort((left, right) => left - right)
    : [];
  if (values.length === 0) {
    return {
      name,
      unit: 'nanoseconds',
      applicable,
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
  const divisor = BigInt(values.length);
  return {
    name,
    unit: 'nanoseconds',
    applicable,
    samples: values.length,
    min: values[0],
    p50: nearestRank(values, 0.5),
    p95: nearestRank(values, 0.95),
    p99: nearestRank(values, 0.99),
    max: values.at(-1),
    mean: Number((sum + divisor / 2n) / divisor),
  };
};

export const buildSummary = (raw, rawBytes) => {
  validateRawResult(raw, { requireComplete: false });
  assert(Buffer.isBuffer(rawBytes), 'raw summary input must be a Buffer');
  assert(sha256(rawBytes) === sha256(jsonBytes(raw)), 'raw summary bytes are not canonical output');
  const measurements = raw.observations.filter(({ kind }) => kind === 'measurement');
  const hardware = raw.environment.hardware;
  const software = raw.environment.software;
  return {
    schema: 'helix.benchmark-summary/1',
    plan_item: 'P02-014',
    recorded_at: raw.recorded_at,
    execution_id: raw.execution_id,
    claim_boundary: raw.claim_boundary,
    workload: {
      id: raw.workload.id,
      path: raw.workload.path,
      sha256: raw.workload.sha256,
    },
    raw_result: {
      path: paths.rawOutput,
      bytes: rawBytes.length,
      sha256: sha256(rawBytes),
    },
    source_control: raw.source_control,
    environment_identity: {
      platform: software.platform,
      architecture: hardware.architecture,
      os_release: software.os_release,
      cpu_model: hardware.cpu_model,
      logical_cpus: hardware.logical_cpus,
      memory_bytes: hardware.memory_bytes,
      node: software.node,
      v8: software.v8,
      openssl: software.openssl,
      provider: raw.environment.execution.provider,
    },
    counts: {
      warmups: raw.totals.warmup_observations,
      measurements: raw.totals.measured_observations,
      passed: raw.totals.passed_observations,
      failed: raw.totals.failed_observations,
      fallbacks: raw.totals.fallback_observations,
      measured_operations: raw.totals.measured_operations,
      measured_input_bytes: raw.totals.measured_input_bytes,
    },
    stage_distributions: stageOrder.map((name) => distribution(name, measurements)),
    result_validation: {
      expected_digest_sha256: expectedDataset.sha256,
      verified_measurements: measurements.filter(({ result }) => result.verified).length,
      failed_measurements: measurements.filter(({ status }) => status === 'fail').length,
      fallback_measurements: measurements.filter(({ fallback }) => fallback).length,
    },
    acceptance: {
      kind: 'integrity-only',
      performance_threshold: null,
      integrity_passed: raw.verdict === 'pass',
    },
    verdict: raw.verdict,
  };
};

const validateDistribution = (entry, expected, label) => {
  strictKeys(
    entry,
    ['name', 'unit', 'applicable', 'samples', 'min', 'p50', 'p95', 'p99', 'max', 'mean'],
    label,
  );
  assert(entry.name === expected.name, `${label}: name mismatch`);
  assert(entry.unit === 'nanoseconds', `${label}: unit mismatch`);
  assert(typeof entry.applicable === 'boolean', `${label}: applicable must be Boolean`);
  for (const key of ['samples', 'min', 'p50', 'p95', 'p99', 'max', 'mean']) {
    if (entry[key] !== null) safeInteger(entry[key], 0, Number.MAX_SAFE_INTEGER, `${label} ${key}`);
  }
  same(entry, expected, `${label} recomputed distribution`);
};

export const validateSummary = (summary, raw, rawBytes) => {
  validateJsonSafe(summary);
  strictKeys(
    summary,
    [
      'schema',
      'plan_item',
      'recorded_at',
      'execution_id',
      'claim_boundary',
      'workload',
      'raw_result',
      'source_control',
      'environment_identity',
      'counts',
      'stage_distributions',
      'result_validation',
      'acceptance',
      'verdict',
    ],
    'benchmark summary',
  );
  assert(summary.schema === 'helix.benchmark-summary/1', 'summary schema mismatch');
  assert(summary.plan_item === 'P02-014', 'summary plan item mismatch');
  validateRecordedAt(summary.recorded_at);
  shortString(summary.execution_id, 'summary execution ID', 160);
  assert(Buffer.isBuffer(rawBytes), 'summary raw bytes must be a Buffer');
  assert(rawBytes.length <= 1048576, 'raw result exceeds size limit');
  const expected = buildSummary(raw, rawBytes);
  same(
    Object.fromEntries(Object.entries(summary).filter(([key]) => key !== 'stage_distributions')),
    Object.fromEntries(Object.entries(expected).filter(([key]) => key !== 'stage_distributions')),
    'summary fields',
  );
  assert(Array.isArray(summary.stage_distributions), 'summary distributions must be an array');
  same(
    summary.stage_distributions.map(({ name }) => name),
    stageOrder,
    'summary distribution order',
  );
  summary.stage_distributions.forEach((entry, index) => {
    validateDistribution(entry, expected.stage_distributions[index], `distribution ${entry.name}`);
  });
  return summary;
};

export const verifyOutputArtifacts = () => {
  validateSchemas();
  loadWorkload();
  const outputDirectory = resolveRepositoryPath(paths.outputDirectory);
  const entries = readdirSync(outputDirectory, { withFileTypes: true });
  same(
    entries.map(({ name }) => name).sort(),
    ['raw.json', 'summary.json'],
    'benchmark output inventory',
  );
  assert(
    entries.every((entry) => entry.isFile()),
    'benchmark output contains a non-file',
  );
  const rawBytes = readBytes(paths.rawOutput);
  const summaryBytes = readBytes(paths.summaryOutput);
  assert(rawBytes.length <= 1048576, 'raw benchmark artifact exceeds size cap');
  assert(summaryBytes.length <= 131072, 'benchmark summary artifact exceeds size cap');
  const raw = JSON.parse(rawBytes.toString('utf8'));
  const summary = JSON.parse(summaryBytes.toString('utf8'));
  assert(rawBytes.equals(jsonBytes(raw)), 'raw benchmark artifact is not canonical pretty JSON');
  assert(summaryBytes.equals(jsonBytes(summary)), 'benchmark summary is not canonical pretty JSON');
  validateRawResult(raw);
  validateSummary(summary, raw, rawBytes);
  assert(statSync(outputDirectory).isDirectory(), 'benchmark output root is not a directory');
  return { raw, rawBytes, summary, summaryBytes };
};

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const paths = Object.freeze({
  workload: 'benchmarks/workloads/hdoc-v1.json',
  engine: 'crates/helix-doc/examples/hdoc_v1_benchmark.rs',
  contract: 'benchmarks/hdoc-contract.mjs',
  runner: 'benchmarks/run-hdoc.mjs',
  checker: 'benchmarks/check-hdoc.mjs',
  rawSchema: 'benchmarks/schema/hdoc-raw-v1.schema.json',
  summarySchema: 'benchmarks/schema/hdoc-summary-v1.schema.json',
  raw: 'dist/benchmarks/hdoc-v1/raw.json',
  summary: 'dist/benchmarks/hdoc-v1/summary.json',
});
export const sourcePaths = Object.freeze([
  paths.workload,
  paths.engine,
  paths.contract,
  paths.runner,
  paths.checker,
  paths.rawSchema,
  paths.summarySchema,
]);

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
  assert(
    JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected)),
    `${label} mismatch`,
  );
};
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const bytes = (relative) => readFileSync(path.join(repository, relative));
export const json = (relative) => JSON.parse(bytes(relative).toString('utf8'));
export const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
export const identity = (relative) => {
  const content = bytes(relative);
  return { path: relative, bytes: content.length, sha256: sha256(content) };
};
const git = (args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
export const sourceControl = () => ({
  commit: git(['rev-parse', 'HEAD']),
  dirty: git(['status', '--porcelain=v1', '--untracked-files=all']).length > 0,
});
export const environment = () => ({
  platform: process.platform,
  architecture: process.arch,
  os_release: os.release(),
  cpu_model: os.cpus()[0]?.model.trim().replaceAll(/\s+/g, ' ') ?? 'unknown',
  logical_cpus: os.cpus().length,
  memory_bytes: os.totalmem(),
  node: process.version,
  rustc: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
});

const strict = (value, keys, label) => {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: object`);
  same(Object.keys(value).sort(), [...keys].sort(), `${label} fields`);
};
const safe = (value, minimum, maximum, label) => {
  assert(Number.isSafeInteger(value), `${label}: safe integer`);
  assert(value >= minimum && value <= maximum, `${label}: bounds`);
};
const shaPattern = /^[0-9a-f]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;

export const loadWorkload = () => {
  const workload = json(paths.workload);
  strict(
    workload,
    [
      'schema',
      'plan_item',
      'status',
      'profile',
      'warmups',
      'measurements',
      'iterations_per_sample',
      'dictionary_documents',
      'dictionary_basis',
      'operations',
      'shapes',
      'claim_boundary',
    ],
    'workload',
  );
  assert(workload.schema === 'helix.hdoc-benchmark-workload/1', 'workload schema');
  assert(workload.plan_item === 'P03-020' && workload.status === 'active', 'workload owner');
  assert(workload.profile === 'bench', 'workload profile');
  same(
    [workload.warmups, workload.measurements, workload.iterations_per_sample],
    [5, 20, 16],
    'workload repetition bounds',
  );
  assert(workload.dictionary_documents === 10000, 'dictionary document count');
  assert(
    workload.dictionary_basis === 'snapshot-plus-u32-path-id-per-reference',
    'dictionary basis',
  );
  same(
    workload.operations,
    [
      'encode_base',
      'encode_canonical',
      'decode_base',
      'decode_canonical',
      'field_lookup',
      'path_lookup',
    ],
    'workload operations',
  );
  assert(workload.shapes.length === 5, 'workload shape count');
  assert(workload.claim_boundary.timing_threshold === null, 'timing threshold must be null');
  assert(workload.claim_boundary.decision_owner === 'P03-021', 'decision owner');
  return workload;
};

export const validateSchemas = () => {
  for (const [schemaPath, schemaId] of [
    [paths.rawSchema, 'helix.hdoc-benchmark-raw/1'],
    [paths.summarySchema, 'helix.hdoc-benchmark-summary/1'],
  ]) {
    const schema = json(schemaPath);
    assert(
      schema.$schema === 'https://json-schema.org/draft/2020-12/schema',
      `${schemaPath}: draft`,
    );
    assert(schema.$id.startsWith('https://schemas.helix-db.invalid/'), `${schemaPath}: ID`);
    assert(
      schema.type === 'object' && schema.additionalProperties === false,
      `${schemaPath}: closed root`,
    );
    const references = JSON.stringify(schema).match(/"\$ref":"([^"]+)"/g) ?? [];
    assert(
      references.every((reference) => reference.includes('"$ref":"#/')),
      `${schemaPath}: external schema reference`,
    );
    assert(schema.properties.schema.const === schemaId, `${schemaPath}: schema identity`);
    same(schema.required, Object.keys(schema.properties), `${schemaPath}: required root fields`);
  }
  return 2;
};

const validateDictionary = (model, expected, label) => {
  strict(
    model,
    [
      'basis',
      'path_count',
      'documents',
      'snapshot_bytes',
      'raw_name_reference_bytes',
      'id_reference_bytes',
      'amortized_dictionary_bytes',
      'savings_bytes',
      'savings_basis_points',
    ],
    label,
  );
  assert(model.basis === 'snapshot-plus-u32-path-id-per-reference', `${label}: basis`);
  assert(model.path_count === expected.dictionary_path_count, `${label}: paths`);
  assert(model.documents === 10000, `${label}: documents`);
  assert(model.id_reference_bytes === model.path_count * model.documents * 4, `${label}: ID bytes`);
  assert(
    model.amortized_dictionary_bytes === model.snapshot_bytes + model.id_reference_bytes,
    `${label}: total bytes`,
  );
  assert(
    model.savings_bytes === model.raw_name_reference_bytes - model.amortized_dictionary_bytes,
    `${label}: savings`,
  );
  assert(
    model.savings_basis_points ===
      Math.trunc((model.savings_bytes * 10000) / model.raw_name_reference_bytes),
    `${label}: basis points`,
  );
};

export const validateEngine = (engine) => {
  const workload = loadWorkload();
  strict(
    engine,
    [
      'schema',
      'warmups',
      'measurements',
      'iterations_per_sample',
      'shape_count',
      'operation_count_per_shape',
      'shapes',
      'verdict',
    ],
    'engine',
  );
  assert(engine.schema === 'helix.hdoc-benchmark-engine/1', 'engine schema');
  same(
    [engine.warmups, engine.measurements, engine.iterations_per_sample],
    [5, 20, 16],
    'engine bounds',
  );
  assert(engine.shape_count === 5 && engine.operation_count_per_shape === 6, 'engine inventory');
  assert(engine.shapes.length === 5 && engine.verdict === 'pass', 'engine verdict');
  for (const [index, shape] of engine.shapes.entries()) {
    const expected = workload.shapes[index];
    strict(
      shape,
      [
        'id',
        'root_fields',
        'recursive_fields',
        'path_depth',
        'expected_path_candidates',
        'sizes',
        'dictionary_model',
        'operations',
      ],
      `shape ${index}`,
    );
    same(
      {
        id: shape.id,
        root_fields: shape.root_fields,
        recursive_fields: shape.recursive_fields,
        path_depth: shape.path_depth,
        expected_path_candidates: shape.expected_path_candidates,
      },
      {
        id: expected.id,
        root_fields: expected.root_fields,
        recursive_fields: expected.recursive_fields,
        path_depth: expected.path_depth,
        expected_path_candidates: expected.expected_path_candidates,
      },
      `shape ${index} identity`,
    );
    strict(
      shape.sizes,
      [
        'base_bytes',
        'canonical_stored_bytes',
        'canonical_logical_bytes',
        'tagged_json_bytes',
        'compressed_sections',
      ],
      `shape ${shape.id} sizes`,
    );
    for (const key of [
      'base_bytes',
      'canonical_stored_bytes',
      'canonical_logical_bytes',
      'tagged_json_bytes',
    ])
      safe(shape.sizes[key], 1, 16777216, `shape ${shape.id} ${key}`);
    assert(
      shape.sizes.base_bytes === shape.sizes.canonical_logical_bytes,
      `shape ${shape.id}: logical size`,
    );
    assert(
      shape.sizes.canonical_stored_bytes <= shape.sizes.base_bytes,
      `shape ${shape.id}: stored size`,
    );
    safe(shape.sizes.compressed_sections, 0, 4, `shape ${shape.id}: compressed sections`);
    validateDictionary(shape.dictionary_model, expected, `shape ${shape.id} dictionary`);
    same(
      shape.operations.map(({ id }) => id),
      workload.operations,
      `shape ${shape.id} operations`,
    );
    for (const operation of shape.operations) {
      strict(
        operation,
        ['id', 'iterations_per_sample', 'durations_ns', 'checksum'],
        `shape ${shape.id} operation ${operation.id}`,
      );
      assert(operation.iterations_per_sample === 16, `shape ${shape.id} operation iterations`);
      assert(operation.durations_ns.length === 20, `shape ${shape.id} operation samples`);
      operation.durations_ns.forEach((duration) => {
        safe(duration, 1, Number.MAX_SAFE_INTEGER, `shape ${shape.id} duration`);
      });
      safe(operation.checksum, 1, Number.MAX_SAFE_INTEGER, `shape ${shape.id} checksum`);
    }
  }
  return engine;
};

const validateSources = (sources, compareCurrent) => {
  assert(Array.isArray(sources), 'sources array');
  same(
    sources.map(({ path: sourcePath }) => sourcePath),
    sourcePaths,
    'source inventory',
  );
  for (const source of sources) {
    strict(source, ['path', 'bytes', 'sha256'], `source ${source.path}`);
    assert(shaPattern.test(source.sha256), `source ${source.path}: hash`);
    if (compareCurrent) same(source, identity(source.path), `source ${source.path} identity`);
  }
};

export const validateRaw = (raw, { compareCurrent = true } = {}) => {
  const workload = loadWorkload();
  strict(
    raw,
    [
      'schema',
      'plan_item',
      'recorded_at',
      'source_control',
      'environment',
      'claim_boundary',
      'workload',
      'sources',
      'engine',
      'totals',
      'verdict',
    ],
    'raw',
  );
  assert(
    raw.schema === 'helix.hdoc-benchmark-raw/1' && raw.plan_item === 'P03-020',
    'raw identity',
  );
  assert(!Number.isNaN(Date.parse(raw.recorded_at)), 'raw timestamp');
  strict(raw.source_control, ['commit', 'dirty'], 'source control');
  assert(
    commitPattern.test(raw.source_control.commit) && typeof raw.source_control.dirty === 'boolean',
    'source control identity',
  );
  strict(
    raw.environment,
    [
      'platform',
      'architecture',
      'os_release',
      'cpu_model',
      'logical_cpus',
      'memory_bytes',
      'node',
      'rustc',
    ],
    'environment',
  );
  assert(
    raw.environment.cpu_model.length > 0 && raw.environment.cpu_model.length <= 500,
    'CPU model',
  );
  safe(raw.environment.logical_cpus, 1, 4096, 'logical CPUs');
  safe(raw.environment.memory_bytes, 1, Number.MAX_SAFE_INTEGER, 'memory bytes');
  same(raw.claim_boundary, workload.claim_boundary, 'claim boundary');
  same(raw.workload, identity(paths.workload), 'workload identity');
  validateSources(raw.sources, compareCurrent);
  validateEngine(raw.engine);
  same(
    raw.totals,
    { shapes: 5, operations: 30, measurement_samples: 600, timed_iterations: 9600 },
    'raw totals',
  );
  assert(raw.verdict === 'pass', 'raw verdict');
  return raw;
};

export const distribution = (durations) => {
  const sorted = [...durations].sort((left, right) => left - right);
  const rank = (percent) => sorted[Math.ceil((percent / 100) * sorted.length) - 1];
  return {
    min: sorted[0],
    p50: rank(50),
    p95: rank(95),
    p99: rank(99),
    max: sorted.at(-1),
    mean: Math.round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
  };
};

export const buildSummary = (raw, rawContent) => ({
  schema: 'helix.hdoc-benchmark-summary/1',
  plan_item: 'P03-020',
  recorded_at: raw.recorded_at,
  raw_result: { path: paths.raw, bytes: rawContent.length, sha256: sha256(rawContent) },
  source_control: raw.source_control,
  environment: raw.environment,
  claim_boundary: raw.claim_boundary,
  shapes: raw.engine.shapes.map((shape) => ({
    id: shape.id,
    sizes: shape.sizes,
    dictionary_model: shape.dictionary_model,
    operations: shape.operations.map((operation) => ({
      id: operation.id,
      iterations_per_sample: operation.iterations_per_sample,
      sample_count: operation.durations_ns.length,
      duration_ns: distribution(operation.durations_ns),
    })),
  })),
  acceptance: { correctness_passed: true, timing_threshold: null, decision_owner: 'P03-021' },
  verdict: 'pass',
});

export const validateSummary = (summary, raw, rawContent) => {
  strict(
    summary,
    [
      'schema',
      'plan_item',
      'recorded_at',
      'raw_result',
      'source_control',
      'environment',
      'claim_boundary',
      'shapes',
      'acceptance',
      'verdict',
    ],
    'summary',
  );
  assert(
    summary.schema === 'helix.hdoc-benchmark-summary/1' && summary.plan_item === 'P03-020',
    'summary identity',
  );
  same(summary, buildSummary(raw, rawContent), 'recomputed summary');
  return summary;
};

export const verifyArtifacts = ({ compareCurrent = true } = {}) => {
  const rawContent = bytes(paths.raw);
  const raw = JSON.parse(rawContent.toString('utf8'));
  validateRaw(raw, { compareCurrent });
  const summary = json(paths.summary);
  validateSummary(summary, raw, rawContent);
  return { raw, rawContent, summary, summaryContent: bytes(paths.summary) };
};

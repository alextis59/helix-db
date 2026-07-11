#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeFixture, sha256Hex } from './schema/fixture-jcs.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const casesRoot = path.join(root, 'cases');
const mode = process.argv[2] ?? '--check';

if (!['--check', '--write'].includes(mode)) {
  throw new Error('usage: node fixtures/semantic/generate-corpus.mjs [--check|--write]');
}

const sorted = (values) => [...new Set(values)].sort();
const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const profiles = Object.freeze({
  semantics: 'helix-native-v1',
  limits: 'limits-v1',
  collation: 'binary_utf8_v1',
  errors: 'errors-v1',
  default_order: 'default_order_v1',
});

const V = Object.freeze({
  missing: () => ({ t: 'missing' }),
  null: () => ({ t: 'null' }),
  bool: (value) => ({ t: 'bool', value }),
  i32: (value) => ({ t: 'int32', value: String(value) }),
  i64: (value) => ({ t: 'int64', value: String(value) }),
  f64: (bits) => ({ t: 'float64', bits }),
  decimal: (sign, coefficient, exponent) => ({
    t: 'decimal128',
    class: 'finite',
    sign,
    coefficient,
    exponent,
  }),
  decimalInfinity: (sign) => ({ t: 'decimal128', class: 'infinity', sign }),
  decimalNaN: () => ({ t: 'decimal128', class: 'nan' }),
  string: (value) => ({ t: 'string', value }),
  binary: (hex) => ({ t: 'binary', subtype: 0, hex }),
  object: (fields = []) => ({
    t: 'object',
    fields: fields.map(([name, value]) => ({ name, value })),
  }),
  array: (values = []) => ({ t: 'array', values }),
  timestamp: (microseconds) => ({ t: 'timestamp', microseconds: String(microseconds) }),
  date: (days) => ({ t: 'date', days: String(days) }),
  uuid: (value) => ({ t: 'uuid', value }),
  objectId: (value) => ({ t: 'objectId', value }),
  vector16: (bits) => ({ t: 'vector', element: 'f16', dimension: bits.length, bits }),
  vector32: (bits) => ({ t: 'vector', element: 'f32', dimension: bits.length, bits }),
});

const orderNotApplicable = () => ({
  mode: 'not_applicable',
  basis: 'not_applicable',
  row_count: 0,
  keys: [],
});
const orderExact = (basis, keys) => ({
  mode: 'exact',
  basis,
  row_count: keys.length,
  keys: keys.map((components) => ({ components })),
});
const valueKey = (value, direction = 'asc') => ({ kind: 'value', direction, value });
const indexKey = (value) => ({ kind: 'index', value });
const unchanged = () => ({ mode: 'unchanged' });

const success = (value, { order = orderNotApplicable(), state = unchanged() } = {}) => ({
  kind: 'success',
  value,
  order,
  state,
});
const errorExpectation = ({
  category,
  code,
  phase,
  outcome = 'not_applicable',
  details,
  detailsMatch = details === undefined ? 'absent' : 'exact',
  retryable = false,
  scope = 'never',
  token = 'absent',
  state = unchanged(),
}) => ({
  kind: 'error',
  category,
  code,
  phase,
  outcome,
  retry: { retryable, scope, token },
  details_match: detailsMatch,
  ...(details === undefined ? {} : { details }),
  order: orderNotApplicable(),
  state,
});

const valueAction = (operation, arguments_, options) => ({
  kind: 'value_operation',
  operation,
  arguments: arguments_,
  ...(options === undefined ? {} : { options }),
});
const valueStep = (id, operation, arguments_, expected, options) => ({
  id,
  action: valueAction(operation, arguments_, options),
  expect: success(expected),
});
const errorStep = (id, action, expectation) => ({ id, action, expect: expectation });
const commandAction = (command) => ({ kind: 'command', command });
const literal = (value) => ({ $value: value });

const fixture = ({
  id,
  title,
  description,
  requirements,
  tags,
  initialState = { collections: [] },
  steps,
}) => ({
  fixture_schema: 'helix.semantic-fixture/1',
  id,
  title,
  ...(description === undefined ? {} : { description }),
  requirements: sorted(requirements),
  plan_items: ['P01-019'],
  profiles: { ...profiles },
  tags: sorted(tags),
  initial_state: initialState,
  steps,
});

const identitySteps = (prefix, values) =>
  values.map(([name, value]) => valueStep(`${prefix}-${name}`, 'value.identity', [value], value));

const cases = [];

const nullValue = V.null();
const falseValue = V.bool(false);
const trueValue = V.bool(true);
cases.push(
  fixture({
    id: 'scalar.null-bool',
    title: 'Null and Boolean identity, equality, and total ordering edges',
    requirements: ['DATA-001', 'QUERY-001'],
    tags: ['bool', 'null', 'scalar-edge'],
    steps: [
      ...identitySteps('identity', [
        ['null', nullValue],
        ['false', falseValue],
        ['true', trueValue],
      ]),
      valueStep('equal-null-null', 'value.equal', [nullValue, nullValue], trueValue),
      valueStep('different-null-false', 'value.equal', [nullValue, falseValue], falseValue),
      valueStep('different-false-true', 'value.equal', [falseValue, trueValue], falseValue),
      valueStep('compare-null-false', 'value.compare', [nullValue, falseValue], V.i32(-1)),
      valueStep('compare-false-true', 'value.compare', [falseValue, trueValue], V.i32(-1)),
    ],
  }),
);

const errorGroups = [
  [
    'parse',
    'decode',
    [
      'PAR_MALFORMED_ENVELOPE',
      'PAR_TRUNCATED_INPUT',
      'PAR_INVALID_JSON',
      'PAR_INVALID_CBOR',
      'PAR_INVALID_UTF8',
      'PAR_INVALID_TYPED_VALUE',
      'PAR_COMPRESSION_FAILED',
    ],
  ],
  [
    'validation',
    'validate',
    [
      'VAL_UNKNOWN_COMMAND',
      'VAL_UNKNOWN_OPTION',
      'VAL_UNKNOWN_OPERATOR',
      'VAL_INVALID_SHAPE',
      'VAL_INVALID_LITERAL',
      'VAL_INVALID_FIELD_NAME',
      'VAL_INVALID_PATH',
      'VAL_PROTECTED_FIELD',
      'VAL_DUPLICATE_FIELD',
      'VAL_CONFLICTING_PATHS',
      'VAL_SCHEMA_MISMATCH',
      'VAL_RESOURCE_NOT_FOUND',
      'VAL_UNSUPPORTED_COMBINATION',
    ],
  ],
  [
    'type',
    'execute',
    [
      'TYPE_MISMATCH',
      'TYPE_COERCION_LOSS',
      'TYPE_NUMERIC_OVERFLOW',
      'TYPE_NUMERIC_UNDERFLOW',
      'TYPE_INVALID_SPECIAL',
      'TYPE_TEMPORAL_RANGE',
      'TYPE_VECTOR_DIMENSION',
      'TYPE_VECTOR_ZERO_NORM',
      'TYPE_EXPRESSION_MISSING',
    ],
  ],
  [
    'conflict',
    'execute',
    [
      'CON_WRITE_CONFLICT',
      'CON_IDEMPOTENCY_MISMATCH',
      'CON_TRANSACTION_STATE',
      'CON_SNAPSHOT_EXPIRED',
      'CON_CURSOR_STATE',
      'CON_STALE_EPOCH',
      'CON_RETRY_EXHAUSTED',
    ],
  ],
  [
    'uniqueness',
    'execute',
    ['UNQ_PRIMARY_DUPLICATE', 'UNQ_SECONDARY_DUPLICATE', 'UNQ_GENERATED_ID_EXHAUSTED'],
  ],
  [
    'authorization',
    'authorize',
    [
      'AUTH_UNAUTHENTICATED',
      'AUTH_CREDENTIAL_EXPIRED',
      'AUTH_FORBIDDEN',
      'AUTH_SCOPE_DENIED',
      'AUTH_POLICY_DENIED',
    ],
  ],
  [
    'capability',
    'admit',
    [
      'CAP_UNSUPPORTED_FEATURE',
      'CAP_UNSUPPORTED_VERSION',
      'CAP_HOST_UNAVAILABLE',
      'CAP_STORAGE_UNAVAILABLE',
      'CAP_GPU_UNAVAILABLE',
      'CAP_GPU_DEVICE_LOST',
      'CAP_CLOCK_UNSAFE',
      'CAP_FORMAT_UNSUPPORTED',
    ],
  ],
  [
    'quota',
    'admit',
    [
      'QUOTA_LIMIT_EXCEEDED',
      'QUOTA_RATE_LIMITED',
      'QUOTA_MEMORY',
      'QUOTA_STORAGE',
      'QUOTA_CONCURRENCY',
      'QUOTA_GPU',
      'QUOTA_RESULT',
    ],
  ],
  ['deadline', 'execute', ['DEADLINE_EXCEEDED', 'DEADLINE_CANCELLED', 'DEADLINE_CURSOR_EXPIRED']],
  [
    'durability',
    'commit',
    [
      'DUR_IO',
      'DUR_SYNC',
      'DUR_NO_SPACE',
      'DUR_CORRUPTION',
      'DUR_RECOVERY_REQUIRED',
      'DUR_ACK_UNKNOWN',
      'DUR_BACKUP_INVALID',
      'DUR_RESTORE_INVALID',
    ],
  ],
  ['internal', 'internal', ['INT_INVARIANT', 'INT_PANIC', 'INT_SERIALIZATION', 'INT_UNEXPECTED']],
];
const retryOverrides = new Map([
  ['CON_WRITE_CONFLICT', [true, 'new_snapshot']],
  ['CON_SNAPSHOT_EXPIRED', [true, 'new_snapshot']],
  ['CON_STALE_EPOCH', [true, 'new_snapshot']],
  ['CAP_HOST_UNAVAILABLE', [true, 'after_capability_change']],
  ['CAP_STORAGE_UNAVAILABLE', [true, 'after_capability_change']],
  ['CAP_GPU_UNAVAILABLE', [true, 'after_capability_change']],
  ['CAP_GPU_DEVICE_LOST', [true, 'after_capability_change']],
  ['CAP_CLOCK_UNSAFE', [true, 'after_operator_action']],
  ['QUOTA_RATE_LIMITED', [true, 'after_delay']],
  ['QUOTA_MEMORY', [true, 'after_delay']],
  ['QUOTA_STORAGE', [true, 'after_operator_action']],
  ['QUOTA_CONCURRENCY', [true, 'after_delay']],
  ['QUOTA_GPU', [true, 'after_delay']],
  ['DUR_IO', [true, 'after_operator_action']],
  ['DUR_SYNC', [true, 'after_operator_action']],
  ['DUR_NO_SPACE', [true, 'after_operator_action']],
  ['DUR_RECOVERY_REQUIRED', [true, 'after_operator_action']],
  ['DUR_BACKUP_INVALID', [true, 'after_operator_action']],
  ['DUR_RESTORE_INVALID', [true, 'after_operator_action']],
  ['DUR_ACK_UNKNOWN', [true, 'same_idempotency_key']],
]);
const phaseOverrides = new Map([
  ['CON_SNAPSHOT_EXPIRED', 'snapshot'],
  ['CON_CURSOR_STATE', 'cursor'],
  ['DEADLINE_CURSOR_EXPIRED', 'cursor'],
  ['DUR_RECOVERY_REQUIRED', 'recover'],
  ['DUR_ACK_UNKNOWN', 'acknowledge'],
  ['DUR_BACKUP_INVALID', 'backup'],
  ['DUR_RESTORE_INVALID', 'restore'],
]);
const errorCases = errorGroups.flatMap(([category, phase, codes]) =>
  codes.map((code) => {
    const [retryable, scope] = retryOverrides.get(code) ?? [false, 'never'];
    const outcome = code === 'DUR_ACK_UNKNOWN' ? 'unknown' : 'not_applicable';
    const state = outcome === 'unknown' ? { mode: 'unknown' } : unchanged();
    const token = ['same_request', 'same_idempotency_key', 'new_snapshot'].includes(scope)
      ? 'present'
      : 'absent';
    return {
      category,
      code,
      phase: phaseOverrides.get(code) ?? phase,
      outcome,
      retryable,
      scope,
      token,
      state,
    };
  }),
);
if (errorCases.length !== 74) throw new Error(`expected 74 errors, found ${errorCases.length}`);
cases.push(
  fixture({
    id: 'errors.registry',
    title: 'Every errors-v1 category and stable code has a structured fixture envelope',
    requirements: ['GPU-004', 'QUERY-002', 'SEC-001', 'STORE-001'],
    tags: ['error', 'error-registry', 'structured-error'],
    steps: errorCases.map((entry) =>
      errorStep(
        `code-${entry.code.toLowerCase().replaceAll('_', '-')}`,
        valueAction('fixture.raise-error', [V.string(entry.code)]),
        errorExpectation(entry),
      ),
    ),
  }),
);

const operationDefinitions = [
  ['array.all', 2, 2, 'Immediate semantic containment of every requested value'],
  ['array.elem-match', 2, 2, 'Immediate element semantic equality match'],
  ['array.size', 1, 1, 'Exact immediate dense array length'],
  ['fixture.echo-order', 1, 1, 'Echo rows while exercising an explicit order expectation basis'],
  ['fixture.generate-boundary', 4, 4, 'Compact deterministic limit boundary generator'],
  ['fixture.raise-error', 1, 1, 'Emit one registered structured error for registry conformance'],
  ['numeric.add', 2, 2, 'Checked numeric addition and promotion'],
  ['numeric.negate', 1, 1, 'Checked numeric unary negation'],
  ['path.exists', 2, 2, 'Path presence without collapsing null'],
  ['path.resolve', 2, 2, 'Single/fan-out path resolution with Missing'],
  ['string.contains', 2, 2, 'Unicode scalar-sequence substring containment'],
  ['time.parse-timestamp', 1, 1, 'Strict timestamp parsing to UTC microseconds'],
  ['value.compare', 2, 2, 'Total semantic ordering comparison returning -1/0/1'],
  ['value.equal', 2, 2, 'Database semantic equality'],
  ['value.identical', 2, 2, 'Exact typed payload/presentation identity'],
  ['value.identity', 1, 1, 'Exact lossless value round trip'],
  ['vector.distance', 2, 2, 'Reference l2/dot/cosine score'],
].map(([id, minArity, maxArity, description]) => ({
  id,
  arity: { min: minArity, max: maxArity },
  description,
}));
const operationRegistry = {
  registry_schema: 'helix.semantic-operations/1',
  fixture_schema: 'helix.semantic-fixture/1',
  semantic_profile: 'helix-native-v1',
  operations: operationDefinitions,
};

const expectedCaseIds = [
  'errors.registry',
  'invalid.commands',
  'invalid.raw-inputs',
  'limits.commands-queries',
  'limits.document-values',
  'ordering.profiles',
  'presence.missing-null-paths',
  'query.missing-array-nested',
  'scalar.decimal128-specials',
  'scalar.float64-specials',
  'scalar.integers',
  'scalar.mixed-numeric',
  'scalar.null-bool',
  'scalar.string-binary',
  'scalar.temporal-identifiers',
  'scalar.vectors',
  'values.objects-arrays',
].sort();
const requiredTags = [
  'array',
  'boundary',
  'error-registry',
  'invalid-command',
  'invalid-input',
  'limit',
  'missing',
  'nested-path',
  'null',
  'ordering',
  'scalar-edge',
  'vector',
].sort();

const finalize = () => {
  const casePath = (id) => {
    const [family, ...rest] = id.split('.');
    return `fixtures/semantic/cases/${family}/${rest.join('-')}.json`;
  };
  const pretty = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  const sortedCases = [...cases].sort((left, right) => compareText(left.id, right.id));
  if (JSON.stringify(sortedCases.map((entry) => entry.id)) !== JSON.stringify(expectedCaseIds)) {
    throw new Error(`case inventory drift: ${sortedCases.map((entry) => entry.id).join(',')}`);
  }

  const usedOperations = new Set();
  const observedTags = new Set();
  const fixtureIds = new Set();
  let stepCount = 0;
  let successCount = 0;
  let errorCount = 0;
  for (const entry of sortedCases) {
    if (fixtureIds.has(entry.id)) throw new Error(`duplicate fixture ID ${entry.id}`);
    fixtureIds.add(entry.id);
    const stepIds = new Set();
    for (const tag of entry.tags) observedTags.add(tag);
    for (const step of entry.steps) {
      if (stepIds.has(step.id)) throw new Error(`${entry.id}: duplicate step ${step.id}`);
      stepIds.add(step.id);
      if (step.action.kind === 'value_operation') usedOperations.add(step.action.operation);
      stepCount += 1;
      if (step.expect.kind === 'success') successCount += 1;
      else errorCount += 1;
    }
  }
  for (const tag of requiredTags) if (!observedTags.has(tag)) throw new Error(`missing tag ${tag}`);
  const registeredOperations = new Set(operationDefinitions.map((entry) => entry.id));
  for (const operation of usedOperations) {
    if (!registeredOperations.has(operation))
      throw new Error(`unregistered operation ${operation}`);
  }
  for (const operation of registeredOperations) {
    if (!usedOperations.has(operation)) throw new Error(`unused registered operation ${operation}`);
  }

  const outputs = new Map();
  const manifestEntries = [];
  const requirementCoverage = new Map();
  for (const entry of sortedCases) {
    const repositoryPath = casePath(entry.id);
    const source = pretty(entry);
    const canonical = canonicalizeFixture(entry);
    outputs.set(repositoryPath, source);
    manifestEntries.push({
      id: entry.id,
      path: repositoryPath,
      bytes: source.length,
      source_sha256: sha256Hex(source),
      canonical_sha256: sha256Hex(canonical),
      requirements: entry.requirements,
      tags: entry.tags,
      steps: entry.steps.length,
    });
    for (const requirement of entry.requirements) {
      if (!requirementCoverage.has(requirement)) requirementCoverage.set(requirement, []);
      requirementCoverage.get(requirement).push(entry.id);
    }
  }
  const coverage = Object.fromEntries(
    [...requirementCoverage.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([requirement, ids]) => [requirement, ids.sort()]),
  );
  const manifest = {
    manifest_schema: 'helix.semantic-corpus/1',
    fixture_schema: 'helix.semantic-fixture/1',
    semantic_profile: 'helix-native-v1',
    hash_profile: 'sha256+jcs-rfc8785',
    generated_by: { tool: 'generate-semantic-corpus', version: '1.0.0' },
    counts: {
      fixtures: sortedCases.length,
      steps: stepCount,
      successes: successCount,
      errors: errorCount,
    },
    coverage,
    fixtures: manifestEntries,
  };
  outputs.set('fixtures/semantic/manifest.json', pretty(manifest));
  outputs.set('fixtures/semantic/operations-v1.json', pretty(operationRegistry));

  const coverageContract = {
    coverage_schema: 'helix.semantic-coverage/1',
    fixture_schema: 'helix.semantic-fixture/1',
    semantic_profile: 'helix-native-v1',
    expected_counts: manifest.counts,
    required_case_ids: expectedCaseIds,
    required_operations: [...registeredOperations].sort(),
    required_limit_ids: [...documentLimits, ...commandLimits].map(([id]) => id).sort(),
    required_error_codes: errorCases.map((entry) => entry.code).sort(),
    required_value_tags: [
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
    ],
    required_action_kinds: ['command', 'raw_input', 'value_operation'],
    required_order_bases: [
      'default_order_v1',
      'explicit_sort',
      'input_order',
      'not_applicable',
      'pipeline_ordinal',
      'set_semantics',
      'singleton',
      'vector_rank',
    ],
    required_tags: requiredTags,
  };
  outputs.set('fixtures/semantic/coverage-v1.json', pretty(coverageContract));
  outputs.set(
    'fixtures/semantic/error-cases-v1.json',
    pretty({
      registry_schema: 'helix.semantic-error-cases/1',
      error_registry: 'errors-v1',
      semantic_profile: 'helix-native-v1',
      cases: errorCases.map(({ state: _state, ...entry }) => entry),
    }),
  );

  const existingCasePaths = existsSync(casesRoot)
    ? readdirSync(casesRoot, { recursive: true })
        .filter((name) => name.endsWith('.json'))
        .map((name) => `fixtures/semantic/cases/${name.replaceAll('\\', '/')}`)
        .sort()
    : [];
  const expectedCasePaths = [...outputs.keys()]
    .filter((name) => name.startsWith('fixtures/semantic/cases/'))
    .sort();
  const extraCases = existingCasePaths.filter((name) => !expectedCasePaths.includes(name));
  if (extraCases.length) throw new Error(`stale corpus cases: ${extraCases.join(', ')}`);

  let mismatches = 0;
  for (const [repositoryPath, expected] of outputs) {
    const localPath = path.join(root, repositoryPath.slice('fixtures/semantic/'.length));
    if (mode === '--write') {
      mkdirSync(path.dirname(localPath), { recursive: true });
      writeFileSync(localPath, expected);
      console.log(`WRITE ${repositoryPath}`);
      continue;
    }
    if (!existsSync(localPath)) {
      console.error(`MISSING ${repositoryPath}`);
      mismatches += 1;
      continue;
    }
    const actual = readFileSync(localPath);
    if (!actual.equals(expected)) {
      console.error(`DRIFT ${repositoryPath}`);
      mismatches += 1;
    }
  }
  if (mismatches) throw new Error(`${mismatches} generated corpus artifact(s) differ`);

  console.log(
    `PASS corpus generation: ${manifest.counts.fixtures} fixtures, ${manifest.counts.steps} steps, ${manifest.counts.successes} successes, ${manifest.counts.errors} errors`,
  );
  console.log(
    `PASS coverage: ${coverageContract.required_operations.length} operations, ${coverageContract.required_limit_ids.length} limits, ${coverageContract.required_error_codes.length} error codes, ${coverageContract.required_tags.length} required tags`,
  );
};

const decomposedEAcute = V.string('é');
const composedEAcute = V.string('é');
cases.push(
  fixture({
    id: 'scalar.string-binary',
    title: 'UTF-8 preservation, binary collation, and binary subtype boundaries',
    requirements: ['DATA-001', 'QUERY-001'],
    tags: ['binary', 'collation', 'scalar-edge', 'string', 'unicode'],
    steps: [
      ...identitySteps('identity-string', [
        ['empty', V.string('')],
        ['ascii', V.string('abc')],
        ['nul', V.string('\u0000')],
        ['decomposed', decomposedEAcute],
        ['composed', composedEAcute],
        ['supplementary', V.string('😀')],
      ]),
      ...identitySteps('identity-binary', [
        ['empty', V.binary('')],
        ['zero', V.binary('00')],
        ['mixed', V.binary('00ff')],
        ['max-byte', V.binary('ff')],
      ]),
      valueStep(
        'different-normalization-forms',
        'value.equal',
        [decomposedEAcute, composedEAcute],
        falseValue,
      ),
      valueStep(
        'compare-decomposed-composed',
        'value.compare',
        [decomposedEAcute, composedEAcute],
        V.i32(-1),
      ),
      valueStep(
        'contains-scalar-sequence',
        'string.contains',
        [V.string('a😀b'), V.string('😀')],
        trueValue,
      ),
      valueStep(
        'binary-prefix-order',
        'value.compare',
        [V.binary('00'), V.binary('0000')],
        V.i32(-1),
      ),
      valueStep(
        'string-not-binary',
        'value.equal',
        [V.string('\u0000'), V.binary('00')],
        falseValue,
      ),
    ],
  }),
);

const timestampMin = V.timestamp('-62135596800000000');
const timestampMax = V.timestamp('253402300799999999');
const dateMin = V.date('-719162');
const dateMax = V.date('2932896');
cases.push(
  fixture({
    id: 'scalar.temporal-identifiers',
    title: 'Timestamp/date and accepted identifier domain/order boundaries',
    requirements: ['CORE-002', 'DATA-001', 'QUERY-001'],
    tags: ['date', 'identifier', 'object-id', 'scalar-edge', 'timestamp', 'uuid'],
    steps: [
      ...identitySteps('identity-temporal', [
        ['timestamp-min', timestampMin],
        ['timestamp-epoch', V.timestamp(0)],
        ['timestamp-max', timestampMax],
        ['date-min', dateMin],
        ['date-epoch', V.date(0)],
        ['date-max', dateMax],
      ]),
      ...identitySteps('identity-id', [
        ['uuid-min', V.uuid('00000000-0000-0000-0000-000000000000')],
        ['uuid-max', V.uuid('ffffffff-ffff-ffff-ffff-ffffffffffff')],
        ['objectid-min', V.objectId('000000000000000000000000')],
        ['objectid-max', V.objectId('ffffffffffffffffffffffff')],
      ]),
      valueStep('date-not-timestamp', 'value.equal', [V.date(0), V.timestamp(0)], falseValue),
      valueStep(
        'parse-offset-to-epoch',
        'time.parse-timestamp',
        [V.string('1970-01-01T01:00:00+01:00')],
        V.timestamp(0),
      ),
      valueStep(
        'parse-microsecond',
        'time.parse-timestamp',
        [V.string('1970-01-01T00:00:00.000001Z')],
        V.timestamp(1),
      ),
      errorStep(
        'reject-leap-second',
        valueAction('time.parse-timestamp', [V.string('2016-12-31T23:59:60Z')]),
        errorExpectation({ category: 'type', code: 'TYPE_TEMPORAL_RANGE', phase: 'execute' }),
      ),
      valueStep(
        'compare-binary-uuid',
        'value.compare',
        [V.binary('ff'), V.uuid('00000000-0000-0000-0000-000000000000')],
        V.i32(-1),
      ),
      valueStep(
        'compare-uuid-objectid',
        'value.compare',
        [V.uuid('ffffffff-ffff-ffff-ffff-ffffffffffff'), V.objectId('000000000000000000000000')],
        V.i32(-1),
      ),
    ],
  }),
);

const vectorOneZero = V.vector32(['3f800000', '00000000']);
const vectorZeroZero = V.vector32(['00000000', '00000000']);
cases.push(
  fixture({
    id: 'scalar.vectors',
    title: 'Vector family, dimension, finite-bit, equality, order, and metric edges',
    requirements: ['DATA-001', 'GPU-002', 'GPU-003', 'INV-002', 'QUERY-001'],
    tags: ['f16', 'f32', 'scalar-edge', 'vector'],
    steps: [
      ...identitySteps('identity', [
        ['f16-negative-zero', V.vector16(['8000'])],
        ['f16-min-subnormal', V.vector16(['0001'])],
        ['f16-max-finite', V.vector16(['7bff'])],
        ['f32-negative-zero', V.vector32(['80000000'])],
        ['f32-min-subnormal', V.vector32(['00000001'])],
        ['f32-max-finite', V.vector32(['7f7fffff'])],
        ['f32-two-dimensional', vectorOneZero],
      ]),
      valueStep(
        'different-family',
        'value.equal',
        [V.vector16(['3c00']), V.vector32(['3f800000'])],
        falseValue,
      ),
      valueStep(
        'different-dimension',
        'value.equal',
        [V.vector32(['3f800000']), vectorOneZero],
        falseValue,
      ),
      valueStep(
        'l2-unit-distance',
        'vector.distance',
        [vectorOneZero, vectorZeroZero],
        V.f64('3ff0000000000000'),
        { metric: 'l2' },
      ),
      valueStep(
        'dot-unit',
        'vector.distance',
        [vectorOneZero, vectorOneZero],
        V.f64('3ff0000000000000'),
        { metric: 'dot' },
      ),
      errorStep(
        'cosine-zero-norm',
        valueAction('vector.distance', [vectorOneZero, vectorZeroZero], { metric: 'cosine' }),
        errorExpectation({ category: 'type', code: 'TYPE_VECTOR_ZERO_NORM', phase: 'execute' }),
      ),
    ],
  }),
);

const objectAB = V.object([
  ['a', V.i32(1)],
  ['b', V.i32(2)],
]);
const objectBA = V.object([
  ['b', V.i32(2)],
  ['a', V.i32(1)],
]);
const array12 = V.array([V.i32(1), V.i32(2)]);
const array123 = V.array([V.i32(1), V.i32(2), V.i32(3)]);
cases.push(
  fixture({
    id: 'values.objects-arrays',
    title: 'Object presentation/equality and dense ordered array edge behavior',
    requirements: ['DATA-001', 'DATA-002', 'QUERY-001'],
    tags: ['array', 'nested-array', 'object', 'value-edge'],
    steps: [
      ...identitySteps('identity-object', [
        ['empty', V.object()],
        ['ab', objectAB],
        ['ba', objectBA],
      ]),
      ...identitySteps('identity-array', [
        ['empty', V.array()],
        ['null', V.array([V.null()])],
        ['mixed', V.array([V.i32(1), V.string('1'), V.null()])],
        ['nested', V.array([V.array([V.i32(1)]), V.array([V.i32(2)])])],
      ]),
      valueStep(
        'object-order-independent-equality',
        'value.equal',
        [objectAB, objectBA],
        trueValue,
      ),
      valueStep(
        'object-presentation-not-identical',
        'value.identical',
        [objectAB, objectBA],
        falseValue,
      ),
      valueStep('object-canonical-compare-equal', 'value.compare', [objectAB, objectBA], V.i32(0)),
      valueStep(
        'array-equality',
        'value.equal',
        [array12, V.array([V.i32(1), V.i32(2)])],
        trueValue,
      ),
      valueStep(
        'array-order-matters',
        'value.equal',
        [array12, V.array([V.i32(2), V.i32(1)])],
        falseValue,
      ),
      valueStep('array-prefix-order', 'value.compare', [array12, array123], V.i32(-1)),
      valueStep('array-size', 'array.size', [array123], V.i64(3)),
      valueStep(
        'array-all-immediate',
        'array.all',
        [V.array([V.i32(1), V.i32(2), V.i32(1)]), V.array([V.i32(1), V.i32(2)])],
        trueValue,
      ),
      valueStep(
        'array-elem-match-whole-nested',
        'array.elem-match',
        [V.array([V.array([V.i32(1)]), V.array([V.i32(2)])]), V.array([V.i32(2)])],
        trueValue,
      ),
    ],
  }),
);

const presenceDocument = V.object([
  ['_id', V.i32(1)],
  ['explicit_null', V.null()],
  ['nested', V.object([['value', V.i32(7)]])],
  [
    'items',
    V.array([
      V.object([['x', V.i32(1)]]),
      V.object([['x', V.i32(2)]]),
      V.object([['y', V.i32(3)]]),
    ]),
  ],
]);
cases.push(
  fixture({
    id: 'presence.missing-null-paths',
    title: 'Missing versus null and nested/fan-out path resolution',
    requirements: ['DATA-002', 'QUERY-001'],
    tags: ['missing', 'nested-path', 'null', 'path-fanout'],
    steps: [
      valueStep(
        'resolve-missing-root',
        'path.resolve',
        [presenceDocument, V.string('absent')],
        V.missing(),
        { mode: 'single' },
      ),
      valueStep(
        'resolve-explicit-null',
        'path.resolve',
        [presenceDocument, V.string('explicit_null')],
        V.null(),
        { mode: 'single' },
      ),
      valueStep(
        'resolve-nested-value',
        'path.resolve',
        [presenceDocument, V.string('nested.value')],
        V.i32(7),
        { mode: 'single' },
      ),
      valueStep(
        'resolve-nested-missing',
        'path.resolve',
        [presenceDocument, V.string('nested.absent')],
        V.missing(),
        { mode: 'single' },
      ),
      valueStep(
        'resolve-array-fanout',
        'path.resolve',
        [presenceDocument, V.string('items.x')],
        V.array([V.i32(1), V.i32(2)]),
        { mode: 'fanout' },
      ),
      valueStep(
        'exists-missing',
        'path.exists',
        [presenceDocument, V.string('absent')],
        falseValue,
      ),
      valueStep(
        'exists-null',
        'path.exists',
        [presenceDocument, V.string('explicit_null')],
        trueValue,
      ),
      valueStep('missing-not-null', 'value.equal', [V.missing(), V.null()], falseValue),
      valueStep('missing-before-null', 'value.compare', [V.missing(), V.null()], V.i32(-1)),
    ],
  }),
);

const int32Min = V.i32('-2147483648');
const int32Max = V.i32('2147483647');
const int64Min = V.i64('-9223372036854775808');
const int64Max = V.i64('9223372036854775807');
cases.push(
  fixture({
    id: 'scalar.integers',
    title: 'Signed integer widths, promotion, boundaries, and checked failures',
    requirements: ['DATA-001', 'QUERY-001', 'QUERY-002'],
    tags: ['integer', 'numeric', 'scalar-edge'],
    steps: [
      ...identitySteps('identity', [
        ['int32-min', int32Min],
        ['int32-negative-one', V.i32(-1)],
        ['int32-zero', V.i32(0)],
        ['int32-one', V.i32(1)],
        ['int32-max', int32Max],
        ['int64-min', int64Min],
        ['int64-max', int64Max],
      ]),
      valueStep('equal-cross-width-one', 'value.equal', [V.i32(1), V.i64(1)], trueValue),
      valueStep('compare-int64-min-int32-min', 'value.compare', [int64Min, int32Min], V.i32(-1)),
      valueStep('widen-int32-add', 'numeric.add', [int32Max, V.i32(1)], V.i64('2147483648')),
      valueStep('negate-int32-min', 'numeric.negate', [int32Min], V.i64('2147483648')),
      errorStep(
        'overflow-int64-add',
        valueAction('numeric.add', [int64Max, V.i32(1)]),
        errorExpectation({ category: 'type', code: 'TYPE_NUMERIC_OVERFLOW', phase: 'execute' }),
      ),
      errorStep(
        'underflow-int64-add',
        valueAction('numeric.add', [int64Min, V.i32(-1)]),
        errorExpectation({ category: 'type', code: 'TYPE_NUMERIC_UNDERFLOW', phase: 'execute' }),
      ),
      errorStep(
        'overflow-negate-int64-min',
        valueAction('numeric.negate', [int64Min]),
        errorExpectation({ category: 'type', code: 'TYPE_NUMERIC_OVERFLOW', phase: 'execute' }),
      ),
    ],
  }),
);

const floatValues = [
  ['negative-infinity', V.f64('fff0000000000000')],
  ['negative-max-finite', V.f64('ffefffffffffffff')],
  ['negative-zero', V.f64('8000000000000000')],
  ['positive-zero', V.f64('0000000000000000')],
  ['min-subnormal', V.f64('0000000000000001')],
  ['max-subnormal', V.f64('000fffffffffffff')],
  ['min-normal', V.f64('0010000000000000')],
  ['one', V.f64('3ff0000000000000')],
  ['max-finite', V.f64('7fefffffffffffff')],
  ['positive-infinity', V.f64('7ff0000000000000')],
  ['signaling-nan', V.f64('7ff0000000000001')],
  ['quiet-nan', V.f64('7ff8000000000000')],
  ['negative-nan-payload', V.f64('fff8000000000001')],
];
cases.push(
  fixture({
    id: 'scalar.float64-specials',
    title: 'Binary64 finite boundaries, signed zeros, infinities, and NaN payloads',
    requirements: ['DATA-001', 'INV-002', 'QUERY-001'],
    tags: ['float64', 'numeric', 'scalar-edge', 'special-value'],
    steps: [
      ...identitySteps('identity', floatValues),
      valueStep(
        'equal-signed-zero',
        'value.equal',
        [V.f64('8000000000000000'), V.f64('0000000000000000')],
        trueValue,
      ),
      valueStep(
        'different-signed-zero-payload',
        'value.identical',
        [V.f64('8000000000000000'), V.f64('0000000000000000')],
        falseValue,
      ),
      valueStep(
        'equal-nan-payloads',
        'value.equal',
        [V.f64('7ff0000000000001'), V.f64('fff8000000000001')],
        trueValue,
      ),
      valueStep(
        'different-nan-payload-identity',
        'value.identical',
        [V.f64('7ff0000000000001'), V.f64('fff8000000000001')],
        falseValue,
      ),
      valueStep(
        'compare-negative-infinity-finite',
        'value.compare',
        [V.f64('fff0000000000000'), V.f64('ffefffffffffffff')],
        V.i32(-1),
      ),
      valueStep(
        'compare-positive-infinity-nan',
        'value.compare',
        [V.f64('7ff0000000000000'), V.f64('7ff8000000000000')],
        V.i32(-1),
      ),
    ],
  }),
);

const decimalMaxCoefficient = '9999999999999999999999999999999999';
const decimalValues = [
  ['negative-infinity', V.decimalInfinity('negative')],
  ['negative-zero', V.decimal('negative', '0', '0')],
  ['positive-zero', V.decimal('positive', '0', '0')],
  ['smallest-subnormal', V.decimal('positive', '1', '-6176')],
  ['smallest-normal', V.decimal('positive', '1', '-6143')],
  ['one-tenth', V.decimal('positive', '1', '-1')],
  ['one', V.decimal('positive', '1', '0')],
  ['max-finite', V.decimal('positive', decimalMaxCoefficient, '6111')],
  ['positive-infinity', V.decimalInfinity('positive')],
  ['nan', V.decimalNaN()],
];
cases.push(
  fixture({
    id: 'scalar.decimal128-specials',
    title: 'Decimal128 canonical coefficient, exponent, subnormal, and special edges',
    requirements: ['DATA-001', 'QUERY-001'],
    tags: ['decimal128', 'numeric', 'scalar-edge', 'special-value'],
    steps: [
      ...identitySteps('identity', decimalValues),
      valueStep(
        'equal-signed-zero',
        'value.equal',
        [V.decimal('negative', '0', '0'), V.decimal('positive', '0', '0')],
        trueValue,
      ),
      valueStep(
        'different-signed-zero-identity',
        'value.identical',
        [V.decimal('negative', '0', '0'), V.decimal('positive', '0', '0')],
        falseValue,
      ),
      valueStep(
        'compare-subnormal-normal',
        'value.compare',
        [V.decimal('positive', '1', '-6176'), V.decimal('positive', '1', '-6143')],
        V.i32(-1),
      ),
      valueStep(
        'add-one-tenth-one',
        'numeric.add',
        [V.decimal('positive', '1', '-1'), V.i32(1)],
        V.decimal('positive', '11', '-1'),
      ),
      errorStep(
        'overflow-max-plus-max',
        valueAction('numeric.add', [
          V.decimal('positive', decimalMaxCoefficient, '6111'),
          V.decimal('positive', decimalMaxCoefficient, '6111'),
        ]),
        errorExpectation({ category: 'type', code: 'TYPE_NUMERIC_OVERFLOW', phase: 'execute' }),
      ),
    ],
  }),
);

cases.push(
  fixture({
    id: 'scalar.mixed-numeric',
    title: 'Exact mixed numeric equality, comparison, and coercion boundaries',
    requirements: ['DATA-001', 'QUERY-001', 'QUERY-002'],
    tags: ['mixed-numeric', 'numeric', 'scalar-edge'],
    steps: [
      valueStep('equal-int32-int64', 'value.equal', [V.i32(1), V.i64(1)], trueValue),
      valueStep(
        'equal-int64-float',
        'value.equal',
        [V.i64(1), V.f64('3ff0000000000000')],
        trueValue,
      ),
      valueStep(
        'equal-int32-decimal',
        'value.equal',
        [V.i32(1), V.decimal('positive', '1', '0')],
        trueValue,
      ),
      valueStep(
        'different-decimal-float-tenth',
        'value.equal',
        [V.decimal('positive', '1', '-1'), V.f64('3fb999999999999a')],
        falseValue,
      ),
      valueStep(
        'add-exact-int-float',
        'numeric.add',
        [V.i64('9007199254740992'), V.f64('3ff0000000000000')],
        V.f64('4340000000000000'),
      ),
      errorStep(
        'reject-inexact-int-float',
        valueAction('numeric.add', [V.i64('9007199254740993'), V.f64('3ff0000000000000')]),
        errorExpectation({ category: 'type', code: 'TYPE_COERCION_LOSS', phase: 'execute' }),
      ),
      errorStep(
        'reject-decimal-float-mix',
        valueAction('numeric.add', [V.decimal('positive', '1', '0'), V.f64('3ff0000000000000')]),
        errorExpectation({ category: 'type', code: 'TYPE_MISMATCH', phase: 'execute' }),
      ),
    ],
  }),
);

const queryDocuments = [
  V.object([
    ['_id', V.i32(1)],
    ['a', V.array([V.i32(1), V.i32(2)])],
    ['profile', V.object([['age', V.i32(21)]])],
  ]),
  V.object([
    ['_id', V.i32(2)],
    ['x', V.null()],
    ['a', V.array([V.i32(2), V.i32(3)])],
    ['profile', V.object([['age', V.i32(17)]])],
  ]),
  V.object([
    ['_id', V.i32(3)],
    ['x', V.i32(1)],
    ['a', V.array([V.i32(3)])],
    ['profile', V.object([['age', V.i32(30)]])],
  ]),
];
const findResult = (rows) => V.object([['rows', V.array(rows)]]);
const findOrder = (rows) =>
  orderExact(
    'default_order_v1',
    rows.map((document) => [valueKey(document.fields.find((field) => field.name === '_id').value)]),
  );
const findStep = (id, command, rows, orderRows = rows) => ({
  id,
  action: commandAction(command),
  expect: success(findResult(rows), { order: findOrder(orderRows) }),
});
cases.push(
  fixture({
    id: 'query.missing-array-nested',
    title: 'Missing/null, array operators, nested paths, projection, and default order in commands',
    requirements: ['DATA-002', 'QUERY-001'],
    tags: ['array', 'command', 'missing', 'nested-path', 'null', 'query'],
    initialState: {
      collections: [
        {
          name: 'docs',
          document_order: 'default_order_v1',
          documents: queryDocuments,
        },
      ],
    },
    steps: [
      findStep('find-all', { find: 'docs', filter: {} }, queryDocuments),
      findStep('native-null-only', { find: 'docs', filter: { x: { $eq: literal(V.null()) } } }, [
        queryDocuments[1],
      ]),
      findStep('missing-exists-false', { find: 'docs', filter: { x: { $exists: false } } }, [
        queryDocuments[0],
      ]),
      findStep('array-size-two', { find: 'docs', filter: { a: { $size: literal(V.i32(2)) } } }, [
        queryDocuments[0],
        queryDocuments[1],
      ]),
      findStep(
        'array-all-two',
        {
          find: 'docs',
          filter: { a: { $all: literal(V.array([V.i32(2)])) } },
        },
        [queryDocuments[0], queryDocuments[1]],
      ),
      findStep(
        'array-elem-match-two',
        {
          find: 'docs',
          filter: { a: { $elemMatch: { $eq: literal(V.i32(2)) } } },
        },
        [queryDocuments[0], queryDocuments[1]],
      ),
      findStep(
        'nested-age-adult',
        {
          find: 'docs',
          filter: { 'profile.age': { $gte: literal(V.i32(18)) } },
        },
        [queryDocuments[0], queryDocuments[2]],
      ),
      findStep(
        'project-without-id-keeps-hidden-order',
        {
          find: 'docs',
          filter: {},
          projection: { _id: 0, x: 1 },
        },
        [V.object([]), V.object([['x', V.null()]]), V.object([['x', V.i32(1)]])],
        queryDocuments,
      ),
    ],
  }),
);

const commandError = (id, command, category, code, outcome = 'not_applicable') =>
  errorStep(
    id,
    commandAction(command),
    errorExpectation({ category, code, phase: 'validate', outcome }),
  );
cases.push(
  fixture({
    id: 'invalid.commands',
    title: 'Unknown, malformed, protected, conflicting, and unsupported commands fail explicitly',
    requirements: ['QUERY-002'],
    tags: ['command', 'error', 'invalid-command', 'validation'],
    steps: [
      commandError('unknown-command', { frobnicate: 'docs' }, 'validation', 'VAL_UNKNOWN_COMMAND'),
      commandError(
        'unknown-operator',
        { find: 'docs', filter: { x: { $mystery: literal(V.i32(1)) } } },
        'validation',
        'VAL_UNKNOWN_OPERATOR',
      ),
      commandError(
        'unknown-option',
        { find: 'docs', filter: {}, mysteryOption: true },
        'validation',
        'VAL_UNKNOWN_OPTION',
      ),
      commandError(
        'invalid-sort-direction',
        { find: 'docs', filter: {}, sort: { x: 0 } },
        'validation',
        'VAL_INVALID_LITERAL',
      ),
      commandError(
        'protected-id-update',
        {
          updateOne: 'docs',
          filter: { _id: { $eq: literal(V.i32(1)) } },
          update: { $set: { _id: literal(V.i32(2)) } },
        },
        'validation',
        'VAL_PROTECTED_FIELD',
        'not_committed',
      ),
      commandError(
        'conflicting-update-paths',
        {
          updateOne: 'docs',
          filter: { _id: { $eq: literal(V.i32(1)) } },
          update: {
            $set: {
              a: literal(V.object()),
              'a.b': literal(V.i32(1)),
            },
          },
        },
        'validation',
        'VAL_CONFLICTING_PATHS',
        'not_committed',
      ),
      commandError(
        'vector-sort-combination',
        {
          find: 'docs',
          filter: {
            embedding: {
              $vectorTopK: {
                vector: literal(V.vector32(['3f800000'])),
                metric: 'l2',
                k: 1,
              },
            },
          },
          sort: { _id: 1 },
        },
        'validation',
        'VAL_UNSUPPORTED_COMBINATION',
      ),
    ],
  }),
);

const rawInput = (encoding, bytesHex, compression = 'identity') => ({
  kind: 'raw_input',
  target: 'command',
  encoding,
  compression,
  bytes_hex: bytesHex,
});
const utf8Hex = (text) => Buffer.from(text, 'utf8').toString('hex');
const invalidTypedRaw = (value) =>
  rawInput('json', utf8Hex(JSON.stringify({ value: { $value: value } })));
const invalidTypedExpectation = () =>
  errorExpectation({ category: 'parse', code: 'PAR_INVALID_TYPED_VALUE', phase: 'decode' });
cases.push(
  fixture({
    id: 'invalid.raw-inputs',
    title: 'Malformed bytes, UTF-8, duplicate keys, typed payloads, and compression fail safely',
    requirements: ['QUERY-002'],
    tags: ['duplicate-field', 'invalid-input', 'parse', 'raw-input', 'utf8'],
    steps: [
      errorStep(
        'empty-input',
        rawInput('json', ''),
        errorExpectation({ category: 'parse', code: 'PAR_TRUNCATED_INPUT', phase: 'decode' }),
      ),
      errorStep(
        'truncated-object',
        rawInput('json', '7b'),
        errorExpectation({ category: 'parse', code: 'PAR_TRUNCATED_INPUT', phase: 'decode' }),
      ),
      errorStep(
        'invalid-utf8',
        rawInput('json', 'ff'),
        errorExpectation({ category: 'parse', code: 'PAR_INVALID_UTF8', phase: 'decode' }),
      ),
      errorStep(
        'invalid-json-token',
        rawInput('json', utf8Hex('{"x":NaN}')),
        errorExpectation({ category: 'parse', code: 'PAR_INVALID_JSON', phase: 'decode' }),
      ),
      errorStep(
        'duplicate-json-field',
        rawInput('json', utf8Hex('{"find":"docs","filter":{"x":1,"x":2}}')),
        errorExpectation({
          category: 'validation',
          code: 'VAL_DUPLICATE_FIELD',
          phase: 'validate',
        }),
      ),
      errorStep(
        'invalid-typed-integer',
        rawInput(
          'json',
          utf8Hex('{"find":"docs","filter":{"x":{"$eq":{"$value":{"t":"int64","value":1}}}}}'),
        ),
        errorExpectation({ category: 'parse', code: 'PAR_INVALID_TYPED_VALUE', phase: 'decode' }),
      ),
      errorStep(
        'int32-above-maximum',
        invalidTypedRaw({ t: 'int32', value: '2147483648' }),
        invalidTypedExpectation(),
      ),
      errorStep(
        'int64-below-minimum',
        invalidTypedRaw({ t: 'int64', value: '-9223372036854775809' }),
        invalidTypedExpectation(),
      ),
      errorStep(
        'decimal-below-quantum',
        invalidTypedRaw({
          t: 'decimal128',
          class: 'finite',
          sign: 'positive',
          coefficient: '1',
          exponent: '-6177',
        }),
        invalidTypedExpectation(),
      ),
      errorStep(
        'decimal-above-adjusted-maximum',
        invalidTypedRaw({
          t: 'decimal128',
          class: 'finite',
          sign: 'positive',
          coefficient: '9999999999999999999999999999999999',
          exponent: '6112',
        }),
        invalidTypedExpectation(),
      ),
      errorStep(
        'timestamp-above-maximum',
        invalidTypedRaw({ t: 'timestamp', microseconds: '253402300800000000' }),
        invalidTypedExpectation(),
      ),
      errorStep(
        'date-above-maximum',
        invalidTypedRaw({ t: 'date', days: '2932897' }),
        invalidTypedExpectation(),
      ),
      errorStep(
        'malformed-uuid',
        invalidTypedRaw({ t: 'uuid', value: '00000000000000000000000000000000' }),
        invalidTypedExpectation(),
      ),
      errorStep(
        'malformed-objectid',
        invalidTypedRaw({ t: 'objectId', value: '0000' }),
        invalidTypedExpectation(),
      ),
      errorStep(
        'odd-binary-hex',
        invalidTypedRaw({ t: 'binary', subtype: 0, hex: '0' }),
        invalidTypedExpectation(),
      ),
      errorStep(
        'nonfinite-vector-component',
        invalidTypedRaw({
          t: 'vector',
          element: 'f32',
          dimension: 1,
          bits: ['7f800000'],
        }),
        invalidTypedExpectation(),
      ),
      errorStep(
        'lone-surrogate-string',
        rawInput('json', utf8Hex('{"value":{"$value":{"t":"string","value":"\\ud800"}}}')),
        errorExpectation({ category: 'parse', code: 'PAR_INVALID_UTF8', phase: 'decode' }),
      ),
      errorStep(
        'invalid-gzip',
        rawInput('json', '00', 'gzip'),
        errorExpectation({ category: 'parse', code: 'PAR_COMPRESSION_FAILED', phase: 'decode' }),
      ),
    ],
  }),
);

const documentLimits = [
  ['document.canonical_bytes', 16777216, 'bytes', true],
  ['document.depth', 100, 'levels', true],
  ['object.fields', 10000, 'count', true],
  ['document.total_fields', 100000, 'count', true],
  ['field_name.utf8_bytes', 1024, 'bytes', true],
  ['field_name.scalars', 256, 'count', true],
  ['path.utf8_bytes', 4096, 'bytes', true],
  ['path.segments', 100, 'count', true],
  ['array.elements', 1000000, 'count', true],
  ['vector.dimension', 4096, 'count', true],
  ['id.payload_bytes', 1024, 'bytes', true],
];
const commandLimits = [
  ['command.raw_bytes', 67108864, 'bytes', false],
  ['command.expanded_bytes', 67108864, 'bytes', false],
  ['batch.items', 1000, 'count', true],
  ['pipeline.stages', 256, 'count', false],
  ['ast.nodes', 4096, 'count', false],
  ['ast.depth', 64, 'levels', false],
  ['literal_list.items', 10000, 'count', false],
  ['sort.keys', 64, 'count', false],
  ['projection.paths', 10000, 'count', false],
  ['regex.pattern_bytes', 65536, 'bytes', false],
  ['vector.top_k', 10000, 'count', false],
  ['path.candidates', 1000000, 'count', false],
];
const boundarySummary = (limitId, relation, maximum, observed) =>
  V.object([
    ['limit_id', V.string(limitId)],
    ['relation', V.string(relation)],
    ['maximum', V.i64(maximum)],
    ['observed', V.i64(observed)],
    ['accepted', V.bool(true)],
  ]);
const boundarySteps = (limits) =>
  limits.flatMap(([limitId, maximum, unit, mutation]) =>
    ['below', 'at', 'above'].map((relation) => {
      const observed =
        relation === 'below' ? maximum - 1 : relation === 'at' ? maximum : maximum + 1;
      const id = `${limitId.replaceAll('.', '-')}-${relation}`;
      const action = valueAction(
        'fixture.generate-boundary',
        [V.string(limitId), V.string(relation), V.i64(maximum), V.i64(observed)],
        { unit, mutation },
      );
      if (relation !== 'above') {
        return {
          id,
          action,
          expect: success(boundarySummary(limitId, relation, maximum, observed)),
        };
      }
      return errorStep(
        id,
        action,
        errorExpectation({
          category: 'quota',
          code: 'QUOTA_LIMIT_EXCEEDED',
          phase: 'validate',
          outcome: mutation ? 'not_committed' : 'not_applicable',
          details: { limit_id: limitId, maximum, observed, unit },
        }),
      );
    }),
  );
cases.push(
  fixture({
    id: 'limits.document-values',
    title: 'Below, at, and above every document/value/path limit',
    requirements: ['DATA-001', 'QUERY-002', 'SEC-002'],
    tags: ['boundary', 'document-limit', 'limit'],
    steps: boundarySteps(documentLimits),
  }),
  fixture({
    id: 'limits.commands-queries',
    title: 'Below, at, and above every command/query/work limit',
    requirements: ['QUERY-002', 'SEC-002'],
    tags: ['boundary', 'command-limit', 'limit'],
    steps: boundarySteps(commandLimits),
  }),
);

const orderRows = V.array([V.string('row-a'), V.string('row-b')]);
cases.push(
  fixture({
    id: 'ordering.profiles',
    title: 'Every exact, input, rank, pipeline, singleton, and explicit set order basis',
    requirements: ['INV-002', 'QUERY-001'],
    tags: ['ordering', 'provenance', 'stable-order'],
    steps: [
      {
        id: 'explicit-sort',
        action: valueAction('fixture.echo-order', [orderRows], { basis: 'explicit_sort' }),
        expect: success(orderRows, {
          order: orderExact('explicit_sort', [
            [valueKey(V.i32(1)), valueKey(V.i32(2))],
            [valueKey(V.i32(1)), valueKey(V.i32(3))],
          ]),
        }),
      },
      {
        id: 'vector-rank',
        action: valueAction('fixture.echo-order', [orderRows], { basis: 'vector_rank' }),
        expect: success(orderRows, {
          order: orderExact('vector_rank', [
            [valueKey(V.f64('3ff0000000000000')), valueKey(V.i32(1))],
            [valueKey(V.f64('4000000000000000')), valueKey(V.i32(2))],
          ]),
        }),
      },
      {
        id: 'pipeline-ordinal',
        action: valueAction('fixture.echo-order', [orderRows], { basis: 'pipeline_ordinal' }),
        expect: success(orderRows, {
          order: orderExact('pipeline_ordinal', [
            [valueKey(V.i32(1)), indexKey(0)],
            [valueKey(V.i32(1)), indexKey(1)],
          ]),
        }),
      },
      {
        id: 'input-order',
        action: valueAction('fixture.echo-order', [orderRows], { basis: 'input_order' }),
        expect: success(orderRows, {
          order: orderExact('input_order', [[indexKey(0)], [indexKey(1)]]),
        }),
      },
      {
        id: 'singleton',
        action: valueAction('fixture.echo-order', [V.array([V.string('only')])], {
          basis: 'singleton',
        }),
        expect: success(V.array([V.string('only')]), {
          order: orderExact('singleton', [[{ kind: 'singleton', value: 'fixture-result' }]]),
        }),
      },
      {
        id: 'explicit-set-semantics',
        action: valueAction('fixture.echo-order', [orderRows], { basis: 'set_semantics' }),
        expect: success(orderRows, {
          order: {
            mode: 'set',
            basis: 'set_semantics',
            row_count: 2,
            keys: [],
          },
        }),
      },
    ],
  }),
);

finalize();

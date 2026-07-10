import { isDeepStrictEqual } from 'node:util';
import { canonicalize, sha256Hex } from './canonical.mjs';
import { executeCommand } from './command.mjs';
import { decodeRawInput } from './raw-json.mjs';
import {
  LIMITS,
  ORACLE_PROFILE,
  ORACLE_VERSION,
  OracleExecutionError,
  errorMetadata,
  fixtureFailure,
} from './registry.mjs';
import { validateCorpus, validateFixture } from './validate.mjs';
import {
  V,
  addNumeric,
  arrayAll,
  arrayElemMatch,
  cloneValue,
  compareValues,
  equalValues,
  identicalValues,
  negateNumeric,
  parseTimestamp,
  pathExists,
  resolvePath,
  vectorDistance,
} from './value.mjs';

const notApplicableOrder = () => ({
  mode: 'not_applicable',
  basis: 'not_applicable',
  row_count: 0,
  keys: [],
});
const unchangedState = () => ({ mode: 'unchanged' });
const indexKey = (value) => ({ kind: 'index', value });
const valueKey = (value, direction = 'asc') => ({ kind: 'value', direction, value });

const syntheticEchoOrder = (rows, basis) => {
  if (basis === 'set_semantics') {
    return { mode: 'set', basis, row_count: rows.length, keys: [] };
  }
  const components = rows.map((_, index) => {
    switch (basis) {
      case 'explicit_sort':
        return [valueKey(V.i32(1)), valueKey(V.i32(index + 2))];
      case 'vector_rank':
        return [
          valueKey(V.f64(index === 0 ? '3ff0000000000000' : '4000000000000000')),
          valueKey(V.i32(index + 1)),
        ];
      case 'pipeline_ordinal':
        return [valueKey(V.i32(1)), indexKey(index)];
      case 'input_order':
        return [indexKey(index)];
      case 'singleton':
        if (rows.length !== 1) fixtureFailure('oracle.operation.echo_order', '$', 'singleton has multiple rows');
        return [{ kind: 'singleton', value: 'fixture-result' }];
      default:
        fixtureFailure('oracle.operation.echo_order', '$', `unsupported echo basis ${basis}`);
    }
  });
  return {
    mode: 'exact',
    basis,
    row_count: rows.length,
    keys: components.map((items) => ({ components: items })),
  };
};

const requireTag = (value, tag, at) => {
  if (value.t !== tag) fixtureFailure('oracle.operation.argument', at, `expected ${tag}, received ${value.t}`);
  return value;
};

const optionKeysByOperation = Object.freeze({
  'path.resolve': ['mode'],
  'vector.distance': ['metric'],
  'fixture.generate-boundary': ['mutation', 'unit'],
  'fixture.echo-order': ['basis'],
});

const validateOperationOptions = (action) => {
  const expected = optionKeysByOperation[action.operation] ?? [];
  const actual = action.options === undefined
    ? []
    : isRecord(action.options)
      ? Object.keys(action.options).sort()
      : undefined;
  if (
    actual === undefined ||
    actual.length !== expected.length ||
    actual.some((key, index) => key !== [...expected].sort()[index])
  ) fixtureFailure('oracle.operation.options', '$.options', `invalid options for ${action.operation}`);
};

const executeBoundary = (action) => {
  const [limitValue, relationValue, maximumValue, observedValue] = action.arguments;
  requireTag(limitValue, 'string', '$.arguments[0]');
  requireTag(relationValue, 'string', '$.arguments[1]');
  requireTag(maximumValue, 'int64', '$.arguments[2]');
  requireTag(observedValue, 'int64', '$.arguments[3]');
  const definition = LIMITS[limitValue.value];
  if (!definition) fixtureFailure('oracle.operation.limit_id', '$.arguments[0]', 'unknown limit');
  const relation = relationValue.value;
  const maximum = BigInt(maximumValue.value);
  const observed = BigInt(observedValue.value);
  if (maximum !== definition.maximum) fixtureFailure('oracle.operation.limit_maximum', '$.arguments[2]', 'drift');
  const expectedObserved = {
    below: maximum - 1n,
    at: maximum,
    above: maximum + 1n,
  }[relation];
  if (expectedObserved === undefined || observed !== expectedObserved) {
    fixtureFailure('oracle.operation.limit_relation', '$.arguments', 'invalid boundary relation');
  }
  if (
    action.options?.unit !== definition.unit ||
    action.options?.mutation !== definition.mutation
  ) fixtureFailure('oracle.operation.limit_options', '$.options', 'limit metadata drift');
  if (observed > maximum) {
    throw new OracleExecutionError('QUOTA_LIMIT_EXCEEDED', {
      outcome: definition.mutation ? 'not_committed' : 'not_applicable',
      phase: 'validate',
      details: {
        limit_id: limitValue.value,
        maximum: Number(maximum),
        observed: Number(observed),
        unit: definition.unit,
      },
    });
  }
  return V.object([
    ['limit_id', V.string(limitValue.value)],
    ['relation', V.string(relation)],
    ['maximum', V.i64(maximum)],
    ['observed', V.i64(observed)],
    ['accepted', V.bool(true)],
  ]);
};

const executeValueOperation = (action) => {
  const args = action.arguments;
  validateOperationOptions(action);
  switch (action.operation) {
    case 'value.identity':
      return { value: cloneValue(args[0]), order: notApplicableOrder() };
    case 'value.equal':
      return { value: V.bool(equalValues(args[0], args[1])), order: notApplicableOrder() };
    case 'value.identical':
      return { value: V.bool(identicalValues(args[0], args[1])), order: notApplicableOrder() };
    case 'value.compare':
      return { value: V.i32(compareValues(args[0], args[1])), order: notApplicableOrder() };
    case 'numeric.add':
      return { value: addNumeric(args[0], args[1]), order: notApplicableOrder() };
    case 'numeric.negate':
      return { value: negateNumeric(args[0]), order: notApplicableOrder() };
    case 'array.size':
      requireTag(args[0], 'array', '$.arguments[0]');
      return { value: V.i64(args[0].values.length), order: notApplicableOrder() };
    case 'array.all':
      return { value: arrayAll(args[0], args[1]), order: notApplicableOrder() };
    case 'array.elem-match':
      return { value: arrayElemMatch(args[0], args[1]), order: notApplicableOrder() };
    case 'path.exists':
      return { value: pathExists(args[0], args[1]), order: notApplicableOrder() };
    case 'path.resolve':
      return {
        value: resolvePath(args[0], args[1], action.options?.mode ?? 'single'),
        order: notApplicableOrder(),
      };
    case 'string.contains':
      requireTag(args[0], 'string', '$.arguments[0]');
      requireTag(args[1], 'string', '$.arguments[1]');
      return { value: V.bool(args[0].value.includes(args[1].value)), order: notApplicableOrder() };
    case 'time.parse-timestamp':
      return { value: parseTimestamp(args[0]), order: notApplicableOrder() };
    case 'vector.distance':
      return {
        value: vectorDistance(args[0], args[1], action.options?.metric),
        order: notApplicableOrder(),
      };
    case 'fixture.generate-boundary':
      return { value: executeBoundary(action), order: notApplicableOrder() };
    case 'fixture.raise-error':
      requireTag(args[0], 'string', '$.arguments[0]');
      errorMetadata(args[0].value);
      throw new OracleExecutionError(args[0].value);
    case 'fixture.echo-order':
      requireTag(args[0], 'array', '$.arguments[0]');
      return {
        value: cloneValue(args[0]),
        order: syntheticEchoOrder(args[0].values, action.options?.basis),
      };
    default:
      fixtureFailure('oracle.operation.unknown', '$.operation', action.operation);
  }
};

const normalizeError = (error) => {
  const metadata = errorMetadata(error.code);
  const outcome = error.outcome ?? metadata.outcome;
  return {
    kind: 'error',
    category: metadata.category,
    code: metadata.code,
    phase: error.phase ?? metadata.phase,
    outcome,
    retry: cloneValue(metadata.retry),
    ...(error.details === undefined ? {} : { details: cloneValue(error.details) }),
    order: notApplicableOrder(),
    state: outcome === 'unknown' ? { mode: 'unknown' } : unchangedState(),
  };
};

const executeAction = (action, sandbox) => {
  try {
    let execution;
    if (action.kind === 'value_operation') execution = executeValueOperation(action);
    else if (action.kind === 'command') execution = executeCommand(action.command, sandbox.state);
    else {
      const command = decodeRawInput(action);
      execution = executeCommand(command, sandbox.state);
    }
    return {
      kind: 'success',
      value: execution.value,
      order: execution.order,
      state: unchangedState(),
    };
  } catch (error) {
    if (!(error instanceof OracleExecutionError)) throw error;
    return normalizeError(error);
  }
};

const subset = (actual, expected) => {
  if (!isRecord(actual) || !isRecord(expected)) return isDeepStrictEqual(actual, expected);
  return Object.entries(expected).every(
    ([key, value]) => Object.hasOwn(actual, key) && (isRecord(value) ? subset(actual[key], value) : isDeepStrictEqual(actual[key], value)),
  );
};
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

const comparisonFailure = (code, expected, actual) => ({
  code,
  expected_sha256: sha256Hex(canonicalize(expected)),
  actual_sha256: sha256Hex(canonicalize(actual)),
});

export const compareExpectation = (expected, actual, preState, postState) => {
  if (expected.kind !== actual.kind) return comparisonFailure('oracle.expectation.kind', expected, actual);
  if (expected.kind === 'success') {
    if (!isDeepStrictEqual(expected.value, actual.value)) {
      return comparisonFailure('oracle.expectation.value', expected.value, actual.value);
    }
  } else {
    for (const field of ['category', 'code', 'phase', 'outcome']) {
      if (expected[field] !== actual[field]) {
        return comparisonFailure(`oracle.expectation.error_${field}`, expected[field], actual[field]);
      }
    }
    if (!isDeepStrictEqual(expected.retry, actual.retry)) {
      return comparisonFailure('oracle.expectation.error_retry', expected.retry, actual.retry);
    }
    if (expected.details_match === 'absent' && actual.details !== undefined) {
      return comparisonFailure('oracle.expectation.error_details', null, actual.details);
    }
    if (
      expected.details_match === 'exact' &&
      !isDeepStrictEqual(expected.details, actual.details)
    ) return comparisonFailure('oracle.expectation.error_details', expected.details, actual.details);
    if (expected.details_match === 'subset' && !subset(actual.details, expected.details)) {
      return comparisonFailure('oracle.expectation.error_details', expected.details, actual.details);
    }
  }
  if (!isDeepStrictEqual(expected.order, actual.order)) {
    return comparisonFailure('oracle.expectation.order', expected.order, actual.order);
  }
  if (expected.state.mode !== actual.state.mode) {
    return comparisonFailure('oracle.expectation.state_mode', expected.state, actual.state);
  }
  if (expected.state.mode === 'unchanged' && !isDeepStrictEqual(preState, postState)) {
    return comparisonFailure('oracle.expectation.state_changed', preState, postState);
  }
  if (expected.state.mode === 'exact') {
    const expectedCollections = expected.state.collections;
    const actualCollections =
      expected.state.scope === 'all'
        ? postState.collections
        : postState.collections.filter((collection) =>
            expectedCollections.some((expectedCollection) => expectedCollection.name === collection.name),
          );
    if (!isDeepStrictEqual(expectedCollections, actualCollections)) {
      return comparisonFailure('oracle.expectation.state_value', expectedCollections, actualCollections);
    }
  }
  return undefined;
};

const capabilitySandbox = (capabilities = {}) => ({
  supplied: cloneValue(capabilities),
  consumed: Object.fromEntries(Object.keys(capabilities).map((name) => [name, 0])),
});

const assertCapabilitiesConsumed = (capabilities, fixtureId) => {
  for (const [name, values] of Object.entries(capabilities.supplied)) {
    const suppliedCount = Array.isArray(values)
      ? values.length
      : isRecord(values)
        ? Object.keys(values).length
        : 0;
    if (capabilities.consumed[name] !== suppliedCount) {
      fixtureFailure(
        'oracle.capability.unused',
        fixtureId,
        `${name}: consumed ${capabilities.consumed[name]} of ${suppliedCount}`,
      );
    }
  }
};

export const runFixture = (fixture, { validate = true } = {}) => {
  if (validate) validateFixture(fixture);
  const sandbox = {
    state: cloneValue({ collections: fixture.initial_state.collections }),
    capabilities: capabilitySandbox(fixture.initial_state.capabilities),
  };
  const results = [];
  const operationCounts = {};
  const actionCounts = {};
  for (const step of fixture.steps) {
    const preState = cloneValue(sandbox.state);
    const actual = executeAction(step.action, sandbox);
    const postState = cloneValue(sandbox.state);
    const failure = compareExpectation(step.expect, actual, preState, postState);
    const operation =
      step.action.kind === 'value_operation' ? step.action.operation : step.action.kind;
    operationCounts[operation] = (operationCounts[operation] ?? 0) + 1;
    actionCounts[step.action.kind] = (actionCounts[step.action.kind] ?? 0) + 1;
    results.push({
      id: step.id,
      status: failure ? 'fail' : 'pass',
      expected_sha256: sha256Hex(canonicalize(step.expect)),
      actual_sha256: sha256Hex(canonicalize(actual)),
      ...(failure ? { diagnostic: failure } : {}),
      actual,
    });
  }
  assertCapabilitiesConsumed(sandbox.capabilities, fixture.id);
  const passed = results.filter((result) => result.status === 'pass').length;
  const failed = results.length - passed;
  return { fixture: fixture.id, passed, failed, skipped: 0, operationCounts, actionCounts, results };
};

const mergeCounts = (target, source) => {
  for (const [name, count] of Object.entries(source)) target[name] = (target[name] ?? 0) + count;
};

export const runCorpus = (repository, options = {}) => {
  const validated = validateCorpus(repository, options);
  const fixtureRuns = validated.fixtures.map((fixture) => runFixture(fixture, { validate: false }));
  const operationCounts = {};
  const actionCounts = {};
  fixtureRuns.forEach((run) => {
    mergeCounts(operationCounts, run.operationCounts);
    mergeCounts(actionCounts, run.actionCounts);
  });
  const passed = fixtureRuns.reduce((sum, run) => sum + run.passed, 0);
  const failed = fixtureRuns.reduce((sum, run) => sum + run.failed, 0);
  const skipped = fixtureRuns.reduce((sum, run) => sum + run.skipped, 0);
  const fixtures = fixtureRuns.map((run) => ({
    id: run.fixture,
    steps: run.results.length,
    passed: run.passed,
    failed: run.failed,
    skipped: run.skipped,
    observations_sha256: sha256Hex(canonicalize(run.results.map((result) => result.actual))),
  }));
  const report = {
    report_schema: 'helix.semantic-oracle-report/1',
    oracle: { profile: ORACLE_PROFILE, version: ORACLE_VERSION },
    fixture_schema: 'helix.semantic-fixture/1',
    semantic_profile: 'helix-native-v1',
    corpus_manifest_sha256: sha256Hex(validated.manifestBytes),
    counts: {
      fixtures: fixtureRuns.length,
      steps: passed + failed + skipped,
      passed,
      failed,
      skipped,
    },
    action_counts: Object.fromEntries(Object.entries(actionCounts).sort()),
    operation_counts: Object.fromEntries(Object.entries(operationCounts).sort()),
    fixtures,
    verdict: failed === 0 && skipped === 0 ? 'pass' : 'fail',
  };
  return { ...validated, fixtureRuns, report };
};

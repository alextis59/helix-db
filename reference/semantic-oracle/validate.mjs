import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonicalize, sha256Hex } from './canonical.mjs';
import { parseStrictJson } from './raw-json.mjs';
import {
  ERROR_CODES,
  errorMetadata,
  fixtureFailure,
  LIMITS,
  OPERATION_ARITY,
  REQUIRED_PROFILES,
} from './registry.mjs';
import { compareValues, objectField, validateValue } from './value.mjs';

const STABLE_ID = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/;
const REQUIREMENT_ID =
  /^(?:INV|PLAT|CORE|DATA|QUERY|STORE|GPU|DIST|CACHE|SYNC|SEC|OPS|QUAL|COMPAT)-[0-9]{3}$/;
const PLAN_ID = /^(?:P[0-9]{2}-[0-9]{3}|G[0-9]{2})$/;
const acceptedIdTags = new Set(['int32', 'int64', 'string', 'binary', 'uuid', 'objectId']);
const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);

const same = (left, right, code, at) => {
  if (!isDeepStrictEqual(left, right)) {
    fixtureFailure(code, at, `${JSON.stringify(left)} differs from ${JSON.stringify(right)}`);
  }
};

const canonicalList = (values, at, pattern = STABLE_ID) => {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string' || !pattern.test(value))
  ) {
    fixtureFailure('fixture.meta.value', at, 'list contains invalid identifier');
  }
  if (new Set(values).size !== values.length)
    fixtureFailure('fixture.meta.duplicate', at, 'duplicate list item');
  same(values, [...values].sort(), 'fixture.meta.order', at);
};

const validateCommandNode = (node, at) => {
  if (node === null || typeof node === 'boolean' || typeof node === 'string') {
    if (typeof node === 'string' && !node.isWellFormed()) {
      fixtureFailure('fixture.command.unicode', at, 'command string contains unpaired surrogate');
    }
    return;
  }
  if (typeof node === 'number') {
    if (!Number.isSafeInteger(node))
      fixtureFailure('fixture.command.number', at, 'unsafe structural number');
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((value, index) => {
      validateCommandNode(value, `${at}[${index}]`);
    });
    return;
  }
  if (!isRecord(node)) fixtureFailure('fixture.command.shape', at, 'invalid command node');
  if (Object.hasOwn(node, '$value')) {
    if (Object.keys(node).length !== 1) {
      fixtureFailure(
        'fixture.command.literal_shape',
        at,
        '$value wrapper must be the only property',
      );
    }
    validateValue(node.$value, `${at}.$value`);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (!key.isWellFormed())
      fixtureFailure('fixture.command.unicode', `${at}.${key}`, 'invalid key');
    validateCommandNode(value, `${at}.${key}`);
  }
};

const validateCollection = (collection, at) => {
  if (
    typeof collection.name !== 'string' ||
    collection.name.length === 0 ||
    !collection.name.isWellFormed()
  ) {
    fixtureFailure('fixture.state.collection_name', `${at}.name`, 'invalid collection name');
  }
  if (collection.document_order !== 'default_order_v1') {
    fixtureFailure('fixture.state.document_order_profile', `${at}.document_order`, 'wrong profile');
  }
  let priorId;
  for (const [index, document] of collection.documents.entries()) {
    const documentAt = `${at}.documents[${index}]`;
    validateValue(document, documentAt, { allowMissing: false, rootDocument: true });
    if (document.t !== 'object')
      fixtureFailure('fixture.state.document_root', documentAt, 'document is not object');
    const id = objectField(document, '_id');
    if (!id) fixtureFailure('fixture.state.missing_id', documentAt, 'document has no _id');
    if (!acceptedIdTags.has(id.t))
      fixtureFailure('fixture.state.invalid_id', documentAt, 'unsupported _id type');
    const idPayloadBytes =
      id.t === 'string'
        ? Buffer.byteLength(id.value, 'utf8')
        : id.t === 'binary'
          ? id.hex.length / 2
          : 0;
    if (idPayloadBytes > 1024) {
      fixtureFailure(
        'fixture.state.id_payload',
        `${documentAt}._id`,
        'ID payload exceeds limits-v1',
      );
    }
    if (priorId !== undefined && compareValues(priorId, id) >= 0) {
      fixtureFailure(
        'fixture.state.document_order',
        documentAt,
        'documents are duplicate/not ordered',
      );
    }
    priorId = id;
  }
  for (const [index, definition] of (collection.indexes ?? []).entries()) {
    validateCommandNode(definition, `${at}.indexes[${index}]`);
  }
  if (collection.options !== undefined) validateCommandNode(collection.options, `${at}.options`);
};

const validateCollections = (collections, at) => {
  if (!Array.isArray(collections))
    fixtureFailure('fixture.state.collections', at, 'collections is not array');
  const names = [];
  for (const [index, collection] of collections.entries()) {
    validateCollection(collection, `${at}[${index}]`);
    names.push(collection.name);
  }
  if (new Set(names).size !== names.length)
    fixtureFailure('fixture.state.duplicate_collection', at, 'duplicate collection');
  same(names, [...names].sort(), 'fixture.state.collection_order', at);
};

const validateCapabilities = (capabilities, at) => {
  if (capabilities === undefined) return;
  for (const field of ['wall_time_reads', 'expiry_time_reads']) {
    for (const [index, value] of (capabilities[field] ?? []).entries()) {
      validateValue(value, `${at}.${field}[${index}]`, { allowMissing: false });
      if (value.t !== 'timestamp')
        fixtureFailure('fixture.capability.type', `${at}.${field}[${index}]`, 'not timestamp');
    }
  }
  for (const field of ['monotonic_ticks', 'transaction_sequence']) {
    for (const [index, value] of (capabilities[field] ?? []).entries()) {
      if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
        fixtureFailure(
          'fixture.capability.integer',
          `${at}.${field}[${index}]`,
          'not canonical nonnegative integer',
        );
      }
    }
  }
  for (const [index, value] of (capabilities.random_hex ?? []).entries()) {
    if (typeof value !== 'string' || !/^(?:[0-9a-f]{2})*$/.test(value)) {
      fixtureFailure(
        'fixture.capability.random',
        `${at}.random_hex[${index}]`,
        'not whole lowercase bytes',
      );
    }
  }
  for (const [name, enabled] of Object.entries(capabilities.features ?? {})) {
    if (!STABLE_ID.test(name) || typeof enabled !== 'boolean') {
      fixtureFailure('fixture.capability.feature', `${at}.features.${name}`, 'invalid feature');
    }
  }
  for (const [name, limit] of Object.entries(capabilities.quotas ?? {})) {
    if (!STABLE_ID.test(name) || !Number.isSafeInteger(limit)) {
      fixtureFailure('fixture.capability.quota', `${at}.quotas.${name}`, 'invalid quota');
    }
  }
};

const walkTypedValues = (node, at = '$') => {
  if (Array.isArray(node)) {
    node.forEach((value, index) => {
      walkTypedValues(value, `${at}[${index}]`);
    });
    return;
  }
  if (!isRecord(node)) return;
  if (typeof node.t === 'string') {
    validateValue(node, at);
    return;
  }
  for (const [key, value] of Object.entries(node)) walkTypedValues(value, `${at}.${key}`);
};

const validateOrder = (order, at) => {
  if (!Number.isSafeInteger(order.row_count) || order.row_count < 0) {
    fixtureFailure('fixture.order.cardinality', `${at}.row_count`, 'invalid row count');
  }
  if (order.mode === 'exact') {
    if (['not_applicable', 'set_semantics'].includes(order.basis)) {
      fixtureFailure('fixture.order.basis', `${at}.basis`, 'exact order has non-exact basis');
    }
    if (order.row_count !== order.keys.length) {
      fixtureFailure('fixture.order.cardinality', at, 'exact row count differs from key count');
    }
  } else if (order.mode === 'set') {
    if (order.basis !== 'set_semantics' || order.keys.length !== 0) {
      fixtureFailure('fixture.order.set', at, 'set expectation shape mismatch');
    }
  } else if (order.mode === 'not_applicable') {
    if (order.basis !== 'not_applicable' || order.row_count !== 0 || order.keys.length !== 0) {
      fixtureFailure('fixture.order.not_applicable', at, 'not-applicable shape mismatch');
    }
  } else fixtureFailure('fixture.order.mode', `${at}.mode`, 'unknown order mode');
};

const validateError = (expectation, at) => {
  let registered;
  try {
    registered = errorMetadata(expectation.code);
  } catch {
    fixtureFailure('fixture.error.unknown_code', `${at}.code`, 'unregistered errors-v1 code');
  }
  if (expectation.category !== registered.category) {
    fixtureFailure('fixture.error.category_code', `${at}.category`, 'category/code mismatch');
  }
  if (expectation.retry.retryable) {
    if (!registered.retry.retryable || expectation.retry.scope !== registered.retry.scope) {
      fixtureFailure('fixture.error.retry_scope', `${at}.retry`, 'retry is broader than registry');
    }
    if (expectation.retry.token !== registered.retry.token) {
      fixtureFailure(
        'fixture.error.retry_token',
        `${at}.retry.token`,
        'token presence differs from registry',
      );
    }
  } else if (expectation.retry.scope !== 'never') {
    fixtureFailure('fixture.error.retry_scope', `${at}.retry`, 'nonretryable requires never');
  }
  if (expectation.outcome === 'not_committed' && expectation.state.mode !== 'unchanged') {
    fixtureFailure(
      'fixture.error.state_outcome',
      `${at}.state`,
      'not_committed requires unchanged',
    );
  }
  if (expectation.outcome === 'committed' && expectation.state.mode !== 'exact') {
    fixtureFailure('fixture.error.state_outcome', `${at}.state`, 'committed requires exact state');
  }
  if (expectation.outcome === 'unknown' && expectation.state.mode !== 'unknown') {
    fixtureFailure('fixture.error.state_outcome', `${at}.state`, 'unknown requires unknown state');
  }
  if (expectation.details_match === 'absent' && expectation.details !== undefined) {
    fixtureFailure('fixture.error.details', `${at}.details`, 'absent match carries details');
  }
  if (expectation.details_match !== 'absent' && expectation.details === undefined) {
    fixtureFailure('fixture.error.details', `${at}.details`, 'details match lacks details');
  }
};

const validateAction = (action, at) => {
  if (action.kind === 'value_operation') {
    const arity = OPERATION_ARITY[action.operation];
    if (!arity)
      fixtureFailure(
        'fixture.action.unknown_operation',
        `${at}.operation`,
        'unregistered operation',
      );
    if (action.arguments.length < arity[0] || action.arguments.length > arity[1]) {
      fixtureFailure('fixture.action.arity', `${at}.arguments`, 'operation arity mismatch');
    }
    action.arguments.forEach((value, index) => {
      validateValue(value, `${at}.arguments[${index}]`);
    });
    if (action.options !== undefined) validateCommandNode(action.options, `${at}.options`);
    return;
  }
  if (action.kind === 'command') {
    validateCommandNode(action.command, `${at}.command`);
    return;
  }
  if (action.kind === 'raw_input') {
    if (typeof action.bytes_hex !== 'string' || !/^(?:[0-9a-f]{2})*$/.test(action.bytes_hex)) {
      fixtureFailure(
        'fixture.action.raw_hex',
        `${at}.bytes_hex`,
        'raw bytes are not whole lowercase hex',
      );
    }
    return;
  }
  fixtureFailure('fixture.action.kind', `${at}.kind`, 'unknown action kind');
};

export const validateFixture = (fixture, at = '$') => {
  if (fixture.fixture_schema !== 'helix.semantic-fixture/1') {
    fixtureFailure('fixture.meta.schema', `${at}.fixture_schema`, 'unsupported fixture schema');
  }
  if (!STABLE_ID.test(fixture.id))
    fixtureFailure('fixture.meta.id', `${at}.id`, 'invalid fixture ID');
  canonicalList(fixture.requirements, `${at}.requirements`, REQUIREMENT_ID);
  canonicalList(fixture.plan_items, `${at}.plan_items`, PLAN_ID);
  canonicalList(fixture.tags, `${at}.tags`);
  same(fixture.profiles, REQUIRED_PROFILES, 'fixture.meta.profiles', `${at}.profiles`);
  validateCapabilities(fixture.initial_state.capabilities, `${at}.initial_state.capabilities`);
  validateCollections(fixture.initial_state.collections, `${at}.initial_state.collections`);
  // Domain/cross-field value failures precede operation-registry failures so a malformed
  // typed payload cannot be hidden behind an unrelated action diagnostic.
  walkTypedValues(fixture, at);
  const stepIds = new Set();
  for (const [index, step] of fixture.steps.entries()) {
    const stepAt = `${at}.steps[${index}]`;
    if (stepIds.has(step.id))
      fixtureFailure('fixture.step.duplicate_id', `${stepAt}.id`, 'duplicate step');
    stepIds.add(step.id);
    validateAction(step.action, `${stepAt}.action`);
    validateOrder(step.expect.order, `${stepAt}.expect.order`);
    if (step.expect.kind === 'success') validateValue(step.expect.value, `${stepAt}.expect.value`);
    else validateError(step.expect, `${stepAt}.expect`);
    if (step.expect.state.mode === 'exact') {
      validateCollections(step.expect.state.collections, `${stepAt}.expect.state.collections`);
    }
  }
  return fixture;
};

export const runDraft202012Validation = (repository) => {
  // biome-ignore lint/complexity/noUselessStringRaw: Embedded Python must preserve literal backslashes as the snippet evolves.
  const program = String.raw`
import glob,json,sys
from jsonschema import Draft202012Validator
root=sys.argv[1]
with open(root+'/fixtures/semantic/schema/semantic-fixture-v1.schema.json',encoding='utf-8') as f: fixture_schema=json.load(f)
with open(root+'/fixtures/semantic/schema/semantic-corpus-manifest-v1.schema.json',encoding='utf-8') as f: manifest_schema=json.load(f)
Draft202012Validator.check_schema(fixture_schema)
Draft202012Validator.check_schema(manifest_schema)
fixture_validator=Draft202012Validator(fixture_schema)
manifest_validator=Draft202012Validator(manifest_schema)
cases=sorted(glob.glob(root+'/fixtures/semantic/cases/**/*.json',recursive=True))
for p in cases:
  with open(p,encoding='utf-8') as f: value=json.load(f)
  errors=sorted(fixture_validator.iter_errors(value),key=lambda e:list(e.absolute_path))
  if errors: raise SystemExit(f'{p}: {errors[0].message}')
with open(root+'/fixtures/semantic/manifest.json',encoding='utf-8') as f: manifest=json.load(f)
errors=sorted(manifest_validator.iter_errors(manifest),key=lambda e:list(e.absolute_path))
if errors: raise SystemExit(f'manifest: {errors[0].message}')
print(f'PASS Draft 2020-12 schemas: {len(cases)} cases and manifest')
`;
  return execFileSync('python3', ['-c', program, repository], { encoding: 'utf8' }).trim();
};

export const validateOracleReport = (report) => {
  const counts = report.counts;
  if (counts.steps !== counts.passed + counts.failed + counts.skipped) {
    fixtureFailure('oracle.report.counts', '$.counts', 'step outcome totals do not reconcile');
  }
  if (counts.fixtures !== report.fixtures.length) {
    fixtureFailure('oracle.report.fixtures', '$.fixtures', 'fixture count does not reconcile');
  }
  const ids = report.fixtures.map((entry) => entry.id);
  same(ids, [...ids].sort(), 'oracle.report.fixture_order', '$.fixtures');
  if (new Set(ids).size !== ids.length)
    fixtureFailure('oracle.report.fixture_id', '$.fixtures', 'duplicate');
  const fixtureTotals = report.fixtures.reduce(
    (totals, entry) => ({
      steps: totals.steps + entry.steps,
      passed: totals.passed + entry.passed,
      failed: totals.failed + entry.failed,
      skipped: totals.skipped + entry.skipped,
    }),
    { steps: 0, passed: 0, failed: 0, skipped: 0 },
  );
  same(
    fixtureTotals,
    { steps: counts.steps, passed: counts.passed, failed: counts.failed, skipped: counts.skipped },
    'oracle.report.fixture_totals',
    '$.fixtures',
  );
  const actionTotal = Object.values(report.action_counts).reduce((sum, count) => sum + count, 0);
  const operationTotal = Object.values(report.operation_counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (actionTotal !== counts.steps || operationTotal !== counts.steps) {
    fixtureFailure('oracle.report.action_totals', '$', 'action/operation totals do not reconcile');
  }
  const verdict = counts.failed === 0 && counts.skipped === 0 ? 'pass' : 'fail';
  if (report.verdict !== verdict)
    fixtureFailure('oracle.report.verdict', '$.verdict', 'does not match outcomes');
  return report;
};

export const runReportDraft202012Validation = (repository, report) => {
  // biome-ignore lint/complexity/noUselessStringRaw: Embedded Python must preserve literal backslashes as the snippet evolves.
  const program = String.raw`
import json,sys
from jsonschema import Draft202012Validator
root=sys.argv[1]
with open(root+'/fixtures/semantic/schema/semantic-oracle-report-v1.schema.json',encoding='utf-8') as f: schema=json.load(f)
Draft202012Validator.check_schema(schema)
value=json.load(sys.stdin)
errors=sorted(Draft202012Validator(schema).iter_errors(value),key=lambda e:list(e.absolute_path))
if errors: raise SystemExit(f'oracle report: {errors[0].message}')
print('PASS Draft 2020-12 oracle report')
`;
  return execFileSync('python3', ['-c', program, repository], {
    encoding: 'utf8',
    input: JSON.stringify(report),
  }).trim();
};

const readStrict = (file) => {
  const bytes = readFileSync(file);
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fixtureFailure('fixture.source.utf8', file, 'source is not UTF-8');
  }
  if (!source.isWellFormed())
    fixtureFailure('fixture.source.unicode', file, 'source has unpaired surrogate');
  return { bytes, value: parseStrictJson(source) };
};

const validateRegistries = (semanticRoot) => {
  const operations = readStrict(path.join(semanticRoot, 'operations-v1.json')).value;
  const operationIds = operations.operations.map((entry) => entry.id);
  same(
    operationIds,
    Object.keys(OPERATION_ARITY).sort(),
    'fixture.registry.operations',
    '$.operations',
  );
  for (const entry of operations.operations) {
    same(
      [entry.arity.min, entry.arity.max],
      OPERATION_ARITY[entry.id],
      'fixture.registry.operation_arity',
      `$.operations.${entry.id}`,
    );
  }
  const errors = readStrict(path.join(semanticRoot, 'error-cases-v1.json')).value;
  const codes = errors.cases.map((entry) => entry.code).sort();
  same(codes, ERROR_CODES, 'fixture.registry.error_codes', '$.error_cases');
  for (const entry of errors.cases) {
    const expected = errorMetadata(entry.code);
    for (const field of ['category', 'phase', 'outcome']) {
      if (entry[field] !== expected[field]) {
        fixtureFailure(
          'fixture.registry.error_metadata',
          `$.error_cases.${entry.code}.${field}`,
          'mismatch',
        );
      }
    }
    for (const field of ['retryable', 'scope', 'token']) {
      if (entry[field] !== expected.retry[field]) {
        fixtureFailure(
          'fixture.registry.error_retry',
          `$.error_cases.${entry.code}.${field}`,
          'mismatch',
        );
      }
    }
  }
  const coverage = readStrict(path.join(semanticRoot, 'coverage-v1.json')).value;
  same(
    coverage.required_operations,
    Object.keys(OPERATION_ARITY).sort(),
    'fixture.coverage.operations',
    '$',
  );
  same(coverage.required_limit_ids, Object.keys(LIMITS).sort(), 'fixture.coverage.limits', '$');
  same(coverage.required_error_codes, ERROR_CODES, 'fixture.coverage.errors', '$');
  return coverage;
};

export const validateCorpus = (repository, { draft = true } = {}) => {
  const semanticRoot = path.join(repository, 'fixtures', 'semantic');
  const draftOutput = draft ? runDraft202012Validation(repository) : undefined;
  const { bytes: manifestBytes, value: manifest } = readStrict(
    path.join(semanticRoot, 'manifest.json'),
  );
  if (
    manifest.manifest_schema !== 'helix.semantic-corpus/1' ||
    manifest.fixture_schema !== 'helix.semantic-fixture/1' ||
    manifest.semantic_profile !== 'helix-native-v1' ||
    manifest.hash_profile !== 'sha256+jcs-rfc8785'
  )
    fixtureFailure('fixture.manifest.profile', '$', 'unsupported manifest profile');

  const coverageContract = validateRegistries(semanticRoot);
  const diskPaths = readdirSync(path.join(semanticRoot, 'cases'), { recursive: true })
    .filter((name) => name.endsWith('.json'))
    .map((name) => `fixtures/semantic/cases/${name.replaceAll('\\', '/')}`)
    .sort();
  same(
    manifest.fixtures.map((entry) => entry.path),
    diskPaths,
    'fixture.manifest.paths',
    '$.fixtures',
  );
  same(
    manifest.fixtures.map((entry) => entry.id),
    [...manifest.fixtures.map((entry) => entry.id)].sort(),
    'fixture.manifest.ids',
    '$.fixtures',
  );

  const fixtures = [];
  const coverage = new Map();
  let steps = 0;
  let successes = 0;
  let errors = 0;
  for (const [index, entry] of manifest.fixtures.entries()) {
    const absolute = path.resolve(repository, entry.path);
    const casesRoot = path.resolve(semanticRoot, 'cases') + path.sep;
    if (!absolute.startsWith(casesRoot))
      fixtureFailure('fixture.manifest.path_escape', `$.fixtures[${index}]`, 'escape');
    const metadata = lstatSync(absolute);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      fixtureFailure(
        'fixture.manifest.file_type',
        `$.fixtures[${index}]`,
        'case must be a regular file',
      );
    }
    const { bytes, value } = readStrict(absolute);
    if (bytes.length !== entry.bytes || sha256Hex(bytes) !== entry.source_sha256) {
      fixtureFailure(
        'fixture.manifest.source_hash',
        `$.fixtures[${index}]`,
        'source hash/size mismatch',
      );
    }
    if (sha256Hex(canonicalize(value)) !== entry.canonical_sha256) {
      fixtureFailure(
        'fixture.manifest.canonical_hash',
        `$.fixtures[${index}]`,
        'canonical hash mismatch',
      );
    }
    validateFixture(value, `$[${index}]`);
    if (value.id !== entry.id)
      fixtureFailure('fixture.manifest.root_id', `$.fixtures[${index}]`, 'ID mismatch');
    same(
      value.requirements,
      entry.requirements,
      'fixture.manifest.requirements',
      `$.fixtures[${index}]`,
    );
    same(value.tags, entry.tags, 'fixture.manifest.tags', `$.fixtures[${index}]`);
    if (value.steps.length !== entry.steps)
      fixtureFailure('fixture.manifest.steps', `$.fixtures[${index}]`, 'count');
    for (const requirement of value.requirements) {
      if (!coverage.has(requirement)) coverage.set(requirement, []);
      coverage.get(requirement).push(value.id);
    }
    steps += value.steps.length;
    successes += value.steps.filter((step) => step.expect.kind === 'success').length;
    errors += value.steps.filter((step) => step.expect.kind === 'error').length;
    fixtures.push(value);
  }
  const counts = { fixtures: fixtures.length, steps, successes, errors };
  same(manifest.counts, counts, 'fixture.manifest.counts', '$.counts');
  same(coverageContract.expected_counts, counts, 'fixture.coverage.counts', '$.expected_counts');
  const actualCoverage = Object.fromEntries(
    [...coverage.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
  same(manifest.coverage, actualCoverage, 'fixture.manifest.coverage', '$.coverage');
  return { manifest, manifestBytes, fixtures, counts, draftOutput };
};

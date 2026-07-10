#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const examples = path.join(here, 'examples');
const expectedSemanticFailures = new Map([
  ['duplicate-logical-object-field.json', 'fixture.object.duplicate_field'],
  ['initial-documents-out-of-order.json', 'fixture.state.document_order'],
  ['vector-dimension-mismatch.json', 'fixture.vector.dimension_mismatch'],
]);

const fail = (code, at, message) => {
  const error = new Error(`${code} at ${at}: ${message}`);
  error.code = code;
  throw error;
};

const assertCanonicalList = (values, at) => {
  if (new Set(values).size !== values.length) {
    fail('fixture.meta.duplicate', at, 'entries must be unique');
  }
  const sorted = [...values].sort();
  if (values.some((value, index) => value !== sorted[index])) {
    fail('fixture.meta.order', at, 'entries must use canonical lexical order');
  }
};

const int32Min = -(2n ** 31n);
const int32Max = 2n ** 31n - 1n;
const int64Min = -(2n ** 63n);
const int64Max = 2n ** 63n - 1n;

const validateInteger = (value, min, max, at) => {
  const integer = BigInt(value);
  if (integer < min || integer > max) {
    fail('fixture.value.integer_range', at, `${value} is outside its logical domain`);
  }
};

const validateVectorBits = (value, at) => {
  if (value.dimension !== value.bits.length) {
    fail(
      'fixture.vector.dimension_mismatch',
      at,
      `dimension ${value.dimension} differs from ${value.bits.length} components`,
    );
  }

  for (const [index, text] of value.bits.entries()) {
    const bits = Number.parseInt(text, 16);
    const nonfinite =
      value.element === 'f16'
        ? (bits & 0x7c00) === 0x7c00
        : (bits & 0x7f800000) === 0x7f800000;
    if (nonfinite) {
      fail('fixture.vector.nonfinite', `${at}.bits[${index}]`, 'vector bits encode NaN/infinity');
    }
  }
};

const validateValue = (value, at, allowMissing = true) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('fixture.value.shape', at, 'typed value must be an object');
  }

  switch (value.t) {
    case 'missing':
      if (!allowMissing) fail('fixture.value.missing_stored', at, 'Missing is not storable');
      return;
    case 'null':
    case 'bool':
    case 'float64':
    case 'binary':
    case 'uuid':
    case 'objectId':
      return;
    case 'int32':
      validateInteger(value.value, int32Min, int32Max, at);
      return;
    case 'int64':
      validateInteger(value.value, int64Min, int64Max, at);
      return;
    case 'decimal128':
      if (
        value.class === 'finite' &&
        value.coefficient !== '0' &&
        value.coefficient.endsWith('0')
      ) {
        fail('fixture.value.decimal_cohort', at, 'finite decimal coefficient is not canonical');
      }
      return;
    case 'string':
      if (!value.value.isWellFormed()) {
        fail('fixture.value.unicode', at, 'string contains an unpaired surrogate');
      }
      return;
    case 'timestamp':
      validateInteger(
        value.microseconds,
        -62135596800000000n,
        253402300799999999n,
        at,
      );
      return;
    case 'date': {
      const days = BigInt(value.days);
      if (days < -719162n || days > 2932896n) {
        fail('fixture.value.date_range', at, 'date is outside years 0001 through 9999');
      }
      return;
    }
    case 'vector':
      validateVectorBits(value, at);
      return;
    case 'array':
      for (const [index, child] of value.values.entries()) {
        validateValue(child, `${at}.values[${index}]`, false);
      }
      return;
    case 'object': {
      const names = new Set();
      for (const [index, field] of value.fields.entries()) {
        if (names.has(field.name)) {
          fail(
            'fixture.object.duplicate_field',
            `${at}.fields[${index}]`,
            `duplicate field ${JSON.stringify(field.name)}`,
          );
        }
        names.add(field.name);
        if (!field.name.isWellFormed()) {
          fail('fixture.value.unicode', `${at}.fields[${index}].name`, 'invalid Unicode field name');
        }
        validateValue(field.value, `${at}.fields[${index}].value`, false);
      }
      return;
    }
    default:
      fail('fixture.value.unknown_type', at, `unknown typed value ${JSON.stringify(value.t)}`);
  }
};

const walkTypedValues = (node, at = '$') => {
  if (Array.isArray(node)) {
    node.forEach((value, index) => walkTypedValues(value, `${at}[${index}]`));
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (typeof node.t === 'string') {
    validateValue(node, at, true);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    walkTypedValues(value, `${at}.${key}`);
  }
};

const idFromDocument = (document, at) => {
  const field = document.fields.find((candidate) => candidate.name === '_id');
  if (!field) fail('fixture.state.missing_id', at, 'initial document has no root _id');
  if (!['int32', 'int64', 'string', 'binary', 'uuid', 'objectId'].includes(field.value.t)) {
    fail('fixture.state.invalid_id', at, `unsupported ID type ${field.value.t}`);
  }
  return field.value;
};

const idRank = { int32: 0, int64: 0, string: 1, binary: 2, uuid: 3, objectId: 4 };
const idBytes = (value) => {
  switch (value.t) {
    case 'string':
      return Buffer.from(value.value, 'utf8');
    case 'binary':
      return Buffer.from(value.hex, 'hex');
    case 'uuid':
      return Buffer.from(value.value.replaceAll('-', ''), 'hex');
    case 'objectId':
      return Buffer.from(value.value, 'hex');
    default:
      return undefined;
  }
};
const compareIds = (left, right) => {
  const rank = idRank[left.t] - idRank[right.t];
  if (rank !== 0) return rank;
  if (idRank[left.t] === 0) {
    const a = BigInt(left.value);
    const b = BigInt(right.value);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return Buffer.compare(idBytes(left), idBytes(right));
};

const validateCollections = (collections, at) => {
  const names = new Set();
  for (const [collectionIndex, collection] of collections.entries()) {
    const collectionAt = `${at}[${collectionIndex}]`;
    if (names.has(collection.name)) {
      fail('fixture.state.duplicate_collection', collectionAt, `duplicate ${collection.name}`);
    }
    names.add(collection.name);

    const ids = collection.documents.map((document, documentIndex) => {
      validateValue(document, `${collectionAt}.documents[${documentIndex}]`, false);
      return idFromDocument(document, `${collectionAt}.documents[${documentIndex}]`);
    });
    for (let index = 1; index < ids.length; index += 1) {
      if (compareIds(ids[index - 1], ids[index]) >= 0) {
        fail(
          'fixture.state.document_order',
          `${collectionAt}.documents[${index}]`,
          'initial documents are duplicate or not strictly default-ordered',
        );
      }
    }
  }
};

const validateFixture = (fixture) => {
  assertCanonicalList(fixture.requirements, '$.requirements');
  assertCanonicalList(fixture.plan_items, '$.plan_items');
  assertCanonicalList(fixture.tags, '$.tags');
  validateCollections(fixture.initial_state.collections, '$.initial_state.collections');

  const stepIds = new Set();
  for (const [index, step] of fixture.steps.entries()) {
    if (stepIds.has(step.id)) {
      fail('fixture.step.duplicate_id', `$.steps[${index}].id`, `duplicate ${step.id}`);
    }
    stepIds.add(step.id);

    if (step.expect.state.mode === 'exact') {
      validateCollections(step.expect.state.collections, `$.steps[${index}].expect.state.collections`);
    }
    if (
      step.expect.order.mode === 'exact' &&
      step.expect.order.row_count !== step.expect.order.keys.length
    ) {
      fail(
        'fixture.order.cardinality',
        `$.steps[${index}].expect.order`,
        'exact order row_count must equal key count',
      );
    }
    if (
      step.expect.order.mode === 'not_applicable' &&
      step.expect.order.row_count !== 0
    ) {
      fail(
        'fixture.order.cardinality',
        `$.steps[${index}].expect.order`,
        'not-applicable order must have zero row count',
      );
    }
    if (
      step.expect.kind === 'error' &&
      step.expect.outcome === 'not_committed' &&
      step.expect.state.mode !== 'unchanged'
    ) {
      fail(
        'fixture.error.state_outcome',
        `$.steps[${index}].expect.state`,
        'not_committed error must assert unchanged state',
      );
    }
    if (
      step.expect.kind === 'error' &&
      step.expect.outcome === 'unknown' &&
      step.expect.state.mode !== 'unknown'
    ) {
      fail(
        'fixture.error.state_outcome',
        `$.steps[${index}].expect.state`,
        'unknown error must assert unknown state',
      );
    }
    if (step.expect.kind === 'error') {
      const prefixes = {
        parse: 'PAR_',
        validation: 'VAL_',
        type: 'TYPE_',
        conflict: 'CON_',
        uniqueness: 'UNQ_',
        authorization: 'AUTH_',
        capability: 'CAP_',
        quota: 'QUOTA_',
        deadline: 'DEADLINE_',
        durability: 'DUR_',
        internal: 'INT_',
      };
      if (!step.expect.code.startsWith(prefixes[step.expect.category])) {
        fail(
          'fixture.error.category_code',
          `$.steps[${index}].expect.code`,
          'error category and code prefix disagree',
        );
      }
      if (!step.expect.retry.retryable && step.expect.retry.scope !== 'never') {
        fail(
          'fixture.error.retry_scope',
          `$.steps[${index}].expect.retry`,
          'nonretryable expectation must use never scope',
        );
      }
      if (
        step.expect.outcome === 'committed' &&
        step.expect.state.mode !== 'exact'
      ) {
        fail(
          'fixture.error.state_outcome',
          `$.steps[${index}].expect.state`,
          'committed error must assert exact resulting state',
        );
      }
    }
  }
  walkTypedValues(fixture);
};

const validFiles = readdirSync(path.join(examples, 'valid'))
  .filter((name) => name.endsWith('.json'))
  .sort();
const invalidFiles = readdirSync(path.join(examples, 'invalid-semantic'))
  .filter((name) => name.endsWith('.json'))
  .sort();

for (const name of validFiles) {
  const fixture = JSON.parse(readFileSync(path.join(examples, 'valid', name), 'utf8'));
  validateFixture(fixture);
  console.log(`PASS semantic accept ${name}`);
}

for (const name of invalidFiles) {
  const fixture = JSON.parse(
    readFileSync(path.join(examples, 'invalid-semantic', name), 'utf8'),
  );
  const expected = expectedSemanticFailures.get(name);
  if (!expected) throw new Error(`no expected semantic failure registered for ${name}`);

  let actual;
  try {
    validateFixture(fixture);
  } catch (error) {
    actual = error.code;
  }
  if (actual !== expected) {
    throw new Error(`${name}: expected ${expected}, received ${actual ?? 'success'}`);
  }
  console.log(`PASS semantic reject ${name} ${actual}`);
}

if (invalidFiles.length !== expectedSemanticFailures.size) {
  throw new Error('semantic-negative registry/file count mismatch');
}

console.log(
  `PASS semantic examples: ${validFiles.length} accepted; ${invalidFiles.length} rejected with exact rules`,
);

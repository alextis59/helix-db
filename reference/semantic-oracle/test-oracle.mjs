#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize, sha256Hex } from './canonical.mjs';
import { decodeRawInput, parseStrictJson } from './raw-json.mjs';
import {
  ERROR_CODES,
  LIMITS,
  FixtureDiagnostic,
  OracleExecutionError,
} from './registry.mjs';
import { runCorpus, runFixture } from './oracle.mjs';
import { validateFixture } from './validate.mjs';
import {
  V,
  addNumeric,
  compareValues,
  equalValues,
  identicalValues,
  parseTimestamp,
  resolvePath,
  validateValue,
  vectorDistance,
} from './value.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '..', '..');
const readJson = (relative) => JSON.parse(readFileSync(path.join(repository, relative), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
let assertions = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};
const equal = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  assertions += 1;
};
const throwsCode = (callback, type, code) => {
  assert.throws(callback, (error) => error instanceof type && error.code === code);
  assertions += 1;
};

const rfcVector = {
  '\u20ac': 'Euro Sign',
  '\r': 'Carriage Return',
  '\ufb33': 'Hebrew Letter Dalet With Dagesh',
  1: 'One',
  '\ud83d\ude00': 'Emoji: Grinning Face',
  '\u0080': 'Control',
  '\u00f6': 'Latin Small Letter O With Diaeresis',
};
equal(
  canonicalize(rfcVector).toString('utf8'),
  '{"\\r":"Carriage Return","1":"One","":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}',
  'RFC 8785 property order',
);
equal(sha256Hex(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'SHA-256');

validateValue({ t: 'decimal128', class: 'finite', sign: 'positive', coefficient: '1', exponent: '-6176' });
assertions += 1;
throwsCode(
  () => validateValue({ t: 'decimal128', class: 'finite', sign: 'positive', coefficient: '1', exponent: '-6177' }),
  FixtureDiagnostic,
  'fixture.value.decimal_range',
);
throwsCode(
  () => validateValue({ t: 'vector', element: 'f32', dimension: 1, bits: ['7f800000'] }),
  FixtureDiagnostic,
  'fixture.vector.nonfinite',
);

const nanA = V.f64('7ff0000000000001');
const nanB = V.f64('fff8000000000001');
check(equalValues(nanA, nanB), 'all numeric NaNs compare equal');
check(!identicalValues(nanA, nanB), 'NaN payload identity is exact');
check(equalValues(V.f64('8000000000000000'), V.i32(0)), 'signed float zero equals integer zero');
check(
  compareValues(V.i64('9007199254740993'), V.f64('4340000000000000')) > 0,
  'mixed numeric comparison is exact above 2^53',
);
check(
  !equalValues(
    { t: 'decimal128', class: 'finite', sign: 'positive', coefficient: '1', exponent: '-1' },
    V.f64('3fb999999999999a'),
  ),
  'decimal tenth differs from binary64 tenth',
);
const objectAB = V.object([['a', V.i32(1)], ['b', V.i32(2)]]);
const objectBA = V.object([['b', V.i32(2)], ['a', V.i32(1)]]);
check(equalValues(objectAB, objectBA), 'object equality ignores presentation order');
check(!identicalValues(objectAB, objectBA), 'object identity retains presentation order');

equal(addNumeric(V.i32('2147483647'), V.i32(1)), V.i64('2147483648'), 'int32 widening');
throwsCode(
  () => addNumeric(V.i64('9223372036854775807'), V.i32(1)),
  OracleExecutionError,
  'TYPE_NUMERIC_OVERFLOW',
);
throwsCode(
  () => addNumeric(V.i64('9007199254740993'), V.f64('3ff0000000000000')),
  OracleExecutionError,
  'TYPE_COERCION_LOSS',
);
const decimalEven = { t: 'decimal128', class: 'finite', sign: 'positive', coefficient: '1234567890123456789012345678901234', exponent: '0' };
const decimalHalf = { t: 'decimal128', class: 'finite', sign: 'positive', coefficient: '5', exponent: '-1' };
equal(addNumeric(decimalEven, decimalHalf), decimalEven, 'decimal ties-to-even retains even coefficient');
equal(
  addNumeric(decimalEven, { ...decimalHalf, coefficient: '6' }),
  { ...decimalEven, coefficient: '1234567890123456789012345678901235' },
  'decimal rounds above half',
);
const decimalNegativeZero = {
  t: 'decimal128',
  class: 'finite',
  sign: 'negative',
  coefficient: '0',
  exponent: '0',
};
equal(addNumeric(decimalNegativeZero, decimalNegativeZero), decimalNegativeZero, 'decimal negative-zero addition');

equal(parseTimestamp(V.string('1970-01-01T01:00:00+01:00')), { t: 'timestamp', microseconds: '0' }, 'offset');
equal(parseTimestamp(V.string('1970-01-01T00:00:00.000001Z')), { t: 'timestamp', microseconds: '1' }, 'microsecond');
throwsCode(() => parseTimestamp(V.string('2016-12-31T23:59:60Z')), OracleExecutionError, 'TYPE_TEMPORAL_RANGE');
throwsCode(() => parseTimestamp(V.string('1970-01-01T00:00:00-00:00')), OracleExecutionError, 'TYPE_TEMPORAL_RANGE');
throwsCode(() => parseTimestamp(V.string('1970-01-01T00:00:00+14:01')), OracleExecutionError, 'TYPE_TEMPORAL_RANGE');

const nested = V.object([
  ['items', V.array([V.object([['x', V.i32(1)]]), V.object([['x', V.i32(2)]]), V.object([['y', V.i32(3)]])])],
]);
equal(resolvePath(nested, V.string('items.x'), 'fanout'), V.array([V.i32(1), V.i32(2)]), 'array fan-out');
equal(resolvePath(nested, V.string('absent'), 'single'), V.missing(), 'Missing path');

equal(parseStrictJson('{"a":[true,null,-1]}'), { a: [true, null, -1] }, 'strict parser');
const prototypeKey = parseStrictJson('{"__proto__":{"polluted":true}}');
check(Object.hasOwn(prototypeKey, '__proto__'), 'strict parser preserves __proto__ as data');
check(Object.getPrototypeOf(prototypeKey) === Object.prototype, 'strict parser does not replace prototype');
check({}.polluted === undefined, 'strict parser does not pollute global object prototype');
throwsCode(
  () => decodeRawInput({ target: 'command', encoding: 'json', compression: 'identity', bytes_hex: Buffer.from('{"x":1,"x":2}').toString('hex') }),
  OracleExecutionError,
  'VAL_DUPLICATE_FIELD',
);
throwsCode(
  () => decodeRawInput({ target: 'command', encoding: 'json', compression: 'identity', bytes_hex: '7b' }),
  OracleExecutionError,
  'PAR_TRUNCATED_INPUT',
);
throwsCode(
  () => decodeRawInput({ target: 'command', encoding: 'json', compression: 'identity', bytes_hex: 'ff' }),
  OracleExecutionError,
  'PAR_INVALID_UTF8',
);
throwsCode(
  () => decodeRawInput({
    target: 'command',
    encoding: 'json',
    compression: 'identity',
    bytes_hex: Buffer.from('{"\\ud800":1}').toString('hex'),
  }),
  OracleExecutionError,
  'PAR_INVALID_UTF8',
);
throwsCode(
  () => decodeRawInput({
    target: 'command',
    encoding: 'json',
    compression: 'identity',
    bytes_hex: Buffer.from('{"find":"docs","filter":{"x":{"$eq":{"$value":{"t":"null","extra":true}}}}}').toString('hex'),
  }),
  OracleExecutionError,
  'PAR_INVALID_TYPED_VALUE',
);
const tooDeepJson = `${'['.repeat(64)}0${']'.repeat(64)}`;
throwsCode(
  () => decodeRawInput({
    target: 'command',
    encoding: 'json',
    compression: 'identity',
    bytes_hex: Buffer.from(tooDeepJson).toString('hex'),
  }),
  OracleExecutionError,
  'QUOTA_LIMIT_EXCEEDED',
);

equal(
  vectorDistance(
    { t: 'vector', element: 'f32', dimension: 2, bits: ['3f800000', '00000000'] },
    { t: 'vector', element: 'f32', dimension: 2, bits: ['00000000', '00000000'] },
    'l2',
  ),
  V.f64('3ff0000000000000'),
  'vector L2',
);
throwsCode(
  () => vectorDistance(
    { t: 'vector', element: 'f32', dimension: 1, bits: ['00000000'] },
    { t: 'vector', element: 'f32', dimension: 1, bits: ['00000000'] },
    'cosine',
  ),
  OracleExecutionError,
  'TYPE_VECTOR_ZERO_NORM',
);

const comparisonSamples = [
  V.missing(), V.null(), V.bool(false), V.bool(true), V.i32(-1),
  { t: 'decimal128', class: 'finite', sign: 'positive', coefficient: '1', exponent: '-1' },
  V.i64(1), V.string('a'), { t: 'binary', subtype: 0, hex: '00' },
];
for (const left of comparisonSamples) {
  for (const right of comparisonSamples) {
    equal(compareValues(left, right), -compareValues(right, left) || 0, 'comparison antisymmetry');
    equal(equalValues(left, right), equalValues(right, left), 'equality symmetry');
  }
}
for (let first = 0; first < comparisonSamples.length; first += 1) {
  for (let second = first; second < comparisonSamples.length; second += 1) {
    for (let third = second; third < comparisonSamples.length; third += 1) {
      check(
        compareValues(comparisonSamples[first], comparisonSamples[second]) <= 0 &&
          compareValues(comparisonSamples[second], comparisonSamples[third]) <= 0 &&
          compareValues(comparisonSamples[first], comparisonSamples[third]) <= 0,
        'comparison transitivity',
      );
    }
  }
}

const semanticNegatives = new Map([
  ['duplicate-logical-object-field.json', 'fixture.object.duplicate_field'],
  ['initial-documents-out-of-order.json', 'fixture.state.document_order'],
  ['vector-dimension-mismatch.json', 'fixture.vector.dimension_mismatch'],
]);
for (const [name, code] of semanticNegatives) {
  const fixture = readJson(`fixtures/semantic/schema/examples/invalid-semantic/${name}`);
  throwsCode(() => validateFixture(fixture), FixtureDiagnostic, code);
}

const nullBool = readJson('fixtures/semantic/cases/scalar/null-bool.json');
const changedValue = clone(nullBool);
changedValue.steps[0].expect.value = V.bool(false);
let mutation = runFixture(changedValue);
equal(mutation.failed, 1, 'mutated value must fail');
equal(mutation.results[0].diagnostic.code, 'oracle.expectation.value', 'value diagnostic');

const errors = readJson('fixtures/semantic/cases/errors/registry.json');
const changedError = clone(errors);
changedError.steps[0].expect.code = 'PAR_TRUNCATED_INPUT';
mutation = runFixture(changedError);
equal(mutation.failed, 1, 'mutated error must fail');
equal(mutation.results[0].diagnostic.code, 'oracle.expectation.error_code', 'error diagnostic');

const ordering = readJson('fixtures/semantic/cases/ordering/profiles.json');
const changedOrder = clone(ordering);
changedOrder.steps[0].expect.order.keys[0].components[1].value.value = '99';
mutation = runFixture(changedOrder);
equal(mutation.failed, 1, 'mutated order must fail');
equal(mutation.results[0].diagnostic.code, 'oracle.expectation.order', 'order diagnostic');

const changedState = clone(nullBool);
changedState.steps[0].expect.state = { mode: 'unknown' };
mutation = runFixture(changedState);
equal(mutation.failed, 1, 'mutated state must fail');
equal(mutation.results[0].diagnostic.code, 'oracle.expectation.state_mode', 'state diagnostic');

const changedProfile = clone(nullBool);
changedProfile.profiles.semantics = 'latest';
throwsCode(() => validateFixture(changedProfile), FixtureDiagnostic, 'fixture.meta.profiles');
const changedOperation = clone(nullBool);
changedOperation.steps[0].action.operation = 'value.unknown';
throwsCode(() => validateFixture(changedOperation), FixtureDiagnostic, 'fixture.action.unknown_operation');
const unusedCapability = clone(nullBool);
unusedCapability.initial_state.capabilities = { wall_time_reads: [{ t: 'timestamp', microseconds: '0' }] };
throwsCode(() => runFixture(unusedCapability), FixtureDiagnostic, 'oracle.capability.unused');

equal(ERROR_CODES.length, 74, 'independent error registry size');
equal(Object.keys(LIMITS).length, 23, 'independent limit registry size');
const corpus = runCorpus(repository, { draft: false });
equal(corpus.report.counts, { fixtures: 17, steps: 313, passed: 313, failed: 0, skipped: 0 }, 'full corpus');
equal(corpus.report.verdict, 'pass', 'corpus verdict');

console.log(`PASS oracle unit/property/negative tests: ${assertions} assertions`);
console.log('PASS expectation mutation canaries: value, error, order, state');
console.log('PASS semantic oracle corpus: 17 fixtures, 313 passed, 0 failed, 0 skipped');

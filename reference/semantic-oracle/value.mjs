import { OracleExecutionError, fixtureFailure } from './registry.mjs';

const INT32_MIN = -(2n ** 31n);
const INT32_MAX = 2n ** 31n - 1n;
const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;
const TIMESTAMP_MIN = -62_135_596_800_000_000n;
const TIMESTAMP_MAX = 253_402_300_799_999_999n;
const DATE_MIN = -719_162n;
const DATE_MAX = 2_932_896n;
const INTEGER_PATTERN = /^-?(?:0|[1-9][0-9]*)$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/;
const HEX_PATTERN = /^(?:[0-9a-f]{2})*$/;

const compareScalar = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const compareBytes = (left, right) => Buffer.compare(left, right);
const clone = (value) => {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
  }
  return value;
};

export const cloneValue = clone;
export const V = Object.freeze({
  missing: () => ({ t: 'missing' }),
  null: () => ({ t: 'null' }),
  bool: (value) => ({ t: 'bool', value }),
  i32: (value) => ({ t: 'int32', value: String(value) }),
  i64: (value) => ({ t: 'int64', value: String(value) }),
  f64: (bits) => ({ t: 'float64', bits }),
  string: (value) => ({ t: 'string', value }),
  array: (values) => ({ t: 'array', values }),
  object: (fields) => ({
    t: 'object',
    fields: fields.map(([name, value]) => ({ name, value })),
  }),
});

const requireObject = (value, at) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fixtureFailure('fixture.value.shape', at, 'typed value must be an object');
  }
};

const requireKeys = (value, keys, at) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fixtureFailure('fixture.value.properties', at, `expected properties ${expected.join(',')}`);
  }
};

const requireCanonicalInteger = (text, min, max, at, code = 'fixture.value.integer_range') => {
  if (typeof text !== 'string' || !INTEGER_PATTERN.test(text) || text === '-0') {
    fixtureFailure('fixture.value.integer_text', at, 'integer text is not canonical');
  }
  const parsed = BigInt(text);
  if (parsed < min || parsed > max) {
    fixtureFailure(code, at, `${text} is outside its logical domain`);
  }
  return parsed;
};

const scalarCount = (text) => [...text].length;
const validateString = (text, at) => {
  if (typeof text !== 'string' || !text.isWellFormed()) {
    fixtureFailure('fixture.value.unicode', at, 'string is not a Unicode scalar sequence');
  }
};

export const float64Parts = (bitsText) => {
  if (typeof bitsText !== 'string' || !/^[0-9a-f]{16}$/.test(bitsText)) {
    fixtureFailure('fixture.value.float_bits', '$', 'float64 bits must be 16 lowercase hex digits');
  }
  const bits = BigInt(`0x${bitsText}`);
  const sign = (bits >> 63n) === 0n ? 1n : -1n;
  const exponentBits = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  if (exponentBits === 0x7ff) {
    return { bits, sign, kind: fraction === 0n ? 'infinity' : 'nan', fraction };
  }
  if (exponentBits === 0) {
    return {
      bits,
      sign,
      kind: 'finite',
      significand: fraction,
      exponent: -1074,
      zero: fraction === 0n,
    };
  }
  return {
    bits,
    sign,
    kind: 'finite',
    significand: (1n << 52n) | fraction,
    exponent: exponentBits - 1023 - 52,
    zero: false,
  };
};

export const float64FromBits = (bitsText) => {
  const bytes = Buffer.from(bitsText, 'hex');
  return bytes.readDoubleBE(0);
};

export const float64ToBits = (number) => {
  const bytes = Buffer.allocUnsafe(8);
  bytes.writeDoubleBE(number, 0);
  return bytes.toString('hex');
};

export const f16FromBits = (bitsText) => {
  const bits = Number.parseInt(bitsText, 16);
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x3ff;
  if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : NaN;
  if (exponent === 0) return sign * fraction * 2 ** -24;
  return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
};

export const f32FromBits = (bitsText) => {
  const bytes = Buffer.from(bitsText, 'hex');
  return bytes.readFloatBE(0);
};

const validateDecimal = (value, at) => {
  if (!['finite', 'infinity', 'nan'].includes(value.class)) {
    fixtureFailure('fixture.value.decimal_class', at, 'unknown decimal128 class');
  }
  if (value.class === 'nan') return;
  if (!['negative', 'positive'].includes(value.sign)) {
    fixtureFailure('fixture.value.decimal_sign', at, 'invalid decimal sign');
  }
  if (value.class === 'infinity') return;
  if (typeof value.coefficient !== 'string' || !/^(?:0|[1-9][0-9]{0,33})$/.test(value.coefficient)) {
    fixtureFailure('fixture.value.decimal_coefficient', at, 'invalid decimal coefficient');
  }
  requireCanonicalInteger(value.exponent, -100_000n, 100_000n, `${at}.exponent`);
  if (value.coefficient === '0') {
    if (value.exponent !== '0') {
      fixtureFailure('fixture.value.decimal_cohort', at, 'decimal zero exponent must be zero');
    }
    return;
  }
  if (value.coefficient.endsWith('0')) {
    fixtureFailure('fixture.value.decimal_cohort', at, 'decimal coefficient has trailing zero');
  }
  const exponent = BigInt(value.exponent);
  const adjusted = exponent + BigInt(value.coefficient.length - 1);
  if (exponent < -6176n || adjusted > 6144n) {
    fixtureFailure('fixture.value.decimal_range', at, 'decimal tuple is outside decimal128');
  }
};

const validateVector = (value, at) => {
  if (!['f16', 'f32'].includes(value.element)) {
    fixtureFailure('fixture.vector.element', at, 'vector family must be f16 or f32');
  }
  if (!Number.isSafeInteger(value.dimension) || value.dimension < 1 || value.dimension > 4096) {
    fixtureFailure('fixture.vector.dimension', at, 'vector dimension is outside limits-v1');
  }
  if (!Array.isArray(value.bits) || value.dimension !== value.bits.length) {
    fixtureFailure('fixture.vector.dimension_mismatch', at, 'dimension differs from component count');
  }
  const pattern = value.element === 'f16' ? /^[0-9a-f]{4}$/ : /^[0-9a-f]{8}$/;
  for (const [index, text] of value.bits.entries()) {
    if (typeof text !== 'string' || !pattern.test(text)) {
      fixtureFailure('fixture.vector.bits', `${at}.bits[${index}]`, 'invalid component bits');
    }
    const bits = Number.parseInt(text, 16);
    const nonfinite =
      value.element === 'f16'
        ? (bits & 0x7c00) === 0x7c00
        : (bits & 0x7f800000) === 0x7f800000;
    if (nonfinite) {
      fixtureFailure('fixture.vector.nonfinite', `${at}.bits[${index}]`, 'non-finite vector component');
    }
  }
};

export const validateValue = (
  value,
  at = '$',
  { allowMissing = true, depth = 1, counters = { fields: 0 }, rootDocument = false } = {},
) => {
  requireObject(value, at);
  if (['object', 'array'].includes(value.t) && depth > 100) {
    fixtureFailure('fixture.value.depth', at, 'container depth exceeds limits-v1');
  }
  switch (value.t) {
    case 'missing':
      requireKeys(value, ['t'], at);
      if (!allowMissing) fixtureFailure('fixture.value.missing_stored', at, 'Missing is not storable');
      break;
    case 'null':
      requireKeys(value, ['t'], at);
      break;
    case 'bool':
      requireKeys(value, ['t', 'value'], at);
      if (typeof value.value !== 'boolean') fixtureFailure('fixture.value.bool', at, 'invalid bool');
      break;
    case 'int32':
      requireKeys(value, ['t', 'value'], at);
      requireCanonicalInteger(value.value, INT32_MIN, INT32_MAX, `${at}.value`);
      break;
    case 'int64':
      requireKeys(value, ['t', 'value'], at);
      requireCanonicalInteger(value.value, INT64_MIN, INT64_MAX, `${at}.value`);
      break;
    case 'float64':
      requireKeys(value, ['t', 'bits'], at);
      float64Parts(value.bits);
      break;
    case 'decimal128':
      requireKeys(
        value,
        value.class === 'nan'
          ? ['t', 'class']
          : value.class === 'infinity'
            ? ['t', 'class', 'sign']
            : ['t', 'class', 'sign', 'coefficient', 'exponent'],
        at,
      );
      validateDecimal(value, at);
      break;
    case 'string':
      requireKeys(value, ['t', 'value'], at);
      validateString(value.value, `${at}.value`);
      break;
    case 'binary':
      requireKeys(value, ['t', 'subtype', 'hex'], at);
      if (!Number.isSafeInteger(value.subtype) || value.subtype < 0 || value.subtype > 255) {
        fixtureFailure('fixture.value.binary_subtype', at, 'invalid binary subtype');
      }
      if (typeof value.hex !== 'string' || !HEX_PATTERN.test(value.hex)) {
        fixtureFailure('fixture.value.binary_hex', at, 'binary hex must be lowercase whole bytes');
      }
      break;
    case 'object': {
      requireKeys(value, ['t', 'fields'], at);
      if (!Array.isArray(value.fields) || value.fields.length > 10_000) {
        fixtureFailure('fixture.object.fields', at, 'invalid object fields');
      }
      counters.fields += value.fields.length;
      if (counters.fields > 100_000) {
        fixtureFailure('fixture.value.total_fields', at, 'document field count exceeds limits-v1');
      }
      const names = new Set();
      for (const [index, field] of value.fields.entries()) {
        const fieldAt = `${at}.fields[${index}]`;
        requireObject(field, fieldAt);
        requireKeys(field, ['name', 'value'], fieldAt);
        validateString(field.name, `${fieldAt}.name`);
        const fieldBytes = Buffer.byteLength(field.name, 'utf8');
        if (fieldBytes < 1 || fieldBytes > 1024 || scalarCount(field.name) > 256) {
          fixtureFailure('fixture.object.field_name_limit', `${fieldAt}.name`, 'field name exceeds limits-v1');
        }
        if (/[\u0000-\u001f\u007f]/u.test(field.name) || field.name.includes('.') || field.name.startsWith('$')) {
          fixtureFailure('fixture.object.field_name_grammar', `${fieldAt}.name`, 'field name violates limits-v1');
        }
        if (rootDocument && ['_v', '_ts'].includes(field.name)) {
          fixtureFailure('fixture.object.reserved_root_field', `${fieldAt}.name`, 'reserved root metadata name');
        }
        if (names.has(field.name)) {
          fixtureFailure('fixture.object.duplicate_field', fieldAt, `duplicate ${JSON.stringify(field.name)}`);
        }
        names.add(field.name);
        validateValue(field.value, `${fieldAt}.value`, {
          allowMissing: false,
          depth: depth + 1,
          counters,
          rootDocument: false,
        });
      }
      break;
    }
    case 'array':
      requireKeys(value, ['t', 'values'], at);
      if (!Array.isArray(value.values) || value.values.length > 1_000_000) {
        fixtureFailure('fixture.array.elements', at, 'invalid array values');
      }
      for (const [index, child] of value.values.entries()) {
        validateValue(child, `${at}.values[${index}]`, {
          allowMissing: false,
          depth: depth + 1,
          counters,
          rootDocument: false,
        });
      }
      break;
    case 'timestamp':
      requireKeys(value, ['t', 'microseconds'], at);
      requireCanonicalInteger(
        value.microseconds,
        TIMESTAMP_MIN,
        TIMESTAMP_MAX,
        `${at}.microseconds`,
        'fixture.value.timestamp_range',
      );
      break;
    case 'date':
      requireKeys(value, ['t', 'days'], at);
      requireCanonicalInteger(value.days, DATE_MIN, DATE_MAX, `${at}.days`, 'fixture.value.date_range');
      break;
    case 'uuid':
      requireKeys(value, ['t', 'value'], at);
      if (typeof value.value !== 'string' || !UUID_PATTERN.test(value.value)) {
        fixtureFailure('fixture.value.uuid', at, 'UUID is not canonical lowercase text');
      }
      break;
    case 'objectId':
      requireKeys(value, ['t', 'value'], at);
      if (typeof value.value !== 'string' || !OBJECT_ID_PATTERN.test(value.value)) {
        fixtureFailure('fixture.value.object_id', at, 'ObjectId is not 24 lowercase hex digits');
      }
      break;
    case 'vector':
      requireKeys(value, ['t', 'element', 'dimension', 'bits'], at);
      validateVector(value, at);
      break;
    default:
      fixtureFailure('fixture.value.unknown_type', at, `unknown typed value ${JSON.stringify(value.t)}`);
  }
  return value;
};

const numericType = (value) => ['int32', 'int64', 'float64', 'decimal128'].includes(value.t);

const finiteRational = (value) => {
  if (value.t === 'int32' || value.t === 'int64') return { n: BigInt(value.value), d: 1n };
  if (value.t === 'float64') {
    const parts = float64Parts(value.bits);
    if (parts.kind !== 'finite') return undefined;
    if (parts.significand === 0n) return { n: 0n, d: 1n };
    const signed = parts.sign * parts.significand;
    return parts.exponent >= 0
      ? { n: signed << BigInt(parts.exponent), d: 1n }
      : { n: signed, d: 1n << BigInt(-parts.exponent) };
  }
  if (value.class !== 'finite') return undefined;
  if (value.coefficient === '0') return { n: 0n, d: 1n };
  const sign = value.sign === 'negative' ? -1n : 1n;
  const coefficient = sign * BigInt(value.coefficient);
  const exponent = BigInt(value.exponent);
  return exponent >= 0n
    ? { n: coefficient * 10n ** exponent, d: 1n }
    : { n: coefficient, d: 10n ** -exponent };
};

const numericClass = (value) => {
  if (value.t === 'float64') {
    const parts = float64Parts(value.bits);
    if (parts.kind === 'nan') return 'nan';
    if (parts.kind === 'infinity') return parts.sign < 0n ? 'negative_infinity' : 'positive_infinity';
    return 'finite';
  }
  if (value.t === 'decimal128') {
    if (value.class === 'nan') return 'nan';
    if (value.class === 'infinity') {
      return value.sign === 'negative' ? 'negative_infinity' : 'positive_infinity';
    }
  }
  return 'finite';
};

export const compareNumeric = (left, right) => {
  if (!numericType(left) || !numericType(right)) {
    throw new OracleExecutionError('TYPE_MISMATCH');
  }
  const rank = { negative_infinity: 0, finite: 1, positive_infinity: 2, nan: 3 };
  const leftClass = numericClass(left);
  const rightClass = numericClass(right);
  if (leftClass !== rightClass) return compareScalar(rank[leftClass], rank[rightClass]);
  if (leftClass !== 'finite') return 0;
  const a = finiteRational(left);
  const b = finiteRational(right);
  return compareScalar(a.n * b.d, b.n * a.d);
};

const valueRank = (value) => {
  if (value.t === 'missing') return 0;
  if (value.t === 'null') return 1;
  if (value.t === 'bool') return 2;
  if (numericType(value)) return 3;
  return {
    string: 4,
    binary: 5,
    object: 6,
    array: 7,
    timestamp: 8,
    date: 9,
    uuid: 10,
    objectId: 11,
    vector: value.element === 'f16' ? 12 : 13,
  }[value.t];
};

const objectFieldsCanonical = (value) =>
  [...value.fields].sort((left, right) =>
    compareBytes(Buffer.from(left.name, 'utf8'), Buffer.from(right.name, 'utf8')),
  );

const compareSequences = (left, right, compare) => {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const order = compare(left[index], right[index]);
    if (order !== 0) return order;
  }
  return compareScalar(left.length, right.length);
};

const vectorComponent = (value, index) =>
  value.element === 'f16' ? f16FromBits(value.bits[index]) : f32FromBits(value.bits[index]);

export const compareValues = (left, right) => {
  const leftRank = valueRank(left);
  const rightRank = valueRank(right);
  if (leftRank !== rightRank) return compareScalar(leftRank, rightRank);
  if (numericType(left)) return compareNumeric(left, right);
  switch (left.t) {
    case 'missing':
    case 'null':
      return 0;
    case 'bool':
      return compareScalar(Number(left.value), Number(right.value));
    case 'string':
      return compareBytes(Buffer.from(left.value, 'utf8'), Buffer.from(right.value, 'utf8'));
    case 'binary': {
      const subtype = compareScalar(left.subtype, right.subtype);
      if (subtype !== 0) return subtype;
      const leftBytes = Buffer.from(left.hex, 'hex');
      const rightBytes = Buffer.from(right.hex, 'hex');
      const length = compareScalar(leftBytes.length, rightBytes.length);
      return length === 0 ? compareBytes(leftBytes, rightBytes) : length;
    }
    case 'object': {
      const a = objectFieldsCanonical(left);
      const b = objectFieldsCanonical(right);
      return compareSequences(a, b, (leftField, rightField) => {
        const name = compareBytes(
          Buffer.from(leftField.name, 'utf8'),
          Buffer.from(rightField.name, 'utf8'),
        );
        return name === 0 ? compareValues(leftField.value, rightField.value) : name;
      });
    }
    case 'array':
      return compareSequences(left.values, right.values, compareValues);
    case 'timestamp':
      return compareScalar(BigInt(left.microseconds), BigInt(right.microseconds));
    case 'date':
      return compareScalar(BigInt(left.days), BigInt(right.days));
    case 'uuid':
      return compareBytes(
        Buffer.from(left.value.replaceAll('-', ''), 'hex'),
        Buffer.from(right.value.replaceAll('-', ''), 'hex'),
      );
    case 'objectId':
      return compareBytes(Buffer.from(left.value, 'hex'), Buffer.from(right.value, 'hex'));
    case 'vector': {
      const dimension = compareScalar(left.dimension, right.dimension);
      if (dimension !== 0) return dimension;
      for (let index = 0; index < left.dimension; index += 1) {
        const component = compareScalar(vectorComponent(left, index), vectorComponent(right, index));
        if (component !== 0) return component;
      }
      return 0;
    }
    default:
      throw new Error(`unreachable value type ${left.t}`);
  }
};

export const equalValues = (left, right) => {
  if (numericType(left) && numericType(right)) return compareNumeric(left, right) === 0;
  if (left.t !== right.t) return false;
  switch (left.t) {
    case 'missing':
    case 'null':
      return true;
    case 'bool':
    case 'string':
      return left.value === right.value;
    case 'binary':
      return left.subtype === right.subtype && left.hex === right.hex;
    case 'object': {
      if (left.fields.length !== right.fields.length) return false;
      const rightByName = new Map(right.fields.map((field) => [field.name, field.value]));
      return left.fields.every(
        (field) => rightByName.has(field.name) && equalValues(field.value, rightByName.get(field.name)),
      );
    }
    case 'array':
      return (
        left.values.length === right.values.length &&
        left.values.every((value, index) => equalValues(value, right.values[index]))
      );
    case 'timestamp':
      return left.microseconds === right.microseconds;
    case 'date':
      return left.days === right.days;
    case 'uuid':
    case 'objectId':
      return left.value === right.value;
    case 'vector':
      return (
        left.element === right.element &&
        left.dimension === right.dimension &&
        left.bits.every((_, index) =>
          Object.is(vectorComponent(left, index), vectorComponent(right, index)) ||
          vectorComponent(left, index) === vectorComponent(right, index),
        )
      );
    default:
      return false;
  }
};

export const identicalValues = (left, right) => {
  if (left.t !== right.t) return false;
  switch (left.t) {
    case 'missing':
    case 'null':
      return true;
    case 'bool':
    case 'int32':
    case 'int64':
    case 'string':
    case 'uuid':
    case 'objectId':
      return left.value === right.value;
    case 'float64':
      return left.bits === right.bits;
    case 'decimal128':
      return (
        left.class === right.class &&
        left.sign === right.sign &&
        left.coefficient === right.coefficient &&
        left.exponent === right.exponent
      );
    case 'binary':
      return left.subtype === right.subtype && left.hex === right.hex;
    case 'object':
      return (
        left.fields.length === right.fields.length &&
        left.fields.every(
          (field, index) =>
            field.name === right.fields[index].name &&
            identicalValues(field.value, right.fields[index].value),
        )
      );
    case 'array':
      return (
        left.values.length === right.values.length &&
        left.values.every((value, index) => identicalValues(value, right.values[index]))
      );
    case 'timestamp':
      return left.microseconds === right.microseconds;
    case 'date':
      return left.days === right.days;
    case 'vector':
      return (
        left.element === right.element &&
        left.dimension === right.dimension &&
        left.bits.every((bits, index) => bits === right.bits[index])
      );
    default:
      return false;
  }
};

const decimalFromInteger = (value) => ({
  t: 'decimal128',
  class: 'finite',
  sign: BigInt(value.value) < 0n ? 'negative' : 'positive',
  coefficient: (BigInt(value.value) < 0n ? -BigInt(value.value) : BigInt(value.value)).toString(),
  exponent: '0',
});

const roundDecimal = (signedCoefficient, exponent) => {
  if (signedCoefficient === 0n) {
    return { t: 'decimal128', class: 'finite', sign: 'positive', coefficient: '0', exponent: '0' };
  }
  const negative = signedCoefficient < 0n;
  let coefficient = negative ? -signedCoefficient : signedCoefficient;
  let coefficientText = coefficient.toString();
  if (coefficientText.length > 34) {
    const discarded = coefficientText.length - 34;
    const divisor = 10n ** BigInt(discarded);
    let quotient = coefficient / divisor;
    const remainder = coefficient % divisor;
    const half = divisor / 2n;
    if (remainder > half || (remainder === half && quotient % 2n === 1n)) quotient += 1n;
    coefficient = quotient;
    exponent += BigInt(discarded);
    if (coefficient.toString().length > 34) {
      coefficient /= 10n;
      exponent += 1n;
    }
  }
  while (coefficient % 10n === 0n) {
    coefficient /= 10n;
    exponent += 1n;
  }
  if (exponent < -6176n) {
    const discarded = -6176n - exponent;
    const divisor = 10n ** discarded;
    let quotient = coefficient / divisor;
    const remainder = coefficient % divisor;
    const half = divisor / 2n;
    if (remainder > half || (remainder === half && quotient % 2n === 1n)) quotient += 1n;
    if (quotient === 0n) throw new OracleExecutionError('TYPE_NUMERIC_UNDERFLOW');
    coefficient = quotient;
    exponent = -6176n;
    while (coefficient % 10n === 0n) {
      coefficient /= 10n;
      exponent += 1n;
    }
  }
  const adjusted = exponent + BigInt(coefficient.toString().length - 1);
  if (adjusted > 6144n) throw new OracleExecutionError('TYPE_NUMERIC_OVERFLOW');
  return {
    t: 'decimal128',
    class: 'finite',
    sign: negative ? 'negative' : 'positive',
    coefficient: coefficient.toString(),
    exponent: exponent.toString(),
  };
};

const addDecimal = (left, right) => {
  if (left.class === 'nan' || right.class === 'nan') return { t: 'decimal128', class: 'nan' };
  if (left.class === 'infinity' || right.class === 'infinity') {
    if (left.class === 'infinity' && right.class === 'infinity' && left.sign !== right.sign) {
      return { t: 'decimal128', class: 'nan' };
    }
    return clone(left.class === 'infinity' ? left : right);
  }
  if (left.coefficient === '0' && right.coefficient === '0') {
    return {
      t: 'decimal128',
      class: 'finite',
      sign: left.sign === 'negative' && right.sign === 'negative' ? 'negative' : 'positive',
      coefficient: '0',
      exponent: '0',
    };
  }
  const leftExponent = BigInt(left.exponent);
  const rightExponent = BigInt(right.exponent);
  const exponent = leftExponent < rightExponent ? leftExponent : rightExponent;
  const signed = (value, valueExponent) => {
    const sign = value.sign === 'negative' ? -1n : 1n;
    return sign * BigInt(value.coefficient) * 10n ** (valueExponent - exponent);
  };
  return roundDecimal(signed(left, leftExponent) + signed(right, rightExponent), exponent);
};

const exactIntegerAsFloat = (value) => {
  const integer = BigInt(value.value);
  const number = Number(integer);
  if (!Number.isFinite(number) || BigInt(number) !== integer) {
    throw new OracleExecutionError('TYPE_COERCION_LOSS');
  }
  return number;
};

export const addNumeric = (left, right) => {
  if (!numericType(left) || !numericType(right)) throw new OracleExecutionError('TYPE_MISMATCH');
  if (left.t === 'decimal128' || right.t === 'decimal128') {
    if (left.t === 'float64' || right.t === 'float64') throw new OracleExecutionError('TYPE_MISMATCH');
    return addDecimal(
      left.t === 'decimal128' ? left : decimalFromInteger(left),
      right.t === 'decimal128' ? right : decimalFromInteger(right),
    );
  }
  if (left.t === 'float64' || right.t === 'float64') {
    const leftNumber = left.t === 'float64' ? float64FromBits(left.bits) : exactIntegerAsFloat(left);
    const rightNumber = right.t === 'float64' ? float64FromBits(right.bits) : exactIntegerAsFloat(right);
    const result = leftNumber + rightNumber;
    return V.f64(Number.isNaN(result) ? '7ff8000000000000' : float64ToBits(result));
  }
  const result = BigInt(left.value) + BigInt(right.value);
  if (result > INT64_MAX) throw new OracleExecutionError('TYPE_NUMERIC_OVERFLOW');
  if (result < INT64_MIN) throw new OracleExecutionError('TYPE_NUMERIC_UNDERFLOW');
  if (left.t === 'int32' && right.t === 'int32' && result >= INT32_MIN && result <= INT32_MAX) {
    return V.i32(result);
  }
  return V.i64(result);
};

export const negateNumeric = (value) => {
  if (value.t === 'int32') {
    const result = -BigInt(value.value);
    return result <= INT32_MAX ? V.i32(result) : V.i64(result);
  }
  if (value.t === 'int64') {
    const integer = BigInt(value.value);
    if (integer === INT64_MIN) throw new OracleExecutionError('TYPE_NUMERIC_OVERFLOW');
    return V.i64(-integer);
  }
  if (value.t === 'float64') {
    const parts = float64Parts(value.bits);
    if (parts.kind === 'nan') return V.f64('7ff8000000000000');
    return V.f64((parts.bits ^ (1n << 63n)).toString(16).padStart(16, '0'));
  }
  if (value.t === 'decimal128') {
    if (value.class === 'nan') return clone(value);
    return { ...clone(value), sign: value.sign === 'negative' ? 'positive' : 'negative' };
  }
  throw new OracleExecutionError('TYPE_MISMATCH');
};

const getObjectField = (object, name) => object.fields.find((field) => field.name === name)?.value;
export const objectField = getObjectField;

const indexSegment = (segment) => /^(?:0|[1-9][0-9]*)$/.test(segment) ? Number(segment) : undefined;
const resolveCandidates = (value, segments, budget) => {
  if (segments.length === 0) {
    budget.count += 1;
    if (budget.count > 1_000_000) {
      throw new OracleExecutionError('QUOTA_LIMIT_EXCEEDED', {
        details: {
          limit_id: 'path.candidates',
          maximum: 1_000_000,
          observed: budget.count,
          unit: 'count',
        },
      });
    }
    return [value];
  }
  const [head, ...tail] = segments;
  if (value.t === 'object') {
    const child = getObjectField(value, head);
    return child === undefined ? [] : resolveCandidates(child, tail, budget);
  }
  if (value.t === 'array') {
    const index = indexSegment(head);
    if (index !== undefined) {
      return index < value.values.length ? resolveCandidates(value.values[index], tail, budget) : [];
    }
    return value.values.flatMap((child) => resolveCandidates(child, segments, budget));
  }
  return [];
};

export const pathCandidates = (root, pathText) => {
  if (root.t !== 'object' || typeof pathText !== 'string') throw new OracleExecutionError('TYPE_MISMATCH');
  if (pathText.length === 0 || pathText.startsWith('.') || pathText.endsWith('.') || pathText.includes('..')) {
    throw new OracleExecutionError('VAL_INVALID_PATH');
  }
  if (Buffer.byteLength(pathText, 'utf8') > 4096 || pathText.split('.').length > 100) {
    throw new OracleExecutionError('QUOTA_LIMIT_EXCEEDED');
  }
  return resolveCandidates(root, pathText.split('.'), { count: 0 });
};

export const resolvePath = (root, pathValue, mode = 'single') => {
  if (root.t !== 'object' || pathValue.t !== 'string') throw new OracleExecutionError('TYPE_MISMATCH');
  const candidates = pathCandidates(root, pathValue.value);
  if (mode === 'fanout') return V.array(candidates.map(clone));
  if (mode !== 'single') throw new OracleExecutionError('VAL_INVALID_LITERAL');
  if (candidates.length === 0) return V.missing();
  if (candidates.length !== 1) throw new OracleExecutionError('VAL_UNSUPPORTED_COMBINATION');
  return clone(candidates[0]);
};

export const pathExists = (root, pathValue) => {
  const result = resolvePath(root, pathValue, 'fanout');
  return V.bool(result.values.length > 0);
};

export const arrayAll = (source, requested) => {
  if (source.t !== 'array' || requested.t !== 'array') throw new OracleExecutionError('TYPE_MISMATCH');
  return V.bool(requested.values.every((needle) => source.values.some((value) => equalValues(value, needle))));
};

export const arrayElemMatch = (source, needle) => {
  if (source.t !== 'array') throw new OracleExecutionError('TYPE_MISMATCH');
  return V.bool(source.values.some((value) => equalValues(value, needle)));
};

const floorDiv = (value, divisor) => Math.floor(value / divisor);
const daysFromCivil = (year, month, day) => {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = floorDiv(adjustedYear, 400);
  const yearOfEra = adjustedYear - era * 400;
  const shiftedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = floorDiv(153 * shiftedMonth + 2, 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + floorDiv(yearOfEra, 4) - floorDiv(yearOfEra, 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
};
const isLeap = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

export const parseTimestamp = (input) => {
  if (input.t !== 'string') throw new OracleExecutionError('TYPE_MISMATCH');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(input.value);
  if (!match) throw new OracleExecutionError('TYPE_TEMPORAL_RANGE');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '', zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const monthDays = [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] ||
    hour > 23 || minute > 59 || second > 59
  ) throw new OracleExecutionError('TYPE_TEMPORAL_RANGE');
  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const sign = zone[0] === '-' ? -1 : 1;
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (
      zoneHour > 14 ||
      zoneMinute > 59 ||
      (zoneHour === 14 && zoneMinute !== 0) ||
      zone === '-00:00'
    ) throw new OracleExecutionError('TYPE_TEMPORAL_RANGE');
    offsetMinutes = sign * (zoneHour * 60 + zoneMinute);
  }
  const days = BigInt(daysFromCivil(year, month, day));
  const localSeconds = days * 86_400n + BigInt(hour * 3600 + minute * 60 + second);
  const micros = (localSeconds - BigInt(offsetMinutes * 60)) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (micros < TIMESTAMP_MIN || micros > TIMESTAMP_MAX) {
    throw new OracleExecutionError('TYPE_TEMPORAL_RANGE');
  }
  return { t: 'timestamp', microseconds: micros.toString() };
};

export const vectorDistance = (left, right, metric) => {
  if (left.t !== 'vector' || right.t !== 'vector') throw new OracleExecutionError('TYPE_MISMATCH');
  if (left.element !== right.element || left.dimension !== right.dimension) {
    throw new OracleExecutionError('TYPE_VECTOR_DIMENSION');
  }
  if (!['l2', 'dot', 'cosine'].includes(metric)) throw new OracleExecutionError('VAL_INVALID_LITERAL');
  let dot = 0;
  let normLeft = 0;
  let normRight = 0;
  let squaredDistance = 0;
  for (let index = 0; index < left.dimension; index += 1) {
    const a = vectorComponent(left, index);
    const b = vectorComponent(right, index);
    const difference = a - b;
    squaredDistance = squaredDistance + difference * difference;
    dot = dot + a * b;
    normLeft = normLeft + a * a;
    normRight = normRight + b * b;
  }
  let result;
  if (metric === 'l2') result = Math.sqrt(squaredDistance);
  else if (metric === 'dot') result = dot;
  else {
    if (normLeft === 0 || normRight === 0) throw new OracleExecutionError('TYPE_VECTOR_ZERO_NORM');
    result = 1 - dot / (Math.sqrt(normLeft) * Math.sqrt(normRight));
  }
  if (!Number.isFinite(result)) throw new OracleExecutionError('TYPE_NUMERIC_OVERFLOW');
  return V.f64(float64ToBits(result));
};

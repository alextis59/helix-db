import { float64ToBits, V, validateValue } from '../../reference/semantic-oracle/value.mjs';

const decimalValue = (text) => {
  if (text === 'NaN') return { t: 'decimal128', class: 'nan' };
  if (text === 'Infinity' || text === '-Infinity') {
    return {
      t: 'decimal128',
      class: 'infinity',
      sign: text.startsWith('-') ? 'negative' : 'positive',
    };
  }
  const match = /^([+-]?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(text);
  if (!match) throw new Error(`unsupported Decimal128 text ${text}`);
  const [, signText, integer, fraction = '', exponentText = '0'] = match;
  let coefficient = `${integer}${fraction}`.replace(/^0+(?=[0-9])/, '');
  let exponent = BigInt(exponentText) - BigInt(fraction.length);
  if (/^0+$/.test(coefficient)) {
    coefficient = '0';
    exponent = 0n;
  } else {
    while (coefficient.endsWith('0')) {
      coefficient = coefficient.slice(0, -1);
      exponent += 1n;
    }
  }
  const value = {
    t: 'decimal128',
    class: 'finite',
    sign: signText === '-' ? 'negative' : 'positive',
    coefficient,
    exponent: exponent.toString(),
  };
  validateValue(value);
  return value;
};

export const logicalFromEjson = (value) => {
  if (value === null) return V.null();
  if (typeof value === 'boolean') return V.bool(value);
  if (typeof value === 'string') return V.string(value);
  if (typeof value === 'number') throw new Error('logical EJSON values must not use bare numbers');
  if (Array.isArray(value)) return V.array(value.map(logicalFromEjson));
  if (!value || typeof value !== 'object') throw new Error('invalid EJSON logical value');
  const keys = Object.keys(value);
  if (keys.length === 1) {
    if (keys[0] === '$numberInt') return V.i32(value.$numberInt);
    if (keys[0] === '$numberLong') return V.i64(value.$numberLong);
    if (keys[0] === '$numberDouble') {
      const number =
        {
          NaN,
          Infinity,
          '-Infinity': -Infinity,
        }[value.$numberDouble] ?? Number(value.$numberDouble);
      return V.f64(float64ToBits(number));
    }
    if (keys[0] === '$numberDecimal') return decimalValue(value.$numberDecimal);
    if (keys[0] === '$oid') return { t: 'objectId', value: value.$oid };
    if (keys[0] === '$binary') {
      return {
        t: 'binary',
        subtype: Number.parseInt(value.$binary.subType, 16),
        hex: Buffer.from(value.$binary.base64, 'base64').toString('hex'),
      };
    }
  }
  return V.object(Object.entries(value).map(([name, child]) => [name, logicalFromEjson(child)]));
};

export const assertDatasetLogicalTypes = (node, at) => {
  if (typeof node === 'number') throw new Error(`${at}: dataset contains bare JSON number`);
  if (Array.isArray(node)) {
    node.forEach((child, index) => {
      assertDatasetLogicalTypes(child, `${at}[${index}]`);
    });
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [name, child] of Object.entries(node)) {
    assertDatasetLogicalTypes(child, `${at}.${name}`);
  }
};

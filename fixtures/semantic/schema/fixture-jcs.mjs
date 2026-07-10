import { createHash } from 'node:crypto';

const canonicalText = (value, at = '$') => {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') {
    if (!value.isWellFormed()) throw new Error(`${at}: unpaired Unicode surrogate`);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new Error(`${at}: fixture-profile bare number is not a canonical safe integer`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((child, index) => canonicalText(child, `${at}[${index}]`)).join(',')}]`;
  }
  if (!value || typeof value !== 'object') {
    throw new Error(`${at}: unsupported JSON value ${typeof value}`);
  }

  const entries = Object.keys(value)
    .sort()
    .map((key) => {
      if (!key.isWellFormed()) throw new Error(`${at}: unpaired surrogate in property name`);
      return `${JSON.stringify(key)}:${canonicalText(value[key], `${at}.${key}`)}`;
    });
  return `{${entries.join(',')}}`;
};

export const canonicalizeFixture = (value) => Buffer.from(canonicalText(value), 'utf8');
export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

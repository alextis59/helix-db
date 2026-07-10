import { createHash } from 'node:crypto';

const encode = (value) => {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JCS rejects non-finite JSON numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${encode(value[key])}`)
      .join(',')}}`;
  }
  throw new Error(`JCS rejects ${typeof value}`);
};

export const canonicalize = (value) => Buffer.from(encode(value), 'utf8');
export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

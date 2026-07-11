import { gunzipSync } from 'node:zlib';
import { FixtureDiagnostic, OracleExecutionError } from './registry.mjs';
import { validateValue } from './value.mjs';

class StrictJsonError extends Error {
  constructor(
    message,
    { truncated = false, duplicate = false, invalidUnicode = false, limit } = {},
  ) {
    super(message);
    this.truncated = truncated;
    this.duplicate = duplicate;
    this.invalidUnicode = invalidUnicode;
    this.limit = limit;
  }
}

class StrictJsonParser {
  constructor(source, { maxDepth = 512, maxNodes = 1_000_000 } = {}) {
    this.source = source;
    this.offset = 0;
    this.maxDepth = maxDepth;
    this.maxNodes = maxNodes;
    this.nodes = 0;
  }

  error(message, options) {
    throw new StrictJsonError(`${message} at character ${this.offset}`, options);
  }

  peek() {
    return this.source[this.offset];
  }

  skipWhitespace() {
    while (' \t\r\n'.includes(this.peek())) this.offset += 1;
  }

  parse() {
    this.skipWhitespace();
    if (this.offset === this.source.length) this.error('empty JSON input', { truncated: true });
    const value = this.parseValue(1);
    this.skipWhitespace();
    if (this.offset !== this.source.length) this.error('trailing JSON input');
    return value;
  }

  parseValue(depth) {
    this.nodes += 1;
    if (this.nodes > this.maxNodes) {
      this.error('JSON node limit exceeded', {
        limit: { id: 'ast.nodes', maximum: this.maxNodes, observed: this.nodes, unit: 'count' },
      });
    }
    if (depth > this.maxDepth) {
      this.error('JSON depth limit exceeded', {
        limit: { id: 'ast.depth', maximum: this.maxDepth, observed: depth, unit: 'levels' },
      });
    }
    this.skipWhitespace();
    const token = this.peek();
    if (token === undefined) this.error('unexpected end of JSON input', { truncated: true });
    if (token === '{') return this.parseObject(depth);
    if (token === '[') return this.parseArray(depth);
    if (token === '"') return this.parseString();
    if (token === '-' || (token >= '0' && token <= '9')) return this.parseNumber();
    if (this.source.startsWith('true', this.offset)) {
      this.offset += 4;
      return true;
    }
    if (this.source.startsWith('false', this.offset)) {
      this.offset += 5;
      return false;
    }
    if (this.source.startsWith('null', this.offset)) {
      this.offset += 4;
      return null;
    }
    this.error('invalid JSON token');
  }

  parseObject(depth) {
    this.offset += 1;
    const value = {};
    const names = new Set();
    this.skipWhitespace();
    if (this.peek() === '}') {
      this.offset += 1;
      return value;
    }
    while (true) {
      this.skipWhitespace();
      if (this.peek() === undefined) this.error('truncated JSON object', { truncated: true });
      if (this.peek() !== '"') this.error('JSON object key must be a string');
      const name = this.parseString();
      if (names.has(name))
        this.error(`duplicate JSON property ${JSON.stringify(name)}`, { duplicate: true });
      names.add(name);
      this.skipWhitespace();
      if (this.peek() === undefined) this.error('truncated JSON object', { truncated: true });
      if (this.peek() !== ':') this.error('missing JSON object colon');
      this.offset += 1;
      Object.defineProperty(value, name, {
        value: this.parseValue(depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
      this.skipWhitespace();
      if (this.peek() === '}') {
        this.offset += 1;
        return value;
      }
      if (this.peek() === undefined) this.error('truncated JSON object', { truncated: true });
      if (this.peek() !== ',') this.error('missing JSON object comma');
      this.offset += 1;
    }
  }

  parseArray(depth) {
    this.offset += 1;
    const value = [];
    this.skipWhitespace();
    if (this.peek() === ']') {
      this.offset += 1;
      return value;
    }
    while (true) {
      value.push(this.parseValue(depth + 1));
      this.skipWhitespace();
      if (this.peek() === ']') {
        this.offset += 1;
        return value;
      }
      if (this.peek() === undefined) this.error('truncated JSON array', { truncated: true });
      if (this.peek() !== ',') this.error('missing JSON array comma');
      this.offset += 1;
    }
  }

  parseString() {
    this.offset += 1;
    let value = '';
    while (true) {
      const character = this.peek();
      if (character === undefined) this.error('truncated JSON string', { truncated: true });
      this.offset += 1;
      if (character === '"') {
        if (!value.isWellFormed())
          this.error('JSON string contains unpaired surrogate', { invalidUnicode: true });
        return value;
      }
      if (character === '\\') {
        const escaped = this.peek();
        if (escaped === undefined) this.error('truncated JSON escape', { truncated: true });
        this.offset += 1;
        const simple = {
          '"': '"',
          '\\': '\\',
          '/': '/',
          b: '\b',
          f: '\f',
          n: '\n',
          r: '\r',
          t: '\t',
        };
        if (Object.hasOwn(simple, escaped)) {
          value += simple[escaped];
          continue;
        }
        if (escaped !== 'u') this.error('invalid JSON escape');
        const digits = this.source.slice(this.offset, this.offset + 4);
        if (digits.length !== 4) this.error('truncated Unicode escape', { truncated: true });
        if (!/^[0-9a-fA-F]{4}$/.test(digits)) this.error('invalid Unicode escape');
        value += String.fromCharCode(Number.parseInt(digits, 16));
        this.offset += 4;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) this.error('unescaped control character');
      value += character;
    }
  }

  parseNumber() {
    const remainder = this.source.slice(this.offset);
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(remainder);
    if (!match) this.error('invalid JSON number');
    const token = match[0];
    const next = remainder[token.length];
    if (next !== undefined && !' \t\r\n,]}'.includes(next))
      this.error('invalid JSON number suffix');
    this.offset += token.length;
    const value = Number(token);
    if (!Number.isFinite(value)) this.error('JSON number is not finite binary64');
    return value;
  }
}

export const parseStrictJson = (source, options) => new StrictJsonParser(source, options).parse();

const validateTypedWrappers = (node, at = '$') => {
  if (Array.isArray(node)) {
    node.forEach((value, index) => {
      validateTypedWrappers(value, `${at}[${index}]`);
    });
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (Object.hasOwn(node, '$value')) {
    if (Object.keys(node).length !== 1) {
      throw new OracleExecutionError('PAR_INVALID_TYPED_VALUE');
    }
    try {
      validateValue(node.$value, `${at}.$value`);
    } catch (error) {
      if (error instanceof FixtureDiagnostic && error.code === 'fixture.value.unicode') {
        throw new OracleExecutionError('PAR_INVALID_UTF8');
      }
      throw new OracleExecutionError('PAR_INVALID_TYPED_VALUE');
    }
    return;
  }
  for (const [name, value] of Object.entries(node)) validateTypedWrappers(value, `${at}.${name}`);
};

export const decodeRawInput = (action) => {
  if (action.target !== 'command' || action.encoding !== 'json') {
    throw new OracleExecutionError('CAP_FORMAT_UNSUPPORTED');
  }
  let bytes = Buffer.from(action.bytes_hex, 'hex');
  if (bytes.length > 67_108_864) {
    throw new OracleExecutionError('QUOTA_LIMIT_EXCEEDED', {
      details: {
        limit_id: 'command.raw_bytes',
        maximum: 67_108_864,
        observed: bytes.length,
        unit: 'bytes',
      },
    });
  }
  if (action.compression === 'gzip') {
    try {
      bytes = gunzipSync(bytes, { maxOutputLength: 67_108_864 });
    } catch {
      throw new OracleExecutionError('PAR_COMPRESSION_FAILED');
    }
  } else if (action.compression !== 'identity') {
    throw new OracleExecutionError('CAP_FORMAT_UNSUPPORTED');
  }
  if (bytes.length > 67_108_864) {
    throw new OracleExecutionError('QUOTA_LIMIT_EXCEEDED', {
      details: {
        limit_id: 'command.expanded_bytes',
        maximum: 67_108_864,
        observed: bytes.length,
        unit: 'bytes',
      },
    });
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new OracleExecutionError('PAR_INVALID_UTF8');
  }
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new OracleExecutionError('PAR_INVALID_UTF8');
  }
  let command;
  try {
    command = parseStrictJson(source, { maxDepth: 64, maxNodes: 4_096 });
  } catch (error) {
    if (!(error instanceof StrictJsonError)) throw error;
    if (error.duplicate)
      throw new OracleExecutionError('VAL_DUPLICATE_FIELD', { phase: 'validate' });
    if (error.invalidUnicode) throw new OracleExecutionError('PAR_INVALID_UTF8');
    if (error.limit) {
      throw new OracleExecutionError('QUOTA_LIMIT_EXCEEDED', {
        phase: 'validate',
        details: {
          limit_id: error.limit.id,
          maximum: error.limit.maximum,
          observed: error.limit.observed,
          unit: error.limit.unit,
        },
      });
    }
    throw new OracleExecutionError(error.truncated ? 'PAR_TRUNCATED_INPUT' : 'PAR_INVALID_JSON');
  }
  if (!source.isWellFormed()) throw new OracleExecutionError('PAR_INVALID_UTF8');
  validateTypedWrappers(command);
  return command;
};

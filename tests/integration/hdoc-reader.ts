import { Buffer } from 'node:buffer';

export type TaggedValue =
  | { t: 'null' }
  | { t: 'bool'; value: boolean }
  | { t: 'int32' | 'int64'; value: string }
  | { bits: string; t: 'float64' }
  | {
      class: 'finite';
      coefficient: string;
      exponent: string;
      sign: 'negative' | 'positive';
      t: 'decimal128';
    }
  | { class: 'infinity'; sign: 'negative' | 'positive'; t: 'decimal128' }
  | { class: 'nan'; t: 'decimal128' }
  | { t: 'string'; value: string }
  | { hex: string; subtype: number; t: 'binary' }
  | TaggedObject
  | { t: 'array'; values: TaggedValue[] }
  | { microseconds: string; t: 'timestamp' }
  | { days: string; t: 'date' }
  | { t: 'uuid'; value: string }
  | { t: 'objectId'; value: string }
  | { bits: string[]; dimension: number; element: 'f16' | 'f32'; t: 'vector' };

export interface TaggedObject {
  fields: { name: string; value: TaggedValue }[];
  t: 'object';
}

export interface HDocReadResult {
  canonicalLength: number;
  contentHashHex: string;
  fieldCount: number;
  logicalValue: TaggedObject;
  storedLength: number;
}

interface Section {
  itemCount: number;
  logical: Buffer;
  logicalOffset: number;
}

interface ValueReference {
  length: number;
  offset: number;
  tag: number;
}

interface FieldRecord extends ValueReference {
  name: string;
  presentation: number;
}

interface ContainerRecord {
  itemCount: number;
  itemStart: number;
  tag: number;
}

const fail = (message: string): never => {
  throw new Error(`invalid HDoc: ${message}`);
};

const requireRange = (bytes: Buffer, offset: number, length: number, label: string): Buffer => {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
    return fail(`${label} range is not a nonnegative safe integer`);
  }
  const end = offset + length;
  if (!Number.isSafeInteger(end) || end > bytes.length) return fail(`${label} is out of bounds`);
  return bytes.subarray(offset, end);
};

const u16 = (bytes: Buffer, offset: number): number =>
  requireRange(bytes, offset, 2, 'u16').readUInt16LE(0);
const u32 = (bytes: Buffer, offset: number): number =>
  requireRange(bytes, offset, 4, 'u32').readUInt32LE(0);

const crc32c = (bytes: Buffer): number => {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    let byte = bytes[index];
    if (index >= 32 && index < 36) byte = 0;
    crc ^= byte ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = ((crc >>> 1) ^ (-(crc & 1) & 0x82f63b78)) >>> 0;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const decompressLz4Block = (stored: Buffer, logicalLength: number): Buffer => {
  const output = Buffer.alloc(logicalLength);
  let input = 0;
  let cursor = 0;
  const extendedLength = (initial: number): number => {
    let length = initial;
    if (initial !== 15) return length;
    while (true) {
      const next = stored[input];
      if (next === undefined) return fail('truncated LZ4 length');
      input += 1;
      length += next;
      if (next !== 255) return length;
    }
  };
  while (input < stored.length) {
    const token = stored[input];
    if (token === undefined) return fail('truncated LZ4 token');
    input += 1;
    const literals = extendedLength(token >>> 4);
    requireRange(stored, input, literals, 'LZ4 literals').copy(output, cursor);
    input += literals;
    cursor += literals;
    if (input === stored.length) break;
    const matchOffset = u16(stored, input);
    input += 2;
    if (matchOffset === 0 || matchOffset > cursor) return fail('invalid LZ4 match offset');
    const matchLength = extendedLength(token & 0x0f) + 4;
    if (cursor + matchLength > output.length) return fail('LZ4 match exceeds output');
    for (let copied = 0; copied < matchLength; copied += 1) {
      output[cursor] = output[cursor - matchOffset] ?? fail('invalid LZ4 match source');
      cursor += 1;
    }
  }
  if (input !== stored.length || cursor !== logicalLength) return fail('LZ4 length mismatch');
  return output;
};

const decompressSection = (stored: Buffer, logicalLength: number): Buffer => {
  if (!stored.subarray(0, 8).equals(Buffer.from('48434d500d0a1a0a', 'hex'))) {
    return fail('compression magic mismatch');
  }
  if (u16(stored, 8) !== 1 || u16(stored, 10) !== 32 || u16(stored, 12) !== 24) {
    return fail('compression header mismatch');
  }
  const blockCount = u32(stored, 16);
  if (u32(stored, 20) !== logicalLength || u32(stored, 24) !== 32 + blockCount * 24) {
    return fail('compression length mismatch');
  }
  const output = Buffer.alloc(logicalLength);
  for (let index = 0; index < blockCount; index += 1) {
    const entry = 32 + index * 24;
    const logicalOffset = u32(stored, entry);
    const blockLogicalLength = u32(stored, entry + 4);
    const storedOffset = u32(stored, entry + 8);
    const storedLength = u32(stored, entry + 12);
    const flags = u16(stored, entry + 16);
    const payload = requireRange(stored, storedOffset, storedLength, 'compressed block');
    const block = flags === 1 ? payload : decompressLz4Block(payload, blockLogicalLength);
    if (block.length !== blockLogicalLength) return fail('compressed block length mismatch');
    block.copy(output, logicalOffset);
  }
  return output;
};

const IV = Uint32Array.from([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
const PERMUTATION = Uint8Array.from([2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8]);
const rotateRight = (word: number, count: number): number =>
  ((word >>> count) | (word << (32 - count))) >>> 0;
const mix = (
  state: Uint32Array,
  a: number,
  b: number,
  c: number,
  d: number,
  x: number,
  y: number,
): void => {
  state[a] = ((state[a] ?? 0) + (state[b] ?? 0) + x) >>> 0;
  state[d] = rotateRight((state[d] ?? 0) ^ (state[a] ?? 0), 16);
  state[c] = ((state[c] ?? 0) + (state[d] ?? 0)) >>> 0;
  state[b] = rotateRight((state[b] ?? 0) ^ (state[c] ?? 0), 12);
  state[a] = ((state[a] ?? 0) + (state[b] ?? 0) + y) >>> 0;
  state[d] = rotateRight((state[d] ?? 0) ^ (state[a] ?? 0), 8);
  state[c] = ((state[c] ?? 0) + (state[d] ?? 0)) >>> 0;
  state[b] = rotateRight((state[b] ?? 0) ^ (state[c] ?? 0), 7);
};
const round = (state: Uint32Array, message: Uint32Array): void => {
  mix(state, 0, 4, 8, 12, message[0] ?? 0, message[1] ?? 0);
  mix(state, 1, 5, 9, 13, message[2] ?? 0, message[3] ?? 0);
  mix(state, 2, 6, 10, 14, message[4] ?? 0, message[5] ?? 0);
  mix(state, 3, 7, 11, 15, message[6] ?? 0, message[7] ?? 0);
  mix(state, 0, 5, 10, 15, message[8] ?? 0, message[9] ?? 0);
  mix(state, 1, 6, 11, 12, message[10] ?? 0, message[11] ?? 0);
  mix(state, 2, 7, 8, 13, message[12] ?? 0, message[13] ?? 0);
  mix(state, 3, 4, 9, 14, message[14] ?? 0, message[15] ?? 0);
};
const compress = (
  cv: Uint32Array,
  words: Uint32Array,
  counter: bigint,
  blockLength: number,
  flags: number,
): Uint32Array => {
  const state = new Uint32Array(16);
  state.set(cv);
  state.set(IV.subarray(0, 4), 8);
  state[12] = Number(counter & 0xffffffffn);
  state[13] = Number((counter >> 32n) & 0xffffffffn);
  state[14] = blockLength;
  state[15] = flags;
  let message = Uint32Array.from(words);
  for (let index = 0; index < 7; index += 1) {
    round(state, message);
    if (index < 6) message = Uint32Array.from(PERMUTATION, (source) => message[source] ?? 0);
  }
  const output = new Uint32Array(16);
  for (let index = 0; index < 8; index += 1) {
    output[index] = (state[index] ?? 0) ^ (state[index + 8] ?? 0);
    output[index + 8] = (state[index + 8] ?? 0) ^ (cv[index] ?? 0);
  }
  return output;
};
interface BlakeOutput {
  blockLength: number;
  counter: bigint;
  flags: number;
  inputCv: Uint32Array;
  words: Uint32Array;
}
const chainingValue = (output: BlakeOutput): Uint32Array =>
  compress(output.inputCv, output.words, output.counter, output.blockLength, output.flags).subarray(
    0,
    8,
  );
const blockWords = (bytes: Buffer): Uint32Array => {
  const block = Buffer.alloc(64);
  bytes.copy(block);
  return Uint32Array.from({ length: 16 }, (_, index) => block.readUInt32LE(index * 4));
};
const chunkOutput = (chunk: Buffer, counter: number): BlakeOutput => {
  let cv = Uint32Array.from(IV);
  const blocks = Math.max(1, Math.ceil(chunk.length / 64));
  for (let index = 0; index < blocks; index += 1) {
    const block = chunk.subarray(index * 64, Math.min((index + 1) * 64, chunk.length));
    const output = {
      blockLength: block.length,
      counter: BigInt(counter),
      flags: (index === 0 ? 1 : 0) | (index === blocks - 1 ? 2 : 0),
      inputCv: cv,
      words: blockWords(block),
    };
    if (index === blocks - 1) return output;
    cv = Uint32Array.from(chainingValue(output));
  }
  return fail('unreachable BLAKE3 chunk state');
};
const parentOutput = (left: Uint32Array, right: Uint32Array): BlakeOutput => ({
  blockLength: 64,
  counter: 0n,
  flags: 4,
  inputCv: Uint32Array.from(IV),
  words: Uint32Array.from([...left, ...right]),
});
const blake3 = (bytes: Buffer): Buffer => {
  const chunks = Math.max(1, Math.ceil(bytes.length / 1024));
  const stack: Uint32Array[] = [];
  for (let index = 0; index < chunks - 1; index += 1) {
    let cv = chainingValue(chunkOutput(bytes.subarray(index * 1024, (index + 1) * 1024), index));
    let total = index + 1;
    while ((total & 1) === 0) {
      const left = stack.pop();
      if (left === undefined) return fail('invalid BLAKE3 tree state');
      cv = chainingValue(parentOutput(left, cv));
      total >>>= 1;
    }
    stack.push(cv);
  }
  let output = chunkOutput(bytes.subarray((chunks - 1) * 1024), chunks - 1);
  while (stack.length > 0) {
    const left = stack.pop();
    if (left === undefined) return fail('invalid BLAKE3 final state');
    output = parentOutput(left, chainingValue(output));
  }
  const words = compress(output.inputCv, output.words, 0n, output.blockLength, output.flags | 8);
  const digest = Buffer.alloc(32);
  for (let index = 0; index < 8; index += 1) digest.writeUInt32LE(words[index] ?? 0, index * 4);
  return digest;
};

const frameHash = (tag: number, body: Buffer): Buffer => {
  const prefix = Buffer.alloc(38);
  Buffer.from('HDOC-TYPED-CONTENT-HASH-V1\0').copy(prefix);
  prefix.writeUInt16LE(1, 27);
  prefix[29] = tag;
  prefix.writeBigUInt64LE(BigInt(body.length), 30);
  return blake3(Buffer.concat([prefix, body]));
};

const signed32 = (payload: Buffer): number => payload.readInt32LE(0);
const signed64 = (payload: Buffer): bigint => payload.readBigInt64LE(0);
const hex = (payload: Buffer): string => payload.toString('hex');
const fixedHex = (value: number, digits: number): string =>
  value.toString(16).padStart(digits, '0');

const decimalValue = (payload: Buffer): TaggedValue => {
  const bits = payload.readBigUInt64LE(0) | (payload.readBigUInt64LE(8) << 64n);
  if (bits === 0x78000000000000000000000000000000n) {
    return { class: 'infinity', sign: 'positive', t: 'decimal128' };
  }
  if (bits === 0xf8000000000000000000000000000000n) {
    return { class: 'infinity', sign: 'negative', t: 'decimal128' };
  }
  if (bits === 0x7c000000000000000000000000000000n) {
    return { class: 'nan', t: 'decimal128' };
  }
  const negative = bits >> 127n !== 0n;
  let coefficient = bits & ((1n << 113n) - 1n);
  let exponent = Number((bits >> 113n) & 0x3fffn) - 6176;
  if (coefficient !== 0n && exponent === 6111) {
    while (coefficient % 10n === 0n) {
      coefficient /= 10n;
      exponent += 1;
    }
  }
  return {
    class: 'finite',
    coefficient: coefficient.toString(),
    exponent: coefficient === 0n ? '0' : exponent.toString(),
    sign: negative ? 'negative' : 'positive',
    t: 'decimal128',
  };
};

const scalarValue = (reference: ValueReference, payload: Buffer): TaggedValue => {
  switch (reference.tag) {
    case 1:
      return { t: 'null' };
    case 2:
      return { t: 'bool', value: payload[0] === 1 };
    case 3:
      return { t: 'int32', value: signed32(payload).toString() };
    case 4:
      return { t: 'int64', value: signed64(payload).toString() };
    case 5:
      return { bits: payload.readBigUInt64LE(0).toString(16).padStart(16, '0'), t: 'float64' };
    case 6:
      return decimalValue(payload);
    case 7:
      return { t: 'string', value: new TextDecoder('utf-8', { fatal: true }).decode(payload) };
    case 8:
      return { hex: hex(payload.subarray(1)), subtype: payload[0] ?? 0, t: 'binary' };
    case 11:
      return { microseconds: signed64(payload).toString(), t: 'timestamp' };
    case 12:
      return { days: signed32(payload).toString(), t: 'date' };
    case 13: {
      const value = hex(payload);
      return {
        t: 'uuid',
        value: `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`,
      };
    }
    case 14:
      return { t: 'objectId', value: hex(payload) };
    case 15: {
      const dimension = u32(payload, 0);
      return {
        bits: Array.from({ length: dimension }, (_, index) =>
          fixedHex(u32(payload, 4 + index * 4), 8),
        ),
        dimension,
        element: 'f32',
        t: 'vector',
      };
    }
    case 16: {
      const dimension = u32(payload, 0);
      return {
        bits: Array.from({ length: dimension }, (_, index) =>
          fixedHex(u16(payload, 4 + index * 2), 4),
        ),
        dimension,
        element: 'f16',
        t: 'vector',
      };
    }
    default:
      return fail(`unknown scalar tag ${reference.tag}`);
  }
};

export const readHDoc = (input: Uint8Array): HDocReadResult => {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (!bytes.subarray(0, 8).equals(Buffer.from('48444f430d0a1a0a', 'hex'))) fail('magic mismatch');
  if (u16(bytes, 8) !== 1 || u16(bytes, 10) !== 0) fail('version mismatch');
  const storedLength = u32(bytes, 20);
  const canonicalLength = u32(bytes, 24);
  const fieldCount = u32(bytes, 28);
  if (storedLength !== bytes.length) fail('stored length mismatch');
  if (crc32c(bytes) !== u32(bytes, 32)) fail('CRC32C mismatch');
  if (u16(bytes, 36) !== 4 || u32(bytes, 40) !== 64) fail('directory shape mismatch');

  const entries = Array.from({ length: 4 }, (_, index) => {
    const offset = 64 + index * 32;
    if (u16(bytes, offset) !== index + 1 || u16(bytes, offset + 24) !== 1) {
      return fail('section identity mismatch');
    }
    const flags = u16(bytes, offset + 2);
    const stored = requireRange(
      bytes,
      u32(bytes, offset + 4),
      u32(bytes, offset + 8),
      `section ${index + 1}`,
    );
    const logicalLength = u32(bytes, offset + 12);
    const compressed = (flags & 1) !== 0;
    return {
      itemCount: u32(bytes, offset + 16),
      logical: compressed ? decompressSection(stored, logicalLength) : Buffer.from(stored),
      logicalLength,
    };
  });
  let logicalCursor = 192;
  const sections: Section[] = entries.map((entry) => {
    const logicalOffset = logicalCursor;
    logicalCursor = (logicalCursor + entry.logicalLength + 7) & ~7;
    return { itemCount: entry.itemCount, logical: entry.logical, logicalOffset };
  });
  const fieldSection = sections[0] ?? fail('missing field section');
  const nameSection = sections[1] ?? fail('missing name section');
  const valueSection = sections[2] ?? fail('missing value section');
  const containerSection = sections[3] ?? fail('missing container section');

  const names = Array.from({ length: nameSection.itemCount }, (_, index) => {
    const record = index * 8;
    const offset = u32(nameSection.logical, record) - nameSection.logicalOffset;
    const length = u16(nameSection.logical, record + 4);
    return new TextDecoder('utf-8', { fatal: true }).decode(
      requireRange(nameSection.logical, offset, length, 'name'),
    );
  });
  const fields: FieldRecord[] = Array.from({ length: fieldSection.itemCount }, (_, index) => {
    const record = index * 24;
    const name = names[u32(fieldSection.logical, record)] ?? fail('field name ID is invalid');
    return {
      length: u32(fieldSection.logical, record + 16),
      name,
      offset: u32(fieldSection.logical, record + 12),
      presentation: u32(fieldSection.logical, record + 20),
      tag: fieldSection.logical[record + 10] ?? fail('missing field tag'),
    };
  });
  const descriptorBytes = containerSection.itemCount * 32;
  const containers: ContainerRecord[] = Array.from(
    { length: containerSection.itemCount },
    (_, index) => {
      const record = index * 32;
      const tag = containerSection.logical[record + 4] ?? fail('missing container tag');
      const itemOffset = u32(containerSection.logical, record + 8);
      return {
        itemCount: u32(containerSection.logical, record + 12),
        itemStart:
          tag === 9
            ? (itemOffset - fieldSection.logicalOffset) / 24
            : (itemOffset - containerSection.logicalOffset - descriptorBytes) / 12,
        tag,
      };
    },
  );
  const arrayCount = (containerSection.logical.length - descriptorBytes) / 12;
  const arrays: ValueReference[] = Array.from({ length: arrayCount }, (_, index) => {
    const record = descriptorBytes + index * 12;
    return {
      length: u32(containerSection.logical, record + 8),
      offset: u32(containerSection.logical, record + 4),
      tag: containerSection.logical[record] ?? fail('missing array tag'),
    };
  });

  const payload = (reference: ValueReference): Buffer =>
    requireRange(
      valueSection.logical,
      reference.offset - valueSection.logicalOffset,
      reference.length,
      'value payload',
    );
  const childIndex = (reference: ValueReference): number =>
    (reference.offset - containerSection.logicalOffset) / 32;
  const valueHash = (reference: ValueReference, hashes: Buffer[]): Buffer =>
    reference.tag === 9 || reference.tag === 10
      ? (hashes[childIndex(reference)] ?? fail('missing child hash'))
      : frameHash(reference.tag, payload(reference));
  const hashes: Buffer[] = Array.from({ length: containers.length }, () => Buffer.alloc(0));
  for (let index = containers.length - 1; index >= 0; index -= 1) {
    const container = containers[index] ?? fail('missing container');
    const bodyParts: Buffer[] = [];
    const count = Buffer.alloc(4);
    count.writeUInt32LE(container.itemCount);
    bodyParts.push(count);
    if (container.tag === 9) {
      for (const field of fields.slice(
        container.itemStart,
        container.itemStart + container.itemCount,
      )) {
        const name = Buffer.from(field.name, 'utf8');
        const length = Buffer.alloc(4);
        length.writeUInt32LE(name.length);
        bodyParts.push(length, name, valueHash(field, hashes));
      }
    } else {
      for (let slot = 0; slot < container.itemCount; slot += 1) {
        const reference = arrays[container.itemStart + slot] ?? fail('missing array entry');
        const encodedSlot = Buffer.alloc(4);
        encodedSlot.writeUInt32LE(slot);
        bodyParts.push(encodedSlot, valueHash(reference, hashes));
      }
    }
    hashes[index] = frameHash(container.tag, Buffer.concat(bodyParts));
  }

  const taggedValue = (reference: ValueReference): TaggedValue => {
    if (reference.tag !== 9 && reference.tag !== 10)
      return scalarValue(reference, payload(reference));
    const container = containers[childIndex(reference)] ?? fail('missing child container');
    return taggedContainer(container);
  };
  const taggedContainer = (container: ContainerRecord): TaggedObject | TaggedValue => {
    if (container.tag === 9) {
      const objectFields = fields
        .slice(container.itemStart, container.itemStart + container.itemCount)
        .sort((left, right) => left.presentation - right.presentation)
        .map((field) => ({ name: field.name, value: taggedValue(field) }));
      return { fields: objectFields, t: 'object' };
    }
    return {
      t: 'array',
      values: arrays
        .slice(container.itemStart, container.itemStart + container.itemCount)
        .map(taggedValue),
    };
  };

  const root = containers[0] ?? fail('missing root container');
  const logicalValue = taggedContainer(root);
  if (logicalValue.t !== 'object') return fail('root is not an object');
  const contentHash = hashes[0] ?? fail('missing root hash');
  const footerOffset = u32(bytes, 44);
  const storedHash = requireRange(bytes, footerOffset + 32, 32, 'footer content hash');
  if (!contentHash.equals(storedHash)) fail('typed content hash mismatch');
  return {
    canonicalLength,
    contentHashHex: contentHash.toString('hex'),
    fieldCount,
    logicalValue,
    storedLength,
  };
};

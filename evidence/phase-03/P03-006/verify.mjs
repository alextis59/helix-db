#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const evidenceDirectory = path.dirname(scriptPath);
const repository = path.resolve(evidenceDirectory, '../../..');
const manifest = JSON.parse(readFileSync(path.join(evidenceDirectory, 'manifest.json'), 'utf8'));
const commitArgument = process.argv[2];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, message) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  }
};
const sorted = (values) => [...values].sort();
const hex = (bytes) => Buffer.from(bytes).toString('hex');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const u16 = (bytes, offset) => bytes.readUInt16LE(offset);
const u32 = (bytes, offset) => bytes.readUInt32LE(offset);
const u64 = (bytes, offset) => bytes.readBigUInt64LE(offset);
const le16 = (value) => {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
};
const le32 = (value) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value >>> 0);
  return bytes;
};
const le64 = (value) => {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
};
const gitBytes = (arguments_) =>
  execFileSync('git', arguments_, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (arguments_) => gitBytes(arguments_).toString('utf8');
const showBytes = (file, commit = manifest.commit) => gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.commit) =>
  new TextDecoder('utf-8', { fatal: true }).decode(showBytes(file, commit));

assert(commitArgument, 'usage: node evidence/phase-03/P03-006/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-006', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(
  manifest.requirements,
  ['CORE-001', 'DATA-001', 'DATA-002', 'INV-001', 'INV-007'],
  'requirements inventory mismatch',
);
same(manifest.accepted_adrs, ['0012'], 'accepted ADR inventory mismatch');
same(manifest.source_commits, [manifest.commit], 'source commit inventory mismatch');
assert(
  gitText(['rev-parse', `${commitArgument}^`]).trim() === manifest.base_commit,
  'source parent mismatch',
);
assert(
  gitText(['rev-parse', `${commitArgument}^{tree}`]).trim() === manifest.source_tree,
  'source tree mismatch',
);

const verifierBytes = readFileSync(scriptPath);
assert(statSync(scriptPath).size === manifest.verifier.bytes, 'verifier byte count mismatch');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256 mismatch');

gitText(['diff', '--check', `${commitArgument}^`, commitArgument]);
const changedRecords = gitText([
  'diff-tree',
  '--no-commit-id',
  '--name-status',
  '-r',
  commitArgument,
])
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...names] = line.split('\t');
    return { status, path: names.at(-1) };
  });
same(
  sorted(changedRecords.map((record) => JSON.stringify(record))),
  sorted(
    manifest.source_artifacts.map(({ status, path: artifactPath }) =>
      JSON.stringify({ status, path: artifactPath }),
    ),
  ),
  'exact source scope mismatch',
);
assert(
  manifest.source_artifacts.length === manifest.verification.source_artifacts,
  'source artifact count mismatch',
);
const sourceBytes = new Map();
for (const artifact of manifest.source_artifacts) {
  const bytes = showBytes(artifact.path);
  assert(bytes.length === artifact.bytes, `${artifact.path}: byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: SHA-256 mismatch`);
  sourceBytes.set(artifact.path, bytes);
}
const sourceText = (file) => {
  const bytes = sourceBytes.get(file) ?? showBytes(file);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};

const snapshot = {
  integritySource: sourceText('docs/formats/hdoc-v1-integrity.json'),
  integrityDocument: sourceText('docs/formats/hdoc-v1-integrity.md'),
  envelopeSource: sourceText('docs/formats/hdoc-v1-envelope.json'),
  envelopeDocument: sourceText('docs/formats/hdoc-v1.md'),
  payloadSource: sourceText('docs/formats/hdoc-v1-payloads.json'),
  payloadDocument: sourceText('docs/formats/hdoc-v1-payloads.md'),
  recordSource: sourceText('docs/formats/hdoc-v1-records.json'),
  recordDocument: sourceText('docs/formats/hdoc-v1-records.md'),
  tagSource: sourceText('docs/formats/hdoc-v1-type-tags.json'),
  tagDocument: sourceText('docs/formats/hdoc-v1-type-tags.md'),
  specifications: sourceText('Specifications.md'),
  study: sourceText('Study.md'),
  adr: sourceText('docs/adr/0012-use-bounded-little-endian-hdoc-v1.md'),
  formatIndex: sourceText('docs/formats/README.md'),
  docsIndex: sourceText('docs/README.md'),
  matrix: sourceText('compatibility/v1/matrix-v1.json'),
  renderedMatrix: sourceText('docs/compatibility/v1-semantic-compatibility-matrix.md'),
  generationReport: sourceText('fixtures/generation/report-v1.json'),
  plan: showText('ImplementationPlan.md'),
};

const crc32c = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = ((crc >>> 1) ^ (-(crc & 1) & 0x82f63b78)) >>> 0;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

// Compact portable BLAKE3 oracle. Production code must use a reviewed implementation.
const IV = Uint32Array.from([
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
]);
const PERMUTATION = Uint8Array.from([2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8]);
const CHUNK_START = 1;
const CHUNK_END = 2;
const PARENT = 4;
const ROOT = 8;
const rotateRight = (word, count) => ((word >>> count) | (word << (32 - count))) >>> 0;
const mix = (state, a, b, c, d, x, y) => {
  state[a] = (state[a] + state[b] + x) >>> 0;
  state[d] = rotateRight(state[d] ^ state[a], 16);
  state[c] = (state[c] + state[d]) >>> 0;
  state[b] = rotateRight(state[b] ^ state[c], 12);
  state[a] = (state[a] + state[b] + y) >>> 0;
  state[d] = rotateRight(state[d] ^ state[a], 8);
  state[c] = (state[c] + state[d]) >>> 0;
  state[b] = rotateRight(state[b] ^ state[c], 7);
};
const round = (state, message) => {
  mix(state, 0, 4, 8, 12, message[0], message[1]);
  mix(state, 1, 5, 9, 13, message[2], message[3]);
  mix(state, 2, 6, 10, 14, message[4], message[5]);
  mix(state, 3, 7, 11, 15, message[6], message[7]);
  mix(state, 0, 5, 10, 15, message[8], message[9]);
  mix(state, 1, 6, 11, 12, message[10], message[11]);
  mix(state, 2, 7, 8, 13, message[12], message[13]);
  mix(state, 3, 4, 9, 14, message[14], message[15]);
};
const permute = (message) => Uint32Array.from(PERMUTATION, (index) => message[index]);
const blockWords = (bytes) => {
  const block = Buffer.alloc(64);
  Buffer.from(bytes).copy(block);
  return Uint32Array.from({ length: 16 }, (_, index) => block.readUInt32LE(index * 4));
};
const compress = (cv, words, counter, blockLength, flags) => {
  const state = new Uint32Array(16);
  state.set(cv, 0);
  state.set(IV.subarray(0, 4), 8);
  state[12] = Number(BigInt(counter) & 0xffffffffn);
  state[13] = Number((BigInt(counter) >> 32n) & 0xffffffffn);
  state[14] = blockLength;
  state[15] = flags;
  let message = Uint32Array.from(words);
  for (let index = 0; index < 7; index += 1) {
    round(state, message);
    if (index < 6) message = permute(message);
  }
  const output = new Uint32Array(16);
  for (let index = 0; index < 8; index += 1) {
    output[index] = state[index] ^ state[index + 8];
    output[index + 8] = state[index + 8] ^ cv[index];
  }
  return output;
};
const outputChainingValue = (output) =>
  compress(
    output.inputCv,
    output.words,
    output.counter,
    output.blockLength,
    output.flags,
  ).subarray(0, 8);
const chunkOutput = (chunk, chunkCounter) => {
  let cv = Uint32Array.from(IV);
  const blockCount = Math.max(1, Math.ceil(chunk.length / 64));
  for (let index = 0; index < blockCount; index += 1) {
    const start = index * 64;
    const block = chunk.subarray(start, Math.min(start + 64, chunk.length));
    const flags =
      (index === 0 ? CHUNK_START : 0) | (index === blockCount - 1 ? CHUNK_END : 0);
    const output = {
      inputCv: cv,
      words: blockWords(block),
      counter: BigInt(chunkCounter),
      blockLength: block.length,
      flags,
    };
    if (index === blockCount - 1) return output;
    cv = outputChainingValue(output);
  }
  throw new Error('unreachable chunk state');
};
const parentOutput = (left, right) => ({
  inputCv: Uint32Array.from(IV),
  words: Uint32Array.from([...left, ...right]),
  counter: 0n,
  blockLength: 64,
  flags: PARENT,
});
const blake3 = (input) => {
  const bytes = Buffer.from(input);
  const chunkCount = Math.max(1, Math.ceil(bytes.length / 1024));
  const stack = [];
  for (let chunkIndex = 0; chunkIndex < chunkCount - 1; chunkIndex += 1) {
    let cv = outputChainingValue(
      chunkOutput(bytes.subarray(chunkIndex * 1024, (chunkIndex + 1) * 1024), chunkIndex),
    );
    let totalChunks = chunkIndex + 1;
    while ((totalChunks & 1) === 0) {
      cv = outputChainingValue(parentOutput(stack.pop(), cv));
      totalChunks >>>= 1;
    }
    stack.push(cv);
  }
  const finalIndex = chunkCount - 1;
  let output = chunkOutput(bytes.subarray(finalIndex * 1024), finalIndex);
  while (stack.length > 0) output = parentOutput(stack.pop(), outputChainingValue(output));
  const words = compress(
    output.inputCv,
    output.words,
    0n,
    output.blockLength,
    output.flags | ROOT,
  );
  const digest = Buffer.alloc(32);
  for (let index = 0; index < 8; index += 1) digest.writeUInt32LE(words[index], index * 4);
  return digest;
};

const expectedExternalSnapshots = [
  [
    'rfc3720-text',
    'RFC-Editor',
    null,
    'https://www.rfc-editor.org/rfc/rfc3720.txt',
    578468,
    '0c014dbc041bfc2308c1990387aabffdb21050c3ec140c96522c12005b572db3',
  ],
  [
    'blake3-official-test-vectors',
    'BLAKE3-team/BLAKE3',
    '8aa5145039b972ba30e98e788752d37d14568824',
    'test_vectors/test_vectors.json',
    31922,
    'dcb91ea8accc77e6d6e632af7cdc1a99a9f3ae78cf648da595c7d064db32f624',
  ],
  [
    'blake3-official-c-example',
    'BLAKE3-team/BLAKE3',
    '8aa5145039b972ba30e98e788752d37d14568824',
    'c/example.c',
    868,
    '280e37e4afa96a97d1cf31411bb6d956352f561d2d10893f413eb2cdfa003121',
  ],
  [
    'blake3-specification-pdf',
    'BLAKE3-team/BLAKE3-specs',
    'ea51a3ac997288bf690ee82ac9cfc8b3e0e60f2a',
    'blake3.pdf',
    304371,
    'ce179e62f29a6e43ec1ac2fe62b5e063a18632cf936c430d1373bfa0b81fb349',
  ],
];
const externalTuple = (entry) => [
  entry.id,
  entry.authority,
  entry.commit ?? null,
  entry.path ?? entry.url,
  entry.bytes,
  entry.sha256,
];
const expectedCrcVectors = [
  ['standard-check-123456789', '0xe3069283', '839206e3'],
  ['rfc3720-zero32', '0x8a9136aa', 'aa36918a'],
  ['rfc3720-ones32', '0x62a8ab43', '43aba862'],
  ['rfc3720-incrementing32', '0x46dd794e', '4e79dd46'],
  ['rfc3720-decrementing32', '0x113fdb5c', '5cdb3f11'],
  ['rfc3720-iscsi-read10-pdu', '0xd9963a56', '563a96d9'],
];
const expectedOfficialDigests = [
  [0, 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262'],
  [1, '2d3adedff11b61f14c886e35afa036736dcd87a74d27b5c1510225d0f592e213'],
  [63, 'e9bc37a594daad83be9470df7f7b3798297c3d834ce80ba85d6e207627b7db7b'],
  [64, '4eed7141ea4a5cd4b788606bd23f46e212af9cacebacdc7d1f4c6dc7f2511b98'],
  [1023, '10108970eeda3eb932baac1428c7a2163b0e924c9a9e25b35bba72b28f70bd11'],
  [1024, '42214739f095a406f3fc83deb889744ac00df831c10daa55189b5d121c855af7'],
  [1025, 'd00278ae47eb27b34faecf67b4fe263f82d5412916c1ffd97c8cb7fb814b8444'],
];
const expectedNodeInventory = [
  ['null', 'noncontainer', 1],
  ['bool-false', 'noncontainer', 2],
  ['bool-true', 'noncontainer', 2],
  ['int32-one', 'noncontainer', 3],
  ['int64-one', 'noncontainer', 4],
  ['float64-positive-zero', 'noncontainer', 5],
  ['float64-negative-zero', 'noncontainer', 5],
  ['decimal128-one', 'noncontainer', 6],
  ['string-empty', 'noncontainer', 7],
  ['binary-generic-empty', 'noncontainer', 8],
  ['timestamp-epoch', 'noncontainer', 11],
  ['date-epoch', 'noncontainer', 12],
  ['uuid-nil', 'noncontainer', 13],
  ['objectid-incrementing', 'noncontainer', 14],
  ['vector-f32-one', 'noncontainer', 15],
  ['vector-f16-one', 'noncontainer', 16],
  ['empty-object', 'object', 9],
  ['empty-array', 'array', 10],
  ['array-null-true', 'array', 10],
  ['array-true-null', 'array', 10],
  ['object-a-true-b-null', 'object', 9],
  ['object-with-array', 'object', 9],
  ['root-scalars', 'object', 9],
];

const crcInput = (vector) => {
  if (vector.input_kind === 'ascii') return Buffer.from(vector.input, 'ascii');
  if (vector.input_kind === 'repeated-byte') {
    return Buffer.alloc(vector.input_length, Number.parseInt(vector.byte_hex, 16));
  }
  if (vector.input_kind === 'incrementing-inclusive') {
    return Buffer.from(
      Array.from(
        { length: vector.input_length },
        (_, index) => Number.parseInt(vector.start_hex, 16) + index,
      ),
    );
  }
  if (vector.input_kind === 'decrementing-inclusive') {
    return Buffer.from(
      Array.from(
        { length: vector.input_length },
        (_, index) => Number.parseInt(vector.start_hex, 16) - index,
      ),
    );
  }
  if (vector.input_kind === 'hex') return Buffer.from(vector.input_hex, 'hex');
  throw new Error(`${vector.id}: unknown CRC input kind`);
};

const computeStoredCrc = (bytes) => {
  const copy = Buffer.from(bytes);
  copy.fill(0, 32, 36);
  return crc32c(copy);
};
const writeStoredCrc = (bytes) => {
  bytes.writeUInt32LE(0, 32);
  bytes.writeUInt32LE(crc32c(bytes), 32);
};

const parseReferenceHDoc = (input, frameNode) => {
  const bytes = Buffer.from(input);
  if (bytes.length < 64) return { stage: 'minimal-header' };
  const totalLength = u32(bytes, 20);
  if (
    totalLength !== bytes.length ||
    !bytes.subarray(0, 8).equals(Buffer.from('48444f430d0a1a0a', 'hex'))
  ) {
    return { stage: 'minimal-header' };
  }
  if (computeStoredCrc(bytes) !== u32(bytes, 32)) return { stage: 'stored-crc32c' };
  try {
    assert(u16(bytes, 8) === 1 && u16(bytes, 10) === 0, 'reference version');
    assert(u16(bytes, 12) === 192 && u16(bytes, 14) === 32, 'reference header bytes');
    assert(u32(bytes, 16) === 0, 'reference document flags');
    assert(u32(bytes, 24) === bytes.length, 'reference canonical length');
    assert(u32(bytes, 28) === 3, 'reference field count');
    assert(u16(bytes, 36) === 4 && u16(bytes, 38) === 0, 'reference section count');
    assert(u32(bytes, 40) === 64 && u32(bytes, 44) === 344, 'reference outer offsets');
    assert(u64(bytes, 48) === 0n && u64(bytes, 56) === 0n, 'reference feature bits');
    const expectedSections = [
      [1, 0x0006, 192, 72, 3],
      [2, 0x0006, 264, 29, 3],
      [3, 0x0006, 296, 16, 3],
      [4, 0x0006, 312, 32, 1],
    ];
    for (let index = 0; index < 4; index += 1) {
      const offset = 64 + index * 32;
      const expected = expectedSections[index];
      same(
        [
          u16(bytes, offset),
          u16(bytes, offset + 2),
          u32(bytes, offset + 4),
          u32(bytes, offset + 8),
          u32(bytes, offset + 12),
          u32(bytes, offset + 16),
        ],
        [expected[0], expected[1], expected[2], expected[3], expected[3], expected[4]],
        `reference directory ${index}`,
      );
      assert(
        u16(bytes, offset + 20) === 0 && u16(bytes, offset + 22) === 0,
        `reference directory ${index} codec`,
      );
      assert(
        u16(bytes, offset + 24) === 1 &&
          u16(bytes, offset + 26) === 0 &&
          u32(bytes, offset + 28) === 0,
        `reference directory ${index} version/reserved`,
      );
    }
    assert(bytes.subarray(293, 296).every((byte) => byte === 0), 'reference pre-value padding');
    const footerOffset = 344;
    assert(
      bytes
        .subarray(footerOffset, footerOffset + 8)
        .equals(Buffer.from('48444f43454e440a', 'hex')),
      'reference footer magic',
    );
    same(
      [
        u16(bytes, footerOffset + 8),
        u16(bytes, footerOffset + 10),
        u16(bytes, footerOffset + 12),
        u16(bytes, footerOffset + 14),
        u32(bytes, footerOffset + 16),
      ],
      [64, 1, 1, 1, 32],
      'reference footer profile',
    );
    same(
      [
        u32(bytes, footerOffset + 20),
        u32(bytes, footerOffset + 24),
        u32(bytes, footerOffset + 28),
      ],
      [408, 408, 3],
      'reference footer copies',
    );

    const names = [];
    let nameCursor = 288;
    for (let index = 0; index < 3; index += 1) {
      const record = 264 + index * 8;
      const offset = u32(bytes, record);
      const length = u16(bytes, record + 4);
      const scalars = u16(bytes, record + 6);
      assert(offset === nameCursor, `reference name ${index} offset`);
      const raw = bytes.subarray(offset, offset + length);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      assert([...text].length === scalars, `reference name ${index} scalars`);
      if (index > 0) {
        assert(Buffer.compare(names[index - 1].raw, raw) < 0, `reference name ${index} order`);
      }
      names.push({ offset, raw: Buffer.from(raw), text });
      nameCursor += length;
    }
    assert(nameCursor === 293, 'reference name-pool coverage');
    same(names.map(({ text }) => text), ['_id', 'n', 's'], 'reference canonical names');

    const fields = [];
    for (let index = 0; index < 3; index += 1) {
      const offset = 192 + index * 24;
      assert(u32(bytes, offset) === index, `reference field ${index} ID`);
      assert(
        u32(bytes, offset + 4) === names[index].offset &&
          u16(bytes, offset + 8) === names[index].raw.length,
        `reference field ${index} name tuple`,
      );
      assert(bytes[offset + 11] === 0, `reference field ${index} flags`);
      fields.push({
        name: names[index],
        tag: bytes[offset + 10],
        valueOffset: u32(bytes, offset + 12),
        valueLength: u32(bytes, offset + 16),
        presentation: u32(bytes, offset + 20),
      });
    }
    same(
      [...fields.map(({ presentation }) => presentation)].sort((left, right) => left - right),
      [0, 1, 2],
      'reference presentation permutation',
    );
    same(fields.map(({ tag }) => tag), [13, 1, 7], 'reference field tags');
    same(
      fields.map(({ valueOffset, valueLength }) => [valueOffset, valueLength]),
      [
        [296, 16],
        [312, 0],
        [312, 0],
      ],
      'reference field values',
    );
    same(
      [
        u32(bytes, 312),
        bytes[316],
        bytes[317],
        u16(bytes, 318),
        u32(bytes, 320),
        u32(bytes, 324),
        u32(bytes, 328),
        u32(bytes, 332),
        u32(bytes, 336),
        u32(bytes, 340),
      ],
      [0, 9, 0, 1, 192, 3, 3, 0xffffffff, 0xffffffff, 0],
      'reference root descriptor',
    );

    const entries = [];
    for (const field of fields) {
      const body = bytes.subarray(field.valueOffset, field.valueOffset + field.valueLength);
      entries.push(
        Buffer.concat([
          le32(field.name.raw.length),
          field.name.raw,
          blake3(frameNode(field.tag, body)),
        ]),
      );
    }
    const contentHash = blake3(frameNode(9, Buffer.concat([le32(fields.length), ...entries])));
    if (!contentHash.equals(bytes.subarray(footerOffset + 32, footerOffset + 64))) {
      return { stage: 'typed-content-hash', contentHash };
    }
    return { stage: 'accept', contentHash, fields };
  } catch (error) {
    return { stage: 'structural-canonicality', error };
  }
};

const requiredIntegrityHeadings = [
  '## Normative status and notation',
  '## Two mechanisms, two identities',
  '## CRC-32C parameters',
  '## Exact checksum coverage',
  '### Construction order and the apparent cycle',
  '## CRC-32C reference vectors',
  '## BLAKE3 algorithm assignment',
  '## Typed-content profile 1',
  '### Exact node frame',
  '### Noncontainer bodies',
  '### Object bodies',
  '### Array bodies',
  '### Bottom-up tree algorithm',
  '## What profile 1 excludes',
  '## Typed node vectors',
  '## Uncompressed integrity-reference envelopes',
  '## Corruption versus semantic-hash behavior',
  '## Validation order and exposure',
  '## Diagnostics and operational response',
  '## Performance and implementation boundary',
  '## Version, migration, and rollback',
  '## Subordinate ownership',
  '## Required later fixtures',
  '## References',
];
const requiredProse = [
  ['integrityDocument', 'CRC-32C diagnoses damage to the exact stored envelope bytes.'],
  ['integrityDocument', 'attacker able to replace a document can recompute both.'],
  ['integrityDocument', 'temporary[32:36] = 00 00 00 00'],
  ['integrityDocument', 'HDOC-TYPED-CONTENT-HASH-V1\\0'],
  ['integrityDocument', 'Presentation ordinal, physical `field_id`, name-pool record ID'],
  ['integrityDocument', 'The explicit index must equal its zero-based entry position.'],
  ['integrityDocument', 'registered nonsemantic extension bytes'],
  ['integrityDocument', 'not the immutable supported fixture files owned by `P03-016`'],
  ['specifications', 'HDoc 1.0 CRC-32C and Canonical Typed-Content Hashing'],
  ['study', 'algorithm/profile `1/1`'],
  ['adr', '- [x] `P03-006`: publish exact CRC coverage'],
  ['envelopeDocument', '[integrity registry](hdoc-v1-integrity.md)'],
  ['payloadDocument', '[profile-1 integrity framing](hdoc-v1-integrity.md)'],
  ['recordDocument', '[`P03-006`](hdoc-v1-integrity.md)'],
  ['tagDocument', '[profile-1 integrity registry](hdoc-v1-integrity.md)'],
  ['formatIndex', '[HDoc CRC and typed-content hashing](hdoc-v1-integrity.md)'],
  ['docsIndex', '[HDoc 1.0 integrity and typed hashing](formats/hdoc-v1-integrity.md)'],
];

const validateContract = (candidate) => {
  const integrity = JSON.parse(candidate.integritySource);
  const envelope = JSON.parse(candidate.envelopeSource);
  const payloads = JSON.parse(candidate.payloadSource);
  const records = JSON.parse(candidate.recordSource);
  const tags = JSON.parse(candidate.tagSource);
  const matrix = JSON.parse(candidate.matrix);
  const generationReport = JSON.parse(candidate.generationReport);

  assert(candidate.integritySource.endsWith('\n'), 'integrity registry terminal newline');
  assert(integrity.schema === 'helix.hdoc-integrity-registry/1', 'integrity schema');
  same(
    integrity.format,
    {
      name: 'HDoc',
      major_version: 1,
      minor_version: 0,
      checksum_field_offset: 32,
      checksum_field_bytes: 4,
      footer_hash_algorithm_id: 1,
      footer_hash_profile_id: 1,
      footer_hash_bytes: 32,
      complete_integrity_format: true,
      complete_hdoc_format: false,
      remaining_completion_owners: ['P03-007'],
    },
    'integrity format',
  );
  same(
    integrity.external_reference_snapshots.map(externalTuple),
    expectedExternalSnapshots,
    'external snapshot inventory',
  );
  same(
    integrity.crc32c,
    {
      name: 'CRC-32C',
      polynomial_normal_hex: '0x1edc6f41',
      polynomial_reflected_hex: '0x82f63b78',
      width_bits: 32,
      initial_register_hex: '0xffffffff',
      reflect_input: true,
      reflect_output: true,
      final_xor_hex: '0xffffffff',
      check_input_ascii: '123456789',
      check_value_hex: '0xe3069283',
      stored_encoding: 'u32-le',
      coverage_start: 0,
      coverage_end: 'header.total_length',
      zeroed_range: { offset: 32, length: 4 },
      includes: [
        'header',
        'section-directory',
        'stored-section-bytes',
        'all-padding',
        'footer-metadata',
        'footer-content-hash',
      ],
      excludes: ['bytes-outside-exact-HDoc-slice'],
      security_role: 'accidental-corruption-detection-not-authentication',
    },
    'CRC contract',
  );
  same(
    integrity.crc32c_vectors.map(({ id, crc_value_hex, stored_le_hex }) => [
      id,
      crc_value_hex,
      stored_le_hex,
    ]),
    expectedCrcVectors,
    'CRC vector inventory',
  );
  for (const vector of integrity.crc32c_vectors) {
    const input = crcInput(vector);
    assert(input.length === vector.input_length, `${vector.id}: CRC input length`);
    const actual = crc32c(input);
    assert(
      `0x${actual.toString(16).padStart(8, '0')}` === vector.crc_value_hex,
      `${vector.id}: CRC replay`,
    );
    assert(hex(le32(actual)) === vector.stored_le_hex, `${vector.id}: CRC endian replay`);
  }

  same(
    integrity.blake3_algorithm,
    {
      algorithm_id: 1,
      name: 'BLAKE3-256',
      mode: 'default-unkeyed-hash',
      output_bytes: 32,
      digest_storage: 'exact-output-octet-order',
      keyed: false,
      derive_key_mode: false,
      security_role: 'collision-resistant-content-identity-not-authentication',
    },
    'BLAKE3 assignment',
  );
  assert(
    integrity.blake3_official_vectors.input_generation === 'byte_at_index_i = i mod 251',
    'official BLAKE3 input generation',
  );
  same(
    integrity.blake3_official_vectors.cases.map(({ input_length, digest_hex }) => [
      input_length,
      digest_hex,
    ]),
    expectedOfficialDigests,
    'official BLAKE3 vector inventory',
  );
  for (const [length, expected] of expectedOfficialDigests) {
    const input = Buffer.from(Array.from({ length }, (_, index) => index % 251));
    assert(hex(blake3(input)) === expected, `official BLAKE3 replay ${length}`);
  }

  const profile = integrity.typed_content_profile;
  assert(profile.profile_id === 1, 'typed profile ID');
  assert(profile.name === 'hdoc-typed-content-tree-v1', 'typed profile name');
  assert(profile.root === 'canonical-root-object-node-digest', 'typed profile root');
  assert(profile.domain_ascii_escaped === 'HDOC-TYPED-CONTENT-HASH-V1\\0', 'typed domain text');
  assert(
    profile.domain_hex === '48444f432d54595045442d434f4e54454e542d484153482d563100',
    'typed domain hex',
  );
  const domain = Buffer.from(profile.domain_hex, 'hex');
  assert(domain.length === 27 && profile.domain_bytes === 27, 'typed domain bytes');
  assert(profile.node_header_bytes === 38, 'typed node header bytes');
  same(
    profile.node_frame,
    [
      { name: 'domain', encoding: 'exact-octets', bytes: 27 },
      { name: 'profile_id', encoding: 'u16-le', constant: 1 },
      {
        name: 'type_tag',
        encoding: 'u8',
        registry: 'docs/formats/hdoc-v1-type-tags.json',
      },
      {
        name: 'body_length',
        encoding: 'u64-le',
        meaning: 'exact-following-node-body-bytes',
      },
      { name: 'body', encoding: 'type-specific-exact-octets' },
    ],
    'typed node frame',
  );
  assert(
    profile.noncontainer_body === 'exact-P03-004-canonical-payload-bytes',
    'noncontainer body rule',
  );
  assert(
    profile.object_body.entry_order === 'strict-binary_utf8_v1-field-name-order' &&
      profile.object_body.presentation_metadata_included === false,
    'object body rule',
  );
  assert(
    profile.array_body.entry_order === 'dense-array-index-order' &&
      profile.array_body.entry[0].must_equal === 'zero-based-entry-position',
    'array body rule',
  );
  same(
    profile.excludes,
    [
      'object-presentation-ordinal',
      'physical-field-or-container-id',
      'physical-offset-or-length',
      'section-order-or-padding',
      'compression-bytes-or-codec-id',
      'path-dictionary-numeric-id',
      'nonsemantic-extension-bytes',
      'crc32c-and-footer-metadata',
    ],
    'typed exclusion inventory',
  );
  assert(
    profile.semantic_extension_rule === 'registered-required-logical-contribution-only',
    'semantic extension rule',
  );
  assert(
    profile.collision_rule ===
      'digest-equality-never-substitutes-for-canonical-typed-equality',
    'collision rule',
  );
  const frameNode = (tag, body) =>
    Buffer.concat([domain, le16(1), Buffer.from([tag]), le64(body.length), body]);
  same(
    integrity.typed_node_vectors.map(({ id, kind, type_tag }) => [id, kind, type_tag]),
    expectedNodeInventory,
    'typed node inventory',
  );
  const vectorById = new Map(integrity.typed_node_vectors.map((vector) => [vector.id, vector]));
  const vectorIdByDigest = new Map(
    integrity.typed_node_vectors.map((vector) => [vector.digest_hex, vector.id]),
  );
  const payloadByTag = new Map(payloads.payloads.map((payload) => [payload.tag, payload]));
  const knownTags = new Set(tags.tags.map((tag) => tag.tag));
  assert(vectorById.size === 23 && vectorIdByDigest.size === 23, 'typed node uniqueness');
  for (const vector of integrity.typed_node_vectors) {
    const body = Buffer.from(vector.body_hex, 'hex');
    assert(hex(body) === vector.body_hex, `${vector.id}: exact body hex`);
    const frame = frameNode(vector.type_tag, body);
    assert(knownTags.has(vector.type_tag), `${vector.id}: registered tag`);
    assert(frame.length === vector.frame_bytes, `${vector.id}: frame length`);
    assert(u64(frame, 30) === BigInt(body.length), `${vector.id}: framed body length`);
    if (vector.kind === 'noncontainer') {
      assert(vector.type_tag !== 9 && vector.type_tag !== 10, `${vector.id}: noncontainer tag`);
      const payload = payloadByTag.get(vector.type_tag);
      assert(payload, `${vector.id}: payload grammar`);
      if (payload.length.kind === 'fixed') {
        assert(body.length === payload.length.bytes, `${vector.id}: fixed payload length`);
      } else if (payload.length.kind === 'dimensioned') {
        assert(
          body.length >= payload.length.minimum_bytes && body.length <= payload.length.maximum_bytes,
          `${vector.id}: dimensioned payload bounds`,
        );
        assert(
          body.length === payload.length.prefix_bytes + u32(body, 0) * payload.length.element_bytes,
          `${vector.id}: dimensioned payload equation`,
        );
      }
    } else if (vector.kind === 'object') {
      assert(vector.type_tag === 9, `${vector.id}: object tag`);
      const count = u32(body, 0);
      let cursor = 4;
      let priorName = null;
      for (let index = 0; index < count; index += 1) {
        assert(cursor + 4 <= body.length, `${vector.id}: object name-length bounds`);
        const length = u32(body, cursor);
        cursor += 4;
        assert(length > 0 && cursor + length + 32 <= body.length, `${vector.id}: object entry bounds`);
        const name = body.subarray(cursor, cursor + length);
        new TextDecoder('utf-8', { fatal: true }).decode(name);
        if (priorName) assert(Buffer.compare(priorName, name) < 0, `${vector.id}: object order`);
        priorName = name;
        cursor += length;
        assert(
          vectorIdByDigest.has(hex(body.subarray(cursor, cursor + 32))),
          `${vector.id}: object child digest`,
        );
        cursor += 32;
      }
      assert(cursor === body.length, `${vector.id}: object body coverage`);
    } else if (vector.kind === 'array') {
      assert(vector.type_tag === 10, `${vector.id}: array tag`);
      const count = u32(body, 0);
      assert(body.length === 4 + count * 36, `${vector.id}: array body equation`);
      for (let index = 0; index < count; index += 1) {
        const cursor = 4 + index * 36;
        assert(u32(body, cursor) === index, `${vector.id}: array dense index`);
        assert(
          vectorIdByDigest.has(hex(body.subarray(cursor + 4, cursor + 36))),
          `${vector.id}: array child digest`,
        );
      }
    } else {
      assert(false, `${vector.id}: node kind`);
    }
    assert(hex(blake3(frame)) === vector.digest_hex, `${vector.id}: typed digest replay`);
  }
  assert(
    vectorById.get('null').digest_hex !== vectorById.get('string-empty').digest_hex,
    'null/empty-string distinction',
  );
  assert(
    vectorById.get('int32-one').digest_hex !== vectorById.get('int64-one').digest_hex,
    'int32/int64 distinction',
  );
  assert(
    vectorById.get('float64-positive-zero').digest_hex !==
      vectorById.get('float64-negative-zero').digest_hex,
    'float zero-sign distinction',
  );
  assert(
    vectorById.get('array-null-true').digest_hex !== vectorById.get('array-true-null').digest_hex,
    'array-order distinction',
  );

  assert(
    integrity.uncompressed_integrity_reference_vectors.length === 2,
    'reference envelope inventory',
  );
  const references = new Map();
  for (const vector of integrity.uncompressed_integrity_reference_vectors) {
    const bytes = Buffer.from(vector.hdoc_hex, 'hex');
    references.set(vector.id, bytes);
    assert(bytes.length === vector.total_length, `${vector.id}: reference total length`);
    assert(sha256(bytes) === vector.artifact_sha256, `${vector.id}: reference SHA-256`);
    const crc = computeStoredCrc(bytes);
    assert(
      `0x${crc.toString(16).padStart(8, '0')}` === vector.crc32c_value_hex,
      `${vector.id}: reference CRC`,
    );
    assert(
      hex(bytes.subarray(32, 36)) === vector.crc32c_stored_le_hex,
      `${vector.id}: reference stored CRC`,
    );
    const result = parseReferenceHDoc(bytes, frameNode);
    assert(result.stage === 'accept', `${vector.id}: reference ${result.stage}`);
    assert(hex(result.contentHash) === vector.content_hash_hex, `${vector.id}: reference content hash`);
  }
  const first = references.get('root-scalars-presentation-s-id-n');
  const second = references.get('root-scalars-presentation-id-n-s');
  assert(first && second && !first.equals(second), 'reference presentation pair');
  same(
    Array.from({ length: first.length }, (_, index) => index).filter(
      (index) => first[index] !== second[index],
    ),
    [32, 33, 34, 35, 212, 236, 260],
    'presentation-only byte differences',
  );
  const firstResult = parseReferenceHDoc(first, frameNode);
  const secondResult = parseReferenceHDoc(second, frameNode);
  const presentation = (result) =>
    result.fields
      .map((field) => field)
      .sort((left, right) => left.presentation - right.presentation)
      .map(({ name }) => name.text);
  same(presentation(firstResult), ['s', '_id', 'n'], 'first presentation order');
  same(presentation(secondResult), ['_id', 'n', 's'], 'second presentation order');
  assert(
    hex(firstResult.contentHash) === hex(secondResult.contentHash),
    'presentation typed-hash equality',
  );

  const storedFlip = Buffer.from(first);
  storedFlip[300] ^= 1;
  assert(
    parseReferenceHDoc(storedFlip, frameNode).stage === 'stored-crc32c',
    'stored flip classification',
  );
  const semanticFlip = Buffer.from(first);
  semanticFlip[296] ^= 1;
  writeStoredCrc(semanticFlip);
  const semanticResult = parseReferenceHDoc(semanticFlip, frameNode);
  assert(semanticResult.stage === 'typed-content-hash', 'semantic flip classification');
  const footerFlip = Buffer.from(first);
  footerFlip[376] ^= 1;
  writeStoredCrc(footerFlip);
  assert(
    parseReferenceHDoc(footerFlip, frameNode).stage === 'typed-content-hash',
    'footer flip classification',
  );
  const paddingFlip = Buffer.from(first);
  paddingFlip[293] = 1;
  writeStoredCrc(paddingFlip);
  assert(
    parseReferenceHDoc(paddingFlip, frameNode).stage === 'structural-canonicality',
    'padding flip classification',
  );
  const attackerRewrite = Buffer.from(first);
  attackerRewrite[296] ^= 1;
  semanticResult.contentHash.copy(attackerRewrite, 376);
  writeStoredCrc(attackerRewrite);
  assert(
    parseReferenceHDoc(attackerRewrite, frameNode).stage === 'accept',
    'integrity non-authentication replay',
  );
  same(
    integrity.corruption_and_identity_cases.map(
      ({ id, expected_result, check_class, content_hash_evaluated }) => [
        id,
        expected_result,
        check_class ?? null,
        content_hash_evaluated ?? null,
      ],
    ),
    [
      ['stored-byte-flip-without-crc-repair', 'reject', 'stored-crc32c', false],
      ['semantic-payload-flip-with-crc-repair', 'reject', 'typed-content-hash', null],
      ['footer-hash-flip-with-crc-repair', 'reject', 'typed-content-hash', null],
      ['padding-nonzero-with-crc-repair', 'reject', 'structural-canonicality', null],
      ['presentation-permutation-reencoded', 'accept-both-after-complete-format-gate', null, null],
      ['attacker-rewrites-bytes-crc-and-unkeyed-hash', 'integrity-fields-can-pass', null, null],
    ],
    'corruption case inventory',
  );
  same(
    integrity.validation_order,
    [
      'validate-minimal-header-length-version-and-total-length-bounds-without-trusting-offsets',
      'recompute-crc32c-over-exact-stored-slice-with-checksum-field-zero-and-compare',
      'validate-directory-footer-profile-structure-canonicality-payloads-and-limits',
      'perform-P03-007-bounded-decompression-where-required-before-logical-hashing',
      'reconstruct-canonical-typed-tree-bottom-up-and-compare-root-BLAKE3-256',
      'expose-owned-or-borrowed-values-only-after-all-prior-stages-pass',
    ],
    'validation order',
  );
  same(
    integrity.deferrals,
    [
      { owner: 'P03-007', scope: 'compressed-section-codecs-blocks-and-stored-byte-vectors' },
      {
        owner: 'P03-008-P03-009',
        scope: 'production-encoder-decoder-and-integrity-implementation',
      },
      {
        owner: 'P03-016',
        scope: 'immutable-complete-positive-and-malformed-HDoc-fixture-files',
      },
      {
        owner: 'P03-017-P03-019',
        scope: 'independent-cross-language-property-fuzz-and-corruption-replay',
      },
    ],
    'deferral inventory',
  );

  assert(
    envelope.format.integrity_registry === 'docs/formats/hdoc-v1-integrity.json' &&
      envelope.format.complete_byte_format === false &&
      envelope.format.completion_gate === 'P03-007',
    'envelope integrity binding',
  );
  assert(
    envelope.footer.hash_algorithm_id === 1 &&
      envelope.footer.hash_profile_id === 1 &&
      envelope.footer.hash_profile_status === 'assigned-hdoc-typed-content-tree-v1',
    'envelope footer binding',
  );
  const envelopeProfileField = envelope.footer.fields.find(
    ({ name }) => name === 'hash_profile_id',
  );
  assert(
    envelopeProfileField.constant === 1 &&
      envelopeProfileField.valid_document === true &&
      envelopeProfileField.assignment_owner === 'P03-006',
    'envelope profile field binding',
  );
  assert(
    payloads.format.integrity_registry === 'docs/formats/hdoc-v1-integrity.json' &&
      payloads.format.complete_integrity_format === true &&
      payloads.format.complete_hdoc_format === false,
    'payload integrity binding',
  );
  assert(
    tags.format.integrity_registry === 'docs/formats/hdoc-v1-integrity.json' &&
      tags.format.complete_integrity_format === true,
    'tag integrity binding',
  );
  assert(
    records.format.integrity_registry === 'docs/formats/hdoc-v1-integrity.json' &&
      records.format.complete_integrity_format === true &&
      records.format.complete_hdoc_format === false,
    'record integrity binding',
  );
  same(records.format.remaining_completion_owners, ['P03-007'], 'record completion owner');
  assert(
    records.structural_examples
      .filter(({ id }) => id !== 'empty-root-structure')
      .every(
        ({ semantic_status }) =>
          semantic_status === 'structurally-and-logically-valid-under-profile-1',
      ),
    'record vector profile status',
  );
  assert(
    records.deferrals.every(({ owner }) => owner !== 'P03-006'),
    'record integrity deferral removal',
  );

  for (const heading of requiredIntegrityHeadings) {
    assert(candidate.integrityDocument.includes(`${heading}\n`), `integrity heading ${heading}`);
  }
  for (const [field, marker] of requiredProse) {
    assert(candidate[field].includes(marker), `${field} marker ${marker}`);
  }
  assert(
    !candidate.integrityDocument.includes('authenticator.\n\n`P03-007` still owns') ||
      candidate.integrityDocument.includes('It does not make either mechanism an authenticator.'),
    'authentication boundary prose',
  );
  assert(candidate.plan.includes('- [ ] **P03-006**'), 'source plan must remain unchecked');

  assert(
    matrix.inputs.specifications.sha256 === sha256(Buffer.from(candidate.specifications)),
    'generated matrix specification hash',
  );
  assert(
    matrix.verdict === 'pass' && matrix.counts.failed === 0 && matrix.counts.skipped === 0,
    'generated matrix verdict',
  );
  const reportArtifacts = Object.fromEntries(
    generationReport.generators.flatMap(({ artifacts }) =>
      artifacts.map((artifact) => [artifact.path, artifact]),
    ),
  );
  assert(
    reportArtifacts['compatibility/v1/matrix-v1.json'].sha256 ===
      sha256(Buffer.from(candidate.matrix)),
    'generation report matrix hash',
  );
  assert(
    reportArtifacts['docs/compatibility/v1-semantic-compatibility-matrix.md'].sha256 ===
      sha256(Buffer.from(candidate.renderedMatrix)),
    'generation report rendered matrix hash',
  );
  assert(generationReport.verdict === 'pass', 'generation report verdict');

  return {
    crcVectors: integrity.crc32c_vectors.length,
    blakeVectors: integrity.blake3_official_vectors.cases.length,
    typedNodes: integrity.typed_node_vectors.length,
    referenceDocuments: references.size,
    referenceBytes: [...references.values()].reduce((sum, bytes) => sum + bytes.length, 0),
    corruptionCases: integrity.corruption_and_identity_cases.length,
    headings: requiredIntegrityHeadings.length,
    externalSnapshots: integrity.external_reference_snapshots.length,
  };
};

const stats = validateContract(snapshot);
same(
  stats,
  {
    crcVectors: manifest.verification.crc32c_vectors,
    blakeVectors: manifest.verification.official_blake3_vectors,
    typedNodes: manifest.verification.typed_node_vectors,
    referenceDocuments: manifest.verification.integrity_reference_documents,
    referenceBytes: manifest.verification.integrity_reference_bytes,
    corruptionCases: manifest.verification.corruption_identity_cases,
    headings: manifest.verification.integrity_document_headings,
    externalSnapshots: manifest.verification.external_reference_snapshots,
  },
  'verification summary mismatch',
);
assert(
  manifest.verification.source_time_blake3_implementations === 3,
  'source-time BLAKE3 implementation count mismatch',
);

const cloneSnapshot = () => ({ ...snapshot });
const mutateJson = (field, mutate) => (candidate) => {
  const value = JSON.parse(candidate[field]);
  mutate(value);
  candidate[field] = jsonBytes(value).toString('utf8');
};
const replaceText = (field, from, to) => (candidate) => {
  assert(candidate[field].includes(from), `canary source marker missing: ${from}`);
  candidate[field] = candidate[field].replace(from, to);
};
const canaries = [];
const addJsonCanary = (label, field, mutate, reason) =>
  canaries.push([label, mutateJson(field, mutate), reason]);
const addTextCanary = (label, field, from, to, reason) =>
  canaries.push([label, replaceText(field, from, to), reason]);

addJsonCanary('schema', 'integritySource', (value) => (value.schema = 'bad'), 'integrity schema');
for (const [name, replacement] of [
  ['major_version', 2],
  ['minor_version', 1],
  ['checksum_field_offset', 31],
  ['checksum_field_bytes', 8],
  ['footer_hash_algorithm_id', 2],
  ['footer_hash_profile_id', 0],
  ['footer_hash_bytes', 64],
  ['complete_integrity_format', false],
  ['complete_hdoc_format', true],
]) {
  addJsonCanary(
    `format-${name}`,
    'integritySource',
    (value) => (value.format[name] = replacement),
    'integrity format',
  );
}
addJsonCanary(
  'format-owner',
  'integritySource',
  (value) => value.format.remaining_completion_owners.push('P03-006'),
  'integrity format',
);
for (const [name, replacement] of [
  ['polynomial_normal_hex', '0x04c11db7'],
  ['polynomial_reflected_hex', '0xedb88320'],
  ['width_bits', 64],
  ['initial_register_hex', '0x00000000'],
  ['reflect_input', false],
  ['reflect_output', false],
  ['final_xor_hex', '0x00000000'],
  ['stored_encoding', 'u32-be'],
  ['coverage_end', 'footer_offset'],
  ['security_role', 'authentication'],
]) {
  addJsonCanary(
    `crc-${name}`,
    'integritySource',
    (value) => (value.crc32c[name] = replacement),
    'CRC contract',
  );
}
addJsonCanary(
  'crc-zero-range',
  'integritySource',
  (value) => (value.crc32c.zeroed_range.offset = 33),
  'CRC contract',
);
addJsonCanary(
  'crc-coverage-inventory',
  'integritySource',
  (value) => value.crc32c.includes.pop(),
  'CRC contract',
);
for (let index = 0; index < expectedCrcVectors.length; index += 1) {
  addJsonCanary(
    `crc-vector-${index}`,
    'integritySource',
    (value) => (value.crc32c_vectors[index].crc_value_hex = '0x00000000'),
    'CRC vector inventory',
  );
}
for (const [name, replacement] of [
  ['algorithm_id', 2],
  ['mode', 'keyed'],
  ['output_bytes', 64],
  ['digest_storage', 'reversed'],
  ['keyed', true],
  ['derive_key_mode', true],
  ['security_role', 'authentication'],
]) {
  addJsonCanary(
    `blake3-${name}`,
    'integritySource',
    (value) => (value.blake3_algorithm[name] = replacement),
    'BLAKE3 assignment',
  );
}
for (let index = 0; index < expectedOfficialDigests.length; index += 1) {
  addJsonCanary(
    `official-vector-${index}`,
    'integritySource',
    (value) => (value.blake3_official_vectors.cases[index].digest_hex = '00'.repeat(32)),
    'official BLAKE3 vector inventory',
  );
}
for (const [name, replacement, reason] of [
  ['profile_id', 2, 'typed profile ID'],
  ['name', 'bad', 'typed profile name'],
  ['root', 'stored-bytes', 'typed profile root'],
  ['domain_ascii_escaped', 'bad', 'typed domain text'],
  ['domain_hex', '00', 'typed domain hex'],
  ['domain_bytes', 26, 'typed domain bytes'],
  ['node_header_bytes', 37, 'typed node header bytes'],
  ['noncontainer_body', 'normalized', 'noncontainer body rule'],
  ['semantic_extension_rule', 'excluded', 'semantic extension rule'],
  ['collision_rule', 'digest-is-equality', 'collision rule'],
]) {
  addJsonCanary(
    `profile-${name}`,
    'integritySource',
    (value) => (value.typed_content_profile[name] = replacement),
    reason,
  );
}
addJsonCanary(
  'node-frame-order',
  'integritySource',
  (value) => value.typed_content_profile.node_frame.reverse(),
  'typed node frame',
);
addJsonCanary(
  'object-presentation-included',
  'integritySource',
  (value) => (value.typed_content_profile.object_body.presentation_metadata_included = true),
  'object body rule',
);
addJsonCanary(
  'array-index-rule',
  'integritySource',
  (value) => (value.typed_content_profile.array_body.entry[0].must_equal = 'optional'),
  'array body rule',
);
addJsonCanary(
  'profile-exclusion',
  'integritySource',
  (value) => value.typed_content_profile.excludes.pop(),
  'typed exclusion inventory',
);
addJsonCanary(
  'node-inventory',
  'integritySource',
  (value) => value.typed_node_vectors.pop(),
  'typed node inventory',
);
addJsonCanary(
  'node-body',
  'integritySource',
  (value) => (value.typed_node_vectors[1].body_hex = '01'),
  'bool-false: typed digest replay',
);
addJsonCanary(
  'node-digest',
  'integritySource',
  (value) => (value.typed_node_vectors[0].digest_hex = '00'.repeat(32)),
  'null: typed digest replay',
);
addJsonCanary(
  'node-frame-length',
  'integritySource',
  (value) => (value.typed_node_vectors[0].frame_bytes = 39),
  'null: frame length',
);
addJsonCanary(
  'node-object-order',
  'integritySource',
  (value) => {
    const vector = value.typed_node_vectors.find(({ id }) => id === 'object-a-true-b-null');
    vector.body_hex = `020000000100000062${vector.body_hex.slice(18)}`;
  },
  'object-a-true-b-null: object order',
);
addJsonCanary(
  'node-array-index',
  'integritySource',
  (value) => {
    const vector = value.typed_node_vectors.find(({ id }) => id === 'array-null-true');
    vector.body_hex = `${vector.body_hex.slice(0, 8)}01000000${vector.body_hex.slice(16)}`;
  },
  'array-null-true: array dense index',
);
addJsonCanary(
  'reference-inventory',
  'integritySource',
  (value) => value.uncompressed_integrity_reference_vectors.pop(),
  'reference envelope inventory',
);
for (const [name, replacement, reason] of [
  ['total_length', 407, 'reference total length'],
  ['artifact_sha256', '00'.repeat(32), 'reference SHA-256'],
  ['crc32c_value_hex', '0x00000000', 'reference CRC'],
  ['crc32c_stored_le_hex', '00000000', 'reference stored CRC'],
  ['content_hash_hex', '00'.repeat(32), 'reference content hash'],
]) {
  addJsonCanary(
    `reference-${name}`,
    'integritySource',
    (value) => (value.uncompressed_integrity_reference_vectors[0][name] = replacement),
    reason,
  );
}
addJsonCanary(
  'reference-hex',
  'integritySource',
  (value) => {
    const vector = value.uncompressed_integrity_reference_vectors[0];
    vector.hdoc_hex = `${vector.hdoc_hex.slice(0, 600)}01${vector.hdoc_hex.slice(602)}`;
    vector.artifact_sha256 = sha256(Buffer.from(vector.hdoc_hex, 'hex'));
  },
  'reference CRC',
);
addJsonCanary(
  'corruption-inventory',
  'integritySource',
  (value) => (value.corruption_and_identity_cases[0].check_class = 'typed-content-hash'),
  'corruption case inventory',
);
addJsonCanary(
  'validation-order',
  'integritySource',
  (value) => value.validation_order.reverse(),
  'validation order',
);
addJsonCanary(
  'deferrals',
  'integritySource',
  (value) => value.deferrals.push({ owner: 'P03-006', scope: 'unfinished' }),
  'deferral inventory',
);
addJsonCanary(
  'external-snapshot',
  'integritySource',
  (value) => (value.external_reference_snapshots[0].sha256 = '00'.repeat(32)),
  'external snapshot inventory',
);
addJsonCanary(
  'envelope-registry',
  'envelopeSource',
  (value) => (value.format.integrity_registry = 'bad'),
  'envelope integrity binding',
);
addJsonCanary(
  'envelope-profile',
  'envelopeSource',
  (value) => (value.footer.hash_profile_id = 0),
  'envelope footer binding',
);
addJsonCanary(
  'envelope-profile-field',
  'envelopeSource',
  (value) => {
    value.footer.fields.find(({ name }) => name === 'hash_profile_id').valid_document = false;
  },
  'envelope profile field binding',
);
addJsonCanary(
  'payload-binding',
  'payloadSource',
  (value) => (value.format.complete_integrity_format = false),
  'payload integrity binding',
);
addJsonCanary(
  'tag-binding',
  'tagSource',
  (value) => (value.format.integrity_registry = 'bad'),
  'tag integrity binding',
);
addJsonCanary(
  'record-binding',
  'recordSource',
  (value) => (value.format.complete_integrity_format = false),
  'record integrity binding',
);
addJsonCanary(
  'record-owner',
  'recordSource',
  (value) => value.format.remaining_completion_owners.push('P03-006'),
  'record completion owner',
);
addJsonCanary(
  'record-status',
  'recordSource',
  (value) => (value.structural_examples[1].semantic_status = 'before-hash'),
  'record vector profile status',
);
addJsonCanary(
  'record-deferral',
  'recordSource',
  (value) => value.deferrals.push({ owner: 'P03-006', scope: 'unfinished' }),
  'record integrity deferral removal',
);
addTextCanary(
  'integrity-heading',
  'integrityDocument',
  '## Exact checksum coverage',
  '## Exact checksum area',
  'integrity heading ## Exact checksum coverage',
);
addTextCanary(
  'authentication-prose',
  'integrityDocument',
  'attacker able to replace a document can recompute both.',
  'Both mechanisms authenticate an attacker.',
  'integrityDocument marker',
);
addTextCanary(
  'specification-link',
  'specifications',
  'HDoc 1.0 CRC-32C and Canonical Typed-Content Hashing',
  'HDoc hashing TBD',
  'specifications marker',
);
addTextCanary(
  'study-profile',
  'study',
  'algorithm/profile `1/1`',
  'unknown-profile',
  'study marker',
);
addTextCanary(
  'adr-check',
  'adr',
  '- [x] `P03-006`: publish exact CRC coverage',
  '- [ ] `P03-006`: publish exact CRC coverage',
  'adr marker',
);
addTextCanary(
  'format-index',
  'formatIndex',
  '[HDoc CRC and typed-content hashing](hdoc-v1-integrity.md)',
  'HDoc integrity unpublished',
  'formatIndex marker',
);
addJsonCanary(
  'matrix-specification-hash',
  'matrix',
  (value) => (value.inputs.specifications.sha256 = '00'.repeat(32)),
  'generated matrix specification hash',
);
addJsonCanary(
  'matrix-verdict',
  'matrix',
  (value) => (value.verdict = 'fail'),
  'generated matrix verdict',
);
addJsonCanary(
  'report-matrix-hash',
  'generationReport',
  (value) => {
    value.generators
      .flatMap(({ artifacts }) => artifacts)
      .find(({ path: artifactPath }) => artifactPath === 'compatibility/v1/matrix-v1.json').sha256 =
      '00'.repeat(32);
  },
  'generation report matrix hash',
);
addJsonCanary(
  'report-rendered-hash',
  'generationReport',
  (value) => {
    value.generators
      .flatMap(({ artifacts }) => artifacts)
      .find(
        ({ path: artifactPath }) =>
          artifactPath === 'docs/compatibility/v1-semantic-compatibility-matrix.md',
      ).sha256 = '00'.repeat(32);
  },
  'generation report rendered matrix hash',
);
addJsonCanary(
  'report-verdict',
  'generationReport',
  (value) => (value.verdict = 'fail'),
  'generation report verdict',
);

const expectRejection = (label, mutate, reason) => {
  const candidate = cloneSnapshot();
  mutate(candidate);
  let failure;
  try {
    validateContract(candidate);
  } catch (error) {
    failure = error;
  }
  assert(failure, `${label}: mutation was accepted`);
  assert(
    failure.message.includes(reason),
    `${label}: expected ${reason}, observed ${failure.message}`,
  );
};
for (const [label, mutate, reason] of canaries) expectRejection(label, mutate, reason);
assert(canaries.length === manifest.verification.mutation_canaries, 'mutation-canary count mismatch');

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', commitArgument])
  .trim()
  .split('\n')
  .filter(Boolean);
const markdownFiles = trackedFiles.filter((file) => file.endsWith('.md'));
let localLinks = 0;
for (const file of markdownFiles) {
  const source = showText(file);
  assert(source.endsWith('\n'), `${file}: missing terminal newline`);
  for (const [index, line] of source.split('\n').entries()) {
    assert(!/[ \t]+$/.test(line), `${file}:${index + 1}: trailing whitespace`);
  }
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let rawTarget = match[1].split('#')[0];
    if (!rawTarget || /^(https?:|mailto:)/.test(rawTarget)) continue;
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) rawTarget = rawTarget.slice(1, -1);
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)),
    );
    assert(target !== '..' && !target.startsWith('../'), `${file}: link escapes repository`);
    gitText(['cat-file', '-e', `${commitArgument}:${target}`]);
    localLinks += 1;
  }
}
assert(markdownFiles.length === manifest.verification.markdown_files, 'Markdown count mismatch');
assert(localLinks === manifest.verification.local_links, 'local-link count mismatch');
assert(
  snapshot.integrityDocument.split('\n').length - 1 ===
    manifest.verification.integrity_document_lines,
  'integrity document line count mismatch',
);
assert(
  snapshot.integritySource.split('\n').length - 1 === manifest.verification.registry_lines,
  'integrity registry line count mismatch',
);
assert(
  Buffer.byteLength(snapshot.integritySource) === manifest.verification.registry_bytes,
  'integrity registry byte count mismatch',
);

const matrixReplayPaths = [
  'Specifications.md',
  'compatibility/v1/generate-matrix.mjs',
  'compatibility/v1/matrix-v1.json',
  'docs/compatibility/v1-semantic-compatibility-matrix.md',
  ...Object.values(JSON.parse(snapshot.matrix).inputs).map(({ path: inputPath }) => inputPath),
  ...trackedFiles.filter((file) => file.startsWith('reference/semantic-oracle/')),
];
const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p03-006-'));
try {
  for (const file of new Set(matrixReplayPaths)) {
    const destination = path.join(temporary, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, showBytes(file));
  }
  const generatorOutput = execFileSync(
    process.execPath,
    ['compatibility/v1/generate-matrix.mjs', '--check'],
    { cwd: temporary, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  assert(
    generatorOutput.includes('PASS semantic compatibility matrix: 263 native rows'),
    'isolated matrix replay did not pass',
  );
  assert(
    generatorOutput.includes('PASS matrix inputs: 9 hash-bound artifacts'),
    'isolated matrix input count mismatch',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact ${manifest.source_artifacts.length}-artifact P03-006 scope at ${commitArgument}`);
console.log(
  `PASS algorithms: ${stats.crcVectors} CRC-32C and ${stats.blakeVectors} official BLAKE3 vectors`,
);
console.log(
  `PASS typed tree: ${stats.typedNodes} nodes with exact domain, frames, canonical object names, and dense array indices`,
);
console.log(
  `PASS envelopes: ${stats.referenceDocuments} documents/${stats.referenceBytes} bytes and ${stats.corruptionCases} corruption/identity cases`,
);
console.log(
  `PASS external provenance: ${stats.externalSnapshots} hash-pinned source snapshots; replay is network-free`,
);
console.log(`PASS mutation canaries: ${canaries.length}/${canaries.length} intended rejections`);
console.log(`PASS documentation: ${markdownFiles.length} Markdown files and ${localLinks} local links`);
console.log('PASS generated authority: 263-row matrix, rendered document, and fixture-generation report');
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

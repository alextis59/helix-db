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
const u16 = (bytes, offset) => bytes.readUInt16LE(offset);
const u32 = (bytes, offset) => bytes.readUInt32LE(offset);
const u64 = (bytes, offset) => bytes.readBigUInt64LE(offset);
const align8 = (value) => (value + 7) & ~7;
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

assert(commitArgument, 'usage: node evidence/phase-03/P03-007/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-007', 'evidence task mismatch');
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
  compressionSource: sourceText('docs/formats/hdoc-v1-compression.json'),
  compressionDocument: sourceText('docs/formats/hdoc-v1-compression.md'),
  envelopeSource: sourceText('docs/formats/hdoc-v1-envelope.json'),
  envelopeDocument: sourceText('docs/formats/hdoc-v1.md'),
  payloadSource: sourceText('docs/formats/hdoc-v1-payloads.json'),
  payloadDocument: sourceText('docs/formats/hdoc-v1-payloads.md'),
  recordSource: sourceText('docs/formats/hdoc-v1-records.json'),
  recordDocument: sourceText('docs/formats/hdoc-v1-records.md'),
  integritySource: sourceText('docs/formats/hdoc-v1-integrity.json'),
  integrityDocument: sourceText('docs/formats/hdoc-v1-integrity.md'),
  tagSource: sourceText('docs/formats/hdoc-v1-type-tags.json'),
  tagDocument: sourceText('docs/formats/hdoc-v1-type-tags.md'),
  specifications: sourceText('Specifications.md'),
  study: sourceText('Study.md'),
  adr: sourceText('docs/adr/0012-use-bounded-little-endian-hdoc-v1.md'),
  dependencyReporting: sourceText('docs/architecture/dependency-security-reporting.md'),
  licensing: sourceText('docs/governance/licensing.md'),
  decisionOwners: sourceText('docs/governance/decision-owners.md'),
  formatIndex: sourceText('docs/formats/README.md'),
  docsIndex: sourceText('docs/README.md'),
  matrix: sourceText('compatibility/v1/matrix-v1.json'),
  renderedMatrix: sourceText('docs/compatibility/v1-semantic-compatibility-matrix.md'),
  generationReport: sourceText('fixtures/generation/report-v1.json'),
  cargoManifest: showText('Cargo.toml'),
  cargoLock: showText('Cargo.lock'),
  dependencyPolicy: showText('tests/toolchain/dependency-policy.json'),
  plan: showText('ImplementationPlan.md'),
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
const blakeCompress = (cv, words, counter, blockLength, flags) => {
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
  blakeCompress(
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
  const words = blakeCompress(
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
const computeStoredCrc = (bytes) => {
  const copy = Buffer.from(bytes);
  copy.fill(0, 32, 36);
  return crc32c(copy);
};
const writeStoredCrc = (bytes) => {
  bytes.writeUInt32LE(0, 32);
  bytes.writeUInt32LE(crc32c(bytes), 32);
};

const HASH_DOMAIN = Buffer.from('48444f432d54595045442d434f4e54454e542d484153482d563100', 'hex');
const frameNode = (tag, body) =>
  Buffer.concat([HASH_DOMAIN, le16(1), Buffer.from([tag]), le64(body.length), body]);
const nodeHash = (tag, body) => blake3(frameNode(tag, body));
const largeStringRootHash = () => {
  const fields = [
    { name: Buffer.from('_id'), tag: 13, body: Buffer.alloc(16) },
    { name: Buffer.from('pad'), tag: 7, body: Buffer.alloc(4096, 0x41) },
  ];
  const entries = fields
    .sort((left, right) => Buffer.compare(left.name, right.name))
    .map(({ name, tag, body }) => Buffer.concat([le32(name.length), name, nodeHash(tag, body)]));
  return nodeHash(9, Buffer.concat([le32(entries.length), ...entries]));
};

const splitmixBytes = (length) => {
  let state = 0x48444f43434d5031n;
  const output = Buffer.alloc(length);
  let cursor = 0;
  while (cursor < length) {
    state = BigInt.asUintN(64, state + 0x9e3779b97f4a7c15n);
    let value = state;
    value = BigInt.asUintN(64, (value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n);
    value = BigInt.asUintN(64, (value ^ (value >> 27n)) * 0x94d049bb133111ebn);
    value ^= value >> 31n;
    for (let index = 0; index < 8 && cursor < length; index += 1) {
      output[cursor] = Number((value >> BigInt(index * 8)) & 0xffn);
      cursor += 1;
    }
  }
  return output;
};

const rejection = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};
const expectRejection = (code, callback, label) => {
  try {
    callback();
  } catch (error) {
    assert(error.code === code, `${label}: actual=${error.code} expected=${code}: ${error.message}`);
    return;
  }
  throw new Error(`${label}: expected ${code}`);
};

const decodeLz4 = (input, expectedLength) => {
  const output = Buffer.alloc(expectedLength);
  let source = 0;
  let target = 0;
  const extended = (base) => {
    let length = base;
    if (base === 15) {
      while (true) {
        if (source >= input.length) rejection('BLOCK', 'truncated extended length');
        const next = input[source++];
        length += next;
        if (next !== 255) break;
      }
    }
    return length;
  };
  while (source < input.length) {
    const token = input[source++];
    const literals = extended(token >>> 4);
    if (source + literals > input.length) rejection('BLOCK', 'literal input overrun');
    if (target + literals > output.length) rejection('BLOCK', 'literal output overrun');
    input.copy(output, target, source, source + literals);
    source += literals;
    target += literals;
    if (source === input.length) break;
    if (source + 2 > input.length) rejection('BLOCK', 'truncated match offset');
    const offset = input.readUInt16LE(source);
    source += 2;
    if (offset === 0 || offset > target) rejection('BLOCK', 'invalid match offset');
    const match = extended(token & 15) + 4;
    if (target + match > output.length) rejection('BLOCK', 'match output overrun');
    for (let index = 0; index < match; index += 1) {
      output[target] = output[target - offset];
      target += 1;
    }
  }
  if (source !== input.length || target !== expectedLength) {
    rejection('BLOCK', 'wrong decoded length');
  }
  return output;
};

const COMPRESSION_MAGIC = Buffer.from('48434d500d0a1a0a', 'hex');
const BLOCK_BYTES = 32768;
const canonicalKey = (bytes) => `${bytes.length}:${sha256(bytes)}`;
const validateCompressionStream = (
  bytes,
  expectedLogicalLength,
  canonicalBlocks,
  observer = { decompressions: 0 },
  requireSelected = true,
) => {
  if (bytes.length < 32 || !bytes.subarray(0, 8).equals(COMPRESSION_MAGIC)) {
    rejection('HEADER', 'stream magic');
  }
  if (
    u16(bytes, 8) !== 1 ||
    u16(bytes, 10) !== 32 ||
    u16(bytes, 12) !== 24 ||
    bytes[14] !== 15 ||
    bytes[15] !== 0 ||
    u32(bytes, 28) !== 0
  ) {
    rejection('HEADER', 'stream fixed header');
  }
  if (expectedLogicalLength < 1 || expectedLogicalLength > 16777216) {
    rejection('TABLE', 'logical bound');
  }
  const expectedCount = Math.ceil(expectedLogicalLength / BLOCK_BYTES);
  const count = u32(bytes, 16);
  if (count !== expectedCount || count < 1 || count > 512) rejection('TABLE', 'block count');
  const payloadOffset = 32 + count * 24;
  if (
    u32(bytes, 20) !== expectedLogicalLength ||
    u32(bytes, 24) !== payloadOffset ||
    payloadOffset > bytes.length
  ) {
    rejection('TABLE', 'table length');
  }
  const output = Buffer.alloc(expectedLogicalLength);
  let storedCursor = payloadOffset;
  let sawCompressed = false;
  const representations = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 32 + index * 24;
    const logicalOffset = u32(bytes, entry);
    const logicalLength = u32(bytes, entry + 4);
    const storedOffset = u32(bytes, entry + 8);
    const storedLength = u32(bytes, entry + 12);
    const flags = u16(bytes, entry + 16);
    const expectedBlockLength = Math.min(
      BLOCK_BYTES,
      expectedLogicalLength - index * BLOCK_BYTES,
    );
    if (logicalOffset !== index * BLOCK_BYTES || logicalLength !== expectedBlockLength) {
      rejection('TABLE', 'logical block coverage');
    }
    if (
      storedOffset !== storedCursor ||
      storedLength < 1 ||
      storedLength > BLOCK_BYTES ||
      storedOffset + storedLength > bytes.length ||
      flags > 1 ||
      u16(bytes, entry + 18) !== 0 ||
      u32(bytes, entry + 20) !== 0
    ) {
      rejection('TABLE', 'stored block coverage');
    }
    const stored = bytes.subarray(storedOffset, storedOffset + storedLength);
    let decoded;
    if (flags === 1) {
      if (storedLength !== logicalLength) rejection('BLOCK', 'raw length mismatch');
      decoded = Buffer.from(stored);
      representations.push('raw');
    } else {
      if (storedLength >= logicalLength) rejection('CANON', 'nonshrinking lz4 block');
      observer.decompressions += 1;
      decoded = decodeLz4(stored, logicalLength);
      sawCompressed = true;
      representations.push('lz4');
    }
    const canonical = canonicalBlocks.get(canonicalKey(decoded));
    if (!canonical) rejection('CANON', 'unregistered reference block');
    const mustRaw = canonical.length >= decoded.length;
    if ((flags === 1) !== mustRaw) rejection('CANON', 'raw versus lz4 choice');
    if (flags === 0) {
      if (!canonical.bytes || !stored.equals(canonical.bytes)) {
        rejection('CANON', 'alternate lz4 bytes');
      }
    }
    decoded.copy(output, logicalOffset);
    storedCursor += storedLength;
  }
  if (storedCursor !== bytes.length) rejection('TABLE', 'trailing or missing payload');
  const selected = sawCompressed && bytes.length < expectedLogicalLength;
  if (requireSelected && !selected) rejection('CANON', 'nonshrinking stream');
  return { decoded: output, representations, selected };
};

const makeRawStream = (logical) => {
  assert(logical.length > 0 && logical.length <= BLOCK_BYTES, 'raw stream helper range');
  const bytes = Buffer.alloc(56 + logical.length);
  COMPRESSION_MAGIC.copy(bytes);
  bytes.writeUInt16LE(1, 8);
  bytes.writeUInt16LE(32, 10);
  bytes.writeUInt16LE(24, 12);
  bytes[14] = 15;
  bytes.writeUInt32LE(1, 16);
  bytes.writeUInt32LE(logical.length, 20);
  bytes.writeUInt32LE(56, 24);
  bytes.writeUInt32LE(logical.length, 36);
  bytes.writeUInt32LE(56, 40);
  bytes.writeUInt32LE(logical.length, 44);
  bytes.writeUInt16LE(1, 48);
  logical.copy(bytes, 56);
  return bytes;
};

const validateLayout = (fields, expectedBytes, name) => {
  const ordered = [...fields].sort((left, right) => left.offset - right.offset);
  let cursor = 0;
  for (const field of ordered) {
    assert(field.offset === cursor, `${name}.${field.name}: offset`);
    cursor += field.bytes;
  }
  assert(cursor === expectedBytes, `${name}: byte coverage`);
};

const expectedExternalSnapshots = [
  [
    'lz4-block-format',
    'lz4/lz4',
    'ebb370ca83af193212df4dcbadcc5d87bc0de2f0',
    'doc/lz4_Block_format.md',
    10683,
    'dce3c34a8738c44ed1dffb48c73e30297fca98ba7881408dc228865912c9a42e',
  ],
  [
    'lz4-reference-c-source',
    'lz4/lz4',
    'ebb370ca83af193212df4dcbadcc5d87bc0de2f0',
    'lib/lz4.c',
    118145,
    '9396f7de527bc8435de9c7569fb7998e56545a84b4f3c2d808c0235c01774539',
  ],
  [
    'lz4-flex-package-manifest',
    'PSeitz/lz4_flex',
    '8507d2e68ba2477fd087b7fa55d6806ca63f8138',
    'Cargo.toml',
    2021,
    'c19e9d884b006f43666f113a62fa5fac3adfbffec6fcbcbc5860198042d0a199',
  ],
  [
    'lz4-flex-crate-archive',
    'crates.io',
    null,
    'lz4_flex@0.13.1',
    46506,
    '7ef0d4ed8669f8f8826eb00dc878084aa8f253506c4fd5e8f58f5bce72ddb97e',
  ],
  [
    'lz4-flex-license',
    'PSeitz/lz4_flex',
    '8507d2e68ba2477fd087b7fa55d6806ca63f8138',
    'LICENSE',
    1079,
    '0982c33390159842ecce8e9d6ce2e5e39961fe0e0ffbb2eec39c9ba46db6db10',
  ],
  [
    'lz4-flex-safe-compressor-source',
    'PSeitz/lz4_flex',
    '8507d2e68ba2477fd087b7fa55d6806ca63f8138',
    'src/block/compress.rs',
    38032,
    '9b86e03b6138bbbee6b5bb5d9cf1429dc02026adf6d192b1d212e56e92c2acb3',
  ],
  [
    'lz4-flex-safe-decompressor-source',
    'PSeitz/lz4_flex',
    '8507d2e68ba2477fd087b7fa55d6806ca63f8138',
    'src/block/decompress_safe.rs',
    18174,
    '8dc61276d02d62203408937f61833876843edba8e37872d9c9ceab774fa72401',
  ],
  [
    'rustsec-2026-0041',
    'RustSec/advisory-db',
    'f8f8d392a4e6adf54c1ba1e7449bbeba00703cdc',
    'crates/lz4_flex/RUSTSEC-2026-0041.md',
    2190,
    '81e37d0936c81d447d02a7dfb8f7fb8af7466f09b8adb0ee008e747a7f08bbb2',
  ],
];
const externalTuple = (entry) => [
  entry.id,
  entry.authority,
  entry.commit ?? null,
  entry.path ?? `${entry.package}@${entry.version}`,
  entry.bytes,
  entry.sha256,
];
const expectedBlockSummaries = [
  ['empty', 0, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 1, '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d', 'not-storable-empty-section'],
  ['zero-13', 13, 'dd46c3eebb1884ff3b5258c0a2fc9398e560a29e0780d4b53869b6254aa46a96', 11, '9c6f22b125fcc2dbc79076354348b9a09aefec34c555ad67fba8791d24eac0f0', 'lz4'],
  ['ascii-a-64', 64, 'd53eda7a637c99cc7fb566d96e9fa109bf15c478410a3f5eb4d4c4e26cd081f6', 12, 'bf149e8d86368543e3bf3045e6538d7f09073f95bdc5920c54979e5aa4e6a7a2', 'lz4'],
  ['zero-32768', 32768, 'c35020473aed1b4642cd726cad727b63fff2824ad68cedd7ffb73c7cbd890479', 140, '1562cd4c8a4871dc49028e5c76a0ae79b0d737e24e56b4e2071fd4680854c30d', 'lz4'],
  ['index-mod251-32768', 32768, '09fed9cbfb98b6ab0f3e8ff63b7b1f9b0e07d58b225295c78fdc023cc4985a72', 390, '74d3c9865fae7ff030137e690c5f744d96fca3dbc02ad2e8e7e33ba62b319d36', 'lz4'],
  ['splitmix64-32768', 32768, 'b97e1b1e9a276b1f8d2fbff449cf250969f2c7412e1348c24e43204b1b5b6cb5', 32898, '4a352197c8440a4b1169ead15f64e95dcb8952367221fcbc6daf7c33ff3eddfe', 'raw'],
  ['splitmix64-257', 257, '3100429f53b5f5f2f55e06d372375f4661a096067a466e1a4d749598b460d413', 259, '8c52cbcd9063e21e125dafee6928795612d541f4c2a10ebc6f1f776efde2e48e', 'raw'],
];
const expectedSectionSummaries = [
  ['zero-13', 13, 67, 'b6859a3eedbe007fd31e69b2935590b24a2f9a2f32071a6363936a163a9be9cf', false, ['lz4']],
  ['zero-32768', 32768, 196, '0ab55c0c1b8d769bfc4e1758f76aa60ee1b43069c700d608ae3f84f357db375f', true, ['lz4']],
  ['zero-65536', 65536, 360, '10a197038064db41210a9f22b4a657f0ed0474dc5b9305500bf998c5c1fc1d68', true, ['lz4', 'lz4']],
  ['zero-32768-splitmix64-257', 33025, 477, 'f34ddf0e4a727d97ecf89385074df8b03a3e8382d2cd58af0937dcd9586700d9', true, ['lz4', 'raw']],
  ['splitmix64-32768', 32768, 32824, '409f8de876528ecf7067aa362fb64c296bdfdf281e42dff30150e00edb41546f', false, ['raw']],
];
const expectedNegativeCases = [
  'unknown-codec',
  'unknown-profile',
  'feature-flag-mismatch',
  'stream-magic-version-stride-log2-flags-reserved',
  'zero-or-wrong-block-count',
  'block-table-product-overflow-or-truncation',
  'logical-gap-overlap-or-wrong-final-size',
  'stored-gap-overlap-alias-or-trailing-bytes',
  'raw-length-mismatch',
  'lz4-zero-offset-truncation-overrun-or-wrong-output',
  'nonshrinking-lz4-block',
  'valid-but-noncanonical-lz4-encoding',
  'wrong-raw-versus-lz4-choice',
  'compressed-stream-not-smaller-than-logical-section',
  'compressed-profile-omits-or-adds-section',
  'total-not-smaller-than-canonical',
  'decoded-section-invalid',
  'decoded-tree-hash-mismatch',
];

const blockInputs = () => new Map([
  ['empty', Buffer.alloc(0)],
  ['zero-13', Buffer.alloc(13)],
  ['ascii-a-64', Buffer.alloc(64, 0x41)],
  ['zero-32768', Buffer.alloc(32768)],
  [
    'index-mod251-32768',
    Buffer.from(Array.from({ length: 32768 }, (_, index) => index % 251)),
  ],
  ['splitmix64-32768', splitmixBytes(32768)],
  ['splitmix64-257', splitmixBytes(257)],
]);
const sectionInput = (id) => {
  if (id === 'zero-13') return Buffer.alloc(13);
  if (id === 'zero-32768') return Buffer.alloc(32768);
  if (id === 'zero-65536') return Buffer.alloc(65536);
  if (id === 'zero-32768-splitmix64-257') {
    return Buffer.concat([Buffer.alloc(32768), splitmixBytes(257)]);
  }
  if (id === 'splitmix64-32768') return splitmixBytes(32768);
  throw new Error(`${id}: unknown section input`);
};

const makeLargeStringSections = () => {
  const field = Buffer.alloc(48);
  field.writeUInt32LE(0, 0);
  field.writeUInt32LE(256, 4);
  field.writeUInt16LE(3, 8);
  field[10] = 13;
  field.writeUInt32LE(264, 12);
  field.writeUInt32LE(16, 16);
  field.writeUInt32LE(0, 20);
  field.writeUInt32LE(1, 24);
  field.writeUInt32LE(259, 28);
  field.writeUInt16LE(3, 32);
  field[34] = 7;
  field.writeUInt32LE(280, 36);
  field.writeUInt32LE(4096, 40);
  field.writeUInt32LE(1, 44);

  const names = Buffer.alloc(22);
  names.writeUInt32LE(256, 0);
  names.writeUInt16LE(3, 4);
  names.writeUInt16LE(3, 6);
  names.writeUInt32LE(259, 8);
  names.writeUInt16LE(3, 12);
  names.writeUInt16LE(3, 14);
  Buffer.from('_idpad').copy(names, 16);

  const values = Buffer.concat([Buffer.alloc(16), Buffer.alloc(4096, 0x41)]);
  const containers = Buffer.alloc(32);
  containers.writeUInt32LE(0, 0);
  containers[4] = 9;
  containers.writeUInt16LE(1, 6);
  containers.writeUInt32LE(192, 8);
  containers.writeUInt32LE(2, 12);
  containers.writeUInt32LE(2, 16);
  containers.writeUInt32LE(0xffffffff, 20);
  containers.writeUInt32LE(0xffffffff, 24);
  return [field, names, values, containers];
};

const buildUncompressedHDoc = (sections, contentHash) => {
  const kinds = [1, 2, 3, 4];
  const itemCounts = [2, 2, 2, 1];
  const offsets = [];
  let cursor = 192;
  for (const section of sections) {
    cursor = align8(cursor);
    offsets.push(cursor);
    cursor += section.length;
  }
  const footerOffset = align8(cursor);
  const bytes = Buffer.alloc(footerOffset + 64);
  Buffer.from('48444f430d0a1a0a', 'hex').copy(bytes);
  bytes.writeUInt16LE(1, 8);
  bytes.writeUInt16LE(192, 12);
  bytes.writeUInt16LE(32, 14);
  bytes.writeUInt32LE(bytes.length, 20);
  bytes.writeUInt32LE(bytes.length, 24);
  bytes.writeUInt32LE(2, 28);
  bytes.writeUInt16LE(4, 36);
  bytes.writeUInt32LE(64, 40);
  bytes.writeUInt32LE(footerOffset, 44);
  for (let index = 0; index < 4; index += 1) {
    const entry = 64 + index * 32;
    bytes.writeUInt16LE(kinds[index], entry);
    bytes.writeUInt16LE(6, entry + 2);
    bytes.writeUInt32LE(offsets[index], entry + 4);
    bytes.writeUInt32LE(sections[index].length, entry + 8);
    bytes.writeUInt32LE(sections[index].length, entry + 12);
    bytes.writeUInt32LE(itemCounts[index], entry + 16);
    bytes.writeUInt16LE(1, entry + 24);
    sections[index].copy(bytes, offsets[index]);
  }
  Buffer.from('48444f43454e440a', 'hex').copy(bytes, footerOffset);
  bytes.writeUInt16LE(64, footerOffset + 8);
  bytes.writeUInt16LE(1, footerOffset + 10);
  bytes.writeUInt16LE(1, footerOffset + 12);
  bytes.writeUInt16LE(1, footerOffset + 14);
  bytes.writeUInt32LE(32, footerOffset + 16);
  bytes.writeUInt32LE(bytes.length, footerOffset + 20);
  bytes.writeUInt32LE(bytes.length, footerOffset + 24);
  bytes.writeUInt32LE(2, footerOffset + 28);
  contentHash.copy(bytes, footerOffset + 32);
  writeStoredCrc(bytes);
  return bytes;
};

const validateLargeStringSections = (sections) => {
  const expected = makeLargeStringSections();
  if (
    sections.length !== expected.length ||
    sections.some((section, index) => !section.equals(expected[index]))
  ) {
    rejection('STRUCT', 'decoded section grammar or canonical-logical offsets');
  }
};

const validateCompressedHDoc = (input, canonicalBlocks, expectedHash, observer = { decompressions: 0 }) => {
  const bytes = Buffer.from(input);
  if (
    bytes.length < 256 ||
    !bytes.subarray(0, 8).equals(Buffer.from('48444f430d0a1a0a', 'hex'))
  ) {
    rejection('STRUCT', 'HDoc header');
  }
  if (
    u16(bytes, 8) !== 1 ||
    u16(bytes, 10) !== 0 ||
    u16(bytes, 12) !== 192 ||
    u16(bytes, 14) !== 32 ||
    u32(bytes, 20) !== bytes.length ||
    u32(bytes, 24) > 16777216 ||
    u32(bytes, 28) !== 2
  ) {
    rejection('STRUCT', 'HDoc fixed fields');
  }
  if (computeStoredCrc(bytes) !== u32(bytes, 32)) rejection('CRC', 'stored CRC-32C');
  const required = u64(bytes, 48);
  if ((required & ~1n) !== 0n) rejection('CAP', 'unknown required feature');
  if (u64(bytes, 56) !== 0n || u16(bytes, 36) !== 4 || u16(bytes, 38) !== 0) {
    rejection('STRUCT', 'HDoc directory/feature fields');
  }
  const entries = [];
  let storedCursor = 192;
  let anyCompressed = false;
  for (let index = 0; index < 4; index += 1) {
    const offset = 64 + index * 32;
    const kind = u16(bytes, offset);
    const flags = u16(bytes, offset + 2);
    const sectionOffset = u32(bytes, offset + 4);
    const storedLength = u32(bytes, offset + 8);
    const logicalLength = u32(bytes, offset + 12);
    const itemCount = u32(bytes, offset + 16);
    const codec = u16(bytes, offset + 20);
    const profile = u16(bytes, offset + 22);
    if ((codec !== 0 || profile !== 0) && (codec !== 1 || profile !== 1)) {
      rejection('CAP', 'unknown codec/profile');
    }
    const compressed = (flags & 1) !== 0;
    if (
      kind !== index + 1 ||
      itemCount !== [2, 2, 2, 1][index] ||
      compressed !== (codec === 1 && profile === 1) ||
      flags !== (compressed ? 7 : 6) ||
      u16(bytes, offset + 24) !== 1 ||
      u16(bytes, offset + 26) !== 0 ||
      u32(bytes, offset + 28) !== 0
    ) {
      rejection('STRUCT', 'directory entry');
    }
    if (!compressed && storedLength !== logicalLength) {
      rejection('STRUCT', 'uncompressed section length');
    }
    storedCursor = align8(storedCursor);
    if (sectionOffset !== storedCursor || sectionOffset + storedLength > bytes.length) {
      rejection('STRUCT', 'stored placement');
    }
    entries.push({ sectionOffset, storedLength, logicalLength, compressed });
    storedCursor += storedLength;
    anyCompressed ||= compressed;
  }
  if (
    (((u32(bytes, 16) & 1) !== 0) !== anyCompressed) ||
    (((required & 1n) !== 0n) !== anyCompressed)
  ) {
    rejection('STRUCT', 'document compression feature mismatch');
  }
  const footerOffset = align8(storedCursor);
  if (
    footerOffset !== u32(bytes, 44) ||
    footerOffset + 64 !== bytes.length ||
    !bytes
      .subarray(footerOffset, footerOffset + 8)
      .equals(Buffer.from('48444f43454e440a', 'hex'))
  ) {
    rejection('STRUCT', 'stored footer placement');
  }
  for (let offset = storedCursor; offset < footerOffset; offset += 1) {
    if (bytes[offset] !== 0) rejection('STRUCT', 'stored padding');
  }
  same(
    [
      u16(bytes, footerOffset + 8),
      u16(bytes, footerOffset + 10),
      u16(bytes, footerOffset + 12),
      u16(bytes, footerOffset + 14),
      u32(bytes, footerOffset + 16),
      u32(bytes, footerOffset + 20),
      u32(bytes, footerOffset + 28),
    ],
    [64, 1, 1, 1, 32, bytes.length, 2],
    'compressed HDoc footer fields',
  );
  const logicalOffsets = [];
  let logicalCursor = 192;
  for (const entry of entries) {
    logicalCursor = align8(logicalCursor);
    logicalOffsets.push(logicalCursor);
    logicalCursor += entry.logicalLength;
  }
  const canonicalLength = align8(logicalCursor) + 64;
  if (
    canonicalLength !== u32(bytes, 24) ||
    canonicalLength !== u32(bytes, footerOffset + 24)
  ) {
    rejection('STRUCT', 'canonical logical length');
  }
  const sections = entries.map((entry) => {
    const stored = bytes.subarray(entry.sectionOffset, entry.sectionOffset + entry.storedLength);
    return entry.compressed
      ? validateCompressionStream(
          stored,
          entry.logicalLength,
          canonicalBlocks,
          observer,
          true,
        ).decoded
      : Buffer.from(stored);
  });
  validateLargeStringSections(sections);
  same(
    entries.map(({ compressed }) => compressed),
    [false, false, true, false],
    'canonical section selection',
  );
  if (bytes.length >= canonicalLength) rejection('CANON', 'compressed envelope did not shrink');
  const contentHash = largeStringRootHash();
  assert(contentHash.equals(expectedHash), 'independent typed hash versus registry');
  if (!bytes.subarray(footerOffset + 32, footerOffset + 64).equals(contentHash)) {
    rejection('HASH', 'typed-content hash');
  }
  return { sections, entries, logicalOffsets, footerOffset, canonicalLength, contentHash };
};

const requiredCompressionHeadings = [
  '## Scope and maturity boundary',
  '## Normative notation',
  '## Assigned codec and profile',
  '## Two coordinate spaces',
  '### Stored coordinates',
  '### Canonical logical coordinates',
  '## Compression-stream layout',
  '### Fixed 32-byte stream header',
  '### Fixed 24-byte block descriptor',
  '## Canonical block encoding',
  '## Canonical section and document selection',
  '## Envelope, directory, integrity, and hash rules',
  '## Validation order and atomic exposure',
  '## Failure classes and required rejection cases',
  '## Executable reference vectors',
  '## Dependency, security, and license boundary',
  '## Versioning, migration, and rollback',
  '## Subordinate ownership',
  '## References',
];
const requiredProse = [
  ['compressionDocument', 'lz4-flex-safe-independent-32k-v1'],
  ['compressionDocument', 'fresh, zero-initialized output buffer'],
  ['compressionDocument', 'Every absolute offset defined by the `P03-004`/`P03-005`'],
  ['compressionDocument', 'compresses every and only section that passes this test'],
  ['compressionDocument', 'Unknown required feature, codec, or profile'],
  ['compressionDocument', '139-byte encoding'],
  ['compressionDocument', 'outside the affected ranges in RustSec advisory'],
  ['compressionDocument', 'does not add an external production'],
  ['specifications', 'HDoc 1.0 Bounded Section Compression'],
  ['specifications', 'Every record/payload absolute offset addresses the derived canonical'],
  ['study', 'RUSTSEC-2026-0041'],
  ['study', 'shrinks from 4,472 to 448 bytes'],
  ['adr', '[x] Select and validate deterministic bounded compression profile `1/1`'],
  ['envelopeDocument', 'Accepted complete HDoc 1.0 byte format'],
  ['recordDocument', '## Canonical-logical offset space'],
  ['integrityDocument', 'equal typed hash and different CRC'],
  ['payloadDocument', '[compression registry](hdoc-v1-compression.md)'],
  ['tagDocument', '[compression registry](hdoc-v1-compression.md)'],
  ['licensing', '### Approved pending HDoc codec dependency'],
  ['dependencyReporting', 'first planned external crate for HDoc compression'],
  ['formatIndex', '[HDoc bounded section compression](hdoc-v1-compression.md)'],
  ['docsIndex', '[HDoc 1.0 bounded section compression](formats/hdoc-v1-compression.md)'],
];

const validateContract = (candidate) => {
  const compression = JSON.parse(candidate.compressionSource);
  const envelope = JSON.parse(candidate.envelopeSource);
  const payloads = JSON.parse(candidate.payloadSource);
  const records = JSON.parse(candidate.recordSource);
  const integrity = JSON.parse(candidate.integritySource);
  const tags = JSON.parse(candidate.tagSource);
  const matrix = JSON.parse(candidate.matrix);
  const generationReport = JSON.parse(candidate.generationReport);
  const dependencyPolicy = JSON.parse(candidate.dependencyPolicy);

  assert(candidate.compressionSource.endsWith('\n'), 'compression registry terminal newline');
  assert(compression.schema === 'helix.hdoc-compression-registry/1', 'compression schema');
  same(
    compression.format,
    {
      name: 'HDoc',
      major_version: 1,
      minor_version: 0,
      compression_stream_version: 1,
      compression_required_feature_bit: 0,
      document_compressed_flag_bit: 0,
      section_compressed_flag_bit: 0,
      complete_compression_format: true,
      complete_hdoc_byte_format: true,
      completion_owner: 'P03-007',
      implementation_owners: ['P03-008', 'P03-009'],
      immutable_fixture_owner: 'P03-016',
    },
    'compression format identity',
  );
  same(
    compression.coordinate_spaces,
    {
      stored: {
        meaning: 'exact bytes in the CRC-covered HDoc slice',
        directory_field: 'section_offset',
        footer_field: 'footer_offset',
        length_field: 'total_length',
      },
      canonical_logical: {
        meaning: 'derived complete uncompressed HDoc coordinates',
        section_offset_equation: 'align8(previous-logical-end-starting-at-header_bytes)',
        footer_offset_equation: 'canonical_length - 64',
        internal_record_offsets: 'all-P03-005-absolute-offsets',
        length_field: 'canonical_length',
      },
      uncompressed_equivalence: 'stored-and-canonical-logical-offsets-are-equal',
      compressed_translation:
        'validate-logical-section-range-then-subtract-derived-logical-section-offset',
    },
    'coordinate spaces',
  );
  same(
    compression.codec_registry.map(({ codec_id, profile_id, name, status }) => [
      codec_id,
      profile_id,
      name,
      status,
    ]),
    [
      [0, 0, 'none', 'assigned-uncompressed'],
      [1, 1, 'lz4-flex-safe-independent-32k-v1', 'assigned-compressed'],
    ],
    'codec registry',
  );
  const profile = compression.codec_registry[1];
  same(
    [
      profile.algorithm_format,
      profile.container_format,
      profile.block_bytes,
      profile.dictionary,
      profile.history_between_blocks,
      profile.frame_format,
      profile.canonical_encoder.package,
      profile.canonical_encoder.version,
      profile.canonical_encoder.crate_archive_sha256,
      profile.canonical_encoder.repository_commit,
      profile.canonical_encoder.api,
      profile.canonical_encoder.default_features,
      profile.canonical_encoder.required_features,
      profile.canonical_decoder.api,
      profile.canonical_decoder.fresh_zero_initialized_exact_output_per_block,
      profile.canonical_decoder.returned_length_must_equal_descriptor,
      profile.canonical_decoder.recompress_and_compare,
    ],
    [
      'LZ4-raw-block',
      'hdoc-compression-stream-v1',
      32768,
      false,
      false,
      false,
      'lz4_flex',
      '0.13.1',
      '7ef0d4ed8669f8f8826eb00dc878084aa8f253506c4fd5e8f58f5bce72ddb97e',
      '8507d2e68ba2477fd087b7fa55d6806ca63f8138',
      'lz4_flex::block::compress_into',
      false,
      ['safe-encode', 'safe-decode'],
      'lz4_flex::block::decompress_into',
      true,
      true,
      true,
    ],
    'codec profile',
  );
  same(
    compression.external_reference_snapshots.map(externalTuple),
    expectedExternalSnapshots,
    'external source snapshot inventory',
  );
  validateLayout(compression.stream_header.fields, 32, 'compression stream header');
  validateLayout(compression.block_entry.fields, 24, 'compression block entry');
  validateLayout(envelope.header.fields, 64, 'HDoc header');
  validateLayout(envelope.directory.fields, 32, 'HDoc directory');
  validateLayout(envelope.footer.fields, 64, 'HDoc footer');
  same(
    [
      compression.stream_header.magic_hex,
      compression.stream_header.bytes,
      compression.block_entry.bytes,
      compression.canonical_block_partition.block_bytes,
      compression.canonical_block_partition.block_count_maximum_under_portable_document_limit,
      compression.resource_limits.canonical_document_bytes,
      compression.resource_limits.compressed_block_output_bytes,
      compression.resource_limits.maximum_blocks_per_section,
      compression.resource_limits.maximum_block_table_bytes,
    ],
    ['48434d500d0a1a0a', 32, 24, 32768, 512, 16777216, 32768, 512, 12288],
    'stream and resource constants',
  );
  same(
    compression.canonical_selection.compressible_section_kinds,
    [1, 2, 3, 4],
    'compressible sections',
  );
  assert(
    compression.canonical_selection.extension_area_compression ===
      'forbidden-until-P03-015-registers-compatible-ownership',
    'extension compression deferral',
  );
  assert(compression.canonical_selection.stream_must_be_smaller_than_logical_section, 'section shrink');
  assert(compression.canonical_selection.stream_must_contain_compressed_block, 'compressed block');
  assert(compression.canonical_selection.no_gaps_padding_or_trailing_bytes_inside_stream, 'stream gaps');

  for (const registry of [payloads, records, integrity, tags]) {
    assert(registry.format.complete_hdoc_format === true, 'subordinate completion marker');
    assert(
      registry.format.compression_registry === 'docs/formats/hdoc-v1-compression.json',
      'subordinate compression registry binding',
    );
  }
  assert(envelope.format.complete_byte_format === true, 'envelope completion marker');
  assert(
    envelope.format.compression_registry === 'docs/formats/hdoc-v1-compression.json',
    'envelope compression registry binding',
  );
  same(
    envelope.codec_registry.map(({ id, profile_id, name }) => [id, profile_id, name]),
    [
      [0, 0, 'none'],
      [1, 1, 'lz4-flex-safe-independent-32k-v1'],
    ],
    'envelope codec mirror',
  );
  assert(records.format.offset_base === 'canonical-logical-document-start', 'record offset space');
  assert(
    envelope.header.fields.find(({ name }) => name === 'total_length').coordinate_space ===
      'stored',
    'stored total length',
  );
  assert(
    envelope.header.fields.find(({ name }) => name === 'canonical_length').coordinate_space ===
      'canonical-logical',
    'logical canonical length',
  );
  assert(
    envelope.directory.fields.find(({ name }) => name === 'section_offset').coordinate_space ===
      'stored',
    'stored section offset',
  );

  same(
    compression.block_vectors.map((vector) => [
      vector.id,
      vector.input_length,
      vector.input_sha256,
      vector.compressed_length,
      vector.compressed_sha256,
      vector.canonical_block_storage,
    ]),
    expectedBlockSummaries,
    'block vector summaries',
  );
  const inputs = blockInputs();
  const canonicalBlocks = new Map();
  for (const vector of compression.block_vectors) {
    const input = inputs.get(vector.id);
    assert(input && input.length === vector.input_length, `${vector.id}: input length`);
    assert(sha256(input) === vector.input_sha256, `${vector.id}: input SHA-256`);
    const compressed =
      vector.compressed_hex === null ? null : Buffer.from(vector.compressed_hex, 'hex');
    if (compressed) {
      assert(compressed.length === vector.compressed_length, `${vector.id}: compressed length`);
      assert(sha256(compressed) === vector.compressed_sha256, `${vector.id}: compressed SHA-256`);
      assert(decodeLz4(compressed, input.length).equals(input), `${vector.id}: LZ4 decode`);
    }
    canonicalBlocks.set(canonicalKey(input), {
      length: vector.compressed_length,
      bytes: compressed,
    });
  }

  const compressedDocumentVector = compression.complete_hdoc_vectors.find(
    ({ id }) => id === 'large-string-value-area-lz4',
  );
  const compressedDocument = Buffer.from(compressedDocumentVector.hdoc_hex, 'hex');
  const valueEntry = 64 + 2 * 32;
  const valueStream = compressedDocument.subarray(
    u32(compressedDocument, valueEntry + 4),
    u32(compressedDocument, valueEntry + 4) + u32(compressedDocument, valueEntry + 8),
  );
  const valuePayloadOffset = u32(valueStream, 24);
  const valueStoredLength = u32(valueStream, 32 + 12);
  const valueCanonicalBytes = Buffer.from(
    valueStream.subarray(valuePayloadOffset, valuePayloadOffset + valueStoredLength),
  );
  const expectedSections = makeLargeStringSections();
  canonicalBlocks.set(canonicalKey(expectedSections[2]), {
    length: valueCanonicalBytes.length,
    bytes: valueCanonicalBytes,
  });

  same(
    compression.section_vectors.map((vector) => [
      vector.id,
      vector.logical_length,
      vector.stream_length,
      vector.stream_sha256,
      vector.selected_as_compressed_section,
      vector.block_representations,
    ]),
    expectedSectionSummaries,
    'section vector summaries',
  );
  for (const vector of compression.section_vectors) {
    const logical = sectionInput(vector.id);
    assert(logical.length === vector.logical_length, `${vector.id}: logical length`);
    assert(sha256(logical) === vector.logical_sha256, `${vector.id}: logical SHA-256`);
    const stream =
      vector.stream_hex === null ? makeRawStream(logical) : Buffer.from(vector.stream_hex, 'hex');
    assert(stream.length === vector.stream_length, `${vector.id}: stream length`);
    assert(sha256(stream) === vector.stream_sha256, `${vector.id}: stream SHA-256`);
    const result = validateCompressionStream(stream, logical.length, canonicalBlocks, undefined, false);
    assert(result.decoded.equals(logical), `${vector.id}: decoded bytes`);
    same(result.representations, vector.block_representations, `${vector.id}: representations`);
    assert(result.selected === vector.selected_as_compressed_section, `${vector.id}: selection`);
  }

  assert(compressedDocument.length === compressedDocumentVector.total_length, 'compressed HDoc length');
  assert(sha256(compressedDocument) === compressedDocumentVector.artifact_sha256, 'compressed HDoc SHA');
  assert(computeStoredCrc(compressedDocument) === u32(compressedDocument, 32), 'compressed HDoc CRC');
  const expectedHash = Buffer.from(compressedDocumentVector.content_hash_hex, 'hex');
  const parsed = validateCompressedHDoc(compressedDocument, canonicalBlocks, expectedHash);
  same(parsed.logicalOffsets, [192, 240, 264, 4376], 'logical section offsets');
  same(
    parsed.entries.map(({ sectionOffset }) => sectionOffset),
    [192, 240, 264, 352],
    'stored section offsets',
  );
  assert(parsed.footerOffset === 384 && parsed.canonicalLength === 4472, 'footer coordinates');

  const uncompressedDocumentVector = compression.complete_hdoc_vectors.find(
    ({ id }) => id === 'large-string-uncompressed',
  );
  const uncompressedDocument = buildUncompressedHDoc(expectedSections, expectedHash);
  assert(uncompressedDocument.length === uncompressedDocumentVector.total_length, 'base HDoc length');
  assert(sha256(uncompressedDocument) === uncompressedDocumentVector.artifact_sha256, 'base HDoc SHA');
  assert(
    `0x${u32(uncompressedDocument, 32).toString(16).padStart(8, '0')}` ===
      uncompressedDocumentVector.crc32c_value_hex,
    'base HDoc CRC',
  );
  assert(hex(expectedHash) === uncompressedDocumentVector.content_hash_hex, 'base HDoc typed hash');
  assert(compressedDocument.length < uncompressedDocument.length, 'complete compression shrinks');

  const alternateBytes = Buffer.from(
    '1f000100ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff67500000000000',
    'hex',
  );
  const alternate = compression.canonicality_alternate;
  assert(alternateBytes.length === alternate.stored_length, 'alternate C length');
  assert(sha256(alternateBytes) === alternate.stored_sha256, 'alternate C SHA-256');
  assert(decodeLz4(alternateBytes, 32768).equals(Buffer.alloc(32768)), 'alternate C decode');
  assert(
    !alternateBytes.equals(canonicalBlocks.get(canonicalKey(Buffer.alloc(32768))).bytes),
    'alternate differs from canonical encoder',
  );

  same(
    compression.negative_cases.map(({ id }) => id),
    expectedNegativeCases,
    'negative case inventory',
  );
  assert(compression.negative_cases.every(({ expected }) => /^(?:CAP|DUR)_/.test(expected)), 'negative diagnostics');
  assert(compression.dependency_adoption_gate.dependency_committed_by_P03_007 === false, 'dependency gate');
  assert(!candidate.cargoManifest.includes('lz4_flex'), 'root Cargo manifest remains dependency-free');
  assert(!candidate.cargoLock.includes('lz4_flex'), 'Cargo lock remains dependency-free');
  assert(dependencyPolicy.rust.allow_external_packages === false, 'external Rust policy remains closed');

  same(
    candidate.compressionDocument
      .split('\n')
      .filter((line) => /^#{2,3} /.test(line)),
    requiredCompressionHeadings,
    'compression document headings',
  );
  for (const [field, marker] of requiredProse) {
    assert(candidate[field].includes(marker), `${field}: required marker ${marker}`);
  }
  assert(
    matrix.inputs.specifications.sha256 === sha256(Buffer.from(candidate.specifications)),
    'generated matrix specification hash',
  );
  assert(
    matrix.verdict === 'pass' && matrix.counts.failed === 0 && matrix.counts.skipped === 0,
    'matrix verdict',
  );
  const generatedArtifacts = generationReport.generators.flatMap(({ artifacts }) => artifacts);
  const matrixArtifact = generatedArtifacts.find(({ path: artifactPath }) => artifactPath === 'compatibility/v1/matrix-v1.json');
  const renderedArtifact = generatedArtifacts.find(
    ({ path: artifactPath }) => artifactPath === 'docs/compatibility/v1-semantic-compatibility-matrix.md',
  );
  assert(matrixArtifact.sha256 === sha256(Buffer.from(candidate.matrix)), 'generation report matrix hash');
  assert(renderedArtifact.sha256 === sha256(Buffer.from(candidate.renderedMatrix)), 'generation report rendered hash');

  return {
    compression,
    canonicalBlocks,
    compressedDocument,
    expectedHash,
    parsed,
    blockVectors: compression.block_vectors.length,
    sectionVectors: compression.section_vectors.length,
    completeDocuments: compression.complete_hdoc_vectors.length,
    completeBytes: compression.complete_hdoc_vectors.reduce(
      (sum, vector) => sum + vector.total_length,
      0,
    ),
    negativeCases: compression.negative_cases.length,
    externalSnapshots: compression.external_reference_snapshots.length,
  };
};

const context = validateContract(snapshot);

let mutationCount = 0;
const mutation = (code, callback, label) => {
  expectRejection(code, callback, label);
  mutationCount += 1;
};
const streamById = (id) => {
  const vector = context.compression.section_vectors.find((item) => item.id === id);
  assert(vector?.stream_hex, `${id}: exact stream absent`);
  return Buffer.from(vector.stream_hex, 'hex');
};

for (const offset of [0, 8, 10, 12, 14, 15, 28]) {
  const bytes = streamById('zero-32768');
  bytes[offset] ^= 1;
  mutation(
    'HEADER',
    () => validateCompressionStream(bytes, 32768, context.canonicalBlocks),
    `stream header mutation ${offset}`,
  );
}
{
  const bytes = streamById('zero-32768');
  bytes.writeUInt32LE(0, 16);
  mutation('TABLE', () => validateCompressionStream(bytes, 32768, context.canonicalBlocks), 'zero block count');
}
{
  const bytes = streamById('zero-32768');
  bytes.writeUInt32LE(2, 16);
  mutation('TABLE', () => validateCompressionStream(bytes, 32768, context.canonicalBlocks), 'wrong block count');
}
{
  const bytes = streamById('zero-32768');
  bytes.writeUInt32LE(0xffffffff, 16);
  mutation('TABLE', () => validateCompressionStream(bytes, 32768, context.canonicalBlocks), 'block product overflow');
}
mutation(
  'TABLE',
  () =>
    validateCompressionStream(
      streamById('zero-32768').subarray(0, 50),
      32768,
      context.canonicalBlocks,
    ),
  'truncated table',
);
{
  const bytes = streamById('zero-32768');
  bytes.writeUInt32LE(1, 32);
  mutation('TABLE', () => validateCompressionStream(bytes, 32768, context.canonicalBlocks), 'logical gap');
}
{
  const bytes = streamById('zero-32768');
  bytes.writeUInt32LE(32767, 36);
  mutation('TABLE', () => validateCompressionStream(bytes, 32768, context.canonicalBlocks), 'wrong final logical size');
}
{
  const bytes = streamById('zero-32768');
  bytes.writeUInt32LE(57, 40);
  mutation('TABLE', () => validateCompressionStream(bytes, 32768, context.canonicalBlocks), 'stored gap');
}
{
  const bytes = Buffer.concat([streamById('zero-32768'), Buffer.from([0])]);
  mutation('TABLE', () => validateCompressionStream(bytes, 32768, context.canonicalBlocks), 'stored trailing byte');
}
{
  const bytes = streamById('zero-32768-splitmix64-257');
  bytes.writeUInt32LE(256, 68);
  mutation('BLOCK', () => validateCompressionStream(bytes, 33025, context.canonicalBlocks), 'raw length mismatch');
}
{
  const bytes = streamById('zero-13');
  bytes[58] = 0;
  bytes[59] = 0;
  mutation('BLOCK', () => validateCompressionStream(bytes, 13, context.canonicalBlocks, undefined, false), 'zero LZ4 offset');
}
{
  const bytes = streamById('zero-13');
  bytes.writeUInt32LE(10, 44);
  mutation(
    'BLOCK',
    () =>
      validateCompressionStream(
        bytes.subarray(0, bytes.length - 1),
        13,
        context.canonicalBlocks,
        undefined,
        false,
      ),
    'truncated LZ4',
  );
}
{
  const bytes = streamById('zero-13');
  bytes[56] = 0x1f;
  mutation('BLOCK', () => validateCompressionStream(bytes, 13, context.canonicalBlocks, undefined, false), 'LZ4 output overrun');
}
{
  const bytes = streamById('zero-13');
  bytes.writeUInt32LE(13, 44);
  const expanded = Buffer.concat([bytes, Buffer.alloc(2)]);
  mutation('CANON', () => validateCompressionStream(expanded, 13, context.canonicalBlocks), 'nonshrinking LZ4 block');
}
{
  const alternate = Buffer.from(
    '1f000100ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff67500000000000',
    'hex',
  );
  const canonical = streamById('zero-32768');
  canonical.writeUInt32LE(alternate.length, 44);
  const candidate = Buffer.concat([canonical.subarray(0, 56), alternate]);
  mutation('CANON', () => validateCompressionStream(candidate, 32768, context.canonicalBlocks), 'valid alternate LZ4');
}
{
  const bytes = makeRawStream(Buffer.alloc(32768));
  mutation('CANON', () => validateCompressionStream(bytes, 32768, context.canonicalBlocks), 'wrong raw choice');
}
{
  const logical = splitmixBytes(32768);
  const bytes = makeRawStream(logical);
  mutation('CANON', () => validateCompressionStream(bytes, logical.length, context.canonicalBlocks), 'nonshrinking stream');
}
{
  const bytes = Buffer.from(context.compressedDocument);
  bytes.writeUInt16LE(2, 64 + 2 * 32 + 20);
  writeStoredCrc(bytes);
  const observer = { decompressions: 0 };
  mutation('CAP', () => validateCompressedHDoc(bytes, context.canonicalBlocks, context.expectedHash, observer), 'unknown codec');
  assert(observer.decompressions === 0, 'unknown codec allocated/decompressed');
}
{
  const bytes = Buffer.from(context.compressedDocument);
  bytes.writeUInt16LE(2, 64 + 2 * 32 + 22);
  writeStoredCrc(bytes);
  const observer = { decompressions: 0 };
  mutation('CAP', () => validateCompressedHDoc(bytes, context.canonicalBlocks, context.expectedHash, observer), 'unknown profile');
  assert(observer.decompressions === 0, 'unknown profile allocated/decompressed');
}
{
  const bytes = Buffer.from(context.compressedDocument);
  bytes.writeBigUInt64LE(2n, 48);
  writeStoredCrc(bytes);
  const observer = { decompressions: 0 };
  mutation('CAP', () => validateCompressedHDoc(bytes, context.canonicalBlocks, context.expectedHash, observer), 'unknown required feature');
  assert(observer.decompressions === 0, 'unknown feature allocated/decompressed');
}
{
  const bytes = Buffer.from(context.compressedDocument);
  bytes.writeUInt32LE(0, 16);
  writeStoredCrc(bytes);
  mutation('STRUCT', () => validateCompressedHDoc(bytes, context.canonicalBlocks, context.expectedHash), 'feature flag mismatch');
}
const validateSelection = (flags, totalLength, canonicalLength) => {
  if (JSON.stringify(flags) !== JSON.stringify([false, false, true, false])) {
    rejection('CANON', 'canonical section selection mutation');
  }
  if (totalLength >= canonicalLength) rejection('CANON', 'compressed envelope did not shrink');
};
mutation('CANON', () => validateSelection([false, false, false, false], 448, 4472), 'omitted compressed section');
mutation('CANON', () => validateSelection([true, false, true, false], 448, 4472), 'extra compressed section');
mutation('CANON', () => validateSelection([false, false, true, false], 4472, 4472), 'nonshrinking document');
{
  const sections = makeLargeStringSections();
  sections[0][10] = 0;
  mutation('STRUCT', () => validateLargeStringSections(sections), 'decoded section invalid');
}
{
  const bytes = Buffer.from(context.compressedDocument);
  bytes[bytes.length - 1] ^= 1;
  writeStoredCrc(bytes);
  mutation('HASH', () => validateCompressedHDoc(bytes, context.canonicalBlocks, context.expectedHash), 'typed hash mismatch');
}

assert(mutationCount === manifest.verification.mutation_canaries, 'mutation-canary count mismatch');

assert(
  context.blockVectors === manifest.verification.block_vectors,
  'block-vector count mismatch',
);
assert(
  context.sectionVectors === manifest.verification.section_vectors,
  'section-vector count mismatch',
);
assert(
  context.completeDocuments === manifest.verification.complete_hdoc_documents,
  'complete-document count mismatch',
);
assert(
  context.completeBytes === manifest.verification.complete_hdoc_bytes,
  'complete-document bytes mismatch',
);
assert(
  context.negativeCases === manifest.verification.negative_cases,
  'negative-case count mismatch',
);
assert(
  context.externalSnapshots === manifest.verification.external_reference_snapshots,
  'external-snapshot count mismatch',
);
assert(
  requiredCompressionHeadings.length === manifest.verification.compression_document_headings,
  'compression heading count mismatch',
);
assert(
  snapshot.compressionDocument.split('\n').length - 1 ===
    manifest.verification.compression_document_lines,
  'compression document line count mismatch',
);
assert(
  snapshot.compressionSource.split('\n').length - 1 ===
    manifest.verification.registry_lines,
  'compression registry line count mismatch',
);
assert(
  Buffer.byteLength(snapshot.compressionSource) === manifest.verification.registry_bytes,
  'compression registry byte count mismatch',
);
assert(
  manifest.verification.source_time_codec_implementations === 3,
  'source-time codec implementation count mismatch',
);
assert(
  manifest.verification.native_wasm_exact_vectors === 7,
  'native/Wasm parity vector count mismatch',
);

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

const matrixReplayPaths = [
  'Specifications.md',
  'compatibility/v1/generate-matrix.mjs',
  'compatibility/v1/matrix-v1.json',
  'docs/compatibility/v1-semantic-compatibility-matrix.md',
  ...Object.values(JSON.parse(snapshot.matrix).inputs).map(({ path: inputPath }) => inputPath),
  ...trackedFiles.filter((file) => file.startsWith('reference/semantic-oracle/')),
];
const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p03-007-'));
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

assert(
  snapshot.plan.includes(
    '- [ ] **P03-007** Define optional compression blocks, supported algorithms, block boundaries, and unknown-codec rejection.',
  ),
  'source commit must precede evidence/checklist closeout',
);

console.log(`PASS exact ${manifest.source_artifacts.length}-artifact P03-007 scope at ${commitArgument}`);
console.log(
  `PASS compression vectors: ${context.blockVectors} blocks, ${context.sectionVectors} streams, ${context.completeDocuments} HDocs/${context.completeBytes} bytes`,
);
console.log(
  `PASS bounded decode: 32 KiB blocks, 512-block/12 KiB-table maxima, stored/logical coordinate separation`,
);
console.log(
  `PASS canonicality: raw/LZ4, section/document selection, official-C alternate rejection, ${mutationCount} mutations`,
);
console.log(
  `PASS external provenance: ${context.externalSnapshots} hash-pinned source snapshots; replay is network-free`,
);
console.log(
  `PASS security boundary: unknown codec/profile/feature before decompression and no production dependency adoption`,
);
console.log(`PASS documentation: ${markdownFiles.length} Markdown files and ${localLinks} local links`);
console.log('PASS generated authority: 263-row matrix, rendered document, and fixture-generation report');
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const manifestPath = 'fixtures/hdoc/v1/manifest.json';
const schemaPath = 'fixtures/hdoc/v1/schema/manifest-v1.schema.json';
const manifest = JSON.parse(readFileSync(path.join(repository, manifestPath), 'utf8'));
const mode = process.argv[2] ?? '--check';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (program, args) =>
  execFileSync(program, args, {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
    maxBuffer: 64 * 1024 * 1024,
  });
const u32 = (bytes, offset) => bytes.readUInt32LE(offset);
const u64Hex = (bytes, offset) =>
  `0x${bytes.readBigUInt64LE(offset).toString(16).padStart(16, '0')}`;
const u32Hex = (bytes, offset) => `0x${bytes.readUInt32LE(offset).toString(16).padStart(8, '0')}`;

assert(
  ['--check', '--write'].includes(mode) && process.argv.length <= 3,
  'usage: node fixtures/hdoc/v1/check.mjs [--check|--write]',
);
const schemaProgram = `
import json,sys
from jsonschema import Draft202012Validator
schema=json.load(open(sys.argv[1],encoding='utf-8'))
value=json.load(open(sys.argv[2],encoding='utf-8'))
Draft202012Validator.check_schema(schema)
errors=sorted(Draft202012Validator(schema).iter_errors(value),key=lambda error:str(list(error.absolute_path)))
if errors:
  for error in errors[:20]: print(f"{list(error.absolute_path)}: {error.message}",file=sys.stderr)
  raise SystemExit(1)
`;
run('python3', [
  '-c',
  schemaProgram,
  path.join(repository, schemaPath),
  path.join(repository, manifestPath),
]);
assert(manifest.format.frozen === true, 'format is not frozen');
assert(manifest.cases.length === 24, 'case count mismatch');
assert(
  new Set(manifest.cases.map(({ id }) => id)).size === manifest.cases.length,
  'duplicate case ID',
);
assert(
  new Set(manifest.cases.map(({ path: file }) => file)).size === manifest.cases.length,
  'duplicate case path',
);
assert(
  manifest.cases.filter(({ kind }) => kind === 'positive').length === 4,
  'positive case count',
);
assert(manifest.cases.filter(({ kind }) => kind === 'invalid').length === 20, 'invalid case count');

const actualFiles = readdirSync(path.join(repository, 'fixtures/hdoc/v1/cases')).sort();
const expectedFiles = manifest.cases.map(({ path: file }) => path.basename(file)).sort();
assert(JSON.stringify(actualFiles) === JSON.stringify(expectedFiles), 'case inventory mismatch');
const coverage = new Set();
for (const fixture of manifest.cases) {
  assert(
    fixture.path === `fixtures/hdoc/v1/cases/${fixture.id}.hdoc`,
    `${fixture.id}: path mismatch`,
  );
  const absolute = path.join(repository, fixture.path);
  assert(statSync(absolute).isFile(), `${fixture.id}: file absent`);
  const bytes = readFileSync(absolute);
  assert(bytes.length === fixture.bytes, `${fixture.id}: byte length mismatch`);
  assert(sha256(bytes) === fixture.sha256, `${fixture.id}: SHA-256 mismatch`);
  fixture.coverage.forEach((item) => {
    coverage.add(item);
  });
  if (fixture.kind === 'positive') {
    assert(fixture.expected.result === 'accept', `${fixture.id}: positive result`);
    assert(
      bytes.subarray(0, 8).equals(Buffer.from('48444f430d0a1a0a', 'hex')),
      `${fixture.id}: header magic`,
    );
    const footer = u32(bytes, 44);
    assert(
      bytes.subarray(footer, footer + 8).equals(Buffer.from('48444f43454e440a', 'hex')),
      `${fixture.id}: footer magic`,
    );
    assert(
      bytes.length === fixture.expected.total_length &&
        u32(bytes, 20) === fixture.expected.total_length,
      `${fixture.id}: total length`,
    );
    assert(u32(bytes, 24) === fixture.expected.canonical_length, `${fixture.id}: canonical length`);
    assert(u32(bytes, 28) === fixture.expected.field_count, `${fixture.id}: field count`);
    assert(
      u32Hex(bytes, 16) === fixture.expected.document_flags_hex,
      `${fixture.id}: document flags`,
    );
    assert(
      u64Hex(bytes, 48) === fixture.expected.required_features_hex,
      `${fixture.id}: required features`,
    );
    assert(
      bytes.subarray(footer + 32, footer + 64).toString('hex') ===
        fixture.expected.content_hash_hex,
      `${fixture.id}: content hash`,
    );
  } else {
    assert(fixture.expected.result === 'reject', `${fixture.id}: invalid result`);
  }
}
for (const required of [
  'all-16-type-tags',
  'object-in-array',
  'array-in-array',
  'integer-min-max',
  'decimal-domain-edges',
  'temporal-min-max',
  'canonical-compression-selection',
  'unsupported-major',
  'unsupported-minor',
  'unknown-required-feature',
  'unsupported-optional-feature',
  'truncated-header',
  'trailing-byte',
  'stored-byte-crc',
  'section-overlap',
  'unknown-section-version',
  'unknown-type-tag',
  'footer-magic',
  'typed-content-hash',
  'unknown-compression-codec',
  'nonzero-padding',
  'field-count-limit',
  'compression-bomb-claim',
]) {
  assert(coverage.has(required), `coverage marker absent: ${required}`);
}
const producerMode = mode === '--write' ? '--write' : '--check';
const producer = run('cargo', [
  'run',
  '--frozen',
  '-p',
  'helix-doc',
  '--example',
  'hdoc_v1_golden',
  '--',
  producerMode,
]);
assert(
  producer.includes('PASS immutable HDoc 1.0 fixtures: 4 positive, 20 invalid, no overwrites'),
  'Rust producer/checker result',
);
console.log(
  `PASS HDoc 1.0 golden manifest: 24 immutable files, ${coverage.size} coverage identities`,
);
console.log('PASS HDoc 1.0 golden outcomes: 4 accepted, 20 exact rejections');

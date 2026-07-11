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
    throw new Error(`${message}: ${JSON.stringify(actual)}`);
  }
};
const sorted = (values) => [...values].sort();
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const gitBytes = (arguments_) =>
  execFileSync('git', arguments_, {
    cwd: repository,
    maxBuffer: 128 * 1024 * 1024,
  });
const gitText = (arguments_) => gitBytes(arguments_).toString('utf8');
const showBytes = (file, commit = manifest.commit) => gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.commit) =>
  new TextDecoder('utf-8', { fatal: true }).decode(showBytes(file, commit));

assert(commitArgument, 'usage: node evidence/phase-03/P03-004/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-004', 'evidence task mismatch');
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
  registrySource: sourceText('docs/formats/hdoc-v1-payloads.json'),
  payloadDocument: sourceText('docs/formats/hdoc-v1-payloads.md'),
  tagRegistrySource: sourceText('docs/formats/hdoc-v1-type-tags.json'),
  tagDocument: sourceText('docs/formats/hdoc-v1-type-tags.md'),
  envelopeDocument: sourceText('docs/formats/hdoc-v1.md'),
  formatIndex: sourceText('docs/formats/README.md'),
  specifications: sourceText('Specifications.md'),
  study: sourceText('Study.md'),
  docsIndex: sourceText('docs/README.md'),
  adr: sourceText('docs/adr/0012-use-bounded-little-endian-hdoc-v1.md'),
  matrix: sourceText('compatibility/v1/matrix-v1.json'),
  compatibilityDocument: sourceText('docs/compatibility/v1-semantic-compatibility-matrix.md'),
  generationReport: sourceText('fixtures/generation/report-v1.json'),
  plan: showText('ImplementationPlan.md'),
};

const expectedFormat = {
  name: 'HDoc',
  major_version: 1,
  minor_version: 0,
  type_tag_registry: 'docs/formats/hdoc-v1-type-tags.json',
  containing_length_owner: 'P03-005',
  integer_byte_order: 'little-endian',
  opaque_sequence_order: 'exact-as-documented',
  complete_noncontainer_payload_format: true,
  complete_container_payload_format: false,
  container_completion_owner: 'P03-005',
  complete_hdoc_format: false,
};
const expectedPayloads = [
  [1, '0x01', 'null', 'null', 1, 'fixed', '{"kind":"fixed","bytes":0}', 'empty', 'exactly-zero-payload-bytes'],
  [2, '0x02', 'bool', 'bool', 1, 'fixed', '{"kind":"fixed","bytes":1}', 'u8-boolean', '0x00-false-or-0x01-true-only'],
  [3, '0x03', 'int32', 'int32', 4, 'fixed', '{"kind":"fixed","bytes":4}', 'i32-le-twos-complement', 'all-signed-32-bit-values'],
  [4, '0x04', 'int64', 'int64', 8, 'fixed', '{"kind":"fixed","bytes":8}', 'i64-le-twos-complement', 'all-signed-64-bit-values'],
  [5, '0x05', 'float64', 'float64', 8, 'fixed', '{"kind":"fixed","bytes":8}', 'ieee-754-binary64-bits-le', 'all-64-bit-patterns-admitted-and-preserved'],
  [6, '0x06', 'decimal128', 'decimal128', 8, 'fixed', '{"kind":"fixed","bytes":16}', 'ieee-754-decimal128-bid-canonical-le', 'decode-canonicalize-reencode-byte-equality'],
  [7, '0x07', 'string', 'string', 1, 'containing-value-length', '{"kind":"containing-value-length","minimum_bytes":0,"maximum":"document-bound"}', 'canonical-utf8-bytes-without-prefix-or-terminator', 'complete-shortest-form-utf8-scalar-sequence'],
  [8, '0x08', 'binary', 'binary', 1, 'containing-value-length', '{"kind":"containing-value-length","minimum_bytes":1,"maximum":"document-bound","formula":"1 + data_bytes"}', 'subtype-u8-followed-by-exact-data-bytes', 'assigned-subtype-and-exact-data-bytes'],
  [11, '0x0b', 'timestamp', 'timestamp', 8, 'fixed', '{"kind":"fixed","bytes":8}', 'i64-le-unix-microseconds', 'inclusive--62135596800000000-through-253402300799999999'],
  [12, '0x0c', 'date', 'date', 4, 'fixed', '{"kind":"fixed","bytes":4}', 'i32-le-days-from-1970-01-01', 'inclusive--719162-through-2932896'],
  [13, '0x0d', 'uuid', 'uuid', 1, 'fixed', '{"kind":"fixed","bytes":16}', 'rfc-9562-network-order-octets', 'all-128-bit-payloads-preserved'],
  [14, '0x0e', 'object_id', 'objectId', 1, 'fixed', '{"kind":"fixed","bytes":12}', 'exact-objectid-octets', 'all-96-bit-payloads-preserved'],
  [15, '0x0f', 'vector_f32', 'vector<f32,N>', 4, 'dimensioned', '{"kind":"dimensioned","prefix_bytes":4,"element_bytes":4,"minimum_bytes":8,"maximum_bytes":16388,"formula":"4 + 4 * N"}', 'u32-le-dimension-followed-by-N-binary32-bits-le', '1-through-4096-elements-and-every-element-finite'],
  [16, '0x10', 'vector_f16', 'vector<f16,N>', 4, 'dimensioned', '{"kind":"dimensioned","prefix_bytes":4,"element_bytes":2,"minimum_bytes":6,"maximum_bytes":8196,"formula":"4 + 2 * N"}', 'u32-le-dimension-followed-by-N-binary16-bits-le', '1-through-4096-elements-and-every-element-finite'],
];
const expectedSubtypeAssigned = [[0, '0x00', 'generic', 'exact-uninterpreted-octets']];
const expectedSubtypeRanges = [
  [1, 63, '0x01', '0x3f', 'future-standard-subtypes', 'reject-unassigned', 'forbidden-until-registered', 'accepted-format-change'],
  [64, 127, '0x40', '0x7f', 'registered-semantic-extensions', 'reject-unless-feature-and-registry-understood', 'forbidden-until-registered', 'P03-015-or-successor'],
  [128, 239, '0x80', '0xef', 'experimental-private', 'reject-in-supported-hdoc', 'forbidden-in-supported-hdoc', 'explicit-experimental-profile-only'],
  [240, 254, '0xf0', '0xfe', 'future-control', 'reject', 'forbidden', 'future-major-format-only'],
  [255, 255, '0xff', '0xff', 'permanently-invalid', 'reject', 'forbidden', 'none'],
];
const expectedDecimal = {
  profile_id: 'hdoc-decimal128-bid-canonical-v1',
  bytes: 16,
  stored_byte_order: 'little-endian-unsigned-128',
  coefficient_encoding: 'binary-integer-decimal',
  precision_digits: 34,
  logical_exponent_min: -6176,
  logical_adjusted_exponent_max: 6144,
  wire_quantum_exponent_min: -6176,
  wire_quantum_exponent_max: 6111,
  exponent_bias: 6176,
  coefficient_limit_exclusive: '10000000000000000000000000000000000',
  finite_formula: 'B = (sign << 127) | ((wire_exponent + 6176) << 113) | wire_coefficient',
  canonicalization: {
    zero: 'coefficient=0, logical_exponent=0, preserve sign',
    nonzero: 'remove all trailing coefficient zeros while incrementing logical_exponent',
    high_exponent_shift: 'max(0, logical_exponent - 6111)',
    wire_coefficient: 'logical_coefficient * 10^high_exponent_shift',
    wire_exponent: 'logical_exponent - high_exponent_shift',
    decoder_rule: 'decode-to-logical-tuple-then-reencode-and-require-byte-equality',
  },
  finite_normal_form_only: true,
  specials: [
    ['positive-infinity', '78000000000000000000000000000000', '00000000000000000000000000000078'],
    ['negative-infinity', 'f8000000000000000000000000000000', '000000000000000000000000000000f8'],
    ['canonical-quiet-nan', '7c000000000000000000000000000000', '0000000000000000000000000000007c'],
  ],
  rejection_rules: [
    'coefficient-at-least-10^34',
    'steering-form-finite-encoding',
    'logical-cohort-alias',
    'nonzero-zero-exponent-alias',
    'noncanonical-infinity-bits',
    'negative-or-signaling-or-payload-nan',
    'out-of-domain-logical-tuple',
    'bytes-not-equal-to-canonical-reencoding',
  ],
};
const expectedVectorProfiles = [
  ['vector_f32', 'f32', 'u32-le', 1, 4096, 'ieee-754-binary32-bits-le', 4, 8, 23, 255, true],
  ['vector_f16', 'f16', 'u32-le', 1, 4096, 'ieee-754-binary16-bits-le', 2, 5, 10, 31, true],
];
const expectedRules = [
  ['containing-length-is-authoritative', 'P03-005 supplies one exact containing value_length; strings and binary values carry no second length prefix.'],
  ['no-host-layout-copy', 'Writers and readers use explicit byte operations and never copy or cast a host struct as a payload.'],
  ['minimal-alignment-padding', 'P03-005 places each payload at its listed alignment and permits only the minimum zero padding outside payload bytes.'],
  ['type-identity-preserved', 'Payload shape, magnitude, text, or byte count never retags a logical value.'],
  ['float64-bits-preserved', 'All binary64 bits, including signed zero and every NaN sign, signaling state, and payload, round trip unchanged.'],
  ['decimal128-one-encoding', 'Every admitted decimal logical tuple or special has exactly one canonical 16-byte BID payload.'],
  ['string-exact-utf8', 'A string payload is its complete canonical UTF-8 bytes with no normalization, prefix, terminator, repair, or alternate encoding.'],
  ['binary-subtype-first', 'A binary payload starts with one assigned subtype byte followed by exact uninterpreted data bytes.'],
  ['temporal-exact-integers', 'Timestamp and date payloads are range-checked signed little-endian counts in their accepted Unix-relative units.'],
  ['identifier-opaque-order', 'UUID and ObjectId payloads preserve their documented canonical opaque byte order rather than host field layout.'],
  ['vector-dimension-and-bits', 'A vector payload carries its exact positive u32 dimension followed by the exact finite element bits in order.'],
  ['exact-length-no-trailing-bytes', 'The containing value_length must equal the payload rule exactly; no payload admits ignored trailing bytes.'],
  ['unknown-subtype-fails-closed', 'An unassigned binary subtype is rejected before value exposure and is never guessed from its data.'],
  ['atomic-validation', 'No logical value or borrowed view is exposed until the complete HDoc structure, payloads, checksum, canonicality, limits, and typed content hash validate.'],
];
const expectedPositiveVectors = [
  ['null', 'null', 'null', ''],
  ['bool-false', 'bool', 'false', '00'],
  ['bool-true', 'bool', 'true', '01'],
  ['int32-min', 'int32', '-2147483648', '00000080'],
  ['int32-max', 'int32', '2147483647', 'ffffff7f'],
  ['int64-min', 'int64', '-9223372036854775808', '0000000000000080'],
  ['int64-max', 'int64', '9223372036854775807', 'ffffffffffffff7f'],
  ['float64-positive-zero', 'float64', 'bits:0x0000000000000000', '0000000000000000'],
  ['float64-negative-zero', 'float64', 'bits:0x8000000000000000', '0000000000000080'],
  ['float64-one', 'float64', 'bits:0x3ff0000000000000', '000000000000f03f'],
  ['float64-positive-infinity', 'float64', 'bits:0x7ff0000000000000', '000000000000f07f'],
  ['float64-negative-infinity', 'float64', 'bits:0xfff0000000000000', '000000000000f0ff'],
  ['float64-canonical-quiet-nan', 'float64', 'bits:0x7ff8000000000000', '000000000000f87f'],
  ['float64-signaling-nan-payload-one', 'float64', 'bits:0x7ff0000000000001', '010000000000f07f'],
  ['decimal128-positive-zero', 'decimal128', 'zero(sign=0)', '00000000000000000000000000004030'],
  ['decimal128-negative-zero', 'decimal128', 'zero(sign=1)', '000000000000000000000000000040b0'],
  ['decimal128-one', 'decimal128', 'finite(sign=0,coefficient=1,exponent=0)', '01000000000000000000000000004030'],
  ['decimal128-negative-12345', 'decimal128', 'finite(sign=1,coefficient=12345,exponent=0)', '393000000000000000000000000040b0'],
  ['decimal128-12-34', 'decimal128', 'finite(sign=0,coefficient=1234,exponent=-2)', 'd2040000000000000000000000003c30'],
  ['decimal128-smallest-positive', 'decimal128', 'finite(sign=0,coefficient=1,exponent=-6176)', '01000000000000000000000000000000'],
  ['decimal128-largest-positive', 'decimal128', 'finite(sign=0,coefficient=9999999999999999999999999999999999,exponent=6111)', 'ffffffff638e8d37c087adbe09edff5f'],
  ['decimal128-high-exponent-clamped', 'decimal128', 'finite(sign=0,coefficient=1,exponent=6144)', '000000000a5bc138938d44c64d31fe5f'],
  ['decimal128-positive-infinity', 'decimal128', '+Infinity', '00000000000000000000000000000078'],
  ['decimal128-negative-infinity', 'decimal128', '-Infinity', '000000000000000000000000000000f8'],
  ['decimal128-nan', 'decimal128', 'NaN', '0000000000000000000000000000007c'],
  ['string-empty', 'string', 'UTF-8 empty', ''],
  ['string-nul', 'string', 'UTF-8 U+0000', '00'],
  ['string-decomposed-e-acute', 'string', 'UTF-8 U+0065 U+0301', '65cc81'],
  ['string-slightly-smiling-face', 'string', 'UTF-8 U+1F642', 'f09f9982'],
  ['binary-generic-empty', 'binary', 'subtype=0,data=', '00'],
  ['binary-generic-00ff', 'binary', 'subtype=0,data=00ff', '0000ff'],
  ['timestamp-epoch', 'timestamp', '0 microseconds', '0000000000000000'],
  ['timestamp-min', 'timestamp', '-62135596800000000 microseconds', '0040d400014023ff'],
  ['timestamp-max', 'timestamp', '253402300799999999 microseconds', 'ff5f73cc0c448403'],
  ['date-epoch', 'date', '0 days', '00000000'],
  ['date-min', 'date', '-719162 days', 'c606f5ff'],
  ['date-max', 'date', '2932896 days', 'a0c02c00'],
  ['uuid-rfc-example', 'uuid', 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', 'f81d4fae7dec11d0a76500a0c91e6bf6'],
  ['objectid-example', 'objectId', '507f1f77bcf86cd799439011', '507f1f77bcf86cd799439011'],
  ['vector-f32-bits', 'vector<f32,N>', 'N=3,bits=[0x3f800000,0x80000000,0x00000001]', '030000000000803f0000008001000000'],
  ['vector-f16-bits', 'vector<f16,N>', 'N=3,bits=[0x3c00,0x8000,0x0001]', '03000000003c00800100'],
];
const expectedRejectionVectors = [
  ['bool-other-byte', 'bool', '02', 'boolean-byte-not-0-or-1'],
  ['string-overlong-nul', 'string', 'c080', 'noncanonical-utf8'],
  ['binary-missing-subtype', 'binary', '', 'binary-payload-shorter-than-one-byte'],
  ['binary-unassigned-subtype', 'binary', '01', 'unassigned-binary-subtype'],
  ['decimal128-cohort-alias-for-one', 'decimal128', '0a000000000000000000000000003e30', 'not-canonical-decimal-reencoding'],
  ['decimal128-zero-exponent-alias', 'decimal128', '00000000000000000000000000000000', 'zero-must-use-logical-exponent-zero'],
  ['decimal128-negative-nan', 'decimal128', '000000000000000000000000000000fc', 'only-canonical-positive-quiet-nan'],
  ['timestamp-below-min', 'timestamp', 'ff3fd400014023ff', 'timestamp-out-of-range'],
  ['timestamp-above-max', 'timestamp', '006073cc0c448403', 'timestamp-out-of-range'],
  ['date-below-min', 'date', 'c506f5ff', 'date-out-of-range'],
  ['date-above-max', 'date', 'a1c02c00', 'date-out-of-range'],
  ['uuid-short', 'uuid', '00', 'uuid-length-not-16'],
  ['objectid-long', 'objectId', '00000000000000000000000000', 'objectid-length-not-12'],
  ['vector-zero-dimension', 'vector<f32,N>', '00000000', 'dimension-out-of-range'],
  ['vector-f32-length-mismatch', 'vector<f32,N>', '01000000', 'payload-length-does-not-equal-4-plus-4N'],
  ['vector-f32-infinity', 'vector<f32,N>', '010000000000807f', 'nonfinite-vector-element'],
  ['vector-f16-nan', 'vector<f16,N>', '01000000007e', 'nonfinite-vector-element'],
];
const expectedExternalReferences = [
  ['mongodb-decimal128-specification', 'mongodb/specifications', 'd75d82b18b6f267dc00e75103105d48980181ef1', 'source/bson-decimal128/decimal128.md', 'BID coefficient and little-endian interchange baseline'],
  ['mongodb-decimal128-special-corpus', 'mongodb/specifications', 'd75d82b18b6f267dc00e75103105d48980181ef1', 'source/bson-corpus/tests/decimal128-1.json', 'independent BID zero, special, and ordinary payload vectors'],
  ['mongodb-decimal128-boundary-corpus', 'mongodb/specifications', 'd75d82b18b6f267dc00e75103105d48980181ef1', 'source/bson-corpus/tests/decimal128-5.json', 'independent BID clamped and subnormal boundary vectors'],
  ['libbson-decimal128-reference', 'mongodb/mongo-c-driver', 'd9691e85a8b5f70eca91a1a94d249a5accdc785a', 'src/libbson/src/bson/bson-decimal128.c', 'independent BID exponent, coefficient, special, and byte-order implementation'],
  ['rfc-9562', 'https://www.rfc-editor.org/rfc/rfc9562', 'UUID 16-octet network-order format'],
  ['ieee-754-2019', 'https://standards.ieee.org/ieee/754/6210/', 'binary and decimal floating interchange format authority'],
  ['unicode-utf8', 'https://www.unicode.org/versions/latest/core-spec/chapter-3/', 'canonical well-formed UTF-8 authority'],
];
const expectedHeadings = [
  '## Scope and maturity boundary',
  '## Normative notation',
  '## Common payload contract',
  '## Payload summary',
  '## Null and Boolean',
  '### Null',
  '### Boolean',
  '## Signed integers',
  '## Binary64 (`float64`)',
  '## Decimal128 canonical BID payload',
  '### Selected interchange encoding',
  '### Canonical logical domain',
  '### Finite BID mapping',
  '### Zero and specials',
  '### Canonical decoder test',
  '## String payload',
  '## Binary payload and subtype registry',
  '## Temporal payloads',
  '### Timestamp',
  '### Date',
  '## Identifier payloads',
  '### UUID',
  '### ObjectId',
  '## Vector payloads',
  '### Common layout',
  '### `vector<f32,N>`',
  '### `vector<f16,N>`',
  '## Placement, alignment, and length ownership',
  '## Validation order and atomic exposure',
  '## Canonicality and limits',
  '## Hashing, equality, and comparison boundary',
  '## Version, migration, and rollback',
  '## Subordinate ownership',
  '## Required validation cases',
  '## References',
];

const payloadTuples = (payloads) =>
  payloads.map(({ tag, tag_hex: tagHex, tag_name: tagName, logical_type: logicalType, alignment_bytes: alignment, length, encoding, validation }) =>
    [tag, tagHex, tagName, logicalType, alignment, length.kind, JSON.stringify(length), encoding, validation],
  );
const subtypeAssignedTuples = (entries) =>
  entries.map(({ subtype, subtype_hex: subtypeHex, name, semantics }) => [subtype, subtypeHex, name, semantics]);
const subtypeRangeTuples = (entries) =>
  entries.map(({ start, end, start_hex: startHex, end_hex: endHex, class: rangeClass, read_behavior: readBehavior, write_behavior: writeBehavior, allocation_owner: owner }) =>
    [start, end, startHex, endHex, rangeClass, readBehavior, writeBehavior, owner],
  );
const vectorProfileTuples = (entries) =>
  entries.map(({ tag_name: tagName, family, dimension_encoding: dimensionEncoding, dimension_minimum: minimum, dimension_maximum: maximum, element_encoding: elementEncoding, element_bytes: elementBytes, exponent_bits: exponentBits, fraction_bits: fractionBits, nonfinite_exponent: nonfiniteExponent, preserve_zero_sign: preserveZeroSign }) =>
    [tagName, family, dimensionEncoding, minimum, maximum, elementEncoding, elementBytes, exponentBits, fractionBits, nonfiniteExponent, preserveZeroSign],
  );
const ruleTuples = (entries) => entries.map(({ id, rule }) => [id, rule]);
const positiveVectorTuples = (entries) => entries.map(({ id, type, logical, payload_hex: payloadHex }) => [id, type, logical, payloadHex]);
const rejectionVectorTuples = (entries) => entries.map(({ id, type, payload_hex: payloadHex, reason }) => [id, type, payloadHex, reason]);
const externalReferenceTuples = (entries) => entries.map((entry) =>
  entry.repository === undefined
    ? [entry.id, entry.url, entry.role]
    : [entry.id, entry.repository, entry.commit, entry.path, entry.role],
);

const bytesFromHex = (hex) => {
  assert(/^(?:[0-9a-f]{2})*$/.test(hex), 'payload hex is not canonical lowercase octets');
  return Buffer.from(hex, 'hex');
};
const unsignedLittleEndian = (bytes) => {
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[index]);
  }
  return value;
};
const littleEndianBytes = (value, byteCount) => {
  let remaining = BigInt.asUintN(byteCount * 8, BigInt(value));
  const output = Buffer.alloc(byteCount);
  for (let index = 0; index < byteCount; index += 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
};
const decimalCoefficientMask = (1n << 113n) - 1n;
const decimalCoefficientLimit = 10n ** 34n;
const encodeFiniteDecimal = (sign, logicalCoefficient, logicalExponent) => {
  let coefficient = BigInt(logicalCoefficient);
  let exponent = logicalExponent;
  if (coefficient === 0n) {
    exponent = 0;
  } else {
    assert(coefficient > 0n && coefficient < decimalCoefficientLimit, 'decimal logical coefficient outside domain');
    assert(coefficient % 10n !== 0n, 'decimal logical coefficient has trailing zero');
    const digits = coefficient.toString().length;
    assert(exponent >= -6176 && exponent + digits - 1 <= 6144, 'decimal logical exponent outside domain');
  }
  const shift = Math.max(0, exponent - 6111);
  coefficient *= 10n ** BigInt(shift);
  exponent -= shift;
  const bits =
    (sign ? 1n << 127n : 0n) |
    (BigInt(exponent + 6176) << 113n) |
    coefficient;
  return littleEndianBytes(bits, 16);
};
const validateDecimal = (bytes, decimal) => {
  assert(bytes.length === 16, 'decimal-length');
  const hex = bytes.toString('hex');
  if (decimal.specials.some(([, , payloadHex]) => payloadHex === hex)) return;
  const bits = unsignedLittleEndian(bytes);
  const combination = Number((bits >> 122n) & 0x1fn);
  if (combination === 31) throw new Error('only-canonical-positive-quiet-nan');
  if (combination === 30) throw new Error('noncanonical-infinity-bits');
  if (combination >= 24) throw new Error('decimal-steering-or-special');
  const sign = Number(bits >> 127n);
  const biasedExponent = Number((bits >> 113n) & 0x3fffn);
  let coefficient = bits & decimalCoefficientMask;
  assert(biasedExponent <= 12287 && coefficient < decimalCoefficientLimit, 'decimal-domain');
  let exponent = biasedExponent - 6176;
  if (coefficient === 0n) {
    if (exponent !== 0) throw new Error('zero-must-use-logical-exponent-zero');
  } else {
    while (coefficient % 10n === 0n) {
      coefficient /= 10n;
      exponent += 1;
    }
    const digits = coefficient.toString().length;
    assert(exponent >= -6176 && exponent + digits - 1 <= 6144, 'decimal-domain');
  }
  if (!encodeFiniteDecimal(sign, coefficient, exponent).equals(bytes)) {
    throw new Error('not-canonical-decimal-reencoding');
  }
};
const validatePayload = (type, hex, decimal) => {
  const bytes = bytesFromHex(hex);
  switch (type) {
    case 'null':
      if (bytes.length !== 0) throw new Error('null-length');
      break;
    case 'bool':
      if (bytes.length !== 1) throw new Error('bool-length');
      if (bytes[0] > 1) throw new Error('boolean-byte-not-0-or-1');
      break;
    case 'int32':
      if (bytes.length !== 4) throw new Error('int32-length');
      break;
    case 'int64':
      if (bytes.length !== 8) throw new Error('int64-length');
      break;
    case 'float64':
      if (bytes.length !== 8) throw new Error('float64-length');
      break;
    case 'decimal128':
      validateDecimal(bytes, decimal);
      break;
    case 'string':
      try {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new Error('noncanonical-utf8');
      }
      break;
    case 'binary':
      if (bytes.length < 1) throw new Error('binary-payload-shorter-than-one-byte');
      if (bytes[0] !== 0) throw new Error('unassigned-binary-subtype');
      break;
    case 'timestamp': {
      if (bytes.length !== 8) throw new Error('timestamp-length');
      const value = BigInt.asIntN(64, unsignedLittleEndian(bytes));
      if (value < -62_135_596_800_000_000n || value > 253_402_300_799_999_999n) {
        throw new Error('timestamp-out-of-range');
      }
      break;
    }
    case 'date': {
      if (bytes.length !== 4) throw new Error('date-length');
      const value = BigInt.asIntN(32, unsignedLittleEndian(bytes));
      if (value < -719_162n || value > 2_932_896n) throw new Error('date-out-of-range');
      break;
    }
    case 'uuid':
      if (bytes.length !== 16) throw new Error('uuid-length-not-16');
      break;
    case 'objectId':
      if (bytes.length !== 12) throw new Error('objectid-length-not-12');
      break;
    case 'vector<f32,N>':
    case 'vector<f16,N>': {
      if (bytes.length < 4) throw new Error('vector-prefix');
      const dimension = bytes.readUInt32LE(0);
      const elementBytes = type === 'vector<f32,N>' ? 4 : 2;
      if (dimension < 1 || dimension > 4096) throw new Error('dimension-out-of-range');
      if (bytes.length !== 4 + dimension * elementBytes) {
        throw new Error(`payload-length-does-not-equal-4-plus-${elementBytes}N`);
      }
      for (let offset = 4; offset < bytes.length; offset += elementBytes) {
        const bits = elementBytes === 4 ? bytes.readUInt32LE(offset) : bytes.readUInt16LE(offset);
        const exponent = elementBytes === 4 ? (bits >>> 23) & 0xff : (bits >>> 10) & 0x1f;
        if (exponent === (elementBytes === 4 ? 0xff : 0x1f)) {
          throw new Error('nonfinite-vector-element');
        }
      }
      break;
    }
    default:
      throw new Error(`unknown payload type: ${type}`);
  }
};

const validateContract = (candidate) => {
  const registry = JSON.parse(candidate.registrySource);
  assert(candidate.registrySource === jsonBytes(registry).toString('utf8'), 'machine registry is not canonical JSON');
  assert(registry.schema === 'helix.hdoc-payload-registry/1', 'registry schema mismatch');
  same(registry.format, expectedFormat, 'format maturity/ownership mismatch');
  same(payloadTuples(registry.payloads), expectedPayloads, 'payload registry mismatch');
  assert(registry.payloads.length === manifest.verification.payload_types, 'payload type count mismatch');

  const tagRegistry = JSON.parse(candidate.tagRegistrySource);
  const noncontainerTags = tagRegistry.tags.filter(({ tag_name: name }) => name !== 'object' && name !== 'array');
  same(
    registry.payloads.map(({ tag, tag_name: name, logical_type: type }) => [tag, name, type]),
    noncontainerTags.map(({ tag, tag_name: name, logical_type: type }) => [tag, name, type]),
    'type-tag/payload reconciliation mismatch',
  );
  for (const payload of registry.payloads) {
    assert([1, 2, 4, 8].includes(payload.alignment_bytes), 'payload alignment outside portable set');
    assert(payload.alignment_bytes <= 8, 'payload alignment exceeds cap');
  }
  same(subtypeAssignedTuples(registry.binary_subtypes.assigned), expectedSubtypeAssigned, 'binary subtype assignment mismatch');
  same(subtypeRangeTuples(registry.binary_subtypes.reserved_ranges), expectedSubtypeRanges, 'binary subtype range mismatch');
  assert(registry.binary_subtypes.width_bits === 8, 'binary subtype width mismatch');
  assert(registry.binary_subtypes.unknown_behavior === 'reject-before-value-exposure', 'binary unknown behavior mismatch');
  const subtypeClassification = Array(256).fill(null);
  for (const entry of registry.binary_subtypes.assigned) {
    assert(subtypeClassification[entry.subtype] === null, 'binary subtype classified twice');
    subtypeClassification[entry.subtype] = `assigned:${entry.name}`;
  }
  for (const range of registry.binary_subtypes.reserved_ranges) {
    assert(range.start_hex === `0x${range.start.toString(16).padStart(2, '0')}`, 'binary subtype start hex mismatch');
    assert(range.end_hex === `0x${range.end.toString(16).padStart(2, '0')}`, 'binary subtype end hex mismatch');
    for (let value = range.start; value <= range.end; value += 1) {
      assert(subtypeClassification[value] === null, 'binary subtype classified twice');
      subtypeClassification[value] = `reserved:${range.class}`;
    }
  }
  assert(subtypeClassification.every(Boolean), 'binary subtype byte space has a gap');
  assert(subtypeClassification.length === manifest.verification.classified_binary_subtypes, 'binary subtype classification count mismatch');

  const decimal = {
    ...registry.decimal128_bid,
    specials: registry.decimal128_bid.specials.map(({ class: valueClass, bits_hex: bitsHex, payload_hex: payloadHex }) => [valueClass, bitsHex, payloadHex]),
  };
  same(decimal, expectedDecimal, 'decimal128 BID registry mismatch');
  same(vectorProfileTuples(registry.vector_profiles), expectedVectorProfiles, 'vector profile registry mismatch');
  same(ruleTuples(registry.rules), expectedRules, 'payload governing rules mismatch');
  same(positiveVectorTuples(registry.test_vectors), expectedPositiveVectors, 'positive payload vector registry mismatch');
  same(rejectionVectorTuples(registry.rejection_vectors), expectedRejectionVectors, 'rejection payload vector registry mismatch');
  same(externalReferenceTuples(registry.external_reference_snapshots), expectedExternalReferences, 'external reference snapshot mismatch');
  same(
    registry.fixture_boundary,
    { payload_vectors_are_normative: true, complete_hdoc_vectors: false, complete_hdoc_vector_owner: 'P03-016' },
    'fixture maturity boundary mismatch',
  );
  assert(registry.rules.length === manifest.verification.registry_rules, 'payload rule count mismatch');
  assert(registry.test_vectors.length === manifest.verification.positive_vectors, 'positive vector count mismatch');
  assert(registry.rejection_vectors.length === manifest.verification.rejection_vectors, 'rejection vector count mismatch');
  assert(registry.external_reference_snapshots.length === manifest.verification.external_references, 'external reference count mismatch');
  assert(new Set(registry.test_vectors.map(({ id }) => id)).size === registry.test_vectors.length, 'duplicate positive vector ID');
  assert(new Set(registry.rejection_vectors.map(({ id }) => id)).size === registry.rejection_vectors.length, 'duplicate rejection vector ID');
  for (const vector of registry.test_vectors) validatePayload(vector.type, vector.payload_hex, decimal);
  for (const vector of registry.rejection_vectors) {
    let rejection;
    try {
      validatePayload(vector.type, vector.payload_hex, decimal);
    } catch (error) {
      rejection = error;
    }
    assert(rejection, `${vector.id}: rejection vector was accepted`);
    assert(rejection.message === vector.reason, `${vector.id}: wrong rejection: ${rejection.message}`);
  }
  assert(
    encodeFiniteDecimal(0, 1n, 6144).toString('hex') === '000000000a5bc138938d44c64d31fe5f',
    'independent decimal high-exponent replay mismatch',
  );
  assert(
    encodeFiniteDecimal(0, decimalCoefficientLimit - 1n, 6111).toString('hex') === 'ffffffff638e8d37c087adbe09edff5f',
    'independent decimal maximum replay mismatch',
  );

  const headings = candidate.payloadDocument.split('\n').filter((line) => /^#{2,3} /.test(line));
  same(headings, expectedHeadings, 'payload document heading inventory mismatch');
  for (const marker of [
    'This document assigns the exact canonical payload bytes for every HDoc 1.0 noncontainer logical',
    'An empty string and null both have zero payload bytes',
    'Every other byte, including `02` and `ff`, is noncanonical corruption',
    'SDK return must preserve\nall 64 bits',
    'B = (sign << 127) | (E << 113) | Cwire',
    'Step 7 rejects every cohort alias.',
    'HDoc 1.0 assigns only subtype `0x00`',
    '-62_135_596_800_000_000',
    'UUID is the exact 16 octets in the network/big-endian field order',
    'len(payload) = 4 + 4N',
    'len(payload) = 4 + 2N',
    'Until P03-005 assigns those records/order/offset rules',
    'no valid HDoc fixture/persisted database exists',
  ]) assert(candidate.payloadDocument.includes(marker), `payload semantic marker absent: ${marker}`);
  for (const [tag, tagHex, , logicalType, alignment] of expectedPayloads) {
    const displayedType = logicalType === 'bool'
      ? 'Boolean'
      : logicalType === 'objectId'
        ? 'ObjectId'
        : logicalType === 'uuid'
          ? 'UUID'
          : logicalType.startsWith('vector<')
            ? `\`${logicalType}\``
            : logicalType;
    assert(candidate.payloadDocument.includes(`| \`${tagHex}\` | ${displayedType} | ${alignment} |`), `payload summary row absent: ${tag}`);
  }
  for (const [, , , payloadHex] of expectedPositiveVectors.filter(([, type]) => type === 'decimal128')) {
    assert(candidate.registrySource.includes(payloadHex), `decimal vector absent: ${payloadHex}`);
  }

  const payloadPath = 'docs/formats/hdoc-v1-payloads.md';
  const registryPath = 'docs/formats/hdoc-v1-payloads.json';
  assert(candidate.specifications.includes(payloadPath), 'specification payload backlink absent');
  assert(candidate.specifications.includes(registryPath), 'specification machine-payload backlink absent');
  assert(candidate.specifications.includes('canonical decimal128 BID'), 'specification decimal summary absent');
  assert(candidate.study.includes(payloadPath), 'study payload backlink absent');
  assert(candidate.study.includes('canonical decimal128 BID mapping'), 'study decimal payload summary absent');
  assert(candidate.formatIndex.includes('[HDoc noncontainer payloads](hdoc-v1-payloads.md)'), 'format index payload entry absent');
  assert(candidate.formatIndex.includes('[Payload registry](hdoc-v1-payloads.json)'), 'format index machine entry absent');
  assert(candidate.docsIndex.includes('[HDoc 1.0 noncontainer payloads](formats/hdoc-v1-payloads.md)'), 'documentation index payload entry absent');
  assert(candidate.envelopeDocument.includes('[HDoc 1.0 payload registry](hdoc-v1-payloads.md)'), 'parent envelope payload backlink absent');
  assert(candidate.tagDocument.includes('[HDoc 1.0 payload registry](hdoc-v1-payloads.md)'), 'type-tag document payload backlink absent');
  assert(candidate.adr.includes('- [x] Freeze canonical noncontainer payload encodings and binary-subtype ranges under `P03-004`.'), 'ADR validation state mismatch');
  assert(candidate.adr.includes('- [x] `P03-004`: publish exact canonical scalar, byte-sequence, temporal, identifier, and vector'), 'ADR follow-up state mismatch');
  assert(candidate.adr.includes('../formats/hdoc-v1-payloads.md'), 'ADR payload reference absent');
  assert(candidate.plan.includes('- [ ] **P03-004** Define canonical encodings for integers, floats, decimals, timestamps, dates, UUIDs, ObjectIds, binary values, and vectors.'), 'source plan state/task text mismatch');

  const specificationBytes = Buffer.from(candidate.specifications, 'utf8');
  const matrix = JSON.parse(candidate.matrix);
  same(
    matrix.inputs.specifications,
    { path: 'Specifications.md', bytes: specificationBytes.length, sha256: sha256(specificationBytes) },
    'matrix specification identity mismatch',
  );
  assert(matrix.verdict === 'pass' && matrix.counts.native_rows === 263, 'matrix verdict/count mismatch');
  assert(matrix.counts.failed === 0 && matrix.counts.skipped === 0, 'matrix failure/skip mismatch');
  assert(
    candidate.compatibilityDocument.includes(
      `| \`specifications\` | [Specifications.md](../../Specifications.md) | \`${sha256(specificationBytes)}\` | ${specificationBytes.length} |`,
    ),
    'rendered compatibility specification identity mismatch',
  );
  const generationReport = JSON.parse(candidate.generationReport);
  const compatibilityGenerator = generationReport.generators.find(({ id }) => id === 'compatibility.matrix-v1');
  assert(compatibilityGenerator, 'generation report compatibility generator absent');
  same(
    compatibilityGenerator.artifacts,
    [
      {
        path: 'compatibility/v1/matrix-v1.json',
        format: 'json',
        schema_path: 'compatibility/v1/schema/matrix-v1.schema.json',
        bytes: Buffer.byteLength(candidate.matrix),
        sha256: sha256(Buffer.from(candidate.matrix, 'utf8')),
      },
      {
        path: 'docs/compatibility/v1-semantic-compatibility-matrix.md',
        format: 'markdown',
        schema_path: null,
        bytes: Buffer.byteLength(candidate.compatibilityDocument),
        sha256: sha256(Buffer.from(candidate.compatibilityDocument, 'utf8')),
      },
    ],
    'generation report compatibility identities mismatch',
  );
  assert(generationReport.verdict === 'pass', 'generation report verdict mismatch');
};

validateContract(snapshot);

const withRegistryMutation = (candidate, mutate) => {
  const value = JSON.parse(candidate.registrySource);
  mutate(value);
  candidate.registrySource = jsonBytes(value).toString('utf8');
};
const replaceOnce = (source, from, to) => {
  assert(source.includes(from), `canary source absent: ${from}`);
  assert(source.indexOf(from) === source.lastIndexOf(from), `canary source not unique: ${from}`);
  return source.replace(from, to);
};
const expectRejection = (label, mutate, expectedReason) => {
  const candidate = { ...snapshot };
  mutate(candidate);
  let rejection;
  try {
    validateContract(candidate);
  } catch (error) {
    rejection = error;
  }
  assert(rejection, `${label}: mutation was accepted`);
  assert(rejection.message.includes(expectedReason), `${label}: wrong rejection: ${rejection.message}`);
};

const canaries = [
  ['canonical JSON', (c) => { c.registrySource = JSON.stringify(JSON.parse(c.registrySource)); }, 'machine registry is not canonical JSON'],
  ['schema', (c) => withRegistryMutation(c, (v) => { v.schema = 'helix.hdoc-payload-registry/2'; }), 'registry schema mismatch'],
  ['tag registry owner', (c) => withRegistryMutation(c, (v) => { v.format.type_tag_registry = 'missing.json'; }), 'format maturity/ownership mismatch'],
  ['integer byte order', (c) => withRegistryMutation(c, (v) => { v.format.integer_byte_order = 'native'; }), 'format maturity/ownership mismatch'],
  ['noncontainer maturity', (c) => withRegistryMutation(c, (v) => { v.format.complete_noncontainer_payload_format = false; }), 'format maturity/ownership mismatch'],
  ['container maturity', (c) => withRegistryMutation(c, (v) => { v.format.complete_container_payload_format = true; }), 'format maturity/ownership mismatch'],
  ['null length', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'null').length.bytes = 1; }), 'payload registry mismatch'],
  ['bool encoding', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'bool').encoding = 'host-bool'; }), 'payload registry mismatch'],
  ['int32 alignment', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'int32').alignment_bytes = 8; }), 'payload registry mismatch'],
  ['int64 width', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'int64').length.bytes = 4; }), 'payload registry mismatch'],
  ['float preservation', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'float64').validation = 'canonical-nan-only'; }), 'payload registry mismatch'],
  ['decimal encoding', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'decimal128').encoding = 'dpd'; }), 'payload registry mismatch'],
  ['string minimum', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'string').length.minimum_bytes = 1; }), 'payload registry mismatch'],
  ['binary formula', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'binary').length.formula = 'data_bytes'; }), 'payload registry mismatch'],
  ['timestamp validation', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'timestamp').validation = 'all-i64'; }), 'payload registry mismatch'],
  ['date alignment', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'date').alignment_bytes = 8; }), 'payload registry mismatch'],
  ['UUID byte order', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'uuid').encoding = 'guid-memory-order'; }), 'payload registry mismatch'],
  ['ObjectId width', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'object_id').length.bytes = 16; }), 'payload registry mismatch'],
  ['f32 vector formula', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'vector_f32').length.formula = '4 * N'; }), 'payload registry mismatch'],
  ['f16 vector maximum', (c) => withRegistryMutation(c, (v) => { v.payloads.find((p) => p.tag_name === 'vector_f16').length.maximum_bytes = 8194; }), 'payload registry mismatch'],
  ['payload inventory', (c) => withRegistryMutation(c, (v) => { v.payloads.pop(); }), 'payload registry mismatch'],
  ['binary subtype assignment', (c) => withRegistryMutation(c, (v) => { v.binary_subtypes.assigned[0].subtype = 1; }), 'binary subtype assignment mismatch'],
  ['binary subtype width', (c) => withRegistryMutation(c, (v) => { v.binary_subtypes.width_bits = 16; }), 'binary subtype width mismatch'],
  ['binary range start', (c) => withRegistryMutation(c, (v) => { v.binary_subtypes.reserved_ranges[0].start = 2; }), 'binary subtype range mismatch'],
  ['binary extension class', (c) => withRegistryMutation(c, (v) => { v.binary_subtypes.reserved_ranges[1].class = 'vendor'; }), 'binary subtype range mismatch'],
  ['binary private behavior', (c) => withRegistryMutation(c, (v) => { v.binary_subtypes.reserved_ranges[2].read_behavior = 'accept'; }), 'binary subtype range mismatch'],
  ['binary control owner', (c) => withRegistryMutation(c, (v) => { v.binary_subtypes.reserved_ranges[3].allocation_owner = 'current-major'; }), 'binary subtype range mismatch'],
  ['decimal bias', (c) => withRegistryMutation(c, (v) => { v.decimal128_bid.exponent_bias = 6175; }), 'decimal128 BID registry mismatch'],
  ['decimal coefficient limit', (c) => withRegistryMutation(c, (v) => { v.decimal128_bid.coefficient_limit_exclusive = '1' + '0'.repeat(33); }), 'decimal128 BID registry mismatch'],
  ['decimal formula', (c) => withRegistryMutation(c, (v) => { v.decimal128_bid.finite_formula = 'host decimal bits'; }), 'decimal128 BID registry mismatch'],
  ['decimal zero canonicalization', (c) => withRegistryMutation(c, (v) => { v.decimal128_bid.canonicalization.zero = 'any exponent'; }), 'decimal128 BID registry mismatch'],
  ['decimal high shift', (c) => withRegistryMutation(c, (v) => { v.decimal128_bid.canonicalization.high_exponent_shift = '0'; }), 'decimal128 BID registry mismatch'],
  ['decimal infinity bits', (c) => withRegistryMutation(c, (v) => { v.decimal128_bid.specials[0].bits_hex = '0'.repeat(32); }), 'decimal128 BID registry mismatch'],
  ['decimal NaN payload', (c) => withRegistryMutation(c, (v) => { v.decimal128_bid.specials[2].payload_hex = '0'.repeat(32); }), 'decimal128 BID registry mismatch'],
  ['decimal rejection inventory', (c) => withRegistryMutation(c, (v) => { v.decimal128_bid.rejection_rules.pop(); }), 'decimal128 BID registry mismatch'],
  ['f32 exponent width', (c) => withRegistryMutation(c, (v) => { v.vector_profiles[0].exponent_bits = 7; }), 'vector profile registry mismatch'],
  ['f16 dimension maximum', (c) => withRegistryMutation(c, (v) => { v.vector_profiles[1].dimension_maximum = 4095; }), 'vector profile registry mismatch'],
  ['rule ID', (c) => withRegistryMutation(c, (v) => { v.rules[0].id = 'duplicate-length-prefix'; }), 'payload governing rules mismatch'],
  ['host layout rule', (c) => withRegistryMutation(c, (v) => { v.rules.find((r) => r.id === 'no-host-layout-copy').rule = 'Host structs may be copied.'; }), 'payload governing rules mismatch'],
  ['positive vector byte', (c) => withRegistryMutation(c, (v) => { v.test_vectors.find((x) => x.id === 'int32-min').payload_hex = '00000000'; }), 'positive payload vector registry mismatch'],
  ['positive vector inventory', (c) => withRegistryMutation(c, (v) => { v.test_vectors.pop(); }), 'positive payload vector registry mismatch'],
  ['rejection vector reason', (c) => withRegistryMutation(c, (v) => { v.rejection_vectors[0].reason = 'accepted'; }), 'rejection payload vector registry mismatch'],
  ['rejection vector inventory', (c) => withRegistryMutation(c, (v) => { v.rejection_vectors.pop(); }), 'rejection payload vector registry mismatch'],
  ['external reference commit', (c) => withRegistryMutation(c, (v) => { v.external_reference_snapshots[0].commit = '0'.repeat(40); }), 'external reference snapshot mismatch'],
  ['fixture completion', (c) => withRegistryMutation(c, (v) => { v.fixture_boundary.complete_hdoc_vectors = true; }), 'fixture maturity boundary mismatch'],
  ['scope prose', (c) => { c.payloadDocument = replaceOnce(c.payloadDocument, 'This document assigns the exact canonical payload bytes for every HDoc 1.0 noncontainer logical', 'This document suggests optional bytes for each logical'); }, 'payload semantic marker absent'],
  ['empty/null prose', (c) => { c.payloadDocument = replaceOnce(c.payloadDocument, 'An empty string and null both have zero payload bytes', 'Empty string is encoded as null'); }, 'payload semantic marker absent'],
  ['Boolean prose', (c) => { c.payloadDocument = replaceOnce(c.payloadDocument, 'Every other byte, including `02` and `ff`, is noncanonical corruption', 'Other Boolean bytes are accepted'); }, 'payload semantic marker absent'],
  ['float prose', (c) => { c.payloadDocument = replaceOnce(c.payloadDocument, 'SDK return must preserve\nall 64 bits', 'SDK return may canonicalize NaN bits'); }, 'payload semantic marker absent'],
  ['decimal formula prose', (c) => { c.payloadDocument = replaceOnce(c.payloadDocument, 'B = (sign << 127) | (E << 113) | Cwire', 'B = host_decimal'); }, 'payload semantic marker absent'],
  ['decimal cohort prose', (c) => { c.payloadDocument = replaceOnce(c.payloadDocument, 'Step 7 rejects every cohort alias.', 'Step 7 accepts cohort aliases.'); }, 'payload semantic marker absent'],
  ['binary subtype prose', (c) => { c.payloadDocument = replaceOnce(c.payloadDocument, 'HDoc 1.0 assigns only subtype `0x00`', 'HDoc assigns every subtype'); }, 'payload semantic marker absent'],
  ['timestamp bound prose', (c) => { c.payloadDocument = replaceOnce(c.payloadDocument, '-62_135_596_800_000_000', '-62_135_596_799_999_999'); }, 'payload semantic marker absent'],
  ['UUID order prose', (c) => { c.payloadDocument = replaceOnce(c.payloadDocument, 'UUID is the exact 16 octets in the network/big-endian field order', 'UUID uses host field order'); }, 'payload semantic marker absent'],
  ['f32 length prose', (c) => { c.payloadDocument = replaceOnce(c.payloadDocument, 'len(payload) = 4 + 4N', 'len(payload) = 4N'); }, 'payload semantic marker absent'],
  ['f16 length prose', (c) => { c.payloadDocument = replaceOnce(c.payloadDocument, 'len(payload) = 4 + 2N', 'len(payload) = 2N'); }, 'payload semantic marker absent'],
  ['P03-005 boundary prose', (c) => { c.payloadDocument = replaceOnce(c.payloadDocument, 'Until P03-005 assigns those records/order/offset rules', 'P03-004 assigns all record positions'); }, 'payload semantic marker absent'],
  ['specification link', (c) => { c.specifications = replaceOnce(c.specifications, 'docs/formats/hdoc-v1-payloads.json', 'docs/formats/missing.json'); }, 'specification machine-payload backlink absent'],
  ['study link', (c) => { c.study = replaceOnce(c.study, 'docs/formats/hdoc-v1-payloads.md', 'docs/formats/missing.md'); }, 'study payload backlink absent'],
  ['format index', (c) => { c.formatIndex = replaceOnce(c.formatIndex, '[HDoc noncontainer payloads](hdoc-v1-payloads.md)', 'HDoc payloads omitted'); }, 'format index payload entry absent'],
  ['documentation index', (c) => { c.docsIndex = replaceOnce(c.docsIndex, '[HDoc 1.0 noncontainer payloads](formats/hdoc-v1-payloads.md)', 'HDoc payloads omitted'); }, 'documentation index payload entry absent'],
  ['parent envelope link', (c) => { c.envelopeDocument = replaceOnce(c.envelopeDocument, '[HDoc 1.0 payload registry](hdoc-v1-payloads.md)', 'HDoc payload registry'); }, 'parent envelope payload backlink absent'],
  ['type-tag link', (c) => { c.tagDocument = replaceOnce(c.tagDocument, '[HDoc 1.0 payload registry](hdoc-v1-payloads.md)', 'HDoc payload registry'); }, 'type-tag document payload backlink absent'],
  ['ADR completion', (c) => { c.adr = replaceOnce(c.adr, '- [x] Freeze canonical noncontainer payload encodings and binary-subtype ranges under `P03-004`.', '- [ ] Freeze canonical noncontainer payload encodings and binary-subtype ranges under `P03-004`.'); }, 'ADR validation state mismatch'],
  ['source plan state', (c) => { c.plan = replaceOnce(c.plan, '- [ ] **P03-004**', '- [x] **P03-004**'); }, 'source plan state/task text mismatch'],
  ['matrix specification hash', (c) => { const value = JSON.parse(c.matrix); value.inputs.specifications.sha256 = '0'.repeat(64); c.matrix = jsonBytes(value).toString('utf8'); }, 'matrix specification identity mismatch'],
  ['generation report hash', (c) => { const value = JSON.parse(c.generationReport); value.generators.find(({ id }) => id === 'compatibility.matrix-v1').artifacts[0].sha256 = '0'.repeat(64); c.generationReport = jsonBytes(value).toString('utf8'); }, 'generation report compatibility identities mismatch'],
];

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
assert(snapshot.payloadDocument.split('\n').length - 1 === manifest.verification.payload_document_lines, 'payload document line count mismatch');
assert(expectedHeadings.length === manifest.verification.payload_document_headings, 'payload heading count mismatch');
assert(snapshot.registrySource.split('\n').length - 1 === manifest.verification.registry_lines, 'machine registry line count mismatch');
assert(Buffer.byteLength(snapshot.registrySource) === manifest.verification.registry_bytes, 'machine registry byte count mismatch');

const matrixReplayPaths = [
  'Specifications.md',
  'compatibility/v1/generate-matrix.mjs',
  'compatibility/v1/matrix-v1.json',
  'docs/compatibility/v1-semantic-compatibility-matrix.md',
  ...Object.values(JSON.parse(snapshot.matrix).inputs).map(({ path: inputPath }) => inputPath),
  ...trackedFiles.filter((file) => file.startsWith('reference/semantic-oracle/')),
];
const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p03-004-'));
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
  assert(generatorOutput.includes('PASS semantic compatibility matrix: 263 native rows'), 'isolated matrix replay did not pass');
  assert(generatorOutput.includes('PASS matrix inputs: 9 hash-bound artifacts'), 'isolated matrix input count mismatch');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact ${manifest.source_artifacts.length}-artifact P03-004 scope at ${commitArgument}`);
console.log(`PASS payload registry: ${manifest.verification.payload_types} noncontainer types, ${manifest.verification.registry_rules} governing rules`);
console.log(`PASS payload vectors: ${manifest.verification.positive_vectors}/${manifest.verification.positive_vectors} accepted, ${manifest.verification.rejection_vectors}/${manifest.verification.rejection_vectors} rejected with exact reasons`);
console.log(`PASS decimal BID: 16 bytes, exponent bias 6176, canonical cohort re-encoding, independent min/max/clamp/special vectors`);
console.log(`PASS binary/vector domains: ${manifest.verification.classified_binary_subtypes}/256 subtypes classified, ${manifest.verification.vector_profiles} finite dimensioned vector profiles`);
console.log(`PASS mutation canaries: ${canaries.length}/${canaries.length} intended rejections`);
console.log(`PASS documentation: ${markdownFiles.length} Markdown files and ${localLinks} local links`);
console.log('PASS generated authority: 263-row matrix, rendered document, and fixture-generation report');
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

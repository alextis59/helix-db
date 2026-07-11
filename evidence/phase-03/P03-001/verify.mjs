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
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (arguments_) =>
  execFileSync('git', arguments_, {
    cwd: repository,
    maxBuffer: 128 * 1024 * 1024,
  });
const gitText = (arguments_) => gitBytes(arguments_).toString('utf8');
const showBytes = (file, commit = manifest.commit) =>
  gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.commit) =>
  new TextDecoder('utf-8', { fatal: true }).decode(showBytes(file, commit));
const sorted = (values) => [...values].sort();

assert(commitArgument, 'usage: node evidence/phase-03/P03-001/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-001', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(
  manifest.requirements,
  ['CORE-001', 'DATA-001', 'DATA-002', 'INV-001', 'INV-007', 'SEC-001', 'SEC-002'],
  'requirements inventory mismatch',
);
same(manifest.accepted_adrs, ['0012'], 'accepted ADR inventory mismatch');
same(
  manifest.hosted_runs,
  [
    {
      run_id: 29145320680,
      head_sha: '0aa2847813fb9cd959dddd45c523968b13c35737',
      conclusion: 'failure',
      jobs: 12,
      successful_jobs: 10,
      failed_jobs: ['Node 22.23.1 / Linux x64', 'Node 24.18.0 / Linux x64'],
      reason: 'fixture-generation report retained the previous compatibility matrix and rendered-document identities',
    },
    {
      run_id: 29145494980,
      head_sha: '0e40ad87034902fb53bf0aad277a80a79dc3a7a0',
      conclusion: 'success',
      jobs: 12,
      successful_jobs: 12,
      failed_jobs: [],
      reason: 'superseding exact-head gating run after deterministic report regeneration',
    },
  ],
  'hosted run observation mismatch',
);
same(
  manifest.source_commits,
  [
    'ae7bf86ec117d2d1d550a9cb6d1087b7f402402f',
    '0e40ad87034902fb53bf0aad277a80a79dc3a7a0',
  ],
  'source commit inventory mismatch',
);
assert(
  gitText(['rev-parse', `${manifest.source_commits[0]}^`]).trim() === manifest.base_commit,
  'decision source parent mismatch',
);
assert(
  gitText(['rev-parse', `${manifest.intervening_evidence_commit}^`]).trim() ===
    manifest.source_commits[0],
  'initial evidence parent mismatch',
);
assert(
  gitText(['rev-parse', `${manifest.source_commits[1]}^`]).trim() ===
    manifest.intervening_evidence_commit,
  'generator-identity hardening parent mismatch',
);
assert(
  gitText(['rev-parse', `${commitArgument}^{tree}`]).trim() === manifest.source_tree,
  'source tree mismatch',
);

const verifierBytes = readFileSync(scriptPath);
assert(
  statSync(scriptPath).size === manifest.verifier.bytes,
  'verifier byte count mismatch',
);
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256 mismatch');

const changedRecords = manifest.source_commits.flatMap((sourceCommit) => {
  gitText(['diff', '--check', `${sourceCommit}^`, sourceCommit]);
  return gitText([
    'diff-tree',
    '--no-commit-id',
    '--name-status',
    '-r',
    sourceCommit,
  ])
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, ...names] = line.split('\t');
      return { status, path: names.at(-1) };
    });
});
same(
  sorted(changedRecords.map((record) => JSON.stringify(record))),
  sorted(manifest.source_artifacts.map(({ status, path: artifactPath }) =>
    JSON.stringify({ status, path: artifactPath }),
  )),
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

const text = (file) => {
  const bytes = sourceBytes.get(file) ?? showBytes(file);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};
const snapshot = {
  adr: text('docs/adr/0012-use-bounded-little-endian-hdoc-v1.md'),
  index: text('docs/adr/README.md'),
  owners: text('docs/governance/decision-owners.md'),
  specifications: text('Specifications.md'),
  study: text('Study.md'),
  matrix: text('compatibility/v1/matrix-v1.json'),
  compatibilityDocument: text('docs/compatibility/v1-semantic-compatibility-matrix.md'),
  generationReport: text('fixtures/generation/report-v1.json'),
  plan: showText('ImplementationPlan.md', manifest.source_commits[0]),
};

const expectedHeadings = [
  '## Context',
  '## Decision drivers',
  '## Considered options',
  '### Option A — Use BSON, deterministic CBOR, or another general interchange format directly',
  '### Option B — Persist native Rust/C/host structs or a memory-mapped object graph',
  '### Option C — Use a custom portable, offset-based HDoc envelope',
  '### Offset and alignment alternatives',
  '### Integrity and identity alternatives',
  '## Decision',
  '### Endianness and scalar bytes',
  '### Alignment and padding',
  '### Offsets, lengths, and bounds',
  '### Maximum sizes and resource accounting',
  '### Canonical physical encoding',
  '### CRC-32C stored-byte checksum',
  '### BLAKE3-256 canonical typed content hash',
  '### Compression strategy',
  '### Version and extension strategy',
  '### Validation and failure behavior',
  '## Consequences',
  '### Positive',
  '### Negative',
  '### Neutral or deferred',
  '## Compatibility and migration',
  '## Security and operations',
  '## Validation plan',
  '## Implementation impact',
  '## Follow-up work',
  '## References',
];
const primarySources = [
  'https://www.rfc-editor.org/rfc/rfc3385',
  'https://www.rfc-editor.org/rfc/rfc3720',
  'https://github.com/BLAKE3-team/BLAKE3',
  'https://github.com/BLAKE3-team/BLAKE3-specs/blob/master/blake3.pdf',
  'https://webassembly.github.io/spec/core/syntax/instructions.html',
  'https://www.rfc-editor.org/rfc/rfc8949.html',
];
assert(
  snapshot.adr.split('\n').length - 1 === manifest.verification.adr_lines,
  'ADR line count mismatch',
);
assert(
  expectedHeadings.length === manifest.verification.adr_headings,
  'ADR heading count mismatch',
);
assert(
  primarySources.length === manifest.verification.primary_source_links,
  'primary-source count mismatch',
);

const validateDecision = (candidate) => {
  assert(
    candidate.adr.startsWith(
      '# ADR 0012: Use a bounded little-endian HDoc v1 envelope with separate integrity and content hashes\n',
    ),
    'ADR identity mismatch',
  );
  for (const marker of [
    '- Status: Accepted',
    '- Date: 2026-07-11',
    '- Decision owner: Storage architecture owner',
    '- Required reviewers: Query semantics owner, Runtime architecture owner, Security owner',
    '- Required before: `P03-002`–`P03-008` and `G03`',
  ]) assert(candidate.adr.includes(marker), `ADR metadata absent: ${marker}`);
  same(
    candidate.adr.split('\n').filter((line) => /^#{2,3} /.test(line)),
    expectedHeadings,
    'ADR heading contract mismatch',
  );
  assert(
    candidate.adr.includes('| Byte order | Little-endian for envelope metadata, tables, offsets, lengths, and numeric payloads'),
    'little-endian table rule absent',
  );
  assert(
    candidate.adr.includes('UUID remains its documented 16-byte network/canonical value'),
    'opaque canonical byte-order exception absent',
  );
  assert(
    candidate.adr.includes('| Section alignment | Every top-level variable section starts at an 8-byte boundary |'),
    'section alignment rule absent',
  );
  assert(
    candidate.adr.includes('every padding byte is `0x00`, participates in the stored-byte checksum'),
    'zero-padding rule absent',
  );
  assert(
    candidate.adr.includes('| Offset width/base | Unsigned 32-bit absolute byte offsets measured from byte zero of the HDoc envelope |'),
    'offset table rule absent',
  );
  assert(candidate.adr.includes('Offset zero is not an absent-value sentinel.'), 'offset sentinel rule absent');
  assert(
    candidate.adr.includes('| Document limit | At most 16,777,216 bytes for the complete uncompressed canonical HDoc'),
    'document limit table rule absent',
  );
  assert(
    candidate.adr.includes('Compression, transport framing, a value log, a page boundary, a path dictionary, or an import path\nMUST NOT make an oversized document valid.'),
    'limit-bypass prohibition absent',
  );
  for (const marker of [
    'logical type identity is retained:',
    'strings and field names are exact valid UTF-8 bytes with no normalization or case folding;',
    'normal objects contain unique names and retain presentation order metadata;',
    'arrays retain element order and exact element types;',
    'Object presentation order is part of the ordered stored document',
  ]) assert(candidate.adr.includes(marker), `canonicalization rule absent: ${marker}`);
  assert(
    candidate.adr.includes('traverses object fields in canonical exact UTF-8 byte order rather than presentation order;'),
    'typed content hash presentation rule absent',
  );
  for (const marker of [
    '`0x1EDC6F41` (reflected representation `0x82F63B78`)',
    'initial register `0xFFFFFFFF`, reflected\ninput/output, and final XOR `0xFFFFFFFF`',
    '`123456789` is `0xE3069283`',
    'while the checksum field\'s bytes are treated as zero',
  ]) assert(candidate.adr.includes(marker), `CRC32C rule absent: ${marker}`);
  assert(
    candidate.adr.includes('| Typed content hash | Unkeyed, domain-separated BLAKE3-256 over canonical typed logical content |'),
    'BLAKE3 table rule absent',
  );
  assert(candidate.adr.includes('The footer stores the 32-byte output of unkeyed BLAKE3'), 'BLAKE3 output rule absent');
  assert(
    candidate.adr.includes('No compression algorithm is selected by this ADR.'),
    'compression deferral rule absent',
  );
  assert(
    candidate.adr.includes('total expanded bytes are bounded before/during decompression'),
    'bounded compression rule absent',
  );
  assert(
    candidate.adr.includes('an unknown major version is rejected with `CAP_UNSUPPORTED_VERSION`;'),
    'unknown-major rejection rule absent',
  );
  assert(
    candidate.adr.includes('an unknown required feature, type tag, semantic extension, checksum/hash profile, compression'),
    'unknown-required-feature rejection rule absent',
  );
  assert(candidate.adr.includes('extension and feature IDs are registered, never reused'), 'extension ID rule absent');
  assert(candidate.adr.includes('must preserve that extension\'s exact bytes'), 'opaque extension preservation rule absent');
  for (const code of ['`CAP_UNSUPPORTED_VERSION`', '`CAP_FORMAT_UNSUPPORTED`', '`DUR_CORRUPTION`']) {
    assert(candidate.adr.includes(code), `stable error family absent: ${code}`);
  }
  assert(
    candidate.adr.includes('No committed HDoc fixture or database exists before this decision'),
    'initial migration state absent',
  );
  assert(candidate.adr.includes('Once `P03-016` freezes HDoc v1 fixtures'), 'rollback boundary absent');
  assert(candidate.adr.includes('It does not authenticate a document'), 'hash security boundary absent');
  assert(candidate.adr.includes('CRC-32C detects accidental corruption'), 'checksum security boundary absent');
  for (const task of ['`P03-002`', '`P03-003`', '`P03-004`', '`P03-005`', '`P03-006`', '`P03-007`', '`P03-015`', '`P03-016`–`P03-021`']) {
    assert(candidate.adr.includes(task), `follow-up owner absent: ${task}`);
  }
  for (const url of primarySources) assert(candidate.adr.includes(url), `primary source absent: ${url}`);

  const adrPath = '0012-use-bounded-little-endian-hdoc-v1.md';
  assert(candidate.index.includes(`| [0012](${adrPath}) |`), 'ADR index row absent');
  assert(candidate.owners.includes(`../adr/${adrPath}`), 'decision-owner backlink absent');
  assert(candidate.specifications.includes(`docs/adr/${adrPath}`), 'specification backlink absent');
  assert(candidate.study.includes(`docs/adr/${adrPath}`), 'study backlink absent');
  assert(
    candidate.specifications.includes('value_offset: u32\nvalue_length: u32'),
    'specification HDoc field widths mismatch',
  );
  assert(!candidate.specifications.includes('value_offset: u32/u64'), 'ambiguous value offset remains');
  assert(!candidate.specifications.includes('value_length: u32/u64'), 'ambiguous value length remains');
  assert(
    candidate.plan.includes('- [ ] **P03-001** Write the HDoc format ADR covering endianness, alignment, offsets, maximum sizes, canonicalization, checksum, hash, and extension strategy.'),
    'source plan state/task text mismatch',
  );

  const matrix = JSON.parse(candidate.matrix);
  const specificationBytes = Buffer.from(candidate.specifications, 'utf8');
  same(
    matrix.inputs.specifications,
    {
      path: 'Specifications.md',
      bytes: specificationBytes.length,
      sha256: sha256(specificationBytes),
    },
    'matrix specification identity mismatch',
  );
  assert(matrix.verdict === 'pass', 'compatibility matrix verdict mismatch');
  assert(matrix.counts.native_rows === 263, 'compatibility native-row count mismatch');
  assert(matrix.counts.failed === 0 && matrix.counts.skipped === 0, 'compatibility matrix not clean');
  assert(
    candidate.compatibilityDocument.includes(
      `| \`specifications\` | [Specifications.md](../../Specifications.md) | \`${sha256(specificationBytes)}\` | ${specificationBytes.length} |`,
    ),
    'rendered compatibility specification identity mismatch',
  );
  const generationReport = JSON.parse(candidate.generationReport);
  const compatibilityGenerator = generationReport.generators.find(
    ({ id }) => id === 'compatibility.matrix-v1',
  );
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

validateDecision(snapshot);

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
    validateDecision(candidate);
  } catch (error) {
    rejection = error;
  }
  assert(rejection, `${label}: mutation was accepted`);
  assert(
    rejection.message.includes(expectedReason),
    `${label}: wrong rejection: ${rejection.message}`,
  );
};

const canaries = [
  ['byte order', 'adr', '| Byte order | Little-endian for', '| Byte order | Big-endian for', 'little-endian table rule absent'],
  ['offset width', 'adr', '| Offset width/base | Unsigned 32-bit absolute', '| Offset width/base | Unsigned 64-bit relative', 'offset table rule absent'],
  ['document limit', 'adr', '| Document limit | At most 16,777,216 bytes', '| Document limit | At most 16,777,217 bytes', 'document limit table rule absent'],
  ['zero padding', 'adr', 'every padding byte is `0x00`, participates', 'every padding byte is `0xFF`, participates', 'zero-padding rule absent'],
  ['CRC check vector', 'adr', '`123456789` is `0xE3069283`', '`123456789` is `0x00000000`', 'CRC32C rule absent'],
  ['content hash', 'adr', '| Typed content hash | Unkeyed, domain-separated BLAKE3-256', '| Typed content hash | Unkeyed SHA-1', 'BLAKE3 table rule absent'],
  ['presentation-neutral content hash', 'adr', 'canonical exact UTF-8 byte order rather than presentation order;', 'presentation order rather than canonical exact UTF-8 byte order;', 'typed content hash presentation rule absent'],
  ['bounded compression', 'adr', 'total expanded bytes are bounded before/during decompression', 'total expanded bytes are trusted after decompression', 'bounded compression rule absent'],
  ['unknown major', 'adr', 'an unknown major version is rejected with `CAP_UNSUPPORTED_VERSION`;', 'an unknown major version is accepted as v1;', 'unknown-major rejection rule absent'],
  ['ADR index', 'index', '| [0012](0012-use-bounded-little-endian-hdoc-v1.md) |', '| 0012 omitted |', 'ADR index row absent'],
  ['decision owner', 'owners', '../adr/0012-use-bounded-little-endian-hdoc-v1.md', '../adr/missing.md', 'decision-owner backlink absent'],
  ['specification field width', 'specifications', 'value_offset: u32\nvalue_length: u32', 'value_offset: u64\nvalue_length: u32', 'specification HDoc field widths mismatch'],
  ['matrix input hash', 'matrix', matrixHash(snapshot.matrix), '0'.repeat(64), 'matrix specification identity mismatch'],
  ['generation report identity', 'generationReport', generationMatrixHash(snapshot.generationReport), '0'.repeat(64), 'generation report compatibility identities mismatch'],
  ['source plan state', 'plan', '- [ ] **P03-001**', '- [x] **P03-001**', 'source plan state/task text mismatch'],
  ['primary source', 'adr', 'https://www.rfc-editor.org/rfc/rfc3385', 'https://example.invalid/rfc3385', 'primary source absent'],
  ['source artifact identity', 'specifications', 'absolute checked `u32` offsets', 'unchecked host pointers', 'matrix specification identity mismatch'],
];

function matrixHash(matrixSource) {
  return JSON.parse(matrixSource).inputs.specifications.sha256;
}

function generationMatrixHash(reportSource) {
  return JSON.parse(reportSource).generators
    .find(({ id }) => id === 'compatibility.matrix-v1')
    .artifacts.find(({ path: artifactPath }) => artifactPath === 'compatibility/v1/matrix-v1.json')
    .sha256;
}

for (const [label, field, from, to, reason] of canaries) {
  expectRejection(
    label,
    (candidate) => {
      candidate[field] = replaceOnce(candidate[field], from, to);
    },
    reason,
  );
}
assert(canaries.length === manifest.verification.mutation_canaries, 'mutation-canary count mismatch');

function crc32c(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0x82f63b78 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
assert(
  crc32c(Buffer.from('123456789', 'ascii')) === 0xe3069283,
  'independent CRC32C check-vector mismatch',
);
assert(16_777_216 <= 0xffffffff, 'limits-v1 cannot be addressed by u32');

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
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) {
      rawTarget = rawTarget.slice(1, -1);
    }
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
const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p03-001-'));
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

console.log(`PASS exact ${manifest.source_artifacts.length}-artifact P03-001 source scope at ${commitArgument}`);
console.log(`PASS ADR 0012: ${expectedHeadings.length} headings and ${primarySources.length} primary sources`);
console.log('PASS HDoc baseline: little-endian, u32 absolute offsets, 8-byte alignment, zero padding, 16 MiB');
console.log('PASS integrity: independent CRC32C vector and BLAKE3-256 typed-content decision');
console.log('PASS compression/extensions: bounded optional profiles and fail-closed required semantics');
console.log(`PASS mutation canaries: ${canaries.length}/${canaries.length} intended rejections`);
console.log(`PASS documentation: ${markdownFiles.length} Markdown files and ${localLinks} local links`);
console.log('PASS isolated compatibility-matrix generator replay: 263 rows, 9 hash-bound inputs');
console.log('PASS deterministic-generation report binds the refreshed matrix and rendered document');
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

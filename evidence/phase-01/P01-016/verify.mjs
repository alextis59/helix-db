#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const input = process.argv[2];

if (!input) {
  throw new Error('usage: node evidence/phase-01/P01-016/verify.mjs <commit>');
}

const git = (args, options = {}) =>
  execFileSync('git', args, { encoding: 'utf8', ...options });
const commit = git(['rev-parse', `${input}^{commit}`]).trim();
const artifactPaths = [
  'Specifications.md',
  'docs/adr/0009-use-versioned-error-codes-and-outcomes.md',
  'docs/adr/README.md',
  'docs/architecture/error-semantics.md',
];
const show = (file) => git(['show', `${commit}:${file}`]);

git(['diff', '--check', `${commit}^`, commit]);

const changed = git([
  'diff-tree',
  '--no-commit-id',
  '--name-only',
  '-r',
  commit,
])
  .trim()
  .split('\n')
  .filter(Boolean)
  .sort();

if (JSON.stringify(changed) !== JSON.stringify([...artifactPaths].sort())) {
  throw new Error(`unexpected artifact commit scope: ${changed.join(', ')}`);
}

const files = Object.fromEntries(
  artifactPaths.map((file) => [file, show(file)]),
);

for (const [file, source] of Object.entries(files)) {
  if (!source.endsWith('\n')) throw new Error(`${file}: missing terminal newline`);

  for (const [index, line] of source.split('\n').entries()) {
    if (/[ \t]+$/.test(line)) {
      throw new Error(`${file}:${index + 1}: trailing whitespace`);
    }
  }

  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].split('#')[0];
    if (!rawTarget || /^(https?:|mailto:)/.test(rawTarget)) continue;

    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)),
    );
    if (target === '..' || target.startsWith('../')) {
      throw new Error(`${file}: link escapes repository: ${rawTarget}`);
    }
    git(['cat-file', '-e', `${commit}:${target}`]);
  }
}

const errors = files['docs/architecture/error-semantics.md'];
const categories = [
  'parse',
  'validation',
  'type',
  'conflict',
  'uniqueness',
  'authorization',
  'capability',
  'quota',
  'deadline',
  'durability',
  'internal',
];
const prefixes = {
  parse: 'PAR',
  validation: 'VAL',
  type: 'TYPE',
  conflict: 'CON',
  uniqueness: 'UNQ',
  authorization: 'AUTH',
  capability: 'CAP',
  quota: 'QUOTA',
  deadline: 'DEADLINE',
  durability: 'DUR',
  internal: 'INT',
};
const expectedCodeCounts = {
  parse: 7,
  validation: 13,
  type: 9,
  conflict: 7,
  uniqueness: 3,
  authorization: 5,
  capability: 8,
  quota: 7,
  deadline: 3,
  durability: 8,
  internal: 4,
};
const headings = [...errors.matchAll(/^### .+$/gm)];
const codes = [];

for (const category of categories) {
  if (!errors.includes(`| \`${category}\` |`)) {
    throw new Error(`missing category registry row: ${category}`);
  }

  const heading = headings.find((entry) =>
    entry[0].endsWith(`(\`${category}\`)`),
  );
  if (!heading) throw new Error(`missing code section: ${category}`);

  const next = headings.find((entry) => entry.index > heading.index);
  const section = errors.slice(heading.index, next?.index ?? errors.length);
  const sectionCodes = [
    ...section.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|/gm),
  ].map((entry) => entry[1]);

  if (sectionCodes.length !== expectedCodeCounts[category]) {
    throw new Error(
      `${category}: expected ${expectedCodeCounts[category]} codes, found ${sectionCodes.length}`,
    );
  }
  for (const code of sectionCodes) {
    if (!code.startsWith(`${prefixes[category]}_`)) {
      throw new Error(`${category}: invalid code prefix: ${code}`);
    }
    codes.push(code);
  }
}

if (new Set(codes).size !== codes.length) {
  throw new Error('stable error codes are not unique');
}

const envelopeFields = [
  'schema_version: 1',
  'registry: errors-v1',
  'category: ErrorCategory',
  'code: StableErrorCode',
  'message: safe human summary',
  'request_id: opaque ID',
  'trace_id: optional opaque ID',
  'error_id: opaque diagnostic ID',
  'phase: ErrorPhase',
  'outcome: OutcomeCertainty',
  'retry: RetryAdvice',
  'details: bounded code-specific object',
  'causes: bounded [ErrorV1Cause]',
];
const outcomes = ['not_applicable', 'not_committed', 'committed', 'unknown'];
const retryScopes = [
  'never',
  'same_request',
  'same_idempotency_key',
  'new_snapshot',
  'after_delay',
  'after_capability_change',
  'after_operator_action',
];
const requiredSections = [
  'Registered detail shapes',
  'Deterministic primary-error selection',
  'Outcome and retry matrix',
  'Redaction and disclosure rules',
  'Protocol, SDK, and adapter mapping',
  'Observability and cardinality',
  'Registry and compatibility rules',
  'Required conformance fixtures',
];

for (const marker of [...envelopeFields, ...outcomes, ...retryScopes, ...requiredSections]) {
  if (!errors.includes(marker)) throw new Error(`missing contract marker: ${marker}`);
}

if (
  !errors.includes(
    'wire decode validate authorize admit snapshot plan execute\ncommit acknowledge cursor backup restore recover internal',
  )
) {
  throw new Error('phase registry is incomplete or reordered');
}

const precedenceSection = errors.slice(
  errors.indexOf('## Deterministic primary-error selection'),
  errors.indexOf('## Outcome and retry matrix'),
);
const precedence = [
  'Wire/framing/decompression',
  'Static command/value/limit/path/operator',
  'Authentication and authorization',
  'Admission capability',
  'Snapshot/session/cursor',
  'Target-dependent execution',
  'Commit, durability',
  'Contained internal',
];
let previous = -1;
for (const marker of precedence) {
  const index = precedenceSection.indexOf(marker);
  if (index <= previous) throw new Error(`invalid precedence marker: ${marker}`);
  previous = index;
}

const safetyMarkers = [
  'DUR_ACK_UNKNOWN` always has `outcome: unknown',
  'Every write retry preserves the original idempotency/session/transaction identity',
  'Unknown codes/categories default to nonretryable',
  'unknown write outcome defaults to `unknown`',
  'never contain credentials, tokens, encryption material, document values',
  'Only an authorized caller receives `VAL_RESOURCE_NOT_FOUND`',
  'Metrics label only stable low-cardinality',
];
for (const marker of safetyMarkers) {
  if (!errors.includes(marker)) throw new Error(`missing safety marker: ${marker}`);
}

const adr = files['docs/adr/0009-use-versioned-error-codes-and-outcomes.md'];
for (const marker of [
  'Option A',
  'Option B',
  'Option C',
  'Compatibility and migration',
  'Security and operations',
  'Validation plan',
  'Implementation impact',
]) {
  if (!adr.includes(marker)) throw new Error(`missing ADR marker: ${marker}`);
}

const specification = files['Specifications.md'];
if (
  !specification.includes('### 8.5 Error contract') ||
  !specification.includes('docs/architecture/error-semantics.md') ||
  !specification.includes('docs/adr/0009-use-versioned-error-codes-and-outcomes.md')
) {
  throw new Error('specification does not bind the error contract and ADR');
}

if (
  !files['docs/adr/README.md'].includes(
    '[0009](0009-use-versioned-error-codes-and-outcomes.md)',
  )
) {
  throw new Error('ADR 0009 is absent from the index');
}

console.log(`PASS: exact four-file artifact scope at ${commit}`);
console.log('PASS: committed formatting and local links');
console.log(
  `PASS: ${categories.length}/11 categories; ${codes.length} unique category-correct codes`,
);
console.log(
  `PASS: ${envelopeFields.length}/13 envelope fields; ${outcomes.length} outcomes; ${retryScopes.length} retry scopes`,
);
console.log(`PASS: ${precedence.length}/8 precedence classes and safety markers`);
console.log('PASS: ADR alternatives/impact, specification refinement, and ADR index');

for (const [file, source] of Object.entries(files)) {
  console.log(
    `ARTIFACT: ${file} ${createHash('sha256').update(source).digest('hex')} ${Buffer.byteLength(source)}`,
  );
}

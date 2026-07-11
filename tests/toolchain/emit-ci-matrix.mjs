#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const matrix = JSON.parse(readFileSync(path.join(repository, '.github/ci/matrix.json'), 'utf8'));
const mode = process.argv[2];

if (!['gating', 'nightly'].includes(mode) || process.argv.length !== 3) {
  throw new Error('usage: node tests/toolchain/emit-ci-matrix.mjs <gating|nightly>');
}

const groups = mode === 'gating' ? matrix.gating : matrix.nightly;
for (const [name, entries] of Object.entries(groups)) {
  process.stdout.write(`${name}=${JSON.stringify({ include: entries })}\n`);
}

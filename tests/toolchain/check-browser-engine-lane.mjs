#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const matrix = JSON.parse(readFileSync(path.join(repository, '.github/ci/matrix.json'), 'utf8'));
const engine = process.argv[2];

if (!engine || process.argv.length !== 3) {
  throw new Error('usage: node tests/toolchain/check-browser-engine-lane.mjs <engine>');
}

const matches = matrix.gating.browser.filter((lane) => lane.engine === engine);
if (matches.length !== 1) throw new Error(`unknown or duplicate browser engine: ${engine}`);
const lane = matches[0];
if (lane.execution !== 'inventory-only' || lane.activation_task !== 'P02-010') {
  throw new Error(`${engine}: browser execution boundary drifted`);
}
for (const generated of ['playwright-report', 'test-results', 'blob-report']) {
  if (existsSync(path.join(repository, generated))) {
    throw new Error(`${engine}: pre-existing browser output root: ${generated}`);
  }
}
const output = execFileSync(
  'corepack',
  [
    'npm',
    'exec',
    '--',
    'playwright',
    'test',
    '--list',
    `--project=${engine}`,
    '--pass-with-no-tests',
  ],
  { cwd: repository, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
);
if (!output.includes('Total: 0 tests in 0 files')) {
  throw new Error(`${engine}: browser inventory is not exactly empty`);
}
for (const generated of ['playwright-report', 'test-results', 'blob-report']) {
  if (existsSync(path.join(repository, generated))) {
    throw new Error(`${engine}: inventory created browser output: ${generated}`);
  }
}
process.stdout.write(
  `RESERVED browser engine ${engine}: 0 tests; real execution activates under P02-010\n`,
);

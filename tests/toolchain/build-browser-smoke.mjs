#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadExamplePolicy,
  sharedClaimBoundary,
  validateBrowserBundleReport,
} from './examples-contract.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv.length !== 2) {
  throw new Error('usage: node tests/toolchain/build-browser-smoke.mjs');
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const examplePolicy = loadExamplePolicy();
const run = (program, args) => {
  const result = spawnSync(program, args, {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert(result.status === 0, `${program} ${args.join(' ')} exited ${result.status}`);
};
const listFiles = (root, relative = '') => {
  const files = [];
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const child = path.join(relative, entry.name);
    const details = lstatSync(path.join(root, child));
    assert(!details.isSymbolicLink(), `bundle output contains a symlink: ${child}`);
    if (details.isDirectory()) files.push(...listFiles(root, child));
    else if (details.isFile()) files.push(child.split(path.sep).join('/'));
    else throw new Error(`bundle output contains an unsupported entry: ${child}`);
  }
  return files;
};

run(process.execPath, ['tests/toolchain/check-wasm-artifacts.mjs', 'browser']);
run('corepack', ['npm', 'exec', '--', 'vite', 'build']);

const outputRoot = path.join(repository, 'dist/browser');
const files = listFiles(outputRoot);
const indexFiles = files.filter((file) => file === 'index.html');
const scripts = files.filter((file) => /^assets\/index-[A-Za-z0-9_-]+\.js$/.test(file));
const maps = files.filter((file) => /^assets\/index-[A-Za-z0-9_-]+\.js\.map$/.test(file));
const wasm = files.filter((file) => /^assets\/helix_core-[A-Za-z0-9_-]+\.wasm$/.test(file));
assert(
  files.length === 4 &&
    indexFiles.length === 1 &&
    scripts.length === 1 &&
    maps.length === 1 &&
    wasm.length === 1,
  `browser bundle inventory mismatch: ${JSON.stringify(files)}`,
);
const indexBytes = readFileSync(path.join(outputRoot, indexFiles[0]));
const scriptBytes = readFileSync(path.join(outputRoot, scripts[0]));
const mapBytes = readFileSync(path.join(outputRoot, maps[0]));
const wasmBytes = readFileSync(path.join(outputRoot, wasm[0]));
const sourceWasm = readFileSync(
  path.join(repository, 'target/wasm32-unknown-unknown/browser/helix_core.wasm'),
);
assert(indexBytes.toString('utf8').includes('./assets/'), 'bundle index lacks relative assets');
for (const marker of [
  'HelixDB browser toolchain boundary example',
  'Boundary skeleton — no database functionality',
  'Database functionality',
  'not implemented',
]) {
  assert(indexBytes.toString('utf8').includes(marker), `bundle index omits boundary: ${marker}`);
}
assert(
  !scriptBytes.toString('utf8').includes('sourceMappingURL'),
  'hidden source map was disclosed from emitted JavaScript',
);
assert(wasmBytes.equals(sourceWasm), 'bundled Wasm bytes differ from the validated core module');
JSON.parse(mapBytes.toString('utf8'));

const artifacts = files.map((file) => {
  const bytes = readFileSync(path.join(outputRoot, file));
  return { path: `dist/browser/${file}`, bytes: bytes.length, sha256: sha256(bytes) };
});
const report = {
  schema: 'helix.browser-example-bundle-report/1',
  plan_items: ['P02-010', 'P02-016'],
  example: examplePolicy.browser.root,
  vite: '8.1.4',
  target: 'es2022',
  artifacts,
  wasm_source_sha256: sha256(sourceWasm),
  database_functionality: false,
  claim_boundary: sharedClaimBoundary,
  verdict: 'pass',
};
validateBrowserBundleReport(report);
const reportDirectory = path.join(repository, 'dist/validation');
mkdirSync(reportDirectory, { recursive: true });
const reportPath = path.join(reportDirectory, 'browser-bundle-smoke.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `PASS browser example bundle: ${files.length} files, ${wasmBytes.length} Wasm bytes, hidden source map, database functionality false\n`,
);
process.stdout.write(
  `REPORT ${path.relative(repository, reportPath)} ${sha256(readFileSync(reportPath))}\n`,
);

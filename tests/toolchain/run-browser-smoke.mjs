#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const selected = process.argv[2];
const supported = ['chromium', 'firefox', 'webkit', 'all'];
if (!selected || !supported.includes(selected) || process.argv.length !== 3) {
  throw new Error(`usage: node tests/toolchain/run-browser-smoke.mjs <${supported.join('|')}>`);
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const environment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
delete environment.FORCE_COLOR;
delete environment.NO_COLOR;
const run = (program, args) => {
  const result = spawnSync(program, args, {
    cwd: repository,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert(result.status === 0, `${program} ${args.join(' ')} exited ${result.status}`);
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
};

run(process.execPath, ['tests/toolchain/build-browser-smoke.mjs']);
const arguments_ = ['npm', 'exec', '--', 'playwright', 'test'];
if (selected !== 'all') arguments_.push(`--project=${selected}`);
const output = run('corepack', arguments_);
const expected = selected === 'all' ? 3 : 1;
assert(
  output.includes(`${expected} passed`),
  `${selected}: Playwright pass count did not equal ${expected}`,
);
process.stdout.write(`PASS browser smoke ${selected}: ${expected} real-browser execution(s)\n`);

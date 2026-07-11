#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  assert,
  exampleSourceIdentities,
  jsonBytes,
  loadExamplePolicy,
  repository,
  sha256,
  validateBrowserBundleReport,
  validateNativeExampleReport,
} from './examples-contract.mjs';

const mode = process.argv[2];
assert(
  process.argv.length === 3 && ['policy', 'native', 'browser', 'all'].includes(mode),
  'usage: node tests/toolchain/check-examples.mjs <policy|native|browser|all>',
);

const policy = loadExamplePolicy();
const run = (command) => {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert(result.status === 0, `${command.join(' ')} exited ${result.status}`);
  return result.stdout;
};

const checkPolicy = () => {
  const sources = exampleSourceIdentities();
  process.stdout.write(
    `PASS toolchain example policy: 2 active boundary examples, ${sources.length} hashable authority files, database functionality false\n`,
  );
};

const checkNative = () => {
  const stdout = run(policy.native.command);
  const lines = stdout.trim().split('\n');
  assert(lines.length === 1, 'native example must emit exactly one JSON line');
  const report = validateNativeExampleReport(JSON.parse(lines[0]));
  const reportPath = path.join(repository, policy.native.report);
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, jsonBytes(report));
  process.stdout.write(
    `PASS native toolchain example: ${report.component.name} ${report.component.maturity} on ${report.target.operating_system}/${report.target.architecture}, 0 database operations\n`,
  );
  process.stdout.write(`REPORT ${policy.native.report} ${sha256(readFileSync(reportPath))}\n`);
};

const checkBrowser = () => {
  run(policy.browser.build_command);
  const reportPath = path.join(repository, policy.browser.bundle_report);
  const report = validateBrowserBundleReport(JSON.parse(readFileSync(reportPath, 'utf8')));
  const wasm = report.artifacts.find(({ path: artifactPath }) => artifactPath.endsWith('.wasm'));
  assert(wasm, 'browser bundle Wasm artifact absent');
  process.stdout.write(
    `PASS browser toolchain example: ${policy.browser.sources.length} source files, ${report.artifacts.length} bundled files, ${wasm.bytes} Wasm bytes, database functionality false\n`,
  );
};

checkPolicy();
if (mode === 'native' || mode === 'all') checkNative();
if (mode === 'browser' || mode === 'all') checkBrowser();

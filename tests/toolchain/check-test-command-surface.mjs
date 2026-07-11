#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readText = (file) => readFileSync(path.join(repository, file), 'utf8');
const readJson = (file) => JSON.parse(readText(file));
const packageJson = readJson('package.json');
const manifest = readJson('tests/suites.json');
const suiteIds = [
  'unit',
  'integration',
  'conformance',
  'fuzz',
  'browser',
  'crash',
  'benchmark',
  'distributed',
];
const expectedStates = {
  benchmark: 'reserved',
  browser: 'reserved',
  conformance: 'active',
  crash: 'reserved',
  distributed: 'reserved',
  fuzz: 'reserved',
  integration: 'reserved',
  unit: 'active',
};
const expectedActivationTasks = {
  benchmark: ['P02-014'],
  browser: ['P02-010', 'P02-016'],
  conformance: [],
  crash: ['P05-021'],
  distributed: ['P17-016'],
  fuzz: ['P03-019'],
  integration: ['P03-017'],
  unit: [],
};
const expectedSteps = {
  benchmark: ['benchmark-profile'],
  browser: ['browser-harness-inventory'],
  conformance: ['semantic-conformance'],
  crash: [],
  distributed: [],
  fuzz: [],
  integration: ['rust-integration-inventory'],
  unit: ['rust-unit', 'javascript-unit-inventory'],
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};
const same = (actual, expected, label) => {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};
const runRunner = (args) =>
  execFileSync(process.execPath, ['tests/run-suite.mjs', ...args], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
const expectRunnerFailure = (args, marker) => {
  const result = spawnSync(process.execPath, ['tests/run-suite.mjs', ...args], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert(result.status !== 0, `runner mutation unexpectedly passed: ${args.join(' ')}`);
  assert(result.stderr.includes(marker), `runner mutation did not fail with ${marker}`);
};

assert(manifest.schema === 'helix.test-command-surface/1', 'suite manifest schema mismatch');
assert(manifest.plan_item === 'P02-007', 'suite manifest task mismatch');
assert(manifest.runner === 'tests/run-suite.mjs', 'suite runner path mismatch');
same(manifest.ordered_suites, suiteIds, 'ordered suite IDs');
same(
  manifest.suites.map(({ id }) => id),
  suiteIds,
  'suite definitions',
);

const stableScripts = Object.fromEntries([
  ['test', 'node tests/run-suite.mjs all'],
  ['test:all', 'node tests/run-suite.mjs all'],
  ['test:benchmark', 'node tests/run-suite.mjs benchmark'],
  ['test:browser', 'node tests/run-suite.mjs browser'],
  ['test:commands', 'node tests/toolchain/check-test-command-surface.mjs'],
  ['test:conformance', 'node tests/run-suite.mjs conformance'],
  ['test:crash', 'node tests/run-suite.mjs crash'],
  ['test:distributed', 'node tests/run-suite.mjs distributed'],
  ['test:fuzz', 'node tests/run-suite.mjs fuzz'],
  ['test:integration', 'node tests/run-suite.mjs integration'],
  ['test:unit', 'node tests/run-suite.mjs unit'],
]);
same(
  Object.fromEntries(Object.keys(stableScripts).map((name) => [name, packageJson.scripts[name]])),
  stableScripts,
  'stable npm scripts',
);

for (const suite of manifest.suites) {
  assert(suite.state === expectedStates[suite.id], `${suite.id}: bootstrap state mismatch`);
  same(suite.activation_tasks, expectedActivationTasks[suite.id], `${suite.id} activation tasks`);
  same(suite.steps, expectedSteps[suite.id], `${suite.id} execution steps`);
  assert(
    packageJson.scripts[suite.npm_script] === `node tests/run-suite.mjs ${suite.id}`,
    `${suite.id}: package script does not use the common runner`,
  );
  const described = JSON.parse(runRunner(['--describe', suite.id]));
  same(described, suite, `${suite.id} runner description`);
}

const listed = runRunner(['--list'])
  .trim()
  .split('\n')
  .map((line) => line.split('\t'));
same(
  listed,
  manifest.suites.map(({ id, state, npm_script: npmScript }) => [id, state, npmScript]),
  'runner suite listing',
);
expectRunnerFailure([], 'usage: node tests/run-suite.mjs');
expectRunnerFailure(['unknown'], 'unknown suite: unknown');
expectRunnerFailure(['--describe', 'unknown'], 'unknown suite: unknown');

const cargo = readText('Cargo.toml');
assert(cargo.includes('test-command-contract = "P02-007"'), 'Cargo test contract marker absent');
assert(
  cargo.includes(
    'test-commands = ["unit", "integration", "conformance", "fuzz", "browser", "crash", "benchmark", "distributed"]',
  ),
  'Cargo test command inventory absent',
);
const runnerSource = readText('tests/run-suite.mjs');
assert(!runnerSource.includes('shell: true'), 'test runner must not execute through a shell');
assert(runnerSource.includes("CARGO_NET_OFFLINE: 'true'"), 'Cargo suite commands are not offline');

const policyDoc = readText('docs/quality/test-command-surface.md');
for (const name of Object.keys(stableScripts)) {
  assert(policyDoc.includes(`npm run ${name}`), `policy omits ${name}`);
}
for (const marker of [
  'https://doc.rust-lang.org/cargo/commands/cargo-test.html',
  'https://vitest.dev/guide/cli',
  'https://playwright.dev/docs/test-cli',
  'https://rust-fuzz.github.io/book/',
  'reserved',
  'does not prove',
]) {
  assert(policyDoc.includes(marker), `policy marker absent: ${marker}`);
}
const rootReadmes = Object.fromEntries(
  manifest.suites.map(({ id, root }) => [id, readText(`${root}/README.md`)]),
);
for (const suite of manifest.suites) {
  assert(
    rootReadmes[suite.id].includes(`npm run ${suite.npm_script}`),
    `${suite.root}/README.md omits its stable command`,
  );
}

process.stdout.write(
  'PASS test command surface: 8 stable suites, 2 active, 6 reserved, 11 npm scripts\n',
);
process.stdout.write('PASS runner contract: exact list/describe output and 3 rejection canaries\n');
process.stdout.write(
  'PASS claim boundary: empty suites remain explicit and activation-task owned\n',
);

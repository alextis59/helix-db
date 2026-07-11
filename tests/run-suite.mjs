#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(repository, 'tests/suites.json'), 'utf8'));
const suiteOrder = [
  'unit',
  'integration',
  'conformance',
  'fuzz',
  'browser',
  'crash',
  'benchmark',
  'distributed',
];
const allowedSteps = new Set([
  'rust-unit',
  'rust-integration-inventory',
  'javascript-unit-inventory',
  'semantic-conformance',
  'browser-harness-inventory',
  'benchmark-profile',
]);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sorted = (values) => [...values].sort();
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

const validateManifest = () => {
  same(
    sorted(Object.keys(manifest)),
    ['ordered_suites', 'plan_item', 'runner', 'schema', 'suites'],
    'suite manifest fields',
  );
  assert(manifest.schema === 'helix.test-command-surface/1', 'suite manifest schema mismatch');
  assert(manifest.plan_item === 'P02-007', 'suite manifest plan item mismatch');
  assert(manifest.runner === 'tests/run-suite.mjs', 'suite manifest runner mismatch');
  same(manifest.ordered_suites, suiteOrder, 'ordered suite IDs');
  assert(Array.isArray(manifest.suites), 'suite definitions must be an array');
  same(
    manifest.suites.map(({ id }) => id),
    suiteOrder,
    'suite definition order',
  );

  for (const suite of manifest.suites) {
    same(
      sorted(Object.keys(suite)),
      [
        'activation_tasks',
        'allowed_files',
        'description',
        'expectations',
        'id',
        'npm_script',
        'root',
        'state',
        'steps',
      ],
      `${suite.id} fields`,
    );
    assert(suite.npm_script === `test:${suite.id}`, `${suite.id}: npm script mismatch`);
    assert(['active', 'reserved'].includes(suite.state), `${suite.id}: invalid state`);
    assert(suite.description.length >= 20, `${suite.id}: description is too short`);
    assert(!path.isAbsolute(suite.root), `${suite.id}: root must be repository-relative`);
    const absoluteRoot = path.resolve(repository, suite.root);
    assert(
      absoluteRoot.startsWith(`${repository}${path.sep}`) && statSync(absoluteRoot).isDirectory(),
      `${suite.id}: root is absent or escapes the repository`,
    );
    assert(Array.isArray(suite.activation_tasks), `${suite.id}: activation tasks must be an array`);
    assert(Array.isArray(suite.allowed_files), `${suite.id}: allowed files must be an array`);
    assert(Array.isArray(suite.steps), `${suite.id}: steps must be an array`);
    same(sorted(new Set(suite.steps)), sorted(suite.steps), `${suite.id} unique steps`);
    assert(
      suite.steps.every((step) => allowedSteps.has(step)),
      `${suite.id}: unknown execution step`,
    );
    assert(
      suite.expectations &&
        !Array.isArray(suite.expectations) &&
        Object.values(suite.expectations).every(
          (value) => Number.isSafeInteger(value) && value >= 0,
        ),
      `${suite.id}: expectations must be nonnegative safe integers`,
    );
    if (suite.state === 'active') {
      same(suite.activation_tasks, [], `${suite.id} active activation tasks`);
      same(suite.allowed_files, [], `${suite.id} active allowlist`);
      assert(suite.steps.length > 0, `${suite.id}: active suite has no execution step`);
    } else {
      assert(suite.activation_tasks.length > 0, `${suite.id}: reserved suite lacks an owner task`);
      assert(
        suite.activation_tasks.every((task) => /^P\d{2}-\d{3}$/.test(task)),
        `${suite.id}: invalid activation task`,
      );
      assert(suite.allowed_files.length > 0, `${suite.id}: reserved inventory is empty`);
    }
  }
};

const listFiles = (root, relative = '') => {
  const result = [];
  const directory = path.join(root, relative);
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const child = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`${child}: reserved suite contains a symlink`);
    if (entry.isDirectory()) result.push(...listFiles(root, child));
    else if (entry.isFile()) result.push(child.split(path.sep).join('/'));
    else throw new Error(`${child}: unsupported reserved-suite entry`);
  }
  return result;
};

const verifyReservedInventory = (suite) => {
  const actual = listFiles(path.join(repository, suite.root));
  same(sorted(actual), sorted(suite.allowed_files), `${suite.id} reserved file inventory`);
};

const run = (program, args, options = {}) => {
  const result = spawnSync(program, args, {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (options.display !== false && result.stdout) process.stdout.write(result.stdout);
  if (options.display !== false && result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert(
    result.status === 0,
    `${program} ${args.join(' ')} exited ${result.status ?? `by signal ${result.signal}`}`,
  );
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
};

const requireText = (output, marker, label) => {
  assert(output.includes(marker), `${label}: expected output marker absent: ${marker}`);
};

const executeRustUnit = (suite) => {
  const output = run('cargo', [
    'test',
    '--frozen',
    '--workspace',
    '--all-features',
    '--lib',
    '--no-fail-fast',
  ]);
  const passed = [...output.matchAll(/^test .* \.\.\. ok$/gm)].length;
  assert(passed === suite.expectations.rust_tests, `Rust unit-test count mismatch: ${passed}`);
};

const executeJavaScriptUnitInventory = (suite) => {
  const output = run('corepack', ['npm', 'exec', '--', 'vitest', 'run', '--passWithNoTests']);
  requireText(output, 'No test files found, exiting with code 0', 'JavaScript unit inventory');
  assert(
    suite.expectations.javascript_test_files === 0,
    'JavaScript unit inventory may be empty only while the manifest records zero files',
  );
};

const cargoMetadata = () =>
  JSON.parse(
    run('cargo', ['metadata', '--frozen', '--format-version', '1', '--no-deps'], {
      display: false,
    }),
  );

const executeRustIntegrationInventory = (suite) => {
  const targets = cargoMetadata().packages.flatMap(({ name, targets: packageTargets }) =>
    packageTargets
      .filter(({ kind }) => kind.includes('test'))
      .map(({ name: target }) => `${name}:${target}`),
  );
  assert(
    targets.length === suite.expectations.executable_targets,
    `Rust integration-target inventory mismatch: ${JSON.stringify(targets)}`,
  );
};

const executeSemanticConformance = (suite) => {
  const examples = run(process.execPath, ['fixtures/semantic/schema/check-semantic-examples.mjs']);
  requireText(
    examples,
    `PASS semantic examples: ${suite.expectations.accepted_examples} accepted; ${suite.expectations.rejected_examples} rejected with exact rules`,
    'semantic examples',
  );
  const canonicalExamples = run(process.execPath, [
    'fixtures/semantic/schema/check-canonical-examples.mjs',
  ]);
  requireText(
    canonicalExamples,
    `PASS canonical examples: ${suite.expectations.accepted_examples} stable source/canonical hashes`,
    'canonical examples',
  );
  const generation = run(process.execPath, ['fixtures/semantic/generate-corpus.mjs', '--check']);
  requireText(
    generation,
    `PASS corpus generation: ${suite.expectations.semantic_fixtures} fixtures, ${suite.expectations.semantic_steps} steps`,
    'semantic corpus generation',
  );
  const corpus = run(process.execPath, ['fixtures/semantic/check-corpus.mjs']);
  requireText(
    corpus,
    `PASS corpus: ${suite.expectations.semantic_fixtures} fixtures, ${suite.expectations.semantic_steps} steps`,
    'semantic corpus',
  );
  const oracleTests = run(process.execPath, ['reference/semantic-oracle/test-oracle.mjs']);
  requireText(
    oracleTests,
    `PASS oracle unit/property/negative tests: ${suite.expectations.oracle_assertions} assertions`,
    'semantic oracle tests',
  );
  const oracleReport = run(process.execPath, [
    'reference/semantic-oracle/cli.mjs',
    '--check-report',
  ]);
  requireText(
    oracleReport,
    `PASS oracle: ${suite.expectations.semantic_fixtures} fixtures, ${suite.expectations.semantic_steps} steps, ${suite.expectations.semantic_steps} passed, 0 failed, 0 skipped`,
    'semantic oracle report',
  );
  const matrixGeneration = run(process.execPath, [
    'compatibility/v1/generate-matrix.mjs',
    '--check',
  ]);
  requireText(
    matrixGeneration,
    `PASS semantic compatibility matrix: ${suite.expectations.compatibility_rows} native rows, ${suite.expectations.mongodb_cases} MongoDB cases`,
    'compatibility matrix generation',
  );
  const matrix = run(process.execPath, ['compatibility/v1/check-matrix.mjs']);
  requireText(
    matrix,
    `PASS matrix integrity: ${suite.expectations.compatibility_rows} native rows, ${suite.expectations.mongodb_cases} MongoDB cases`,
    'compatibility matrix',
  );
  const differential = run(process.execPath, ['differential/mongodb/check-artifacts.mjs']);
  requireText(
    differential,
    `PASS MongoDB differential artifacts: 3 schemas, ${suite.expectations.mongodb_cases} cases, 0 failed, 0 skipped`,
    'offline MongoDB differential',
  );
};

const executeBrowserInventory = (suite) => {
  const output = run('corepack', [
    'npm',
    'exec',
    '--',
    'playwright',
    'test',
    '--list',
    '--pass-with-no-tests',
  ]);
  requireText(
    output,
    `Total: ${suite.expectations.browser_tests} tests in 0 files`,
    'browser harness inventory',
  );
};

const executeBenchmarkProfile = (suite) => {
  const metadata = cargoMetadata();
  assert(
    metadata.packages.length === suite.expectations.workspace_packages,
    `benchmark workspace-package count mismatch: ${metadata.packages.length}`,
  );
  const benchmarkTargets = metadata.packages.flatMap(({ name, targets }) =>
    targets
      .filter(({ kind }) => kind.includes('bench'))
      .map(({ name: target }) => `${name}:${target}`),
  );
  assert(
    benchmarkTargets.length === suite.expectations.benchmark_workloads,
    `Cargo benchmark-target inventory mismatch: ${JSON.stringify(benchmarkTargets)}`,
  );
  const output = run(process.execPath, ['tests/toolchain/run-build-profile.mjs', 'benchmark']);
  requireText(output, 'PASS build profile benchmark', 'benchmark profile');
};

const stepExecutors = {
  'rust-unit': executeRustUnit,
  'rust-integration-inventory': executeRustIntegrationInventory,
  'javascript-unit-inventory': executeJavaScriptUnitInventory,
  'semantic-conformance': executeSemanticConformance,
  'browser-harness-inventory': executeBrowserInventory,
  'benchmark-profile': executeBenchmarkProfile,
};

const runSuite = (suite) => {
  if (suite.state === 'reserved') verifyReservedInventory(suite);
  for (const step of suite.steps) stepExecutors[step](suite);
  if (suite.state === 'active') {
    process.stdout.write(`PASS suite ${suite.id}: ${JSON.stringify(suite.expectations)}\n`);
  } else {
    process.stdout.write(
      `RESERVED suite ${suite.id}: ${JSON.stringify(suite.expectations)}; activate under ${suite.activation_tasks.join(',')}\n`,
    );
  }
};

const main = () => {
  validateManifest();
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--list') {
    for (const suite of manifest.suites) {
      process.stdout.write(`${suite.id}\t${suite.state}\t${suite.npm_script}\n`);
    }
    return;
  }
  if (args.length === 2 && args[0] === '--describe') {
    const suite = manifest.suites.find(({ id }) => id === args[1]);
    assert(suite, `unknown suite: ${args[1]}`);
    process.stdout.write(`${JSON.stringify(suite, null, 2)}\n`);
    return;
  }
  assert(args.length === 1, 'usage: node tests/run-suite.mjs <suite|all|--list>');
  if (args[0] === 'all') {
    for (const suite of manifest.suites) runSuite(suite);
    process.stdout.write(`PASS all test suites: ${suiteOrder.join(',')}\n`);
    return;
  }
  const suite = manifest.suites.find(({ id }) => id === args[0]);
  assert(suite, `unknown suite: ${args[0]}`);
  runSuite(suite);
};

try {
  main();
} catch (error) {
  process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

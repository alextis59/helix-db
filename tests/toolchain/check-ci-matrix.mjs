#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateWasmToolsAuthority } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readText = (file) => readFileSync(path.join(repository, file), 'utf8');
const readJson = (file) => JSON.parse(readText(file));
const matrix = readJson('.github/ci/matrix.json');
const packageJson = readJson('package.json');

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
const runNode = (args) =>
  execFileSync(process.execPath, args, {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
const expectFailure = (args, marker) => {
  const result = spawnSync(process.execPath, args, {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  assert(result.status !== 0, `mutation unexpectedly passed: ${args.join(' ')}`);
  assert(result.stderr.includes(marker), `expected failure marker absent: ${marker}`);
};
const githubExpression = (body) => `\${{ ${body} }}`;

same(
  sorted(Object.keys(matrix)),
  ['actions', 'gating', 'nightly', 'observational', 'plan_items', 'schema', 'unsupported'],
  'matrix fields',
);
assert(matrix.schema === 'helix.ci-matrix/3', 'CI matrix schema mismatch');
same(
  matrix.plan_items,
  [
    'P02-009',
    'P02-010',
    'P02-011',
    'P02-012',
    'P02-013',
    'P02-014',
    'P02-015',
    'P02-016',
    'P02-017',
    'P03-008',
    'P03-009',
    'P03-010',
    'P03-011',
    'P03-012',
    'P03-013',
    'P03-014',
    'P03-015',
    'P03-016',
    'P03-017',
    'P03-018',
    'P03-019',
    'P03-020',
    'P03-021',
    'P04-001',
    'P04-002',
    'P04-003',
    'P04-004',
    'P04-005',
    'P04-006',
    'P04-007',
    'P04-008',
    'P04-009',
    'P04-010',
    'P04-011',
    'P04-012',
  ],
  'CI matrix task history',
);
same(
  matrix.actions,
  {
    checkout: {
      repository: 'actions/checkout',
      version: '7.0.0',
      sha: '9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0',
    },
    setup_node: {
      repository: 'actions/setup-node',
      version: '6.4.0',
      sha: '48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
    },
    upload_artifact: {
      repository: 'actions/upload-artifact',
      version: '7.0.1',
      sha: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    },
  },
  'pinned action identities',
);
same(
  sorted(Object.keys(matrix.gating)),
  ['browser', 'native', 'node', 'portable', 'sanitizer'],
  'gating groups',
);
same(sorted(Object.keys(matrix.nightly)), ['native'], 'nightly groups');
same(sorted(Object.keys(matrix.observational)), ['benchmark'], 'observational groups');
same(
  Object.fromEntries(
    Object.entries(matrix.gating).map(([name, entries]) => [name, entries.length]),
  ),
  { node: 2, native: 3, portable: 2, sanitizer: 1, browser: 3 },
  'gating lane counts',
);
assert(matrix.nightly.native.length === 2, 'nightly native lane count mismatch');
assert(matrix.observational.benchmark.length === 1, 'observational benchmark lane count mismatch');

const allGroups = {
  ...matrix.gating,
  nightly_native: matrix.nightly.native,
  observational_benchmark: matrix.observational.benchmark,
};
const lanes = Object.values(allGroups).flat();
same(
  sorted(lanes.map(({ id }) => id)),
  sorted(new Set(lanes.map(({ id }) => id))),
  'unique lane IDs',
);
const allowedRunners = new Set([
  'ubuntu-24.04',
  'windows-2025',
  'macos-15',
  'ubuntu-24.04-arm',
  'macos-15-intel',
]);
const identityByRunner = {
  'macos-15': ['macOS', 'ARM64', 'darwin', 'arm64'],
  'macos-15-intel': ['macOS', 'X64', 'darwin', 'x64'],
  'ubuntu-24.04': ['Linux', 'X64', 'linux', 'x64'],
  'ubuntu-24.04-arm': ['Linux', 'ARM64', 'linux', 'arm64'],
  'windows-2025': ['Windows', 'X64', 'win32', 'x64'],
};
for (const lane of lanes) {
  assert(/^[a-z0-9-]+$/.test(lane.id), `${lane.id}: invalid lane ID`);
  assert(allowedRunners.has(lane.runner), `${lane.id}: mutable or unsupported runner`);
  same(
    [lane.runner_os, lane.runner_arch, lane.process_platform, lane.process_arch],
    identityByRunner[lane.runner],
    `${lane.id} runner identity`,
  );
  assert(['22.23.1', '24.18.0'].includes(lane.node), `${lane.id}: unsupported Node`);
  const described = JSON.parse(
    runNode(['tests/toolchain/check-ci-runtime.mjs', lane.id, '--describe']),
  );
  same(described, lane, `${lane.id} runtime description`);
}
same(
  matrix.gating.node.map(({ node }) => node),
  ['22.23.1', '24.18.0'],
  'Node lanes',
);
same(
  matrix.gating.native.map(({ id }) => id),
  ['linux-x64', 'windows-x64', 'macos-arm64'],
  'gating native lanes',
);
same(
  matrix.nightly.native.map(({ id }) => id),
  ['linux-arm64', 'macos-x64'],
  'nightly native lanes',
);
same(
  matrix.gating.portable.map(({ artifact, target }) => ({ artifact, target })),
  [
    { artifact: 'browser', target: 'wasm32-unknown-unknown' },
    { artifact: 'component', target: 'wasm32-wasip2' },
  ],
  'portable Rust target/artifact modes',
);
same(
  matrix.gating.sanitizer.map(({ target }) => target),
  ['x86_64-unknown-linux-gnuasan'],
  'sanitizer targets',
);
same(
  matrix.gating.browser.map(({ engine }) => engine),
  ['chromium', 'firefox', 'webkit'],
  'browser engines',
);
assert(
  matrix.gating.browser.every(
    ({ execution, expansion_task: expansionTask }) =>
      execution === 'boundary-example' && expansionTask === 'P11-014',
  ),
  'browser example/expansion boundary mismatch',
);
same(
  matrix.observational.benchmark,
  [
    {
      id: 'benchmark-baseline-linux-x64',
      runner: 'ubuntu-24.04',
      runner_os: 'Linux',
      runner_arch: 'X64',
      process_platform: 'linux',
      process_arch: 'x64',
      node: '22.23.1',
      schedule: '17 4 * * 1',
      workload: 'harness.sha256-buffer/1+hdoc-v1/1',
      retention_days: 30,
      gating: false,
    },
  ],
  'observational benchmark authority',
);
same(
  matrix.unsupported.map(({ platform }) => platform),
  ['windows-arm64', 'branded-chrome-edge-safari'],
  'unsupported profiles',
);
assert(
  matrix.unsupported.every(
    ({ reason, revisit_by: revisitBy }) => reason.length >= 40 && /^P\d{2}-\d{3}$/.test(revisitBy),
  ),
  'unsupported profile lacks reason/deadline',
);

const emitted = (mode) =>
  Object.fromEntries(
    runNode(['tests/toolchain/emit-ci-matrix.mjs', mode])
      .trim()
      .split('\n')
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), JSON.parse(line.slice(separator + 1))];
      }),
  );
same(
  emitted('gating'),
  canonical(
    Object.fromEntries(Object.entries(matrix.gating).map(([name, include]) => [name, { include }])),
  ),
  'gating emitter',
);
same(emitted('nightly'), { native: { include: matrix.nightly.native } }, 'nightly emitter');
expectFailure(['tests/toolchain/emit-ci-matrix.mjs', 'unknown'], 'usage:');
expectFailure(
  ['tests/toolchain/check-ci-runtime.mjs', 'unknown', '--describe'],
  'unknown or duplicate',
);

same(
  {
    'artifacts:browser-report': packageJson.scripts['artifacts:browser-report'],
    'artifacts:coverage-replay': packageJson.scripts['artifacts:coverage-replay'],
    'artifacts:golden-formats': packageJson.scripts['artifacts:golden-formats'],
    'artifacts:policy': packageJson.scripts['artifacts:policy'],
    'artifacts:test': packageJson.scripts['artifacts:test'],
    'artifacts:test-replay': packageJson.scripts['artifacts:test-replay'],
    'async:completion:check': packageJson.scripts['async:completion:check'],
    'async:completion:test': packageJson.scripts['async:completion:test'],
    'inputs:deterministic:check': packageJson.scripts['inputs:deterministic:check'],
    'inputs:deterministic:test': packageJson.scripts['inputs:deterministic:test'],
    'benchmark:baseline': packageJson.scripts['benchmark:baseline'],
    'benchmark:check': packageJson.scripts['benchmark:check'],
    'benchmark:schemas': packageJson.scripts['benchmark:schemas'],
    'benchmark:test': packageJson.scripts['benchmark:test'],
    'buffers:copy:check': packageJson.scripts['buffers:copy:check'],
    'buffers:copy:test': packageJson.scripts['buffers:copy:test'],
    'buffers:alternatives:check': packageJson.scripts['buffers:alternatives:check'],
    'buffers:alternatives:test': packageJson.scripts['buffers:alternatives:test'],
    'bootstrap:check': packageJson.scripts['bootstrap:check'],
    'bootstrap:preflight': packageJson.scripts['bootstrap:preflight'],
    'bootstrap:test': packageJson.scripts['bootstrap:test'],
    'ci:browser-smoke': packageJson.scripts['ci:browser-smoke'],
    'ci:check': packageJson.scripts['ci:check'],
    'coverage:check': packageJson.scripts['coverage:check'],
    'coverage:policy': packageJson.scripts['coverage:policy'],
    'dependencies:check': packageJson.scripts['dependencies:check'],
    'dependencies:licenses': packageJson.scripts['dependencies:licenses'],
    'dependencies:report': packageJson.scripts['dependencies:report'],
    'examples:browser': packageJson.scripts['examples:browser'],
    'examples:check': packageJson.scripts['examples:check'],
    'examples:native': packageJson.scripts['examples:native'],
    'examples:policy': packageJson.scripts['examples:policy'],
    'examples:test': packageJson.scripts['examples:test'],
    'fuzz:policy': packageJson.scripts['fuzz:policy'],
    'fuzz:smoke': packageJson.scripts['fuzz:smoke'],
    'fuzz:test': packageJson.scripts['fuzz:test'],
    'host:capabilities:check': packageJson.scripts['host:capabilities:check'],
    'host:capabilities:test': packageJson.scripts['host:capabilities:test'],
    'host:browser:check': packageJson.scripts['host:browser:check'],
    'host:browser:test': packageJson.scripts['host:browser:test'],
    'host:mock:check': packageJson.scripts['host:mock:check'],
    'host:mock:test': packageJson.scripts['host:mock:test'],
    'host:native:check': packageJson.scripts['host:native:check'],
    'host:native:test': packageJson.scripts['host:native:test'],
    'storage:batch:check': packageJson.scripts['storage:batch:check'],
    'storage:batch:test': packageJson.scripts['storage:batch:test'],
    'resources:lifecycle:check': packageJson.scripts['resources:lifecycle:check'],
    'resources:lifecycle:test': packageJson.scripts['resources:lifecycle:test'],
    'rust:audit:install': packageJson.scripts['rust:audit:install'],
    'rust:audit:test': packageJson.scripts['rust:audit:test'],
    'rust:dependencies:test': packageJson.scripts['rust:dependencies:test'],
    'core:boundary:check': packageJson.scripts['core:boundary:check'],
    'core:boundary:test': packageJson.scripts['core:boundary:test'],
    'wasm:install-validator': packageJson.scripts['wasm:install-validator'],
    'wasm:abi:check': packageJson.scripts['wasm:abi:check'],
    'wasm:abi:test': packageJson.scripts['wasm:abi:test'],
    'wasm:validate': packageJson.scripts['wasm:validate'],
    'wgsl:check': packageJson.scripts['wgsl:check'],
    'wgsl:validate': packageJson.scripts['wgsl:validate'],
  },
  {
    'artifacts:browser-report':
      'node tests/toolchain/collect-retained-artifacts.mjs browser-reports',
    'artifacts:coverage-replay':
      'node tests/toolchain/collect-retained-artifacts.mjs test-replays coverage',
    'artifacts:golden-formats':
      'node tests/toolchain/collect-retained-artifacts.mjs golden-formats hdoc-v1',
    'artifacts:policy': 'node tests/toolchain/check-retained-artifacts.mjs policy',
    'artifacts:test': 'node tests/toolchain/test-artifact-retention-contract.mjs',
    'artifacts:test-replay':
      'node tests/toolchain/collect-retained-artifacts.mjs test-replays semantic',
    'async:completion:check': 'node tests/toolchain/check-async-completion-contract.mjs',
    'async:completion:test': 'node tests/toolchain/test-async-completion-contract.mjs',
    'inputs:deterministic:check': 'node tests/toolchain/check-deterministic-injection-contract.mjs',
    'inputs:deterministic:test': 'node tests/toolchain/test-deterministic-injection-contract.mjs',
    'benchmark:baseline': 'node benchmarks/run-baseline.mjs',
    'benchmark:check': 'node benchmarks/check-benchmark-artifacts.mjs report',
    'benchmark:schemas': 'node benchmarks/check-benchmark-artifacts.mjs schemas',
    'benchmark:test': 'node tests/toolchain/test-benchmark-contract.mjs',
    'buffers:copy:check': 'node tests/toolchain/check-explicit-copy-buffer.mjs',
    'buffers:copy:test': 'node tests/toolchain/test-explicit-copy-buffer-contract.mjs',
    'buffers:alternatives:check': 'node tests/toolchain/check-buffer-transport-alternatives.mjs',
    'buffers:alternatives:test':
      'node tests/toolchain/test-buffer-transport-alternatives-contract.mjs',
    'bootstrap:check': 'node tests/toolchain/check-bootstrap.mjs contract',
    'bootstrap:preflight': 'node tests/toolchain/check-bootstrap.mjs preflight',
    'bootstrap:test': 'node tests/toolchain/test-bootstrap-contract.mjs',
    'ci:browser-smoke': 'node tests/toolchain/run-browser-smoke.mjs',
    'ci:check': 'node tests/toolchain/check-ci-matrix.mjs',
    'coverage:check': 'node tests/toolchain/check-rust-coverage.mjs run',
    'coverage:policy': 'node tests/toolchain/check-rust-coverage.mjs policy',
    'dependencies:check': 'node tests/toolchain/check-dependency-reports.mjs offline',
    'dependencies:licenses': 'node tests/toolchain/check-dependency-reports.mjs licenses',
    'dependencies:report': 'node tests/toolchain/check-dependency-reports.mjs live',
    'examples:browser': 'node tests/toolchain/check-examples.mjs browser',
    'examples:check': 'node tests/toolchain/check-examples.mjs all',
    'examples:native': 'node tests/toolchain/check-examples.mjs native',
    'examples:policy': 'node tests/toolchain/check-examples.mjs policy',
    'examples:test': 'node tests/toolchain/test-examples-contract.mjs',
    'fuzz:policy': 'node tests/toolchain/check-hdoc-fuzz.mjs policy',
    'fuzz:smoke': 'node tests/toolchain/check-hdoc-fuzz.mjs smoke',
    'fuzz:test': 'node tests/toolchain/test-hdoc-fuzz-contract.mjs',
    'host:capabilities:check': 'node tests/toolchain/check-host-capabilities.mjs',
    'host:capabilities:test': 'node tests/toolchain/test-host-capabilities-contract.mjs',
    'host:browser:check': 'node tests/toolchain/check-browser-host-skeleton.mjs',
    'host:browser:test': 'node tests/toolchain/test-browser-host-skeleton.mjs',
    'host:mock:check': 'node tests/toolchain/check-mock-host-contract.mjs',
    'host:mock:test': 'node tests/toolchain/test-mock-host-contract.mjs',
    'host:native:check': 'node tests/toolchain/check-native-host-skeleton.mjs',
    'host:native:test': 'node tests/toolchain/test-native-host-skeleton.mjs',
    'storage:batch:check': 'node tests/toolchain/check-storage-batch-abi.mjs',
    'storage:batch:test': 'node tests/toolchain/test-storage-batch-abi-contract.mjs',
    'resources:lifecycle:check': 'node tests/toolchain/check-resource-lifecycle-abi.mjs',
    'resources:lifecycle:test': 'node tests/toolchain/test-resource-lifecycle-abi-contract.mjs',
    'rust:audit:install': 'node tests/toolchain/install-cargo-audit.mjs',
    'rust:audit:test': 'node tests/toolchain/test-cargo-audit-contract.mjs',
    'rust:dependencies:test': 'node tests/toolchain/test-rust-dependency-contract.mjs',
    'core:boundary:check': 'node tests/toolchain/check-deterministic-core.mjs',
    'core:boundary:test': 'node tests/toolchain/test-deterministic-core-contract.mjs',
    'wasm:install-validator': 'node tests/toolchain/install-wasm-tools.mjs',
    'wasm:abi:check': 'node tests/toolchain/check-wasm-abi.mjs',
    'wasm:abi:test': 'node tests/toolchain/test-wasm-abi-contract.mjs',
    'wasm:validate':
      'node tests/toolchain/check-deterministic-core.mjs && node tests/toolchain/check-wasm-abi.mjs && node tests/toolchain/check-host-capabilities.mjs && node tests/toolchain/check-storage-batch-abi.mjs && node tests/toolchain/check-resource-lifecycle-abi.mjs && node tests/toolchain/check-explicit-copy-buffer.mjs && node tests/toolchain/check-buffer-transport-alternatives.mjs && node tests/toolchain/check-async-completion-contract.mjs && node tests/toolchain/check-deterministic-injection-contract.mjs && node tests/toolchain/check-mock-host-contract.mjs && node tests/toolchain/check-native-host-skeleton.mjs && node tests/toolchain/check-browser-host-skeleton.mjs && node tests/toolchain/check-wasm-artifacts.mjs all',
    'wgsl:check': 'node tests/toolchain/check-wgsl-fixtures.mjs manifest',
    'wgsl:validate': 'node tests/toolchain/check-wgsl-fixtures.mjs chromium',
  },
  'CI npm scripts',
);
assert(
  runNode(['tests/toolchain/check-bootstrap.mjs', 'contract']).includes(
    'PASS clean bootstrap contract: 4 profiles, 5 native hosts, 19 troubleshooting codes, immutable HDoc golden vectors active',
  ),
  'clean bootstrap contract did not pass',
);
assert(
  runNode(['tests/toolchain/test-bootstrap-contract.mjs']).includes(
    'PASS clean bootstrap rejection canaries: 35 contract/source mutations, 11 Node boundaries, and 7 host mappings verified',
  ),
  'clean bootstrap rejection canaries did not pass',
);
expectFailure(
  ['tests/toolchain/check-bootstrap.mjs'],
  'usage: node tests/toolchain/check-bootstrap.mjs <contract|preflight>',
);
expectFailure(
  ['tests/toolchain/check-bootstrap.mjs', 'unknown'],
  'usage: node tests/toolchain/check-bootstrap.mjs <contract|preflight>',
);
assert(
  runNode(['tests/toolchain/check-examples.mjs', 'policy']).includes(
    'PASS toolchain example policy: 2 active boundary examples, 9 hashable authority files, database functionality false',
  ),
  'toolchain example policy did not pass',
);
assert(
  runNode(['tests/toolchain/test-examples-contract.mjs']).includes(
    'PASS toolchain example rejection canaries: 32 line-ending/policy/native/browser/bundle mutations rejected with exact reasons',
  ),
  'toolchain example rejection canaries did not pass',
);
expectFailure(
  ['tests/toolchain/check-examples.mjs'],
  'usage: node tests/toolchain/check-examples.mjs',
);
expectFailure(
  ['tests/toolchain/check-examples.mjs', 'unknown'],
  'usage: node tests/toolchain/check-examples.mjs',
);
assert(
  runNode(['tests/toolchain/check-rust-coverage.mjs', 'policy']).includes(
    'PASS Rust coverage policy: 3 threshold groups',
  ),
  'Rust coverage policy did not pass',
);
expectFailure(
  ['tests/toolchain/check-rust-coverage.mjs'],
  'usage: node tests/toolchain/check-rust-coverage.mjs <policy|run>',
);
expectFailure(
  ['tests/toolchain/check-rust-coverage.mjs', 'unknown'],
  'usage: node tests/toolchain/check-rust-coverage.mjs <policy|run>',
);
assert(
  runNode(['tests/toolchain/check-dependency-reports.mjs', 'offline']).includes(
    'PASS dependency inventory: 91 npm development packages, 121 external Rust packages, 73 license/notice files, 1 duplicate family',
  ),
  'dependency inventory report did not pass',
);
expectFailure(
  ['tests/toolchain/check-dependency-reports.mjs'],
  'usage: node tests/toolchain/check-dependency-reports.mjs <offline|live|licenses>',
);
expectFailure(
  ['tests/toolchain/check-dependency-reports.mjs', 'unknown'],
  'usage: node tests/toolchain/check-dependency-reports.mjs <offline|live|licenses>',
);
assert(
  runNode(['benchmarks/check-benchmark-artifacts.mjs', 'schemas']).includes(
    'PASS benchmark schemas: 3 strict schemas, workload harness.sha256-buffer/1, 1 deterministic dataset',
  ),
  'benchmark schema contract did not pass',
);
assert(
  runNode(['tests/toolchain/check-retained-artifacts.mjs', 'policy']).includes(
    'PASS artifact retention policy: 3 strict schemas, 5 profiles, 3 active, 2 reserved',
  ),
  'artifact retention policy did not pass',
);
assert(
  runNode(['tests/toolchain/test-artifact-retention-contract.mjs']).includes(
    'PASS artifact retention rejection canaries: 41 policy/profile/producer/reservation/engine/bundle/browser/dependency mutations rejected with exact reasons',
  ),
  'artifact retention rejection canaries did not pass',
);
expectFailure(
  ['tests/toolchain/check-retained-artifacts.mjs'],
  'usage: node tests/toolchain/check-retained-artifacts.mjs',
);
expectFailure(
  ['tests/toolchain/check-retained-artifacts.mjs', 'unknown'],
  'usage: node tests/toolchain/check-retained-artifacts.mjs',
);
expectFailure(
  ['tests/toolchain/collect-retained-artifacts.mjs'],
  'usage: node tests/toolchain/collect-retained-artifacts.mjs',
);
expectFailure(
  ['tests/toolchain/collect-retained-artifacts.mjs', 'golden-formats', 'v1'],
  'usage: node tests/toolchain/collect-retained-artifacts.mjs',
);
expectFailure(
  ['tests/toolchain/run-browser-smoke.mjs', 'chrome'],
  'usage: node tests/toolchain/run-browser-smoke.mjs',
);
expectFailure(
  ['benchmarks/check-benchmark-artifacts.mjs'],
  'usage: node benchmarks/check-benchmark-artifacts.mjs <schemas|report>',
);
expectFailure(
  ['benchmarks/check-benchmark-artifacts.mjs', 'unknown'],
  'usage: node benchmarks/check-benchmark-artifacts.mjs <schemas|report>',
);
assert(
  runNode(['tests/toolchain/check-wgsl-fixtures.mjs', 'manifest']).includes(
    'PASS WGSL fixture manifest: 4 trusted sources, 2 accept, 2 reject',
  ),
  'WGSL fixture manifest check did not pass',
);
expectFailure(
  ['tests/toolchain/check-wgsl-fixtures.mjs'],
  'usage: node tests/toolchain/check-wgsl-fixtures.mjs <manifest|chromium>',
);
expectFailure(
  ['tests/toolchain/check-wgsl-fixtures.mjs', 'unknown'],
  'usage: node tests/toolchain/check-wgsl-fixtures.mjs <manifest|chromium>',
);
const { authority: wasmTools, host: wasmToolsHost } = validateWasmToolsAuthority();
assert(wasmTools.version === '1.253.0', 'component validator version mismatch');
assert(
  wasmToolsHost.platform === 'linux' && wasmToolsHost.architecture === 'x64',
  'validator host',
);
const playwright = readText('playwright.config.ts');
for (const marker of [
  "testDir: './tests/browser'",
  "testMatch: '**/*.spec.ts'",
  "{ name: 'chromium', use: { browserName: 'chromium', headless: true } }",
  "{ name: 'firefox', use: { browserName: 'firefox', headless: true } }",
  "{ name: 'webkit', use: { browserName: 'webkit', headless: true } }",
  'workers: 1',
  'retries: 0',
  'forbidOnly: true',
  "baseURL: 'http://127.0.0.1:4173'",
  "command: 'corepack npm run browser:serve'",
  "url: 'http://127.0.0.1:4173/index.html'",
]) {
  assert(playwright.includes(marker), `Playwright matrix marker absent: ${marker}`);
}

const workflowPaths = [
  '.github/workflows/ci.yml',
  '.github/workflows/ci-nightly.yml',
  '.github/workflows/benchmark-baseline.yml',
];
const actionUses = [];
let checkoutHardeningCount = 0;
let setupHardeningCount = 0;
let artifactMissingFailureCount = 0;
let artifactRetentionCount = 0;
let artifactNoOverwriteCount = 0;
let artifactHiddenExclusionCount = 0;
let artifactArchiveCount = 0;
for (const workflowPath of workflowPaths) {
  const workflow = readText(workflowPath);
  assert(workflow.endsWith('\n'), `${workflowPath}: missing terminal newline`);
  for (const [index, line] of workflow.split('\n').entries()) {
    assert(!line.includes('\t'), `${workflowPath}:${index + 1}: tab indentation`);
    assert(!/[ \t]+$/.test(line), `${workflowPath}:${index + 1}: trailing whitespace`);
    const leading = line.match(/^ */)?.[0].length ?? 0;
    assert(leading % 2 === 0, `${workflowPath}:${index + 1}: odd indentation`);
  }
  for (const forbidden of [
    'pull_request_target',
    'continue-on-error: true',
    'permissions: write-all',
    'ubuntu-latest',
    'windows-latest',
    'macos-latest',
    '|| true',
  ]) {
    assert(!workflow.includes(forbidden), `${workflowPath}: forbidden marker ${forbidden}`);
  }
  assert(
    workflow.includes('permissions:\n  contents: read'),
    `${workflowPath}: read-only permissions absent`,
  );
  assert(
    workflow.includes('persist-credentials: false'),
    `${workflowPath}: checkout credentials persist`,
  );
  assert(
    workflow.includes('package-manager-cache: false'),
    `${workflowPath}: implicit cache enabled`,
  );
  const useLines = workflow.split('\n').filter((line) => line.trimStart().startsWith('uses:'));
  assert(
    useLines.every((line) => /^\s*uses: [^@\s]+@[0-9a-f]{40}(?: # v\d+\.\d+\.\d+)?$/.test(line)),
    `${workflowPath}: mutable or malformed action use`,
  );
  actionUses.push(...workflow.matchAll(/uses: ([^@\s]+)@([0-9a-f]{40})/g));
  checkoutHardeningCount += [...workflow.matchAll(/persist-credentials: false/g)].length;
  setupHardeningCount += [...workflow.matchAll(/package-manager-cache: false/g)].length;
  artifactMissingFailureCount += [...workflow.matchAll(/if-no-files-found: error/g)].length;
  artifactRetentionCount += [...workflow.matchAll(/retention-days: 30/g)].length;
  artifactNoOverwriteCount += [...workflow.matchAll(/overwrite: false/g)].length;
  artifactHiddenExclusionCount += [...workflow.matchAll(/include-hidden-files: false/g)].length;
  artifactArchiveCount += [...workflow.matchAll(/archive: true/g)].length;
}
assert(actionUses.length === 23, `workflow action-use count mismatch: ${actionUses.length}`);
assert(checkoutHardeningCount === 9, `checkout hardening count: ${checkoutHardeningCount}`);
assert(setupHardeningCount === 9, `setup-node hardening count: ${setupHardeningCount}`);
assert(
  artifactMissingFailureCount === 5,
  `artifact missing-file hardening: ${artifactMissingFailureCount}`,
);
assert(artifactRetentionCount === 4, `artifact retention count: ${artifactRetentionCount}`);
assert(artifactNoOverwriteCount === 5, `artifact overwrite hardening: ${artifactNoOverwriteCount}`);
assert(
  artifactHiddenExclusionCount === 5,
  `artifact hidden-file hardening: ${artifactHiddenExclusionCount}`,
);
assert(artifactArchiveCount === 5, `artifact archive count: ${artifactArchiveCount}`);
for (const use of actionUses) {
  const action = Object.values(matrix.actions).find(({ repository: name }) => name === use[1]);
  assert(action && action.sha === use[2], `unapproved action pin: ${use[1]}@${use[2]}`);
}
const ci = readText('.github/workflows/ci.yml');
const contractFetchStep = `      - name: Fetch the exact locked Rust graph for offline contract checks
        env:
          CARGO_NET_OFFLINE: "false"
        run: cargo fetch --locked
`;
assert(ci.includes(contractFetchStep), 'contract-job Rust fetch boundary absent');
assert(
  ci.indexOf(contractFetchStep) < ci.indexOf('      - name: Validate CI contract'),
  'contract-job Rust fetch must precede offline CI validation',
);
for (const marker of [
  'pull_request:',
  'push:',
  'workflow_dispatch:',
  `node: ${githubExpression('steps.matrix.outputs.node')}`,
  `matrix: ${githubExpression('fromJSON(needs.contract.outputs.node)')}`,
  `matrix: ${githubExpression('fromJSON(needs.contract.outputs.native)')}`,
  `matrix: ${githubExpression('fromJSON(needs.contract.outputs.portable)')}`,
  `matrix: ${githubExpression('fromJSON(needs.contract.outputs.sanitizer)')}`,
  `matrix: ${githubExpression('fromJSON(needs.contract.outputs.browser)')}`,
  'corepack npm run bootstrap:check',
  'corepack npm run bootstrap:test',
  `cargo clippy --frozen --target ${githubExpression('matrix.target')} --package helix-core -- -D warnings`,
  `node tests/toolchain/check-wasm-artifacts.mjs ${githubExpression('matrix.artifact')}`,
  'corepack npm run dependencies:check',
  'cargo fetch --locked',
  'node tests/toolchain/check-rust-coverage.mjs run',
  "if: matrix.node == '22.23.1'",
  'corepack npm run dependencies:report',
  'corepack npm run rust:audit:install',
  'corepack npm run rust:audit:test',
  'corepack npm run rust:dependencies:test',
  `playwright install --with-deps ${githubExpression('matrix.engine')}`,
  'corepack npm run wgsl:check',
  'rustup toolchain install nightly-2026-06-30 --profile minimal',
  'cargo install cargo-fuzz --locked --version 0.13.2',
  'cargo +nightly-2026-06-30 fetch --locked --manifest-path fuzz/Cargo.toml',
  'corepack npm run fuzz:policy',
  'corepack npm run fuzz:test',
  "if: matrix.engine == 'chromium'",
  'corepack npm run wgsl:validate',
  `corepack npm run ci:browser-smoke -- ${githubExpression('matrix.engine')}`,
  'corepack npm run examples:native',
  "if: always() && matrix.node == '22.23.1'",
  'corepack npm run artifacts:test-replay',
  'corepack npm run artifacts:golden-formats',
  `name: golden-formats-hdoc-v1-${githubExpression('github.run_id')}-${githubExpression('github.run_attempt')}`,
  'path: dist/retention/golden-formats/hdoc-v1/',
  `name: test-replays-semantic-node-${githubExpression('matrix.node')}-${githubExpression('github.run_id')}-${githubExpression('github.run_attempt')}`,
  'path: dist/retention/test-replays/semantic/',
  "if: always() && matrix.id == 'linux-x64'",
  'corepack npm run artifacts:coverage-replay',
  `name: test-replays-coverage-${githubExpression('matrix.id')}-${githubExpression('github.run_id')}-${githubExpression('github.run_attempt')}`,
  'path: dist/retention/test-replays/coverage/',
  `corepack npm run artifacts:browser-report -- ${githubExpression('matrix.engine')}`,
  `name: browser-reports-${githubExpression('matrix.engine')}-${githubExpression('github.run_id')}-${githubExpression('github.run_attempt')}`,
  `path: dist/retention/browser-reports/${githubExpression('matrix.engine')}/`,
  'corepack npm run wasm:abi:check',
  'corepack npm run wasm:abi:test',
  'corepack npm run core:boundary:check',
  'corepack npm run core:boundary:test',
  'corepack npm run host:capabilities:check',
  'corepack npm run host:capabilities:test',
  'corepack npm run storage:batch:check',
  'corepack npm run storage:batch:test',
  'corepack npm run resources:lifecycle:check',
  'corepack npm run resources:lifecycle:test',
  'corepack npm run buffers:copy:check',
  'corepack npm run buffers:copy:test',
  'corepack npm run buffers:alternatives:check',
  'corepack npm run buffers:alternatives:test',
  'corepack npm run async:completion:check',
  'corepack npm run async:completion:test',
  'corepack npm run inputs:deterministic:check',
  'corepack npm run inputs:deterministic:test',
  'corepack npm run host:mock:check',
  'corepack npm run host:mock:test',
  'corepack npm run host:native:check',
  'corepack npm run host:native:test',
  'corepack npm run host:browser:check',
  'corepack npm run host:browser:test',
]) {
  assert(ci.includes(marker), `gating workflow marker absent: ${marker}`);
}
const buildProfileRunner = readText('tests/toolchain/run-build-profile.mjs');
const sanitizerPackageBlock = buildProfileRunner.match(
  /const sanitizerPackages = \[([\s\S]*?)\];/,
)?.[1];
assert(sanitizerPackageBlock, 'sanitizer package block absent');
for (const marker of [
  "'helix-columnar'",
  "'helix-core'",
  "'helix-doc'",
  "'helix-gpu'",
  "'helix-host-mock'",
  "'helix-query'",
  "'helix-storage'",
  '...sanitizerPackages.flatMap',
]) {
  assert(
    marker.startsWith("'helix-")
      ? sanitizerPackageBlock.includes(marker)
      : buildProfileRunner.includes(marker),
    `sanitizer package marker absent: ${marker}`,
  );
}
for (const forbidden of ["'helix-host-native'", "'helix-server'"]) {
  assert(
    !sanitizerPackageBlock.includes(forbidden),
    `sanitizer-incompatible package present: ${forbidden}`,
  );
}
const nightly = readText('.github/workflows/ci-nightly.yml');
for (const marker of [
  'schedule:',
  'cron: "23 3 * * *"',
  'node tests/toolchain/emit-ci-matrix.mjs nightly',
  `matrix: ${githubExpression('fromJSON(needs.contract.outputs.native)')}`,
  'corepack npm run examples:native',
]) {
  assert(nightly.includes(marker), `nightly workflow marker absent: ${marker}`);
}
const benchmark = readText('.github/workflows/benchmark-baseline.yml');
for (const marker of [
  'schedule:',
  'cron: "17 4 * * 1"',
  'workflow_dispatch:',
  'runs-on: ubuntu-24.04',
  'node-version: 22.23.1',
  'node tests/toolchain/check-ci-runtime.mjs benchmark-baseline-linux-x64',
  'corepack npm run benchmark:schemas',
  'corepack npm run benchmark:hdoc:policy',
  'corepack npm run test:benchmark',
  'if: always()',
  'uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1',
  `name: benchmark-results-${githubExpression('github.run_id')}-${githubExpression('github.run_attempt')}`,
  'path: dist/benchmarks/',
  'if-no-files-found: error',
  'retention-days: 30',
  'overwrite: false',
  'include-hidden-files: false',
  'archive: true',
]) {
  assert(benchmark.includes(marker), `benchmark workflow marker absent: ${marker}`);
}
for (const forbidden of ['pull_request:', 'push:', 'continue-on-error']) {
  assert(!benchmark.includes(forbidden), `benchmark workflow became gating: ${forbidden}`);
}

const policy = readText('docs/architecture/continuous-integration.md');
for (const marker of [
  'ubuntu-24.04-arm',
  'macos-15-intel',
  'windows-2025',
  'boundary-example',
  'wasm-tools',
  'SwiftShader',
  'registry signatures',
  'source-based coverage',
  'non-gating benchmark',
  'upload-artifact',
  'artifact retention',
  'https://docs.github.com/en/actions/reference/runners/github-hosted-runners',
  'https://playwright.dev/docs/ci',
  'does not prove',
]) {
  assert(policy.includes(marker), `CI policy marker absent: ${marker}`);
}

process.stdout.write(
  'PASS CI matrix: 11 gating lanes, 2 nightly native lanes, 1 observational benchmark lane\n',
);
process.stdout.write('PASS platforms: Linux/Windows/macOS and x64/arm64 with 2 portable targets\n');
process.stdout.write('PASS JavaScript/browser: 2 Node lines and 3 real boundary-example engines\n');
process.stdout.write(
  'PASS examples: native boundary report on 5 native lanes; browser boundary example on 3 engines\n',
);
process.stdout.write(
  'PASS bootstrap: 4 documented profiles, 19 stable troubleshooting codes, and clean-host preflight\n',
);
process.stdout.write(
  'PASS workflow policy: 23 full-SHA action uses, read-only permissions, fixed runners\n',
);
process.stdout.write(
  'PASS portable artifacts: core module plus pinned-validator WASIp2 component\n',
);
process.stdout.write(
  'PASS WGSL fixtures: 2 accepted pipelines and 2 rejection canaries in Chromium\n',
);
process.stdout.write(
  'PASS dependency reports: exact npm/Rust inventories plus Node 22 npm and RustSec live observation\n',
);
process.stdout.write(
  'PASS Rust coverage: compiler-matched LLVM report plus semantic/recovery thresholds\n',
);
process.stdout.write(
  'PASS benchmark baseline: scheduled/manual only, integrity-gated raw artifact retention\n',
);
process.stdout.write(
  'PASS artifact retention: golden/semantic/coverage/browser bundles uploaded on all outcomes; 2 future classes reserved\n',
);
process.stdout.write('PASS matrix rejection: unknown emitter/runtime lanes fail\n');

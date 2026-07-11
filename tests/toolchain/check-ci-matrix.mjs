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
  ['actions', 'gating', 'nightly', 'plan_items', 'schema', 'unsupported'],
  'matrix fields',
);
assert(matrix.schema === 'helix.ci-matrix/2', 'CI matrix schema mismatch');
same(
  matrix.plan_items,
  ['P02-009', 'P02-010', 'P02-011', 'P02-012', 'P02-013'],
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
  },
  'pinned action identities',
);
same(
  sorted(Object.keys(matrix.gating)),
  ['browser', 'native', 'node', 'portable', 'sanitizer'],
  'gating groups',
);
same(sorted(Object.keys(matrix.nightly)), ['native'], 'nightly groups');
same(
  Object.fromEntries(
    Object.entries(matrix.gating).map(([name, entries]) => [name, entries.length]),
  ),
  { node: 2, native: 3, portable: 2, sanitizer: 1, browser: 3 },
  'gating lane counts',
);
assert(matrix.nightly.native.length === 2, 'nightly native lane count mismatch');

const allGroups = { ...matrix.gating, nightly_native: matrix.nightly.native };
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
      execution === 'toolchain-smoke' && expansionTask === 'P02-016',
  ),
  'browser smoke/expansion boundary mismatch',
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
    'ci:browser-smoke': packageJson.scripts['ci:browser-smoke'],
    'ci:check': packageJson.scripts['ci:check'],
    'coverage:check': packageJson.scripts['coverage:check'],
    'coverage:policy': packageJson.scripts['coverage:policy'],
    'dependencies:check': packageJson.scripts['dependencies:check'],
    'dependencies:licenses': packageJson.scripts['dependencies:licenses'],
    'dependencies:report': packageJson.scripts['dependencies:report'],
    'wasm:install-validator': packageJson.scripts['wasm:install-validator'],
    'wasm:validate': packageJson.scripts['wasm:validate'],
    'wgsl:check': packageJson.scripts['wgsl:check'],
    'wgsl:validate': packageJson.scripts['wgsl:validate'],
  },
  {
    'ci:browser-smoke': 'node tests/toolchain/run-browser-smoke.mjs',
    'ci:check': 'node tests/toolchain/check-ci-matrix.mjs',
    'coverage:check': 'node tests/toolchain/check-rust-coverage.mjs run',
    'coverage:policy': 'node tests/toolchain/check-rust-coverage.mjs policy',
    'dependencies:check': 'node tests/toolchain/check-dependency-reports.mjs offline',
    'dependencies:licenses': 'node tests/toolchain/check-dependency-reports.mjs licenses',
    'dependencies:report': 'node tests/toolchain/check-dependency-reports.mjs live',
    'wasm:install-validator': 'node tests/toolchain/install-wasm-tools.mjs',
    'wasm:validate': 'node tests/toolchain/check-wasm-artifacts.mjs all',
    'wgsl:check': 'node tests/toolchain/check-wgsl-fixtures.mjs manifest',
    'wgsl:validate': 'node tests/toolchain/check-wgsl-fixtures.mjs chromium',
  },
  'CI npm scripts',
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
    'PASS dependency inventory: 91 npm development packages, 0 external Rust packages, 73 license/notice files, 1 duplicate family',
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

const workflowPaths = ['.github/workflows/ci.yml', '.github/workflows/ci-nightly.yml'];
const actionUses = [];
let checkoutHardeningCount = 0;
let setupHardeningCount = 0;
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
}
assert(actionUses.length === 16, `workflow action-use count mismatch: ${actionUses.length}`);
assert(checkoutHardeningCount === 8, `checkout hardening count: ${checkoutHardeningCount}`);
assert(setupHardeningCount === 8, `setup-node hardening count: ${setupHardeningCount}`);
for (const use of actionUses) {
  const action = Object.values(matrix.actions).find(({ repository: name }) => name === use[1]);
  assert(action && action.sha === use[2], `unapproved action pin: ${use[1]}@${use[2]}`);
}
const ci = readText('.github/workflows/ci.yml');
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
  `cargo clippy --frozen --target ${githubExpression('matrix.target')} --package helix-core -- -D warnings`,
  `node tests/toolchain/check-wasm-artifacts.mjs ${githubExpression('matrix.artifact')}`,
  'corepack npm run dependencies:check',
  'node tests/toolchain/check-rust-coverage.mjs run',
  "if: matrix.node == '22.23.1'",
  'corepack npm run dependencies:report',
  `playwright install --with-deps ${githubExpression('matrix.engine')}`,
  'corepack npm run wgsl:check',
  "if: matrix.engine == 'chromium'",
  'corepack npm run wgsl:validate',
  `corepack npm run ci:browser-smoke -- ${githubExpression('matrix.engine')}`,
]) {
  assert(ci.includes(marker), `gating workflow marker absent: ${marker}`);
}
const nightly = readText('.github/workflows/ci-nightly.yml');
for (const marker of [
  'schedule:',
  'cron: "23 3 * * *"',
  'node tests/toolchain/emit-ci-matrix.mjs nightly',
  `matrix: ${githubExpression('fromJSON(needs.contract.outputs.native)')}`,
]) {
  assert(nightly.includes(marker), `nightly workflow marker absent: ${marker}`);
}

const policy = readText('docs/architecture/continuous-integration.md');
for (const marker of [
  'ubuntu-24.04-arm',
  'macos-15-intel',
  'windows-2025',
  'toolchain-smoke',
  'wasm-tools',
  'SwiftShader',
  'registry signatures',
  'source-based coverage',
  'https://docs.github.com/en/actions/reference/runners/github-hosted-runners',
  'https://playwright.dev/docs/ci',
  'does not prove',
]) {
  assert(policy.includes(marker), `CI policy marker absent: ${marker}`);
}

process.stdout.write('PASS CI matrix: 11 gating lanes and 2 nightly native lanes\n');
process.stdout.write('PASS platforms: Linux/Windows/macOS and x64/arm64 with 2 portable targets\n');
process.stdout.write('PASS JavaScript/browser: 2 Node lines and 3 real bundle-smoke engines\n');
process.stdout.write(
  'PASS workflow policy: 16 full-SHA action uses, read-only permissions, fixed runners\n',
);
process.stdout.write(
  'PASS portable artifacts: core module plus pinned-validator WASIp2 component\n',
);
process.stdout.write(
  'PASS WGSL fixtures: 2 accepted pipelines and 2 rejection canaries in Chromium\n',
);
process.stdout.write(
  'PASS dependency reports: lock/license/duplicate inventory plus Node 22 live observation\n',
);
process.stdout.write(
  'PASS Rust coverage: compiler-matched LLVM report plus semantic/recovery thresholds\n',
);
process.stdout.write('PASS matrix rejection: unknown emitter/runtime lanes fail\n');

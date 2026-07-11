#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidenceDirectory = path.join(repository, 'evidence/phase-02/P02-009');
const manifest = JSON.parse(readFileSync(path.join(evidenceDirectory, 'manifest.json'), 'utf8'));
const commitArgument = process.argv[2];

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
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (args) =>
  execFileSync('git', args, { cwd: repository, maxBuffer: 64 * 1024 * 1024 });
const gitText = (args) => gitBytes(args).toString('utf8');
const showBytes = (file) => gitBytes(['show', `${manifest.commit}:${file}`]);
const showText = (file) => showBytes(file).toString('utf8');

assert(commitArgument, 'usage: node evidence/phase-02/P02-009/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P02-009', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(
  manifest.requirements,
  [
    'PLAT-001',
    'PLAT-002',
    'PLAT-003',
    'INV-003',
    'INV-004',
    'INV-007',
    'CORE-001',
    'CORE-003',
    'QUAL-001',
  ],
  'evidence requirements',
);
same(manifest.accepted_adrs, ['0001'], 'accepted ADR inventory');

const artifactPaths = manifest.artifacts.map(({ path: artifactPath }) => artifactPath);
same(sorted(artifactPaths), sorted(new Set(artifactPaths)), 'unique artifact paths');
assert(manifest.artifacts.length === 21, 'artifact count mismatch');
const changedRecords = gitText([
  'diff-tree',
  '--no-commit-id',
  '--name-status',
  '-r',
  `${commitArgument}^`,
  commitArgument,
])
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...parts] = line.split('\t');
    return { status, path: parts.at(-1) };
  });
same(
  sorted(changedRecords.map(({ path: changedPath }) => changedPath)),
  sorted(artifactPaths),
  'exact source-commit scope',
);
assert(
  changedRecords.every(({ status }) => status === 'A' || status === 'M'),
  `source commit contains unsupported status: ${JSON.stringify(changedRecords)}`,
);
for (const artifact of manifest.artifacts) {
  const bytes = showBytes(artifact.path);
  assert(bytes.length === artifact.bytes, `${artifact.path}: byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: SHA-256 mismatch`);
}

const verifierPath = path.join(evidenceDirectory, 'verify.mjs');
const verifierBytes = readFileSync(verifierPath);
assert(statSync(verifierPath).size === manifest.verifier.bytes, 'verifier byte count mismatch');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256 mismatch');

const matrix = JSON.parse(showText('.github/ci/matrix.json'));
assert(matrix.schema === 'helix.ci-matrix/1', 'matrix schema mismatch');
assert(matrix.plan_item === 'P02-009', 'matrix plan item mismatch');
same(
  Object.fromEntries(Object.entries(matrix.gating).map(([name, entries]) => [name, entries.length])),
  { node: 2, native: 3, portable: 2, sanitizer: 1, browser: 3 },
  'gating lane counts',
);
assert(matrix.nightly.native.length === 2, 'nightly native lane count mismatch');
const allLanes = [...Object.values(matrix.gating), ...Object.values(matrix.nightly)].flat();
assert(allLanes.length === 13, 'total lane count mismatch');
same(
  sorted(allLanes.map(({ id }) => id)),
  sorted(new Set(allLanes.map(({ id }) => id))),
  'unique lane IDs',
);
same(
  matrix.gating.node.map(({ node }) => node),
  ['22.23.1', '24.18.0'],
  'Node lane versions',
);
same(
  matrix.gating.browser.map(({ engine }) => engine),
  ['chromium', 'firefox', 'webkit'],
  'browser engines',
);
same(
  matrix.gating.portable.map(({ target }) => target),
  ['wasm32-unknown-unknown', 'wasm32-wasip2'],
  'portable targets',
);
assert(
  matrix.gating.browser.every(
    ({ execution, activation_task: activationTask }) =>
      execution === 'inventory-only' && activationTask === 'P02-010',
  ),
  'browser activation boundary mismatch',
);
same(
  matrix.unsupported.map(({ platform }) => platform),
  ['windows-arm64', 'branded-chrome-edge-safari'],
  'explicit exclusions',
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
  'immutable action identities',
);

const requirementFamilies =
  'INV|PLAT|CORE|DATA|QUERY|STORE|GPU|DIST|CACHE|SYNC|SEC|OPS|QUAL|COMPAT';
const requirementPattern = new RegExp(`\\b(?:${requirementFamilies})-\\d{3}\\b`, 'g');
const specificationRequirements = new Set(showText('Specifications.md').match(requirementPattern) ?? []);
const ledgerRequirements = new Set(
  showText('docs/governance/requirements.md').match(requirementPattern) ?? [],
);
assert(specificationRequirements.size === 44, 'specification requirement count mismatch');
same(sorted(ledgerRequirements), sorted(specificationRequirements), 'requirement ledger ID set');

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', commitArgument])
  .trim()
  .split('\n')
  .filter(Boolean);
const generatedPath =
  /(^|\/)(target|node_modules|dist|coverage|playwright-report|test-results|blob-report|\.vitest|\.vite)(\/|$)/;
same(
  trackedFiles.filter(
    (file) => generatedPath.test(file) || /\.(?:profraw|profdata|tsbuildinfo|tgz)$/.test(file),
  ),
  [],
  'tracked generated-output inventory',
);
const markdownFiles = trackedFiles.filter((file) => file.endsWith('.md'));
let localLinks = 0;
for (const file of markdownFiles) {
  const source = showText(file);
  assert(source.endsWith('\n'), `${file}: missing terminal newline`);
  for (const [index, line] of source.split('\n').entries()) {
    assert(!/[ \t]+$/.test(line), `${file}:${index + 1}: trailing whitespace`);
  }
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let rawTarget = match[1].split('#')[0];
    if (!rawTarget || /^(https?:|mailto:)/.test(rawTarget)) continue;
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) {
      rawTarget = rawTarget.slice(1, -1);
    }
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)),
    );
    assert(target !== '..' && !target.startsWith('../'), `${file}: link escapes repository`);
    gitText(['cat-file', '-e', `${commitArgument}:${target}`]);
    localLinks += 1;
  }
}
assert(markdownFiles.length === 136, `Markdown inventory mismatch: ${markdownFiles.length}`);
assert(localLinks === 863, `local link count mismatch: ${localLinks}`);

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-009-'));
try {
  const archive = gitBytes(['archive', '--format=tar', commitArgument]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const baseEnvironment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  const run = (program, args, options = {}) => {
    try {
      return execFileSync(program, args, {
        cwd: temporary,
        encoding: 'utf8',
        env: baseEnvironment,
        maxBuffer: 64 * 1024 * 1024,
        timeout: 300_000,
        ...options,
      });
    } catch (error) {
      if (options.allowFailure === true) return error;
      throw error;
    }
  };
  const expectFailure = (program, args, label, options = {}) => {
    const result = run(program, args, { ...options, allowFailure: true, stdio: 'pipe' });
    assert(result instanceof Error, `${label}: mutation was not rejected`);
  };
  const requireText = (output, marker, label) => {
    assert(output.includes(marker), `${label}: output marker absent: ${marker}`);
  };
  const shellQuote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
  const nvm = path.join(os.homedir(), '.nvm', 'nvm.sh');
  assert(existsSync(nvm), 'NVM installation absent for supported Node-lane replay');
  const runNvm = (version, args, environment = {}, options = {}) =>
    run(
      'bash',
      [
        '-lc',
        `source ${shellQuote(nvm)} && nvm exec ${shellQuote(version)} ${args.map(shellQuote).join(' ')}`,
      ],
      { ...options, env: { ...baseEnvironment, ...environment } },
    );

  run('git', ['init', '--quiet']);
  run('git', ['add', '--all']);
  run('git', [
    '-c',
    'commit.gpgsign=false',
    '-c',
    'user.name=Helix Evidence',
    '-c',
    'user.email=evidence@invalid.example',
    'commit',
    '--quiet',
    '--no-verify',
    '-m',
    'source snapshot',
  ]);

  const yamlSummary = JSON.parse(
    run('python3', [
      '-c',
      [
        'import json, yaml',
        "paths = ['.github/workflows/ci.yml', '.github/workflows/ci-nightly.yml']",
        'out = []',
        'for p in paths:',
        "  data = yaml.load(open(p, encoding='utf-8'), Loader=yaml.BaseLoader)",
        "  out.append({'path': p, 'root': sorted(data), 'jobs': sorted(data['jobs']), 'steps': sum(len(job['steps']) for job in data['jobs'].values())})",
        'print(json.dumps(out))',
      ].join('\n'),
    ]),
  );
  same(
    yamlSummary,
    [
      {
        path: '.github/workflows/ci.yml',
        root: ['concurrency', 'env', 'jobs', 'name', 'on', 'permissions'],
        jobs: ['browser', 'contract', 'native', 'node', 'portable', 'sanitizer'],
        steps: 29,
      },
      {
        path: '.github/workflows/ci-nightly.yml',
        root: ['concurrency', 'env', 'jobs', 'name', 'on', 'permissions'],
        jobs: ['contract', 'native'],
        steps: 8,
      },
    ],
    'independent workflow parse',
  );

  const packageLockPath = path.join(temporary, 'package-lock.json');
  const lockHash = sha256(readFileSync(packageLockPath));
  for (const version of ['22.23.1', '24.18.0']) {
    runNvm(version, ['corepack', 'npm', 'ci', '--ignore-scripts']);
    const contract = runNvm(version, ['corepack', 'npm', 'run', 'ci:check']);
    requireText(contract, 'PASS CI matrix: 11 gating lanes and 2 nightly native lanes', `CI ${version}`);
    const javascript = runNvm(version, ['corepack', 'npm', 'run', 'policy:javascript']);
    requireText(javascript, 'Checked 45 files', `Biome ${version}`);
    const dependencies = runNvm(version, ['corepack', 'npm', 'run', 'policy:dependencies']);
    requireText(dependencies, 'PASS npm policy: 91 dev packages', `dependency policy ${version}`);
    runNvm(version, ['corepack', 'npm', 'run', 'toolchain:types']);
    const fixtures = runNvm(version, ['corepack', 'npm', 'run', 'fixtures:check']);
    requireText(fixtures, 'PASS fixture registry: 4 generators', `fixtures ${version}`);
    const tests = runNvm(version, ['corepack', 'npm', 'test']);
    requireText(tests, 'PASS all test suites:', `aggregate tests ${version}`);
    assert(sha256(readFileSync(packageLockPath)) === lockHash, `lock drift on Node ${version}`);
  }

  const runtimeEnvironment = {
    GITHUB_ACTIONS: 'true',
    CI: 'true',
    RUNNER_OS: 'Linux',
    RUNNER_ARCH: 'X64',
  };
  requireText(
    runNvm(
      '22.23.1',
      ['node', 'tests/toolchain/check-ci-runtime.mjs', 'node-22-linux-x64'],
      runtimeEnvironment,
    ),
    'PASS CI runtime node-22-linux-x64',
    'Node 22 runtime identity',
  );
  requireText(
    runNvm(
      '24.18.0',
      ['node', 'tests/toolchain/check-ci-runtime.mjs', 'node-24-linux-x64'],
      runtimeEnvironment,
    ),
    'PASS CI runtime node-24-linux-x64',
    'Node 24 runtime identity',
  );
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    const output = runNvm('22.23.1', [
      'corepack',
      'npm',
      'run',
      'ci:browser-inventory',
      '--',
      engine,
    ]);
    requireText(output, `RESERVED browser engine ${engine}: 0 tests`, `${engine} inventory`);
  }

  const gating = run(process.execPath, ['tests/toolchain/emit-ci-matrix.mjs', 'gating']);
  assert(gating.trim().split('\n').length === 5, 'gating emitter group count mismatch');
  const nightly = run(process.execPath, ['tests/toolchain/emit-ci-matrix.mjs', 'nightly']);
  assert(nightly.trim().split('\n').length === 1, 'nightly emitter group count mismatch');

  run('cargo', ['fmt', '--all', '--', '--check']);
  run('cargo', ['check', '--frozen', '--workspace', '--all-targets', '--all-features']);
  run('cargo', [
    'clippy',
    '--frozen',
    '--workspace',
    '--all-targets',
    '--all-features',
    '--',
    '-D',
    'warnings',
  ]);
  run('cargo', ['test', '--frozen', '--workspace', '--all-features', '--no-fail-fast']);
  run('cargo', ['doc', '--frozen', '--workspace', '--no-deps', '--all-features'], {
    env: { ...baseEnvironment, RUSTDOCFLAGS: '-D warnings' },
  });
  for (const target of ['wasm32-unknown-unknown', 'wasm32-wasip2']) {
    run('cargo', [
      'clippy',
      '--frozen',
      '--target',
      target,
      '--package',
      'helix-core',
      '--',
      '-D',
      'warnings',
    ]);
  }
  run(process.execPath, ['tests/toolchain/run-build-profile.mjs', 'sanitizer']);

  const ciPath = path.join(temporary, '.github/workflows/ci.yml');
  const ciOriginal = readFileSync(ciPath);
  writeFileSync(
    ciPath,
    ciOriginal
      .toString('utf8')
      .replace('actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0', 'actions/checkout@v7'),
  );
  expectFailure('corepack', ['npm', 'run', 'ci:check'], 'mutable-action canary');
  writeFileSync(ciPath, ciOriginal);

  const matrixPath = path.join(temporary, '.github/ci/matrix.json');
  const matrixOriginal = readFileSync(matrixPath);
  const changeMatrix = (change, label) => {
    const mutated = JSON.parse(matrixOriginal.toString('utf8'));
    change(mutated);
    writeFileSync(matrixPath, `${JSON.stringify(mutated, null, 2)}\n`);
    expectFailure('corepack', ['npm', 'run', 'ci:check'], label);
    writeFileSync(matrixPath, matrixOriginal);
  };
  changeMatrix(
    (mutated) => {
      mutated.gating.node[0].runner = 'ubuntu-latest';
    },
    'mutable-runner canary',
  );
  changeMatrix(
    (mutated) => {
      mutated.gating.node[0].node = '22.23.0';
    },
    'Node-version canary',
  );
  changeMatrix(
    (mutated) => {
      mutated.gating.node[1].id = mutated.gating.node[0].id;
    },
    'duplicate-lane canary',
  );
  changeMatrix(
    (mutated) => {
      mutated.gating.browser[0].execution = 'enabled';
    },
    'browser-boundary canary',
  );

  writeFileSync(
    ciPath,
    ciOriginal.toString('utf8').replace('permissions:\n  contents: read', 'permissions:\n  contents: write'),
  );
  expectFailure('corepack', ['npm', 'run', 'ci:check'], 'workflow-permission canary');
  writeFileSync(ciPath, ciOriginal);

  const wrongArchitecture = runNvm(
    '22.23.1',
    ['node', 'tests/toolchain/check-ci-runtime.mjs', 'node-22-linux-x64'],
    { ...runtimeEnvironment, RUNNER_ARCH: 'ARM64' },
    { allowFailure: true, stdio: 'pipe' },
  );
  assert(wrongArchitecture instanceof Error, 'runtime-architecture canary was not rejected');

  const unexpectedBrowserTest = path.join(temporary, 'tests/browser/unexpected.spec.ts');
  writeFileSync(
    unexpectedBrowserTest,
    "import { expect, test } from '@playwright/test';\n\ntest('P02-009 canary', () => {\n  expect(true).toBe(true);\n});\n",
  );
  expectFailure(
    'corepack',
    ['npm', 'run', 'ci:browser-inventory', '--', 'chromium'],
    'unexpected-browser-test canary',
  );
  rmSync(unexpectedBrowserTest);

  assert(
    run('git', ['status', '--porcelain', '--untracked-files=all']).trim() === '',
    'mutation restoration left source drift',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact 21-file P02-009 scope at ${commitArgument}`);
console.log('PASS matrix: 11 gating lanes, 2 nightly lanes, and 2 explicit exclusions');
console.log('PASS workflows: independent YAML parse of 8 jobs and 37 steps');
console.log('PASS Node: 22.23.1 and 24.18.0 clean installs, policies, fixtures, and tests');
console.log('PASS browser inventories: Chromium, Firefox, and WebKit each contain exactly 0 tests');
console.log('PASS Rust: 3 native profiles, 2 portable targets, and Linux x64 ASan policy replay');
console.log('PASS 8 canaries: action, runner, Node, lane, browser, permission, runtime, test');
console.log(`PASS documentation: ${markdownFiles.length} Markdown files, ${localLinks} local links`);
for (const artifact of manifest.artifacts) {
  console.log(`ARTIFACT ${artifact.path} ${artifact.sha256} ${artifact.bytes}`);
}
console.log(`VERIFIER ${manifest.verifier.sha256} ${manifest.verifier.bytes}`);

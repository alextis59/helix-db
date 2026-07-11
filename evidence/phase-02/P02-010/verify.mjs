#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
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
const evidenceDirectory = path.join(repository, 'evidence/phase-02/P02-010');
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
const showBytes = (file, commit = manifest.commit) => gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.commit) => showBytes(file, commit).toString('utf8');

assert(commitArgument, 'usage: node evidence/phase-02/P02-010/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P02-010', 'evidence task mismatch');
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
const removedPaths = manifest.removed_artifacts.map(({ path: artifactPath }) => artifactPath);
same(sorted(artifactPaths), sorted(new Set(artifactPaths)), 'unique present artifact paths');
same(sorted(removedPaths), sorted(new Set(removedPaths)), 'unique removed artifact paths');
assert(manifest.artifacts.length === 40, 'present artifact count mismatch');
assert(manifest.removed_artifacts.length === 1, 'removed artifact count mismatch');
same(removedPaths, ['tests/toolchain/check-browser-engine-lane.mjs'], 'removed inventory checker');
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
  sorted([...artifactPaths, ...removedPaths]),
  'exact source-commit scope',
);
assert(
  changedRecords
    .filter(({ path: changedPath }) => artifactPaths.includes(changedPath))
    .every(({ status }) => status === 'A' || status === 'M'),
  'present source artifact has an unsupported change status',
);
assert(
  changedRecords.some(
    ({ status, path: changedPath }) => status === 'D' && changedPath === removedPaths[0],
  ),
  'inventory checker deletion is absent',
);
for (const artifact of manifest.artifacts) {
  const bytes = showBytes(artifact.path);
  assert(bytes.length === artifact.bytes, `${artifact.path}: byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: SHA-256 mismatch`);
}
for (const artifact of manifest.removed_artifacts) {
  const bytes = showBytes(artifact.path, `${commitArgument}^`);
  assert(bytes.length === artifact.bytes, `${artifact.path}: prior byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: prior SHA-256 mismatch`);
  const absent = spawnSync('git', ['cat-file', '-e', `${commitArgument}:${artifact.path}`], {
    cwd: repository,
  });
  assert(absent.status !== 0, `${artifact.path}: removed artifact still exists`);
}

const verifierPath = path.join(evidenceDirectory, 'verify.mjs');
const verifierBytes = readFileSync(verifierPath);
assert(statSync(verifierPath).size === manifest.verifier.bytes, 'verifier byte count mismatch');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256 mismatch');

const matrix = JSON.parse(showText('.github/ci/matrix.json'));
same(matrix.plan_items, ['P02-009', 'P02-010'], 'CI matrix task history');
assert(matrix.schema === 'helix.ci-matrix/2', 'CI matrix schema mismatch');
same(
  matrix.gating.portable.map(({ artifact, target }) => ({ artifact, target })),
  [
    { artifact: 'browser', target: 'wasm32-unknown-unknown' },
    { artifact: 'component', target: 'wasm32-wasip2' },
  ],
  'portable artifact modes',
);
assert(
  matrix.gating.browser.every(
    ({ execution, expansion_task: expansionTask }) =>
      execution === 'toolchain-smoke' && expansionTask === 'P02-016',
  ),
  'browser CI boundary mismatch',
);
const validator = JSON.parse(showText('.github/ci/wasm-tools.json'));
assert(validator.schema === 'helix.wasm-tools/1', 'validator authority schema mismatch');
assert(validator.version === '1.253.0' && validator.tag === 'v1.253.0', 'validator pin');
const validatorHost = validator.hosts['linux-x64'];
same(
  {
    archive_bytes: validatorHost.archive_bytes,
    archive_sha256: validatorHost.archive_sha256,
    executable_bytes: validatorHost.executable_bytes,
    executable_sha256: validatorHost.executable_sha256,
    version_output: validatorHost.version_output,
  },
  {
    archive_bytes: 6007583,
    archive_sha256: '4e2898f7ca3bd0536218ed9b7b36ff7b86954c57ae0e6272fde69728cbe01088',
    executable_bytes: 19172248,
    executable_sha256: '4781d5b7e1d6cedcd8f2384cf6578f4ed7022d305a6e580bde902c32756ca661',
    version_output: 'wasm-tools 1.253.0 (c799bb87b 2026-07-07)',
  },
  'validator release identities',
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
assert(markdownFiles.length === 138, `Markdown inventory mismatch: ${markdownFiles.length}`);
assert(localLinks === 885, `local link count mismatch: ${localLinks}`);

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-010-'));
try {
  const archive = gitBytes(['archive', '--format=tar', commitArgument]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const baseEnvironment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  delete baseEnvironment.FORCE_COLOR;
  delete baseEnvironment.NO_COLOR;
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
  const expectNvmFailure = (version, args, label) => {
    const result = runNvm(version, args, {}, { allowFailure: true, stdio: 'pipe' });
    assert(result instanceof Error, `${label}: mutation was not rejected`);
  };

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
        steps: 31,
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
    requireText(contract, 'PASS portable artifacts:', `CI contract ${version}`);
    const javascript = runNvm(version, ['corepack', 'npm', 'run', 'policy:javascript']);
    requireText(javascript, 'Checked 54 files', `Biome ${version}`);
    const dependencies = runNvm(version, ['corepack', 'npm', 'run', 'policy:dependencies']);
    requireText(dependencies, 'PASS npm policy: 91 dev packages', `dependency policy ${version}`);
    runNvm(version, ['corepack', 'npm', 'run', 'toolchain:types']);
    const fixtures = runNvm(version, ['corepack', 'npm', 'run', 'fixtures:check']);
    requireText(fixtures, 'PASS fixture registry: 4 generators', `fixtures ${version}`);
    const tests = runNvm(version, ['corepack', 'npm', 'test']);
    requireText(tests, 'PASS all test suites:', `aggregate tests ${version}`);
    const wasm = runNvm(version, ['corepack', 'npm', 'run', 'wasm:validate']);
    requireText(wasm, 'PASS Wasm all validation:', `Wasm validation ${version}`);
    assert(sha256(readFileSync(packageLockPath)) === lockHash, `lock drift on Node ${version}`);
  }

  runNvm('22.23.1', ['corepack', 'npm', 'run', 'browser:install']);
  const browsers = runNvm('22.23.1', ['corepack', 'npm', 'run', 'browser:smoke']);
  requireText(browsers, '3 passed', 'three-engine browser smoke');
  requireText(browsers, 'PASS browser smoke all: 3 real-browser execution(s)', 'browser runner');
  const node24Bundle = runNvm('24.18.0', ['corepack', 'npm', 'run', 'browser:build']);
  requireText(node24Bundle, 'PASS browser bundle: 4 files', 'Node 24 bundle build');

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

  const wasmReportPath = path.join(temporary, 'dist/validation/wasm-all-smoke.json');
  const wasmReport = JSON.parse(readFileSync(wasmReportPath, 'utf8'));
  same(
    wasmReport.artifacts,
    [
      {
        id: 'wasip2-component',
        path: 'target/wasm32-wasip2/wasm/helix_core.wasm',
        format: 'component-model-0x1000d',
        bytes: 13204,
        sha256: 'ba534a6433571e8c3da9d284f80e5bb183d3c75d97e5bd6d48aabddaa61e7f5a',
        wit_sha256: 'a7343b25ef27cc71c14ae2f275747d1b5023e9931839a11d0303733bb785975b',
      },
      {
        id: 'browser-core',
        path: 'target/wasm32-unknown-unknown/browser/helix_core.wasm',
        format: 'core-module-v1',
        bytes: 86,
        sha256: 'c3231bfcaaa248bda3c8a762c35f5f778e1e4f319b93eef3882e7a9c6a0fde93',
        imports: [],
        exports: [
          { name: 'memory', kind: 'memory' },
          { name: '__data_end', kind: 'global' },
          { name: '__heap_base', kind: 'global' },
        ],
      },
    ],
    'Wasm smoke artifacts',
  );
  assert(
    sha256(readFileSync(wasmReportPath)) ===
      'fa5d57b3331e2f7cabfff333ffdcca6f8443e9feb0bcb1bdb85b4c9438f761d3',
    'Wasm report hash mismatch',
  );
  const bundleReportPath = path.join(temporary, 'dist/validation/browser-bundle-smoke.json');
  const bundleReport = JSON.parse(readFileSync(bundleReportPath, 'utf8'));
  same(
    bundleReport.artifacts,
    [
      {
        path: 'dist/browser/assets/helix_core-DCUk-il2.wasm',
        bytes: 86,
        sha256: 'c3231bfcaaa248bda3c8a762c35f5f778e1e4f319b93eef3882e7a9c6a0fde93',
      },
      {
        path: 'dist/browser/assets/index-CTixl0pE.js',
        bytes: 1794,
        sha256: 'ca01cdcab10e22a61c74539340303859332e726459b3785bb7f4ff6478d0a4fa',
      },
      {
        path: 'dist/browser/assets/index-CTixl0pE.js.map',
        bytes: 3010,
        sha256: '0db8f309bc73957734f0c9376ad4025587897bf5f1b3ea4ba3a0dc2db0584789',
      },
      {
        path: 'dist/browser/index.html',
        bytes: 433,
        sha256: '610ed966d16d010425e25bfb1bf08d928a9a0d979fce42654350040bca7f94a1',
      },
    ],
    'browser bundle artifacts',
  );
  assert(
    sha256(readFileSync(bundleReportPath)) ===
      'ee9291a79568d50fa5c8247f9be8e59d10929b9eb855493de5329f40388b15f2',
    'browser bundle report hash mismatch',
  );

  const validatorAuthorityPath = path.join(temporary, '.github/ci/wasm-tools.json');
  const validatorAuthorityOriginal = readFileSync(validatorAuthorityPath);
  const badAuthority = JSON.parse(validatorAuthorityOriginal.toString('utf8'));
  badAuthority.hosts['linux-x64'].archive_sha256 = '0'.repeat(64);
  writeFileSync(validatorAuthorityPath, `${JSON.stringify(badAuthority, null, 2)}\n`);
  expectFailure('corepack', ['npm', 'run', 'ci:check'], 'validator-authority canary');
  writeFileSync(validatorAuthorityPath, validatorAuthorityOriginal);

  const validatorPath = path.join(
    temporary,
    'target/toolchain/wasm-tools/1.253.0/wasm-tools-1.253.0-x86_64-linux/wasm-tools',
  );
  const validatorOriginal = readFileSync(validatorPath);
  appendFileSync(validatorPath, Buffer.from([0]));
  expectFailure('corepack', ['npm', 'run', 'wasm:install-validator'], 'validator-binary canary');
  writeFileSync(validatorPath, validatorOriginal);

  const componentPath = path.join(temporary, 'target/wasm32-wasip2/wasm/helix_core.wasm');
  const invalidComponentPath = path.join(temporary, 'target/invalid-component.wasm');
  const invalidComponent = Buffer.from(readFileSync(componentPath));
  invalidComponent[4] = 12;
  writeFileSync(invalidComponentPath, invalidComponent);
  expectFailure(validatorPath, ['validate', '--color', 'never', invalidComponentPath], 'component canary');
  rmSync(invalidComponentPath);

  const browserWasmPath = path.join(
    temporary,
    'target/wasm32-unknown-unknown/browser/helix_core.wasm',
  );
  const invalidBrowserWasm = Buffer.from(readFileSync(browserWasmPath));
  invalidBrowserWasm[4] = 2;
  assert(!WebAssembly.validate(invalidBrowserWasm), 'browser-module canary was not rejected');

  const vitePath = path.join(temporary, 'vite.config.ts');
  const viteOriginal = readFileSync(vitePath);
  const noSourceMap = viteOriginal
    .toString('utf8')
    .replace("sourcemap: 'hidden'", 'sourcemap: false');
  assert(!noSourceMap.includes("sourcemap: 'hidden'"), 'source-map canary mutation failed');
  writeFileSync(vitePath, noSourceMap);
  expectFailure('corepack', ['npm', 'run', 'browser:build'], 'hidden-source-map canary');
  writeFileSync(vitePath, viteOriginal);

  const unexpectedSpec = path.join(temporary, 'tests/browser/unexpected.spec.ts');
  writeFileSync(
    unexpectedSpec,
    "import { test } from '@playwright/test';\n\ntest('P02-010 canary', () => {});\n",
  );
  expectFailure('corepack', ['npm', 'run', 'test:browser'], 'browser-inventory canary');
  rmSync(unexpectedSpec);

  const matrixPath = path.join(temporary, '.github/ci/matrix.json');
  const matrixOriginal = readFileSync(matrixPath);
  const downgradedMatrix = JSON.parse(matrixOriginal.toString('utf8'));
  downgradedMatrix.gating.browser[0].execution = 'inventory-only';
  writeFileSync(matrixPath, `${JSON.stringify(downgradedMatrix, null, 2)}\n`);
  expectFailure('corepack', ['npm', 'run', 'ci:check'], 'browser-lane canary');
  writeFileSync(matrixPath, matrixOriginal);

  const workflowPath = path.join(temporary, '.github/workflows/ci.yml');
  const workflowOriginal = readFileSync(workflowPath);
  const missingInstall = workflowOriginal
    .toString('utf8')
    .replace(
      'corepack npm exec -- playwright install --with-deps ${{ matrix.engine }}',
      'echo browser-install-canary',
    );
  assert(missingInstall !== workflowOriginal.toString('utf8'), 'workflow canary mutation failed');
  writeFileSync(workflowPath, missingInstall);
  expectFailure('corepack', ['npm', 'run', 'ci:check'], 'browser-install canary');
  writeFileSync(workflowPath, workflowOriginal);

  const appPath = path.join(temporary, 'tests/browser/smoke-app/main.ts');
  const appOriginal = readFileSync(appPath);
  const failedApp = appOriginal
    .toString('utf8')
    .replace("status.textContent = 'ready';", "status.textContent = 'canary';");
  assert(failedApp !== appOriginal.toString('utf8'), 'browser-runtime canary mutation failed');
  writeFileSync(appPath, failedApp);
  expectNvmFailure(
    '22.23.1',
    ['corepack', 'npm', 'run', 'ci:browser-smoke', '--', 'chromium'],
    'browser-runtime canary',
  );
  writeFileSync(appPath, appOriginal);

  const vitestPath = path.join(temporary, 'vitest.config.ts');
  const vitestOriginal = readFileSync(vitestPath);
  const browserInUnit = vitestOriginal
    .toString('utf8')
    .replace("      'tests/browser/**',\n", '')
    .replace(
      '    include: [\n',
      "    include: [\n      'tests/browser/**/*.spec.ts',\n",
    );
  assert(browserInUnit !== vitestOriginal.toString('utf8'), 'Vitest canary mutation failed');
  writeFileSync(vitestPath, browserInUnit);
  expectNvmFailure('22.23.1', ['corepack', 'npm', 'run', 'test:unit'], 'Vitest-boundary canary');
  writeFileSync(vitestPath, vitestOriginal);

  assert(
    run('git', ['status', '--porcelain', '--untracked-files=all']).trim() === '',
    'mutation restoration left source drift',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact 41-path P02-010 scope at ${commitArgument}: 40 present, 1 removed`);
console.log('PASS validator: official 1.253.0 archive/executable identities and component validation');
console.log('PASS Wasm: 13,204-byte WASIp2 component and 86-byte browser core module');
console.log('PASS bundle: 4 deterministic Vite artifacts with byte-identical external Wasm');
console.log('PASS browsers: Chromium, Firefox, and WebKit each validate/compile/instantiate the bundle');
console.log('PASS workflows: independent YAML parse of 8 jobs and 39 steps');
console.log('PASS Node: 22.23.1 and 24.18.0 clean policy/test/Wasm/bundle replay');
console.log('PASS 10 canaries: authority, binary, component, module, map, inventory, lane, install, runtime, unit');
console.log(`PASS documentation: ${markdownFiles.length} Markdown files, ${localLinks} local links`);
for (const artifact of manifest.artifacts) {
  console.log(`ARTIFACT ${artifact.path} ${artifact.sha256} ${artifact.bytes}`);
}
for (const artifact of manifest.removed_artifacts) {
  console.log(`REMOVED ${artifact.path} ${artifact.sha256} ${artifact.bytes}`);
}
console.log(`VERIFIER ${manifest.verifier.sha256} ${manifest.verifier.bytes}`);

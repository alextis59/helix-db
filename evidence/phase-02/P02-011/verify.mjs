#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidenceDirectory = path.join(repository, 'evidence/phase-02/P02-011');
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

assert(commitArgument, 'usage: node evidence/phase-02/P02-011/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P02-011', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(
  manifest.requirements,
  ['INV-006', 'INV-007', 'PLAT-001', 'QUAL-001'],
  'evidence requirements',
);
same(manifest.accepted_adrs, [], 'accepted ADR inventory');

const artifactPaths = manifest.artifacts.map(({ path: artifactPath }) => artifactPath);
same(sorted(artifactPaths), sorted(new Set(artifactPaths)), 'unique artifact paths');
assert(manifest.artifacts.length === 21, 'source artifact count mismatch');
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

const fixtureManifestBytes = showBytes('shaders/fixtures/manifest.json');
const fixtureManifest = JSON.parse(fixtureManifestBytes);
same(
  sorted(Object.keys(fixtureManifest)),
  ['fixtures', 'plan_item', 'schema', 'validator'],
  'WGSL manifest fields',
);
assert(fixtureManifest.schema === 'helix.wgsl-fixtures/1', 'WGSL manifest schema');
assert(fixtureManifest.plan_item === 'P02-011', 'WGSL manifest plan item');
same(
  fixtureManifest.validator,
  {
    backend: 'dawn-swiftshader',
    browser: 'chromium',
    operation: 'shader-module-validation-and-compute-pipeline-creation',
    playwright_version: '1.61.1',
    trusted_repository_sources_only: true,
  },
  'WGSL validator authority',
);
assert(fixtureManifest.fixtures.length === 4, 'WGSL fixture count');
same(
  fixtureManifest.fixtures.map(({ id, expected_outcome: expectedOutcome, purpose }) => ({
    expected_outcome: expectedOutcome,
    id,
    purpose,
  })),
  [
    {
      expected_outcome: 'accept',
      id: 'valid-noop-compute',
      purpose: 'minimal-compute-pipeline',
    },
    {
      expected_outcome: 'accept',
      id: 'valid-storage-binding-layout',
      purpose: 'storage-resource-layout',
    },
    {
      expected_outcome: 'reject',
      id: 'invalid-malformed-function',
      purpose: 'syntax-rejection',
    },
    {
      expected_outcome: 'reject',
      id: 'invalid-duplicate-resource-binding',
      purpose: 'resource-binding-rejection',
    },
  ],
  'WGSL fixture outcome inventory',
);
for (const fixture of fixtureManifest.fixtures) {
  const bytes = showBytes(`shaders/fixtures/${fixture.path}`);
  assert(sha256(bytes) === fixture.source_sha256, `${fixture.id}: source digest mismatch`);
}

const packageJson = JSON.parse(showText('package.json'));
same(
  {
    'wgsl:check': packageJson.scripts['wgsl:check'],
    'wgsl:validate': packageJson.scripts['wgsl:validate'],
  },
  {
    'wgsl:check': 'node tests/toolchain/check-wgsl-fixtures.mjs manifest',
    'wgsl:validate': 'node tests/toolchain/check-wgsl-fixtures.mjs chromium',
  },
  'WGSL package commands',
);
assert(
  sha256(showBytes('package-lock.json')) === sha256(showBytes('package-lock.json', `${commitArgument}^`)),
  'P02-011 changed the npm lock despite adding no dependency',
);
assert(
  sha256(showBytes('Cargo.lock')) === sha256(showBytes('Cargo.lock', `${commitArgument}^`)),
  'P02-011 changed the Cargo lock despite adding no dependency',
);
const matrix = JSON.parse(showText('.github/ci/matrix.json'));
assert(matrix.schema === 'helix.ci-matrix/2', 'CI matrix schema mismatch');
same(matrix.plan_items, ['P02-009', 'P02-010', 'P02-011'], 'CI task history');
const ci = showText('.github/workflows/ci.yml');
for (const marker of [
  'corepack npm run wgsl:check',
  'Parse, validate, and compile trusted WGSL fixtures',
  "if: matrix.engine == 'chromium'",
  'corepack npm run wgsl:validate',
]) {
  assert(ci.includes(marker), `CI WGSL marker absent: ${marker}`);
}
const runner = showText('tests/toolchain/check-wgsl-fixtures.mjs');
for (const marker of [
  "'--enable-unsafe-webgpu'",
  "'--use-webgpu-adapter=swiftshader'",
  "'--enable-dawn-backend-validation'",
  "architecture: 'swiftshader'",
  "device: '0xc0de'",
  "vendor: 'google'",
  'createShaderModule',
  'getCompilationInfo',
  'createComputePipelineAsync',
  "pushErrorScope('validation')",
  'fixture symlinks are prohibited',
  'trusted sources, 2 accept, 2 reject',
]) {
  assert(runner.includes(marker), `WGSL runner marker absent: ${marker}`);
}
for (const forbidden of ['fetch(', 'process.stdin', 'process.env.', 'readline', 'WebSocket']) {
  assert(!runner.includes(forbidden), `WGSL runner has external-input marker: ${forbidden}`);
}
assert(
  showText('ImplementationPlan.md').includes(
    '- [ ] **P02-011** Add WGSL parsing or validation and shader-fixture compilation to CI before GPU runtime work.',
  ),
  'source task was checked before evidence closure',
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
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) rawTarget = rawTarget.slice(1, -1);
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)),
    );
    assert(target !== '..' && !target.startsWith('../'), `${file}: link escapes repository`);
    gitText(['cat-file', '-e', `${commitArgument}:${target}`]);
    localLinks += 1;
  }
}
assert(markdownFiles.length === 141, `Markdown inventory mismatch: ${markdownFiles.length}`);
assert(localLinks === 901, `local link count mismatch: ${localLinks}`);

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-011-'));
try {
  const archive = gitBytes(['archive', '--format=tar', commitArgument]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const baseEnvironment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  delete baseEnvironment.FORCE_COLOR;
  delete baseEnvironment.NO_COLOR;
  const run = (program, args, options = {}) =>
    execFileSync(program, args, {
      cwd: temporary,
      encoding: 'utf8',
      env: baseEnvironment,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 600_000,
      ...options,
    });
  const runResult = (program, args, options = {}) =>
    spawnSync(program, args, {
      cwd: temporary,
      encoding: 'utf8',
      env: baseEnvironment,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 600_000,
      ...options,
    });
  const requireText = (output, marker, label) => {
    assert(output.includes(marker), `${label}: output marker absent: ${marker}`);
  };
  const shellQuote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
  const nvm = path.join(os.homedir(), '.nvm', 'nvm.sh');
  assert(existsSync(nvm), 'NVM installation absent for supported Node-lane replay');
  const nvmCommand = (version, args) =>
    `source ${shellQuote(nvm)} && nvm exec ${shellQuote(version)} ${args.map(shellQuote).join(' ')}`;
  const runNvm = (version, args, options = {}) =>
    run('bash', ['-lc', nvmCommand(version, args)], options);
  const runNvmResult = (version, args, options = {}) =>
    runResult('bash', ['-lc', nvmCommand(version, args)], options);
  const expectFailure = (result, label, marker) => {
    assert(result.status !== 0, `${label}: mutation unexpectedly passed`);
    if (marker) {
      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      assert(output.includes(marker), `${label}: failure marker absent: ${marker}`);
    }
  };
  const expectNodeFailure = (args, label, marker) =>
    expectFailure(runResult(process.execPath, args), label, marker);
  const expectNvmFailure = (args, label, marker) =>
    expectFailure(runNvmResult('22.23.1', args), label, marker);

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
        jobs: ['browser', 'contract', 'native', 'node', 'portable', 'sanitizer'],
        path: '.github/workflows/ci.yml',
        root: ['concurrency', 'env', 'jobs', 'name', 'on', 'permissions'],
        steps: 32,
      },
      {
        jobs: ['contract', 'native'],
        path: '.github/workflows/ci-nightly.yml',
        root: ['concurrency', 'env', 'jobs', 'name', 'on', 'permissions'],
        steps: 8,
      },
    ],
    'independent workflow parse',
  );

  const lockPath = path.join(temporary, 'package-lock.json');
  const lockHash = sha256(readFileSync(lockPath));
  runNvm('22.23.1', ['corepack', 'npm', 'ci', '--ignore-scripts']);
  requireText(runNvm('22.23.1', ['corepack', 'npm', '--version']), '11.18.0', 'Node 22 npm');
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'wgsl:check']),
    'PASS WGSL fixture manifest: 4 trusted sources, 2 accept, 2 reject',
    'Node 22 WGSL manifest',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'ci:check']),
    'PASS WGSL fixtures: 2 accepted pipelines and 2 rejection canaries in Chromium',
    'Node 22 CI contract',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'policy:javascript']),
    'Checked 56 files',
    'Node 22 JavaScript policy',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'policy:dependencies']),
    'PASS npm policy: 91 dev packages',
    'Node 22 dependency policy',
  );
  runNvm('22.23.1', ['corepack', 'npm', 'run', 'toolchain:types']);
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'fixtures:check']),
    'PASS fixture registry: 4 generators',
    'Node 22 deterministic fixtures',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'test']),
    'PASS all test suites:',
    'Node 22 aggregate tests',
  );
  assert(sha256(readFileSync(lockPath)) === lockHash, 'Node 22 install changed package lock');

  runNvm('24.18.0', ['corepack', 'npm', 'ci', '--ignore-scripts']);
  requireText(runNvm('24.18.0', ['corepack', 'npm', '--version']), '11.18.0', 'Node 24 npm');
  requireText(
    runNvm('24.18.0', ['corepack', 'npm', 'run', 'wgsl:check']),
    'PASS WGSL fixture manifest: 4 trusted sources, 2 accept, 2 reject',
    'Node 24 WGSL manifest',
  );
  requireText(
    runNvm('24.18.0', ['corepack', 'npm', 'run', 'ci:check']),
    'PASS WGSL fixtures: 2 accepted pipelines and 2 rejection canaries in Chromium',
    'Node 24 CI contract',
  );
  assert(sha256(readFileSync(lockPath)) === lockHash, 'Node 24 install changed package lock');

  const runtimeOutput = runNvm('22.23.1', ['corepack', 'npm', 'run', 'wgsl:validate']);
  requireText(
    runtimeOutput,
    'PASS WGSL validation: 4 fixtures, 2 pipelines, 2 expected rejections via Chromium 149.0.7827.55 Dawn/SwiftShader',
    'real WGSL validation',
  );
  const reportPath = path.join(temporary, 'dist/validation/wgsl-fixtures.json');
  const reportBytes = readFileSync(reportPath);
  const producedReport = manifest.produced_artifacts.find(
    ({ path: artifactPath }) => artifactPath === 'dist/validation/wgsl-fixtures.json',
  );
  assert(producedReport, 'WGSL report evidence record absent');
  assert(reportBytes.length === producedReport.bytes, 'WGSL report byte count mismatch');
  assert(sha256(reportBytes) === producedReport.sha256, 'WGSL report SHA-256 mismatch');
  const report = JSON.parse(reportBytes);
  assert(report.schema === 'helix.wgsl-validation-report/1', 'WGSL report schema');
  assert(report.manifest_sha256 === sha256(fixtureManifestBytes), 'WGSL report manifest digest');
  same(
    report.validator.adapter,
    {
      architecture: 'swiftshader',
      description: 'SwiftShader Device (Subzero)',
      device: '0xc0de',
      vendor: 'google',
    },
    'WGSL report adapter identity',
  );
  same(
    report.summary,
    { accepted: 2, failed: 0, fixtures: 4, passed: 4, pipelines_created: 2, rejected: 2 },
    'WGSL report summary',
  );
  requireText(
    runNvm('22.23.1', [
      'corepack',
      'npm',
      'run',
      'ci:browser-smoke',
      '--',
      'chromium',
    ]),
    'PASS browser smoke chromium: 1 real-browser execution(s)',
    'Chromium Wasm regression',
  );

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

  const fixtureManifestPath = path.join(temporary, 'shaders/fixtures/manifest.json');
  const fixtureManifestOriginal = readFileSync(fixtureManifestPath);
  const writeMutatedManifest = (change) => {
    const mutated = JSON.parse(fixtureManifestOriginal);
    change(mutated);
    writeFileSync(fixtureManifestPath, `${JSON.stringify(mutated, null, 2)}\n`);
  };

  writeMutatedManifest((mutated) => {
    mutated.fixtures[0].source_sha256 = '0'.repeat(64);
  });
  expectNodeFailure(
    ['tests/toolchain/check-wgsl-fixtures.mjs', 'manifest'],
    'source-digest canary',
    'source hash mismatch',
  );
  writeFileSync(fixtureManifestPath, fixtureManifestOriginal);

  const unlistedPath = path.join(temporary, 'shaders/fixtures/valid/unlisted.wgsl');
  writeFileSync(unlistedPath, '@compute @workgroup_size(1) fn main() {}\n');
  expectNodeFailure(
    ['tests/toolchain/check-wgsl-fixtures.mjs', 'manifest'],
    'unlisted-source canary',
    'WGSL source inventory mismatch',
  );
  rmSync(unlistedPath);

  writeMutatedManifest((mutated) => {
    mutated.fixtures[0].path = '../outside.wgsl';
  });
  expectNodeFailure(
    ['tests/toolchain/check-wgsl-fixtures.mjs', 'manifest'],
    'path-escape canary',
    'invalid source path',
  );
  writeFileSync(fixtureManifestPath, fixtureManifestOriginal);

  expectNodeFailure(
    ['tests/toolchain/check-wgsl-fixtures.mjs', 'chromium', '/tmp/client.wgsl'],
    'external-argument canary',
    'usage: node tests/toolchain/check-wgsl-fixtures.mjs <manifest|chromium>',
  );

  const acceptedPath = path.join(temporary, 'shaders/fixtures/valid/noop-compute.wgsl');
  const acceptedOriginal = readFileSync(acceptedPath);
  const malformedAccepted = Buffer.from('@compute @workgroup_size(1)\nfn main( {}\n');
  writeFileSync(acceptedPath, malformedAccepted);
  writeMutatedManifest((mutated) => {
    mutated.fixtures[0].source_sha256 = sha256(malformedAccepted);
  });
  expectNvmFailure(
    ['corepack', 'npm', 'run', 'wgsl:validate'],
    'accepted-fixture compiler canary',
    'unexpected compilation diagnostic',
  );
  writeFileSync(acceptedPath, acceptedOriginal);
  writeFileSync(fixtureManifestPath, fixtureManifestOriginal);

  const rejectedPath = path.join(temporary, 'shaders/fixtures/invalid/malformed-function.wgsl');
  const rejectedOriginal = readFileSync(rejectedPath);
  const validRejected = Buffer.from('@compute @workgroup_size(1)\nfn main() {}\n');
  writeFileSync(rejectedPath, validRejected);
  writeMutatedManifest((mutated) => {
    mutated.fixtures[2].source_sha256 = sha256(validRejected);
  });
  expectNvmFailure(
    ['corepack', 'npm', 'run', 'wgsl:validate'],
    'rejected-fixture compiler canary',
    'expected compilation error absent',
  );
  writeFileSync(rejectedPath, rejectedOriginal);
  writeFileSync(fixtureManifestPath, fixtureManifestOriginal);

  writeMutatedManifest((mutated) => {
    mutated.fixtures[2].required_diagnostic_markers = ['diagnostic marker that cannot occur'];
  });
  expectNvmFailure(
    ['corepack', 'npm', 'run', 'wgsl:validate'],
    'diagnostic-marker canary',
    'diagnostic marker absent',
  );
  writeFileSync(fixtureManifestPath, fixtureManifestOriginal);

  const runnerPath = path.join(temporary, 'tests/toolchain/check-wgsl-fixtures.mjs');
  const runnerOriginal = readFileSync(runnerPath);
  writeFileSync(
    runnerPath,
    runnerOriginal
      .toString('utf8')
      .replace(
        "  '--enable-unsafe-webgpu',\n  '--use-webgpu-adapter=swiftshader',",
        "  '--disable-webgpu',",
      ),
  );
  expectNvmFailure(
    ['corepack', 'npm', 'run', 'wgsl:validate'],
    'WebGPU-backend canary',
    'WebGPU adapter is unavailable',
  );
  writeFileSync(runnerPath, runnerOriginal);

  writeFileSync(
    runnerPath,
    runnerOriginal.toString('utf8').replace("architecture: 'swiftshader'", "architecture: 'gpu'"),
  );
  expectNvmFailure(
    ['corepack', 'npm', 'run', 'wgsl:validate'],
    'adapter-identity canary',
    'Dawn SwiftShader adapter identity mismatch',
  );
  writeFileSync(runnerPath, runnerOriginal);

  const ciPath = path.join(temporary, '.github/workflows/ci.yml');
  const ciOriginal = readFileSync(ciPath);
  writeFileSync(
    ciPath,
    ciOriginal
      .toString('utf8')
      .replace('run: corepack npm run wgsl:validate', 'run: corepack npm run wgsl:check'),
  );
  expectNvmFailure(
    ['corepack', 'npm', 'run', 'ci:check'],
    'CI-runtime-step canary',
    'gating workflow marker absent: corepack npm run wgsl:validate',
  );
  writeFileSync(ciPath, ciOriginal);

  const packagePath = path.join(temporary, 'package.json');
  const packageOriginal = readFileSync(packagePath);
  const mutatedPackage = JSON.parse(packageOriginal);
  mutatedPackage.scripts['wgsl:validate'] = mutatedPackage.scripts['wgsl:check'];
  writeFileSync(packagePath, `${JSON.stringify(mutatedPackage, null, 2)}\n`);
  expectNvmFailure(
    ['corepack', 'npm', 'run', 'ci:check'],
    'package-command canary',
    'CI npm scripts mismatch',
  );
  writeFileSync(packagePath, packageOriginal);

  rmSync(acceptedPath);
  symlinkSync('/etc/hosts', acceptedPath);
  expectNodeFailure(
    ['tests/toolchain/check-wgsl-fixtures.mjs', 'manifest'],
    'source-symlink canary',
    'source symlink prohibited',
  );
  rmSync(acceptedPath);
  writeFileSync(acceptedPath, acceptedOriginal);

  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'wgsl:validate']),
    'PASS WGSL validation: 4 fixtures, 2 pipelines, 2 expected rejections via Chromium 149.0.7827.55 Dawn/SwiftShader',
    'post-canary WGSL validation',
  );
  assert(
    sha256(readFileSync(reportPath)) === producedReport.sha256,
    'post-canary WGSL report changed',
  );
  assert(
    run('git', ['status', '--porcelain', '--untracked-files=all']).trim() === '',
    'mutation restoration left source drift',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact 21-file P02-011 scope at ${commitArgument}`);
console.log('PASS WGSL authority: 4 hash-bound trusted sources, 2 accept and 2 reject');
console.log('PASS real compiler: 2 Dawn/SwiftShader pipelines and 2 expected rejections');
console.log('PASS CI: Node manifest lanes plus conditional Chromium compiler lane, 40 workflow steps');
console.log('PASS Node: 22.23.1 and 24.18.0 clean installs with npm 11.18.0');
console.log('PASS regression: 9 native tests, aggregate suites, and real Chromium Wasm smoke');
console.log('PASS 12 canaries: digest, inventory, path, CLI, outcomes, diagnostic, backend, adapter, CI, script, symlink');
console.log(`PASS documentation: ${markdownFiles.length} Markdown files, ${localLinks} local links`);
for (const artifact of manifest.artifacts) {
  console.log(`ARTIFACT ${artifact.path} ${artifact.sha256} ${artifact.bytes}`);
}
console.log(`VERIFIER ${manifest.verifier.sha256} ${manifest.verifier.bytes}`);

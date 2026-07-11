#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
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
const evidenceDirectory = path.join(repository, 'evidence/phase-02/P02-013');
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
    throw new Error(label + ' mismatch: ' + JSON.stringify(actual));
  }
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (args) =>
  execFileSync('git', args, { cwd: repository, maxBuffer: 64 * 1024 * 1024 });
const gitText = (args) => gitBytes(args).toString('utf8');
const showBytes = (file, commit = manifest.commit) => gitBytes(['show', commit + ':' + file]);
const showText = (file, commit = manifest.commit) => showBytes(file, commit).toString('utf8');

assert(commitArgument, 'usage: node evidence/phase-02/P02-013/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', commitArgument + '^{commit}']).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P02-013', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(manifest.requirements, ['INV-007', 'QUAL-001'], 'evidence requirements');
same(manifest.accepted_adrs, [], 'accepted ADR inventory');

const artifactPaths = manifest.artifacts.map(({ path: artifactPath }) => artifactPath);
same(sorted(artifactPaths), sorted(new Set(artifactPaths)), 'unique source artifact paths');
assert(manifest.artifacts.length === 28, 'source artifact count mismatch');
const changedRecords = gitText([
  'diff-tree',
  '--no-commit-id',
  '--name-status',
  '-r',
  commitArgument + '^',
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
  'source commit contains unsupported status: ' + JSON.stringify(changedRecords),
);
for (const artifact of manifest.artifacts) {
  const bytes = showBytes(artifact.path);
  assert(bytes.length === artifact.bytes, artifact.path + ': byte count mismatch');
  assert(sha256(bytes) === artifact.sha256, artifact.path + ': SHA-256 mismatch');
}

assert(manifest.retained_artifacts.length === 1, 'retained artifact count mismatch');
const retained = manifest.retained_artifacts[0];
assert(retained.path === 'reports/rust-coverage.json', 'retained coverage path');
const reportPath = path.join(evidenceDirectory, retained.path);
const reportBytes = readFileSync(reportPath);
assert(reportBytes.length === retained.bytes, 'retained coverage byte count');
assert(sha256(reportBytes) === retained.sha256, 'retained coverage SHA-256');
const verifierPath = path.join(evidenceDirectory, 'verify.mjs');
const verifierBytes = readFileSync(verifierPath);
assert(statSync(verifierPath).size === manifest.verifier.bytes, 'verifier byte count mismatch');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256 mismatch');

const policyBytes = showBytes('tests/toolchain/rust-coverage-policy.json');
const policy = JSON.parse(policyBytes);
assert(policy.schema === 'helix.rust-coverage-policy/1', 'coverage policy schema');
assert(policy.plan_item === 'P02-013', 'coverage policy task');
same(
  policy.toolchain,
  { llvm_release: '22.1.2', rust_release: '1.96.1', rustup_component: 'llvm-tools' },
  'coverage toolchain policy',
);
same(
  policy.groups.map((group) => ({
    enforce_per_file: group.enforce_per_file,
    id: group.id,
    minimum_source_files: group.minimum_source_files,
    thresholds_basis_points: group.thresholds_basis_points,
  })),
  [
    {
      enforce_per_file: false,
      id: 'workspace-product',
      minimum_source_files: 8,
      thresholds_basis_points: { branches: 8500, functions: 9000, lines: 9000, regions: 8500 },
    },
    {
      enforce_per_file: true,
      id: 'semantic-critical',
      minimum_source_files: 3,
      thresholds_basis_points: {
        branches: 9500,
        functions: 10000,
        lines: 10000,
        regions: 9500,
      },
    },
    {
      enforce_per_file: true,
      id: 'recovery-critical',
      minimum_source_files: 2,
      thresholds_basis_points: {
        branches: 9500,
        functions: 10000,
        lines: 10000,
        regions: 9500,
      },
    },
  ],
  'coverage group thresholds',
);
assert(policy.source.include_regex === '^crates/[^/]+/src/.+\\.rs$', 'source include policy');
same(
  policy.empty_product_scope,
  {
    allowed_status: 'boundary-skeleton',
    reason:
      'Phase 2 has crate-boundary constants and test harnesses but no executable database product logic; the first instrumented product region activates every applicable threshold',
    requires_database_functionality: false,
    revalidate_by: 'P03-008',
  },
  'empty product exception',
);
assert(policy.report.schema === 'helix.rust-coverage-report/1', 'coverage report policy schema');
assert(policy.report.maximum_bytes === 2097152, 'coverage report size cap');

const report = JSON.parse(reportBytes);
assert(report.schema === policy.report.schema, 'coverage report schema');
assert(report.plan_item === 'P02-013' && report.verdict === 'pass', 'coverage report verdict');
same(
  report.inputs,
  {
    cargo_lock_sha256: sha256(showBytes('Cargo.lock')),
    cargo_manifest_sha256: sha256(showBytes('Cargo.toml')),
    coverage_policy_sha256: sha256(policyBytes),
    coverage_runner_sha256: sha256(showBytes('tests/toolchain/check-rust-coverage.mjs')),
    rust_toolchain_sha256: sha256(showBytes('rust-toolchain.toml')),
  },
  'coverage report inputs',
);
same(
  {
    host: report.toolchain.host,
    llvm_export_version: report.toolchain.llvm_export_version,
    llvm_release: report.toolchain.llvm_release,
    rust_release: report.toolchain.rust_release,
    rustup_component: report.toolchain.rustup_component,
  },
  {
    host: 'x86_64-unknown-linux-gnu',
    llvm_export_version: '3.1.0',
    llvm_release: '22.1.2',
    rust_release: '1.96.1',
    rustup_component: 'llvm-tools',
  },
  'coverage report toolchain',
);
same(
  report.toolchain.tools,
  [
    {
      bytes: 639704,
      name: 'llvm-cov',
      sha256: 'c7fdde9c0db66a68a4f55a4d757030c16c085c951593304ad8985fda92b955d0',
      version:
        'LLVM (http://llvm.org/): | LLVM version 22.1.2-rust-1.96.1-stable | Optimized build.',
    },
    {
      bytes: 666984,
      name: 'llvm-profdata',
      sha256: 'ac5964e5d8f2cd08c6c95a0413c6e3233dbbbc2100f1289c2d032d32acca413b',
      version:
        'LLVM (http://llvm.org/): | LLVM version 22.1.2-rust-1.96.1-stable | Optimized build.',
    },
  ],
  'coverage report tool binaries',
);
same(
  {
    architecture: report.execution.architecture,
    binaries: report.execution.test_binaries.length,
    ci_lane: report.execution.ci_lane,
    platform: report.execution.platform,
    raw_profiles: report.execution.raw_profiles,
    tests_executed: report.execution.tests_executed,
  },
  {
    architecture: 'x64',
    binaries: 8,
    ci_lane: 'linux-x64',
    platform: 'linux',
    raw_profiles: 8,
    tests_executed: 9,
  },
  'coverage execution summary',
);
same(
  report.llvm_totals_including_tests,
  {
    branches: { count: 0, covered: 0, notcovered: 0, percent: 0 },
    functions: { count: 9, covered: 9, percent: 100 },
    instantiations: { count: 9, covered: 9, percent: 100 },
    lines: { count: 36, covered: 36, percent: 100 },
    mcdc: { count: 0, covered: 0, notcovered: 0, percent: 0 },
    regions: { count: 38, covered: 38, notcovered: 0, percent: 100 },
  },
  'unfiltered LLVM test totals',
);
assert(report.product_files.length === 8, 'coverage product file count');
assert(report.exclusions.inline_ranges.length === 8, 'inline exclusion count');
assert(report.exclusions.empty_product_scope.revalidate_by === 'P03-008', 'empty-scope deadline');
const nullMetric = { count: 0, covered: 0, missed: 0, percent_basis_points: null };
for (const file of report.product_files) {
  assert(sha256(showBytes(file.path)) === file.sha256, file.path + ': report source binding');
  same(
    file.metrics,
    {
      branches: nullMetric,
      functions: nullMetric,
      lines: nullMetric,
      regions: nullMetric,
    },
    file.path + ': honest empty product metrics',
  );
  assert(file.exclusion_ranges.length === 1, file.path + ': exclusion range count');
  const source = showText(file.path);
  assert(
    source.includes('// helix-coverage: exclude-start unit-tests\n#[cfg(test)]\nmod tests {'),
    file.path + ': start exclusion marker',
  );
  assert(
    source.endsWith('}\n// helix-coverage: exclude-end unit-tests\n'),
    file.path + ': end exclusion marker',
  );
}
same(
  report.groups.map(({ empty_product_scope: empty, failures, id, metrics, verdict }) => ({
    empty,
    failures,
    id,
    metrics,
    verdict,
  })),
  policy.groups.map(({ id }) => ({
    empty: true,
    failures: [],
    id,
    metrics: {
      branches: nullMetric,
      functions: nullMetric,
      lines: nullMetric,
      regions: nullMetric,
    },
    verdict: 'pass',
  })),
  'coverage group report',
);

const packageJson = JSON.parse(showText('package.json'));
same(
  {
    'coverage:check': packageJson.scripts['coverage:check'],
    'coverage:policy': packageJson.scripts['coverage:policy'],
  },
  {
    'coverage:check': 'node tests/toolchain/check-rust-coverage.mjs run',
    'coverage:policy': 'node tests/toolchain/check-rust-coverage.mjs policy',
  },
  'coverage package commands',
);
assert(
  sha256(showBytes('package-lock.json')) ===
    sha256(showBytes('package-lock.json', commitArgument + '^')),
  'P02-013 changed the npm lock despite adding no dependency',
);
assert(
  sha256(showBytes('Cargo.lock')) === sha256(showBytes('Cargo.lock', commitArgument + '^')),
  'P02-013 changed the Cargo lock despite adding no dependency',
);
assert(showText('rust-toolchain.toml').includes('"llvm-tools"'), 'source llvm-tools component');
const matrix = JSON.parse(showText('.github/ci/matrix.json'));
same(
  matrix.plan_items,
  ['P02-009', 'P02-010', 'P02-011', 'P02-012', 'P02-013'],
  'CI task history',
);
const ci = showText('.github/workflows/ci.yml');
for (const marker of [
  'Enforce Rust product coverage thresholds',
  "if: matrix.id == 'linux-x64'",
  'node tests/toolchain/check-rust-coverage.mjs run',
]) {
  assert(ci.includes(marker), 'CI coverage marker absent: ' + marker);
}
assert(
  showText('ImplementationPlan.md').includes(
    '- [ ] **P02-013** Add code coverage reporting with explicit exclusions and minimum thresholds for semantic and recovery-critical modules.',
  ),
  'source task was checked before evidence closure',
);

const requirementFamilies =
  'INV|PLAT|CORE|DATA|QUERY|STORE|GPU|DIST|CACHE|SYNC|SEC|OPS|QUAL|COMPAT';
const requirementPattern = new RegExp('\\b(?:' + requirementFamilies + ')-\\d{3}\\b', 'g');
const specificationRequirements = new Set(showText('Specifications.md').match(requirementPattern) ?? []);
const ledgerRequirements = new Set(
  showText('docs/governance/requirements.md').match(requirementPattern) ?? [],
);
assert(specificationRequirements.size === 44, 'specification requirement count');
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
  assert(source.endsWith('\n'), file + ': missing terminal newline');
  for (const [index, line] of source.split('\n').entries()) {
    assert(!/[ \t]+$/.test(line), file + ':' + (index + 1) + ': trailing whitespace');
  }
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let rawTarget = match[1].split('#')[0];
    if (!rawTarget || /^(https?:|mailto:)/.test(rawTarget)) continue;
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) rawTarget = rawTarget.slice(1, -1);
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)),
    );
    assert(target !== '..' && !target.startsWith('../'), file + ': link escapes repository');
    gitText(['cat-file', '-e', commitArgument + ':' + target]);
    localLinks += 1;
  }
}
assert(markdownFiles.length === 145, 'Markdown inventory mismatch: ' + markdownFiles.length);
assert(localLinks === 944, 'local link count mismatch: ' + localLinks);

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-013-'));
try {
  const archive = gitBytes(['archive', '--format=tar', commitArgument]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const baseEnvironment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  for (const name of [
    'FORCE_COLOR',
    'NO_COLOR',
    'RUSTFLAGS',
    'CARGO_ENCODED_RUSTFLAGS',
    'LLVM_PROFILE_FILE',
    'CARGO_TARGET_DIR',
  ]) {
    delete baseEnvironment[name];
  }
  const run = (program, args, options = {}) =>
    execFileSync(program, args, {
      cwd: temporary,
      encoding: 'utf8',
      env: baseEnvironment,
      maxBuffer: 128 * 1024 * 1024,
      timeout: 900_000,
      ...options,
    });
  const runResult = (program, args, options = {}) =>
    spawnSync(program, args, {
      cwd: temporary,
      encoding: 'utf8',
      env: baseEnvironment,
      maxBuffer: 128 * 1024 * 1024,
      timeout: 900_000,
      ...options,
    });
  const requireText = (output, marker, label) => {
    assert(output.includes(marker), label + ': output marker absent: ' + marker);
  };
  const shellQuote = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const nvm = path.join(os.homedir(), '.nvm', 'nvm.sh');
  assert(existsSync(nvm), 'NVM installation absent for supported Node-lane replay');
  const nvmCommand = (version, args) =>
    'source ' +
    shellQuote(nvm) +
    ' && nvm exec ' +
    shellQuote(version) +
    ' ' +
    args.map(shellQuote).join(' ');
  const runNvm = (version, args, options = {}) =>
    run('bash', ['-lc', nvmCommand(version, args)], options);
  const runNvmResult = (version, args, options = {}) =>
    runResult('bash', ['-lc', nvmCommand(version, args)], options);
  const expectFailure = (result, label, marker) => {
    assert(result.status !== 0, label + ': mutation unexpectedly passed');
    const output = (result.stdout ?? '') + '\n' + (result.stderr ?? '');
    assert(output.includes(marker), label + ': failure marker absent: ' + marker);
  };
  const expectNodeFailure = (args, label, marker, options = {}) =>
    expectFailure(runResult(process.execPath, args, options), label, marker);
  const expectNvmFailure = (args, label, marker, options = {}) =>
    expectFailure(runNvmResult('22.23.1', args, options), label, marker);

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
        steps: 34,
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
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'policy:javascript']),
    'Checked 62 files',
    'Node 22 JavaScript policy',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'coverage:policy']),
    'PASS Rust coverage policy: 3 threshold groups',
    'Node 22 coverage policy',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'coverage:check']),
    'empty product scope accepted only for boundary-skeleton metadata; thresholds armed',
    'Node 22 coverage report',
  );
  const cleanReportPath = path.join(temporary, policy.report.output);
  assert(
    sha256(readFileSync(cleanReportPath)) === sha256(reportBytes),
    'Node 22 clean report differs from retained report',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'ci:check']),
    'PASS Rust coverage: compiler-matched LLVM report plus semantic/recovery thresholds',
    'Node 22 CI contract',
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
    'Node 22 fixtures',
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
    runNvm('24.18.0', ['corepack', 'npm', 'run', 'coverage:policy']),
    'PASS Rust coverage policy: 3 threshold groups',
    'Node 24 coverage policy',
  );
  requireText(
    runNvm('24.18.0', ['corepack', 'npm', 'run', 'coverage:check']),
    'empty product scope accepted only for boundary-skeleton metadata; thresholds armed',
    'Node 24 coverage report',
  );
  assert(
    sha256(readFileSync(cleanReportPath)) === sha256(reportBytes),
    'Node 24 clean report differs from retained report',
  );
  assert(sha256(readFileSync(lockPath)) === lockHash, 'Node 24 install changed package lock');

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

  const policyPath = path.join(temporary, 'tests/toolchain/rust-coverage-policy.json');
  const policyOriginal = readFileSync(policyPath);
  const toolchainPath = path.join(temporary, 'rust-toolchain.toml');
  const toolchainOriginal = readFileSync(toolchainPath);
  const manifestPath = path.join(temporary, 'Cargo.toml');
  const manifestOriginal = readFileSync(manifestPath);
  const queryPath = path.join(temporary, 'crates/helix-query/src/lib.rs');
  const queryOriginal = readFileSync(queryPath);
  const docPath = path.join(temporary, 'crates/helix-doc/src/lib.rs');
  const docOriginal = readFileSync(docPath);
  const storagePath = path.join(temporary, 'crates/helix-storage/src/lib.rs');
  const storageOriginal = readFileSync(storagePath);
  const ciPath = path.join(temporary, '.github/workflows/ci.yml');
  const ciOriginal = readFileSync(ciPath);
  const mutateJson = (file, original, change) => {
    const value = JSON.parse(original);
    change(value);
    writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  };

  expectNodeFailure(
    ['tests/toolchain/check-rust-coverage.mjs', 'unknown'],
    'unsupported-mode canary',
    'usage: node tests/toolchain/check-rust-coverage.mjs <policy|run>',
  );

  mutateJson(policyPath, policyOriginal, (value) => {
    value.groups[1].thresholds_basis_points.lines = 9000;
  });
  expectNodeFailure(
    ['tests/toolchain/check-rust-coverage.mjs', 'policy'],
    'threshold-weakening canary',
    'coverage threshold baseline mismatch',
  );
  writeFileSync(policyPath, policyOriginal);

  mutateJson(policyPath, policyOriginal, (value) => {
    value.groups[1].include_regex = '^crates/helix-doc/src/';
  });
  expectNodeFailure(
    ['tests/toolchain/check-rust-coverage.mjs', 'policy'],
    'critical-group mapping canary',
    'semantic-critical: core mapping absent',
  );
  writeFileSync(policyPath, policyOriginal);

  writeFileSync(
    toolchainPath,
    toolchainOriginal.toString('utf8').replace(', "llvm-tools"', ''),
  );
  expectNodeFailure(
    ['tests/toolchain/check-rust-coverage.mjs', 'policy'],
    'missing llvm-tools canary',
    'llvm-tools component absent from toolchain',
  );
  writeFileSync(toolchainPath, toolchainOriginal);

  writeFileSync(
    docPath,
    docOriginal
      .toString('utf8')
      .replace(
        '// helix-coverage: exclude-start unit-tests',
        '// helix-coverage: exclude-start unit-tests\n// helix-coverage: exclude-start unit-tests',
      ),
  );
  expectNodeFailure(
    ['tests/toolchain/check-rust-coverage.mjs', 'policy'],
    'duplicate exclusion canary',
    'unpaired inline exclusion',
  );
  writeFileSync(docPath, docOriginal);

  writeFileSync(
    docPath,
    docOriginal
      .toString('utf8')
      .replace(
        '// helix-coverage: exclude-start unit-tests',
        '#[cfg(test)]\nconst COVERAGE_ESCAPE_CANARY: bool = true;\n\n// helix-coverage: exclude-start unit-tests',
      ),
  );
  expectNodeFailure(
    ['tests/toolchain/check-rust-coverage.mjs', 'policy'],
    'cfg-test escape canary',
    'cfg(test) outside explicit exclusion',
  );
  writeFileSync(docPath, docOriginal);

  writeFileSync(docPath, Buffer.concat([docOriginal, Buffer.from('\npub const ESCAPE: bool = true;\n')]));
  expectNodeFailure(
    ['tests/toolchain/check-rust-coverage.mjs', 'policy'],
    'nonterminal exclusion canary',
    'unit-test exclusion must be the final source item',
  );
  writeFileSync(docPath, docOriginal);

  rmSync(queryPath);
  expectNodeFailure(
    ['tests/toolchain/check-rust-coverage.mjs', 'policy'],
    'critical source inventory canary',
    'coverage source inventory is unexpectedly small',
  );
  writeFileSync(queryPath, queryOriginal);

  for (const [name, value] of [
    ['RUSTFLAGS', '-C opt-level=3'],
    ['CARGO_ENCODED_RUSTFLAGS', '-C\u001fopt-level=3'],
    ['LLVM_PROFILE_FILE', '/tmp/escape.profraw'],
    ['CARGO_TARGET_DIR', '/tmp/escape-target'],
  ]) {
    expectNvmFailure(
      ['node', 'tests/toolchain/check-rust-coverage.mjs', 'run'],
      name + ' override canary',
      name + ' must be unset for coverage verification',
      { env: { ...baseEnvironment, [name]: value } },
    );
  }

  const fakeDirectory = path.join(temporary, '.coverage-fake-bin');
  mkdirSync(fakeDirectory);
  const fakeRustc = path.join(fakeDirectory, 'rustc');
  writeFileSync(
    fakeRustc,
    [
      '#!/usr/bin/env bash',
      "printf '%s\\n' 'rustc 0.0.0 (fake 1970-01-01)'",
      "printf '%s\\n' 'binary: rustc' 'commit-hash: fake' 'commit-date: 1970-01-01'",
      "printf '%s\\n' 'host: x86_64-unknown-linux-gnu' 'release: 0.0.0' 'LLVM version: 0.0.0'",
      '',
    ].join('\n'),
  );
  chmodSync(fakeRustc, 0o755);
  expectNvmFailure(
    ['node', 'tests/toolchain/check-rust-coverage.mjs', 'run'],
    'Rust tool identity canary',
    'coverage rustc release',
    { env: { ...baseEnvironment, PATH: fakeDirectory + path.delimiter + baseEnvironment.PATH } },
  );
  rmSync(fakeDirectory, { recursive: true });

  writeFileSync(
    manifestPath,
    manifestOriginal
      .toString('utf8')
      .replace('database-functionality = false', 'database-functionality = true'),
  );
  expectNvmFailure(
    ['node', 'tests/toolchain/check-rust-coverage.mjs', 'run'],
    'workspace maturity canary',
    'workspace functionality metadata',
  );
  writeFileSync(manifestPath, manifestOriginal);

  const semanticFunction = [
    '/// Evidence-only uncovered semantic function.',
    '#[doc(hidden)]',
    'pub fn evidence_uncovered_semantic(value: bool) -> bool {',
    '    !value',
    '}',
    '',
  ].join('\n');
  writeFileSync(
    docPath,
    docOriginal
      .toString('utf8')
      .replace('// helix-coverage: exclude-start unit-tests', semanticFunction + '\n// helix-coverage: exclude-start unit-tests'),
  );
  expectNvmFailure(
    ['node', 'tests/toolchain/check-rust-coverage.mjs', 'run'],
    'uncovered semantic canary',
    'semantic-critical',
  );
  writeFileSync(docPath, docOriginal);

  const recoveryFunction = [
    '/// Evidence-only uncovered recovery function.',
    '#[doc(hidden)]',
    'pub fn evidence_uncovered_recovery(value: bool) -> bool {',
    '    !value',
    '}',
    '',
  ].join('\n');
  writeFileSync(
    storagePath,
    storageOriginal
      .toString('utf8')
      .replace('// helix-coverage: exclude-start unit-tests', recoveryFunction + '\n// helix-coverage: exclude-start unit-tests'),
  );
  expectNvmFailure(
    ['node', 'tests/toolchain/check-rust-coverage.mjs', 'run'],
    'uncovered recovery canary',
    'recovery-critical',
  );
  writeFileSync(storagePath, storageOriginal);

  writeFileSync(
    storagePath,
    storageOriginal
      .toString('utf8')
      .replace('assert_eq!(MATURITY, "boundary-skeleton");', 'assert_eq!(MATURITY, "wrong");'),
  );
  expectNvmFailure(
    ['node', 'tests/toolchain/check-rust-coverage.mjs', 'run'],
    'failing test canary',
    'coverage tests exited',
  );
  writeFileSync(storagePath, storageOriginal);

  const coveredFunction = [
    '/// Evidence-only covered recovery function.',
    '#[doc(hidden)]',
    'pub fn evidence_covered_recovery(value: u8) -> u8 {',
    '    value',
    '}',
    '',
  ].join('\n');
  writeFileSync(
    storagePath,
    storageOriginal
      .toString('utf8')
      .replace('// helix-coverage: exclude-start unit-tests', coveredFunction + '\n// helix-coverage: exclude-start unit-tests')
      .replace(
        'assert_eq!(MATURITY, "boundary-skeleton");',
        'assert_eq!(MATURITY, "boundary-skeleton");\n        assert_eq!(evidence_covered_recovery(7), 7);',
      ),
  );
  requireText(
    runNvm('22.23.1', ['node', 'tests/toolchain/check-rust-coverage.mjs', 'run']),
    'recovery-critical lines 3/3',
    'covered recovery activation canary',
  );
  const activated = JSON.parse(readFileSync(cleanReportPath, 'utf8'));
  assert(activated.exclusions.empty_product_scope === null, 'activation retained empty exception');
  const activatedRecovery = activated.groups.find(({ id }) => id === 'recovery-critical');
  assert(activatedRecovery.metrics.lines.percent_basis_points === 10000, 'activation line coverage');
  assert(
    activatedRecovery.metrics.functions.percent_basis_points === 10000,
    'activation function coverage',
  );
  writeFileSync(storagePath, storageOriginal);

  writeFileSync(
    ciPath,
    ciOriginal
      .toString('utf8')
      .replace(
        'run: node tests/toolchain/check-rust-coverage.mjs run',
        'run: node tests/toolchain/check-rust-coverage.mjs policy',
      ),
  );
  expectNvmFailure(
    ['corepack', 'npm', 'run', 'ci:check'],
    'CI coverage execution canary',
    'gating workflow marker absent: node tests/toolchain/check-rust-coverage.mjs run',
  );
  writeFileSync(ciPath, ciOriginal);

  requireText(
    runNvm('22.23.1', ['node', 'tests/toolchain/check-rust-coverage.mjs', 'run']),
    'empty product scope accepted only for boundary-skeleton metadata; thresholds armed',
    'post-canary clean coverage report',
  );
  assert(
    sha256(readFileSync(cleanReportPath)) === sha256(reportBytes),
    'post-canary report differs from retained report',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'ci:check']),
    'PASS Rust coverage: compiler-matched LLVM report plus semantic/recovery thresholds',
    'post-canary CI contract',
  );
  const status = run('git', ['status', '--short', '--untracked-files=no']).trim();
  assert(status === '', 'clean replay source drift: ' + status);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write(
  'PASS P02-013 evidence: exact 28-file source commit, compiler-matched deterministic report, clean Node 22/24 and native replay, 18 rejection canaries, and one covered-denominator activation canary\n',
);

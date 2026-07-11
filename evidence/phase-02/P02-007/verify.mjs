#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidenceDirectory = path.join(repository, 'evidence/phase-02/P02-007');
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
  execFileSync('git', args, {
    cwd: repository,
    maxBuffer: 64 * 1024 * 1024,
  });
const gitText = (args) => gitBytes(args).toString('utf8');
const showBytes = (file) => gitBytes(['show', `${manifest.commit}:${file}`]);
const showText = (file) => showBytes(file).toString('utf8');

assert(commitArgument, 'usage: node evidence/phase-02/P02-007/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P02-007', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(
  manifest.requirements,
  [
    'INV-003',
    'INV-004',
    'INV-007',
    'INV-009',
    'PLAT-001',
    'PLAT-002',
    'CORE-003',
    'QUAL-001',
    'QUAL-002',
    'COMPAT-001',
  ],
  'evidence requirements',
);
same(manifest.accepted_adrs, ['0001'], 'accepted ADR inventory');

const artifactPaths = manifest.artifacts.map(({ path: artifactPath }) => artifactPath);
same(sorted(artifactPaths), sorted(new Set(artifactPaths)), 'unique artifact paths');
assert(manifest.artifacts.length === 19, 'artifact count mismatch');
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

const packageJson = JSON.parse(showText('package.json'));
const expectedScripts = {
  test: 'node tests/run-suite.mjs all',
  'test:all': 'node tests/run-suite.mjs all',
  'test:benchmark': 'node tests/run-suite.mjs benchmark',
  'test:browser': 'node tests/run-suite.mjs browser',
  'test:commands': 'node tests/toolchain/check-test-command-surface.mjs',
  'test:conformance': 'node tests/run-suite.mjs conformance',
  'test:crash': 'node tests/run-suite.mjs crash',
  'test:distributed': 'node tests/run-suite.mjs distributed',
  'test:fuzz': 'node tests/run-suite.mjs fuzz',
  'test:integration': 'node tests/run-suite.mjs integration',
  'test:unit': 'node tests/run-suite.mjs unit',
};
same(
  Object.fromEntries(Object.keys(expectedScripts).map((name) => [name, packageJson.scripts[name]])),
  expectedScripts,
  'stable package command surface',
);
const suiteManifest = JSON.parse(showText('tests/suites.json'));
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
assert(suiteManifest.schema === 'helix.test-command-surface/1', 'suite schema mismatch');
assert(suiteManifest.plan_item === 'P02-007', 'suite task mismatch');
same(suiteManifest.ordered_suites, suiteIds, 'suite order');
same(
  suiteManifest.suites.map(({ id }) => id),
  suiteIds,
  'suite definition IDs',
);
assert(
  suiteManifest.suites.filter(({ state }) => state === 'active').length === 2 &&
    suiteManifest.suites.filter(({ state }) => state === 'reserved').length === 6,
  'active/reserved suite split mismatch',
);
const cargo = showText('Cargo.toml');
assert(cargo.includes('test-command-contract = "P02-007"'), 'Cargo command contract absent');
assert(
  cargo.includes(
    'test-commands = ["unit", "integration", "conformance", "fuzz", "browser", "crash", "benchmark", "distributed"]',
  ),
  'Cargo command inventory absent',
);
const runnerSource = showText('tests/run-suite.mjs');
assert(!runnerSource.includes('shell: true'), 'suite runner enables a shell');
assert(runnerSource.includes("CARGO_NET_OFFLINE: 'true'"), 'suite runner lacks offline Cargo');
const policy = showText('docs/quality/test-command-surface.md');
for (const command of Object.keys(expectedScripts)) {
  assert(policy.includes(`npm run ${command}`), `policy omits ${command}`);
}
for (const marker of [
  'reserved',
  'does not prove',
  'https://doc.rust-lang.org/cargo/commands/cargo-test.html',
  'https://vitest.dev/guide/cli',
  'https://playwright.dev/docs/test-cli',
  'https://rust-fuzz.github.io/book/',
]) {
  assert(policy.includes(marker), `policy marker absent: ${marker}`);
}

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
assert(markdownFiles.length === 129, `Markdown inventory mismatch: ${markdownFiles.length}`);
assert(localLinks === 823, `local link count mismatch: ${localLinks}`);

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-007-'));
try {
  const archive = gitBytes(['archive', '--format=tar', commitArgument]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const baseEnvironment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  const run = (program, args, options = {}) => {
    try {
      const stdout = execFileSync(program, args, {
        cwd: temporary,
        encoding: 'utf8',
        env: baseEnvironment,
        maxBuffer: 64 * 1024 * 1024,
        timeout: 240_000,
        ...options,
      });
      return stdout;
    } catch (error) {
      if (options.allowFailure === true) return error;
      throw error;
    }
  };
  const expectFailure = (program, args, label) => {
    const result = run(program, args, { allowFailure: true, stdio: 'pipe' });
    assert(result instanceof Error, `${label}: mutation was not rejected`);
  };
  const requireText = (output, marker, label) => {
    assert(output.includes(marker), `${label}: output marker absent: ${marker}`);
  };
  const shellQuote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
  const nvm = path.join(os.homedir(), '.nvm', 'nvm.sh');
  assert(existsSync(nvm), 'NVM installation absent for supported Node-lane replay');
  const runNvm = (version, args) =>
    run('bash', [
      '-lc',
      `source ${shellQuote(nvm)} && nvm exec ${shellQuote(version)} ${args.map(shellQuote).join(' ')}`,
    ]);

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

  const packageLockPath = path.join(temporary, 'package-lock.json');
  const lockHash = sha256(readFileSync(packageLockPath));
  const runPolicies = (version) => {
    const javascript = runNvm(version, ['corepack', 'npm', 'run', 'policy:javascript']);
    requireText(javascript, 'Checked 31 files', `Biome on Node ${version}`);
    const dependencies = runNvm(version, ['corepack', 'npm', 'run', 'policy:dependencies']);
    requireText(dependencies, 'PASS npm policy: 91 dev packages', `dependency policy ${version}`);
    runNvm(version, ['corepack', 'npm', 'run', 'toolchain:types']);
    const surface = runNvm(version, ['corepack', 'npm', 'run', 'test:commands']);
    requireText(surface, 'PASS test command surface: 8 stable suites', `command surface ${version}`);
  };

  runNvm('22.23.1', ['corepack', 'npm', 'ci', '--ignore-scripts']);
  runPolicies('22.23.1');
  const categoryMarkers = {
    unit: 'PASS suite unit:',
    integration: 'RESERVED suite integration:',
    conformance: 'PASS suite conformance:',
    fuzz: 'RESERVED suite fuzz:',
    browser: 'RESERVED suite browser:',
    crash: 'RESERVED suite crash:',
    benchmark: 'RESERVED suite benchmark:',
    distributed: 'RESERVED suite distributed:',
  };
  for (const [suite, marker] of Object.entries(categoryMarkers)) {
    const output = runNvm('22.23.1', ['corepack', 'npm', 'run', `test:${suite}`]);
    requireText(output, marker, `Node 22 named ${suite} command`);
  }
  assert(sha256(readFileSync(packageLockPath)) === lockHash, 'lock drift on Node 22');

  runNvm('24.18.0', ['corepack', 'npm', 'ci', '--ignore-scripts']);
  runPolicies('24.18.0');
  const aggregate = runNvm('24.18.0', ['corepack', 'npm', 'test']);
  requireText(
    aggregate,
    'PASS all test suites: unit,integration,conformance,fuzz,browser,crash,benchmark,distributed',
    'Node 24 aggregate command',
  );
  assert(sha256(readFileSync(packageLockPath)) === lockHash, 'lock drift on Node 24');

  const installScripts = JSON.parse(run('corepack', ['npm', 'install-scripts', 'ls', '--json']));
  same(installScripts.allowScripts, [], 'approved lifecycle scripts');
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

  const packagePath = path.join(temporary, 'package.json');
  const packageOriginal = readFileSync(packagePath);
  const changedPackage = JSON.parse(packageOriginal.toString('utf8'));
  changedPackage.scripts['test:unit'] = 'node tests/run-suite.mjs unknown';
  writeFileSync(packagePath, `${JSON.stringify(changedPackage, null, 2)}\n`);
  expectFailure('corepack', ['npm', 'run', 'test:commands'], 'package alias canary');
  writeFileSync(packagePath, packageOriginal);

  const suitesPath = path.join(temporary, 'tests/suites.json');
  const suitesOriginal = readFileSync(suitesPath);
  const changedSuites = JSON.parse(suitesOriginal.toString('utf8'));
  changedSuites.ordered_suites.pop();
  changedSuites.suites.pop();
  writeFileSync(suitesPath, `${JSON.stringify(changedSuites, null, 2)}\n`);
  expectFailure(process.execPath, ['tests/run-suite.mjs', '--list'], 'suite manifest canary');
  writeFileSync(suitesPath, suitesOriginal);

  const rogueCrash = path.join(temporary, 'tests/crash/p02007-canary.mjs');
  writeFileSync(rogueCrash, 'export {};\n');
  expectFailure(process.execPath, ['tests/run-suite.mjs', 'crash'], 'reserved-root canary');
  unlinkSync(rogueCrash);

  const integrationDirectory = path.join(temporary, 'crates/helix-core/tests');
  mkdirSync(integrationDirectory);
  writeFileSync(
    path.join(integrationDirectory, 'p02007_canary.rs'),
    '#[test]\nfn integration_target_canary() {}\n',
  );
  expectFailure(
    process.execPath,
    ['tests/run-suite.mjs', 'integration'],
    'Cargo integration-target canary',
  );
  rmSync(integrationDirectory, { recursive: true });

  const benchmarkDirectory = path.join(temporary, 'crates/helix-core/benches');
  mkdirSync(benchmarkDirectory);
  writeFileSync(path.join(benchmarkDirectory, 'p02007_canary.rs'), 'fn main() {}\n');
  expectFailure(
    process.execPath,
    ['tests/run-suite.mjs', 'benchmark'],
    'Cargo benchmark-target canary',
  );
  rmSync(benchmarkDirectory, { recursive: true });

  const rustPath = path.join(temporary, 'crates/helix-core/src/lib.rs');
  const rustOriginal = readFileSync(rustPath);
  appendFileSync(
    rustPath,
    '\n#[cfg(test)]\nmod p02007_failure_canary {\n    #[test]\n    fn rejects_failure() {\n        assert_eq!(1, 2);\n    }\n}\n',
  );
  expectFailure('corepack', ['npm', 'run', 'test:unit'], 'Rust unit failure canary');
  writeFileSync(rustPath, rustOriginal);

  const javascriptCanary = path.join(temporary, 'tests/p02007-canary.test.mjs');
  writeFileSync(
    javascriptCanary,
    "import { expect, test } from 'vitest';\n\ntest('inventory canary', () => {\n  expect(true).toBe(true);\n});\n",
  );
  expectFailure('corepack', ['npm', 'run', 'test:unit'], 'JavaScript unit inventory canary');
  unlinkSync(javascriptCanary);

  const semanticManifest = JSON.parse(
    readFileSync(path.join(temporary, 'fixtures/semantic/manifest.json'), 'utf8'),
  );
  const fixturePath = path.join(temporary, semanticManifest.fixtures[0].path);
  const fixtureOriginal = readFileSync(fixturePath);
  appendFileSync(fixturePath, ' ');
  expectFailure('corepack', ['npm', 'run', 'test:conformance'], 'semantic fixture canary');
  writeFileSync(fixturePath, fixtureOriginal);

  assert(
    run('git', ['status', '--porcelain', '--untracked-files=all']).trim() === '',
    'mutation restoration or command execution left source drift',
  );
  for (const generated of [
    'coverage',
    'playwright-report',
    'test-results',
    'blob-report',
    'dist',
  ]) {
    assert(!existsSync(path.join(temporary, generated)), `unexpected generated root: ${generated}`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact 19-file P02-007 scope at ${commitArgument}`);
console.log('PASS command surface: 8 categories, 11 npm scripts, 2 active and 6 reserved suites');
console.log('PASS Node lanes: 22.23.1 named aliases and 24.18.0 aggregate with stable lock');
console.log('PASS active suites: 9 Rust tests and 17 fixtures/313 steps/382 oracle assertions');
console.log('PASS reserved probes: 0 integration/fuzz/browser/crash/benchmark/distributed cases');
console.log('PASS 8 mutation canaries: aliases, manifest, roots, Cargo targets, unit and conformance');
console.log(`PASS documentation: ${markdownFiles.length} Markdown files, ${localLinks} local links`);
for (const artifact of manifest.artifacts) {
  console.log(`ARTIFACT ${artifact.path} ${artifact.sha256} ${artifact.bytes}`);
}
console.log(`VERIFIER ${manifest.verifier.sha256} ${manifest.verifier.bytes}`);

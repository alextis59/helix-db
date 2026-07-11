#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
if (!input) throw new Error('usage: node evidence/phase-02/P02-006/verify.mjs <commit>');

const scriptPath = fileURLToPath(import.meta.url);
const evidenceDirectory = path.dirname(scriptPath);
const manifest = JSON.parse(readFileSync(path.join(evidenceDirectory, 'manifest.json'), 'utf8'));
const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const gitText = (args) =>
  execFileSync('git', args, {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
const gitBytes = (args) =>
  execFileSync('git', args, { cwd: repository, maxBuffer: 64 * 1024 * 1024 });
const commit = gitText(['rev-parse', `${input}^{commit}`]).trim();
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const showBytes = (file) => gitBytes(['show', `${commit}:${file}`]);
const showText = (file) => new TextDecoder('utf-8', { fatal: true }).decode(showBytes(file));
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
const sorted = (values) => [...values].sort();

const artifactPaths = [
  '.github/CODEOWNERS',
  '.npmrc',
  'Cargo.toml',
  'README.md',
  'THIRD_PARTY_NOTICES.md',
  'biome.json',
  'compatibility/v1/check-matrix.mjs',
  'compatibility/v1/generate-matrix.mjs',
  'crates/helix-columnar/Cargo.toml',
  'crates/helix-core/Cargo.toml',
  'crates/helix-doc/Cargo.toml',
  'crates/helix-doc/src/lib.rs',
  'crates/helix-gpu/Cargo.toml',
  'crates/helix-host-native/Cargo.toml',
  'crates/helix-query/Cargo.toml',
  'crates/helix-server/Cargo.toml',
  'crates/helix-storage/Cargo.toml',
  'differential/mongodb/check-artifacts.mjs',
  'differential/mongodb/ejson.mjs',
  'differential/mongodb/mongosh-runner.js',
  'differential/mongodb/run.mjs',
  'docs/README.md',
  'docs/architecture/code-quality-and-dependency-policy.md',
  'docs/architecture/javascript-toolchain-policy.md',
  'docs/architecture/rust-toolchain-policy.md',
  'docs/governance/licensing.md',
  'fixtures/semantic/check-corpus.mjs',
  'fixtures/semantic/generate-corpus.mjs',
  'fixtures/semantic/schema/check-semantic-examples.mjs',
  'package-lock.json',
  'package.json',
  'reference/semantic-oracle/cli.mjs',
  'reference/semantic-oracle/command.mjs',
  'reference/semantic-oracle/oracle.mjs',
  'reference/semantic-oracle/raw-json.mjs',
  'reference/semantic-oracle/registry.mjs',
  'reference/semantic-oracle/test-oracle.mjs',
  'reference/semantic-oracle/validate.mjs',
  'reference/semantic-oracle/value.mjs',
  'tests/toolchain/README.md',
  'tests/toolchain/check-browser-profile.mjs',
  'tests/toolchain/check-dependency-policy.mjs',
  'tests/toolchain/dependency-policy.json',
  'tests/toolchain/run-build-profile.mjs',
];
const crateNames = [
  'helix-columnar',
  'helix-core',
  'helix-doc',
  'helix-gpu',
  'helix-host-native',
  'helix-query',
  'helix-server',
  'helix-storage',
];

assert(manifest.task_id === 'P02-006', 'evidence manifest task mismatch');
assert(manifest.commit === commit, 'evidence manifest commit mismatch');
assert(manifest.verdict === 'pass', 'evidence manifest verdict is not pass');
same(
  manifest.requirements,
  ['INV-003', 'INV-004', 'INV-006', 'INV-007', 'CORE-001', 'CORE-003', 'SEC-001', 'SEC-002', 'QUAL-001'],
  'requirement inventory',
);
const verifierBytes = readFileSync(scriptPath);
assert(verifierBytes.length === manifest.verifier.bytes, 'verifier byte count mismatch');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier hash mismatch');

gitText(['diff', '--check', `${commit}^`, commit]);
const changed = gitText(['diff-tree', '--no-commit-id', '--name-only', '-r', commit])
  .trim()
  .split('\n')
  .filter(Boolean)
  .sort();
same(changed, sorted(artifactPaths), 'artifact commit scope');
const files = Object.fromEntries(artifactPaths.map((file) => [file, showBytes(file)]));
for (const [file, bytes] of Object.entries(files)) {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assert(source.endsWith('\n'), `${file}: missing terminal newline`);
  for (const [index, line] of source.split('\n').entries()) {
    assert(!/[ \t]+$/.test(line), `${file}:${index + 1}: trailing whitespace`);
  }
}
assert(manifest.artifacts.length === artifactPaths.length, 'manifest artifact count mismatch');
assert(new Set(manifest.artifacts.map(({ path: file }) => file)).size === artifactPaths.length, 'duplicate manifest artifact');
for (const artifact of manifest.artifacts) {
  const bytes = files[artifact.path];
  assert(bytes, `manifest artifact is outside exact scope: ${artifact.path}`);
  assert(bytes.length === artifact.bytes, `${artifact.path}: byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: hash mismatch`);
}

const cargo = showText('Cargo.toml');
for (const marker of [
  '[workspace.lints.rust]',
  'warnings = { level = "deny", priority = -3 }',
  'future_incompatible = { level = "deny", priority = -2 }',
  'rust_2024_compatibility = { level = "deny", priority = -2 }',
  'unsafe_code = "forbid"',
  'missing_docs = "deny"',
  'unreachable_pub = "deny"',
  '[workspace.lints.clippy]',
  'all = { level = "deny", priority = -3 }',
  'pedantic = { level = "deny", priority = -2 }',
  'allow_attributes_without_reason = "deny"',
  'expect_used = "deny"',
  'panic = "deny"',
  'unwrap_used = "deny"',
]) assert(cargo.includes(marker), `Rust lint marker absent: ${marker}`);
for (const crate of crateNames) {
  const manifestSource = showText(`crates/${crate}/Cargo.toml`);
  assert(manifestSource.includes('[lints]\nworkspace = true'), `${crate}: workspace lint inheritance absent`);
}
const rustSources = gitText(['ls-tree', '-r', '--name-only', commit])
  .trim()
  .split('\n')
  .filter((file) => file.endsWith('.rs'));
assert(rustSources.length === 8, `Rust source inventory mismatch: ${rustSources.length}`);
for (const file of rustSources) assert(!/\bunsafe\b/.test(showText(file)), `${file}: unsafe token present`);
assert(!gitText(['ls-tree', '-r', '--name-only', commit]).split('\n').some((file) => file.endsWith('/build.rs')), 'Rust build script present');

const biome = JSON.parse(showText('biome.json'));
assert(biome.$schema === 'https://biomejs.dev/schemas/2.5.3/schema.json', 'Biome schema/version mismatch');
assert(biome.formatter.lineWidth === 100 && biome.formatter.indentWidth === 2, 'Biome formatter width/indent mismatch');
assert(biome.javascript.formatter.quoteStyle === 'single', 'Biome quote policy mismatch');
assert(biome.javascript.formatter.semicolons === 'always', 'Biome semicolon policy mismatch');
assert(biome.linter.rules.preset === 'recommended', 'Biome recommended preset absent');
assert(biome.linter.rules.style.useNodejsImportProtocol === 'error', 'Biome node protocol lint absent');
assert(biome.linter.rules.suspicious.noExplicitAny === 'error', 'Biome explicit-any lint absent');
for (const marker of ['!!evidence', '!package-lock.json', 'fixtures/**/*.mjs', 'reference/**/*.mjs', 'tests/**/*.mjs']) {
  assert(biome.files.includes.includes(marker), `Biome scope marker absent: ${marker}`);
}

const packageJson = JSON.parse(showText('package.json'));
assert(packageJson.private === true, 'npm workspace publication boundary changed');
assert(packageJson.allowScripts.fsevents === false, 'fsevents lifecycle denial absent');
assert(packageJson.devDependencies['@biomejs/biome'] === '2.5.3', 'Biome direct version mismatch');
assert(packageJson.scripts['policy:javascript'] === 'biome check --error-on-warnings .', 'JavaScript policy command mismatch');
assert(packageJson.scripts['policy:dependencies'] === 'node tests/toolchain/check-dependency-policy.mjs', 'dependency policy command mismatch');
assert(showText('.npmrc').includes('strict-allow-scripts=true'), 'strict npm lifecycle policy absent');

const lock = JSON.parse(showText('package-lock.json'));
const locked = Object.entries(lock.packages).filter(([packagePath]) => packagePath !== '');
assert(lock.lockfileVersion === 3 && locked.length === 91, 'npm lock inventory mismatch');
assert(locked.every(([, entry]) => entry.dev === true), 'runtime npm dependency present');
assert(locked.every(([, entry]) => entry.resolved.startsWith('https://registry.npmjs.org/')), 'noncanonical npm source present');
assert(locked.every(([, entry]) => /^sha512-/.test(entry.integrity)), 'non-SHA512 npm entry present');
assert(locked.filter(([, entry]) => entry.hasInstallScript).length === 2, 'npm lifecycle inventory mismatch');
const licenseCounts = {};
for (const [, entry] of locked) licenseCounts[entry.license] = (licenseCounts[entry.license] ?? 0) + 1;
same(licenseCounts, {
  '0BSD': 1,
  'Apache-2.0': 6,
  'BSD-3-Clause': 1,
  ISC: 2,
  MIT: 60,
  'MIT OR Apache-2.0': 9,
  'MPL-2.0': 12,
}, 'npm license counts');

const dependencyPolicy = JSON.parse(showText('tests/toolchain/dependency-policy.json'));
assert(dependencyPolicy.schema === 'helix.dependency-policy/1', 'dependency policy schema mismatch');
assert(dependencyPolicy.rust.allow_external_packages === false, 'external Rust packages permitted');
assert(dependencyPolicy.rust.allow_git_sources === false, 'git Rust sources permitted');
same(dependencyPolicy.rust.allowed_build_scripts, [], 'Rust build-script exceptions');
same(dependencyPolicy.rust.unsafe_exceptions, [], 'unsafe exceptions');
assert(dependencyPolicy.npm.build_only_license_exceptions[0].expected_packages === 12, 'MPL exception count mismatch');
assert(dependencyPolicy.npm.reviewed_denied_lifecycle_scripts.length === 2, 'reviewed lifecycle count mismatch');
assert(dependencyPolicy.npm.allowed_duplicate_versions.length === 1, 'duplicate exception count mismatch');

const policyDocument = showText('docs/architecture/code-quality-and-dependency-policy.md');
for (const marker of [
  'A future need for unsafe code is a reviewed architecture/security change',
  'Metadata screening does not prove that upstream license texts/provenance are complete.',
  'cannot be cited as an SBOM, vulnerability-free claim, legal opinion, or production release approval',
  'https://doc.rust-lang.org/cargo/reference/workspaces.html#the-lints-table',
  'https://doc.rust-lang.org/stable/clippy/usage.html',
  'https://biomejs.dev/guides/getting-started/',
  'https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/',
]) assert(policyDocument.includes(marker), `policy document marker absent: ${marker}`);
const notices = showText('THIRD_PARTY_NOTICES.md');
for (const marker of ['91 locked npm development packages', '| MPL-2.0 | 12 |', 'No external Rust crate is locked']) {
  assert(notices.includes(marker), `notice marker absent: ${marker}`);
}

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', commit]).trim().split('\n').filter(Boolean);
const generatedPath = /(^|\/)(target|node_modules|dist|coverage|playwright-report|test-results|blob-report|\.vitest|\.vite)(\/|$)/;
same(trackedFiles.filter((file) => generatedPath.test(file) || /\.(?:profraw|profdata|tsbuildinfo|tgz)$/.test(file)), [], 'tracked generated-output inventory');
const changedCodeFiles = artifactPaths.filter((file) => /\.(?:mjs|js)$/.test(file));
assert(changedCodeFiles.length === 20, `formatted/checked code artifact count mismatch: ${changedCodeFiles.length}`);

const markdownFiles = trackedFiles.filter((file) => file.endsWith('.md'));
let localLinks = 0;
for (const file of markdownFiles) {
  const source = showText(file);
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let rawTarget = match[1].split('#')[0];
    if (!rawTarget || /^(https?:|mailto:)/.test(rawTarget)) continue;
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) rawTarget = rawTarget.slice(1, -1);
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)));
    assert(target !== '..' && !target.startsWith('../'), `${file}: local link escapes repository: ${rawTarget}`);
    gitText(['cat-file', '-e', `${commit}:${target}`]);
    localLinks += 1;
  }
}
assert(markdownFiles.length === 125, `Markdown inventory mismatch: ${markdownFiles.length}`);
assert(localLinks === 806, `local link count mismatch: ${localLinks}`);

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-006-'));
const dockerNames = () =>
  execFileSync('docker', ['ps', '-a', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter((name) => name.startsWith('helix-p01-021-'))
    .sort();
const baselineContainers = dockerNames();
try {
  const archive = gitBytes(['archive', '--format=tar', commit]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const baseEnvironment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  const run = (program, args, options = {}) =>
    execFileSync(program, args, {
      cwd: temporary,
      encoding: 'utf8',
      env: baseEnvironment,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 240_000,
      ...options,
    });
  const expectFailure = (program, args, label, options = {}) => {
    let failed = false;
    try {
      run(program, args, { stdio: 'pipe', ...options });
    } catch {
      failed = true;
    }
    assert(failed, `${label}: mutation was not rejected`);
  };

  // The dependency scanner inventories both tracked and untracked candidates.
  // Recreate that Git boundary because `git archive` deliberately omits `.git`.
  run('git', ['init', '--quiet']);
  run('git', ['add', '--all']);

  const packageLockPath = path.join(temporary, 'package-lock.json');
  const packageLockOriginal = readFileSync(packageLockPath);
  const packageLockHash = sha256(packageLockOriginal);
  const nvm = path.join(os.homedir(), '.nvm', 'nvm.sh');
  assert(existsSync(nvm), 'NVM installation absent for supported Node-lane replay');
  for (const version of ['22.23.1', '24.18.0']) {
    const prefix = `source "${nvm}" && nvm exec ${version}`;
    const nodeVersion = run('bash', ['-lc', `${prefix} node --version`]);
    assert(nodeVersion.includes(`v${version}`), `Node lane version mismatch: ${version}`);
    run('bash', ['-lc', `${prefix} corepack npm ci --ignore-scripts`]);
    const biomeResult = run('bash', ['-lc', `${prefix} corepack npm run policy:javascript`]);
    assert(biomeResult.includes('Checked 29 files'), `Biome inventory mismatch on Node ${version}`);
    const dependencyResult = run('bash', ['-lc', `${prefix} corepack npm run policy:dependencies`]);
    assert(dependencyResult.includes('PASS npm policy: 91 dev packages'), `npm policy mismatch on Node ${version}`);
    assert(dependencyResult.includes('0 external crates'), `Rust dependency policy mismatch on Node ${version}`);
    run('bash', ['-lc', `${prefix} corepack npm run toolchain:types`]);
    assert(sha256(readFileSync(packageLockPath)) === packageLockHash, `package lock drifted on Node ${version}`);
  }
  const installScripts = JSON.parse(run('corepack', ['npm', 'install-scripts', 'ls', '--json']));
  same(installScripts.allowScripts, [], 'approved npm lifecycle scripts');

  run('cargo', ['fmt', '--all', '--', '--check']);
  run('cargo', ['check', '--frozen', '--workspace', '--all-targets', '--all-features']);
  run('cargo', ['clippy', '--frozen', '--workspace', '--all-targets', '--all-features', '--', '-D', 'warnings']);
  const rustTests = run('cargo', ['test', '--frozen', '--workspace', '--all-features']);
  assert([...rustTests.matchAll(/^test .* \.\.\. ok$/gm)].length === 9, 'native Rust test count mismatch');
  run('cargo', ['doc', '--frozen', '--workspace', '--no-deps', '--all-features'], {
    env: { ...baseEnvironment, RUSTDOCFLAGS: '-D warnings' },
  });
  for (const target of ['wasm32-unknown-unknown', 'wasm32-wasip2']) {
    run('cargo', ['clippy', '--frozen', '--target', target, '--package', 'helix-core', '--', '-D', 'warnings']);
  }
  run('cargo', [
    'check',
    '--frozen',
    '--target',
    'x86_64-unknown-linux-gnuasan',
    '--workspace',
    '--all-targets',
    '--all-features',
  ]);

  const node = process.execPath;
  const commands = [
    ['fixtures/semantic/schema/check-semantic-examples.mjs', 'PASS semantic examples: 4 accepted; 3 rejected'],
    ['fixtures/semantic/schema/check-canonical-examples.mjs', 'PASS canonical examples: 4 stable'],
    ['fixtures/semantic/generate-corpus.mjs', '--check', 'PASS corpus generation: 17 fixtures, 313 steps'],
    ['fixtures/semantic/check-corpus.mjs', 'PASS corpus: 17 fixtures, 313 steps'],
    ['reference/semantic-oracle/test-oracle.mjs', 'PASS oracle unit/property/negative tests: 382 assertions'],
    ['reference/semantic-oracle/cli.mjs', '--check-report', 'PASS oracle: 17 fixtures, 313 steps'],
    ['compatibility/v1/generate-matrix.mjs', '--check', 'PASS semantic compatibility matrix: 263 native rows'],
    ['compatibility/v1/check-matrix.mjs', 'PASS matrix mutation canaries:'],
    ['differential/mongodb/check-artifacts.mjs', 'PASS MongoDB differential artifacts: 3 schemas, 16 cases'],
  ];
  for (const specification of commands) {
    const [file, maybeArgument, maybeMarker] = specification;
    const hasArgument = maybeMarker !== undefined;
    const output = run(node, hasArgument ? [file, maybeArgument] : [file]);
    const marker = hasArgument ? maybeMarker : maybeArgument;
    assert(output.includes(marker), `${file}: expected result marker absent`);
  }
  const live = run(node, ['differential/mongodb/run.mjs', '--check-report']);
  assert(live.includes('PASS MongoDB differential: 16 cases, 12 exact, 4 deliberate differences'), 'live MongoDB differential mismatch');
  const liveCanary = run(node, ['differential/mongodb/run.mjs', '--canary-expected-relation']);
  assert(liveCanary.includes('PASS expected-relation mutation canary detected: array.all.direct'), 'live expectation canary mismatch');
  same(dockerNames(), baselineContainers, 'residual MongoDB differential containers');

  const biomeCanary = path.join(temporary, 'tests/toolchain/policy-canary.mjs');
  writeFileSync(biomeCanary, 'var canary = "bad"\n');
  expectFailure('corepack', ['npm', 'run', 'policy:javascript'], 'Biome formatting/lint canary');
  unlinkSync(biomeCanary);

  const rustSourcePath = path.join(temporary, 'crates/helix-doc/src/lib.rs');
  const rustSourceOriginal = readFileSync(rustSourcePath);
  writeFileSync(rustSourcePath, Buffer.concat([rustSourceOriginal, Buffer.from('\npub unsafe fn p02_unsafe_canary() {}\n')]));
  expectFailure('corepack', ['npm', 'run', 'policy:dependencies'], 'unsafe inventory canary');
  expectFailure('cargo', ['check', '--frozen', '--package', 'helix-doc'], 'unsafe compiler canary');
  writeFileSync(rustSourcePath, Buffer.concat([rustSourceOriginal, Buffer.from('\nfn p02_warning_canary() { let unused = 1; }\n')]));
  expectFailure('cargo', ['check', '--frozen', '--package', 'helix-doc'], 'warning-as-error canary');
  writeFileSync(rustSourcePath, rustSourceOriginal);

  const checkDependency = () => expectFailure('corepack', ['npm', 'run', 'policy:dependencies'], 'dependency policy canary');
  const mutateLock = (mutation) => {
    const candidate = JSON.parse(packageLockOriginal.toString('utf8'));
    mutation(candidate.packages['node_modules/@jridgewell/sourcemap-codec']);
    writeFileSync(packageLockPath, `${JSON.stringify(candidate, null, 2)}\n`);
    checkDependency();
    writeFileSync(packageLockPath, packageLockOriginal);
  };
  mutateLock((entry) => {
    entry.license = 'GPL-3.0-only';
  });
  mutateLock((entry) => {
    entry.resolved = 'https://unapproved.example.invalid/package.tgz';
  });
  mutateLock((entry) => {
    entry.hasInstallScript = true;
  });

  assert(sha256(readFileSync(packageLockPath)) === packageLockHash, 'package lock was not restored after canaries');
  assert(sha256(readFileSync(rustSourcePath)) === sha256(rustSourceOriginal), 'Rust source was not restored after canaries');
} finally {
  for (const name of dockerNames().filter((candidate) => !baselineContainers.includes(candidate))) {
    try {
      execFileSync('docker', ['rm', '--force', name], { stdio: 'ignore', timeout: 15_000 });
    } catch {}
  }
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact ${artifactPaths.length}-file P02-006 scope at ${commit}`);
console.log('PASS Rust policy: 8 inherited crates, 0 external/build-script/unsafe entries, native/Wasm/ASan strict checks');
console.log('PASS JavaScript policy: Biome 2.5.3 on 29 files and TypeScript on Node 22.23.1/24.18.0');
console.log('PASS dependency policy: 91 dev-only SHA-512 packages, 7 license forms, 2 denied scripts, 1 reviewed duplicate');
console.log('PASS behavior replay: 17 fixtures/313 steps, 382 assertions, 263 matrix rows, live MongoDB 16/16');
console.log('PASS 8 negative canaries: Biome, unsafe scanner/compiler, warnings, license, registry, lifecycle, live expectation');
console.log(`PASS documentation: ${markdownFiles.length} Markdown files, ${localLinks} local links`);
for (const file of artifactPaths) console.log(`ARTIFACT ${file} ${sha256(files[file])} ${files[file].length}`);
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

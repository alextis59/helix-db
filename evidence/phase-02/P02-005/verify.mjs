#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
if (!input) throw new Error('usage: node evidence/phase-02/P02-005/verify.mjs <commit>');

const scriptPath = fileURLToPath(import.meta.url);
const evidenceDirectory = path.dirname(scriptPath);
const manifest = JSON.parse(readFileSync(path.join(evidenceDirectory, 'manifest.json'), 'utf8'));
const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const gitText = (args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const gitBytes = (args) => execFileSync('git', args, { cwd: repository, maxBuffer: 64 * 1024 * 1024 });
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
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
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
  '.gitignore',
  'Cargo.toml',
  'README.md',
  'docs/README.md',
  'docs/architecture/build-profiles.md',
  'docs/architecture/javascript-toolchain-policy.md',
  'docs/architecture/repository-layout.md',
  'docs/architecture/rust-toolchain-policy.md',
  'package.json',
  'rust-toolchain.toml',
  'tests/README.md',
  'tests/toolchain/README.md',
  'tests/toolchain/check-browser-profile.mjs',
  'tests/toolchain/run-build-profile.mjs',
  'tsconfig.tools.json',
  'vite.config.ts',
];
const profileNames = ['dev', 'test', 'release', 'wasm', 'browser', 'sanitizer', 'coverage', 'bench'];
const runnerNames = ['native-debug', 'native-release', 'wasm', 'browser', 'sanitizer', 'coverage', 'benchmark'];
const expectedProfiles = {
  dev: {
    'opt-level': 0,
    debug: 2,
    'debug-assertions': true,
    'overflow-checks': true,
    lto: false,
    panic: 'unwind',
    incremental: true,
    'codegen-units': 256,
    strip: 'none',
  },
  test: {
    'opt-level': 0,
    debug: 2,
    'debug-assertions': true,
    'overflow-checks': true,
    lto: false,
    incremental: true,
    'codegen-units': 256,
    strip: 'none',
  },
  release: {
    'opt-level': 3,
    debug: 1,
    'debug-assertions': false,
    'overflow-checks': true,
    lto: 'thin',
    panic: 'unwind',
    incremental: false,
    'codegen-units': 1,
    strip: 'none',
  },
  wasm: {
    inherits: 'release',
    'opt-level': 's',
    debug: 1,
    lto: 'fat',
    panic: 'abort',
    'codegen-units': 1,
    strip: 'symbols',
  },
  browser: {
    inherits: 'release',
    'opt-level': 'z',
    debug: 1,
    lto: 'fat',
    panic: 'abort',
    'codegen-units': 1,
    strip: 'symbols',
  },
  sanitizer: {
    inherits: 'dev',
    'opt-level': 1,
    debug: 2,
    'debug-assertions': true,
    'overflow-checks': true,
    lto: false,
    incremental: false,
    'codegen-units': 1,
    strip: 'none',
  },
  coverage: {
    inherits: 'dev',
    'opt-level': 0,
    debug: 2,
    'debug-assertions': true,
    'overflow-checks': true,
    lto: false,
    incremental: false,
    'codegen-units': 1,
    strip: 'none',
  },
  bench: {
    'opt-level': 3,
    debug: 1,
    'debug-assertions': false,
    'overflow-checks': true,
    lto: 'thin',
    incremental: false,
    'codegen-units': 1,
    strip: 'none',
  },
};

const parseTomlScalar = (source) => {
  if (source === 'true') return true;
  if (source === 'false') return false;
  if (/^-?\d+$/.test(source)) return Number(source);
  if (source.startsWith('"') || source.startsWith('[')) return JSON.parse(source);
  throw new Error(`unsupported focused TOML value: ${source}`);
};
const parseProfiles = (source) => {
  const result = {};
  let active;
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    const section = /^\[profile\.([^\]]+)\]$/.exec(line);
    if (section) {
      active = section[1];
      result[active] = {};
      continue;
    }
    if (line.startsWith('[')) {
      active = undefined;
      continue;
    }
    if (!active || !line || line.startsWith('#')) continue;
    const assignment = /^([a-z-]+)\s*=\s*(.+)$/.exec(line);
    assert(assignment, `unparsed profile line: ${line}`);
    result[active][assignment[1]] = parseTomlScalar(assignment[2]);
  }
  return result;
};

assert(manifest.task_id === 'P02-005', 'evidence manifest task mismatch');
assert(manifest.commit === commit, 'evidence manifest commit mismatch');
assert(manifest.verdict === 'pass', 'evidence manifest verdict is not pass');
same(manifest.requirements, ['INV-003', 'INV-004', 'INV-007', 'PLAT-001', 'PLAT-002', 'PLAT-003', 'CORE-001', 'CORE-003', 'QUAL-001'], 'requirement inventory');
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

const cargoToml = showText('Cargo.toml');
const parsedProfiles = parseProfiles(cargoToml);
same(Object.keys(parsedProfiles), profileNames, 'Cargo profile section order/inventory');
same(parsedProfiles, expectedProfiles, 'Cargo profile properties');
for (const marker of [
  'build-profile-contract = "P02-005"',
  'build-profiles = ["dev", "release", "wasm", "browser", "sanitizer", "coverage", "bench"]',
  'sanitizer-target = "x86_64-unknown-linux-gnuasan"',
  'coverage-rustflags = "-C instrument-coverage"',
  'browser-js-target = "es2022"',
]) assert(cargoToml.includes(marker), `Cargo build metadata absent: ${marker}`);

const toolchain = showText('rust-toolchain.toml');
for (const marker of [
  'channel = "1.96.1"',
  'profile = "minimal"',
  'targets = ["wasm32-unknown-unknown", "wasm32-wasip2", "x86_64-unknown-linux-gnuasan"]',
]) assert(toolchain.includes(marker), `toolchain marker absent: ${marker}`);
assert(!toolchain.includes('nightly'), 'unversioned/nightly sanitizer toolchain introduced');

const packageJson = JSON.parse(showText('package.json'));
assert(packageJson.scripts['toolchain:types'] === 'tsc --build --pretty false && tsc --project tsconfig.tools.json --pretty false', 'tool type-check command mismatch');
assert(packageJson.scripts['toolchain:browser-profile'] === 'node tests/toolchain/check-browser-profile.mjs', 'browser-profile command mismatch');
same(JSON.parse(showText('tsconfig.tools.json')), {
  extends: './tsconfig.base.json',
  compilerOptions: { types: ['node'] },
  files: ['vite.config.ts'],
}, 'tool TypeScript configuration');

const vite = showText('vite.config.ts');
for (const marker of [
  "appType: 'custom'",
  "base: './'",
  'clearScreen: false',
  "envPrefix: 'HELIX_PUBLIC_'",
  'assetsInlineLimit: 0',
  'copyPublicDir: false',
  'emptyOutDir: true',
  "minify: 'oxc'",
  "outDir: 'dist/browser'",
  'reportCompressedSize: false',
  "sourcemap: 'hidden'",
  "target: 'es2022'",
]) assert(vite.includes(marker), `Vite build marker absent: ${marker}`);
assert(!/\b(?:input|lib|ssr)\s*:/.test(vite), 'Vite bundle input/SSR/library contract added prematurely');

const runner = showText('tests/toolchain/run-build-profile.mjs');
for (const name of runnerNames) assert(runner.includes(`'${name}'`), `runner profile absent: ${name}`);
for (const marker of [
  'process.argv.length !== 3',
  "CARGO_NET_OFFLINE: 'true'",
  "environment.RUSTFLAGS = '-C instrument-coverage'",
  "environment.LLVM_PROFILE_FILE = path.join(coverageDirectory, '%p-%m.profraw')",
  "--target', 'wasm32-wasip2'",
  "--target', 'wasm32-unknown-unknown'",
  "--target',\n      'x86_64-unknown-linux-gnuasan'",
  "'--all-features'",
  "'--frozen'",
  "throw new Error('coverage verification requires an unset RUSTFLAGS and CARGO_ENCODED_RUSTFLAGS')",
]) assert(runner.includes(marker), `runner safety marker absent: ${marker}`);
assert(!runner.includes('cargo bench'), 'benchmark profile runner executes benchmarks prematurely');

const browserChecker = showText('tests/toolchain/check-browser-profile.mjs');
for (const marker of [
  "assert.equal(config.appType, 'custom')",
  "assert.equal(config.envPrefix, 'HELIX_PUBLIC_')",
  "assert.equal(config.build.outDir, 'dist/browser')",
  'assert.equal(config.build.rolldownOptions.input, undefined)',
]) assert(browserChecker.includes(marker), `browser checker marker absent: ${marker}`);

const profilePolicy = showText('docs/architecture/build-profiles.md');
for (const marker of [
  'A passing profile proves only that the current boundary skeleton compiles',
  'Raw instrumentation only; no report, exclusion, or threshold claim',
  'No input exists; no bundle/browser support claim',
  'Sanitizer absence/unsupported host is reported explicitly',
  'Until those tasks close, `vite build` is intentionally not a passing command.',
  'https://doc.rust-lang.org/cargo/reference/profiles.html',
  'https://doc.rust-lang.org/nightly/rustc/platform-support/x86_64-unknown-linux-gnuasan.html',
  'https://doc.rust-lang.org/beta/rustc/instrument-coverage.html',
  'https://vite.dev/config/build-options.html',
]) assert(profilePolicy.includes(marker), `profile policy marker absent: ${marker}`);
assert(showText('.gitignore').includes('*.profraw') && showText('.gitignore').includes('*.profdata'), 'coverage artifacts not ignored');
assert(showText('.github/CODEOWNERS').includes('/vite.config.ts @alextis59'), 'Vite config ownership absent');

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', commit]).trim().split('\n').filter(Boolean);
const generatedPath = /(^|\/)(target|node_modules|dist|coverage|coverage-profiles|playwright-report|test-results|blob-report|\.vitest|\.vite)(\/|$)/;
same(trackedFiles.filter((file) => generatedPath.test(file) || /\.(?:profraw|profdata|tsbuildinfo|tgz)$/.test(file)), [], 'tracked generated-output inventory');

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
assert(markdownFiles.length === 123, `Markdown inventory mismatch: ${markdownFiles.length}`);
assert(localLinks === 782, `local link count mismatch: ${localLinks}`);

const walk = (root) => {
  if (!existsSync(root)) return [];
  const output = [];
  for (const name of readdirSync(root)) {
    const entry = path.join(root, name);
    if (statSync(entry).isDirectory()) output.push(...walk(entry));
    else output.push(entry);
  }
  return output;
};
const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-005-'));
try {
  const archive = gitBytes(['archive', '--format=tar', commit]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const run = (program, args, options = {}) => execFileSync(program, args, {
    cwd: temporary,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 240_000,
    ...options,
  });

  const installedTargets = run('rustup', ['target', 'list', '--installed']).trim().split('\n');
  for (const target of ['wasm32-unknown-unknown', 'wasm32-wasip2', 'x86_64-unknown-linux-gnuasan']) {
    assert(installedTargets.includes(target), `installed target absent: ${target}`);
  }

  const packageLockBefore = sha256(readFileSync(path.join(temporary, 'package-lock.json')));
  const nvm = path.join(os.homedir(), '.nvm', 'nvm.sh');
  assert(existsSync(nvm), 'NVM installation absent for supported Node-lane replay');
  for (const version of ['22.23.1', '24.18.0']) {
    const prefix = `source "${nvm}" && nvm exec ${version}`;
    const nodeVersion = run('bash', ['-lc', `${prefix} node --version`]);
    assert(nodeVersion.includes(`v${version}`), `Node lane version mismatch: ${version}`);
    run('bash', ['-lc', `${prefix} corepack npm ci --ignore-scripts`]);
    run('bash', ['-lc', `${prefix} corepack npm run toolchain:types`]);
    const browser = run('bash', ['-lc', `${prefix} corepack npm run toolchain:browser-profile`]);
    assert(browser.includes('PASS browser profile:'), `browser profile failed on Node ${version}`);
    assert(!existsSync(path.join(temporary, 'dist')), `browser config check emitted a bundle on Node ${version}`);
    assert(sha256(readFileSync(path.join(temporary, 'package-lock.json'))) === packageLockBefore, `package lock drifted on Node ${version}`);
  }

  const runnerPath = path.join(temporary, 'tests/toolchain/run-build-profile.mjs');
  for (const args of [[], ['unknown'], ['native-debug', 'extra']]) {
    let failed = false;
    try {
      run(process.execPath, [runnerPath, ...args], { stdio: 'pipe' });
    } catch {
      failed = true;
    }
    assert(failed, `runner accepted invalid arguments: ${args.join(' ')}`);
  }

  const outputs = {};
  for (const profile of runnerNames) {
    outputs[profile] = run(process.execPath, [runnerPath, profile]);
    assert(outputs[profile].includes(`PASS build profile ${profile}`), `${profile}: runner pass marker absent`);
  }
  assert([...outputs.sanitizer.matchAll(/^test .* \.\.\. ok$/gm)].length === 9, 'sanitizer test count mismatch');
  assert([...outputs.coverage.matchAll(/^test .* \.\.\. ok$/gm)].length === 9, 'coverage test count mismatch');
  assert(outputs.coverage.includes('(8 raw coverage profiles)'), 'coverage raw-profile count marker mismatch');

  for (const directory of [
    'target/debug',
    'target/release',
    'target/wasm32-wasip2/wasm',
    'target/wasm32-unknown-unknown/browser',
    'target/x86_64-unknown-linux-gnuasan/sanitizer',
    'target/coverage',
  ]) assert(existsSync(path.join(temporary, directory)), `profile output directory absent: ${directory}`);
  assert(walk(path.join(temporary, 'target/wasm32-wasip2/wasm')).some((file) => file.endsWith('.rlib')), 'WASIp2 profile produced no Rust library artifact');
  assert(walk(path.join(temporary, 'target/wasm32-unknown-unknown/browser')).some((file) => file.endsWith('.rlib')), 'browser Wasm profile produced no Rust library artifact');

  const coverageProfiles = walk(path.join(temporary, 'target/coverage-profiles')).filter((file) => file.endsWith('.profraw'));
  assert(coverageProfiles.length === 8, `raw coverage profile count mismatch: ${coverageProfiles.length}`);
  assert(coverageProfiles.every((file) => statSync(file).size > 0), 'empty raw coverage profile present');
  assert(new Set(coverageProfiles.map((file) => path.basename(file))).size === 8, 'raw coverage profile names collided');

  const asanBinary = walk(path.join(temporary, 'target/x86_64-unknown-linux-gnuasan/sanitizer/deps'))
    .find((file) => path.basename(file).startsWith('helix_doc-') && (statSync(file).mode & 0o111));
  assert(asanBinary, 'ASan test executable absent');
  const symbols = run('readelf', ['-Ws', asanBinary]);
  assert(symbols.includes('__asan_init'), 'ASan initialization symbol absent');
  assert(symbols.includes('__asan_version_mismatch_check'), 'ASan version-check symbol absent');
  assert(!existsSync(path.join(temporary, 'dist')), 'a JavaScript/browser bundle was emitted unexpectedly');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact ${artifactPaths.length}-file P02-005 scope at ${commit}`);
console.log(`PASS Cargo profiles: ${profileNames.length} sections, ${runnerNames.length} bounded executions`);
console.log('PASS native/Wasm/benchmark builds and ASan: 9 tests with instrumented standard library symbols');
console.log('PASS coverage: 9 tests, 8 unique non-empty raw profiles; no report/threshold claim');
console.log('PASS browser config/types on Node 22.23.1 and 24.18.0; 0 bundle inputs/outputs');
console.log(`PASS documentation: ${markdownFiles.length} Markdown files, ${localLinks} local links`);
for (const file of artifactPaths) console.log(`ARTIFACT ${file} ${sha256(files[file])} ${files[file].length}`);
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

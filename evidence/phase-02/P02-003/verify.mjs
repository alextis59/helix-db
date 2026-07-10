#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
if (!input) throw new Error('usage: node evidence/phase-02/P02-003/verify.mjs <commit>');

const scriptPath = fileURLToPath(import.meta.url);
const evidenceDirectory = path.dirname(scriptPath);
const manifest = JSON.parse(readFileSync(path.join(evidenceDirectory, 'manifest.json'), 'utf8'));
const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const gitText = (args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' });
const gitBytes = (args) => execFileSync('git', args, { cwd: repository });
const commit = gitText(['rev-parse', `${input}^{commit}`]).trim();
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const showBytes = (file) => gitBytes(['show', `${commit}:${file}`]);
const showText = (file) => new TextDecoder('utf-8', { fatal: true }).decode(showBytes(file));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};
const sorted = (values) => [...values].sort();

const artifactPaths = [
  '.github/CODEOWNERS',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  'README.md',
  'docs/README.md',
  'docs/architecture/javascript-toolchain-policy.md',
  'package-lock.json',
  'package.json',
  'tsconfig.base.json',
  'tsconfig.json',
];
const directDependencies = {
  '@playwright/test': '1.61.1',
  '@types/node': '22.20.1',
  typescript: '6.0.3',
  vite: '8.1.4',
  vitest: '4.1.10',
};
const directIntegrity = {
  '@playwright/test': 'sha512-8nKv6+0RJSL9FE4jYOEGXnPeM/Hg12qZpmqzZjRh3qM0Y7c3z1mrOTfFLids72RDQYVh9WpLEfR5WdpNX4fkig==',
  '@types/node': 'sha512-EANqOCF9QFyra+4pfxUcX9STKJpCLjMbObVzljIJomAWSnuSIEAvyzEU53GaajbXJEgdh0iEcPL+DGvpUd4k1Q==',
  typescript: 'sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==',
  vite: 'sha512-bTT9PsdWO+MQMNG9ZXIP/qM9wGh37DFxTV/sPq9cFpHr3w4jkgef032PkAL9jAqhk3Nz8NQw3O8n6/xFkqO4QQ==',
  vitest: 'sha512-R9jUTe5S4Qb0HCd4TNqpC7oGcrMssMRGXLW80ubjWsW9VH5GF8y1Y0SFLY9AbqSk6nt0PnOx4H4WNJYZ13GUPw==',
};

assert(manifest.task_id === 'P02-003', 'evidence manifest task mismatch');
assert(manifest.commit === commit, 'evidence manifest commit mismatch');
assert(manifest.verdict === 'pass', 'evidence manifest verdict is not pass');
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

const packageJson = JSON.parse(files['package.json']);
assert(packageJson.name === '@helix-db-internal/workspace', 'package identity mismatch');
assert(packageJson.version === '0.0.0' && packageJson.private === true, 'private package boundary mismatch');
assert(packageJson.type === 'module' && packageJson.license === 'MIT', 'package module/license mismatch');
assert(
  packageJson.packageManager === 'npm@11.18.0+sha512.4faecce0be70366d1c67b1012c4adc1246354a6cc45bf589f92003073b05518d547403df1475c542d67a4845e22b4fafcd7cac0af02c7a96cc6814f09eb003fb',
  'package-manager identity/integrity mismatch',
);
same(packageJson.engines, {
  node: '>=22.12.0 <23 || >=24.11.0 <25',
  npm: '11.18.0',
}, 'package engines');
same(packageJson.devEngines, {
  runtime: { name: 'node', version: '>=22.12.0 <23 || >=24.11.0 <25', onFail: 'error' },
  packageManager: { name: 'npm', version: '11.18.0', onFail: 'error' },
}, 'development engines');
same(packageJson.workspaces, ['packages/*'], 'workspace glob');
same(packageJson.devDependencies, directDependencies, 'direct development dependencies');
same(packageJson.scripts, {
  'toolchain:types': 'tsc --build --pretty false',
  'toolchain:test-runner': 'vitest run --passWithNoTests',
  'toolchain:browser-harness': 'playwright test --list --pass-with-no-tests',
}, 'toolchain smoke scripts');

const npmrc = files['.npmrc'].toString('utf8').trim().split('\n');
same(npmrc, [
  'engine-strict=true',
  'package-lock=true',
  'lockfile-version=3',
  'save-exact=true',
  'audit=false',
  'fund=false',
], '.npmrc policy');
assert(files['.nvmrc'].toString('utf8') === '22.23.1\n', '.nvmrc baseline mismatch');

const baseConfig = JSON.parse(files['tsconfig.base.json']);
same(baseConfig.compilerOptions, {
  target: 'ES2022',
  lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  module: 'ESNext',
  moduleResolution: 'Bundler',
  strict: true,
  noEmit: true,
  verbatimModuleSyntax: true,
  isolatedModules: true,
  noUncheckedIndexedAccess: true,
  exactOptionalPropertyTypes: true,
  noUncheckedSideEffectImports: true,
  forceConsistentCasingInFileNames: true,
  skipLibCheck: false,
  types: [],
}, 'TypeScript base options');
same(JSON.parse(files['tsconfig.json']), {
  extends: './tsconfig.base.json',
  files: [],
  references: [],
}, 'TypeScript root build graph');

const lock = JSON.parse(files['package-lock.json']);
assert(lock.name === packageJson.name && lock.version === packageJson.version, 'lock identity mismatch');
assert(lock.lockfileVersion === 3 && lock.requires === true, 'lockfile version mismatch');
assert(Object.keys(lock.packages).length === 83, `lock package count mismatch: ${Object.keys(lock.packages).length}`);
same(lock.packages[''].devDependencies, directDependencies, 'lock direct dependencies');
same(lock.packages[''].engines, packageJson.engines, 'lock engines');
same(lock.packages[''].workspaces, ['packages/*'], 'lock workspaces');
const registryEntries = Object.entries(lock.packages).filter(([name]) => name !== '');
assert(registryEntries.length === 82, 'registry package count mismatch');
for (const [name, entry] of registryEntries) {
  assert(entry.resolved?.startsWith('https://registry.npmjs.org/'), `${name}: noncanonical registry source`);
  assert(entry.integrity?.startsWith('sha512-'), `${name}: integrity absent`);
}
for (const [name, version] of Object.entries(directDependencies)) {
  const entry = lock.packages[`node_modules/${name}`];
  assert(entry.version === version, `${name}: resolved direct version mismatch`);
  assert(entry.integrity === directIntegrity[name], `${name}: direct integrity mismatch`);
}
const installScripts = registryEntries
  .filter(([, entry]) => entry.hasInstallScript)
  .map(([name, entry]) => ({ name, optional: entry.optional, os: entry.os }))
  .sort(({ name: left }, { name: right }) => left.localeCompare(right));
same(installScripts, [
  { name: 'node_modules/fsevents', optional: true, os: ['darwin'] },
  { name: 'node_modules/vite/node_modules/fsevents', optional: true, os: ['darwin'] },
], 'install-script inventory');

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', commit]).trim().split('\n').filter(Boolean);
for (const forbidden of ['npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']) {
  assert(!trackedFiles.some((file) => file === forbidden || file.endsWith(`/${forbidden}`)), `alternate lockfile present: ${forbidden}`);
}
assert(trackedFiles.filter((file) => file === 'package-lock.json' || file.endsWith('/package-lock.json')).length === 1, 'root-only package-lock policy mismatch');

const policy = files['docs/architecture/javascript-toolchain-policy.md'].toString('utf8');
for (const marker of [
  'Status: Accepted toolchain baseline',
  'Node 22 LTS',
  'Node 24 LTS',
  'Node 26 Current',
  'Why TypeScript 6, not TypeScript 7 yet',
  'Chromium, Firefox, and WebKit',
  'two optional `fsevents` install-script entries',
  'No UI framework is selected',
]) assert(policy.includes(marker), `JavaScript policy marker absent: ${marker}`);
for (const url of [
  'https://nodejs.org/en/about/previous-releases',
  'https://nodejs.org/en/blog/migrations/v22-to-v24',
  'https://docs.npmjs.com/cli/v11/commands/npm-ci/',
  'https://vite.dev/guide/',
  'https://vitest.dev/guide/why.html',
  'https://playwright.dev/docs/browsers',
  'https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/',
]) assert(policy.includes(url), `official source link absent: ${url}`);

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
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)));
    assert(target !== '..' && !target.startsWith('../'), `${file}: local link escapes repository: ${rawTarget}`);
    gitText(['cat-file', '-e', `${commit}:${target}`]);
    localLinks += 1;
  }
}
assert(markdownFiles.length === 93, `Markdown inventory mismatch: ${markdownFiles.length}`);
assert(localLinks === 731, `local link count mismatch: ${localLinks}`);

const nvmScript = path.join(os.homedir(), '.nvm', 'nvm.sh');
assert(existsSync(nvmScript), 'NVM script absent from recorded evidence environment');
const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-003-'));
try {
  for (const file of ['.npmrc', '.nvmrc', 'package-lock.json', 'package.json', 'tsconfig.base.json', 'tsconfig.json']) {
    writeFileSync(path.join(temporary, file), files[file]);
  }
  const environment = {
    ...process.env,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
  };
  const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const runNvm = (version, command) => execFileSync(
    'bash',
    ['-lc', `source ${shellQuote(nvmScript)} && nvm exec ${shellQuote(version)} ${command}`],
    {
      cwd: temporary,
      encoding: 'utf8',
      env: environment,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 180_000,
    },
  );
  const lockHash = sha256(readFileSync(path.join(temporary, 'package-lock.json')));
  for (const version of ['22.23.1', '24.18.0']) {
    const nodeVersion = runNvm(version, 'node --version');
    assert(nodeVersion.includes(`v${version}`), `Node ${version}: version mismatch`);
    assert(runNvm(version, 'corepack npm --version').includes('11.18.0'), `Node ${version}: npm pin mismatch`);
    runNvm(version, 'corepack npm ci --ignore-scripts');
    assert(sha256(readFileSync(path.join(temporary, 'package-lock.json'))) === lockHash, `Node ${version}: npm ci changed lock`);
    assert(runNvm(version, 'corepack npm exec -- tsc --version').includes('Version 6.0.3'), `Node ${version}: TypeScript version mismatch`);
    assert(runNvm(version, 'corepack npm exec -- vite --version').includes('vite/8.1.4'), `Node ${version}: Vite version mismatch`);
    assert(runNvm(version, 'corepack npm exec -- vitest --version').includes('vitest/4.1.10'), `Node ${version}: Vitest version mismatch`);
    assert(runNvm(version, 'corepack npm exec -- playwright --version').includes('Version 1.61.1'), `Node ${version}: Playwright version mismatch`);
    runNvm(version, 'corepack npm run toolchain:types');
    const vitest = runNvm(version, 'corepack npm run toolchain:test-runner');
    assert(vitest.includes('No test files found, exiting with code 0'), `Node ${version}: Vitest empty-run smoke mismatch`);
    const playwright = runNvm(version, 'corepack npm run toolchain:browser-harness');
    assert(playwright.includes('Total: 0 tests in 0 files'), `Node ${version}: Playwright list smoke mismatch`);
    const treeOutput = runNvm(version, 'corepack npm ls --all --json');
    const tree = JSON.parse(treeOutput.slice(treeOutput.indexOf('{')));
    same(tree.problems ?? [], [], `Node ${version}: npm dependency problems`);
  }
  const repositoryBrowserCaches = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const target = path.join(directory, entry.name);
      if (entry.name.includes('ms-playwright')) repositoryBrowserCaches.push(target);
      if (entry.isDirectory()) walk(target);
    }
  };
  walk(temporary);
  same(repositoryBrowserCaches, [], 'repository Playwright browser cache');
  assert(statSync(path.join(temporary, 'package-lock.json')).size === files['package-lock.json'].length, 'lock byte count changed during replay');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact ${artifactPaths.length}-file P02-003 scope at ${commit}`);
console.log('PASS npm lock: version 3, 83 entries, 82 SHA-512 registry integrities, 5 exact direct tools');
console.log('PASS lifecycle inventory: 2 optional Darwin fsevents scripts, both suppressed during evidence installs');
console.log('PASS Node 22.23.1 and 24.18.0: npm ci, lock stability, type/test/browser-harness smokes');
console.log('PASS tools: npm 11.18.0, TypeScript 6.0.3, Vite 8.1.4, Vitest 4.1.10, Playwright 1.61.1');
console.log('PASS package boundary: private internal identity, one root npm lock, no alternate locks/browser cache');
console.log(`PASS documentation: ${markdownFiles.length} Markdown files, ${localLinks} local links`);
for (const file of artifactPaths) console.log(`ARTIFACT ${file} ${sha256(files[file])} ${files[file].length}`);
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

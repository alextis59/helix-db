#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
if (!input) throw new Error('usage: node evidence/phase-02/P02-004/verify.mjs <commit>');

const scriptPath = fileURLToPath(import.meta.url);
const evidenceDirectory = path.dirname(scriptPath);
const manifest = JSON.parse(readFileSync(path.join(evidenceDirectory, 'manifest.json'), 'utf8'));
const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const gitText = (args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' });
const gitBytes = (args) => execFileSync('git', args, { cwd: repository, maxBuffer: 64 * 1024 * 1024 });
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

const requiredRoots = [
  'crates',
  'shaders',
  'packages',
  'conformance',
  'benchmarks',
  'tests',
  'docs',
  'examples',
  'evidence/releases',
];
const reservedChildren = [
  'shaders/predicates',
  'shaders/bitmaps',
  'shaders/vectors',
  'packages/sdk-typescript',
  'packages/browser-host',
  'conformance/semantics',
  'conformance/formats',
  'conformance/host',
  'conformance/compatibility',
  'benchmarks/datasets',
  'benchmarks/cpu-columnar',
  'benchmarks/webgpu',
  'benchmarks/reports',
  'tests/crash',
  'tests/differential',
  'tests/browser',
  'tests/distributed',
];
const boundaryReadmes = [
  'crates/README.md',
  'shaders/README.md',
  'shaders/predicates/README.md',
  'shaders/bitmaps/README.md',
  'shaders/vectors/README.md',
  'packages/README.md',
  'packages/sdk-typescript/README.md',
  'packages/browser-host/README.md',
  'conformance/README.md',
  'conformance/semantics/README.md',
  'conformance/formats/README.md',
  'conformance/host/README.md',
  'conformance/compatibility/README.md',
  'benchmarks/README.md',
  'benchmarks/datasets/README.md',
  'benchmarks/cpu-columnar/README.md',
  'benchmarks/webgpu/README.md',
  'benchmarks/reports/README.md',
  'tests/README.md',
  'tests/crash/README.md',
  'tests/differential/README.md',
  'tests/browser/README.md',
  'tests/distributed/README.md',
  'examples/README.md',
  'evidence/releases/README.md',
];
const artifactPaths = [
  '.github/CODEOWNERS',
  'README.md',
  'benchmarks/README.md',
  'benchmarks/cpu-columnar/README.md',
  'benchmarks/datasets/README.md',
  'benchmarks/reports/README.md',
  'benchmarks/webgpu/README.md',
  'conformance/README.md',
  'conformance/compatibility/README.md',
  'conformance/formats/README.md',
  'conformance/host/README.md',
  'conformance/semantics/README.md',
  'crates/README.md',
  'docs/README.md',
  'docs/architecture/repository-layout.md',
  'evidence/releases/README.md',
  'examples/README.md',
  'packages/README.md',
  'packages/browser-host/README.md',
  'packages/sdk-typescript/README.md',
  'shaders/README.md',
  'shaders/bitmaps/README.md',
  'shaders/predicates/README.md',
  'shaders/vectors/README.md',
  'tests/README.md',
  'tests/browser/README.md',
  'tests/crash/README.md',
  'tests/differential/README.md',
  'tests/distributed/README.md',
];

assert(manifest.task_id === 'P02-004', 'evidence manifest task mismatch');
assert(manifest.commit === commit, 'evidence manifest commit mismatch');
assert(manifest.verdict === 'pass', 'evidence manifest verdict is not pass');
same(manifest.requirements, ['INV-001', 'INV-006', 'INV-007', 'CORE-003', 'QUAL-001'], 'requirement inventory');
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

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', commit]).trim().split('\n').filter(Boolean);
for (const root of requiredRoots) {
  assert(trackedFiles.some((file) => file.startsWith(`${root}/`)), `${root}: required tracked root absent`);
}
for (const child of reservedChildren) {
  assert(trackedFiles.includes(`${child}/README.md`), `${child}: tracked boundary contract absent`);
}
assert(boundaryReadmes.length === 25, 'boundary README inventory definition drift');
for (const readme of boundaryReadmes) {
  assert(trackedFiles.includes(readme), `${readme}: boundary README absent`);
}

const codeowners = showText('.github/CODEOWNERS');
for (const marker of [
  '/crates/',
  '/shaders/',
  '/packages/',
  '/conformance/',
  '/benchmarks/',
  '/tests/',
  '/examples/',
  '/evidence/releases/',
]) assert(codeowners.includes(`${marker} @alextis59`), `CODEOWNERS marker absent: ${marker}`);

const layout = showText('docs/architecture/repository-layout.md');
for (const marker of [
  'A tracked directory proves only that its boundary exists.',
  '**Source is not evidence.**',
  '**Conformance has one canonical input.**',
  '**Packages are private until proven.**',
  '**Shaders are internal.**',
  '**Benchmarks do not create claims.**',
  '**Examples disclose maturity.**',
  'Empty future areas remain tracked by a README',
]) assert(layout.includes(marker), `layout policy marker absent: ${marker}`);
for (const root of requiredRoots) {
  const marker = `[\`${root}/\`]`;
  assert(layout.includes(marker), `layout root missing from table: ${root}`);
}
assert(showText('conformance/README.md').includes('must not fork it into a second mutable copy'), 'canonical conformance corpus rule absent');
assert(showText('packages/README.md').includes('intentionally have no `package.json`'), 'reserved package non-publication rule absent');
assert(showText('shaders/README.md').includes('no kernel, GPU capability, or performance result is implemented or claimed'), 'shader maturity boundary absent');
assert(showText('examples/README.md').includes('No example exists yet'), 'example maturity boundary absent');
assert(showText('evidence/releases/README.md').includes('No release candidate, package, or production-readiness claim exists yet'), 'release maturity boundary absent');

const packageFiles = trackedFiles.filter((file) => file.startsWith('packages/'));
same(packageFiles, sorted([
  'packages/README.md',
  'packages/browser-host/README.md',
  'packages/sdk-typescript/README.md',
]), 'reserved package file inventory');
assert(!packageFiles.some((file) => file.endsWith('/package.json')), 'reserved package became an npm workspace');
const shaderFiles = trackedFiles.filter((file) => file.startsWith('shaders/'));
same(shaderFiles, sorted([
  'shaders/README.md',
  'shaders/bitmaps/README.md',
  'shaders/predicates/README.md',
  'shaders/vectors/README.md',
]), 'shader file inventory');
assert(!shaderFiles.some((file) => file.endsWith('.wgsl')), 'shader implementation added during layout task');
same(trackedFiles.filter((file) => file.startsWith('evidence/releases/')), ['evidence/releases/README.md'], 'release artifact inventory');
assert(trackedFiles.filter((file) => file.startsWith('conformance/semantics/')).length === 1, 'semantic corpus duplicated under conformance');

const generatedPath = /(^|\/)(target|node_modules|dist|coverage|playwright-report|test-results|blob-report|\.vitest|\.vite)(\/|$)/;
const generatedFiles = trackedFiles.filter((file) => generatedPath.test(file) || /\.(?:tsbuildinfo|tgz)$/.test(file));
same(generatedFiles, [], 'tracked generated-output inventory');

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
assert(markdownFiles.length === 120, `Markdown inventory mismatch: ${markdownFiles.length}`);
assert(localLinks === 765, `local link count mismatch: ${localLinks}`);

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-004-'));
try {
  const archive = gitBytes(['archive', '--format=tar', commit]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const run = (program, args, options = {}) => execFileSync(program, args, {
    cwd: temporary,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
    ...options,
  });
  const packageLockBefore = sha256(readFileSync(path.join(temporary, 'package-lock.json')));
  run('corepack', ['npm', 'ci', '--ignore-scripts']);
  const workspaces = JSON.parse(run('corepack', ['npm', 'query', '.workspace', '--json']));
  same(workspaces, [], 'npm child workspace inventory');
  run('corepack', ['npm', 'run', 'toolchain:types']);
  assert(sha256(readFileSync(path.join(temporary, 'package-lock.json'))) === packageLockBefore, 'package-lock.json drifted during replay');

  const environment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  const cargoLockBefore = sha256(readFileSync(path.join(temporary, 'Cargo.lock')));
  const metadata = JSON.parse(run('cargo', ['metadata', '--frozen', '--format-version', '1', '--no-deps'], { env: environment }));
  assert(metadata.workspace_members.length === 8, `Rust workspace package count mismatch: ${metadata.workspace_members.length}`);
  assert(metadata.packages.every(({ publish }) => JSON.stringify(publish) === '[]'), 'publishable Rust package present');
  const tests = run('cargo', ['test', '--frozen', '--workspace', '--all-features'], { env: environment });
  const passedTests = [...tests.matchAll(/^test .* \.\.\. ok$/gm)].length;
  assert(passedTests === 9, `Rust all-feature test count mismatch: ${passedTests}`);
  assert(sha256(readFileSync(path.join(temporary, 'Cargo.lock'))) === cargoLockBefore, 'Cargo.lock drifted during replay');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact ${artifactPaths.length}-file P02-004 scope at ${commit}`);
console.log(`PASS layout: ${requiredRoots.length} required roots, ${boundaryReadmes.length} tracked contracts, ${reservedChildren.length} reserved children`);
console.log('PASS maturity boundaries: 0 child npm workspaces, 0 shader implementations, 0 release artifacts');
console.log('PASS clean replay: npm install/types and 8-package Cargo metadata/9 all-feature tests');
console.log(`PASS documentation: ${markdownFiles.length} Markdown files, ${localLinks} local links`);
for (const file of artifactPaths) console.log(`ARTIFACT ${file} ${sha256(files[file])} ${files[file].length}`);
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

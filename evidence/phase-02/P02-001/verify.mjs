#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
if (!input) throw new Error('usage: node evidence/phase-02/P02-001/verify.mjs <commit>');

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
const artifactPaths = [
  '.github/CODEOWNERS',
  '.gitignore',
  'Cargo.lock',
  'Cargo.toml',
  'README.md',
  ...crateNames.flatMap((name) => [
    `crates/${name}/Cargo.toml`,
    `crates/${name}/src/lib.rs`,
  ]),
  'docs/README.md',
  'docs/architecture/workspace-boundaries.md',
];
const expectedEdges = {
  'helix-columnar': [['helix-doc', false], ['helix-query', false]],
  'helix-core': [
    ['helix-columnar', false],
    ['helix-doc', false],
    ['helix-query', false],
    ['helix-storage', false],
  ],
  'helix-doc': [],
  'helix-gpu': [
    ['helix-columnar', false],
    ['helix-doc', false],
    ['helix-query', false],
  ],
  'helix-host-native': [['helix-core', false], ['helix-gpu', true]],
  'helix-query': [['helix-doc', false]],
  'helix-server': [['helix-host-native', false]],
  'helix-storage': [['helix-doc', false]],
};

assert(manifest.task_id === 'P02-001', 'evidence manifest task mismatch');
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
for (const artifact of manifest.artifacts) {
  const bytes = files[artifact.path];
  assert(bytes, `manifest artifact is outside exact scope: ${artifact.path}`);
  assert(bytes.length === artifact.bytes, `${artifact.path}: byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: hash mismatch`);
}
assert(manifest.artifacts.length === artifactPaths.length, 'manifest artifact count mismatch');
assert(new Set(manifest.artifacts.map(({ path: file }) => file)).size === artifactPaths.length, 'duplicate manifest artifact');

const rootManifest = files['Cargo.toml'].toString('utf8');
for (const marker of [
  'resolver = "2"',
  'edition = "2024"',
  'publish = false',
  'plan-item = "P02-001"',
  'status = "boundary-skeleton"',
  'database-functionality = false',
  'public-release = false',
]) assert(rootManifest.includes(marker), `root Cargo marker absent: ${marker}`);
assert(files['.gitignore'].toString('utf8').includes('/target/'), 'root Cargo target is not ignored');
for (const marker of ['/crates/', '/Cargo.toml', '/Cargo.lock']) {
  assert(files['.github/CODEOWNERS'].toString('utf8').includes(marker), `CODEOWNERS marker absent: ${marker}`);
}
const boundaryDocument = files['docs/architecture/workspace-boundaries.md'].toString('utf8');
for (const marker of [
  'Implemented boundary skeleton; no database functionality',
  'The graph is acyclic',
  'GPU integration is disabled by default',
  'The portable core has no dependency on native hosts, the server, or GPU code',
  'External dependencies are intentionally absent at this step',
]) assert(boundaryDocument.includes(marker), `boundary document marker absent: ${marker}`);
for (const crate of crateNames) {
  const cargo = files[`crates/${crate}/Cargo.toml`].toString('utf8');
  const library = files[`crates/${crate}/src/lib.rs`].toString('utf8');
  for (const marker of [
    `name = "${crate}"`,
    'publish.workspace = true',
    'status = "boundary-skeleton"',
    'database-functionality = false',
  ]) assert(cargo.includes(marker), `${crate}: Cargo marker absent: ${marker}`);
  assert(library.includes(`pub const COMPONENT_NAME: &str = "${crate}";`), `${crate}: component marker absent`);
  assert(library.includes('pub const MATURITY: &str = "boundary-skeleton";'), `${crate}: maturity marker absent`);
  assert(/No .*?Phase 2[.,]/s.test(library), `${crate}: non-functionality statement absent`);
  assert(!/\bunsafe\b|std::(?:fs|net|process)|tokio|wgpu|wasmtime/.test(library), `${crate}: ambient/runtime implementation marker present`);
}

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', commit]).trim().split('\n').filter(Boolean);
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
assert(markdownFiles.length === 89, `Markdown inventory mismatch: ${markdownFiles.length}`);
assert(localLinks === 705, `local link count mismatch: ${localLinks}`);

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-001-'));
try {
  for (const file of artifactPaths.filter((entry) => entry === 'Cargo.toml' || entry === 'Cargo.lock' || entry.startsWith('crates/'))) {
    const target = path.join(temporary, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, files[file]);
  }
  const environment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  const run = (program, args, options = {}) => execFileSync(program, args, {
    cwd: temporary,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
    ...options,
  });
  const metadata = JSON.parse(run('cargo', ['metadata', '--frozen', '--format-version', '1', '--no-deps']));
  const packages = Object.fromEntries(metadata.packages.map((entry) => [entry.name, entry]));
  same(sorted(Object.keys(packages)), crateNames, 'workspace package inventory');
  assert(metadata.workspace_members.length === 8, 'workspace member count mismatch');
  let directEdges = 0;
  let optionalEdges = 0;
  for (const crate of crateNames) {
    const pkg = packages[crate];
    assert(pkg.version === '0.0.0', `${crate}: version mismatch`);
    assert(pkg.edition === '2024', `${crate}: edition mismatch`);
    same(pkg.publish, [], `${crate}: publish policy`);
    assert(pkg.license === 'MIT', `${crate}: license mismatch`);
    assert(pkg.repository === 'https://github.com/alextis59/helix-db', `${crate}: repository mismatch`);
    assert(pkg.metadata?.helix?.status === 'boundary-skeleton', `${crate}: metadata status mismatch`);
    assert(pkg.metadata?.helix?.['database-functionality'] === false, `${crate}: functionality metadata mismatch`);
    const internalDependencies = pkg.dependencies
      .filter(({ name }) => name.startsWith('helix-'))
      .map(({ name, optional }) => [name, optional])
      .sort(([left], [right]) => left.localeCompare(right));
    same(internalDependencies, expectedEdges[crate], `${crate}: direct dependency edges`);
    assert(pkg.dependencies.every(({ source, path: dependencyPath }) => source === null && dependencyPath.startsWith(temporary)), `${crate}: external dependency present`);
    directEdges += internalDependencies.length;
    optionalEdges += internalDependencies.filter(([, optional]) => optional).length;
  }
  assert(directEdges === 14 && optionalEdges === 1, 'edge counts mismatch');
  same(packages['helix-host-native'].features, { default: [], gpu: ['dep:helix-gpu'] }, 'native host features');
  same(packages['helix-server'].features, { default: [], gpu: ['helix-host-native/gpu'] }, 'server features');

  const visiting = new Set();
  const visited = new Set();
  const visit = (crate) => {
    assert(!visiting.has(crate), `dependency cycle at ${crate}`);
    if (visited.has(crate)) return;
    visiting.add(crate);
    for (const [dependency] of expectedEdges[crate]) visit(dependency);
    visiting.delete(crate);
    visited.add(crate);
  };
  for (const crate of crateNames) visit(crate);
  for (const forbidden of ['helix-gpu', 'helix-host-native', 'helix-server']) {
    assert(!expectedEdges['helix-core'].some(([dependency]) => dependency === forbidden), `portable core forbidden edge: ${forbidden}`);
  }
  for (const forbidden of ['helix-core', 'helix-host-native', 'helix-server', 'helix-storage']) {
    assert(!expectedEdges['helix-gpu'].some(([dependency]) => dependency === forbidden), `GPU forbidden edge: ${forbidden}`);
  }

  run('cargo', ['fmt', '--all', '--', '--check']);
  run('cargo', ['check', '--frozen', '--workspace', '--all-targets']);
  run('cargo', ['check', '--frozen', '--workspace', '--all-targets', '--all-features']);
  const defaultTests = run('cargo', ['test', '--frozen', '--workspace']);
  const allFeatureTests = run('cargo', ['test', '--frozen', '--workspace', '--all-features']);
  const countPassedTests = (output) => [...output.matchAll(/^test .* \.\.\. ok$/gm)].length;
  assert(countPassedTests(defaultTests) === 8, 'default-feature test count mismatch');
  assert(countPassedTests(allFeatureTests) === 9, 'all-feature test count mismatch');
  run('cargo', ['doc', '--frozen', '--workspace', '--no-deps', '--all-features'], {
    env: { ...environment, RUSTDOCFLAGS: '-D warnings' },
  });
  assert(sha256(readFileSync(path.join(temporary, 'Cargo.lock'))) === sha256(files['Cargo.lock']), 'Cargo.lock drifted during replay');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact ${artifactPaths.length}-file P02-001 scope at ${commit}`);
console.log('PASS workspace metadata: 8 unpublished 0.0.0 boundary skeletons, 14 direct edges, 1 optional edge');
console.log('PASS dependency policy: 0 external dependencies, 0 cycles, portable core excludes host/server/GPU');
console.log('PASS Cargo: frozen default/all-feature checks, 8/9 tests, rustfmt, warning-free rustdoc');
console.log(`PASS documentation: ${markdownFiles.length} Markdown files, ${localLinks} local links`);
for (const file of artifactPaths) console.log(`ARTIFACT ${file} ${sha256(files[file])} ${files[file].length}`);
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

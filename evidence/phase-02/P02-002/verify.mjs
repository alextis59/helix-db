#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
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
if (!input) throw new Error('usage: node evidence/phase-02/P02-002/verify.mjs <commit>');

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
  'Cargo.toml',
  'README.md',
  ...crateNames.map((name) => `crates/${name}/Cargo.toml`),
  'docs/README.md',
  'docs/architecture/rust-toolchain-policy.md',
  'docs/architecture/workspace-boundaries.md',
  'rust-toolchain.toml',
  'rustfmt.toml',
];

assert(manifest.task_id === 'P02-002', 'evidence manifest task mismatch');
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

const toolchain = files['rust-toolchain.toml'].toString('utf8');
same(toolchain.split('\n').filter(Boolean), [
  '[toolchain]',
  'channel = "1.96.1"',
  'profile = "minimal"',
  'components = ["clippy", "rust-docs", "rust-src", "rustfmt"]',
  'targets = ["wasm32-unknown-unknown", "wasm32-wasip2"]',
], 'rust-toolchain.toml');
const rustfmt = files['rustfmt.toml'].toString('utf8');
for (const marker of [
  'edition = "2024"',
  'style_edition = "2024"',
  'hard_tabs = false',
  'tab_spaces = 4',
  'newline_style = "Unix"',
  'max_width = 100',
  'use_small_heuristics = "Default"',
  'reorder_imports = true',
  'reorder_modules = true',
]) assert(rustfmt.includes(marker), `rustfmt marker absent: ${marker}`);
const rootCargo = files['Cargo.toml'].toString('utf8');
for (const marker of [
  'rust-version = "1.96.1"',
  'rust-toolchain = "1.96.1"',
  'msrv = "1.96.1"',
  'browser-wasm-target = "wasm32-unknown-unknown"',
  'component-wasm-target = "wasm32-wasip2"',
  'server-edge-wasm-target = "wasm32-wasip3"',
  'server-edge-wasm-status = "selected-unavailable-tier3"',
]) assert(rootCargo.includes(marker), `workspace toolchain marker absent: ${marker}`);
for (const crate of crateNames) {
  assert(files[`crates/${crate}/Cargo.toml`].toString('utf8').includes('rust-version.workspace = true'), `${crate}: MSRV inheritance absent`);
}
const policy = files['docs/architecture/rust-toolchain-policy.md'].toString('utf8');
for (const marker of [
  'Status: Accepted toolchain baseline',
  'Rust 1.96.1',
  'WASIp3 production promotion remains required before `G04`',
  '`wasm32-wasip2` success cannot be relabeled as WASI 0.3 support',
  'Strict warnings, unsafe-code review, dependency policy, and license checks remain owned by `P02-006`',
]) assert(policy.includes(marker), `toolchain policy marker absent: ${marker}`);
for (const url of [
  'https://blog.rust-lang.org/2026/06/30/Rust-1.96.1/',
  'https://rust-lang.github.io/rustup/concepts/components.html',
  'https://rust-lang.github.io/rustup/concepts/profiles.html',
  'https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-unknown-unknown.html',
  'https://doc.rust-lang.org/stable/rustc/platform-support/wasm32-wasip2.html',
  'https://doc.rust-lang.org/beta/rustc/platform-support/wasm32-wasip3.html',
]) assert(policy.includes(url), `official source link absent: ${url}`);
assert(!toolchain.includes('wasm32-wasip1'), 'legacy WASIp1 target selected');
assert(!toolchain.includes('wasm32-wasip3'), 'unavailable WASIp3 target placed in bootstrap file');

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
assert(markdownFiles.length === 91, `Markdown inventory mismatch: ${markdownFiles.length}`);
assert(localLinks === 718, `local link count mismatch: ${localLinks}`);

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-002-'));
try {
  const dependencyPaths = trackedFiles.filter((file) =>
    file === 'Cargo.toml' ||
    file === 'Cargo.lock' ||
    file === 'rust-toolchain.toml' ||
    file === 'rustfmt.toml' ||
    file.startsWith('crates/'));
  for (const file of dependencyPaths) {
    const target = path.join(temporary, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, showBytes(file));
  }
  const environment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  const run = (program, args, options = {}) => execFileSync(program, args, {
    cwd: temporary,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
    ...options,
  }).trim();
  assert(run('rustc', ['--version']) === 'rustc 1.96.1 (31fca3adb 2026-06-26)', 'rustc version mismatch');
  assert(run('cargo', ['--version']) === 'cargo 1.96.1 (356927216 2026-06-26)', 'Cargo version mismatch');
  assert(run('rustfmt', ['--version']) === 'rustfmt 1.9.0-stable (31fca3adb2 2026-06-26)', 'rustfmt version mismatch');
  assert(run('cargo', ['clippy', '--version']) === 'clippy 0.1.96 (31fca3adb2 2026-06-26)', 'Clippy version mismatch');
  assert(run('rustdoc', ['--version']) === 'rustdoc 1.96.1 (31fca3adb 2026-06-26)', 'rustdoc version mismatch');
  assert(run('rustup', ['show', 'active-toolchain']).startsWith('1.96.1-x86_64-unknown-linux-gnu'), 'active toolchain mismatch');
  const documentationPath = run('rustup', ['doc', '--path']);
  assert(existsSync(documentationPath), 'local rust-docs path does not exist');

  const components = run('rustup', ['component', 'list', '--installed', '--toolchain', '1.96.1']).split('\n');
  for (const component of ['cargo-', 'clippy-', 'rust-docs-', 'rust-src', 'rustc-', 'rustfmt-']) {
    assert(components.some((entry) => entry.startsWith(component)), `installed component absent: ${component}`);
  }
  const targets = run('rustup', ['target', 'list', '--installed', '--toolchain', '1.96.1']).split('\n');
  for (const target of ['wasm32-unknown-unknown', 'wasm32-wasip2']) assert(targets.includes(target), `installed target absent: ${target}`);
  assert(!targets.includes('wasm32-wasip3'), 'WASIp3 unexpectedly represented as installed/supported');
  const availableTargets = run('rustup', ['target', 'list', '--toolchain', '1.96.1']);
  assert(!/^wasm32-wasip3/m.test(availableTargets), 'rustup unexpectedly distributes WASIp3 for pinned toolchain');
  assert(/^wasm32-wasip3$/m.test(run('rustc', ['--print', 'target-list'])), 'compiler WASIp3 target specification absent');

  const metadata = JSON.parse(run('cargo', ['metadata', '--frozen', '--format-version', '1', '--no-deps']));
  same(sorted(metadata.packages.map(({ name }) => name)), crateNames, 'workspace package inventory');
  assert(metadata.packages.every(({ rust_version: rustVersion }) => rustVersion === '1.96.1'), 'package MSRV mismatch');
  same(metadata.metadata.helix, {
    'plan-item': 'P02-001',
    status: 'boundary-skeleton',
    'database-functionality': false,
    'public-release': false,
    'rust-toolchain': '1.96.1',
    msrv: '1.96.1',
    'browser-wasm-target': 'wasm32-unknown-unknown',
    'component-wasm-target': 'wasm32-wasip2',
    'server-edge-wasm-target': 'wasm32-wasip3',
    'server-edge-wasm-status': 'selected-unavailable-tier3',
  }, 'workspace toolchain metadata');

  run('cargo', ['fmt', '--all', '--', '--check']);
  run('cargo', ['check', '--frozen', '--workspace', '--all-targets', '--all-features']);
  const tests = run('cargo', ['test', '--frozen', '--workspace', '--all-features']);
  assert([...tests.matchAll(/^test .* \.\.\. ok$/gm)].length === 9, 'all-feature test count mismatch');
  run('cargo', ['clippy', '--frozen', '--workspace', '--all-targets', '--all-features', '--', '-D', 'warnings']);
  run('cargo', ['doc', '--frozen', '--workspace', '--no-deps', '--all-features'], {
    env: { ...environment, RUSTDOCFLAGS: '-D warnings' },
  });
  run('cargo', ['check', '--frozen', '--target', 'wasm32-unknown-unknown', '-p', 'helix-core']);
  run('cargo', ['check', '--frozen', '--target', 'wasm32-wasip2', '-p', 'helix-core']);
  assert(sha256(readFileSync(path.join(temporary, 'Cargo.lock'))) === sha256(showBytes('Cargo.lock')), 'Cargo.lock drifted during replay');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact ${artifactPaths.length}-file P02-002 scope at ${commit}`);
console.log('PASS toolchain/MSRV: rustc/Cargo/rustdoc 1.96.1, rustfmt 1.9.0, Clippy 0.1.96');
console.log('PASS rustup profile: minimal plus clippy, rust-docs, rust-src, rustfmt');
console.log('PASS native checks/tests/Clippy/rustdoc and frozen Cargo metadata');
console.log('PASS Wasm compile targets: wasm32-unknown-unknown and wasm32-wasip2');
console.log('PASS WASIp3 boundary: selected destination, compiler spec present, rustup target absent, no support claim');
console.log(`PASS documentation: ${markdownFiles.length} Markdown files, ${localLinks} local links`);
for (const file of artifactPaths) console.log(`ARTIFACT ${file} ${sha256(files[file])} ${files[file].length}`);
console.log(`VERIFIER ${sha256(verifierBytes)} ${verifierBytes.length}`);

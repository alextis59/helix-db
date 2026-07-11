#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const authorityPath = path.join(repository, '.github/ci/wasm-tools.json');
const expectedArchiveEntries = [
  'wasm-tools-1.253.0-x86_64-linux/',
  'wasm-tools-1.253.0-x86_64-linux/LICENSE-APACHE',
  'wasm-tools-1.253.0-x86_64-linux/LICENSE-Apache-2.0_WITH_LLVM-exception',
  'wasm-tools-1.253.0-x86_64-linux/LICENSE-MIT',
  'wasm-tools-1.253.0-x86_64-linux/README.md',
  'wasm-tools-1.253.0-x86_64-linux/wasm-tools',
];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const wasmToolsAuthority = () => JSON.parse(readFileSync(authorityPath, 'utf8'));

export const validateWasmToolsAuthority = () => {
  const authority = wasmToolsAuthority();
  same(
    Object.keys(authority).sort(),
    [
      'hosts',
      'license',
      'plan_item',
      'published_at',
      'release_api',
      'repository',
      'schema',
      'tag',
      'version',
    ],
    'wasm-tools authority fields',
  );
  assert(authority.schema === 'helix.wasm-tools/1', 'wasm-tools authority schema mismatch');
  assert(authority.plan_item === 'P02-010', 'wasm-tools authority task mismatch');
  assert(authority.repository === 'bytecodealliance/wasm-tools', 'validator repository mismatch');
  assert(authority.version === '1.253.0' && authority.tag === 'v1.253.0', 'validator pin drift');
  assert(authority.published_at === '2026-07-07T16:29:04Z', 'validator publication time drift');
  assert(
    authority.license === 'Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT',
    'validator license inventory drift',
  );
  assert(
    authority.release_api ===
      'https://api.github.com/repos/bytecodealliance/wasm-tools/releases/tags/v1.253.0',
    'validator release API mismatch',
  );
  same(Object.keys(authority.hosts), ['linux-x64'], 'validator host inventory');
  const host = authority.hosts['linux-x64'];
  assert(host.platform === 'linux' && host.architecture === 'x64', 'validator host mismatch');
  assert(
    host.archive === 'wasm-tools-1.253.0-x86_64-linux.tar.gz',
    'validator archive name mismatch',
  );
  assert(host.archive_bytes === 6007583, 'validator archive size mismatch');
  assert(
    host.archive_sha256 === '4e2898f7ca3bd0536218ed9b7b36ff7b86954c57ae0e6272fde69728cbe01088',
    'validator archive SHA-256 mismatch',
  );
  assert(
    host.executable === 'wasm-tools-1.253.0-x86_64-linux/wasm-tools',
    'validator executable path mismatch',
  );
  assert(host.executable_bytes === 19172248, 'validator executable size mismatch');
  assert(
    host.executable_sha256 === '4781d5b7e1d6cedcd8f2384cf6578f4ed7022d305a6e580bde902c32756ca661',
    'validator executable SHA-256 mismatch',
  );
  assert(
    host.version_output === 'wasm-tools 1.253.0 (c799bb87b 2026-07-07)',
    'validator version output mismatch',
  );
  assert(
    host.url ===
      `https://github.com/${authority.repository}/releases/download/${authority.tag}/${host.archive}`,
    'validator download URL mismatch',
  );
  return { authority, host };
};

const verifyExecutable = (executablePath, host) => {
  const bytes = readFileSync(executablePath);
  assert(bytes.length === host.executable_bytes, 'wasm-tools executable byte count mismatch');
  assert(sha256(bytes) === host.executable_sha256, 'wasm-tools executable SHA-256 mismatch');
  const version = execFileSync(executablePath, ['--version'], { encoding: 'utf8' }).trim();
  assert(version === host.version_output, `wasm-tools version mismatch: ${version}`);
};

export const ensureWasmTools = async () => {
  const { authority, host } = validateWasmToolsAuthority();
  assert(
    process.platform === host.platform && process.arch === host.architecture,
    `wasm-tools ${authority.version} is pinned only for linux-x64; received ${process.platform}-${process.arch}`,
  );

  const installParent = path.join(repository, 'target/toolchain/wasm-tools');
  const installRoot = path.join(installParent, authority.version);
  const executablePath = path.join(installRoot, host.executable);
  if (existsSync(executablePath)) {
    verifyExecutable(executablePath, host);
    return executablePath;
  }

  const downloads = path.join(repository, 'target/toolchain/downloads');
  const archivePath = path.join(downloads, host.archive);
  mkdirSync(downloads, { recursive: true });
  if (!existsSync(archivePath)) {
    const response = await fetch(host.url, {
      headers: { 'user-agent': 'helix-db-p02-010-validator-installer' },
      redirect: 'follow',
    });
    assert(response.ok, `wasm-tools download failed: HTTP ${response.status}`);
    writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()), { flag: 'wx' });
  }

  const archiveBytes = readFileSync(archivePath);
  assert(archiveBytes.length === host.archive_bytes, 'wasm-tools archive byte count mismatch');
  assert(sha256(archiveBytes) === host.archive_sha256, 'wasm-tools archive SHA-256 mismatch');
  const archiveEntries = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .sort();
  same(archiveEntries, expectedArchiveEntries, 'wasm-tools archive inventory');

  const temporaryRoot = path.join(installParent, `.extract-${process.pid}`);
  rmSync(temporaryRoot, { recursive: true, force: true });
  mkdirSync(temporaryRoot, { recursive: true });
  try {
    execFileSync(
      'tar',
      ['-xzf', archivePath, '--no-same-owner', '--no-same-permissions', '-C', temporaryRoot],
      { stdio: 'pipe' },
    );
    const extractedRoot = path.join(temporaryRoot, path.dirname(host.executable));
    const extractedExecutable = path.join(temporaryRoot, host.executable);
    assert(lstatSync(extractedRoot).isDirectory(), 'wasm-tools archive root is not a directory');
    assert(lstatSync(extractedExecutable).isFile(), 'wasm-tools archive executable is not a file');
    chmodSync(extractedExecutable, 0o755);
    verifyExecutable(extractedExecutable, host);
    rmSync(installRoot, { recursive: true, force: true });
    mkdirSync(installRoot, { recursive: true });
    renameSync(extractedRoot, path.join(installRoot, path.dirname(host.executable)));
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
  verifyExecutable(executablePath, host);
  return executablePath;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    throw new Error('usage: node tests/toolchain/install-wasm-tools.mjs');
  }
  const executablePath = await ensureWasmTools();
  const { authority } = validateWasmToolsAuthority();
  process.stdout.write(
    `PASS wasm-tools ${authority.version}: verified official archive and executable at ${path.relative(repository, executablePath)}\n`,
  );
}

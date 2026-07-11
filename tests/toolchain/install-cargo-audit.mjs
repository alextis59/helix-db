#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cargoAuditBinary,
  cargoAuditVersion,
  validateCargoAuditAuthority,
  validateCargoAuditSourceArchive,
} from './cargo-audit-contract.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(repository, 'tests/toolchain/dependency-report-policy.json'), 'utf8'),
);
const advisory = policy.rust.advisory;
validateCargoAuditAuthority(advisory);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (program, args, label) => {
  const result = spawnSync(program, args, {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, CARGO_NET_OFFLINE: 'false' },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} exited ${result.status}`);
};
const resolveInsideRepository = (relative, label) => {
  const absolute = path.resolve(repository, relative);
  if (!absolute.startsWith(`${repository}${path.sep}`))
    throw new Error(`${label} escapes repository`);
  return absolute;
};
const lockPath = resolveInsideRepository(advisory.source_lock, 'cargo-audit lock');
const sourceRoot = resolveInsideRepository(advisory.source_directory, 'cargo-audit source');
const receiptPath = resolveInsideRepository(advisory.installation_receipt, 'cargo-audit receipt');
const lockBytes = readFileSync(lockPath);
if (sha256(lockBytes) !== advisory.source_lock_sha256) {
  throw new Error('cargo-audit reviewed source lock checksum mismatch');
}
const expectedReceipt = {
  schema: 'helix.cargo-audit-installation/1',
  tool: advisory.tool,
  version: advisory.version,
  features: [],
  source_archive_sha256: advisory.source_checksum_sha256,
  source_lock_sha256: advisory.source_lock_sha256,
};
const receiptIsCurrent = () => {
  if (!existsSync(receiptPath) || !existsSync(path.join(sourceRoot, 'Cargo.lock'))) return false;
  let actual;
  try {
    actual = JSON.parse(readFileSync(receiptPath, 'utf8'));
    cargoAuditVersion(repository, advisory);
  } catch {
    return false;
  }
  return (
    JSON.stringify(actual) === JSON.stringify(expectedReceipt) &&
    sha256(readFileSync(path.join(sourceRoot, 'Cargo.lock'))) === advisory.source_lock_sha256
  );
};

if (!receiptIsCurrent()) {
  const bootstrapRoot = resolveInsideRepository(
    'target/toolchain/cargo-audit-bootstrap',
    'cargo-audit bootstrap',
  );
  rmSync(bootstrapRoot, { force: true, recursive: true });
  mkdirSync(path.join(bootstrapRoot, 'src'), { recursive: true });
  writeFileSync(
    path.join(bootstrapRoot, 'Cargo.toml'),
    `[package]\nname = "helix-cargo-audit-bootstrap"\nversion = "0.0.0"\nedition = "2024"\npublish = false\n\n[dependencies]\ncargo-audit = { version = "=${advisory.version}", default-features = false }\n\n[workspace]\n`,
  );
  writeFileSync(path.join(bootstrapRoot, 'src/lib.rs'), '// Download-only bootstrap crate.\n');
  run(
    'cargo',
    ['fetch', '--manifest-path', path.join(bootstrapRoot, 'Cargo.toml')],
    'cargo-audit source fetch',
  );
  const archives = validateCargoAuditSourceArchive(advisory);
  if (archives.length !== 1)
    throw new Error(`cargo-audit source archive count: ${archives.length}`);
  rmSync(sourceRoot, { force: true, recursive: true });
  mkdirSync(sourceRoot, { recursive: true });
  run(
    'tar',
    ['-xzf', archives[0], '-C', sourceRoot, '--strip-components=1'],
    'cargo-audit source extraction',
  );
  const sourceManifest = readFileSync(path.join(sourceRoot, 'Cargo.toml'), 'utf8');
  for (const marker of [
    'name = "cargo-audit"',
    `version = "${advisory.version}"`,
    `license = "${advisory.license}"`,
  ]) {
    if (!sourceManifest.includes(marker))
      throw new Error(`cargo-audit source marker absent: ${marker}`);
  }
  writeFileSync(path.join(sourceRoot, 'Cargo.lock'), lockBytes);
  run('cargo', advisory.build_command, 'cargo-audit reviewed-lock build');
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(expectedReceipt, null, 2)}\n`);
}

const identity = cargoAuditVersion(repository, advisory);
const archives = validateCargoAuditSourceArchive(advisory);
process.stdout.write(
  `PASS pinned Rust advisory scanner: ${identity}, ${archives.length} verified source archive, reviewed lock ${advisory.source_lock_sha256}, ${cargoAuditBinary(repository, advisory)}\n`,
);

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const validateCargoAuditAuthority = (advisory) => {
  same(
    Object.keys(advisory).sort(),
    [
      'allow_stale_database',
      'audit_command',
      'binary',
      'build_command',
      'database_path',
      'database_url',
      'deny',
      'exceptions',
      'install_root',
      'installation_receipt',
      'installer',
      'license',
      'minimum_rust_version',
      'self_audit_command',
      'self_audit_expected_dependencies',
      'source_checksum_sha256',
      'source_directory',
      'source_lock',
      'source_lock_sha256',
      'tool',
      'version',
    ],
    'cargo-audit authority fields',
  );
  assert(advisory.tool === 'cargo-audit', 'Rust advisory tool mismatch');
  assert(advisory.version === '0.22.2', 'cargo-audit version mismatch');
  assert(advisory.license === 'Apache-2.0 OR MIT', 'cargo-audit license mismatch');
  assert(
    /^[0-9a-f]{64}$/.test(advisory.source_checksum_sha256),
    'cargo-audit source checksum absent',
  );
  assert(advisory.minimum_rust_version === '1.88', 'cargo-audit MSRV mismatch');
  assert(
    advisory.binary === 'target/toolchain/cargo-audit/bin/cargo-audit',
    'cargo-audit binary path mismatch',
  );
  assert(
    advisory.install_root === 'target/toolchain/cargo-audit',
    'cargo-audit install root mismatch',
  );
  assert(
    advisory.installer === 'tests/toolchain/install-cargo-audit.mjs',
    'cargo-audit installer mismatch',
  );
  assert(
    advisory.source_directory === 'target/toolchain/cargo-audit/source',
    'cargo-audit source directory mismatch',
  );
  assert(
    advisory.source_lock === '.github/ci/cargo-audit-0.22.2.lock' &&
      /^[0-9a-f]{64}$/.test(advisory.source_lock_sha256),
    'cargo-audit source lock authority mismatch',
  );
  assert(
    advisory.installation_receipt === 'target/toolchain/cargo-audit/install-receipt.json',
    'cargo-audit installation receipt mismatch',
  );
  same(
    advisory.build_command,
    [
      'install',
      '--path',
      advisory.source_directory,
      '--locked',
      '--no-default-features',
      '--root',
      'target/toolchain/cargo-audit',
      '--force',
    ],
    'cargo-audit build command',
  );
  assert(
    advisory.database_url === 'https://github.com/RustSec/advisory-db.git',
    'RustSec database URL mismatch',
  );
  assert(
    advisory.database_path === 'target/toolchain/cargo-audit/advisory-db',
    'RustSec database path mismatch',
  );
  same(
    advisory.audit_command,
    [
      'audit',
      '--db',
      advisory.database_path,
      '--url',
      advisory.database_url,
      '--deny',
      'warnings',
      '--json',
    ],
    'cargo-audit command',
  );
  same(
    advisory.self_audit_command,
    [
      'audit',
      '--file',
      `${advisory.source_directory}/Cargo.lock`,
      '--db',
      advisory.database_path,
      '--no-fetch',
      '--deny',
      'warnings',
      '--json',
    ],
    'cargo-audit self-audit command',
  );
  assert(
    advisory.self_audit_expected_dependencies === 374,
    'cargo-audit self-audit dependency count mismatch',
  );
  same(
    advisory.deny,
    ['vulnerabilities', 'unmaintained', 'unsound', 'notice', 'yanked'],
    'cargo-audit denial classes',
  );
  assert(advisory.allow_stale_database === false, 'stale RustSec database allowed');
  same(advisory.exceptions, [], 'cargo-audit exceptions');
};

export const cargoAuditBinary = (repository, advisory) => {
  validateCargoAuditAuthority(advisory);
  const binary = path.resolve(repository, advisory.binary);
  assert(
    binary.startsWith(`${path.resolve(repository, advisory.install_root)}${path.sep}`),
    'cargo-audit binary escapes install root',
  );
  return process.platform === 'win32' ? `${binary}.exe` : binary;
};

export const cargoAuditVersion = (repository, advisory) => {
  const binary = cargoAuditBinary(repository, advisory);
  assert(existsSync(binary), 'pinned cargo-audit binary absent; run rust:audit:install');
  const output = execFileSync(binary, ['--version'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  assert(output === `cargo-audit ${advisory.version}`, `cargo-audit identity drift: ${output}`);
  return output;
};

export const validateCargoAuditSourceArchive = (advisory) => {
  const cargoHome = process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo');
  const cacheRoot = path.join(cargoHome, 'registry', 'cache');
  const archiveName = `cargo-audit-${advisory.version}.crate`;
  const archives = existsSync(cacheRoot)
    ? readdirSync(cacheRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map(({ name }) => path.join(cacheRoot, name, archiveName))
        .filter(existsSync)
    : [];
  assert(archives.length > 0, 'cargo-audit source archive absent after installation');
  for (const archive of archives) {
    assert(
      sha256(readFileSync(archive)) === advisory.source_checksum_sha256,
      'cargo-audit source archive checksum mismatch',
    );
  }
  return archives.sort();
};

export const validateCargoAuditReport = (
  report,
  expectedDependencies,
  { requireDatabaseMetadata = true } = {},
) => {
  same(
    Object.keys(report).sort(),
    ['database', 'lockfile', 'settings', 'vulnerabilities', 'warnings'],
    'cargo-audit report fields',
  );
  assert(
    Number.isSafeInteger(report.database['advisory-count']) &&
      report.database['advisory-count'] > 0,
    'RustSec advisory count invalid',
  );
  if (requireDatabaseMetadata) {
    assert(/^[0-9a-f]{40}$/.test(report.database['last-commit']), 'RustSec revision invalid');
    assert(
      Number.isFinite(Date.parse(report.database['last-updated'])),
      'RustSec update time invalid',
    );
  } else {
    assert(report.database['last-commit'] === null, 'self-audit database revision must be omitted');
    assert(
      report.database['last-updated'] === null,
      'self-audit database update time must be omitted',
    );
  }
  same(report.lockfile, { 'dependency-count': expectedDependencies }, 'audited dependency count');
  same(
    report.settings,
    {
      ignore: [],
      informational_warnings: ['unmaintained', 'unsound', 'notice'],
      severity: null,
      target_arch: [],
      target_os: [],
    },
    'cargo-audit settings',
  );
  same(report.vulnerabilities, { count: 0, found: false, list: [] }, 'Rust vulnerabilities');
  same(report.warnings, {}, 'Rust advisory warnings');
  return {
    advisory_count: report.database['advisory-count'],
    database_revision: report.database['last-commit'],
    database_updated_at: report.database['last-updated'],
    dependency_count: report.lockfile['dependency-count'],
  };
};

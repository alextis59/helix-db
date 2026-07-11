#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { validateWasmToolsAuthority } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readBytes = (file) => readFileSync(path.join(repository, file));
const readText = (file) => readBytes(file).toString('utf8');
const readJson = (file) => JSON.parse(readText(file));
const policy = readJson('tests/toolchain/dependency-report-policy.json');
const dependencyPolicy = readJson(policy.authorities.dependency_policy);
const packageJson = readJson('package.json');
const packageLockBytes = readBytes('package-lock.json');
const packageLock = JSON.parse(packageLockBytes);
const licenseAuthority = readJson(policy.authorities.npm_license_inventory);
const outputDirectory = path.join(repository, policy.reports.output_directory);

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
const writeJson = (file, value) => {
  mkdirSync(outputDirectory, { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  writeFileSync(path.join(outputDirectory, file), bytes);
  return { bytes: bytes.length, sha256: sha256(bytes) };
};
const packageNameFromPath = (packagePath) =>
  packagePath.slice(packagePath.lastIndexOf('node_modules/') + 'node_modules/'.length);
const licenseFileName = (file) => {
  const basename = path.posix.basename(file);
  return (
    /(?:^|[-_.])(?:license|licence|copying|notice|notices)(?:$|[-_.])/i.test(basename) ||
    /^thirdparty(?:license|notice)(?:s|text)?(?:$|[-_.])/i.test(basename)
  );
};

const validatePolicy = () => {
  same(
    sorted(Object.keys(policy)),
    [
      'authorities',
      'external_tools',
      'live_report_max_age_hours',
      'npm',
      'plan_item',
      'reports',
      'rust',
      'schema',
    ],
    'dependency report policy fields',
  );
  assert(policy.schema === 'helix.dependency-report-policy/1', 'report policy schema mismatch');
  assert(policy.plan_item === 'P02-012', 'report policy task mismatch');
  same(
    policy.authorities,
    {
      dependency_policy: 'tests/toolchain/dependency-policy.json',
      npm_license_inventory: '.github/ci/npm-license-inventory.json',
      wasm_tools: '.github/ci/wasm-tools.json',
    },
    'dependency report authorities',
  );
  same(
    policy.reports,
    {
      inventory_schema: 'helix.dependency-inventory-report/1',
      license_refresh_schema: 'helix.npm-license-refresh/1',
      observation_schema: 'helix.dependency-observation-report/1',
      output_directory: 'dist/dependency',
    },
    'dependency report identities',
  );
  assert(policy.npm.cli_version === '11.18.0', 'npm report CLI pin mismatch');
  assert(policy.npm.registry_prefix === 'https://registry.npmjs.org/', 'npm registry mismatch');
  assert(policy.npm.expected_locked_packages === 91, 'locked package baseline mismatch');
  same(
    policy.npm.audit.command,
    ['audit', '--json', '--package-lock-only', '--ignore-scripts'],
    'npm audit command',
  );
  same(
    policy.npm.audit.maximum_vulnerabilities,
    { critical: 0, high: 0, info: 0, low: 0, moderate: 0, total: 0 },
    'vulnerability threshold',
  );
  same(policy.npm.audit.exceptions, [], 'vulnerability exceptions');
  same(
    policy.npm.signatures.command,
    ['audit', 'signatures', '--json', '--include-attestations'],
    'npm signature command',
  );
  assert(
    policy.npm.signatures.require_all_installed_registry_signatures === true,
    'registry signature requirement disabled',
  );
  same(
    policy.npm.signatures.required_attested_direct_packages,
    ['@biomejs/biome', '@playwright/test', 'vite', 'vitest'],
    'required direct attestations',
  );
  same(policy.npm.signatures.exceptions, [], 'signature exceptions');
  same(
    {
      download_concurrency: policy.npm.license_tarballs.download_concurrency,
      maximum_individual_bytes: policy.npm.license_tarballs.maximum_individual_bytes,
      maximum_total_bytes: policy.npm.license_tarballs.maximum_total_bytes,
    },
    {
      download_concurrency: 8,
      maximum_individual_bytes: 33554432,
      maximum_total_bytes: 402653184,
    },
    'license download limits',
  );
  const expectedExceptions = [
    ['prefix', '@biomejs/cli-', '2.5.3', 8],
    ['exact', '@napi-rs/wasm-runtime', '1.1.6', 1],
    ['prefix', '@rolldown/binding-', '1.1.5', 15],
    ['exact', '@tybys/wasm-util', '0.10.3', 1],
    ['exact', 'stackback', '0.0.2', 1],
  ];
  same(
    policy.npm.license_tarballs.missing_text_exceptions.map(
      ({ selector, package: name, version, expected_packages: expectedPackages }) => [
        selector,
        name,
        version,
        expectedPackages,
      ],
    ),
    expectedExceptions,
    'missing license-text exception inventory',
  );
  for (const exception of policy.npm.license_tarballs.missing_text_exceptions) {
    assert(exception.reason.length >= 100, `${exception.package}: exception reason too short`);
    assert(exception.revalidate_by === 'P16-010', `${exception.package}: deadline mismatch`);
  }
  same(
    policy.rust,
    {
      advisory_status_when_external_count_is_zero: 'not-applicable-no-external-packages',
      external_package_policy: 'deny-until-advisory-scanner-is-configured',
      workspace_packages: 8,
    },
    'Rust advisory policy',
  );
  assert(policy.live_report_max_age_hours === 24, 'live report freshness limit mismatch');
  const expectedBrowsers = [
    { browser_version: '149.0.7827.55', name: 'chromium', revision: '1228' },
    { browser_version: '149.0.7827.55', name: 'chromium-headless-shell', revision: '1228' },
    { browser_version: '151.0', name: 'firefox', revision: '1532' },
    { browser_version: '26.5', name: 'webkit', revision: '2311' },
    { browser_version: null, name: 'ffmpeg', revision: '1011' },
  ];
  same(
    policy.external_tools.playwright_browsers.expected_default_browsers,
    expectedBrowsers,
    'Playwright browser authority',
  );
  same(
    {
      playwright_browsers: {
        coverage: policy.external_tools.playwright_browsers.coverage,
        revalidate_by: policy.external_tools.playwright_browsers.revalidate_by,
      },
      wasm_tools: policy.external_tools.wasm_tools,
    },
    {
      playwright_browsers: {
        coverage:
          'exact-package-coupled revisions; retained launcher entrypoint identity and structured execution report; no complete browser-distribution SBOM',
        revalidate_by: 'P16-010',
      },
      wasm_tools: {
        coverage: 'pinned-release-and-license-files; no binary-transitive advisory feed',
        revalidate_by: 'P16-010',
      },
    },
    'external tool coverage boundary',
  );
};

const lockedEntries = () =>
  Object.entries(packageLock.packages)
    .filter(([packagePath]) => packagePath !== '')
    .map(([packagePath, entry]) => ({
      ...entry,
      name: packageNameFromPath(packagePath),
      path: packagePath,
    }));

const validateLock = () => {
  assert(packageLock.lockfileVersion === 3, 'npm lockfile version mismatch');
  assert(packageLock.packages[''].name === packageJson.name, 'root lock identity mismatch');
  const entries = lockedEntries();
  assert(entries.length === policy.npm.expected_locked_packages, 'locked package count mismatch');
  for (const entry of entries) {
    assert(entry.dev === true, `${entry.path}: non-development dependency`);
    assert(entry.link !== true, `${entry.path}: linked dependency prohibited`);
    assert(entry.resolved.startsWith(policy.npm.registry_prefix), `${entry.path}: registry drift`);
    assert(/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity), `${entry.path}: SRI drift`);
    assert(
      typeof entry.license === 'string' && entry.license.length > 0,
      `${entry.path}: license absent`,
    );
  }
  same(
    packageJson.devDependencies,
    dependencyPolicy.npm.direct_dev_dependencies,
    'direct dependency policy',
  );
  return entries;
};

const matchesException = (exception, name, version) =>
  version === exception.version &&
  (exception.selector === 'exact'
    ? name === exception.package
    : name.startsWith(exception.package));

const validateLicenseAuthority = (entries) => {
  same(
    sorted(Object.keys(licenseAuthority)),
    ['package_lock_sha256', 'packages', 'plan_item', 'schema'],
    'npm license authority fields',
  );
  assert(licenseAuthority.schema === 'helix.npm-license-inventory/1', 'license schema mismatch');
  assert(licenseAuthority.plan_item === 'P02-012', 'license task mismatch');
  assert(
    licenseAuthority.package_lock_sha256 === sha256(packageLockBytes),
    'license authority package-lock digest mismatch',
  );
  assert(licenseAuthority.packages.length === entries.length, 'license authority package count');
  same(
    licenseAuthority.packages.map(({ path: packagePath }) => packagePath),
    entries.map(({ path: packagePath }) => packagePath),
    'license authority package order',
  );
  const missingCounts = new Map(
    policy.npm.license_tarballs.missing_text_exceptions.map((exception) => [exception.package, 0]),
  );
  for (const [index, record] of licenseAuthority.packages.entries()) {
    const entry = entries[index];
    same(
      sorted(Object.keys(record)),
      ['license_files', 'path', 'tarball_bytes'],
      `${entry.path}: license record fields`,
    );
    assert(record.path === entry.path, `${entry.path}: license record path mismatch`);
    assert(
      Number.isSafeInteger(record.tarball_bytes) &&
        record.tarball_bytes > 0 &&
        record.tarball_bytes <= policy.npm.license_tarballs.maximum_individual_bytes,
      `${entry.path}: tarball size outside policy`,
    );
    assert(Array.isArray(record.license_files), `${entry.path}: license files must be an array`);
    const licensePaths = new Set();
    for (const license of record.license_files) {
      same(
        sorted(Object.keys(license)),
        ['bytes', 'path', 'sha256'],
        `${entry.path}: license file fields`,
      );
      assert(
        /^package\/[^/]+$/.test(license.path) && licenseFileName(license.path),
        `${entry.path}: non-root or invalid license path`,
      );
      assert(!licensePaths.has(license.path), `${entry.path}: duplicate license path`);
      licensePaths.add(license.path);
      assert(
        Number.isSafeInteger(license.bytes) && license.bytes > 0,
        `${entry.path}: license size`,
      );
      assert(/^[0-9a-f]{64}$/.test(license.sha256), `${entry.path}: license digest`);
    }
    if (record.license_files.length === 0) {
      const exceptions = policy.npm.license_tarballs.missing_text_exceptions.filter((exception) =>
        matchesException(exception, entry.name, entry.version),
      );
      assert(exceptions.length === 1, `${entry.path}: missing license text is not singly reviewed`);
      const exception = exceptions[0];
      missingCounts.set(exception.package, missingCounts.get(exception.package) + 1);
    }
  }
  for (const exception of policy.npm.license_tarballs.missing_text_exceptions) {
    assert(
      missingCounts.get(exception.package) === exception.expected_packages,
      `${exception.package}: missing-license exception count drift`,
    );
  }
};

const installedLicenseState = (entries) => {
  if (!existsSync(path.join(repository, 'node_modules'))) {
    return { packages: [], state: 'absent' };
  }
  const authorityByPath = new Map(licenseAuthority.packages.map((record) => [record.path, record]));
  const installed = [];
  for (const entry of entries) {
    const absolute = path.join(repository, entry.path);
    if (!existsSync(absolute)) continue;
    assert(
      lstatSync(absolute).isDirectory(),
      `${entry.path}: installed package is not a directory`,
    );
    const installedManifest = JSON.parse(readFileSync(path.join(absolute, 'package.json'), 'utf8'));
    assert(installedManifest.name === entry.name, `${entry.path}: installed name mismatch`);
    assert(
      installedManifest.version === entry.version,
      `${entry.path}: installed version mismatch`,
    );
    assert(
      installedManifest.license === entry.license,
      `${entry.path}: installed license mismatch`,
    );
    const actualLicenses = readdirSync(absolute)
      .filter(licenseFileName)
      .sort()
      .map((file) => {
        const bytes = readFileSync(path.join(absolute, file));
        return { bytes: bytes.length, path: `package/${file}`, sha256: sha256(bytes) };
      });
    same(
      actualLicenses,
      authorityByPath.get(entry.path).license_files,
      `${entry.path}: license text`,
    );
    installed.push({ name: entry.name, path: entry.path, version: entry.version });
  }
  return { packages: installed, state: 'present' };
};

const duplicateReport = (entries) => {
  const byName = new Map();
  for (const entry of entries) {
    const records = byName.get(entry.name) ?? [];
    records.push(entry);
    byName.set(entry.name, records);
  }
  return [...byName]
    .filter(([, records]) => new Set(records.map(({ version }) => version)).size > 1)
    .map(([name, records]) => ({
      name,
      paths: records
        .map(({ path: packagePath, version }) => ({ path: packagePath, version }))
        .sort((left, right) => left.path.localeCompare(right.path)),
      versions: sorted(new Set(records.map(({ version }) => version))),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

const browserAuthority = () => {
  const expected = policy.external_tools.playwright_browsers.expected_default_browsers;
  const browsersPath = path.join(repository, 'node_modules/playwright-core/browsers.json');
  if (!existsSync(browsersPath)) return { installed_manifest: false, revisions: expected };
  const installed = JSON.parse(readFileSync(browsersPath, 'utf8'))
    .browsers.filter(({ installByDefault }) => installByDefault === true)
    .map(({ browserVersion, name, revision }) => ({
      browser_version: browserVersion ?? null,
      name,
      revision,
    }));
  same(installed, expected, 'installed Playwright browser revisions');
  return { installed_manifest: true, revisions: installed };
};

const buildOfflineReport = () => {
  validatePolicy();
  const entries = validateLock();
  validateLicenseAuthority(entries);
  const installed = installedLicenseState(entries);
  const licenses = {};
  for (const entry of entries) licenses[entry.license] = (licenses[entry.license] ?? 0) + 1;
  const duplicates = duplicateReport(entries);
  same(
    duplicates.map(({ name, versions }) => ({ name, versions })),
    dependencyPolicy.npm.allowed_duplicate_versions.map(({ name, versions }) => ({
      name,
      versions,
    })),
    'duplicate-version policy',
  );
  const lifecycleScripts = entries
    .filter(({ hasInstallScript }) => hasInstallScript === true)
    .map(({ optional, path: packagePath, version }) => ({
      optional: optional === true,
      path: packagePath,
      version,
    }));
  same(
    lifecycleScripts,
    dependencyPolicy.npm.reviewed_denied_lifecycle_scripts.map(
      ({ optional, path: packagePath, version }) => ({ optional, path: packagePath, version }),
    ),
    'lifecycle-script report',
  );
  const cargo = JSON.parse(
    execFileSync('cargo', ['metadata', '--frozen', '--format-version', '1'], {
      cwd: repository,
      encoding: 'utf8',
      env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
      maxBuffer: 32 * 1024 * 1024,
    }),
  );
  const workspaceMembers = new Set(cargo.workspace_members);
  const externalRust = cargo.packages.filter(({ id }) => !workspaceMembers.has(id));
  assert(cargo.workspace_members.length === policy.rust.workspace_packages, 'Rust workspace count');
  assert(externalRust.length === 0, 'external Rust packages require an advisory scanner');
  const { authority: wasmTools, host: wasmToolsHost } = validateWasmToolsAuthority();
  const report = {
    schema: policy.reports.inventory_schema,
    plan_item: 'P02-012',
    inputs: {
      cargo_lock_sha256: sha256(readBytes('Cargo.lock')),
      dependency_policy_sha256: sha256(readBytes(policy.authorities.dependency_policy)),
      npm_license_inventory_sha256: sha256(readBytes(policy.authorities.npm_license_inventory)),
      package_lock_sha256: sha256(packageLockBytes),
      report_policy_sha256: sha256(readBytes('tests/toolchain/dependency-report-policy.json')),
      wasm_tools_authority_sha256: sha256(readBytes(policy.authorities.wasm_tools)),
    },
    environment: {
      architecture: process.arch,
      installed_tree: installed.state,
      platform: process.platform,
    },
    npm: {
      duplicates,
      installed_packages: installed.packages,
      license_file_packages: licenseAuthority.packages.filter(
        ({ license_files: licenseFiles }) => licenseFiles.length > 0,
      ).length,
      license_files: licenseAuthority.packages.reduce(
        (count, { license_files: licenseFiles }) => count + licenseFiles.length,
        0,
      ),
      license_forms: Object.fromEntries(
        Object.entries(licenses).sort(([left], [right]) => left.localeCompare(right)),
      ),
      locked_development_packages: entries.length,
      missing_license_text_packages: licenseAuthority.packages.filter(
        ({ license_files: licenseFiles }) => licenseFiles.length === 0,
      ).length,
      registry_sources: entries.length,
      sha512_integrities: entries.length,
      suppressed_lifecycle_scripts: lifecycleScripts,
    },
    rust: {
      advisory_status: policy.rust.advisory_status_when_external_count_is_zero,
      external_packages: [],
      workspace_packages: cargo.packages.map(({ license, name, version }) => ({
        license,
        name,
        version,
      })),
    },
    external_tools: {
      playwright_browsers: {
        ...browserAuthority(),
        coverage: policy.external_tools.playwright_browsers.coverage,
        revalidate_by: policy.external_tools.playwright_browsers.revalidate_by,
      },
      wasm_tools: {
        archive_bytes: wasmToolsHost.archive_bytes,
        archive_sha256: wasmToolsHost.archive_sha256,
        coverage: policy.external_tools.wasm_tools.coverage,
        license: wasmTools.license,
        license_files: wasmTools.license_files,
        release: `${wasmTools.repository}@${wasmTools.tag}`,
        revalidate_by: policy.external_tools.wasm_tools.revalidate_by,
      },
    },
    verdict: 'pass',
  };
  const artifact = writeJson('inventory-report.json', report);
  return { artifact, entries, installed, report };
};

const parseTarNumber = (bytes) => {
  const text = bytes.toString('ascii').replaceAll('\0', '').trim();
  assert(/^[0-7]*$/.test(text), `invalid tar number: ${JSON.stringify(text)}`);
  return text === '' ? 0 : Number.parseInt(text, 8);
};

const tarFiles = (archive, packagePath) => {
  const tar = gunzipSync(archive);
  const files = new Map();
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start, end) =>
      header.subarray(start, end).toString('utf8').replace(/\0.*$/s, '');
    const name = field(0, 100);
    const prefix = field(345, 500);
    const file = prefix ? `${prefix}/${name}` : name;
    const size = parseTarNumber(header.subarray(124, 136));
    const type = header[156];
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    assert(dataEnd <= tar.length, `${packagePath}: truncated tar entry ${file}`);
    assert(
      !file.startsWith('/') && !file.split('/').includes('..'),
      `${packagePath}: unsafe tar path`,
    );
    if (type === 0 || type === 48) files.set(file, tar.subarray(dataStart, dataEnd));
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return files;
};

const fetchLicenseRecord = async (entry) => {
  const response = await fetch(entry.resolved, {
    headers: { 'user-agent': 'helix-db-p02-012-license-reporter' },
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
  });
  assert(response.ok, `${entry.path}: tarball HTTP ${response.status}`);
  assert(response.url.startsWith(policy.npm.registry_prefix), `${entry.path}: response registry`);
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength)) {
    assert(
      contentLength <= policy.npm.license_tarballs.maximum_individual_bytes,
      `${entry.path}: advertised tarball too large`,
    );
  }
  const archive = Buffer.from(await response.arrayBuffer());
  assert(
    archive.length <= policy.npm.license_tarballs.maximum_individual_bytes,
    `${entry.path}: tarball too large`,
  );
  const integrity = entry.integrity
    .split(/\s+/)
    .find((candidate) => candidate.startsWith('sha512-'));
  assert(integrity, `${entry.path}: SHA-512 integrity absent`);
  assert(
    createHash('sha512').update(archive).digest('base64') === integrity.slice('sha512-'.length),
    `${entry.path}: tarball integrity mismatch`,
  );
  const files = tarFiles(archive, entry.path);
  const rootManifests = [...files].filter(
    ([file]) => file.split('/').length === 2 && path.posix.basename(file) === 'package.json',
  );
  assert(rootManifests.length === 1, `${entry.path}: tarball root package.json inventory`);
  const [tarManifestPath, tarManifestBytes] = rootManifests[0];
  const tarRoot = path.posix.dirname(tarManifestPath);
  const tarManifest = JSON.parse(tarManifestBytes.toString('utf8'));
  assert(tarManifest.name === entry.name, `${entry.path}: tarball name mismatch`);
  assert(tarManifest.version === entry.version, `${entry.path}: tarball version mismatch`);
  assert(tarManifest.license === entry.license, `${entry.path}: tarball license mismatch`);
  const licenseFiles = [...files]
    .filter(
      ([file]) =>
        path.posix.dirname(file) === tarRoot &&
        file.split('/').length === 2 &&
        licenseFileName(file),
    )
    .map(([file, bytes]) => ({
      bytes: bytes.length,
      path: `package/${path.posix.basename(file)}`,
      sha256: sha256(bytes),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return { license_files: licenseFiles, path: entry.path, tarball_bytes: archive.length };
};

const refreshLicenses = async () => {
  validatePolicy();
  const entries = validateLock();
  const records = new Array(entries.length);
  let next = 0;
  let totalBytes = 0;
  const worker = async () => {
    while (next < entries.length) {
      const index = next;
      next += 1;
      const record = await fetchLicenseRecord(entries[index]);
      records[index] = record;
      totalBytes += record.tarball_bytes;
      assert(
        totalBytes <= policy.npm.license_tarballs.maximum_total_bytes,
        'license tarball download total exceeded policy',
      );
    }
  };
  await Promise.all(
    Array.from({ length: policy.npm.license_tarballs.download_concurrency }, () => worker()),
  );
  const candidate = {
    schema: policy.reports.license_refresh_schema,
    plan_item: 'P02-012',
    package_lock_sha256: sha256(packageLockBytes),
    packages: records,
    summary: {
      license_file_packages: records.filter(
        ({ license_files: licenseFiles }) => licenseFiles.length > 0,
      ).length,
      license_files: records.reduce(
        (count, { license_files: licenseFiles }) => count + licenseFiles.length,
        0,
      ),
      locked_packages: records.length,
      missing_license_text_packages: records.filter(
        ({ license_files: licenseFiles }) => licenseFiles.length === 0,
      ).length,
      tarball_bytes: totalBytes,
    },
  };
  const artifact = writeJson('npm-license-refresh.json', candidate);
  const authorityCandidate = {
    schema: 'helix.npm-license-inventory/1',
    plan_item: 'P02-012',
    package_lock_sha256: candidate.package_lock_sha256,
    packages: candidate.packages,
  };
  assert(
    JSON.stringify(canonical(authorityCandidate)) === JSON.stringify(canonical(licenseAuthority)),
    'npm license authority differs from the verified refresh candidate',
  );
  validateLicenseAuthority(entries);
  process.stdout.write(
    `PASS npm license refresh: ${records.length} integrity-verified tarballs, ${candidate.summary.license_files} root license/notice files, ${candidate.summary.missing_license_text_packages} reviewed omissions\n`,
  );
  process.stdout.write(
    `REPORT ${path.relative(repository, path.join(outputDirectory, 'npm-license-refresh.json'))} ${artifact.sha256}\n`,
  );
};

const runCorepackJson = (args, label) => {
  const environment = { ...process.env };
  delete environment.FORCE_COLOR;
  delete environment.NO_COLOR;
  const result = spawnSync('corepack', ['npm', ...args], {
    cwd: repository,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 300_000,
  });
  if (result.error) throw result.error;
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label}: npm did not return JSON (exit ${result.status}): ${result.stderr}`);
  }
  return { parsed, result };
};

const liveObservation = () => {
  const offline = buildOfflineReport();
  assert(offline.installed.state === 'present', 'live report requires a clean installed npm tree');
  const npmVersion = execFileSync('corepack', ['npm', '--version'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  assert(npmVersion === policy.npm.cli_version, `npm report version mismatch: ${npmVersion}`);
  const npmRegistry = execFileSync('corepack', ['npm', 'config', 'get', 'registry'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  assert(
    npmRegistry === policy.npm.registry_prefix,
    `npm report registry mismatch: ${npmRegistry}`,
  );
  const audit = runCorepackJson(policy.npm.audit.command, 'npm vulnerability audit');
  assert(audit.parsed.auditReportVersion === 2, 'npm audit report version mismatch');
  same(
    audit.parsed.metadata.vulnerabilities,
    policy.npm.audit.maximum_vulnerabilities,
    'npm vulnerability counts',
  );
  same(audit.parsed.vulnerabilities, {}, 'npm vulnerability inventory');
  assert(audit.result.status === 0, `npm audit exited ${audit.result.status}`);
  const auditRaw = Buffer.from(audit.result.stdout);
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(path.join(outputDirectory, 'npm-audit.json'), auditRaw);

  const signatures = runCorepackJson(policy.npm.signatures.command, 'npm signature audit');
  assert(signatures.result.status === 0, `npm signature audit exited ${signatures.result.status}`);
  same(signatures.parsed.invalid, [], 'invalid registry signatures');
  same(signatures.parsed.missing, [], 'missing registry signatures');
  assert(Array.isArray(signatures.parsed.verified), 'verified attestations absent');
  const installedByPath = new Map(offline.installed.packages.map((entry) => [entry.path, entry]));
  const attestedPaths = new Set();
  const attested = signatures.parsed.verified
    .map((entry) => {
      assert(!attestedPaths.has(entry.location), `${entry.location}: duplicate attestation`);
      attestedPaths.add(entry.location);
      const installed = installedByPath.get(entry.location);
      assert(installed, `${entry.location}: attestation is not for an installed locked package`);
      assert(
        entry.name === installed.name && entry.version === installed.version,
        `${entry.location}: identity drift`,
      );
      assert(
        entry.registry === policy.npm.registry_prefix,
        `${entry.location}: attestation registry`,
      );
      assert(
        entry.attestations?.provenance?.predicateType === 'https://slsa.dev/provenance/v1',
        `${entry.location}: SLSA provenance predicate absent`,
      );
      return {
        attestation_bundles_sha256: sha256(Buffer.from(JSON.stringify(entry.attestationBundles))),
        attestation_url: entry.attestations.url,
        location: entry.location,
        name: entry.name,
        predicate_type: entry.attestations.provenance.predicateType,
        version: entry.version,
      };
    })
    .sort((left, right) => left.location.localeCompare(right.location));
  for (const name of policy.npm.signatures.required_attested_direct_packages) {
    assert(
      attested.some((entry) => entry.name === name),
      `${name}: required provenance absent`,
    );
  }
  const signaturesRaw = Buffer.from(signatures.result.stdout);
  writeFileSync(path.join(outputDirectory, 'npm-signatures.json'), signaturesRaw);
  const observation = {
    schema: policy.reports.observation_schema,
    plan_item: 'P02-012',
    recorded_at: new Date().toISOString(),
    freshness: { maximum_age_hours: policy.live_report_max_age_hours },
    inputs: {
      inventory_report_bytes: offline.artifact.bytes,
      inventory_report_sha256: offline.artifact.sha256,
      package_lock_sha256: sha256(packageLockBytes),
      report_policy_sha256: sha256(readBytes('tests/toolchain/dependency-report-policy.json')),
    },
    registry: npmRegistry,
    npm: {
      audit: {
        audited_dependencies: audit.parsed.metadata.dependencies,
        raw_bytes: auditRaw.length,
        raw_sha256: sha256(auditRaw),
        vulnerabilities: audit.parsed.metadata.vulnerabilities,
      },
      provenance: {
        attested_packages: attested,
        installed_packages: offline.installed.packages.length,
        raw_bytes: signaturesRaw.length,
        raw_sha256: sha256(signaturesRaw),
        registry_signatures_invalid: 0,
        registry_signatures_missing: 0,
        registry_signatures_verified: offline.installed.packages.length,
        unattested_packages: offline.installed.packages
          .filter(({ path: packagePath }) => !attestedPaths.has(packagePath))
          .map(({ name, path: packagePath, version }) => ({ name, path: packagePath, version })),
      },
    },
    rust: {
      advisory_status: policy.rust.advisory_status_when_external_count_is_zero,
      external_packages: 0,
    },
    external_tools: {
      playwright_browsers: policy.external_tools.playwright_browsers.coverage,
      wasm_tools: policy.external_tools.wasm_tools.coverage,
    },
    verdict: 'pass',
  };
  const artifact = writeJson('observation-report.json', observation);
  process.stdout.write(
    `PASS dependency observation: 0 npm vulnerabilities, ${offline.installed.packages.length} verified registry signatures, ${attested.length} verified SLSA attestations\n`,
  );
  process.stdout.write(
    `REPORT ${path.relative(repository, path.join(outputDirectory, 'observation-report.json'))} ${artifact.sha256}\n`,
  );
};

const mode = process.argv[2];
assert(
  process.argv.length === 3 && ['offline', 'live', 'licenses'].includes(mode),
  'usage: node tests/toolchain/check-dependency-reports.mjs <offline|live|licenses>',
);
if (mode === 'offline') {
  const { artifact, report } = buildOfflineReport();
  process.stdout.write(
    `PASS dependency inventory: ${report.npm.locked_development_packages} npm development packages, ${report.rust.external_packages.length} external Rust packages, ${report.npm.license_files} license/notice files, ${report.npm.duplicates.length} duplicate family\n`,
  );
  process.stdout.write(
    `REPORT ${path.relative(repository, path.join(outputDirectory, 'inventory-report.json'))} ${artifact.sha256}\n`,
  );
} else if (mode === 'live') liveObservation();
else await refreshLicenses();

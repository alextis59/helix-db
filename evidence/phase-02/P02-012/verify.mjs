#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidenceDirectory = path.join(repository, 'evidence/phase-02/P02-012');
const reportsDirectory = path.join(evidenceDirectory, 'reports');
const manifest = JSON.parse(readFileSync(path.join(evidenceDirectory, 'manifest.json'), 'utf8'));
const commitArgument = process.argv[2];

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
    throw new Error(label + ' mismatch: ' + JSON.stringify(actual));
  }
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (args) =>
  execFileSync('git', args, { cwd: repository, maxBuffer: 64 * 1024 * 1024 });
const gitText = (args) => gitBytes(args).toString('utf8');
const showBytes = (file, commit = manifest.commit) => gitBytes(['show', commit + ':' + file]);
const showText = (file, commit = manifest.commit) => showBytes(file, commit).toString('utf8');

assert(commitArgument, 'usage: node evidence/phase-02/P02-012/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', commitArgument + '^{commit}']).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P02-012', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(manifest.requirements, ['INV-007', 'QUAL-001', 'SEC-001'], 'evidence requirements');
same(manifest.accepted_adrs, [], 'accepted ADR inventory');

const artifactPaths = manifest.artifacts.map(({ path: artifactPath }) => artifactPath);
same(sorted(artifactPaths), sorted(new Set(artifactPaths)), 'unique source artifact paths');
assert(manifest.artifacts.length === 23, 'source artifact count mismatch');
const changedRecords = gitText([
  'diff-tree',
  '--no-commit-id',
  '--name-status',
  '-r',
  commitArgument + '^',
  commitArgument,
])
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...parts] = line.split('\t');
    return { status, path: parts.at(-1) };
  });
same(
  sorted(changedRecords.map(({ path: changedPath }) => changedPath)),
  sorted(artifactPaths),
  'exact source-commit scope',
);
assert(
  changedRecords.every(({ status }) => status === 'A' || status === 'M'),
  'source commit contains unsupported status: ' + JSON.stringify(changedRecords),
);
for (const artifact of manifest.artifacts) {
  const bytes = showBytes(artifact.path);
  assert(bytes.length === artifact.bytes, artifact.path + ': byte count mismatch');
  assert(sha256(bytes) === artifact.sha256, artifact.path + ': SHA-256 mismatch');
}

const retainedPaths = manifest.retained_artifacts.map(({ path: artifactPath }) => artifactPath);
same(sorted(retainedPaths), sorted(new Set(retainedPaths)), 'unique retained artifact paths');
assert(manifest.retained_artifacts.length === 5, 'retained artifact count mismatch');
for (const artifact of manifest.retained_artifacts) {
  const absolute = path.join(evidenceDirectory, artifact.path);
  const bytes = readFileSync(absolute);
  assert(statSync(absolute).isFile(), artifact.path + ': retained artifact is not a file');
  assert(bytes.length === artifact.bytes, artifact.path + ': retained byte count mismatch');
  assert(sha256(bytes) === artifact.sha256, artifact.path + ': retained SHA-256 mismatch');
}
const verifierPath = path.join(evidenceDirectory, 'verify.mjs');
const verifierBytes = readFileSync(verifierPath);
assert(statSync(verifierPath).size === manifest.verifier.bytes, 'verifier byte count mismatch');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256 mismatch');

const inventoryBytes = readFileSync(path.join(reportsDirectory, 'inventory-report.json'));
const auditBytes = readFileSync(path.join(reportsDirectory, 'npm-audit.json'));
const licensesBytes = readFileSync(path.join(reportsDirectory, 'npm-license-refresh.json'));
const observationBytes = readFileSync(path.join(reportsDirectory, 'observation-report.json'));
const signaturesBase64Bytes = readFileSync(
  path.join(reportsDirectory, 'npm-signatures.json.gz.b64'),
);
const inventory = JSON.parse(inventoryBytes);
const audit = JSON.parse(auditBytes);
const licenses = JSON.parse(licensesBytes);
const observation = JSON.parse(observationBytes);

assert(inventory.schema === 'helix.dependency-inventory-report/1', 'inventory report schema');
assert(inventory.plan_item === 'P02-012' && inventory.verdict === 'pass', 'inventory verdict');
same(inventory.environment, {
  architecture: 'x64',
  installed_tree: 'present',
  platform: 'linux',
}, 'inventory environment');
same(
  {
    duplicates: inventory.npm.duplicates.length,
    installed: inventory.npm.installed_packages.length,
    license_file_packages: inventory.npm.license_file_packages,
    license_files: inventory.npm.license_files,
    locked: inventory.npm.locked_development_packages,
    missing_license_text: inventory.npm.missing_license_text_packages,
    registry_sources: inventory.npm.registry_sources,
    sha512_integrities: inventory.npm.sha512_integrities,
    suppressed_lifecycle_scripts: inventory.npm.suppressed_lifecycle_scripts.length,
  },
  {
    duplicates: 1,
    installed: 52,
    license_file_packages: 65,
    license_files: 73,
    locked: 91,
    missing_license_text: 26,
    registry_sources: 91,
    sha512_integrities: 91,
    suppressed_lifecycle_scripts: 2,
  },
  'inventory npm totals',
);
same(
  inventory.npm.duplicates,
  [
    {
      name: 'fsevents',
      paths: [
        { path: 'node_modules/fsevents', version: '2.3.2' },
        { path: 'node_modules/vite/node_modules/fsevents', version: '2.3.3' },
      ],
      versions: ['2.3.2', '2.3.3'],
    },
  ],
  'duplicate inventory',
);
assert(inventory.rust.workspace_packages.length === 8, 'Rust workspace package count');
same(inventory.rust.external_packages, [], 'external Rust inventory');
assert(
  inventory.rust.advisory_status === 'not-applicable-no-external-packages',
  'Rust advisory status',
);
assert(inventory.external_tools.wasm_tools.license_files.length === 3, 'wasm-tools licenses');
assert(
  inventory.external_tools.playwright_browsers.revisions.length === 5,
  'Playwright browser revision inventory',
);

assert(audit.auditReportVersion === 2, 'retained npm audit schema');
same(audit.vulnerabilities, {}, 'retained npm advisory inventory');
same(
  audit.metadata.vulnerabilities,
  { critical: 0, high: 0, info: 0, low: 0, moderate: 0, total: 0 },
  'retained npm vulnerability totals',
);
assert(audit.metadata.dependencies.total === 91, 'retained npm audited dependency total');

assert(licenses.schema === 'helix.npm-license-refresh/1', 'license refresh schema');
assert(licenses.plan_item === 'P02-012', 'license refresh task');
assert(licenses.packages.length === 91, 'license refresh package count');
same(
  licenses.summary,
  {
    license_file_packages: 65,
    license_files: 73,
    locked_packages: 91,
    missing_license_text_packages: 26,
    tarball_bytes: 339376667,
  },
  'license refresh summary',
);
const licenseAuthority = JSON.parse(showText('.github/ci/npm-license-inventory.json'));
assert(
  licenses.package_lock_sha256 === licenseAuthority.package_lock_sha256,
  'license report lock digest',
);
same(licenses.packages, licenseAuthority.packages, 'license refresh authority replay');

assert(
  observation.schema === 'helix.dependency-observation-report/1',
  'observation report schema',
);
assert(observation.plan_item === 'P02-012' && observation.verdict === 'pass', 'observation verdict');
assert(!Number.isNaN(Date.parse(observation.recorded_at)), 'observation timestamp');
same(observation.freshness, { maximum_age_hours: 24 }, 'observation freshness contract');
assert(observation.registry === 'https://registry.npmjs.org/', 'observation registry');
assert(
  observation.inputs.inventory_report_bytes === inventoryBytes.length &&
    observation.inputs.inventory_report_sha256 === sha256(inventoryBytes),
  'observation inventory binding',
);
assert(
  observation.inputs.package_lock_sha256 === sha256(showBytes('package-lock.json')),
  'observation lock binding',
);
assert(
  observation.inputs.report_policy_sha256 ===
    sha256(showBytes('tests/toolchain/dependency-report-policy.json')),
  'observation policy binding',
);
same(observation.npm.audit.vulnerabilities, audit.metadata.vulnerabilities, 'audit totals binding');
assert(
  observation.npm.audit.raw_bytes === auditBytes.length &&
    observation.npm.audit.raw_sha256 === sha256(auditBytes),
  'audit raw artifact binding',
);
same(
  {
    attestations: observation.npm.provenance.attested_packages.length,
    installed: observation.npm.provenance.installed_packages,
    invalid: observation.npm.provenance.registry_signatures_invalid,
    missing: observation.npm.provenance.registry_signatures_missing,
    unattested: observation.npm.provenance.unattested_packages.length,
    verified: observation.npm.provenance.registry_signatures_verified,
  },
  { attestations: 27, installed: 52, invalid: 0, missing: 0, unattested: 25, verified: 52 },
  'observation provenance totals',
);
same(
  observation.rust,
  { advisory_status: 'not-applicable-no-external-packages', external_packages: 0 },
  'observation Rust boundary',
);

const signaturesGzip = Buffer.from(signaturesBase64Bytes.toString('ascii').trim(), 'base64');
assert(signaturesGzip.length === manifest.compressed_payload.gzip_bytes, 'signature gzip bytes');
assert(
  sha256(signaturesGzip) === manifest.compressed_payload.gzip_sha256,
  'signature gzip SHA-256',
);
const signaturesRaw = gunzipSync(signaturesGzip);
assert(signaturesRaw.length === manifest.compressed_payload.raw_bytes, 'signature raw bytes');
assert(sha256(signaturesRaw) === manifest.compressed_payload.raw_sha256, 'signature raw SHA-256');
assert(
  observation.npm.provenance.raw_bytes === signaturesRaw.length &&
    observation.npm.provenance.raw_sha256 === sha256(signaturesRaw),
  'observation signature artifact binding',
);
const signatures = JSON.parse(signaturesRaw);
same(signatures.invalid, [], 'invalid registry signature inventory');
same(signatures.missing, [], 'missing registry signature inventory');
assert(signatures.verified.length === 27, 'verified provenance inventory');
const compactAttestations = new Map(
  observation.npm.provenance.attested_packages.map((entry) => [entry.location, entry]),
);
for (const entry of signatures.verified) {
  const compact = compactAttestations.get(entry.location);
  assert(compact, entry.location + ': compact attestation absent');
  assert(entry.name === compact.name && entry.version === compact.version, entry.location + ': identity');
  assert(entry.registry === observation.registry, entry.location + ': registry');
  assert(
    entry.attestations?.provenance?.predicateType === 'https://slsa.dev/provenance/v1',
    entry.location + ': SLSA predicate',
  );
  assert(
    sha256(Buffer.from(JSON.stringify(entry.attestationBundles))) ===
      compact.attestation_bundles_sha256,
    entry.location + ': attestation bundle binding',
  );
}
for (const required of ['@biomejs/biome', '@playwright/test', 'vite', 'vitest']) {
  assert(signatures.verified.some(({ name }) => name === required), required + ': provenance absent');
}

const packageJson = JSON.parse(showText('package.json'));
same(
  {
    'dependencies:check': packageJson.scripts['dependencies:check'],
    'dependencies:licenses': packageJson.scripts['dependencies:licenses'],
    'dependencies:report': packageJson.scripts['dependencies:report'],
  },
  {
    'dependencies:check': 'node tests/toolchain/check-dependency-reports.mjs offline',
    'dependencies:licenses': 'node tests/toolchain/check-dependency-reports.mjs licenses',
    'dependencies:report': 'node tests/toolchain/check-dependency-reports.mjs live',
  },
  'dependency report commands',
);
assert(
  sha256(showBytes('package-lock.json')) ===
    sha256(showBytes('package-lock.json', commitArgument + '^')),
  'P02-012 changed the npm lock despite adding no dependency',
);
assert(
  sha256(showBytes('Cargo.lock')) === sha256(showBytes('Cargo.lock', commitArgument + '^')),
  'P02-012 changed the Cargo lock despite adding no dependency',
);
const matrix = JSON.parse(showText('.github/ci/matrix.json'));
assert(matrix.schema === 'helix.ci-matrix/2', 'CI matrix schema');
same(matrix.plan_items, ['P02-009', 'P02-010', 'P02-011', 'P02-012'], 'CI task history');
const ci = showText('.github/workflows/ci.yml');
for (const marker of [
  'corepack npm run dependencies:check',
  'Refresh dependency vulnerability and provenance observation',
  "if: matrix.node == '22.23.1'",
  'corepack npm run dependencies:report',
]) {
  assert(ci.includes(marker), 'CI dependency marker absent: ' + marker);
}
const reporter = showText('tests/toolchain/check-dependency-reports.mjs');
for (const marker of [
  'helix.dependency-report-policy/1',
  'redirect: \'error\'',
  'tarball integrity mismatch',
  'external Rust packages require an advisory scanner',
  'required provenance absent',
  'registry_signatures_verified',
]) {
  assert(reporter.includes(marker), 'dependency reporter marker absent: ' + marker);
}
for (const forbidden of ['NODE_TLS_REJECT_UNAUTHORIZED', 'strict-ssl=false', '--force']) {
  assert(!reporter.includes(forbidden), 'unsafe dependency reporter marker: ' + forbidden);
}
assert(
  showText('ImplementationPlan.md').includes(
    '- [ ] **P02-012** Configure dependency vulnerability, provenance, license, and duplicate-version reporting.',
  ),
  'source task was checked before evidence closure',
);

const requirementFamilies =
  'INV|PLAT|CORE|DATA|QUERY|STORE|GPU|DIST|CACHE|SYNC|SEC|OPS|QUAL|COMPAT';
const requirementPattern = new RegExp('\\b(?:' + requirementFamilies + ')-\\d{3}\\b', 'g');
const specificationRequirements = new Set(showText('Specifications.md').match(requirementPattern) ?? []);
const ledgerRequirements = new Set(
  showText('docs/governance/requirements.md').match(requirementPattern) ?? [],
);
assert(specificationRequirements.size === 44, 'specification requirement count');
same(sorted(ledgerRequirements), sorted(specificationRequirements), 'requirement ledger ID set');

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', commitArgument])
  .trim()
  .split('\n')
  .filter(Boolean);
const generatedPath =
  /(^|\/)(target|node_modules|dist|coverage|playwright-report|test-results|blob-report|\.vitest|\.vite)(\/|$)/;
same(
  trackedFiles.filter(
    (file) => generatedPath.test(file) || /\.(?:profraw|profdata|tsbuildinfo|tgz)$/.test(file),
  ),
  [],
  'tracked generated-output inventory',
);
const markdownFiles = trackedFiles.filter((file) => file.endsWith('.md'));
let localLinks = 0;
for (const file of markdownFiles) {
  const source = showText(file);
  assert(source.endsWith('\n'), file + ': missing terminal newline');
  for (const [index, line] of source.split('\n').entries()) {
    assert(!/[ \t]+$/.test(line), file + ':' + (index + 1) + ': trailing whitespace');
  }
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let rawTarget = match[1].split('#')[0];
    if (!rawTarget || /^(https?:|mailto:)/.test(rawTarget)) continue;
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) rawTarget = rawTarget.slice(1, -1);
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)),
    );
    assert(target !== '..' && !target.startsWith('../'), file + ': link escapes repository');
    gitText(['cat-file', '-e', commitArgument + ':' + target]);
    localLinks += 1;
  }
}
assert(markdownFiles.length === 143, 'Markdown inventory mismatch: ' + markdownFiles.length);
assert(localLinks === 923, 'local link count mismatch: ' + localLinks);

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-012-'));
try {
  const archive = gitBytes(['archive', '--format=tar', commitArgument]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const baseEnvironment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  delete baseEnvironment.FORCE_COLOR;
  delete baseEnvironment.NO_COLOR;
  const run = (program, args, options = {}) =>
    execFileSync(program, args, {
      cwd: temporary,
      encoding: 'utf8',
      env: baseEnvironment,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 900_000,
      ...options,
    });
  const runResult = (program, args, options = {}) =>
    spawnSync(program, args, {
      cwd: temporary,
      encoding: 'utf8',
      env: baseEnvironment,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 900_000,
      ...options,
    });
  const requireText = (output, marker, label) => {
    assert(output.includes(marker), label + ': output marker absent: ' + marker);
  };
  const shellQuote = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const nvm = path.join(os.homedir(), '.nvm', 'nvm.sh');
  assert(existsSync(nvm), 'NVM installation absent for supported Node-lane replay');
  const nvmCommand = (version, args) =>
    'source ' +
    shellQuote(nvm) +
    ' && nvm exec ' +
    shellQuote(version) +
    ' ' +
    args.map(shellQuote).join(' ');
  const runNvm = (version, args, options = {}) =>
    run('bash', ['-lc', nvmCommand(version, args)], options);
  const runNvmResult = (version, args, options = {}) =>
    runResult('bash', ['-lc', nvmCommand(version, args)], options);
  const expectFailure = (result, label, marker) => {
    assert(result.status !== 0, label + ': mutation unexpectedly passed');
    if (marker) {
      const output = (result.stdout ?? '') + '\n' + (result.stderr ?? '');
      assert(output.includes(marker), label + ': failure marker absent: ' + marker);
    }
  };
  const expectNodeFailure = (args, label, marker, options = {}) =>
    expectFailure(runResult(process.execPath, args, options), label, marker);
  const expectNvmFailure = (args, label, marker, options = {}) =>
    expectFailure(runNvmResult('22.23.1', args, options), label, marker);

  run('git', ['init', '--quiet']);
  run('git', ['add', '--all']);
  run('git', [
    '-c',
    'commit.gpgsign=false',
    '-c',
    'user.name=Helix Evidence',
    '-c',
    'user.email=evidence@invalid.example',
    'commit',
    '--quiet',
    '--no-verify',
    '-m',
    'source snapshot',
  ]);

  const yamlSummary = JSON.parse(
    run('python3', [
      '-c',
      [
        'import json, yaml',
        "paths = ['.github/workflows/ci.yml', '.github/workflows/ci-nightly.yml']",
        'out = []',
        'for p in paths:',
        "  data = yaml.load(open(p, encoding='utf-8'), Loader=yaml.BaseLoader)",
        "  out.append({'path': p, 'root': sorted(data), 'jobs': sorted(data['jobs']), 'steps': sum(len(job['steps']) for job in data['jobs'].values())})",
        'print(json.dumps(out))',
      ].join('\n'),
    ]),
  );
  same(
    yamlSummary,
    [
      {
        jobs: ['browser', 'contract', 'native', 'node', 'portable', 'sanitizer'],
        path: '.github/workflows/ci.yml',
        root: ['concurrency', 'env', 'jobs', 'name', 'on', 'permissions'],
        steps: 33,
      },
      {
        jobs: ['contract', 'native'],
        path: '.github/workflows/ci-nightly.yml',
        root: ['concurrency', 'env', 'jobs', 'name', 'on', 'permissions'],
        steps: 8,
      },
    ],
    'independent workflow parse',
  );

  const lockPath = path.join(temporary, 'package-lock.json');
  const lockHash = sha256(readFileSync(lockPath));
  runNvm('22.23.1', ['corepack', 'npm', 'ci', '--ignore-scripts']);
  requireText(runNvm('22.23.1', ['corepack', 'npm', '--version']), '11.18.0', 'Node 22 npm');
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'dependencies:check']),
    'PASS dependency inventory: 91 npm development packages, 0 external Rust packages, 73 license/notice files, 1 duplicate family',
    'Node 22 dependency inventory',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'ci:check']),
    'PASS dependency reports: lock/license/duplicate inventory plus Node 22 live observation',
    'Node 22 CI contract',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'policy:javascript']),
    'Checked 60 files',
    'Node 22 JavaScript policy',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'policy:dependencies']),
    'PASS npm policy: 91 dev packages',
    'Node 22 dependency policy',
  );
  runNvm('22.23.1', ['corepack', 'npm', 'run', 'toolchain:types']);
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'fixtures:check']),
    'PASS fixture registry: 4 generators',
    'Node 22 deterministic fixtures',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'test']),
    'PASS all test suites:',
    'Node 22 aggregate tests',
  );
  assert(sha256(readFileSync(lockPath)) === lockHash, 'Node 22 install changed package lock');
  const replayInventoryBytes = readFileSync(path.join(temporary, 'dist/dependency/inventory-report.json'));
  assert(
    sha256(replayInventoryBytes) === sha256(inventoryBytes),
    'clean dependency inventory differs from retained report',
  );

  const liveOutput = runNvm('22.23.1', ['corepack', 'npm', 'run', 'dependencies:report']);
  requireText(liveOutput, 'PASS dependency observation: 0 npm vulnerabilities', 'live observation');
  const live = JSON.parse(
    readFileSync(path.join(temporary, 'dist/dependency/observation-report.json'), 'utf8'),
  );
  assert(live.verdict === 'pass', 'clean live observation verdict');
  same(live.npm.audit.vulnerabilities, audit.metadata.vulnerabilities, 'clean audit totals');
  assert(
    live.npm.provenance.registry_signatures_verified === 52 &&
      live.npm.provenance.registry_signatures_invalid === 0 &&
      live.npm.provenance.registry_signatures_missing === 0,
    'clean signature totals',
  );
  for (const required of ['@biomejs/biome', '@playwright/test', 'vite', 'vitest']) {
    assert(
      live.npm.provenance.attested_packages.some(({ name }) => name === required),
      required + ': clean provenance absent',
    );
  }

  const licenseOutput = runNvm('22.23.1', ['corepack', 'npm', 'run', 'dependencies:licenses']);
  requireText(
    licenseOutput,
    'PASS npm license refresh: 91 integrity-verified tarballs, 73 root license/notice files, 26 reviewed omissions',
    'license tarball refresh',
  );
  const replayLicensesBytes = readFileSync(
    path.join(temporary, 'dist/dependency/npm-license-refresh.json'),
  );
  assert(
    sha256(replayLicensesBytes) === sha256(licensesBytes),
    'clean license refresh differs from retained report',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'wasm:install-validator']),
    'PASS wasm-tools 1.253.0',
    'wasm-tools license-bound installer',
  );

  runNvm('24.18.0', ['corepack', 'npm', 'ci', '--ignore-scripts']);
  requireText(runNvm('24.18.0', ['corepack', 'npm', '--version']), '11.18.0', 'Node 24 npm');
  requireText(
    runNvm('24.18.0', ['corepack', 'npm', 'run', 'dependencies:check']),
    'PASS dependency inventory: 91 npm development packages, 0 external Rust packages, 73 license/notice files, 1 duplicate family',
    'Node 24 dependency inventory',
  );
  requireText(
    runNvm('24.18.0', ['corepack', 'npm', 'run', 'ci:check']),
    'PASS dependency reports: lock/license/duplicate inventory plus Node 22 live observation',
    'Node 24 CI contract',
  );
  assert(sha256(readFileSync(lockPath)) === lockHash, 'Node 24 install changed package lock');

  run('cargo', ['fmt', '--all', '--', '--check']);
  run('cargo', ['check', '--frozen', '--workspace', '--all-targets', '--all-features']);
  run('cargo', [
    'clippy',
    '--frozen',
    '--workspace',
    '--all-targets',
    '--all-features',
    '--',
    '-D',
    'warnings',
  ]);
  run('cargo', ['test', '--frozen', '--workspace', '--all-features', '--no-fail-fast']);

  const reportPolicyPath = path.join(temporary, 'tests/toolchain/dependency-report-policy.json');
  const reportPolicyOriginal = readFileSync(reportPolicyPath);
  const mutateJson = (file, original, change) => {
    const value = JSON.parse(original);
    change(value);
    writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  };
  mutateJson(reportPolicyPath, reportPolicyOriginal, (value) => {
    value.npm.license_tarballs.missing_text_exceptions[0].revalidate_by = 'P02-012';
  });
  expectNodeFailure(
    ['tests/toolchain/check-dependency-reports.mjs', 'offline'],
    'deadline rollback canary',
    'deadline mismatch',
  );
  writeFileSync(reportPolicyPath, reportPolicyOriginal);

  mutateJson(reportPolicyPath, reportPolicyOriginal, (value) => {
    value.npm.audit.maximum_vulnerabilities.total = 1;
  });
  expectNodeFailure(
    ['tests/toolchain/check-dependency-reports.mjs', 'offline'],
    'vulnerability threshold canary',
    'vulnerability threshold mismatch',
  );
  writeFileSync(reportPolicyPath, reportPolicyOriginal);

  const licenseAuthorityPath = path.join(temporary, '.github/ci/npm-license-inventory.json');
  const licenseAuthorityOriginal = readFileSync(licenseAuthorityPath);
  mutateJson(licenseAuthorityPath, licenseAuthorityOriginal, (value) => {
    value.package_lock_sha256 = '0'.repeat(64);
  });
  expectNodeFailure(
    ['tests/toolchain/check-dependency-reports.mjs', 'offline'],
    'license authority lock canary',
    'license authority package-lock digest mismatch',
  );
  writeFileSync(licenseAuthorityPath, licenseAuthorityOriginal);

  mutateJson(licenseAuthorityPath, licenseAuthorityOriginal, (value) => {
    value.packages[0].license_files[0].sha256 = '0'.repeat(64);
  });
  expectNodeFailure(
    ['tests/toolchain/check-dependency-reports.mjs', 'offline'],
    'installed license digest canary',
    'license text mismatch',
  );
  writeFileSync(licenseAuthorityPath, licenseAuthorityOriginal);

  const dependencyPolicyPath = path.join(temporary, 'tests/toolchain/dependency-policy.json');
  const dependencyPolicyOriginal = readFileSync(dependencyPolicyPath);
  mutateJson(dependencyPolicyPath, dependencyPolicyOriginal, (value) => {
    value.npm.allowed_duplicate_versions[0].versions = ['2.3.2'];
  });
  expectNodeFailure(
    ['tests/toolchain/check-dependency-reports.mjs', 'offline'],
    'duplicate inventory canary',
    'duplicate-version policy mismatch',
  );
  writeFileSync(dependencyPolicyPath, dependencyPolicyOriginal);

  mutateJson(reportPolicyPath, reportPolicyOriginal, (value) => {
    value.npm.license_tarballs.missing_text_exceptions.pop();
  });
  expectNodeFailure(
    ['tests/toolchain/check-dependency-reports.mjs', 'offline'],
    'missing-license exception canary',
    'missing license-text exception inventory mismatch',
  );
  writeFileSync(reportPolicyPath, reportPolicyOriginal);

  const installedWasmLicense = path.join(
    temporary,
    'target/toolchain/wasm-tools/1.253.0/wasm-tools-1.253.0-x86_64-linux/LICENSE-MIT',
  );
  const installedWasmLicenseOriginal = readFileSync(installedWasmLicense);
  writeFileSync(installedWasmLicense, Buffer.from('corrupt\n'));
  expectNodeFailure(
    ['tests/toolchain/install-wasm-tools.mjs'],
    'wasm-tools license canary',
    'byte count mismatch',
  );
  writeFileSync(installedWasmLicense, installedWasmLicenseOriginal);

  const ciPath = path.join(temporary, '.github/workflows/ci.yml');
  const ciOriginal = readFileSync(ciPath);
  writeFileSync(
    ciPath,
    ciOriginal
      .toString('utf8')
      .replace('run: corepack npm run dependencies:report', 'run: corepack npm run dependencies:check'),
  );
  expectNvmFailure(
    ['corepack', 'npm', 'run', 'ci:check'],
    'CI live observation canary',
    'gating workflow marker absent: corepack npm run dependencies:report',
  );
  writeFileSync(ciPath, ciOriginal);

  const lockOriginal = readFileSync(lockPath);
  mutateJson(lockPath, lockOriginal, (value) => {
    value.packages['node_modules/@biomejs/biome'].resolved =
      'https://packages.invalid.example/biome.tgz';
  });
  expectNodeFailure(
    ['tests/toolchain/check-dependency-reports.mjs', 'offline'],
    'registry source canary',
    'registry drift',
  );
  writeFileSync(lockPath, lockOriginal);

  mutateJson(lockPath, lockOriginal, (value) => {
    value.packages['node_modules/@biomejs/biome'].integrity = 'sha256-invalid';
  });
  expectNodeFailure(
    ['tests/toolchain/check-dependency-reports.mjs', 'offline'],
    'SRI canary',
    'SRI drift',
  );
  writeFileSync(lockPath, lockOriginal);

  const fakeDirectory = path.join(temporary, '.evidence-fake-bin');
  mkdirSync(fakeDirectory);
  const fakeCorepackPath = path.join(fakeDirectory, 'corepack');
  writeFileSync(
    fakeCorepackPath,
    [
      '#!/usr/bin/env node',
      "import { readFileSync } from 'node:fs';",
      'const args = process.argv.slice(2);',
      "if (args.join(' ') === 'npm --version') process.stdout.write(process.env.HELIX_FAKE_NPM_VERSION + '\\n');",
      "else if (args.join(' ') === 'npm config get registry') process.stdout.write(process.env.HELIX_FAKE_REGISTRY + '\\n');",
      "else if (args[0] === 'npm' && args[1] === 'audit' && args[2] === 'signatures') process.stdout.write(readFileSync(process.env.HELIX_FAKE_SIGNATURES));",
      "else if (args[0] === 'npm' && args[1] === 'audit') process.stdout.write(readFileSync(process.env.HELIX_FAKE_AUDIT));",
      "else { process.stderr.write('unsupported fake corepack command: ' + args.join(' ') + '\\n'); process.exitCode = 2; }",
      '',
    ].join('\n'),
  );
  chmodSync(fakeCorepackPath, 0o755);
  const fakeAuditPath = path.join(fakeDirectory, 'audit.json');
  const fakeSignaturesPath = path.join(fakeDirectory, 'signatures.json');
  writeFileSync(fakeAuditPath, auditBytes);
  writeFileSync(fakeSignaturesPath, signaturesRaw);
  const fakeEnvironment = {
    ...baseEnvironment,
    HELIX_FAKE_AUDIT: fakeAuditPath,
    HELIX_FAKE_NPM_VERSION: '11.18.0',
    HELIX_FAKE_REGISTRY: 'https://registry.npmjs.org/',
    HELIX_FAKE_SIGNATURES: fakeSignaturesPath,
    PATH: fakeDirectory + path.delimiter + process.env.PATH,
  };

  const vulnerableAudit = structuredClone(audit);
  vulnerableAudit.vulnerabilities = { example: { severity: 'high' } };
  vulnerableAudit.metadata.vulnerabilities.high = 1;
  vulnerableAudit.metadata.vulnerabilities.total = 1;
  writeFileSync(fakeAuditPath, JSON.stringify(vulnerableAudit));
  expectNodeFailure(
    ['tests/toolchain/check-dependency-reports.mjs', 'live'],
    'live vulnerability canary',
    'npm vulnerability counts mismatch',
    { env: fakeEnvironment },
  );
  writeFileSync(fakeAuditPath, auditBytes);

  const missingSignature = structuredClone(signatures);
  missingSignature.missing = [{ name: 'example', version: '1.0.0' }];
  writeFileSync(fakeSignaturesPath, JSON.stringify(missingSignature));
  expectNodeFailure(
    ['tests/toolchain/check-dependency-reports.mjs', 'live'],
    'missing signature canary',
    'missing registry signatures mismatch',
    { env: fakeEnvironment },
  );
  writeFileSync(fakeSignaturesPath, signaturesRaw);

  expectNodeFailure(
    ['tests/toolchain/check-dependency-reports.mjs', 'live'],
    'registry configuration canary',
    'npm report registry mismatch',
    {
      env: { ...fakeEnvironment, HELIX_FAKE_REGISTRY: 'https://packages.invalid.example/' },
    },
  );

  const missingRequiredProvenance = structuredClone(signatures);
  missingRequiredProvenance.verified = missingRequiredProvenance.verified.filter(
    ({ name }) => name !== '@biomejs/biome',
  );
  writeFileSync(fakeSignaturesPath, JSON.stringify(missingRequiredProvenance));
  expectNodeFailure(
    ['tests/toolchain/check-dependency-reports.mjs', 'live'],
    'required provenance canary',
    '@biomejs/biome: required provenance absent',
    { env: fakeEnvironment },
  );
  writeFileSync(fakeSignaturesPath, signaturesRaw);

  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'dependencies:check']),
    'PASS dependency inventory: 91 npm development packages',
    'post-canary dependency inventory',
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'wasm:install-validator']),
    'PASS wasm-tools 1.253.0',
    'post-canary wasm-tools authority',
  );
  const status = run('git', ['status', '--short', '--untracked-files=no']).trim();
  assert(status === '', 'clean replay source drift: ' + status);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write(
  'PASS P02-012 evidence: exact 23-file source commit, five retained reports, clean Node 22/24 and native replay, live vulnerability/provenance observation, 91 integrity-verified license tarballs, and 14 rejection canaries\n',
);

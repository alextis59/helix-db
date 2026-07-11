#!/usr/bin/env node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  artifactIdentity,
  assert,
  currentSourceControl,
  executionId,
  fileIdentity,
  findProducer,
  findProfile,
  jsonBytes,
  loadPolicy,
  readBytes,
  retentionClaimBoundary,
  sanitizeBrowserDiagnostic,
  sha256,
  validateBrowserExecutionReport,
  validateBundleManifest,
  validateDependencyDiagnostics,
  validatePolicy,
  validateSchemas,
} from './artifact-retention-contract.mjs';

const policy = loadPolicy();
validateSchemas();

const escapeCharacter = String.fromCodePoint(27);
const sanitizedDiagnostic = sanitizeBrowserDiagnostic(
  `prefix${escapeCharacter}[31mred${escapeCharacter}[0m${String.fromCodePoint(0)}${String.fromCodePoint(11)}suffix`,
  [['prefix', 'safe-']],
);
assert(sanitizedDiagnostic === 'safe-redsuffix', 'browser diagnostic control sanitization');
assert(
  sanitizeBrowserDiagnostic('x'.repeat(2100)).length === 2000,
  'browser diagnostic length bound',
);

const expectRejection = (label, marker, mutate, validate = validatePolicy) => {
  const candidate = structuredClone(policy);
  mutate(candidate);
  let rejected = false;
  try {
    validate(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(marker), `${label}: wrong rejection reason: ${message}`);
    rejected = true;
  }
  assert(rejected, `${label}: mutation unexpectedly passed`);
};

const expectValueRejection = (label, marker, base, mutate, validate) => {
  const candidate = structuredClone(base);
  mutate(candidate);
  let rejected = false;
  try {
    validate(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(marker), `${label}: wrong rejection reason: ${message}`);
    rejected = true;
  }
  assert(rejected, `${label}: mutation unexpectedly passed`);
};

const cases = [
  [
    'unknown policy schema',
    'retention policy schema',
    (value) => (value.schema = 'helix.artifact-retention-policy/2'),
  ],
  [
    'wrong upload action',
    'retention service mismatch',
    (value) => (value.service.action_sha = '0'.repeat(40)),
  ],
  [
    'overwrite enablement',
    'retention service mismatch',
    (value) => (value.service.overwrite = true),
  ],
  [
    'hidden-file enablement',
    'retention service mismatch',
    (value) => (value.service.include_hidden_files = true),
  ],
  [
    'compression weakening',
    'retention service mismatch',
    (value) => (value.service.compression_level = 0),
  ],
  [
    'service retention overflow',
    'retention service mismatch',
    (value) => (value.service.maximum_ci_retention_days = 91),
  ],
  ['profile removal', 'retention profile order mismatch', (value) => value.profiles.pop()],
  ['profile reordering', 'retention profile order mismatch', (value) => value.profiles.reverse()],
  [
    'active profile reservation',
    'active retention profiles mismatch',
    (value) => {
      value.profiles[1].state = 'reserved';
      value.profiles[1].activation_task = 'P99-999';
      value.profiles[1].producers = [];
    },
  ],
  [
    'reserved profile activation',
    'crash-matrices: active profile lacks producers',
    (value) => {
      value.profiles[2].state = 'active';
      value.profiles[2].activation_task = null;
    },
  ],
  [
    'reserved producer injection',
    'crash-matrices reserved producers mismatch',
    (value) => {
      value.profiles[2].producers = [structuredClone(value.profiles[1].producers[0])];
    },
  ],
  [
    'zero CI retention',
    'golden-formats CI retention: outside bounds',
    (value) => (value.profiles[0].ci_retention_days = 0),
  ],
  [
    'promotion bypass',
    'test-replays: promotion bypass',
    (value) => (value.profiles[1].promotion_required = false),
  ],
  [
    'active retention shortening',
    'retention profile postures mismatch',
    (value) => (value.profiles[1].ci_retention_days = 29),
  ],
  [
    'durable retention weakening',
    'retention profile postures mismatch',
    (value) => (value.profiles[1].durable_retention = 'delete-after-ci-expiry'),
  ],
  [
    'sensitivity drift',
    'retention profile postures mismatch',
    (value) => (value.profiles[3].sensitivity = 'redacted-public-or-access-controlled'),
  ],
  [
    'producer removal',
    'retention profile postures mismatch',
    (value) => value.profiles[1].producers.pop(),
  ],
  [
    'source-set reduction',
    'test-replays/semantic producer contract mismatch',
    (value) => value.profiles[1].producers[0].required_sources.pop(),
  ],
  [
    'output escape',
    'test-replays: output root',
    (value) => (value.profiles[1].producers[0].output = '../escape'),
  ],
  [
    'arbitrary collector program',
    'test-replays: collector must use Node',
    (value) => (value.profiles[1].producers[0].command[0] = 'sh'),
  ],
];

for (const [label, marker, mutate] of cases) expectRejection(label, marker, mutate);

const goldenProfile = findProfile(policy, 'golden-formats');
assert(findProducer(goldenProfile, 'hdoc-v1').variant === 'hdoc-v1', 'golden producer inactive');

let reservedRejected = false;
try {
  findProfile(policy, 'crash-matrices');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  assert(message.includes('reserved until P05-021'), `reserved profile reason: ${message}`);
  reservedRejected = true;
}
assert(reservedRejected, 'reserved crash matrix profile unexpectedly activated');

let engineRejected = false;
try {
  findProducer(findProfile(policy, 'browser-reports'), 'chrome');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  assert(
    message.includes('unsupported browser report engine'),
    `browser engine reason: ${message}`,
  );
  engineRejected = true;
}
assert(engineRejected, 'unapproved browser engine unexpectedly passed');

const bundleRoot = mkdtempSync(path.join(os.tmpdir(), 'helix-retention-contract-'));
let bundleCanaries = 0;
try {
  writeFileSync(path.join(bundleRoot, 'conformance.log'), 'PASS synthetic conformance\n');
  const profile = findProfile(policy, 'test-replays');
  const producer = findProducer(profile, 'semantic');
  const recordedAt = '2026-01-01T00:00:00.000Z';
  const environment = {
    provider: 'local',
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    github_run_id: null,
    github_run_attempt: null,
  };
  const manifest = {
    schema: 'helix.retained-artifact-bundle/1',
    plan_item: 'P02-015',
    profile: 'test-replays',
    variant: 'semantic',
    status: 'complete',
    recorded_at: recordedAt,
    execution_id: executionId(recordedAt, environment),
    source_control: currentSourceControl(),
    environment,
    retention: {
      ci_days: profile.ci_retention_days,
      durable: profile.durable_retention,
      promotion_required: profile.promotion_required,
      sensitivity: profile.sensitivity,
    },
    producer: {
      command: producer.command,
      upstream_command: producer.upstream_command,
      exit_code: 0,
    },
    source_inputs: producer.required_sources.map(fileIdentity),
    artifacts: [artifactIdentity(bundleRoot, 'conformance.log', 'raw-test-log')],
    failures: [],
    claim_boundary: retentionClaimBoundary,
    verdict: 'pass',
  };
  validateBundleManifest(manifest, bundleRoot);
  const bundleCases = [
    ['status contradiction', 'bundle status', (value) => (value.status = 'failed')],
    ['verdict contradiction', 'bundle verdict', (value) => (value.verdict = 'fail')],
    [
      'claim escalation',
      'bundle claim boundary',
      (value) => (value.claim_boundary = 'x'.repeat(80)),
    ],
    [
      'execution unlink',
      'bundle execution ID linkage',
      (value) => (value.execution_id = 'local-unlinked'),
    ],
    ['invalid artifact role', 'invalid role', (value) => (value.artifacts[0].role = 'raw log')],
    [
      'artifact substitution',
      'current identity',
      (value) => (value.artifacts[0].sha256 = '0'.repeat(64)),
    ],
  ];
  for (const [label, marker, mutate] of bundleCases) {
    expectValueRejection(label, marker, manifest, mutate, (candidate) =>
      validateBundleManifest(candidate, bundleRoot),
    );
  }
  bundleCanaries = bundleCases.length;
} finally {
  rmSync(bundleRoot, { recursive: true, force: true });
}

const browserReport = {
  schema: 'helix.browser-execution-report/1',
  plan_item: 'P02-015',
  recorded_at: '2026-01-01T00:00:00.000Z',
  selection: 'chromium',
  playwright_version: '1.61.1',
  browser_identities: [
    {
      engine: 'chromium',
      revision: '1228',
      browser_version: '149.0.7827.55',
      launcher_bytes: 1,
      launcher_sha256: '0'.repeat(64),
    },
  ],
  stats: { duration_ms: 1, expected: 1, skipped: 0, unexpected: 0, flaky: 0 },
  tests: [
    {
      file: 'tests/browser/bundle-smoke.spec.ts',
      line: 5,
      column: 1,
      title: 'synthetic browser smoke',
      project: 'chromium',
      status: 'passed',
      expected_status: 'passed',
      retry: 0,
      duration_ms: 1,
      errors: [],
      attachments: [],
    },
  ],
  failures: [],
  verdict: 'pass',
};
validateBrowserExecutionReport(browserReport, 'chromium', { compareAttachments: false });
const browserCases = [
  ['selection substitution', 'browser report selection', (value) => (value.selection = 'firefox')],
  [
    'launcher substitution',
    'launcher SHA-256',
    (value) => (value.browser_identities[0].launcher_sha256 = 'x'.repeat(64)),
  ],
  ['status-count substitution', 'status counts', (value) => (value.stats.expected = 0)],
  ['browser verdict contradiction', 'browser report verdict', (value) => (value.verdict = 'fail')],
  ['sensitive browser field', 'forbidden sensitive key', (value) => (value.host_name = 'private')],
  [
    'attachment path escape',
    'browser attachment path',
    (value) => {
      value.tests[0].attachments = [
        {
          name: 'trace',
          content_type: 'application/zip',
          path: 'test-results/../private.zip',
          bytes: 1,
          sha256: '0'.repeat(64),
        },
      ];
    },
  ],
];
for (const [label, marker, mutate] of browserCases) {
  expectValueRejection(label, marker, browserReport, mutate, (candidate) =>
    validateBrowserExecutionReport(candidate, 'chromium', { compareAttachments: false }),
  );
}

const dependencyRoot = mkdtempSync(path.join(os.tmpdir(), 'helix-dependency-retention-'));
let dependencyCanaries = 0;
try {
  const dependencyDirectory = path.join(dependencyRoot, 'dependency');
  mkdirSync(dependencyDirectory);
  const reportPolicy = JSON.parse(
    readBytes('tests/toolchain/dependency-report-policy.json').toString('utf8'),
  );
  const recordedAt = '2026-01-01T00:00:00.000Z';
  const manifestStub = {
    recorded_at: recordedAt,
    environment: { platform: process.platform, architecture: process.arch },
  };
  const createDependencySet = () => {
    const installed = reportPolicy.npm.signatures.required_attested_direct_packages.map(
      (name, index) => ({ name, path: `node_modules/direct-${index}`, version: '1.0.0' }),
    );
    const inventory = {
      schema: reportPolicy.reports.inventory_schema,
      plan_item: 'P02-012',
      inputs: {
        cargo_lock_sha256: sha256(readBytes('Cargo.lock')),
        dependency_policy_sha256: sha256(readBytes(reportPolicy.authorities.dependency_policy)),
        npm_license_inventory_sha256: sha256(
          readBytes(reportPolicy.authorities.npm_license_inventory),
        ),
        package_lock_sha256: sha256(readBytes('package-lock.json')),
        report_policy_sha256: sha256(readBytes('tests/toolchain/dependency-report-policy.json')),
        rust_license_inventory_sha256: sha256(
          readBytes(reportPolicy.authorities.rust_license_inventory),
        ),
        wasm_tools_authority_sha256: sha256(readBytes(reportPolicy.authorities.wasm_tools)),
      },
      environment: {
        architecture: process.arch,
        installed_tree: 'present',
        platform: process.platform,
      },
      npm: {
        installed_packages: installed,
        license_files: 73,
        locked_development_packages: reportPolicy.npm.expected_locked_packages,
      },
      rust: {
        external_packages: Array.from(
          { length: reportPolicy.rust.expected_external_packages },
          (_, index) => ({ name: `rust-package-${index}` }),
        ),
      },
      verdict: 'pass',
    };
    const cargoAudit = {
      database: {
        'advisory-count': 1000,
        'last-commit': '1'.repeat(40),
        'last-updated': '2025-12-31T00:00:00Z',
      },
      lockfile: {
        'dependency-count':
          reportPolicy.rust.workspace_packages + reportPolicy.rust.expected_external_packages,
      },
      settings: {
        target_arch: [],
        target_os: [],
        severity: null,
        ignore: [],
        informational_warnings: ['unmaintained', 'unsound', 'notice'],
      },
      vulnerabilities: { found: false, count: 0, list: [] },
      warnings: {},
    };
    const cargoAuditTool = structuredClone(cargoAudit);
    cargoAuditTool.database['last-commit'] = null;
    cargoAuditTool.database['last-updated'] = null;
    cargoAuditTool.lockfile['dependency-count'] =
      reportPolicy.rust.advisory.self_audit_expected_dependencies;
    const dependencies = { dev: 91, optional: 42, peer: 0, peerOptional: 0, prod: 1, total: 91 };
    const audit = {
      auditReportVersion: 2,
      vulnerabilities: {},
      metadata: {
        vulnerabilities: reportPolicy.npm.audit.maximum_vulnerabilities,
        dependencies,
      },
    };
    const verified = installed.map(({ name, path: location, version }) => ({
      location,
      name,
      version,
    }));
    const signatures = { invalid: [], missing: [], verified };
    const inventoryBytes = jsonBytes(inventory);
    const cargoAuditBytes = jsonBytes(cargoAudit);
    const cargoAuditToolBytes = jsonBytes(cargoAuditTool);
    const auditBytes = jsonBytes(audit);
    const signaturesBytes = jsonBytes(signatures);
    const observation = {
      schema: reportPolicy.reports.observation_schema,
      plan_item: 'P02-012',
      recorded_at: recordedAt,
      freshness: { maximum_age_hours: reportPolicy.live_report_max_age_hours },
      inputs: {
        inventory_report_bytes: inventoryBytes.length,
        inventory_report_sha256: sha256(inventoryBytes),
        cargo_lock_sha256: sha256(readBytes('Cargo.lock')),
        package_lock_sha256: sha256(readBytes('package-lock.json')),
        report_policy_sha256: sha256(readBytes('tests/toolchain/dependency-report-policy.json')),
      },
      registry: reportPolicy.npm.registry_prefix,
      npm: {
        audit: {
          audited_dependencies: dependencies,
          raw_bytes: auditBytes.length,
          raw_sha256: sha256(auditBytes),
          vulnerabilities: reportPolicy.npm.audit.maximum_vulnerabilities,
        },
        provenance: {
          attested_packages: verified,
          raw_bytes: signaturesBytes.length,
          raw_sha256: sha256(signaturesBytes),
          registry_signatures_invalid: 0,
          registry_signatures_missing: 0,
          registry_signatures_verified: installed.length,
        },
      },
      rust: {
        advisory_status: 'pass',
        external_packages: reportPolicy.rust.expected_external_packages,
        scanner: `cargo-audit ${reportPolicy.rust.advisory.version}`,
        database_revision: cargoAudit.database['last-commit'],
        database_updated_at: cargoAudit.database['last-updated'],
        advisory_count: cargoAudit.database['advisory-count'],
        audited_dependencies: cargoAudit.lockfile['dependency-count'],
        raw_bytes: cargoAuditBytes.length,
        raw_sha256: sha256(cargoAuditBytes),
        vulnerabilities: 0,
        warnings: 0,
        scanner_audited_dependencies: cargoAuditTool.lockfile['dependency-count'],
        scanner_raw_bytes: cargoAuditToolBytes.length,
        scanner_raw_sha256: sha256(cargoAuditToolBytes),
        scanner_vulnerabilities: 0,
        scanner_warnings: 0,
      },
      verdict: 'pass',
    };
    return { audit, cargoAudit, cargoAuditTool, inventory, observation, signatures };
  };
  const writeDependencySet = (documents) => {
    for (const [file, value] of [
      ['cargo-audit.json', documents.cargoAudit],
      ['cargo-audit-tool.json', documents.cargoAuditTool],
      ['inventory-report.json', documents.inventory],
      ['npm-audit.json', documents.audit],
      ['npm-signatures.json', documents.signatures],
      ['observation-report.json', documents.observation],
    ]) {
      writeFileSync(path.join(dependencyDirectory, file), jsonBytes(value));
    }
  };
  const cleanDocuments = createDependencySet();
  writeDependencySet(cleanDocuments);
  validateDependencyDiagnostics(dependencyRoot, manifestStub);
  const dependencyCases = [
    [
      'stale dependency policy linkage',
      'retained dependency inventory inputs',
      (value) => (value.inventory.inputs.report_policy_sha256 = '0'.repeat(64)),
    ],
    [
      'raw audit substitution',
      'retained raw audit linkage',
      (value) => (value.observation.npm.audit.raw_sha256 = '0'.repeat(64)),
    ],
    [
      'stale dependency observation',
      'retained dependency observation freshness',
      (value) => (value.observation.recorded_at = '2025-12-01T00:00:00.000Z'),
    ],
    [
      'Rust advisory substitution',
      'retained Rust advisory linkage',
      (value) => (value.observation.rust.raw_sha256 = '0'.repeat(64)),
    ],
    [
      'Rust vulnerability report',
      'Rust vulnerabilities',
      (value) => {
        value.cargoAudit.vulnerabilities = {
          found: true,
          count: 1,
          list: [{ advisory: { id: 'TEST' } }],
        };
      },
    ],
    [
      'Rust scanner vulnerability report',
      'Rust vulnerabilities',
      (value) => {
        value.cargoAuditTool.vulnerabilities = {
          found: true,
          count: 1,
          list: [{ advisory: { id: 'TEST' } }],
        };
      },
    ],
    [
      'missing registry signature',
      'retained missing npm signatures',
      (value) => (value.signatures.missing = ['node_modules/missing']),
    ],
  ];
  for (const [label, marker, mutate] of dependencyCases) {
    const candidate = createDependencySet();
    mutate(candidate);
    writeDependencySet(candidate);
    let rejected = false;
    try {
      validateDependencyDiagnostics(dependencyRoot, manifestStub);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assert(message.includes(marker), `${label}: wrong rejection reason: ${message}`);
      rejected = true;
    }
    assert(rejected, `${label}: mutation unexpectedly passed`);
  }
  dependencyCanaries = dependencyCases.length;
} finally {
  rmSync(dependencyRoot, { recursive: true, force: true });
}

process.stdout.write(
  `PASS artifact retention rejection canaries: ${cases.length + 2 + bundleCanaries + browserCases.length + dependencyCanaries} policy/profile/producer/reservation/engine/bundle/browser/dependency mutations rejected with exact reasons\n`,
);

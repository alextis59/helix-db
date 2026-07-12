import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCargoAuditReport } from './cargo-audit-contract.mjs';

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const policyPath = 'tests/toolchain/artifact-retention-policy.json';

export const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const canonical = (value) => {
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

export const same = (actual, expected, label) => {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
export const retentionClaimBoundary =
  'This diagnostic CI bundle proves only its named foundation replay; it is not durable gate evidence or a product, format, recovery, browser-support, or release claim until promoted and independently reviewed.';

export const resolveRepositoryPath = (relativePath) => {
  assert(typeof relativePath === 'string' && relativePath.length > 0, 'empty repository path');
  assert(!path.isAbsolute(relativePath), `absolute repository path: ${relativePath}`);
  const resolved = path.resolve(repository, relativePath);
  assert(
    resolved.startsWith(`${repository}${path.sep}`),
    `repository path escapes: ${relativePath}`,
  );
  return resolved;
};

export const readBytes = (relativePath) => readFileSync(resolveRepositoryPath(relativePath));
export const readJson = (relativePath) => JSON.parse(readBytes(relativePath).toString('utf8'));
export const fileIdentity = (relativePath) => {
  const bytes = readBytes(relativePath);
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
};

const strictKeys = (value, expected, label) => {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`);
  same(Object.keys(value).sort(), [...expected].sort(), `${label} fields`);
};

const safeInteger = (value, minimum, maximum, label) => {
  assert(Number.isSafeInteger(value), `${label}: expected safe integer`);
  assert(value >= minimum && value <= maximum, `${label}: outside bounds`);
};

const shortString = (value, label, maximum = 1000) => {
  assert(typeof value === 'string' && value.length > 0, `${label}: expected nonempty string`);
  assert(value.length <= maximum, `${label}: exceeds ${maximum} characters`);
  assert(
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint !== undefined &&
        (codePoint <= 8 || (codePoint >= 11 && codePoint <= 31) || codePoint === 127)
      );
    }),
    `${label}: contains a prohibited control character`,
  );
};

const ansiControlSequence = new RegExp(`${String.fromCodePoint(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');

export const sanitizeBrowserDiagnostic = (value, replacements = []) => {
  let sanitized = String(value);
  for (const [source, replacement] of replacements) {
    assert(typeof source === 'string' && source.length > 0, 'diagnostic replacement source');
    assert(typeof replacement === 'string', 'diagnostic replacement value');
    sanitized = sanitized.replaceAll(source, replacement);
  }
  sanitized = sanitized.replace(ansiControlSequence, '');
  return [...sanitized]
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint === undefined ||
        !(codePoint <= 8 || (codePoint >= 11 && codePoint <= 31) || codePoint === 127)
      );
    })
    .join('')
    .slice(0, 2000);
};

const shaPattern = /^[0-9a-f]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;
const sensitiveKey = /(?:^|_)(?:actor|email|host_?name|password|secret|token|user_?name)(?:_|$)/i;

const validateJsonSafe = (value, label = '$') => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    assert(Number.isSafeInteger(value), `${label}: non-integer or unsafe JSON number`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      validateJsonSafe(child, `${label}[${index}]`);
    });
    return;
  }
  assert(value && typeof value === 'object', `${label}: unsupported JSON value`);
  for (const [key, child] of Object.entries(value)) {
    assert(!sensitiveKey.test(key), `${label}: forbidden sensitive key ${key}`);
    validateJsonSafe(child, `${label}.${key}`);
  }
};

const resolveLocalReference = (schema, reference, label) => {
  assert(reference.startsWith('#/'), `${label}: only local schema references are allowed`);
  let current = schema;
  for (const token of reference
    .slice(2)
    .split('/')
    .map((entry) => entry.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    assert(current && Object.hasOwn(current, token), `${label}: unresolved reference ${reference}`);
    current = current[token];
  }
};

const validateStrictSchemaTree = (schema, value, label = '$') => {
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      validateStrictSchemaTree(schema, child, `${label}[${index}]`);
    });
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (value.$ref !== undefined) resolveLocalReference(schema, value.$ref, label);
  if (value.type === 'object') {
    assert(value.additionalProperties === false, `${label}: object schema is not closed`);
    assert(value.properties && typeof value.properties === 'object', `${label}: properties absent`);
    same(value.required ?? [], Object.keys(value.properties), `${label} required properties`);
  }
  for (const [key, child] of Object.entries(value)) {
    validateStrictSchemaTree(schema, child, `${label}.${key}`);
  }
};

const schemaIdentities = Object.freeze({
  'tests/toolchain/schema/artifact-retention-policy-v1.schema.json':
    'helix.artifact-retention-policy/1',
  'tests/toolchain/schema/retained-artifact-bundle-v1.schema.json':
    'helix.retained-artifact-bundle/1',
  'tests/toolchain/schema/browser-execution-report-v1.schema.json':
    'helix.browser-execution-report/1',
});

export const validateSchemas = () => {
  for (const [schemaPath, identity] of Object.entries(schemaIdentities)) {
    const schema = readJson(schemaPath);
    assert(
      schema.$schema === 'https://json-schema.org/draft/2020-12/schema',
      `${schemaPath}: draft mismatch`,
    );
    assert(
      typeof schema.$id === 'string' && schema.$id.startsWith('https://schemas.helix-db.invalid/'),
      `${schemaPath}: stable schema ID absent`,
    );
    assert(schema.properties.schema.const === identity, `${schemaPath}: identity mismatch`);
    validateStrictSchemaTree(schema, schema);
  }
  return Object.keys(schemaIdentities).length;
};

const expectedProfileIds = [
  'golden-formats',
  'test-replays',
  'crash-matrices',
  'browser-reports',
  'packaged-releases',
];

const expectedProfilePostures = {
  'golden-formats': {
    state: 'active',
    activation_task: null,
    ci_retention_days: 90,
    durable_retention: 'permanent-by-format-version',
    promotion_required: true,
    sensitivity: 'public-repository-data-only',
    maximum_bundle_bytes: 67108864,
    variants: ['hdoc-v1'],
  },
  'test-replays': {
    state: 'active',
    activation_task: null,
    ci_retention_days: 30,
    durable_retention: 'permanent-when-used-by-gate-or-release',
    promotion_required: true,
    sensitivity: 'public-repository-data-only',
    maximum_bundle_bytes: 8388608,
    variants: ['semantic', 'coverage'],
  },
  'crash-matrices': {
    state: 'reserved',
    activation_task: 'P05-021',
    ci_retention_days: 90,
    durable_retention: 'permanent-by-persistent-format-and-release-line',
    promotion_required: true,
    sensitivity: 'redacted-public-or-access-controlled',
    maximum_bundle_bytes: 536870912,
    variants: [],
  },
  'browser-reports': {
    state: 'active',
    activation_task: null,
    ci_retention_days: 30,
    durable_retention: 'supported-platform-lifetime-when-used-by-release',
    promotion_required: true,
    sensitivity: 'public-repository-data-only',
    maximum_bundle_bytes: 67108864,
    variants: ['engine'],
  },
  'packaged-releases': {
    state: 'reserved',
    activation_task: 'P16-010',
    ci_retention_days: 90,
    durable_retention: 'permanent-in-release-and-provenance-stores',
    promotion_required: true,
    sensitivity: 'public-release-material-only',
    maximum_bundle_bytes: 2147483648,
    variants: [],
  },
};

const expectedProducers = {
  'golden-formats/hdoc-v1': {
    variant: 'hdoc-v1',
    command: [
      'node',
      'tests/toolchain/collect-retained-artifacts.mjs',
      'golden-formats',
      'hdoc-v1',
    ],
    upstream_command: ['node', 'fixtures/hdoc/v1/check.mjs', '--check'],
    output: 'dist/retention/golden-formats/hdoc-v1',
    artifact_name_prefix: 'golden-formats-hdoc-v1',
    required_sources: [
      'crates/helix-doc/examples/hdoc_v1_golden.rs',
      'fixtures/hdoc/v1/check.mjs',
      'fixtures/hdoc/v1/manifest.json',
      'fixtures/hdoc/v1/schema/manifest-v1.schema.json',
    ],
    required_generated: [],
  },
  'test-replays/semantic': {
    variant: 'semantic',
    command: ['node', 'tests/toolchain/collect-retained-artifacts.mjs', 'test-replays', 'semantic'],
    upstream_command: ['node', 'tests/run-suite.mjs', 'conformance'],
    output: 'dist/retention/test-replays/semantic',
    artifact_name_prefix: 'test-replays-semantic-node',
    required_sources: [
      'fixtures/semantic/manifest.json',
      'fixtures/semantic/oracle-report-v1.json',
      'compatibility/v1/matrix-v1.json',
      'differential/mongodb/report-v1.json',
    ],
    required_generated: [],
  },
  'test-replays/coverage': {
    variant: 'coverage',
    command: ['node', 'tests/toolchain/collect-retained-artifacts.mjs', 'test-replays', 'coverage'],
    upstream_command: ['node', 'tests/toolchain/check-rust-coverage.mjs', 'run'],
    output: 'dist/retention/test-replays/coverage',
    artifact_name_prefix: 'test-replays-coverage',
    required_sources: [
      'tests/toolchain/rust-coverage-policy.json',
      'rust-toolchain.toml',
      'Cargo.lock',
    ],
    required_generated: ['dist/coverage/rust-coverage.json'],
  },
  'browser-reports/engine': {
    variant: 'engine',
    command: [
      'node',
      'tests/toolchain/collect-retained-artifacts.mjs',
      'browser-reports',
      '{engine}',
    ],
    upstream_command: ['node', 'tests/toolchain/run-browser-smoke.mjs', '{engine}'],
    output: 'dist/retention/browser-reports/{engine}',
    artifact_name_prefix: 'browser-reports',
    required_sources: [
      'examples/examples.json',
      'examples/browser-toolchain/README.md',
      'examples/browser-toolchain/index.html',
      'examples/browser-toolchain/main.ts',
      'examples/browser-toolchain/report.ts',
      'conformance/host/abi-v7-explicit-copy.vectors',
      'docs/architecture/browser-host-skeleton-v1.json',
      'docs/architecture/host-capability-isolation-v1.json',
      'docs/architecture/host-boundary-tracing-v1.json',
      'docs/architecture/host-abi-conformance-v1.json',
      'packages/browser-host/src/index.ts',
      'playwright.config.ts',
      'tests/browser/browser-host.spec.ts',
      'tests/browser/capability-isolation.spec.ts',
      'tests/browser/bundle-smoke.spec.ts',
      'tests/browser/hdoc-fuzz-replay.spec.ts',
      'tests/browser/host-conformance.spec.ts',
      'tests/toolchain/dependency-report-policy.json',
    ],
    required_generated: [
      'dist/validation/wasm-browser-smoke.json',
      'dist/validation/browser-bundle-smoke.json',
      'dist/validation/browser-execution-{engine}.json',
    ],
  },
};

export const validatePolicy = (candidate = readJson(policyPath)) => {
  validateJsonSafe(candidate);
  strictKeys(
    candidate,
    ['schema', 'plan_item', 'output_root', 'schemas', 'service', 'profiles'],
    'retention policy',
  );
  assert(candidate.schema === 'helix.artifact-retention-policy/1', 'retention policy schema');
  assert(candidate.plan_item === 'P02-015', 'retention policy plan item');
  assert(candidate.output_root === 'dist/retention', 'retention output root');
  same(
    candidate.schemas,
    {
      policy: 'tests/toolchain/schema/artifact-retention-policy-v1.schema.json',
      bundle: 'tests/toolchain/schema/retained-artifact-bundle-v1.schema.json',
      browser_execution: 'tests/toolchain/schema/browser-execution-report-v1.schema.json',
    },
    'retention schema paths',
  );
  same(
    candidate.service,
    {
      provider: 'github-actions',
      action_repository: 'actions/upload-artifact',
      action_version: '7.0.1',
      action_sha: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      artifact_model: 'immutable-unless-deleted',
      maximum_ci_retention_days: 90,
      workflow_permission: 'contents:read',
      if_no_files_found: 'error',
      overwrite: false,
      include_hidden_files: false,
      archive: true,
      compression_level: 9,
    },
    'retention service',
  );
  assert(Array.isArray(candidate.profiles), 'retention profiles must be an array');
  same(
    candidate.profiles.map(({ id }) => id),
    expectedProfileIds,
    'retention profile order',
  );
  for (const profile of candidate.profiles) {
    strictKeys(
      profile,
      [
        'id',
        'state',
        'current_scope',
        'activation_task',
        'ci_retention_days',
        'durable_retention',
        'promotion_required',
        'sensitivity',
        'maximum_bundle_bytes',
        'producers',
      ],
      `${profile.id} profile`,
    );
    assert(expectedProfileIds.includes(profile.id), `${profile.id}: unknown profile`);
    assert(['active', 'reserved'].includes(profile.state), `${profile.id}: invalid state`);
    shortString(profile.current_scope, `${profile.id} scope`, 300);
    safeInteger(profile.ci_retention_days, 1, 90, `${profile.id} CI retention`);
    shortString(profile.durable_retention, `${profile.id} durable retention`, 100);
    assert(profile.promotion_required === true, `${profile.id}: promotion bypass`);
    safeInteger(profile.maximum_bundle_bytes, 1048576, 2147483648, `${profile.id} maximum bytes`);
    assert(Array.isArray(profile.producers), `${profile.id}: producers must be an array`);
    if (profile.state === 'reserved') {
      assert(/^P\d{2}-\d{3}$/.test(profile.activation_task), `${profile.id}: activation task`);
      same(profile.producers, [], `${profile.id} reserved producers`);
    } else {
      assert(profile.activation_task === null, `${profile.id}: active activation task`);
      assert(profile.producers.length > 0, `${profile.id}: active profile lacks producers`);
    }
    const variants = new Set();
    for (const producer of profile.producers) {
      strictKeys(
        producer,
        [
          'variant',
          'command',
          'upstream_command',
          'output',
          'artifact_name_prefix',
          'required_sources',
          'required_generated',
        ],
        `${profile.id}/${producer.variant} producer`,
      );
      assert(!variants.has(producer.variant), `${profile.id}: duplicate producer variant`);
      variants.add(producer.variant);
      assert(/^[a-z][a-z0-9-]*$/.test(producer.variant), `${profile.id}: invalid producer variant`);
      for (const command of [producer.command, producer.upstream_command]) {
        assert(Array.isArray(command) && command.length >= 3, `${profile.id}: command shape`);
        command.forEach((part) => {
          shortString(part, `${profile.id} command part`, 200);
        });
      }
      assert(producer.command[0] === 'node', `${profile.id}: collector must use Node`);
      assert(producer.output.startsWith(`${candidate.output_root}/`), `${profile.id}: output root`);
      resolveRepositoryPath(producer.output.replaceAll('{engine}', 'chromium'));
      assert(
        /^[a-z][a-z0-9-]*$/.test(producer.artifact_name_prefix),
        `${profile.id}: artifact name prefix`,
      );
      assert(Array.isArray(producer.required_sources), `${profile.id}: required sources`);
      assert(Array.isArray(producer.required_generated), `${profile.id}: generated inputs`);
      for (const source of producer.required_sources) {
        resolveRepositoryPath(source);
        assert(
          statSync(resolveRepositoryPath(source)).isFile(),
          `${profile.id}: source absent ${source}`,
        );
      }
      for (const generated of producer.required_generated) {
        resolveRepositoryPath(generated.replaceAll('{engine}', 'chromium'));
      }
      same(
        producer,
        expectedProducers[`${profile.id}/${producer.variant}`],
        `${profile.id}/${producer.variant} producer contract`,
      );
    }
  }
  same(
    candidate.profiles.filter(({ state }) => state === 'active').map(({ id }) => id),
    ['golden-formats', 'test-replays', 'browser-reports'],
    'active retention profiles',
  );
  same(
    candidate.profiles.filter(({ state }) => state === 'reserved').map(({ id }) => id),
    ['crash-matrices', 'packaged-releases'],
    'reserved retention profiles',
  );
  same(
    Object.fromEntries(
      candidate.profiles.map((profile) => [
        profile.id,
        {
          state: profile.state,
          activation_task: profile.activation_task,
          ci_retention_days: profile.ci_retention_days,
          durable_retention: profile.durable_retention,
          promotion_required: profile.promotion_required,
          sensitivity: profile.sensitivity,
          maximum_bundle_bytes: profile.maximum_bundle_bytes,
          variants: profile.producers.map(({ variant }) => variant),
        },
      ]),
    ),
    expectedProfilePostures,
    'retention profile postures',
  );
  return candidate;
};

export const loadPolicy = () => validatePolicy();

export const findProfile = (policy, profileId) => {
  const matches = policy.profiles.filter(({ id }) => id === profileId);
  assert(matches.length === 1, `unknown or duplicate retention profile: ${profileId}`);
  const profile = matches[0];
  assert(
    profile.state === 'active',
    `${profileId}: retention profile is reserved until ${profile.activation_task}`,
  );
  return profile;
};

export const findProducer = (profile, variant) => {
  if (profile.id === 'browser-reports') {
    assert(
      ['chromium', 'firefox', 'webkit'].includes(variant),
      `unsupported browser report engine: ${variant}`,
    );
    const producer = profile.producers.find(({ variant: candidate }) => candidate === 'engine');
    return resolveProducerTemplates(producer, variant);
  }
  const matches = profile.producers.filter(({ variant: candidate }) => candidate === variant);
  assert(matches.length === 1, `${profile.id}: unknown or duplicate variant ${variant}`);
  return matches[0];
};

const resolveProducerTemplates = (producer, engine) => {
  const replace = (value) => value.replaceAll('{engine}', engine);
  return {
    ...producer,
    variant: engine,
    command: producer.command.map(replace),
    upstream_command: producer.upstream_command.map(replace),
    output: replace(producer.output),
    required_sources: producer.required_sources.map(replace),
    required_generated: producer.required_generated.map(replace),
  };
};

const gitText = (arguments_) =>
  execFileSync('git', arguments_, {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  }).trim();

export const currentSourceControl = () => ({
  commit: gitText(['rev-parse', 'HEAD']),
  dirty: gitText(['status', '--porcelain=v1', '--untracked-files=all']).length > 0,
});

export const currentEnvironment = () => {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    return {
      provider: 'local',
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      github_run_id: null,
      github_run_attempt: null,
    };
  }
  const runId = process.env.GITHUB_RUN_ID;
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT;
  assert(typeof runId === 'string' && /^\d+$/.test(runId), 'invalid GitHub run ID');
  assert(typeof runAttempt === 'string' && /^\d+$/.test(runAttempt), 'invalid GitHub run attempt');
  return {
    provider: 'github-actions',
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    github_run_id: runId,
    github_run_attempt: Number(runAttempt),
  };
};

export const executionId = (recordedAt, environment) =>
  environment.provider === 'github-actions'
    ? `github-${environment.github_run_id}-${environment.github_run_attempt}`
    : `local-${recordedAt}`;

export const listFiles = (root, relative = '') => {
  const result = [];
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    const child = path.join(relative, entry.name);
    const details = lstatSync(path.join(root, child));
    assert(!details.isSymbolicLink(), `retained bundle contains a symlink: ${child}`);
    if (details.isDirectory()) result.push(...listFiles(root, child));
    else if (details.isFile()) result.push(child.split(path.sep).join('/'));
    else throw new Error(`retained bundle contains an unsupported entry: ${child}`);
  }
  return result;
};

const validateFileIdentity = (identity, label, root = repository) => {
  strictKeys(identity, ['path', 'bytes', 'sha256'], label);
  shortString(identity.path, `${label} path`, 300);
  safeInteger(identity.bytes, 1, 2147483648, `${label} bytes`);
  assert(shaPattern.test(identity.sha256), `${label}: invalid SHA-256`);
  const absolute = path.resolve(root, identity.path);
  assert(absolute.startsWith(`${root}${path.sep}`), `${label}: path escapes root`);
  const bytes = readFileSync(absolute);
  same(
    identity,
    { path: identity.path, bytes: bytes.length, sha256: sha256(bytes) },
    `${label} current identity`,
  );
};

const dependencyReportPolicy = () => readJson('tests/toolchain/dependency-report-policy.json');

export const validateDependencyDiagnostics = (bundleRoot, manifest) => {
  const reportPolicy = dependencyReportPolicy();
  const artifactBytes = (file) => readFileSync(path.join(bundleRoot, 'dependency', file));
  const artifactJson = (file) => JSON.parse(artifactBytes(file).toString('utf8'));
  const inventoryBytes = artifactBytes('inventory-report.json');
  const cargoAuditBytes = artifactBytes('cargo-audit.json');
  const cargoAuditToolBytes = artifactBytes('cargo-audit-tool.json');
  const auditBytes = artifactBytes('npm-audit.json');
  const signaturesBytes = artifactBytes('npm-signatures.json');
  const inventory = JSON.parse(inventoryBytes.toString('utf8'));
  const cargoAudit = JSON.parse(cargoAuditBytes.toString('utf8'));
  const cargoAuditTool = JSON.parse(cargoAuditToolBytes.toString('utf8'));
  const audit = JSON.parse(auditBytes.toString('utf8'));
  const signatures = JSON.parse(signaturesBytes.toString('utf8'));
  const observation = artifactJson('observation-report.json');

  assert(
    inventory.schema === reportPolicy.reports.inventory_schema &&
      inventory.plan_item === 'P02-012' &&
      inventory.verdict === 'pass',
    'retained dependency inventory identity or verdict',
  );
  same(
    inventory.inputs,
    {
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
    'retained dependency inventory inputs',
  );
  same(
    inventory.environment,
    {
      architecture: manifest.environment.architecture,
      installed_tree: 'present',
      platform: manifest.environment.platform,
    },
    'retained dependency inventory environment',
  );
  assert(
    inventory.npm.locked_development_packages === reportPolicy.npm.expected_locked_packages &&
      inventory.npm.license_files === 73 &&
      inventory.rust.external_packages.length === reportPolicy.rust.expected_external_packages,
    'retained dependency inventory counts',
  );

  const rustAudit = validateCargoAuditReport(
    cargoAudit,
    reportPolicy.rust.workspace_packages + reportPolicy.rust.expected_external_packages,
  );
  const rustToolAudit = validateCargoAuditReport(
    cargoAuditTool,
    reportPolicy.rust.advisory.self_audit_expected_dependencies,
    { requireDatabaseMetadata: false },
  );

  assert(audit.auditReportVersion === 2, 'retained npm audit version');
  same(audit.vulnerabilities, {}, 'retained npm audit vulnerabilities');
  same(
    audit.metadata.vulnerabilities,
    reportPolicy.npm.audit.maximum_vulnerabilities,
    'retained npm audit counts',
  );
  same(signatures.invalid, [], 'retained invalid npm signatures');
  same(signatures.missing, [], 'retained missing npm signatures');
  assert(Array.isArray(signatures.verified), 'retained npm attestations absent');
  same(
    signatures.verified.map(({ location }) => location),
    [...new Set(signatures.verified.map(({ location }) => location))],
    'retained npm attestation locations',
  );

  assert(
    observation.schema === reportPolicy.reports.observation_schema &&
      observation.plan_item === 'P02-012' &&
      observation.verdict === 'pass',
    'retained dependency observation identity or verdict',
  );
  same(
    observation.freshness,
    { maximum_age_hours: reportPolicy.live_report_max_age_hours },
    'retained dependency observation freshness policy',
  );
  const observationTime = Date.parse(observation.recorded_at);
  const bundleTime = Date.parse(manifest.recorded_at);
  assert(Number.isFinite(observationTime), 'retained dependency observation time');
  assert(
    bundleTime - observationTime >= -300000 &&
      bundleTime - observationTime <= reportPolicy.live_report_max_age_hours * 3600000,
    'retained dependency observation freshness',
  );
  same(
    observation.inputs,
    {
      inventory_report_bytes: inventoryBytes.length,
      inventory_report_sha256: sha256(inventoryBytes),
      cargo_lock_sha256: sha256(readBytes('Cargo.lock')),
      package_lock_sha256: sha256(readBytes('package-lock.json')),
      report_policy_sha256: sha256(readBytes('tests/toolchain/dependency-report-policy.json')),
    },
    'retained dependency observation inputs',
  );
  assert(observation.registry === reportPolicy.npm.registry_prefix, 'retained npm registry');
  same(
    observation.npm.audit.vulnerabilities,
    audit.metadata.vulnerabilities,
    'retained audit-observation counts',
  );
  same(
    observation.npm.audit.audited_dependencies,
    audit.metadata.dependencies,
    'retained audit dependency counts',
  );
  assert(
    observation.npm.audit.raw_bytes === auditBytes.length &&
      observation.npm.audit.raw_sha256 === sha256(auditBytes),
    'retained raw audit linkage',
  );
  assert(
    observation.rust.advisory_status === 'pass' &&
      observation.rust.external_packages === reportPolicy.rust.expected_external_packages &&
      observation.rust.scanner === `cargo-audit ${reportPolicy.rust.advisory.version}` &&
      observation.rust.database_revision === rustAudit.database_revision &&
      observation.rust.database_updated_at === rustAudit.database_updated_at &&
      observation.rust.advisory_count === rustAudit.advisory_count &&
      observation.rust.audited_dependencies === rustAudit.dependency_count &&
      observation.rust.raw_bytes === cargoAuditBytes.length &&
      observation.rust.raw_sha256 === sha256(cargoAuditBytes) &&
      observation.rust.vulnerabilities === 0 &&
      observation.rust.warnings === 0 &&
      observation.rust.scanner_audited_dependencies === rustToolAudit.dependency_count &&
      observation.rust.scanner_raw_bytes === cargoAuditToolBytes.length &&
      observation.rust.scanner_raw_sha256 === sha256(cargoAuditToolBytes) &&
      observation.rust.scanner_vulnerabilities === 0 &&
      observation.rust.scanner_warnings === 0,
    'retained Rust advisory linkage',
  );
  assert(
    observation.npm.provenance.raw_bytes === signaturesBytes.length &&
      observation.npm.provenance.raw_sha256 === sha256(signaturesBytes),
    'retained raw signature linkage',
  );
  assert(
    observation.npm.provenance.registry_signatures_invalid === 0 &&
      observation.npm.provenance.registry_signatures_missing === 0 &&
      observation.npm.provenance.registry_signatures_verified ===
        inventory.npm.installed_packages.length,
    'retained registry signature counts',
  );
  assert(
    observation.npm.provenance.attested_packages.length === signatures.verified.length,
    'retained attestation count linkage',
  );
  same(
    observation.npm.provenance.attested_packages.map(({ location, name, version }) => ({
      location,
      name,
      version,
    })),
    signatures.verified
      .map(({ location, name, version }) => ({ location, name, version }))
      .sort((left, right) => left.location.localeCompare(right.location)),
    'retained attestation identity linkage',
  );
  for (const name of reportPolicy.npm.signatures.required_attested_direct_packages) {
    assert(
      observation.npm.provenance.attested_packages.some((entry) => entry.name === name),
      `retained required provenance absent: ${name}`,
    );
  }
};

export const validateBrowserExecutionReport = (
  report,
  expectedSelection,
  { compareAttachments = true } = {},
) => {
  validateJsonSafe(report);
  strictKeys(
    report,
    [
      'schema',
      'plan_item',
      'recorded_at',
      'selection',
      'playwright_version',
      'browser_identities',
      'stats',
      'tests',
      'failures',
      'verdict',
    ],
    'browser execution report',
  );
  assert(report.schema === 'helix.browser-execution-report/1', 'browser report schema');
  assert(report.plan_item === 'P02-015', 'browser report plan item');
  assert(new Date(report.recorded_at).toISOString() === report.recorded_at, 'browser report time');
  assert(report.selection === expectedSelection, 'browser report selection');
  assert(report.playwright_version === '1.61.1', 'browser report Playwright version');
  const engines =
    expectedSelection === 'all' ? ['chromium', 'firefox', 'webkit'] : [expectedSelection];
  same(
    report.browser_identities.map(({ engine }) => engine),
    engines,
    'browser identity engines',
  );
  const expectedBrowsers =
    dependencyReportPolicy().external_tools.playwright_browsers.expected_default_browsers;
  for (const identity of report.browser_identities) {
    strictKeys(
      identity,
      ['engine', 'revision', 'browser_version', 'launcher_bytes', 'launcher_sha256'],
      `${identity.engine} browser identity`,
    );
    const expected = expectedBrowsers.find(({ name }) => name === identity.engine);
    assert(expected, `${identity.engine}: browser policy identity absent`);
    assert(identity.revision === expected.revision, `${identity.engine}: browser revision drift`);
    assert(
      identity.browser_version === expected.browser_version,
      `${identity.engine}: browser version drift`,
    );
    safeInteger(identity.launcher_bytes, 1, 1073741824, `${identity.engine} launcher bytes`);
    assert(shaPattern.test(identity.launcher_sha256), `${identity.engine}: launcher SHA-256`);
  }
  strictKeys(
    report.stats,
    ['duration_ms', 'expected', 'skipped', 'unexpected', 'flaky'],
    'browser stats',
  );
  for (const [key, value] of Object.entries(report.stats)) {
    safeInteger(value, 0, key === 'duration_ms' ? 3600000 : 1000, `browser stats ${key}`);
  }
  assert(Array.isArray(report.tests) && report.tests.length > 0, 'browser tests absent');
  const statusCounts = { expected: 0, skipped: 0, unexpected: 0, flaky: 0 };
  for (const [index, test] of report.tests.entries()) {
    strictKeys(
      test,
      [
        'file',
        'line',
        'column',
        'title',
        'project',
        'status',
        'expected_status',
        'retry',
        'duration_ms',
        'errors',
        'attachments',
      ],
      `browser test ${index}`,
    );
    assert(
      [
        'tests/browser/browser-host.spec.ts',
        'tests/browser/capability-isolation.spec.ts',
        'tests/browser/bundle-smoke.spec.ts',
        'tests/browser/hdoc-fuzz-replay.spec.ts',
        'tests/browser/host-conformance.spec.ts',
      ].includes(test.file),
      `browser test ${index}: file`,
    );
    safeInteger(test.line, 1, 1000000, `browser test ${index} line`);
    safeInteger(test.column, 1, 1000000, `browser test ${index} column`);
    shortString(test.title, `browser test ${index} title`, 500);
    assert(engines.includes(test.project), `browser test ${index}: project`);
    assert(
      ['passed', 'failed', 'timedOut', 'skipped', 'interrupted'].includes(test.status),
      `browser test ${index}: status`,
    );
    assert(
      ['passed', 'failed', 'skipped'].includes(test.expected_status),
      `browser test ${index}: expected status`,
    );
    safeInteger(test.retry, 0, 100, `browser test ${index} retry`);
    safeInteger(test.duration_ms, 0, 3600000, `browser test ${index} duration`);
    assert(Array.isArray(test.errors), `browser test ${index}: errors`);
    test.errors.forEach((error, errorIndex) => {
      shortString(error, `browser error ${errorIndex}`, 2000);
    });
    assert(Array.isArray(test.attachments), `browser test ${index}: attachments`);
    for (const [attachmentIndex, attachment] of test.attachments.entries()) {
      strictKeys(
        attachment,
        ['name', 'content_type', 'path', 'bytes', 'sha256'],
        `browser attachment ${attachmentIndex}`,
      );
      shortString(attachment.name, `browser attachment ${attachmentIndex} name`, 200);
      shortString(
        attachment.content_type,
        `browser attachment ${attachmentIndex} content type`,
        100,
      );
      assert(
        /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(attachment.content_type),
        'browser attachment content type',
      );
      assert(
        attachment.path.startsWith('test-results/') &&
          path.posix.normalize(attachment.path) === attachment.path,
        'browser attachment path',
      );
      safeInteger(attachment.bytes, 1, 67108864, 'browser attachment bytes');
      assert(shaPattern.test(attachment.sha256), 'browser attachment SHA-256');
      if (compareAttachments) {
        validateFileIdentity(
          { path: attachment.path, bytes: attachment.bytes, sha256: attachment.sha256 },
          `browser attachment ${attachmentIndex}`,
        );
      }
    }
    if (test.status === test.expected_status && test.retry === 0) statusCounts.expected += 1;
    else if (test.status === 'skipped') statusCounts.skipped += 1;
    else if (test.status === 'passed' && test.retry > 0) statusCounts.flaky += 1;
    else statusCounts.unexpected += 1;
  }
  same(
    {
      expected: report.stats.expected,
      skipped: report.stats.skipped,
      unexpected: report.stats.unexpected,
      flaky: report.stats.flaky,
    },
    statusCounts,
    'browser report status counts',
  );
  assert(Array.isArray(report.failures), 'browser report failures');
  report.failures.forEach((failure, index) => {
    shortString(failure, `browser failure ${index}`, 2000);
  });
  const passed = report.stats.unexpected === 0 && report.failures.length === 0;
  assert(report.verdict === (passed ? 'pass' : 'fail'), 'browser report verdict');
  return report;
};

const mediaTypeFor = (artifactPath) => {
  if (artifactPath.endsWith('.json')) return 'application/json';
  if (artifactPath.endsWith('.log') || artifactPath.endsWith('.txt')) return 'text/plain';
  if (artifactPath.endsWith('.png')) return 'image/png';
  if (artifactPath.endsWith('.zip')) return 'application/zip';
  if (artifactPath.endsWith('.webm')) return 'video/webm';
  return 'application/octet-stream';
};

export const artifactIdentity = (bundleRoot, artifactPath, role) => {
  const absolute = path.join(bundleRoot, artifactPath);
  const bytes = readFileSync(absolute);
  return {
    path: artifactPath,
    media_type: mediaTypeFor(artifactPath),
    role,
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
};

export const validateBundleManifest = (manifest, bundleRoot, { requireComplete = true } = {}) => {
  const policy = loadPolicy();
  validateJsonSafe(manifest);
  strictKeys(
    manifest,
    [
      'schema',
      'plan_item',
      'profile',
      'variant',
      'status',
      'recorded_at',
      'execution_id',
      'source_control',
      'environment',
      'retention',
      'producer',
      'source_inputs',
      'artifacts',
      'failures',
      'claim_boundary',
      'verdict',
    ],
    'retained bundle manifest',
  );
  assert(manifest.schema === 'helix.retained-artifact-bundle/1', 'retained bundle schema');
  assert(manifest.plan_item === 'P02-015', 'retained bundle plan item');
  const profile = findProfile(policy, manifest.profile);
  const producer = findProducer(profile, manifest.variant);
  assert(['complete', 'failed'].includes(manifest.status), 'retained bundle status');
  assert(new Date(manifest.recorded_at).toISOString() === manifest.recorded_at, 'bundle time');
  shortString(manifest.execution_id, 'bundle execution ID', 160);
  strictKeys(manifest.source_control, ['commit', 'dirty'], 'bundle source control');
  assert(commitPattern.test(manifest.source_control.commit), 'bundle source commit');
  assert(typeof manifest.source_control.dirty === 'boolean', 'bundle dirty state');
  strictKeys(
    manifest.environment,
    ['provider', 'platform', 'architecture', 'node', 'github_run_id', 'github_run_attempt'],
    'bundle environment',
  );
  assert(['local', 'github-actions'].includes(manifest.environment.provider), 'bundle provider');
  if (manifest.environment.provider === 'local') {
    assert(
      manifest.environment.github_run_id === null &&
        manifest.environment.github_run_attempt === null,
      'local bundle has GitHub metadata',
    );
  } else {
    assert(/^\d+$/.test(manifest.environment.github_run_id), 'bundle GitHub run ID');
    safeInteger(manifest.environment.github_run_attempt, 1, 1000000, 'bundle run attempt');
  }
  shortString(manifest.environment.platform, 'bundle platform', 40);
  shortString(manifest.environment.architecture, 'bundle architecture', 40);
  assert(/^v\d+\.\d+\.\d+/.test(manifest.environment.node), 'bundle Node version');
  assert(
    manifest.execution_id === executionId(manifest.recorded_at, manifest.environment),
    'bundle execution ID linkage',
  );
  same(
    manifest.retention,
    {
      ci_days: profile.ci_retention_days,
      durable: profile.durable_retention,
      promotion_required: profile.promotion_required,
      sensitivity: profile.sensitivity,
    },
    'bundle retention',
  );
  strictKeys(manifest.producer, ['command', 'upstream_command', 'exit_code'], 'bundle producer');
  same(manifest.producer.command, producer.command, 'bundle collector command');
  same(manifest.producer.upstream_command, producer.upstream_command, 'bundle upstream command');
  safeInteger(manifest.producer.exit_code, 0, 255, 'bundle producer exit code');
  assert(Array.isArray(manifest.source_inputs), 'bundle source inputs');
  same(
    manifest.source_inputs.map(({ path: sourcePath }) => sourcePath),
    producer.required_sources,
    'bundle source input paths',
  );
  manifest.source_inputs.forEach((identity, index) => {
    validateFileIdentity(identity, `bundle source ${index}`);
  });
  assert(Array.isArray(manifest.artifacts), 'bundle artifacts');
  same(
    manifest.artifacts.map(({ path: artifactPath }) => artifactPath),
    [...manifest.artifacts.map(({ path: artifactPath }) => artifactPath)].sort(),
    'bundle artifact ordering',
  );
  same(
    manifest.artifacts.map(({ path: artifactPath }) => artifactPath),
    [...new Set(manifest.artifacts.map(({ path: artifactPath }) => artifactPath))],
    'bundle artifact uniqueness',
  );
  for (const [index, artifact] of manifest.artifacts.entries()) {
    strictKeys(
      artifact,
      ['path', 'media_type', 'role', 'bytes', 'sha256'],
      `bundle artifact ${index}`,
    );
    shortString(artifact.role, `bundle artifact ${index} role`, 100);
    assert(/^[a-z][a-z0-9-]*$/.test(artifact.role), `bundle artifact ${index}: invalid role`);
    validateFileIdentity(
      { path: artifact.path, bytes: artifact.bytes, sha256: artifact.sha256 },
      `bundle artifact ${index}`,
      bundleRoot,
    );
    assert(
      artifact.media_type === mediaTypeFor(artifact.path),
      `bundle artifact ${index}: media type`,
    );
  }
  const actualFiles = listFiles(bundleRoot).filter((file) => file !== 'manifest.json');
  same(
    actualFiles,
    manifest.artifacts.map(({ path: artifactPath }) => artifactPath),
    'bundle file inventory',
  );
  const totalBytes = manifest.artifacts.reduce((total, artifact) => total + artifact.bytes, 0);
  assert(totalBytes <= profile.maximum_bundle_bytes, 'retained bundle exceeds profile size cap');
  assert(Array.isArray(manifest.failures), 'bundle failures');
  manifest.failures.forEach((failure, index) => {
    shortString(failure, `bundle failure ${index}`, 1000);
  });
  assert(manifest.claim_boundary === retentionClaimBoundary, 'bundle claim boundary');
  const passed = manifest.producer.exit_code === 0 && manifest.failures.length === 0;
  assert(manifest.status === (passed ? 'complete' : 'failed'), 'bundle status');
  assert(manifest.verdict === (passed ? 'pass' : 'fail'), 'bundle verdict');

  if (manifest.profile === 'golden-formats') {
    const goldenManifest = manifest.artifacts.find(
      ({ path: artifactPath }) => artifactPath === 'hdoc/v1/manifest.json',
    );
    const goldenSchema = manifest.artifacts.find(
      ({ path: artifactPath }) => artifactPath === 'hdoc/v1/manifest-v1.schema.json',
    );
    if (passed) {
      assert(goldenManifest?.role === 'golden-format-manifest', 'golden manifest absent');
      assert(goldenSchema?.role === 'golden-format-schema', 'golden schema absent');
      const golden = JSON.parse(readFileSync(path.join(bundleRoot, goldenManifest.path), 'utf8'));
      assert(golden.schema === 'helix.hdoc-golden-manifest/1', 'retained golden schema');
      assert(golden.format?.frozen === true && golden.cases?.length === 24, 'retained golden set');
      for (const fixture of golden.cases) {
        const retained = manifest.artifacts.find(
          ({ path: artifactPath }) =>
            artifactPath === `hdoc/v1/cases/${path.basename(fixture.path)}`,
        );
        assert(retained, `${fixture.id}: retained golden absent`);
        assert(
          retained.bytes === fixture.bytes && retained.sha256 === fixture.sha256,
          `${fixture.id}: retained golden identity`,
        );
        assert(
          retained.role ===
            (fixture.kind === 'positive' ? 'golden-format-positive' : 'golden-format-rejection'),
          `${fixture.id}: retained golden role`,
        );
      }
    }
  } else if (manifest.profile === 'test-replays' && manifest.variant === 'semantic') {
    assert(
      manifest.artifacts.some(
        ({ path: artifactPath, role }) =>
          artifactPath === 'conformance.log' && role === 'raw-test-log',
      ),
      'semantic replay log absent',
    );
    if (passed && manifest.environment.provider === 'github-actions') {
      for (const dependencyReport of [
        'cargo-audit.json',
        'cargo-audit-tool.json',
        'inventory-report.json',
        'npm-audit.json',
        'npm-signatures.json',
        'observation-report.json',
      ]) {
        assert(
          manifest.artifacts.some(
            ({ path: artifactPath, role }) =>
              artifactPath === `dependency/${dependencyReport}` && role === 'dependency-diagnostic',
          ),
          `required CI dependency report absent from bundle: ${dependencyReport}`,
        );
      }
      validateDependencyDiagnostics(bundleRoot, manifest);
    }
  } else if (manifest.profile === 'test-replays') {
    const coverage = manifest.artifacts.find(
      ({ path: artifactPath }) => artifactPath === 'rust-coverage.json',
    );
    if (coverage) {
      assert(coverage.role === 'coverage-report', 'coverage replay report role');
      const report = JSON.parse(readFileSync(path.join(bundleRoot, coverage.path), 'utf8'));
      assert(
        report.schema === 'helix.rust-coverage-report/1' && report.verdict === 'pass',
        'retained coverage report did not pass',
      );
    }
    if (passed) assert(coverage, 'coverage replay report absent');
  } else {
    const executionArtifact = manifest.artifacts.find(
      ({ path: artifactPath }) => artifactPath === `browser-execution-${manifest.variant}.json`,
    );
    if (executionArtifact) {
      assert(
        executionArtifact.role === 'browser-execution-report',
        'browser execution report role',
      );
      const report = JSON.parse(
        readFileSync(path.join(bundleRoot, executionArtifact.path), 'utf8'),
      );
      validateBrowserExecutionReport(report, manifest.variant, { compareAttachments: false });
    }
    if (passed) {
      assert(executionArtifact, 'browser execution report absent');
      for (const required of ['wasm-browser-smoke.json', 'browser-bundle-smoke.json']) {
        assert(
          manifest.artifacts.some(({ path: artifactPath }) => artifactPath === required),
          `${required}: absent`,
        );
      }
    }
    if (passed && manifest.variant === 'chromium') {
      assert(
        manifest.artifacts.some(({ path: artifactPath }) => artifactPath === 'wgsl-fixtures.json'),
        'Chromium WGSL report absent',
      );
    }
  }
  if (requireComplete) assert(passed, 'retained bundle is not a complete passing result');
  return manifest;
};

#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidenceDirectory = path.join(repository, 'evidence/phase-02/P02-015');
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
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const gitBytes = (arguments_) =>
  execFileSync('git', arguments_, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (arguments_) => gitBytes(arguments_).toString('utf8');
const showBytes = (file, commit = manifest.commit) => gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.commit) => showBytes(file, commit).toString('utf8');
const retainedPath = (file) => path.join(evidenceDirectory, file);

assert(commitArgument, 'usage: node evidence/phase-02/P02-015/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P02-015', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(manifest.requirements, ['INV-007', 'QUAL-001'], 'evidence requirements');
same(manifest.accepted_adrs, [], 'accepted ADR inventory');
same(
  manifest.source_commits,
  [
    'd87e8c3e996bf7d2a975ffa7ba9a49aaf9a8e3e2',
    'b44bd478b2f7a13e8b99fea7ff622a94d730d69f',
  ],
  'source commit sequence',
);
assert(
  gitText(['rev-parse', `${manifest.source_commits[0]}^`]).trim() === manifest.base_commit,
  'first source commit parent mismatch',
);
assert(
  gitText(['rev-parse', `${manifest.source_commits[1]}^`]).trim() ===
    manifest.source_commits[0],
  'source hardening commit parent mismatch',
);

const sourcePaths = manifest.source_artifacts.map(({ path: artifactPath }) => artifactPath);
same(sorted(sourcePaths), sorted(new Set(sourcePaths)), 'unique source artifact paths');
assert(
  manifest.source_artifacts.length === manifest.verification.source_artifacts,
  'source artifact count mismatch',
);
const changedRecords = gitText([
  'diff',
  '--name-status',
  manifest.base_commit,
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
  sorted(sourcePaths),
  'exact cumulative source scope',
);
assert(
  changedRecords.every(({ status }) => ['A', 'M'].includes(status)),
  `source commits contain unsupported status: ${JSON.stringify(changedRecords)}`,
);
for (const artifact of manifest.source_artifacts) {
  const bytes = showBytes(artifact.path);
  assert(bytes.length === artifact.bytes, `${artifact.path}: byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: SHA-256 mismatch`);
}
for (const lock of ['Cargo.lock', 'package-lock.json']) {
  assert(
    sha256(showBytes(lock)) === sha256(showBytes(lock, manifest.base_commit)),
    `P02-015 changed ${lock} despite adding no dependency`,
  );
}

assert(
  manifest.retained_artifacts.length === manifest.verification.retained_artifacts,
  'retained artifact count mismatch',
);
const retainedByPath = new Map();
for (const artifact of manifest.retained_artifacts) {
  assert(!retainedByPath.has(artifact.path), `duplicate retained path: ${artifact.path}`);
  const bytes = readFileSync(retainedPath(artifact.path));
  assert(bytes.length === artifact.bytes, `${artifact.path}: retained byte count`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: retained SHA-256`);
  retainedByPath.set(artifact.path, { artifact, bytes, value: JSON.parse(bytes) });
}
const verifierBytes = readFileSync(path.join(evidenceDirectory, 'verify.mjs'));
assert(statSync(path.join(evidenceDirectory, 'verify.mjs')).size === manifest.verifier.bytes, 'verifier byte count');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256');

const claimBoundary =
  'This diagnostic CI bundle proves only its named foundation replay; it is not durable gate evidence or a product, format, recovery, browser-support, or release claim until promoted and independently reviewed.';
const manifestFiles = [
  ['reports/semantic-manifest.json', 'test-replays', 'semantic', 5],
  ['reports/coverage-manifest.json', 'test-replays', 'coverage', 1],
  ['reports/browser-chromium-manifest.json', 'browser-reports', 'chromium', 4],
  ['reports/browser-firefox-manifest.json', 'browser-reports', 'firefox', 3],
  ['reports/browser-webkit-manifest.json', 'browser-reports', 'webkit', 3],
];
let retainedPayloads = 0;
let retainedPayloadBytes = 0;
for (const [file, profile, variant, artifactCount] of manifestFiles) {
  const record = retainedByPath.get(file);
  assert(record, `${file}: retained manifest absent`);
  assert(record.bytes.equals(jsonBytes(record.value)), `${file}: noncanonical JSON`);
  const value = record.value;
  same(
    Object.keys(value).sort(),
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
    ].sort(),
    `${file}: manifest fields`,
  );
  assert(value.schema === 'helix.retained-artifact-bundle/1', `${file}: schema`);
  assert(value.plan_item === 'P02-015', `${file}: task`);
  assert(value.profile === profile && value.variant === variant, `${file}: profile/variant`);
  assert(value.status === 'complete' && value.verdict === 'pass', `${file}: verdict`);
  same(value.source_control, { commit: commitArgument, dirty: false }, `${file}: clean source`);
  assert(value.retention.ci_days === 30, `${file}: CI retention`);
  assert(value.retention.promotion_required === true, `${file}: promotion requirement`);
  assert(value.retention.sensitivity === 'public-repository-data-only', `${file}: sensitivity`);
  same(value.failures, [], `${file}: failures`);
  assert(value.claim_boundary === claimBoundary, `${file}: claim boundary`);
  assert(value.producer.exit_code === 0, `${file}: producer exit`);
  assert(value.artifacts.length === artifactCount, `${file}: artifact count`);
  same(
    value.artifacts.map(({ path: artifactPath }) => artifactPath),
    sorted(value.artifacts.map(({ path: artifactPath }) => artifactPath)),
    `${file}: artifact order`,
  );
  for (const source of value.source_inputs) {
    const bytes = showBytes(source.path);
    same(
      source,
      { path: source.path, bytes: bytes.length, sha256: sha256(bytes) },
      `${file}: source ${source.path}`,
    );
  }
  retainedPayloads += value.artifacts.length;
  retainedPayloadBytes += value.artifacts.reduce((total, artifact) => total + artifact.bytes, 0);
}
assert(retainedPayloads === manifest.verification.bundle_payloads, 'retained payload count');
assert(retainedPayloadBytes === manifest.verification.bundle_payload_bytes, 'retained payload bytes');

const semanticManifest = retainedByPath.get('reports/semantic-manifest.json').value;
assert(
  semanticManifest.environment.provider === 'github-actions' &&
    semanticManifest.environment.node === 'v22.23.1' &&
    semanticManifest.environment.github_run_id === '24681015' &&
    semanticManifest.environment.github_run_attempt === 1,
  'semantic GitHub-environment simulation identity',
);
same(
  semanticManifest.artifacts.map(({ path: artifactPath }) => artifactPath),
  [
    'conformance.log',
    'dependency/inventory-report.json',
    'dependency/npm-audit.json',
    'dependency/npm-signatures.json',
    'dependency/observation-report.json',
  ],
  'semantic retained payload inventory',
);
const priorAudit = readFileSync(
  path.join(repository, 'evidence/phase-02/P02-012/reports/npm-audit.json'),
);
const semanticAudit = semanticManifest.artifacts.find(
  ({ path: artifactPath }) => artifactPath === 'dependency/npm-audit.json',
);
assert(
  semanticAudit.bytes === priorAudit.length && semanticAudit.sha256 === sha256(priorAudit),
  'semantic retained audit does not match the durable zero-vulnerability baseline',
);
const coverageManifest = retainedByPath.get('reports/coverage-manifest.json').value;
const priorCoverage = readFileSync(
  path.join(repository, 'evidence/phase-02/P02-013/reports/rust-coverage.json'),
);
same(
  coverageManifest.artifacts[0],
  {
    path: 'rust-coverage.json',
    media_type: 'application/json',
    role: 'coverage-report',
    bytes: priorCoverage.length,
    sha256: sha256(priorCoverage),
  },
  'coverage payload durable linkage',
);

const expectedBrowsers = {
  chromium: {
    revision: '1228',
    browser_version: '149.0.7827.55',
    launcher_bytes: 278568152,
    launcher_sha256: '2d18db9d8608b052b6a552ee00ec1e830f93692e928b65ecc67d693bd33fe801',
  },
  firefox: {
    revision: '1532',
    browser_version: '151.0',
    launcher_bytes: 579040,
    launcher_sha256: '05fa1371ab7dd4ce2b2efea456aa0cc887f8c82a910d9ddc5ea5414071abbf03',
  },
  webkit: {
    revision: '2311',
    browser_version: '26.5',
    launcher_bytes: 3049,
    launcher_sha256: 'a85baad3d8c07173ac387a59b41500c382b21ed692afe0964d29aac247ccc63b',
  },
};
for (const engine of ['chromium', 'firefox', 'webkit']) {
  const reportPath = `reports/browser-execution-${engine}.json`;
  const reportRecord = retainedByPath.get(reportPath);
  assert(reportRecord.bytes.equals(jsonBytes(reportRecord.value)), `${reportPath}: noncanonical`);
  const report = reportRecord.value;
  assert(
    report.schema === 'helix.browser-execution-report/1' &&
      report.plan_item === 'P02-015' &&
      report.selection === engine &&
      report.playwright_version === '1.61.1' &&
      report.verdict === 'pass',
    `${engine}: browser report identity`,
  );
  assert(
    report.stats.expected === 1 &&
      report.stats.skipped === 0 &&
      report.stats.unexpected === 0 &&
      report.stats.flaky === 0,
    `${engine}: browser stats`,
  );
  assert(report.tests.length === 1 && report.failures.length === 0, `${engine}: test inventory`);
  assert(
    report.tests[0].project === engine &&
      report.tests[0].status === 'passed' &&
      report.tests[0].expected_status === 'passed' &&
      report.tests[0].errors.length === 0 &&
      report.tests[0].attachments.length === 0,
    `${engine}: browser test result`,
  );
  same(
    report.browser_identities[0],
    { engine, ...expectedBrowsers[engine] },
    `${engine}: launcher entrypoint identity`,
  );
  const bundleManifest = retainedByPath.get(`reports/browser-${engine}-manifest.json`).value;
  const executionArtifact = bundleManifest.artifacts.find(
    ({ role }) => role === 'browser-execution-report',
  );
  assert(
    executionArtifact.path === `browser-execution-${engine}.json` &&
      executionArtifact.bytes === reportRecord.bytes.length &&
      executionArtifact.sha256 === sha256(reportRecord.bytes),
    `${engine}: manifest/report linkage`,
  );
}

const policy = JSON.parse(showText('tests/toolchain/artifact-retention-policy.json'));
assert(policy.schema === 'helix.artifact-retention-policy/1', 'retention policy schema');
assert(policy.plan_item === 'P02-015', 'retention policy task');
same(
  policy.profiles.map(({ id }) => id),
  ['golden-formats', 'test-replays', 'crash-matrices', 'browser-reports', 'packaged-releases'],
  'retention profile order',
);
same(
  policy.profiles.filter(({ state }) => state === 'active').map(({ id }) => id),
  ['test-replays', 'browser-reports'],
  'active retention profiles',
);
same(
  policy.profiles.filter(({ state }) => state === 'reserved').map(({ id }) => id),
  ['golden-formats', 'crash-matrices', 'packaged-releases'],
  'reserved retention profiles',
);
same(
  policy.profiles.filter(({ state }) => state === 'reserved').map(({ activation_task }) => activation_task),
  ['P03-016', 'P05-021', 'P16-010'],
  'reserved activation tasks',
);
assert(
  policy.profiles.every(({ promotion_required }) => promotion_required === true),
  'promotion bypass in policy',
);
assert(
  policy.profiles
    .filter(({ state }) => state === 'active')
    .every(({ ci_retention_days }) => ci_retention_days === 30),
  'active CI retention mismatch',
);
same(
  policy.service,
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
  'retention service policy',
);

const validateSchemaTree = (root, value, label = '$') => {
  if (Array.isArray(value)) {
    value.forEach((child, index) => validateSchemaTree(root, child, `${label}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (value.$ref !== undefined) {
    assert(value.$ref.startsWith('#/'), `${label}: nonlocal schema reference`);
    let current = root;
    for (const part of value.$ref.slice(2).split('/')) {
      assert(Object.hasOwn(current, part), `${label}: unresolved ${value.$ref}`);
      current = current[part];
    }
  }
  if (value.type === 'object') {
    assert(value.additionalProperties === false, `${label}: open object schema`);
    same(value.required ?? [], Object.keys(value.properties ?? {}), `${label}: required fields`);
  }
  for (const [key, child] of Object.entries(value)) {
    validateSchemaTree(root, child, `${label}.${key}`);
  }
};
const schemaPaths = Object.values(policy.schemas);
assert(schemaPaths.length === manifest.verification.schemas, 'schema count');
for (const schemaPath of schemaPaths) {
  const schema = JSON.parse(showText(schemaPath));
  assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', `${schemaPath}: draft`);
  validateSchemaTree(schema, schema);
}

const workflowPaths = [
  '.github/workflows/ci.yml',
  '.github/workflows/ci-nightly.yml',
  '.github/workflows/benchmark-baseline.yml',
];
const workflowText = workflowPaths.map((file) => showText(file)).join('\n');
const actionUses = [...workflowText.matchAll(/uses: ([^@\s]+)@([0-9a-f]{40})/g)];
assert(actionUses.length === manifest.verification.workflow_action_uses, 'workflow action-use count');
assert(
  [...workflowText.matchAll(/uses: actions\/upload-artifact@/g)].length ===
    manifest.verification.upload_steps,
  'upload step count',
);
for (const marker of [
  'if-no-files-found: error',
  'retention-days: 30',
  'compression-level: 9',
  'overwrite: false',
  'include-hidden-files: false',
  'archive: true',
]) {
  assert(
    [...workflowText.matchAll(new RegExp(marker, 'g'))].length === 4,
    `workflow hardening count: ${marker}`,
  );
}
assert(
  [...showText('.github/workflows/ci.yml').matchAll(/if: always\(\)/g)].length === 6,
  'gating collection/upload always count',
);
for (const forbidden of [
  'continue-on-error: true',
  'permissions: write-all',
  'include-hidden-files: true',
  'overwrite: true',
  'if-no-files-found: warn',
]) {
  assert(!workflowText.includes(forbidden), `forbidden workflow marker: ${forbidden}`);
}

const requirementIds = [
  'INV',
  'PLAT',
  'CORE',
  'DATA',
  'QUERY',
  'STORE',
  'GPU',
  'DIST',
  'CACHE',
  'SYNC',
  'SEC',
  'OPS',
  'QUAL',
  'COMPAT',
].flatMap((family) => [...showText('Specifications.md').matchAll(new RegExp(`\\b${family}-\\d{3}\\b`, 'g'))].map(([id]) => id));
const uniqueRequirements = sorted(new Set(requirementIds));
const requirementRows = [
  ...showText('docs/governance/requirements.md').matchAll(/^\| `([A-Z]+-\d{3})` \|/gm),
].map((match) => match[1]);
same(sorted(requirementRows), uniqueRequirements, 'requirement ledger completeness');

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
  assert(source.endsWith('\n'), `${file}: missing terminal newline`);
  for (const [index, line] of source.split('\n').entries()) {
    assert(!/[ \t]+$/.test(line), `${file}:${index + 1}: trailing whitespace`);
  }
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let rawTarget = match[1].split('#')[0];
    if (!rawTarget || /^(https?:|mailto:)/.test(rawTarget)) continue;
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) rawTarget = rawTarget.slice(1, -1);
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)),
    );
    assert(target !== '..' && !target.startsWith('../'), `${file}: link escapes repository`);
    gitText(['cat-file', '-e', `${commitArgument}:${target}`]);
    localLinks += 1;
  }
}
assert(markdownFiles.length === manifest.verification.markdown_files, 'Markdown inventory');
assert(localLinks === manifest.verification.local_links, 'local link count');

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-015-'));
try {
  const archive = gitBytes(['archive', '--format=tar', commitArgument]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const baseEnvironment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  for (const name of [
    'FORCE_COLOR',
    'NO_COLOR',
    'GITHUB_ACTIONS',
    'GITHUB_RUN_ATTEMPT',
    'GITHUB_RUN_ID',
    'GITHUB_SHA',
    'RUSTFLAGS',
    'CARGO_ENCODED_RUSTFLAGS',
  ]) {
    delete baseEnvironment[name];
  }
  const run = (program, arguments_, options = {}) =>
    execFileSync(program, arguments_, {
      cwd: temporary,
      encoding: 'utf8',
      env: baseEnvironment,
      maxBuffer: 128 * 1024 * 1024,
      timeout: 900_000,
      ...options,
    });
  const runResult = (program, arguments_, options = {}) =>
    spawnSync(program, arguments_, {
      cwd: temporary,
      encoding: 'utf8',
      env: baseEnvironment,
      maxBuffer: 128 * 1024 * 1024,
      timeout: 900_000,
      ...options,
    });
  const requireText = (output, marker, label) => {
    assert(output.includes(marker), `${label}: output marker absent: ${marker}`);
  };
  const shellQuote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
  const nvm = path.join(os.homedir(), '.nvm', 'nvm.sh');
  assert(existsSync(nvm), 'NVM installation absent for supported Node replay');
  const nvmCommand = (version, arguments_) =>
    `source ${shellQuote(nvm)} && nvm exec ${shellQuote(version)} ${arguments_.map(shellQuote).join(' ')}`;
  const runNvm = (version, arguments_, options = {}) =>
    run('bash', ['-lc', nvmCommand(version, arguments_)], options);
  const runNvmResult = (version, arguments_, options = {}) =>
    runResult('bash', ['-lc', nvmCommand(version, arguments_)], options);
  const expectFailure = (result, label, marker) => {
    assert(result.status !== 0, `${label}: mutation unexpectedly passed`);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    assert(output.includes(marker), `${label}: failure marker absent: ${marker}\n${output}`);
  };
  const expectNvmFailure = (arguments_, label, marker, options = {}) =>
    expectFailure(runNvmResult('22.23.1', arguments_, options), label, marker);

  run('git', ['init', '--quiet']);
  run('git', ['add', '--all']);
  run('git', [
    '-c',
    'commit.gpgsign=false',
    '-c',
    'user.name=Helix Evidence',
    '-c',
    'user.email=evidence@helix-db.invalid',
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
        'import json, pathlib, yaml',
        "paths = sorted(pathlib.Path('.github/workflows').glob('*.yml'))",
        'out = []',
        'for p in paths:',
        "  data = yaml.load(p.read_text(encoding='utf-8'), Loader=yaml.BaseLoader)",
        "  out.append({'path': str(p), 'jobs': len(data['jobs']), 'steps': sum(len(job['steps']) for job in data['jobs'].values())})",
        'print(json.dumps(out))',
      ].join('\n'),
    ]),
  );
  same(
    yamlSummary,
    [
      { path: '.github/workflows/benchmark-baseline.yml', jobs: 1, steps: 7 },
      { path: '.github/workflows/ci-nightly.yml', jobs: 2, steps: 8 },
      { path: '.github/workflows/ci.yml', jobs: 6, steps: 40 },
    ],
    'independent workflow parse',
  );

  run('python3', [
    '-c',
    [
      'import json, pathlib, sys',
      'from jsonschema import Draft202012Validator, FormatChecker',
      "root = pathlib.Path('.')",
      'evidence = pathlib.Path(sys.argv[1])',
      "policy = json.loads((root/'tests/toolchain/artifact-retention-policy.json').read_text())",
      "policy_schema = json.loads((root/policy['schemas']['policy']).read_text())",
      'Draft202012Validator(policy_schema, format_checker=FormatChecker()).validate(policy)',
      "bundle_schema = json.loads((root/policy['schemas']['bundle']).read_text())",
      "browser_schema = json.loads((root/policy['schemas']['browser_execution']).read_text())",
      "for path in sorted((evidence/'reports').glob('*-manifest.json')):",
      '  Draft202012Validator(bundle_schema, format_checker=FormatChecker()).validate(json.loads(path.read_text()))',
      "for path in sorted((evidence/'reports').glob('browser-execution-*.json')):",
      '  Draft202012Validator(browser_schema, format_checker=FormatChecker()).validate(json.loads(path.read_text()))',
    ].join('\n'),
    evidenceDirectory,
  ]);

  const node22Commands = [
    ['corepack', 'npm', 'ci', '--ignore-scripts'],
    ['corepack', 'npm', 'run', 'policy:javascript'],
    ['corepack', 'npm', 'run', 'policy:dependencies'],
    ['corepack', 'npm', 'run', 'dependencies:check'],
    ['corepack', 'npm', 'run', 'ci:check'],
    ['corepack', 'npm', 'run', 'toolchain:types'],
    ['corepack', 'npm', 'run', 'fixtures:check'],
    ['corepack', 'npm', 'run', 'artifacts:policy'],
    ['corepack', 'npm', 'run', 'artifacts:test'],
    ['corepack', 'npm', 'test'],
  ];
  for (const command of node22Commands) runNvm('22.23.1', command);
  const liveOutput = runNvm('22.23.1', ['corepack', 'npm', 'run', 'dependencies:report']);
  requireText(liveOutput, 'PASS dependency observation: 0 npm vulnerabilities', 'live dependency report');
  const githubEnvironment = {
    ...baseEnvironment,
    GITHUB_ACTIONS: 'true',
    GITHUB_RUN_ID: '9753108642',
    GITHUB_RUN_ATTEMPT: '1',
  };
  const semanticOutput = runNvm(
    '22.23.1',
    ['corepack', 'npm', 'run', 'artifacts:test-replay'],
    { env: githubEnvironment },
  );
  requireText(semanticOutput, 'PASS retained artifacts test-replays/semantic: 5 payloads', 'semantic bundle');
  requireText(
    runNvm('22.23.1', [
      'node',
      'tests/toolchain/check-retained-artifacts.mjs',
      'bundle',
      'test-replays',
      'semantic',
    ]),
    'PASS retained bundle test-replays/semantic: 5 payloads',
    'semantic bundle check',
  );

  const node24Commands = [
    ['corepack', 'npm', 'ci', '--ignore-scripts'],
    ['corepack', 'npm', 'run', 'policy:javascript'],
    ['corepack', 'npm', 'run', 'policy:dependencies'],
    ['corepack', 'npm', 'run', 'dependencies:check'],
    ['corepack', 'npm', 'run', 'ci:check'],
    ['corepack', 'npm', 'run', 'toolchain:types'],
    ['corepack', 'npm', 'run', 'fixtures:check'],
    ['corepack', 'npm', 'run', 'artifacts:policy'],
    ['corepack', 'npm', 'run', 'artifacts:test'],
    ['corepack', 'npm', 'test'],
  ];
  for (const command of node24Commands) runNvm('24.18.0', command);

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
  run('cargo', ['doc', '--frozen', '--workspace', '--no-deps', '--all-features'], {
    env: { ...baseEnvironment, RUSTDOCFLAGS: '-D warnings' },
  });
  for (const target of ['wasm32-unknown-unknown', 'wasm32-wasip2']) {
    run('cargo', [
      'clippy',
      '--frozen',
      '--target',
      target,
      '--package',
      'helix-core',
      '--',
      '-D',
      'warnings',
    ]);
  }
  runNvm('22.23.1', ['node', 'tests/toolchain/run-build-profile.mjs', 'sanitizer']);
  runNvm('22.23.1', ['corepack', 'npm', 'run', 'coverage:check']);
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'artifacts:coverage-replay']),
    'PASS retained artifacts test-replays/coverage: 1 payloads',
    'coverage bundle',
  );
  runNvm('22.23.1', [
    'node',
    'tests/toolchain/check-retained-artifacts.mjs',
    'bundle',
    'test-replays',
    'coverage',
  ]);
  runNvm('22.23.1', ['corepack', 'npm', 'run', 'wasm:install-validator']);
  runNvm('22.23.1', ['corepack', 'npm', 'run', 'wasm:validate']);
  runNvm('22.23.1', ['corepack', 'npm', 'run', 'wgsl:validate']);
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'ci:browser-smoke', '--', engine]);
    requireText(
      runNvm('22.23.1', [
        'corepack',
        'npm',
        'run',
        'artifacts:browser-report',
        '--',
        engine,
      ]),
      `PASS retained artifacts browser-reports/${engine}`,
      `${engine} bundle`,
    );
    runNvm('22.23.1', [
      'node',
      'tests/toolchain/check-retained-artifacts.mjs',
      'bundle',
      'browser-reports',
      engine,
    ]);
  }

  let evidenceCanaries = 0;
  const mutateJson = (file, mutate, command, label, marker, options = {}) => {
    const absolute = path.join(temporary, file);
    const original = readFileSync(absolute);
    try {
      const value = JSON.parse(original);
      mutate(value);
      writeFileSync(absolute, jsonBytes(value));
      expectNvmFailure(command, label, marker, options);
      evidenceCanaries += 1;
    } finally {
      writeFileSync(absolute, original);
    }
  };
  const mutateText = (file, mutate, command, label, marker) => {
    const absolute = path.join(temporary, file);
    const original = readFileSync(absolute, 'utf8');
    try {
      const changed = mutate(original);
      assert(changed !== original, `${label}: mutation did not change source`);
      writeFileSync(absolute, changed);
      expectNvmFailure(command, label, marker);
      evidenceCanaries += 1;
    } finally {
      writeFileSync(absolute, original);
    }
  };
  const policyCommand = ['corepack', 'npm', 'run', 'artifacts:policy'];
  mutateJson(
    'tests/toolchain/artifact-retention-policy.json',
    (value) => (value.service.action_sha = '0'.repeat(40)),
    policyCommand,
    'upload action substitution',
    'retention service mismatch',
  );
  mutateJson(
    'tests/toolchain/artifact-retention-policy.json',
    (value) => (value.profiles[1].ci_retention_days = 29),
    policyCommand,
    'active retention shortening',
    'retention profile postures mismatch',
  );
  mutateJson(
    'tests/toolchain/artifact-retention-policy.json',
    (value) => {
      value.profiles[0].producers = [structuredClone(value.profiles[1].producers[0])];
    },
    policyCommand,
    'reserved producer injection',
    'golden-formats reserved producers mismatch',
  );
  mutateJson(
    'tests/toolchain/artifact-retention-policy.json',
    (value) => (value.profiles[1].promotion_required = false),
    policyCommand,
    'promotion bypass',
    'test-replays: promotion bypass',
  );

  const ciCommand = ['corepack', 'npm', 'run', 'ci:check'];
  mutateText(
    '.github/workflows/ci.yml',
    (value) => value.replaceAll("if: always() && matrix.node == '22.23.1'", "if: matrix.node == '22.23.1'"),
    ciCommand,
    'semantic always removal',
    "gating workflow marker absent: if: always() && matrix.node == '22.23.1'",
  );
  mutateText(
    '.github/workflows/ci.yml',
    (value) => value.replace('043fb46d1a93c77aae656e7c1c64a875d1fc6a0a', '0'.repeat(40)),
    ciCommand,
    'workflow action substitution',
    'unapproved action pin',
  );
  mutateText(
    '.github/workflows/ci.yml',
    (value) => value.replace('retention-days: 30', 'retention-days: 1'),
    ciCommand,
    'workflow retention shortening',
    'artifact retention count',
  );
  mutateText(
    '.github/workflows/ci.yml',
    (value) => value.replace('overwrite: false', 'overwrite: true'),
    ciCommand,
    'workflow overwrite enablement',
    'artifact overwrite hardening',
  );
  mutateText(
    '.github/workflows/ci.yml',
    (value) => value.replace('include-hidden-files: false', 'include-hidden-files: true'),
    ciCommand,
    'workflow hidden-file enablement',
    'artifact hidden-file hardening',
  );
  mutateText(
    '.github/workflows/ci.yml',
    (value) => value.replace('archive: true', 'archive: false'),
    ciCommand,
    'workflow archive disablement',
    'artifact archive count',
  );
  mutateText(
    '.github/workflows/ci.yml',
    (value) => value.replace('if-no-files-found: error', 'if-no-files-found: warn'),
    ciCommand,
    'workflow missing-file weakening',
    'artifact missing-file hardening',
  );
  mutateText(
    '.github/workflows/ci.yml',
    (value) => value.replace('timeout-minutes: 30', 'timeout-minutes: 30\n    continue-on-error: true'),
    ciCommand,
    'best-effort workflow injection',
    'forbidden marker continue-on-error: true',
  );

  const semanticBundleRoot = path.join(temporary, 'dist/retention/test-replays/semantic');
  const semanticManifestPath = path.join(semanticBundleRoot, 'manifest.json');
  const checkSemantic = [
    'node',
    'tests/toolchain/check-retained-artifacts.mjs',
    'bundle',
    'test-replays',
    'semantic',
  ];
  const mutateGeneratedManifest = (mutate, label, marker) => {
    const original = readFileSync(semanticManifestPath);
    try {
      const value = JSON.parse(original);
      mutate(value);
      writeFileSync(semanticManifestPath, jsonBytes(value));
      expectNvmFailure(checkSemantic, label, marker);
      evidenceCanaries += 1;
    } finally {
      writeFileSync(semanticManifestPath, original);
    }
  };
  mutateGeneratedManifest(
    (value) => (value.claim_boundary = 'x'.repeat(80)),
    'bundle claim escalation',
    'bundle claim boundary',
  );
  mutateGeneratedManifest(
    (value) => (value.status = 'failed'),
    'bundle status contradiction',
    'bundle status',
  );

  const coveragePayload = path.join(
    temporary,
    'dist/retention/test-replays/coverage/rust-coverage.json',
  );
  const coverageOriginal = readFileSync(coveragePayload);
  try {
    writeFileSync(coveragePayload, Buffer.concat([coverageOriginal, Buffer.from(' ')]));
    expectNvmFailure(
      [
        'node',
        'tests/toolchain/check-retained-artifacts.mjs',
        'bundle',
        'test-replays',
        'coverage',
      ],
      'coverage payload substitution',
      'current identity mismatch',
    );
    evidenceCanaries += 1;
  } finally {
    writeFileSync(coveragePayload, coverageOriginal);
  }

  const observationPath = path.join(semanticBundleRoot, 'dependency/observation-report.json');
  const observationOriginal = readFileSync(observationPath);
  const semanticManifestOriginal = readFileSync(semanticManifestPath);
  try {
    const observation = JSON.parse(observationOriginal);
    observation.recorded_at = '2000-01-01T00:00:00.000Z';
    const changedObservation = jsonBytes(observation);
    writeFileSync(observationPath, changedObservation);
    const bundle = JSON.parse(semanticManifestOriginal);
    const artifact = bundle.artifacts.find(
      ({ path: artifactPath }) => artifactPath === 'dependency/observation-report.json',
    );
    artifact.bytes = changedObservation.length;
    artifact.sha256 = sha256(changedObservation);
    writeFileSync(semanticManifestPath, jsonBytes(bundle));
    expectNvmFailure(
      checkSemantic,
      'stale dependency observation',
      'retained dependency observation freshness',
    );
    evidenceCanaries += 1;
  } finally {
    writeFileSync(observationPath, observationOriginal);
    writeFileSync(semanticManifestPath, semanticManifestOriginal);
  }

  const chromiumRoot = path.join(temporary, 'dist/retention/browser-reports/chromium');
  const chromiumReportPath = path.join(chromiumRoot, 'browser-execution-chromium.json');
  const chromiumManifestPath = path.join(chromiumRoot, 'manifest.json');
  const chromiumReportOriginal = readFileSync(chromiumReportPath);
  const chromiumManifestOriginal = readFileSync(chromiumManifestPath);
  try {
    const report = JSON.parse(chromiumReportOriginal);
    report.verdict = 'fail';
    const changedReport = jsonBytes(report);
    writeFileSync(chromiumReportPath, changedReport);
    const bundle = JSON.parse(chromiumManifestOriginal);
    const artifact = bundle.artifacts.find(
      ({ role }) => role === 'browser-execution-report',
    );
    artifact.bytes = changedReport.length;
    artifact.sha256 = sha256(changedReport);
    writeFileSync(chromiumManifestPath, jsonBytes(bundle));
    expectNvmFailure(
      [
        'node',
        'tests/toolchain/check-retained-artifacts.mjs',
        'bundle',
        'browser-reports',
        'chromium',
      ],
      'browser verdict contradiction',
      'browser report verdict',
    );
    evidenceCanaries += 1;
  } finally {
    writeFileSync(chromiumReportPath, chromiumReportOriginal);
    writeFileSync(chromiumManifestPath, chromiumManifestOriginal);
  }

  const extraPath = path.join(chromiumRoot, 'extra.txt');
  try {
    writeFileSync(extraPath, 'unexpected\n');
    expectNvmFailure(
      [
        'node',
        'tests/toolchain/check-retained-artifacts.mjs',
        'bundle',
        'browser-reports',
        'chromium',
      ],
      'bundle inventory injection',
      'bundle file inventory mismatch',
    );
    evidenceCanaries += 1;
  } finally {
    rmSync(extraPath, { force: true });
  }

  assert(
    evidenceCanaries === manifest.verification.evidence_rejection_canaries,
    `evidence canary count mismatch: ${evidenceCanaries}`,
  );
  requireText(
    runNvm('22.23.1', ['corepack', 'npm', 'run', 'artifacts:test']),
    `PASS artifact retention rejection canaries: ${manifest.verification.source_rejection_canaries}`,
    'restored source canaries',
  );
  runNvm('22.23.1', ['corepack', 'npm', 'run', 'ci:check']);
  runNvm('22.23.1', [
    'node',
    'tests/toolchain/check-retained-artifacts.mjs',
    'bundle',
    'test-replays',
    'semantic',
  ]);
  runNvm('22.23.1', [
    'node',
    'tests/toolchain/check-retained-artifacts.mjs',
    'bundle',
    'test-replays',
    'coverage',
  ]);
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    runNvm('22.23.1', [
      'node',
      'tests/toolchain/check-retained-artifacts.mjs',
      'bundle',
      'browser-reports',
      engine,
    ]);
  }
  assert(
    run('git', ['status', '--porcelain=v1', '--untracked-files=all']).trim() === '',
    'temporary source tree dirty after restored mutations',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write(
  `PASS P02-015 evidence: ${manifest.verification.source_artifacts} source artifacts, ${manifest.verification.retained_artifacts} retained reports, ${manifest.verification.bundle_payloads} payload identities, ${manifest.verification.source_rejection_canaries + manifest.verification.evidence_rejection_canaries} rejection canaries\n`,
);
process.stdout.write(
  'PASS boundaries: 30-day CI diagnostics, permanent promotion required, 3 future profiles reserved, hosted upload not claimed\n',
);

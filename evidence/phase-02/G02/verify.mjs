#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const gateDirectory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(gateDirectory, '../../..');
const manifest = JSON.parse(readFileSync(path.join(gateDirectory, 'manifest.json'), 'utf8'));
const reviewedArgument = process.argv[2];

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
const sorted = (values) => [...values].sort();
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (arguments_) =>
  execFileSync('git', arguments_, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (arguments_) => gitBytes(arguments_).toString('utf8');
const showBytes = (file, commit = manifest.reviewed_commit) =>
  gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.reviewed_commit) =>
  showBytes(file, commit).toString('utf8');
const gateBytes = (relativePath) => readFileSync(path.join(gateDirectory, relativePath));
const gateJson = (relativePath) => JSON.parse(gateBytes(relativePath).toString('utf8'));
const step = (job, name) => job.steps.find(({ name: candidate }) => candidate === name);
const requireSuccessfulStep = (job, name) => {
  const candidate = step(job, name);
  assert(candidate?.status === 'completed' && candidate.conclusion === 'success', `${job.name}: ${name}`);
};

assert(reviewedArgument, 'usage: node evidence/phase-02/G02/verify.mjs <reviewed-commit>');
assert(/^[0-9a-f]{40}$/.test(reviewedArgument), 'reviewed commit must be a full lowercase SHA-1');
assert(reviewedArgument === manifest.reviewed_commit, 'argument does not match reviewed commit');
assert(
  gitText(['rev-parse', `${reviewedArgument}^{commit}`]).trim() === reviewedArgument,
  'reviewed commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'gate manifest schema mismatch');
assert(manifest.gate_id === 'G02', 'gate ID mismatch');
assert(manifest.verdict === 'pass', 'gate verdict mismatch');
assert(manifest.gate_checked_at_reviewed_commit === false, 'reviewed source falsely claims closed gate');
assert(
  gitText(['rev-parse', `${reviewedArgument}^{tree}`]).trim() === manifest.reviewed_tree,
  'reviewed tree mismatch',
);

const plan = showText('ImplementationPlan.md');
const expectedTasks = Array.from(
  { length: 17 },
  (_, index) => `P02-${String(index + 1).padStart(3, '0')}`,
);
for (const task of expectedTasks) {
  assert(new RegExp(`^- \\[x\\] \\*\\*${task}\\*\\*`, 'm').test(plan), `${task}: not checked`);
}
assert(/^- \[ \] \*\*G02\*\*/m.test(plan), 'G02 is not open at reviewed source commit');
const planItems = [...plan.matchAll(/^\s*- \[([ x])\] \*\*((?:P\d{2}-\d{3}|G\d{2}|X-\d{3}))\*\*/gm)].map(
  (match) => ({ checked: match[1] === 'x', id: match[2] }),
);
assert(planItems.length === 522, `implementation plan items: ${planItems.length}`);
assert(new Set(planItems.map(({ id }) => id)).size === 522, 'duplicate implementation plan ID');
assert(planItems.filter(({ checked }) => checked).length === 58, 'reviewed completed-plan count');
assert(planItems.filter(({ checked }) => !checked).length === 464, 'reviewed open-plan count');

const requirementUnion = new Set();
const acceptedAdrs = new Set();
const sourceCommits = new Set();
let sourceArtifactRecords = 0;
let retainedArtifactRecords = 0;
let removedArtifactRecords = 0;
let producedArtifactRecords = 0;
let verifierRecords = 0;

for (const task of expectedTasks) {
  const evidenceRoot = `evidence/phase-02/${task}`;
  const taskManifest = JSON.parse(showText(`${evidenceRoot}/manifest.json`));
  assert(taskManifest.schema_version === 1, `${task}: manifest schema`);
  assert(taskManifest.task_id === task, `${task}: manifest task`);
  assert(taskManifest.verdict === 'pass', `${task}: manifest verdict`);
  assert(/^[0-9a-f]{40}$/.test(taskManifest.commit), `${task}: source commit`);
  const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', taskManifest.commit, reviewedArgument], {
    cwd: repository,
  });
  assert(ancestry.status === 0, `${task}: source commit is not reviewed ancestry`);
  sourceCommits.add(taskManifest.commit);
  for (const requirement of taskManifest.requirements) requirementUnion.add(requirement);
  for (const adr of taskManifest.accepted_adrs) acceptedAdrs.add(adr);

  const sourceArtifacts = taskManifest.artifacts ?? taskManifest.source_artifacts ?? [];
  sourceArtifactRecords += sourceArtifacts.length;
  for (const artifact of sourceArtifacts) {
    const bytes = showBytes(artifact.path, taskManifest.commit);
    assert(bytes.length === artifact.bytes, `${task}/${artifact.path}: source byte count`);
    assert(sha256(bytes) === artifact.sha256, `${task}/${artifact.path}: source SHA-256`);
  }

  const retainedArtifacts = taskManifest.retained_artifacts ?? [];
  retainedArtifactRecords += retainedArtifacts.length;
  for (const artifact of retainedArtifacts) {
    const bytes = showBytes(`${evidenceRoot}/${artifact.path}`);
    assert(bytes.length === artifact.bytes, `${task}/${artifact.path}: retained byte count`);
    assert(sha256(bytes) === artifact.sha256, `${task}/${artifact.path}: retained SHA-256`);
  }

  const removedArtifacts = taskManifest.removed_artifacts ?? taskManifest.deleted_artifacts ?? [];
  removedArtifactRecords += removedArtifacts.length;
  const removalBase =
    taskManifest.base_commit ?? gitText(['rev-parse', `${taskManifest.commit}^`]).trim();
  for (const artifact of removedArtifacts) {
    const bytes = showBytes(artifact.path, removalBase);
    assert(bytes.length === artifact.bytes, `${task}/${artifact.path}: removed byte count`);
    assert(sha256(bytes) === artifact.sha256, `${task}/${artifact.path}: removed SHA-256`);
  }

  const producedArtifacts = taskManifest.produced_artifacts ?? [];
  producedArtifactRecords += producedArtifacts.length;
  for (const artifact of producedArtifacts) {
    assert(artifact.bytes > 0, `${task}/${artifact.path}: produced byte count`);
    assert(/^[0-9a-f]{64}$/.test(artifact.sha256), `${task}/${artifact.path}: produced SHA-256`);
  }

  const verifierPath = taskManifest.verifier.path.startsWith('evidence/')
    ? taskManifest.verifier.path
    : `${evidenceRoot}/${taskManifest.verifier.path}`;
  const verifier = showBytes(verifierPath);
  assert(verifier.length === taskManifest.verifier.bytes, `${task}: verifier byte count`);
  assert(sha256(verifier) === taskManifest.verifier.sha256, `${task}: verifier SHA-256`);
  verifierRecords += 1;
}

const expectedRequirements = [
  'COMPAT-001',
  'CORE-001',
  'CORE-003',
  'INV-001',
  'INV-003',
  'INV-004',
  'INV-006',
  'INV-007',
  'INV-009',
  'INV-010',
  'PLAT-001',
  'PLAT-002',
  'PLAT-003',
  'QUAL-001',
  'QUAL-002',
  'SEC-001',
  'SEC-002',
];
same(sorted(requirementUnion), expectedRequirements, 'Phase 2 requirement union');
same(manifest.requirements, expectedRequirements, 'gate requirements');
same([...acceptedAdrs], ['0001'], 'Phase 2 accepted ADRs');
same(manifest.accepted_adrs, ['0001'], 'gate accepted ADRs');
assert(sourceCommits.size === 17, `distinct task source commits: ${sourceCommits.size}`);
assert(sourceArtifactRecords === 439, `source artifact records: ${sourceArtifactRecords}`);
assert(retainedArtifactRecords === 21, `retained artifact records: ${retainedArtifactRecords}`);
assert(removedArtifactRecords === 4, `removed artifact records: ${removedArtifactRecords}`);
assert(producedArtifactRecords === 5, `produced artifact records: ${producedArtifactRecords}`);
assert(verifierRecords === 17, `verifier records: ${verifierRecords}`);

const matrix = JSON.parse(showText('.github/ci/matrix.json'));
assert(matrix.schema === 'helix.ci-matrix/3', 'CI matrix schema');
assert(Object.values(matrix.gating).flat().length === 11, 'gating lane count');
assert(matrix.nightly.native.length === 2, 'nightly lane count');
assert(matrix.observational.benchmark.length === 1, 'observational lane count');
const bootstrap = JSON.parse(showText('docs/development/bootstrap.json'));
assert(bootstrap.schema === 'helix.clean-bootstrap/1', 'bootstrap schema');
assert(bootstrap.profiles.length === 4, 'bootstrap profile count');
assert(bootstrap.troubleshooting.length === 17, 'bootstrap troubleshooting count');
assert(bootstrap.repository.development_name === 'HelixDB', 'development name');
assert(bootstrap.repository.public_name_decision === 'P16-016', 'public-name decision');

const fixParent = gitText(['rev-parse', `${reviewedArgument}^`]).trim();
assert(fixParent === '3c526f521bfa230d10d57451d432a93e8625034f', 'Windows fix parent');
const fixPaths = gitText(['diff', '--name-only', fixParent, reviewedArgument])
  .trim()
  .split('\n')
  .filter(Boolean);
same(
  fixPaths,
  [
    '.gitattributes',
    'tests/toolchain/check-ci-matrix.mjs',
    'tests/toolchain/examples-contract.mjs',
    'tests/toolchain/test-examples-contract.mjs',
  ],
  'Windows fix scope',
);
const attributes = showText('.gitattributes');
assert(!attributes.includes('\r'), 'repository attributes contain CR bytes');
same(
  attributes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')),
  ['* text=auto eol=lf'],
  'repository checkout policy',
);
const exampleContract = showText('tests/toolchain/examples-contract.mjs');
for (const marker of [
  'repository attributes canonical LF bytes',
  'repository text checkout policy',
  'native lock canonical LF bytes',
]) {
  assert(exampleContract.includes(marker), `Windows regression marker absent: ${marker}`);
}
const exampleCanaries = showText('tests/toolchain/test-examples-contract.mjs');
for (const marker of ['Windows checkout policy weakening', 'native lock CRLF checkout']) {
  assert(exampleCanaries.includes(marker), `Windows canary absent: ${marker}`);
}

const hostedBytes = gateBytes(manifest.hosted_observation.path);
assert(hostedBytes.length === manifest.hosted_observation.bytes, 'hosted observation byte count');
assert(sha256(hostedBytes) === manifest.hosted_observation.sha256, 'hosted observation SHA-256');
const hosted = JSON.parse(hostedBytes);
assert(hosted.schema === 'helix.gate-hosted-observation/1', 'hosted observation schema');
assert(hosted.gate === 'G02' && hosted.verdict === 'pass', 'hosted observation verdict');
assert(hosted.reviewed_commit === reviewedArgument, 'hosted reviewed commit');
assert(hosted.reviewed_tree === manifest.reviewed_tree, 'hosted reviewed tree');
assert(hosted.origin_main.sha === reviewedArgument, 'observed remote main');
assert(hosted.origin_main.protected === false, 'unexpected branch protection observation');
same(hosted.origin_main.required_checks, [], 'observed required checks');

const failed = hosted.failed_gating_run;
assert(failed.id === 29143529811 && failed.conclusion === 'failure', 'failed gating run identity');
assert(failed.head_sha === fixParent && failed.event === 'push', 'failed gating source');
assert(failed.jobs.length === 12, 'failed gating job count');
const failedJobs = failed.jobs.filter(({ conclusion }) => conclusion === 'failure');
assert(failedJobs.length === 1 && failedJobs[0].id === 86521027391, 'failed gating job');
assert(failedJobs[0].name === 'Native / windows-x64', 'failed Windows job name');
assert(step(failedJobs[0], 'Run strict native workspace checks')?.conclusion === 'failure', 'failed Windows step');
assert(failed.jobs.filter(({ conclusion }) => conclusion === 'success').length === 11, 'failed-run successes');
assert(failed.expected_failure.remediation_commit === reviewedArgument, 'failure remediation binding');

const expectedGatingJobs = {
  'Matrix contract': { labels: ['ubuntu-24.04'], steps: ['Validate clean bootstrap contract', 'Validate CI contract', 'Emit gating matrices'] },
  'Sanitizer / asan-linux-x64': { labels: ['ubuntu-24.04'], steps: ['Verify runner identity', 'Compile the fully instrumented ASan target'] },
  'Native / macos-arm64': { labels: ['macos-15'], steps: ['Verify runner and Rust identities', 'Run strict native workspace checks'] },
  'Node 24.18.0 / Linux x64': { labels: ['ubuntu-24.04'], steps: ['Verify runner identity', 'Run JavaScript and dependency policy', 'Run aggregate tests'] },
  'Native / linux-x64': { labels: ['ubuntu-24.04'], steps: ['Verify runner and Rust identities', 'Run strict native workspace checks', 'Enforce Rust product coverage thresholds', 'Retain Rust coverage replay'] },
  'Node 22.23.1 / Linux x64': { labels: ['ubuntu-24.04'], steps: ['Verify runner identity', 'Run JavaScript and dependency policy', 'Refresh dependency vulnerability and provenance observation', 'Run aggregate tests', 'Retain semantic replay and dependency reports'] },
  'Portable Rust / wasm32-unknown-unknown': { labels: ['ubuntu-24.04'], steps: ['Verify runner identity', 'Compile portable core with strict lints', 'Build and validate portable artifact'] },
  'Portable Rust / wasm32-wasip2': { labels: ['ubuntu-24.04'], steps: ['Verify runner identity', 'Compile portable core with strict lints', 'Build and validate portable artifact'] },
  'Browser bundle smoke / webkit': { labels: ['ubuntu-24.04'], steps: ['Verify runner identity', 'Build and execute the browser bundle smoke', 'Retain browser execution and validation reports'] },
  'Native / windows-x64': { labels: ['windows-2025'], steps: ['Verify runner and Rust identities', 'Run strict native workspace checks'] },
  'Browser bundle smoke / chromium': { labels: ['ubuntu-24.04'], steps: ['Verify runner identity', 'Parse, validate, and compile trusted WGSL fixtures', 'Build and execute the browser bundle smoke', 'Retain browser execution and validation reports'] },
  'Browser bundle smoke / firefox': { labels: ['ubuntu-24.04'], steps: ['Verify runner identity', 'Build and execute the browser bundle smoke', 'Retain browser execution and validation reports'] },
};
const gating = hosted.gating_run;
assert(gating.id === 29143784086 && gating.run_attempt === 1, 'gating run identity');
assert(gating.head_sha === reviewedArgument && gating.event === 'push', 'gating source');
assert(gating.status === 'completed' && gating.conclusion === 'success', 'gating conclusion');
same(sorted(gating.jobs.map(({ name }) => name)), sorted(Object.keys(expectedGatingJobs)), 'gating jobs');
for (const job of gating.jobs) {
  const expectation = expectedGatingJobs[job.name];
  assert(job.status === 'completed' && job.conclusion === 'success', `${job.name}: job conclusion`);
  assert(job.runner_group_name === 'GitHub Actions', `${job.name}: runner group`);
  assert(typeof job.runner_name === 'string' && job.runner_name.startsWith('GitHub Actions '), `${job.name}: runner name`);
  same(job.labels, expectation.labels, `${job.name}: runner labels`);
  assert(!job.steps.some(({ conclusion }) => ['failure', 'cancelled', 'timed_out'].includes(conclusion)), `${job.name}: failed step`);
  for (const name of expectation.steps) requireSuccessfulStep(job, name);
}

const expectedNightlyJobs = {
  'Nightly matrix contract': { labels: ['ubuntu-24.04'], steps: ['Validate CI contract', 'Emit nightly matrices'] },
  'Nightly native / macos-x64': { labels: ['macos-15-intel'], steps: ['Verify runner and Rust identities', 'Run strict native workspace checks'] },
  'Nightly native / linux-arm64': { labels: ['ubuntu-24.04-arm'], steps: ['Verify runner and Rust identities', 'Run strict native workspace checks'] },
};
const nightly = hosted.nightly_run;
assert(nightly.id === 29143911392 && nightly.run_attempt === 1, 'nightly run identity');
assert(nightly.head_sha === reviewedArgument && nightly.event === 'workflow_dispatch', 'nightly source');
assert(nightly.status === 'completed' && nightly.conclusion === 'success', 'nightly conclusion');
same(sorted(nightly.jobs.map(({ name }) => name)), sorted(Object.keys(expectedNightlyJobs)), 'nightly jobs');
for (const job of nightly.jobs) {
  const expectation = expectedNightlyJobs[job.name];
  assert(job.status === 'completed' && job.conclusion === 'success', `${job.name}: job conclusion`);
  same(job.labels, expectation.labels, `${job.name}: runner labels`);
  for (const name of expectation.steps) requireSuccessfulStep(job, name);
}
assert(hosted.dispatch.environment_token_attempt.exit_code === 1, 'dispatch diagnostic failure absent');
assert(hosted.dispatch.existing_keyring_workflow_scope_attempt.exit_code === 0, 'nightly dispatch success absent');
assert(hosted.dispatch.existing_keyring_workflow_scope_attempt.run_id === nightly.id, 'dispatch run binding');
assert(hosted.hosted_green_for_reviewed_commit === true, 'hosted green claim');

const reportRoot = 'reports/hosted-gating';
const promotionBytes = gateBytes(manifest.promotion.path);
assert(promotionBytes.length === manifest.promotion.bytes, 'promotion manifest byte count');
assert(sha256(promotionBytes) === manifest.promotion.sha256, 'promotion manifest SHA-256');
const promotion = JSON.parse(promotionBytes);
assert(promotion.schema === 'helix.gate-artifact-promotion/1', 'promotion schema');
assert(promotion.gate === 'G02' && promotion.verdict === 'promoted', 'promotion verdict');
assert(promotion.source_run_id === gating.id && promotion.source_run_attempt === 1, 'promotion run');
assert(promotion.source_commit === reviewedArgument, 'promotion source commit');
same(promotion.counts, { bundles: 5, source_files: 21, identity_files: 20, encoded_files: 1 }, 'promotion counts');
assert(promotion.bundles.reduce((total, bundle) => total + bundle.archive_bytes, 0) === 167881, 'archive byte total');

const observationArtifacts = new Map(gating.artifacts.map((artifact) => [artifact.id, artifact]));
assert(observationArtifacts.size === 5, 'hosted artifact count');
const promotedPaths = new Set();
for (const bundle of promotion.bundles) {
  const observation = observationArtifacts.get(bundle.artifact_id);
  assert(observation, `${bundle.artifact_name}: hosted artifact absent`);
  assert(observation.name === bundle.artifact_name, `${bundle.artifact_name}: artifact name`);
  assert(observation.size_in_bytes === bundle.archive_bytes, `${bundle.artifact_name}: archive bytes`);
  assert(observation.digest === `sha256:${bundle.archive_sha256}`, `${bundle.artifact_name}: archive digest`);
  assert(observation.expires_at === bundle.expires_at && observation.expired === false, `${bundle.artifact_name}: expiry`);
  const sourceRecords = new Map(bundle.files.map((file) => [file.source_path, file]));
  assert(sourceRecords.size === bundle.files.length, `${bundle.artifact_name}: duplicate source file`);
  const manifestRecord = sourceRecords.get('manifest.json');
  assert(manifestRecord, `${bundle.artifact_name}: bundle manifest absent`);
  for (const file of bundle.files) {
    assert(!promotedPaths.has(file.promoted_path), `duplicate promoted path: ${file.promoted_path}`);
    promotedPaths.add(file.promoted_path);
    assert(file.promoted_path.startsWith('evidence/phase-02/G02/reports/hosted-gating/'), `${file.promoted_path}: promotion escape`);
    const promotedAbsolute = path.resolve(repository, file.promoted_path);
    assert(
      promotedAbsolute.startsWith(`${path.join(gateDirectory, reportRoot)}${path.sep}`),
      `${file.promoted_path}: resolved promotion escape`,
    );
    const promotedBytes = readFileSync(promotedAbsolute);
    assert(promotedBytes.length === file.promoted_bytes, `${file.promoted_path}: promoted bytes`);
    assert(sha256(promotedBytes) === file.promoted_sha256, `${file.promoted_path}: promoted SHA-256`);
    if (file.encoding === 'identity') {
      assert(file.promoted_bytes === file.source_bytes, `${file.promoted_path}: identity byte count`);
      assert(file.promoted_sha256 === file.source_sha256, `${file.promoted_path}: identity SHA-256`);
    } else {
      assert(file.encoding === 'gzip-n-mtime-base64', `${file.promoted_path}: unsupported encoding`);
      const encoded = promotedBytes.toString('utf8').replaceAll(/\s/g, '');
      const decoded = gunzipSync(Buffer.from(encoded, 'base64'));
      assert(decoded.length === file.source_bytes, `${file.promoted_path}: decoded bytes`);
      assert(sha256(decoded) === file.source_sha256, `${file.promoted_path}: decoded SHA-256`);
    }
  }
  const bundleManifest = JSON.parse(readFileSync(path.join(repository, manifestRecord.promoted_path), 'utf8'));
  assert(bundleManifest.schema === 'helix.retained-artifact-bundle/1', `${bundle.artifact_name}: manifest schema`);
  assert(bundleManifest.status === 'complete' && bundleManifest.verdict === 'pass', `${bundle.artifact_name}: manifest verdict`);
  assert(bundleManifest.execution_id === `github-${gating.id}-1`, `${bundle.artifact_name}: execution ID`);
  same(bundleManifest.source_control, { commit: reviewedArgument, dirty: false }, `${bundle.artifact_name}: source control`);
  assert(bundleManifest.environment.provider === 'github-actions', `${bundle.artifact_name}: provider`);
  assert(bundleManifest.environment.github_run_id === String(gating.id), `${bundle.artifact_name}: run ID`);
  assert(bundleManifest.environment.github_run_attempt === 1, `${bundle.artifact_name}: run attempt`);
  same(bundleManifest.failures, [], `${bundle.artifact_name}: failures`);
  for (const input of bundleManifest.source_inputs) {
    const bytes = showBytes(input.path);
    assert(bytes.length === input.bytes, `${bundle.artifact_name}/${input.path}: source bytes`);
    assert(sha256(bytes) === input.sha256, `${bundle.artifact_name}/${input.path}: source SHA-256`);
  }
  same(
    sorted(bundleManifest.artifacts.map(({ path: artifactPath }) => artifactPath)),
    sorted(bundle.files.filter(({ source_path: sourcePath }) => sourcePath !== 'manifest.json').map(({ source_path: sourcePath }) => sourcePath)),
    `${bundle.artifact_name}: payload inventory`,
  );
  for (const artifact of bundleManifest.artifacts) {
    const record = sourceRecords.get(artifact.path);
    assert(record.source_bytes === artifact.bytes, `${bundle.artifact_name}/${artifact.path}: payload bytes`);
    assert(record.source_sha256 === artifact.sha256, `${bundle.artifact_name}/${artifact.path}: payload SHA-256`);
  }
}
assert(promotedPaths.size === 21, 'promoted path count');

const dependencyRoot = `${reportRoot}/test-replays-semantic/dependency`;
const inventory = gateJson(`${dependencyRoot}/inventory-report.json`);
assert(inventory.schema === 'helix.dependency-inventory-report/1' && inventory.verdict === 'pass', 'hosted dependency inventory');
assert(inventory.npm.installed_packages.length === 52, 'hosted installed package count');
assert(inventory.npm.duplicates.length === 1, 'hosted duplicate family count');
assert(inventory.rust.external_packages.length === 0, 'hosted external Rust package count');
const audit = gateJson(`${dependencyRoot}/npm-audit.json`);
assert(audit.metadata.vulnerabilities.total === 0, 'hosted npm vulnerability count');
const observation = gateJson(`${dependencyRoot}/observation-report.json`);
assert(observation.schema === 'helix.dependency-observation-report/1' && observation.verdict === 'pass', 'hosted dependency observation');
assert(observation.npm.audit.vulnerabilities.total === 0, 'hosted observed vulnerabilities');
assert(observation.npm.provenance.installed_packages === 52, 'hosted signature package count');
assert(observation.npm.provenance.registry_signatures_verified === 52, 'hosted verified signatures');
assert(observation.npm.provenance.registry_signatures_missing === 0, 'hosted missing signatures');
assert(observation.npm.provenance.registry_signatures_invalid === 0, 'hosted invalid signatures');
assert(observation.npm.provenance.attested_packages.length === 27, 'hosted attested package count');

const coverage = gateJson(`${reportRoot}/test-replays-coverage/rust-coverage.json`);
assert(coverage.schema === 'helix.rust-coverage-report/1' && coverage.verdict === 'pass', 'hosted coverage verdict');
assert(coverage.execution.tests_executed === 9, 'hosted coverage test count');
assert(coverage.groups.length === 3 && coverage.groups.every(({ verdict }) => verdict === 'pass'), 'hosted coverage groups');
assert(coverage.groups.every(({ empty_product_scope }) => empty_product_scope === true), 'coverage skeleton exception');
assert(coverage.exclusions.empty_product_scope.revalidate_by === 'P03-008', 'coverage exception deadline');

const browserVersions = {
  chromium: '149.0.7827.55',
  firefox: '151.0',
  webkit: '26.5',
};
for (const [engine, browserVersion] of Object.entries(browserVersions)) {
  const browserRoot = `${reportRoot}/browser-reports/${engine}`;
  const execution = gateJson(`${browserRoot}/browser-execution-${engine}.json`);
  assert(execution.schema === 'helix.browser-execution-report/1', `${engine}: execution schema`);
  assert(execution.selection === engine && execution.verdict === 'pass', `${engine}: execution verdict`);
  same(execution.stats, { duration_ms: execution.stats.duration_ms, expected: 1, skipped: 0, unexpected: 0, flaky: 0 }, `${engine}: execution stats`);
  assert(execution.browser_identities.length === 1, `${engine}: browser identity count`);
  assert(execution.browser_identities[0].engine === engine, `${engine}: browser engine`);
  assert(execution.browser_identities[0].browser_version === browserVersion, `${engine}: browser version`);
  assert(execution.tests.length === 1 && execution.tests[0].status === 'passed', `${engine}: browser test`);
  const bundle = gateJson(`${browserRoot}/browser-bundle-smoke.json`);
  assert(bundle.schema === 'helix.browser-example-bundle-report/1' && bundle.verdict === 'pass', `${engine}: bundle verdict`);
  assert(bundle.database_functionality === false && bundle.artifacts.length === 4, `${engine}: bundle boundary`);
  const wasm = gateJson(`${browserRoot}/wasm-browser-smoke.json`);
  assert(wasm.schema === 'helix.wasm-smoke-report/1' && wasm.mode === 'browser' && wasm.verdict === 'pass', `${engine}: Wasm verdict`);
  assert(wasm.artifacts.length === 1 && wasm.artifacts[0].bytes === 86, `${engine}: Wasm artifact`);
  assert(wasm.artifacts[0].sha256 === bundle.wasm_source_sha256, `${engine}: Wasm binding`);
}
const wgsl = gateJson(`${reportRoot}/browser-reports/chromium/wgsl-fixtures.json`);
assert(wgsl.schema === 'helix.wgsl-validation-report/1', 'hosted WGSL schema');
same(wgsl.summary, { accepted: 2, failed: 0, fixtures: 4, passed: 4, pipelines_created: 2, rejected: 2 }, 'hosted WGSL summary');
assert(wgsl.fixtures.every(({ passed }) => passed === true), 'hosted WGSL fixture verdicts');

const promotedTree = (directory, prefix = '') =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? promotedTree(child, relative) : [relative];
  });
const actualPromotedFiles = promotedTree(path.join(gateDirectory, reportRoot));
same(
  sorted(actualPromotedFiles),
  sorted([
    'promotion-manifest.json',
    ...[...promotedPaths].map((promotedPath) => promotedPath.slice('evidence/phase-02/G02/reports/hosted-gating/'.length)),
  ]),
  'promoted repository inventory',
);

const review = gateBytes(manifest.review).toString('utf8');
same(
  manifest.gate_documents.map(({ path: documentPath }) => documentPath),
  ['README.md', 'review.md'],
  'gate document inventory',
);
for (const document of manifest.gate_documents) {
  const bytes = gateBytes(document.path);
  assert(bytes.length === document.bytes, `${document.path}: gate document bytes`);
  assert(sha256(bytes) === document.sha256, `${document.path}: gate document SHA-256`);
}
for (const marker of [
  'Verdict: Pass',
  'G02-F01 — Initial audit had no hosted evidence',
  'G02-F02 — First hosted run failed Windows canonical-byte validation',
  'G02-F03 — Hosted diagnostic artifacts expire after 30 days',
  'G02-F04 — Default environment token could not dispatch nightly CI',
  'G02-F05 — Remote main lacks branch protection and required checks',
  'G02-F06 — Green skeleton lanes could be mistaken for product support',
  'G02 may be checked',
]) {
  assert(review.includes(marker), `review marker absent: ${marker}`);
}
assert(
  statSync(path.join(gateDirectory, 'attempts/2026-07-11-hosted-evidence-missing/manifest.json')).isFile(),
  'blocked gate attempt is not preserved',
);

const specificationRequirements = new Set(
  showText('Specifications.md').match(/\b(?:INV|PLAT|CORE|DATA|QUERY|STORE|GPU|DIST|CACHE|SYNC|SEC|OPS|QUAL|COMPAT)-\d{3}\b/g) ?? [],
);
const ledgerRequirements = new Set(
  showText('docs/governance/requirements.md').match(/\b(?:INV|PLAT|CORE|DATA|QUERY|STORE|GPU|DIST|CACHE|SYNC|SEC|OPS|QUAL|COMPAT)-\d{3}\b/g) ?? [],
);
assert(specificationRequirements.size === 44, 'specification requirement count');
same(sorted(ledgerRequirements), sorted(specificationRequirements), 'requirement ledger IDs');

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', reviewedArgument])
  .trim()
  .split('\n')
  .filter(Boolean);
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
    assert(target !== '..' && !target.startsWith('../'), `${file}: local link escapes repository`);
    gitText(['cat-file', '-e', `${reviewedArgument}:${target}`]);
    localLinks += 1;
  }
}
assert(trackedFiles.length === 418, `reviewed tracked files: ${trackedFiles.length}`);
assert(markdownFiles.length === 160, `reviewed Markdown count: ${markdownFiles.length}`);
assert(localLinks === 1074, `reviewed local-link count: ${localLinks}`);

const workflowCheck = spawnSync(
  'python3',
  [
    '-c',
    [
      'import json, subprocess, yaml',
      `commit="${reviewedArgument}"`,
      'paths=[".github/workflows/benchmark-baseline.yml",".github/workflows/ci-nightly.yml",".github/workflows/ci.yml"]',
      'docs=[yaml.safe_load(subprocess.check_output(["git","show",f"{commit}:{path}"],text=True)) for path in paths]',
      'print(json.dumps({"files":len(paths),"jobs":sum(len(doc["jobs"]) for doc in docs),"steps":sum(len(job.get("steps",[])) for doc in docs for job in doc["jobs"].values())}))',
    ].join(';'),
  ],
  { cwd: repository, encoding: 'utf8' },
);
assert(workflowCheck.status === 0, `workflow parse failed: ${workflowCheck.stderr}`);
same(JSON.parse(workflowCheck.stdout), { files: 3, jobs: 9, steps: 56 }, 'workflow inventory');

const p02017Manifest = JSON.parse(showText('evidence/phase-02/P02-017/manifest.json'));
const aggregateReplay = execFileSync(
  'node',
  [path.join(repository, 'evidence/phase-02/P02-017/verify.mjs'), p02017Manifest.commit],
  {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    timeout: 1_200_000,
  },
);
for (const marker of [
  'PASS exact 19-path P02-017 source scope',
  'PASS exact replay: Node 22.23.1 and 24.18.0 clean installs/preflights/foundation profiles',
  'PASS local boundary profiles: native example, 3 real browsers, Wasm, coverage, ASan, and WGSL',
  'PASS rejection: 35 source canaries plus 17 isolated evidence mutations with clean restoration',
]) {
  assert(aggregateReplay.includes(marker), `aggregate replay marker absent: ${marker}`);
}

const verifierBytes = readFileSync(path.join(gateDirectory, 'verify.mjs'));
assert(verifierBytes.length === manifest.verifier.bytes, 'gate verifier byte count');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'gate verifier SHA-256');
const verifierTestBytes = readFileSync(path.join(gateDirectory, 'test-verifier.mjs'));
assert(verifierTestBytes.length === manifest.verifier_test.bytes, 'gate verifier-test byte count');
assert(sha256(verifierTestBytes) === manifest.verifier_test.sha256, 'gate verifier-test SHA-256');
same(
  manifest.verification,
  {
    implementation_plan_items: 522,
    phase_02_tasks: 17,
    distinct_source_commits: 17,
    source_artifact_records: 439,
    retained_artifact_records: 21,
    produced_artifact_records: 5,
    removed_artifact_records: 4,
    verifier_records: 17,
    accepted_adrs: 1,
    gate_requirements: 17,
    gating_lanes: 11,
    gating_workflow_jobs: 12,
    nightly_native_lanes: 2,
    nightly_workflow_jobs: 3,
    observational_lanes: 1,
    bootstrap_profiles: 4,
    troubleshooting_codes: 17,
    node_lanes: 2,
    native_tests: 9,
    browser_engines: 3,
    hosted_successful_jobs: 15,
    hosted_artifacts: 5,
    hosted_archive_bytes: 167881,
    promoted_source_files: 21,
    promoted_identity_files: 20,
    promoted_encoded_files: 1,
    evidence_rejection_canaries: 4,
    failed_hosted_attempts: 1,
    resolved_findings: 5,
    tracked_later_findings: 1,
    workflow_files: 3,
    workflow_jobs: 9,
    workflow_steps: 56,
    reviewed_tracked_files: 418,
    reviewed_markdown_files: 160,
    reviewed_local_links: 1074,
    specification_requirements: 44,
    gate_checked_at_reviewed_commit: false,
  },
  'gate verification summary',
);

process.stdout.write(`PASS G02 reviewed source ${reviewedArgument}\n`);
process.stdout.write(
  'PASS task evidence: 17 manifests, 439 source artifacts, 21 retained reports, 17 verifiers\n',
);
process.stdout.write(
  'PASS hosted gating: contract plus 11/11 lanes, 12 successful jobs, 5 artifact archives\n',
);
process.stdout.write(
  'PASS hosted nightly: contract plus Linux arm64 and macOS x64, 3 successful jobs\n',
);
process.stdout.write(
  'PASS durable promotion: 5 archives, 21 source files, original signature payload restored\n',
);
process.stdout.write(
  'PASS aggregate replay: exact Node lines, native/browser, Wasm, coverage, ASan, WGSL, canaries\n',
);
process.stdout.write('PASS gate evidence canary authority: 4 isolated semantic mutations\n');
process.stdout.write('PASS independent review: 5 resolved findings, 1 tracked later, G02 may close\n');

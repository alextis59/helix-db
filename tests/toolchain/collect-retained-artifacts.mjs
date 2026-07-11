#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  artifactIdentity,
  assert,
  currentEnvironment,
  currentSourceControl,
  executionId,
  fileIdentity,
  findProducer,
  findProfile,
  jsonBytes,
  loadPolicy,
  repository,
  resolveRepositoryPath,
  retentionClaimBoundary,
  sha256,
  validateBrowserExecutionReport,
  validateBundleManifest,
  validateDependencyDiagnostics,
  validateSchemas,
} from './artifact-retention-contract.mjs';

const profileId = process.argv[2];
const variant = process.argv[3];
const allowed =
  (profileId === 'golden-formats' && variant === 'hdoc-v1') ||
  (profileId === 'test-replays' && ['semantic', 'coverage'].includes(variant)) ||
  (profileId === 'browser-reports' && ['chromium', 'firefox', 'webkit'].includes(variant));

const sanitizeText = (value) => {
  const withoutPaths = String(value)
    .replaceAll(repository, '<repository>')
    .replaceAll(os.homedir(), '<home>')
    .replaceAll('\r\n', '\n');
  let sanitized = '';
  for (let index = 0; index < withoutPaths.length; index += 1) {
    if (withoutPaths.codePointAt(index) === 27) {
      sanitized += '<escape>';
      while (index + 1 < withoutPaths.length) {
        index += 1;
        const codePoint = withoutPaths.codePointAt(index);
        if (codePoint !== undefined && codePoint >= 64 && codePoint <= 126) break;
      }
    } else {
      sanitized += withoutPaths[index];
    }
  }
  return sanitized.slice(0, 4 * 1024 * 1024);
};

const run = (command) => {
  const environment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  delete environment.FORCE_COLOR;
  delete environment.NO_COLOR;
  const result = spawnSync(command[0], command.slice(1), {
    cwd: repository,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) return { exitCode: 1, output: `spawn error: ${result.error.message}\n` };
  return {
    exitCode: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
};

const copyArtifact = (bundleRoot, sourcePath, destinationPath, role) => {
  const source = resolveRepositoryPath(sourcePath);
  const destination = path.join(bundleRoot, destinationPath);
  assert(destination.startsWith(`${bundleRoot}${path.sep}`), 'bundle destination escapes');
  mkdirSync(path.dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return artifactIdentity(bundleRoot, destinationPath, role);
};

const baseManifest = (profile, producer, recordedAt) => {
  const environment = currentEnvironment();
  return {
    schema: 'helix.retained-artifact-bundle/1',
    plan_item: 'P02-015',
    profile: profile.id,
    variant: producer.variant,
    status: 'failed',
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
      exit_code: 1,
    },
    source_inputs: producer.required_sources.map(fileIdentity),
    artifacts: [],
    failures: [],
    claim_boundary: retentionClaimBoundary,
    verdict: 'fail',
  };
};

const writeBundle = (bundleRoot, manifest, profile) => {
  manifest.artifacts.sort((left, right) => left.path.localeCompare(right.path));
  const passed = manifest.failures.length === 0 && manifest.producer.exit_code === 0;
  manifest.status = passed ? 'complete' : 'failed';
  manifest.verdict = passed ? 'pass' : 'fail';
  const manifestBytes = jsonBytes(manifest);
  assert(manifestBytes.length <= 262144, 'retained bundle manifest exceeds size limit');
  const payloadBytes = manifest.artifacts.reduce((total, artifact) => total + artifact.bytes, 0);
  assert(
    payloadBytes <= profile.maximum_bundle_bytes,
    'retained bundle exceeds profile size limit',
  );
  writeFileSync(path.join(bundleRoot, 'manifest.json'), manifestBytes, { flag: 'wx' });
  validateBundleManifest(manifest, bundleRoot, { requireComplete: passed });
  process.stdout.write(
    `${passed ? 'PASS' : 'FAIL'} retained artifacts ${manifest.profile}/${manifest.variant}: ${manifest.artifacts.length} payloads, ${payloadBytes} bytes, manifest ${manifestBytes.length} bytes\n`,
  );
  if (!passed) throw new Error(`retained bundle recorded failure: ${manifest.failures.join('; ')}`);
};

const collectSemanticReplay = (profile, producer, bundleRoot) => {
  const recordedAt = new Date().toISOString();
  const manifest = baseManifest(profile, producer, recordedAt);
  const result = run(producer.upstream_command);
  const log = sanitizeText(
    `command: ${producer.upstream_command.join(' ')}\nexit_code: ${result.exitCode}\n${result.output}`,
  );
  writeFileSync(path.join(bundleRoot, 'conformance.log'), log || 'no output\n');
  manifest.artifacts.push(artifactIdentity(bundleRoot, 'conformance.log', 'raw-test-log'));
  if (result.exitCode !== 0)
    manifest.failures.push(`semantic conformance exited ${result.exitCode}`);

  const dependencyFiles = [
    'cargo-audit.json',
    'cargo-audit-tool.json',
    'inventory-report.json',
    'npm-audit.json',
    'npm-signatures.json',
    'observation-report.json',
  ];
  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const file of dependencyFiles) {
      const sourcePath = `dist/dependency/${file}`;
      if (existsSync(resolveRepositoryPath(sourcePath))) {
        manifest.artifacts.push(
          copyArtifact(bundleRoot, sourcePath, `dependency/${file}`, 'dependency-diagnostic'),
        );
      } else {
        manifest.failures.push(`required CI dependency report absent: ${sourcePath}`);
      }
    }
    const completeDependencySet = dependencyFiles.every((file) =>
      manifest.artifacts.some(({ path: artifactPath }) => artifactPath === `dependency/${file}`),
    );
    if (completeDependencySet) {
      try {
        validateDependencyDiagnostics(bundleRoot, manifest);
      } catch (error) {
        manifest.failures.push(
          `dependency diagnostics: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  manifest.producer.exit_code = manifest.failures.length === 0 ? 0 : result.exitCode || 1;
  writeBundle(bundleRoot, manifest, profile);
};

const collectGoldenFormats = (profile, producer, bundleRoot) => {
  const manifest = baseManifest(profile, producer, new Date().toISOString());
  const result = run(producer.upstream_command);
  if (result.exitCode !== 0) manifest.failures.push(`HDoc golden check exited ${result.exitCode}`);
  try {
    const golden = JSON.parse(
      readFileSync(resolveRepositoryPath('fixtures/hdoc/v1/manifest.json'), 'utf8'),
    );
    assert(golden.schema === 'helix.hdoc-golden-manifest/1', 'HDoc golden manifest schema');
    assert(golden.format?.frozen === true, 'HDoc golden format is not frozen');
    assert(golden.cases?.length === 24, 'HDoc golden case count');
    manifest.artifacts.push(
      copyArtifact(
        bundleRoot,
        'fixtures/hdoc/v1/manifest.json',
        'hdoc/v1/manifest.json',
        'golden-format-manifest',
      ),
      copyArtifact(
        bundleRoot,
        'fixtures/hdoc/v1/schema/manifest-v1.schema.json',
        'hdoc/v1/manifest-v1.schema.json',
        'golden-format-schema',
      ),
    );
    for (const fixture of golden.cases) {
      const bytes = readFileSync(resolveRepositoryPath(fixture.path));
      assert(bytes.length === fixture.bytes, `${fixture.id}: golden byte length`);
      assert(sha256(bytes) === fixture.sha256, `${fixture.id}: golden SHA-256`);
      manifest.artifacts.push(
        copyArtifact(
          bundleRoot,
          fixture.path,
          `hdoc/v1/cases/${path.basename(fixture.path)}`,
          fixture.kind === 'positive' ? 'golden-format-positive' : 'golden-format-rejection',
        ),
      );
    }
  } catch (error) {
    manifest.failures.push(error instanceof Error ? error.message : String(error));
  }
  manifest.producer.exit_code = manifest.failures.length === 0 ? 0 : result.exitCode || 1;
  writeBundle(bundleRoot, manifest, profile);
};

const collectCoverageReplay = (profile, producer, bundleRoot) => {
  const manifest = baseManifest(profile, producer, new Date().toISOString());
  const sourcePath = producer.required_generated[0];
  if (!existsSync(resolveRepositoryPath(sourcePath))) {
    manifest.failures.push(`required coverage report absent: ${sourcePath}`);
  } else {
    try {
      const report = JSON.parse(readFileSync(resolveRepositoryPath(sourcePath), 'utf8'));
      assert(
        report.schema === 'helix.rust-coverage-report/1' && report.verdict === 'pass',
        'coverage report schema or verdict mismatch',
      );
      manifest.artifacts.push(
        copyArtifact(bundleRoot, sourcePath, 'rust-coverage.json', 'coverage-report'),
      );
    } catch (error) {
      manifest.failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  manifest.producer.exit_code = manifest.failures.length === 0 ? 0 : 1;
  writeBundle(bundleRoot, manifest, profile);
};

const collectBrowserReport = (profile, producer, bundleRoot) => {
  const manifest = baseManifest(profile, producer, new Date().toISOString());
  const generated = [
    ...producer.required_generated,
    ...(producer.variant === 'chromium' ? ['dist/validation/wgsl-fixtures.json'] : []),
  ];
  let browserExecution = null;
  for (const sourcePath of generated) {
    if (!existsSync(resolveRepositoryPath(sourcePath))) {
      manifest.failures.push(`required browser report absent: ${sourcePath}`);
      continue;
    }
    const destination = path.basename(sourcePath);
    let role = 'browser-validation-report';
    if (destination.startsWith('browser-execution-')) role = 'browser-execution-report';
    else if (destination === 'wgsl-fixtures.json') role = 'wgsl-validation-report';
    manifest.artifacts.push(copyArtifact(bundleRoot, sourcePath, destination, role));
    try {
      const report = JSON.parse(readFileSync(resolveRepositoryPath(sourcePath), 'utf8'));
      if (destination.startsWith('browser-execution-')) {
        browserExecution = validateBrowserExecutionReport(report, producer.variant);
        if (report.verdict !== 'pass') manifest.failures.push('browser execution report failed');
      } else if (destination === 'wgsl-fixtures.json') {
        if (
          report.schema !== 'helix.wgsl-validation-report/1' ||
          report.summary?.failed !== 0 ||
          report.summary?.passed !== 4
        ) {
          manifest.failures.push(`${destination}: WGSL validation report failed`);
        }
      } else if (report.verdict !== 'pass') {
        manifest.failures.push(`${destination}: validation report failed`);
      }
    } catch (error) {
      manifest.failures.push(
        `${destination}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (browserExecution) {
    for (const test of browserExecution.tests) {
      for (const attachment of test.attachments) {
        if (
          !manifest.artifacts.some(({ path: artifactPath }) => artifactPath === attachment.path)
        ) {
          manifest.artifacts.push(
            copyArtifact(
              bundleRoot,
              attachment.path,
              attachment.path,
              'browser-failure-attachment',
            ),
          );
        }
      }
    }
    manifest.failures.push(...browserExecution.failures.map((failure) => `browser: ${failure}`));
  }
  manifest.producer.exit_code = manifest.failures.length === 0 ? 0 : 1;
  writeBundle(bundleRoot, manifest, profile);
};

try {
  assert(
    process.argv.length === 4 && allowed,
    'usage: node tests/toolchain/collect-retained-artifacts.mjs <golden-formats hdoc-v1|test-replays semantic|test-replays coverage|browser-reports chromium|browser-reports firefox|browser-reports webkit>',
  );
  validateSchemas();
  const policy = loadPolicy();
  const profile = findProfile(policy, profileId);
  const producer = findProducer(profile, variant);
  const bundleRoot = resolveRepositoryPath(producer.output);
  rmSync(bundleRoot, { recursive: true, force: true });
  mkdirSync(bundleRoot, { recursive: true });
  if (profileId === 'golden-formats') {
    collectGoldenFormats(profile, producer, bundleRoot);
  } else if (profileId === 'test-replays' && variant === 'semantic') {
    collectSemanticReplay(profile, producer, bundleRoot);
  } else if (profileId === 'test-replays') {
    collectCoverageReplay(profile, producer, bundleRoot);
  } else {
    collectBrowserReport(profile, producer, bundleRoot);
  }
} catch (error) {
  process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

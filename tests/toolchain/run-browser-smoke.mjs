#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  jsonBytes,
  sanitizeBrowserDiagnostic,
  validateBrowserExecutionReport,
} from './artifact-retention-contract.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const selected = process.argv[2];
const supported = ['chromium', 'firefox', 'webkit', 'all'];
if (!selected || !supported.includes(selected) || process.argv.length !== 3) {
  throw new Error(`usage: node tests/toolchain/run-browser-smoke.mjs <${supported.join('|')}>`);
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const environment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
delete environment.FORCE_COLOR;
delete environment.NO_COLOR;
const run = (program, args, { allowFailure = false } = {}) => {
  const result = spawnSync(program, args, {
    cwd: repository,
    encoding: 'utf8',
    env: environment,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (!allowFailure) {
    assert(result.status === 0, `${program} ${args.join(' ')} exited ${result.status}`);
  }
  return result;
};

const sanitizeText = (value) =>
  sanitizeBrowserDiagnostic(value, [
    [repository, '<repository>'],
    [os.homedir(), '<home>'],
  ]);

const hashFile = (file) => {
  const details = statSync(file);
  assert(details.isFile() && details.size > 0, 'browser launcher is not a nonempty file');
  assert(details.size <= 1073741824, 'browser launcher exceeds identity size cap');
  const hash = createHash('sha256');
  const descriptor = openSync(file, 'r');
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = readSync(descriptor, chunk, 0, chunk.length, null);
      if (bytesRead > 0) hash.update(chunk.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    closeSync(descriptor);
  }
  return { bytes: details.size, sha256: hash.digest('hex') };
};

const relativeTestFile = (file) => {
  const normalized = file.split(path.sep).join('/');
  if (!path.isAbsolute(file)) return `tests/browser/${normalized}`;
  const relative = path
    .relative(path.join(repository, 'tests/browser'), file)
    .split(path.sep)
    .join('/');
  assert(
    relative !== '..' && !relative.startsWith('../'),
    'Playwright test path escapes test root',
  );
  return `tests/browser/${relative}`;
};

const attachmentIdentity = (attachment) => {
  assert(typeof attachment.path === 'string', 'in-memory browser attachment is not retainable');
  const absolute = path.resolve(attachment.path);
  const resultRoot = path.join(repository, 'test-results');
  assert(
    absolute.startsWith(`${resultRoot}${path.sep}`),
    'browser attachment escapes test-results',
  );
  const relative = path.relative(repository, absolute).split(path.sep).join('/');
  const bytes = readFileSync(absolute);
  assert(bytes.length > 0 && bytes.length <= 67108864, 'browser attachment size');
  return {
    name: sanitizeText(attachment.name ?? 'attachment'),
    content_type: sanitizeText(attachment.contentType ?? 'application/octet-stream'),
    path: relative,
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
};

const collectSpecs = (suite) => [
  ...(suite.specs ?? []),
  ...(suite.suites ?? []).flatMap(collectSpecs),
];

run(process.execPath, ['tests/toolchain/build-browser-smoke.mjs']);
const reportDirectory = path.join(repository, 'dist/validation');
mkdirSync(reportDirectory, { recursive: true });
const rawReportPath = path.join(reportDirectory, `playwright-raw-${selected}.json`);
const reportPath = path.join(reportDirectory, `browser-execution-${selected}.json`);
rmSync(rawReportPath, { force: true });
rmSync(reportPath, { force: true });
environment.PLAYWRIGHT_JSON_OUTPUT_FILE = rawReportPath;
const arguments_ = ['npm', 'exec', '--', 'playwright', 'test', '--reporter=line,json'];
if (selected !== 'all') arguments_.push(`--project=${selected}`);
const result = run('corepack', arguments_, { allowFailure: true });
assert(statSync(rawReportPath).isFile(), 'Playwright JSON report was not created');
const rawReport = JSON.parse(readFileSync(rawReportPath, 'utf8'));

const dependencyPolicy = JSON.parse(
  readFileSync(path.join(repository, 'tests/toolchain/dependency-report-policy.json'), 'utf8'),
);
const expectedBrowsers =
  dependencyPolicy.external_tools.playwright_browsers.expected_default_browsers;
const playwright = await import('@playwright/test');
const engines = selected === 'all' ? ['chromium', 'firefox', 'webkit'] : [selected];
const browserIdentities = engines.map((engine) => {
  const expected = expectedBrowsers.find(({ name }) => name === engine);
  assert(expected, `${engine}: browser policy entry absent`);
  const browserType = playwright[engine];
  assert(browserType, `${engine}: Playwright browser type absent`);
  const launcher = hashFile(browserType.executablePath());
  return {
    engine,
    revision: expected.revision,
    browser_version: expected.browser_version,
    launcher_bytes: launcher.bytes,
    launcher_sha256: launcher.sha256,
  };
});

const tests = rawReport.suites.flatMap(collectSpecs).flatMap((spec) =>
  spec.tests.flatMap((test) =>
    test.results.map((testResult) => ({
      file: relativeTestFile(spec.file),
      line: spec.line,
      column: spec.column,
      title: sanitizeText(spec.title),
      project: test.projectName,
      status: testResult.status,
      expected_status: test.expectedStatus,
      retry: testResult.retry,
      duration_ms: Math.round(testResult.duration),
      errors: (testResult.errors ?? []).map((error) =>
        sanitizeText(error.message ?? error.stack ?? String(error)),
      ),
      attachments: (testResult.attachments ?? []).map(attachmentIdentity),
    })),
  ),
);
const failures = (rawReport.errors ?? []).map((error) =>
  sanitizeText(error.message ?? error.stack ?? String(error)),
);
if (result.status !== 0 && failures.length === 0 && rawReport.stats.unexpected === 0) {
  failures.push(`Playwright exited ${result.status ?? 'by signal'}`);
}
const report = {
  schema: 'helix.browser-execution-report/1',
  plan_item: 'P02-015',
  recorded_at: new Date(rawReport.stats.startTime).toISOString(),
  selection: selected,
  playwright_version: '1.61.1',
  browser_identities: browserIdentities,
  stats: {
    duration_ms: Math.round(rawReport.stats.duration),
    expected: rawReport.stats.expected,
    skipped: rawReport.stats.skipped,
    unexpected: rawReport.stats.unexpected,
    flaky: rawReport.stats.flaky,
  },
  tests,
  failures,
  verdict:
    result.status === 0 && rawReport.stats.unexpected === 0 && failures.length === 0
      ? 'pass'
      : 'fail',
};
validateBrowserExecutionReport(report, selected);
writeFileSync(reportPath, jsonBytes(report));
rmSync(rawReportPath, { force: true });
process.stdout.write(
  `REPORT ${path.relative(repository, reportPath)} ${sha256(readFileSync(reportPath))}\n`,
);

const expected = selected === 'all' ? 15 : 5;
assert(result.status === 0, `Playwright exited ${result.status ?? `by signal ${result.signal}`}`);
assert(
  report.stats.expected === expected,
  `${selected}: Playwright pass count did not equal ${expected}`,
);
assert(report.verdict === 'pass', `${selected}: browser execution report failed`);
process.stdout.write(`PASS browser smoke ${selected}: ${expected} real-browser execution(s)\n`);

#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureRoot = path.join(repository, 'shaders/fixtures');
const manifestPath = path.join(fixtureRoot, 'manifest.json');
const packageJson = JSON.parse(readFileSync(path.join(repository, 'package.json'), 'utf8'));
const browserFlags = [
  '--enable-unsafe-webgpu',
  '--use-webgpu-adapter=swiftshader',
  '--enable-dawn-backend-validation',
  '--enable-dawn-features=allow_unsafe_apis',
  '--disable-dawn-features=use_dxc',
  '--enable-webgpu-developer-features',
  '--use-gpu-in-tests',
];

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

const listWgslSources = (directory, relative = '') => {
  const sources = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const childRelative = path.posix.join(relative, entry.name);
    const child = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `${childRelative}: fixture symlinks are prohibited`);
    if (entry.isDirectory()) sources.push(...listWgslSources(child, childRelative));
    else if (entry.isFile() && entry.name.endsWith('.wgsl')) sources.push(childRelative);
  }
  return sources;
};

const validateManifest = () => {
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  same(
    sorted(Object.keys(manifest)),
    ['fixtures', 'plan_item', 'schema', 'validator'],
    'WGSL manifest fields',
  );
  assert(manifest.schema === 'helix.wgsl-fixtures/1', 'WGSL fixture schema mismatch');
  assert(manifest.plan_item === 'P02-011', 'WGSL fixture plan item mismatch');
  same(
    manifest.validator,
    {
      backend: 'dawn-swiftshader',
      browser: 'chromium',
      operation: 'shader-module-validation-and-compute-pipeline-creation',
      playwright_version: '1.61.1',
      trusted_repository_sources_only: true,
    },
    'WGSL validator authority',
  );
  assert(
    packageJson.devDependencies['@playwright/test'] === manifest.validator.playwright_version,
    'WGSL validator Playwright version differs from the locked direct dependency',
  );
  assert(Array.isArray(manifest.fixtures), 'WGSL fixtures must be an array');
  assert(manifest.fixtures.length === 4, 'P02-011 requires exactly four bootstrap fixtures');

  const fixtureFields = [
    'entry_point',
    'expected_outcome',
    'id',
    'path',
    'purpose',
    'required_diagnostic_markers',
    'source_sha256',
    'stage',
  ];
  const identifiers = new Set();
  const paths = new Set();
  const purposes = new Set();
  const fixtures = [];
  for (const fixture of manifest.fixtures) {
    same(sorted(Object.keys(fixture)), fixtureFields, `${fixture.id ?? 'unknown'} fields`);
    assert(/^(?:valid|invalid)-[a-z0-9-]+$/.test(fixture.id), `${fixture.id}: invalid ID`);
    assert(!identifiers.has(fixture.id), `${fixture.id}: duplicate ID`);
    identifiers.add(fixture.id);
    assert(
      /^(?:valid|invalid)\/[a-z0-9-]+\.wgsl$/.test(fixture.path),
      `${fixture.id}: invalid source path`,
    );
    assert(!paths.has(fixture.path), `${fixture.id}: duplicate source path`);
    paths.add(fixture.path);
    assert(['accept', 'reject'].includes(fixture.expected_outcome), `${fixture.id}: bad outcome`);
    assert(
      fixture.path.startsWith(`${fixture.expected_outcome === 'accept' ? 'valid' : 'invalid'}/`),
      `${fixture.id}: outcome and directory disagree`,
    );
    assert(fixture.stage === 'compute', `${fixture.id}: only compute fixtures are in scope`);
    assert(fixture.entry_point === 'main', `${fixture.id}: bootstrap entry point must be main`);
    assert(/^[a-z0-9-]+$/.test(fixture.purpose), `${fixture.id}: invalid purpose`);
    assert(!purposes.has(fixture.purpose), `${fixture.id}: duplicate purpose`);
    purposes.add(fixture.purpose);
    assert(/^[0-9a-f]{64}$/.test(fixture.source_sha256), `${fixture.id}: invalid source SHA-256`);
    assert(
      Array.isArray(fixture.required_diagnostic_markers),
      `${fixture.id}: diagnostic markers must be an array`,
    );
    assert(
      fixture.required_diagnostic_markers.every(
        (marker) => typeof marker === 'string' && marker.length >= 10 && !marker.includes('\n'),
      ),
      `${fixture.id}: invalid diagnostic marker`,
    );
    assert(
      fixture.expected_outcome === 'accept'
        ? fixture.required_diagnostic_markers.length === 0
        : fixture.required_diagnostic_markers.length > 0,
      `${fixture.id}: diagnostic expectation disagrees with outcome`,
    );

    const sourcePath = path.join(fixtureRoot, ...fixture.path.split('/'));
    assert(!lstatSync(sourcePath).isSymbolicLink(), `${fixture.id}: source symlink prohibited`);
    assert(
      realpathSync(sourcePath).startsWith(`${realpathSync(fixtureRoot)}${path.sep}`),
      `${fixture.id}: source escapes fixture root`,
    );
    const sourceBytes = readFileSync(sourcePath);
    assert(sourceBytes.length > 0 && sourceBytes.length <= 16 * 1024, `${fixture.id}: bad size`);
    assert(sha256(sourceBytes) === fixture.source_sha256, `${fixture.id}: source hash mismatch`);
    const source = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
    assert(!source.startsWith('\uFEFF'), `${fixture.id}: UTF-8 BOM prohibited`);
    assert(!source.includes('\r') && !source.includes('\0'), `${fixture.id}: noncanonical text`);
    assert(source.endsWith('\n'), `${fixture.id}: terminal newline absent`);
    fixtures.push({ ...fixture, source });
  }

  same(sorted(listWgslSources(fixtureRoot)), sorted(paths), 'WGSL source inventory');
  same(
    sorted(purposes),
    [
      'minimal-compute-pipeline',
      'resource-binding-rejection',
      'storage-resource-layout',
      'syntax-rejection',
    ],
    'P02-011 fixture purposes',
  );
  assert(
    fixtures.filter(({ expected_outcome: outcome }) => outcome === 'accept').length === 2 &&
      fixtures.filter(({ expected_outcome: outcome }) => outcome === 'reject').length === 2,
    'P02-011 requires two accepted and two rejected fixtures',
  );
  return { fixtures, manifest, manifestSha256: sha256(manifestBytes) };
};

const startLoopbackServer = async () => {
  const server = http.createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found\n');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-security-policy': "default-src 'none'",
      'content-type': 'text/html; charset=utf-8',
      'permissions-policy': 'webgpu=(self)',
    });
    response.end('<!doctype html><meta charset="utf-8"><title>WGSL validator</title>\n');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object', 'loopback validator address unavailable');
  return { server, url: `http://127.0.0.1:${address.port}/` };
};

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

const validateWithChromium = async ({ fixtures, manifestSha256 }) => {
  const { chromium } = await import('@playwright/test');
  const { server, url } = await startLoopbackServer();
  let browser;
  try {
    browser = await chromium.launch({ args: browserFlags, headless: true });
    const page = await browser.newPage();
    const hostFailures = [];
    page.on('console', (message) => {
      if (message.type() === 'error') hostFailures.push(`console: ${message.text()}`);
    });
    page.on('pageerror', (error) => hostFailures.push(`page: ${error.message}`));
    page.on('requestfailed', (request) =>
      hostFailures.push(`request: ${request.url()} ${request.failure()?.errorText ?? 'unknown'}`),
    );
    const response = await page.goto(url);
    assert(response?.ok(), 'loopback WGSL validator page did not load');

    const runtime = await page.evaluate(
      async (fixtureInputs) => {
        if (!isSecureContext) return { capabilityError: 'loopback page is not a secure context' };
        if (!navigator.gpu) return { capabilityError: 'navigator.gpu is absent' };
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
        if (!adapter) return { capabilityError: 'WebGPU adapter is unavailable' };
        const device = await adapter.requestDevice();
        const uncapturedErrors = [];
        device.addEventListener('uncapturederror', (event) => {
          uncapturedErrors.push(event.error.message);
        });
        const results = [];
        for (const fixture of fixtureInputs) {
          device.pushErrorScope('validation');
          const shaderModule = device.createShaderModule({
            code: fixture.source,
            label: `helix-fixture:${fixture.id}`,
          });
          const compilationInfo = await shaderModule.getCompilationInfo();
          let pipelineCreated = false;
          let pipelineRejection = null;
          try {
            await device.createComputePipelineAsync({
              label: `helix-fixture:${fixture.id}`,
              layout: 'auto',
              compute: { module: shaderModule, entryPoint: fixture.entry_point },
            });
            pipelineCreated = true;
          } catch (error) {
            pipelineRejection = String(error);
          }
          const validationError = await device.popErrorScope();
          results.push({
            id: fixture.id,
            messages: compilationInfo.messages.map((message) => ({
              length: message.length,
              lineNum: message.lineNum,
              linePos: message.linePos,
              message: message.message,
              offset: message.offset,
              type: message.type,
            })),
            pipelineCreated,
            pipelineRejection,
            validationError: validationError?.message ?? null,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
        const result = {
          adapter: {
            architecture: adapter.info.architecture,
            description: adapter.info.description,
            device: adapter.info.device,
            vendor: adapter.info.vendor,
          },
          capabilityError: null,
          results,
          secureContext: isSecureContext,
          uncapturedErrors,
        };
        device.destroy();
        return result;
      },
      fixtures.map(({ entry_point: entryPoint, id, source }) => ({
        entry_point: entryPoint,
        id,
        source,
      })),
    );

    assert(runtime.capabilityError === null, runtime.capabilityError ?? 'unknown WebGPU error');
    assert(runtime.secureContext === true, 'WebGPU validator origin is not secure');
    same(
      runtime.adapter,
      {
        architecture: 'swiftshader',
        description: 'SwiftShader Device (Subzero)',
        device: '0xc0de',
        vendor: 'google',
      },
      'Dawn SwiftShader adapter identity',
    );
    same(runtime.uncapturedErrors, [], 'uncaptured WebGPU errors');
    same(hostFailures, [], 'WGSL validator host failures');
    assert(runtime.results.length === fixtures.length, 'WGSL runtime result count mismatch');

    const resultById = new Map(runtime.results.map((result) => [result.id, result]));
    const reportFixtures = fixtures.map((fixture) => {
      const result = resultById.get(fixture.id);
      assert(result, `${fixture.id}: runtime result absent`);
      const diagnostics = result.messages.map(({ message }) => message).join('\n');
      const completeDiagnostics = [diagnostics, result.pipelineRejection, result.validationError]
        .filter(Boolean)
        .join('\n');
      if (fixture.expected_outcome === 'accept') {
        assert(result.messages.length === 0, `${fixture.id}: unexpected compilation diagnostic`);
        assert(result.pipelineCreated === true, `${fixture.id}: pipeline creation failed`);
        assert(result.pipelineRejection === null, `${fixture.id}: unexpected pipeline rejection`);
        assert(result.validationError === null, `${fixture.id}: unexpected validation error`);
      } else {
        assert(
          result.messages.some(({ type }) => type === 'error'),
          `${fixture.id}: expected compilation error absent`,
        );
        assert(result.pipelineCreated === false, `${fixture.id}: invalid pipeline was created`);
        assert(result.pipelineRejection, `${fixture.id}: pipeline rejection absent`);
        assert(result.validationError, `${fixture.id}: validation error absent`);
        for (const marker of fixture.required_diagnostic_markers) {
          assert(completeDiagnostics.includes(marker), `${fixture.id}: diagnostic marker absent`);
        }
      }
      return {
        compilation_messages: result.messages,
        expected_outcome: fixture.expected_outcome,
        id: fixture.id,
        passed: true,
        path: fixture.path,
        pipeline_created: result.pipelineCreated,
        pipeline_rejected: result.pipelineRejection !== null,
        source_sha256: fixture.source_sha256,
        validation_error: result.validationError !== null,
      };
    });

    const browserVersion = browser.version();
    const accepted = fixtures.filter(
      ({ expected_outcome: outcome }) => outcome === 'accept',
    ).length;
    const rejected = fixtures.length - accepted;
    const report = {
      schema: 'helix.wgsl-validation-report/1',
      manifest_sha256: manifestSha256,
      validator: {
        adapter: runtime.adapter,
        backend: 'dawn-swiftshader',
        browser: 'chromium',
        browser_version: browserVersion,
        flags: browserFlags,
        operation: 'shader-module-validation-and-compute-pipeline-creation',
        playwright_version: packageJson.devDependencies['@playwright/test'],
        secure_context: true,
        trusted_repository_sources_only: true,
      },
      fixtures: reportFixtures,
      summary: {
        accepted,
        failed: 0,
        fixtures: fixtures.length,
        passed: fixtures.length,
        pipelines_created: reportFixtures.filter(({ pipeline_created: created }) => created).length,
        rejected,
      },
    };
    const outputDirectory = path.join(repository, 'dist/validation');
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(
      path.join(outputDirectory, 'wgsl-fixtures.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    process.stdout.write(
      `PASS WGSL validation: ${fixtures.length} fixtures, ${accepted} pipelines, ${rejected} expected rejections via Chromium ${browserVersion} Dawn/SwiftShader\n`,
    );
  } finally {
    if (browser) await browser.close();
    await closeServer(server);
  }
};

const mode = process.argv[2];
assert(
  process.argv.length === 3 && ['manifest', 'chromium'].includes(mode),
  'usage: node tests/toolchain/check-wgsl-fixtures.mjs <manifest|chromium>',
);
const validated = validateManifest();
process.stdout.write('PASS WGSL fixture manifest: 4 trusted sources, 2 accept, 2 reject\n');
if (mode === 'chromium') await validateWithChromium(validated);

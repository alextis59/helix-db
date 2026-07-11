import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const lineEndingPolicyPath = '.gitattributes';
export const policyPath = 'examples/examples.json';
export const sharedClaimBoundary =
  'These examples prove native linking and browser Wasm bundling only; they expose no document, query, storage, durability, GPU, network, compatibility, security, or release functionality.';
export const nativeClaimBoundary =
  'This example proves native Rust linking only; database document, query, storage, durability, GPU, network, compatibility, security, and release functionality is not implemented.';

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

const strictKeys = (value, expected, label) => {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`);
  same(Object.keys(value).sort(), [...expected].sort(), `${label} fields`);
};
const shortString = (value, label, maximum = 500) => {
  assert(typeof value === 'string' && value.length > 0, `${label}: expected nonempty string`);
  assert(value.length <= maximum, `${label}: exceeds ${maximum} characters`);
  assert(
    ![...value].some((character) => {
      const point = character.codePointAt(0);
      return point !== undefined && (point <= 8 || (point >= 11 && point <= 31) || point === 127);
    }),
    `${label}: prohibited control character`,
  );
};
const resolveSource = (relativePath) => {
  assert(typeof relativePath === 'string' && !path.isAbsolute(relativePath), 'example source path');
  const absolute = path.resolve(repository, relativePath);
  assert(
    absolute.startsWith(`${repository}${path.sep}`),
    `example source escapes: ${relativePath}`,
  );
  const details = lstatSync(absolute);
  assert(
    details.isFile() && !details.isSymbolicLink(),
    `example source is not a regular file: ${relativePath}`,
  );
  return absolute;
};
const readText = (relativePath) => readFileSync(resolveSource(relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(readText(relativePath));

const expectedNative = {
  id: 'native-toolchain',
  state: 'active-boundary-example',
  manifest: 'examples/native-toolchain/Cargo.toml',
  lockfile: 'examples/native-toolchain/Cargo.lock',
  source: 'examples/native-toolchain/src/main.rs',
  documentation: 'examples/native-toolchain/README.md',
  command: [
    'cargo',
    'run',
    '--locked',
    '--offline',
    '--quiet',
    '--target-dir',
    'target/examples/native-toolchain',
    '--manifest-path',
    'examples/native-toolchain/Cargo.toml',
  ],
  report: 'dist/validation/native-toolchain-example.json',
};
const expectedBrowser = {
  id: 'browser-toolchain',
  state: 'active-boundary-example',
  root: 'examples/browser-toolchain',
  documentation: 'examples/browser-toolchain/README.md',
  sources: [
    'examples/browser-toolchain/README.md',
    'examples/browser-toolchain/index.html',
    'examples/browser-toolchain/main.ts',
    'examples/browser-toolchain/report.ts',
  ],
  build_command: ['node', 'tests/toolchain/build-browser-smoke.mjs'],
  smoke_command: ['node', 'tests/toolchain/run-browser-smoke.mjs', 'all'],
  bundle_report: 'dist/validation/browser-bundle-smoke.json',
  execution_report_pattern: 'dist/validation/browser-execution-{engine}.json',
};

export const validateLineEndingPolicy = (candidate = readText(lineEndingPolicyPath)) => {
  assert(!candidate.includes('\r'), 'repository attributes canonical LF bytes');
  const activeRules = candidate
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  same(activeRules, ['* text=auto eol=lf'], 'repository text checkout policy');
  return candidate;
};

const parseLockPackages = (candidate, label) => {
  const packages = new Map();
  for (const match of candidate.matchAll(
    /(?:^|\n)\[\[package\]\]\n([\s\S]*?)(?=\n\[\[package\]\]\n|$)/g,
  )) {
    const block = `[[package]]\n${match[1].trimEnd()}\n`;
    const name = block.match(/^name = "([^"]+)"$/m)?.[1];
    assert(name, `${label} package name`);
    assert(!packages.has(name), `${label} duplicate package: ${name}`);
    packages.set(name, block);
  }
  assert(packages.size > 0, `${label} package inventory empty`);
  return packages;
};

export const validateNativeLock = (candidate = readText(expectedNative.lockfile)) => {
  assert(!candidate.includes('\r'), 'native lock canonical LF bytes');
  assert(
    candidate.startsWith('# This file is automatically @generated by Cargo.\n'),
    'native lock header',
  );
  const packages = parseLockPackages(candidate, 'native lock');
  same(
    [...packages.keys()],
    [
      'arrayref',
      'arrayvec',
      'blake3',
      'cc',
      'cfg-if',
      'constant_time_eq',
      'cpufeatures',
      'crc',
      'crc-catalog',
      'find-msvc-tools',
      'helix-columnar',
      'helix-core',
      'helix-doc',
      'helix-host-native',
      'helix-native-toolchain-example',
      'helix-query',
      'helix-storage',
      'libc',
      'lz4_flex',
      'shlex',
    ],
    'native lock package inventory',
  );
  const rootPackages = parseLockPackages(readText('Cargo.lock'), 'root lock');
  for (const name of [
    'arrayref',
    'arrayvec',
    'blake3',
    'cc',
    'cfg-if',
    'constant_time_eq',
    'cpufeatures',
    'crc',
    'crc-catalog',
    'find-msvc-tools',
    'helix-doc',
    'libc',
    'lz4_flex',
    'shlex',
  ]) {
    assert(
      packages.get(name) === rootPackages.get(name),
      `native lock root graph mismatch: ${name}`,
    );
  }
  return candidate;
};

export const validateExamplePolicy = (candidate = readJson(policyPath)) => {
  validateLineEndingPolicy();
  strictKeys(
    candidate,
    ['schema', 'plan_item', 'claim_boundary', 'native', 'browser'],
    'example policy',
  );
  assert(candidate.schema === 'helix.toolchain-examples/1', 'example policy schema');
  assert(candidate.plan_item === 'P02-016', 'example policy task');
  assert(candidate.claim_boundary === sharedClaimBoundary, 'example policy claim boundary');
  same(candidate.native, expectedNative, 'native example contract');
  same(candidate.browser, expectedBrowser, 'browser example contract');
  for (const source of [
    candidate.native.manifest,
    candidate.native.lockfile,
    candidate.native.source,
    candidate.native.documentation,
    ...candidate.browser.sources,
  ]) {
    resolveSource(source);
  }
  const nativeManifest = readText(candidate.native.manifest);
  for (const marker of [
    'name = "helix-native-toolchain-example"',
    'publish = false',
    '[workspace]',
    'helix-host-native = { path = "../../crates/helix-host-native", default-features = false }',
    'unsafe_code = "forbid"',
  ]) {
    assert(nativeManifest.includes(marker), `native manifest marker absent: ${marker}`);
  }
  validateNativeLock(readText(candidate.native.lockfile));
  const browserIndex = readText('examples/browser-toolchain/index.html');
  for (const marker of [
    'HelixDB browser toolchain boundary example',
    'Boundary skeleton — no database functionality',
    'Database functionality',
    'not implemented',
  ]) {
    assert(browserIndex.includes(marker), `browser visible boundary absent: ${marker}`);
  }
  return candidate;
};

export const loadExamplePolicy = () => validateExamplePolicy();

export const validateNativeExampleReport = (report) => {
  strictKeys(
    report,
    [
      'schema',
      'plan_item',
      'example',
      'component',
      'target',
      'database_functionality',
      'operations',
      'claim_boundary',
    ],
    'native example report',
  );
  assert(report.schema === 'helix.native-toolchain-example/1', 'native report schema');
  assert(report.plan_item === 'P02-016', 'native report task');
  assert(report.example === 'native-toolchain', 'native report example');
  same(
    report.component,
    {
      name: 'helix-host-native',
      maturity: 'boundary-skeleton',
      required_dependencies: ['helix-core'],
    },
    'native report component',
  );
  strictKeys(report.target, ['architecture', 'operating_system'], 'native report target');
  assert(['x86_64', 'aarch64'].includes(report.target.architecture), 'native report architecture');
  assert(
    ['linux', 'macos', 'windows'].includes(report.target.operating_system),
    'native report OS',
  );
  assert(report.database_functionality === false, 'native database functionality claim');
  same(report.operations, [], 'native operation inventory');
  assert(report.claim_boundary === nativeClaimBoundary, 'native report claim boundary');
  return report;
};

export const validateBrowserExampleReport = (report) => {
  strictKeys(
    report,
    [
      'schema',
      'planItem',
      'example',
      'component',
      'databaseFunctionality',
      'demonstrates',
      'notImplemented',
      'wasm',
    ],
    'browser example report',
  );
  assert(report.schema === 'helix.browser-toolchain-example/1', 'browser example schema');
  assert(report.planItem === 'P02-016', 'browser example task');
  assert(report.example === 'browser-toolchain', 'browser example ID');
  same(
    report.component,
    { name: 'helix-core', maturity: 'boundary-skeleton' },
    'browser example component',
  );
  assert(report.databaseFunctionality === false, 'browser database functionality claim');
  same(
    report.demonstrates,
    ['rust-wasm-build', 'vite-bundle', 'wasm-validation', 'wasm-instantiation'],
    'browser demonstrated boundary',
  );
  same(
    report.notImplemented,
    [
      'document-api',
      'query-engine',
      'persistence',
      'durability',
      'gpu-execution',
      'network-server',
    ],
    'browser nonimplementation inventory',
  );
  strictKeys(
    report.wasm,
    [
      'format',
      'valid',
      'byteLength',
      'sha256',
      'contentType',
      'urlPathname',
      'imports',
      'exports',
      'instanceExports',
    ],
    'browser Wasm report',
  );
  assert(report.wasm.format === 'core-module-v1', 'browser Wasm format');
  assert(report.wasm.valid === true, 'browser Wasm validity');
  assert(
    Number.isSafeInteger(report.wasm.byteLength) && report.wasm.byteLength > 8,
    'browser Wasm bytes',
  );
  assert(/^[0-9a-f]{64}$/.test(report.wasm.sha256), 'browser Wasm SHA-256');
  assert(report.wasm.contentType.includes('application/wasm'), 'browser Wasm content type');
  assert(
    /\/assets\/helix_core-[A-Za-z0-9_-]+\.wasm$/.test(report.wasm.urlPathname),
    'browser Wasm URL',
  );
  same(report.wasm.imports, [], 'browser Wasm imports');
  same(
    report.wasm.exports,
    [
      { name: 'memory', kind: 'memory' },
      { name: '__data_end', kind: 'global' },
      { name: '__heap_base', kind: 'global' },
    ],
    'browser Wasm exports',
  );
  same(
    report.wasm.instanceExports,
    ['memory', '__data_end', '__heap_base'],
    'browser instance exports',
  );
  return report;
};

export const validateBrowserBundleReport = (report) => {
  strictKeys(
    report,
    [
      'schema',
      'plan_items',
      'example',
      'vite',
      'target',
      'artifacts',
      'wasm_source_sha256',
      'database_functionality',
      'claim_boundary',
      'verdict',
    ],
    'browser bundle report',
  );
  assert(report.schema === 'helix.browser-example-bundle-report/1', 'browser bundle schema');
  same(report.plan_items, ['P02-010', 'P02-016'], 'browser bundle task history');
  assert(report.example === 'examples/browser-toolchain', 'browser bundle example');
  assert(report.vite === '8.1.4' && report.target === 'es2022', 'browser bundle tools');
  assert(
    Array.isArray(report.artifacts) && report.artifacts.length === 4,
    'browser bundle artifacts',
  );
  for (const artifact of report.artifacts) {
    strictKeys(artifact, ['path', 'bytes', 'sha256'], 'browser bundle artifact');
    assert(artifact.path.startsWith('dist/browser/'), 'browser bundle artifact path');
    assert(
      Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0,
      'browser bundle artifact bytes',
    );
    assert(/^[0-9a-f]{64}$/.test(artifact.sha256), 'browser bundle artifact SHA-256');
  }
  assert(/^[0-9a-f]{64}$/.test(report.wasm_source_sha256), 'browser source Wasm SHA-256');
  assert(report.database_functionality === false, 'browser bundle database claim');
  assert(report.claim_boundary === sharedClaimBoundary, 'browser bundle claim boundary');
  assert(report.verdict === 'pass', 'browser bundle verdict');
  return report;
};

export const exampleSourceIdentities = () => {
  const policy = loadExamplePolicy();
  return [
    policyPath,
    policy.native.manifest,
    policy.native.lockfile,
    policy.native.source,
    policy.native.documentation,
    ...policy.browser.sources,
  ].map((source) => {
    const bytes = readFileSync(resolveSource(source));
    return { path: source, bytes: bytes.length, sha256: sha256(bytes) };
  });
};

export const validateClaimText = (value, label) => shortString(value, label, 500);

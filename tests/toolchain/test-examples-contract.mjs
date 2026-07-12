#!/usr/bin/env node

import {
  assert,
  loadExamplePolicy,
  nativeClaimBoundary,
  sharedClaimBoundary,
  validateBrowserBundleReport,
  validateBrowserExampleReport,
  validateExamplePolicy,
  validateLineEndingPolicy,
  validateNativeExampleReport,
  validateNativeLock,
} from './examples-contract.mjs';

const expectError = (label, marker, action) => {
  let rejected = false;
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(marker), `${label}: wrong rejection reason: ${message}`);
    rejected = true;
  }
  assert(rejected, `${label}: mutation unexpectedly passed`);
};

const expectRejection = (label, marker, base, mutate, validate) => {
  const candidate = structuredClone(base);
  mutate(candidate);
  expectError(label, marker, () => validate(candidate));
};

const lineEndingPolicy = validateLineEndingPolicy();
const nativeLock = validateNativeLock();
const lineEndingCases = [
  [
    'Windows checkout policy weakening',
    'repository text checkout policy mismatch',
    () => validateLineEndingPolicy(lineEndingPolicy.replace('eol=lf', 'eol=crlf')),
  ],
  [
    'native lock CRLF checkout',
    'native lock canonical LF bytes',
    () => validateNativeLock(nativeLock.replaceAll('\n', '\r\n')),
  ],
  [
    'native lock external version drift',
    'native lock root graph mismatch: arrayref',
    () => validateNativeLock(nativeLock.replace('version = "0.3.9"', 'version = "0.3.8"')),
  ],
  [
    'native lock codec edge removal',
    'native lock root graph mismatch: helix-doc',
    () =>
      validateNativeLock(
        nativeLock.replace(
          'dependencies = [\n "blake3",\n "crc",\n "lz4_flex",\n]',
          'dependencies = [\n "crc",\n "lz4_flex",\n]',
        ),
      ),
  ],
];
for (const [label, marker, validate] of lineEndingCases) {
  expectError(label, marker, validate);
}

const policy = loadExamplePolicy();
const policyCases = [
  [
    'policy version',
    'example policy schema',
    (value) => (value.schema = 'helix.toolchain-examples/2'),
  ],
  ['policy task', 'example policy task', (value) => (value.plan_item = 'P02-017')],
  [
    'policy claim',
    'example policy claim boundary',
    (value) => (value.claim_boundary = 'product ready'),
  ],
  [
    'native command injection',
    'native example contract mismatch',
    (value) => value.native.command.push('--release'),
  ],
  [
    'native lock removal',
    'native example contract mismatch',
    (value) => (value.native.lockfile = 'Cargo.lock'),
  ],
  [
    'browser root escape',
    'browser example contract mismatch',
    (value) => (value.browser.root = '../browser'),
  ],
  [
    'browser source removal',
    'browser example contract mismatch',
    (value) => value.browser.sources.pop(),
  ],
  [
    'browser smoke weakening',
    'browser example contract mismatch',
    (value) => value.browser.smoke_command.pop(),
  ],
];
for (const [label, marker, mutate] of policyCases) {
  expectRejection(label, marker, policy, mutate, validateExamplePolicy);
}

const native = {
  schema: 'helix.native-toolchain-example/1',
  plan_item: 'P02-016',
  example: 'native-toolchain',
  component: {
    name: 'helix-host-native',
    maturity: 'boundary-skeleton',
    required_dependencies: ['helix-core'],
  },
  target: { architecture: 'x86_64', operating_system: 'linux' },
  database_functionality: false,
  operations: [],
  claim_boundary: nativeClaimBoundary,
};
validateNativeExampleReport(native);
const nativeCases = [
  [
    'native schema',
    'native report schema',
    (value) => (value.schema = 'helix.native-toolchain-example/2'),
  ],
  [
    'native maturity',
    'native report component mismatch',
    (value) => (value.component.maturity = 'database'),
  ],
  [
    'native dependency',
    'native report component mismatch',
    (value) => value.component.required_dependencies.push('helix-storage'),
  ],
  ['native OS', 'native report OS', (value) => (value.target.operating_system = 'android')],
  [
    'native database claim',
    'native database functionality claim',
    (value) => (value.database_functionality = true),
  ],
  [
    'native operation claim',
    'native operation inventory mismatch',
    (value) => value.operations.push('open'),
  ],
  [
    'native claim boundary',
    'native report claim boundary',
    (value) => (value.claim_boundary = 'database example'),
  ],
];
for (const [label, marker, mutate] of nativeCases) {
  expectRejection(label, marker, native, mutate, validateNativeExampleReport);
}

const browser = {
  schema: 'helix.browser-toolchain-example/1',
  planItem: 'P02-016',
  example: 'browser-toolchain',
  component: { name: 'helix-core', maturity: 'deterministic-injection-contract-v1' },
  databaseFunctionality: false,
  demonstrates: ['rust-wasm-build', 'vite-bundle', 'wasm-validation', 'wasm-instantiation'],
  notImplemented: [
    'document-api',
    'query-engine',
    'persistence',
    'durability',
    'gpu-execution',
    'network-server',
  ],
  wasm: {
    format: 'core-module-v1',
    valid: true,
    byteLength: 86,
    sha256: '0'.repeat(64),
    contentType: 'application/wasm',
    urlPathname: '/assets/helix_core-example.wasm',
    imports: [],
    exports: [
      { name: 'memory', kind: 'memory' },
      { name: '__data_end', kind: 'global' },
      { name: '__heap_base', kind: 'global' },
    ],
    instanceExports: ['memory', '__data_end', '__heap_base'],
  },
};
validateBrowserExampleReport(browser);
const browserCases = [
  [
    'browser schema',
    'browser example schema',
    (value) => (value.schema = 'helix.browser-toolchain-example/2'),
  ],
  [
    'browser maturity',
    'browser example component mismatch',
    (value) => (value.component.maturity = 'product'),
  ],
  [
    'browser database claim',
    'browser database functionality claim',
    (value) => (value.databaseFunctionality = true),
  ],
  [
    'browser demonstrates claim',
    'browser demonstrated boundary mismatch',
    (value) => value.demonstrates.push('database'),
  ],
  [
    'browser omission removal',
    'browser nonimplementation inventory mismatch',
    (value) => value.notImplemented.pop(),
  ],
  [
    'browser import',
    'browser Wasm imports mismatch',
    (value) => value.wasm.imports.push({ module: 'host', name: 'open', kind: 'function' }),
  ],
  ['browser digest', 'browser Wasm SHA-256', (value) => (value.wasm.sha256 = 'unknown')],
];
for (const [label, marker, mutate] of browserCases) {
  expectRejection(label, marker, browser, mutate, validateBrowserExampleReport);
}

const bundle = {
  schema: 'helix.browser-example-bundle-report/1',
  plan_items: ['P02-010', 'P02-016'],
  example: 'examples/browser-toolchain',
  vite: '8.1.4',
  target: 'es2022',
  artifacts: Array.from({ length: 4 }, (_, index) => ({
    path: `dist/browser/file-${index}.bin`,
    bytes: 1,
    sha256: '0'.repeat(64),
  })),
  wasm_source_sha256: '0'.repeat(64),
  database_functionality: false,
  claim_boundary: sharedClaimBoundary,
  verdict: 'pass',
};
validateBrowserBundleReport(bundle);
const bundleCases = [
  ['bundle task', 'browser bundle task history mismatch', (value) => value.plan_items.pop()],
  [
    'bundle example',
    'browser bundle example',
    (value) => (value.example = 'tests/browser/smoke-app'),
  ],
  ['bundle count', 'browser bundle artifacts', (value) => value.artifacts.pop()],
  [
    'bundle database claim',
    'browser bundle database claim',
    (value) => (value.database_functionality = true),
  ],
  [
    'bundle claim boundary',
    'browser bundle claim boundary',
    (value) => (value.claim_boundary = 'browser product'),
  ],
  ['bundle verdict', 'browser bundle verdict', (value) => (value.verdict = 'fail')],
];
for (const [label, marker, mutate] of bundleCases) {
  expectRejection(label, marker, bundle, mutate, validateBrowserBundleReport);
}

process.stdout.write(
  `PASS toolchain example rejection canaries: ${lineEndingCases.length + policyCases.length + nativeCases.length + browserCases.length + bundleCases.length} line-ending/policy/native/browser/bundle mutations rejected with exact reasons\n`,
);

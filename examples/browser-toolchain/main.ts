import wasmUrl from '../../target/wasm32-unknown-unknown/browser/helix_core.wasm?url';
import sharedVectorsText from '../../conformance/host/abi-v7-explicit-copy.vectors?raw';
import {
  BrowserHost,
  BrowserHostError,
  detectBrowserRuntimeFeatures,
} from '../../packages/browser-host/src/index';

import type { BrowserToolchainExampleReport } from './report';

const status = document.querySelector<HTMLOutputElement>('#status');
const reportOutput = document.querySelector<HTMLPreElement>('#report');
if (!status || !reportOutput) throw new Error('example status/report output is absent');

const toHex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
const sharedVectors: Record<string, string> = Object.fromEntries(
  sharedVectorsText
    .trim()
    .split('\n')
    .map((line) => {
      const [key, value] = line.split('=', 2);
      if (!key || value === undefined) throw new Error('invalid shared host vector line');
      return [key, value] as const;
    }),
);
const vectorNumber = (key: string) => {
  const value = Number(sharedVectors[key]);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid vector ${key}`);
  return value;
};
const vectorBytes = (key: string) => {
  const value = sharedVectors[key] ?? '';
  if (value.length % 2 !== 0 || !/^[0-9a-f]*$/u.test(value)) {
    throw new Error(`invalid hex vector ${key}`);
  }
  return Uint8Array.from(value.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16));
};

const run = async () => {
  const response = await fetch(wasmUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Wasm request failed with HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const valid = WebAssembly.validate(bytes);
  if (!valid) throw new Error('browser rejected the bundled Wasm core module');
  const module = await WebAssembly.compile(bytes);
  const features = detectBrowserRuntimeFeatures(window);
  const host = new BrowserHost({
    grants: [],
    features,
    executionProfile: {
      version: { major: 7, minor: 0 },
      memory: {
        totalBytes: 16_777_216n,
        scratchBytes: 8_388_608n,
        resultBytes: 8_388_608n,
        maximumAllocations: 4096,
      },
      device: {
        profileName: features.webGpu ? 'browser-gpu-eligible' : 'browser-cpu-only',
        architecture: 'wasm32',
        logicalCores: 1,
        class: features.webGpu ? 'cpu-and-gpu' : 'cpu-only',
        features: features.webGpu ? ['webgpu'] : [],
        maximumBufferBytes: 16_777_216n,
      },
    },
  });
  const staging = host.bindings.allocateStaging(4n);
  host.bindings.writeStaging(staging, 0n, Uint8Array.of(1, 2, 3, 4));
  const immutable = host.bindings.sealStaging(staging, 4n);
  const roundTrip = host.bindings.readImmutable(immutable, 0n, 4);
  const instance = await host.compileAndInstantiate(bytes);
  window.__HELIX_BROWSER_HOST_TEST__ = async () => {
    const codes: string[] = [];
    const capture = async (operation: () => unknown | Promise<unknown>) => {
      try {
        await operation();
        codes.push('UNEXPECTED_SUCCESS');
      } catch (error) {
        codes.push(error instanceof BrowserHostError ? error.code : 'UNEXPECTED_ERROR');
      }
    };
    await capture(() =>
      new BrowserHost({
        grants: [
          { kind: 'files', scope: 'database' },
          { kind: 'files', scope: 'database' },
        ],
        features,
        executionProfile: host.bindings.captureExecutionProfile(),
      }),
    );
    const invalidProfile = host.bindings.captureExecutionProfile();
    await capture(() =>
      new BrowserHost({
        grants: [],
        features,
        executionProfile: {
          ...invalidProfile,
          memory: { ...invalidProfile.memory, maximumAllocations: 0 },
        },
      }),
    );
    await capture(() => host.bindings.allocateStaging(16_777_217n));
    await capture(() => {
      const noncontiguous = host.bindings.allocateStaging(8n);
      return host.bindings.writeStaging(noncontiguous, 1n, Uint8Array.of(1));
    });
    await capture(() =>
      host.bindings.readBatch(
        'database',
        { requestId: Uint8Array.of(1) },
        [],
        { cancelled: false },
      ),
    );
    await capture(() =>
      host.bindings.readBatch(
        'database',
        { requestId: Uint8Array.of(1) },
        [],
        { cancelled: true },
      ),
    );
    await capture(() => host.compileAndInstantiate(new Uint8Array()));
    await capture(() => host.compileAndInstantiate(Uint8Array.of(0, 1, 2, 3)));
    let adapterDispatches = 0;
    const grantedHost = new BrowserHost({
      grants: [{ kind: 'files', scope: 'database' }],
      features,
      executionProfile: host.bindings.captureExecutionProfile(),
      adapters: {
        readBatch: async (_context, requests) => {
          adapterDispatches += 1;
          return requests.map((request, index) => ({
            offset: request.offset,
            bytes: Uint8Array.of(index),
            endOfFile: true,
          }));
        },
      },
    });
    const adapterResult = await grantedHost.bindings.readBatch(
      'database',
      { requestId: Uint8Array.of(2) },
      [{ path: 'relative', offset: 0n, length: 1 }],
      { cancelled: false },
    );
    await capture(() =>
      grantedHost.bindings.readBatch(
        'database',
        { requestId: Uint8Array.of(3) },
        [],
        { cancelled: true },
      ),
    );
    const syntheticFeatures = detectBrowserRuntimeFeatures({
      navigator: { storage: { getDirectory: () => undefined }, gpu: {} },
      indexedDB: { open: () => undefined },
      crypto: { getRandomValues: () => undefined },
      performance: { now: () => 0 },
      Worker: class {},
    });
    const limitedTraceHost = new BrowserHost({
      grants: [],
      features,
      executionProfile: host.bindings.captureExecutionProfile(),
      traceCapacity: 1,
    });
    const limitedTraceResults = [
      limitedTraceHost.bindings.lifecycle().state,
      limitedTraceHost.bindings.lifecycle().state,
    ];
    const conformanceStaging = host.bindings.allocateStaging(BigInt(vectorNumber('capacity')));
    let gapRejected = false;
    try {
      host.bindings.writeStaging(
        conformanceStaging,
        BigInt(vectorNumber('gap-offset')),
        vectorBytes('gap-hex'),
      );
    } catch (error) {
      gapRejected = error instanceof BrowserHostError && error.code === 'BUF_OUT_OF_BOUNDS';
    }
    host.bindings.writeStaging(
      conformanceStaging,
      BigInt(vectorNumber('write-offset')),
      vectorBytes('write-hex'),
    );
    const conformanceSource = host.bindings.sealStaging(
      conformanceStaging,
      BigInt(vectorBytes('write-hex').byteLength),
    );
    const conformanceRead = host.bindings.readImmutable(
      conformanceSource,
      BigInt(vectorNumber('read-offset')),
      vectorNumber('read-length'),
    );
    const conformanceTarget = host.bindings.allocateStaging(BigInt(vectorNumber('capacity')));
    host.bindings.copyImmutableToStaging(
      conformanceSource,
      conformanceTarget,
      BigInt(vectorNumber('copy-source-offset')),
      BigInt(vectorNumber('copy-target-offset')),
      vectorNumber('copy-length'),
    );
    const conformanceCopied = host.bindings.sealStaging(
      conformanceTarget,
      BigInt(vectorNumber('copy-length')),
    );
    const copiedRead = host.bindings.readImmutable(
      conformanceCopied,
      0n,
      vectorNumber('copy-length'),
    );
    return {
      codes,
      syntheticFeatures,
      adapterResult: adapterResult.map((result) => ({
        offset: result.offset.toString(),
        bytes: Array.from(result.bytes),
        endOfFile: result.endOfFile,
      })),
      adapterDispatches,
      trace: {
        records: [...host.traceRecords(), ...grantedHost.traceRecords()],
        dropped: host.droppedTraceRecords() + grantedHost.droppedTraceRecords(),
        limited: {
          results: limitedTraceResults,
          records: limitedTraceHost.traceRecords(),
          dropped: limitedTraceHost.droppedTraceRecords(),
        },
      },
      conformance: {
        schema: sharedVectors.schema,
        abi: [vectorNumber('abi-major'), vectorNumber('abi-minor')],
        importedCalls: vectorNumber('imported-calls'),
        capabilityKinds: vectorNumber('capability-kinds'),
        gapRejected,
        readHex: Array.from(conformanceRead.bytes, (value) =>
          value.toString(16).padStart(2, '0'),
        ).join(''),
        readEnd: conformanceRead.endOfBuffer,
        copyHex: Array.from(copiedRead.bytes, (value) =>
          value.toString(16).padStart(2, '0'),
        ).join(''),
      },
      isolation: {
        coreImports: WebAssembly.Module.imports(module),
        denied: {
          file: !host.policy.permits('files', 'ungranted/file'),
          socket: !host.policy.permits('networking', 'ungranted/socket'),
          clock: !host.policy.permits('timers', 'ungranted/clock'),
          device: !host.policy.permits('gpu', 'ungranted/device'),
        },
      },
    };
  };
  const report: BrowserToolchainExampleReport = {
    schema: 'helix.browser-toolchain-example/1',
    planItem: 'P02-016',
    example: 'browser-toolchain',
    component: { name: 'helix-core', maturity: 'deterministic-injection-contract-v1' },
    databaseFunctionality: false,
    demonstrates: [
      'rust-wasm-build',
      'vite-bundle',
      'wasm-validation',
      'wasm-instantiation',
    ],
    notImplemented: [
      'document-api',
      'query-engine',
      'persistence',
      'durability',
      'gpu-execution',
      'network-server',
    ],
    browserHost: {
      schema: 'helix.browser-host-skeleton/1',
      abi: { major: 7, minor: 0 },
      bindingCalls: 21,
      denyByDefault: true,
      features,
      bufferRoundTrip: Array.from(roundTrip.bytes),
      rawModuleImports: WebAssembly.Module.imports(module).length,
      componentModelLinked: false,
    },
    wasm: {
      format: 'core-module-v1',
      valid,
      byteLength: bytes.byteLength,
      sha256: toHex(await crypto.subtle.digest('SHA-256', bytes)),
      contentType: response.headers.get('content-type') ?? '',
      urlPathname: new URL(response.url).pathname,
      imports: WebAssembly.Module.imports(module).map(({ module: source, name, kind }) => ({
        module: source,
        name,
        kind,
      })),
      exports: WebAssembly.Module.exports(module).map(({ name, kind }) => ({ name, kind })),
      instanceExports: Object.keys(instance.exports),
    },
  };
  window.__HELIX_BROWSER_TOOLCHAIN_EXAMPLE__ = report;
  reportOutput.textContent = JSON.stringify(report, null, 2);
  status.textContent = 'ready';
};

try {
  await run();
} catch (error) {
  status.textContent = 'failed';
  throw error;
}

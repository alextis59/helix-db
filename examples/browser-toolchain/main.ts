import wasmUrl from '../../target/wasm32-unknown-unknown/browser/helix_core.wasm?url';

import type { BrowserToolchainExampleReport } from './report';

const status = document.querySelector<HTMLOutputElement>('#status');
const reportOutput = document.querySelector<HTMLPreElement>('#report');
if (!status || !reportOutput) throw new Error('example status/report output is absent');

const toHex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');

const run = async () => {
  const response = await fetch(wasmUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Wasm request failed with HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const valid = WebAssembly.validate(bytes);
  if (!valid) throw new Error('browser rejected the bundled Wasm core module');
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module);
  const report: BrowserToolchainExampleReport = {
    schema: 'helix.browser-toolchain-example/1',
    planItem: 'P02-016',
    example: 'browser-toolchain',
    component: { name: 'helix-core', maturity: 'explicit-copy-buffer-v1' },
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

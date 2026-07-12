export interface BrowserToolchainExampleReport {
  schema: 'helix.browser-toolchain-example/1';
  planItem: 'P02-016';
  example: 'browser-toolchain';
  component: { name: 'helix-core'; maturity: 'explicit-copy-buffer-v1' };
  databaseFunctionality: false;
  demonstrates: ['rust-wasm-build', 'vite-bundle', 'wasm-validation', 'wasm-instantiation'];
  notImplemented: [
    'document-api',
    'query-engine',
    'persistence',
    'durability',
    'gpu-execution',
    'network-server',
  ];
  wasm: {
    format: 'core-module-v1';
    valid: boolean;
    byteLength: number;
    sha256: string;
    contentType: string;
    urlPathname: string;
    imports: Array<{ module: string; name: string; kind: WebAssembly.ImportExportKind }>;
    exports: Array<{ name: string; kind: WebAssembly.ImportExportKind }>;
    instanceExports: string[];
  };
}

declare global {
  interface Window {
    __HELIX_BROWSER_TOOLCHAIN_EXAMPLE__?: BrowserToolchainExampleReport;
  }
}

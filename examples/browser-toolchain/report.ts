export interface BrowserToolchainExampleReport {
  schema: 'helix.browser-toolchain-example/1';
  planItem: 'P02-016';
  example: 'browser-toolchain';
  component: { name: 'helix-core'; maturity: 'deterministic-injection-contract-v1' };
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
  browserHost: {
    schema: 'helix.browser-host-skeleton/1';
    abi: { major: 7; minor: 0 };
    bindingCalls: 21;
    denyByDefault: true;
    features: {
      opfs: boolean;
      indexedDb: boolean;
      webGpu: boolean;
      cryptographicRandom: boolean;
      monotonicClock: boolean;
      workers: boolean;
    };
    bufferRoundTrip: number[];
    rawModuleImports: number;
    componentModelLinked: false;
  };
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
    __HELIX_BROWSER_HOST_TEST__?: () => Promise<{
      codes: string[];
      syntheticFeatures: BrowserToolchainExampleReport['browserHost']['features'];
      adapterResult: unknown[];
      adapterDispatches: number;
      conformance: {
        schema: string | undefined;
        abi: number[];
        importedCalls: number;
        capabilityKinds: number;
        gapRejected: boolean;
        readHex: string;
        readEnd: boolean;
        copyHex: string;
      };
    }>;
  }
}

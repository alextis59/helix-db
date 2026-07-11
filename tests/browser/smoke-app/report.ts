export interface WasmSmokeReport {
  schema: 'helix.browser-wasm-smoke/1';
  format: 'core-module-v1';
  valid: boolean;
  byteLength: number;
  sha256: string;
  contentType: string;
  urlPathname: string;
  imports: Array<{ module: string; name: string; kind: WebAssembly.ImportExportKind }>;
  exports: Array<{ name: string; kind: WebAssembly.ImportExportKind }>;
  instanceExports: string[];
}

declare global {
  interface Window {
    __HELIX_WASM_SMOKE__?: WasmSmokeReport;
  }
}

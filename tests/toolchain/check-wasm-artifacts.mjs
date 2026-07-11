#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureWasmTools, validateWasmToolsAuthority } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const selected = process.argv[2];
const supported = ['component', 'browser', 'all'];
if (!selected || !supported.includes(selected) || process.argv.length !== 3) {
  throw new Error(`usage: node tests/toolchain/check-wasm-artifacts.mjs <${supported.join('|')}>`);
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const run = (program, args, options = {}) => {
  const result = spawnSync(program, args, {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  assert(result.status === 0, `${program} ${args.join(' ')} exited ${result.status}`);
  return result.stdout;
};

const inspectBrowserModule = () => {
  run(process.execPath, ['tests/toolchain/run-build-profile.mjs', 'browser'], { stdio: 'inherit' });
  const artifactPath = path.join(
    repository,
    'target/wasm32-unknown-unknown/browser/helix_core.wasm',
  );
  const bytes = readFileSync(artifactPath);
  assert(
    bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])),
    'browser Wasm header mismatch',
  );
  assert(WebAssembly.validate(bytes), 'Node rejected browser core Wasm');
  const module = new WebAssembly.Module(bytes);
  const imports = WebAssembly.Module.imports(module);
  const exports = WebAssembly.Module.exports(module);
  assert(imports.length === 0, `browser Wasm gained imports: ${JSON.stringify(imports)}`);
  assert(
    JSON.stringify(exports) ===
      JSON.stringify([
        { name: 'memory', kind: 'memory' },
        { name: '__data_end', kind: 'global' },
        { name: '__heap_base', kind: 'global' },
      ]),
    `browser Wasm exports drifted: ${JSON.stringify(exports)}`,
  );
  const instance = new WebAssembly.Instance(module);
  assert(
    JSON.stringify(Object.keys(instance.exports)) ===
      JSON.stringify(['memory', '__data_end', '__heap_base']),
    'browser Wasm instance exports mismatch',
  );
  return {
    id: 'browser-core',
    path: path.relative(repository, artifactPath),
    format: 'core-module-v1',
    bytes: bytes.length,
    sha256: sha256(bytes),
    imports,
    exports,
  };
};

const inspectComponent = async () => {
  const executablePath = await ensureWasmTools();
  run(process.execPath, ['tests/toolchain/run-build-profile.mjs', 'wasm'], { stdio: 'inherit' });
  const artifactPath = path.join(repository, 'target/wasm32-wasip2/wasm/helix_core.wasm');
  const bytes = readFileSync(artifactPath);
  assert(
    bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 13, 0, 1, 0])),
    'WASIp2 component header mismatch',
  );
  execFileSync(executablePath, ['validate', '--color', 'never', artifactPath], {
    cwd: repository,
    stdio: 'pipe',
  });
  const wit = execFileSync(executablePath, ['component', 'wit', artifactPath], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert(wit === 'package root:component;\n\nworld root {\n}\n', `component WIT drifted: ${wit}`);
  const metadata = execFileSync(executablePath, ['metadata', 'show', '--json', artifactPath], {
    cwd: repository,
    encoding: 'utf8',
  });
  const metadataValue = JSON.parse(metadata);
  assert(
    metadataValue.component && typeof metadataValue.component === 'object',
    'validator did not classify the artifact as a component',
  );
  assert(
    metadataValue.component.children.length === 1 && metadataValue.component.children[0].module,
    'component must contain exactly one core module',
  );
  return {
    id: 'wasip2-component',
    path: path.relative(repository, artifactPath),
    format: 'component-model-0x1000d',
    bytes: bytes.length,
    sha256: sha256(bytes),
    wit_sha256: sha256(wit),
  };
};

const artifacts = [];
if (selected === 'component' || selected === 'all') artifacts.push(await inspectComponent());
if (selected === 'browser' || selected === 'all') artifacts.push(inspectBrowserModule());
const report = {
  schema: 'helix.wasm-smoke-report/1',
  plan_item: 'P02-010',
  mode: selected,
  rust_toolchain: '1.96.1',
  validator: validateWasmToolsAuthority().authority.version,
  artifacts,
  verdict: 'pass',
};
const reportDirectory = path.join(repository, 'dist/validation');
mkdirSync(reportDirectory, { recursive: true });
const reportPath = path.join(reportDirectory, `wasm-${selected}-smoke.json`);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `PASS Wasm ${selected} validation: ${artifacts.map(({ format }) => format).join(', ')}\n`,
);
process.stdout.write(
  `REPORT ${path.relative(repository, reportPath)} ${sha256(readFileSync(reportPath))}\n`,
);

#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from 'vite';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = await resolveConfig(
  {
    configFile: path.join(repository, 'vite.config.ts'),
  },
  'build',
  'production',
  'production',
);

assert.equal(config.appType, 'custom');
assert.equal(config.base, './');
assert.equal(config.cacheDir, path.join(repository, 'target/vite'));
assert.equal(config.clearScreen, false);
assert.equal(config.envPrefix, 'HELIX_PUBLIC_');
assert.equal(config.root, path.join(repository, 'tests/browser/smoke-app'));
assert.equal(config.build.assetsInlineLimit, 0);
assert.equal(config.build.copyPublicDir, false);
assert.equal(config.build.emptyOutDir, true);
assert.equal(config.build.minify, 'oxc');
assert.equal(config.build.outDir, path.join(repository, 'dist/browser'));
assert.equal(config.build.reportCompressedSize, false);
assert.equal(config.build.sourcemap, 'hidden');
assert.equal(config.build.target, 'es2022');
assert.equal(config.build.rolldownOptions.input, undefined);
assert.equal(config.preview.host, '127.0.0.1');
assert.equal(config.preview.port, 4173);
assert.equal(config.preview.strictPort, true);

console.log(
  'PASS browser profile: fixed smoke root/preview, relative ES2022 bundle, external assets, hidden maps, Oxc minification',
);

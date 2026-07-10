#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from 'vite';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = await resolveConfig(
  {
    configFile: path.join(repository, 'vite.config.ts'),
    root: repository,
  },
  'build',
  'production',
  'production',
);

assert.equal(config.appType, 'custom');
assert.equal(config.base, './');
assert.equal(config.clearScreen, false);
assert.equal(config.envPrefix, 'HELIX_PUBLIC_');
assert.equal(config.build.assetsInlineLimit, 0);
assert.equal(config.build.copyPublicDir, false);
assert.equal(config.build.emptyOutDir, true);
assert.equal(config.build.minify, 'oxc');
assert.equal(config.build.outDir, 'dist/browser');
assert.equal(config.build.reportCompressedSize, false);
assert.equal(config.build.sourcemap, 'hidden');
assert.equal(config.build.target, 'es2022');
assert.equal(config.build.rolldownOptions.input, undefined);

console.log('PASS browser profile: custom app, relative base, ES2022, external assets, hidden maps, Oxc minification, no bundle input');

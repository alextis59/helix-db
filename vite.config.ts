import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const repository = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  appType: 'custom',
  base: './',
  cacheDir: path.join(repository, 'target/vite'),
  clearScreen: false,
  envPrefix: 'HELIX_PUBLIC_',
  root: path.join(repository, 'examples/browser-toolchain'),
  build: {
    assetsInlineLimit: 0,
    copyPublicDir: false,
    emptyOutDir: true,
    minify: 'oxc',
    outDir: path.join(repository, 'dist/browser'),
    reportCompressedSize: false,
    sourcemap: 'hidden',
    target: 'es2022',
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
});

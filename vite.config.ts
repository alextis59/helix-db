import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'custom',
  base: './',
  clearScreen: false,
  envPrefix: 'HELIX_PUBLIC_',
  build: {
    assetsInlineLimit: 0,
    copyPublicDir: false,
    emptyOutDir: true,
    minify: 'oxc',
    outDir: 'dist/browser',
    reportCompressedSize: false,
    sourcemap: 'hidden',
    target: 'es2022',
  },
});

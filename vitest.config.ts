import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repository = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: repository,
  test: {
    exclude: [
      '**/node_modules/**',
      '**/target/**',
      '**/dist/**',
      '**/evidence/**',
      'tests/browser/**',
    ],
    include: [
      'packages/**/*.{test,spec}.?(c|m)[jt]s?(x)',
      'tests/unit/**/*.{test,spec}.?(c|m)[jt]s?(x)',
    ],
  },
});

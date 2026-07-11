import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/target/**', '**/dist/**', '**/evidence/**'],
    include: ['tests/integration/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
  },
});

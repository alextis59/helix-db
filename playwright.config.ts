import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: 'test-results',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'line',
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', headless: true } },
    { name: 'firefox', use: { browserName: 'firefox', headless: true } },
    { name: 'webkit', use: { browserName: 'webkit', headless: true } },
  ],
});

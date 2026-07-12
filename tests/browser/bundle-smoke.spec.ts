import { expect, test } from '@playwright/test';

import type { BrowserToolchainExampleReport } from '../../examples/browser-toolchain/report';

test('shows its non-database boundary and instantiates the bundled core Wasm', async ({
  browserName,
  page,
}) => {
  const failures: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => failures.push(`page: ${error.message}`));
  page.on('requestfailed', (request) =>
    failures.push(`request: ${request.url()} ${request.failure()?.errorText ?? 'unknown'}`),
  );

  const response = await page.goto('/index.html');
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'HelixDB browser toolchain boundary example',
  );
  await expect(page.locator('#maturity')).toHaveText(
    'Boundary skeleton — no database functionality',
  );
  await expect(page.locator('#database-functionality')).toHaveText('not implemented');
  await expect(page.locator('#status')).toHaveText('ready');
  const report = await page.evaluate(() => window.__HELIX_BROWSER_TOOLCHAIN_EXAMPLE__);
  expect(report).toBeDefined();
  const example = report as BrowserToolchainExampleReport;
  expect(example).toEqual({
    schema: 'helix.browser-toolchain-example/1',
    planItem: 'P02-016',
    example: 'browser-toolchain',
    component: { name: 'helix-core', maturity: 'buffer-alternatives-prototype-v1' },
    databaseFunctionality: false,
    demonstrates: ['rust-wasm-build', 'vite-bundle', 'wasm-validation', 'wasm-instantiation'],
    notImplemented: [
      'document-api',
      'query-engine',
      'persistence',
      'durability',
      'gpu-execution',
      'network-server',
    ],
    wasm: {
      format: 'core-module-v1',
      valid: true,
      byteLength: expect.any(Number),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      contentType: expect.stringContaining('application/wasm'),
      urlPathname: expect.stringMatching(/\/assets\/helix_core-[A-Za-z0-9_-]+\.wasm$/),
      imports: [],
      exports: [
        { name: 'memory', kind: 'memory' },
        { name: '__data_end', kind: 'global' },
        { name: '__heap_base', kind: 'global' },
      ],
      instanceExports: ['memory', '__data_end', '__heap_base'],
    },
  });
  expect(example.wasm.byteLength).toBeGreaterThan(8);
  await expect(page.locator('#report')).toContainText('"databaseFunctionality": false');
  expect(['chromium', 'firefox', 'webkit']).toContain(browserName);
  expect(failures).toEqual([]);
});

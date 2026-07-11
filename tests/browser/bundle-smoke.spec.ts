import { expect, test } from '@playwright/test';

import type { WasmSmokeReport } from './smoke-app/report';

test('loads, validates, compiles, and instantiates the bundled core Wasm', async ({
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
  await expect(page.locator('#status')).toHaveText('ready');
  const report = await page.evaluate(() => window.__HELIX_WASM_SMOKE__);
  expect(report).toBeDefined();
  const smoke = report as WasmSmokeReport;
  expect(smoke).toEqual({
    schema: 'helix.browser-wasm-smoke/1',
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
  });
  expect(smoke.byteLength).toBeGreaterThan(8);
  expect(['chromium', 'firefox', 'webkit']).toContain(browserName);
  expect(failures).toEqual([]);
});

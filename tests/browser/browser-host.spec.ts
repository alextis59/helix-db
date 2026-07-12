import { expect, test } from '@playwright/test';

test('enforces browser-host grants, bounds, cancellation, and module validation', async ({
  page,
}) => {
  const response = await page.goto('/index.html');
  expect(response?.ok()).toBe(true);
  await expect(page.locator('#status')).toHaveText('ready');
  const result = await page.evaluate(async () => {
    if (!window.__HELIX_BROWSER_HOST_TEST__) throw new Error('browser-host test hook is absent');
    return window.__HELIX_BROWSER_HOST_TEST__();
  });
  expect(result.codes).toEqual([
    'AUTH_INVALID_GRANT',
    'QUOTA_MEMORY',
    'BUF_OUT_OF_BOUNDS',
    'BUF_OUT_OF_BOUNDS',
    'AUTH_SCOPE_DENIED',
    'OP_CANCELLED',
    'ABI_COMPONENT_SIZE',
    'ABI_INVALID_MODULE',
    'OP_CANCELLED',
  ]);
  expect(result.adapterResult).toEqual([{ offset: '0', bytes: [0], endOfFile: true }]);
  expect(result.adapterDispatches).toBe(1);
  expect(result.syntheticFeatures).toEqual({
    opfs: true,
    indexedDb: true,
    webGpu: true,
    cryptographicRandom: true,
    monotonicClock: true,
    workers: true,
  });
});

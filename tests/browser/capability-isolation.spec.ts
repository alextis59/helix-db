import { expect, test } from '@playwright/test';

test('keeps ungranted files, sockets, clocks, and devices unreachable', async ({ page }) => {
  const response = await page.goto('/index.html');
  expect(response?.ok()).toBe(true);
  await expect(page.locator('#status')).toHaveText('ready');
  const isolation = await page.evaluate(async () => {
    if (!window.__HELIX_BROWSER_HOST_TEST__) throw new Error('browser-host test hook is absent');
    return (await window.__HELIX_BROWSER_HOST_TEST__()).isolation;
  });
  expect(isolation).toEqual({
    coreImports: [],
    denied: { file: true, socket: true, clock: true, device: true },
  });
});

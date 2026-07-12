import { expect, test } from '@playwright/test';

test('replays the shared ABI 7 explicit-copy vectors', async ({ page }) => {
  const response = await page.goto('/index.html');
  expect(response?.ok()).toBe(true);
  await expect(page.locator('#status')).toHaveText('ready');
  const result = await page.evaluate(async () => {
    if (!window.__HELIX_BROWSER_HOST_TEST__) throw new Error('browser-host test hook is absent');
    return (await window.__HELIX_BROWSER_HOST_TEST__()).conformance;
  });
  expect(result).toEqual({
    schema: 'helix.host-abi-v7-conformance/1',
    abi: [7, 0],
    importedCalls: 21,
    capabilityKinds: 12,
    gapRejected: true,
    readHex: '020304',
    readEnd: true,
    copyHex: '020304',
  });
});

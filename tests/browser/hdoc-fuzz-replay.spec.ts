import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const fixtureRoot = 'fixtures/hdoc/v1/cases';
const fixtures = readdirSync(fixtureRoot)
  .filter((file) => file.endsWith('.hdoc'))
  .sort()
  .map((file) => ({
    bytes: [...readFileSync(`${fixtureRoot}/${file}`)],
    positive: file.startsWith('positive-'),
  }));

test('replays immutable HDoc fuzz seeds through a bounded browser envelope probe', async ({
  page,
}) => {
  expect(fixtures).toHaveLength(24);
  const results = await page.evaluate((cases) => {
    const magic = [0x48, 0x44, 0x4f, 0x43, 0x0d, 0x0a, 0x1a, 0x0a];
    const read16 = (bytes: Uint8Array, offset: number): number | undefined => {
      if (offset < 0 || offset + 2 > bytes.length) return undefined;
      return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
    };
    const read32 = (bytes: Uint8Array, offset: number): number | undefined => {
      if (offset < 0 || offset + 4 > bytes.length) return undefined;
      return (
        ((bytes[offset] ?? 0) |
          ((bytes[offset + 1] ?? 0) << 8) |
          ((bytes[offset + 2] ?? 0) << 16) |
          ((bytes[offset + 3] ?? 0) << 24)) >>>
        0
      );
    };
    const checksum = (bytes: Uint8Array): number => {
      let crc = 0xffffffff;
      for (let index = 0; index < bytes.length; index += 1) {
        crc ^= index >= 32 && index < 36 ? 0 : (bytes[index] ?? 0);
        for (let bit = 0; bit < 8; bit += 1) {
          crc = ((crc >>> 1) ^ (-(crc & 1) & 0x82f63b78)) >>> 0;
        }
      }
      return (crc ^ 0xffffffff) >>> 0;
    };
    const probe = (input: number[]): boolean => {
      const bytes = Uint8Array.from(input);
      if (bytes.length < 64 || !magic.every((byte, index) => bytes[index] === byte)) return false;
      if (read16(bytes, 8) !== 1 || read16(bytes, 10) !== 0) return false;
      if (read32(bytes, 20) !== bytes.length || read16(bytes, 36) !== 4) return false;
      if (read32(bytes, 32) !== checksum(bytes)) return false;
      const footer = read32(bytes, 44);
      if (footer === undefined || footer + 64 !== bytes.length) return false;
      let previousEnd = 192;
      for (let index = 0; index < 4; index += 1) {
        const entry = 64 + index * 32;
        const offset = read32(bytes, entry + 4);
        const length = read32(bytes, entry + 8);
        if (
          read16(bytes, entry) !== index + 1 ||
          offset === undefined ||
          length === undefined ||
          offset < previousEnd ||
          offset % 8 !== 0 ||
          offset + length > footer
        ) {
          return false;
        }
        previousEnd = offset + length;
      }
      return true;
    };
    return cases.map(({ bytes }) => probe(bytes));
  }, fixtures);
  expect(results).toHaveLength(24);
  for (const [index, fixture] of fixtures.entries()) {
    if (fixture?.positive) expect(results[index]).toBe(true);
  }
});

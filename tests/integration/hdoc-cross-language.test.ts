import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { readHDoc } from './hdoc-reader.js';

interface RustCase {
  canonicalLength: number;
  contentHashHex: string;
  fieldCount: number;
  id: string;
  logicalValue: unknown;
  storedLength: number;
}

interface RustReport {
  cases: RustCase[];
  schema: string;
}

const report = JSON.parse(
  execFileSync(
    'cargo',
    ['run', '--quiet', '--frozen', '-p', 'helix-doc', '--example', 'hdoc_v1_oracle'],
    { encoding: 'utf8', env: { ...process.env, CARGO_NET_OFFLINE: 'true' } },
  ),
) as RustReport;

describe('HDoc 1.0 cross-language golden readers', () => {
  test('the Rust oracle exposes the fixed positive-vector inventory', () => {
    expect(report.schema).toBe('helix.hdoc-rust-golden-reader/1');
    expect(report.cases.map(({ id }) => id)).toEqual([
      'positive-minimal',
      'positive-all-types-nested',
      'positive-boundary-values',
      'positive-compression-profile-1',
    ]);
  });

  for (const rust of report.cases) {
    test(`${rust.id}: logical tree and independently recomputed hash match Rust`, () => {
      const bytes = readFileSync(`fixtures/hdoc/v1/cases/${rust.id}.hdoc`);
      expect(readHDoc(bytes)).toEqual({
        canonicalLength: rust.canonicalLength,
        contentHashHex: rust.contentHashHex,
        fieldCount: rust.fieldCount,
        logicalValue: rust.logicalValue,
        storedLength: rust.storedLength,
      });
    });
  }
});

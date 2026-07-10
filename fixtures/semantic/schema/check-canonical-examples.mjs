#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeFixture, sha256Hex } from './fixture-jcs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const valid = path.join(here, 'examples', 'valid');

const reverseProperties = (value) => {
  if (Array.isArray(value)) return value.map(reverseProperties);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, child]) => [key, reverseProperties(child)]),
  );
};

const rfcPropertyVector = {
  '\u20ac': 'Euro Sign',
  '\r': 'Carriage Return',
  '\ufb33': 'Hebrew Letter Dalet With Dagesh',
  1: 'One',
  '\ud83d\ude00': 'Emoji: Grinning Face',
  '\u0080': 'Control',
  '\u00f6': 'Latin Small Letter O With Diaeresis',
};
const canonicalVector = canonicalizeFixture(rfcPropertyVector).toString('utf8');
const expectedVector =
  '{"\\r":"Carriage Return","1":"One","\u0080":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}';
if (canonicalVector !== expectedVector) {
  throw new Error('RFC 8785 UTF-16 property order vector mismatch');
}
console.log('PASS RFC 8785 property-order vector');

const files = readdirSync(valid)
  .filter((name) => name.endsWith('.json'))
  .sort();

for (const name of files) {
  const source = readFileSync(path.join(valid, name));
  const value = JSON.parse(source.toString('utf8'));
  const canonical = canonicalizeFixture(value);
  const reordered = canonicalizeFixture(reverseProperties(value));
  const roundTripped = canonicalizeFixture(JSON.parse(canonical.toString('utf8')));

  if (!canonical.equals(reordered)) {
    throw new Error(`${name}: property insertion order changed canonical bytes`);
  }
  if (!canonical.equals(roundTripped)) {
    throw new Error(`${name}: canonical parse/re-encode drift`);
  }
  console.log(
    `PASS ${name} source=${sha256Hex(source)} canonical=${sha256Hex(canonical)} source_bytes=${source.length} canonical_bytes=${canonical.length}`,
  );
}

if (files.length !== 4) throw new Error(`expected 4 valid examples, found ${files.length}`);
console.log(`PASS canonical examples: ${files.length} stable source/canonical hashes`);

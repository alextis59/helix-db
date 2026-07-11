#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  assert,
  findProducer,
  findProfile,
  jsonBytes,
  loadPolicy,
  resolveRepositoryPath,
  validateBundleManifest,
  validateSchemas,
} from './artifact-retention-contract.mjs';

const usage =
  'usage: node tests/toolchain/check-retained-artifacts.mjs <policy|bundle test-replays semantic|bundle test-replays coverage|bundle browser-reports chromium|bundle browser-reports firefox|bundle browser-reports webkit>';

try {
  const mode = process.argv[2];
  if (mode === 'policy') {
    assert(process.argv.length === 3, usage);
    const schemaCount = validateSchemas();
    const policy = loadPolicy();
    process.stdout.write(
      `PASS artifact retention policy: ${schemaCount} strict schemas, ${policy.profiles.length} profiles, 2 active, 3 reserved\n`,
    );
    process.stdout.write(
      'PASS retention boundaries: 30-day CI diagnostics; permanent promotion for gate/release claims\n',
    );
  } else {
    assert(mode === 'bundle' && process.argv.length === 5, usage);
    const profileId = process.argv[3];
    const variant = process.argv[4];
    validateSchemas();
    const policy = loadPolicy();
    const profile = findProfile(policy, profileId);
    const producer = findProducer(profile, variant);
    const bundleRoot = resolveRepositoryPath(producer.output);
    const manifestPath = path.join(bundleRoot, 'manifest.json');
    const manifestBytes = readFileSync(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    assert(
      manifestBytes.equals(jsonBytes(manifest)),
      'retained manifest is not canonical pretty JSON',
    );
    validateBundleManifest(manifest, bundleRoot);
    process.stdout.write(
      `PASS retained bundle ${profileId}/${variant}: ${manifest.artifacts.length} payloads, ${manifest.artifacts.reduce((total, artifact) => total + artifact.bytes, 0)} bytes\n`,
    );
  }
} catch (error) {
  process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

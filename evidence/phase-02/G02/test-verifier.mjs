#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const gateDirectory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(gateDirectory, '../../..');
const reviewedCommit = '33f9fd790738211a4a1ffb281d7c3f4f50507a0b';
const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-g02-canaries-'));
const temporaryRepository = path.join(temporary, 'repository');
const temporaryGate = path.join(temporaryRepository, 'evidence/phase-02/G02');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const identity = (file) => {
  const bytes = readFileSync(file);
  return { bytes: bytes.length, sha256: sha256(bytes) };
};
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, jsonBytes(value));
const updateGateIdentity = (manifest, field) => {
  const record = manifest[field];
  Object.assign(record, identity(path.join(temporaryGate, record.path)));
};
const resetGate = () => {
  rmSync(temporaryGate, { recursive: true, force: true });
  cpSync(gateDirectory, temporaryGate, { recursive: true });
};
const expectFailure = (label, marker, mutate) => {
  resetGate();
  mutate();
  const result = spawnSync(
    process.execPath,
    [path.join(temporaryGate, 'verify.mjs'), reviewedCommit],
    {
      cwd: temporaryRepository,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      timeout: 300_000,
    },
  );
  assert(result.status !== 0, `${label}: mutation unexpectedly passed`);
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  assert(output.includes(marker), `${label}: wrong rejection reason\n${output}`);
};

try {
  execFileSync('git', ['clone', '--quiet', '--no-local', repository, temporaryRepository], {
    maxBuffer: 128 * 1024 * 1024,
  });

  expectFailure('hosted gating conclusion', 'gating conclusion', () => {
    const manifestPath = path.join(temporaryGate, 'manifest.json');
    const manifest = readJson(manifestPath);
    const hostedPath = path.join(temporaryGate, manifest.hosted_observation.path);
    const hosted = readJson(hostedPath);
    hosted.gating_run.conclusion = 'failure';
    writeJson(hostedPath, hosted);
    updateGateIdentity(manifest, 'hosted_observation');
    writeJson(manifestPath, manifest);
  });

  expectFailure('hosted archive digest', 'archive digest', () => {
    const manifestPath = path.join(temporaryGate, 'manifest.json');
    const manifest = readJson(manifestPath);
    const promotionPath = path.join(temporaryGate, manifest.promotion.path);
    const promotion = readJson(promotionPath);
    promotion.bundles[0].archive_sha256 = '0'.repeat(64);
    writeJson(promotionPath, promotion);
    updateGateIdentity(manifest, 'promotion');
    writeJson(manifestPath, manifest);
  });

  expectFailure('decoded signature identity', 'decoded SHA-256', () => {
    const manifestPath = path.join(temporaryGate, 'manifest.json');
    const manifest = readJson(manifestPath);
    const promotionPath = path.join(temporaryGate, manifest.promotion.path);
    const promotion = readJson(promotionPath);
    const signature = promotion.bundles
      .flatMap(({ files }) => files)
      .find(({ source_path: sourcePath }) => sourcePath === 'dependency/npm-signatures.json');
    assert(signature, 'signature promotion record absent');
    const encodedPath = path.join(temporaryRepository, signature.promoted_path);
    const encoded = readFileSync(encodedPath, 'utf8').replaceAll(/\s/g, '');
    const raw = gunzipSync(Buffer.from(encoded, 'base64'));
    raw[0] ^= 1;
    const changed = gzipSync(raw, { level: 9, mtime: 0 });
    const base64 = changed.toString('base64').match(/.{1,76}/g).join('\n');
    writeFileSync(encodedPath, `${base64}\n`, 'utf8');
    Object.assign(signature, {
      promoted_bytes: identity(encodedPath).bytes,
      promoted_sha256: identity(encodedPath).sha256,
    });
    writeJson(promotionPath, promotion);
    updateGateIdentity(manifest, 'promotion');
    writeJson(manifestPath, manifest);
  });

  expectFailure('review disposition marker', 'review marker absent', () => {
    const manifestPath = path.join(temporaryGate, 'manifest.json');
    const manifest = readJson(manifestPath);
    const reviewPath = path.join(temporaryGate, manifest.review);
    const review = readFileSync(reviewPath, 'utf8');
    writeFileSync(
      reviewPath,
      review.replace(
        'G02-F06 — Green skeleton lanes could be mistaken for product support',
        'G02-FXX — Removed disposition marker',
      ),
    );
    const record = manifest.gate_documents.find(({ path: documentPath }) => documentPath === manifest.review);
    Object.assign(record, identity(reviewPath));
    writeJson(manifestPath, manifest);
  });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write(
  'PASS G02 evidence rejection canaries: hosted conclusion, archive digest, decoded signature, and review disposition\n',
);

#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  assert,
  buildSummary,
  environment,
  identity,
  jsonBytes,
  loadWorkload,
  paths,
  repository,
  sourceControl,
  sourcePaths,
  validateEngine,
  validateRaw,
  validateSchemas,
  validateSummary,
} from './hdoc-contract.mjs';

try {
  assert(process.argv.length === 2, 'usage: node benchmarks/run-hdoc.mjs');
  assert(process.cwd() === repository, 'HDoc benchmark must run from repository root');
  validateSchemas();
  const workload = loadWorkload();
  const result = spawnSync(
    'cargo',
    ['run', '--frozen', '--profile', 'bench', '-p', 'helix-doc', '--example', 'hdoc_v1_benchmark'],
    {
      cwd: repository,
      encoding: 'utf8',
      env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert(result.status === 0, `HDoc benchmark engine exited ${result.status}`);
  const engine = validateEngine(JSON.parse(result.stdout));
  const raw = {
    schema: 'helix.hdoc-benchmark-raw/1',
    plan_item: 'P03-020',
    recorded_at: new Date().toISOString(),
    source_control: sourceControl(),
    environment: environment(),
    claim_boundary: workload.claim_boundary,
    workload: identity(paths.workload),
    sources: sourcePaths.map(identity),
    engine,
    totals: { shapes: 5, operations: 30, measurement_samples: 600, timed_iterations: 9600 },
    verdict: 'pass',
  };
  validateRaw(raw);
  const rawContent = jsonBytes(raw);
  const summary = buildSummary(raw, rawContent);
  validateSummary(summary, raw, rawContent);
  const output = path.join(repository, 'dist/benchmarks/hdoc-v1');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(repository, paths.raw), rawContent, { flag: 'wx' });
  writeFileSync(path.join(repository, paths.summary), jsonBytes(summary), { flag: 'wx' });
  process.stdout.write(
    'PASS HDoc benchmark: 5 shapes, 30 operations, 600 samples, 9600 timed iterations\n',
  );
} catch (error) {
  process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

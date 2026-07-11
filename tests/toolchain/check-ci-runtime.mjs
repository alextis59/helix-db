#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const matrix = JSON.parse(readFileSync(path.join(repository, '.github/ci/matrix.json'), 'utf8'));
const laneId = process.argv[2];
const describe = process.argv[3] === '--describe';

if (!laneId || process.argv.length > (describe ? 4 : 3)) {
  throw new Error('usage: node tests/toolchain/check-ci-runtime.mjs <lane-id> [--describe]');
}

const entries = [
  ...Object.values(matrix.gating),
  ...Object.values(matrix.nightly),
  ...Object.values(matrix.observational),
].flat();
const matches = entries.filter(({ id }) => id === laneId);
if (matches.length !== 1) throw new Error(`unknown or duplicate CI lane: ${laneId}`);
const lane = matches[0];

if (describe) {
  process.stdout.write(`${JSON.stringify(lane, null, 2)}\n`);
} else {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.CI !== 'true') {
    throw new Error('runtime identity checks execute only inside GitHub Actions');
  }
  const actualNode = process.versions.node;
  const checks = {
    node: [actualNode, lane.node],
    process_arch: [process.arch, lane.process_arch],
    process_platform: [process.platform, lane.process_platform],
    runner_arch: [process.env.RUNNER_ARCH, lane.runner_arch],
    runner_os: [process.env.RUNNER_OS, lane.runner_os],
  };
  for (const [name, [actual, expected]] of Object.entries(checks)) {
    if (actual !== expected) throw new Error(`${laneId}: ${name} ${actual} != ${expected}`);
  }
  process.stdout.write(
    `PASS CI runtime ${laneId}: ${lane.runner_os}/${lane.runner_arch}, Node ${actualNode}\n`,
  );
}

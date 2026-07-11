#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const selected = process.argv[2];
const supported = [
  'native-debug',
  'native-release',
  'wasm',
  'browser',
  'sanitizer',
  'coverage',
  'benchmark',
];

if (!selected || !supported.includes(selected) || process.argv.length !== 3) {
  throw new Error(`usage: node tests/toolchain/run-build-profile.mjs <${supported.join('|')}>`);
}

const commonBuild = ['build', '--frozen', '--workspace', '--all-targets', '--all-features'];
const definitions = {
  'native-debug': {
    args: [...commonBuild, '--profile', 'dev'],
  },
  'native-release': {
    args: [...commonBuild, '--profile', 'release'],
  },
  wasm: {
    args: [
      'build',
      '--frozen',
      '--profile',
      'wasm',
      '--target',
      'wasm32-wasip2',
      '--package',
      'helix-core',
    ],
  },
  browser: {
    args: [
      'build',
      '--frozen',
      '--profile',
      'browser',
      '--target',
      'wasm32-unknown-unknown',
      '--package',
      'helix-core',
    ],
  },
  sanitizer: {
    args: [
      'test',
      '--frozen',
      '--profile',
      'sanitizer',
      '--target',
      'x86_64-unknown-linux-gnuasan',
      '--workspace',
      '--all-features',
      '--lib',
    ],
  },
  coverage: {
    args: ['test', '--frozen', '--profile', 'coverage', '--workspace', '--all-features', '--lib'],
  },
  benchmark: {
    args: [...commonBuild, '--profile', 'bench'],
  },
};

if (selected === 'sanitizer' && (process.platform !== 'linux' || process.arch !== 'x64')) {
  throw new Error(
    'the configured sanitizer lane requires an x86_64 Linux host; other host lanes are selected under P02-009',
  );
}

const environment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
let coverageDirectory;
if (selected === 'coverage') {
  if (environment.RUSTFLAGS || environment.CARGO_ENCODED_RUSTFLAGS) {
    throw new Error(
      'coverage verification requires an unset RUSTFLAGS and CARGO_ENCODED_RUSTFLAGS',
    );
  }
  coverageDirectory = path.join(repository, 'target', 'coverage-profiles');
  rmSync(coverageDirectory, { recursive: true, force: true });
  mkdirSync(coverageDirectory, { recursive: true });
  environment.RUSTFLAGS = '-C instrument-coverage';
  environment.LLVM_PROFILE_FILE = path.join(coverageDirectory, '%p-%m.profraw');
}

const command = definitions[selected];
const result = spawnSync('cargo', command.args, {
  cwd: repository,
  env: environment,
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`${selected} Cargo profile exited ${result.status}`);

let rawCoverageProfiles = 0;
if (coverageDirectory) {
  rawCoverageProfiles = readdirSync(coverageDirectory).filter((file) =>
    file.endsWith('.profraw'),
  ).length;
  if (rawCoverageProfiles === 0) throw new Error('coverage profile produced no .profraw files');
}

console.log(
  `PASS build profile ${selected}${rawCoverageProfiles ? ` (${rawCoverageProfiles} raw coverage profiles)` : ''}`,
);

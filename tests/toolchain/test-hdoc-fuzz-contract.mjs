#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const authority = JSON.parse(
  readFileSync(path.join(repository, 'tests/fuzz/toolchain.json'), 'utf8'),
);
const manifest = readFileSync(path.join(repository, 'fuzz/Cargo.toml'), 'utf8');
const sources = Object.fromEntries(
  authority.targets.map((target) => [
    target,
    readFileSync(path.join(repository, `fuzz/fuzz_targets/${target}.rs`), 'utf8'),
  ]),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const validate = (candidate, candidateManifest = manifest, candidateSources = sources) => {
  assert(candidate.schema === 'helix.hdoc-fuzz-toolchain/1', 'schema');
  assert(candidate.plan_item === 'P03-019', 'plan item');
  assert(candidate.cargo_fuzz === '0.13.2', 'cargo-fuzz');
  assert(candidate.libfuzzer_sys === '0.4.13', 'libfuzzer-sys');
  assert(candidate.rust_toolchain === 'nightly-2026-06-30', 'nightly');
  assert(candidate.rustc_release === '1.98.0-nightly', 'rustc release');
  assert(candidate.rustc_commit === '096694416a41840709140eb0fd0ca193d1a3e6ba', 'rustc commit');
  assert(
    candidate.targets.length === 5 && new Set(candidate.targets).size === 5,
    'target inventory',
  );
  assert(candidate.bounded_smoke.runs_per_target === 128, 'runs');
  assert(candidate.bounded_smoke.maximum_input_bytes === 1_048_576, 'input bound');
  assert(candidate.bounded_smoke.timeout_seconds === 10, 'timeout');
  assert(candidate.bounded_smoke.rss_limit_mb === 2_048, 'RSS');
  assert(candidateManifest.includes('libfuzzer-sys = "=0.4.13"'), 'manifest dependency');
  for (const target of candidate.targets) {
    assert(candidateManifest.includes(`name = "${target}"`), `${target}: manifest`);
    assert(candidateSources[target]?.includes('fuzz_target!'), `${target}: entry point`);
  }
};
validate(authority);

const mutations = [
  ['schema', (value) => (value.schema = 'helix.hdoc-fuzz-toolchain/0')],
  ['plan item', (value) => (value.plan_item = 'P03-018')],
  ['cargo-fuzz', (value) => (value.cargo_fuzz = 'latest')],
  ['libfuzzer-sys', (value) => (value.libfuzzer_sys = '0.4.12')],
  ['nightly', (value) => (value.rust_toolchain = 'nightly')],
  ['rustc release', (value) => (value.rustc_release = 'stable')],
  ['rustc commit', (value) => (value.rustc_commit = '0'.repeat(40))],
  ['targets', (value) => value.targets.pop()],
  ['runs', (value) => (value.bounded_smoke.runs_per_target = 0)],
  ['input bound', (value) => (value.bounded_smoke.maximum_input_bytes = 0)],
  ['timeout', (value) => (value.bounded_smoke.timeout_seconds = 0)],
  ['RSS', (value) => (value.bounded_smoke.rss_limit_mb = 0)],
];
for (const [label, mutate] of mutations) {
  const candidate = structuredClone(authority);
  mutate(candidate);
  let rejected = false;
  try {
    validate(candidate);
  } catch {
    rejected = true;
  }
  assert(rejected, `authority mutation passed: ${label}`);
}

const invalidMode = spawnSync(
  process.execPath,
  ['tests/toolchain/check-hdoc-fuzz.mjs', 'invalid'],
  {
    cwd: repository,
    encoding: 'utf8',
  },
);
assert(invalidMode.status !== 0, 'invalid fuzz mode passed');
assert(
  invalidMode.stderr.includes('usage: node tests/toolchain/check-hdoc-fuzz.mjs'),
  'invalid mode reason',
);

process.stdout.write(
  `PASS HDoc fuzz rejection canaries: ${mutations.length} authority mutations and invalid command mode rejected\n`,
);

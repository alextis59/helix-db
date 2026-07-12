#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const authority = JSON.parse(
  readFileSync(path.join(repository, 'tests/fuzz/toolchain.json'), 'utf8'),
);
const mode = process.argv[2];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sorted = (values) => [...values].sort();
const run = (program, args, options = {}) => {
  const result = spawnSync(program, args, {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, CARGO_NET_OFFLINE: options.network ? 'false' : 'true' },
    maxBuffer: 128 * 1024 * 1024,
  });
  if (options.display !== false && result.stdout) process.stdout.write(result.stdout);
  if (options.display !== false && result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert(
    result.status === 0,
    `${program} ${args.join(' ')} exited ${result.status ?? `by signal ${result.signal}`}`,
  );
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
};

const expectedTargets = [
  'hdoc_decode',
  'hdoc_encode',
  'hdoc_path_lookup',
  'hdoc_tagged_render',
  'hdoc_migration',
];
assert(
  ['policy', 'smoke'].includes(mode),
  'usage: node tests/toolchain/check-hdoc-fuzz.mjs <policy|smoke>',
);
assert(authority.schema === 'helix.hdoc-fuzz-toolchain/1', 'fuzz authority schema');
assert(authority.plan_item === 'P03-019', 'fuzz authority task');
assert(authority.cargo_fuzz === '0.13.2', 'cargo-fuzz version');
assert(authority.libfuzzer_sys === '0.4.13', 'libfuzzer-sys version');
assert(authority.rust_toolchain === 'nightly-2026-06-30', 'fuzz Rust toolchain');
assert(authority.rustc_release === '1.98.0-nightly', 'fuzz rustc release');
assert(authority.rustc_commit === '096694416a41840709140eb0fd0ca193d1a3e6ba', 'fuzz rustc commit');
assert(JSON.stringify(authority.targets) === JSON.stringify(expectedTargets), 'fuzz target order');
assert(authority.bounded_smoke.runs_per_target === 128, 'bounded fuzz runs');
assert(authority.bounded_smoke.maximum_input_bytes === 1_048_576, 'bounded fuzz input');
assert(authority.bounded_smoke.timeout_seconds === 10, 'bounded fuzz timeout');
assert(authority.bounded_smoke.rss_limit_mb === 2_048, 'bounded fuzz RSS');
assert(authority.bounded_smoke.seed === 1_212_436_291, 'bounded fuzz seed');

const fuzzManifest = readFileSync(path.join(repository, 'fuzz/Cargo.toml'), 'utf8');
assert(fuzzManifest.includes('libfuzzer-sys = "=0.4.13"'), 'pinned libfuzzer-sys');
for (const target of expectedTargets) {
  assert(fuzzManifest.includes(`name = "${target}"`), `${target}: manifest target`);
  const source = readFileSync(path.join(repository, `fuzz/fuzz_targets/${target}.rs`), 'utf8');
  assert(source.includes('#![no_main]'), `${target}: no_main`);
  assert(source.includes('fuzz_target!'), `${target}: libFuzzer entry point`);
}
const lock = readFileSync(path.join(repository, 'fuzz/Cargo.lock'), 'utf8');
assert(lock.includes('name = "libfuzzer-sys"\nversion = "0.4.13"'), 'fuzz lock version');
assert(lock.includes('name = "helix-doc"'), 'fuzz lock product dependency');

if (mode === 'policy') {
  process.stdout.write(
    'PASS HDoc fuzz policy: 5 libFuzzer targets, exact dated nightly and tool versions\n',
  );
  process.exit(0);
}

const rustc = run('rustc', [`+${authority.rust_toolchain}`, '--version', '--verbose'], {
  display: false,
});
assert(rustc.includes(`release: ${authority.rustc_release}`), 'fuzz rustc release identity');
assert(rustc.includes(`commit-hash: ${authority.rustc_commit}`), 'fuzz rustc commit identity');
const cargoFuzz = run('cargo', [`+${authority.rust_toolchain}`, 'fuzz', '--version'], {
  display: false,
});
assert(cargoFuzz.trim() === `cargo-fuzz ${authority.cargo_fuzz}`, 'cargo-fuzz identity');

const workingRoot = path.join(repository, authority.bounded_smoke.working_corpus_root);
const artifactRoot = path.join(repository, authority.bounded_smoke.artifact_root);
rmSync(workingRoot, { force: true, recursive: true });
rmSync(artifactRoot, { force: true, recursive: true });
mkdirSync(workingRoot, { recursive: true });
mkdirSync(artifactRoot, { recursive: true });

const goldenRoot = path.join(repository, 'fixtures/hdoc/v1/cases');
const goldenFiles = sorted(readdirSync(goldenRoot).filter((file) => file.endsWith('.hdoc')));
assert(goldenFiles.length === 24, 'immutable HDoc fuzz seed count');
const seedCounts = {};
for (const target of expectedTargets) {
  const destination = path.join(workingRoot, target);
  mkdirSync(destination, { recursive: true });
  const committed = path.join(repository, 'tests/fuzz/corpus', target);
  try {
    cpSync(committed, destination, { recursive: true });
  } catch (error) {
    if (target !== 'hdoc_decode') throw error;
  }
  if (target === 'hdoc_decode') {
    for (const file of goldenFiles)
      cpSync(path.join(goldenRoot, file), path.join(destination, file));
  }
  if (target === 'hdoc_migration') {
    for (const file of goldenFiles) {
      const bytes = readFileSync(path.join(goldenRoot, file));
      writeFileSync(
        path.join(destination, `current-${file}`),
        Buffer.concat([Buffer.from([1, 0]), bytes]),
      );
    }
  }
  seedCounts[target] = readdirSync(destination).length;
}
assert(seedCounts.hdoc_decode === 24, 'decode corpus size');
assert(seedCounts.hdoc_encode === 2, 'encode corpus size');
assert(seedCounts.hdoc_path_lookup === 3, 'path corpus size');
assert(seedCounts.hdoc_tagged_render === 2, 'tagged corpus size');
assert(seedCounts.hdoc_migration === 26, 'migration corpus size');

let coverageMarkers = 0;
const targetResults = [];
for (const target of expectedTargets) {
  const targetArtifacts = path.join(artifactRoot, target);
  mkdirSync(targetArtifacts, { recursive: true });
  const output = run('cargo', [
    `+${authority.rust_toolchain}`,
    'fuzz',
    'run',
    target,
    path.join(workingRoot, target),
    '--',
    `-runs=${authority.bounded_smoke.runs_per_target}`,
    `-max_len=${authority.bounded_smoke.maximum_input_bytes}`,
    `-timeout=${authority.bounded_smoke.timeout_seconds}`,
    `-rss_limit_mb=${authority.bounded_smoke.rss_limit_mb}`,
    `-seed=${authority.bounded_smoke.seed}`,
    `-artifact_prefix=${targetArtifacts}${path.sep}`,
    '-print_final_stats=1',
  ]);
  assert(output.includes('INFO: Loaded 1 modules'), `${target}: libFuzzer coverage module`);
  assert(output.includes('stat::number_of_executed_units:'), `${target}: final fuzz statistics`);
  const done = [...output.matchAll(/#128\s+DONE\s+cov:\s+(\d+)\s+ft:\s+(\d+)/g)].at(-1);
  const peak = /stat::peak_rss_mb:\s+(\d+)/.exec(output);
  assert(done && peak, `${target}: bounded result markers`);
  targetResults.push({
    coverage_edges: Number(done[1]),
    feature_edges: Number(done[2]),
    peak_rss_mb: Number(peak[1]),
    seed_files: seedCounts[target],
    target,
    units: authority.bounded_smoke.runs_per_target,
  });
  coverageMarkers += 1;
}

const report = {
  schema: 'helix.hdoc-fuzz-report/1',
  toolchain: {
    cargo_fuzz: authority.cargo_fuzz,
    libfuzzer_sys: authority.libfuzzer_sys,
    rust_toolchain: authority.rust_toolchain,
    rustc_commit: authority.rustc_commit,
  },
  bounds: authority.bounded_smoke,
  targets: targetResults,
  total_executions: coverageMarkers * authority.bounded_smoke.runs_per_target,
  verdict: 'pass',
};
writeFileSync(
  path.join(repository, authority.bounded_smoke.report),
  `${JSON.stringify(report, null, 2)}\n`,
);

process.stdout.write(
  `PASS HDoc coverage-guided fuzz smoke: ${coverageMarkers} targets, ${coverageMarkers * authority.bounded_smoke.runs_per_target} executions, no crashes\n`,
);
process.stdout.write(`PASS HDoc fuzz seed corpora: ${JSON.stringify(seedCounts)}\n`);

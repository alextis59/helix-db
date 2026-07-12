#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium, firefox, webkit } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'dist/benchmarks/host-boundary');
const strategies = ['chatty', 'batched-copy', 'opaque-handle', 'shared-staging'];
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const nativeText = execFileSync(
  'cargo',
  [
    'run',
    '--frozen',
    '--offline',
    '--release',
    '--package',
    'helix-core',
    '--example',
    'host_boundary_benchmark',
  ],
  {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
    maxBuffer: 16 * 1024 * 1024,
  },
);
const nativeLines = nativeText.trim().split('\n');
assert(nativeLines.shift() === 'schema\thelix.host-boundary-benchmark-native/1', 'native schema');
const config = nativeLines.shift()?.split('\t');
assert(config?.[0] === 'config' && config.length === 8, 'native config');
const nativeConfig = {
  byteLength: Number(config[1]),
  chunkBytes: Number(config[2]),
  chattyIterations: Number(config[3]),
  coarseIterations: Number(config[4]),
  warmups: Number(config[5]),
  measurements: Number(config[6]),
  expectedChecksum: Number(config[7]),
};
const nativeSamples = nativeLines.map((line) => {
  const [tag, strategy, index, iterations, durationNs, bytes, checksum] = line.split('\t');
  assert(tag === 'sample' && strategies.includes(strategy), 'native sample');
  return {
    strategy,
    index: Number(index),
    iterations: Number(iterations),
    durationNs: Number(durationNs),
    bytes: Number(bytes),
    checksum: Number(checksum),
  };
});

execFileSync('node', ['tests/toolchain/build-browser-smoke.mjs'], { cwd: root, stdio: 'inherit' });
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4187',
    '--strictPort',
  ],
  { cwd: root, stdio: 'ignore' },
);
const url = 'http://127.0.0.1:4187/index.html';
for (let attempt = 0; attempt < 100; attempt += 1) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 50));
  if (attempt === 99) throw new Error('browser benchmark preview did not start');
}
const browserSamples = [];
const browserVersions = {};
try {
  for (const [engine, launcher] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await launcher.launch({ headless: true });
    try {
      browserVersions[engine] = browser.version();
      const page = await browser.newPage();
      await page.goto(url);
      await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ready');
      const report = await page.evaluate(() => {
        if (!window.__HELIX_BOUNDARY_BENCHMARK__) throw new Error('benchmark hook absent');
        return window.__HELIX_BOUNDARY_BENCHMARK__();
      });
      assert(JSON.stringify(report.config) === JSON.stringify(nativeConfig), `${engine} config`);
      for (const sample of report.samples) browserSamples.push({ engine, ...sample });
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill('SIGTERM');
}

for (const samples of [
  nativeSamples,
  ...['chromium', 'firefox', 'webkit'].map((engine) =>
    browserSamples.filter((sample) => sample.engine === engine),
  ),
]) {
  // Every sample checksum and output length is a correctness gate, independent of timing.
  assert(
    samples.length === strategies.length * (nativeConfig.warmups + nativeConfig.measurements),
    'sample count',
  );
  assert(
    samples.every(
      (sample) =>
        sample.bytes === nativeConfig.byteLength &&
        sample.checksum === nativeConfig.expectedChecksum &&
        sample.iterations ===
          (sample.strategy === 'chatty'
            ? nativeConfig.chattyIterations
            : nativeConfig.coarseIterations) &&
        sample.durationNs > 0,
    ),
    'sample correctness',
  );
}
const summarize = (samples) =>
  Object.fromEntries(
    strategies.map((strategy) => [
      strategy,
      {
        median_ns_per_iteration: median(
          samples
            .filter(
              (sample) => sample.strategy === strategy && sample.index >= nativeConfig.warmups,
            )
            .map((sample) => sample.durationNs / sample.iterations),
        ),
        iterations_per_sample:
          strategy === 'chatty' ? nativeConfig.chattyIterations : nativeConfig.coarseIterations,
        samples: nativeConfig.measurements,
      },
    ]),
  );
const summary = {
  schema: 'helix.host-boundary-benchmark-summary/1',
  plan_item: 'P04-016',
  recorded_at: new Date().toISOString(),
  environment: {
    platform: process.platform,
    architecture: process.arch,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    logical_cpus: os.cpus().length,
    memory_bytes: os.totalmem(),
    node: process.version,
    rustc: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
    browsers: browserVersions,
    source_commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    source_dirty:
      execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim().length > 0,
  },
  configuration: nativeConfig,
  native: summarize(nativeSamples),
  browsers: Object.fromEntries(
    ['chromium', 'firefox', 'webkit'].map((engine) => [
      engine,
      summarize(browserSamples.filter((sample) => sample.engine === engine)),
    ]),
  ),
  claim_boundary: {
    observational_only: true,
    timing_threshold: null,
    transport_selected: false,
    database_functionality_added: false,
  },
};
const raw = {
  schema: 'helix.host-boundary-benchmark-raw/1',
  plan_item: 'P04-016',
  configuration: nativeConfig,
  native: nativeSamples,
  browsers: browserSamples,
};
// Contract inventory: 400 correctness-checked samples across native/3 browsers.
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'raw.json'), `${JSON.stringify(raw, null, 2)}\n`);
writeFileSync(path.join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(
  `PASS host boundary benchmark: ${nativeSamples.length + browserSamples.length} correctness-checked samples across native/3 browsers\nREPORT ${path.relative(root, path.join(output, 'summary.json'))}\n`,
);

#!/usr/bin/env node

import {
  assert,
  loadWorkload,
  sha256,
  validateSchemas,
  verifyOutputArtifacts,
} from './benchmark-contract.mjs';

const mode = process.argv[2];

try {
  assert(
    process.argv.length === 3 && ['schemas', 'report'].includes(mode),
    'usage: node benchmarks/check-benchmark-artifacts.mjs <schemas|report>',
  );
  const schemaCount = validateSchemas();
  const workload = loadWorkload();
  if (mode === 'schemas') {
    process.stdout.write(
      `PASS benchmark schemas: ${schemaCount} strict schemas, workload ${workload.id}, 1 deterministic dataset\n`,
    );
  } else {
    const { raw, rawBytes, summaryBytes } = verifyOutputArtifacts();
    process.stdout.write(
      `PASS benchmark artifacts: ${raw.totals.warmup_observations} warmups, ${raw.totals.measured_observations} measurements, raw ${rawBytes.length} bytes ${sha256(rawBytes)}, summary ${summaryBytes.length} bytes ${sha256(summaryBytes)}\n`,
    );
    process.stdout.write(
      'PASS benchmark claim boundary: integrity-only calibration, no performance threshold or database claim\n',
    );
  }
} catch (error) {
  process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

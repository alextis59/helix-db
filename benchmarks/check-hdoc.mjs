#!/usr/bin/env node

import { assert, loadWorkload, validateSchemas, verifyArtifacts } from './hdoc-contract.mjs';

const mode = process.argv[2];
try {
  assert(
    process.argv.length === 3 && ['policy', 'report'].includes(mode),
    'usage: node benchmarks/check-hdoc.mjs <policy|report>',
  );
  const schemas = validateSchemas();
  const workload = loadWorkload();
  if (mode === 'policy') {
    process.stdout.write(
      `PASS HDoc benchmark policy: ${schemas} schemas, ${workload.shapes.length} shapes, ${workload.operations.length} operations\n`,
    );
  } else {
    const { raw, rawContent, summaryContent } = verifyArtifacts();
    process.stdout.write(
      `PASS HDoc benchmark report: ${raw.totals.shapes} shapes, ${raw.totals.measurement_samples} samples, raw ${rawContent.length} bytes, summary ${summaryContent.length} bytes\n`,
    );
    process.stdout.write(
      'PASS HDoc benchmark claim boundary: correctness gates only; timing threshold null; P03-021 owns decisions\n',
    );
  }
} catch (error) {
  process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

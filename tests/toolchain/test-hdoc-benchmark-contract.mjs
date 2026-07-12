#!/usr/bin/env node

import {
  assert,
  validateEngine,
  validateRaw,
  validateSummary,
  verifyArtifacts,
} from '../../benchmarks/hdoc-contract.mjs';

const { raw, rawContent, summary } = verifyArtifacts();
const cases = [
  () => validateEngine({ ...raw.engine, schema: 'helix.hdoc-benchmark-engine/2' }),
  () => validateEngine({ ...raw.engine, shape_count: 4 }),
  () => validateEngine({ ...raw.engine, shapes: raw.engine.shapes.slice(1) }),
  () =>
    validateEngine({
      ...raw.engine,
      shapes: raw.engine.shapes.map((shape, index) =>
        index === 0 ? { ...shape, recursive_fields: 2 } : shape,
      ),
    }),
  () =>
    validateEngine({
      ...raw.engine,
      shapes: raw.engine.shapes.map((shape, index) =>
        index === 0 ? { ...shape, operations: shape.operations.slice(1) } : shape,
      ),
    }),
  () =>
    validateEngine({
      ...raw.engine,
      shapes: raw.engine.shapes.map((shape, index) =>
        index === 0
          ? {
              ...shape,
              operations: shape.operations.map((operation, operationIndex) =>
                operationIndex === 0
                  ? { ...operation, durations_ns: [0, ...operation.durations_ns.slice(1)] }
                  : operation,
              ),
            }
          : shape,
      ),
    }),
  () =>
    validateEngine({
      ...raw.engine,
      shapes: raw.engine.shapes.map((shape, index) =>
        index === 0
          ? { ...shape, dictionary_model: { ...shape.dictionary_model, savings_bytes: 0 } }
          : shape,
      ),
    }),
  () => validateRaw({ ...raw, plan_item: 'P03-019' }),
  () => validateRaw({ ...raw, totals: { ...raw.totals, measurement_samples: 599 } }),
  () => validateRaw({ ...raw, claim_boundary: { ...raw.claim_boundary, timing_threshold: 1 } }),
  () =>
    validateSummary(
      { ...summary, raw_result: { ...summary.raw_result, sha256: '0'.repeat(64) } },
      raw,
      rawContent,
    ),
  () =>
    validateSummary(
      {
        ...summary,
        shapes: summary.shapes.map((shape, index) =>
          index === 0
            ? {
                ...shape,
                operations: shape.operations.map((operation, operationIndex) =>
                  operationIndex === 0
                    ? {
                        ...operation,
                        duration_ns: {
                          ...operation.duration_ns,
                          p95: operation.duration_ns.p95 + 1,
                        },
                      }
                    : operation,
                ),
              }
            : shape,
        ),
      },
      raw,
      rawContent,
    ),
  () =>
    validateSummary(
      { ...summary, acceptance: { ...summary.acceptance, timing_threshold: 1 } },
      raw,
      rawContent,
    ),
];
let rejected = 0;
for (const mutate of cases) {
  try {
    mutate();
  } catch {
    rejected += 1;
  }
}
assert(rejected === 13, `HDoc benchmark mutation canaries rejected ${rejected}/13`);
process.stdout.write(
  'PASS HDoc benchmark rejection canaries: 13 report/authority mutations rejected\n',
);

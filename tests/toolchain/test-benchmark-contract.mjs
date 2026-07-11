#!/usr/bin/env node

import {
  assert,
  paths,
  readBytes,
  readJson,
  validateRawResult,
  validateSummary,
  validateWorkload,
  verifyOutputArtifacts,
} from '../../benchmarks/benchmark-contract.mjs';

const expectRejection = (label, marker, mutate, validate) => {
  const candidate = structuredClone(mutate());
  let rejected = false;
  try {
    validate(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(marker), `${label}: wrong rejection reason: ${message}`);
    rejected = true;
  }
  assert(rejected, `${label}: mutation unexpectedly passed`);
};

const { raw, rawBytes, summary } = verifyOutputArtifacts();
const workload = readJson(paths.workload);
const rawValidator = (candidate) => validateRawResult(candidate);
const summaryValidator = (candidate) => validateSummary(candidate, raw, rawBytes);

const cases = [
  [
    'unknown workload schema',
    'workload schema mismatch',
    () => ({ ...workload, schema: 'helix.benchmark-workload/2' }),
    validateWorkload,
  ],
  [
    'claim eligibility escalation',
    'workload claim boundary mismatch',
    () => ({ ...workload, claim_boundary: { ...workload.claim_boundary, eligible: true } }),
    validateWorkload,
  ],
  [
    'dataset hash drift',
    'workload dataset mismatch',
    () => ({ ...workload, dataset: { ...workload.dataset, sha256: '0'.repeat(64) } }),
    validateWorkload,
  ],
  [
    'stage inventory drift',
    'workload configuration mismatch',
    () => ({
      ...workload,
      workload: { ...workload.workload, stage_order: workload.workload.stage_order.slice(1) },
    }),
    validateWorkload,
  ],
  [
    'unknown raw result schema',
    'raw result schema mismatch',
    () => ({ ...raw, schema: 'helix.benchmark-raw-result/2' }),
    rawValidator,
  ],
  [
    'raw result unknown field',
    'raw result fields mismatch',
    () => ({ ...raw, unexpected: true }),
    rawValidator,
  ],
  [
    'sensitive environment key',
    'forbidden sensitive key hostname',
    () => ({
      ...raw,
      environment: { ...raw.environment, hostname: 'must-not-be-retained' },
    }),
    rawValidator,
  ],
  [
    'source hash drift',
    'raw source 0 current identity mismatch',
    () => ({
      ...raw,
      sources: raw.sources.map((source, index) =>
        index === 0 ? { ...source, sha256: '0'.repeat(64) } : source,
      ),
    }),
    rawValidator,
  ],
  [
    'unsafe duration',
    'non-integer or unsafe JSON number',
    () => {
      const candidate = structuredClone(raw);
      candidate.observations[0].stages.at(-1).duration_ns = Number.MAX_SAFE_INTEGER + 1;
      return candidate;
    },
    rawValidator,
  ],
  [
    'incomplete observations',
    'raw result totals mismatch',
    () => ({ ...raw, observations: raw.observations.slice(0, -1) }),
    rawValidator,
  ],
  [
    'passing fallback',
    'passing calibration used a fallback',
    () => {
      const candidate = structuredClone(raw);
      candidate.observations[5].fallback = true;
      return candidate;
    },
    rawValidator,
  ],
  [
    'wrong result digest',
    'passing result mismatch',
    () => {
      const candidate = structuredClone(raw);
      candidate.observations[5].result.digest_sha256 = '0'.repeat(64);
      return candidate;
    },
    rawValidator,
  ],
  [
    'non-applicable stage duration',
    'non-applicable duration is nonzero',
    () => {
      const candidate = structuredClone(raw);
      candidate.observations[5].stages[0].duration_ns = 1;
      return candidate;
    },
    rawValidator,
  ],
  [
    'omitted end-to-end cost',
    'end-to-end duration omits an applicable stage',
    () => {
      const candidate = structuredClone(raw);
      candidate.observations[5].stages.at(-1).duration_ns = 1;
      return candidate;
    },
    rawValidator,
  ],
  [
    'filtered failure inventory',
    'raw result failure inventory mismatch',
    () => ({ ...raw, failures: ['invented-or-filtered-failure'] }),
    rawValidator,
  ],
  [
    'false raw verdict',
    'raw result verdict mismatch',
    () => ({ ...raw, verdict: 'fail' }),
    rawValidator,
  ],
  [
    'summary raw hash drift',
    'summary fields mismatch',
    () => ({
      ...summary,
      raw_result: { ...summary.raw_result, sha256: '0'.repeat(64) },
    }),
    summaryValidator,
  ],
  [
    'summary distribution drift',
    'recomputed distribution mismatch',
    () => {
      const candidate = structuredClone(summary);
      candidate.stage_distributions.at(-1).p95 += 1;
      return candidate;
    },
    summaryValidator,
  ],
  [
    'performance threshold injection',
    'summary fields mismatch',
    () => ({
      ...summary,
      acceptance: { ...summary.acceptance, performance_threshold: 1 },
    }),
    summaryValidator,
  ],
];

for (const [label, marker, mutate, validate] of cases) {
  expectRejection(label, marker, mutate, validate);
}

assert(readBytes(paths.rawOutput).equals(rawBytes), 'negative checks mutated the raw artifact');
process.stdout.write(
  `PASS benchmark rejection canaries: ${cases.length} intended mutations rejected with exact reasons\n`,
);

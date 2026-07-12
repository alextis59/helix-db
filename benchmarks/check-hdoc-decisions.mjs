#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const same = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
};
const decisionsPath = 'benchmarks/reports/hdoc-v1-decisions.json';
const decisions = JSON.parse(readFileSync(decisionsPath));
const rawBytes = readFileSync(decisions.inputs.raw.path);
const summaryBytes = readFileSync(decisions.inputs.summary.path);
const raw = JSON.parse(rawBytes);
const summary = JSON.parse(summaryBytes);

export const validateDecisions = (candidate = decisions) => {
  same(
    Object.keys(candidate),
    ['schema', 'plan_item', 'recorded_on', 'inputs', 'experiments', 'claim_boundary', 'verdict'],
    'decision fields',
  );
  assert(candidate.schema === 'helix.hdoc-experiment-decisions/1', 'decision schema');
  assert(
    candidate.plan_item === 'P03-021' && candidate.verdict === 'pass',
    'decision owner/verdict',
  );
  assert(candidate.recorded_on === '2026-07-12', 'decision date');
  for (const [name, content] of [
    ['raw', rawBytes],
    ['summary', summaryBytes],
  ]) {
    const identity = candidate.inputs[name];
    assert(statSync(identity.path).isFile(), `${name} input path`);
    assert(identity.bytes === content.length, `${name} input bytes`);
    assert(identity.sha256 === sha256(content), `${name} input hash`);
  }
  assert(candidate.inputs.source_commit === raw.source_control.commit, 'source commit input');
  assert(raw.source_control.dirty === false, 'raw input clean source');
  assert(summary.raw_result.sha256 === candidate.inputs.raw.sha256, 'raw-summary linkage');
  same(
    candidate.experiments.map(({ id }) => id),
    ['EXP-001', 'EXP-002'],
    'experiment order',
  );

  const [layout, dictionary] = candidate.experiments;
  assert(layout.verdict === 'accepted-without-performance-slo', 'EXP-001 verdict');
  same(
    layout.decision.selected_stored_profiles,
    ['base', 'canonical-compression-1'],
    'stored profiles',
  );
  assert(layout.decision.selected_format === 'helix.hdoc/1.0', 'selected format');
  assert(layout.observations.representative_shapes === raw.totals.shapes, 'EXP-001 shape count');
  assert(
    layout.observations.measurement_samples === raw.totals.measurement_samples,
    'EXP-001 samples',
  );
  assert(layout.observations.timing_threshold === null, 'EXP-001 timing threshold');

  const models = raw.engine.shapes.map(({ dictionary_model: model }) => model);
  const negative = models.filter(({ savings_bytes: savings }) => savings < 0);
  const positive = models.filter(({ savings_bytes: savings }) => savings > 0);
  assert(dictionary.verdict === 'partially-supported-shape-dependent', 'EXP-002 verdict');
  assert(dictionary.observations.negative_shapes === negative.length, 'negative shape count');
  assert(dictionary.observations.positive_shapes === positive.length, 'positive shape count');
  assert(
    dictionary.observations.minimum_savings_basis_points ===
      Math.min(...models.map(({ savings_basis_points: value }) => value)),
    'minimum dictionary savings',
  );
  assert(
    dictionary.observations.maximum_savings_basis_points ===
      Math.max(...models.map(({ savings_basis_points: value }) => value)),
    'maximum dictionary savings',
  );
  assert(dictionary.decision.retain_collection_path_dictionary === true, 'dictionary retention');
  assert(
    dictionary.decision.use_for_derived_sidecars_and_metadata === true,
    'derived dictionary use',
  );
  assert(
    dictionary.decision.use_dictionary_references_in_hdoc_1_0 === false,
    'HDoc base reference exclusion',
  );
  assert(
    dictionary.decision.authoritative_hdoc_remains_self_contained === true,
    'HDoc self containment',
  );
  assert(dictionary.decision.future_prerequisites.length === 5, 'future profile prerequisites');
  assert(candidate.claim_boundary.performance_slo === null, 'decision performance SLO');
  assert(
    candidate.claim_boundary.dictionary_reference_profile_implemented === false,
    'reference profile claim',
  );
  return candidate;
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    assert(process.argv.length === 2, 'usage: node benchmarks/check-hdoc-decisions.mjs');
    validateDecisions();
    process.stdout.write(
      'PASS HDoc experiment decisions: EXP-001 accepted, EXP-002 shape-dependent\n',
    );
    process.stdout.write(
      'PASS HDoc selected profiles: self-contained base + canonical compression; dictionary references excluded from 1.0\n',
    );
  } catch (error) {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

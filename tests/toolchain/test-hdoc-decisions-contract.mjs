#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { validateDecisions } from '../../benchmarks/check-hdoc-decisions.mjs';

const original = JSON.parse(readFileSync('benchmarks/reports/hdoc-v1-decisions.json'));
const mutations = [
  (value) => {
    value.schema = 'helix.hdoc-experiment-decisions/2';
  },
  (value) => {
    value.plan_item = 'P03-020';
  },
  (value) => {
    value.inputs.raw.sha256 = '0'.repeat(64);
  },
  (value) => {
    value.inputs.source_commit = '0'.repeat(40);
  },
  (value) => {
    value.experiments.reverse();
  },
  (value) => {
    value.experiments[0].verdict = 'rejected';
  },
  (value) => {
    value.experiments[0].decision.selected_format = 'other';
  },
  (value) => {
    value.experiments[0].observations.timing_threshold = 1;
  },
  (value) => {
    value.experiments[1].observations.negative_shapes = 0;
  },
  (value) => {
    value.experiments[1].decision.use_dictionary_references_in_hdoc_1_0 = true;
  },
  (value) => {
    value.experiments[1].decision.future_prerequisites.pop();
  },
  (value) => {
    value.claim_boundary.performance_slo = 1;
  },
  (value) => {
    value.claim_boundary.dictionary_reference_profile_implemented = true;
  },
];
let rejected = 0;
for (const mutate of mutations) {
  const candidate = structuredClone(original);
  mutate(candidate);
  try {
    validateDecisions(candidate);
  } catch {
    rejected += 1;
  }
}
if (rejected !== mutations.length) {
  throw new Error(`HDoc decision canaries rejected ${rejected}/${mutations.length}`);
}
process.stdout.write('PASS HDoc decision rejection canaries: 13 mutations rejected\n');

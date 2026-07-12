#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateDecisions } from '../../../benchmarks/check-hdoc-decisions.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../../..');
const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
const argument = process.argv[2];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (args) =>
  execFileSync('git', args, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (args) => gitBytes(args).toString('utf8');
const showBytes = (file) => gitBytes(['show', `${manifest.commit}:${file}`]);
const showText = (file) => showBytes(file).toString('utf8');
const showJson = (file) => JSON.parse(showText(file));

assert(argument, 'usage: node evidence/phase-03/P03-021/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-021' && manifest.verdict === 'pass', 'evidence verdict');
assert(gitText(['rev-parse', `${argument}^{commit}`]).trim() === argument, 'source commit');
assert(gitText(['rev-parse', `${argument}^`]).trim() === manifest.base_commit, 'source parent');
assert(gitText(['rev-parse', `${argument}^{tree}`]).trim() === manifest.source_tree, 'source tree');
const changes = gitText(['diff-tree', '--no-commit-id', '--name-only', '-r', argument])
  .trim()
  .split('\n');
assert(changes.length === manifest.verification.source_artifacts, 'source artifact count');
assert(
  sha256(gitBytes(['diff', '--binary', manifest.base_commit, argument])) === manifest.diff_sha256,
  'source diff hash',
);

const verifierPath = fileURLToPath(import.meta.url);
const verifier = readFileSync(verifierPath);
assert(statSync(verifierPath).size === manifest.verifier.bytes, 'verifier bytes');
assert(sha256(verifier) === manifest.verifier.sha256, 'verifier hash');
for (const artifact of manifest.authorities) {
  const committed = showBytes(artifact.path);
  assert(committed.length === artifact.bytes, `${artifact.path} bytes`);
  assert(sha256(committed) === artifact.sha256, `${artifact.path} hash`);
}

const decisions = showJson('benchmarks/reports/hdoc-v1-decisions.json');
validateDecisions(decisions);
assert(decisions.schema === 'helix.hdoc-experiment-decisions/1', 'decision identity');
assert(decisions.plan_item === 'P03-021' && decisions.verdict === 'pass', 'decision result');
assert(
  decisions.inputs.source_commit === 'fc95bb38d08be185775f96112f7cd018096aad1b',
  'measurement source binding',
);
const [layout, dictionary] = decisions.experiments;
assert(layout.id === 'EXP-001' && layout.verdict === 'accepted-without-performance-slo', 'EXP-001');
assert(layout.decision.selected_format === 'helix.hdoc/1.0', 'selected format');
assert(
  JSON.stringify(layout.decision.selected_stored_profiles) ===
    JSON.stringify(['base', 'canonical-compression-1']),
  'selected profiles',
);
assert(layout.observations.measurement_samples === 600, 'retained measurement breadth');
assert(layout.observations.timed_iterations === 9600, 'retained iteration breadth');
assert(layout.observations.timing_threshold === null, 'no timing SLO');
assert(
  dictionary.id === 'EXP-002' &&
    dictionary.verdict === 'partially-supported-shape-dependent',
  'EXP-002',
);
assert(dictionary.observations.negative_shapes === 1, 'negative dictionary shape retained');
assert(dictionary.observations.positive_shapes === 4, 'positive dictionary shapes retained');
assert(dictionary.decision.retain_collection_path_dictionary === true, 'dictionary retained');
assert(
  dictionary.decision.use_for_derived_sidecars_and_metadata === true,
  'derived dictionary use',
);
assert(
  dictionary.decision.use_dictionary_references_in_hdoc_1_0 === false &&
    dictionary.decision.authoritative_hdoc_remains_self_contained === true,
  'self-contained authoritative HDoc',
);
assert(dictionary.decision.future_prerequisites.length === 5, 'future profile prerequisites');
assert(decisions.claim_boundary.performance_slo === null, 'claim boundary SLO');
assert(
  decisions.claim_boundary.dictionary_reference_profile_implemented === false,
  'claim boundary implementation',
);

const root = showText('Cargo.toml');
const adr = showText('docs/adr/0012-use-bounded-little-endian-hdoc-v1.md');
const specifications = showText('Specifications.md');
const study = showText('Study.md');
const suites = showJson('tests/suites.json');
const matrix = showJson('.github/ci/matrix.json');
assert(
  root.includes('plan-item = "P03-021"') && root.includes('status = "hdoc-experiments-v1"'),
  'source maturity',
);
assert(adr.includes('- [x] `P03-021`'), 'ADR completion');
assert(specifications.includes('HDoc 1.0 rows remain self-contained'), 'specification decision');
assert(study.includes('rejects dictionary references'), 'study conclusion');
const benchmark = suites.suites.find(({ id }) => id === 'benchmark');
assert(benchmark?.steps.at(-1) === 'hdoc-decisions', 'benchmark decision step');
assert(benchmark?.expectations.hdoc_experiments === 2, 'suite experiment count');
assert(matrix.plan_items.at(-1) === 'P03-021', 'CI task history');

const schema = spawnSync(
  'python3',
  [
    '-m',
    'jsonschema',
    '-i',
    'benchmarks/reports/hdoc-v1-decisions.json',
    'benchmarks/schema/hdoc-decisions-v1.schema.json',
  ],
  { cwd: repository, encoding: 'utf8' },
);
assert(schema.status === 0, 'offline JSON Schema validation');
const checker = execFileSync('node', ['benchmarks/check-hdoc-decisions.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(checker.includes('EXP-001 accepted, EXP-002 shape-dependent'), 'live decision checker');
const canaries = execFileSync('node', ['tests/toolchain/test-hdoc-decisions-contract.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(canaries.includes('13 mutations rejected'), 'live mutation canaries');

process.stdout.write('PASS P03-021 source: 34 artifacts bind two HDoc experiment decisions\n');
process.stdout.write('PASS P03-021 EXP-001: self-contained base plus canonical compression selected\n');
process.stdout.write('PASS P03-021 EXP-002: derived-only dictionary selected; row references excluded\n');
process.stdout.write('PASS P03-021 gates: closed schema, exact inputs, 13 mutation canaries\n');

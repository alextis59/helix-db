#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateHosted, validateReview } from './gate-contract.mjs';

const gateDirectory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(gateDirectory, '../../..');
const manifest = JSON.parse(readFileSync(path.join(gateDirectory, 'manifest.json'), 'utf8'));
const reviewedArgument = process.argv[2];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (args) =>
  execFileSync('git', args, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (args) => gitBytes(args).toString('utf8');
const showBytes = (file, commit = manifest.reviewed_commit) =>
  gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.reviewed_commit) =>
  showBytes(file, commit).toString('utf8');
const showJson = (file, commit = manifest.reviewed_commit) =>
  JSON.parse(showText(file, commit));
const gateBytes = (file) => readFileSync(path.join(gateDirectory, file));
const same = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
};

assert(reviewedArgument, 'usage: node evidence/phase-03/G03/verify.mjs <reviewed-commit>');
assert(/^[0-9a-f]{40}$/.test(reviewedArgument), 'reviewed commit must be a full lowercase SHA-1');
assert(reviewedArgument === manifest.reviewed_commit, 'argument does not match reviewed commit');
assert(manifest.schema_version === 1 && manifest.gate_id === 'G03', 'gate identity');
assert(manifest.verdict === 'pass', 'gate verdict');
assert(
  gitText(['rev-parse', `${reviewedArgument}^{commit}`]).trim() === reviewedArgument,
  'reviewed commit',
);
assert(
  gitText(['rev-parse', `${reviewedArgument}^{tree}`]).trim() === manifest.reviewed_tree,
  'reviewed tree',
);

for (const authority of manifest.gate_authorities) {
  const bytes = gateBytes(authority.path);
  assert(bytes.length === authority.bytes, `${authority.path}: bytes`);
  assert(sha256(bytes) === authority.sha256, `${authority.path}: hash`);
}
validateReview(gateBytes('review.md').toString('utf8'));
validateHosted(JSON.parse(gateBytes('hosted-observation.json')), reviewedArgument);

const plan = showText('ImplementationPlan.md');
const tasks = Array.from({ length: 21 }, (_, index) => `P03-${String(index + 1).padStart(3, '0')}`);
for (const task of tasks) {
  assert(new RegExp(`^- \\[x\\] \\*\\*${task}\\*\\*`, 'm').test(plan), `${task}: unchecked`);
}
assert(/^- \[ \] \*\*G03\*\*/m.test(plan), 'G03 must be open at reviewed commit');
const planItems = [...plan.matchAll(/^\s*- \[([ x])\] \*\*((?:P\d{2}-\d{3}|G\d{2}|X-\d{3}))\*\*/gm)];
assert(planItems.length === 522, 'plan item count');
assert(planItems.filter((match) => match[1] === 'x').length === 80, 'reviewed checked count');

const requirements = new Set();
const adrs = new Set();
const sourceCommits = new Set();
let sourceArtifactRecords = 0;
for (const task of tasks) {
  const root = `evidence/phase-03/${task}`;
  const evidence = showJson(`${root}/manifest.json`);
  assert(evidence.schema_version === 1, `${task}: schema`);
  assert(evidence.task_id === task && evidence.verdict === 'pass', `${task}: verdict`);
  assert(Array.isArray(evidence.requirements) && evidence.requirements.length > 0, `${task}: requirements`);
  assert(Array.isArray(evidence.accepted_adrs) && evidence.accepted_adrs.length > 0, `${task}: ADRs`);
  assert(Array.isArray(evidence.source_commits) && evidence.source_commits.length > 0, `${task}: source commits`);
  for (const requirement of evidence.requirements) requirements.add(requirement);
  for (const adr of evidence.accepted_adrs) adrs.add(adr);
  sourceCommits.add(evidence.commit);
  assert(/^[0-9a-f]{40}$/.test(evidence.commit), `${task}: source commit shape`);
  assert(
    spawnSync('git', ['merge-base', '--is-ancestor', evidence.commit, reviewedArgument], {
      cwd: repository,
    }).status === 0,
    `${task}: source ancestry`,
  );
  assert(
    gitText(['rev-parse', `${evidence.commit}^{tree}`]).trim() === evidence.source_tree,
    `${task}: source tree`,
  );
  const declaredArtifacts = evidence.source_artifacts?.length ?? evidence.verification.source_artifacts;
  assert(Number.isSafeInteger(declaredArtifacts) && declaredArtifacts > 0, `${task}: source artifacts`);
  sourceArtifactRecords += declaredArtifacts;
  const verifierPath = evidence.verifier.path?.startsWith('evidence/')
    ? evidence.verifier.path
    : `${root}/${evidence.verifier.path ?? 'verify.mjs'}`;
  const verifier = showBytes(verifierPath);
  assert(verifier.length === evidence.verifier.bytes, `${task}: verifier bytes`);
  assert(sha256(verifier) === evidence.verifier.sha256, `${task}: verifier hash`);
}
same([...requirements].sort(), manifest.requirements, 'requirement union');
same([...adrs].sort(), manifest.accepted_adrs, 'accepted ADR union');
assert(sourceCommits.size === 21, 'distinct task source commits');
assert(sourceArtifactRecords === 666, 'task source artifact records');

const golden = showJson('fixtures/hdoc/v1/manifest.json');
assert(golden.schema === 'helix.hdoc-golden-manifest/1', 'golden schema');
assert(golden.format.major === 1 && golden.format.minor === 0 && golden.format.frozen, 'format freeze');
assert(golden.cases.length === 24, 'golden case count');
assert(golden.cases.filter(({ kind }) => kind === 'positive').length === 4, 'positive vectors');
assert(golden.cases.filter(({ kind }) => kind === 'invalid').length === 20, 'rejection vectors');
for (const entry of golden.cases) {
  const bytes = showBytes(entry.path);
  assert(bytes.length === entry.bytes, `${entry.id}: bytes`);
  assert(sha256(bytes) === entry.sha256, `${entry.id}: hash`);
}

const parity = showJson('evidence/phase-03/P03-017/manifest.json');
assert(parity.verification.logical_value_comparisons === 4, 'cross-reader values');
assert(parity.verification.typed_hash_comparisons === 4, 'cross-reader hashes');
const properties = showJson('evidence/phase-03/P03-018/manifest.json');
assert(properties.verification.checksum_repaired_bit_mutations === 2656, 'repaired mutations');
const fuzz = showJson('evidence/phase-03/P03-019/manifest.json');
assert(fuzz.verification.fuzz_targets === 5, 'fuzz targets');
assert(fuzz.verification.seed_files === 57, 'fuzz seeds');
assert(fuzz.verification.bounded_executions === 640, 'fuzz executions');
assert(fuzz.verification.browser_executions === 6, 'browser executions');
const benchmark = showJson('evidence/phase-03/P03-020/manifest.json');
assert(benchmark.verification.measurement_samples === 600, 'benchmark samples');
assert(benchmark.verification.timed_iterations === 9600, 'benchmark iterations');
const decisions = showJson('benchmarks/reports/hdoc-v1-decisions.json');
assert(decisions.claim_boundary.performance_slo === null, 'performance claim boundary');
assert(decisions.experiments[1].decision.use_dictionary_references_in_hdoc_1_0 === false, 'row dictionary exclusion');
assert(decisions.experiments[1].decision.authoritative_hdoc_remains_self_contained, 'HDoc self containment');

const negotiation = showText('crates/helix-doc/src/hdoc_negotiation.rs');
assert(negotiation.includes('HDocMigrationAssessment::NoMigrationRequired'), 'no-op migration');
assert(negotiation.includes('HDocMigrationError::UnsupportedTarget'), 'migration rejection');
const adr = showText('docs/adr/0012-use-bounded-little-endian-hdoc-v1.md');
assert(adr.includes('no open critical'), 'critical issue gate language');
assert(!/\b(?:TODO|TBD|FIXME)\b/.test(adr), 'open ADR marker');

for (const task of tasks) {
  const evidence = showJson(`evidence/phase-03/${task}/manifest.json`);
  const replay = spawnSync('node', [`evidence/phase-03/${task}/verify.mjs`, evidence.commit], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  assert(replay.status === 0, `${task}: verifier replay\n${replay.stderr}`);
  assert(replay.stdout.includes('PASS'), `${task}: verifier output`);
}
const canaries = execFileSync('node', ['evidence/phase-03/G03/test-verifier.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(canaries.includes('5 hosted mutations rejected'), 'gate mutation canaries');

process.stdout.write('PASS G03 task evidence: 21 verifiers, 21 source commits, 666 artifact records\n');
process.stdout.write('PASS G03 format: 24 frozen files, 4 cross-reader values/hashes, 20 rejections\n');
process.stdout.write('PASS G03 hardening: 2656 repaired mutations, 5 fuzz targets, 640 executions\n');
process.stdout.write('PASS G03 decisions: self-contained HDoc 1.0, derived-only dictionary, null SLO\n');
process.stdout.write('PASS G03 hosted matrix: exact reviewed head, 12/12 jobs successful\n');

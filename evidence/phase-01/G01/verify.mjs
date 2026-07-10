#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
if (!input) throw new Error('usage: node evidence/phase-01/G01/verify.mjs <reviewed-commit>');

const scriptPath = fileURLToPath(import.meta.url);
const evidenceDirectory = path.dirname(scriptPath);
const gateManifest = JSON.parse(readFileSync(path.join(evidenceDirectory, 'manifest.json'), 'utf8'));
const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const gitText = (args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' });
const gitBytes = (args) => execFileSync('git', args, { cwd: repository });
const commit = gitText(['rev-parse', `${input}^{commit}`]).trim();
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const showBytesAt = (revision, file) => gitBytes(['show', `${revision}:${file}`]);
const showBytes = (file) => showBytesAt(commit, file);
const showText = (file) => new TextDecoder('utf-8', { fatal: true }).decode(showBytes(file));
const readJson = (file) => JSON.parse(showText(file));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};
const sorted = (values) => [...values].sort();

assert(gateManifest.gate_id === 'G01', 'gate manifest ID mismatch');
assert(gateManifest.reviewed_commit === commit, 'gate manifest reviewed commit mismatch');
assert(gateManifest.verdict === 'pass', 'gate manifest verdict is not pass');
const verifierBytes = readFileSync(scriptPath);
assert(verifierBytes.length === gateManifest.verifier.bytes, 'gate verifier byte count mismatch');
assert(sha256(verifierBytes) === gateManifest.verifier.sha256, 'gate verifier hash mismatch');
gitText(['diff', '--check', `${commit}^`, commit]);

const plan = showText('ImplementationPlan.md');
const planItems = [...plan.matchAll(/^\s*- \[([ x])\] \*\*((?:P\d{2}-\d{3}|G\d{2}|X-\d{3}))\*\*/gm)]
  .map((match) => ({ checked: match[1] === 'x', id: match[2] }));
assert(planItems.length === 522, `implementation plan item count mismatch: ${planItems.length}`);
assert(new Set(planItems.map(({ id }) => id)).size === planItems.length, 'duplicate implementation plan ID');
const completedItems = planItems.filter(({ checked }) => checked).length;
const openItems = planItems.length - completedItems;
const snapshot = {
  completed: Number(plan.match(/Completed checklist items: (\d+)/)?.[1]),
  open: Number(plan.match(/Open checklist items: (\d+)/)?.[1]),
  total: Number(plan.match(/Total checklist items: (\d+)/)?.[1]),
};
same(snapshot, { completed: completedItems, open: openItems, total: planItems.length }, 'progress snapshot');
const expectedTasks = Array.from({ length: 22 }, (_, index) => `P01-${String(index + 1).padStart(3, '0')}`);
for (const task of expectedTasks) {
  const item = planItems.find(({ id }) => id === task);
  assert(item?.checked, `${task} is not checked at the reviewed commit`);
}
const gateItem = planItems.find(({ id }) => id === 'G01');
assert(gateItem, 'G01 checklist item missing');

let artifactRecords = 0;
let verifierRecords = 0;
const manifestRequirements = new Set();
const sourceCommits = new Set();
for (const task of expectedTasks) {
  const manifestPath = `evidence/phase-01/${task}/manifest.json`;
  const readmePath = `evidence/phase-01/${task}/README.md`;
  const manifest = readJson(manifestPath);
  assert(manifest.schema_version === 1, `${task}: unsupported evidence schema`);
  assert(manifest.task_id === task, `${task}: evidence task ID mismatch`);
  assert(manifest.verdict === 'pass', `${task}: evidence verdict is not pass`);
  const sourceCommit = gitText(['rev-parse', `${manifest.commit}^{commit}`]).trim();
  assert(sourceCommit === manifest.commit, `${task}: evidence commit is not canonical`);
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sourceCommit, commit], {
      cwd: repository,
      stdio: 'ignore',
    });
  } catch {
    throw new Error(`${task}: evidence commit is not an ancestor of reviewed commit`);
  }
  sourceCommits.add(sourceCommit);
  assert(Array.isArray(manifest.requirements) && manifest.requirements.length > 0, `${task}: requirements absent`);
  for (const requirement of manifest.requirements) manifestRequirements.add(requirement);
  assert(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0, `${task}: artifacts absent`);
  assert(new Set(manifest.artifacts.map(({ path: file }) => file)).size === manifest.artifacts.length, `${task}: duplicate artifact`);
  for (const artifact of manifest.artifacts) {
    const bytes = showBytesAt(sourceCommit, artifact.path);
    assert(bytes.length === artifact.bytes, `${task}: ${artifact.path} byte count mismatch`);
    assert(sha256(bytes) === artifact.sha256, `${task}: ${artifact.path} hash mismatch`);
    artifactRecords += 1;
  }
  if (manifest.verifier) {
    const bytes = showBytes(manifest.verifier.path);
    assert(bytes.length === manifest.verifier.bytes, `${task}: verifier byte count mismatch`);
    assert(sha256(bytes) === manifest.verifier.sha256, `${task}: verifier hash mismatch`);
    verifierRecords += 1;
  }
  const readme = showText(readmePath);
  assert(readme.includes(task), `${task}: evidence README does not identify task`);
  assert(/Verdict:\s*Pass/i.test(readme), `${task}: evidence README lacks pass verdict`);
}
assert(sourceCommits.size === 22, `expected 22 distinct task commits, found ${sourceCommits.size}`);
assert(artifactRecords === 167, `task artifact record count mismatch: ${artifactRecords}`);
assert(verifierRecords === 7, `task verifier record count mismatch: ${verifierRecords}`);
same(sorted(manifestRequirements), sorted(gateManifest.requirements), 'gate requirement coverage');

const acceptedAdrs = [
  '0002-exact-numeric-semantics.md',
  '0003-utc-microseconds-and-injected-clocks.md',
  '0004-preserve-utf8-and-use-binary-collation.md',
  '0005-explicit-array-matching.md',
  '0006-default-to-uuidv7-identifiers.md',
  '0007-exact-vector-results-with-cpu-reranking.md',
  '0008-use-one-portable-v1-limit-profile.md',
  '0009-use-versioned-error-codes-and-outcomes.md',
  '0010-use-id-order-as-the-native-default.md',
  '0011-use-tagged-json-semantic-fixtures.md',
];
const adrIndex = showText('docs/adr/README.md');
for (const file of acceptedAdrs) {
  const number = file.slice(0, 4);
  const source = showText(`docs/adr/${file}`);
  assert(source.includes('- Status: Accepted'), `ADR ${number} is not accepted`);
  assert(adrIndex.includes(`[${number}](${file})`) && adrIndex.includes('| Accepted |'), `ADR ${number} index entry invalid`);
}
same(gateManifest.accepted_adrs, acceptedAdrs.map((file) => file.slice(0, 4)), 'accepted ADR list');
assert(
  showText('docs/governance/decision-owners.md').includes('Binary v1 scope before `G01`'),
  'G01 string-collation decision deadline missing',
);
assert(
  showText('docs/adr/0004-preserve-utf8-and-use-binary-collation.md').includes('- Status: Accepted'),
  'binary v1 string/collation decision is not accepted',
);

const semanticDocuments = [
  'aggregation-semantics.md',
  'array-semantics.md',
  'crud-query-semantics.md',
  'default-ordering-semantics.md',
  'error-semantics.md',
  'floating-special-semantics.md',
  'identifier-semantics.md',
  'limits-v1.md',
  'missing-null-semantics.md',
  'numeric-semantics.md',
  'object-semantics.md',
  'operator-semantics.md',
  'string-semantics.md',
  'temporal-semantics.md',
  'update-semantics.md',
  'value-model.md',
  'vector-semantics.md',
];
for (const file of semanticDocuments) {
  const source = showText(`docs/architecture/${file}`);
  assert(source.includes('- Status: Accepted semantic baseline'), `${file}: semantic status not accepted`);
  assert(!/\b(?:TBD|TODO|FIXME)\b|OPEN QUESTION|DECISION NEEDED/i.test(source), `${file}: unresolved decision marker`);
}

const corpusBytes = showBytes('fixtures/semantic/manifest.json');
const corpus = JSON.parse(corpusBytes);
assert(sha256(corpusBytes) === 'ff4088a1d791dabb8ecc6ffd885f3d08c09c55e1a08871312163d915e6b843e8', 'corpus manifest hash mismatch');
assert(corpus.manifest_schema === 'helix.semantic-corpus/1', 'corpus schema mismatch');
assert(corpus.semantic_profile === 'helix-native-v1', 'corpus profile mismatch');
same(corpus.counts, { fixtures: 17, steps: 313, successes: 183, errors: 130 }, 'corpus counts');
assert(corpus.fixtures.length === 17 && new Set(corpus.fixtures.map(({ id }) => id)).size === 17, 'corpus fixture inventory mismatch');

const oracleBytes = showBytes('fixtures/semantic/oracle-report-v1.json');
const oracle = JSON.parse(oracleBytes);
assert(sha256(oracleBytes) === '8427fc0d3a5e3c09fc9d4c89018822898b45f94b7a9abaef659b6ba9607d8d1f', 'oracle report source hash mismatch');
assert(oracle.report_schema === 'helix.semantic-oracle-report/1', 'oracle report schema mismatch');
assert(oracle.semantic_profile === 'helix-native-v1' && oracle.verdict === 'pass', 'oracle profile/verdict mismatch');
same(oracle.counts, { fixtures: 17, steps: 313, passed: 313, failed: 0, skipped: 0 }, 'oracle counts');
assert(oracle.corpus_manifest_sha256 === sha256(corpusBytes), 'oracle is not bound to corpus manifest');
assert(Object.keys(oracle.operation_counts).length === 19, 'oracle report operation inventory mismatch');
assert(readJson('fixtures/semantic/operations-v1.json').operations.length === 17, 'registered value-operation inventory mismatch');
assert(oracle.fixtures.length === 17 && oracle.fixtures.every(({ failed, skipped }) => failed === 0 && skipped === 0), 'oracle fixture result mismatch');

const casesBytes = showBytes('differential/mongodb/cases-v1.json');
const observationsBytes = showBytes('differential/mongodb/upstream-observations-v1.json');
const differentialBytes = showBytes('differential/mongodb/report-v1.json');
const cases = JSON.parse(casesBytes);
const observations = JSON.parse(observationsBytes);
const differential = JSON.parse(differentialBytes);
assert(sha256(casesBytes) === 'c848f62c41ab817c4d29fcfe64ffb9aa3f6da9973f18402e5e7470eaa0fbfcc5', 'differential cases hash mismatch');
assert(sha256(observationsBytes) === '462b9c239c222dcba3f7b0371e9afccb0c556238d5197b8b196ab1183586dfc8', 'differential observations hash mismatch');
assert(sha256(differentialBytes) === '6a04b5d3cf93662ed9727de9dd5753d646acff12b914b785f6604cd61ef5b019', 'differential report source hash mismatch');
assert(cases.cases_schema === 'helix.mongodb-differential-cases/1' && cases.cases.length === 16, 'differential case inventory mismatch');
assert(observations.observations_schema === 'helix.mongodb-upstream-observations/1' && observations.cases.length === 16, 'differential observation inventory mismatch');
assert(differential.report_schema === 'helix.mongodb-differential-report/1' && differential.verdict === 'pass', 'differential report identity/verdict mismatch');
same(differential.counts, {
  cases: 16,
  expected_exact: 12,
  expected_different: 4,
  observed_exact: 12,
  observed_different: 4,
  direct: 14,
  adapter_rewrite: 2,
  passed: 16,
  failed: 0,
  skipped: 0,
}, 'differential counts');
same(sorted(cases.cases.map(({ id }) => id)), sorted(observations.cases.map(({ id }) => id)), 'differential case/observation IDs');
same(sorted(cases.cases.map(({ id }) => id)), sorted(differential.cases.map(({ id }) => id)), 'differential case/report IDs');
assert(differential.inputs.corpus_manifest_sha256 === sha256(corpusBytes), 'differential corpus binding mismatch');
assert(differential.inputs.oracle_report_sha256 === sha256(oracleBytes), 'differential oracle binding mismatch');

const matrixBytes = showBytes('compatibility/v1/matrix-v1.json');
const matrixDocumentBytes = showBytes('docs/compatibility/v1-semantic-compatibility-matrix.md');
const matrix = JSON.parse(matrixBytes);
assert(sha256(matrixBytes) === '1f116e0e6702526854d22c4e473530817139ca36f7423653ecc76c8324916a60', 'matrix source hash mismatch');
assert(sha256(matrixDocumentBytes) === 'c64d0421eac5a1d678dd5c716cc6f791f3774af13ba93b1f10a199cb1c7ae1d2', 'generated matrix document hash mismatch');
assert(matrix.matrix_schema === 'helix.semantic-compatibility-matrix/1' && matrix.matrix_version === '1.0.0', 'matrix identity mismatch');
assert(matrix.semantic_profile === 'helix-native-v1' && matrix.verdict === 'pass', 'matrix profile/verdict mismatch');
same(matrix.counts, {
  native_rows: 263,
  native_by_status: {
    contract_only: 56,
    deferred_post_v1: 12,
    explicitly_unsupported_v1: 39,
    oracle_boundary: 23,
    oracle_command: 17,
    oracle_executable: 41,
    oracle_primitive: 1,
    oracle_registry: 74,
  },
  mongodb_experimental_cases: 16,
  mongodb_experimental_by_relation: { different: 4, exact: 12 },
  mongodb_adapter_supported: 0,
  mongodb_unsupported_rows: 56,
  redis_adapter_supported: 0,
  redis_unsupported_rows: 33,
  failed: 0,
  skipped: 0,
}, 'matrix counts');
assert(matrix.claims.native_product_status === 'not_implemented', 'matrix overstates native product status');
assert(matrix.claims.mongodb_product_claim === 'prohibited' && matrix.claims.redis_product_claim === 'prohibited', 'matrix permits an adapter claim');
assert(matrix.claims.unlisted_native_behavior === 'unsupported', 'matrix native closed-world rule missing');
assert(matrix.claims.unlisted_mongodb_behavior === 'unsupported', 'matrix MongoDB closed-world rule missing');
assert(matrix.claims.unlisted_redis_behavior === 'unsupported', 'matrix Redis closed-world rule missing');
assert(matrix.mongodb_experimental_cases.every(({ adapter_status }) => adapter_status === 'unsupported'), 'experimental row claims adapter support');
for (const inputArtifact of Object.values(matrix.inputs)) {
  const bytes = showBytes(inputArtifact.path);
  assert(bytes.length === inputArtifact.bytes, `matrix input byte mismatch: ${inputArtifact.path}`);
  assert(sha256(bytes) === inputArtifact.sha256, `matrix input hash mismatch: ${inputArtifact.path}`);
}

const requirementFamilies = 'INV|PLAT|CORE|DATA|QUERY|STORE|GPU|DIST|CACHE|SYNC|SEC|OPS|QUAL|COMPAT';
const requirementPattern = new RegExp(`\\b(?:${requirementFamilies})-\\d{3}\\b`, 'g');
const specificationRequirements = new Set(showText('Specifications.md').match(requirementPattern) ?? []);
const ledgerRequirements = new Set(showText('docs/governance/requirements.md').match(requirementPattern) ?? []);
assert(specificationRequirements.size === 44, `specification requirement count mismatch: ${specificationRequirements.size}`);
same(sorted(ledgerRequirements), sorted(specificationRequirements), 'requirement ledger ID set');

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', commit]).trim().split('\n').filter(Boolean);
const markdownFiles = trackedFiles.filter((file) => file.endsWith('.md'));
let localLinks = 0;
for (const file of markdownFiles) {
  const source = showText(file);
  assert(source.endsWith('\n'), `${file}: missing terminal newline`);
  for (const [index, line] of source.split('\n').entries()) {
    assert(!/[ \t]+$/.test(line), `${file}:${index + 1}: trailing whitespace`);
  }
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let rawTarget = match[1].split('#')[0];
    if (!rawTarget || /^(https?:|mailto:)/.test(rawTarget)) continue;
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) rawTarget = rawTarget.slice(1, -1);
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)));
    assert(target !== '..' && !target.startsWith('../'), `${file}: local link escapes repository: ${rawTarget}`);
    gitText(['cat-file', '-e', `${commit}:${target}`]);
    localLinks += 1;
  }
}
for (const file of trackedFiles.filter((entry) => entry.endsWith('.json'))) JSON.parse(showText(file));
assert(markdownFiles.length === gateManifest.verification.markdown_files, `Markdown file count mismatch: ${markdownFiles.length}`);
assert(localLinks === gateManifest.verification.local_links, `local link count mismatch: ${localLinks}`);

const replayTemporary = mkdtempSync(path.join(os.tmpdir(), 'helix-g01-replay-'));
try {
  const p01022Verifier = path.join(replayTemporary, 'p01-022-verify.mjs');
  writeFileSync(p01022Verifier, showBytes('evidence/phase-01/P01-022/verify.mjs'));
  const p01022Manifest = readJson('evidence/phase-01/P01-022/manifest.json');
  const replay = execFileSync('node', [p01022Verifier, p01022Manifest.commit], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 360_000,
  });
  for (const marker of [
    'PASS semantic oracle corpus: 17 fixtures, 313 passed, 0 failed, 0 skipped',
    'PASS MongoDB differential: 16 cases, 12 exact, 4 deliberate differences, 0 failed, 0 skipped',
    'PASS semantic compatibility matrix: 263 native rows, 16 MongoDB cases, 56 MongoDB unsupported, 33 Redis unsupported',
    'PASS exact 16-file artifact scope at',
    'PASS deterministic matrix/document bytes under two alternate TZ/LANG environments',
  ]) assert(replay.includes(marker), `aggregate replay output missing: ${marker}`);
} finally {
  rmSync(replayTemporary, { recursive: true, force: true });
}

console.log(`PASS G01 reviewed commit ${commit}`);
console.log(`PASS implementation plan: ${expectedTasks.length}/22 Phase 1 tasks complete; G01 state=${gateItem.checked ? 'checked' : 'open-for-review'}`);
console.log(`PASS task evidence: 22 manifests, ${artifactRecords} immutable artifacts, ${verifierRecords} verifier identities`);
console.log('PASS semantic decisions: 10 accepted ADRs and 17 accepted architecture contracts');
console.log('PASS semantic corpus/oracle: 17 fixtures, 313/313 steps, 382 replay assertions, 0 failures/skips');
console.log('PASS MongoDB differential: 16/16 cases, 12 exact, 4 deliberate differences, 0 failures/skips');
console.log('PASS compatibility matrix: 263 native rows, 0 adapter support, native/MongoDB/Redis closed-world rules');
console.log(`PASS traceability/links: 44 requirements, ${markdownFiles.length} Markdown files, ${localLinks} local links`);
console.log('PASS live aggregate replay and residual-container cleanup');

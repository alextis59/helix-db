#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const attemptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(attemptDirectory, '../../../../..');
const manifest = JSON.parse(readFileSync(path.join(attemptDirectory, 'manifest.json'), 'utf8'));
const reviewedArgument = process.argv[2];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};
const same = (actual, expected, label) => {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (arguments_) =>
  execFileSync('git', arguments_, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (arguments_) => gitBytes(arguments_).toString('utf8');
const showBytes = (file, commit = manifest.reviewed_commit) =>
  gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.reviewed_commit) =>
  showBytes(file, commit).toString('utf8');

assert(
  reviewedArgument,
  'usage: node evidence/phase-02/G02/attempts/2026-07-11-hosted-evidence-missing/verify.mjs <reviewed-commit>',
);
assert(/^[0-9a-f]{40}$/.test(reviewedArgument), 'reviewed commit must be a full lowercase SHA-1');
assert(reviewedArgument === manifest.reviewed_commit, 'argument does not match reviewed commit');
assert(
  gitText(['rev-parse', `${reviewedArgument}^{commit}`]).trim() === reviewedArgument,
  'reviewed commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'attempt manifest schema mismatch');
assert(manifest.gate_id === 'G02', 'attempt gate mismatch');
assert(manifest.attempt_id === '2026-07-11-hosted-evidence-missing', 'attempt ID mismatch');
assert(
  gitText(['rev-parse', `${reviewedArgument}^{tree}`]).trim() === manifest.reviewed_tree,
  'reviewed tree mismatch',
);
assert(manifest.verdict === 'blocked', 'blocked attempt verdict mismatch');
assert(manifest.gate_checked === false, 'blocked attempt claims checked gate');

const plan = showText('ImplementationPlan.md');
const expectedTasks = Array.from(
  { length: 17 },
  (_, index) => `P02-${String(index + 1).padStart(3, '0')}`,
);
for (const task of expectedTasks) {
  assert(
    new RegExp(`^- \\[x\\] \\*\\*${task}\\*\\*`, 'm').test(plan),
    `${task}: not checked at reviewed commit`,
  );
}
assert(/^- \[ \] \*\*G02\*\*/m.test(plan), 'G02 is not open at reviewed commit');
const checkedItems = [...plan.matchAll(/^\s*- \[x\]/gm)].length;
const openItems = [...plan.matchAll(/^\s*- \[ \]/gm)].length;
assert(checkedItems === 58 && openItems === 464, 'reviewed plan counts');
assert(checkedItems + openItems === 522, 'reviewed plan total');

const requirementUnion = new Set();
const acceptedAdrs = new Set();
const sourceCommits = new Set();
let sourceArtifactRecords = 0;
let retainedArtifactRecords = 0;
let removedArtifactRecords = 0;
let producedArtifactRecords = 0;
let verifierRecords = 0;

for (const task of expectedTasks) {
  const evidenceRoot = `evidence/phase-02/${task}`;
  const taskManifest = JSON.parse(showText(`${evidenceRoot}/manifest.json`));
  assert(taskManifest.schema_version === 1, `${task}: manifest schema`);
  assert(taskManifest.task_id === task, `${task}: manifest task`);
  assert(taskManifest.verdict === 'pass', `${task}: manifest verdict`);
  assert(/^[0-9a-f]{40}$/.test(taskManifest.commit), `${task}: source commit`);
  const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', taskManifest.commit, reviewedArgument], {
    cwd: repository,
  });
  assert(ancestry.status === 0, `${task}: source commit is not reviewed ancestry`);
  sourceCommits.add(taskManifest.commit);
  for (const requirement of taskManifest.requirements) requirementUnion.add(requirement);
  for (const adr of taskManifest.accepted_adrs) acceptedAdrs.add(adr);

  const sourceArtifacts = taskManifest.artifacts ?? taskManifest.source_artifacts ?? [];
  sourceArtifactRecords += sourceArtifacts.length;
  for (const artifact of sourceArtifacts) {
    const bytes = showBytes(artifact.path, taskManifest.commit);
    assert(bytes.length === artifact.bytes, `${task}/${artifact.path}: source byte count`);
    assert(sha256(bytes) === artifact.sha256, `${task}/${artifact.path}: source SHA-256`);
  }

  const retainedArtifacts = taskManifest.retained_artifacts ?? [];
  retainedArtifactRecords += retainedArtifacts.length;
  for (const artifact of retainedArtifacts) {
    const bytes = showBytes(`${evidenceRoot}/${artifact.path}`);
    assert(bytes.length === artifact.bytes, `${task}/${artifact.path}: retained byte count`);
    assert(sha256(bytes) === artifact.sha256, `${task}/${artifact.path}: retained SHA-256`);
  }

  const removedArtifacts = taskManifest.removed_artifacts ?? taskManifest.deleted_artifacts ?? [];
  removedArtifactRecords += removedArtifacts.length;
  const removalBase =
    taskManifest.base_commit ?? gitText(['rev-parse', `${taskManifest.commit}^`]).trim();
  for (const artifact of removedArtifacts) {
    const bytes = showBytes(artifact.path, removalBase);
    assert(bytes.length === artifact.bytes, `${task}/${artifact.path}: removed byte count`);
    assert(sha256(bytes) === artifact.sha256, `${task}/${artifact.path}: removed SHA-256`);
  }

  const producedArtifacts = taskManifest.produced_artifacts ?? [];
  producedArtifactRecords += producedArtifacts.length;
  for (const artifact of producedArtifacts) {
    assert(artifact.bytes > 0, `${task}/${artifact.path}: produced byte count`);
    assert(/^[0-9a-f]{64}$/.test(artifact.sha256), `${task}/${artifact.path}: produced SHA-256`);
  }

  const verifierPath = taskManifest.verifier.path.startsWith('evidence/')
    ? taskManifest.verifier.path
    : `${evidenceRoot}/${taskManifest.verifier.path}`;
  const verifier = showBytes(verifierPath);
  assert(verifier.length === taskManifest.verifier.bytes, `${task}: verifier byte count`);
  assert(sha256(verifier) === taskManifest.verifier.sha256, `${task}: verifier SHA-256`);
  verifierRecords += 1;
}

same(
  [...requirementUnion].sort(),
  [
    'COMPAT-001',
    'CORE-001',
    'CORE-003',
    'INV-001',
    'INV-003',
    'INV-004',
    'INV-006',
    'INV-007',
    'INV-009',
    'INV-010',
    'PLAT-001',
    'PLAT-002',
    'PLAT-003',
    'QUAL-001',
    'QUAL-002',
    'SEC-001',
    'SEC-002',
  ],
  'Phase 2 requirement union',
);
same([...acceptedAdrs], ['0001'], 'Phase 2 accepted ADRs');
assert(sourceCommits.size === 17, `distinct task source commits: ${sourceCommits.size}`);
assert(sourceArtifactRecords === 439, `source artifact records: ${sourceArtifactRecords}`);
assert(retainedArtifactRecords === 21, `retained artifact records: ${retainedArtifactRecords}`);
assert(removedArtifactRecords === 4, `removed artifact records: ${removedArtifactRecords}`);
assert(producedArtifactRecords === 5, `produced artifact records: ${producedArtifactRecords}`);
assert(verifierRecords === 17, `verifier records: ${verifierRecords}`);

const matrixBytes = showBytes('.github/ci/matrix.json');
const matrix = JSON.parse(matrixBytes);
assert(matrix.schema === 'helix.ci-matrix/3', 'current CI matrix schema');
same(
  matrix.plan_items,
  [
    'P02-009',
    'P02-010',
    'P02-011',
    'P02-012',
    'P02-013',
    'P02-014',
    'P02-015',
    'P02-016',
    'P02-017',
  ],
  'current CI task history',
);
assert(Object.values(matrix.gating).flat().length === 11, 'current gating lane count');
assert(matrix.nightly.native.length === 2, 'current nightly lane count');
assert(matrix.observational.benchmark.length === 1, 'current observational lane count');

const bootstrap = JSON.parse(showText('docs/development/bootstrap.json'));
assert(bootstrap.schema === 'helix.clean-bootstrap/1', 'bootstrap schema');
assert(bootstrap.plan_item === 'P02-017', 'bootstrap task');
assert(bootstrap.profiles.length === 4, 'bootstrap profile count');
assert(bootstrap.troubleshooting.length === 17, 'bootstrap troubleshooting count');
assert(bootstrap.repository.development_name === 'HelixDB', 'development name');
assert(bootstrap.repository.public_name_decision === 'P16-016', 'public-name decision');

const dependencyManifest = JSON.parse(showText('evidence/phase-02/P02-012/manifest.json'));
same(
  dependencyManifest.retained_artifacts.map(({ path: artifactPath }) => artifactPath),
  [
    'reports/inventory-report.json',
    'reports/npm-audit.json',
    'reports/npm-license-refresh.json',
    'reports/npm-signatures.json.gz.b64',
    'reports/observation-report.json',
  ],
  'dependency gate reports',
);
const dependencyObservation = JSON.parse(
  showText('evidence/phase-02/P02-012/reports/observation-report.json'),
);
assert(dependencyObservation.verdict === 'pass', 'dependency observation verdict');
assert(dependencyObservation.npm.audit.vulnerabilities.total === 0, 'dependency vulnerability count');
assert(
  dependencyObservation.npm.provenance.registry_signatures_missing === 0,
  'dependency missing signature count',
);
assert(
  dependencyObservation.npm.provenance.registry_signatures_invalid === 0,
  'dependency invalid signature count',
);

const browserReport = JSON.parse(
  showText('evidence/phase-02/P02-016/reports/browser-execution-all.json'),
);
assert(browserReport.verdict === 'pass', 'retained browser execution verdict');
same(
  browserReport.browser_identities.map(({ engine }) => engine),
  ['chromium', 'firefox', 'webkit'],
  'retained browser engines',
);
const nativeReport = JSON.parse(
  showText('evidence/phase-02/P02-016/reports/native-toolchain-example.json'),
);
assert(nativeReport.database_functionality === false, 'native example database claim');
same(nativeReport.operations, [], 'native example operations');

const replayReport = JSON.parse(
  showText('evidence/phase-02/P02-017/reports/documented-command-replay.json'),
);
assert(replayReport.verdict === 'pass', 'documented command replay verdict');
same(
  replayReport.profiles.map(({ id }) => id),
  ['contract', 'foundation', 'browser', 'linux-x64-gates'],
  'documented replay profiles',
);
assert(replayReport.additional_checks.hosted_workflow_execution === false, 'replay hosted claim');

const policy = showText('docs/architecture/continuous-integration.md');
assert(
  policy.includes(
    'the first hosted green results and independent review remain required inputs to `G02`',
  ),
  'G02 hosted-evidence policy marker',
);

const remoteArtifact = manifest.retained_artifacts[0];
assert(remoteArtifact.path === 'remote-state.json', 'remote observation path');
const remoteBytes = readFileSync(path.join(attemptDirectory, remoteArtifact.path));
assert(remoteBytes.length === remoteArtifact.bytes, 'remote observation byte count');
assert(sha256(remoteBytes) === remoteArtifact.sha256, 'remote observation SHA-256');
const remote = JSON.parse(remoteBytes);
assert(remote.schema === 'helix.gate-remote-observation/1', 'remote observation schema');
assert(remote.gate === 'G02', 'remote observation gate');
assert(remote.reviewed_commit === reviewedArgument, 'remote reviewed commit');
assert(remote.reviewed_tree === manifest.reviewed_tree, 'remote reviewed tree');
assert(remote.origin_main.sha === '1b95c8a5c93c76f1e79e08b8112ae5fcf831df83', 'remote main SHA');
assert(remote.origin_main.ahead_by === 103 && remote.origin_main.behind_by === 0, 'remote divergence');
assert(remote.origin_main.protected === false, 'remote protection observation');
same(remote.origin_main.required_checks, [], 'remote required checks');
same(remote.workflow_runs, [], 'remote workflow run inventory');
assert(remote.push_authorized === false, 'remote push authorization observation');
assert(remote.hosted_green_for_reviewed_commit === false, 'remote hosted green observation');
assert(remote.verdict === 'hosted-evidence-missing', 'remote observation verdict');
assert(
  gitText(['rev-list', '--count', `${remote.origin_main.sha}..${reviewedArgument}`]).trim() === '103',
  'historical remote-to-reviewed commit count',
);
assert(
  gitText(['rev-list', '--count', `${reviewedArgument}..${remote.origin_main.sha}`]).trim() === '0',
  'historical reviewed-to-remote commit count',
);

const review = readFileSync(path.join(attemptDirectory, manifest.review), 'utf8');
for (const marker of [
  'Verdict: Blocked',
  'G02-F01 — No hosted workflow run exists for the reviewed commit',
  'G02-F02 — Remote main has no protection or required checks',
  'G02-F03 — Hosted artifact service and non-Linux native runners remain unobserved',
  'The gate must remain unchecked',
]) {
  assert(review.includes(marker), `review marker absent: ${marker}`);
}

const specificationRequirements = new Set(
  showText('Specifications.md').match(/\b(?:INV|PLAT|CORE|DATA|QUERY|STORE|GPU|DIST|CACHE|SYNC|SEC|OPS|QUAL|COMPAT)-\d{3}\b/g) ?? [],
);
const ledgerRequirements = new Set(
  showText('docs/governance/requirements.md').match(/\b(?:INV|PLAT|CORE|DATA|QUERY|STORE|GPU|DIST|CACHE|SYNC|SEC|OPS|QUAL|COMPAT)-\d{3}\b/g) ?? [],
);
assert(specificationRequirements.size === 44, 'specification requirement count');
same([...ledgerRequirements].sort(), [...specificationRequirements].sort(), 'requirement ledger IDs');

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', reviewedArgument])
  .trim()
  .split('\n')
  .filter(Boolean);
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
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)),
    );
    assert(
      target !== '..' && !target.startsWith('../'),
      `${file}: local link escapes repository: ${rawTarget}`,
    );
    gitText(['cat-file', '-e', `${reviewedArgument}:${target}`]);
    localLinks += 1;
  }
}
assert(markdownFiles.length === 157, `reviewed Markdown count: ${markdownFiles.length}`);
assert(localLinks === 1069, `reviewed local-link count: ${localLinks}`);

const workflowCheck = spawnSync(
  'python3',
  [
    '-c',
    [
      'import json, subprocess, yaml',
      `commit="${reviewedArgument}"`,
      'paths=[".github/workflows/benchmark-baseline.yml",".github/workflows/ci-nightly.yml",".github/workflows/ci.yml"]',
      'docs=[yaml.safe_load(subprocess.check_output(["git","show",f"{commit}:{path}"],text=True)) for path in paths]',
      'print(json.dumps({"files":len(paths),"jobs":sum(len(doc["jobs"]) for doc in docs),"steps":sum(len(job.get("steps",[])) for doc in docs for job in doc["jobs"].values())}))',
    ].join(';'),
  ],
  { cwd: repository, encoding: 'utf8' },
);
assert(workflowCheck.status === 0, `workflow parse failed: ${workflowCheck.stderr}`);
same(JSON.parse(workflowCheck.stdout), { files: 3, jobs: 9, steps: 56 }, 'workflow inventory');

const p02017Manifest = JSON.parse(showText('evidence/phase-02/P02-017/manifest.json'));
const aggregateReplay = execFileSync(
  'node',
  [path.join(repository, 'evidence/phase-02/P02-017/verify.mjs'), p02017Manifest.commit],
  {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    timeout: 1_200_000,
  },
);
for (const marker of [
  'PASS exact 19-path P02-017 source scope',
  'PASS exact replay: Node 22.23.1 and 24.18.0 clean installs/preflights/foundation profiles',
  'PASS local boundary profiles: native example, 3 real browsers, Wasm, coverage, ASan, and WGSL',
  'PASS rejection: 35 source canaries plus 17 isolated evidence mutations with clean restoration',
]) {
  assert(aggregateReplay.includes(marker), `aggregate replay marker absent: ${marker}`);
}

const verifierBytes = readFileSync(path.join(attemptDirectory, 'verify.mjs'));
assert(statSync(path.join(attemptDirectory, 'verify.mjs')).size === manifest.verifier.bytes, 'verifier bytes');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256');
same(
  manifest.verification,
  {
    implementation_plan_items: 522,
    phase_02_tasks: 17,
    distinct_source_commits: 17,
    source_artifact_records: 439,
    retained_artifact_records: 21,
    produced_artifact_records: 5,
    removed_artifact_records: 4,
    verifier_records: 17,
    accepted_adrs: 1,
    gate_requirements: 17,
    gating_lanes: 11,
    nightly_native_lanes: 2,
    observational_lanes: 1,
    bootstrap_profiles: 4,
    troubleshooting_codes: 17,
    node_lanes: 2,
    native_tests: 9,
    browser_engines: 3,
    workflow_files: 3,
    workflow_jobs: 9,
    workflow_steps: 56,
    markdown_files: 157,
    local_links: 1069,
    specification_requirements: 44,
    hosted_workflow_runs: 0,
    blocking_findings: 2,
    gate_checked: false,
  },
  'attempt verification summary',
);

process.stdout.write(`PASS G02 blocked review commit ${reviewedArgument}\n`);
process.stdout.write(
  'PASS task evidence: 17 manifests, 439 source artifacts, 21 retained reports, 17 verifiers\n',
);
process.stdout.write(
  'PASS local gate inputs: clean replay, CI source matrix, dependencies, native/Wasm/3-browser artifacts\n',
);
process.stdout.write(
  'PASS aggregate replay: exact Node lines, native/browser, Wasm, coverage, ASan, WGSL, canaries\n',
);
process.stdout.write(
  'BLOCKED G02: 0 hosted workflow runs; reviewed main is 103 commits ahead of remote main\n',
);
process.stdout.write('PASS checklist discipline: G02 remains open and the blocked attempt is preserved\n');

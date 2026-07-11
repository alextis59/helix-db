#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const showText = (file) => gitText(['show', `${manifest.commit}:${file}`]);
const showJson = (file) => JSON.parse(showText(file));

assert(argument, 'usage: node evidence/phase-03/P03-017/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P03-017' && manifest.verdict === 'pass', 'evidence verdict');
assert(gitText(['rev-parse', `${argument}^{commit}`]).trim() === argument, 'source commit');
assert(gitText(['rev-parse', `${argument}^`]).trim() === manifest.base_commit, 'source parent');
assert(gitText(['rev-parse', `${argument}^{tree}`]).trim() === manifest.source_tree, 'source tree');

const expectedChanges = [
  'M\t.github/ci/matrix.json',
  'M\tCargo.toml',
  'M\tSpecifications.md',
  'M\tStudy.md',
  'M\tcompatibility/v1/matrix-v1.json',
  'M\tcrates/helix-doc/Cargo.toml',
  'A\tcrates/helix-doc/examples/hdoc_v1_oracle.rs',
  'M\tdocs/adr/0012-use-bounded-little-endian-hdoc-v1.md',
  'M\tdocs/adr/README.md',
  'M\tdocs/architecture/continuous-integration.md',
  'M\tdocs/architecture/workspace-boundaries.md',
  'M\tdocs/compatibility/v1-semantic-compatibility-matrix.md',
  'M\tdocs/formats/README.md',
  'M\tdocs/formats/hdoc-v1-integrity.md',
  'M\tdocs/formats/hdoc-v1-tagged-json.md',
  'M\tdocs/formats/hdoc-v1.md',
  'M\tdocs/governance/decision-owners.md',
  'M\tdocs/quality/code-coverage-policy.md',
  'M\tdocs/quality/test-command-surface.md',
  'M\tfixtures/hdoc/v1/README.md',
  'M\ttests/integration/README.md',
  'A\ttests/integration/hdoc-cross-language.test.ts',
  'A\ttests/integration/hdoc-reader.ts',
  'M\ttests/run-suite.mjs',
  'M\ttests/suites.json',
  'M\ttests/toolchain/bootstrap-contract.mjs',
  'M\ttests/toolchain/check-ci-matrix.mjs',
  'M\ttests/toolchain/check-rust-coverage.mjs',
  'M\ttests/toolchain/check-test-command-surface.mjs',
  'M\ttests/toolchain/rust-coverage-policy.json',
  'A\ttsconfig.integration.json',
  'M\ttsconfig.json',
  'M\ttsconfig.tools.json',
  'A\tvitest.integration.config.ts',
];
const actualChanges = gitText(['diff-tree', '--no-commit-id', '--name-status', '-r', argument])
  .trim()
  .split('\n');
assert(JSON.stringify(actualChanges) === JSON.stringify(expectedChanges), 'source diff inventory');
assert(
  sha256(gitBytes(['diff', '--binary', manifest.base_commit, argument])) === manifest.diff_sha256,
  'source diff hash',
);

const verifierPath = fileURLToPath(import.meta.url);
const verifier = readFileSync(verifierPath);
assert(statSync(verifierPath).size === manifest.verifier.bytes, 'verifier bytes');
assert(sha256(verifier) === manifest.verifier.sha256, 'verifier hash');

const root = showText('Cargo.toml');
const crate = showText('crates/helix-doc/Cargo.toml');
const oracle = showText('crates/helix-doc/examples/hdoc_v1_oracle.rs');
const reader = showText('tests/integration/hdoc-reader.ts');
const parity = showText('tests/integration/hdoc-cross-language.test.ts');
const runner = showText('tests/run-suite.mjs');
const suites = showJson('tests/suites.json');
const matrix = showJson('.github/ci/matrix.json');
const coverage = showJson('tests/toolchain/rust-coverage-policy.json');
const golden = showJson('fixtures/hdoc/v1/manifest.json');
const specifications = showText('Specifications.md');
const study = showText('Study.md');

const validateContract = (
  candidateRoot = root,
  candidateCrate = crate,
  candidateOracle = oracle,
  candidateReader = reader,
  candidateParity = parity,
  candidateRunner = runner,
  candidateSuites = suites,
  candidateMatrix = matrix,
  candidateCoverage = coverage,
) => {
  assert(candidateRoot.includes('plan-item = "P03-017"'), 'root task maturity');
  assert(candidateRoot.includes('status = "hdoc-cross-language-v1"'), 'root status maturity');
  assert(candidateCrate.includes('status = "hdoc-cross-language-v1"'), 'crate status maturity');
  for (const id of [
    'positive-minimal',
    'positive-all-types-nested',
    'positive-boundary-values',
    'positive-compression-profile-1',
  ]) {
    assert(candidateOracle.includes(`"${id}"`), `Rust oracle case ${id}`);
  }
  assert(candidateOracle.includes('helix_doc::decode'), 'production Rust decoder boundary');
  assert(candidateOracle.includes('to_canonical_tagged_json'), 'Rust logical-value boundary');
  for (const marker of [
    'const crc32c =',
    'const decompressLz4Block =',
    'const decompressSection =',
    'const blake3 =',
    'const frameHash =',
    'const decimalValue =',
    'const scalarValue =',
    'export const readHDoc =',
    "fail('typed content hash mismatch')",
  ]) {
    assert(candidateReader.includes(marker), `independent TypeScript marker ${marker}`);
  }
  assert(!candidateReader.includes('helix_doc'), 'TypeScript reader imports no Rust implementation');
  assert(!candidateReader.includes('manifest.json'), 'TypeScript reader trusts no fixture manifest');
  assert(candidateParity.includes('expect(readHDoc(bytes)).toEqual'), 'complete parity assertion');
  assert(candidateParity.includes('contentHashHex: rust.contentHashHex'), 'hash parity assertion');
  assert(candidateParity.includes('logicalValue: rust.logicalValue'), 'logical parity assertion');
  assert(candidateRunner.includes("'hdoc-cross-language': executeHDocCrossLanguage"), 'runner step');
  const integration = candidateSuites.suites.find(({ id }) => id === 'integration');
  assert(integration?.state === 'active', 'integration suite activation');
  assert(integration?.activation_tasks.length === 0, 'integration activation ownership cleared');
  assert(integration?.expectations.golden_vectors === 4, 'integration golden count');
  assert(integration?.expectations.test_cases === 5, 'integration test count');
  assert(candidateMatrix.plan_items.at(-1) === 'P03-017', 'CI task history');
  assert(
    candidateCoverage.active_product_scope.allowed_status === 'hdoc-cross-language-v1',
    'coverage maturity',
  );
};
validateContract();

assert(golden.cases.filter(({ kind }) => kind === 'positive').length === 4, 'golden positives');
assert(specifications.includes('recomputed typed hashes for all positive fixtures'), 'specification binding');
assert(study.includes('genuinely independent TypeScript byte reader'), 'study binding');

const integrationOutput = execFileSync(
  'corepack',
  ['npm', 'run', 'test:integration'],
  {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
    maxBuffer: 64 * 1024 * 1024,
  },
);
assert(integrationOutput.includes('Tests  5 passed (5)'), 'five integration tests pass');
assert(integrationOutput.includes('PASS suite integration'), 'integration suite pass marker');

const mutations = [
  [() => validateContract(root.replace('P03-017', 'P03-016')), 'root task'],
  [() => validateContract(root, crate.replace('hdoc-cross-language-v1', 'hdoc-golden-v1')), 'crate status'],
  [() => validateContract(root, crate, oracle.replace('helix_doc::decode', 'legacy::decode')), 'Rust decoder'],
  [() => validateContract(root, crate, oracle, reader.replace('const crc32c =', 'const crc =')), 'CRC'],
  [() => validateContract(root, crate, oracle, reader.replace('const blake3 =', 'const digest =')), 'BLAKE3'],
  [() => validateContract(root, crate, oracle, reader, parity.replace('logicalValue: rust.logicalValue', 'logicalValue: {}')), 'logical parity'],
  [() => validateContract(root, crate, oracle, reader, parity, runner.replace("'hdoc-cross-language': executeHDocCrossLanguage", "'hdoc-cross-language': undefined")), 'runner'],
  [() => validateContract(root, crate, oracle, reader, parity, runner, { ...suites, suites: suites.suites.map((suite) => suite.id === 'integration' ? { ...suite, state: 'reserved' } : suite) }), 'activation'],
  [() => validateContract(root, crate, oracle, reader, parity, runner, suites, { ...matrix, plan_items: matrix.plan_items.slice(0, -1) }), 'CI history'],
  [() => validateContract(root, crate, oracle, reader, parity, runner, suites, matrix, { ...coverage, active_product_scope: { ...coverage.active_product_scope, allowed_status: 'hdoc-golden-v1' } }), 'coverage maturity'],
];
for (const [mutate, label] of mutations) {
  let rejected = false;
  try {
    mutate();
  } catch {
    rejected = true;
  }
  assert(rejected, `mutation canary passed: ${label}`);
}

process.stdout.write(
  'PASS P03-017 source: 34 artifacts bind the independent TypeScript and production Rust readers\n',
);
process.stdout.write(
  'PASS P03-017 parity: 4 complete logical values and independently recomputed hashes agree\n',
);
process.stdout.write('PASS P03-017 activation: 5 integration tests and 10 mutation canaries\n');

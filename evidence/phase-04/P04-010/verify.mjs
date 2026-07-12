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
const same = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (args) => execFileSync('git', args, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (args) => gitBytes(args).toString('utf8');
const showBytes = (file) => gitBytes(['show', `${manifest.commit}:${file}`]);
const showText = (file) => showBytes(file).toString('utf8');
const showJson = (file) => JSON.parse(showText(file));

assert(argument, 'usage: node evidence/phase-04/P04-010/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P04-010' && manifest.verdict === 'pass', 'evidence verdict');
same(manifest.requirements, [
  'CORE-001', 'CORE-002', 'CORE-003', 'INV-004', 'INV-007', 'PLAT-001', 'PLAT-002',
  'QUAL-001', 'SEC-001', 'SEC-002',
], 'requirements');
same(manifest.accepted_adrs, ['0003', '0006', '0013'], 'accepted ADRs');
assert(gitText(['rev-parse', `${argument}^{commit}`]).trim() === argument, 'source commit');
assert(gitText(['rev-parse', `${argument}^`]).trim() === manifest.base_commit, 'source parent');
assert(gitText(['rev-parse', `${argument}^{tree}`]).trim() === manifest.source_tree, 'source tree');
const changes = gitText(['diff-tree', '--no-commit-id', '--name-only', '-r', argument]).trim().split('\n');
assert(changes.length === manifest.verification.source_artifacts, 'source artifact count');
assert(sha256(gitBytes(['diff', '--binary', manifest.base_commit, argument])) === manifest.diff_sha256, 'source diff hash');

const verifierPath = fileURLToPath(import.meta.url);
const verifier = readFileSync(verifierPath);
assert(statSync(verifierPath).size === manifest.verifier.bytes, 'verifier bytes');
assert(sha256(verifier) === manifest.verifier.sha256, 'verifier hash');
for (const authority of manifest.authorities) {
  const bytes = showBytes(authority.path);
  assert(bytes.length === authority.bytes, `${authority.path}: bytes`);
  assert(sha256(bytes) === authority.sha256, `${authority.path}: hash`);
}

const policy = showJson('docs/architecture/mock-host-contract-v1.json');
assert(policy.schema === 'helix.mock-host-contract/1' && policy.plan_item === 'P04-010', 'policy identity');
assert(policy.abi.package === 'helix:core-abi@7.0.0' && policy.abi.immutable, 'ABI pin');
assert(policy.calls.length === 21 && new Set(policy.calls).size === 21, 'call inventory');
same(policy.bounds, {
  maximum_failure_rules: 4096,
  maximum_call_records: 16384,
  maximum_batch_requests: 1024,
  maximum_file_bytes: 16777216,
  maximum_path_bytes: 4096,
}, 'bounds');
assert(policy.failure_injection.selector === 'call-kind-plus-one-based-occurrence', 'selector');
assert(policy.failure_injection.duplicate_selectors_rejected, 'duplicate selectors');
assert(policy.failure_injection.failure_occurrence_is_recorded, 'failure record');
assert(policy.behavior.write_rename_delete_batches_are_failure_atomic, 'storage atomicity');
assert(policy.behavior.clock_and_random_inputs_use_exact_deterministic_queues, 'input queues');
assert(policy.behavior.ambient_discovery_present === false, 'ambient discovery');
assert(Object.values(policy.lifecycle).every((value) => value === true), 'lifecycle policy');
for (const key of [
  'component_binding_present', 'native_host_present', 'browser_host_present',
  'real_durability_present', 'gpu_execution_present', 'database_functionality_added',
]) assert(policy.claim_boundary[key] === false, `${key} claim`);

const source = showText('crates/helix-host-mock/src/lib.rs');
for (const marker of [
  'pub const ALL_CAPABILITY_CALLS: [CapabilityCall; 21] = [',
  'pub struct FailureRule {',
  'pub struct CallRecord {',
  'let mut candidate = self.files.clone();',
  'MockLifecycle::Stopped if call != CapabilityCall::Lifecycle',
  'every_imported_call_kind_accepts_failure_injection',
]) assert(source.includes(marker), `source marker ${marker}`);
for (const forbidden of ['std::fs', 'std::time', 'std::net', 'std::thread', 'getrandom', 'unsafe {']) {
  assert(!source.includes(forbidden), `ambient source marker ${forbidden}`);
}

const root = showText('Cargo.toml');
const matrix = showJson('.github/ci/matrix.json');
const workflow = showText('.github/workflows/ci.yml');
assert(root.includes('plan-item = "P04-010"') && root.includes('status = "mock-host-v1"'), 'workspace maturity');
assert(root.includes('"crates/helix-host-mock"'), 'workspace member');
assert(matrix.plan_items.at(-1) === 'P04-010', 'CI task history');
assert(workflow.includes('corepack npm run host:mock:check'), 'hosted check');
assert(workflow.includes('corepack npm run host:mock:test'), 'hosted canaries');

const check = execFileSync('node', ['tests/toolchain/check-mock-host-contract.mjs'], {
  cwd: repository, encoding: 'utf8',
});
assert(check.includes('all 21 ABI 7 host calls modeled and bounded'), 'live check');
const canaries = execFileSync('node', ['tests/toolchain/test-mock-host-contract.mjs'], {
  cwd: repository, encoding: 'utf8',
});
assert(canaries.includes('60 mutations rejected'), 'live canaries');

process.stdout.write('PASS P04-010 source: 36 artifacts add the deterministic mock host\n');
process.stdout.write('PASS P04-010 calls: all 21 ABI 7 host imports modeled and recorded\n');
process.stdout.write('PASS P04-010 failures: exact occurrence injection and lifecycle precedence\n');
process.stdout.write('PASS P04-010 boundary: no component, platform, durability, GPU, or database claim\n');
process.stdout.write('PASS P04-010 canaries: 60 intended mutations rejected\n');

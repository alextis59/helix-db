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
const gitBytes = (args) =>
  execFileSync('git', args, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (args) => gitBytes(args).toString('utf8');
const showBytes = (file) => gitBytes(['show', `${manifest.commit}:${file}`]);
const showText = (file) => showBytes(file).toString('utf8');
const showJson = (file) => JSON.parse(showText(file));

assert(argument, 'usage: node evidence/phase-04/P04-009/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P04-009' && manifest.verdict === 'pass', 'evidence verdict');
same(
  manifest.requirements,
  ['CORE-001', 'CORE-002', 'CORE-003', 'INV-004', 'INV-007', 'PLAT-001', 'PLAT-002', 'SEC-001', 'SEC-002'],
  'requirements',
);
same(manifest.accepted_adrs, ['0003', '0006', '0013'], 'accepted ADRs');
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
for (const authority of manifest.authorities) {
  const bytes = showBytes(authority.path);
  assert(bytes.length === authority.bytes, `${authority.path}: bytes`);
  assert(sha256(bytes) === authority.sha256, `${authority.path}: hash`);
}

const policy = showJson('docs/architecture/deterministic-injection-contract-v1.json');
assert(policy.schema === 'helix.deterministic-injection-contract/1', 'policy schema');
assert(policy.plan_item === 'P04-009', 'policy owner');
assert(policy.base.package === 'helix:core-abi@6.0.0' && policy.base.immutable, 'immutable base');
assert(policy.current.package === 'helix:core-abi@7.0.0', 'current ABI');
same(policy.current.accepted, [{ major: 7, minor: 0 }], 'accepted ABI');
same(policy.clocks.roles, ['wall-time-utc', 'monotonic', 'mvcc', 'logical-expiry'], 'clock roles');
same(
  policy.randomness.purposes,
  ['request-id', 'transaction-id', 'uuid-v7', 'object-id', 'nonce', 'sampling'],
  'random purposes',
);
assert(policy.clocks.consumption_is_exact_and_ordered, 'clock consumption');
assert(policy.clocks.mismatches_fail_without_consumption, 'clock atomicity');
assert(policy.clocks.wall_monotonic_mvcc_and_expiry_are_not_interchangeable, 'clock separation');
assert(policy.randomness.weak_fallback_forbidden, 'weak randomness');
assert(policy.randomness.replay_retry_replication_restore_never_regenerate_ids, 'ID replay');
assert(policy.bounds.maximum_memory_budget_bytes === 4_294_967_296, 'memory bound');
assert(policy.bounds.maximum_memory_allocations === 1_048_576, 'allocation bound');
same(policy.memory.classes, ['scratch', 'result'], 'memory classes');
assert(policy.memory.reservations_are_fail_before_mutation, 'reservation atomicity');
assert(policy.memory.release_requires_exact_live_accounting, 'release accounting');
same(policy.device.classes, ['cpu-only', 'cpu-and-gpu'], 'device classes');
assert(policy.device.host_unique_identifiers_forbidden, 'device redaction');
assert(policy.device.document_or_tenant_content_forbidden, 'content redaction');
assert(policy.device.may_not_change_semantic_results, 'device semantics');
assert(policy.reference_model.ambient_discovery_present === false, 'ambient discovery');
assert(policy.claim_boundary.deterministic_value_operations_defined, 'injection claim');
assert(policy.claim_boundary.numeric_memory_budgets_defined, 'budget claim');
for (const key of [
  'operation_bindings_present', 'host_implementations_present', 'gpu_execution_present',
  'identifier_generation_implemented', 'database_functionality_added',
]) assert(policy.claim_boundary[key] === false, `${key} claim`);

const wit = showText('wit/helix-core-abi-v7/world.wit');
for (const marker of [
  'package helix:core-abi@7.0.0;',
  'record memory-budget {',
  'record device-profile {',
  'read-clock: async func(',
  'read-random: async func(',
  'capture-execution-profile: func() -> result<execution-profile, helix-error>;',
]) assert(wit.includes(marker), `WIT marker ${marker}`);

const source = showText('crates/helix-core/src/deterministic_inputs.rs');
for (const marker of [
  'pub const MAXIMUM_CLOCK_SAMPLES: usize = 1024;',
  'pub const MAXIMUM_RANDOM_BYTES: usize = 65_536;',
  'pub const MAXIMUM_MEMORY_BUDGET_BYTES: u64 = 4_294_967_296;',
  'pub struct DeterministicInputs {',
  'pub struct AllocationId {',
  'ledger_id: u64,',
  'pub struct MemoryLedger {',
  '.position(|record| record.id == id)',
  'pub struct DeviceProfile {',
]) assert(source.includes(marker), `source marker ${marker}`);
for (const forbidden of ['std::time', 'getrandom', 'thread_rng', 'navigator.gpu', 'unsafe {']) {
  assert(!source.includes(forbidden), `ambient source marker ${forbidden}`);
}

const root = showText('Cargo.toml');
const matrix = showJson('.github/ci/matrix.json');
const workflow = showText('.github/workflows/ci.yml');
assert(
  root.includes('plan-item = "P04-009"') &&
    root.includes('status = "deterministic-injection-contract-v1"'),
  'workspace maturity',
);
assert(matrix.plan_items.at(-1) === 'P04-009', 'CI task history');
assert(workflow.includes('corepack npm run inputs:deterministic:check'), 'hosted check');
assert(workflow.includes('corepack npm run inputs:deterministic:test'), 'hosted canaries');

const check = execFileSync('node', ['tests/toolchain/check-deterministic-injection-contract.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(check.includes('exact ABI 7.0, 4 clocks, 6 random purposes'), 'live check');
const canaries = execFileSync(
  'node', ['tests/toolchain/test-deterministic-injection-contract.mjs'],
  { cwd: repository, encoding: 'utf8' },
);
assert(canaries.includes('64 mutations rejected'), 'live canaries');

process.stdout.write('PASS P04-009 source: 42 artifacts define exact ABI 7.0 injection\n');
process.stdout.write('PASS P04-009 inputs: 4 clock roles and 6 purpose-separated random streams\n');
process.stdout.write('PASS P04-009 budgets: 4 GiB envelope and ledger-bound exact releases\n');
process.stdout.write('PASS P04-009 boundary: no host, GPU, identifier-generator, or database claim\n');
process.stdout.write('PASS P04-009 canaries: 64 intended mutations rejected\n');

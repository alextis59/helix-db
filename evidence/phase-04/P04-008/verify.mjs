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

assert(argument, 'usage: node evidence/phase-04/P04-008/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P04-008' && manifest.verdict === 'pass', 'evidence verdict');
same(
  manifest.requirements,
  ['CORE-001', 'CORE-002', 'CORE-003', 'INV-004', 'INV-007', 'STORE-001', 'STORE-002', 'SEC-001', 'SEC-002'],
  'requirements',
);
same(manifest.accepted_adrs, ['0013'], 'accepted ADRs');
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

const policy = showJson('docs/architecture/async-completion-contract-v1.json');
assert(policy.schema === 'helix.async-completion-contract/1', 'policy schema');
assert(policy.plan_item === 'P04-008', 'policy owner');
assert(policy.base.package === 'helix:core-abi@5.0.0' && policy.base.immutable, 'immutable base');
assert(policy.current.package === 'helix:core-abi@6.0.0', 'current ABI');
same(policy.current.accepted, [{ major: 6, minor: 0 }], 'accepted ABI');
assert(policy.safe_points.length === 5, 'safe points');
same(
  policy.terminal_precedence_at_same_safe_point,
  ['host-stopped', 'host-draining-new-admission', 'cancelled', 'deadline-exceeded', 'backpressure'],
  'terminal precedence',
);
assert(policy.deadlines.wall_clock_forbidden, 'wall clock forbidden');
assert(policy.deadlines.expires_when_current_tick_greater_than_or_equal, 'deadline comparison');
assert(policy.cancellation.cooperative_only && policy.cancellation.never_implies_rollback, 'cancellation');
assert(policy.backpressure.rejection_occurs_before_dispatch, 'admission backpressure');
assert(policy.backpressure.admitted_work_not_retroactively_rejected, 'no retroactive rejection');
assert(policy.partial_io.read_retries_until_requested_length_or_eof, 'partial reads');
assert(policy.partial_io.write_retries_until_every_byte_written, 'partial writes');
assert(policy.partial_io.batch_retry_requires_same_idempotency_key, 'retry identity');
same(policy.shutdown.states, ['running', 'draining', 'stopped'], 'shutdown states');
assert(policy.shutdown.resources_drop_exactly_once, 'resource cleanup');
assert(Object.keys(policy.errors).length === 7, 'stable error count');
assert(policy.claim_boundary.completion_semantics_defined, 'completion claim');
for (const key of [
  'operation_bindings_present', 'host_implementations_present',
  'numeric_budgets_defined', 'database_functionality_added',
]) assert(policy.claim_boundary[key] === false, `${key} claim`);

const wit = showText('wit/helix-core-abi-v6/world.wit');
for (const marker of [
  'package helix:core-abi@6.0.0;',
  'record monotonic-deadline {',
  'enum host-lifecycle-state {',
  'deadline: option<monotonic-deadline>,',
  'lifecycle: func() -> host-lifecycle;',
]) assert(wit.includes(marker), `WIT marker ${marker}`);
const root = showText('Cargo.toml');
const matrix = showJson('.github/ci/matrix.json');
const workflow = showText('.github/workflows/ci.yml');
assert(
  root.includes('plan-item = "P04-008"') && root.includes('status = "async-completion-contract-v1"'),
  'workspace maturity',
);
assert(matrix.plan_items.at(-1) === 'P04-008', 'CI task history');
assert(workflow.includes('corepack npm run async:completion:check'), 'hosted check');
assert(workflow.includes('corepack npm run async:completion:test'), 'hosted canaries');

const check = execFileSync('node', ['tests/toolchain/check-async-completion-contract.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(check.includes('exact ABI 6.0, 5 safe points, 7 stable errors'), 'live check');
const canaries = execFileSync('node', ['tests/toolchain/test-async-completion-contract.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(canaries.includes('43 mutations rejected'), 'live canaries');

process.stdout.write('PASS P04-008 source: 39 artifacts define exact ABI 6.0 completion semantics\n');
process.stdout.write('PASS P04-008 ordering: 5 safe points and deterministic terminal precedence\n');
process.stdout.write('PASS P04-008 behavior: cancellation, deadline, backpressure, partial I/O, shutdown\n');
process.stdout.write('PASS P04-008 boundary: no host, numeric-budget, rollback, or database claim\n');
process.stdout.write('PASS P04-008 canaries: 43 intended mutations rejected\n');

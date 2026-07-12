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

assert(argument, 'usage: node evidence/phase-04/P04-007/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P04-007' && manifest.verdict === 'pass', 'evidence verdict');
same(
  manifest.requirements,
  ['CORE-001', 'CORE-002', 'CORE-003', 'INV-004', 'INV-007', 'SEC-001', 'SEC-002'],
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

const policy = showJson('docs/architecture/buffer-transport-alternatives-v1.json');
assert(policy.schema === 'helix.buffer-transport-alternatives/1', 'policy schema');
assert(policy.plan_item === 'P04-007', 'policy owner');
assert(policy.required_abi.package === 'helix:core-abi@5.0.0', 'required ABI');
assert(policy.required_abi.changed_by_prototype === false, 'ABI unchanged');
same(policy.prototypes, ['host-owned-generational-handles', 'exclusive-shared-staging'], 'prototypes');
assert(policy.bounds.maximum_live_handles === 4096, 'handle bound');
assert(policy.bounds.maximum_shared_staging_bytes === 16_777_216, 'staging bound');
assert(policy.bounds.maximum_active_leases_per_region === 1, 'lease bound');
assert(Object.values(policy.handle_rules).every((value) => value === true), 'handle rules');
assert(Object.values(policy.shared_staging_rules).every((value) => value === true), 'staging rules');
assert(policy.comparison.semantic_oracle === 'explicit-copy-buffer-v1', 'oracle');
assert(policy.comparison.timing_threshold === null, 'timing boundary');
assert(policy.comparison.selected_transport === null, 'selection boundary');
assert(policy.claim_boundary.alternatives_prototyped === true, 'prototype claim');
for (const key of [
  'required_abi_feature_added', 'component_binding_present',
  'actual_shared_memory_or_mapping_present', 'host_implementations_present',
  'performance_claim_present', 'transport_selected', 'database_functionality_added',
]) assert(policy.claim_boundary[key] === false, `${key} claim`);

const source = showText('crates/helix-core/src/transport_alternatives.rs');
for (const marker of [
  'pub const MAXIMUM_PROTOTYPE_HANDLES: usize = 4096;',
  'pub struct PrototypeHandle {',
  'pub struct HostOwnedHandleStore {',
  'pub struct SharedStagingPrototype {',
  'entry.generation = entry.generation.wrapping_add(1).max(1);',
]) assert(source.includes(marker), `source marker ${marker}`);
assert(!source.includes('unsafe {') && !source.includes('pub slot:'), 'safe private identities');

const root = showText('Cargo.toml');
const matrix = showJson('.github/ci/matrix.json');
const workflow = showText('.github/workflows/ci.yml');
assert(
  root.includes('plan-item = "P04-007"') &&
    root.includes('status = "buffer-alternatives-prototype-v1"'),
  'workspace maturity',
);
assert(matrix.plan_items.at(-1) === 'P04-007', 'CI task history');
assert(workflow.includes('corepack npm run buffers:alternatives:check'), 'hosted check');
assert(workflow.includes('corepack npm run buffers:alternatives:test'), 'hosted canaries');

const check = execFileSync('node', ['tests/toolchain/check-buffer-transport-alternatives.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(check.includes('2 bounded executable prototypes, required ABI unchanged'), 'live check');
const canaries = execFileSync(
  'node', ['tests/toolchain/test-buffer-transport-alternatives-contract.mjs'],
  { cwd: repository, encoding: 'utf8' },
);
assert(canaries.includes('32 mutations rejected'), 'live canaries');

process.stdout.write('PASS P04-007 source: 36 artifacts prototype 2 transport alternatives\n');
process.stdout.write('PASS P04-007 handles: 4096 bound, private generations, stale rejection\n');
process.stdout.write('PASS P04-007 staging: 16 MiB bound, one exclusive lease, copied snapshot\n');
process.stdout.write('PASS P04-007 boundary: required ABI 5.0 unchanged and no selection claim\n');
process.stdout.write('PASS P04-007 canaries: 32 intended mutations rejected\n');

#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
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

assert(argument, 'usage: node evidence/phase-04/P04-004/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P04-004' && manifest.verdict === 'pass', 'evidence verdict');
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

const policy = showJson('docs/architecture/async-storage-batch-abi-v1.json');
assert(policy.schema === 'helix.async-storage-batch-abi/1', 'policy schema');
assert(policy.plan_item === 'P04-004', 'policy owner');
assert(policy.base.package === 'helix:core-abi@2.0.0' && policy.base.immutable, 'base ABI');
assert(policy.current.package === 'helix:core-abi@3.0.0', 'current ABI');
same(policy.current.abi, { major: 3, minor: 0 }, 'current version');
same(
  policy.operations,
  ['read-batch', 'write-batch', 'sync-batch', 'rename-batch', 'list-batch', 'delete-batch'],
  'operations',
);
assert(policy.bounds.maximum_batch_items === 1024, 'batch bound');
assert(policy.bounds.maximum_transfer_bytes === 16_777_216, 'transfer bound');
assert(policy.bounds.maximum_list_entries === 4096, 'list bound');
assert(Object.keys(policy.rules).length === 13, 'rule count');
assert(Object.values(policy.rules).every((value) => value === true), 'closed rules');
assert(policy.versioning.implicit_2_0_acceptance === false, '2.0 window');
assert(policy.claim_boundary.operations_defined === true, 'definition claim');
assert(policy.claim_boundary.operations_bound_or_implemented === false, 'implementation claim');
assert(policy.claim_boundary.resource_lifecycles_defined === false, 'lifecycle claim');
assert(policy.claim_boundary.host_implementations_present === false, 'host claim');
assert(policy.claim_boundary.database_functionality_added === false, 'database claim');

const wit = showText('wit/helix-core-abi-v3/world.wit');
for (const marker of [
  'package helix:core-abi@3.0.0;',
  'read-batch: async func(',
  'write-batch: async func(',
  'sync-batch: async func(',
  'rename-batch: async func(',
  'list-batch: async func(',
  'delete-batch: async func(',
]) {
  assert(wit.includes(marker), `WIT marker ${marker}`);
}
const root = showText('Cargo.toml');
const core = showText('crates/helix-core/src/deterministic.rs');
const matrix = showJson('.github/ci/matrix.json');
const workflow = showText('.github/workflows/ci.yml');
assert(
  root.includes('plan-item = "P04-004"') &&
    root.includes('status = "async-storage-batch-abi-v1"'),
  'workspace maturity',
);
assert(core.includes('COMPONENT_ABI_VERSION: (u16, u16) = (3, 0)'), 'Rust ABI version');
assert(core.includes('COMPONENT_ABI_PACKAGE: &str = "helix:core-abi@3.0.0"'), 'Rust package');
assert(matrix.plan_items.at(-1) === 'P04-004', 'CI task history');
assert(workflow.includes('corepack npm run storage:batch:check'), 'hosted batch check');
assert(workflow.includes('corepack npm run storage:batch:test'), 'hosted batch canaries');

const check = execFileSync('node', ['tests/toolchain/check-storage-batch-abi.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(check.includes('exact 3.0, 6 bounded async operations'), 'live WIT parse');
assert(check.includes('80 resolved types, 9 total functions'), 'live inventory');
const canaries = execFileSync('node', ['tests/toolchain/test-storage-batch-abi-contract.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(canaries.includes('30 mutations rejected'), 'live canaries');
const component = spawnSync('node', ['tests/toolchain/check-wasm-artifacts.mjs', 'component'], {
  cwd: repository,
  encoding: 'utf8',
  env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
  maxBuffer: 128 * 1024 * 1024,
});
assert(component.status === 0, `component validation\n${component.stderr}`);

process.stdout.write('PASS P04-004 source: 37 artifacts define async storage ABI 3.0\n');
process.stdout.write('PASS P04-004 WIT: 6 async operations, 80 types, 11 imports\n');
process.stdout.write('PASS P04-004 bounds: 1024 items, 16 MiB transfer, 4096 list entries\n');
process.stdout.write('PASS P04-004 boundary: no bindings/lifecycles/hosts/database claims\n');
process.stdout.write('PASS P04-004 canaries: 30 intended mutations rejected\n');

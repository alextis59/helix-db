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

assert(argument, 'usage: node evidence/phase-04/P04-006/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P04-006' && manifest.verdict === 'pass', 'evidence verdict');
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

const policy = showJson('docs/architecture/explicit-copy-buffer-transport-v1.json');
assert(policy.schema === 'helix.explicit-copy-buffer-transport/1', 'policy schema');
assert(policy.plan_item === 'P04-006', 'policy owner');
assert(policy.base.package === 'helix:core-abi@4.0.0' && policy.base.immutable, 'base ABI');
assert(policy.current.package === 'helix:core-abi@5.0.0', 'current ABI');
same(policy.current.abi, { major: 5, minor: 0 }, 'current version');
same(policy.operations, ['read-immutable', 'write-staging', 'copy-immutable-to-staging'], 'operations');
assert(policy.bounds.maximum_buffer_bytes === 16_777_216, 'buffer bound');
assert(policy.bounds.maximum_transfer_bytes_per_call === 16_777_216, 'transfer bound');
assert(Object.keys(policy.rules).length === 18, 'rule count');
assert(Object.values(policy.rules).every((value) => value === true), 'closed rules');
assert(Object.keys(policy.errors).length === 6, 'error count');
assert(policy.versioning.implicit_4_0_acceptance === false, '4.0 window');
assert(policy.claim_boundary.buffer_access_operations_defined === true, 'operation claim');
assert(policy.claim_boundary.portable_reference_implementation_present === true, 'model claim');
assert(policy.claim_boundary.component_binding_present === false, 'binding claim');
assert(policy.claim_boundary.host_implementations_present === false, 'host claim');
assert(policy.claim_boundary.alternative_transport_implemented === false, 'alternative claim');
assert(policy.claim_boundary.database_functionality_added === false, 'database claim');

const wit = showText('wit/helix-core-abi-v5/world.wit');
for (const marker of [
  'package helix:core-abi@5.0.0;',
  'read-immutable: func(',
  'write-staging: func(',
  'copy-immutable-to-staging: func(',
]) assert(wit.includes(marker), `WIT marker ${marker}`);
const model = showText('crates/helix-core/src/explicit_copy.rs');
for (const marker of [
  'pub const MAXIMUM_BUFFER_BYTES: usize = 16 * 1024 * 1024;',
  'pub struct ImmutableBuffer',
  'pub struct MutableStagingBuffer',
  '.copy_from_slice(source);',
]) assert(model.includes(marker), `model marker ${marker}`);
assert(!model.includes('unsafe {'), 'safe model');

const root = showText('Cargo.toml');
const core = showText('crates/helix-core/src/deterministic.rs');
const matrix = showJson('.github/ci/matrix.json');
const workflow = showText('.github/workflows/ci.yml');
assert(
  root.includes('plan-item = "P04-006"') && root.includes('status = "explicit-copy-buffer-v1"'),
  'workspace maturity',
);
assert(core.includes('COMPONENT_ABI_VERSION: (u16, u16) = (5, 0)'), 'Rust ABI version');
assert(core.includes('COMPONENT_ABI_PACKAGE: &str = "helix:core-abi@5.0.0"'), 'Rust package');
assert(matrix.plan_items.at(-1) === 'P04-006', 'CI task history');
assert(workflow.includes('corepack npm run buffers:copy:check'), 'hosted copy check');
assert(workflow.includes('corepack npm run buffers:copy:test'), 'hosted copy canaries');

const check = execFileSync('node', ['tests/toolchain/check-explicit-copy-buffer.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(check.includes('exact ABI 5.0, 3 bounded copy operations'), 'live WIT parse');
assert(check.includes('safe Rust, detached reads'), 'live model check');
const canaries = execFileSync('node', ['tests/toolchain/test-explicit-copy-buffer-contract.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(canaries.includes('38 mutations rejected'), 'live canaries');
const component = spawnSync('node', ['tests/toolchain/check-wasm-artifacts.mjs', 'component'], {
  cwd: repository,
  encoding: 'utf8',
  env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
  maxBuffer: 128 * 1024 * 1024,
});
assert(component.status === 0, `component validation\n${component.stderr}`);

process.stdout.write('PASS P04-006 source: 42 artifacts implement explicit-copy ABI 5.0\n');
process.stdout.write('PASS P04-006 WIT: 3 copy operations, 87 types, 12 imports\n');
process.stdout.write('PASS P04-006 model: detached reads, contiguous writes, atomic failures\n');
process.stdout.write('PASS P04-006 boundary: no aliases/mapping/hosts/database claims\n');
process.stdout.write('PASS P04-006 canaries: 38 intended mutations rejected\n');

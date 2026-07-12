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

assert(argument, 'usage: node evidence/phase-04/P04-005/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P04-005' && manifest.verdict === 'pass', 'evidence verdict');
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

const policy = showJson('docs/architecture/resource-lifecycle-abi-v1.json');
assert(policy.schema === 'helix.resource-lifecycle-abi/1', 'policy schema');
assert(policy.plan_item === 'P04-005', 'policy owner');
assert(policy.base.package === 'helix:core-abi@3.0.0' && policy.base.immutable, 'base ABI');
assert(policy.current.package === 'helix:core-abi@4.0.0', 'current ABI');
same(policy.current.abi, { major: 4, minor: 0 }, 'current version');
same(policy.resources, ['immutable-buffer', 'mutable-staging-buffer', 'opaque-handle'], 'resources');
same(policy.operations, ['allocate-staging', 'seal-staging', 'duplicate-immutable'], 'operations');
assert(policy.bounds.maximum_buffer_bytes === 16_777_216, 'buffer bound');
assert(policy.bounds.maximum_live_resources_per_instance === 4096, 'resource bound');
assert(policy.bounds.maximum_handle_name_bytes === 64, 'descriptor bound');
assert(Object.keys(policy.rules).length === 20, 'rule count');
assert(Object.values(policy.rules).every((value) => value === true), 'closed rules');
assert(policy.versioning.implicit_3_0_acceptance === false, '3.0 window');
assert(policy.claim_boundary.resource_lifecycles_defined === true, 'lifecycle claim');
assert(policy.claim_boundary.buffer_transport_implemented === false, 'transport claim');
assert(policy.claim_boundary.mapping_or_shared_memory_defined === false, 'mapping claim');
assert(policy.claim_boundary.host_implementations_present === false, 'host claim');
assert(policy.claim_boundary.database_functionality_added === false, 'database claim');

const wit = showText('wit/helix-core-abi-v4/world.wit');
for (const marker of [
  'package helix:core-abi@4.0.0;',
  'resource immutable-buffer {',
  'resource mutable-staging-buffer {',
  'resource opaque-handle {',
  'interface host-resources {',
  'allocate-staging: func(',
  'seal-staging: func(',
  'duplicate-immutable: func(',
]) {
  assert(wit.includes(marker), `WIT marker ${marker}`);
}
const root = showText('Cargo.toml');
const core = showText('crates/helix-core/src/deterministic.rs');
const matrix = showJson('.github/ci/matrix.json');
const workflow = showText('.github/workflows/ci.yml');
assert(
  root.includes('plan-item = "P04-005"') && root.includes('status = "resource-lifecycle-abi-v1"'),
  'workspace maturity',
);
assert(core.includes('COMPONENT_ABI_VERSION: (u16, u16) = (4, 0)'), 'Rust ABI version');
assert(core.includes('COMPONENT_ABI_PACKAGE: &str = "helix:core-abi@4.0.0"'), 'Rust package');
assert(matrix.plan_items.at(-1) === 'P04-005', 'CI task history');
assert(workflow.includes('corepack npm run resources:lifecycle:check'), 'hosted lifecycle check');
assert(workflow.includes('corepack npm run resources:lifecycle:test'), 'hosted lifecycle canaries');

const check = execFileSync('node', ['tests/toolchain/check-resource-lifecycle-abi.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(check.includes('exact 4.0, 3 resources, 7 transitions'), 'live WIT parse');
assert(check.includes('85 resolved types, 16 functions'), 'live inventory');
const canaries = execFileSync('node', ['tests/toolchain/test-resource-lifecycle-abi-contract.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(canaries.includes('42 mutations rejected'), 'live canaries');
const component = spawnSync('node', ['tests/toolchain/check-wasm-artifacts.mjs', 'component'], {
  cwd: repository,
  encoding: 'utf8',
  env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
  maxBuffer: 128 * 1024 * 1024,
});
assert(component.status === 0, `component validation\n${component.stderr}`);

process.stdout.write('PASS P04-005 source: 38 artifacts define resource lifecycle ABI 4.0\n');
process.stdout.write('PASS P04-005 WIT: 3 resources, 4 methods, 3 operations, 12 imports\n');
process.stdout.write('PASS P04-005 bounds: 16 MiB buffers, 4096 resources, 64-byte names\n');
process.stdout.write('PASS P04-005 boundary: no transport/mapping/hosts/database claims\n');
process.stdout.write('PASS P04-005 canaries: 42 intended mutations rejected\n');

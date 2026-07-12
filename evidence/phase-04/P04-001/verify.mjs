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
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (args) =>
  execFileSync('git', args, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (args) => gitBytes(args).toString('utf8');
const showBytes = (file) => gitBytes(['show', `${manifest.commit}:${file}`]);
const showText = (file) => showBytes(file).toString('utf8');
const showJson = (file) => JSON.parse(showText(file));

assert(argument, 'usage: node evidence/phase-04/P04-001/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P04-001' && manifest.verdict === 'pass', 'evidence verdict');
assert(
  JSON.stringify(manifest.requirements) ===
    JSON.stringify([
      'CORE-001',
      'CORE-003',
      'INV-003',
      'INV-004',
      'INV-007',
      'PLAT-001',
      'PLAT-002',
      'SEC-001',
      'SEC-002',
    ]),
  'requirements',
);
assert(JSON.stringify(manifest.accepted_adrs) === JSON.stringify(['0013']), 'accepted ADRs');
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

const policy = showJson('docs/architecture/wasm-component-abi-v1.json');
assert(policy.schema === 'helix.wasm-component-abi/1', 'ABI policy schema');
assert(policy.package === 'helix:core-abi@1.0.0' && policy.world === 'helix-core-v1', 'ABI identity');
assert(policy.versioning.current.major === 1 && policy.versioning.current.minor === 0, 'ABI version');
assert(policy.versioning.accepted.length === 1, 'accepted ABI count');
assert(policy.versioning.no_implicit_previous_version_window, 'version window');
assert(policy.buffers.enabled_baseline === 'list-u8-explicit-copy', 'copy baseline');
assert(policy.buffers.resource_operations_enabled === false, 'buffer operation claim');
assert(policy.buffers.zero_copy_claim === false, 'zero-copy claim');
assert(policy.handles.forgeable === false && policy.handles.serializable === false, 'handle boundary');
assert(policy.cancellation.implies_rollback === false, 'cancellation rollback');
assert(policy.cancellation.implies_no_commit === false, 'cancellation commit');
assert(policy.capabilities.ambient_authority === false, 'ambient authority');
assert(policy.capabilities.kinds.length === 11, 'capability kinds');
assert(policy.negotiation.failure_mutates_state === false, 'negotiation mutation');
assert(policy.claim_boundary.wit_contract_defined === true, 'WIT definition claim');
assert(policy.claim_boundary.wit_bound_into_component === false, 'binding claim');
assert(policy.claim_boundary.host_operations_implemented === false, 'host operation claim');
assert(policy.claim_boundary.database_functionality_added === false, 'database claim');

const wit = showText('wit/helix-core-abi-v1/world.wit');
for (const marker of [
  'package helix:core-abi@1.0.0;',
  'resource immutable-buffer;',
  'resource mutable-staging-buffer;',
  'resource opaque-handle;',
  'resource cancellation-token;',
  'resource capability-set;',
  'poll-cancellation: func(token: borrow<cancellation-token>) -> bool;',
  'negotiate: func(host: host-descriptor) -> result<negotiated-abi, helix-error>;',
  'world helix-core-v1',
]) {
  assert(wit.includes(marker), `WIT marker ${marker}`);
}
assert(!wit.includes('compatibility:'), 'impossible successful compatibility state');

const root = showText('Cargo.toml');
const core = showText('crates/helix-core/src/lib.rs');
const matrix = showJson('.github/ci/matrix.json');
const workflow = showText('.github/workflows/ci.yml');
assert(root.includes('plan-item = "P04-001"') && root.includes('status = "component-abi-v1"'), 'workspace maturity');
assert(core.includes('COMPONENT_ABI_VERSION: (u16, u16) = (1, 0)'), 'Rust ABI version');
assert(core.includes('COMPONENT_ABI_PACKAGE: &str = "helix:core-abi@1.0.0"'), 'Rust package');
assert(matrix.plan_items.at(-1) === 'P04-001', 'CI task history');
assert(workflow.includes('corepack npm run wasm:abi:check'), 'hosted ABI check');
assert(workflow.includes('corepack npm run wasm:abi:test'), 'hosted ABI canaries');

const check = execFileSync('node', ['tests/toolchain/check-wasm-abi.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(check.includes('3 interfaces, 17 types, 3 functions'), 'live WIT parse');
const canaries = execFileSync('node', ['tests/toolchain/test-wasm-abi-contract.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(canaries.includes('20 mutations rejected'), 'live ABI canaries');
const component = spawnSync('node', ['tests/toolchain/check-wasm-artifacts.mjs', 'component'], {
  cwd: repository,
  encoding: 'utf8',
  env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
  maxBuffer: 128 * 1024 * 1024,
});
assert(component.status === 0, `component validation\n${component.stderr}`);
assert(component.stdout.includes('component-model-0x1000d'), 'component validation output');
const coreTests = spawnSync('cargo', ['test', '--frozen', '-p', 'helix-core'], {
  cwd: repository,
  encoding: 'utf8',
  env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
});
assert(coreTests.status === 0, `helix-core tests\n${coreTests.stderr}`);

process.stdout.write('PASS P04-001 source: 36 artifacts bind the versioned component ABI\n');
process.stdout.write('PASS P04-001 WIT: exact 1.0 package, 3 interfaces, 17 types, 3 functions\n');
process.stdout.write('PASS P04-001 boundaries: explicit copies/resources/cancellation/capabilities\n');
process.stdout.write('PASS P04-001 gates: pinned parser, empty current component, 20 mutation canaries\n');

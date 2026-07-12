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

assert(argument, 'usage: node evidence/phase-04/P04-003/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P04-003' && manifest.verdict === 'pass', 'evidence verdict');
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

const policy = showJson('docs/architecture/host-capability-abi-v1.json');
assert(policy.schema === 'helix.host-capability-abi/1', 'policy schema');
assert(policy.plan_item === 'P04-003', 'policy owner');
assert(policy.base.package === 'helix:core-abi@1.0.0' && policy.base.immutable, 'base ABI');
assert(policy.current.package === 'helix:core-abi@1.1.0', 'current ABI package');
same(policy.current.abi, { major: 1, minor: 1 }, 'current ABI');
same(policy.current.accepted, [{ major: 1, minor: 1 }], 'accepted ABI');
assert(policy.interfaces.length === 12, 'interface count');
assert(Object.keys(policy.capability_interfaces).length === 9, 'capability interface count');
assert(policy.capability_kinds.length === 12, 'capability kind count');
assert(Object.keys(policy.bounds).length === 8, 'bounds count');
assert(Object.keys(policy.rules).length === 11, 'rules count');
assert(Object.values(policy.rules).every((value) => value === true), 'closed rules');
assert(policy.versioning.implicit_1_0_acceptance === false, '1.0 window');
assert(policy.claim_boundary.capability_types_and_imports_defined === true, 'definition claim');
assert(policy.claim_boundary.capability_operations_defined === false, 'operation claim');
assert(policy.claim_boundary.wit_bound_into_component === false, 'binding claim');
assert(policy.claim_boundary.host_implementations_present === false, 'host claim');
assert(policy.claim_boundary.database_functionality_added === false, 'database claim');

const wit = showText('wit/helix-core-abi-v1_1/world.wit');
for (const marker of [
  'package helix:core-abi@1.1.0;',
  'interface host-files {',
  'interface host-directories {',
  'interface host-durability {',
  'interface host-locks {',
  'interface host-timers {',
  'interface host-randomness {',
  'interface host-scheduling {',
  'interface host-metrics {',
  'interface host-secrets {',
  'world helix-core-v1 {',
]) {
  assert(wit.includes(marker), `WIT marker ${marker}`);
}
const root = showText('Cargo.toml');
const core = showText('crates/helix-core/src/deterministic.rs');
const matrix = showJson('.github/ci/matrix.json');
const workflow = showText('.github/workflows/ci.yml');
assert(
  root.includes('plan-item = "P04-003"') && root.includes('status = "host-capability-abi-v1"'),
  'workspace maturity',
);
assert(core.includes('COMPONENT_ABI_VERSION: (u16, u16) = (1, 1)'), 'Rust ABI version');
assert(core.includes('COMPONENT_ABI_PACKAGE: &str = "helix:core-abi@1.1.0"'), 'Rust package');
assert(matrix.plan_items.at(-1) === 'P04-003', 'CI task history');
assert(workflow.includes('corepack npm run host:capabilities:check'), 'hosted capability check');
assert(workflow.includes('corepack npm run host:capabilities:test'), 'hosted capability canaries');

const check = execFileSync('node', ['tests/toolchain/check-host-capabilities.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(check.includes('9 capability interfaces/resources, 11 imports'), 'live WIT parse');
assert(check.includes('56 resolved types, 3 control functions, 0 capability operations'), 'live inventory');
const canaries = execFileSync('node', ['tests/toolchain/test-host-capabilities-contract.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(canaries.includes('27 mutations rejected'), 'live canaries');
const component = spawnSync('node', ['tests/toolchain/check-wasm-artifacts.mjs', 'component'], {
  cwd: repository,
  encoding: 'utf8',
  env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
  maxBuffer: 128 * 1024 * 1024,
});
assert(component.status === 0, `component validation\n${component.stderr}`);
assert(component.stdout.includes('component-model-0x1000d'), 'component validation output');

process.stdout.write('PASS P04-003 source: 37 artifacts define host capability ABI 1.1\n');
process.stdout.write('PASS P04-003 WIT: immutable 1.0 plus exact 1.1, 12 interfaces, 56 types\n');
process.stdout.write('PASS P04-003 capabilities: 9 resources, 12 kinds, 11 imports\n');
process.stdout.write('PASS P04-003 boundary: 0 capability operations/hosts/bindings/database claims\n');
process.stdout.write('PASS P04-003 canaries: 27 intended mutations rejected\n');

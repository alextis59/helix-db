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

assert(argument, 'usage: node evidence/phase-04/P04-002/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(argument), 'commit must be a full lowercase SHA-1');
assert(argument === manifest.commit, 'argument does not match manifest commit');
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P04-002' && manifest.verdict === 'pass', 'evidence verdict');
same(
  manifest.requirements,
  ['CORE-001', 'CORE-002', 'INV-004', 'SEC-001', 'SEC-002'],
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

const policy = showJson('docs/architecture/deterministic-core-boundary-v1.json');
assert(policy.schema === 'helix.deterministic-core-boundary/1', 'policy schema');
assert(policy.plan_item === 'P04-002', 'policy owner');
assert(policy.core_crate === 'helix-core', 'core crate');
assert(policy.core_module === 'crates/helix-core/src/deterministic.rs', 'core module');
same(
  policy.deterministic_workspace_crates,
  ['helix-doc', 'helix-query', 'helix-storage', 'helix-columnar', 'helix-core'],
  'deterministic crates',
);
same(
  policy.allowed_direct_dependencies,
  ['helix-columnar', 'helix-doc', 'helix-query', 'helix-storage'],
  'direct dependencies',
);
same(
  policy.forbidden_workspace_dependencies,
  ['helix-gpu', 'helix-host-native', 'helix-server'],
  'forbidden workspace dependencies',
);
assert(policy.forbidden_dependency_names.length === 12, 'forbidden dependencies');
assert(policy.forbidden_source_patterns.length === 14, 'forbidden source patterns');
assert(policy.ambient_categories.length === 12, 'ambient categories');
assert(policy.forbidden_browser_wasm_imports === true, 'browser import denial');
same(policy.wasm.required_imports, [], 'browser imports');
assert(policy.wasm.component_binding_owner === 'P04-003', 'binding owner');
assert(policy.claim_boundary.deterministic_module_separated === true, 'separation claim');
assert(policy.claim_boundary.ambient_source_and_dependency_gate_active === true, 'source gate');
assert(policy.claim_boundary.browser_zero_import_gate_active === true, 'Wasm import gate');
assert(policy.claim_boundary.capability_interfaces_implemented === false, 'capability claim');
assert(policy.claim_boundary.host_implementations_present === false, 'host claim');
assert(
  policy.claim_boundary.deterministic_database_orchestration_present === false,
  'database claim',
);

const deterministic = showText('crates/helix-core/src/deterministic.rs');
assert(deterministic.includes('pub const INTERNAL_DEPENDENCIES'), 'composition module');
assert(deterministic.includes('deterministic-core-boundary-v1'), 'maturity');
const root = showText('Cargo.toml');
const matrix = showJson('.github/ci/matrix.json');
const workflow = showText('.github/workflows/ci.yml');
assert(
  root.includes('plan-item = "P04-002"') &&
    root.includes('status = "deterministic-core-boundary-v1"'),
  'workspace maturity',
);
assert(matrix.plan_items.at(-1) === 'P04-002', 'CI task history');
assert(workflow.includes('corepack npm run core:boundary:check'), 'hosted boundary check');
assert(workflow.includes('corepack npm run core:boundary:test'), 'hosted boundary canaries');

const boundary = spawnSync('node', ['tests/toolchain/check-deterministic-core.mjs'], {
  cwd: repository,
  encoding: 'utf8',
  env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
  maxBuffer: 128 * 1024 * 1024,
});
assert(boundary.status === 0, `deterministic boundary\n${boundary.stderr}`);
assert(boundary.stdout.includes('11 Rust files, 18 dependency packages'), 'boundary inventory');
assert(boundary.stdout.includes('browser core has zero imports'), 'zero imports');
const canaries = execFileSync('node', ['tests/toolchain/test-deterministic-core-contract.mjs'], {
  cwd: repository,
  encoding: 'utf8',
});
assert(canaries.includes('30 mutations rejected'), 'live boundary canaries');
const component = spawnSync('node', ['tests/toolchain/check-wasm-artifacts.mjs', 'component'], {
  cwd: repository,
  encoding: 'utf8',
  env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
  maxBuffer: 128 * 1024 * 1024,
});
assert(component.status === 0, `component validation\n${component.stderr}`);
assert(component.stdout.includes('component-model-0x1000d'), 'component validation output');

process.stdout.write('PASS P04-002 source: 35 artifacts bind the deterministic core boundary\n');
process.stdout.write('PASS P04-002 closure: 5 crates, 18 packages, 11 Rust files\n');
process.stdout.write('PASS P04-002 ambient gate: 12 dependency, 14 source, 12 category controls\n');
process.stdout.write('PASS P04-002 Wasm: zero browser imports; component capabilities remain absent\n');
process.stdout.write('PASS P04-002 canaries: 30 intended mutations rejected\n');

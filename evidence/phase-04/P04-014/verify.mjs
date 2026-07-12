#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../../..');
const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json')));
const arg = process.argv[2];
const assert = (value, message) => { if (!value) throw new Error(message); };
const same = (actual, expected, label) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (args) => execFileSync('git', args, { cwd: root, maxBuffer: 128 * 1024 * 1024 });
const text = (args) => git(args).toString();
const show = (file) => git(['show', `${manifest.commit}:${file}`]);
const showText = (file) => show(file).toString();
const showJson = (file) => JSON.parse(showText(file));

assert(arg, 'usage: node evidence/phase-04/P04-014/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(arg) && arg === manifest.commit, 'full manifest commit');
assert(manifest.schema_version === 1 && manifest.task_id === 'P04-014' && manifest.verdict === 'pass', 'verdict');
same(manifest.requirements, ['CORE-001', 'CORE-002', 'CORE-003', 'INV-003', 'INV-004', 'INV-007', 'PLAT-001', 'PLAT-002', 'QUAL-001', 'SEC-001', 'SEC-002'], 'requirements');
same(manifest.accepted_adrs, ['0013'], 'ADRs');
assert(text(['rev-parse', `${arg}^{commit}`]).trim() === arg, 'commit');
assert(text(['rev-parse', `${arg}^`]).trim() === manifest.base_commit, 'parent');
assert(text(['rev-parse', `${arg}^{tree}`]).trim() === manifest.source_tree, 'tree');
const changes = text(['diff-tree', '--no-commit-id', '--name-only', '-r', arg]).trim().split('\n');
assert(changes.length === manifest.verification.source_artifacts, 'artifact count');
assert(sha(git(['diff', '--binary', manifest.base_commit, arg])) === manifest.diff_sha256, 'diff hash');
const verifier = readFileSync(fileURLToPath(import.meta.url));
assert(statSync(fileURLToPath(import.meta.url)).size === manifest.verifier.bytes, 'verifier bytes');
assert(sha(verifier) === manifest.verifier.sha256, 'verifier hash');
for (const authority of manifest.authorities) {
  const bytes = show(authority.path);
  assert(bytes.length === authority.bytes, `${authority.path}: bytes`);
  assert(sha(bytes) === authority.sha256, `${authority.path}: hash`);
}

const policy = showJson('docs/architecture/host-capability-isolation-v1.json');
assert(policy.schema === 'helix.host-capability-isolation/1' && policy.plan_item === 'P04-014', 'policy');
same(policy.resource_classes, ['files', 'sockets', 'clocks', 'devices'], 'resource classes');
assert(Object.values(policy.proofs).every((value) => value === true), 'proofs');
assert(policy.validation.host_executions === 4 && policy.validation.policy_mutation_canaries === 22 && policy.validation.source_mutation_canaries === 8, 'validation');
assert(policy.claim_boundary.ungranted_classes_unreachable && !policy.claim_boundary.ambient_authority_added, 'isolation claims');
for (const key of ['socket_adapter_present', 'gpu_device_adapter_present', 'platform_storage_adapter_present', 'component_model_linked', 'database_functionality_added']) assert(policy.claim_boundary[key] === false, `${key} claim`);
const native = showText('crates/helix-host-native/src/lib.rs');
for (const marker of ['ungranted_file_socket_clock_and_device_scopes_are_unreachable', 'ungranted/file', 'ungranted/socket', 'ungranted/clock', 'ungranted/device']) assert(native.includes(marker), `native ${marker}`);
const browser = showText('tests/browser/capability-isolation.spec.ts');
for (const marker of ['coreImports: []', 'file: true', 'socket: true', 'clock: true', 'device: true']) assert(browser.includes(marker), `browser ${marker}`);
const suites = showJson('tests/suites.json');
const unit = suites.suites.find((value) => value.id === 'unit');
const browserSuite = suites.suites.find((value) => value.id === 'browser');
assert(unit.expectations.rust_tests === 69, 'Rust inventory');
assert(browserSuite.expectations.browser_tests === 15 && browserSuite.expectations.browser_test_files === 5, 'browser inventory');
const matrix = showJson('.github/ci/matrix.json');
assert(matrix.plan_items.at(-1) === 'P04-014', 'CI history');
const workflow = showText('.github/workflows/ci.yml');
assert(workflow.includes('corepack npm run host:isolation:check') && workflow.includes('corepack npm run host:isolation:test'), 'hosted gates');
const check = execFileSync('node', ['tests/toolchain/check-host-isolation.mjs'], { cwd: root, encoding: 'utf8' });
assert(check.includes('ungranted files, sockets, clocks, and devices unreachable'), 'live check');
const canaries = execFileSync('node', ['tests/toolchain/test-host-isolation.mjs'], { cwd: root, encoding: 'utf8' });
assert(canaries.includes('30 mutations rejected'), 'live canaries');
process.stdout.write('PASS P04-014 source: 24 artifacts prove ungranted capability isolation\nPASS P04-014 core: zero imports and no ambient file/socket/clock/device APIs\nPASS P04-014 hosts: native plus Chromium, Firefox, and WebKit deny four scopes\nPASS P04-014 canaries: 22 policy and 8 source mutations rejected\nPASS P04-014 boundary: no platform adapter, component linkage, or database claim\n');

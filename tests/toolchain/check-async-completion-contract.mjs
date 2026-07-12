#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureWasmTools, validateWasmToolsAuthority } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(repository, 'docs/architecture/async-completion-contract-v1.json')),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export const validateCompletionPolicy = (candidate = policy) => {
  same(
    Object.keys(candidate),
    [
      'schema',
      'plan_item',
      'base',
      'current',
      'safe_points',
      'terminal_precedence_at_same_safe_point',
      'deadlines',
      'cancellation',
      'backpressure',
      'partial_io',
      'shutdown',
      'errors',
      'versioning',
      'deferred',
      'claim_boundary',
    ],
    'policy fields',
  );
  assert(candidate.schema === 'helix.async-completion-contract/1', 'policy schema');
  assert(candidate.plan_item === 'P04-008', 'policy owner');
  assert(candidate.base.package === 'helix:core-abi@5.0.0', 'base package');
  assert(candidate.base.path === 'wit/helix-core-abi-v5/world.wit', 'base path');
  assert(candidate.base.immutable === true, 'base immutability');
  assert(candidate.current.package === 'helix:core-abi@6.0.0', 'current package');
  assert(candidate.current.path === 'wit/helix-core-abi-v6/world.wit', 'current path');
  assert(candidate.current.world === 'helix-core-v1', 'current world');
  same(candidate.current.abi, { major: 6, minor: 0 }, 'current ABI');
  same(candidate.current.accepted, [{ major: 6, minor: 0 }], 'accepted ABI');
  same(
    candidate.safe_points,
    [
      'before-batch-admission',
      'before-each-item-dispatch',
      'after-each-bounded-host-io-chunk',
      'between-host-retries',
      'before-success-publication',
    ],
    'safe points',
  );
  same(
    candidate.terminal_precedence_at_same_safe_point,
    [
      'host-stopped',
      'host-draining-new-admission',
      'cancelled',
      'deadline-exceeded',
      'backpressure',
    ],
    'terminal precedence',
  );
  assert(Object.keys(candidate.deadlines).length === 7, 'deadline rule count');
  assert(candidate.deadlines.clock === 'negotiated-monotonic-timer-only', 'deadline clock');
  assert(candidate.deadlines.timer_name_maximum_bytes === 64, 'timer name bound');
  assert(
    Object.values(candidate.deadlines).filter((value) => value === true).length === 5,
    'deadline booleans',
  );
  same(
    candidate.cancellation,
    {
      cooperative_only: true,
      polled_only_at_safe_points: true,
      before_dispatch_outcome: 'not-committed',
      after_confirmed_commit_outcome: 'committed',
      ambiguous_mutation_outcome: 'unknown',
      never_implies_rollback: true,
      success_wins_only_after_publication: true,
    },
    'cancellation',
  );
  assert(Object.keys(candidate.backpressure).length === 7, 'backpressure rule count');
  assert(candidate.backpressure.error_code === 'CAP_BACKPRESSURE', 'backpressure error');
  assert(candidate.backpressure.retry_scope === 'after-delay', 'backpressure retry');
  assert(candidate.backpressure.numeric_budgets_owner === 'P04-009', 'budget owner');
  assert(
    Object.values(candidate.backpressure).filter((value) => value === true).length === 4,
    'backpressure booleans',
  );
  assert(Object.keys(candidate.partial_io).length === 9, 'partial-I/O rule count');
  assert(candidate.partial_io.zero_progress_error_code === 'IO_NO_PROGRESS', 'progress error');
  assert(candidate.partial_io.list_limit_error_code === 'IO_RESULT_LIMIT', 'list error');
  assert(
    Object.values(candidate.partial_io).filter((value) => value === true).length === 7,
    'partial-I/O booleans',
  );
  assert(Object.keys(candidate.shutdown).length === 10, 'shutdown rule count');
  same(candidate.shutdown.states, ['running', 'draining', 'stopped'], 'shutdown states');
  assert(candidate.shutdown.draining_error_code === 'HOST_DRAINING', 'draining error');
  assert(candidate.shutdown.stopped_error_code === 'HOST_STOPPED', 'stopped error');
  assert(
    Object.values(candidate.shutdown).filter((value) => value === true).length === 7,
    'shutdown booleans',
  );
  same(
    Object.values(candidate.errors),
    [
      'OP_CANCELLED',
      'OP_DEADLINE_EXCEEDED',
      'CAP_BACKPRESSURE',
      'IO_NO_PROGRESS',
      'IO_RESULT_LIMIT',
      'HOST_DRAINING',
      'HOST_STOPPED',
    ],
    'errors',
  );
  assert(candidate.versioning.change.startsWith('incompatible-'), 'major change');
  assert(candidate.versioning.same_patch_rewrite_forbidden, 'patch rewrite');
  assert(candidate.versioning.package_semver_alone_is_not_compatibility, 'SemVer boundary');
  assert(candidate.versioning.implicit_5_0_acceptance === false, '5.0 window');
  same(
    candidate.deferred,
    {
      numeric_memory_and_admission_budgets: 'P04-009',
      mock_host_execution: 'P04-010',
      native_host_execution: 'P04-011',
      browser_host_execution: 'P04-012',
      shared_host_conformance: 'P04-013',
      transport_benchmarks: 'P04-016',
      transport_selection: 'P04-017',
    },
    'deferred owners',
  );
  same(
    candidate.claim_boundary,
    {
      completion_semantics_defined: true,
      deadline_and_lifecycle_wit_defined: true,
      operation_bindings_present: false,
      host_implementations_present: false,
      numeric_budgets_defined: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-009',
    },
    'claim boundary',
  );
  return candidate;
};

export const validateCompletionSource = (source) => {
  for (const marker of [
    'package helix:core-abi@6.0.0;',
    'record monotonic-deadline {',
    'enum host-lifecycle-state {',
    'record host-lifecycle {',
    'deadline: option<monotonic-deadline>,',
    'lifecycle: func() -> host-lifecycle;',
  ])
    assert(source.includes(marker), `WIT marker ${marker}`);
  return source;
};

export const validateCompletionResolution = (resolution) => {
  assert(resolution.packages.length === 1, 'package count');
  assert(resolution.packages[0].name === policy.current.package, 'package identity');
  assert(resolution.interfaces.length === 13, 'interface count');
  const types = resolution.interfaces.reduce(
    (count, entry) => count + Object.keys(entry.types).length,
    0,
  );
  const functions = resolution.interfaces.flatMap((entry) => Object.values(entry.functions));
  assert(types === 92, 'resolved type count');
  assert(functions.length === 20, 'function count');
  assert(functions.filter(({ kind }) => kind === 'async-freestanding').length === 6, 'async count');
  const typeInterface = resolution.interfaces.find(({ name }) => name === 'types');
  const hostControl = resolution.interfaces.find(({ name }) => name === 'host-control');
  assert(typeInterface && hostControl, 'completion interfaces');
  for (const name of ['monotonic-deadline', 'host-lifecycle-state', 'host-lifecycle']) {
    assert(typeof typeInterface.types[name] === 'number', `${name}: type`);
  }
  assert(hostControl.functions.lifecycle?.kind === 'freestanding', 'lifecycle function');
  assert(hostControl.functions.lifecycle?.params.length === 0, 'lifecycle parameters');
  const world = resolution.worlds[0];
  assert(Object.keys(world.imports).length === 12, 'world import count');
  assert(Object.keys(world.exports).length === 1, 'world export count');
  return resolution;
};

const run = async () => {
  assert(
    process.argv.length === 2,
    'usage: node tests/toolchain/check-async-completion-contract.mjs',
  );
  validateCompletionPolicy();
  for (const source of [policy.base, policy.current]) {
    const bytes = readFileSync(path.join(repository, source.path));
    assert(bytes.length === source.bytes, `${source.path}: bytes`);
    assert(sha256(bytes) === source.sha256, `${source.path}: hash`);
  }
  validateCompletionSource(readFileSync(path.join(repository, policy.current.path), 'utf8'));
  const executable = await ensureWasmTools();
  assert(validateWasmToolsAuthority().authority.version === '1.253.0', 'validator version');
  const resolution = JSON.parse(
    execFileSync(executable, ['component', 'wit', policy.current.path, '--json'], {
      cwd: repository,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  validateCompletionResolution(resolution);
  process.stdout.write(
    'PASS async completion contract: exact ABI 6.0, 5 safe points, 7 stable errors\n',
  );
  process.stdout.write(
    'PASS completion boundary: monotonic deadlines, deterministic precedence, 3 shutdown states\n',
  );
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  run().catch((error) => {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

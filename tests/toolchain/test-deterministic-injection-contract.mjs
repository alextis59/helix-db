#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateInjectionPolicy,
  validateInjectionResolution,
  validateInjectionRust,
  validateInjectionSource,
} from './check-deterministic-injection-contract.mjs';
import { ensureWasmTools } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(
    path.join(repository, 'docs/architecture/deterministic-injection-contract-v1.json'),
    'utf8',
  ),
);
const source = readFileSync(path.join(repository, policy.current.path), 'utf8');
const rust = readFileSync(path.join(repository, policy.reference_model.path), 'utf8');
const executable = await ensureWasmTools();
const resolution = JSON.parse(
  execFileSync(executable, ['component', 'wit', policy.current.path, '--json'], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }),
);

const policyMutations = [
  ['schema', (v) => (v.schema = 'helix.deterministic-injection-contract/2')],
  ['owner', (v) => (v.plan_item = 'P04-010')],
  ['base rewrite', (v) => (v.base.immutable = false)],
  ['package', (v) => (v.current.package = 'helix:core-abi@7.1.0')],
  ['accepted base', (v) => v.current.accepted.push({ major: 6, minor: 0 })],
  ['clock count', (v) => (v.bounds.maximum_clock_samples_per_operation = 0)],
  ['random size', (v) => (v.bounds.maximum_random_bytes_per_request = 0)],
  ['memory size', (v) => (v.bounds.maximum_memory_budget_bytes = Number.MAX_SAFE_INTEGER)],
  ['clock role', (v) => v.clocks.roles.pop()],
  ['clock mapping', (v) => (v.clocks.value_by_role.monotonic = 'utc-microseconds')],
  ['clock sequence', (v) => (v.clocks.sequence_is_zero_based_contiguous = false)],
  ['clock consumption', (v) => (v.clocks.consumption_is_exact_and_ordered = false)],
  ['clock mutation', (v) => (v.clocks.mismatches_fail_without_consumption = false)],
  ['clock reuse', (v) => (v.clocks.replay_reuses_resolved_values = false)],
  [
    'clock interchange',
    (v) => (v.clocks.wall_monotonic_mvcc_and_expiry_are_not_interchangeable = false),
  ],
  ['random purpose', (v) => v.randomness.purposes.pop()],
  ['random sequence', (v) => (v.randomness.sequence_is_zero_based_contiguous = false)],
  [
    'random consumption',
    (v) => (v.randomness.consumption_is_exact_purpose_order_and_length = false),
  ],
  ['weak random', (v) => (v.randomness.weak_fallback_forbidden = false)],
  [
    'ID timing',
    (v) => (v.randomness.generated_ids_resolve_once_before_canonical_command_publication = false),
  ],
  [
    'ID replay',
    (v) => (v.randomness.replay_retry_replication_restore_never_regenerate_ids = false),
  ],
  ['memory class', (v) => v.memory.classes.reverse()],
  ['memory pin', (v) => (v.memory.profile_is_pinned_before_admission = false)],
  ['memory atomic', (v) => (v.memory.reservations_are_fail_before_mutation = false)],
  ['memory usage', (v) => (v.memory.failed_reservation_does_not_change_usage = false)],
  ['memory release', (v) => (v.memory.release_requires_exact_live_accounting = false)],
  ['late pressure', (v) => (v.memory.backpressure_is_admission_only = false)],
  ['device class', (v) => v.device.classes.reverse()],
  ['device pin', (v) => (v.device.profile_is_pinned_before_semantic_execution = false)],
  ['device identifiers', (v) => (v.device.host_unique_identifiers_forbidden = false)],
  ['device content', (v) => (v.device.document_or_tenant_content_forbidden = false)],
  ['device semantics', (v) => (v.device.may_not_change_semantic_results = false)],
  ['ambient model', (v) => (v.reference_model.ambient_discovery_present = true)],
  ['implicit window', (v) => (v.versioning.implicit_6_0_acceptance = true)],
  ['binding overclaim', (v) => (v.claim_boundary.operation_bindings_present = true)],
  ['host overclaim', (v) => (v.claim_boundary.host_implementations_present = true)],
  ['GPU overclaim', (v) => (v.claim_boundary.gpu_execution_present = true)],
  ['ID overclaim', (v) => (v.claim_boundary.identifier_generation_implemented = true)],
  ['database overclaim', (v) => (v.claim_boundary.database_functionality_added = true)],
];
for (const [label, mutate] of policyMutations) {
  const candidate = structuredClone(policy);
  mutate(candidate);
  try {
    validateInjectionPolicy(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} policy mutation unexpectedly accepted`);
}

const interfaces = Object.fromEntries(
  resolution.interfaces.map((value, index) => [value.name, index]),
);
const resolutionMutations = [
  ['package', (v) => (v.packages[0].name = 'helix:core-abi@7.1.0')],
  ['memory type', (v) => delete v.interfaces[interfaces.types].types['memory-budget']],
  ['device type', (v) => delete v.interfaces[interfaces.types].types['device-profile']],
  ['clock type', (v) => delete v.interfaces[interfaces['host-timers']].types['clock-value']],
  [
    'clock operation',
    (v) => delete v.interfaces[interfaces['host-timers']].functions['read-clock'],
  ],
  [
    'random operation',
    (v) => delete v.interfaces[interfaces['host-randomness']].functions['read-random'],
  ],
  [
    'profile operation',
    (v) => delete v.interfaces[interfaces['host-control']].functions['capture-execution-profile'],
  ],
  [
    'profile kind',
    (v) =>
      (v.interfaces[interfaces['host-control']].functions['capture-execution-profile'].kind =
        'async-freestanding'),
  ],
  ['import', (v) => delete v.worlds[0].imports[Object.keys(v.worlds[0].imports)[0]]],
  ['export', (v) => delete v.worlds[0].exports[Object.keys(v.worlds[0].exports)[0]]],
];
for (const [label, mutate] of resolutionMutations) {
  const candidate = structuredClone(resolution);
  mutate(candidate);
  try {
    validateInjectionResolution(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} resolution mutation unexpectedly accepted`);
}

const sourceMutations = [
  ['package source', (v) => v.replace('@7.0.0', '@7.1.0')],
  ['budget source', (v) => v.replace('record memory-budget {', 'record budget {')],
  ['clock source', (v) => v.replace('read-clock: async func(', 'read-clock: func(')],
  ['UUID source', (v) => v.replace('uuid-v7,', '')],
  ['random source', (v) => v.replace('read-random: async func(', 'read-random: func(')],
  [
    'profile source',
    (v) => v.replace('capture-execution-profile: func()', 'execution-profile: func()'),
  ],
];
for (const [label, mutate] of sourceMutations) {
  try {
    validateInjectionSource(mutate(source));
  } catch {
    continue;
  }
  throw new Error(`${label} source mutation unexpectedly accepted`);
}

const rustMutations = [
  [
    'clock bound',
    (v) => v.replace('MAXIMUM_CLOCK_SAMPLES: usize = 1024', 'MAXIMUM_CLOCK_SAMPLES: usize = 0'),
  ],
  [
    'memory bound',
    (v) =>
      v.replace(
        'MAXIMUM_MEMORY_BUDGET_BYTES: u64 = 4_294_967_296',
        'MAXIMUM_MEMORY_BUDGET_BYTES: u64 = u64::MAX',
      ),
  ],
  ['queue', (v) => v.replace('pub struct DeterministicInputs {', 'struct DeterministicInputs {')],
  ['ledger', (v) => v.replace('pub struct MemoryLedger {', 'struct MemoryLedger {')],
  ['allocation identity', (v) => v.replace('pub struct AllocationId {', 'struct AllocationId {')],
  ['mismatch', (v) => v.replaceAll('return Err(InjectionError::InputMismatch);', '')],
  ['budget failure', (v) => v.replaceAll('return Err(InjectionError::MemoryBudgetExceeded);', '')],
  ['ambient time', (v) => `${v}\nconst X: &str = "std::time";`],
  ['ambient random', (v) => `${v}\nconst X: &str = "getrandom";`],
];
for (const [label, mutate] of rustMutations) {
  try {
    validateInjectionRust(mutate(rust));
  } catch {
    continue;
  }
  throw new Error(`${label} Rust mutation unexpectedly accepted`);
}

process.stdout.write(
  `PASS deterministic injection rejection canaries: ${policyMutations.length + resolutionMutations.length + sourceMutations.length + rustMutations.length} mutations rejected\n`,
);

#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateExplicitCopyPolicy,
  validateExplicitCopyResolution,
  validateExplicitCopySource,
} from './check-explicit-copy-buffer.mjs';
import { ensureWasmTools } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(
    new URL('../../docs/architecture/explicit-copy-buffer-transport-v1.json', import.meta.url),
  ),
);
const source = readFileSync(path.join(repository, policy.implementation.path), 'utf8');
const executable = await ensureWasmTools();
const resolution = JSON.parse(
  execFileSync(executable, ['component', 'wit', policy.current.path, '--json'], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }),
);

const policyMutations = [
  ['schema', (v) => (v.schema = 'helix.explicit-copy-buffer-transport/2')],
  ['owner', (v) => (v.plan_item = 'P04-007')],
  ['base rewrite', (v) => (v.base.immutable = false)],
  ['current package', (v) => (v.current.package = 'helix:core-abi@5.1.0')],
  ['accepted base', (v) => v.current.accepted.push({ major: 4, minor: 0 })],
  ['implementation path', (v) => (v.implementation.path = 'crates/helix-core/src/lib.rs')],
  ['operation removed', (v) => v.operations.pop()],
  ['buffer bound', (v) => (v.bounds.maximum_buffer_bytes += 1)],
  ['transfer bound', (v) => (v.bounds.maximum_transfer_bytes_per_call = 0)],
  ['alias copy', (v) => (v.rules.read_result_is_detached_from_source = false)],
  ['short read anywhere', (v) => (v.rules.read_shortens_only_at_end_of_buffer = false)],
  ['read past end', (v) => (v.rules.read_past_end_fails = false)],
  ['write gap', (v) => (v.rules.write_cannot_create_uninitialized_gap = false)],
  ['variable capacity', (v) => (v.rules.write_capacity_is_fixed = false)],
  ['partial source', (v) => (v.rules.copy_source_range_is_exact = false)],
  ['mutation first', (v) => (v.rules.all_validation_precedes_mutation = false)],
  ['failure mutation', (v) => (v.rules.failure_leaves_target_unchanged = false)],
  ['source mutation', (v) => (v.rules.immutable_source_never_mutates = false)],
  ['pointer crossing', (v) => (v.rules.no_alias_or_pointer_crosses_boundary = false)],
  ['zero-copy claim', (v) => (v.rules.no_mapping_shared_memory_or_zero_copy_claim = false)],
  ['error code', (v) => (v.errors.capacity_exceeded = 'INVALID')],
  ['implicit window', (v) => (v.versioning.implicit_4_0_acceptance = true)],
  ['binding overclaim', (v) => (v.claim_boundary.component_binding_present = true)],
  ['host overclaim', (v) => (v.claim_boundary.host_implementations_present = true)],
  ['alternative overclaim', (v) => (v.claim_boundary.alternative_transport_implemented = true)],
  ['database overclaim', (v) => (v.claim_boundary.database_functionality_added = true)],
];
for (const [label, mutate] of policyMutations) {
  const candidate = structuredClone(policy);
  mutate(candidate);
  try {
    validateExplicitCopyPolicy(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} policy mutation unexpectedly accepted`);
}

const interfaces = Object.fromEntries(
  resolution.interfaces.map((value, index) => [value.name, index]),
);
const resolutionMutations = [
  ['package', (v) => (v.packages[0].name = 'helix:core-abi@5.1.0')],
  ['type', (v) => delete v.interfaces[interfaces['host-resources']].types['immutable-read-result']],
  [
    'operation',
    (v) => delete v.interfaces[interfaces['host-resources']].functions['read-immutable'],
  ],
  [
    'async operation',
    (v) =>
      (v.interfaces[interfaces['host-resources']].functions['write-staging'].kind =
        'async-freestanding'),
  ],
  [
    'result',
    (v) =>
      (v.interfaces[interfaces['host-resources']].functions['copy-immutable-to-staging'].result =
        null),
  ],
  ['import', (v) => delete v.worlds[0].imports[Object.keys(v.worlds[0].imports)[0]]],
  ['export', (v) => delete v.worlds[0].exports[Object.keys(v.worlds[0].exports)[0]]],
];
for (const [label, mutate] of resolutionMutations) {
  const candidate = structuredClone(resolution);
  mutate(candidate);
  try {
    validateExplicitCopyResolution(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} resolution mutation unexpectedly accepted`);
}

const sourceMutations = [
  ['maximum', (v) => v.replace('16 * 1024 * 1024', '8 * 1024 * 1024')],
  ['immutable', (v) => v.replace('pub struct ImmutableBuffer', 'struct ImmutableBuffer')],
  ['write', (v) => v.replace('pub fn write(', 'fn write(')],
  ['copy primitive', (v) => v.replace('.copy_from_slice(source);', '.fill(0);')],
  ['unsafe', (v) => `${v}\nunsafe { core::hint::unreachable_unchecked() }`],
];
for (const [label, mutate] of sourceMutations) {
  try {
    validateExplicitCopySource(mutate(source));
  } catch {
    continue;
  }
  throw new Error(`${label} source mutation unexpectedly accepted`);
}

execFileSync('cargo', ['test', '--locked', '--package', 'helix-core', 'explicit_copy::tests'], {
  cwd: repository,
  stdio: 'inherit',
  env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
});
process.stdout.write(
  `PASS explicit-copy rejection canaries: ${policyMutations.length + resolutionMutations.length + sourceMutations.length} mutations rejected\n`,
);

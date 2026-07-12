#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateCapabilityPolicy,
  validateCapabilityResolution,
} from './check-host-capabilities.mjs';
import { ensureWasmTools } from './install-wasm-tools.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(new URL('../../docs/architecture/host-capability-abi-v1.json', import.meta.url)),
);
const executable = await ensureWasmTools();
const resolution = JSON.parse(
  execFileSync(executable, ['component', 'wit', policy.current.path, '--json'], {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }),
);
const policyMutations = [
  ['schema', (value) => (value.schema = 'helix.host-capability-abi/2')],
  ['owner', (value) => (value.plan_item = 'P04-004')],
  ['rewrite base', (value) => (value.base.immutable = false)],
  ['base hash', (value) => (value.base.sha256 = '0'.repeat(64))],
  ['package', (value) => (value.current.package = 'helix:core-abi@1.0.0')],
  ['current hash', (value) => (value.current.sha256 = '0'.repeat(64))],
  ['accepted 1.0', (value) => value.current.accepted.push({ major: 1, minor: 0 })],
  ['remove interface', (value) => value.interfaces.pop()],
  ['remove capability kind', (value) => value.capability_kinds.pop()],
  ['remove capability', (value) => delete value.capability_interfaces['host-secrets']],
  ['zero bound', (value) => (value.bounds.maximum_secret_bytes = 0)],
  ['remove rule', (value) => delete value.rules.revocation_fails_closed],
  ['ambient root', (value) => (value.rules.wildcards_and_ambient_roots_forbidden = false)],
  ['document metrics', (value) => (value.rules.metrics_forbid_document_content = false)],
  [
    'secret leak',
    (value) => (value.rules.secret_values_forbidden_in_descriptors_errors_metrics_and_logs = false),
  ],
  [
    'SemVer compatibility',
    (value) => (value.versioning.package_semver_alone_is_not_compatibility = false),
  ],
  ['implicit window', (value) => (value.versioning.implicit_1_0_acceptance = true)],
  ['operation overclaim', (value) => (value.claim_boundary.capability_operations_defined = true)],
  ['binding overclaim', (value) => (value.claim_boundary.wit_bound_into_component = true)],
  ['host overclaim', (value) => (value.claim_boundary.host_implementations_present = true)],
  ['database overclaim', (value) => (value.claim_boundary.database_functionality_added = true)],
];
for (const [label, mutate] of policyMutations) {
  const candidate = structuredClone(policy);
  mutate(candidate);
  try {
    validateCapabilityPolicy(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} policy mutation unexpectedly accepted`);
}

const resolutionMutations = [
  ['package', (value) => (value.packages[0].name = 'helix:core-abi@1.2.0')],
  ['interface', (value) => value.interfaces.pop()],
  ['resource', (value) => delete value.interfaces[1].types['file-capability']],
  ['operation', (value) => (value.interfaces[1].functions.read = {})],
  ['import', (value) => delete value.worlds[0].imports[Object.keys(value.worlds[0].imports)[0]]],
  ['export', (value) => delete value.worlds[0].exports[Object.keys(value.worlds[0].exports)[0]]],
];
for (const [label, mutate] of resolutionMutations) {
  const candidate = structuredClone(resolution);
  mutate(candidate);
  try {
    validateCapabilityResolution(candidate);
  } catch {
    continue;
  }
  throw new Error(`${label} resolution mutation unexpectedly accepted`);
}

process.stdout.write(
  `PASS host capability rejection canaries: ${policyMutations.length + resolutionMutations.length} mutations rejected\n`,
);

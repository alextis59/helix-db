#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policy = JSON.parse(
  readFileSync(path.join(repository, 'docs/architecture/deterministic-core-boundary-v1.json')),
);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (actual, expected, label) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);
};
const exactKeys = (value, keys, label) => same(Object.keys(value), keys, `${label} fields`);

export const validatePolicy = (candidate = policy) => {
  exactKeys(
    candidate,
    [
      'schema',
      'plan_item',
      'core_crate',
      'core_module',
      'deterministic_workspace_crates',
      'allowed_direct_dependencies',
      'forbidden_workspace_dependencies',
      'forbidden_dependency_names',
      'forbidden_source_patterns',
      'forbidden_browser_wasm_imports',
      'ambient_categories',
      'explicit_input_rule',
      'decision_rule',
      'failure_rule',
      'wasm',
      'claim_boundary',
    ],
    'deterministic policy',
  );
  assert(candidate.schema === 'helix.deterministic-core-boundary/1', 'policy schema');
  assert(candidate.plan_item === 'P04-002', 'policy owner');
  assert(candidate.core_crate === 'helix-core', 'core crate');
  assert(candidate.core_module === 'crates/helix-core/src/deterministic.rs', 'core module');
  same(
    candidate.deterministic_workspace_crates,
    ['helix-doc', 'helix-query', 'helix-storage', 'helix-columnar', 'helix-core'],
    'deterministic crates',
  );
  same(
    candidate.allowed_direct_dependencies,
    ['helix-columnar', 'helix-doc', 'helix-query', 'helix-storage'],
    'direct dependencies',
  );
  same(
    candidate.forbidden_workspace_dependencies,
    ['helix-gpu', 'helix-host-native', 'helix-server'],
    'forbidden workspace dependencies',
  );
  assert(candidate.forbidden_dependency_names.length === 12, 'forbidden dependency count');
  assert(candidate.forbidden_source_patterns.length === 14, 'forbidden source-pattern count');
  assert(candidate.forbidden_browser_wasm_imports === true, 'browser import gate');
  assert(candidate.ambient_categories.length === 12, 'ambient category count');
  assert(candidate.explicit_input_rule.startsWith('ambient-results-enter-only'), 'explicit inputs');
  assert(candidate.decision_rule.includes('must-not-discover-ambient-state'), 'decision rule');
  assert(candidate.failure_rule.includes('versioned-helix-error'), 'failure rule');
  same(
    candidate.wasm,
    {
      browser_target: 'wasm32-unknown-unknown',
      browser_artifact: 'target/wasm32-unknown-unknown/browser/helix_core.wasm',
      required_imports: [],
      component_binding_owner: 'P04-003',
    },
    'Wasm policy',
  );
  same(
    candidate.claim_boundary,
    {
      deterministic_module_separated: true,
      ambient_source_and_dependency_gate_active: true,
      browser_zero_import_gate_active: true,
      capability_interfaces_implemented: false,
      host_implementations_present: false,
      deterministic_database_orchestration_present: false,
      next_implementation_owner: 'P04-003',
    },
    'claim boundary',
  );
  return candidate;
};

export const validateSourceText = (source, sourcePolicy = policy, label = 'source') => {
  for (const pattern of sourcePolicy.forbidden_source_patterns) {
    assert(!source.includes(pattern), `${label}: forbidden ambient pattern ${pattern}`);
  }
  assert(!source.includes('unsafe {'), `${label}: unsafe block`);
  assert(!source.includes('extern "C"'), `${label}: native extern boundary`);
  return source;
};

const rustFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return rustFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.rs') ? [absolute] : [];
  });

const run = () => {
  assert(process.argv.length === 2, 'usage: node tests/toolchain/check-deterministic-core.mjs');
  validatePolicy();
  const metadata = JSON.parse(
    execFileSync('cargo', ['metadata', '--format-version', '1', '--frozen'], {
      cwd: repository,
      encoding: 'utf8',
      env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
  const packages = new Map(metadata.packages.map((entry) => [entry.id, entry]));
  const core = metadata.packages.find(({ name }) => name === policy.core_crate);
  assert(core, 'core package absent');
  same(
    core.dependencies.filter(({ source }) => source === null).map(({ name }) => name),
    policy.allowed_direct_dependencies,
    'live direct dependencies',
  );
  const nodeById = new Map(metadata.resolve.nodes.map((entry) => [entry.id, entry]));
  const closure = new Set();
  const pending = [core.id];
  while (pending.length > 0) {
    const id = pending.pop();
    if (closure.has(id)) continue;
    closure.add(id);
    for (const dependency of nodeById.get(id)?.dependencies ?? []) pending.push(dependency);
  }
  const closureNames = [...closure].map((id) => packages.get(id).name);
  for (const name of [
    ...policy.forbidden_workspace_dependencies,
    ...policy.forbidden_dependency_names,
  ]) {
    assert(!closureNames.includes(name), `forbidden dependency ${name}`);
  }

  let scannedFiles = 0;
  for (const crate of policy.deterministic_workspace_crates) {
    const directory = path.join(repository, 'crates', crate, 'src');
    for (const file of rustFiles(directory)) {
      validateSourceText(readFileSync(file, 'utf8'), policy, path.relative(repository, file));
      scannedFiles += 1;
    }
  }
  assert(scannedFiles === 14, `deterministic Rust source inventory: ${scannedFiles}`);
  const coreModule = readFileSync(path.join(repository, policy.core_module), 'utf8');
  assert(
    coreModule.includes('pub const INTERNAL_DEPENDENCIES'),
    'deterministic composition module',
  );

  execFileSync(process.execPath, ['tests/toolchain/run-build-profile.mjs', 'browser'], {
    cwd: repository,
    stdio: 'inherit',
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
  });
  const wasm = readFileSync(path.join(repository, policy.wasm.browser_artifact));
  assert(WebAssembly.validate(wasm), 'browser Wasm validation');
  const imports = WebAssembly.Module.imports(new WebAssembly.Module(wasm));
  same(imports, policy.wasm.required_imports, 'browser Wasm imports');

  process.stdout.write(
    `PASS deterministic core boundary: ${scannedFiles} Rust files, ${closureNames.length} dependency packages, 0 forbidden ambient patterns\n`,
  );
  process.stdout.write(
    'PASS deterministic Wasm boundary: browser core has zero imports; capability/host implementation remains absent\n',
  );
};

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

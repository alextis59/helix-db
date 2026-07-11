#!/usr/bin/env node

import {
  assert,
  hostProfile,
  isSupportedNodeVersion,
  loadBootstrapContract,
  loadBootstrapSources,
  validateBootstrapContract,
  validateBootstrapSources,
} from './bootstrap-contract.mjs';

const expectRejection = (label, marker, base, mutate, validate) => {
  const candidate = structuredClone(base);
  mutate(candidate);
  let rejected = false;
  try {
    validate(candidate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(marker), `${label}: wrong rejection reason: ${message}`);
    rejected = true;
  }
  assert(rejected, `${label}: mutation unexpectedly passed`);
};

const contract = loadBootstrapContract();
const contractCases = [
  ['schema', 'bootstrap contract schema', (value) => (value.schema = 'helix.clean-bootstrap/2')],
  ['task', 'bootstrap contract task', (value) => (value.plan_item = 'P02-018')],
  ['status', 'bootstrap contract status', (value) => (value.status = 'production')],
  [
    'development name',
    'bootstrap repository identity mismatch',
    (value) => (value.repository.development_name = 'AlternativeDB'),
  ],
  [
    'public naming task',
    'bootstrap repository identity mismatch',
    (value) => (value.repository.public_name_decision = 'complete'),
  ],
  [
    'claim escalation',
    'bootstrap claim boundary',
    (value) => (value.claim_boundary = 'Production database bootstrap'),
  ],
  [
    'Node range',
    'bootstrap tool identities mismatch',
    (value) => (value.tools.node.supported_range = '>=22'),
  ],
  [
    'Node replay',
    'bootstrap tool identities mismatch',
    (value) => value.tools.node.ci_replay.pop(),
  ],
  [
    'npm launcher',
    'bootstrap tool identities mismatch',
    (value) => (value.tools.npm.launcher = 'npm'),
  ],
  [
    'Rust version',
    'bootstrap tool identities mismatch',
    (value) => (value.tools.rust.version = 'stable'),
  ],
  [
    'Rust component',
    'bootstrap tool identities mismatch',
    (value) => value.tools.rust.components.pop(),
  ],
  [
    'Rust target',
    'bootstrap tool identities mismatch',
    (value) => value.tools.rust.targets.push('wasm32-wasip3'),
  ],
  [
    'browser engine',
    'bootstrap tool identities mismatch',
    (value) => value.tools.playwright.engines.pop(),
  ],
  [
    'foundation command',
    'bootstrap profile contract mismatch',
    (value) => value.profiles[1].commands.pop(),
  ],
  [
    'browser privilege',
    'bootstrap profile contract mismatch',
    (value) => (value.profiles[2].privilege = 'none'),
  ],
  [
    'Linux gate host',
    'bootstrap profile contract mismatch',
    (value) => value.profiles[3].platforms.push('windows-x64'),
  ],
  [
    'troubleshooting code',
    'bootstrap troubleshooting identities mismatch',
    (value) => (value.troubleshooting[0].code = 'BOOT-NODE'),
  ],
  [
    'troubleshooting action',
    'troubleshooting action BOOT-WORKTREE: expected nonempty string',
    (value) => (value.troubleshooting.at(-1).action = ''),
  ],
  [
    'troubleshooting action drift',
    'bootstrap troubleshooting identities mismatch',
    (value) => (value.troubleshooting.at(-1).action = 'Delete the worktree.'),
  ],
];
for (const [label, marker, mutate] of contractCases) {
  expectRejection(label, marker, contract, mutate, validateBootstrapContract);
}

const sources = loadBootstrapSources();
validateBootstrapSources(contract, sources);
const sourceCases = [
  ['nvm recommendation', '.nvmrc recommendation', (value) => (value.nodeVersion = '24.18.0\n')],
  [
    'package engine',
    'package engines mismatch',
    (value) => (value.packageJson.engines.node = '>=22'),
  ],
  [
    'package manager',
    'package manager identity',
    (value) => (value.packageJson.packageManager = 'npm@latest'),
  ],
  [
    'package manager digest',
    'package manager identity',
    (value) =>
      (value.packageJson.packageManager = value.packageJson.packageManager.replace('4fae', '0000')),
  ],
  [
    'preflight alias',
    'bootstrap npm scripts mismatch',
    (value) => (value.packageJson.scripts['bootstrap:preflight'] = 'node preflight.mjs'),
  ],
  [
    'npm lifecycle policy',
    '.npmrc marker absent: strict-allow-scripts=true',
    (value) => (value.npmConfig = value.npmConfig.replace('strict-allow-scripts=true', '')),
  ],
  [
    'Rust toolchain',
    'Rust toolchain marker absent: channel = "1.96.1"',
    (value) => (value.rustToolchain = value.rustToolchain.replace('1.96.1', 'stable')),
  ],
  [
    'Cargo authority',
    'Cargo bootstrap metadata absent: clean-bootstrap-contract = "P02-017"',
    (value) =>
      (value.cargoToml = value.cargoToml.replace('clean-bootstrap-contract', 'bootstrap-contract')),
  ],
  [
    'Biome authority',
    'Biome bootstrap authority include',
    (value) =>
      (value.biome.files.includes = value.biome.files.includes.filter(
        (entry) => entry !== 'docs/development/*.json',
      )),
  ],
  [
    'CI task history',
    'bootstrap CI task history mismatch',
    (value) => value.matrix.plan_items.pop(),
  ],
  [
    'CI contract command',
    'CI bootstrap marker absent: corepack npm run bootstrap:test',
    (value) => (value.ci = value.ci.replace('corepack npm run bootstrap:test', '')),
  ],
  [
    'guide profile command',
    'bootstrap guide marker absent: corepack npm run examples:native',
    (value) => (value.guide = value.guide.replaceAll('corepack npm run examples:native', '')),
  ],
  [
    'guide output boundary',
    'bootstrap guide marker absent: target/sanitizer/',
    (value) => (value.guide = value.guide.replaceAll('target/sanitizer/', 'target/diagnostic/')),
  ],
  [
    'guide troubleshooting action',
    'bootstrap guide marker absent: Inspect and preserve the changes',
    (value) =>
      (value.guide = value.guide.replace('Inspect and preserve the changes', 'Discard changes')),
  ],
  [
    'root guide link',
    'root README: bootstrap guide link absent',
    (value) =>
      (value.rootReadme = value.rootReadme.replace('development/bootstrap.md', 'bootstrap.md')),
  ],
  [
    'stale contribution placeholder',
    'contributing guide retains pre-bootstrap placeholder',
    (value) => (value.contributing += '\nExact commands will be established by `P02-*`.\n'),
  ],
];
for (const [label, marker, mutate] of sourceCases) {
  expectRejection(label, marker, sources, mutate, (candidate) =>
    validateBootstrapSources(contract, candidate),
  );
}

const acceptedVersions = ['22.12.0', '22.23.1', '22.99.0', '24.11.0', '24.18.0'];
const rejectedVersions = ['21.99.0', '22.11.99', '23.0.0', '24.10.99', '25.0.0', 'v22.23.1'];
for (const version of acceptedVersions) {
  assert(isSupportedNodeVersion(version), `supported Node rejected: ${version}`);
}
for (const version of rejectedVersions) {
  assert(!isSupportedNodeVersion(version), `unsupported Node accepted: ${version}`);
}

const hosts = [
  ['linux', 'x64', 'linux-x64'],
  ['linux', 'arm64', 'linux-arm64'],
  ['win32', 'x64', 'windows-x64'],
  ['darwin', 'arm64', 'macos-arm64'],
  ['darwin', 'x64', 'macos-x64'],
  ['freebsd', 'x64', undefined],
  ['win32', 'arm64', 'windows-arm64'],
];
for (const [platform, architecture, expected] of hosts) {
  assert(
    hostProfile(platform, architecture) === expected,
    `host profile mismatch: ${platform}/${architecture}`,
  );
}

process.stdout.write(
  `PASS clean bootstrap rejection canaries: ${contractCases.length + sourceCases.length} contract/source mutations, ${acceptedVersions.length + rejectedVersions.length} Node boundaries, and ${hosts.length} host mappings verified\n`,
);

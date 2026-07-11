#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRustDependencyGraph } from './rust-dependency-contract.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (file) => JSON.parse(readFileSync(path.join(repository, file), 'utf8'));
const cargoLockBytes = readFileSync(path.join(repository, 'Cargo.lock'));
const metadata = JSON.parse(
  execFileSync('cargo', ['metadata', '--frozen', '--format-version', '1'], {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
    maxBuffer: 32 * 1024 * 1024,
  }),
);
const policy = readJson('tests/toolchain/dependency-policy.json').rust;
const licenseAuthority = readJson('.github/ci/rust-license-inventory.json');

const validate = ({
  cargoLock = cargoLockBytes,
  license = licenseAuthority,
  graph = metadata,
  rules = policy,
} = {}) =>
  validateRustDependencyGraph({
    cargoLockBytes: cargoLock,
    licenseAuthority: license,
    metadata: graph,
    policy: rules,
  });
const clone = (value) => structuredClone(value);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

validate();
const cases = [
  {
    label: 'unapproved license',
    marker: 'unapproved Rust license',
    candidate: () => {
      const graph = clone(metadata);
      graph.packages.find(({ name }) => name === 'crc').license = 'GPL-3.0-only';
      return { graph };
    },
  },
  {
    label: 'selected feature drift',
    marker: 'exact external Rust package allowlist',
    candidate: () => {
      const graph = clone(metadata);
      const blake = graph.packages.find(({ name }) => name === 'blake3');
      graph.resolve.nodes.find(({ id }) => id === blake.id).features.push('std');
      return { graph };
    },
  },
  {
    label: 'default feature drift',
    marker: 'direct Rust dependency configuration',
    candidate: () => {
      const graph = clone(metadata);
      graph.packages
        .find(({ name }) => name === 'helix-doc')
        .dependencies.find(({ name }) => name === 'blake3').uses_default_features = true;
      return { graph };
    },
  },
  {
    label: 'registry source drift',
    marker: 'lock source drift',
    candidate: () => ({
      cargoLock: Buffer.from(
        cargoLockBytes
          .toString('utf8')
          .replace(
            'source = "registry+https://github.com/rust-lang/crates.io-index"',
            'source = "git+https://example.invalid/source"',
          ),
      ),
    }),
  },
  {
    label: 'checksum allowlist drift',
    marker: 'exact external Rust package allowlist',
    candidate: () => {
      const rules = clone(policy);
      rules.external_packages[0].checksum = '0'.repeat(64);
      return { rules };
    },
  },
  {
    label: 'external package disabled',
    marker: 'external Rust packages are disabled',
    candidate: () => {
      const rules = clone(policy);
      rules.allow_external_packages = false;
      return { rules };
    },
  },
  {
    label: 'git source policy enabled',
    marker: 'Rust git sources must remain disabled',
    candidate: () => {
      const rules = clone(policy);
      rules.allow_git_sources = true;
      return { rules };
    },
  },
  {
    label: 'purpose removed',
    marker: 'dependency purpose too short',
    candidate: () => {
      const rules = clone(policy);
      rules.direct_dependencies[0].purpose = 'hash';
      return { rules };
    },
  },
  {
    label: 'license lock linkage',
    marker: 'Rust license authority Cargo.lock digest',
    candidate: () => {
      const license = clone(licenseAuthority);
      license.cargo_lock_sha256 = '0'.repeat(64);
      return { license };
    },
  },
  {
    label: 'license file digest',
    marker: 'license digest drift',
    candidate: () => {
      const license = clone(licenseAuthority);
      license.packages[0].license_files[0].sha256 = '0'.repeat(64);
      return { license };
    },
  },
  {
    label: 'license file omission',
    marker: 'license path inventory',
    candidate: () => {
      const license = clone(licenseAuthority);
      license.packages[1].license_files.pop();
      return { license };
    },
  },
];

for (const { candidate, label, marker } of cases) {
  let failure = '';
  try {
    validate(candidate());
  } catch (error) {
    failure = String(error);
  }
  assert(failure.includes(marker), `${label}: expected rejection marker absent: ${failure}`);
}

process.stdout.write(
  `PASS Rust dependency fail-closed contract: exact graph accepted and ${cases.length} source/feature/checksum/license mutations rejected\n`,
);

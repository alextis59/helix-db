#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

import {
  assert,
  expectedTools,
  hostProfile,
  isSupportedNodeVersion,
  loadBootstrapContract,
  repository,
  supportedPlatforms,
  validateBootstrapSources,
} from './bootstrap-contract.mjs';

const mode = process.argv[2];
assert(
  process.argv.length === 3 && ['contract', 'preflight'].includes(mode),
  'usage: node tests/toolchain/check-bootstrap.mjs <contract|preflight>',
);

const contract = loadBootstrapContract();
validateBootstrapSources(contract);

const run = (command, arguments_, label) => {
  const executable =
    process.platform === 'win32' && command === 'corepack' ? 'corepack.cmd' : command;
  const result = spawnSync(executable, arguments_, {
    cwd: repository,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 8 * 1024 * 1024,
    timeout: 60_000,
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  assert(result.status === 0, `${label}: exited ${result.status}: ${result.stderr.trim()}`);
  return result.stdout.trim();
};

const runPreflight = () => {
  const profile = hostProfile(process.platform, process.arch);
  assert(
    profile && supportedPlatforms.includes(profile),
    `unsupported bootstrap host: ${process.platform}/${process.arch}`,
  );

  const repositoryRoot = run('git', ['rev-parse', '--show-toplevel'], 'Git repository root');
  assert(
    repositoryRoot === repository,
    `bootstrap command must run in repository root: ${repositoryRoot}`,
  );
  const changes = run(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    'Git clean-worktree check',
  );
  assert(changes.length === 0, `BOOT-WORKTREE: clean checkout required:\n${changes}`);

  assert(
    isSupportedNodeVersion(process.versions.node),
    `BOOT-NODE-RANGE: Node ${process.versions.node}`,
  );
  const npmVersion = run('corepack', ['npm', '--version'], 'BOOT-NPM-PIN');
  assert(npmVersion === expectedTools.npm.version, `BOOT-NPM-PIN: npm ${npmVersion}`);

  const gitVersion = run('git', ['--version'], 'Git version');
  assert(/^git version \d+\.\d+/.test(gitVersion), `Git version output: ${gitVersion}`);
  const activeToolchain = run('rustup', ['show', 'active-toolchain'], 'BOOT-RUSTUP');
  assert(
    activeToolchain.startsWith(`${expectedTools.rust.version}-`),
    `BOOT-RUSTUP: ${activeToolchain}`,
  );
  const rustVersion = run('rustc', ['--version'], 'BOOT-RUSTUP');
  assert(
    rustVersion.startsWith(`rustc ${expectedTools.rust.version} `),
    `BOOT-RUSTUP: ${rustVersion}`,
  );
  const cargoVersion = run('cargo', ['--version'], 'BOOT-RUSTUP');
  assert(/^cargo 1\.96\./.test(cargoVersion), `BOOT-RUSTUP: ${cargoVersion}`);

  const components = run('rustup', ['component', 'list', '--installed'], 'BOOT-RUST-TARGET');
  for (const component of expectedTools.rust.components) {
    assert(
      components
        .split('\n')
        .some((entry) => entry === component || entry.startsWith(`${component}-`)),
      `BOOT-RUST-TARGET: component ${component} absent`,
    );
  }
  const targets = run('rustup', ['target', 'list', '--installed'], 'BOOT-RUST-TARGET');
  for (const target of expectedTools.rust.targets) {
    assert(targets.split('\n').includes(target), `BOOT-RUST-TARGET: target ${target} absent`);
  }

  if (process.platform === 'linux') {
    run('cc', ['--version'], 'BOOT-LINKER');
  } else if (process.platform === 'darwin') {
    run('xcrun', ['--find', 'clang'], 'BOOT-LINKER');
  } else {
    run('where.exe', ['cl.exe'], 'BOOT-LINKER');
  }

  const replay = expectedTools.node.ci_replay.includes(process.versions.node)
    ? 'exact CI replay line'
    : 'supported development line';
  process.stdout.write(
    `PASS clean bootstrap preflight: ${profile}, Node ${process.versions.node} (${replay}), npm ${npmVersion}, Rust ${expectedTools.rust.version}, clean worktree\n`,
  );
};

process.stdout.write(
  `PASS clean bootstrap contract: ${contract.profiles.length} profiles, ${supportedPlatforms.length} native hosts, ${contract.troubleshooting.length} troubleshooting codes, HDoc encoder active\n`,
);
if (mode === 'preflight') runPreflight();

#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const evidenceDirectory = path.join(repository, 'evidence/phase-02/P02-017');
const manifest = JSON.parse(readFileSync(path.join(evidenceDirectory, 'manifest.json'), 'utf8'));
const commitArgument = process.argv[2];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};
const same = (actual, expected, label) => {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBytes = (arguments_) =>
  execFileSync('git', arguments_, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (arguments_) => gitBytes(arguments_).toString('utf8');
const showBytes = (file, commit = manifest.commit) => gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.commit) => showBytes(file, commit).toString('utf8');

assert(commitArgument, 'usage: node evidence/phase-02/P02-017/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P02-017', 'evidence task mismatch');
same(
  manifest.requirements,
  ['INV-007', 'PLAT-001', 'PLAT-002', 'PLAT-003', 'QUAL-001'],
  'evidence requirements',
);
same(manifest.accepted_adrs, [], 'accepted ADR inventory');
same(manifest.source_commits, [commitArgument], 'source commit sequence');
assert(
  gitText(['rev-parse', `${commitArgument}^`]).trim() === manifest.base_commit,
  'source parent mismatch',
);
assert(
  gitText(['rev-parse', `${commitArgument}^{tree}`]).trim() === manifest.source_tree,
  'source tree mismatch',
);
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');

const changedRecords = gitText(['diff', '--name-status', manifest.base_commit, commitArgument])
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...parts] = line.split('\t');
    return { status, path: parts.at(-1) };
  });
same(
  changedRecords,
  manifest.source_artifacts.map(({ status, path: artifactPath }) => ({
    status,
    path: artifactPath,
  })),
  'exact source scope',
);
assert(changedRecords.length === 19, `source path count mismatch: ${changedRecords.length}`);
assert(
  changedRecords.every(({ status }) => ['A', 'M'].includes(status)),
  'source commit contains a deletion or unsupported status',
);
for (const artifact of manifest.source_artifacts) {
  const bytes = showBytes(artifact.path);
  assert(bytes.length === artifact.bytes, `${artifact.path}: byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: SHA-256 mismatch`);
}
for (const lock of ['Cargo.lock', 'package-lock.json']) {
  assert(
    sha256(showBytes(lock)) === sha256(showBytes(lock, manifest.base_commit)),
    `P02-017 changed ${lock} despite adding no dependency`,
  );
}

const retained = new Map();
for (const artifact of manifest.retained_artifacts) {
  const absolute = path.join(evidenceDirectory, artifact.path);
  const bytes = readFileSync(absolute);
  assert(bytes.length === artifact.bytes, `${artifact.path}: retained byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: retained SHA-256 mismatch`);
  retained.set(artifact.path, JSON.parse(bytes));
}
const verifierBytes = readFileSync(path.join(evidenceDirectory, 'verify.mjs'));
assert(
  statSync(path.join(evidenceDirectory, 'verify.mjs')).size === manifest.verifier.bytes,
  'verifier byte count mismatch',
);
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256 mismatch');

const preflight = retained.get('reports/clean-preflight.json');
same(
  Object.keys(preflight).sort(),
  [
    'schema',
    'plan_item',
    'source_commit',
    'source_tree',
    'recorded_at',
    'host',
    'lanes',
    'rust',
    'contract',
    'verdict',
  ].sort(),
  'preflight report fields',
);
assert(
  preflight.schema === 'helix.clean-bootstrap-preflight-evidence/1',
  'preflight report schema',
);
assert(preflight.plan_item === 'P02-017', 'preflight report task');
assert(preflight.source_commit === commitArgument, 'preflight source commit');
assert(preflight.source_tree === manifest.source_tree, 'preflight source tree');
assert(!Number.isNaN(Date.parse(preflight.recorded_at)), 'preflight timestamp');
same(
  preflight.host,
  {
    profile: 'linux-x64',
    operating_system: 'Linux 6.8.0-124-generic',
    architecture: 'x86_64',
    linker: 'cc (Ubuntu 11.4.0-1ubuntu1~22.04.3) 11.4.0',
  },
  'preflight host',
);
same(
  preflight.lanes,
  [
    {
      node: '22.19.0',
      classification: 'supported-development-line',
      corepack: '0.34.0',
      npm: '11.18.0',
      repository_clean: true,
      verdict: 'pass',
    },
    {
      node: '22.23.1',
      classification: 'exact-ci-replay-line',
      corepack: '0.34.6',
      npm: '11.18.0',
      repository_clean: true,
      verdict: 'pass',
    },
    {
      node: '24.18.0',
      classification: 'exact-ci-replay-line',
      corepack: '0.35.0',
      npm: '11.18.0',
      repository_clean: true,
      verdict: 'pass',
    },
  ],
  'preflight Node lanes',
);
same(
  preflight.rust,
  {
    rustc: '1.96.1 (31fca3adb 2026-06-26)',
    cargo: '1.96.1 (356927216 2026-06-26)',
    components: ['clippy', 'llvm-tools', 'rust-docs', 'rust-src', 'rustfmt'],
    targets: [
      'wasm32-unknown-unknown',
      'wasm32-wasip2',
      'x86_64-unknown-linux-gnuasan',
    ],
  },
  'preflight Rust tools',
);
same(
  preflight.contract,
  {
    profiles: 4,
    native_hosts: 5,
    browser_hosts: ['linux-x64'],
    troubleshooting_codes: 17,
    development_name: 'HelixDB',
    public_name_decision: 'P16-016',
    database_functionality: false,
  },
  'preflight contract summary',
);
assert(preflight.verdict === 'pass', 'preflight report verdict');

const replay = retained.get('reports/documented-command-replay.json');
same(
  Object.keys(replay).sort(),
  [
    'schema',
    'plan_item',
    'source_commit',
    'source_tree',
    'host',
    'profiles',
    'additional_checks',
    'verdict',
  ].sort(),
  'replay report fields',
);
assert(replay.schema === 'helix.documented-bootstrap-replay/1', 'replay report schema');
assert(replay.plan_item === 'P02-017', 'replay report task');
assert(replay.source_commit === commitArgument, 'replay source commit');
assert(replay.source_tree === manifest.source_tree, 'replay source tree');
assert(replay.host === 'linux-x64', 'replay host');
const sourceAuthority = JSON.parse(showText('docs/development/bootstrap.json'));
same(
  replay.profiles.map(({ id, commands }) => ({ id, commands })),
  sourceAuthority.profiles.map(({ id, commands }) => ({ id, commands })),
  'replayed documented profiles',
);
same(
  replay.profiles.map(({ id, node_lanes: nodeLanes, verdict }) => ({ id, nodeLanes, verdict })),
  [
    { id: 'contract', nodeLanes: ['22.23.1', '24.18.0'], verdict: 'pass' },
    { id: 'foundation', nodeLanes: ['22.23.1', '24.18.0'], verdict: 'pass' },
    { id: 'browser', nodeLanes: ['22.23.1'], verdict: 'pass' },
    { id: 'linux-x64-gates', nodeLanes: ['22.23.1'], verdict: 'pass' },
  ],
  'replay lane verdicts',
);
assert(
  replay.profiles[2].system_dependencies === 'preexisting-host-prerequisite',
  'browser system-dependency boundary',
);
same(replay.profiles[2].engines, ['chromium', 'firefox', 'webkit'], 'replayed browsers');
same(
  replay.additional_checks,
  {
    source_mutation_canaries: 35,
    evidence_mutation_canaries: 17,
    native_tests: 9,
    browser_engines: 3,
    hosted_workflow_execution: false,
    database_functionality: false,
  },
  'replay check summary',
);
assert(replay.verdict === 'pass', 'replay report verdict');

const run = (command, arguments_, options = {}) => {
  const label = options.label ?? `${command} ${arguments_.join(' ')}`;
  process.stdout.write(`RUN ${label}\n`);
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    maxBuffer: 128 * 1024 * 1024,
    timeout: options.timeout ?? 600_000,
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(
      `${label}: exited ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }
  return result;
};
const expectFailure = (command, arguments_, marker, options = {}) => {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    maxBuffer: 32 * 1024 * 1024,
    timeout: options.timeout ?? 120_000,
  });
  if (result.error) throw result.error;
  assert(result.status !== 0, `${options.label ?? command}: mutation unexpectedly passed`);
  const diagnostic = `${result.stdout}\n${result.stderr}`;
  assert(
    diagnostic.includes(marker),
    `${options.label ?? command}: expected rejection marker absent: ${marker}\n${diagnostic}`,
  );
};
const nodeEnvironment = (version) => {
  const binaryDirectory = path.join(os.homedir(), '.nvm', 'versions', 'node', `v${version}`, 'bin');
  const node = path.join(binaryDirectory, 'node');
  const corepack = path.join(binaryDirectory, 'corepack');
  assert(existsSync(node), `exact Node ${version} is not installed at ${node}`);
  assert(existsSync(corepack), `Corepack for Node ${version} is absent at ${corepack}`);
  return {
    node,
    corepack,
    env: {
      ...process.env,
      PATH: `${binaryDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
      NVM_BIN: binaryDirectory,
      CI: '1',
      NO_COLOR: '1',
      CARGO_NET_OFFLINE: 'true',
    },
  };
};

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-017-'));
try {
  const archive = gitBytes(['archive', '--format=tar', commitArgument]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  run('git', ['init', '--initial-branch=main'], { cwd: temporary, label: 'initialize replay Git repository' });
  run('git', ['config', 'user.name', 'P02-017 verifier'], {
    cwd: temporary,
    label: 'configure replay Git author',
  });
  run('git', ['config', 'user.email', 'p02-017@example.invalid'], {
    cwd: temporary,
    label: 'configure replay Git email',
  });
  run('git', ['add', '-A'], { cwd: temporary, label: 'stage replay source' });
  run('git', ['commit', '--no-gpg-sign', '-m', 'source replay'], {
    cwd: temporary,
    label: 'commit replay source',
  });

  const lockIdentities = Object.fromEntries(
    ['Cargo.lock', 'package-lock.json'].map((file) => [
      file,
      sha256(readFileSync(path.join(temporary, file))),
    ]),
  );
  const nodeLanes = ['22.23.1', '24.18.0'];
  for (const version of nodeLanes) {
    const tool = nodeEnvironment(version);
    const versionResult = run(tool.node, ['--version'], {
      cwd: temporary,
      env: tool.env,
      label: `Node ${version} identity`,
    });
    assert(versionResult.stdout.trim() === `v${version}`, `Node ${version} identity mismatch`);
    const corepackResult = run(tool.corepack, ['--version'], {
      cwd: temporary,
      env: tool.env,
      label: `Node ${version} Corepack identity`,
    });
    assert(
      corepackResult.stdout.trim() === (version === '22.23.1' ? '0.34.6' : '0.35.0'),
      `Node ${version} Corepack mismatch`,
    );
    const npmResult = run(tool.corepack, ['npm', '--version'], {
      cwd: temporary,
      env: tool.env,
      label: `Node ${version} npm identity`,
    });
    assert(npmResult.stdout.trim() === '11.18.0', `Node ${version} npm mismatch`);
    run(tool.corepack, ['npm', 'ci', '--ignore-scripts'], {
      cwd: temporary,
      env: tool.env,
      label: `Node ${version} clean script-suppressed install`,
    });
    for (const [script, marker] of [
      [
        'bootstrap:preflight',
        `PASS clean bootstrap preflight: linux-x64, Node ${version} (exact CI replay line), npm 11.18.0, Rust 1.96.1, clean worktree`,
      ],
      [
        'bootstrap:check',
        'PASS clean bootstrap contract: 4 profiles, 5 native hosts, 17 troubleshooting codes, database functionality false',
      ],
      [
        'bootstrap:test',
        'PASS clean bootstrap rejection canaries: 35 contract/source mutations, 11 Node boundaries, and 7 host mappings verified',
      ],
      ['policy:javascript', 'Checked 83 files'],
      ['policy:dependencies', 'PASS Rust policy: 8 MIT workspace packages, 0 external crates'],
      [
        'dependencies:check',
        'PASS dependency inventory: 91 npm development packages, 0 external Rust packages',
      ],
      ['toolchain:types', ''],
      ['fixtures:check', 'PASS fixture registry: 4 generators'],
      ['test', 'PASS all test suites: unit,integration,conformance,fuzz,browser,crash,benchmark,distributed'],
      ['examples:native', 'PASS native toolchain example: helix-host-native boundary-skeleton'],
      ['ci:check', 'PASS bootstrap: 4 documented profiles, 17 stable troubleshooting codes'],
    ]) {
      const result = run(tool.corepack, ['npm', 'run', script], {
        cwd: temporary,
        env: tool.env,
        label: `Node ${version} ${script}`,
      });
      if (marker) {
        assert(
          `${result.stdout}\n${result.stderr}`.includes(marker),
          `Node ${version} ${script}: pass marker absent`,
        );
      }
    }

    if (version === '22.23.1') {
      const examples = run(tool.corepack, ['npm', 'run', 'examples:check'], {
        cwd: temporary,
        env: tool.env,
        label: 'documented native and browser example build',
      });
      assert(examples.stdout.includes('database functionality false'), 'example claim boundary absent');
      run(tool.corepack, ['npm', 'run', 'browser:install'], {
        cwd: temporary,
        env: tool.env,
        timeout: 900_000,
        label: 'install pinned Chromium, Firefox, and WebKit revisions',
      });
      const browsers = run(tool.corepack, ['npm', 'run', 'browser:smoke'], {
        cwd: temporary,
        env: tool.env,
        timeout: 900_000,
        label: 'execute documented three-engine browser profile',
      });
      for (const marker of [
        '[chromium]',
        '[firefox]',
        '[webkit]',
        '3 passed',
        'PASS browser smoke all: 3 real-browser execution(s)',
      ]) {
        assert(browsers.stdout.includes(marker), `browser replay marker absent: ${marker}`);
      }
      for (const [command, arguments_, label] of [
        [tool.corepack, ['npm', 'run', 'wasm:validate'], 'validate documented portable artifacts'],
        [tool.corepack, ['npm', 'run', 'coverage:check'], 'run documented coverage gate'],
        [tool.node, ['tests/toolchain/run-build-profile.mjs', 'sanitizer'], 'run documented sanitizer'],
        [tool.corepack, ['npm', 'run', 'wgsl:validate'], 'run documented WGSL compiler gate'],
      ]) {
        run(command, arguments_, {
          cwd: temporary,
          env: tool.env,
          timeout: 900_000,
          label,
        });
      }
    }
  }

  const cargoEnvironment = {
    ...process.env,
    CARGO_NET_OFFLINE: 'true',
    NO_COLOR: '1',
  };
  for (const [arguments_, label] of [
    [['fmt', '--all', '--', '--check'], 'Rust formatting'],
    [
      ['check', '--frozen', '--workspace', '--all-targets', '--all-features'],
      'Rust frozen all-feature check',
    ],
    [
      ['clippy', '--frozen', '--workspace', '--all-targets', '--all-features', '--', '-D', 'warnings'],
      'Rust strict Clippy',
    ],
    [
      ['test', '--frozen', '--workspace', '--all-features', '--no-fail-fast'],
      'Rust all-feature tests',
    ],
  ]) {
    run('cargo', arguments_, { cwd: temporary, env: cargoEnvironment, label });
  }
  run('cargo', ['doc', '--frozen', '--workspace', '--no-deps', '--all-features'], {
    cwd: temporary,
    env: { ...cargoEnvironment, RUSTDOCFLAGS: '-D warnings' },
    label: 'warning-free Rust documentation',
  });

  for (const [file, identity] of Object.entries(lockIdentities)) {
    assert(sha256(readFileSync(path.join(temporary, file))) === identity, `${file} drifted in replay`);
  }
  const clean = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: temporary,
    label: 'clean replay worktree after positive commands',
  });
  assert(clean.stdout.trim() === '', `positive replay dirtied source:\n${clean.stdout}`);

  const node22 = nodeEnvironment('22.23.1');
  const mutations = [
    [
      'contract schema',
      'docs/development/bootstrap.json',
      (text) => text.replace('helix.clean-bootstrap/1', 'helix.clean-bootstrap/2'),
      'bootstrap contract schema',
    ],
    [
      'development name',
      'docs/development/bootstrap.json',
      (text) => text.replace('"development_name": "HelixDB"', '"development_name": "AlternativeDB"'),
      'bootstrap repository identity mismatch',
    ],
    [
      'deferred public name',
      'docs/development/bootstrap.json',
      (text) => text.replace('"public_name_decision": "P16-016"', '"public_name_decision": "complete"'),
      'bootstrap repository identity mismatch',
    ],
    [
      'claim escalation',
      'docs/development/bootstrap.json',
      (text) => text.replace('foundation setup and validation only', 'production database setup'),
      'bootstrap claim boundary',
    ],
    [
      'Node range widening',
      'docs/development/bootstrap.json',
      (text) => text.replace('>=22.12.0 <23 || >=24.11.0 <25', '>=22'),
      'bootstrap tool identities mismatch',
    ],
    [
      'browser host widening',
      'docs/development/bootstrap.json',
      (text) =>
        text.replace(
          '"id": "browser",\n      "platforms": ["linux-x64"]',
          '"id": "browser",\n      "platforms": ["linux-x64", "windows-x64"]',
        ),
      'bootstrap profile contract mismatch',
    ],
    [
      'troubleshooting action weakening',
      'docs/development/bootstrap.json',
      (text) => text.replace('never reset unknown work.', 'delete unknown work.'),
      'bootstrap troubleshooting identities mismatch',
    ],
    [
      'guide claim removal',
      'docs/development/bootstrap.md',
      (text) => text.replace('This contract documents foundation setup and validation only;', ''),
      'bootstrap guide marker absent',
    ],
    [
      'guide output-boundary removal',
      'docs/development/bootstrap.md',
      (text) => text.replaceAll('target/sanitizer/', 'target/diagnostic/'),
      'bootstrap guide marker absent: target/sanitizer/',
    ],
    [
      'preflight alias drift',
      'package.json',
      (text) =>
        text.replace(
          'node tests/toolchain/check-bootstrap.mjs preflight',
          'node tests/toolchain/check-bootstrap.mjs contract',
        ),
      'bootstrap npm scripts mismatch',
    ],
    [
      'package-manager digest drift',
      'package.json',
      (text) => text.replace('sha512.4fae', 'sha512.0000'),
      'package manager identity',
    ],
    [
      'Cargo authority removal',
      'Cargo.toml',
      (text) => text.replace('clean-bootstrap-contract', 'bootstrap-contract'),
      'Cargo bootstrap metadata absent',
    ],
    [
      'CI history removal',
      '.github/ci/matrix.json',
      (text) => text.replace(',\n    "P02-017"', ''),
      'bootstrap CI task history mismatch',
    ],
    [
      'workflow contract weakening',
      '.github/workflows/ci.yml',
      (text) => text.replace('          corepack npm run bootstrap:test\n', ''),
      'CI bootstrap marker absent',
    ],
    [
      'root guide unlink',
      'README.md',
      (text) => text.replace('docs/development/bootstrap.md', 'docs/bootstrap.md'),
      'root README: bootstrap guide link absent',
    ],
    [
      'stale contribution placeholder',
      'CONTRIBUTING.md',
      (text) => `${text}\nExact commands will be established by \`P02-*\`.\n`,
      'contributing guide retains pre-bootstrap placeholder',
    ],
  ];
  for (const [label, relativePath, transform, marker] of mutations) {
    const absolute = path.join(temporary, relativePath);
    const original = readFileSync(absolute, 'utf8');
    const mutated = transform(original);
    assert(mutated !== original, `${label}: mutation did not change source`);
    writeFileSync(absolute, mutated);
    try {
      expectFailure(
        node22.node,
        ['tests/toolchain/check-bootstrap.mjs', 'contract'],
        marker,
        { cwd: temporary, env: node22.env, label },
      );
    } finally {
      writeFileSync(absolute, original);
    }
  }
  const dirtyCanary = path.join(temporary, 'UNTRACKED_BOOTSTRAP_CANARY');
  writeFileSync(dirtyCanary, 'preserve me\n');
  try {
    expectFailure(
      node22.corepack,
      ['npm', 'run', 'bootstrap:preflight'],
      'BOOT-WORKTREE: clean checkout required',
      { cwd: temporary, env: node22.env, label: 'dirty-worktree preflight' },
    );
  } finally {
    rmSync(dirtyCanary);
  }
  const restoredContract = run(node22.corepack, ['npm', 'run', 'bootstrap:check'], {
    cwd: temporary,
    env: node22.env,
    label: 'restored bootstrap contract',
  });
  assert(restoredContract.stdout.includes('PASS clean bootstrap contract'), 'restored contract failed');
  const restoredCanaries = run(node22.corepack, ['npm', 'run', 'bootstrap:test'], {
    cwd: temporary,
    env: node22.env,
    label: 'restored bootstrap rejection canaries',
  });
  assert(
    restoredCanaries.stdout.includes('35 contract/source mutations'),
    'restored bootstrap canaries failed',
  );
  const restoredCi = run(node22.corepack, ['npm', 'run', 'ci:check'], {
    cwd: temporary,
    env: node22.env,
    label: 'restored CI contract',
  });
  assert(restoredCi.stdout.includes('PASS bootstrap: 4 documented profiles'), 'restored CI failed');
  const restoredStatus = run('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: temporary,
    label: 'restored replay worktree',
  });
  assert(restoredStatus.stdout.trim() === '', `mutation not restored:\n${restoredStatus.stdout}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

const workflowCheck = spawnSync(
  'python3',
  [
    '-c',
    [
      'import json, pathlib, yaml',
      'files=sorted(pathlib.Path(".github/workflows").glob("*.yml"))',
      'docs=[yaml.safe_load(path.read_text()) for path in files]',
      'print(json.dumps({"files":len(files),"jobs":sum(len(doc["jobs"]) for doc in docs),"steps":sum(len(job.get("steps",[])) for doc in docs for job in doc["jobs"].values())}))',
    ].join(';'),
  ],
  { cwd: repository, encoding: 'utf8' },
);
assert(workflowCheck.status === 0, `workflow YAML parse failed: ${workflowCheck.stderr}`);
same(JSON.parse(workflowCheck.stdout), { files: 3, jobs: 9, steps: 56 }, 'workflow inventory');

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', commitArgument])
  .trim()
  .split('\n')
  .filter(Boolean);
const markdownFiles = trackedFiles.filter((file) => file.endsWith('.md'));
let localLinks = 0;
for (const file of markdownFiles) {
  const source = showText(file);
  assert(source.endsWith('\n'), `${file}: missing terminal newline`);
  for (const [index, line] of source.split('\n').entries()) {
    assert(!/[ \t]+$/.test(line), `${file}:${index + 1}: trailing whitespace`);
  }
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let rawTarget = match[1].split('#')[0];
    if (!rawTarget || /^(https?:|mailto:)/.test(rawTarget)) continue;
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) rawTarget = rawTarget.slice(1, -1);
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)),
    );
    assert(
      target !== '..' && !target.startsWith('../'),
      `${file}: local link escapes repository: ${rawTarget}`,
    );
    gitText(['cat-file', '-e', `${commitArgument}:${target}`]);
    localLinks += 1;
  }
}
assert(markdownFiles.length === 156, `Markdown inventory mismatch: ${markdownFiles.length}`);
assert(localLinks === 1060, `local link count mismatch: ${localLinks}`);

const specificationIds = [
  ...showText('Specifications.md').matchAll(/^\| `([A-Z]+-\d{3})` \|/gm),
].map((match) => match[1]);
const requirementIds = [
  ...showText('docs/governance/requirements.md').matchAll(/^\| `([A-Z]+-\d{3})` \|/gm),
].map((match) => match[1]);
same(requirementIds.sort(), specificationIds.sort(), 'requirement ID reconciliation');
assert(specificationIds.length === 44, `specification requirement count: ${specificationIds.length}`);

same(
  manifest.verification,
  {
    source_artifacts: 19,
    retained_artifacts: 2,
    profiles: 4,
    native_hosts: 5,
    browser_hosts: 1,
    troubleshooting_codes: 17,
    source_rejection_canaries: 35,
    evidence_rejection_canaries: 17,
    total_rejection_canaries: 52,
    node_lanes: 2,
    native_tests: 9,
    browser_engines: 3,
    workflow_files: 3,
    workflow_jobs: 9,
    workflow_steps: 56,
    markdown_files: 156,
    local_links: 1060,
    specification_requirements: 44,
  },
  'manifest verification summary',
);

process.stdout.write(`PASS exact 19-path P02-017 source scope at ${commitArgument}\n`);
process.stdout.write(
  'PASS bootstrap authority: 4 profiles, 5 native hosts, 1 browser host, 17 troubleshooting codes\n',
);
process.stdout.write(
  'PASS exact replay: Node 22.23.1 and 24.18.0 clean installs/preflights/foundation profiles\n',
);
process.stdout.write(
  'PASS local boundary profiles: native example, 3 real browsers, Wasm, coverage, ASan, and WGSL\n',
);
process.stdout.write(
  'PASS rejection: 35 source canaries plus 17 isolated evidence mutations with clean restoration\n',
);
process.stdout.write(
  `PASS documentation: ${markdownFiles.length} Markdown files, ${localLinks} local links, 44 requirements\n`,
);

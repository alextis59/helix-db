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
const evidenceDirectory = path.join(repository, 'evidence/phase-02/P02-016');
const manifest = JSON.parse(readFileSync(path.join(evidenceDirectory, 'manifest.json'), 'utf8'));
const commitArgument = process.argv[2];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sorted = (values) => [...values].sort();
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
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const gitBytes = (arguments_) =>
  execFileSync('git', arguments_, { cwd: repository, maxBuffer: 128 * 1024 * 1024 });
const gitText = (arguments_) => gitBytes(arguments_).toString('utf8');
const showBytes = (file, commit = manifest.commit) =>
  gitBytes(['show', `${commit}:${file}`]);
const showText = (file, commit = manifest.commit) => showBytes(file, commit).toString('utf8');

assert(commitArgument, 'usage: node evidence/phase-02/P02-016/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P02-016', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(
  manifest.requirements,
  ['CORE-001', 'CORE-003', 'INV-003', 'INV-004', 'INV-007', 'PLAT-001', 'PLAT-002', 'PLAT-003', 'QUAL-001'],
  'evidence requirements',
);
same(manifest.accepted_adrs, [], 'accepted ADR inventory');
same(
  manifest.source_commits,
  [
    'bceba1253e612a7cfe8a26abbcf42c176c80824a',
    '77bcc130615617d2f7d2269d275e3677ba1f8e27',
  ],
  'source commit sequence',
);
assert(
  gitText(['rev-parse', `${manifest.source_commits[0]}^`]).trim() === manifest.base_commit,
  'first source parent mismatch',
);
assert(
  gitText(['rev-parse', `${manifest.source_commits[1]}^`]).trim() ===
    manifest.source_commits[0],
  'hardening source parent mismatch',
);
assert(
  commitArgument === manifest.source_commits.at(-1),
  'final source commit mismatch',
);
assert(
  gitText(['rev-parse', `${commitArgument}^{tree}`]).trim() === manifest.source_tree,
  'source tree mismatch',
);

const changedRecords = gitText([
  'diff',
  '--name-status',
  manifest.base_commit,
  commitArgument,
])
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...parts] = line.split('\t');
    return { status, path: parts.at(-1) };
  });
const recordedRecords = [...manifest.source_artifacts, ...manifest.deleted_artifacts].map(
  ({ status, path: artifactPath }) => ({ status, path: artifactPath }),
);
same(
  sorted(changedRecords.map((value) => JSON.stringify(value))),
  sorted(recordedRecords.map((value) => JSON.stringify(value))),
  'exact source scope',
);
assert(
  changedRecords.every(({ status }) => ['A', 'M', 'D'].includes(status)),
  'source commit contains an unsupported change status',
);
assert(
  manifest.source_artifacts.length === manifest.verification.source_artifacts,
  'source artifact count mismatch',
);
assert(
  manifest.deleted_artifacts.length === manifest.verification.deleted_artifacts,
  'deleted artifact count mismatch',
);
for (const artifact of manifest.source_artifacts) {
  const bytes = showBytes(artifact.path);
  assert(bytes.length === artifact.bytes, `${artifact.path}: byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: SHA-256 mismatch`);
}
for (const artifact of manifest.deleted_artifacts) {
  const bytes = showBytes(artifact.path, manifest.base_commit);
  assert(bytes.length === artifact.bytes, `${artifact.path}: deleted byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: deleted SHA-256 mismatch`);
  const lookup = spawnSync('git', ['cat-file', '-e', `${commitArgument}:${artifact.path}`], {
    cwd: repository,
  });
  assert(lookup.status !== 0, `${artifact.path}: deleted path still exists`);
}
for (const lock of ['Cargo.lock', 'package-lock.json']) {
  assert(
    sha256(showBytes(lock)) === sha256(showBytes(lock, manifest.base_commit)),
    `P02-016 changed ${lock} despite adding no external dependency`,
  );
}

assert(
  manifest.retained_artifacts.length === manifest.verification.retained_artifacts,
  'retained artifact count mismatch',
);
const retained = new Map();
for (const artifact of manifest.retained_artifacts) {
  const absolute = path.join(evidenceDirectory, artifact.path);
  const bytes = readFileSync(absolute);
  assert(bytes.length === artifact.bytes, `${artifact.path}: retained byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: retained SHA-256 mismatch`);
  retained.set(artifact.path, { bytes, value: JSON.parse(bytes) });
}
const verifierBytes = readFileSync(path.join(evidenceDirectory, 'verify.mjs'));
assert(
  statSync(path.join(evidenceDirectory, 'verify.mjs')).size === manifest.verifier.bytes,
  'verifier byte count mismatch',
);
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256 mismatch');

const sharedClaim =
  'These examples prove native linking and browser Wasm bundling only; they expose no document, query, storage, durability, GPU, network, compatibility, security, or release functionality.';
const nativeClaim =
  'This example proves native Rust linking only; database document, query, storage, durability, GPU, network, compatibility, security, and release functionality is not implemented.';
const expectedEngines = {
  chromium: {
    revision: '1228',
    browser_version: '149.0.7827.55',
    launcher_bytes: 278568152,
    launcher_sha256: '2d18db9d8608b052b6a552ee00ec1e830f93692e928b65ecc67d693bd33fe801',
  },
  firefox: {
    revision: '1532',
    browser_version: '151.0',
    launcher_bytes: 579040,
    launcher_sha256: '05fa1371ab7dd4ce2b2efea456aa0cc887f8c82a910d9ddc5ea5414071abbf03',
  },
  webkit: {
    revision: '2311',
    browser_version: '26.5',
    launcher_bytes: 3049,
    launcher_sha256: 'a85baad3d8c07173ac387a59b41500c382b21ed692afe0964d29aac247ccc63b',
  },
};

const validateNativeEvidence = (report) => {
  same(
    Object.keys(report).sort(),
    [
      'schema',
      'plan_item',
      'example',
      'component',
      'target',
      'database_functionality',
      'operations',
      'claim_boundary',
    ].sort(),
    'native retained fields',
  );
  assert(report.schema === 'helix.native-toolchain-example/1', 'native retained schema');
  assert(report.plan_item === 'P02-016', 'native retained task');
  assert(report.example === 'native-toolchain', 'native retained example');
  same(
    report.component,
    {
      name: 'helix-host-native',
      maturity: 'boundary-skeleton',
      required_dependencies: ['helix-core'],
    },
    'native retained component',
  );
  assert(report.target.operating_system === 'linux', 'native retained OS');
  assert(report.target.architecture === 'x86_64', 'native retained architecture');
  assert(report.database_functionality === false, 'native retained database claim');
  same(report.operations, [], 'native retained operations');
  assert(report.claim_boundary === nativeClaim, 'native retained claim boundary');
};
const validateBundleEvidence = (report) => {
  assert(report.schema === 'helix.browser-example-bundle-report/1', 'bundle retained schema');
  same(report.plan_items, ['P02-010', 'P02-016'], 'bundle retained task history');
  assert(report.example === 'examples/browser-toolchain', 'bundle retained example');
  assert(report.vite === '8.1.4' && report.target === 'es2022', 'bundle retained tools');
  assert(report.artifacts.length === 4, 'bundle retained artifact count');
  assert(
    report.artifacts.every(
      ({ path: artifactPath, bytes, sha256: artifactSha }) =>
        artifactPath.startsWith('dist/browser/') &&
        Number.isSafeInteger(bytes) &&
        bytes > 0 &&
        /^[0-9a-f]{64}$/.test(artifactSha),
    ),
    'bundle retained artifact identity',
  );
  const wasm = report.artifacts.find(({ path: artifactPath }) => artifactPath.endsWith('.wasm'));
  assert(wasm && wasm.bytes === 86, 'bundle retained Wasm bytes');
  assert(wasm.sha256 === report.wasm_source_sha256, 'bundle retained Wasm linkage');
  assert(report.database_functionality === false, 'bundle retained database claim');
  assert(report.claim_boundary === sharedClaim, 'bundle retained claim boundary');
  assert(report.verdict === 'pass', 'bundle retained verdict');
};
const validateBrowserEvidence = (report) => {
  assert(report.schema === 'helix.browser-execution-report/1', 'browser retained schema');
  assert(report.plan_item === 'P02-015', 'browser retention task');
  assert(report.selection === 'all', 'browser retained selection');
  assert(report.playwright_version === '1.61.1', 'browser retained Playwright');
  assert(
    Number.isSafeInteger(report.stats.duration_ms) && report.stats.duration_ms > 0,
    'browser retained duration',
  );
  same(
    {
      expected: report.stats.expected,
      skipped: report.stats.skipped,
      unexpected: report.stats.unexpected,
      flaky: report.stats.flaky,
    },
    { expected: 3, skipped: 0, unexpected: 0, flaky: 0 },
    'browser retained stats',
  );
  same(
    report.browser_identities,
    Object.entries(expectedEngines).map(([engine, identity]) => ({ engine, ...identity })),
    'browser retained engine identities',
  );
  same(
    report.tests.map(({ project }) => project),
    ['chromium', 'firefox', 'webkit'],
    'browser retained projects',
  );
  for (const test of report.tests) {
    assert(test.file === 'tests/browser/bundle-smoke.spec.ts', 'browser retained test path');
    assert(
      test.title === 'shows its non-database boundary and instantiates the bundled core Wasm',
      'browser retained test title',
    );
    assert(
      test.status === 'passed' &&
        test.expected_status === 'passed' &&
        test.retry === 0 &&
        test.errors.length === 0 &&
        test.attachments.length === 0,
      'browser retained test result',
    );
  }
  same(report.failures, [], 'browser retained failures');
  assert(report.verdict === 'pass', 'browser retained verdict');
};

const retainedNative = retained.get('reports/native-toolchain-example.json');
const retainedBundle = retained.get('reports/browser-bundle-example.json');
const retainedBrowser = retained.get('reports/browser-execution-all.json');
assert(retainedNative && retainedBundle && retainedBrowser, 'retained example reports absent');
assert(retainedNative.bytes.equals(jsonBytes(retainedNative.value)), 'native report noncanonical');
assert(retainedBundle.bytes.equals(jsonBytes(retainedBundle.value)), 'bundle report noncanonical');
assert(retainedBrowser.bytes.equals(jsonBytes(retainedBrowser.value)), 'browser report noncanonical');
validateNativeEvidence(retainedNative.value);
validateBundleEvidence(retainedBundle.value);
validateBrowserEvidence(retainedBrowser.value);

const policy = JSON.parse(showText('examples/examples.json'));
same(
  Object.keys(policy).sort(),
  ['schema', 'plan_item', 'claim_boundary', 'native', 'browser'].sort(),
  'example policy fields',
);
assert(policy.schema === 'helix.toolchain-examples/1', 'example policy schema');
assert(policy.plan_item === 'P02-016', 'example policy task');
assert(policy.claim_boundary === sharedClaim, 'example policy claim boundary');
assert(policy.native.state === 'active-boundary-example', 'native example state');
assert(policy.browser.state === 'active-boundary-example', 'browser example state');
assert(policy.native.command.includes('--locked'), 'native example is not locked');
assert(policy.native.command.includes('--offline'), 'native example is not offline');
assert(
  policy.native.command.includes('target/examples/native-toolchain'),
  'native example target boundary',
);
same(
  policy.browser.sources,
  [
    'examples/browser-toolchain/README.md',
    'examples/browser-toolchain/index.html',
    'examples/browser-toolchain/main.ts',
    'examples/browser-toolchain/report.ts',
  ],
  'browser example source inventory',
);
const nativeLock = showText('examples/native-toolchain/Cargo.lock');
assert(!/^source = /m.test(nativeLock) && !/^checksum = /m.test(nativeLock), 'native external dependency');
assert(
  showText('examples/native-toolchain/Cargo.toml').includes('default-features = false'),
  'native optional GPU boundary',
);
assert(
  showText('examples/browser-toolchain/index.html').includes(
    'Boundary skeleton — no database functionality',
  ),
  'browser visible maturity boundary',
);
assert(
  showText('examples/browser-toolchain/main.ts').includes('databaseFunctionality: false'),
  'browser runtime non-database boundary',
);
assert(
  !showText('examples/browser-toolchain/main.ts').includes('databaseFunctionality: true'),
  'browser runtime claim escalation',
);
const suites = JSON.parse(showText('tests/suites.json'));
const browserSuite = suites.suites.find(({ id }) => id === 'browser');
assert(browserSuite.state === 'active', 'browser suite is not active');
same(browserSuite.activation_tasks, [], 'browser suite activation tasks');
same(
  browserSuite.steps,
  ['browser-example-build', 'browser-harness-inventory'],
  'browser suite steps',
);
const matrix = JSON.parse(showText('.github/ci/matrix.json'));
assert(matrix.plan_items.at(-1) === 'P02-016', 'CI example task history');
assert(
  matrix.gating.browser.every(
    ({ execution, expansion_task: expansionTask }) =>
      execution === 'boundary-example' && expansionTask === 'P11-014',
  ),
  'CI browser example boundary',
);
assert(
  showText('.github/workflows/ci.yml').includes('corepack npm run examples:native'),
  'gating native example absent',
);
assert(
  showText('.github/workflows/ci-nightly.yml').includes('corepack npm run examples:native'),
  'nightly native example absent',
);
const retention = JSON.parse(showText('tests/toolchain/artifact-retention-policy.json'));
const retainedBrowserProducer = retention.profiles
  .find(({ id }) => id === 'browser-reports')
  .producers.find(({ variant }) => variant === 'engine');
for (const source of ['examples/examples.json', ...policy.browser.sources]) {
  assert(retainedBrowserProducer.required_sources.includes(source), `retention omits ${source}`);
}

const requirementFamilies = [
  'INV',
  'PLAT',
  'CORE',
  'DATA',
  'QUERY',
  'STORE',
  'GPU',
  'DIST',
  'CACHE',
  'SYNC',
  'SEC',
  'OPS',
  'QUAL',
  'COMPAT',
];
const specificationRequirements = sorted(
  new Set(
    requirementFamilies.flatMap((family) =>
      [...showText('Specifications.md').matchAll(new RegExp(`\\b${family}-\\d{3}\\b`, 'g'))].map(
        ([id]) => id,
      ),
    ),
  ),
);
const ledgerRequirements = [
  ...showText('docs/governance/requirements.md').matchAll(/^\| `([A-Z]+-\d{3})` \|/gm),
].map((match) => match[1]);
same(sorted(ledgerRequirements), specificationRequirements, 'requirement ledger completeness');
assert(specificationRequirements.length === 44, 'requirement count');
const plan = showText('ImplementationPlan.md');
assert(
  plan.includes(
    '- [ ] **P02-016** Create minimal native and browser examples that prove the toolchain without implying database functionality.',
  ),
  'source commit prematurely checked P02-016',
);
for (const marker of [
  '- Completed checklist items: 56',
  '- Open checklist items: 466',
  '- Total checklist items: 522',
]) {
  assert(plan.includes(marker), `source plan count absent: ${marker}`);
}

const trackedFiles = gitText(['ls-tree', '-r', '--name-only', commitArgument])
  .trim()
  .split('\n')
  .filter(Boolean);
const trackedSet = new Set(trackedFiles);
const trackedDirectories = new Set();
for (const file of trackedFiles) {
  let directory = path.posix.dirname(file);
  while (directory !== '.') {
    trackedDirectories.add(directory);
    directory = path.posix.dirname(directory);
  }
}
const generatedPath =
  /(^|\/)(target|node_modules|dist|coverage|playwright-report|test-results|blob-report|\.vitest|\.vite)(\/|$)/;
same(
  trackedFiles.filter(
    (file) => generatedPath.test(file) || /\.(?:profraw|profdata|tsbuildinfo|tgz)$/.test(file),
  ),
  [],
  'tracked generated-output inventory',
);
const markdownFiles = trackedFiles.filter((file) => file.endsWith('.md'));
let localLinks = 0;
for (const file of markdownFiles) {
  const source = showText(file);
  assert(source.endsWith('\n'), `${file}: missing terminal newline`);
  for (const [index, line] of source.split('\n').entries()) {
    assert(!/[ \t]+$/.test(line), `${file}:${index + 1}: trailing whitespace`);
  }
  for (const match of source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    let rawTarget = match[1].trim();
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) rawTarget = rawTarget.slice(1, -1);
    rawTarget = rawTarget.split(/\s+"/)[0].split('#')[0];
    if (!rawTarget || /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(rawTarget);
    } catch {
      throw new Error(`${file}: malformed local link ${rawTarget}`);
    }
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), decoded));
    assert(target !== '..' && !target.startsWith('../'), `${file}: link escapes repository`);
    const normalized = target.endsWith('/') ? target.slice(0, -1) : target;
    assert(
      trackedSet.has(normalized) || trackedDirectories.has(normalized),
      `${file}: missing local link ${rawTarget}`,
    );
    localLinks += 1;
  }
}
assert(markdownFiles.length === manifest.verification.markdown_files, 'Markdown inventory');
assert(localLinks === manifest.verification.local_links, 'local link count');

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-016-'));
try {
  const archive = gitBytes(['archive', '--format=tar', commitArgument]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const baseEnvironment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  for (const name of [
    'FORCE_COLOR',
    'NO_COLOR',
    'GITHUB_ACTIONS',
    'GITHUB_RUN_ATTEMPT',
    'GITHUB_RUN_ID',
    'GITHUB_SHA',
    'RUSTFLAGS',
    'CARGO_ENCODED_RUSTFLAGS',
  ]) {
    delete baseEnvironment[name];
  }
  const execute = (program, arguments_, options = {}) => {
    const result = spawnSync(program, arguments_, {
      cwd: temporary,
      encoding: 'utf8',
      env: baseEnvironment,
      maxBuffer: 128 * 1024 * 1024,
      timeout: 900_000,
      ...options,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      throw new Error(
        `${program} ${arguments_.join(' ')} exited ${result.status ?? `by signal ${result.signal}`}\n${output.slice(-12000)}`,
      );
    }
    return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  };
  const executeResult = (program, arguments_, options = {}) =>
    spawnSync(program, arguments_, {
      cwd: temporary,
      encoding: 'utf8',
      env: baseEnvironment,
      maxBuffer: 128 * 1024 * 1024,
      timeout: 900_000,
      ...options,
    });
  const nodeEnvironment = (version) => {
    const nvmRoot = process.env.NVM_DIR ?? path.join(os.homedir(), '.nvm');
    const binaryDirectory = path.join(nvmRoot, 'versions/node', `v${version}`, 'bin');
    assert(existsSync(path.join(binaryDirectory, 'node')), `Node ${version} binary absent`);
    assert(existsSync(path.join(binaryDirectory, 'corepack')), `Node ${version} Corepack absent`);
    return {
      ...baseEnvironment,
      PATH: `${binaryDirectory}${path.delimiter}${baseEnvironment.PATH}`,
    };
  };
  const npm = (version, arguments_, options = {}) =>
    execute('corepack', ['npm', ...arguments_], {
      env: nodeEnvironment(version),
      ...options,
    });
  const npmResult = (version, arguments_, options = {}) =>
    executeResult('corepack', ['npm', ...arguments_], {
      env: nodeEnvironment(version),
      ...options,
    });
  const requireText = (output, marker, label) => {
    assert(output.includes(marker), `${label}: output marker absent: ${marker}`);
  };
  const expectFailure = (result, label, marker) => {
    if (result.error) throw result.error;
    assert(result.status !== 0, `${label}: mutation unexpectedly passed`);
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    assert(output.includes(marker), `${label}: failure marker absent: ${marker}\n${output}`);
  };

  execute('git', ['init', '--quiet']);
  execute('git', ['config', 'core.autocrlf', 'false']);
  execute('git', ['add', '--all']);
  execute('git', [
    '-c',
    'commit.gpgsign=false',
    '-c',
    'user.name=Helix Evidence',
    '-c',
    'user.email=evidence@helix-db.invalid',
    'commit',
    '--quiet',
    '--no-verify',
    '-m',
    'source snapshot',
  ]);
  assert(execute('git', ['rev-parse', 'HEAD^{tree}']).trim() === manifest.source_tree, 'extracted tree mismatch');

  const workflowSummary = JSON.parse(
    execute('python3', [
      '-c',
      [
        'import json, pathlib, yaml',
        "paths = sorted(pathlib.Path('.github/workflows').glob('*.yml'))",
        'out = []',
        'for p in paths:',
        "  data = yaml.load(p.read_text(encoding='utf-8'), Loader=yaml.BaseLoader)",
        "  out.append({'path': str(p), 'jobs': len(data['jobs']), 'steps': sum(len(job['steps']) for job in data['jobs'].values())})",
        'print(json.dumps(out))',
      ].join('\n'),
    ]),
  );
  same(
    workflowSummary,
    [
      { path: '.github/workflows/benchmark-baseline.yml', jobs: 1, steps: 7 },
      { path: '.github/workflows/ci-nightly.yml', jobs: 2, steps: 8 },
      { path: '.github/workflows/ci.yml', jobs: 6, steps: 40 },
    ],
    'independent workflow parse',
  );

  assert(execute('node', ['--version'], { env: nodeEnvironment('22.23.1') }).trim() === 'v22.23.1', 'Node 22 identity');
  npm('22.23.1', ['ci', '--ignore-scripts']);
  for (const script of [
    'policy:javascript',
    'policy:dependencies',
    'dependencies:check',
    'examples:test',
    'examples:check',
    'test:commands',
    'ci:check',
    'artifacts:policy',
    'artifacts:test',
    'toolchain:types',
  ]) {
    npm('22.23.1', ['run', script]);
  }
  npm('22.23.1', ['test']);
  assert(
    readFileSync(path.join(temporary, 'dist/validation/native-toolchain-example.json')).equals(
      retainedNative.bytes,
    ),
    'clean native report differs from retained report',
  );
  assert(
    readFileSync(path.join(temporary, 'dist/validation/browser-bundle-smoke.json')).equals(
      retainedBundle.bytes,
    ),
    'clean bundle report differs from retained report',
  );
  npm('22.23.1', ['run', 'browser:smoke']);
  validateBrowserEvidence(
    JSON.parse(readFileSync(path.join(temporary, 'dist/validation/browser-execution-all.json'))),
  );
  npm('22.23.1', ['run', 'wgsl:validate']);
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    npm('22.23.1', ['run', 'ci:browser-smoke', '--', engine]);
    requireText(
      npm('22.23.1', ['run', 'artifacts:browser-report', '--', engine]),
      `PASS retained artifacts browser-reports/${engine}`,
      `${engine} retained bundle`,
    );
    requireText(
      execute(
        'node',
        ['tests/toolchain/check-retained-artifacts.mjs', 'bundle', 'browser-reports', engine],
        { env: nodeEnvironment('22.23.1') },
      ),
      `PASS retained bundle browser-reports/${engine}`,
      `${engine} retained bundle check`,
    );
  }

  assert(execute('node', ['--version'], { env: nodeEnvironment('24.18.0') }).trim() === 'v24.18.0', 'Node 24 identity');
  npm('24.18.0', ['ci', '--ignore-scripts']);
  for (const script of [
    'policy:javascript',
    'policy:dependencies',
    'examples:test',
    'examples:check',
    'ci:check',
    'toolchain:types',
  ]) {
    npm('24.18.0', ['run', script]);
  }
  npm('24.18.0', ['test']);

  execute('cargo', ['fmt', '--all', '--', '--check']);
  execute('cargo', [
    'fmt',
    '--manifest-path',
    'examples/native-toolchain/Cargo.toml',
    '--',
    '--check',
  ]);
  execute('cargo', ['check', '--frozen', '--workspace', '--all-targets', '--all-features']);
  execute('cargo', [
    'clippy',
    '--frozen',
    '--workspace',
    '--all-targets',
    '--all-features',
    '--',
    '-D',
    'warnings',
  ]);
  execute('cargo', ['test', '--frozen', '--workspace', '--all-features', '--no-fail-fast']);
  execute('cargo', ['doc', '--frozen', '--workspace', '--no-deps', '--all-features'], {
    env: { ...baseEnvironment, RUSTDOCFLAGS: '-D warnings' },
  });
  execute('cargo', [
    'clippy',
    '--manifest-path',
    'examples/native-toolchain/Cargo.toml',
    '--locked',
    '--offline',
    '--target-dir',
    'target/examples/native-toolchain',
    '--',
    '-D',
    'warnings',
  ]);
  for (const target of ['wasm32-unknown-unknown', 'wasm32-wasip2']) {
    execute('cargo', [
      'clippy',
      '--frozen',
      '--target',
      target,
      '--package',
      'helix-core',
      '--',
      '-D',
      'warnings',
    ]);
  }
  execute('node', ['tests/toolchain/run-build-profile.mjs', 'sanitizer'], {
    env: nodeEnvironment('22.23.1'),
  });
  npm('22.23.1', ['run', 'coverage:check']);
  npm('22.23.1', ['run', 'wasm:install-validator']);
  npm('22.23.1', ['run', 'wasm:validate']);

  const cleanStatus = () => execute('git', ['status', '--porcelain', '--untracked-files=all']).trim();
  assert(cleanStatus() === '', 'clean replay changed tracked source');
  let evidenceCanaries = 0;
  const mutateText = (relativePath, transform, exercise) => {
    const absolute = path.join(temporary, relativePath);
    const original = readFileSync(absolute, 'utf8');
    const modified = transform(original);
    assert(modified !== original, `${relativePath}: mutation made no change`);
    writeFileSync(absolute, modified);
    try {
      exercise();
      evidenceCanaries += 1;
    } finally {
      writeFileSync(absolute, original);
    }
    assert(cleanStatus() === '', `${relativePath}: mutation was not restored`);
  };
  const mutateJson = (relativePath, transform, exercise) =>
    mutateText(
      relativePath,
      (source) => {
        const value = JSON.parse(source);
        transform(value);
        return jsonBytes(value).toString('utf8');
      },
      exercise,
    );
  const expectNpmFailure = (arguments_, label, marker) =>
    expectFailure(npmResult('22.23.1', arguments_), label, marker);

  mutateJson(
    'examples/examples.json',
    (value) => (value.schema = 'helix.toolchain-examples/2'),
    () => expectNpmFailure(['run', 'examples:policy'], 'policy schema', 'example policy schema'),
  );
  mutateJson(
    'examples/examples.json',
    (value) => (value.claim_boundary = 'Production database examples.'),
    () =>
      expectNpmFailure(
        ['run', 'examples:policy'],
        'policy claim escalation',
        'example policy claim boundary',
      ),
  );
  mutateJson(
    'examples/examples.json',
    (value) => value.native.command.push('--release'),
    () =>
      expectNpmFailure(
        ['run', 'examples:policy'],
        'native command injection',
        'native example contract mismatch',
      ),
  );
  mutateText(
    'examples/native-toolchain/src/main.rs',
    (source) => source.replace('"database_functionality":false', '"database_functionality":true'),
    () =>
      expectNpmFailure(
        ['run', 'examples:native'],
        'native database claim escalation',
        'native database functionality claim',
      ),
  );
  mutateText(
    'examples/native-toolchain/src/main.rs',
    (source) => source.replace('"operations":[]', '"operations":["open"]'),
    () =>
      expectNpmFailure(
        ['run', 'examples:native'],
        'native operation inflation',
        'native operation inventory mismatch',
      ),
  );
  mutateText(
    'examples/browser-toolchain/index.html',
    (source) => source.replace('Boundary skeleton — no database functionality', 'Boundary skeleton'),
    () =>
      expectNpmFailure(
        ['run', 'examples:policy'],
        'visible browser boundary removal',
        'browser visible boundary absent',
      ),
  );
  mutateText(
    'examples/browser-toolchain/main.ts',
    (source) => source.replace('databaseFunctionality: false', 'databaseFunctionality: true'),
    () =>
      expectNpmFailure(
        ['run', 'ci:browser-smoke', '--', 'chromium'],
        'browser database claim escalation',
        'Playwright exited 1',
      ),
  );
  mutateText(
    'examples/browser-toolchain/main.ts',
    (source) => source.replace("      'network-server',\n", ''),
    () =>
      expectNpmFailure(
        ['run', 'ci:browser-smoke', '--', 'chromium'],
        'browser omission weakening',
        'Playwright exited 1',
      ),
  );
  mutateText(
    'vite.config.ts',
    (source) => source.replace('examples/browser-toolchain', 'tests/browser/smoke-app'),
    () =>
      expectNpmFailure(
        ['run', 'toolchain:browser-profile'],
        'stale browser root',
        'Expected values to be strictly equal',
      ),
  );
  mutateJson(
    'tests/suites.json',
    (value) => (value.suites.find(({ id }) => id === 'browser').state = 'reserved'),
    () =>
      expectNpmFailure(
        ['run', 'test:commands'],
        'browser suite deactivation',
        'browser: reserved suite lacks an owner task',
      ),
  );
  mutateText(
    '.github/workflows/ci.yml',
    (source) => source.replace('          corepack npm run examples:native\n', ''),
    () =>
      expectNpmFailure(
        ['run', 'ci:check'],
        'gating native example removal',
        'gating workflow marker absent: corepack npm run examples:native',
      ),
  );
  mutateText(
    '.github/workflows/ci-nightly.yml',
    (source) => source.replace('          corepack npm run examples:native\n', ''),
    () =>
      expectNpmFailure(
        ['run', 'ci:check'],
        'nightly native example removal',
        'nightly workflow marker absent: corepack npm run examples:native',
      ),
  );
  mutateJson(
    '.github/ci/matrix.json',
    (value) => (value.gating.browser[0].execution = 'toolchain-smoke'),
    () =>
      expectNpmFailure(
        ['run', 'ci:check'],
        'browser matrix deactivation',
        'browser example/expansion boundary mismatch',
      ),
  );
  mutateJson(
    'tests/toolchain/artifact-retention-policy.json',
    (value) =>
      value.profiles
        .find(({ id }) => id === 'browser-reports')
        .producers[0].required_sources.shift(),
    () =>
      expectNpmFailure(
        ['run', 'artifacts:policy'],
        'browser source retention weakening',
        'browser-reports/engine producer contract mismatch',
      ),
  );
  mutateText(
    'vite.config.ts',
    (source) => source.replace("sourcemap: 'hidden'", 'sourcemap: true'),
    () =>
      expectNpmFailure(
        ['run', 'examples:browser'],
        'source-map disclosure',
        'hidden source map was disclosed from emitted JavaScript',
      ),
  );
  expectNpmFailure(
    ['run', 'examples:policy', '--', 'extra'],
    'example checker argument injection',
    'usage: node tests/toolchain/check-examples.mjs',
  );
  evidenceCanaries += 1;
  const escalatedNative = structuredClone(retainedNative.value);
  escalatedNative.database_functionality = true;
  let nativeRejected = false;
  try {
    validateNativeEvidence(escalatedNative);
  } catch (error) {
    assert(String(error).includes('native retained database claim'), 'native evidence rejection reason');
    nativeRejected = true;
  }
  assert(nativeRejected, 'native evidence claim escalation passed');
  evidenceCanaries += 1;
  const escalatedBundle = structuredClone(retainedBundle.value);
  escalatedBundle.database_functionality = true;
  let bundleRejected = false;
  try {
    validateBundleEvidence(escalatedBundle);
  } catch (error) {
    assert(String(error).includes('bundle retained database claim'), 'bundle evidence rejection reason');
    bundleRejected = true;
  }
  assert(bundleRejected, 'bundle evidence claim escalation passed');
  evidenceCanaries += 1;
  assert(evidenceCanaries === manifest.verification.evidence_rejection_canaries, 'evidence canary count');

  npm('22.23.1', ['run', 'examples:test']);
  npm('22.23.1', ['run', 'examples:check']);
  npm('22.23.1', ['run', 'test:browser']);
  npm('22.23.1', ['run', 'ci:check']);
  assert(cleanStatus() === '', 'restored replay changed tracked source');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write(
  `PASS P02-016 evidence: ${manifest.verification.source_artifacts} source artifacts, ${manifest.verification.deleted_artifacts} promoted fixture deletions, ${manifest.verification.retained_artifacts} retained reports\n`,
);
process.stdout.write(
  `PASS examples: 2 boundary examples, 9 hashable authorities, 5 native CI lanes, 3 real browser engines, database functionality false\n`,
);
process.stdout.write(
  `PASS verification: Node 22/24 clean aggregate replay, native/portable/ASan/coverage/Wasm/WGSL profiles, ${manifest.verification.total_rejection_canaries} total rejection canaries\n`,
);
process.stdout.write(
  'BOUNDARY hosted Windows/macOS/arm64 runs and GitHub service execution remain G02 evidence; no database or release functionality is claimed\n',
);

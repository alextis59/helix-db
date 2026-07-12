import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const authorityPath = 'docs/development/bootstrap.json';
export const claimBoundary =
  'This contract documents foundation setup and validation; HelixDB now includes safe deterministic HDoc encoding, whole-envelope validation, logical values, raw lookup, lossless tagged conversion, collection path-dictionary format/lifecycle, exact-1.0 closed-world negotiation, and immutable HDoc 1.0 golden vectors, while query, storage, durability, GPU execution, network service, public protocol/SDK, external compatibility adapters, security, performance, and release functionality remain unimplemented.';
export const expectedPackageManager =
  'npm@11.18.0+sha512.4faecce0be70366d1c67b1012c4adc1246354a6cc45bf589f92003073b05518d547403df1475c542d67a4845e22b4fafcd7cac0af02c7a96cc6814f09eb003fb';

export const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
export const canonical = (value) => {
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
export const same = (actual, expected, label) => {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};

const readText = (relativePath) => readFileSync(path.join(repository, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(readText(relativePath));
const strictKeys = (value, expected, label) => {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`);
  same(Object.keys(value).sort(), [...expected].sort(), `${label} fields`);
};
const nonempty = (value, label) => {
  assert(typeof value === 'string' && value.length > 0, `${label}: expected nonempty string`);
  assert(value.length <= 500, `${label}: exceeds 500 characters`);
  assert(
    ![...value].some((character) => {
      const point = character.codePointAt(0);
      return point !== undefined && (point <= 8 || (point >= 11 && point <= 31) || point === 127);
    }),
    `${label}: control character`,
  );
};

export const supportedPlatforms = [
  'linux-x64',
  'linux-arm64',
  'windows-x64',
  'macos-arm64',
  'macos-x64',
];
export const expectedTools = {
  git: {
    version_policy: 'supported-system-release',
    official_install: 'https://git-scm.com/book/en/v2/Getting-Started-Installing-Git',
  },
  node: {
    supported_range: '>=22.12.0 <23 || >=24.11.0 <25',
    recommended: '22.23.1',
    ci_replay: ['22.23.1', '24.18.0'],
    official_install: 'https://nodejs.org/en/download',
  },
  npm: {
    version: '11.18.0',
    launcher: 'corepack npm',
    install_command: 'corepack npm ci --ignore-scripts',
  },
  rust: {
    version: '1.96.1',
    profile: 'minimal',
    components: ['clippy', 'llvm-tools', 'rust-docs', 'rust-src', 'rustfmt'],
    targets: ['wasm32-unknown-unknown', 'wasm32-wasip2', 'x86_64-unknown-linux-gnuasan'],
    dependency_fetch_command: 'cargo fetch --locked',
    advisory_install_command: 'corepack npm run rust:audit:install',
    official_install: 'https://rust-lang.github.io/rustup/installation/',
    windows_prerequisites: 'https://rust-lang.github.io/rustup/installation/windows-msvc.html',
  },
  playwright: {
    version: '1.61.1',
    engines: ['chromium', 'firefox', 'webkit'],
    install_command: 'corepack npm run browser:install',
    linux_dependencies_command:
      'corepack npm exec -- playwright install-deps chromium firefox webkit',
    official_install: 'https://playwright.dev/docs/browsers',
  },
};

const expectedProfiles = [
  {
    id: 'contract',
    platforms: supportedPlatforms,
    network: 'conditional-for-first-corepack-resolution',
    privilege: 'user',
    commands: ['corepack npm run bootstrap:check', 'corepack npm run bootstrap:test'],
    outputs: [],
  },
  {
    id: 'foundation',
    platforms: supportedPlatforms,
    network: 'required-for-first-tool-and-package-install',
    privilege: 'user-after-system-prerequisites',
    commands: [
      'corepack npm ci --ignore-scripts',
      'cargo fetch --locked',
      'corepack npm run bootstrap:preflight',
      'corepack npm run policy:javascript',
      'corepack npm run policy:dependencies',
      'corepack npm run dependencies:check',
      'corepack npm run toolchain:types',
      'corepack npm run fixtures:check',
      'corepack npm test',
      'corepack npm run examples:native',
    ],
    outputs: ['target/', 'dist/validation/native-toolchain-example.json'],
  },
  {
    id: 'browser',
    platforms: ['linux-x64'],
    network: 'required-for-browser-install',
    privilege: 'linux-system-dependencies-only',
    commands: ['corepack npm run browser:install', 'corepack npm run browser:smoke'],
    outputs: [
      'dist/browser/',
      'dist/validation/browser-bundle-smoke.json',
      'dist/validation/browser-execution-{engine}.json',
    ],
  },
  {
    id: 'linux-x64-gates',
    platforms: ['linux-x64'],
    network: 'conditional-for-validator-and-browser-cache-misses',
    privilege: 'user-after-browser-system-dependencies',
    commands: [
      'corepack npm run wasm:validate',
      'corepack npm run coverage:check',
      'node tests/toolchain/run-build-profile.mjs sanitizer',
      'corepack npm run wgsl:validate',
    ],
    outputs: [
      'target/wasm/',
      'target/coverage/',
      'target/sanitizer/',
      'dist/validation/wasm-*.json',
      'dist/validation/rust-coverage.json',
      'dist/validation/wgsl-chromium.json',
    ],
  },
];

const expectedTroubleshooting = [
  [
    'BOOT-NODE-RANGE',
    'Node is outside the supported major-line ranges',
    'Select Node 22.23.1 or another version accepted by the declared engine range.',
  ],
  [
    'BOOT-NPM-PIN',
    'Corepack is absent or npm is not 11.18.0',
    'Install an official supported Node distribution and invoke the package manager through corepack npm.',
  ],
  [
    'BOOT-NPM-LOCK',
    'npm ci reports package.json and package-lock.json drift',
    'Do not edit the lock by hand; restore unintended drift or regenerate it in a focused dependency change.',
  ],
  [
    'BOOT-NPM-SCRIPTS',
    'A package lifecycle script is denied or requested',
    'Keep --ignore-scripts and the strict lifecycle policy; review any required script as a dependency-policy change.',
  ],
  [
    'BOOT-RUSTUP',
    'The pinned Rust toolchain does not activate',
    'Install rustup, enter the repository root, and let rust-toolchain.toml select Rust 1.96.1.',
  ],
  [
    'BOOT-RUST-TARGET',
    'A required Rust component or target is missing',
    'Run rustup component list --installed and rustup target list --installed from the repository root before repairing the pinned toolchain.',
  ],
  [
    'BOOT-CARGO-FETCH',
    'A frozen or offline Cargo command cannot find a locked registry crate',
    'With network access enabled for this explicit preparation step, run cargo fetch --locked; do not relax --frozen on validation commands.',
  ],
  [
    'BOOT-RUST-AUDIT',
    'The pinned cargo-audit binary, reviewed tool lock, or RustSec database is absent or rejected',
    'Run corepack npm run rust:audit:install, preserve any checksum or self-audit failure, and rerun the live dependency report with network access.',
  ],
  [
    'BOOT-LINKER',
    'A native link step cannot find a platform compiler or linker',
    'Install the platform build tools and use a shell where cc, Xcode clang, or MSVC cl.exe is discoverable.',
  ],
  [
    'BOOT-WASM-HOST',
    'The pinned component validator rejects the local operating system or architecture',
    'Run component validation on Linux x64 or rely on the declared Linux x64 CI lane; do not bypass validation.',
  ],
  [
    'BOOT-WASM-CACHE',
    'The validator cache is incomplete or fails an integrity check',
    'Preserve the error, remove only target/toolchain/wasm-tools and its ignored download cache, then rerun the pinned installer.',
  ],
  [
    'BOOT-BROWSER-BINARY',
    'Playwright cannot find a pinned browser executable',
    'Run corepack npm run browser:install as the same user that will run the smoke test.',
  ],
  [
    'BOOT-BROWSER-DEPS',
    'A Linux browser fails because shared libraries or system packages are absent',
    'Run the documented Playwright install-deps command with the system privilege appropriate to the machine.',
  ],
  [
    'BOOT-BROWSER-PORT',
    'The browser preview cannot bind 127.0.0.1:4173',
    'Stop the conflicting local listener; the fixed address and strict port are part of the test contract.',
  ],
  [
    'BOOT-BROWSER-NETWORK',
    'Browser download fails behind a proxy or private certificate authority',
    'Configure HTTPS_PROXY and NODE_EXTRA_CA_CERTS for the install; do not disable TLS verification.',
  ],
  [
    'BOOT-LINUX-GATE',
    'Coverage or AddressSanitizer is requested on another host profile',
    'Run the diagnostic on Linux x64 or use its CI lane; absence on another host is not a pass.',
  ],
  [
    'BOOT-WGSL',
    'WGSL validation cannot launch pinned Chromium with SwiftShader',
    'Provision the pinned Chromium browser and Linux dependencies, then keep the compile-only result distinct from GPU support.',
  ],
  [
    'BOOT-REPORT-STALE',
    'A retained report no longer matches its source authority',
    'Regenerate the producing check and then recollect the retained bundle; never edit a report into agreement.',
  ],
  [
    'BOOT-WORKTREE',
    'Bootstrap preflight finds tracked or untracked changes',
    'Inspect and preserve the changes, then run the clean-checkout proof in a separate worktree or clone; never reset unknown work.',
  ],
];

export const validateBootstrapContract = (candidate) => {
  strictKeys(
    candidate,
    [
      'schema',
      'plan_item',
      'status',
      'repository',
      'claim_boundary',
      'tools',
      'profiles',
      'troubleshooting',
    ],
    'bootstrap contract',
  );
  assert(candidate.schema === 'helix.clean-bootstrap/1', 'bootstrap contract schema');
  assert(candidate.plan_item === 'P02-017', 'bootstrap contract task');
  assert(candidate.status === 'active-foundation', 'bootstrap contract status');
  same(
    candidate.repository,
    {
      development_name: 'HelixDB',
      directory_name: 'helix-db',
      clone_url: 'https://github.com/alextis59/helix-db.git',
      default_branch: 'main',
      public_name_decision: 'P16-016',
    },
    'bootstrap repository identity',
  );
  assert(candidate.claim_boundary === claimBoundary, 'bootstrap claim boundary');
  same(candidate.tools, expectedTools, 'bootstrap tool identities');
  same(candidate.profiles, expectedProfiles, 'bootstrap profile contract');
  assert(Array.isArray(candidate.troubleshooting), 'bootstrap troubleshooting inventory');
  for (const [index, entry] of candidate.troubleshooting.entries()) {
    strictKeys(entry, ['code', 'condition', 'action'], `troubleshooting entry ${index}`);
    assert(/^BOOT-[A-Z-]+$/.test(entry.code), `troubleshooting code ${index}`);
    nonempty(entry.condition, `troubleshooting condition ${entry.code}`);
    nonempty(entry.action, `troubleshooting action ${entry.code}`);
  }
  same(
    candidate.troubleshooting.map(({ code, condition, action }) => [code, condition, action]),
    expectedTroubleshooting,
    'bootstrap troubleshooting identities',
  );
  return candidate;
};

export const loadBootstrapContract = () => validateBootstrapContract(readJson(authorityPath));

export const loadBootstrapSources = () => ({
  guide: readText('docs/development/bootstrap.md'),
  rootReadme: readText('README.md'),
  docsReadme: readText('docs/README.md'),
  contributing: readText('CONTRIBUTING.md'),
  toolchainReadme: readText('tests/toolchain/README.md'),
  githubReadme: readText('.github/README.md'),
  packageJson: readJson('package.json'),
  cargoToml: readText('Cargo.toml'),
  rustToolchain: readText('rust-toolchain.toml'),
  nodeVersion: readText('.nvmrc'),
  npmConfig: readText('.npmrc'),
  biome: readJson('biome.json'),
  matrix: readJson('.github/ci/matrix.json'),
  ci: readText('.github/workflows/ci.yml'),
});

export const validateBootstrapSources = (contract, sources = loadBootstrapSources()) => {
  assert(sources.nodeVersion === '22.23.1\n', '.nvmrc recommendation');
  same(
    sources.packageJson.engines,
    { node: expectedTools.node.supported_range, npm: '11.18.0' },
    'package engines',
  );
  assert(sources.packageJson.packageManager === expectedPackageManager, 'package manager identity');
  same(
    {
      'bootstrap:check': sources.packageJson.scripts['bootstrap:check'],
      'bootstrap:preflight': sources.packageJson.scripts['bootstrap:preflight'],
      'bootstrap:test': sources.packageJson.scripts['bootstrap:test'],
    },
    {
      'bootstrap:check': 'node tests/toolchain/check-bootstrap.mjs contract',
      'bootstrap:preflight': 'node tests/toolchain/check-bootstrap.mjs preflight',
      'bootstrap:test': 'node tests/toolchain/test-bootstrap-contract.mjs',
    },
    'bootstrap npm scripts',
  );
  for (const marker of [
    'engine-strict=true',
    'package-lock=true',
    'lockfile-version=3',
    'save-exact=true',
    'strict-allow-scripts=true',
  ]) {
    assert(sources.npmConfig.includes(marker), `.npmrc marker absent: ${marker}`);
  }
  for (const marker of [
    'channel = "1.96.1"',
    'profile = "minimal"',
    'components = ["clippy", "llvm-tools", "rust-docs", "rust-src", "rustfmt"]',
    'targets = ["wasm32-unknown-unknown", "wasm32-wasip2", "x86_64-unknown-linux-gnuasan"]',
  ]) {
    assert(sources.rustToolchain.includes(marker), `Rust toolchain marker absent: ${marker}`);
  }
  for (const marker of [
    'clean-bootstrap-contract = "P02-017"',
    'clean-bootstrap-authority = "docs/development/bootstrap.json"',
    'public-name-decision = "P16-016"',
  ]) {
    assert(sources.cargoToml.includes(marker), `Cargo bootstrap metadata absent: ${marker}`);
  }
  assert(
    sources.biome.files.includes.includes('docs/development/*.json'),
    'Biome bootstrap authority include',
  );
  same(
    sources.matrix.plan_items,
    [
      'P02-009',
      'P02-010',
      'P02-011',
      'P02-012',
      'P02-013',
      'P02-014',
      'P02-015',
      'P02-016',
      'P02-017',
      'P03-008',
      'P03-009',
      'P03-010',
      'P03-011',
      'P03-012',
      'P03-013',
      'P03-014',
      'P03-015',
      'P03-016',
      'P03-017',
      'P03-018',
      'P03-019',
      'P03-020',
      'P03-021',
      'P04-001',
      'P04-002',
      'P04-003',
      'P04-004',
    ],
    'bootstrap CI task history',
  );
  for (const marker of ['corepack npm run bootstrap:check', 'corepack npm run bootstrap:test']) {
    assert(sources.ci.includes(marker), `CI bootstrap marker absent: ${marker}`);
  }
  for (const marker of [
    '# Clean-machine Bootstrap and Development Commands',
    'Status: Accepted foundation procedure',
    contract.claim_boundary,
    ...Object.values(contract.tools).flatMap((tool) =>
      Object.values(tool).flatMap((value) => (Array.isArray(value) ? value : [value])),
    ),
    ...contract.profiles.flatMap((profile) =>
      Object.values(profile).flatMap((value) => (Array.isArray(value) ? value : [value])),
    ),
    ...contract.troubleshooting.flatMap(({ code, action }) => [code, action]),
  ]) {
    assert(sources.guide.includes(String(marker)), `bootstrap guide marker absent: ${marker}`);
  }
  for (const [label, text] of [
    ['root README', sources.rootReadme],
    ['documentation guide', sources.docsReadme],
    ['contributing guide', sources.contributing],
    ['toolchain README', sources.toolchainReadme],
    ['GitHub README', sources.githubReadme],
  ]) {
    assert(text.includes('development/bootstrap.md'), `${label}: bootstrap guide link absent`);
  }
  assert(
    !sources.contributing.includes('Exact commands will be established by `P02-*`'),
    'contributing guide retains pre-bootstrap placeholder',
  );
  assert(
    !sources.contributing.includes('Until then, record every manual verification command'),
    'contributing guide retains temporary validation instruction',
  );
  return sources;
};

export const isSupportedNodeVersion = (version) => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [, majorText, minorText] = match;
  const major = Number(majorText);
  const minor = Number(minorText);
  return (major === 22 && minor >= 12) || (major === 24 && minor >= 11);
};

export const hostProfile = (platform, architecture) => {
  const operatingSystem = { linux: 'linux', win32: 'windows', darwin: 'macos' }[platform];
  const machine = { x64: 'x64', arm64: 'arm64' }[architecture];
  return operatingSystem && machine ? `${operatingSystem}-${machine}` : undefined;
};

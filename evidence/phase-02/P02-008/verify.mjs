#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
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
const evidenceDirectory = path.join(repository, 'evidence/phase-02/P02-008');
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
const gitBytes = (args) =>
  execFileSync('git', args, {
    cwd: repository,
    maxBuffer: 64 * 1024 * 1024,
  });
const gitText = (args) => gitBytes(args).toString('utf8');
const showBytes = (file) => gitBytes(['show', `${manifest.commit}:${file}`]);
const showText = (file) => showBytes(file).toString('utf8');

assert(commitArgument, 'usage: node evidence/phase-02/P02-008/verify.mjs <commit>');
assert(/^[0-9a-f]{40}$/.test(commitArgument), 'commit must be a full lowercase SHA-1');
assert(commitArgument === manifest.commit, 'argument does not match manifest commit');
assert(
  gitText(['rev-parse', `${commitArgument}^{commit}`]).trim() === commitArgument,
  'source commit does not resolve exactly',
);
assert(manifest.schema_version === 1, 'evidence schema mismatch');
assert(manifest.task_id === 'P02-008', 'evidence task mismatch');
assert(manifest.verdict === 'pass', 'evidence verdict mismatch');
same(
  manifest.requirements,
  ['INV-004', 'INV-007', 'INV-010', 'CORE-003', 'QUAL-001', 'COMPAT-001'],
  'evidence requirements',
);
same(manifest.accepted_adrs, ['0001'], 'accepted ADR inventory');

const artifactPaths = manifest.artifacts.map(({ path: artifactPath }) => artifactPath);
same(sorted(artifactPaths), sorted(new Set(artifactPaths)), 'unique artifact paths');
assert(manifest.artifacts.length === 18, 'artifact count mismatch');
const changedRecords = gitText([
  'diff-tree',
  '--no-commit-id',
  '--name-status',
  '-r',
  `${commitArgument}^`,
  commitArgument,
])
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...parts] = line.split('\t');
    return { status, path: parts.at(-1) };
  });
same(
  sorted(changedRecords.map(({ path: changedPath }) => changedPath)),
  sorted(artifactPaths),
  'exact source-commit scope',
);
assert(
  changedRecords.every(({ status }) => status === 'A' || status === 'M'),
  `source commit contains unsupported status: ${JSON.stringify(changedRecords)}`,
);
for (const artifact of manifest.artifacts) {
  const bytes = showBytes(artifact.path);
  assert(bytes.length === artifact.bytes, `${artifact.path}: byte count mismatch`);
  assert(sha256(bytes) === artifact.sha256, `${artifact.path}: SHA-256 mismatch`);
}

const verifierPath = path.join(evidenceDirectory, 'verify.mjs');
const verifierBytes = readFileSync(verifierPath);
assert(statSync(verifierPath).size === manifest.verifier.bytes, 'verifier byte count mismatch');
assert(sha256(verifierBytes) === manifest.verifier.sha256, 'verifier SHA-256 mismatch');

const packageJson = JSON.parse(showText('package.json'));
assert(
  packageJson.scripts['fixtures:check'] === 'node fixtures/generation/check.mjs',
  'fixture check alias mismatch',
);
assert(
  packageJson.scripts['fixtures:generate'] === 'node fixtures/generation/generate.mjs --write',
  'fixture write alias mismatch',
);
const registry = JSON.parse(showText('fixtures/generation/registry-v1.json'));
const report = JSON.parse(showText('fixtures/generation/report-v1.json'));
const vector = JSON.parse(showText('fixtures/generation/vectors/splitmix64-v1.json'));
assert(registry.registry_schema === 'helix.fixture-generator-registry/1', 'registry mismatch');
same(
  registry.generators.map(({ id }) => id),
  [
    'toolchain.splitmix64-vectors',
    'semantics.corpus-v1',
    'semantics.oracle-report-v1',
    'compatibility.matrix-v1',
  ],
  'generator IDs',
);
assert(registry.generators.length === 4, 'generator count mismatch');
assert(registry.generators.flatMap(({ artifacts }) => artifacts).length === 5, 'authority count');
assert(registry.generators.filter(({ seed }) => seed !== null).length === 1, 'seed count');
assert(vector.vector_schema === 'helix.prng-vector/1', 'vector schema mismatch');
assert(vector.count === 16 && vector.outputs.length === 16, 'vector count mismatch');
assert(new Set(vector.outputs).size === 16, 'vector outputs are not unique');
assert(report.generation_report_schema === 'helix.fixture-generation-report/1', 'report schema');
assert(report.generators.length === 4 && report.verdict === 'pass', 'report verdict/count');
const registryBytes = showBytes('fixtures/generation/registry-v1.json');
same(
  report.registry,
  {
    path: 'fixtures/generation/registry-v1.json',
    bytes: registryBytes.length,
    sha256: sha256(registryBytes),
  },
  'report registry identity',
);
for (const schemaPath of [
  'fixtures/generation/schema/registry-v1.schema.json',
  'fixtures/generation/schema/prng-vector-v1.schema.json',
  'fixtures/generation/schema/report-v1.schema.json',
]) {
  const schema = JSON.parse(showText(schemaPath));
  assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', `${schemaPath}: draft`);
  assert(schema.additionalProperties === false, `${schemaPath}: unknown fields allowed`);
}
const generatorSource = showText('fixtures/generation/generate.mjs');
for (const forbidden of ['Math.random', 'randomBytes', 'randomUUID', 'Date.now', 'new Date', 'process.env']) {
  assert(!generatorSource.includes(forbidden), `ambient generator source: ${forbidden}`);
}
const policy = showText('docs/quality/deterministic-fixture-generation.md');
for (const marker of [
  '0x48454c4958444231',
  'non-cryptographic',
  'https://gee.cs.oswego.edu/dl/papers/oopsla14.pdf',
  'https://json-schema.org/draft/2020-12',
  'https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options',
  'The pinned MongoDB observations',
]) {
  assert(policy.includes(marker), `policy marker absent: ${marker}`);
}

const requirementFamilies =
  'INV|PLAT|CORE|DATA|QUERY|STORE|GPU|DIST|CACHE|SYNC|SEC|OPS|QUAL|COMPAT';
const requirementPattern = new RegExp(`\\b(?:${requirementFamilies})-\\d{3}\\b`, 'g');
const specificationRequirements = new Set(showText('Specifications.md').match(requirementPattern) ?? []);
const ledgerRequirements = new Set(
  showText('docs/governance/requirements.md').match(requirementPattern) ?? [],
);
assert(specificationRequirements.size === 44, 'specification requirement count mismatch');
same(sorted(ledgerRequirements), sorted(specificationRequirements), 'requirement ledger ID set');
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
    if (rawTarget.startsWith('<') && rawTarget.endsWith('>')) {
      rawTarget = rawTarget.slice(1, -1);
    }
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(file), decodeURIComponent(rawTarget)),
    );
    assert(target !== '..' && !target.startsWith('../'), `${file}: link escapes repository`);
    gitText(['cat-file', '-e', `${commitArgument}:${target}`]);
    localLinks += 1;
  }
}
assert(markdownFiles.length === 133, `Markdown inventory mismatch: ${markdownFiles.length}`);
assert(localLinks === 844, `local link count mismatch: ${localLinks}`);

const temporary = mkdtempSync(path.join(os.tmpdir(), 'helix-p02-008-'));
try {
  const archive = gitBytes(['archive', '--format=tar', commitArgument]);
  execFileSync('tar', ['-xf', '-', '-C', temporary], { input: archive });
  const baseEnvironment = { ...process.env, CARGO_NET_OFFLINE: 'true' };
  const run = (program, args, options = {}) => {
    try {
      return execFileSync(program, args, {
        cwd: temporary,
        encoding: 'utf8',
        env: baseEnvironment,
        maxBuffer: 64 * 1024 * 1024,
        timeout: 240_000,
        ...options,
      });
    } catch (error) {
      if (options.allowFailure === true) return error;
      throw error;
    }
  };
  const expectFailure = (program, args, label) => {
    const result = run(program, args, { allowFailure: true, stdio: 'pipe' });
    assert(result instanceof Error, `${label}: mutation was not rejected`);
  };
  const requireText = (output, marker, label) => {
    assert(output.includes(marker), `${label}: output marker absent: ${marker}`);
  };
  const shellQuote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
  const nvm = path.join(os.homedir(), '.nvm', 'nvm.sh');
  assert(existsSync(nvm), 'NVM installation absent for supported Node-lane replay');
  const runNvm = (version, args, environment = {}) =>
    run(
      'bash',
      [
        '-lc',
        `source ${shellQuote(nvm)} && nvm exec ${shellQuote(version)} ${args.map(shellQuote).join(' ')}`,
      ],
      { env: { ...baseEnvironment, ...environment } },
    );

  run('git', ['init', '--quiet']);
  run('git', ['add', '--all']);
  run('git', [
    '-c',
    'commit.gpgsign=false',
    '-c',
    'user.name=Helix Evidence',
    '-c',
    'user.email=evidence@invalid.example',
    'commit',
    '--quiet',
    '--no-verify',
    '-m',
    'source snapshot',
  ]);

  const packageLockPath = path.join(temporary, 'package-lock.json');
  const lockHash = sha256(readFileSync(packageLockPath));
  for (const version of ['22.23.1', '24.18.0']) {
    runNvm(version, ['corepack', 'npm', 'ci', '--ignore-scripts']);
    const javascript = runNvm(version, ['corepack', 'npm', 'run', 'policy:javascript']);
    requireText(javascript, 'Checked 39 files', `Biome on Node ${version}`);
    const dependencies = runNvm(version, ['corepack', 'npm', 'run', 'policy:dependencies']);
    requireText(dependencies, 'PASS npm policy: 91 dev packages', `dependency policy ${version}`);
    runNvm(version, ['corepack', 'npm', 'run', 'toolchain:types']);
    const fixtures = runNvm(version, ['corepack', 'npm', 'run', 'fixtures:check']);
    requireText(fixtures, 'PASS fixture registry: 4 generators', `fixture check ${version}`);
    requireText(
      fixtures,
      'PASS independent SplitMix64 reproduction: Python matches 16 JavaScript-generated words',
      `cross-language vector ${version}`,
    );
    const generation = runNvm(version, [
      'node',
      'fixtures/generation/generate.mjs',
      '--check',
    ]);
    requireText(generation, 'PASS deterministic generation: 4 generators', `generation ${version}`);
    assert(sha256(readFileSync(packageLockPath)) === lockHash, `lock drift on Node ${version}`);
  }
  const tests = runNvm('24.18.0', ['corepack', 'npm', 'test']);
  requireText(tests, 'PASS all test suites:', 'aggregate regression tests');
  const installScripts = JSON.parse(run('corepack', ['npm', 'install-scripts', 'ls', '--json']));
  same(installScripts.allowScripts, [], 'approved lifecycle scripts');
  run('cargo', ['fmt', '--all', '--', '--check']);
  run('cargo', ['check', '--frozen', '--workspace', '--all-targets', '--all-features']);
  run('cargo', [
    'clippy',
    '--frozen',
    '--workspace',
    '--all-targets',
    '--all-features',
    '--',
    '-D',
    'warnings',
  ]);
  run('cargo', ['doc', '--frozen', '--workspace', '--no-deps', '--all-features'], {
    env: { ...baseEnvironment, RUSTDOCFLAGS: '-D warnings' },
  });

  const vectorPath = path.join(temporary, 'fixtures/generation/vectors/splitmix64-v1.json');
  const reportPath = path.join(temporary, 'fixtures/generation/report-v1.json');
  const expectedVector = readFileSync(vectorPath);
  const expectedReport = readFileSync(reportPath);
  rmSync(path.dirname(vectorPath), { recursive: true });
  rmSync(reportPath);
  const firstWrite = runNvm('22.23.1', ['corepack', 'npm', 'run', 'fixtures:generate']);
  requireText(firstWrite, 'PASS deterministic generation: 4 generators', 'missing-output write');
  assert(readFileSync(vectorPath).equals(expectedVector), 'recreated vector bytes mismatch');
  assert(readFileSync(reportPath).equals(expectedReport), 'recreated report bytes mismatch');
  runNvm('24.18.0', ['node', 'fixtures/generation/generate.mjs', '--write'], {
    TZ: 'Pacific/Kiritimati',
    LANG: 'C',
  });
  assert(readFileSync(vectorPath).equals(expectedVector), 'timezone write changed vector');
  assert(readFileSync(reportPath).equals(expectedReport), 'timezone write changed report');
  run(process.execPath, ['fixtures/generation/check.mjs'], {
    env: { ...baseEnvironment, TZ: 'America/Adak', LANG: 'C.UTF-8' },
  });

  const registryPath = path.join(temporary, 'fixtures/generation/registry-v1.json');
  const registryOriginal = readFileSync(registryPath);
  const changedSeed = JSON.parse(registryOriginal.toString('utf8'));
  changedSeed.generators[0].seed = '0x48454c4958444232';
  writeFileSync(registryPath, `${JSON.stringify(changedSeed, null, 2)}\n`);
  expectFailure(process.execPath, ['fixtures/generation/generate.mjs', '--check'], 'seed canary');
  writeFileSync(registryPath, registryOriginal);

  const vectorOriginal = readFileSync(vectorPath);
  const changedVector = JSON.parse(vectorOriginal.toString('utf8'));
  changedVector.outputs[0] = '0x0000000000000000';
  writeFileSync(vectorPath, `${JSON.stringify(changedVector, null, 2)}\n`);
  expectFailure('corepack', ['npm', 'run', 'fixtures:check'], 'vector-word canary');
  writeFileSync(vectorPath, vectorOriginal);

  const reportOriginal = readFileSync(reportPath);
  const changedReport = JSON.parse(reportOriginal.toString('utf8'));
  changedReport.generators[0].artifacts[0].sha256 = '0'.repeat(64);
  writeFileSync(reportPath, `${JSON.stringify(changedReport, null, 2)}\n`);
  expectFailure('corepack', ['npm', 'run', 'fixtures:check'], 'report-hash canary');
  writeFileSync(reportPath, reportOriginal);

  const commandDrift = JSON.parse(registryOriginal.toString('utf8'));
  commandDrift.generators[1].check.arguments[1] = '--write';
  writeFileSync(registryPath, `${JSON.stringify(commandDrift, null, 2)}\n`);
  expectFailure('corepack', ['npm', 'run', 'fixtures:check'], 'check/write command canary');
  writeFileSync(registryPath, registryOriginal);

  const duplicateSeed = JSON.parse(registryOriginal.toString('utf8'));
  duplicateSeed.generators[1].randomness = 'seeded';
  duplicateSeed.generators[1].seed = duplicateSeed.generators[0].seed;
  duplicateSeed.generators[1].algorithm = duplicateSeed.generators[0].algorithm;
  writeFileSync(registryPath, `${JSON.stringify(duplicateSeed, null, 2)}\n`);
  expectFailure('corepack', ['npm', 'run', 'fixtures:check'], 'duplicate-seed canary');
  writeFileSync(registryPath, registryOriginal);

  const schemaPath = path.join(
    temporary,
    'fixtures/generation/schema/prng-vector-v1.schema.json',
  );
  const schemaOriginal = readFileSync(schemaPath);
  const loosenedSchema = JSON.parse(schemaOriginal.toString('utf8'));
  loosenedSchema.additionalProperties = true;
  writeFileSync(schemaPath, `${JSON.stringify(loosenedSchema, null, 2)}\n`);
  expectFailure('corepack', ['npm', 'run', 'fixtures:check'], 'schema-loosening canary');
  writeFileSync(schemaPath, schemaOriginal);

  const generatorPath = path.join(temporary, 'fixtures/generation/generate.mjs');
  const generatorOriginal = readFileSync(generatorPath);
  appendFileSync(generatorPath, '\nconst p02008Canary = Math.random;\n');
  expectFailure('corepack', ['npm', 'run', 'fixtures:check'], 'ambient-randomness canary');
  writeFileSync(generatorPath, generatorOriginal);

  const semanticPath = path.join(temporary, 'fixtures/semantic/manifest.json');
  const semanticOriginal = readFileSync(semanticPath);
  appendFileSync(semanticPath, ' ');
  expectFailure('corepack', ['npm', 'run', 'fixtures:check'], 'semantic-byte canary');
  writeFileSync(semanticPath, semanticOriginal);

  assert(
    run('git', ['status', '--porcelain', '--untracked-files=all']).trim() === '',
    'mutation restoration or generation left source drift',
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log(`PASS exact 18-file P02-008 scope at ${commitArgument}`);
console.log('PASS registry: 4 generators, 5 authority artifacts, 1 committed seed');
console.log('PASS schemas: 3 new strict schemas and 4 schema-bound JSON authorities');
console.log('PASS cross-language vector: 16 JavaScript/Python-identical SplitMix64 words');
console.log('PASS deterministic writes: missing-output recovery and 2 timezone/locale profiles');
console.log('PASS existing authorities: 17 fixtures/313 steps, 382 assertions, 263 matrix rows');
console.log('PASS 8 mutation canaries: seed, vector, report, command, collision, schema, ambient, input');
console.log(`PASS documentation: ${markdownFiles.length} Markdown files, ${localLinks} local links`);
for (const artifact of manifest.artifacts) {
  console.log(`ARTIFACT ${artifact.path} ${artifact.sha256} ${artifact.bytes}`);
}
console.log(`VERIFIER ${manifest.verifier.sha256} ${manifest.verifier.bytes}`);

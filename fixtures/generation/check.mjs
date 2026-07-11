#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readText = (relativePath) => readFileSync(path.join(repository, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(readText(relativePath));
const registryPath = 'fixtures/generation/registry-v1.json';
const registry = readJson(registryPath);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
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
const resolveRepositoryPath = (relativePath) => {
  assert(!path.isAbsolute(relativePath), `absolute path: ${relativePath}`);
  const resolved = path.resolve(repository, relativePath);
  assert(resolved.startsWith(`${repository}${path.sep}`), `path escapes: ${relativePath}`);
  return resolved;
};
const run = (program, args) =>
  execFileSync(program, args, {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
const validateJson = (schemaPath, valuePath) => {
  const program = `
import json,sys
from jsonschema import Draft202012Validator,FormatChecker
schema=json.load(open(sys.argv[1],encoding='utf-8'))
value=json.load(open(sys.argv[2],encoding='utf-8'))
Draft202012Validator.check_schema(schema)
errors=sorted(Draft202012Validator(schema,format_checker=FormatChecker()).iter_errors(value),key=lambda error:str(list(error.absolute_path)))
if errors:
    for error in errors[:20]: print(f"{list(error.absolute_path)}: {error.message}",file=sys.stderr)
    raise SystemExit(1)
`;
  run('python3', [
    '-c',
    program,
    resolveRepositoryPath(schemaPath),
    resolveRepositoryPath(valuePath),
  ]);
};

assert(
  registry.registry_schema === 'helix.fixture-generator-registry/1',
  'registry schema mismatch',
);
assert(registry.version === '1.0.0', 'registry version mismatch');
assert(registry.hash_algorithm === 'sha256', 'registry hash algorithm mismatch');
validateJson('fixtures/generation/schema/registry-v1.schema.json', registryPath);
const registrySchema = readJson('fixtures/generation/schema/registry-v1.schema.json');
const vectorSchema = readJson('fixtures/generation/schema/prng-vector-v1.schema.json');
const reportSchema = readJson('fixtures/generation/schema/report-v1.schema.json');
assert(registrySchema.additionalProperties === false, 'registry schema permits unknown fields');
assert(vectorSchema.additionalProperties === false, 'vector schema permits unknown fields');
assert(reportSchema.additionalProperties === false, 'report schema permits unknown fields');
for (const definition of ['artifact', 'command', 'generator', 'prng', 'schemaArtifact']) {
  assert(
    registrySchema.$defs[definition].additionalProperties === false,
    `registry ${definition} schema permits unknown fields`,
  );
}
for (const definition of ['artifact', 'generator', 'source']) {
  assert(
    reportSchema.$defs[definition].additionalProperties === false,
    `report ${definition} schema permits unknown fields`,
  );
}
assert(vectorSchema.properties.count.const === 16, 'vector schema count is not frozen');
const report = readJson(registry.report.path);
same(
  registry.generators.map(({ id }) => id),
  [
    'toolchain.splitmix64-vectors',
    'semantics.corpus-v1',
    'semantics.oracle-report-v1',
    'compatibility.matrix-v1',
    'hdoc.golden-v1',
  ],
  'generator inventory',
);
assert(registry.prng_algorithms.length === 1, 'PRNG algorithm inventory mismatch');
const algorithm = registry.prng_algorithms[0];
assert(algorithm.id === 'helix.splitmix64-fixed-gamma/1', 'PRNG algorithm ID mismatch');
assert(algorithm.word_bits === 64, 'PRNG word width mismatch');
assert(algorithm.security.startsWith('non-cryptographic'), 'PRNG security boundary absent');

const seedOwners = new Map();
const artifactPaths = [];
for (const generator of registry.generators) {
  assert(generator.status === 'active', `${generator.id}: inactive registry entry`);
  assert(/^P\d{2}-\d{3}$/.test(generator.owner_task), `${generator.id}: owner task mismatch`);
  assert(generator.check.program === 'node', `${generator.id}: check program is not Node`);
  assert(generator.write.program === 'node', `${generator.id}: write program is not Node`);
  assert(generator.check.arguments.at(-1)?.includes('check'), `${generator.id}: check mode absent`);
  assert(generator.write.arguments.at(-1)?.includes('write'), `${generator.id}: write mode absent`);
  for (const command of [generator.check, generator.write]) {
    assert(command.arguments.length === 2, `${generator.id}: command arity mismatch`);
    assert(command.arguments[0].endsWith('.mjs'), `${generator.id}: entry point is not MJS`);
    assert(
      statSync(resolveRepositoryPath(command.arguments[0])).isFile(),
      `${generator.id}: entry point absent`,
    );
  }
  if (generator.randomness === 'seeded') {
    assert(/^0x[0-9a-f]{16}$/.test(generator.seed), `${generator.id}: seed format mismatch`);
    assert(generator.algorithm === algorithm.id, `${generator.id}: unknown algorithm`);
    assert(!seedOwners.has(generator.seed), `${generator.id}: seed collision`);
    seedOwners.set(generator.seed, generator.id);
  } else {
    assert(generator.randomness === 'none', `${generator.id}: randomness mode mismatch`);
    assert(
      generator.seed === null && generator.algorithm === null,
      `${generator.id}: phantom seed`,
    );
  }
  for (const artifact of generator.artifacts) {
    resolveRepositoryPath(artifact.path);
    artifactPaths.push(artifact.path);
    if (artifact.format === 'json') {
      assert(artifact.schema_path !== null, `${artifact.path}: JSON schema absent`);
      validateJson(artifact.schema_path, artifact.path);
    } else {
      assert(artifact.format === 'markdown', `${artifact.path}: unknown artifact format`);
      assert(artifact.schema_path === null, `${artifact.path}: Markdown has JSON schema`);
    }
  }
}
same([...new Set(artifactPaths)], artifactPaths, 'unique artifact paths');

validateJson(registry.report.schema_path, registry.report.path);
const vectorGenerator = registry.generators[0];
const vectorPath = vectorGenerator.artifacts[0].path;
const pythonVectorCheck = `
import json,sys
vector=json.load(open(sys.argv[1],encoding='utf-8'))
mask=(1<<64)-1
gamma=0x9e3779b97f4a7c15
multiplier1=0xbf58476d1ce4e5b9
multiplier2=0x94d049bb133111eb
state=int(vector['seed'],16)
outputs=[]
for _ in range(vector['count']):
    state=(state+gamma)&mask
    mixed=state
    mixed=((mixed^(mixed>>30))*multiplier1)&mask
    mixed=((mixed^(mixed>>27))*multiplier2)&mask
    mixed=(mixed^(mixed>>31))&mask
    outputs.append(f'0x{mixed:016x}')
assert outputs==vector['outputs'],(outputs,vector['outputs'])
`;
run('python3', ['-c', pythonVectorCheck, resolveRepositoryPath(vectorPath)]);

const registryBytes = readFileSync(resolveRepositoryPath(registryPath));
same(
  report.registry,
  { path: registryPath, bytes: registryBytes.length, sha256: sha256(registryBytes) },
  'report registry identity',
);
same(
  report.generators.map(({ id }) => id),
  registry.generators.map(({ id }) => id),
  'report generator IDs',
);
for (const [index, generator] of registry.generators.entries()) {
  const reported = report.generators[index];
  same(
    {
      id: reported.id,
      version: reported.version,
      randomness: reported.randomness,
      seed: reported.seed,
      algorithm: reported.algorithm,
    },
    {
      id: generator.id,
      version: generator.version,
      randomness: generator.randomness,
      seed: generator.seed,
      algorithm: generator.algorithm,
    },
    `${generator.id} report identity`,
  );
  for (const [artifactIndex, artifact] of generator.artifacts.entries()) {
    const bytes = readFileSync(resolveRepositoryPath(artifact.path));
    same(
      reported.artifacts[artifactIndex],
      {
        path: artifact.path,
        format: artifact.format,
        schema_path: artifact.schema_path,
        bytes: bytes.length,
        sha256: sha256(bytes),
      },
      `${artifact.path} report identity`,
    );
  }
}
assert(report.verdict === 'pass', 'generation report verdict mismatch');
const forbiddenReportKeys =
  /^(?:created|generated|recorded|updated)?_?(?:at|time|timestamp|duration|hostname)$/;
const walk = (value) => {
  if (Array.isArray(value)) value.forEach(walk);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assert(!forbiddenReportKeys.test(key), `nondeterministic report key: ${key}`);
      walk(child);
    }
  }
};
walk(report);

const generatorSource = readText('fixtures/generation/generate.mjs');
for (const forbidden of [
  'Math.random',
  'randomBytes',
  'randomUUID',
  'Date.now',
  'new Date',
  'process.env',
]) {
  assert(!generatorSource.includes(forbidden), `ambient generator source: ${forbidden}`);
}
const before = Object.fromEntries(
  [...artifactPaths, registry.report.path].map((artifactPath) => [
    artifactPath,
    sha256(readFileSync(resolveRepositoryPath(artifactPath))),
  ]),
);
const generated = run(process.execPath, ['fixtures/generation/generate.mjs', '--check']);
assert(
  generated.includes('PASS deterministic generation: 5 generators'),
  'generator result mismatch',
);
for (const generator of registry.generators.slice(1)) {
  run(process.execPath, generator.check.arguments);
}
run(process.execPath, ['fixtures/semantic/check-corpus.mjs']);
run(process.execPath, ['reference/semantic-oracle/test-oracle.mjs']);
run(process.execPath, ['compatibility/v1/check-matrix.mjs']);
const after = Object.fromEntries(
  [...artifactPaths, registry.report.path].map((artifactPath) => [
    artifactPath,
    sha256(readFileSync(resolveRepositoryPath(artifactPath))),
  ]),
);
same(after, before, 'check-only artifact stability');

console.log(
  `PASS fixture registry: ${registry.generators.length} generators, ${artifactPaths.length} authority artifacts, ${seedOwners.size} committed seed`,
);
console.log(
  'PASS schemas: registry, vector, report, semantic corpus/oracle, compatibility matrix, HDoc golden manifest',
);
console.log(
  'PASS independent SplitMix64 reproduction: Python matches 16 JavaScript-generated words',
);
console.log(
  'PASS deterministic checks: semantic corpus, oracle report, compatibility matrix, HDoc golden vectors',
);
console.log(
  `PASS generation report: ${report.generators.length} generators, verdict ${report.verdict}`,
);

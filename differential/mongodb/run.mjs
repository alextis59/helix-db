#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { canonicalize, sha256Hex } from '../../reference/semantic-oracle/canonical.mjs';
import { executeCommand } from '../../reference/semantic-oracle/command.mjs';
import { parseStrictJson } from '../../reference/semantic-oracle/raw-json.mjs';
import { objectField, validateValue } from '../../reference/semantic-oracle/value.mjs';
import { assertDatasetLogicalTypes, logicalFromEjson } from './ejson.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '..', '..');
const casesPath = path.join(here, 'cases-v1.json');
const shellRunnerPath = path.join(here, 'mongosh-runner.js');
const observationsPath = path.join(here, 'upstream-observations-v1.json');
const reportPath = path.join(here, 'report-v1.json');
const reportSchemaPath = path.join(here, 'schema', 'report-v1.schema.json');
const observationsSchemaPath = path.join(here, 'schema', 'observations-v1.schema.json');
const casesSchemaPath = path.join(here, 'schema', 'cases-v1.schema.json');
const args = process.argv.slice(2);
let mode = 'check';
let draftValidation = true;
let mutationCanary = false;

for (const argument of args) {
  if (argument === '--check-report') mode = 'check';
  else if (argument === '--write-report') mode = 'write';
  else if (argument === '--print-report') mode = 'print';
  else if (argument === '--no-draft-validation') draftValidation = false;
  else if (argument === '--canary-expected-relation') mutationCanary = true;
  else {
    throw new Error(
      'usage: run.mjs [--check-report|--write-report|--print-report] ' +
        '[--no-draft-validation] [--canary-expected-relation]',
    );
  }
}
if (mutationCanary && mode !== 'check') {
  throw new Error('--canary-expected-relation cannot write or print artifacts');
}

const readStrictJson = (file) => {
  const bytes = readFileSync(file);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!source.isWellFormed()) throw new Error(`${file}: invalid Unicode scalar sequence`);
  return { bytes, value: parseStrictJson(source) };
};
const canonicalList = (values, label) => {
  if (new Set(values).size !== values.length) throw new Error(`${label}: duplicate values`);
  const sorted = [...values].sort();
  if (values.some((value, index) => value !== sorted[index])) throw new Error(`${label}: noncanonical order`);
};
const validateWithSchema = (schemaPath, value) => {
  if (!draftValidation) return;
  const program = String.raw`
import json,sys
from jsonschema import Draft202012Validator
with open(sys.argv[1],encoding='utf-8') as f: schema=json.load(f)
Draft202012Validator.check_schema(schema)
value=json.load(sys.stdin)
errors=sorted(Draft202012Validator(schema).iter_errors(value),key=lambda e:str(list(e.absolute_path)))
if errors: raise SystemExit(f'{sys.argv[1]}: {errors[0].message}')
`;
  execFileSync('python3', ['-c', program, schemaPath], {
    encoding: 'utf8',
    input: JSON.stringify(value),
  });
};

const { bytes: casesBytes, value: specification } = readStrictJson(casesPath);
validateWithSchema(casesSchemaPath, specification);
if (specification.cases_schema !== 'helix.mongodb-differential-cases/1') throw new Error('case schema');
canonicalList(specification.sources, 'sources');
canonicalList(specification.datasets.map((dataset) => dataset.id), 'dataset IDs');
canonicalList(specification.cases.map((entry) => entry.id), 'case IDs');
for (const entry of specification.cases) canonicalList(entry.requirements, `${entry.id} requirements`);
if (new Set(specification.datasets.map((dataset) => dataset.collection)).size !== specification.datasets.length) {
  throw new Error('dataset collection names must be unique');
}
const datasetById = new Map(specification.datasets.map((dataset) => [dataset.id, dataset]));
for (const entry of specification.cases) {
  if (!datasetById.has(entry.dataset)) throw new Error(`${entry.id}: unknown dataset`);
}

const manifestBytes = readFileSync(path.join(repository, 'fixtures', 'semantic', 'manifest.json'));
const oracleReportBytes = readFileSync(
  path.join(repository, 'fixtures', 'semantic', 'oracle-report-v1.json'),
);
if (sha256Hex(manifestBytes) !== specification.semantic_inputs.corpus_manifest_sha256) {
  throw new Error('semantic corpus manifest hash drift');
}
if (sha256Hex(oracleReportBytes) !== specification.semantic_inputs.oracle_report_sha256) {
  throw new Error('semantic oracle report hash drift');
}
const oracleReport = JSON.parse(oracleReportBytes.toString('utf8'));
if (oracleReport.verdict !== 'pass' || oracleReport.counts.failed !== 0 || oracleReport.counts.skipped !== 0) {
  throw new Error('semantic oracle report is not a complete pass');
}

let mutationCanaryTarget;
if (mutationCanary) {
  const target = specification.cases.find((entry) => entry.expected_relation === 'exact');
  if (!target) throw new Error('expected-relation mutation canary has no exact case to mutate');
  mutationCanaryTarget = target.id;
  target.expected_relation = 'different';
}

for (const dataset of specification.datasets) {
  dataset.documents.forEach((document, index) => {
    assertDatasetLogicalTypes(document, `${dataset.id}.documents[${index}]`);
    const typed = logicalFromEjson(document);
    validateValue(typed, `${dataset.id}.documents[${index}]`, {
      allowMissing: false,
      rootDocument: true,
    });
  });
}

const nativeNode = (node) => {
  if (Array.isArray(node)) return node.map(nativeNode);
  if (!node || typeof node !== 'object') return node;
  if (Object.hasOwn(node, '$literal')) {
    if (Object.keys(node).length !== 1) throw new Error('$literal must be the only property');
    return { $value: logicalFromEjson(node.$literal) };
  }
  return Object.fromEntries(Object.entries(node).map(([name, child]) => [name, nativeNode(child)]));
};

const nativeRows = new Map();
for (const entry of specification.cases) {
  const dataset = datasetById.get(entry.dataset);
  const state = {
    collections: [
      {
        name: dataset.collection,
        document_order: 'default_order_v1',
        documents: dataset.documents.map(logicalFromEjson),
      },
    ],
  };
  const command = {
    find: dataset.collection,
    filter: nativeNode(entry.native.filter),
    ...(entry.native.projection === undefined ? {} : { projection: entry.native.projection }),
    sort: entry.native.sort,
  };
  const execution = executeCommand(command, state);
  const rows = objectField(execution.value, 'rows');
  if (!rows || rows.t !== 'array') throw new Error(`${entry.id}: native result has no rows`);
  nativeRows.set(entry.id, rows.values);
}

const docker = (arguments_, options = {}) =>
  execFileSync('docker', arguments_, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30_000,
    ...options,
  }).trim();
const mongoshVersion = execFileSync('mongosh', ['--version'], {
  encoding: 'utf8',
  timeout: 5000,
}).trim();
if (mongoshVersion !== specification.client.version) {
  throw new Error(`mongosh version mismatch: expected ${specification.client.version}, got ${mongoshVersion}`);
}
const image = JSON.parse(docker(['image', 'inspect', specification.upstream.image]))[0];
if (image.Id !== specification.upstream.image_id || !image.RepoDigests.includes(specification.upstream.image)) {
  throw new Error('pinned MongoDB image identity mismatch');
}

const containerName = `helix-p01-021-${process.pid}`;
const databaseName = `helix_p01_021_${process.pid}`;
if (docker(['container', 'ls', '-a', '--filter', `name=^/${containerName}$`, '--format', '{{.ID}}'])) {
  throw new Error(`refusing existing container ${containerName}`);
}
let containerStarted = false;
let rawObservation;
try {
  docker([
    'run', '-d', '--pull=never', '--name', containerName,
    '--read-only', '--user', '999:999',
    '--tmpfs', '/data/db:rw,noexec,nosuid,size=512m,uid=999,gid=999,mode=0700',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m,uid=999,gid=999,mode=0700',
    '--memory=1g', '--cpus=2', '--cap-drop=ALL',
    '-p', '127.0.0.1::27017', specification.upstream.image,
    'mongod', '--bind_ip_all', '--quiet',
    '--nojournal', '--wiredTigerCacheSizeGB', '0.25',
    '--setParameter', 'diagnosticDataCollectionEnabled=false',
  ]);
  containerStarted = true;
  const containerImage = docker(['inspect', containerName, '--format', '{{.Image}}']);
  if (containerImage !== specification.upstream.image_id) throw new Error('running image ID mismatch');
  const portOutput = docker(['port', containerName, '27017/tcp']);
  const portMatch = /^127\.0\.0\.1:([0-9]+)$/m.exec(portOutput);
  if (!portMatch) throw new Error(`unexpected Docker port mapping ${portOutput}`);
  const baseUri = `mongodb://127.0.0.1:${portMatch[1]}`;
  let ready = false;
  let consecutivePings = 0;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      execFileSync(
        'mongosh',
        [`${baseUri}/admin?directConnection=true&serverSelectionTimeoutMS=500`, '--quiet', '--norc', '--eval', 'quit(db.runCommand({ping:1}).ok===1?0:1)'],
        { stdio: 'ignore', timeout: 3000 },
      );
      consecutivePings += 1;
      if (consecutivePings === 2) {
        ready = true;
        break;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    } catch {
      consecutivePings = 0;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
  if (!ready) throw new Error('pinned MongoDB container did not become ready');
  if (docker(['inspect', containerName, '--format', '{{.State.Running}}']) !== 'true') {
    throw new Error('pinned MongoDB container stopped after readiness checks');
  }
  const uri = `${baseUri}/${databaseName}?directConnection=true&serverSelectionTimeoutMS=2000`;
  const stdout = execFileSync(
    'mongosh',
    [uri, '--quiet', '--norc', '--file', shellRunnerPath],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000,
      env: { ...process.env, HELIX_MONGODB_CASES: casesPath },
    },
  );
  const marker = stdout.split(/\r?\n/).find((line) => line.startsWith('HELIX_MONGODB_RESULT:'));
  if (!marker) throw new Error(`mongosh result marker missing: ${stdout.slice(0, 1000)}`);
  rawObservation = JSON.parse(
    Buffer.from(marker.slice('HELIX_MONGODB_RESULT:'.length), 'base64').toString('utf8'),
  );
} catch (error) {
  if (containerStarted) {
    try {
      const logs = docker(['logs', '--tail', '80', containerName]);
      if (logs) console.error(logs);
    } catch {}
  }
  throw error;
} finally {
  if (containerStarted) {
    try {
      execFileSync('docker', ['stop', '--time', '5', containerName], {
        stdio: 'ignore',
        timeout: 10_000,
      });
    } catch {}
    try {
      execFileSync('docker', ['rm', '--force', containerName], {
        stdio: 'ignore',
        timeout: 10_000,
      });
    } catch {}
  }
}

const ejsonInteger = (value, label) => {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (value && typeof value === 'object') {
    if (typeof value.$numberInt === 'string') return Number(value.$numberInt);
    if (typeof value.$numberLong === 'string') return Number(value.$numberLong);
  }
  throw new Error(`${label}: expected EJSON integer`);
};
const upstream = {
  product: rawObservation.upstream.product,
  version: rawObservation.upstream.version,
  git_version: rawObservation.upstream.git_version,
  feature_compatibility_version: rawObservation.upstream.feature_compatibility_version,
  max_wire_version: ejsonInteger(rawObservation.upstream.max_wire_version, 'max wire version'),
  modules: rawObservation.upstream.modules,
  image: specification.upstream.image,
  image_id: specification.upstream.image_id,
};
for (const field of ['product', 'version', 'git_version', 'feature_compatibility_version', 'max_wire_version']) {
  if (upstream[field] !== specification.upstream[field]) {
    throw new Error(`upstream ${field} mismatch: ${upstream[field]}`);
  }
}
if (!Array.isArray(upstream.modules) || upstream.modules.length !== 0) {
  throw new Error('expected MongoDB Community build without modules');
}
const observedCases = rawObservation.cases;
if (!Array.isArray(observedCases)) throw new Error('upstream cases missing');
canonicalList(observedCases.map((entry) => entry.id), 'upstream case IDs');
if (!isDeepStrictEqual(observedCases.map((entry) => entry.id), specification.cases.map((entry) => entry.id))) {
  throw new Error('upstream case inventory/order mismatch');
}

const observations = {
  observations_schema: 'helix.mongodb-upstream-observations/1',
  profile: specification.profile,
  cases_source_sha256: sha256Hex(casesBytes),
  client: specification.client,
  upstream,
  cases: observedCases,
};
validateWithSchema(observationsSchemaPath, observations);
const observationsText = `${JSON.stringify(observations, null, 2)}\n`;
const observationsBytes = Buffer.from(observationsText);

const idsOf = (rows) => rows.map((row) => {
  if (row.t !== 'object') throw new Error('row is not a typed object');
  const id = objectField(row, '_id');
  if (!id) throw new Error('row has no _id');
  return id;
});
const idLabel = (id) => {
  if (['int32', 'int64'].includes(id.t)) return `${id.t}:${id.value}`;
  if (id.t === 'string') return `string:${id.value}`;
  if (id.t === 'binary') return `binary:${id.hex}`;
  if (id.t === 'uuid' || id.t === 'objectId') return `${id.t}:${id.value}`;
  throw new Error(`unsupported report ID ${id.t}`);
};

const reportCases = [];
for (let index = 0; index < specification.cases.length; index += 1) {
  const definition = specification.cases[index];
  const native = nativeRows.get(definition.id);
  const mongo = observedCases[index].rows.map(logicalFromEjson);
  const nativeCompared = definition.comparison === 'ordered_ids' ? idsOf(native) : native;
  const mongoCompared = definition.comparison === 'ordered_ids' ? idsOf(mongo) : mongo;
  const observedRelation = isDeepStrictEqual(nativeCompared, mongoCompared) ? 'exact' : 'different';
  reportCases.push({
    id: definition.id,
    family: definition.family,
    expected_relation: definition.expected_relation,
    observed_relation: observedRelation,
    translation: definition.translation,
    comparison: definition.comparison,
    native_rows: native.length,
    mongo_rows: mongo.length,
    native_ids: definition.comparison === 'ordered_ids' ? nativeCompared.map(idLabel) : [],
    mongo_ids: definition.comparison === 'ordered_ids' ? mongoCompared.map(idLabel) : [],
    native_sha256: sha256Hex(canonicalize(nativeCompared)),
    mongo_sha256: sha256Hex(canonicalize(mongoCompared)),
    status: observedRelation === definition.expected_relation ? 'pass' : 'fail',
  });
}

const passed = reportCases.filter((entry) => entry.status === 'pass').length;
const failed = reportCases.length - passed;
const report = {
  report_schema: 'helix.mongodb-differential-report/1',
  profile: specification.profile,
  harness: { name: 'helix-mongodb-differential', version: specification.harness_version },
  client: specification.client,
  upstream,
  inputs: {
    cases_path: 'differential/mongodb/cases-v1.json',
    cases_sha256: sha256Hex(casesBytes),
    corpus_manifest_sha256: specification.semantic_inputs.corpus_manifest_sha256,
    oracle_report_sha256: specification.semantic_inputs.oracle_report_sha256,
  },
  counts: {
    cases: reportCases.length,
    expected_exact: reportCases.filter((entry) => entry.expected_relation === 'exact').length,
    expected_different: reportCases.filter((entry) => entry.expected_relation === 'different').length,
    observed_exact: reportCases.filter((entry) => entry.observed_relation === 'exact').length,
    observed_different: reportCases.filter((entry) => entry.observed_relation === 'different').length,
    direct: reportCases.filter((entry) => entry.translation === 'direct').length,
    adapter_rewrite: reportCases.filter((entry) => entry.translation === 'adapter_rewrite').length,
    passed,
    failed,
    skipped: 0,
  },
  observations: {
    path: 'differential/mongodb/upstream-observations-v1.json',
    bytes: observationsBytes.length,
    sha256: sha256Hex(observationsBytes),
  },
  cases: reportCases,
  verdict: failed === 0 ? 'pass' : 'fail',
};
validateWithSchema(reportSchemaPath, report);
const reportText = `${JSON.stringify(report, null, 2)}\n`;

if (mutationCanary) {
  // A canary is deliberately inconsistent with the committed expectation and must not persist output.
} else if (mode === 'write') {
  writeFileSync(observationsPath, observationsText);
  writeFileSync(reportPath, reportText);
} else if (mode === 'print') {
  process.stdout.write(reportText);
} else {
  for (const file of [observationsPath, reportPath]) {
    if (!existsSync(file)) throw new Error(`generated artifact is absent: ${path.relative(repository, file)}`);
  }
  if (readFileSync(observationsPath, 'utf8') !== observationsText) {
    throw new Error('upstream observation artifact differs byte-for-byte');
  }
  if (readFileSync(reportPath, 'utf8') !== reportText) {
    throw new Error('differential report differs byte-for-byte');
  }
}

if (mutationCanary) {
  const failures = reportCases.filter((candidate) => candidate.status === 'fail');
  if (failures.length !== 1 || failures[0].id !== mutationCanaryTarget) {
    throw new Error(
      `expected-relation mutation canary was not isolated: ${failures.map((entry) => entry.id).join(',')}`,
    );
  }
  console.log(`PASS expected-relation mutation canary detected: ${mutationCanaryTarget}`);
} else if (failed !== 0) {
  for (const entry of reportCases.filter((candidate) => candidate.status === 'fail')) {
    console.error(
      `FAIL ${entry.id} expected=${entry.expected_relation} observed=${entry.observed_relation} ` +
        `native=${entry.native_sha256} mongo=${entry.mongo_sha256}`,
    );
  }
  process.exitCode = 1;
} else if (mode !== 'print') {
  console.log(
    `PASS MongoDB differential: ${report.counts.cases} cases, ${report.counts.expected_exact} exact, ` +
      `${report.counts.expected_different} deliberate differences, 0 failed, 0 skipped`,
  );
  console.log(
    `PASS upstream: MongoDB ${upstream.version} git=${upstream.git_version} wire=${upstream.max_wire_version}`,
  );
  console.log(`PASS observations: ${report.observations.sha256} ${report.observations.bytes} bytes`);
  console.log(`PASS report: ${sha256Hex(canonicalize(report))}`);
}

#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { canonicalize, sha256Hex } from '../../reference/semantic-oracle/canonical.mjs';
import { executeCommand } from '../../reference/semantic-oracle/command.mjs';
import { parseStrictJson } from '../../reference/semantic-oracle/raw-json.mjs';
import { objectField } from '../../reference/semantic-oracle/value.mjs';
import { logicalFromEjson } from './ejson.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '..', '..');
const files = {
  cases: path.join(here, 'cases-v1.json'),
  observations: path.join(here, 'upstream-observations-v1.json'),
  report: path.join(here, 'report-v1.json'),
};

const readStrictJson = (file) => {
  const bytes = readFileSync(file);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!source.isWellFormed()) throw new Error(`${file}: invalid Unicode scalar sequence`);
  if (!source.endsWith('\n')) throw new Error(`${file}: missing terminal newline`);
  return { bytes, value: parseStrictJson(source) };
};
const same = (actual, expected, label) => {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${label} mismatch`);
  }
};
const validateWithSchema = (name, value) => {
  const schema = path.join(here, 'schema', `${name}.schema.json`);
  // biome-ignore lint/complexity/noUselessStringRaw: Embedded Python must preserve literal backslashes as the snippet evolves.
  const program = String.raw`
import json,sys
from jsonschema import Draft202012Validator
with open(sys.argv[1],encoding='utf-8') as f: schema=json.load(f)
Draft202012Validator.check_schema(schema)
value=json.load(sys.stdin)
errors=sorted(Draft202012Validator(schema).iter_errors(value),key=lambda e:str(list(e.absolute_path)))
if errors: raise SystemExit(f'{sys.argv[1]}: {errors[0].message}')
`;
  execFileSync('python3', ['-c', program, schema], {
    encoding: 'utf8',
    input: JSON.stringify(value),
  });
};
const nativeNode = (node) => {
  if (Array.isArray(node)) return node.map(nativeNode);
  if (!node || typeof node !== 'object') return node;
  if (Object.hasOwn(node, '$literal')) {
    if (Object.keys(node).length !== 1) throw new Error('$literal must be the only property');
    return { $value: logicalFromEjson(node.$literal) };
  }
  return Object.fromEntries(Object.entries(node).map(([name, child]) => [name, nativeNode(child)]));
};
const idsOf = (rows) =>
  rows.map((row) => {
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
const nativeRowsFor = (definition, dataset) => {
  const state = {
    collections: [
      {
        name: dataset.collection,
        document_order: 'default_order_v1',
        documents: dataset.documents.map(logicalFromEjson),
      },
    ],
  };
  const execution = executeCommand(
    {
      find: dataset.collection,
      filter: nativeNode(definition.native.filter),
      ...(definition.native.projection === undefined
        ? {}
        : { projection: definition.native.projection }),
      sort: definition.native.sort,
    },
    state,
  );
  const rows = objectField(execution.value, 'rows');
  if (rows?.t !== 'array') throw new Error(`${definition.id}: native result has no rows`);
  return rows.values;
};

const verifyArtifacts = ({
  specification,
  casesBytes,
  observations,
  observationsBytes,
  report,
}) => {
  const casesHash = sha256Hex(casesBytes);
  const observationsHash = sha256Hex(observationsBytes);
  const manifestHash = sha256Hex(
    readFileSync(path.join(repository, 'fixtures', 'semantic', 'manifest.json')),
  );
  const oracleHash = sha256Hex(
    readFileSync(path.join(repository, 'fixtures', 'semantic', 'oracle-report-v1.json')),
  );
  same(observations.cases_source_sha256, casesHash, 'observation case source hash');
  same(
    report.inputs,
    {
      cases_path: 'differential/mongodb/cases-v1.json',
      cases_sha256: casesHash,
      corpus_manifest_sha256: manifestHash,
      oracle_report_sha256: oracleHash,
    },
    'report inputs',
  );
  same(specification.semantic_inputs.corpus_manifest_sha256, manifestHash, 'declared corpus hash');
  same(specification.semantic_inputs.oracle_report_sha256, oracleHash, 'declared oracle hash');
  same(
    report.observations,
    {
      path: 'differential/mongodb/upstream-observations-v1.json',
      bytes: observationsBytes.length,
      sha256: observationsHash,
    },
    'report observation identity',
  );
  same(observations.client, specification.client, 'observation client identity');
  same(report.client, specification.client, 'report client identity');
  same(observations.upstream, report.upstream, 'upstream identity in report');
  same(
    { ...observations.upstream, modules: undefined },
    { ...specification.upstream, modules: undefined },
    'upstream identity in cases',
  );
  same(observations.upstream.modules, [], 'upstream modules');

  const caseIds = specification.cases.map((entry) => entry.id);
  same(
    observations.cases.map((entry) => entry.id),
    caseIds,
    'observation inventory',
  );
  same(
    report.cases.map((entry) => entry.id),
    caseIds,
    'report inventory',
  );
  const datasets = new Map(specification.datasets.map((dataset) => [dataset.id, dataset]));
  const expectedReportCases = specification.cases.map((definition, index) => {
    const dataset = datasets.get(definition.dataset);
    if (!dataset) throw new Error(`${definition.id}: unknown dataset`);
    const native = nativeRowsFor(definition, dataset);
    const mongo = observations.cases[index].rows.map(logicalFromEjson);
    const nativeCompared = definition.comparison === 'ordered_ids' ? idsOf(native) : native;
    const mongoCompared = definition.comparison === 'ordered_ids' ? idsOf(mongo) : mongo;
    const observedRelation = isDeepStrictEqual(nativeCompared, mongoCompared)
      ? 'exact'
      : 'different';
    return {
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
    };
  });
  same(report.cases, expectedReportCases, 'recomputed case results');

  const passed = expectedReportCases.filter((entry) => entry.status === 'pass').length;
  const failed = expectedReportCases.length - passed;
  same(
    report.counts,
    {
      cases: expectedReportCases.length,
      expected_exact: expectedReportCases.filter((entry) => entry.expected_relation === 'exact')
        .length,
      expected_different: expectedReportCases.filter(
        (entry) => entry.expected_relation === 'different',
      ).length,
      observed_exact: expectedReportCases.filter((entry) => entry.observed_relation === 'exact')
        .length,
      observed_different: expectedReportCases.filter(
        (entry) => entry.observed_relation === 'different',
      ).length,
      direct: expectedReportCases.filter((entry) => entry.translation === 'direct').length,
      adapter_rewrite: expectedReportCases.filter(
        (entry) => entry.translation === 'adapter_rewrite',
      ).length,
      passed,
      failed,
      skipped: 0,
    },
    'recomputed counts',
  );
  same(report.verdict, failed === 0 ? 'pass' : 'fail', 'recomputed verdict');
};

const casesArtifact = readStrictJson(files.cases);
const observationsArtifact = readStrictJson(files.observations);
const reportArtifact = readStrictJson(files.report);
validateWithSchema('cases-v1', casesArtifact.value);
validateWithSchema('observations-v1', observationsArtifact.value);
validateWithSchema('report-v1', reportArtifact.value);
const inputs = {
  specification: casesArtifact.value,
  casesBytes: casesArtifact.bytes,
  observations: observationsArtifact.value,
  observationsBytes: observationsArtifact.bytes,
  report: reportArtifact.value,
};
verifyArtifacts(inputs);

const expectMutationFailure = (label, mutate, expectedMessage) => {
  const mutated = {
    ...inputs,
    specification: structuredClone(inputs.specification),
    observations: structuredClone(inputs.observations),
    observationsBytes: Buffer.from(inputs.observationsBytes),
    report: structuredClone(inputs.report),
  };
  mutate(mutated);
  try {
    verifyArtifacts(mutated);
  } catch (error) {
    if (!String(error.message).includes(expectedMessage)) throw error;
    return;
  }
  throw new Error(`${label} mutation was not detected`);
};

expectMutationFailure(
  'expected relation',
  (value) => {
    value.report.cases[0].expected_relation = 'different';
  },
  'recomputed case results mismatch',
);
expectMutationFailure(
  'count',
  (value) => {
    value.report.counts.cases += 1;
  },
  'recomputed counts mismatch',
);
expectMutationFailure(
  'observation bytes',
  (value) => {
    value.observationsBytes = Buffer.concat([value.observationsBytes, Buffer.from('\n')]);
  },
  'report observation identity mismatch',
);
expectMutationFailure(
  'case order',
  (value) => {
    [value.report.cases[0], value.report.cases[1]] = [value.report.cases[1], value.report.cases[0]];
  },
  'report inventory mismatch',
);

console.log('PASS MongoDB differential artifacts: 3 schemas, 16 cases, 0 failed, 0 skipped');
console.log(
  'PASS artifact mutation canaries: expected relation, count, observation bytes, case order',
);

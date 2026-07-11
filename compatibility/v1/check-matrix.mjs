#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { sha256Hex } from '../../reference/semantic-oracle/canonical.mjs';
import { parseStrictJson } from '../../reference/semantic-oracle/raw-json.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '..', '..');
if (process.argv.length !== 2) throw new Error('usage: check-matrix.mjs');
const matrixPath = path.join(here, 'matrix-v1.json');
const schemaPath = path.join(here, 'schema', 'matrix-v1.schema.json');
const documentPath = path.join(
  repository,
  'docs',
  'compatibility',
  'v1-semantic-compatibility-matrix.md',
);

const readText = (file) => {
  const bytes = readFileSync(file);
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (!source.isWellFormed()) throw new Error(`${file}: invalid Unicode scalar sequence`);
  if (!source.endsWith('\n')) throw new Error(`${file}: missing terminal newline`);
  return { bytes, source };
};
const readStrict = (file) => {
  const artifact = readText(file);
  return { ...artifact, value: parseStrictJson(artifact.source) };
};
const same = (actual, expected, label) => {
  if (!isDeepStrictEqual(actual, expected)) throw new Error(`${label} mismatch`);
};
const canonicalList = (values, label) => {
  if (new Set(values).size !== values.length) throw new Error(`${label}: duplicate values`);
  same(values, [...values].sort(), `${label} canonical order`);
};
const sourceIdentity = (relative) => {
  const bytes = readFileSync(path.join(repository, relative));
  return { path: relative, bytes: bytes.length, sha256: sha256Hex(bytes) };
};
const readJson = (relative) => readStrict(path.join(repository, relative)).value;
const countBy = (rows, field) =>
  Object.fromEntries(
    [...new Set(rows.map((row) => row[field]))]
      .sort()
      .map((value) => [value, rows.filter((row) => row[field] === value).length]),
  );

const matrixArtifact = readStrict(matrixPath);
const schemaArtifact = readStrict(schemaPath);
const documentArtifact = readText(documentPath);
// biome-ignore lint/complexity/noUselessStringRaw: Embedded Python must preserve literal backslashes as the snippet evolves.
const python = String.raw`
import json,sys
from jsonschema import Draft202012Validator
with open(sys.argv[1],encoding='utf-8') as f: schema=json.load(f)
Draft202012Validator.check_schema(schema)
value=json.load(sys.stdin)
errors=sorted(Draft202012Validator(schema).iter_errors(value),key=lambda e:str(list(e.absolute_path)))
if errors: raise SystemExit(f'{sys.argv[1]}: {errors[0].message}')
`;
execFileSync('python3', ['-c', python, schemaPath], {
  encoding: 'utf8',
  input: matrixArtifact.source,
});
if (
  schemaArtifact.value.$schema !== 'https://json-schema.org/draft/2020-12/schema' ||
  schemaArtifact.value.$id !== 'urn:helix-db:schema:semantic-compatibility-matrix:1' ||
  schemaArtifact.value.additionalProperties !== false
)
  throw new Error('matrix schema identity mismatch');

const coverage = readJson('fixtures/semantic/coverage-v1.json');
const operations = readJson('fixtures/semantic/operations-v1.json');
const errors = readJson('fixtures/semantic/error-cases-v1.json');
const differentialCases = readJson('differential/mongodb/cases-v1.json');
const differentialReport = readJson('differential/mongodb/report-v1.json');
const errorCodes = new Set(errors.cases.map((entry) => entry.code));

const expectedStatus = new Map();
const register = (ids, status) => {
  for (const id of ids) {
    if (expectedStatus.has(id)) throw new Error(`checker inventory duplicates ${id}`);
    expectedStatus.set(id, status);
  }
};
register(
  coverage.required_value_tags.map((tag) => `value.${tag === 'objectId' ? 'object-id' : tag}`),
  'oracle_executable',
);
register(
  operations.operations.map((entry) => `primitive.${entry.id}`),
  'oracle_executable',
);
register(
  coverage.required_order_bases.map((basis) => `ordering.${basis.replaceAll('_', '-')}`),
  'oracle_executable',
);
register(
  coverage.required_limit_ids.map((id) => `limit.${id}`),
  'oracle_boundary',
);
register(
  errors.cases.map((entry) => `error.${entry.code.toLowerCase()}`),
  'oracle_registry',
);
register(
  [
    'query.all',
    'query.elem-match',
    'query.eq',
    'query.exists',
    'query.gt',
    'query.gte',
    'query.lt',
    'query.lte',
    'query.ne',
    'query.size',
    'query.vector-top-k',
    'command.find',
    'command.limit',
    'command.projection-exclusion',
    'command.projection-inclusion',
    'command.skip',
    'command.sort',
  ],
  'oracle_command',
);
register(['query.contains'], 'oracle_primitive');
register(
  [
    'query.and',
    'query.expires-after',
    'query.expires-before',
    'query.in',
    'query.json-schema',
    'query.nin',
    'query.nor',
    'query.not',
    'query.or',
    'query.prefix',
    'query.regex',
    'query.ttl',
    'query.type',
    'query.vector-near',
    'command.aggregate',
    'command.count',
    'command.cursor',
    'command.delete-many',
    'command.delete-one',
    'command.explain',
    'command.insert-many',
    'command.insert-one',
    'command.replace-one',
    'command.update-many',
    'command.update-one',
    'command.upsert',
    'update.add-to-set',
    'update.inc',
    'update.pop',
    'update.pull',
    'update.push',
    'update.set',
    'update.set-on-insert',
    'update.unset',
    'aggregation.stage.count',
    'aggregation.stage.group',
    'aggregation.stage.limit',
    'aggregation.stage.match',
    'aggregation.stage.project',
    'aggregation.stage.skip',
    'aggregation.stage.sort',
    'aggregation.stage.unwind',
    'aggregation.expression.constructed-array',
    'aggregation.expression.constructed-object',
    'aggregation.expression.field-path',
    'aggregation.expression.if-null',
    'aggregation.expression.literal',
    'aggregation.expression.root',
    'aggregation.expression.size',
    'aggregation.expression.type',
    'aggregation.expression.typed-literal',
    'aggregation.accumulator.avg',
    'aggregation.accumulator.count',
    'aggregation.accumulator.max',
    'aggregation.accumulator.min',
    'aggregation.accumulator.sum',
  ],
  'contract_only',
);
register(
  [
    'unsupported.aggregation-accumulator.add-to-set',
    'unsupported.aggregation-accumulator.custom-accumulator',
    'unsupported.aggregation-accumulator.first',
    'unsupported.aggregation-accumulator.java-script-accumulator',
    'unsupported.aggregation-accumulator.last',
    'unsupported.aggregation-accumulator.percentile',
    'unsupported.aggregation-accumulator.push',
    'unsupported.aggregation-accumulator.variance',
    'unsupported.aggregation-expression.arithmetic-expressions',
    'unsupported.aggregation-expression.date-transforms',
    'unsupported.aggregation-expression.functions',
    'unsupported.aggregation-expression.general-conditionals',
    'unsupported.aggregation-expression.scripts',
    'unsupported.aggregation-expression.string-transforms',
    'unsupported.aggregation-expression.user-code',
    'unsupported.command.find-and-delete',
    'unsupported.command.ordered-unordered-bulk-mode',
    'unsupported.command.partial-success-multi-write',
    'unsupported.command.resume-expired-cursor-at-current-snapshot',
    'unsupported.query.client-provided-wgsl',
    'unsupported.query.crud-projection-array-fan-out',
    'unsupported.query.crud-projection-numeric-array-index',
    'unsupported.query.geospatial-query',
    'unsupported.query.implicit-unicode-normalization',
    'unsupported.query.locale-collation',
    'unsupported.query.ordinary-array-vector-inference',
    'unsupported.query.text-search',
    'unsupported.query.unordered-result-streams',
    'unsupported.update.all-positional',
    'unsupported.update.array-filters',
    'unsupported.update.current-date',
    'unsupported.update.filtered-positional-id',
    'unsupported.update.max',
    'unsupported.update.min',
    'unsupported.update.mul',
    'unsupported.update.pipeline-updates',
    'unsupported.update.positional',
    'unsupported.update.rename',
    'unsupported.update.unsupported-push-options',
  ],
  'explicitly_unsupported_v1',
);
register(
  [
    'deferred.distributed.consensus',
    'deferred.distributed.distributed-transactions',
    'deferred.distributed.multi-region-operation',
    'deferred.distributed.range-movement',
    'deferred.distributed.replication',
    'deferred.distributed.sharding',
    'unsupported.aggregation-stage.bucket',
    'unsupported.aggregation-stage.facet',
    'unsupported.aggregation-stage.geo-near',
    'unsupported.aggregation-stage.graph-lookup',
    'unsupported.aggregation-stage.lookup',
    'unsupported.aggregation-stage.search',
  ],
  'deferred_post_v1',
);

const expectedUnsupportedIds = [
  'mongodb.unsupported.adapter-endpoint',
  'mongodb.unsupported.atlas-search',
  'mongodb.unsupported.authentication-oidc',
  'mongodb.unsupported.authentication-scram',
  'mongodb.unsupported.authentication-x509',
  'mongodb.unsupported.bson-transport',
  'mongodb.unsupported.capped-collections',
  'mongodb.unsupported.change-streams',
  'mongodb.unsupported.client-side-encryption',
  'mongodb.unsupported.collation',
  'mongodb.unsupported.command-administration',
  'mongodb.unsupported.command-aggregate',
  'mongodb.unsupported.command-bulk-write',
  'mongodb.unsupported.command-count-distinct',
  'mongodb.unsupported.command-delete',
  'mongodb.unsupported.command-find',
  'mongodb.unsupported.command-find-and-modify',
  'mongodb.unsupported.command-insert',
  'mongodb.unsupported.command-update',
  'mongodb.unsupported.diagnostic-commands',
  'mongodb.unsupported.driver-compatibility',
  'mongodb.unsupported.error-code-compatibility',
  'mongodb.unsupported.geospatial',
  'mongodb.unsupported.get-more-kill-cursors',
  'mongodb.unsupported.gridfs',
  'mongodb.unsupported.handshake-hello',
  'mongodb.unsupported.indexes-management',
  'mongodb.unsupported.indexes-query-semantics',
  'mongodb.unsupported.indexes-ttl',
  'mongodb.unsupported.json-schema-full',
  'mongodb.unsupported.limit-compatibility',
  'mongodb.unsupported.logical-sessions',
  'mongodb.unsupported.map-reduce',
  'mongodb.unsupported.migration-tooling',
  'mongodb.unsupported.monitoring-commands',
  'mongodb.unsupported.queryable-encryption',
  'mongodb.unsupported.read-concern',
  'mongodb.unsupported.read-preference',
  'mongodb.unsupported.regex',
  'mongodb.unsupported.replica-sets',
  'mongodb.unsupported.retryable-reads',
  'mongodb.unsupported.retryable-writes',
  'mongodb.unsupported.server-javascript',
  'mongodb.unsupported.sharding',
  'mongodb.unsupported.shell-compatibility',
  'mongodb.unsupported.stable-api',
  'mongodb.unsupported.text-search',
  'mongodb.unsupported.time-series',
  'mongodb.unsupported.topology-discovery',
  'mongodb.unsupported.transactions',
  'mongodb.unsupported.vector-search',
  'mongodb.unsupported.views',
  'mongodb.unsupported.wire-compression',
  'mongodb.unsupported.wire-legacy-opcodes',
  'mongodb.unsupported.wire-op-msg',
  'mongodb.unsupported.write-concern',
];
const expectedRedisUnsupportedIds = [
  'redis.unsupported.adapter-endpoint',
  'redis.unsupported.bitmaps',
  'redis.unsupported.client-compatibility',
  'redis.unsupported.cluster',
  'redis.unsupported.error-compatibility',
  'redis.unsupported.expiry',
  'redis.unsupported.functions',
  'redis.unsupported.geospatial',
  'redis.unsupported.hashes',
  'redis.unsupported.hello-auth-acl',
  'redis.unsupported.hyperloglog',
  'redis.unsupported.key-exists-scan',
  'redis.unsupported.keyspace-notifications',
  'redis.unsupported.limit-compatibility',
  'redis.unsupported.lists',
  'redis.unsupported.migration-tooling',
  'redis.unsupported.modules',
  'redis.unsupported.persistence-aof',
  'redis.unsupported.persistence-rdb',
  'redis.unsupported.pipelining',
  'redis.unsupported.pubsub',
  'redis.unsupported.replication',
  'redis.unsupported.scripting-lua',
  'redis.unsupported.sentinel',
  'redis.unsupported.sets',
  'redis.unsupported.sorted-sets',
  'redis.unsupported.streams',
  'redis.unsupported.string-get-set-del',
  'redis.unsupported.string-incr-decr',
  'redis.unsupported.string-mget-mset',
  'redis.unsupported.transactions',
  'redis.unsupported.wire-resp2',
  'redis.unsupported.wire-resp3',
];

const expectedInputPaths = {
  specifications: 'Specifications.md',
  semantic_coverage: 'fixtures/semantic/coverage-v1.json',
  semantic_operations: 'fixtures/semantic/operations-v1.json',
  semantic_errors: 'fixtures/semantic/error-cases-v1.json',
  semantic_manifest: 'fixtures/semantic/manifest.json',
  oracle_report: 'fixtures/semantic/oracle-report-v1.json',
  mongodb_cases: 'differential/mongodb/cases-v1.json',
  mongodb_observations: 'differential/mongodb/upstream-observations-v1.json',
  mongodb_report: 'differential/mongodb/report-v1.json',
};
const expectedClaims = {
  native_product_status: 'not_implemented',
  unlisted_native_behavior: 'unsupported',
  native_unknown_behavior_error_profile: 'errors-v1',
  mongodb_product_claim: 'prohibited',
  mongodb_adapter_status: 'not_implemented',
  mongodb_wire_versions: [],
  mongodb_driver_versions: [],
  exact_differential_relation_implies_adapter_support: false,
  unlisted_mongodb_behavior: 'unsupported',
  current_unsupported_behavior: 'no_adapter_endpoint',
  required_future_default_error: 'CAP_UNSUPPORTED_FEATURE',
  redis_product_claim: 'prohibited',
  redis_adapter_status: 'not_implemented',
  redis_wire_versions: [],
  redis_client_versions: [],
  unlisted_redis_behavior: 'unsupported',
};
const expectedRequirements = [
  'COMPAT-001',
  'DATA-001',
  'DATA-002',
  'INV-010',
  'QUERY-001',
  'QUERY-002',
];

const verifyMatrix = (matrix) => {
  if (
    matrix.matrix_schema !== 'helix.semantic-compatibility-matrix/1' ||
    matrix.matrix_version !== '1.0.0' ||
    matrix.semantic_profile !== 'helix-native-v1' ||
    matrix.publication_status !== 'foundation_semantic_baseline'
  )
    throw new Error('matrix identity mismatch');
  same(matrix.requirements, expectedRequirements, 'matrix requirements');
  same(
    matrix.references,
    {
      mongodb: {
        status: 'experimental_differential_only',
        profile: differentialCases.profile,
        server_product: differentialReport.upstream.product,
        server_version: differentialReport.upstream.version,
        server_git_version: differentialReport.upstream.git_version,
        image: differentialReport.upstream.image,
        image_id: differentialReport.upstream.image_id,
        client_product: differentialReport.client.product,
        client_version: differentialReport.client.version,
        harness_version: differentialReport.harness.version,
      },
      redis: {
        status: 'not_tested',
        reference_product: 'none',
        reference_version: null,
        protocol_versions: [],
      },
    },
    'reference products',
  );
  same(matrix.claims, expectedClaims, 'closed-world claims');

  for (const [name, relative] of Object.entries(expectedInputPaths)) {
    same(matrix.inputs[name], sourceIdentity(relative), `input ${name}`);
  }
  same(Object.keys(matrix.inputs), Object.keys(expectedInputPaths), 'input inventory');

  canonicalList(
    matrix.native_rows.map((row) => row.id),
    'native row IDs',
  );
  same(
    matrix.native_rows.map((row) => row.id),
    [...expectedStatus.keys()].sort(),
    'native inventory',
  );
  for (const row of matrix.native_rows) {
    if (row.semantic_status !== expectedStatus.get(row.id)) {
      throw new Error(`${row.id}: semantic status mismatch`);
    }
    canonicalList(row.requirements, `${row.id} requirements`);
    canonicalList(row.evidence, `${row.id} evidence`);
    for (const relative of row.evidence) {
      if (!path.resolve(repository, relative).startsWith(`${repository}${path.sep}`)) {
        throw new Error(`${row.id}: evidence path escape`);
      }
      readFileSync(path.join(repository, relative));
    }
    const reference = row.semantic_status.startsWith('oracle_');
    const expectedImplementation = reference
      ? 'reference_only'
      : row.semantic_status === 'contract_only'
        ? 'not_implemented'
        : 'not_applicable';
    if (row.implementation_status !== expectedImplementation) {
      throw new Error(`${row.id}: implementation status mismatch`);
    }
  }

  canonicalList(
    matrix.mongodb_experimental_cases.map((row) => row.id),
    'MongoDB case IDs',
  );
  const definitions = new Map(differentialCases.cases.map((row) => [row.id, row]));
  const reports = new Map(differentialReport.cases.map((row) => [row.id, row]));
  same(
    matrix.mongodb_experimental_cases.map((row) => row.case_id),
    [...definitions.keys()].sort(),
    'MongoDB case inventory',
  );
  for (const row of matrix.mongodb_experimental_cases) {
    const definition = definitions.get(row.case_id);
    const report = reports.get(row.case_id);
    if (!definition || !report) throw new Error(`${row.case_id}: source case absent`);
    same(
      {
        family: row.family,
        relation: row.relation,
        translation: row.translation,
        adapter_status: row.adapter_status,
        test_status: row.test_status,
        comparison: row.comparison,
        native_rows: row.native_rows,
        mongodb_rows: row.mongodb_rows,
        requirements: row.requirements,
        note: row.note,
      },
      {
        family: definition.family,
        relation: report.observed_relation,
        translation: definition.translation,
        adapter_status: 'unsupported',
        test_status: report.status,
        comparison: definition.comparison,
        native_rows: report.native_rows,
        mongodb_rows: report.mongo_rows,
        requirements: definition.requirements,
        note: definition.reason,
      },
      `${row.case_id} derived result`,
    );
  }

  canonicalList(
    matrix.mongodb_unsupported.map((row) => row.id),
    'MongoDB unsupported IDs',
  );
  same(
    matrix.mongodb_unsupported.map((row) => row.id),
    expectedUnsupportedIds,
    'MongoDB unsupported inventory',
  );
  for (const row of matrix.mongodb_unsupported) {
    if (row.adapter_status !== 'unsupported' || row.current_behavior !== 'no_adapter_endpoint') {
      throw new Error(`${row.id}: unsupported policy weakened`);
    }
    if (!errorCodes.has(row.future_rejection_code)) {
      throw new Error(`${row.id}: unregistered future rejection code`);
    }
  }
  canonicalList(
    matrix.redis_unsupported.map((row) => row.id),
    'Redis unsupported IDs',
  );
  same(
    matrix.redis_unsupported.map((row) => row.id),
    expectedRedisUnsupportedIds,
    'Redis unsupported inventory',
  );
  for (const row of matrix.redis_unsupported) {
    if (row.adapter_status !== 'unsupported' || row.current_behavior !== 'no_adapter_endpoint') {
      throw new Error(`${row.id}: unsupported policy weakened`);
    }
    if (!errorCodes.has(row.future_rejection_code)) {
      throw new Error(`${row.id}: unregistered future rejection code`);
    }
  }

  const passed = matrix.mongodb_experimental_cases.filter(
    (row) => row.test_status === 'pass',
  ).length;
  const failed = matrix.mongodb_experimental_cases.length - passed;
  const counts = {
    native_rows: matrix.native_rows.length,
    native_by_status: countBy(matrix.native_rows, 'semantic_status'),
    mongodb_experimental_cases: matrix.mongodb_experimental_cases.length,
    mongodb_experimental_by_relation: countBy(matrix.mongodb_experimental_cases, 'relation'),
    mongodb_adapter_supported: matrix.mongodb_experimental_cases.filter(
      (row) => row.adapter_status !== 'unsupported',
    ).length,
    mongodb_unsupported_rows: matrix.mongodb_unsupported.length,
    redis_adapter_supported: matrix.redis_unsupported.filter(
      (row) => row.adapter_status !== 'unsupported',
    ).length,
    redis_unsupported_rows: matrix.redis_unsupported.length,
    failed,
    skipped: 0,
  };
  same(matrix.counts, counts, 'matrix counts');
  if (matrix.verdict !== (failed === 0 ? 'pass' : 'fail'))
    throw new Error('matrix verdict mismatch');
  if (matrix.counts.skipped !== 0) throw new Error('matrix contains skipped rows');
};

verifyMatrix(matrixArtifact.value);
for (const row of [
  ...matrixArtifact.value.native_rows,
  ...matrixArtifact.value.mongodb_unsupported,
  ...matrixArtifact.value.redis_unsupported,
]) {
  if (!documentArtifact.source.includes(`\`${row.id}\``)) {
    throw new Error(`generated document omits ${row.id}`);
  }
}
for (const row of matrixArtifact.value.mongodb_experimental_cases) {
  if (!documentArtifact.source.includes(`\`${row.case_id}\``)) {
    throw new Error(`generated document omits ${row.case_id}`);
  }
}
for (const marker of [
  'HelixDB has no MongoDB or Redis adapter, compatibility wire endpoint, supported compatibility command, driver/client version, or product compatibility claim',
  'Every unlisted native, MongoDB, and Redis behavior is unsupported',
  'Currently supported MongoDB adapter rows: 0',
  'Currently supported Redis adapter rows: 0',
  'Failed experimental rows: 0; skipped rows: 0',
]) {
  if (!documentArtifact.source.includes(marker))
    throw new Error(`generated document omits claim marker: ${marker}`);
}

const expectMutationFailure = (label, mutate, marker) => {
  const copy = structuredClone(matrixArtifact.value);
  mutate(copy);
  try {
    verifyMatrix(copy);
  } catch (error) {
    if (!String(error.message).includes(marker)) throw error;
    return;
  }
  throw new Error(`${label} mutation was not detected`);
};
expectMutationFailure(
  'native omission',
  (value) => value.native_rows.pop(),
  'native inventory mismatch',
);
expectMutationFailure(
  'product claim',
  (value) => {
    value.claims.mongodb_product_claim = 'allowed';
  },
  'closed-world claims mismatch',
);
expectMutationFailure(
  'adapter support',
  (value) => {
    value.mongodb_experimental_cases[0].adapter_status = 'supported';
  },
  'derived result mismatch',
);
expectMutationFailure(
  'input hash',
  (value) => {
    value.inputs.mongodb_report.sha256 = '0'.repeat(64);
  },
  'input mongodb_report mismatch',
);
expectMutationFailure(
  'unsupported omission',
  (value) => value.mongodb_unsupported.pop(),
  'MongoDB unsupported inventory mismatch',
);
expectMutationFailure(
  'Redis unsupported omission',
  (value) => value.redis_unsupported.pop(),
  'Redis unsupported inventory mismatch',
);
expectMutationFailure(
  'skip count',
  (value) => {
    value.counts.skipped = 1;
  },
  'matrix counts mismatch',
);

console.log(
  `PASS matrix integrity: ${matrixArtifact.value.counts.native_rows} native rows, ` +
    `${matrixArtifact.value.counts.mongodb_experimental_cases} MongoDB cases, ` +
    `${matrixArtifact.value.counts.mongodb_unsupported_rows} MongoDB unsupported, ` +
    `${matrixArtifact.value.counts.redis_unsupported_rows} Redis unsupported`,
);
console.log('PASS registry reconciliation: 16 values, 17 primitives, 25 limits, 74 errors');
console.log('PASS matrix mutation canaries: native, claim, adapter, input, MongoDB, Redis, skip');
console.log(
  `PASS matrix source: ${sha256Hex(matrixArtifact.bytes)} ${matrixArtifact.bytes.length} bytes`,
);
console.log(
  `PASS generated document: ${sha256Hex(documentArtifact.bytes)} ${documentArtifact.bytes.length} bytes`,
);

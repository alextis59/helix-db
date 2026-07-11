#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from '../../reference/semantic-oracle/canonical.mjs';
import { parseStrictJson } from '../../reference/semantic-oracle/raw-json.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '..', '..');
const matrixPath = path.join(here, 'matrix-v1.json');
const documentPath = path.join(
  repository,
  'docs',
  'compatibility',
  'v1-semantic-compatibility-matrix.md',
);
const mode = process.argv[2] ?? '--check';
if (!['--check', '--write'].includes(mode) || process.argv.length > 3) {
  throw new Error('usage: generate-matrix.mjs [--check|--write]');
}

const readJson = (relative) => {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(
    readFileSync(path.join(repository, relative)),
  );
  if (!source.isWellFormed()) throw new Error(`${relative}: invalid Unicode scalar sequence`);
  return parseStrictJson(source);
};
const identity = (relative) => {
  const bytes = readFileSync(path.join(repository, relative));
  return { path: relative, bytes: bytes.length, sha256: sha256Hex(bytes) };
};
const sortedUnique = (values) => [...new Set(values)].sort();
const slug = (value) =>
  value
    .replaceAll('$', '')
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replaceAll(/[^A-Za-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .toLowerCase();

const coverage = readJson('fixtures/semantic/coverage-v1.json');
const operations = readJson('fixtures/semantic/operations-v1.json');
const errors = readJson('fixtures/semantic/error-cases-v1.json');
const differentialCases = readJson('differential/mongodb/cases-v1.json');
const differentialReport = readJson('differential/mongodb/report-v1.json');

const nativeRows = [];
const addNative = ({
  id,
  domain,
  feature,
  semanticStatus,
  release = 'v1_required',
  implementationStatus,
  requirements,
  evidence,
  note,
}) => {
  nativeRows.push({
    id,
    domain,
    feature,
    release,
    semantic_status: semanticStatus,
    implementation_status: implementationStatus,
    requirements: sortedUnique(requirements),
    evidence: sortedUnique(evidence),
    note,
  });
};
const addGroup = ({
  domain,
  prefix,
  features,
  semanticStatus,
  release,
  implementationStatus,
  requirements,
  evidence,
  note,
}) => {
  for (const entry of features) {
    const [id, feature, featureNote] = typeof entry === 'string' ? [slug(entry), entry] : entry;
    addNative({
      id: `${prefix}.${id}`,
      domain,
      feature,
      semanticStatus,
      release,
      implementationStatus,
      requirements,
      evidence,
      note: featureNote ?? note,
    });
  }
};

addGroup({
  domain: 'value',
  prefix: 'value',
  features: coverage.required_value_tags.map((tag) => [slug(tag), tag]),
  semanticStatus: 'oracle_executable',
  implementationStatus: 'reference_only',
  requirements: ['DATA-001', 'QUERY-001'],
  evidence: [
    'docs/architecture/value-model.md',
    'fixtures/semantic/manifest.json',
    'fixtures/semantic/oracle-report-v1.json',
  ],
  note: 'Typed value behavior is frozen in the semantic corpus and executable oracle; no storage engine exists yet.',
});
for (const row of nativeRows.filter((entry) => entry.id === 'value.missing')) {
  row.requirements = sortedUnique([...row.requirements, 'DATA-002']);
  row.note =
    'Missing is an observable path state, never a storable value; the oracle preserves it separately from null.';
}

addGroup({
  domain: 'primitive',
  prefix: 'primitive',
  features: operations.operations.map((operation) => [
    operation.id,
    operation.id,
    operation.description,
  ]),
  semanticStatus: 'oracle_executable',
  implementationStatus: 'reference_only',
  requirements: ['INV-002', 'QUERY-001'],
  evidence: [
    'fixtures/semantic/operations-v1.json',
    'fixtures/semantic/oracle-report-v1.json',
    'reference/semantic-oracle/README.md',
  ],
  note: 'Registered language-neutral primitive executed by the independent oracle.',
});

const queryOperators = [
  ['$eq', 'oracle_command'],
  ['$ne', 'oracle_command'],
  ['$gt', 'oracle_command'],
  ['$gte', 'oracle_command'],
  ['$lt', 'oracle_command'],
  ['$lte', 'oracle_command'],
  ['$in', 'contract_only'],
  ['$nin', 'contract_only'],
  ['$and', 'contract_only'],
  ['$or', 'contract_only'],
  ['$not', 'contract_only'],
  ['$nor', 'contract_only'],
  ['$exists', 'oracle_command'],
  ['$type', 'contract_only'],
  ['$all', 'oracle_command'],
  ['$size', 'oracle_command'],
  ['$elemMatch', 'oracle_command'],
  ['$prefix', 'contract_only'],
  ['$contains', 'oracle_primitive'],
  ['$regex', 'contract_only'],
  ['$jsonSchema', 'contract_only'],
  ['$ttl', 'contract_only'],
  ['$expiresBefore', 'contract_only'],
  ['$expiresAfter', 'contract_only'],
  ['$vectorNear', 'contract_only'],
  ['$vectorTopK', 'oracle_command'],
];
for (const [operator, status] of queryOperators) {
  const executable = status.startsWith('oracle_');
  addNative({
    id: `query.${slug(operator)}`,
    domain: 'query_operator',
    feature: operator,
    semanticStatus: status,
    implementationStatus: executable ? 'reference_only' : 'not_implemented',
    requirements: ['QUERY-001', 'QUERY-002'],
    evidence: sortedUnique([
      'docs/architecture/operator-semantics.md',
      ...(executable ? ['fixtures/semantic/oracle-report-v1.json'] : []),
    ]),
    note:
      status === 'oracle_command'
        ? 'The normalized operator executes through the reference find command for its registered v1 shape.'
        : status === 'oracle_primitive'
          ? 'The underlying semantic primitive is executable, but the normalized find-operator path is not yet implemented.'
          : 'The v1 truth table is specified; successful command execution remains assigned to the query-engine phase.',
  });
}

addGroup({
  domain: 'command',
  prefix: 'command',
  features: [
    ['find', 'find'],
    ['projection-inclusion', 'find projection: inclusion'],
    ['projection-exclusion', 'find projection: exclusion'],
    ['sort', 'find sort'],
    ['skip', 'find skip'],
    ['limit', 'find limit'],
  ],
  semanticStatus: 'oracle_command',
  implementationStatus: 'reference_only',
  requirements: ['QUERY-001'],
  evidence: [
    'docs/architecture/crud-query-semantics.md',
    'fixtures/semantic/oracle-report-v1.json',
  ],
  note: 'The independent oracle executes the registered read-only command shape; no production parser/server exists.',
});
addGroup({
  domain: 'command',
  prefix: 'command',
  features: [
    'insertOne',
    'insertMany',
    'replaceOne',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'upsert',
    'count',
    'cursor',
    'aggregate',
    'explain',
  ],
  semanticStatus: 'contract_only',
  implementationStatus: 'not_implemented',
  requirements: ['QUERY-001', 'STORE-001'],
  evidence: ['docs/architecture/crud-query-semantics.md'],
  note: 'The semantic contract is accepted, but successful execution remains unimplemented in the reference command surface and product engine.',
});

addGroup({
  domain: 'update',
  prefix: 'update',
  features: ['$set', '$unset', '$inc', '$setOnInsert', '$push', '$addToSet', '$pop', '$pull'],
  semanticStatus: 'contract_only',
  implementationStatus: 'not_implemented',
  requirements: ['DATA-002', 'QUERY-001', 'STORE-001'],
  evidence: ['docs/architecture/update-semantics.md'],
  note: 'The modifier, path, conflict, and atomicity rules are specified; successful mutations are not implemented.',
});

addGroup({
  domain: 'aggregation_stage',
  prefix: 'aggregation.stage',
  features: ['$match', '$project', '$sort', '$limit', '$skip', '$count', '$group', '$unwind'],
  semanticStatus: 'contract_only',
  implementationStatus: 'not_implemented',
  requirements: ['QUERY-001'],
  evidence: ['docs/architecture/aggregation-semantics.md'],
  note: 'The v1 stage contract is accepted; pipeline execution is not implemented.',
});
addGroup({
  domain: 'aggregation_expression',
  prefix: 'aggregation.expression',
  features: [
    ['typed-literal', 'typed literal'],
    ['field-path', 'field path'],
    ['root', '$$ROOT'],
    ['literal', '$literal'],
    ['if-null', '$ifNull'],
    ['type', '$type'],
    ['size', '$size'],
    ['constructed-object', 'constructed object'],
    ['constructed-array', 'constructed array'],
  ],
  semanticStatus: 'contract_only',
  implementationStatus: 'not_implemented',
  requirements: ['QUERY-001'],
  evidence: ['docs/architecture/aggregation-semantics.md'],
  note: 'The deliberately small expression subset is specified but not implemented.',
});
addGroup({
  domain: 'aggregation_accumulator',
  prefix: 'aggregation.accumulator',
  features: ['$count', '$sum', '$avg', '$min', '$max'],
  semanticStatus: 'contract_only',
  implementationStatus: 'not_implemented',
  requirements: ['QUERY-001'],
  evidence: ['docs/architecture/aggregation-semantics.md'],
  note: 'Deterministic accumulator semantics are specified but not implemented.',
});

addGroup({
  domain: 'ordering',
  prefix: 'ordering',
  features: coverage.required_order_bases.map((basis) => [slug(basis), basis]),
  semanticStatus: 'oracle_executable',
  implementationStatus: 'reference_only',
  requirements: ['INV-002', 'QUERY-001'],
  evidence: [
    'docs/architecture/default-ordering-semantics.md',
    'fixtures/semantic/oracle-report-v1.json',
  ],
  note: 'The corpus encodes this exact order basis; product cursor/engine execution remains unimplemented.',
});

addGroup({
  domain: 'limit',
  prefix: 'limit',
  features: coverage.required_limit_ids.map((limit) => [limit, limit]),
  semanticStatus: 'oracle_boundary',
  implementationStatus: 'reference_only',
  requirements: ['QUERY-002', 'SEC-002'],
  evidence: ['docs/architecture/limits-v1.md', 'fixtures/semantic/oracle-report-v1.json'],
  note: 'Below/at/above boundaries execute through compact oracle actions; full-size allocation and subsystem enforcement remain later proof duties.',
});

for (const error of errors.cases) {
  addNative({
    id: `error.${error.code.toLowerCase()}`,
    domain: 'error',
    feature: error.code,
    semanticStatus: 'oracle_registry',
    implementationStatus: 'reference_only',
    requirements: ['QUERY-002'],
    evidence: [
      'docs/architecture/error-semantics.md',
      'fixtures/semantic/error-cases-v1.json',
      'fixtures/semantic/oracle-report-v1.json',
    ],
    note: `Registered ${error.category} error at phase ${error.phase}; the fixture raises canonical metadata synthetically, not through every future subsystem fault.`,
  });
}

addGroup({
  domain: 'native_exclusion',
  prefix: 'unsupported.update',
  features: [
    '$rename',
    '$mul',
    '$min',
    '$max',
    '$currentDate',
    'positional $',
    'all positional $[]',
    'filtered positional $[id]',
    'arrayFilters',
    'pipeline updates',
    'unsupported $push options',
  ],
  semanticStatus: 'explicitly_unsupported_v1',
  release: 'v1_excluded',
  implementationStatus: 'not_applicable',
  requirements: ['QUERY-002'],
  evidence: ['docs/architecture/update-semantics.md'],
  note: 'Native v1 rejects this update form explicitly; it must not be approximated.',
});
addGroup({
  domain: 'native_exclusion',
  prefix: 'unsupported.aggregation-stage',
  features: ['$lookup', '$facet', '$bucket', '$graphLookup', '$geoNear', '$search'],
  semanticStatus: 'deferred_post_v1',
  release: 'post_v1',
  implementationStatus: 'not_applicable',
  requirements: ['QUERY-002'],
  evidence: ['docs/architecture/aggregation-semantics.md', 'Specifications.md'],
  note: 'The stage is outside the required v1 aggregation subset and remains unavailable until a later versioned contract and implementation.',
});
addGroup({
  domain: 'native_exclusion',
  prefix: 'unsupported.aggregation-expression',
  features: [
    'arithmetic expressions',
    'date transforms',
    'string transforms',
    'general conditionals',
    'functions',
    'scripts',
    'user code',
  ],
  semanticStatus: 'explicitly_unsupported_v1',
  release: 'v1_excluded',
  implementationStatus: 'not_applicable',
  requirements: ['QUERY-002'],
  evidence: ['docs/architecture/aggregation-semantics.md'],
  note: 'The expression family is outside the deliberately small v1 subset and must produce an explicit unsupported/unknown-expression error.',
});
addGroup({
  domain: 'native_exclusion',
  prefix: 'unsupported.aggregation-accumulator',
  features: [
    '$first',
    '$last',
    '$push',
    '$addToSet',
    'custom accumulator',
    'JavaScript accumulator',
    'percentile',
    'variance',
  ],
  semanticStatus: 'explicitly_unsupported_v1',
  release: 'v1_excluded',
  implementationStatus: 'not_applicable',
  requirements: ['QUERY-002'],
  evidence: ['docs/architecture/aggregation-semantics.md'],
  note: 'The accumulator is outside the v1 subset and must be rejected explicitly.',
});
addGroup({
  domain: 'native_exclusion',
  prefix: 'unsupported.query',
  features: [
    'locale collation',
    'implicit Unicode normalization',
    'text search',
    'geospatial query',
    'ordinary-array vector inference',
    'client-provided WGSL',
    'CRUD projection array fan-out',
    'CRUD projection numeric array index',
    'unordered result streams',
  ],
  semanticStatus: 'explicitly_unsupported_v1',
  release: 'v1_excluded',
  implementationStatus: 'not_applicable',
  requirements: ['QUERY-002'],
  evidence: [
    'docs/architecture/crud-query-semantics.md',
    'docs/architecture/operator-semantics.md',
    'docs/governance/scope.md',
  ],
  note: 'Native v1 either uses its explicit deterministic alternative or rejects this behavior; it never silently approximates it.',
});
addGroup({
  domain: 'native_exclusion',
  prefix: 'unsupported.command',
  features: [
    'partial-success multi-write',
    'ordered/unordered bulk mode',
    'find-and-delete',
    'resume expired cursor at current snapshot',
  ],
  semanticStatus: 'explicitly_unsupported_v1',
  release: 'v1_excluded',
  implementationStatus: 'not_applicable',
  requirements: ['QUERY-002', 'STORE-001'],
  evidence: ['docs/architecture/crud-query-semantics.md'],
  note: 'The native command contract forbids this behavior in v1.',
});
addGroup({
  domain: 'native_exclusion',
  prefix: 'deferred.distributed',
  features: [
    'replication',
    'consensus',
    'sharding',
    'range movement',
    'multi-region operation',
    'distributed transactions',
  ],
  semanticStatus: 'deferred_post_v1',
  release: 'v2',
  implementationStatus: 'not_applicable',
  requirements: ['INV-008'],
  evidence: ['docs/governance/scope.md'],
  note: 'This distributed capability is excluded from v1 and remains assigned to v2 gates.',
});

nativeRows.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
if (new Set(nativeRows.map((row) => row.id)).size !== nativeRows.length) {
  throw new Error('native matrix contains duplicate IDs');
}

const reportById = new Map(differentialReport.cases.map((entry) => [entry.id, entry]));
const mongodbCases = differentialCases.cases.map((definition) => {
  const observed = reportById.get(definition.id);
  if (!observed) throw new Error(`differential report omits ${definition.id}`);
  return {
    id: `mongodb.case.${definition.id}`,
    case_id: definition.id,
    family: definition.family,
    relation: observed.observed_relation,
    translation: definition.translation,
    adapter_status: 'unsupported',
    test_status: observed.status,
    comparison: definition.comparison,
    native_rows: observed.native_rows,
    mongodb_rows: observed.mongo_rows,
    requirements: sortedUnique(definition.requirements),
    evidence: [
      'differential/mongodb/cases-v1.json',
      'differential/mongodb/report-v1.json',
      'differential/mongodb/upstream-observations-v1.json',
    ],
    note: definition.reason,
  };
});
mongodbCases.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

const unsupportedFeatures = [
  ['adapter-endpoint', 'MongoDB adapter endpoint', 'CAP_UNSUPPORTED_FEATURE'],
  ['wire-op-msg', 'OP_MSG wire protocol', 'CAP_UNSUPPORTED_VERSION'],
  ['wire-legacy-opcodes', 'legacy MongoDB wire opcodes', 'CAP_UNSUPPORTED_VERSION'],
  ['wire-compression', 'MongoDB wire compression negotiation', 'CAP_UNSUPPORTED_FEATURE'],
  ['stable-api', 'MongoDB Stable API negotiation', 'CAP_UNSUPPORTED_VERSION'],
  ['bson-transport', 'BSON request/response transport', 'CAP_UNSUPPORTED_FEATURE'],
  ['handshake-hello', 'hello/isMaster handshake', 'VAL_UNKNOWN_COMMAND'],
  ['topology-discovery', 'topology discovery and SDAM behavior', 'CAP_UNSUPPORTED_FEATURE'],
  ['authentication-scram', 'SCRAM authentication', 'CAP_UNSUPPORTED_FEATURE'],
  ['authentication-x509', 'X.509 authentication', 'CAP_UNSUPPORTED_FEATURE'],
  ['authentication-oidc', 'MongoDB OIDC authentication', 'CAP_UNSUPPORTED_FEATURE'],
  ['logical-sessions', 'logical sessions', 'CAP_UNSUPPORTED_FEATURE'],
  ['get-more-kill-cursors', 'getMore and killCursors protocol lifecycle', 'VAL_UNKNOWN_COMMAND'],
  ['retryable-reads', 'retryable reads', 'CAP_UNSUPPORTED_FEATURE'],
  ['retryable-writes', 'retryable writes', 'CAP_UNSUPPORTED_FEATURE'],
  ['transactions', 'MongoDB transactions', 'CAP_UNSUPPORTED_FEATURE'],
  ['read-concern', 'MongoDB read concern', 'VAL_UNKNOWN_OPTION'],
  ['write-concern', 'MongoDB write concern', 'VAL_UNKNOWN_OPTION'],
  ['read-preference', 'MongoDB read preference', 'VAL_UNKNOWN_OPTION'],
  ['replica-sets', 'replica-set behavior', 'CAP_UNSUPPORTED_FEATURE'],
  ['sharding', 'sharded-cluster behavior', 'CAP_UNSUPPORTED_FEATURE'],
  ['command-insert', 'MongoDB insert command', 'VAL_UNKNOWN_COMMAND'],
  ['command-update', 'MongoDB update command', 'VAL_UNKNOWN_COMMAND'],
  ['command-delete', 'MongoDB delete command', 'VAL_UNKNOWN_COMMAND'],
  ['command-find', 'MongoDB find command endpoint', 'VAL_UNKNOWN_COMMAND'],
  ['command-aggregate', 'MongoDB aggregate command', 'VAL_UNKNOWN_COMMAND'],
  ['command-count-distinct', 'MongoDB count and distinct commands', 'VAL_UNKNOWN_COMMAND'],
  ['command-find-and-modify', 'findAndModify command', 'VAL_UNKNOWN_COMMAND'],
  ['command-bulk-write', 'bulkWrite command', 'VAL_UNKNOWN_COMMAND'],
  ['command-administration', 'MongoDB administrative commands', 'VAL_UNKNOWN_COMMAND'],
  ['indexes-management', 'create/drop/list index commands', 'VAL_UNKNOWN_COMMAND'],
  [
    'indexes-query-semantics',
    'MongoDB index selection and multikey semantics',
    'CAP_UNSUPPORTED_FEATURE',
  ],
  ['indexes-ttl', 'MongoDB TTL indexes', 'CAP_UNSUPPORTED_FEATURE'],
  ['collation', 'MongoDB collation', 'CAP_UNSUPPORTED_FEATURE'],
  ['regex', 'MongoDB regular-expression semantics/options', 'CAP_UNSUPPORTED_FEATURE'],
  ['text-search', 'MongoDB text search', 'CAP_UNSUPPORTED_FEATURE'],
  ['geospatial', 'MongoDB geospatial query/index behavior', 'CAP_UNSUPPORTED_FEATURE'],
  ['json-schema-full', 'full MongoDB $jsonSchema behavior', 'CAP_UNSUPPORTED_FEATURE'],
  ['change-streams', 'MongoDB change streams', 'CAP_UNSUPPORTED_FEATURE'],
  ['time-series', 'MongoDB time-series collections', 'CAP_UNSUPPORTED_FEATURE'],
  ['views', 'MongoDB views', 'CAP_UNSUPPORTED_FEATURE'],
  ['capped-collections', 'MongoDB capped collections', 'CAP_UNSUPPORTED_FEATURE'],
  ['gridfs', 'GridFS', 'CAP_UNSUPPORTED_FEATURE'],
  ['map-reduce', 'mapReduce', 'VAL_UNKNOWN_COMMAND'],
  ['server-javascript', 'server-side JavaScript', 'CAP_UNSUPPORTED_FEATURE'],
  ['atlas-search', 'Atlas Search', 'CAP_UNSUPPORTED_FEATURE'],
  [
    'vector-search',
    'MongoDB/Atlas vector search syntax and index behavior',
    'CAP_UNSUPPORTED_FEATURE',
  ],
  ['queryable-encryption', 'Queryable Encryption', 'CAP_UNSUPPORTED_FEATURE'],
  [
    'client-side-encryption',
    'MongoDB client-side field-level encryption integration',
    'CAP_UNSUPPORTED_FEATURE',
  ],
  ['monitoring-commands', 'MongoDB monitoring commands and events', 'VAL_UNKNOWN_COMMAND'],
  [
    'diagnostic-commands',
    'MongoDB diagnostic/explain/profiler compatibility',
    'VAL_UNKNOWN_COMMAND',
  ],
  ['driver-compatibility', 'MongoDB driver compatibility', 'CAP_UNSUPPORTED_FEATURE'],
  ['shell-compatibility', 'mongosh application compatibility', 'CAP_UNSUPPORTED_FEATURE'],
  ['migration-tooling', 'MongoDB migration/import/rollback tooling', 'CAP_UNSUPPORTED_FEATURE'],
  ['error-code-compatibility', 'MongoDB error codes and labels', 'CAP_UNSUPPORTED_FEATURE'],
  [
    'limit-compatibility',
    'MongoDB resource and document limit equivalence',
    'CAP_UNSUPPORTED_FEATURE',
  ],
];
const mongodbUnsupported = unsupportedFeatures.map(([id, feature, futureError]) => ({
  id: `mongodb.unsupported.${id}`,
  category: id.split('-')[0],
  feature,
  adapter_status: 'unsupported',
  current_behavior: 'no_adapter_endpoint',
  future_rejection_code: futureError,
  evidence: ['docs/governance/scope.md', 'docs/templates/compatibility-claim.md'],
  note: 'No MongoDB adapter endpoint exists. If a future adapter does not implement this row, it must reject it explicitly with the mapped native error rather than approximate behavior.',
}));
mongodbUnsupported.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

const redisUnsupportedFeatures = [
  ['adapter-endpoint', 'Redis adapter endpoint', 'CAP_UNSUPPORTED_FEATURE'],
  ['wire-resp2', 'RESP2 wire protocol', 'CAP_UNSUPPORTED_VERSION'],
  ['wire-resp3', 'RESP3 wire protocol', 'CAP_UNSUPPORTED_VERSION'],
  ['hello-auth-acl', 'HELLO, AUTH, and ACL behavior', 'VAL_UNKNOWN_COMMAND'],
  ['string-get-set-del', 'GET, SET, and DEL commands', 'VAL_UNKNOWN_COMMAND'],
  ['string-mget-mset', 'MGET and MSET commands', 'VAL_UNKNOWN_COMMAND'],
  ['string-incr-decr', 'INCR and DECR numeric commands', 'VAL_UNKNOWN_COMMAND'],
  ['key-exists-scan', 'EXISTS, KEYS, and SCAN behavior', 'VAL_UNKNOWN_COMMAND'],
  ['expiry', 'EXPIRE, TTL, PTTL, and expiry event semantics', 'VAL_UNKNOWN_COMMAND'],
  ['transactions', 'MULTI, EXEC, DISCARD, and WATCH transactions', 'CAP_UNSUPPORTED_FEATURE'],
  ['pipelining', 'Redis request pipelining and response ordering', 'CAP_UNSUPPORTED_FEATURE'],
  ['pubsub', 'Redis Pub/Sub', 'CAP_UNSUPPORTED_FEATURE'],
  ['streams', 'Redis Streams and consumer groups', 'CAP_UNSUPPORTED_FEATURE'],
  ['lists', 'Redis list data type and commands', 'CAP_UNSUPPORTED_FEATURE'],
  ['sets', 'Redis set data type and commands', 'CAP_UNSUPPORTED_FEATURE'],
  ['sorted-sets', 'Redis sorted-set data type and commands', 'CAP_UNSUPPORTED_FEATURE'],
  ['hashes', 'Redis hash data type and commands', 'CAP_UNSUPPORTED_FEATURE'],
  ['bitmaps', 'Redis bitmap and bitfield operations', 'CAP_UNSUPPORTED_FEATURE'],
  ['hyperloglog', 'Redis HyperLogLog operations', 'CAP_UNSUPPORTED_FEATURE'],
  ['geospatial', 'Redis geospatial operations', 'CAP_UNSUPPORTED_FEATURE'],
  ['scripting-lua', 'Lua scripting', 'CAP_UNSUPPORTED_FEATURE'],
  ['functions', 'Redis Functions', 'CAP_UNSUPPORTED_FEATURE'],
  ['modules', 'Redis module API and module commands', 'CAP_UNSUPPORTED_FEATURE'],
  ['cluster', 'Redis Cluster slots, redirection, and topology', 'CAP_UNSUPPORTED_FEATURE'],
  ['sentinel', 'Redis Sentinel', 'CAP_UNSUPPORTED_FEATURE'],
  ['replication', 'Redis replication and failover', 'CAP_UNSUPPORTED_FEATURE'],
  ['persistence-rdb', 'RDB persistence compatibility', 'CAP_UNSUPPORTED_FEATURE'],
  ['persistence-aof', 'AOF persistence compatibility', 'CAP_UNSUPPORTED_FEATURE'],
  ['keyspace-notifications', 'Redis keyspace notifications', 'CAP_UNSUPPORTED_FEATURE'],
  ['client-compatibility', 'Redis client-library compatibility', 'CAP_UNSUPPORTED_FEATURE'],
  ['error-compatibility', 'Redis error strings and RESP error classes', 'CAP_UNSUPPORTED_FEATURE'],
  [
    'limit-compatibility',
    'Redis limits and eviction-policy compatibility',
    'CAP_UNSUPPORTED_FEATURE',
  ],
  [
    'migration-tooling',
    'Redis import/export/migration/rollback tooling',
    'CAP_UNSUPPORTED_FEATURE',
  ],
];
const redisUnsupported = redisUnsupportedFeatures.map(([id, feature, futureError]) => ({
  id: `redis.unsupported.${id}`,
  category: id.split('-')[0],
  feature,
  adapter_status: 'unsupported',
  current_behavior: 'no_adapter_endpoint',
  future_rejection_code: futureError,
  evidence: ['docs/governance/scope.md', 'docs/templates/compatibility-claim.md'],
  note: 'No Redis adapter endpoint exists. If a future adapter does not implement this row, it must reject it explicitly rather than approximate Redis behavior.',
}));
redisUnsupported.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

const countBy = (rows, field) =>
  Object.fromEntries(
    [...new Set(rows.map((row) => row[field]))]
      .sort()
      .map((value) => [value, rows.filter((row) => row[field] === value).length]),
  );

const matrix = {
  matrix_schema: 'helix.semantic-compatibility-matrix/1',
  matrix_version: '1.0.0',
  semantic_profile: 'helix-native-v1',
  publication_status: 'foundation_semantic_baseline',
  published_on: '2026-07-10',
  generator: { name: 'helix-semantic-compatibility-generator', version: '1.0.0' },
  requirements: ['COMPAT-001', 'DATA-001', 'DATA-002', 'INV-010', 'QUERY-001', 'QUERY-002'],
  references: {
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
  inputs: {
    specifications: identity('Specifications.md'),
    semantic_coverage: identity('fixtures/semantic/coverage-v1.json'),
    semantic_operations: identity('fixtures/semantic/operations-v1.json'),
    semantic_errors: identity('fixtures/semantic/error-cases-v1.json'),
    semantic_manifest: identity('fixtures/semantic/manifest.json'),
    oracle_report: identity('fixtures/semantic/oracle-report-v1.json'),
    mongodb_cases: identity('differential/mongodb/cases-v1.json'),
    mongodb_observations: identity('differential/mongodb/upstream-observations-v1.json'),
    mongodb_report: identity('differential/mongodb/report-v1.json'),
  },
  claims: {
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
  },
  classification_definitions: {
    oracle_executable:
      'Executed by the independent oracle through a registered action or value path.',
    oracle_command: 'Executed by the independent oracle through the normalized find command.',
    oracle_primitive: 'Primitive is executable, but its complete command/operator path is not.',
    oracle_boundary:
      'Compact below/at/above limit boundary is executable; material subsystem enforcement is not implied.',
    oracle_registry:
      'Canonical error metadata is executable synthetically; future subsystem fault injection is not implied.',
    contract_only: 'Normative semantics are accepted, but successful execution is not implemented.',
    explicitly_unsupported_v1: 'Native v1 rejects this behavior and must not reinterpret it.',
    deferred_post_v1: 'Outside v1 and unavailable until a later versioned contract and gate.',
    differential_exact: 'The one committed fixture produced equal normalized results.',
    differential_different:
      'The one committed fixture produced an expected, documented difference.',
    adapter_rewrite:
      'A proposed rewrite produced equal fixture results; no adapter or general applicability claim exists.',
  },
  native_rows: nativeRows,
  mongodb_experimental_cases: mongodbCases,
  mongodb_unsupported: mongodbUnsupported,
  redis_unsupported: redisUnsupported,
  counts: {
    native_rows: nativeRows.length,
    native_by_status: countBy(nativeRows, 'semantic_status'),
    mongodb_experimental_cases: mongodbCases.length,
    mongodb_experimental_by_relation: countBy(mongodbCases, 'relation'),
    mongodb_adapter_supported: 0,
    mongodb_unsupported_rows: mongodbUnsupported.length,
    redis_adapter_supported: 0,
    redis_unsupported_rows: redisUnsupported.length,
    failed: mongodbCases.filter((row) => row.test_status !== 'pass').length,
    skipped: 0,
  },
  verdict: 'pass',
};

const escapeCell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const evidenceLink = (relative) => `[${relative}](../../${relative})`;
const renderDocument = () => {
  const lines = [
    '# HelixDB V1 Semantic and Compatibility Matrix',
    '',
    '- Status: Published foundation semantic baseline; not a product compatibility claim',
    '- Matrix schema: `helix.semantic-compatibility-matrix/1`',
    '- Matrix version: `1.0.0`',
    '- Semantic profile: `helix-native-v1`',
    `- MongoDB reference: ${matrix.references.mongodb.server_product} ${matrix.references.mongodb.server_version} / harness ${matrix.references.mongodb.harness_version} (experimental only)`,
    '- Redis reference: none; no differential or protocol test exists',
    '- Generated by: `helix-semantic-compatibility-generator/1.0.0`',
    '- Plan item: `P01-022`',
    '- Requirements: `INV-010`, `DATA-001`, `DATA-002`, `QUERY-001`, `QUERY-002`, `COMPAT-001`',
    '- Machine-readable source: [matrix-v1.json](../../compatibility/v1/matrix-v1.json)',
    '',
    '## Claim boundary',
    '',
    '**HelixDB has no MongoDB or Redis adapter, compatibility wire endpoint, supported compatibility command, driver/client version, or product compatibility claim at this milestone.** Exact MongoDB differential rows are experimental semantic observations over one fixture each. They are not adapter support. Every unlisted native, MongoDB, and Redis behavior is unsupported by the closed-world rules.',
    '',
    'Native rows distinguish executable reference semantics from accepted contracts and from actual product implementation. `reference_only` means the independent oracle can execute the row; `not_implemented` means the production engine does not exist yet.',
    '',
    '## Immutable inputs',
    '',
    '| Input | Path | SHA-256 | Bytes |',
    '| --- | --- | --- | ---: |',
    ...Object.entries(matrix.inputs).map(
      ([name, input]) =>
        `| \`${name}\` | ${evidenceLink(input.path)} | \`${input.sha256}\` | ${input.bytes} |`,
    ),
    '',
    '## Summary',
    '',
    `- Native semantic rows: ${matrix.counts.native_rows}.`,
    `- Experimental MongoDB differential rows: ${matrix.counts.mongodb_experimental_cases} (${matrix.counts.mongodb_experimental_by_relation.exact} exact, ${matrix.counts.mongodb_experimental_by_relation.different} different).`,
    `- Currently supported MongoDB adapter rows: ${matrix.counts.mongodb_adapter_supported}.`,
    `- Explicit MongoDB unsupported-category rows: ${matrix.counts.mongodb_unsupported_rows}, plus the closed-world unlisted rule.`,
    `- Currently supported Redis adapter rows: ${matrix.counts.redis_adapter_supported}.`,
    `- Explicit Redis unsupported-category rows: ${matrix.counts.redis_unsupported_rows}, plus the closed-world unlisted rule.`,
    `- Failed experimental rows: ${matrix.counts.failed}; skipped rows: ${matrix.counts.skipped}.`,
    '',
    '## Native semantic surface',
    '',
    '| ID | Domain | Feature | Semantic status | Product status | Release | Evidence | Note |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...matrix.native_rows.map(
      (row) =>
        `| \`${row.id}\` | ${escapeCell(row.domain)} | \`${escapeCell(row.feature)}\` | \`${row.semantic_status}\` | \`${row.implementation_status}\` | \`${row.release}\` | ${evidenceLink(row.evidence[0])} | ${escapeCell(row.note)} |`,
    ),
    '',
    '## Experimental MongoDB 6.0.5 differential rows',
    '',
    'All rows below retain `adapter_status=unsupported`. `exact` means only that the committed normalized result matched for that case. `adapter_rewrite` identifies a proposed translation, not implemented behavior.',
    '',
    '| Case | Family | Relation | Translation | Native rows | MongoDB rows | Adapter status | Note |',
    '| --- | --- | --- | --- | ---: | ---: | --- | --- |',
    ...matrix.mongodb_experimental_cases.map(
      (row) =>
        `| \`${row.case_id}\` | ${row.family} | \`${row.relation}\` | \`${row.translation}\` | ${row.native_rows} | ${row.mongodb_rows} | \`${row.adapter_status}\` | ${escapeCell(row.note)} |`,
    ),
    '',
    '## Explicitly unsupported MongoDB categories',
    '',
    'There is currently no adapter endpoint, so the current behavior for every row is `no_adapter_endpoint`. The future rejection code is a requirement for any adapter version that still leaves the row unsupported; it is not a claim that a protocol response exists today.',
    '',
    '| ID | Feature | Current behavior | Required future rejection |',
    '| --- | --- | --- | --- |',
    ...matrix.mongodb_unsupported.map(
      (row) =>
        `| \`${row.id}\` | ${escapeCell(row.feature)} | \`${row.current_behavior}\` | \`${row.future_rejection_code}\` |`,
    ),
    '',
    '## Explicitly unsupported Redis categories',
    '',
    'No Redis differential or protocol harness exists at this milestone. Every row is unsupported with `no_adapter_endpoint`; the future rejection code applies to a later adapter that still leaves the row unsupported.',
    '',
    '| ID | Feature | Current behavior | Required future rejection |',
    '| --- | --- | --- | --- |',
    ...matrix.redis_unsupported.map(
      (row) =>
        `| \`${row.id}\` | ${escapeCell(row.feature)} | \`${row.current_behavior}\` | \`${row.future_rejection_code}\` |`,
    ),
    '',
    '## Closed-world publication rule',
    '',
    'Only a future versioned matrix row backed by an executable adapter/protocol test can authorize a MongoDB-like support claim. Until then:',
    '',
    '- every unlisted native behavior is outside the v1 contract and unsupported;',
    '- every MongoDB behavior not listed as an experimental case is unsupported;',
    '- every experimental case remains unsupported by the absent adapter, even when its relation is exact;',
    '- every Redis behavior is unsupported by the absent adapter and protocol harness;',
    '- no wire protocol, command, option, driver, tool, migration, error-code, topology, or operational compatibility is implied;',
    '- native `contract_only` rows are design contracts, not implemented product features; and',
    '- later implementations must update this matrix rather than silently changing a classification.',
    '',
    '## Reproduction',
    '',
    '```bash',
    'node compatibility/v1/generate-matrix.mjs --check',
    'node compatibility/v1/check-matrix.mjs',
    '```',
  ];
  return `${lines.join('\n')}\n`;
};

const matrixText = `${JSON.stringify(matrix, null, 2)}\n`;
const documentText = renderDocument();
if (mode === '--write') {
  writeFileSync(matrixPath, matrixText);
  writeFileSync(documentPath, documentText);
} else {
  for (const [file, expected] of [
    [matrixPath, matrixText],
    [documentPath, documentText],
  ]) {
    if (!existsSync(file))
      throw new Error(`generated artifact is absent: ${path.relative(repository, file)}`);
    if (readFileSync(file, 'utf8') !== expected) {
      throw new Error(
        `generated artifact differs byte-for-byte: ${path.relative(repository, file)}`,
      );
    }
  }
}

console.log(
  `PASS semantic compatibility matrix: ${matrix.counts.native_rows} native rows, ` +
    `${matrix.counts.mongodb_experimental_cases} MongoDB cases, ` +
    `${matrix.counts.mongodb_unsupported_rows} MongoDB unsupported, ` +
    `${matrix.counts.redis_unsupported_rows} Redis unsupported`,
);
console.log(`PASS matrix inputs: ${Object.keys(matrix.inputs).length} hash-bound artifacts`);
console.log(
  `PASS matrix verdict: ${matrix.verdict}, ${matrix.counts.failed} failed, ${matrix.counts.skipped} skipped`,
);

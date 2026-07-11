#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFixture } from './schema/check-semantic-examples.mjs';
import { canonicalizeFixture, sha256Hex } from './schema/fixture-jcs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '..', '..');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const manifest = readJson(path.join(here, 'manifest.json'));
const coverage = readJson(path.join(here, 'coverage-v1.json'));
const operations = readJson(path.join(here, 'operations-v1.json'));
const errorCases = readJson(path.join(here, 'error-cases-v1.json'));

const fail = (message) => {
  throw new Error(message);
};
const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const same = (left, right, label) => {
  if (JSON.stringify(left) !== JSON.stringify(right)) fail(`${label} mismatch`);
};
const sortedUnique = (values, label) => {
  const canonical = [...new Set(values)].sort();
  same(values, canonical, `${label} canonical order/uniqueness`);
};

if (manifest.manifest_schema !== 'helix.semantic-corpus/1') fail('manifest schema');
if (manifest.fixture_schema !== 'helix.semantic-fixture/1') fail('fixture schema');
if (manifest.semantic_profile !== 'helix-native-v1') fail('semantic profile');
if (manifest.hash_profile !== 'sha256+jcs-rfc8785') fail('hash profile');
if (coverage.coverage_schema !== 'helix.semantic-coverage/1') fail('coverage schema');
if (operations.registry_schema !== 'helix.semantic-operations/1') fail('operation registry');
if (errorCases.registry_schema !== 'helix.semantic-error-cases/1') fail('error case registry');

const diskCasePaths = readdirSync(path.join(here, 'cases'), { recursive: true })
  .filter((name) => name.endsWith('.json'))
  .map((name) => `fixtures/semantic/cases/${name.replaceAll('\\', '/')}`)
  .sort();
const manifestPaths = manifest.fixtures.map((entry) => entry.path);
const manifestIds = manifest.fixtures.map((entry) => entry.id);
sortedUnique(manifestPaths, 'manifest paths');
sortedUnique(manifestIds, 'manifest IDs');
same(manifestPaths, diskCasePaths, 'manifest versus disk paths');
same(manifestIds, coverage.required_case_ids, 'required case IDs');

const operationIds = operations.operations.map((entry) => entry.id);
sortedUnique(operationIds, 'operation IDs');
same(operationIds, coverage.required_operations, 'required operations');
const operationById = new Map(operations.operations.map((entry) => [entry.id, entry]));

const actualCoverage = new Map();
const usedOperations = new Set();
const actualTags = new Set();
const valueTags = new Set();
const actionKinds = new Set();
const orderBases = new Set();
const boundaryRelations = new Map();
let fixtures = 0;
let steps = 0;
let successes = 0;
let errors = 0;

const scanValues = (node) => {
  if (Array.isArray(node)) {
    node.forEach(scanValues);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (typeof node.t === 'string') valueTags.add(node.t);
  Object.values(node).forEach(scanValues);
};

for (const entry of manifest.fixtures) {
  const file = path.resolve(repository, entry.path);
  if (!file.startsWith(path.resolve(here, 'cases') + path.sep)) {
    fail(`${entry.id}: path escapes cases root`);
  }
  const source = readFileSync(file);
  if (source.length !== entry.bytes) fail(`${entry.id}: source byte count`);
  if (sha256Hex(source) !== entry.source_sha256) fail(`${entry.id}: source hash`);
  const fixture = JSON.parse(source.toString('utf8'));
  if (sha256Hex(canonicalizeFixture(fixture)) !== entry.canonical_sha256) {
    fail(`${entry.id}: canonical hash`);
  }
  if (fixture.id !== entry.id) fail(`${entry.id}: root ID`);
  same(fixture.requirements, entry.requirements, `${entry.id}: requirements`);
  same(fixture.tags, entry.tags, `${entry.id}: tags`);
  if (fixture.steps.length !== entry.steps) fail(`${entry.id}: step count`);
  validateFixture(fixture);

  fixtures += 1;
  for (const requirement of fixture.requirements) {
    if (!actualCoverage.has(requirement)) actualCoverage.set(requirement, []);
    actualCoverage.get(requirement).push(fixture.id);
  }
  fixture.tags.forEach((tag) => {
    actualTags.add(tag);
  });
  scanValues(fixture);

  for (const step of fixture.steps) {
    steps += 1;
    actionKinds.add(step.action.kind);
    orderBases.add(step.expect.order.basis);
    if (step.expect.kind === 'success') successes += 1;
    else errors += 1;

    if (step.action.kind === 'value_operation') {
      const operation = operationById.get(step.action.operation);
      if (!operation) fail(`${fixture.id}/${step.id}: unregistered operation`);
      const arity = step.action.arguments.length;
      if (arity < operation.arity.min || arity > operation.arity.max) {
        fail(`${fixture.id}/${step.id}: operation arity`);
      }
      usedOperations.add(step.action.operation);
      if (step.action.operation === 'fixture.generate-boundary') {
        const limitId = step.action.arguments[0].value;
        const relation = step.action.arguments[1].value;
        if (!boundaryRelations.has(limitId)) boundaryRelations.set(limitId, []);
        boundaryRelations.get(limitId).push(relation);
      }
    }
  }
}

const canonicalCoverage = Object.fromEntries(
  [...actualCoverage.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([requirement, ids]) => [requirement, ids.sort()]),
);
same(manifest.coverage, canonicalCoverage, 'requirement coverage');
const actualCounts = { fixtures, steps, successes, errors };
same(manifest.counts, actualCounts, 'manifest counts');
same(coverage.expected_counts, actualCounts, 'coverage counts');
same([...usedOperations].sort(), coverage.required_operations, 'used operations');
same([...actionKinds].sort(), coverage.required_action_kinds, 'action kinds');
same([...orderBases].sort(), coverage.required_order_bases, 'order bases');
same([...valueTags].sort(), coverage.required_value_tags, 'value tags');
for (const tag of coverage.required_tags) {
  if (!actualTags.has(tag)) fail(`required tag absent: ${tag}`);
}

const limitIds = [...boundaryRelations.keys()].sort();
same(limitIds, coverage.required_limit_ids, 'limit IDs');
for (const [limitId, relations] of boundaryRelations) {
  same(relations.sort(), ['above', 'at', 'below'], `${limitId}: relations`);
}

const registryFixture = readJson(path.join(here, 'cases', 'errors', 'registry.json'));
const fixtureErrorByCode = new Map(
  registryFixture.steps.map((step) => [step.expect.code, step.expect]),
);
const requiredErrorCodes = [...fixtureErrorByCode.keys()].sort();
same(requiredErrorCodes, coverage.required_error_codes, 'required error codes');
if (requiredErrorCodes.length !== 74) fail('error code count');
same(
  errorCases.cases.map((entry) => entry.code).sort(),
  requiredErrorCodes,
  'error case registry codes',
);
for (const entry of errorCases.cases) {
  const expected = fixtureErrorByCode.get(entry.code);
  if (!expected) fail(`error case missing ${entry.code}`);
  for (const key of ['category', 'phase', 'outcome']) {
    if (expected[key] !== entry[key]) fail(`${entry.code}: ${key}`);
  }
  for (const key of ['retryable', 'scope', 'token']) {
    if (expected.retry[key] !== entry[key]) fail(`${entry.code}: retry.${key}`);
  }
}

const errorDocument = readFileSync(
  path.join(repository, 'docs', 'architecture', 'error-semantics.md'),
  'utf8',
);
const documentedErrorCodes = [...errorDocument.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|/gm)].map(
  (match) => match[1],
);
same([...documentedErrorCodes].sort(), requiredErrorCodes, 'documented error registry');

const limitDocument = readFileSync(
  path.join(repository, 'docs', 'architecture', 'limits-v1.md'),
  'utf8',
);
const limitTable = limitDocument.slice(
  limitDocument.indexOf('| Stable limit ID |'),
  limitDocument.indexOf('The document/depth choices'),
);
const documentedLimits = [...limitTable.matchAll(/^\| `([a-z][a-z0-9_.]+)` \|/gm)].map(
  (match) => match[1],
);
same([...documentedLimits].sort(), limitIds, 'documented limit IDs');

console.log(
  `PASS corpus: ${fixtures} fixtures, ${steps} steps, ${successes} successes, ${errors} errors`,
);
console.log(
  `PASS integrity: ${manifest.fixtures.length} source/canonical hashes and exact manifest coverage/counts`,
);
console.log(
  `PASS breadth: ${valueTags.size} value tags, ${actionKinds.size} actions, ${orderBases.size} order bases, ${usedOperations.size} operations`,
);
console.log(
  `PASS boundaries/registry: ${limitIds.length} limits x3 and ${requiredErrorCodes.length} documented error codes`,
);

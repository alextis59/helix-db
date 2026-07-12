#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const policy = JSON.parse(read('docs/architecture/host-boundary-tracing-v1.json'));
const calls = JSON.parse(read('docs/architecture/browser-host-skeleton-v1.json')).calls;
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
const same = (actual, expected, label) =>
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} mismatch`);

export const validateTracingPolicy = (value = policy) => {
  same(
    Object.keys(value),
    [
      'schema',
      'plan_item',
      'abi',
      'record',
      'forbidden_fields',
      'bounds',
      'implementations',
      'validation',
      'claim_boundary',
    ],
    'policy fields',
  );
  assert(
    value.schema === 'helix.host-boundary-tracing/1' && value.plan_item === 'P04-015',
    'identity',
  );
  same(value.abi, { package: 'helix:core-abi@7.0.0', calls: 21, capability_kinds: 12 }, 'ABI');
  same(
    value.record,
    {
      fields: ['sequence', 'call', 'result', 'copied_bytes', 'batch_items'],
      result_fields: ['tag', 'error_code'],
      sequence_scope: 'per-host-instance',
      copy_count_semantics: 'exact-explicit-copy-boundary-bytes',
      batch_count_semantics: 'admitted-request-count',
      content_values_present: false,
    },
    'record',
  );
  same(
    value.forbidden_fields,
    [
      'scope',
      'path',
      'request_id',
      'idempotency_key',
      'document_bytes',
      'secret_value',
      'clock_value',
      'random_value',
      'device_identifier',
      'error_message',
    ],
    'forbidden fields',
  );
  same(
    value.bounds,
    {
      maximum_records_per_host: 16384,
      overflow_behavior: 'drop-and-count-without-changing-call-result',
    },
    'bounds',
  );
  same(
    value.implementations.mock_rust,
    {
      path: 'crates/helix-host-mock/src/lib.rs',
      all_calls_traced: true,
      copy_counts_traced: true,
      batch_counts_traced: true,
      bounded_drop_counter: true,
    },
    'mock',
  );
  same(
    value.implementations.browser_typescript,
    {
      path: 'packages/browser-host/src/index.ts',
      all_calls_traced: true,
      copy_counts_traced: true,
      batch_counts_traced: true,
      bounded_drop_counter: true,
    },
    'browser',
  );
  same(
    value.validation,
    {
      rust_content_redaction_test: 'boundary_trace_records_structure_without_content',
      browser_content_redaction_test: 'tests/browser/browser-host.spec.ts',
      browser_engines: ['chromium', 'firefox', 'webkit'],
      policy_mutation_canaries: 32,
      source_mutation_canaries: 13,
    },
    'validation',
  );
  same(
    value.claim_boundary,
    {
      structural_boundary_tracing_present: true,
      document_content_logged: false,
      native_linked_call_tracing_present: false,
      telemetry_exporter_present: false,
      distributed_trace_context_present: false,
      wall_clock_timing_present: false,
      database_functionality_added: false,
      next_implementation_owner: 'P04-016',
    },
    'claims',
  );
  return value;
};

export const validateTracingSources = ({ mock, browser, browserTest }) => {
  for (const marker of [
    'pub copied_bytes: u64',
    'pub batch_items: u32',
    'boundary_trace_records_structure_without_content',
    'document-secret-value',
    'dropped_trace_records()',
  ])
    assert(mock.includes(marker), `mock ${marker}`);
  for (const marker of [
    'MAXIMUM_BROWSER_TRACE_RECORDS = 16_384',
    'export interface BrowserBoundaryTraceRecord {',
    '#recordTrace(call: string, result: BrowserTraceResult',
    'async #traceAsync<T>(',
    'droppedTraceRecords()',
    'Math.min(Number.MAX_SAFE_INTEGER',
  ])
    assert(browser.includes(marker), `browser ${marker}`);
  for (const call of calls) assert(browser.includes(`'${call}'`), `browser trace call ${call}`);
  for (const marker of [
    'result.trace.dropped',
    'record.copiedBytes > 0',
    'const serializedTrace = JSON.stringify(result.trace);',
    "'requestId'",
    "'020304'",
    'result.trace.limited',
  ])
    assert(browserTest.includes(marker), `browser test ${marker}`);
};

validateTracingPolicy();
validateTracingSources({
  mock: read(policy.implementations.mock_rust.path),
  browser: read(policy.implementations.browser_typescript.path),
  browserTest: read(policy.validation.browser_content_redaction_test),
});
const matrix = JSON.parse(read('.github/ci/matrix.json'));
assert(matrix.plan_items.includes('P04-015'), 'CI implementation history');
process.stdout.write(
  'PASS host boundary tracing: 21 structural calls, bounded copy/batch counts, no document content\n',
);

#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateTracingPolicy, validateTracingSources } from './check-host-boundary-tracing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const policy = JSON.parse(read('docs/architecture/host-boundary-tracing-v1.json'));
const mutations = [
  [
    'field',
    (v) => {
      v.extra = true;
    },
  ],
  [
    'schema',
    (v) => {
      v.schema += 'x';
    },
  ],
  [
    'owner',
    (v) => {
      v.plan_item = 'P04-016';
    },
  ],
  [
    'calls',
    (v) => {
      v.abi.calls = 20;
    },
  ],
  [
    'kinds',
    (v) => {
      v.abi.capability_kinds = 11;
    },
  ],
  [
    'record fields',
    (v) => {
      v.record.fields.pop();
    },
  ],
  [
    'result fields',
    (v) => {
      v.record.result_fields.pop();
    },
  ],
  [
    'sequence',
    (v) => {
      v.record.sequence_scope = 'global';
    },
  ],
  [
    'copy semantics',
    (v) => {
      v.record.copy_count_semantics = 'payload';
    },
  ],
  [
    'batch semantics',
    (v) => {
      v.record.batch_count_semantics = 'result';
    },
  ],
  [
    'content',
    (v) => {
      v.record.content_values_present = true;
    },
  ],
  [
    'forbidden',
    (v) => {
      v.forbidden_fields.pop();
    },
  ],
  [
    'bound',
    (v) => {
      v.bounds.maximum_records_per_host = 0;
    },
  ],
  [
    'overflow',
    (v) => {
      v.bounds.overflow_behavior = 'fail-call';
    },
  ],
  [
    'mock all',
    (v) => {
      v.implementations.mock_rust.all_calls_traced = false;
    },
  ],
  [
    'mock copy',
    (v) => {
      v.implementations.mock_rust.copy_counts_traced = false;
    },
  ],
  [
    'mock batch',
    (v) => {
      v.implementations.mock_rust.batch_counts_traced = false;
    },
  ],
  [
    'mock bound',
    (v) => {
      v.implementations.mock_rust.bounded_drop_counter = false;
    },
  ],
  [
    'browser all',
    (v) => {
      v.implementations.browser_typescript.all_calls_traced = false;
    },
  ],
  [
    'browser copy',
    (v) => {
      v.implementations.browser_typescript.copy_counts_traced = false;
    },
  ],
  [
    'browser batch',
    (v) => {
      v.implementations.browser_typescript.batch_counts_traced = false;
    },
  ],
  [
    'browser bound',
    (v) => {
      v.implementations.browser_typescript.bounded_drop_counter = false;
    },
  ],
  [
    'rust test',
    (v) => {
      v.validation.rust_content_redaction_test = 'missing';
    },
  ],
  [
    'browser test',
    (v) => {
      v.validation.browser_content_redaction_test = 'missing';
    },
  ],
  [
    'engine',
    (v) => {
      v.validation.browser_engines.pop();
    },
  ],
  [
    'policy canaries',
    (v) => {
      v.validation.policy_mutation_canaries = 0;
    },
  ],
  [
    'source canaries',
    (v) => {
      v.validation.source_mutation_canaries = 0;
    },
  ],
  [
    'positive claim',
    (v) => {
      v.claim_boundary.structural_boundary_tracing_present = false;
    },
  ],
  [
    'content claim',
    (v) => {
      v.claim_boundary.document_content_logged = true;
    },
  ],
  [
    'native claim',
    (v) => {
      v.claim_boundary.native_linked_call_tracing_present = true;
    },
  ],
  [
    'exporter claim',
    (v) => {
      v.claim_boundary.telemetry_exporter_present = true;
    },
  ],
  [
    'next owner',
    (v) => {
      v.claim_boundary.next_implementation_owner = 'P04-015';
    },
  ],
];
if (mutations.length !== 32) throw new Error(`policy mutations ${mutations.length}`);
for (const [label, mutate] of mutations) {
  const value = structuredClone(policy);
  mutate(value);
  try {
    validateTracingPolicy(value);
  } catch {
    continue;
  }
  throw new Error(`${label} accepted`);
}
const sources = {
  mock: read(policy.implementations.mock_rust.path),
  browser: read(policy.implementations.browser_typescript.path),
  browserTest: read(policy.validation.browser_content_redaction_test),
};
const sourceMutations = [
  ['mock bytes', 'mock', 'pub copied_bytes: u64'],
  ['mock batch', 'mock', 'pub batch_items: u32'],
  ['mock redaction', 'mock', policy.validation.rust_content_redaction_test],
  ['mock dropped', 'mock', 'dropped_trace_records()'],
  ['browser bound', 'browser', 'MAXIMUM_BROWSER_TRACE_RECORDS = 16_384'],
  ['browser type', 'browser', 'export interface BrowserBoundaryTraceRecord {'],
  ['browser sync', 'browser', '#recordTrace(call: string, result: BrowserTraceResult'],
  ['browser async', 'browser', 'async #traceAsync<T>('],
  ['browser dropped', 'browser', 'droppedTraceRecords()'],
  ['browser drop bound', 'browser', 'Math.min(Number.MAX_SAFE_INTEGER'],
  ['browser redaction', 'browserTest', 'const serializedTrace = JSON.stringify(result.trace);'],
  ['browser copy', 'browserTest', 'record.copiedBytes > 0'],
  ['browser overflow', 'browserTest', 'result.trace.limited'],
];
for (const [label, key, marker] of sourceMutations) {
  const value = { ...sources, [key]: sources[key].replace(marker, 'BROKEN') };
  try {
    validateTracingSources(value);
  } catch {
    continue;
  }
  throw new Error(`${label} accepted`);
}
process.stdout.write(
  `PASS host boundary tracing rejection canaries: ${mutations.length + sourceMutations.length} mutations rejected\n`,
);

#!/usr/bin/env node

import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';

import {
  applicableStages,
  assert,
  buildSummary,
  currentSourceControl,
  fileIdentity,
  jsonBytes,
  loadWorkload,
  paths,
  repository,
  resolveRepositoryPath,
  sha256,
  sourcePaths,
  stageOrder,
  validateRawResult,
  validateSchemas,
  validateSummary,
} from './benchmark-contract.mjs';

const normalizeAmbientText = (value, label, maximum = 500) => {
  if (value === undefined || value === '') return null;
  const normalized = value.trim().replaceAll(/\s+/g, ' ');
  assert(normalized.length >= 1 && normalized.length <= maximum, `${label}: invalid length`);
  assert(
    ![...normalized].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    }),
    `${label}: control character`,
  );
  return normalized;
};

const githubValue = (name) => normalizeAmbientText(process.env[name], name);

const executionEnvironment = () => {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    return {
      provider: 'local',
      runner_environment: null,
      workflow: null,
      job: null,
      repository: null,
      ref: null,
      github_sha: null,
      run_id: null,
      run_attempt: null,
    };
  }
  const runAttemptText = githubValue('GITHUB_RUN_ATTEMPT');
  assert(runAttemptText !== null && /^\d+$/.test(runAttemptText), 'invalid GitHub run attempt');
  return {
    provider: 'github-actions',
    runner_environment: githubValue('RUNNER_ENVIRONMENT'),
    workflow: githubValue('GITHUB_WORKFLOW'),
    job: githubValue('GITHUB_JOB'),
    repository: githubValue('GITHUB_REPOSITORY'),
    ref: githubValue('GITHUB_REF'),
    github_sha: githubValue('GITHUB_SHA'),
    run_id: githubValue('GITHUB_RUN_ID'),
    run_attempt: Number(runAttemptText),
  };
};

const createDataset = (dataset) => {
  let state = dataset.seed >>> 0;
  const bytes = Buffer.alloc(dataset.bytes);
  for (let index = 0; index < bytes.length; index += 1) {
    state = (Math.imul(state, dataset.multiplier) + dataset.increment) >>> 0;
    bytes[index] = state >>> 24;
  }
  assert(state === dataset.final_state, `dataset final state ${state} != ${dataset.final_state}`);
  assert(sha256(bytes) === dataset.sha256, 'dataset SHA-256 mismatch');
  return bytes;
};

const emptyStages = () =>
  stageOrder.map((name) => ({
    name,
    applicable: applicableStages.includes(name),
    duration_ns: 0,
  }));

const duration = (start) => {
  const elapsed = process.hrtime.bigint() - start;
  assert(elapsed >= 0n && elapsed <= BigInt(Number.MAX_SAFE_INTEGER), 'timing outside safe range');
  return Number(elapsed);
};

const setDuration = (stages, name, value) => {
  const stage = stages.find((candidate) => candidate.name === name);
  assert(stage?.applicable, `unknown or non-applicable measured stage: ${name}`);
  stage.duration_ns = value;
};

const failureMessage = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500) || 'unknown benchmark failure';
};

const observe = (kind, index, buffer, workload, deadline) => {
  const stages = emptyStages();
  const endToEndStart = process.hrtime.bigint();
  let digest = null;
  let digestBytes = null;
  let operations = 0;
  let outputBytes = 0;
  let verified = false;
  let status = 'pass';
  let error = null;
  try {
    assert(Date.now() <= deadline, 'benchmark timeout exceeded before repetition');
    const digests = [];
    const executeStart = process.hrtime.bigint();
    try {
      for (
        let operation = 0;
        operation < workload.workload.operations_per_repetition;
        operation += 1
      ) {
        digests.push(createHash('sha256').update(buffer).digest());
        operations += 1;
      }
    } finally {
      setDuration(stages, 'execute', duration(executeStart));
    }

    const materializeStart = process.hrtime.bigint();
    try {
      digestBytes = digests.at(-1);
      assert(Buffer.isBuffer(digestBytes), 'benchmark produced no digest');
      digest = digestBytes.toString('hex');
      outputBytes = digestBytes.length;
    } finally {
      setDuration(stages, 'materialize', duration(materializeStart));
    }

    const verifyStart = process.hrtime.bigint();
    try {
      const expected = Buffer.from(workload.workload.expected_digest_sha256, 'hex');
      verified =
        digests.length === workload.workload.operations_per_repetition &&
        digests.every(
          (candidate) =>
            candidate.length === expected.length && timingSafeEqual(candidate, expected),
        );
      assert(verified, 'benchmark digest verification failed');
    } finally {
      setDuration(stages, 'verify', duration(verifyStart));
    }
    assert(Date.now() <= deadline, 'benchmark timeout exceeded after repetition');
  } catch (caught) {
    status = 'fail';
    error = failureMessage(caught);
    verified = false;
  } finally {
    setDuration(stages, 'end_to_end', duration(endToEndStart));
  }
  return {
    kind,
    index,
    status,
    fallback: false,
    error,
    stages,
    result: {
      input_bytes: operations * buffer.length,
      operations,
      output_bytes: outputBytes,
      digest_sha256: digest,
      verified,
    },
  };
};

const createEnvironment = () => {
  const execution = executionEnvironment();
  const cpus = os.cpus();
  const cpuModel = normalizeAmbientText(cpus[0]?.model, 'CPU model');
  return {
    hardware: {
      architecture: process.arch,
      cpu_model: cpuModel,
      logical_cpus: Math.max(1, cpus.length),
      memory_bytes: os.totalmem(),
      gpu: null,
      storage: null,
    },
    software: {
      platform: process.platform,
      os_release: os.release(),
      node: process.version,
      v8: process.versions.v8,
      openssl: process.versions.openssl,
    },
    execution,
    conditions: {
      background_load: 'unknown',
      isolation:
        execution.provider === 'github-actions' ? 'github-hosted-runner' : 'uncontrolled-local',
      power_thermal: 'unknown',
      network: 'not-used',
    },
  };
};

const main = () => {
  assert(process.argv.length === 2, 'usage: node benchmarks/run-baseline.mjs');
  assert(process.cwd() === repository, 'benchmark must run from the repository root');
  validateSchemas();
  const workload = loadWorkload();
  const dataset = createDataset(workload.dataset);
  const recordedAt = new Date().toISOString();
  const environment = createEnvironment();
  const executionId =
    environment.execution.provider === 'github-actions'
      ? `github-${environment.execution.run_id}-${environment.execution.run_attempt}`
      : `local-${recordedAt}`;
  const deadline = Date.now() + workload.workload.timeout_ms;
  const observations = [];
  for (let index = 1; index <= workload.workload.warmup_repetitions; index += 1) {
    observations.push(observe('warmup', index, dataset, workload, deadline));
  }
  for (let index = 1; index <= workload.workload.measured_repetitions; index += 1) {
    observations.push(observe('measurement', index, dataset, workload, deadline));
  }
  const measurements = observations.filter(({ kind }) => kind === 'measurement');
  const totals = {
    warmup_observations: observations.filter(({ kind }) => kind === 'warmup').length,
    measured_observations: measurements.length,
    passed_observations: observations.filter(({ status }) => status === 'pass').length,
    failed_observations: observations.filter(({ status }) => status === 'fail').length,
    fallback_observations: observations.filter(({ fallback }) => fallback).length,
    measured_input_bytes: measurements.reduce(
      (total, observation) => total + observation.result.input_bytes,
      0,
    ),
    measured_operations: measurements.reduce(
      (total, observation) => total + observation.result.operations,
      0,
    ),
  };
  const failures = observations.filter(({ status }) => status === 'fail').map(({ error }) => error);
  const raw = {
    schema: 'helix.benchmark-raw-result/1',
    plan_item: 'P02-014',
    recorded_at: recordedAt,
    execution_id: executionId,
    claim_boundary: workload.claim_boundary,
    workload: { id: workload.id, version: workload.version, ...fileIdentity(paths.workload) },
    sources: sourcePaths.map(fileIdentity),
    source_control: currentSourceControl(),
    environment,
    configuration: {
      operation: workload.workload.operation,
      backend: workload.workload.backend,
      residency: workload.workload.residency,
      selectivity: workload.workload.selectivity,
      result_size_bytes: workload.workload.result_size_bytes,
      concurrency: workload.workload.concurrency,
      operations_per_repetition: workload.workload.operations_per_repetition,
      warmup_repetitions: workload.workload.warmup_repetitions,
      measured_repetitions: workload.workload.measured_repetitions,
      timeout_ms: workload.workload.timeout_ms,
      stage_order: workload.workload.stage_order,
      failure_policy: workload.workload.failure_policy,
      fallback_policy: workload.workload.fallback_policy,
      outlier_policy: workload.workload.outlier_policy,
    },
    dataset: {
      generator: workload.dataset.generator,
      seed: workload.dataset.seed,
      bytes: workload.dataset.bytes,
      sha256: workload.dataset.sha256,
      final_state: workload.dataset.final_state,
      provenance: workload.dataset.provenance,
      license: workload.dataset.license,
    },
    observations,
    totals,
    failures,
    verdict: failures.length === 0 && totals.fallback_observations === 0 ? 'pass' : 'fail',
  };
  validateRawResult(raw, { requireComplete: raw.verdict === 'pass' });
  const rawBytes = jsonBytes(raw);
  assert(rawBytes.length <= workload.output.max_raw_bytes, 'raw result exceeds output limit');
  const summary = buildSummary(raw, rawBytes);
  validateSummary(summary, raw, rawBytes);
  const summaryBytes = jsonBytes(summary);
  assert(summaryBytes.length <= workload.output.max_summary_bytes, 'summary exceeds output limit');

  rmSync(resolveRepositoryPath(workload.output.directory), { recursive: true, force: true });
  mkdirSync(resolveRepositoryPath(workload.output.directory), { recursive: true });
  writeFileSync(resolveRepositoryPath(workload.output.raw_path), rawBytes, { flag: 'wx' });
  writeFileSync(resolveRepositoryPath(workload.output.summary_path), summaryBytes, { flag: 'wx' });
  process.stdout.write(
    `PASS benchmark baseline: ${totals.warmup_observations} warmups, ${totals.measured_observations} measurements, ${totals.measured_operations} operations, raw ${rawBytes.length} bytes ${sha256(rawBytes)}\n`,
  );
  if (raw.verdict !== 'pass') throw new Error('benchmark baseline recorded one or more failures');
};

try {
  main();
} catch (error) {
  process.stderr.write(`FAIL ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

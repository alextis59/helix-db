#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalize, sha256Hex } from './canonical.mjs';
import { runCorpus } from './oracle.mjs';
import { runReportDraft202012Validation, validateOracleReport } from './validate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '..', '..');
const defaultReport = path.join(repository, 'fixtures', 'semantic', 'oracle-report-v1.json');
const arguments_ = process.argv.slice(2);
let mode = 'check';
let reportPath = defaultReport;
let draft = true;

for (let index = 0; index < arguments_.length; index += 1) {
  const argument = arguments_[index];
  if (argument === '--check-report') mode = 'check';
  else if (argument === '--write-report') mode = 'write';
  else if (argument === '--print-report') mode = 'print';
  else if (argument === '--no-draft-validation') draft = false;
  else if (argument === '--report') {
    const candidate = arguments_[index + 1];
    if (!candidate) throw new Error('--report requires a repository-relative path');
    reportPath = path.resolve(repository, candidate);
    index += 1;
  } else {
    throw new Error(
      'usage: cli.mjs [--check-report|--write-report|--print-report] [--report <path>] [--no-draft-validation]',
    );
  }
}

if (!reportPath.startsWith(repository + path.sep)) throw new Error('report path escapes repository');
if (existsSync(reportPath) && lstatSync(reportPath).isSymbolicLink()) {
  throw new Error('report path must not be a symbolic link');
}
const execution = runCorpus(repository, { draft });
validateOracleReport(execution.report);
if (draft) runReportDraft202012Validation(repository, execution.report);
const reportText = `${JSON.stringify(execution.report, null, 2)}\n`;

if (mode === 'write') writeFileSync(reportPath, reportText);
else if (mode === 'print') process.stdout.write(reportText);
else {
  if (!existsSync(reportPath)) throw new Error(`oracle report is absent: ${path.relative(repository, reportPath)}`);
  const committed = readFileSync(reportPath, 'utf8');
  if (committed !== reportText) throw new Error('oracle report differs byte-for-byte from independent execution');
}

if (execution.report.verdict !== 'pass') {
  for (const fixture of execution.fixtureRuns) {
    for (const step of fixture.results.filter((candidate) => candidate.status === 'fail')) {
      console.error(
        `FAIL ${fixture.fixture}/${step.id} ${step.diagnostic.code} expected=${step.diagnostic.expected_sha256} actual=${step.diagnostic.actual_sha256}`,
      );
    }
  }
  process.exitCode = 1;
} else if (mode !== 'print') {
  const reportHash = sha256Hex(canonicalize(execution.report));
  console.log(
    `PASS oracle: ${execution.report.counts.fixtures} fixtures, ${execution.report.counts.steps} steps, ` +
      `${execution.report.counts.passed} passed, 0 failed, 0 skipped`,
  );
  console.log(
    `PASS actions: ${Object.entries(execution.report.action_counts)
      .map(([name, count]) => `${name}=${count}`)
      .join(' ')}`,
  );
  console.log(`PASS corpus manifest: ${execution.report.corpus_manifest_sha256}`);
  console.log(`PASS oracle report: ${reportHash}`);
}

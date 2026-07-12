#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { validateHosted, validateReview } from './gate-contract.mjs';

const hosted = JSON.parse(
  readFileSync(new URL('./hosted-observation.json', import.meta.url), 'utf8'),
);
const review = readFileSync(new URL('./review.md', import.meta.url), 'utf8');
const reviewedCommit = '6f5b88a8e5f11ccc4fabc264a1fe76aba5109445';
const expectReject = (label, mutate) => {
  const candidate = structuredClone(hosted);
  mutate(candidate);
  try {
    validateHosted(candidate, reviewedCommit);
  } catch {
    return;
  }
  throw new Error(`${label} unexpectedly accepted`);
};

validateHosted(hosted, reviewedCommit);
validateReview(review);
expectReject('wrong reviewed head', (candidate) => {
  candidate.head_sha = '0'.repeat(40);
});
expectReject('failed run', (candidate) => {
  candidate.conclusion = 'failure';
});
expectReject('failed job', (candidate) => {
  candidate.jobs[0].conclusion = 'failure';
});
expectReject('missing portability job', (candidate) => {
  candidate.jobs.pop();
});
expectReject('renamed job', (candidate) => {
  candidate.jobs[0].name = 'Unknown lane';
});

process.stdout.write('PASS G03 gate rejection canaries: 5 hosted mutations rejected\n');

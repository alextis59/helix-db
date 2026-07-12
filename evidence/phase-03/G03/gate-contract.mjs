const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

export const expectedJobs = [
  'Browser bundle smoke / chromium',
  'Browser bundle smoke / firefox',
  'Browser bundle smoke / webkit',
  'Matrix contract',
  'Native / linux-x64',
  'Native / macos-arm64',
  'Native / windows-x64',
  'Node 22.23.1 / Linux x64',
  'Node 24.18.0 / Linux x64',
  'Portable Rust / wasm32-unknown-unknown',
  'Portable Rust / wasm32-wasip2',
  'Sanitizer / asan-linux-x64',
];

export const validateHosted = (hosted, reviewedCommit) => {
  assert(hosted.schema === 'helix.gate-hosted-observation/1', 'hosted schema');
  assert(hosted.gate === 'G03', 'hosted gate');
  assert(hosted.run_id === 29186601834, 'hosted run ID');
  assert(hosted.head_sha === reviewedCommit, 'hosted head');
  assert(hosted.head_branch === 'main' && hosted.event === 'push', 'hosted trigger');
  assert(hosted.status === 'completed' && hosted.conclusion === 'success', 'hosted result');
  assert(
    hosted.url === 'https://github.com/alextis59/helix-db/actions/runs/29186601834',
    'hosted URL',
  );
  assert(hosted.jobs.length === 12, 'hosted job count');
  const names = hosted.jobs.map(({ name }) => name).sort();
  assert(JSON.stringify(names) === JSON.stringify(expectedJobs), 'hosted job inventory');
  const ids = new Set();
  for (const job of hosted.jobs) {
    assert(Number.isSafeInteger(job.id) && job.id > 0 && !ids.has(job.id), `${job.name}: job ID`);
    ids.add(job.id);
    assert(job.status === 'completed' && job.conclusion === 'success', `${job.name}: result`);
    assert(job.started_at < job.completed_at, `${job.name}: timestamps`);
  }
  return hosted;
};

export const validateReview = (review) => {
  for (const marker of [
    'Verdict: Pass',
    'G03-F01',
    'G03-F02',
    'G03-F03',
    'G03-F04',
    'G03-F05',
    'no open critical issue',
    'G03 may be checked',
  ]) {
    assert(review.includes(marker), `review marker ${marker}`);
  }
  return review;
};

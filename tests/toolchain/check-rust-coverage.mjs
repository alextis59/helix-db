#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const policyPath = 'tests/toolchain/rust-coverage-policy.json';
const policyBytes = readFileSync(path.join(repository, policyPath));
const policy = JSON.parse(policyBytes);
const mode = process.argv[2];

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sorted = (values) => [...values].sort();
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};
const same = (actual, expected, label) => {
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    throw new Error(`${label} mismatch: ${JSON.stringify(actual)}`);
  }
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readBytes = (file) => readFileSync(path.join(repository, file));
const readText = (file) => readBytes(file).toString('utf8');
const normalize = (file) => file.split(path.sep).join('/');
const relativeSource = (file) => {
  const absolute = path.resolve(file);
  const prefix = repository + path.sep;
  if (!absolute.startsWith(prefix)) return null;
  return normalize(path.relative(repository, absolute));
};
const run = (program, args, options = {}) =>
  execFileSync(program, args, {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    timeout: 900_000,
    ...options,
  });
const runResult = (program, args, options = {}) =>
  spawnSync(program, args, {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    timeout: 900_000,
    ...options,
  });

const walk = (directory) => {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
};

const metricNames = ['branches', 'functions', 'lines', 'regions'];
const emptyMetrics = () =>
  Object.fromEntries(
    metricNames.map((name) => [
      name,
      { count: 0, covered: 0, missed: 0, percent_basis_points: null },
    ]),
  );
const finishMetric = (covered, count) => ({
  count,
  covered,
  missed: count - covered,
  percent_basis_points: count === 0 ? null : Math.floor((covered * 10000) / count),
});
const addMetrics = (records) => {
  const result = emptyMetrics();
  for (const name of metricNames) {
    const count = records.reduce((sum, record) => sum + record.metrics[name].count, 0);
    const covered = records.reduce((sum, record) => sum + record.metrics[name].covered, 0);
    result[name] = finishMetric(covered, count);
  }
  return result;
};
const metricPasses = (metric, threshold) =>
  metric.count === 0 || metric.covered * 10000 >= threshold * metric.count;

const validatePolicy = () => {
  same(
    sorted(Object.keys(policy)),
    [
      'active_product_scope',
      'empty_product_scope',
      'execution',
      'groups',
      'plan_item',
      'report',
      'schema',
      'source',
      'toolchain',
    ],
    'coverage policy fields',
  );
  assert(policy.schema === 'helix.rust-coverage-policy/1', 'coverage policy schema');
  assert(policy.plan_item === 'P02-013', 'coverage policy task');
  same(
    policy.execution.cargo_arguments,
    [
      'test',
      '--frozen',
      '--profile',
      'coverage',
      '--workspace',
      '--all-features',
      '--lib',
      '--no-run',
      '--message-format=json',
    ],
    'coverage Cargo command',
  );
  assert(policy.execution.rustflags === '-C instrument-coverage', 'coverage rustflags');
  assert(policy.execution.ci_lane === 'linux-x64', 'coverage CI lane');
  assert(
    policy.execution.platform === 'linux' && policy.execution.architecture === 'x64',
    'coverage execution host',
  );
  assert(
    policy.execution.minimum_test_binaries === 8 &&
      policy.execution.maximum_test_binaries === 128 &&
      policy.execution.minimum_tests === 25 &&
      policy.execution.maximum_tests === 100000 &&
      policy.execution.minimum_raw_profiles === 8 &&
      policy.execution.maximum_raw_profiles === 128,
    'coverage execution bounds',
  );
  same(
    policy.toolchain,
    {
      llvm_release: '22.1.2',
      rust_release: '1.96.1',
      rustup_component: 'llvm-tools',
    },
    'coverage toolchain',
  );
  assert(
    policy.source.include_regex ===
      '^crates/(?!helix-doc/src/property_tests\\.rs$)[^/]+/src/.+\\.rs$',
    'source inclusion',
  );
  same(
    policy.source.excluded_path_rules,
    [
      {
        reason: 'test-benchmark-example-code',
        regex: '^crates/[^/]+/(?:tests|benches|examples)/.+\\.rs$',
      },
      {
        reason: 'cfg-test-only-deterministic-property-module',
        regex: '^crates/helix-doc/src/property_tests\\.rs$',
      },
    ],
    'path exclusions',
  );
  same(
    policy.source.inline_exclusion,
    {
      end_marker: '// helix-coverage: exclude-end unit-tests',
      reason: 'inline-unit-test-code',
      required_attribute: '#[cfg(test)]',
      required_module: 'mod tests {',
      start_marker: '// helix-coverage: exclude-start unit-tests',
    },
    'inline exclusion policy',
  );
  assert(
    policy.empty_product_scope.allowed_status === 'boundary-skeleton' &&
      policy.empty_product_scope.requires_database_functionality === false &&
      policy.empty_product_scope.revalidate_by === 'P03-008' &&
      policy.empty_product_scope.reason.length >= 150,
    'empty product-scope exception',
  );
  assert(
    policy.active_product_scope.allowed_status === 'buffer-alternatives-prototype-v1' &&
      policy.active_product_scope.requires_database_functionality === true &&
      policy.active_product_scope.activated_by === 'P03-008' &&
      policy.active_product_scope.reason.length >= 150,
    'active product-scope contract',
  );
  same(
    policy.groups.map(({ id }) => id),
    ['workspace-product', 'semantic-critical', 'recovery-critical'],
    'coverage group order',
  );
  const expectedGroupShape = [
    ['workspace-product', 8, false, [8500, 9000, 9000, 8500]],
    ['semantic-critical', 3, true, [9500, 10000, 10000, 9500]],
    ['recovery-critical', 2, true, [9500, 10000, 10000, 9500]],
  ];
  same(
    policy.groups.map((group) => [
      group.id,
      group.minimum_source_files,
      group.enforce_per_file,
      metricNames.map((name) => group.thresholds_basis_points[name]),
    ]),
    expectedGroupShape,
    'coverage threshold baseline',
  );
  for (const group of policy.groups) {
    assert(group.description.length >= 40, `${group.id}: group description too short`);
    const expression = new RegExp(group.include_regex);
    assert(expression.test('crates/helix-core/src/lib.rs'), `${group.id}: core mapping absent`);
    for (const name of metricNames) {
      const threshold = group.thresholds_basis_points[name];
      assert(
        Number.isSafeInteger(threshold) && threshold >= 0 && threshold <= 10000,
        `${group.id}: invalid ${name} threshold`,
      );
    }
  }
  same(
    policy.report,
    {
      maximum_bytes: 2097152,
      output: 'dist/coverage/rust-coverage.json',
      schema: 'helix.rust-coverage-report/1',
    },
    'coverage report policy',
  );
  const toolchain = readText('rust-toolchain.toml');
  assert(toolchain.includes('channel = "1.96.1"'), 'coverage Rust pin absent');
  assert(toolchain.includes('"llvm-tools"'), 'llvm-tools component absent from toolchain');
  const manifest = readText('Cargo.toml');
  assert(manifest.includes('coverage-rustflags = "-C instrument-coverage"'), 'coverage metadata');
  assert(manifest.includes('[profile.coverage]'), 'coverage Cargo profile absent');
  return validateSources();
};

const inlineExclusions = (file, source) => {
  const lines = source.split('\n');
  const contract = policy.source.inline_exclusion;
  const starts = [];
  const ends = [];
  for (const [index, line] of lines.entries()) {
    if (line === contract.start_marker) starts.push(index);
    if (line === contract.end_marker) ends.push(index);
  }
  assert(starts.length === ends.length, `${file}: unpaired inline exclusion`);
  assert(starts.length <= 1, `${file}: more than one inline exclusion`);
  const ranges = [];
  for (const [index, start] of starts.entries()) {
    const end = ends[index];
    assert(end > start, `${file}: reversed inline exclusion`);
    assert(
      lines[start + 1]?.trim() === contract.required_attribute,
      `${file}: exclusion attribute`,
    );
    assert(lines[start + 2]?.trim() === contract.required_module, `${file}: exclusion module`);
    assert(
      lines.slice(end + 1).every((line) => line === ''),
      `${file}: unit-test exclusion must be the final source item`,
    );
    ranges.push({
      end_line: end,
      reason: contract.reason,
      start_line: start + 2,
    });
  }
  for (const [index, line] of lines.entries()) {
    if (line.trim() !== contract.required_attribute) continue;
    assert(
      ranges.some(({ end_line: end, start_line: start }) => index + 1 >= start && index + 1 <= end),
      `${file}:${index + 1}: cfg(test) outside explicit exclusion`,
    );
  }
  return ranges;
};

const isExcludedLine = (ranges, line) =>
  ranges.some(({ end_line: end, start_line: start }) => line >= start && line <= end);

const validateSources = () => {
  const include = new RegExp(policy.source.include_regex);
  const files = walk(path.join(repository, 'crates'))
    .map(relativeSource)
    .filter((file) => file && include.test(file))
    .sort();
  assert(files.length >= 8, 'coverage source inventory is unexpectedly small');
  const records = files.map((file) => {
    const bytes = readBytes(file);
    const source = bytes.toString('utf8');
    assert(source.endsWith('\n'), `${file}: missing terminal newline`);
    return {
      exclusion_ranges: inlineExclusions(file, source),
      path: file,
      sha256: sha256(bytes),
    };
  });
  for (const group of policy.groups) {
    const expression = new RegExp(group.include_regex);
    const count = records.filter(({ path: file }) => expression.test(file)).length;
    assert(count >= group.minimum_source_files, `${group.id}: source file minimum`);
  }
  return records;
};

assert(
  process.argv.length === 3 && ['policy', 'run'].includes(mode),
  'usage: node tests/toolchain/check-rust-coverage.mjs <policy|run>',
);
const sourceRecords = validatePolicy();
if (mode === 'policy') {
  process.stdout.write(
    'PASS Rust coverage policy: 3 threshold groups, explicit test-code exclusions, compiler-matched LLVM tools, and active immutable HDoc golden scope\n',
  );
  process.exit(0);
}

assert(
  process.platform === policy.execution.platform && process.arch === policy.execution.architecture,
  'coverage run requires the reviewed linux-x64 host',
);
for (const name of [
  'RUSTFLAGS',
  'CARGO_ENCODED_RUSTFLAGS',
  'LLVM_PROFILE_FILE',
  'CARGO_TARGET_DIR',
]) {
  assert(!process.env[name], `${name} must be unset for coverage verification`);
}

const rustVerbose = run('rustc', ['--version', '--verbose']);
const rustRelease = rustVerbose.match(/^release: (.+)$/m)?.[1];
const rustLlvm = rustVerbose.match(/^LLVM version: (.+)$/m)?.[1];
assert(rustRelease === policy.toolchain.rust_release, 'coverage rustc release');
assert(rustLlvm === policy.toolchain.llvm_release, 'coverage rustc LLVM release');
const sysroot = run('rustc', ['--print', 'sysroot']).trim();
const host = rustVerbose.match(/^host: (.+)$/m)?.[1];
assert(host, 'rustc host triple absent');
const executableSuffix = process.platform === 'win32' ? '.exe' : '';
const llvmDirectory = path.join(sysroot, 'lib', 'rustlib', host, 'bin');
const llvmProfdata = path.join(llvmDirectory, `llvm-profdata${executableSuffix}`);
const llvmCov = path.join(llvmDirectory, `llvm-cov${executableSuffix}`);
assert(existsSync(llvmProfdata), 'pinned llvm-profdata is absent; install rustup llvm-tools');
assert(existsSync(llvmCov), 'pinned llvm-cov is absent; install rustup llvm-tools');
const llvmProfdataVersion = run(llvmProfdata, ['--version']);
const llvmCovVersion = run(llvmCov, ['--version']);
for (const [name, version] of [
  ['llvm-profdata', llvmProfdataVersion],
  ['llvm-cov', llvmCovVersion],
]) {
  assert(version.includes(`LLVM version ${policy.toolchain.llvm_release}`), `${name} LLVM version`);
  assert(version.includes(`rust-${policy.toolchain.rust_release}-stable`), `${name} Rust build`);
}

const metadata = JSON.parse(
  run('cargo', ['metadata', '--frozen', '--format-version', '1', '--no-deps'], {
    env: { ...process.env, CARGO_NET_OFFLINE: 'true' },
  }),
);
const helixMetadata = metadata.metadata.helix;
const emptyMaturity =
  helixMetadata.status === policy.empty_product_scope.allowed_status &&
  helixMetadata['database-functionality'] ===
    policy.empty_product_scope.requires_database_functionality;
const activeMaturity =
  helixMetadata.status === policy.active_product_scope.allowed_status &&
  helixMetadata['database-functionality'] ===
    policy.active_product_scope.requires_database_functionality;
assert(emptyMaturity || activeMaturity, 'workspace maturity metadata');

const coverageTarget = path.join(repository, 'target', 'coverage');
const rawDirectory = path.join(repository, 'target', 'coverage-profiles');
const reportPath = path.join(repository, policy.report.output);
rmSync(coverageTarget, { recursive: true, force: true });
rmSync(rawDirectory, { recursive: true, force: true });
rmSync(path.dirname(reportPath), { recursive: true, force: true });
mkdirSync(rawDirectory, { recursive: true });
mkdirSync(path.dirname(reportPath), { recursive: true });

const environment = {
  ...process.env,
  CARGO_NET_OFFLINE: 'true',
  LLVM_PROFILE_FILE: path.join(rawDirectory, '%p-%m.profraw'),
  RUSTFLAGS: policy.execution.rustflags,
};
delete environment.FORCE_COLOR;
delete environment.NO_COLOR;
const build = runResult('cargo', policy.execution.cargo_arguments, { env: environment });
if (build.error) throw build.error;
assert(
  build.status === 0,
  `coverage build exited ${build.status}:\n${build.stdout}\n${build.stderr}`,
);
const binariesByPath = new Map();
for (const line of build.stdout.split('\n')) {
  if (!line.startsWith('{')) continue;
  const message = JSON.parse(line);
  if (
    message.reason !== 'compiler-artifact' ||
    message.profile?.test !== true ||
    typeof message.executable !== 'string'
  ) {
    continue;
  }
  binariesByPath.set(message.executable, {
    binary: path.basename(message.executable),
    target: message.target.name,
  });
}
const binaries = [...binariesByPath]
  .map(([absolute, record]) => ({ absolute, ...record }))
  .sort((left, right) => left.target.localeCompare(right.target));
assert(
  binaries.length >= policy.execution.minimum_test_binaries &&
    binaries.length <= policy.execution.maximum_test_binaries,
  `coverage test binary count: ${binaries.length}`,
);
let testsExecuted = 0;
for (const binary of binaries) {
  const result = runResult(binary.absolute, ['--test-threads=1'], { env: environment });
  if (result.error) throw result.error;
  assert(
    result.status === 0,
    binary.target +
      ': coverage tests exited ' +
      result.status +
      '\n' +
      result.stdout +
      result.stderr,
  );
  const count = Number(result.stdout.match(/running (\d+) tests?/)?.[1] ?? 0);
  testsExecuted += count;
}
assert(
  testsExecuted >= policy.execution.minimum_tests &&
    testsExecuted <= policy.execution.maximum_tests,
  `coverage test count: ${testsExecuted}`,
);
const rawProfiles = readdirSync(rawDirectory)
  .filter((file) => file.endsWith('.profraw'))
  .sort();
assert(
  rawProfiles.length >= policy.execution.minimum_raw_profiles &&
    rawProfiles.length <= policy.execution.maximum_raw_profiles,
  `coverage raw profile count: ${rawProfiles.length}`,
);
assert(
  rawProfiles.every((file) => statSync(path.join(rawDirectory, file)).size > 0),
  'empty raw coverage profile',
);

const profdataPath = path.join(rawDirectory, 'rust-coverage.profdata');
run(llvmProfdata, [
  'merge',
  '-sparse',
  ...rawProfiles.map((file) => path.join(rawDirectory, file)),
  '-o',
  profdataPath,
]);
assert(statSync(profdataPath).size > 0, 'merged coverage profile is empty');
const objectArguments = binaries.flatMap(({ absolute }) => ['--object', absolute]);
const llvmExport = JSON.parse(
  run(llvmCov, [
    'export',
    '--format=text',
    `--instr-profile=${profdataPath}`,
    ...objectArguments,
    '--ignore-filename-regex=/(?:\\.cargo/registry|\\.rustup)/',
  ]),
);
assert(llvmExport.type === 'llvm.coverage.json.export', 'LLVM export type');
assert(llvmExport.version === '3.1.0', 'LLVM export schema version');
assert(llvmExport.data.length === 1, 'LLVM export data inventory');
const llvmData = llvmExport.data[0];

const sourceByPath = new Map(sourceRecords.map((record) => [record.path, record]));
const rawFileByPath = new Map();
for (const file of llvmData.files) {
  const source = relativeSource(file.filename);
  if (!source) continue;
  const included = new RegExp(policy.source.include_regex).test(source);
  const excluded = policy.source.excluded_path_rules.some(({ regex }) =>
    new RegExp(regex).test(source),
  );
  assert(included || excluded, `${source}: unclassified workspace coverage source`);
  if (included) {
    assert(sourceByPath.has(source), `${source}: LLVM source absent from inventory`);
    assert(!rawFileByPath.has(source), `${source}: duplicate LLVM file summary`);
    rawFileByPath.set(source, file);
  }
}

const functionRecordsByFile = new Map(sourceRecords.map(({ path: file }) => [file, new Map()]));
for (const fn of llvmData.functions) {
  const codeRegionsByFile = new Map();
  for (const region of fn.regions) {
    if (region[7] !== 0) continue;
    const source = relativeSource(fn.filenames[region[5]]);
    if (!source || !sourceByPath.has(source)) continue;
    const regions = codeRegionsByFile.get(source) ?? [];
    regions.push(region);
    codeRegionsByFile.set(source, regions);
  }
  for (const [source, regions] of codeRegionsByFile) {
    const exclusions = sourceByPath.get(source).exclusion_ranges;
    const productRegions = [];
    for (const region of regions) {
      const startExcluded = isExcludedLine(exclusions, region[0]);
      const endExcluded = isExcludedLine(exclusions, region[2]);
      assert(
        startExcluded === endExcluded,
        `${source}: coverage region crosses exclusion boundary`,
      );
      if (!startExcluded) productRegions.push(region);
    }
    if (productRegions.length === 0) continue;
    const key = productRegions
      .map((region) => region.slice(0, 4).join(','))
      .sort()
      .join(';');
    const records = functionRecordsByFile.get(source);
    const existing = records.get(key);
    records.set(key, {
      covered: (existing?.covered ?? false) || productRegions.some((region) => region[4] > 0),
      regions: [...(existing?.regions ?? []), ...productRegions],
    });
  }
}

const fileRecords = sourceRecords.map((sourceRecord) => {
  const rawFile = rawFileByPath.get(sourceRecord.path);
  const lines = new Map();
  if (rawFile) {
    for (const segment of rawFile.segments) {
      if (segment[3] !== true || segment[5] === true) continue;
      if (isExcludedLine(sourceRecord.exclusion_ranges, segment[0])) continue;
      lines.set(segment[0], (lines.get(segment[0]) ?? false) || segment[2] > 0);
    }
  }
  const functions = [...functionRecordsByFile.get(sourceRecord.path).values()];
  const regions = new Map();
  const branches = new Map();
  for (const fn of functions) {
    for (const region of fn.regions) {
      const key = region.slice(0, 4).join(':');
      const existing = regions.get(key) ?? false;
      regions.set(key, existing || region[4] > 0);
    }
  }
  for (const fn of llvmData.functions) {
    for (const branch of fn.branches ?? []) {
      const source = relativeSource(fn.filenames[branch[6]]);
      if (
        source !== sourceRecord.path ||
        isExcludedLine(sourceRecord.exclusion_ranges, branch[0])
      ) {
        continue;
      }
      const key = branch.slice(0, 4).join(':');
      const existing = branches.get(key) ?? [false, false];
      branches.set(key, [existing[0] || branch[4] > 0, existing[1] || branch[5] > 0]);
    }
  }
  const branchOutcomes = branches.size * 2;
  const coveredBranchOutcomes = [...branches.values()].reduce(
    (sum, outcomes) => sum + Number(outcomes[0]) + Number(outcomes[1]),
    0,
  );
  const metrics = {
    branches: finishMetric(coveredBranchOutcomes, branchOutcomes),
    functions: finishMetric(functions.filter(({ covered }) => covered).length, functions.length),
    lines: finishMetric([...lines.values()].filter(Boolean).length, lines.size),
    regions: finishMetric([...regions.values()].filter(Boolean).length, regions.size),
  };
  return {
    exclusion_ranges: sourceRecord.exclusion_ranges,
    metrics,
    path: sourceRecord.path,
    sha256: sourceRecord.sha256,
  };
});

const productMetricCount = fileRecords.reduce(
  (sum, record) => sum + metricNames.reduce((inner, name) => inner + record.metrics[name].count, 0),
  0,
);
const emptyProductScope = productMetricCount === 0;
assert(
  !emptyProductScope || emptyMaturity,
  'empty product coverage scope is not permitted by workspace maturity',
);

const groups = policy.groups.map((group) => {
  const expression = new RegExp(group.include_regex);
  const records = fileRecords.filter(({ path: file }) => expression.test(file));
  assert(records.length >= group.minimum_source_files, `${group.id}: report source minimum`);
  const metrics = addMetrics(records);
  const failures = [];
  for (const name of metricNames) {
    if (!metricPasses(metrics[name], group.thresholds_basis_points[name])) failures.push(name);
  }
  if (group.enforce_per_file) {
    for (const record of records) {
      for (const name of metricNames) {
        if (!metricPasses(record.metrics[name], group.thresholds_basis_points[name])) {
          failures.push(`${record.path}:${name}`);
        }
      }
    }
  }
  return {
    description: group.description,
    empty_product_scope: metricNames.every((name) => metrics[name].count === 0),
    enforce_per_file: group.enforce_per_file,
    failures,
    id: group.id,
    metrics,
    source_files: records.map(({ path: file }) => file),
    thresholds_basis_points: group.thresholds_basis_points,
    verdict: failures.length === 0 ? 'pass' : 'fail',
  };
});
const coverageFailures = groups
  .filter(({ failures }) => failures.length > 0)
  .map(({ failures, id }) => `${id} (${failures.join(', ')})`);
if (coverageFailures.length > 0) {
  const failedFiles = fileRecords
    .filter(({ metrics }) => metricNames.some((name) => metrics[name].missed > 0))
    .map(({ metrics, path: file }) => ({ metrics, path: file }));
  process.stderr.write(
    `COVERAGE_DIAGNOSTIC ${JSON.stringify({ failed_files: failedFiles, groups })}\n`,
  );
}
assert(coverageFailures.length === 0, `coverage thresholds failed: ${coverageFailures.join('; ')}`);

const toolRecords = [
  ['llvm-cov', llvmCov, llvmCovVersion],
  ['llvm-profdata', llvmProfdata, llvmProfdataVersion],
].map(([name, file, version]) => {
  const bytes = readFileSync(file);
  return {
    bytes: bytes.length,
    name,
    sha256: sha256(bytes),
    version: version
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' | '),
  };
});
const report = {
  schema: policy.report.schema,
  plan_item: 'P02-013',
  inputs: {
    cargo_lock_sha256: sha256(readBytes('Cargo.lock')),
    cargo_manifest_sha256: sha256(readBytes('Cargo.toml')),
    coverage_policy_sha256: sha256(policyBytes),
    coverage_runner_sha256: sha256(readBytes('tests/toolchain/check-rust-coverage.mjs')),
    rust_toolchain_sha256: sha256(readBytes('rust-toolchain.toml')),
  },
  toolchain: {
    host,
    llvm_export_version: llvmExport.version,
    llvm_release: rustLlvm,
    rust_release: rustRelease,
    rustup_component: policy.toolchain.rustup_component,
    tools: toolRecords,
  },
  execution: {
    architecture: process.arch,
    cargo_arguments: policy.execution.cargo_arguments,
    ci_lane: policy.execution.ci_lane,
    platform: process.platform,
    raw_profiles: rawProfiles.length,
    test_binaries: binaries.map(({ binary, target }) => ({ binary, target })),
    tests_executed: testsExecuted,
    workspace_database_functionality: helixMetadata['database-functionality'],
    workspace_status: helixMetadata.status,
  },
  exclusions: {
    empty_product_scope: emptyProductScope
      ? {
          reason: policy.empty_product_scope.reason,
          revalidate_by: policy.empty_product_scope.revalidate_by,
          workspace_status: helixMetadata.status,
        }
      : null,
    inline_ranges: fileRecords.flatMap(({ exclusion_ranges: ranges, path: file }) =>
      ranges.map((range) => ({ path: file, ...range })),
    ),
    path_rules: policy.source.excluded_path_rules,
  },
  llvm_totals_including_tests: llvmData.totals,
  product_files: fileRecords,
  groups,
  verdict: 'pass',
};
const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
assert(reportBytes.length <= policy.report.maximum_bytes, 'coverage report exceeds size limit');
writeFileSync(reportPath, reportBytes);
const summary = emptyProductScope
  ? 'empty product scope accepted only for boundary-skeleton metadata; thresholds armed'
  : groups
      .map((group) => {
        const lines = group.metrics.lines;
        return `${group.id} lines ${lines.covered}/${lines.count}`;
      })
      .join(', ');
process.stdout.write(
  'PASS Rust coverage: ' +
    fileRecords.length +
    ' product source files, ' +
    testsExecuted +
    ' tests, ' +
    groups.length +
    ' threshold groups; ' +
    summary +
    '\n',
);
process.stdout.write(
  `REPORT ${normalize(path.relative(repository, reportPath))} ${sha256(reportBytes)}\n`,
);

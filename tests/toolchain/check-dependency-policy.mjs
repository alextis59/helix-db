#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (file) => JSON.parse(readFileSync(path.join(repository, file), 'utf8'));
const policy = readJson('tests/toolchain/dependency-policy.json');
const packageJson = readJson('package.json');
const lock = readJson('package-lock.json');
const run = (program, args) =>
  execFileSync(program, args, {
    cwd: repository,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
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
const sorted = (values) => [...values].sort();

assert(policy.schema === 'helix.dependency-policy/1', 'dependency policy schema mismatch');
assert(packageJson.private === true, 'root npm workspace must remain private');
assert(packageJson.license === 'MIT', 'root npm license mismatch');
assert(packageJson.type === 'module', 'root npm module type mismatch');
same(packageJson.dependencies ?? {}, {}, 'root production dependencies');
same(packageJson.optionalDependencies ?? {}, {}, 'root optional dependencies');
same(packageJson.allowScripts, { fsevents: false }, 'npm lifecycle-script denial');
same(
  packageJson.devDependencies,
  policy.npm.direct_dev_dependencies,
  'exact direct development dependencies',
);
assert(
  Object.values(packageJson.devDependencies).every((version) => /^\d+\.\d+\.\d+$/.test(version)),
  'non-exact direct npm version',
);

assert(lock.lockfileVersion === 3, 'npm lockfile version mismatch');
assert(lock.packages[''].name === packageJson.name, 'lock root package name mismatch');
assert(lock.packages[''].license === packageJson.license, 'lock root license mismatch');
same(
  lock.packages[''].devDependencies,
  policy.npm.direct_dev_dependencies,
  'locked direct development dependencies',
);

const entries = Object.entries(lock.packages).filter(([packagePath]) => packagePath !== '');
const allowedLicenses = new Set(policy.npm.allowed_licenses);
const licenseCounts = {};
const exceptionCounts = new Map(
  policy.npm.build_only_license_exceptions.map((entry) => [entry.package_prefix, 0]),
);
const namesToVersions = new Map();
const lifecycleScripts = [];
for (const [packagePath, entry] of entries) {
  assert(packagePath.startsWith('node_modules/'), `${packagePath}: non-node_modules lock path`);
  assert(entry.dev === true, `${packagePath}: production/runtime dependency introduced`);
  assert(entry.link !== true, `${packagePath}: linked dependency prohibited`);
  assert(
    typeof entry.version === 'string' && entry.version.length > 0,
    `${packagePath}: version absent`,
  );
  assert(
    typeof entry.resolved === 'string' && entry.resolved.startsWith(policy.npm.registry_prefix),
    `${packagePath}: unapproved registry/source`,
  );
  assert(
    typeof entry.integrity === 'string' && /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(entry.integrity),
    `${packagePath}: missing/non-SHA512 integrity`,
  );
  assert(
    typeof entry.license === 'string' && entry.license.length > 0,
    `${packagePath}: license metadata absent`,
  );
  licenseCounts[entry.license] = (licenseCounts[entry.license] ?? 0) + 1;

  const name = packagePath.slice(packagePath.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const versions = namesToVersions.get(name) ?? new Set();
  versions.add(entry.version);
  namesToVersions.set(name, versions);

  if (!allowedLicenses.has(entry.license)) {
    const exception = policy.npm.build_only_license_exceptions.find(
      (candidate) =>
        (name === candidate.package_prefix || name.startsWith(`${candidate.package_prefix}-`)) &&
        entry.version === candidate.version &&
        entry.license === candidate.license,
    );
    assert(exception, `${packagePath}: license ${entry.license} is neither allowed nor reviewed`);
    assert(
      entry.dev === true,
      `${packagePath}: build-only license exception escaped to runtime dependencies`,
    );
    exceptionCounts.set(
      exception.package_prefix,
      exceptionCounts.get(exception.package_prefix) + 1,
    );
  }

  if (entry.hasInstallScript) {
    lifecycleScripts.push({
      path: packagePath,
      version: entry.version,
      optional: entry.optional === true,
    });
  }
}

for (const exception of policy.npm.build_only_license_exceptions) {
  assert(
    exception.scope.includes('not a runtime or shipped package dependency'),
    `${exception.package_prefix}: exception scope is not bounded`,
  );
  assert(
    exception.revalidate_by === 'P16-010',
    `${exception.package_prefix}: exception revalidation deadline drift`,
  );
  assert(
    exceptionCounts.get(exception.package_prefix) === exception.expected_packages,
    `${exception.package_prefix}: exception package count drift`,
  );
}
same(
  lifecycleScripts,
  policy.npm.reviewed_denied_lifecycle_scripts.map(({ path: packagePath, version, optional }) => ({
    path: packagePath,
    version,
    optional,
  })),
  'npm lifecycle-script allowlist',
);

const duplicates = [...namesToVersions]
  .filter(([, versions]) => versions.size > 1)
  .map(([name, versions]) => ({ name, versions: sorted(versions) }))
  .sort((left, right) => left.name.localeCompare(right.name));
same(
  duplicates,
  policy.npm.allowed_duplicate_versions.map(({ name, versions }) => ({
    name,
    versions: sorted(versions),
  })),
  'npm duplicate-version allowlist',
);
for (const duplicate of policy.npm.allowed_duplicate_versions) {
  assert(duplicate.reason.length >= 20, `${duplicate.name}: duplicate exception reason too short`);
  assert(
    duplicate.revalidate_by === 'P16-010',
    `${duplicate.name}: duplicate revalidation deadline drift`,
  );
}

const metadata = JSON.parse(run('cargo', ['metadata', '--frozen', '--format-version', '1']));
const workspaceMembers = new Set(metadata.workspace_members);
const external = metadata.packages.filter(({ id }) => !workspaceMembers.has(id));
assert(
  policy.rust.allow_external_packages === false && external.length === 0,
  `external Rust package count: ${external.length}`,
);
for (const pkg of metadata.packages) {
  assert(pkg.license === policy.rust.workspace_license, `${pkg.name}: Rust license mismatch`);
  assert(pkg.source === null, `${pkg.name}: non-path Rust source present`);
  same(pkg.publish, [], `${pkg.name}: Rust publication policy`);
  assert(
    path.resolve(pkg.manifest_path).startsWith(`${repository}${path.sep}`),
    `${pkg.name}: manifest escapes repository`,
  );
}

const buildScripts = run('git', [
  'ls-files',
  '--cached',
  '--others',
  '--exclude-standard',
  '--',
  '*build.rs',
])
  .trim()
  .split('\n')
  .filter(Boolean);
same(buildScripts, policy.rust.allowed_build_scripts, 'Rust build-script allowlist');
const rustFiles = run('git', [
  'ls-files',
  '--cached',
  '--others',
  '--exclude-standard',
  '--',
  '*.rs',
])
  .trim()
  .split('\n')
  .filter(Boolean);
const unsafeOccurrences = [];
for (const file of rustFiles) {
  const source = readFileSync(path.join(repository, file), 'utf8');
  for (const match of source.matchAll(/\bunsafe\b/g))
    unsafeOccurrences.push({ file, offset: match.index });
}
same(unsafeOccurrences, policy.rust.unsafe_exceptions, 'candidate Rust unsafe-token allowlist');

assert(
  readFileSync(path.join(repository, 'LICENSE'), 'utf8').includes('MIT License'),
  'repository MIT license text absent',
);
const notices = readFileSync(path.join(repository, 'THIRD_PARTY_NOTICES.md'), 'utf8');
for (const marker of [
  '91 locked npm development packages',
  '| MPL-2.0 | 12 |',
  'No external Rust crate is locked',
  'No npm dependency is a production/runtime dependency',
  '73 root license/notice files across 65 packages',
  'Twenty-six development-only tarballs omit root license text',
])
  assert(notices.includes(marker), `third-party notice marker absent: ${marker}`);

console.log(
  `PASS Rust policy: ${metadata.packages.length} MIT workspace packages, 0 external crates, ${rustFiles.length} candidate sources, 0 unsafe tokens/build scripts`,
);
console.log(
  `PASS npm policy: ${entries.length} dev packages, ${Object.keys(licenseCounts).length} license forms, ${lifecycleScripts.length} reviewed scripts, ${duplicates.length} reviewed duplicate`,
);
console.log(
  `LICENSES ${JSON.stringify(Object.fromEntries(Object.entries(licenseCounts).sort(([left], [right]) => left.localeCompare(right))))}`,
);

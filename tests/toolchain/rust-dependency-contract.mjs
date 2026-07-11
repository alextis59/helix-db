import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

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
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const lockField = (block, field) => {
  const match = block.match(new RegExp(`^${field} = "([^"]+)"$`, 'm'));
  return match?.[1] ?? null;
};

export const parseCargoLock = (bytes) =>
  bytes
    .toString('utf8')
    .split(/\n(?=\[\[package\]\]\n)/)
    .filter((block) => block.startsWith('[[package]]\n'))
    .map((block) => ({
      checksum: lockField(block, 'checksum'),
      name: lockField(block, 'name'),
      source: lockField(block, 'source'),
      version: lockField(block, 'version'),
    }));

const hasBuildScript = (pkg) =>
  pkg.targets.some(({ kind }) => kind.length === 1 && kind[0] === 'custom-build');

const licensePaths = (packageRoot) => {
  const paths = readdirSync(packageRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && /^(?:license|licence|copying|notice)(?:$|[-_.])/i.test(entry.name),
    )
    .map(({ name }) => name);
  const licensesRoot = path.join(packageRoot, 'LICENSES');
  try {
    paths.push(
      ...readdirSync(licensesRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map(({ name }) => `LICENSES/${name}`),
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return paths.sort();
};

const validateLicenseInventory = ({ cargoLockBytes, external, licenseAuthority }) => {
  same(
    sorted(Object.keys(licenseAuthority)),
    ['cargo_lock_sha256', 'packages', 'plan_item', 'schema'],
    'Rust license authority fields',
  );
  assert(
    licenseAuthority.schema === 'helix.rust-license-inventory/1',
    'Rust license authority schema mismatch',
  );
  assert(licenseAuthority.plan_item === 'P03-008', 'Rust license authority task mismatch');
  assert(
    licenseAuthority.cargo_lock_sha256 === sha256(cargoLockBytes),
    'Rust license authority Cargo.lock digest mismatch',
  );
  same(
    licenseAuthority.packages.map(({ name, version }) => ({ name, version })),
    external.map(({ name, version }) => ({ name, version })),
    'Rust license authority package identities',
  );

  let licenseFileCount = 0;
  for (const [index, authority] of licenseAuthority.packages.entries()) {
    const pkg = external[index];
    assert(authority.license_files.length > 0, `${pkg.name}: license text absent`);
    const packageRoot = path.dirname(pkg.manifest_path);
    same(
      authority.license_files.map(({ path: licensePath }) => licensePath),
      licensePaths(packageRoot),
      `${pkg.name}: license path inventory`,
    );
    for (const license of authority.license_files) {
      assert(
        !path.isAbsolute(license.path) && !license.path.split('/').includes('..'),
        `${pkg.name}: unsafe license path`,
      );
      const bytes = readFileSync(path.join(packageRoot, license.path));
      assert(bytes.length === license.bytes, `${pkg.name}/${license.path}: license size drift`);
      assert(sha256(bytes) === license.sha256, `${pkg.name}/${license.path}: license digest drift`);
      licenseFileCount += 1;
    }
  }
  return licenseFileCount;
};

export const validateRustDependencyGraph = ({
  cargoLockBytes,
  licenseAuthority,
  metadata,
  policy,
}) => {
  const workspaceMembers = new Set(metadata.workspace_members);
  const external = metadata.packages
    .filter(({ id }) => !workspaceMembers.has(id))
    .sort((left, right) => left.name.localeCompare(right.name));
  const lockPackages = parseCargoLock(cargoLockBytes);
  const lockByIdentity = new Map(lockPackages.map((pkg) => [`${pkg.name}@${pkg.version}`, pkg]));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const allowedLicenses = new Set(policy.allowed_licenses);
  const actual = external.map((pkg) => {
    const locked = lockByIdentity.get(`${pkg.name}@${pkg.version}`);
    assert(locked, `${pkg.name}@${pkg.version}: Cargo.lock entry absent`);
    assert(pkg.source === policy.registry_source, `${pkg.name}: unapproved Rust source`);
    assert(locked.source === policy.registry_source, `${pkg.name}: lock source drift`);
    assert(/^[0-9a-f]{64}$/.test(locked.checksum), `${pkg.name}: lock checksum absent`);
    assert(allowedLicenses.has(pkg.license), `${pkg.name}: unapproved Rust license`);
    return {
      build_script: hasBuildScript(pkg),
      checksum: locked.checksum,
      features: sorted(nodes.get(pkg.id)?.features ?? []),
      license: pkg.license,
      name: pkg.name,
      version: pkg.version,
    };
  });

  assert(policy.allow_external_packages === true, 'external Rust packages are disabled');
  assert(policy.allow_git_sources === false, 'Rust git sources must remain disabled');
  same(actual, policy.external_packages, 'exact external Rust package allowlist');

  const helixDoc = metadata.packages.find(({ name }) => name === 'helix-doc');
  assert(helixDoc, 'helix-doc package absent');
  const direct = helixDoc.dependencies
    .filter(({ source }) => source !== null)
    .map((dependency) => ({
      default_features: dependency.uses_default_features,
      features: sorted(dependency.features),
      name: dependency.name,
      version_requirement: dependency.req,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  same(
    direct,
    policy.direct_dependencies.map(
      ({
        default_features: defaultFeatures,
        features,
        name,
        version_requirement: requirement,
      }) => ({
        default_features: defaultFeatures,
        features: sorted(features),
        name,
        version_requirement: requirement,
      }),
    ),
    'direct Rust dependency configuration',
  );
  for (const dependency of policy.direct_dependencies) {
    assert(dependency.purpose.length >= 60, `${dependency.name}: dependency purpose too short`);
  }

  const licenseFileCount = validateLicenseInventory({
    cargoLockBytes,
    external,
    licenseAuthority,
  });
  return {
    externalPackages: actual,
    licenseFileCount,
    workspacePackages: metadata.packages
      .filter(({ id }) => workspaceMembers.has(id))
      .map(({ license, name, version }) => ({ license, name, version }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
};

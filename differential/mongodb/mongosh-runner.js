const fs = require('node:fs');

const casesPath = process.env.HELIX_MONGODB_CASES;
if (!casesPath) throw new Error('HELIX_MONGODB_CASES is required');
const source = fs.readFileSync(casesPath, 'utf8');
if (Buffer.byteLength(source, 'utf8') > 1_048_576) throw new Error('case file exceeds 1 MiB');
const specification = EJSON.parse(source, { relaxed: false });
if (specification.cases_schema !== 'helix.mongodb-differential-cases/1') {
  throw new Error('unsupported differential case schema');
}
if (specification.cases.length > 100 || specification.datasets.length > 10) {
  throw new Error('differential inventory exceeds harness bounds');
}

const databaseName = db.getName();
if (!databaseName.startsWith('helix_p01_021_')) {
  throw new Error(`refusing non-isolated database ${databaseName}`);
}

const observations = [];
let upstream;
try {
  db.dropDatabase();
  for (const dataset of specification.datasets) {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(dataset.collection)) {
      throw new Error(`invalid collection ${dataset.collection}`);
    }
    if (dataset.documents.length > 1000) throw new Error('dataset exceeds 1000 documents');
    const collection = db.getCollection(dataset.collection);
    if (dataset.documents.length > 0) collection.insertMany(dataset.documents, { ordered: true });
  }

  const build = db.runCommand({ buildInfo: 1 });
  const hello = db.runCommand({ hello: 1 });
  const compatibility = db.adminCommand({ getParameter: 1, featureCompatibilityVersion: 1 });
  upstream = {
    product: 'MongoDB Community Server',
    version: build.version,
    git_version: build.gitVersion,
    feature_compatibility_version: compatibility.featureCompatibilityVersion.version,
    max_wire_version: hello.maxWireVersion,
    modules: [...build.modules].sort(),
  };

  const datasets = new Map(specification.datasets.map((dataset) => [dataset.id, dataset]));
  for (const differentialCase of specification.cases) {
    const dataset = datasets.get(differentialCase.dataset);
    if (!dataset) throw new Error(`unknown dataset ${differentialCase.dataset}`);
    const collection = db.getCollection(dataset.collection);
    let cursor = collection.find(differentialCase.mongo.filter, differentialCase.mongo.projection);
    cursor = cursor.maxTimeMS(5000);
    cursor = cursor.sort(differentialCase.mongo.sort);
    const rows = cursor.toArray();
    observations.push({ id: differentialCase.id, rows });
  }
} finally {
  db.dropDatabase();
}

const payload = {
  observations_schema: 'helix.mongodb-upstream-observations/1',
  profile: specification.profile,
  upstream,
  cases: observations,
};
const encoded = Buffer.from(EJSON.stringify(payload, { relaxed: false }), 'utf8').toString(
  'base64',
);
print(`HELIX_MONGODB_RESULT:${encoded}`);

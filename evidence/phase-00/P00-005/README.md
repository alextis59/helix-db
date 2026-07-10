# P00-005 Naming Due-Diligence Evidence

- Status: Incomplete — product-owner decision required
- Recorded at: 2026-07-10T05:58:46Z
- Source commit before evidence: `0b0bd37`
- Task: `P00-005`
- ADR: [ADR 0001](../../../docs/adr/0001-public-product-identity.md)

## Scope

This evidence establishes that the working name HelixDB and intuitive public package coordinates conflict with existing database projects/packages. It does not select or clear a replacement name.

## Commands and observed results

### npm exact package

```bash
npm view helix-db name version description repository.url --json
```

Observed on 2026-07-10:

```json
{
  "name": "helix-db",
  "version": "0.1.3",
  "description": "Helix DB is a simple NoSQL database written in TypeScript for Node.js. It uses a JSON file as its data store, making it easy to set up and use.",
  "repository.url": "git+https://github.com/rohitdhas/helix-db.git"
}
```

### crates.io exact search

```bash
cargo search helix-db --limit 20
```

Observed:

```text
helix-db = "2.0.6"    # Library for working with HelixDB
```

### GitHub repository search

```bash
curl -sS 'https://api.github.com/search/repositories?q=helixdb+in:name&sort=stars&order=desc&per_page=10'
```

The leading result was [HelixDB/helix-db](https://github.com/HelixDB/helix-db), described by its repository as an OLTP graph-vector database built in Rust on object storage. The results also included another Rust time-series/key-value database named HelixDB and several SDK/ecosystem repositories.

### npm registry search

```bash
curl -sS 'https://registry.npmjs.org/-/v1/search?text=helixdb&size=20'
```

Relevant results included:

- [`@helix-db/helix-db`](https://www.npmjs.com/package/@helix-db/helix-db), a TypeScript library for the established HelixDB project.
- [`@helix-db/migrate`](https://www.npmjs.com/package/@helix-db/migrate).
- [`helix-db`](https://www.npmjs.com/package/helix-db), the separate JSON-file NoSQL package above.

## Conclusion

The exact product name and natural registry coordinates are not clear for public use. ADR 0001 recommends selecting a distinct name before implementation bootstrap freezes identifiers.

## Remaining evidence

- Product-owner direction.
- Candidate shortlist.
- Candidate GitHub/crates.io/npm/container/web checks.
- Reasonable trademark/domain review.
- Final canonical identifier matrix.

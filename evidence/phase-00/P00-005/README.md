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

## Replacement candidate screen

Recorded on 2026-07-10. HTTP `404` means the exact registry/API object was not found at the time of the request; it does not reserve the name.

For each candidate slug, the following official endpoints were queried:

- npm exact package and `@slug/core` package metadata.
- crates.io exact crate API with an identifying user agent.
- GitHub repository search filtered to an exact repository name.
- Docker Hub search filtered to an exact repository suffix.
- GitHub exact user/organization identity for the compact product spelling.
- Verisign `.com` and Google Registry `.dev` RDAP.
- Exact quoted DuckDuckGo HTML search for general web results.

Exact-slug registry results:

```text
nexilis-db npm=404 scope_core=404 crates=404 github_exact=0 docker_exact=0
nodalys-db npm=404 scope_core=404 crates=404 github_exact=0 docker_exact=0
virelia-db npm=404 scope_core=404 crates=404 github_exact=0 docker_exact=0
```

Compact product identity/domain results:

```text
nexilisdb github_user=404 docker_user=404 com_rdap=404 dev_rdap=404
nodalysdb github_user=404 docker_user=404 com_rdap=404 dev_rdap=404
vireliadb github_user=404 docker_user=404 com_rdap=404 dev_rdap=404
```

Exact quoted web searches returned no result for `NexilisDB`, `NodalysDB`, or `VireliaDB`, including the recorded trademark/software/database query variants.

### Recommendation

**NexilisDB** is the recommended technical candidate, using the canonical slug `nexilis-db`. It is meaningful for a connected local/distributed database, pronounceable, and passed the exact screen above.

The shorter base name `Nexilis` is already used in some package/domain/GitHub contexts. The recommendation therefore depends on consistently using **NexilisDB**, `nexilis-db`, and a controlled scope rather than claiming the bare `nexilis` ecosystem identity.

### Limitations

- Registry/domain absence is time-sensitive and does not reserve an identifier.
- Search results are not a trademark opinion.
- The `.com`/`.dev` RDAP checks do not cover every jurisdiction or domain.
- npm scope creation, GitHub organization creation, and container publication require account-level actions not authorized by the current task.
- Checks must be repeated immediately before claiming public identities.

## Remaining evidence

- Product-owner direction.
- Final selection from the screened shortlist or another directed name.
- Repeat checks and appropriate legal/trademark review for the selected name before release.
- Final canonical identifier matrix.

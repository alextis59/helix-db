# ADR 0001: Retain HelixDB as a temporary development identity

- Status: Accepted
- Date: 2026-07-10
- Decision owner: Project maintainer
- Required before: `P00-005` and `G00`
- Supersedes: None
- Superseded by: None

## Context

The source transcript explicitly introduced **HelixDB** as a codename “only for clarity.” The repository was subsequently created as `helix-db`, and the planning documents use HelixDB as a working name.

Public naming due diligence found established, overlapping database identities:

- The GitHub organization/repository `HelixDB/helix-db` describes HelixDB as an OLTP graph-vector database written in Rust.
- crates.io publishes `helix-db` as a library for working with that HelixDB ecosystem.
- npm publishes both the unscoped `helix-db` package and the scoped `@helix-db/helix-db` package.
- Other repositories also use HelixDB for time-series/key-value storage.

The conflict affects discoverability, package coordinates, documentation, support, compatibility claims, trademarks, and the risk that users install or report issues against the wrong database. The evidence is preserved under [the P00-005 evidence directory](../../evidence/phase-00/P00-005/README.md).

No database code, public package, persistent magic, protocol namespace, or release artifact has been created yet, so this is the least expensive point to choose a distinct identity.

## Decision drivers

- Avoid user and dependency confusion with an established database project.
- Obtain coherent crate, npm, SDK, binary, container, operator, and protocol names.
- Preserve a clear search and support identity.
- Avoid an unnecessary trademark or passing-off risk.
- Make format magic, telemetry namespaces, error prefixes, and package metadata stable before Phase 2/3.
- Minimize repository/document churn by deciding before implementation scaffolding.
- Retain traceability from the source transcript regardless of the final public name.

## Considered options

### Option A — Keep HelixDB as the public product name

Advantages:

- Matches the current repository and planning documents.
- Requires no immediate rename work.

Disadvantages:

- Directly conflicts with an established Rust database and its GitHub organization.
- Both unscoped and intuitive scoped package identifiers are already occupied.
- Search results, documentation, support, telemetry, and user expectations would remain ambiguous.
- A personal namespace would not resolve product-name confusion.
- Future legal/trademark review could force a more expensive rename after formats and APIs ship.

Evidence:

- Official GitHub and registry records linked in the evidence directory.

### Option B — Choose a distinct public product name now

Advantages:

- Removes the known ecosystem collision before public/persistent contracts exist.
- Allows coordinated naming for crates, npm scope, binaries, images, SDKs, protocol, telemetry, and operator resources.
- Reduces installation, support, search, and legal ambiguity.
- The current codename remains preserved in transcript and ADR history.

Disadvantages:

- Requires updating repository name, project documents, planned identifiers, and perhaps the remote.
- Requires a new availability and legal review for candidate names.
- A final candidate is a product-owner choice, not solely a technical decision.

Evidence:

- The rename cost is currently limited to documentation/governance because no implementation artifact exists.

### Option C — Keep HelixDB internally but publish under a personal namespace or descriptive suffix

Advantages:

- May avoid exact package-coordinate conflicts.
- Reduces immediate repository churn.

Disadvantages:

- Does not remove product/search confusion.
- Creates two identities that must be explained indefinitely.
- Binaries, telemetry, support, and natural-language claims still collide.
- A suffix selected only for registry availability may be weak or inconsistent across ecosystems.

## Candidate screening

The first broad candidate list was screened for exact GitHub, npm, crates.io, Docker Hub, `.com`, `.dev`, and web-result collisions. Several names were removed because the base name, GitHub identity, or domain was already actively used.

Three exact `*DB` names survived the initial technical screen:

| Candidate | Fit | Exact registry/web screen | Caveat |
| --- | --- | --- | --- |
| **NexilisDB** | Suggests connected local, edge, and distributed operation; pronounceable and technically neutral | `nexilis-db` was absent from npm, the tested npm scope package, crates.io, exact GitHub repository names, and exact Docker results; `nexilisdb.com`/`.dev` returned no RDAP registration; exact web search returned no result | The shorter base name `Nexilis` is used elsewhere, so public identity must consistently include `DB` and the `nexilis-db` slug |
| **NodalysDB** | Suggests nodes and analysis | Same exact-slug registry result and no exact web result in the recorded screen | Sounds close to “node analysis” and has weaker pronunciation/brand clarity |
| **VireliaDB** | Distinctive and pronounceable | Same exact-slug registry result and no exact web result in the recorded screen | Has little direct connection to the architecture and would need more brand explanation |

The technical recommendation is **NexilisDB**. It best expresses the shared engine spanning connected local and distributed modes while remaining distinct from the existing HelixDB project in the exact searches performed.

This is a preliminary availability screen, not legal trademark clearance or a reservation. The chosen identifiers must be claimed promptly and reviewed again before public release.

## Decision

Retain **HelixDB** and `helix-db` as the development identity for now, as explicitly directed by the project owner on 2026-07-10. Re-evaluate a distinct public identity before v1 publication under new release-blocking task `P16-016`.

This accepts Option C as a temporary development policy, not as a claim that the existing public-name conflict is resolved.

Until `P16-016` is complete:

- Documentation and source use HelixDB.
- The repository remains `helix-db`.
- Rust workspace packages use `helix-*` with `publish = false`.
- TypeScript workspace packages use the private, non-published `@helix-db-internal/*` convention.
- Development binaries are `helix` and `helixd`.
- The development protocol/profile is explicitly unstable `helix.internal.v0`.
- Development environment and telemetry prefixes are `HELIX_*` and `helix.*`.
- No package is published to the occupied `helix-db` npm/crates.io identifiers or `@helix-db` npm scope.
- No public container, Kubernetes API group, trademark claim, or stable v1 protocol identity is frozen.
- HDoc means **Hybrid Document** and remains product-neutral.

The complete accepted identifier matrix and terminology are maintained in [the terminology document](../governance/terminology.md).

NexilisDB remains the leading screened alternative, with the other candidates preserved for the release-time review. Registry/domain checks must be repeated because availability can change.

## Consequences

### Positive

- The conflict is explicit and cannot be missed by later package/bootstrap work.
- A rename can happen before persistent/public compatibility cost exists.
- Registry evidence is reproducible and dated.

### Negative

- Development identifiers may require coordinated migration before v1 publication.
- Contributors must distinguish internal names from publicly clear package/product identities.
- The known name conflict remains and must not be hidden in marketing or package metadata.

### Neutral or deferred

- The repository remains `helix-db` during implementation.
- HDoc is defined as Hybrid Document and does not need to follow a product rename.
- Public name selection moves to `P16-016`, which must precede release publication task `P16-015`.

## Compatibility and migration

There is no shipped data or public protocol to migrate now. If `P16-016` selects a new identity, its implementation will update or explicitly preserve:

- Repository and remote identity if authorized.
- Root and documentation titles/text.
- Planned crate/npm/SDK/binary/container/operator identifiers.
- Format magic/prefix proposals before golden fixtures.
- Telemetry, error, environment, and configuration prefixes.
- ADR, scope, ownership, evidence, and requirement links where names change.

The transcript remains unchanged as provenance. Development names have no public compatibility promise, but any migration tool must still preserve developer data exactly according to its documented contract.

## Security and operations

A distinct identity reduces dependency-confusion and wrong-package installation risk. Once selected, package publication requires verified ownership, protected accounts, provenance, and explicit registry coordinates under later release tasks.

## Validation plan

- [x] Search GitHub for exact/near database repository names.
- [x] Query crates.io for `helix-db`.
- [x] Query npm for `helix-db` and `helixdb` results.
- [x] Receive product-owner direction to retain HelixDB/`helix-db` during development and reconsider an alternative later.
- [x] Screen the NexilisDB, NodalysDB, and VireliaDB exact slugs across the planned registries, domains, and general web results.
- [x] Record the accepted development identifier matrix and publication prohibitions.
- [x] Re-run repository link, checklist, and traceability validation for `P00-005`.
- [ ] Under `P16-016`, repeat candidate checks immediately before claiming public identifiers and obtain appropriate trademark/legal review before release.
- [ ] Under `P16-016`, update every affected public/development identifier in one reviewed migration change if the name changes.

## Implementation impact

- `P00-005` may close with this accepted development identity.
- `G00` may close after its final independent review.
- Phase 2 may create private/non-published workspace identifiers using the terminology document.
- `P16-016` blocks public release publication and is ordered before `P16-015`.

## Follow-up work

- [ ] Complete `P16-016`: select or confirm the final public product name and clear identifier matrix.
- [ ] Rename the repository remote only with explicit authorization if the later decision requires it.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [GitHub: HelixDB/helix-db](https://github.com/HelixDB/helix-db)
- [crates.io: helix-db](https://crates.io/crates/helix-db)
- [npm: helix-db](https://www.npmjs.com/package/helix-db)
- [npm: @helix-db/helix-db](https://www.npmjs.com/package/@helix-db/helix-db)

# ADR 0001: Select a conflict-free public product identity

- Status: Proposed
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

## Proposed decision

Select Option B: choose a distinct public product name before `G00` closes. The recommended replacement is **NexilisDB**.

Final acceptance remains pending explicit product-owner direction. Until it is accepted:

- “HelixDB” is a working codename only.
- No public package, crate, binary, container, protocol, telemetry, operator, or format identifier is frozen.
- Implementation phases that depend on public identity remain blocked by `G00`.
- Candidate names must undergo GitHub, crates.io, npm, container registry, general web, and reasonable trademark/domain due diligence.

The ADR becomes `Accepted` only after the final name and canonical identifiers are recorded.

If NexilisDB is accepted, the proposed identifier matrix is:

| Surface | Proposed identity |
| --- | --- |
| Product | `NexilisDB` |
| Repository slug | `nexilis-db` |
| Rust crate prefix | `nexilis-` with `nexilis-db` reserved for the umbrella/client identity |
| npm scope | `@nexilis-db` with packages such as `core`, `browser`, and `client` |
| CLI / daemon | `nexilis` / `nexilisd` |
| Initial container | `ghcr.io/alextis59/nexilis-db` until an organization is explicitly created |
| Protocol/profile prefix | `nexilis` with explicit version, for example `nexilis.v1` |
| Environment prefix | `NEXILIS_` |
| Telemetry namespace | `nexilis.*` |
| Local configuration/data directory | `.nexilis` where platform conventions permit |
| Kubernetes API group | Deferred until a controlled domain is selected |
| Canonical document format | Keep `HDoc`, defined as **Hybrid Document**, so durable format identity is not coupled to a product trademark |

## Consequences

### Positive

- The conflict is explicit and cannot be missed by later package/bootstrap work.
- A rename can happen before persistent/public compatibility cost exists.
- Registry evidence is reproducible and dated.

### Negative

- Phase 0 cannot close until the product owner chooses or explicitly accepts the conflict.
- Current documents will require a coordinated mechanical rename.

### Neutral or deferred

- The repository may remain `helix-db` temporarily as historical working context.
- Internal technical terms such as HDoc are also reviewed when the final product identity is selected.

## Compatibility and migration

There is no shipped data or public protocol to migrate. The acceptance change will update:

- Repository and remote identity if authorized.
- Root and documentation titles/text.
- Planned crate/npm/SDK/binary/container/operator identifiers.
- Format magic/prefix proposals before golden fixtures.
- Telemetry, error, environment, and configuration prefixes.
- ADR, scope, ownership, evidence, and requirement links where names change.

The transcript remains unchanged as provenance.

## Security and operations

A distinct identity reduces dependency-confusion and wrong-package installation risk. Once selected, package publication requires verified ownership, protected accounts, provenance, and explicit registry coordinates under later release tasks.

## Validation plan

- [x] Search GitHub for exact/near database repository names.
- [x] Query crates.io for `helix-db`.
- [x] Query npm for `helix-db` and `helixdb` results.
- [ ] Receive product-owner direction to rename or knowingly retain the conflict.
- [x] Screen the NexilisDB, NodalysDB, and VireliaDB exact slugs across the planned registries, domains, and general web results.
- [ ] Repeat the selected candidate checks immediately before claiming identifiers and obtain appropriate trademark/legal review before release.
- [ ] Update every canonical identifier in one reviewed change.
- [ ] Re-run repository link, checklist, and traceability validation.

## Implementation impact

- `P00-005` and `G00` remain open.
- Phase 2 workspace/package naming and Phase 3 format identity depend on acceptance.
- No current implementation code is affected.

## Follow-up work

- [ ] Select the final public product name.
- [ ] Define the canonical repository, crate, npm scope/package, binaries, SDKs, container, operator, protocol, telemetry, configuration, and format prefixes.
- [ ] Rename the repository remote only with explicit authorization.

## References

- [Specifications](../../Specifications.md)
- [Study](../../Study.md)
- [Implementation plan](../../ImplementationPlan.md)
- [GitHub: HelixDB/helix-db](https://github.com/HelixDB/helix-db)
- [crates.io: helix-db](https://crates.io/crates/helix-db)
- [npm: helix-db](https://www.npmjs.com/package/helix-db)
- [npm: @helix-db/helix-db](https://www.npmjs.com/package/@helix-db/helix-db)

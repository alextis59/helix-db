//! Boundary-only skeleton for rebuildable columnar sidecars and CPU operators.
//!
//! Sidecars are never authoritative. No encoded format or scan engine exists in Phase 2.

/// Stable development name used by workspace-boundary checks.
pub const COMPONENT_NAME: &str = "helix-columnar";

/// Current implementation maturity; this crate is not a database feature.
pub const MATURITY: &str = "boundary-skeleton";

/// Internal dependency boundaries exercised by this skeleton.
pub const INTERNAL_DEPENDENCIES: &[&str] =
    &[helix_doc::COMPONENT_NAME, helix_query::COMPONENT_NAME];

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn depends_on_semantics_not_storage() {
        assert_eq!(MATURITY, "boundary-skeleton");
        assert_eq!(INTERNAL_DEPENDENCIES, &["helix-doc", "helix-query"]);
    }
}
// helix-coverage: exclude-end unit-tests

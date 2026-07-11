//! Boundary-only skeleton for query syntax, normalization, and CPU reference behavior.
//!
//! No parser, planner, or query execution is implemented in Phase 2.

/// Stable development name used by workspace-boundary checks.
pub const COMPONENT_NAME: &str = "helix-query";

/// Current implementation maturity; this crate is not a database feature.
pub const MATURITY: &str = "boundary-skeleton";

/// Internal dependency boundaries exercised by this skeleton.
pub const INTERNAL_DEPENDENCIES: &[&str] = &[helix_doc::COMPONENT_NAME];

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn depends_only_on_document_semantics() {
        assert_eq!(MATURITY, "boundary-skeleton");
        assert_eq!(INTERNAL_DEPENDENCIES, &["helix-doc"]);
    }
}
// helix-coverage: exclude-end unit-tests

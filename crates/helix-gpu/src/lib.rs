//! Boundary-only skeleton for optional GPU planning, candidates, dispatch, and verification.
//!
//! No GPU API or kernel exists in Phase 2, and correctness never depends on this crate.

/// Stable development name used by workspace-boundary checks.
pub const COMPONENT_NAME: &str = "helix-gpu";

/// Current implementation maturity; this crate is not a database feature.
pub const MATURITY: &str = "boundary-skeleton";

/// Semantic and derived-data boundaries visible to optional acceleration.
pub const INTERNAL_DEPENDENCIES: &[&str] = &[
    helix_columnar::COMPONENT_NAME,
    helix_doc::COMPONENT_NAME,
    helix_query::COMPONENT_NAME,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excludes_core_storage_and_host_boundaries() {
        assert_eq!(MATURITY, "boundary-skeleton");
        assert_eq!(
            INTERNAL_DEPENDENCIES,
            &["helix-columnar", "helix-doc", "helix-query"]
        );
    }
}

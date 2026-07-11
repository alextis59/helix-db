//! Boundary-only skeleton for logical document values and canonical semantics.
//!
//! No document codec or database behavior is implemented in Phase 2.

/// Stable development name used by workspace-boundary checks.
pub const COMPONENT_NAME: &str = "helix-doc";

/// Current implementation maturity; this crate is not a database feature.
pub const MATURITY: &str = "boundary-skeleton";

/// Internal `HelixDB` crates this boundary is allowed to depend on.
pub const INTERNAL_DEPENDENCIES: &[&str] = &[];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remains_a_leaf_boundary_skeleton() {
        assert_eq!(COMPONENT_NAME, "helix-doc");
        assert_eq!(MATURITY, "boundary-skeleton");
        assert!(INTERNAL_DEPENDENCIES.is_empty());
    }
}

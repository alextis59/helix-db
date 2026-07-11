//! Boundary-only skeleton for portable deterministic orchestration.
//!
//! Host capabilities are injected across a later ABI. No ambient host access or database
//! orchestration is implemented in Phase 2.

/// Stable development name used by workspace-boundary checks.
pub const COMPONENT_NAME: &str = "helix-core";

/// Current implementation maturity; this crate is not a database feature.
pub const MATURITY: &str = "boundary-skeleton";

/// Deterministic internal boundaries composed by the portable core.
pub const INTERNAL_DEPENDENCIES: &[&str] = &[
    helix_columnar::COMPONENT_NAME,
    helix_doc::COMPONENT_NAME,
    helix_query::COMPONENT_NAME,
    helix_storage::COMPONENT_NAME,
];

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excludes_host_gpu_and_server_boundaries() {
        assert_eq!(MATURITY, "boundary-skeleton");
        assert_eq!(
            INTERNAL_DEPENDENCIES,
            &[
                "helix-columnar",
                "helix-doc",
                "helix-query",
                "helix-storage"
            ]
        );
    }
}
// helix-coverage: exclude-end unit-tests

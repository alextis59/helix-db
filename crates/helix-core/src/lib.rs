//! Portable deterministic orchestration boundary with a versioned component ABI contract.
//!
//! The canonical WIT contract is `helix:core-abi@1.0.0`. Host capabilities remain explicit and no
//! ambient host access or database orchestration is implemented by P04-001.

/// Stable development name used by workspace-boundary checks.
pub const COMPONENT_NAME: &str = "helix-core";

/// Current implementation maturity; this crate is not a database feature.
pub const MATURITY: &str = "component-abi-v1";

/// Exact internal component ABI accepted by the current contract.
pub const COMPONENT_ABI_VERSION: (u16, u16) = (1, 0);

/// Canonical WIT package identity. Package `SemVer` never replaces ABI negotiation.
pub const COMPONENT_ABI_PACKAGE: &str = "helix:core-abi@1.0.0";

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
        assert_eq!(MATURITY, "component-abi-v1");
        assert_eq!(COMPONENT_ABI_VERSION, (1, 0));
        assert_eq!(COMPONENT_ABI_PACKAGE, "helix:core-abi@1.0.0");
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

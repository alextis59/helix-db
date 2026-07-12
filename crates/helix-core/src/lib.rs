//! Portable deterministic orchestration boundary with a versioned component ABI contract.
//!
//! The current WIT source contract is `helix:core-abi@1.1.0`. Host capability identities are
//! explicit, but operations, bindings, ambient access, and database orchestration remain absent.

pub mod deterministic;

pub use deterministic::{
    COMPONENT_ABI_PACKAGE, COMPONENT_ABI_VERSION, COMPONENT_NAME, INTERNAL_DEPENDENCIES, MATURITY,
};

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excludes_host_gpu_and_server_boundaries() {
        assert_eq!(MATURITY, "host-capability-abi-v1");
        assert_eq!(COMPONENT_ABI_VERSION, (1, 1));
        assert_eq!(COMPONENT_ABI_PACKAGE, "helix:core-abi@1.1.0");
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

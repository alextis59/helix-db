//! Portable deterministic orchestration boundary with a versioned component ABI contract.
//!
//! The canonical WIT contract is `helix:core-abi@1.0.0`. Host capabilities remain explicit and no
//! ambient host access or database orchestration is implemented. P04-002 enforces the portable
//! source, dependency, and zero-import boundary.

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
        assert_eq!(MATURITY, "deterministic-core-boundary-v1");
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

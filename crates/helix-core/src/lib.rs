//! Portable deterministic orchestration boundary with a versioned component ABI contract.
//!
//! The current WIT source contract is `helix:core-abi@6.0.0`, including completion/deadline/shutdown
//! semantics. Explicit copy is required and transport alternatives remain non-ABI prototypes;
//! bindings, host execution, selection, and database orchestration remain absent.

pub mod deterministic;
pub mod explicit_copy;
pub mod transport_alternatives;

pub use deterministic::{
    COMPONENT_ABI_PACKAGE, COMPONENT_ABI_VERSION, COMPONENT_NAME, INTERNAL_DEPENDENCIES, MATURITY,
};

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excludes_host_gpu_and_server_boundaries() {
        assert_eq!(MATURITY, "async-completion-contract-v1");
        assert_eq!(COMPONENT_ABI_VERSION, (6, 0));
        assert_eq!(COMPONENT_ABI_PACKAGE, "helix:core-abi@6.0.0");
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

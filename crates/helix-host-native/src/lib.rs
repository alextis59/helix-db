//! Boundary-only skeleton for native host capabilities and optional GPU integration.
//!
//! No filesystem, clock, random, network, scheduler, device, or runtime capability exists in
//! Phase 2.

/// Stable development name used by workspace-boundary checks.
pub const COMPONENT_NAME: &str = "helix-host-native";

/// Current implementation maturity; this crate is not a database feature.
pub const MATURITY: &str = "boundary-skeleton";

/// Required internal dependency boundaries exercised by this skeleton.
pub const INTERNAL_DEPENDENCIES: &[&str] = &[helix_core::COMPONENT_NAME];

/// Optional acceleration boundary, enabled only by the explicit `gpu` feature.
#[cfg(feature = "gpu")]
pub const OPTIONAL_GPU_DEPENDENCY: &str = helix_gpu::COMPONENT_NAME;

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portable_core_is_the_only_required_dependency() {
        assert_eq!(MATURITY, "boundary-skeleton");
        assert_eq!(INTERNAL_DEPENDENCIES, &["helix-core"]);
    }

    #[cfg(feature = "gpu")]
    #[test]
    fn gpu_boundary_is_explicitly_optional() {
        assert_eq!(OPTIONAL_GPU_DEPENDENCY, "helix-gpu");
    }
}
// helix-coverage: exclude-end unit-tests

//! Boundary-only skeleton for the native server process and API lifecycle.
//!
//! No listener, protocol, command, or database process is implemented in Phase 2.

/// Stable development name used by workspace-boundary checks.
pub const COMPONENT_NAME: &str = "helix-server";

/// Current implementation maturity; this crate is not a database feature.
pub const MATURITY: &str = "boundary-skeleton";

/// The server is a leaf over the native host boundary.
pub const INTERNAL_DEPENDENCIES: &[&str] = &[helix_host_native::COMPONENT_NAME];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn depends_only_on_the_native_host_boundary() {
        assert_eq!(MATURITY, "boundary-skeleton");
        assert_eq!(INTERNAL_DEPENDENCIES, &["helix-host-native"]);
    }
}

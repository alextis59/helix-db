//! Wasmtime native-host skeleton with explicit deny-by-default capability grants.
//!
//! The skeleton configures an asynchronous Component Model engine and validates bounded component
//! bytes. It does not install WASI, filesystem, socket, clock, entropy, GPU, or other ambient host
//! adapters. Concrete ABI call execution and cross-host conformance remain later plan items.

use std::collections::BTreeSet;
use std::error::Error;
use std::fmt;

use wasmtime::component::Component;
use wasmtime::{Config, Engine};

/// Stable development name used by workspace-boundary checks.
pub const COMPONENT_NAME: &str = "helix-host-native";

/// Current implementation maturity; this is a runtime skeleton, not a database feature.
pub const MATURITY: &str = "wasmtime-host-skeleton-v1";

/// Required internal dependency boundaries exercised by this skeleton.
pub const INTERNAL_DEPENDENCIES: &[&str] = &[helix_core::COMPONENT_NAME];

/// Maximum component bytes accepted for compilation by the skeleton.
pub const MAXIMUM_COMPONENT_BYTES: usize = 16 * 1024 * 1024;

/// Maximum capability grants in one native-host configuration.
pub const MAXIMUM_CAPABILITY_GRANTS: usize = 128;

/// Maximum UTF-8 bytes in one exact capability scope.
pub const MAXIMUM_SCOPE_BYTES: usize = 4096;

/// Optional acceleration boundary, enabled only by the explicit `gpu` feature.
#[cfg(feature = "gpu")]
pub const OPTIONAL_GPU_DEPENDENCY: &str = helix_gpu::COMPONENT_NAME;

/// Every native host capability kind declared by ABI 7.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum NativeCapability {
    /// Scoped file operations.
    Files,
    /// Scoped directory operations.
    Directories,
    /// Durability barriers.
    Durability,
    /// Named clocks and monotonic timers.
    Timers,
    /// Purpose-separated cryptographic randomness.
    Randomness,
    /// Bounded scheduling and cancellation.
    Scheduling,
    /// Redacted metrics emission.
    Metrics,
    /// Named secret retrieval.
    Secrets,
    /// Scoped network endpoints.
    Networking,
    /// Scoped object-storage namespaces.
    ObjectStorage,
    /// Explicit device profiles and GPU access.
    Gpu,
}

/// One exact capability grant.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CapabilityGrant {
    /// Capability kind.
    pub kind: NativeCapability,
    /// Exact non-wildcard scope interpreted by that capability adapter.
    pub scope: String,
}

/// Validated immutable capability policy.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CapabilityPolicy {
    grants: BTreeSet<(NativeCapability, String)>,
}

impl CapabilityPolicy {
    /// Builds a bounded exact-match allowlist.
    ///
    /// # Errors
    ///
    /// Returns a stable error for too many grants, invalid scopes, or duplicate grants.
    pub fn new(grants: Vec<CapabilityGrant>) -> Result<Self, NativeHostError> {
        if grants.len() > MAXIMUM_CAPABILITY_GRANTS {
            return Err(NativeHostError::CapabilityLimit);
        }
        let mut validated = BTreeSet::new();
        for grant in grants {
            if grant.scope.is_empty()
                || grant.scope.len() > MAXIMUM_SCOPE_BYTES
                || grant.scope == "*"
                || grant.scope.chars().any(char::is_control)
            {
                return Err(NativeHostError::InvalidCapabilityScope);
            }
            if !validated.insert((grant.kind, grant.scope)) {
                return Err(NativeHostError::DuplicateCapability);
            }
        }
        Ok(Self { grants: validated })
    }

    /// Returns whether this exact kind and scope were granted.
    #[must_use]
    pub fn allows(&self, kind: NativeCapability, scope: &str) -> bool {
        self.grants
            .iter()
            .any(|(granted_kind, granted_scope)| *granted_kind == kind && granted_scope == scope)
    }

    /// Number of exact grants.
    #[must_use]
    pub fn len(&self) -> usize {
        self.grants.len()
    }

    /// Whether the host has no granted capability.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.grants.is_empty()
    }
}

/// Stable native-host skeleton error.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum NativeHostError {
    /// Too many capability grants were requested.
    CapabilityLimit,
    /// A scope was empty, oversized, a wildcard, or contained control text.
    InvalidCapabilityScope,
    /// The same kind/scope pair was granted twice.
    DuplicateCapability,
    /// Component bytes were empty or exceeded the configured bound.
    ComponentSize,
    /// Wasmtime rejected the engine configuration or component bytes.
    Wasmtime,
}

impl NativeHostError {
    /// Stable error code for logs and conformance assertions.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::CapabilityLimit => "CAP_GRANT_LIMIT",
            Self::InvalidCapabilityScope => "CAP_SCOPE_INVALID",
            Self::DuplicateCapability => "CAP_GRANT_DUPLICATE",
            Self::ComponentSize => "VAL_COMPONENT_SIZE",
            Self::Wasmtime => "VAL_COMPONENT_INVALID",
        }
    }
}

impl fmt::Display for NativeHostError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl Error for NativeHostError {}

/// Native Wasmtime engine plus its immutable capability policy.
#[derive(Debug)]
pub struct NativeHost {
    engine: Engine,
    policy: CapabilityPolicy,
}

impl NativeHost {
    /// Creates an async Component Model engine without installing ambient adapters.
    ///
    /// # Errors
    ///
    /// Returns `VAL_COMPONENT_INVALID` if Wasmtime rejects the pinned configuration.
    pub fn new(policy: CapabilityPolicy) -> Result<Self, NativeHostError> {
        let mut config = Config::new();
        config.wasm_component_model(true);
        config.consume_fuel(true);
        config.epoch_interruption(true);
        let engine = Engine::new(&config).map_err(|_| NativeHostError::Wasmtime)?;
        Ok(Self { engine, policy })
    }

    /// Returns the validated immutable capability policy.
    #[must_use]
    pub const fn policy(&self) -> &CapabilityPolicy {
        &self.policy
    }

    /// Compiles a bounded Component Model binary without instantiating or linking host adapters.
    ///
    /// # Errors
    ///
    /// Returns a stable size or validation error. Core Wasm modules are not components and reject.
    pub fn validate_component(&self, bytes: &[u8]) -> Result<(), NativeHostError> {
        if bytes.is_empty() || bytes.len() > MAXIMUM_COMPONENT_BYTES {
            return Err(NativeHostError::ComponentSize);
        }
        Component::new(&self.engine, bytes)
            .map(|_| ())
            .map_err(|_| NativeHostError::Wasmtime)
    }
}

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;

    const EMPTY_COMPONENT: &[u8] = b"\0asm\x0d\0\x01\0";
    const EMPTY_CORE_MODULE: &[u8] = b"\0asm\x01\0\0\0";

    fn grant(kind: NativeCapability, scope: &str) -> CapabilityGrant {
        CapabilityGrant {
            kind,
            scope: scope.to_owned(),
        }
    }

    #[test]
    fn capability_policy_is_exact_bounded_and_deny_by_default() {
        let policy = CapabilityPolicy::new(vec![
            grant(NativeCapability::Files, "tenant-a/data"),
            grant(NativeCapability::Timers, "monotonic:primary"),
        ]);
        assert!(policy.is_ok());
        let Ok(policy) = policy else { return };
        assert_eq!(policy.len(), 2);
        assert!(policy.allows(NativeCapability::Files, "tenant-a/data"));
        assert!(!policy.allows(NativeCapability::Files, "tenant-a"));
        assert!(!policy.allows(NativeCapability::Directories, "tenant-a/data"));
    }

    #[test]
    fn capability_policy_rejects_wildcards_duplicates_controls_and_limits() {
        assert_eq!(
            CapabilityPolicy::new(vec![grant(NativeCapability::Files, "*")]),
            Err(NativeHostError::InvalidCapabilityScope)
        );
        let duplicate = grant(NativeCapability::Files, "data");
        assert_eq!(
            CapabilityPolicy::new(vec![duplicate.clone(), duplicate]),
            Err(NativeHostError::DuplicateCapability)
        );
        assert!(CapabilityPolicy::new(vec![grant(NativeCapability::Files, "bad\n")]).is_err());
        assert!(
            CapabilityPolicy::new(
                (0..=MAXIMUM_CAPABILITY_GRANTS)
                    .map(|index| grant(NativeCapability::Files, &format!("scope-{index}")))
                    .collect()
            )
            .is_err()
        );
    }

    #[test]
    fn wasmtime_accepts_components_and_rejects_core_modules_and_size_drift() {
        let policy = CapabilityPolicy::new(vec![]);
        assert!(policy.is_ok());
        let Ok(policy) = policy else { return };
        let host = NativeHost::new(policy);
        assert!(host.is_ok());
        let Ok(host) = host else { return };
        assert!(host.policy().is_empty());
        assert_eq!(host.validate_component(EMPTY_COMPONENT), Ok(()));
        assert_eq!(
            host.validate_component(&[]),
            Err(NativeHostError::ComponentSize)
        );
        assert_eq!(
            host.validate_component(&vec![0; MAXIMUM_COMPONENT_BYTES + 1]),
            Err(NativeHostError::ComponentSize)
        );
        assert!(matches!(
            host.validate_component(EMPTY_CORE_MODULE),
            Err(NativeHostError::Wasmtime)
        ));
    }

    #[test]
    fn dependency_and_optional_gpu_boundaries_remain_explicit() {
        assert_eq!(MATURITY, "wasmtime-host-skeleton-v1");
        assert_eq!(INTERNAL_DEPENDENCIES, &["helix-core"]);
        #[cfg(feature = "gpu")]
        assert_eq!(OPTIONAL_GPU_DEPENDENCY, "helix-gpu");
    }
}
// helix-coverage: exclude-end unit-tests

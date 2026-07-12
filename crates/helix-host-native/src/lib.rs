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
    /// Advisory/exclusive lock namespaces.
    Locks,
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

/// All ABI 7 capability kinds in WIT declaration order.
pub const ALL_NATIVE_CAPABILITIES: [NativeCapability; 12] = [
    NativeCapability::Files,
    NativeCapability::Directories,
    NativeCapability::Durability,
    NativeCapability::Locks,
    NativeCapability::Timers,
    NativeCapability::Randomness,
    NativeCapability::Scheduling,
    NativeCapability::Metrics,
    NativeCapability::Secrets,
    NativeCapability::Networking,
    NativeCapability::ObjectStorage,
    NativeCapability::Gpu,
];

/// All ABI 7 imported host calls in WIT declaration order.
pub const NATIVE_ABI_CALLS: [&str; 21] = [
    "immutable-buffer.length",
    "mutable-staging-buffer.capacity",
    "mutable-staging-buffer.initialized-length",
    "opaque-handle.descriptor",
    "host-resources.allocate-staging",
    "host-resources.seal-staging",
    "host-resources.duplicate-immutable",
    "host-resources.read-immutable",
    "host-resources.write-staging",
    "host-resources.copy-immutable-to-staging",
    "host-files.read-batch",
    "host-files.write-batch",
    "host-directories.rename-batch",
    "host-directories.list-batch",
    "host-directories.delete-batch",
    "host-durability.sync-batch",
    "host-timers.read-clock",
    "host-randomness.read-random",
    "host-control.poll-cancellation",
    "host-control.lifecycle",
    "host-control.capture-execution-profile",
];

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
    use helix_core::explicit_copy::MutableStagingBuffer;

    const EMPTY_COMPONENT: &[u8] = b"\0asm\x0d\0\x01\0";
    const EMPTY_CORE_MODULE: &[u8] = b"\0asm\x01\0\0\0";
    const SHARED_VECTORS: &str =
        include_str!("../../../conformance/host/abi-v7-explicit-copy.vectors");

    fn vector(key: &str) -> &str {
        SHARED_VECTORS
            .lines()
            .find_map(|line| line.split_once('=').filter(|(name, _)| *name == key))
            .map_or("", |(_, value)| value)
    }

    fn vector_u64(key: &str) -> u64 {
        vector(key).parse().unwrap_or(u64::MAX)
    }

    fn vector_u32(key: &str) -> u32 {
        u32::try_from(vector_u64(key)).unwrap_or(u32::MAX)
    }

    fn vector_bytes(key: &str) -> Vec<u8> {
        vector(key)
            .as_bytes()
            .chunks_exact(2)
            .map(|pair| {
                let text = std::str::from_utf8(pair).unwrap_or("");
                u8::from_str_radix(text, 16).unwrap_or_default()
            })
            .collect()
    }

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

    #[test]
    fn shared_abi_v7_explicit_copy_vectors_match_native_boundary() {
        assert_eq!(vector("schema"), "helix.host-abi-v7-conformance/1");
        assert_eq!(vector_u64("abi-major"), 7);
        assert_eq!(vector_u64("imported-calls"), NATIVE_ABI_CALLS.len() as u64);
        assert_eq!(vector_u64("capability-kinds"), 12);
        assert_eq!(ALL_NATIVE_CAPABILITIES.len(), 12);
        assert!(ALL_NATIVE_CAPABILITIES.contains(&NativeCapability::Locks));

        let staging = MutableStagingBuffer::allocate(vector_u64("capacity"));
        assert!(staging.is_ok());
        let Ok(mut staging) = staging else { return };
        assert!(
            staging
                .write(vector_u64("gap-offset"), &vector_bytes("gap-hex"))
                .is_err()
        );
        assert!(
            staging
                .write(vector_u64("write-offset"), &vector_bytes("write-hex"))
                .is_ok()
        );
        let source = staging.seal(vector_bytes("write-hex").len() as u64);
        assert!(source.is_ok());
        let Ok(source) = source else { return };
        let read = source.read(vector_u64("read-offset"), vector_u32("read-length"));
        assert!(read.is_ok());
        let Ok(read) = read else { return };
        assert_eq!(read.bytes, vector_bytes("expected-read-hex"));
        assert_eq!(read.end_of_buffer.to_string(), vector("expected-read-end"));

        let target = MutableStagingBuffer::allocate(vector_u64("capacity"));
        assert!(target.is_ok());
        let Ok(mut target) = target else { return };
        assert!(
            target
                .copy_from(
                    &source,
                    vector_u64("copy-source-offset"),
                    vector_u64("copy-target-offset"),
                    vector_u32("copy-length"),
                )
                .is_ok()
        );
        let copied = target.seal(vector_u64("copy-length"));
        assert!(copied.is_ok());
        let Ok(copied) = copied else { return };
        assert_eq!(
            copied
                .read(0, vector_u32("copy-length"))
                .map(|value| value.bytes),
            Ok(vector_bytes("expected-copy-hex"))
        );
    }
}
// helix-coverage: exclude-end unit-tests

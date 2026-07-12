//! Deterministic portable-core composition.
//!
//! This module may consume only explicit arguments and deterministic internal crates. Files,
//! networking, clocks, randomness, threads, processes, environment discovery, secrets, and device
//! access belong to capability hosts and are forbidden here. P04-003 introduces those interfaces;
//! it does not grant ambient access to this module.

/// Stable development name used by workspace-boundary checks.
pub const COMPONENT_NAME: &str = "helix-core";

/// Current implementation maturity; no host operation or database orchestration exists yet.
pub const MATURITY: &str = "async-storage-batch-abi-v1";

/// Exact internal component ABI accepted by the current contract.
pub const COMPONENT_ABI_VERSION: (u16, u16) = (3, 0);

/// Canonical WIT package identity. Package `SemVer` never replaces ABI negotiation.
pub const COMPONENT_ABI_PACKAGE: &str = "helix:core-abi@3.0.0";

/// Deterministic internal boundaries composed by the portable core.
pub const INTERNAL_DEPENDENCIES: &[&str] = &[
    helix_columnar::COMPONENT_NAME,
    helix_doc::COMPONENT_NAME,
    helix_query::COMPONENT_NAME,
    helix_storage::COMPONENT_NAME,
];

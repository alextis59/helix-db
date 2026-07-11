//! Closed-world `HDoc` reader/writer capabilities and non-mutating migration assessment.

use std::error::Error;
use std::fmt;

use super::{DecodeError, decode};

/// Exact `HDoc` major version implemented by this reader and writer.
pub const HDOC_CURRENT_MAJOR: u16 = 1;
/// Exact `HDoc` minor version implemented by this reader and writer.
pub const HDOC_CURRENT_MINOR: u16 = 0;

pub(crate) const HDOC_SUPPORTED_DOCUMENT_FLAGS: u32 = 0x0000_0001;
pub(crate) const HDOC_SUPPORTED_REQUIRED_FEATURES: u64 = 0x0000_0000_0000_0001;
pub(crate) const HDOC_SUPPORTED_OPTIONAL_FEATURES: u64 = 0;

/// Stable `HDoc` feature identities allocated by the v1 envelope registry.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HDocFeature {
    /// Required bit 0 and document flag 0: bounded section compression profile 1/1.
    SectionCompression,
    /// Required bit 1 and document flag 2: reserved dictionary references, not implemented.
    PathDictionaryReferences,
    /// Required bit 2 and document flag 3: registered semantic extensions, not implemented.
    SemanticExtensions,
    /// Optional bit 0 and document flag 4: preservable nonsemantic extensions, not implemented.
    NonsemanticExtensions,
}

/// Exact closed-world capabilities of the current `HDoc` reader and writer.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct HDocCapabilities;

impl HDocCapabilities {
    /// Returns the only currently readable major/minor pair.
    #[must_use]
    pub const fn readable_version(self) -> (u16, u16) {
        (HDOC_CURRENT_MAJOR, HDOC_CURRENT_MINOR)
    }

    /// Returns the only currently writable major/minor pair.
    #[must_use]
    pub const fn writable_version(self) -> (u16, u16) {
        (HDOC_CURRENT_MAJOR, HDOC_CURRENT_MINOR)
    }

    /// Returns the exact accepted document-flag mask.
    #[must_use]
    pub const fn document_flags(self) -> u32 {
        HDOC_SUPPORTED_DOCUMENT_FLAGS
    }

    /// Returns the exact accepted required-feature mask.
    #[must_use]
    pub const fn required_features(self) -> u64 {
        HDOC_SUPPORTED_REQUIRED_FEATURES
    }

    /// Returns the exact accepted optional-feature mask.
    #[must_use]
    pub const fn optional_features(self) -> u64 {
        HDOC_SUPPORTED_OPTIONAL_FEATURES
    }

    /// Reports whether this build implements one allocated feature's complete semantics.
    #[must_use]
    pub const fn supports(self, feature: HDocFeature) -> bool {
        matches!(feature, HDocFeature::SectionCompression)
    }
}

/// Physical storage profile selected by one fully validated `HDoc` envelope.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HDocStorageProfile {
    /// Four mandatory uncompressed base sections.
    BaseUncompressed,
    /// At least one base section uses bounded compression codec/profile 1/1.
    SectionCompression1,
}

/// Fully validated current `HDoc` profile and exact required capabilities.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct HDocNegotiatedProfile {
    version: (u16, u16),
    document_flags: u32,
    required_features: u64,
    optional_features: u64,
    storage_profile: HDocStorageProfile,
    content_hash: [u8; 32],
}

impl HDocNegotiatedProfile {
    /// Returns the exact validated major/minor pair.
    #[must_use]
    pub const fn version(self) -> (u16, u16) {
        self.version
    }

    /// Returns exact validated structural flags.
    #[must_use]
    pub const fn document_flags(self) -> u32 {
        self.document_flags
    }

    /// Returns exact validated required features.
    #[must_use]
    pub const fn required_features(self) -> u64 {
        self.required_features
    }

    /// Returns exact validated optional features.
    #[must_use]
    pub const fn optional_features(self) -> u64 {
        self.optional_features
    }

    /// Returns the validated physical storage profile.
    #[must_use]
    pub const fn storage_profile(self) -> HDocStorageProfile {
        self.storage_profile
    }

    /// Returns the canonical typed logical content identity.
    #[must_use]
    pub const fn content_hash(self) -> [u8; 32] {
        self.content_hash
    }
}

/// Negotiates one `HDoc` only after complete ordinary validation.
///
/// # Errors
///
/// Returns the decoder's redacted error for wrong magic, any version other than exact 1.0,
/// unsupported required/optional features, structural flag disagreement, or corrupt bytes. No
/// profile is returned from partially validated input.
pub fn negotiate_hdoc(bytes: &[u8]) -> Result<HDocNegotiatedProfile, DecodeError> {
    let decoded = decode(bytes)?;
    let document_flags = read_u32(bytes, 16);
    let required_features = read_u64(bytes, 48);
    let optional_features = read_u64(bytes, 56);
    let storage_profile = if decoded.compressed_section_count() == 0 {
        HDocStorageProfile::BaseUncompressed
    } else {
        HDocStorageProfile::SectionCompression1
    };
    Ok(HDocNegotiatedProfile {
        version: (read_u16(bytes, 8), read_u16(bytes, 10)),
        document_flags,
        required_features,
        optional_features,
        storage_profile,
        content_hash: *decoded.content_hash(),
    })
}

/// Explicit target version for non-mutating migration assessment.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct HDocMigrationTarget {
    major: u16,
    minor: u16,
}

impl HDocMigrationTarget {
    /// Returns the only target implemented by this build.
    #[must_use]
    pub const fn current() -> Self {
        Self {
            major: HDOC_CURRENT_MAJOR,
            minor: HDOC_CURRENT_MINOR,
        }
    }

    /// Creates an explicit target for fail-closed capability assessment.
    #[must_use]
    pub const fn new(major: u16, minor: u16) -> Self {
        Self { major, minor }
    }

    /// Returns the requested major/minor pair.
    #[must_use]
    pub const fn version(self) -> (u16, u16) {
        (self.major, self.minor)
    }
}

/// Current migration outcome. No rewriting compatibility window is advertised.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HDocMigrationAssessment {
    /// Source is already a fully validated exact-current canonical artifact.
    NoMigrationRequired {
        /// Canonical typed logical identity that a future migration must preserve.
        content_hash: [u8; 32],
        /// Existing physical storage profile; no rewrite occurs.
        storage_profile: HDocStorageProfile,
    },
}

impl HDocMigrationAssessment {
    /// Reports whether executing this assessment would rewrite bytes.
    #[must_use]
    pub const fn requires_rewrite(self) -> bool {
        false
    }
}

/// Fail-closed source/target migration assessment failure.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum HDocMigrationError {
    /// Trusted requested target is not implemented by this build.
    UnsupportedTarget {
        /// Requested major generation.
        major: u16,
        /// Requested minor generation.
        minor: u16,
    },
    /// Source could not be completely negotiated and validated.
    Source(DecodeError),
}

impl HDocMigrationError {
    /// Returns the stable errors-v1 code.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::UnsupportedTarget { .. } => "CAP_UNSUPPORTED_VERSION",
            Self::Source(error) => error.code(),
        }
    }
}

impl fmt::Display for HDocMigrationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedTarget { major, minor } => {
                write!(formatter, "{}: {major}.{minor}", self.code())
            }
            Self::Source(error) => write!(formatter, "{}", error.code()),
        }
    }
}

impl Error for HDocMigrationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Source(error) => Some(error),
            Self::UnsupportedTarget { .. } => None,
        }
    }
}

impl From<DecodeError> for HDocMigrationError {
    fn from(error: DecodeError) -> Self {
        Self::Source(error)
    }
}

/// Assesses migration without reading, rewriting, or publishing unsupported bytes.
///
/// Exact `HDoc` 1.0 to exact `HDoc` 1.0 is a validated no-op. This build advertises no readable old
/// version, writable new version, mixed-version window, automatic migration, or rollback point.
///
/// # Errors
///
/// Rejects an unsupported target before reading source bytes, then returns the full negotiation/
/// decoder error for any source that is not exact, supported, canonical `HDoc` 1.0.
pub fn assess_hdoc_migration(
    bytes: &[u8],
    target: HDocMigrationTarget,
) -> Result<HDocMigrationAssessment, HDocMigrationError> {
    if target != HDocMigrationTarget::current() {
        return Err(HDocMigrationError::UnsupportedTarget {
            major: target.major,
            minor: target.minor,
        });
    }
    let negotiated = negotiate_hdoc(bytes)?;
    Ok(HDocMigrationAssessment::NoMigrationRequired {
        content_hash: negotiated.content_hash,
        storage_profile: negotiated.storage_profile,
    })
}

fn read_u16(bytes: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([bytes[offset], bytes[offset + 1]])
}

fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    ])
}

fn read_u64(bytes: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes([
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7],
    ])
}

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        CompressionMode, EncodeDocument, EncodeField, EncodeOptions, EncodeValue,
        encode_with_options,
    };

    fn document(extra: &str) -> [EncodeField<'_>; 2] {
        [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new("payload", EncodeValue::String(extra)),
        ]
    }

    #[test]
    fn capability_matrix_is_exact_and_closed_world() {
        let capabilities = HDocCapabilities;
        assert_eq!(capabilities.readable_version(), (1, 0));
        assert_eq!(capabilities.writable_version(), (1, 0));
        assert_eq!(capabilities.document_flags(), 1);
        assert_eq!(capabilities.required_features(), 1);
        assert_eq!(capabilities.optional_features(), 0);
        assert!(capabilities.supports(HDocFeature::SectionCompression));
        assert!(!capabilities.supports(HDocFeature::PathDictionaryReferences));
        assert!(!capabilities.supports(HDocFeature::SemanticExtensions));
        assert!(!capabilities.supports(HDocFeature::NonsemanticExtensions));
        assert_eq!(HDocMigrationTarget::current().version(), (1, 0));
        assert_eq!(HDocMigrationTarget::new(2, 0).version(), (2, 0));
    }

    #[test]
    fn negotiation_returns_only_fully_validated_base_and_compressed_profiles()
    -> Result<(), Box<dyn Error>> {
        let small = document("x");
        let base = encode_with_options(
            EncodeDocument::new(&small),
            EncodeOptions {
                compression: CompressionMode::Disabled,
            },
        )?;
        let base_profile = negotiate_hdoc(base.as_bytes())?;
        assert_eq!(base_profile.version(), (1, 0));
        assert_eq!(base_profile.document_flags(), 0);
        assert_eq!(base_profile.required_features(), 0);
        assert_eq!(base_profile.optional_features(), 0);
        assert_eq!(
            base_profile.storage_profile(),
            HDocStorageProfile::BaseUncompressed
        );
        assert_eq!(base_profile.content_hash(), *base.content_hash());

        let repeated = "compressible".repeat(10_000);
        let large = document(&repeated);
        let compressed =
            encode_with_options(EncodeDocument::new(&large), EncodeOptions::default())?;
        let compressed_profile = negotiate_hdoc(compressed.as_bytes())?;
        assert_eq!(compressed_profile.document_flags(), 1);
        assert_eq!(compressed_profile.required_features(), 1);
        assert_eq!(
            compressed_profile.storage_profile(),
            HDocStorageProfile::SectionCompression1
        );
        assert!(compressed.compressed_section_count() > 0);
        Ok(())
    }

    #[test]
    fn negotiation_rejects_versions_features_and_corruption_before_profile_exposure()
    -> Result<(), Box<dyn Error>> {
        let fields = document("x");
        let encoded = encode_with_options(
            EncodeDocument::new(&fields),
            EncodeOptions {
                compression: CompressionMode::Disabled,
            },
        )?;
        let mut version = encoded.as_bytes().to_vec();
        version[8] = 2;
        assert!(matches!(
            negotiate_hdoc(&version),
            Err(DecodeError::UnsupportedVersion { major: 2, minor: 0 })
        ));
        let mut required = encoded.as_bytes().to_vec();
        required[48] = 2;
        refresh_checksum(&mut required);
        assert!(matches!(
            negotiate_hdoc(&required),
            Err(DecodeError::UnsupportedFeature { .. })
        ));
        let mut optional = encoded.as_bytes().to_vec();
        optional[56] = 1;
        refresh_checksum(&mut optional);
        assert!(matches!(
            negotiate_hdoc(&optional),
            Err(DecodeError::UnsupportedFeature { .. })
        ));
        let mut corrupted = encoded.as_bytes().to_vec();
        corrupted[100] ^= 1;
        assert!(matches!(
            negotiate_hdoc(&corrupted),
            Err(DecodeError::Corruption { .. })
        ));
        Ok(())
    }

    #[test]
    fn migration_assessment_is_noop_only_for_exact_current_valid_source()
    -> Result<(), Box<dyn Error>> {
        let fields = document("x");
        let encoded = encode_with_options(
            EncodeDocument::new(&fields),
            EncodeOptions {
                compression: CompressionMode::Disabled,
            },
        )?;
        let assessment = assess_hdoc_migration(encoded.as_bytes(), HDocMigrationTarget::current())?;
        assert!(!assessment.requires_rewrite());
        assert!(matches!(
            assessment,
            HDocMigrationAssessment::NoMigrationRequired {
                storage_profile: HDocStorageProfile::BaseUncompressed,
                ..
            }
        ));
        let target_error =
            assess_hdoc_migration(encoded.as_bytes(), HDocMigrationTarget::new(1, 1))
                .err()
                .unwrap_or(HDocMigrationError::UnsupportedTarget { major: 0, minor: 0 });
        assert_eq!(target_error.code(), "CAP_UNSUPPORTED_VERSION");
        assert_eq!(target_error.to_string(), "CAP_UNSUPPORTED_VERSION: 1.1");
        assert!(target_error.source().is_none());
        let source_error = assess_hdoc_migration(&[], HDocMigrationTarget::current())
            .err()
            .unwrap_or(HDocMigrationError::UnsupportedTarget { major: 0, minor: 0 });
        assert_eq!(source_error.code(), "CAP_FORMAT_UNSUPPORTED");
        assert_eq!(source_error.to_string(), "CAP_FORMAT_UNSUPPORTED");
        assert!(source_error.source().is_some());
        Ok(())
    }

    fn refresh_checksum(bytes: &mut [u8]) {
        bytes[32..36].fill(0);
        let checksum = crate::CRC32C.checksum(bytes);
        bytes[32..36].copy_from_slice(&checksum.to_le_bytes());
    }
}
// helix-coverage: exclude-end unit-tests

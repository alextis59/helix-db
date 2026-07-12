//! Safe, deterministic `HDoc` 1.0 encoding, validation, and logical value access.
//!
//! The encoder accepts a transient borrowed input tree, validates the complete tree and portable
//! limits, and publishes bytes only after canonical tables, typed content identity, optional
//! bounded compression, and stored-byte integrity have all succeeded. The decoder validates an
//! exact stored envelope, bounded decompression, canonical structure/payloads, typed identity, and
//! byte canonicality before returning metadata and read-only logical views. Callers may detach an
//! owned logical tree without losing exact type, payload, array, or object-presentation semantics.

use std::borrow::Cow;
use std::collections::BTreeSet;
use std::error::Error;
use std::fmt;
use std::iter::FusedIterator;

use blake3::Hasher;
use crc::{CRC_32_ISCSI, Crc};

mod hdoc_negotiation;
mod path_dictionary;
mod path_dictionary_state;
mod tagged_json;

pub use hdoc_negotiation::{
    HDOC_CURRENT_MAJOR, HDOC_CURRENT_MINOR, HDocCapabilities, HDocFeature, HDocMigrationAssessment,
    HDocMigrationError, HDocMigrationTarget, HDocNegotiatedProfile, HDocStorageProfile,
    assess_hdoc_migration, negotiate_hdoc,
};
pub use path_dictionary::{
    EncodedPathDictionary, PATH_DICTIONARY_FORMAT, PathDictionaryCheck, PathDictionaryEntry,
    PathDictionaryError, PathDictionaryInput, PathDictionaryInputEntry, PathDictionaryView,
    decode_path_dictionary, encode_path_dictionary, validate_path_dictionary_successor,
};
pub use path_dictionary_state::{
    CollectionPathDictionary, PathDictionaryLifecycleError, PathDictionaryPin,
    PathDictionaryRegistration, PathDictionarySnapshot, PreparedPathDictionaryUpdate,
};
pub use tagged_json::{
    HDOC_TAGGED_JSON_PROFILE, JsonImportError, JsonImportLimitId, import_tagged_json,
};

/// Stable development name used by workspace-boundary checks.
pub const COMPONENT_NAME: &str = "helix-doc";

/// Current implementation maturity.
pub const MATURITY: &str = "hdoc-properties-v1";

/// Internal `HelixDB` crates this portable leaf is allowed to depend on.
pub const INTERNAL_DEPENDENCIES: &[&str] = &[];

/// Maximum complete canonical-logical `HDoc` size in bytes.
pub const MAX_CANONICAL_BYTES: u64 = 16_777_216;

const HEADER_BYTES: u64 = 64;
const DIRECTORY_ENTRY_BYTES: u64 = 32;
const SECTION_COUNT: u16 = 4;
const BASE_HEADER_BYTES: u64 = HEADER_BYTES + DIRECTORY_ENTRY_BYTES * 4;
const FOOTER_BYTES: u64 = 64;
const FIELD_ENTRY_BYTES: u64 = 24;
const NAME_RECORD_BYTES: u64 = 8;
const ARRAY_ENTRY_BYTES: u64 = 12;
const CONTAINER_DESCRIPTOR_BYTES: u64 = 32;
const MAX_DEPTH: u64 = 100;
const MAX_OBJECT_FIELDS: u64 = 10_000;
const MAX_DOCUMENT_FIELDS: u64 = 100_000;
const MAX_FIELD_NAME_BYTES: u64 = 1_024;
const MAX_FIELD_NAME_SCALARS: u64 = 256;
const MAX_PATH_BYTES: u64 = 4_096;
const MAX_PATH_SEGMENTS: usize = 100;
const MAX_PATH_CANDIDATES: u64 = 1_000_000;
const MAX_ARRAY_ELEMENTS: u64 = 1_000_000;
const MAX_VECTOR_DIMENSION: u64 = 4_096;
const MAX_ID_PAYLOAD_BYTES: u64 = 1_024;
const TIMESTAMP_MIN: i64 = -62_135_596_800_000_000;
const TIMESTAMP_MAX: i64 = 253_402_300_799_999_999;
const DATE_MIN: i32 = -719_162;
const DATE_MAX: i32 = 2_932_896;
const DECIMAL_COEFFICIENT_LIMIT: u128 = 10_000_000_000_000_000_000_000_000_000_000_000;
const ROOT_SENTINEL: u32 = u32::MAX;
const COMPRESSION_BLOCK_BYTES: usize = 32_768;
const HASH_DOMAIN: &[u8] = b"HDOC-TYPED-CONTENT-HASH-V1\0";
const HEADER_MAGIC: &[u8; 8] = b"HDOC\r\n\x1a\n";
const FOOTER_MAGIC: &[u8; 8] = b"HDOCEND\n";
const COMPRESSION_MAGIC: &[u8; 8] = b"HCMP\r\n\x1a\n";
const CRC32C: Crc<u32> = Crc::<u32>::new(&CRC_32_ISCSI);

/// A transient root document supplied to the encoder.
#[derive(Clone, Copy, Debug)]
pub struct EncodeDocument<'a> {
    /// Root object fields in presentation order.
    pub fields: &'a [EncodeField<'a>],
}

impl<'a> EncodeDocument<'a> {
    /// Creates an encoder input document from root fields in presentation order.
    #[must_use]
    pub const fn new(fields: &'a [EncodeField<'a>]) -> Self {
        Self { fields }
    }
}

/// One object field supplied to the encoder.
#[derive(Clone, Copy, Debug)]
pub struct EncodeField<'a> {
    /// Exact, non-normalized Unicode field name.
    pub name: &'a str,
    /// Exact logical value.
    pub value: EncodeValue<'a>,
}

impl<'a> EncodeField<'a> {
    /// Creates a field without changing its name or value.
    #[must_use]
    pub const fn new(name: &'a str, value: EncodeValue<'a>) -> Self {
        Self { name, value }
    }
}

/// A transient nested object supplied to the encoder.
#[derive(Clone, Copy, Debug)]
pub struct EncodeObject<'a> {
    /// Object fields in presentation order.
    pub fields: &'a [EncodeField<'a>],
}

impl<'a> EncodeObject<'a> {
    /// Creates a nested object from fields in presentation order.
    #[must_use]
    pub const fn new(fields: &'a [EncodeField<'a>]) -> Self {
        Self { fields }
    }
}

/// Canonical decimal128 input before BID encoding.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Decimal128 {
    /// A signed zero. `HDoc` fixes its logical exponent to zero.
    Zero {
        /// Whether the zero has a negative sign.
        negative: bool,
    },
    /// A finite decimal value. Trailing coefficient zeroes are canonicalized.
    Finite {
        /// Whether the value has a negative sign.
        negative: bool,
        /// Unsigned decimal coefficient, strictly between zero and 10^34 after canonicalization.
        coefficient: u128,
        /// Base-10 logical exponent.
        exponent: i32,
    },
    /// Positive infinity.
    PositiveInfinity,
    /// Negative infinity.
    NegativeInfinity,
    /// The single admitted positive quiet NaN.
    NaN,
}

/// Stable logical type identity shared by encoded inputs, borrowed views, and owned values.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum ValueType {
    /// Null.
    Null,
    /// Boolean.
    Bool,
    /// Signed 32-bit integer.
    Int32,
    /// Signed 64-bit integer.
    Int64,
    /// Exact IEEE-754 binary64 bits.
    Float64,
    /// Canonical decimal128 logical value.
    Decimal128,
    /// Exact UTF-8 string.
    String,
    /// Binary subtype plus exact bytes.
    Binary,
    /// Unique-name object mapping with separate presentation order.
    Object,
    /// Dense ordered array.
    Array,
    /// Signed Unix-microsecond timestamp.
    Timestamp,
    /// Signed Unix-relative civil date.
    Date,
    /// RFC-order UUID bytes.
    Uuid,
    /// Opaque `ObjectId` bytes.
    ObjectId,
    /// Exact finite binary32 vector bits.
    VectorF32,
    /// Exact finite binary16 vector bits.
    VectorF16,
}

impl ValueType {
    /// Returns the stable logical type name used by semantic contracts and diagnostics.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Null => "null",
            Self::Bool => "bool",
            Self::Int32 => "int32",
            Self::Int64 => "int64",
            Self::Float64 => "float64",
            Self::Decimal128 => "decimal128",
            Self::String => "string",
            Self::Binary => "binary",
            Self::Object => "object",
            Self::Array => "array",
            Self::Timestamp => "timestamp",
            Self::Date => "date",
            Self::Uuid => "uuid",
            Self::ObjectId => "objectId",
            Self::VectorF32 => "vector<f32,N>",
            Self::VectorF16 => "vector<f16,N>",
        }
    }

    /// Returns the assigned `HDoc` 1.x type tag.
    #[must_use]
    pub const fn hdoc_tag(self) -> u8 {
        match self {
            Self::Null => 1,
            Self::Bool => 2,
            Self::Int32 => 3,
            Self::Int64 => 4,
            Self::Float64 => 5,
            Self::Decimal128 => 6,
            Self::String => 7,
            Self::Binary => 8,
            Self::Object => 9,
            Self::Array => 10,
            Self::Timestamp => 11,
            Self::Date => 12,
            Self::Uuid => 13,
            Self::ObjectId => 14,
            Self::VectorF32 => 15,
            Self::VectorF16 => 16,
        }
    }

    /// Reports whether this type is represented by a container descriptor.
    #[must_use]
    pub const fn is_container(self) -> bool {
        matches!(self, Self::Object | Self::Array)
    }
}

/// Exact logical input variants accepted by `HDoc` 1.0.
#[derive(Clone, Copy, Debug)]
pub enum EncodeValue<'a> {
    /// Null.
    Null,
    /// Boolean.
    Bool(bool),
    /// Signed 32-bit integer.
    Int32(i32),
    /// Signed 64-bit integer.
    Int64(i64),
    /// Exact IEEE-754 binary64 bits, including every NaN and signed zero.
    Float64Bits(u64),
    /// Canonicalizable IEEE-754 decimal128 logical value.
    Decimal128(Decimal128),
    /// Exact UTF-8 string bytes from a Rust string slice.
    String(&'a str),
    /// Generic binary subtype 0 and exact data bytes.
    Binary(&'a [u8]),
    /// Nested object.
    Object(EncodeObject<'a>),
    /// Dense array in index order.
    Array(&'a [EncodeValue<'a>]),
    /// Signed Unix microseconds in the accepted temporal range.
    Timestamp(i64),
    /// Signed days from 1970-01-01 in the accepted date range.
    Date(i32),
    /// RFC 9562 network-order UUID bytes.
    Uuid([u8; 16]),
    /// Exact `ObjectId` bytes.
    ObjectId([u8; 12]),
    /// Exact finite IEEE-754 binary32 element bits.
    VectorF32(&'a [u32]),
    /// Exact finite IEEE-754 binary16 element bits.
    VectorF16(&'a [u16]),
}

impl EncodeValue<'_> {
    /// Returns the stable logical type without inspecting or converting the payload.
    #[must_use]
    pub const fn value_type(self) -> ValueType {
        match self {
            Self::Null => ValueType::Null,
            Self::Bool(_) => ValueType::Bool,
            Self::Int32(_) => ValueType::Int32,
            Self::Int64(_) => ValueType::Int64,
            Self::Float64Bits(_) => ValueType::Float64,
            Self::Decimal128(_) => ValueType::Decimal128,
            Self::String(_) => ValueType::String,
            Self::Binary(_) => ValueType::Binary,
            Self::Object(_) => ValueType::Object,
            Self::Array(_) => ValueType::Array,
            Self::Timestamp(_) => ValueType::Timestamp,
            Self::Date(_) => ValueType::Date,
            Self::Uuid(_) => ValueType::Uuid,
            Self::ObjectId(_) => ValueType::ObjectId,
            Self::VectorF32(_) => ValueType::VectorF32,
            Self::VectorF16(_) => ValueType::VectorF16,
        }
    }
}

/// Encoder compression behavior.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum CompressionMode {
    /// Emit the mandatory uncompressed base profile.
    Disabled,
    /// Evaluate profile 1/1 and emit it only when its complete envelope is smaller.
    #[default]
    Canonical,
}

/// Options that select a fully specified `HDoc` writer profile.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct EncodeOptions {
    /// Optional stored section compression behavior.
    pub compression: CompressionMode,
}

/// Stable portable limit identities reported by encoder failures.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LimitId {
    /// `document.canonical_bytes`.
    DocumentCanonicalBytes,
    /// `document.depth`.
    DocumentDepth,
    /// `object.fields`.
    ObjectFields,
    /// `document.total_fields`.
    DocumentTotalFields,
    /// `field_name.utf8_bytes`.
    FieldNameUtf8Bytes,
    /// `field_name.scalars`.
    FieldNameScalars,
    /// `path.utf8_bytes`.
    PathUtf8Bytes,
    /// `path.segments`.
    PathSegments,
    /// `path.candidates`.
    PathCandidates,
    /// `array.elements`.
    ArrayElements,
    /// `vector.dimension`.
    VectorDimension,
    /// `id.payload_bytes`.
    IdPayloadBytes,
}

impl LimitId {
    /// Returns the normative stable `limits-v1` identifier.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::DocumentCanonicalBytes => "document.canonical_bytes",
            Self::DocumentDepth => "document.depth",
            Self::ObjectFields => "object.fields",
            Self::DocumentTotalFields => "document.total_fields",
            Self::FieldNameUtf8Bytes => "field_name.utf8_bytes",
            Self::FieldNameScalars => "field_name.scalars",
            Self::PathUtf8Bytes => "path.utf8_bytes",
            Self::PathSegments => "path.segments",
            Self::PathCandidates => "path.candidates",
            Self::ArrayElements => "array.elements",
            Self::VectorDimension => "vector.dimension",
            Self::IdPayloadBytes => "id.payload_bytes",
        }
    }
}

/// Safe encoder failure with no raw field name or value in its diagnostic shape.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EncodeError {
    /// The root object has no `_id` field.
    MissingRootId,
    /// The root `_id` uses a logical type outside the accepted primary-ID domain.
    InvalidRootIdType,
    /// A field name is empty or violates the v1 grammar.
    InvalidFieldName,
    /// Two sibling fields have the same exact name.
    DuplicateField,
    /// A client-supplied root field uses reserved engine metadata.
    ProtectedRootField,
    /// A named portable hard limit was exceeded.
    LimitExceeded {
        /// Stable `limits-v1` identifier.
        limit: LimitId,
        /// Inclusive maximum.
        maximum: u64,
        /// Observed value.
        observed: u64,
    },
    /// A timestamp or date is outside the accepted range.
    TemporalRange,
    /// A vector is empty or contains a nonfinite element.
    InvalidVector,
    /// A decimal logical tuple is outside the canonical decimal128 domain.
    InvalidDecimal,
    /// Checked size/count/offset arithmetic could not be represented.
    ArithmeticOverflow,
}

impl EncodeError {
    /// Returns the stable public error-family code for this failure.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::MissingRootId => "VAL_INVALID_SHAPE",
            Self::InvalidRootIdType => "TYPE_MISMATCH",
            Self::InvalidFieldName => "VAL_INVALID_FIELD_NAME",
            Self::DuplicateField => "VAL_DUPLICATE_FIELD",
            Self::ProtectedRootField => "VAL_PROTECTED_FIELD",
            Self::LimitExceeded { .. } => "QUOTA_LIMIT_EXCEEDED",
            Self::TemporalRange => "TYPE_TEMPORAL_RANGE",
            Self::InvalidVector => "TYPE_VECTOR_DIMENSION",
            Self::InvalidDecimal => "PAR_INVALID_TYPED_VALUE",
            Self::ArithmeticOverflow => "TYPE_NUMERIC_OVERFLOW",
        }
    }
}

impl fmt::Display for EncodeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Self::LimitExceeded {
            limit,
            maximum,
            observed,
        } = self
        {
            write!(
                formatter,
                "{}: {} maximum {maximum}, observed {observed}",
                self.code(),
                limit.as_str()
            )
        } else {
            formatter.write_str(self.code())
        }
    }
}

impl Error for EncodeError {}

/// Stable validation stage attached to a rejected `HDoc` artifact.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DecodeCheck {
    /// Fixed header magic and fields.
    Header,
    /// Declared and supplied envelope lengths.
    Length,
    /// Required or optional feature negotiation.
    Feature,
    /// Stored-byte CRC-32C.
    Checksum,
    /// Top-level section directory and stored placement.
    Directory,
    /// Fixed footer fields and header copies.
    Footer,
    /// Derived canonical-logical section placement.
    LogicalLayout,
    /// Compression-stream fixed header.
    CompressionHeader,
    /// Compression block table and range coverage.
    CompressionTable,
    /// One bounded raw or LZ4 block.
    CompressionBlock,
    /// Canonical block, section, and whole-document compression selection.
    CompressionCanonicality,
    /// Field-table records and object spans.
    FieldTable,
    /// Name records, bytes, ordering, grammar, and use counts.
    NamePool,
    /// Container descriptors, dense-array records, and tree ownership.
    ContainerTables,
    /// Canonical value occurrence order and byte coverage.
    ValueArea,
    /// One tag-specific noncontainer payload.
    Payload,
    /// Portable semantic or resource limits in existing bytes.
    Limit,
    /// Required root `_id` semantics and protected metadata.
    RootId,
    /// Canonical typed-content BLAKE3 identity.
    TypedContentHash,
}

impl DecodeCheck {
    /// Returns the stable redacted validation-stage identifier.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Header => "header",
            Self::Length => "length",
            Self::Feature => "feature",
            Self::Checksum => "checksum",
            Self::Directory => "directory",
            Self::Footer => "footer",
            Self::LogicalLayout => "logical-layout",
            Self::CompressionHeader => "compression-header",
            Self::CompressionTable => "compression-table",
            Self::CompressionBlock => "compression-block",
            Self::CompressionCanonicality => "compression-canonicality",
            Self::FieldTable => "field-table",
            Self::NamePool => "name-pool",
            Self::ContainerTables => "container-tables",
            Self::ValueArea => "value-area",
            Self::Payload => "payload",
            Self::Limit => "limit",
            Self::RootId => "root-id",
            Self::TypedContentHash => "typed-content-hash",
        }
    }
}

/// Safe decoder failure with bounded metadata and no field names or values.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DecodeError {
    /// The untyped input does not carry the complete `HDoc` magic.
    FormatUnsupported,
    /// The artifact declares an unsupported format generation.
    UnsupportedVersion {
        /// Declared major generation.
        major: u16,
        /// Declared minor generation.
        minor: u16,
    },
    /// A required feature, section version, codec, or profile is not implemented.
    UnsupportedFeature {
        /// Stage that encountered the unsupported identity.
        check: DecodeCheck,
        /// Bounded numeric feature or profile identity.
        identifier: u64,
    },
    /// Existing bytes violate the known `HDoc` 1.0 grammar.
    Corruption {
        /// Validation stage that rejected the bytes.
        check: DecodeCheck,
        /// Bounded byte offset associated with the check.
        offset: u32,
    },
}

impl DecodeError {
    /// Returns the stable public error-family code for this failure.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::FormatUnsupported | Self::UnsupportedFeature { .. } => "CAP_FORMAT_UNSUPPORTED",
            Self::UnsupportedVersion { .. } => "CAP_UNSUPPORTED_VERSION",
            Self::Corruption { .. } => "DUR_CORRUPTION",
        }
    }

    /// Returns the redacted validation stage when one is available.
    #[must_use]
    pub const fn check(&self) -> Option<DecodeCheck> {
        match self {
            Self::UnsupportedFeature { check, .. } | Self::Corruption { check, .. } => Some(*check),
            Self::FormatUnsupported | Self::UnsupportedVersion { .. } => None,
        }
    }
}

impl fmt::Display for DecodeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::FormatUnsupported => formatter.write_str(self.code()),
            Self::UnsupportedVersion { major, minor } => {
                write!(formatter, "{}: {major}.{minor}", self.code())
            }
            Self::UnsupportedFeature { check, identifier } => {
                write!(
                    formatter,
                    "{}: {} {identifier}",
                    self.code(),
                    check.as_str()
                )
            }
            Self::Corruption { check, offset } => {
                write!(formatter, "{}: {} at {offset}", self.code(), check.as_str())
            }
        }
    }
}

impl Error for DecodeError {}

/// A safe dotted-path validation or traversal failure with no path text in its diagnostic shape.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PathError {
    /// The path is empty or contains an empty segment.
    InvalidSyntax,
    /// One segment violates the v1 field-name grammar.
    InvalidSegment {
        /// Zero-based segment position, without the rejected text.
        segment_index: usize,
    },
    /// A canonical numeric segment cannot denote a permitted dense-array index.
    InvalidArrayIndex {
        /// Zero-based segment position, without the rejected text.
        segment_index: usize,
    },
    /// A named portable path limit was exceeded.
    LimitExceeded {
        /// Stable `limits-v1` identifier.
        limit: LimitId,
        /// Inclusive maximum.
        maximum: u64,
        /// Observed value.
        observed: u64,
    },
}

impl PathError {
    /// Returns the stable public error-family code for this failure.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::InvalidSyntax | Self::InvalidSegment { .. } | Self::InvalidArrayIndex { .. } => {
                "VAL_INVALID_PATH"
            }
            Self::LimitExceeded { .. } => "QUOTA_LIMIT_EXCEEDED",
        }
    }
}

impl fmt::Display for PathError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidSyntax => formatter.write_str(self.code()),
            Self::InvalidSegment { segment_index } | Self::InvalidArrayIndex { segment_index } => {
                write!(formatter, "{}: segment {segment_index}", self.code())
            }
            Self::LimitExceeded {
                limit,
                maximum,
                observed,
            } => write!(
                formatter,
                "{}: {} maximum {maximum}, observed {observed}",
                self.code(),
                limit.as_str()
            ),
        }
    }
}

impl Error for PathError {}

#[derive(Clone, Copy)]
enum ArrayIndexSegment {
    NotNumeric,
    Index(usize),
    Invalid,
}

/// Validated allocation-free v1 dotted path reusable across decoded documents.
#[derive(Clone, Copy)]
pub struct FieldPath<'a> {
    text: &'a str,
    segment_ends: [u16; MAX_PATH_SEGMENTS],
    segment_count: usize,
}

impl<'a> FieldPath<'a> {
    /// Parses and validates canonical UTF-8 path syntax and all context-independent limits.
    ///
    /// Canonical numeric segments that exceed the dense-array index domain remain usable as exact
    /// object names. Traversal reports `InvalidArrayIndex` only if such a segment reaches an array.
    ///
    /// # Errors
    ///
    /// Returns [`PathError`] for empty segments, invalid field grammar, or any portable path/field
    /// limit violation. Diagnostics never retain or print the rejected path text.
    pub fn parse(text: &'a str) -> Result<Self, PathError> {
        if bounded_usize_to_u64(text.len()) > MAX_PATH_BYTES {
            return Err(PathError::LimitExceeded {
                limit: LimitId::PathUtf8Bytes,
                maximum: MAX_PATH_BYTES,
                observed: bounded_usize_to_u64(text.len()),
            });
        }
        if text.is_empty() {
            return Err(PathError::InvalidSyntax);
        }
        let segment_count = text.split('.').count();
        if segment_count > MAX_PATH_SEGMENTS {
            return Err(PathError::LimitExceeded {
                limit: LimitId::PathSegments,
                maximum: bounded_usize_to_u64(MAX_PATH_SEGMENTS),
                observed: bounded_usize_to_u64(segment_count),
            });
        }

        let mut segment_ends = [0_u16; MAX_PATH_SEGMENTS];
        let mut start = 0_usize;
        for (segment_index, segment) in text.split('.').enumerate() {
            if segment.is_empty() {
                return Err(PathError::InvalidSyntax);
            }
            if bounded_usize_to_u64(segment.len()) > MAX_FIELD_NAME_BYTES {
                return Err(PathError::LimitExceeded {
                    limit: LimitId::FieldNameUtf8Bytes,
                    maximum: MAX_FIELD_NAME_BYTES,
                    observed: bounded_usize_to_u64(segment.len()),
                });
            }
            let scalar_count = segment.chars().count();
            if bounded_usize_to_u64(scalar_count) > MAX_FIELD_NAME_SCALARS {
                return Err(PathError::LimitExceeded {
                    limit: LimitId::FieldNameScalars,
                    maximum: MAX_FIELD_NAME_SCALARS,
                    observed: bounded_usize_to_u64(scalar_count),
                });
            }
            if !valid_decoded_field_name(segment) {
                return Err(PathError::InvalidSegment { segment_index });
            }
            let end = start + segment.len();
            segment_ends[segment_index] = bounded_usize_to_u16(end);
            start = end + 1;
        }
        Ok(Self {
            text,
            segment_ends,
            segment_count,
        })
    }

    /// Returns the exact validated path text.
    #[must_use]
    pub const fn as_str(self) -> &'a str {
        self.text
    }

    /// Returns the number of nonempty dotted segments.
    #[must_use]
    pub const fn len(self) -> usize {
        self.segment_count
    }

    /// Reports whether the path contains no segments. Successfully parsed paths are never empty.
    #[must_use]
    pub const fn is_empty(self) -> bool {
        self.segment_count == 0
    }

    /// Returns one exact segment without allocating or normalizing it.
    #[must_use]
    pub fn segment(self, index: usize) -> Option<&'a str> {
        if index >= self.segment_count {
            return None;
        }
        let start = if index == 0 {
            0
        } else {
            usize::from(*self.segment_ends.get(index - 1)?) + 1
        };
        let end = usize::from(*self.segment_ends.get(index)?);
        self.text.get(start..end)
    }

    fn parsed_segment(self, index: usize) -> Option<(&'a str, ArrayIndexSegment)> {
        let segment = self.segment(index)?;
        Some((segment, classify_array_index_segment(segment)))
    }
}

fn classify_array_index_segment(segment: &str) -> ArrayIndexSegment {
    let bytes = segment.as_bytes();
    let canonical = bytes == b"0"
        || bytes
            .first()
            .is_some_and(|first| matches!(first, b'1'..=b'9'))
            && bytes
                .get(1..)
                .is_some_and(|tail| tail.iter().all(u8::is_ascii_digit));
    if !canonical {
        return ArrayIndexSegment::NotNumeric;
    }
    let mut value = 0_usize;
    for digit in bytes {
        let Some(next) = value
            .checked_mul(10)
            .and_then(|current| current.checked_add(usize::from(*digit - b'0')))
        else {
            return ArrayIndexSegment::Invalid;
        };
        value = next;
    }
    if bounded_usize_to_u64(value) >= MAX_ARRAY_ELEMENTS {
        ArrayIndexSegment::Invalid
    } else {
        ArrayIndexSegment::Index(value)
    }
}

/// An owned root document detached from its encoded `HDoc` backing.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnedDocument {
    fields: Vec<OwnedField>,
}

impl OwnedDocument {
    /// Returns root fields in their preserved presentation order.
    #[must_use]
    pub fn fields(&self) -> &[OwnedField] {
        &self.fields
    }

    /// Consumes the document and returns root fields in presentation order.
    #[must_use]
    pub fn into_fields(self) -> Vec<OwnedField> {
        self.fields
    }
}

/// One owned object field with an exact UTF-8 name and typed value.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnedField {
    name: String,
    value: OwnedValue,
}

impl OwnedField {
    /// Returns the exact, non-normalized field name.
    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Returns the exact owned logical value.
    #[must_use]
    pub const fn value(&self) -> &OwnedValue {
        &self.value
    }

    /// Consumes the field without changing its name or value.
    #[must_use]
    pub fn into_parts(self) -> (String, OwnedValue) {
        (self.name, self.value)
    }
}

/// An owned nested object retaining its observable field-presentation order.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnedObject {
    fields: Vec<OwnedField>,
}

impl OwnedObject {
    /// Returns fields in their preserved presentation order.
    #[must_use]
    pub fn fields(&self) -> &[OwnedField] {
        &self.fields
    }

    /// Consumes the object and returns fields in presentation order.
    #[must_use]
    pub fn into_fields(self) -> Vec<OwnedField> {
        self.fields
    }
}

/// Exact detached logical value produced from a completely validated `HDoc`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OwnedValue {
    /// Null.
    Null,
    /// Boolean.
    Bool(bool),
    /// Signed 32-bit integer.
    Int32(i32),
    /// Signed 64-bit integer.
    Int64(i64),
    /// Exact IEEE-754 binary64 bits, including signed zero and NaN payloads.
    Float64Bits(u64),
    /// Canonical decimal128 logical value.
    Decimal128(Decimal128),
    /// Exact UTF-8 string.
    String(String),
    /// Binary subtype and exact uninterpreted bytes.
    Binary {
        /// Registered binary subtype. `HDoc` 1.0 accepts subtype zero.
        subtype: u8,
        /// Exact binary value bytes after the subtype.
        bytes: Vec<u8>,
    },
    /// Nested unique-name object mapping.
    Object(OwnedObject),
    /// Dense ordered array.
    Array(Vec<OwnedValue>),
    /// Signed Unix microseconds.
    Timestamp(i64),
    /// Signed Unix-relative civil days.
    Date(i32),
    /// RFC-order UUID octets.
    Uuid([u8; 16]),
    /// Exact opaque `ObjectId` octets.
    ObjectId([u8; 12]),
    /// Exact finite IEEE-754 binary32 element bits.
    VectorF32(Vec<u32>),
    /// Exact finite IEEE-754 binary16 element bits.
    VectorF16(Vec<u16>),
}

impl OwnedValue {
    /// Returns the stable logical type without converting the payload.
    #[must_use]
    pub const fn value_type(&self) -> ValueType {
        match self {
            Self::Null => ValueType::Null,
            Self::Bool(_) => ValueType::Bool,
            Self::Int32(_) => ValueType::Int32,
            Self::Int64(_) => ValueType::Int64,
            Self::Float64Bits(_) => ValueType::Float64,
            Self::Decimal128(_) => ValueType::Decimal128,
            Self::String(_) => ValueType::String,
            Self::Binary { .. } => ValueType::Binary,
            Self::Object(_) => ValueType::Object,
            Self::Array(_) => ValueType::Array,
            Self::Timestamp(_) => ValueType::Timestamp,
            Self::Date(_) => ValueType::Date,
            Self::Uuid(_) => ValueType::Uuid,
            Self::ObjectId(_) => ValueType::ObjectId,
            Self::VectorF32(_) => ValueType::VectorF32,
            Self::VectorF16(_) => ValueType::VectorF16,
        }
    }
}

/// Borrowed binary subtype and exact bytes from validated logical backing.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BinaryView<'a> {
    subtype: u8,
    bytes: &'a [u8],
}

impl<'a> BinaryView<'a> {
    /// Returns the registered subtype. `HDoc` 1.0 validation admits only zero.
    #[must_use]
    pub const fn subtype(self) -> u8 {
        self.subtype
    }

    /// Returns exact uninterpreted data bytes after the subtype.
    #[must_use]
    pub const fn as_bytes(self) -> &'a [u8] {
        self.bytes
    }

    /// Returns the number of data bytes after the subtype.
    #[must_use]
    pub const fn len(self) -> usize {
        self.bytes.len()
    }

    /// Reports whether the binary data is empty.
    #[must_use]
    pub const fn is_empty(self) -> bool {
        self.bytes.is_empty()
    }
}

/// Allocation-free read-only view over exact binary32 vector element bits.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct VectorF32View<'a> {
    element_bytes: &'a [u8],
}

impl<'a> VectorF32View<'a> {
    /// Returns the validated vector dimension.
    #[must_use]
    pub const fn len(self) -> usize {
        self.element_bytes.len() / 4
    }

    /// Reports whether the vector has no elements. Valid `HDoc` vectors are never empty.
    #[must_use]
    pub const fn is_empty(self) -> bool {
        self.element_bytes.is_empty()
    }

    /// Returns exact bits at one zero-based vector position.
    #[must_use]
    pub fn get(self, index: usize) -> Option<u32> {
        let start = index.checked_mul(4)?;
        let end = start.checked_add(4)?;
        let bytes = <[u8; 4]>::try_from(self.element_bytes.get(start..end)?).ok()?;
        Some(u32::from_le_bytes(bytes))
    }

    /// Iterates exact element bits in vector order.
    #[must_use]
    pub const fn iter(self) -> VectorF32Iter<'a> {
        VectorF32Iter {
            view: self,
            front: 0,
            back: self.len(),
        }
    }
}

/// Exact-size iterator over a borrowed binary32 vector.
#[derive(Clone)]
pub struct VectorF32Iter<'a> {
    view: VectorF32View<'a>,
    front: usize,
    back: usize,
}

impl Iterator for VectorF32Iter<'_> {
    type Item = u32;

    fn next(&mut self) -> Option<Self::Item> {
        if self.front == self.back {
            return None;
        }
        let index = self.front;
        self.front += 1;
        self.view.get(index)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.back - self.front;
        (remaining, Some(remaining))
    }
}

impl DoubleEndedIterator for VectorF32Iter<'_> {
    fn next_back(&mut self) -> Option<Self::Item> {
        if self.front == self.back {
            return None;
        }
        self.back -= 1;
        self.view.get(self.back)
    }
}

impl ExactSizeIterator for VectorF32Iter<'_> {}
impl FusedIterator for VectorF32Iter<'_> {}

/// Allocation-free read-only view over exact binary16 vector element bits.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct VectorF16View<'a> {
    element_bytes: &'a [u8],
}

impl<'a> VectorF16View<'a> {
    /// Returns the validated vector dimension.
    #[must_use]
    pub const fn len(self) -> usize {
        self.element_bytes.len() / 2
    }

    /// Reports whether the vector has no elements. Valid `HDoc` vectors are never empty.
    #[must_use]
    pub const fn is_empty(self) -> bool {
        self.element_bytes.is_empty()
    }

    /// Returns exact bits at one zero-based vector position.
    #[must_use]
    pub fn get(self, index: usize) -> Option<u16> {
        let start = index.checked_mul(2)?;
        let end = start.checked_add(2)?;
        let bytes = <[u8; 2]>::try_from(self.element_bytes.get(start..end)?).ok()?;
        Some(u16::from_le_bytes(bytes))
    }

    /// Iterates exact element bits in vector order.
    #[must_use]
    pub const fn iter(self) -> VectorF16Iter<'a> {
        VectorF16Iter {
            view: self,
            front: 0,
            back: self.len(),
        }
    }
}

/// Exact-size iterator over a borrowed binary16 vector.
#[derive(Clone)]
pub struct VectorF16Iter<'a> {
    view: VectorF16View<'a>,
    front: usize,
    back: usize,
}

impl Iterator for VectorF16Iter<'_> {
    type Item = u16;

    fn next(&mut self) -> Option<Self::Item> {
        if self.front == self.back {
            return None;
        }
        let index = self.front;
        self.front += 1;
        self.view.get(index)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.back - self.front;
        (remaining, Some(remaining))
    }
}

impl DoubleEndedIterator for VectorF16Iter<'_> {
    fn next_back(&mut self) -> Option<Self::Item> {
        if self.front == self.back {
            return None;
        }
        self.back -= 1;
        self.view.get(self.back)
    }
}

impl ExactSizeIterator for VectorF16Iter<'_> {}
impl FusedIterator for VectorF16Iter<'_> {}

#[derive(Clone, Copy)]
struct ViewData<'a> {
    sections: [&'a [u8]; 4],
    logical_offsets: [u32; 4],
    names: &'a [NameRecord],
    fields: &'a [FieldRecord],
    arrays: &'a [ValueReference],
    containers: &'a [ContainerRecord],
    presentation_fields: &'a [usize],
}

/// Read-only root-document view over completely validated logical `HDoc` backing.
#[derive(Clone, Copy)]
pub struct DocumentView<'a> {
    data: ViewData<'a>,
}

impl<'a> DocumentView<'a> {
    /// Returns the root object view.
    #[must_use]
    pub const fn root(self) -> ObjectView<'a> {
        ObjectView {
            data: self.data,
            container_id: 0,
        }
    }

    /// Returns the number of immediate root fields.
    #[must_use]
    pub fn len(self) -> usize {
        self.root().len()
    }

    /// Reports whether the root object has no fields. Accepted stored documents are never empty.
    #[must_use]
    pub fn is_empty(self) -> bool {
        self.root().is_empty()
    }

    /// Returns one root field by presentation position.
    #[must_use]
    pub fn field_at(self, presentation_index: usize) -> Option<FieldView<'a>> {
        self.root().field_at(presentation_index)
    }

    /// Returns one root field by exact, non-normalized UTF-8 name.
    ///
    /// Lookup performs binary search over the validated raw name table and the root's sorted field
    /// span without allocating.
    #[must_use]
    pub fn get_field(self, name: &str) -> Option<FieldView<'a>> {
        self.root().get_field(name)
    }

    /// Returns one root value by exact, non-normalized UTF-8 name.
    #[must_use]
    pub fn get(self, name: &str) -> Option<ValueView<'a>> {
        self.root().get(name)
    }

    /// Resolves one prevalidated dotted path to ordered borrowed candidates and array provenance.
    ///
    /// # Errors
    ///
    /// Returns [`PathError`] if an oversized numeric segment reaches an array or if complete
    /// preflight exceeds the candidate limit.
    pub fn lookup_path<'p>(self, path: FieldPath<'p>) -> Result<PathCandidates<'a, 'p>, PathError> {
        self.root().lookup_path(path)
    }

    /// Parses and resolves dotted path text without heap allocation.
    ///
    /// # Errors
    ///
    /// Returns [`PathError`] for invalid syntax/limits, an invalid contextual array index, or a
    /// complete traversal that exceeds the candidate limit.
    pub fn lookup_path_text<'p>(self, path: &'p str) -> Result<PathCandidates<'a, 'p>, PathError> {
        self.lookup_path(FieldPath::parse(path)?)
    }

    /// Iterates root fields in preserved presentation order.
    #[must_use]
    pub fn fields(self) -> ObjectFields<'a> {
        self.root().fields()
    }

    /// Detaches a complete owned logical document from the `HDoc` backing.
    #[must_use]
    pub fn to_owned_document(self) -> OwnedDocument {
        OwnedDocument {
            fields: self.fields().map(FieldView::to_owned_field).collect(),
        }
    }
}

/// Read-only view over one validated object container.
#[derive(Clone, Copy)]
pub struct ObjectView<'a> {
    data: ViewData<'a>,
    container_id: usize,
}

impl<'a> ObjectView<'a> {
    /// Returns the number of immediate object fields.
    #[must_use]
    pub fn len(self) -> usize {
        self.data
            .containers
            .get(self.container_id)
            .map_or(0, |container| container.item_count)
    }

    /// Reports whether the object has no fields.
    #[must_use]
    pub fn is_empty(self) -> bool {
        self.len() == 0
    }

    /// Returns the recursive object-field count rooted at this container.
    #[must_use]
    pub fn recursive_field_count(self) -> u32 {
        self.data
            .containers
            .get(self.container_id)
            .map_or(0, |container| container.recursive_fields)
    }

    /// Returns one field by preserved presentation position.
    ///
    /// This positional access remains an O(1) read over validation-built presentation metadata;
    /// exact-name access is separately available through [`Self::get_field`].
    #[must_use]
    pub fn field_at(self, presentation_index: usize) -> Option<FieldView<'a>> {
        let container = self.data.containers.get(self.container_id)?;
        if container.tag != ValueType::Object.hdoc_tag()
            || presentation_index >= container.item_count
        {
            return None;
        }
        let order_index = container.item_start.checked_add(presentation_index)?;
        let field_index = *self.data.presentation_fields.get(order_index)?;
        field_view(self.data, field_index)
    }

    /// Returns one field by exact, non-normalized UTF-8 name using two bounded binary searches.
    #[must_use]
    pub fn get_field(self, name: &str) -> Option<FieldView<'a>> {
        let container = self.data.containers.get(self.container_id)?;
        if container.tag != ValueType::Object.hdoc_tag() {
            return None;
        }
        let field_id = lookup_name_id(self.data, name)?;
        let field_index = lookup_object_field_index(self.data, container, field_id)?;
        field_view(self.data, field_index)
    }

    /// Returns one exact field value, preserving explicit null as `ValueView::Null` and absence as
    /// `None`.
    #[must_use]
    pub fn get(self, name: &str) -> Option<ValueView<'a>> {
        self.get_field(name).map(FieldView::value)
    }

    /// Resolves one prevalidated dotted path from this object.
    ///
    /// # Errors
    ///
    /// Returns [`PathError`] if an oversized numeric segment reaches an array or if complete
    /// preflight exceeds the candidate limit.
    pub fn lookup_path<'p>(self, path: FieldPath<'p>) -> Result<PathCandidates<'a, 'p>, PathError> {
        PathCandidates::new(self, path)
    }

    /// Parses and resolves dotted path text from this object without heap allocation.
    ///
    /// # Errors
    ///
    /// Returns [`PathError`] for invalid syntax/limits, an invalid contextual array index, or a
    /// complete traversal that exceeds the candidate limit.
    pub fn lookup_path_text<'p>(self, path: &'p str) -> Result<PathCandidates<'a, 'p>, PathError> {
        self.lookup_path(FieldPath::parse(path)?)
    }

    /// Iterates fields in preserved presentation order.
    #[must_use]
    pub fn fields(self) -> ObjectFields<'a> {
        ObjectFields {
            object: self,
            front: 0,
            back: self.len(),
        }
    }

    /// Detaches an owned object with the same mapping and presentation sequence.
    #[must_use]
    pub fn to_owned_object(self) -> OwnedObject {
        OwnedObject {
            fields: self.fields().map(FieldView::to_owned_field).collect(),
        }
    }
}

/// One borrowed field yielded in its owning object's presentation order.
#[derive(Clone, Copy)]
pub struct FieldView<'a> {
    name: &'a str,
    value: ValueView<'a>,
    presentation_ordinal: u32,
}

impl<'a> FieldView<'a> {
    /// Returns the exact non-normalized UTF-8 field name.
    #[must_use]
    pub const fn name(self) -> &'a str {
        self.name
    }

    /// Returns the exact read-only logical value.
    #[must_use]
    pub const fn value(self) -> ValueView<'a> {
        self.value
    }

    /// Returns the validated zero-based presentation ordinal.
    #[must_use]
    pub const fn presentation_ordinal(self) -> u32 {
        self.presentation_ordinal
    }

    /// Detaches this field and its complete recursive value.
    #[must_use]
    pub fn to_owned_field(self) -> OwnedField {
        OwnedField {
            name: self.name.to_owned(),
            value: self.value.to_owned_value(),
        }
    }
}

/// Exact-size double-ended iterator over object fields in presentation order.
#[derive(Clone)]
pub struct ObjectFields<'a> {
    object: ObjectView<'a>,
    front: usize,
    back: usize,
}

impl<'a> Iterator for ObjectFields<'a> {
    type Item = FieldView<'a>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.front == self.back {
            return None;
        }
        let index = self.front;
        self.front += 1;
        self.object.field_at(index)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.back - self.front;
        (remaining, Some(remaining))
    }
}

impl DoubleEndedIterator for ObjectFields<'_> {
    fn next_back(&mut self) -> Option<Self::Item> {
        if self.front == self.back {
            return None;
        }
        self.back -= 1;
        self.object.field_at(self.back)
    }
}

impl ExactSizeIterator for ObjectFields<'_> {}
impl FusedIterator for ObjectFields<'_> {}

/// Read-only view over one validated dense array container.
#[derive(Clone, Copy)]
pub struct ArrayView<'a> {
    data: ViewData<'a>,
    container_id: usize,
}

impl<'a> ArrayView<'a> {
    /// Returns the number of immediate dense elements.
    #[must_use]
    pub fn len(self) -> usize {
        self.data
            .containers
            .get(self.container_id)
            .map_or(0, |container| container.item_count)
    }

    /// Reports whether the array has no elements.
    #[must_use]
    pub fn is_empty(self) -> bool {
        self.len() == 0
    }

    /// Returns one direct zero-based array element.
    #[must_use]
    pub fn get(self, index: usize) -> Option<ValueView<'a>> {
        let container = self.data.containers.get(self.container_id)?;
        if container.tag != ValueType::Array.hdoc_tag() || index >= container.item_count {
            return None;
        }
        let reference = *self.arrays().get(index)?;
        value_view(self.data, reference)
    }

    /// Iterates dense elements in semantic index order.
    #[must_use]
    pub fn elements(self) -> ArrayElements<'a> {
        ArrayElements {
            array: self,
            front: 0,
            back: self.len(),
        }
    }

    fn arrays(self) -> &'a [ValueReference] {
        let Some(container) = self.data.containers.get(self.container_id) else {
            return &[];
        };
        let end = container.item_start.saturating_add(container.item_count);
        self.data
            .arrays
            .get(container.item_start..end)
            .unwrap_or_default()
    }
}

/// Exact-size double-ended iterator over a dense borrowed array.
#[derive(Clone)]
pub struct ArrayElements<'a> {
    array: ArrayView<'a>,
    front: usize,
    back: usize,
}

impl<'a> Iterator for ArrayElements<'a> {
    type Item = ValueView<'a>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.front == self.back {
            return None;
        }
        let index = self.front;
        self.front += 1;
        self.array.get(index)
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.back - self.front;
        (remaining, Some(remaining))
    }
}

impl DoubleEndedIterator for ArrayElements<'_> {
    fn next_back(&mut self) -> Option<Self::Item> {
        if self.front == self.back {
            return None;
        }
        self.back -= 1;
        self.array.get(self.back)
    }
}

impl ExactSizeIterator for ArrayElements<'_> {}
impl FusedIterator for ArrayElements<'_> {}

/// Exact borrowed logical value exposed only after complete `HDoc` validation.
#[derive(Clone, Copy)]
pub enum ValueView<'a> {
    /// Null.
    Null,
    /// Boolean.
    Bool(bool),
    /// Signed 32-bit integer.
    Int32(i32),
    /// Signed 64-bit integer.
    Int64(i64),
    /// Exact IEEE-754 binary64 bits.
    Float64Bits(u64),
    /// Canonical decimal128 logical value.
    Decimal128(Decimal128),
    /// Exact validated UTF-8 string.
    String(&'a str),
    /// Binary subtype and exact data bytes.
    Binary(BinaryView<'a>),
    /// Nested object.
    Object(ObjectView<'a>),
    /// Dense array.
    Array(ArrayView<'a>),
    /// Signed Unix microseconds.
    Timestamp(i64),
    /// Signed Unix-relative civil days.
    Date(i32),
    /// RFC-order UUID octets.
    Uuid([u8; 16]),
    /// Exact opaque `ObjectId` octets.
    ObjectId([u8; 12]),
    /// Exact finite binary32 vector element bits.
    VectorF32(VectorF32View<'a>),
    /// Exact finite binary16 vector element bits.
    VectorF16(VectorF16View<'a>),
}

impl ValueView<'_> {
    /// Returns the stable logical type without converting the payload.
    #[must_use]
    pub const fn value_type(self) -> ValueType {
        match self {
            Self::Null => ValueType::Null,
            Self::Bool(_) => ValueType::Bool,
            Self::Int32(_) => ValueType::Int32,
            Self::Int64(_) => ValueType::Int64,
            Self::Float64Bits(_) => ValueType::Float64,
            Self::Decimal128(_) => ValueType::Decimal128,
            Self::String(_) => ValueType::String,
            Self::Binary(_) => ValueType::Binary,
            Self::Object(_) => ValueType::Object,
            Self::Array(_) => ValueType::Array,
            Self::Timestamp(_) => ValueType::Timestamp,
            Self::Date(_) => ValueType::Date,
            Self::Uuid(_) => ValueType::Uuid,
            Self::ObjectId(_) => ValueType::ObjectId,
            Self::VectorF32(_) => ValueType::VectorF32,
            Self::VectorF16(_) => ValueType::VectorF16,
        }
    }

    /// Detaches this value recursively while preserving exact type and presentation semantics.
    #[must_use]
    pub fn to_owned_value(self) -> OwnedValue {
        match self {
            Self::Null => OwnedValue::Null,
            Self::Bool(value) => OwnedValue::Bool(value),
            Self::Int32(value) => OwnedValue::Int32(value),
            Self::Int64(value) => OwnedValue::Int64(value),
            Self::Float64Bits(value) => OwnedValue::Float64Bits(value),
            Self::Decimal128(value) => OwnedValue::Decimal128(value),
            Self::String(value) => OwnedValue::String(value.to_owned()),
            Self::Binary(value) => OwnedValue::Binary {
                subtype: value.subtype(),
                bytes: value.as_bytes().to_vec(),
            },
            Self::Object(value) => OwnedValue::Object(value.to_owned_object()),
            Self::Array(value) => {
                OwnedValue::Array(value.elements().map(Self::to_owned_value).collect())
            }
            Self::Timestamp(value) => OwnedValue::Timestamp(value),
            Self::Date(value) => OwnedValue::Date(value),
            Self::Uuid(value) => OwnedValue::Uuid(value),
            Self::ObjectId(value) => OwnedValue::ObjectId(value),
            Self::VectorF32(value) => OwnedValue::VectorF32(value.iter().collect()),
            Self::VectorF16(value) => OwnedValue::VectorF16(value.iter().collect()),
        }
    }
}

/// One borrowed dotted-path result with the ordered array indices crossed to reach it.
#[derive(Clone, Copy)]
pub struct PathCandidate<'a> {
    value: ValueView<'a>,
    array_positions: [u32; MAX_PATH_SEGMENTS],
    array_position_count: usize,
}

impl<'a> PathCandidate<'a> {
    /// Returns the exact present value. Explicit null remains [`ValueView::Null`].
    #[must_use]
    pub const fn value(self) -> ValueView<'a> {
        self.value
    }

    /// Returns every explicit-index or fan-out array position crossed in traversal order.
    #[must_use]
    pub fn array_positions(&self) -> &[u32] {
        &self.array_positions[..self.array_position_count]
    }
}

#[derive(Clone, Copy)]
struct FanoutFrame {
    container_id: usize,
    next_index: usize,
    segment_index: usize,
    provenance_prefix: usize,
}

const EMPTY_FANOUT_FRAME: FanoutFrame = FanoutFrame {
    container_id: 0,
    next_index: 0,
    segment_index: 0,
    provenance_prefix: 0,
};

#[derive(Clone)]
struct PathWalker<'data, 'path> {
    data: ViewData<'data>,
    path: FieldPath<'path>,
    current: Option<(ValueView<'data>, usize)>,
    fanouts: [FanoutFrame; MAX_PATH_SEGMENTS],
    fanout_count: usize,
    array_positions: [u32; MAX_PATH_SEGMENTS],
    array_position_count: usize,
}

impl<'data, 'path> PathWalker<'data, 'path> {
    fn new(root: ObjectView<'data>, path: FieldPath<'path>) -> Self {
        Self {
            data: root.data,
            path,
            current: Some((ValueView::Object(root), 0)),
            fanouts: [EMPTY_FANOUT_FRAME; MAX_PATH_SEGMENTS],
            fanout_count: 0,
            array_positions: [0; MAX_PATH_SEGMENTS],
            array_position_count: 0,
        }
    }

    fn advance(&mut self) -> Result<Option<PathCandidate<'data>>, PathError> {
        loop {
            if let Some((value, segment_index)) = self.current.take() {
                if segment_index == self.path.len() {
                    return Ok(Some(PathCandidate {
                        value,
                        array_positions: self.array_positions,
                        array_position_count: self.array_position_count,
                    }));
                }
                let (segment, array_index) = self
                    .path
                    .parsed_segment(segment_index)
                    .unwrap_or(("", ArrayIndexSegment::NotNumeric));
                match value {
                    ValueView::Object(object) => {
                        self.current = object.get(segment).map(|child| (child, segment_index + 1));
                    }
                    ValueView::Array(array) => match array_index {
                        ArrayIndexSegment::Index(index) => {
                            if let Some(child) = array.get(index) {
                                self.push_array_position(index);
                                self.current = Some((child, segment_index + 1));
                            }
                        }
                        ArrayIndexSegment::NotNumeric => {
                            self.push_fanout(array, segment_index);
                        }
                        ArrayIndexSegment::Invalid => {
                            return Err(PathError::InvalidArrayIndex { segment_index });
                        }
                    },
                    ValueView::Null
                    | ValueView::Bool(_)
                    | ValueView::Int32(_)
                    | ValueView::Int64(_)
                    | ValueView::Float64Bits(_)
                    | ValueView::Decimal128(_)
                    | ValueView::String(_)
                    | ValueView::Binary(_)
                    | ValueView::Timestamp(_)
                    | ValueView::Date(_)
                    | ValueView::Uuid(_)
                    | ValueView::ObjectId(_)
                    | ValueView::VectorF32(_)
                    | ValueView::VectorF16(_) => {}
                }
            } else if !self.resume_fanout() {
                return Ok(None);
            }
        }
    }

    fn push_fanout(&mut self, array: ArrayView<'data>, segment_index: usize) {
        debug_assert!(self.fanout_count < MAX_PATH_SEGMENTS);
        self.fanouts[self.fanout_count] = FanoutFrame {
            container_id: array.container_id,
            next_index: 0,
            segment_index,
            provenance_prefix: self.array_position_count,
        };
        self.fanout_count += 1;
    }

    fn resume_fanout(&mut self) -> bool {
        while self.fanout_count != 0 {
            let frame_index = self.fanout_count - 1;
            let mut selected = None;
            let provenance_prefix;
            {
                let frame = &mut self.fanouts[frame_index];
                provenance_prefix = frame.provenance_prefix;
                let array = ArrayView {
                    data: self.data,
                    container_id: frame.container_id,
                };
                while frame.next_index < array.len() {
                    let index = frame.next_index;
                    frame.next_index += 1;
                    if let Some(ValueView::Object(object)) = array.get(index) {
                        selected = Some((object, index, frame.segment_index));
                        break;
                    }
                }
            }
            self.array_position_count = provenance_prefix;
            if let Some((object, index, segment_index)) = selected {
                self.push_array_position(index);
                self.current = Some((ValueView::Object(object), segment_index));
                return true;
            }
            self.fanout_count -= 1;
        }
        false
    }

    fn push_array_position(&mut self, index: usize) {
        debug_assert!(self.array_position_count < MAX_PATH_SEGMENTS);
        self.array_positions[self.array_position_count] = bounded_usize_to_u32(index);
        self.array_position_count += 1;
    }
}

/// Exact-size allocation-free iterator over ordered dotted-path candidates.
///
/// Construction audits the full traversal first, so syntax, numeric-index, and candidate-limit
/// failures are returned before a caller can observe a partial candidate sequence.
#[derive(Clone)]
pub struct PathCandidates<'data, 'path> {
    walker: PathWalker<'data, 'path>,
    remaining: usize,
}

impl<'data, 'path> PathCandidates<'data, 'path> {
    fn new(root: ObjectView<'data>, path: FieldPath<'path>) -> Result<Self, PathError> {
        let walker = PathWalker::new(root, path);
        let mut audit = walker.clone();
        let mut candidate_count = 0_u64;
        while audit.advance()?.is_some() {
            candidate_count += 1;
            enforce_path_candidate_limit(candidate_count)?;
        }
        Ok(Self {
            walker,
            remaining: bounded_u64_to_usize(candidate_count),
        })
    }
}

impl<'data> Iterator for PathCandidates<'data, '_> {
    type Item = PathCandidate<'data>;

    fn next(&mut self) -> Option<Self::Item> {
        let candidate = self.walker.advance().unwrap_or_default();
        if candidate.is_some() {
            self.remaining -= 1;
        } else {
            self.remaining = 0;
        }
        candidate
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        (self.remaining, Some(self.remaining))
    }
}

impl ExactSizeIterator for PathCandidates<'_, '_> {}
impl FusedIterator for PathCandidates<'_, '_> {}

fn enforce_path_candidate_limit(observed: u64) -> Result<(), PathError> {
    if observed > MAX_PATH_CANDIDATES {
        Err(PathError::LimitExceeded {
            limit: LimitId::PathCandidates,
            maximum: MAX_PATH_CANDIDATES,
            observed,
        })
    } else {
        Ok(())
    }
}

/// A completely validated `HDoc` envelope retaining safe logical view backing.
#[derive(Clone, Eq, PartialEq)]
pub struct DecodedHDoc<'a> {
    bytes: &'a [u8],
    logical_sections: [Cow<'a, [u8]>; 4],
    logical_offsets: [u32; 4],
    names: Vec<NameRecord>,
    fields: Vec<FieldRecord>,
    arrays: Vec<ValueReference>,
    containers: Vec<ContainerRecord>,
    presentation_fields: Vec<usize>,
    content_hash: [u8; 32],
    canonical_length: u32,
    field_count: u32,
    compressed_sections: u8,
}

impl fmt::Debug for DecodedHDoc<'_> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("DecodedHDoc")
            .field("stored_length", &self.bytes.len())
            .field("canonical_length", &self.canonical_length)
            .field("field_count", &self.field_count)
            .field("compressed_sections", &self.compressed_sections)
            .finish_non_exhaustive()
    }
}

impl<'a> DecodedHDoc<'a> {
    /// Returns the exact validated CRC-covered stored bytes.
    #[must_use]
    pub const fn as_bytes(&self) -> &'a [u8] {
        self.bytes
    }

    /// Returns the canonical typed logical-tree BLAKE3-256 identity.
    #[must_use]
    pub const fn content_hash(&self) -> &[u8; 32] {
        &self.content_hash
    }

    /// Returns the complete uncompressed canonical `HDoc` length.
    #[must_use]
    pub const fn canonical_length(&self) -> u32 {
        self.canonical_length
    }

    /// Returns the total recursive object-field count.
    #[must_use]
    pub const fn field_count(&self) -> u32 {
        self.field_count
    }

    /// Returns the number of base sections stored with compression profile 1/1.
    #[must_use]
    pub const fn compressed_section_count(&self) -> u8 {
        self.compressed_sections
    }

    /// Returns a read-only root-document view borrowing this validated backing.
    #[must_use]
    pub fn view(&self) -> DocumentView<'_> {
        DocumentView {
            data: ViewData {
                sections: self.logical_sections.each_ref().map(AsRef::as_ref),
                logical_offsets: self.logical_offsets,
                names: &self.names,
                fields: &self.fields,
                arrays: &self.arrays,
                containers: &self.containers,
                presentation_fields: &self.presentation_fields,
            },
        }
    }

    /// Detaches a complete owned logical tree from the encoded and decoded backing.
    #[must_use]
    pub fn to_owned_document(&self) -> OwnedDocument {
        self.view().to_owned_document()
    }
}

/// Fully staged `HDoc` bytes and their logical identity.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EncodedHDoc {
    bytes: Vec<u8>,
    content_hash: [u8; 32],
    canonical_length: u32,
    compressed_sections: u8,
}

impl EncodedHDoc {
    /// Returns the exact CRC-covered `HDoc` slice.
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes
    }

    /// Consumes the wrapper and returns the exact `HDoc` bytes.
    #[must_use]
    pub fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }

    /// Returns the canonical typed logical-tree BLAKE3-256 identity.
    #[must_use]
    pub const fn content_hash(&self) -> &[u8; 32] {
        &self.content_hash
    }

    /// Returns the complete uncompressed canonical `HDoc` length.
    #[must_use]
    pub const fn canonical_length(&self) -> u32 {
        self.canonical_length
    }

    /// Returns the number of base sections stored with compression profile 1/1.
    #[must_use]
    pub const fn compressed_section_count(&self) -> u8 {
        self.compressed_sections
    }
}

/// Encodes with the default canonical-compression profile selection.
///
/// # Errors
///
/// Returns a typed, redacted [`EncodeError`] when the logical tree, a portable limit, checked
/// arithmetic, or the pinned compression implementation fails validation.
pub fn encode(document: EncodeDocument<'_>) -> Result<EncodedHDoc, EncodeError> {
    encode_with_options(document, EncodeOptions::default())
}

/// Validates and encodes one `HDoc` 1.0 document with explicit writer options.
///
/// # Errors
///
/// Returns a typed, redacted [`EncodeError`] when the logical tree, a portable limit, checked
/// arithmetic, or the selected writer profile fails validation.
pub fn encode_with_options(
    document: EncodeDocument<'_>,
    options: EncodeOptions,
) -> Result<EncodedHDoc, EncodeError> {
    let statistics = validate_document(document)?;
    let mut staged = stage_containers(document)?;
    compute_recursive_field_counts(&mut staged)?;
    let names = collect_names(&staged, statistics.total_fields)?;
    let layout = measure_layout(&staged, &names, statistics)?;
    let (name_pool, name_infos) = build_name_pool(&names, layout.name_offset);
    let value_area = build_value_area(&staged, layout.value_offset, layout.value_length)?;
    let (field_table, array_entries) = build_reference_tables(&staged, &name_infos, layout)?;
    let container_tables = build_container_tables(&staged, &array_entries, layout);
    let content_hash = hash_document(&staged)?;
    let logical_sections = [field_table, name_pool, value_area, container_tables];
    let item_counts = [
        statistics.total_fields,
        usize_to_u32(names.len())?,
        statistics.noncontainer_values,
        usize_to_u32(staged.len())?,
    ];
    assemble_document(
        &logical_sections,
        item_counts,
        statistics.total_fields,
        content_hash,
        layout.canonical_length,
        options.compression,
    )
}

#[derive(Clone, Copy)]
enum ContainerInput<'a> {
    Object(&'a [EncodeField<'a>]),
    Array(&'a [EncodeValue<'a>]),
}

#[derive(Clone, Copy)]
struct ValidationStatistics {
    total_fields: u32,
    array_entries: u32,
    noncontainer_values: u32,
}

#[derive(Clone, Copy)]
struct ValidationFrame<'a> {
    input: ContainerInput<'a>,
    depth: u64,
    root: bool,
}

fn validate_document(document: EncodeDocument<'_>) -> Result<ValidationStatistics, EncodeError> {
    let mut frames = vec![ValidationFrame {
        input: ContainerInput::Object(document.fields),
        depth: 1,
        root: true,
    }];
    let mut fields = 0_u64;
    let mut arrays = 0_u64;
    let mut containers = 1_u64;
    let mut noncontainers = 0_u64;

    while let Some(frame) = frames.pop() {
        enforce_limit(LimitId::DocumentDepth, MAX_DEPTH, frame.depth)?;
        match frame.input {
            ContainerInput::Object(object_fields) => {
                enforce_limit(
                    LimitId::ObjectFields,
                    MAX_OBJECT_FIELDS,
                    usize_to_u64(object_fields.len())?,
                )?;
                fields = checked_add(fields, usize_to_u64(object_fields.len())?)?;
                enforce_limit(LimitId::DocumentTotalFields, MAX_DOCUMENT_FIELDS, fields)?;
                let mut names = BTreeSet::new();
                let mut root_id = false;
                for field in object_fields {
                    validate_field_name(field.name)?;
                    if !names.insert(field.name) {
                        return Err(EncodeError::DuplicateField);
                    }
                    if frame.root && matches!(field.name, "_v" | "_ts") {
                        return Err(EncodeError::ProtectedRootField);
                    }
                    if frame.root && field.name == "_id" {
                        validate_root_id(field.value)?;
                        root_id = true;
                    }
                    validate_value(
                        field.value,
                        frame.depth,
                        &mut frames,
                        &mut containers,
                        &mut noncontainers,
                    )?;
                    enforce_minimum_size(fields, arrays, containers)?;
                }
                if frame.root && !root_id {
                    return Err(EncodeError::MissingRootId);
                }
            }
            ContainerInput::Array(values) => {
                let count = usize_to_u64(values.len())?;
                enforce_limit(LimitId::ArrayElements, MAX_ARRAY_ELEMENTS, count)?;
                arrays = checked_add(arrays, count)?;
                for value in values {
                    validate_value(
                        *value,
                        frame.depth,
                        &mut frames,
                        &mut containers,
                        &mut noncontainers,
                    )?;
                    enforce_minimum_size(fields, arrays, containers)?;
                }
            }
        }
    }

    Ok(ValidationStatistics {
        total_fields: u64_to_u32(fields)?,
        array_entries: u64_to_u32(arrays)?,
        noncontainer_values: u64_to_u32(noncontainers)?,
    })
}

fn validate_value<'a>(
    value: EncodeValue<'a>,
    parent_depth: u64,
    frames: &mut Vec<ValidationFrame<'a>>,
    containers: &mut u64,
    noncontainers: &mut u64,
) -> Result<(), EncodeError> {
    match value {
        EncodeValue::Object(object) => {
            *containers = checked_add(*containers, 1)?;
            frames.push(ValidationFrame {
                input: ContainerInput::Object(object.fields),
                depth: checked_add(parent_depth, 1)?,
                root: false,
            });
        }
        EncodeValue::Array(values) => {
            *containers = checked_add(*containers, 1)?;
            frames.push(ValidationFrame {
                input: ContainerInput::Array(values),
                depth: checked_add(parent_depth, 1)?,
                root: false,
            });
        }
        EncodeValue::Timestamp(value) if !(TIMESTAMP_MIN..=TIMESTAMP_MAX).contains(&value) => {
            return Err(EncodeError::TemporalRange);
        }
        EncodeValue::Date(value) if !(DATE_MIN..=DATE_MAX).contains(&value) => {
            return Err(EncodeError::TemporalRange);
        }
        EncodeValue::VectorF32(values) => validate_vector_f32(values)?,
        EncodeValue::VectorF16(values) => validate_vector_f16(values)?,
        EncodeValue::Decimal128(value) => {
            decimal_bytes(value)?;
        }
        _ => {}
    }
    if !matches!(value, EncodeValue::Object(_) | EncodeValue::Array(_)) {
        *noncontainers = checked_add(*noncontainers, 1)?;
    }
    Ok(())
}

fn validate_field_name(name: &str) -> Result<(), EncodeError> {
    let bytes = usize_to_u64(name.len())?;
    enforce_limit(LimitId::FieldNameUtf8Bytes, MAX_FIELD_NAME_BYTES, bytes)?;
    let scalars = usize_to_u64(name.chars().count())?;
    enforce_limit(LimitId::FieldNameScalars, MAX_FIELD_NAME_SCALARS, scalars)?;
    if name.is_empty()
        || name.starts_with('$')
        || name.contains('.')
        || name
            .chars()
            .any(|character| matches!(character, '\0'..='\u{1f}' | '\u{7f}'))
    {
        return Err(EncodeError::InvalidFieldName);
    }
    Ok(())
}

fn validate_root_id(value: EncodeValue<'_>) -> Result<(), EncodeError> {
    match value {
        EncodeValue::Int32(_)
        | EncodeValue::Int64(_)
        | EncodeValue::Uuid(_)
        | EncodeValue::ObjectId(_) => Ok(()),
        EncodeValue::String(value) => enforce_limit(
            LimitId::IdPayloadBytes,
            MAX_ID_PAYLOAD_BYTES,
            usize_to_u64(value.len())?,
        ),
        EncodeValue::Binary(value) => enforce_limit(
            LimitId::IdPayloadBytes,
            MAX_ID_PAYLOAD_BYTES,
            usize_to_u64(value.len())?,
        ),
        _ => Err(EncodeError::InvalidRootIdType),
    }
}

fn validate_vector_f32(values: &[u32]) -> Result<(), EncodeError> {
    validate_vector_length(values.len())?;
    if values.iter().any(|bits| (bits >> 23) & 0xff == 0xff) {
        return Err(EncodeError::InvalidVector);
    }
    Ok(())
}

fn validate_vector_f16(values: &[u16]) -> Result<(), EncodeError> {
    validate_vector_length(values.len())?;
    if values.iter().any(|bits| (bits >> 10) & 0x1f == 0x1f) {
        return Err(EncodeError::InvalidVector);
    }
    Ok(())
}

fn validate_vector_length(length: usize) -> Result<(), EncodeError> {
    if length == 0 {
        return Err(EncodeError::InvalidVector);
    }
    enforce_limit(
        LimitId::VectorDimension,
        MAX_VECTOR_DIMENSION,
        usize_to_u64(length)?,
    )
}

fn enforce_minimum_size(fields: u64, arrays: u64, containers: u64) -> Result<(), EncodeError> {
    let field_bytes = checked_mul(fields, FIELD_ENTRY_BYTES)?;
    let array_bytes = checked_mul(arrays, ARRAY_ENTRY_BYTES)?;
    let container_bytes = checked_mul(containers, CONTAINER_DESCRIPTOR_BYTES)?;
    let minimum = checked_add(
        checked_add(BASE_HEADER_BYTES + FOOTER_BYTES, field_bytes)?,
        checked_add(array_bytes, container_bytes)?,
    )?;
    enforce_limit(
        LimitId::DocumentCanonicalBytes,
        MAX_CANONICAL_BYTES,
        minimum,
    )
}

fn enforce_limit(limit: LimitId, maximum: u64, observed: u64) -> Result<(), EncodeError> {
    if observed > maximum {
        return Err(EncodeError::LimitExceeded {
            limit,
            maximum,
            observed,
        });
    }
    Ok(())
}

struct ContainerStage<'a> {
    input: ContainerInput<'a>,
    order: Vec<usize>,
    children: Vec<(usize, u32)>,
    depth: u16,
    parent_id: u32,
    parent_slot: u32,
    recursive_fields: u32,
}

fn stage_containers(document: EncodeDocument<'_>) -> Result<Vec<ContainerStage<'_>>, EncodeError> {
    let mut stages = vec![ContainerStage {
        input: ContainerInput::Object(document.fields),
        order: Vec::new(),
        children: Vec::new(),
        depth: 1,
        parent_id: ROOT_SENTINEL,
        parent_slot: ROOT_SENTINEL,
        recursive_fields: 0,
    }];
    let mut index = 0_usize;
    while index < stages.len() {
        let input = stages[index].input;
        let depth = stages[index].depth;
        let mut order = match input {
            ContainerInput::Object(fields) => (0..fields.len()).collect::<Vec<_>>(),
            ContainerInput::Array(_) => Vec::new(),
        };
        if let ContainerInput::Object(fields) = input {
            order.sort_unstable_by(|left, right| {
                fields[*left]
                    .name
                    .as_bytes()
                    .cmp(fields[*right].name.as_bytes())
            });
        }
        let slot_count = match input {
            ContainerInput::Object(_) => order.len(),
            ContainerInput::Array(values) => values.len(),
        };
        let mut children = Vec::new();
        for slot in 0..slot_count {
            let value = value_at(input, &order, slot);
            let child_input = match value {
                EncodeValue::Object(object) => Some(ContainerInput::Object(object.fields)),
                EncodeValue::Array(values) => Some(ContainerInput::Array(values)),
                _ => None,
            };
            if let Some(child_input) = child_input {
                let child_id = usize_to_u32(stages.len())?;
                children.push((slot, child_id));
                stages.push(ContainerStage {
                    input: child_input,
                    order: Vec::new(),
                    children: Vec::new(),
                    depth: depth
                        .checked_add(1)
                        .ok_or(EncodeError::ArithmeticOverflow)?,
                    parent_id: usize_to_u32(index)?,
                    parent_slot: usize_to_u32(slot)?,
                    recursive_fields: 0,
                });
            }
        }
        stages[index].order = order;
        stages[index].children = children;
        index += 1;
    }
    Ok(stages)
}

fn value_at<'a>(input: ContainerInput<'a>, order: &[usize], slot: usize) -> EncodeValue<'a> {
    match input {
        ContainerInput::Object(fields) => fields[order[slot]].value,
        ContainerInput::Array(values) => values[slot],
    }
}

fn compute_recursive_field_counts(stages: &mut [ContainerStage<'_>]) -> Result<(), EncodeError> {
    for index in (0..stages.len()).rev() {
        let own = match stages[index].input {
            ContainerInput::Object(fields) => usize_to_u32(fields.len())?,
            ContainerInput::Array(_) => 0,
        };
        let mut recursive = own;
        for (_, child_id) in &stages[index].children {
            recursive = recursive
                .checked_add(stages[u32_to_usize(*child_id)?].recursive_fields)
                .ok_or(EncodeError::ArithmeticOverflow)?;
        }
        stages[index].recursive_fields = recursive;
    }
    Ok(())
}

fn collect_names<'a>(
    stages: &[ContainerStage<'a>],
    total_fields: u32,
) -> Result<Vec<&'a str>, EncodeError> {
    let mut names = Vec::with_capacity(u32_to_usize(total_fields)?);
    for stage in stages {
        if let ContainerInput::Object(fields) = stage.input {
            names.extend(fields.iter().map(|field| field.name));
        }
    }
    names.sort_unstable_by(|left, right| left.as_bytes().cmp(right.as_bytes()));
    names.dedup();
    Ok(names)
}

#[derive(Clone, Copy)]
struct Layout {
    field_offset: u32,
    name_offset: u32,
    value_offset: u32,
    value_length: u32,
    container_offset: u32,
    container_length: u32,
    canonical_length: u32,
}

fn measure_layout(
    stages: &[ContainerStage<'_>],
    names: &[&str],
    statistics: ValidationStatistics,
) -> Result<Layout, EncodeError> {
    let field_length = checked_mul(u64::from(statistics.total_fields), FIELD_ENTRY_BYTES)?;
    let name_table = checked_mul(usize_to_u64(names.len())?, NAME_RECORD_BYTES)?;
    let name_bytes = names.iter().try_fold(0_u64, |total, name| {
        checked_add(total, usize_to_u64(name.len())?)
    })?;
    let name_length = checked_add(name_table, name_bytes)?;
    let descriptor_length = checked_mul(usize_to_u64(stages.len())?, CONTAINER_DESCRIPTOR_BYTES)?;
    let array_length = checked_mul(u64::from(statistics.array_entries), ARRAY_ENTRY_BYTES)?;
    let container_length = checked_add(descriptor_length, array_length)?;
    let field_offset = BASE_HEADER_BYTES;
    let name_offset = align8(checked_add(field_offset, field_length)?)?;
    let value_offset = align8(checked_add(name_offset, name_length)?)?;
    let mut value_cursor = value_offset;
    for stage in stages {
        let count = slot_count(stage.input, &stage.order);
        for slot in 0..count {
            let value = value_at(stage.input, &stage.order, slot);
            if !is_container(value) {
                value_cursor = align_to(value_cursor, payload_alignment(value))?;
                value_cursor = checked_add(value_cursor, payload_length(value)?)?;
            }
        }
    }
    let value_length = value_cursor
        .checked_sub(value_offset)
        .ok_or(EncodeError::ArithmeticOverflow)?;
    let container_offset = align8(value_cursor)?;
    let footer_offset = align8(checked_add(container_offset, container_length)?)?;
    let canonical_length = checked_add(footer_offset, FOOTER_BYTES)?;
    enforce_limit(
        LimitId::DocumentCanonicalBytes,
        MAX_CANONICAL_BYTES,
        canonical_length,
    )?;
    Ok(Layout {
        field_offset: u64_to_u32(field_offset)?,
        name_offset: u64_to_u32(name_offset)?,
        value_offset: u64_to_u32(value_offset)?,
        value_length: u64_to_u32(value_length)?,
        container_offset: u64_to_u32(container_offset)?,
        container_length: u64_to_u32(container_length)?,
        canonical_length: u64_to_u32(canonical_length)?,
    })
}

fn slot_count(input: ContainerInput<'_>, order: &[usize]) -> usize {
    match input {
        ContainerInput::Object(_) => order.len(),
        ContainerInput::Array(values) => values.len(),
    }
}

#[derive(Clone, Copy)]
struct NameInfo<'a> {
    name: &'a str,
    offset: u32,
}

fn build_name_pool<'a>(names: &[&'a str], section_offset: u32) -> (Vec<u8>, Vec<NameInfo<'a>>) {
    let table_length = bounded_usize_to_u64(names.len()) * NAME_RECORD_BYTES;
    let suffix_start = u64::from(section_offset) + table_length;
    let total_name_bytes = names
        .iter()
        .map(|name| bounded_usize_to_u64(name.len()))
        .sum::<u64>();
    let total_length = table_length + total_name_bytes;
    let mut output = vec![0_u8; bounded_u64_to_usize(total_length)];
    let mut infos = Vec::with_capacity(names.len());
    let mut suffix_cursor = suffix_start;
    for (index, name) in names.iter().enumerate() {
        let record = bounded_usize_to_u64(index) * NAME_RECORD_BYTES;
        put_u32(
            &mut output,
            bounded_u64_to_usize(record),
            bounded_u64_to_u32(suffix_cursor),
        );
        put_u16(
            &mut output,
            bounded_u64_to_usize(record + 4),
            bounded_usize_to_u16(name.len()),
        );
        put_u16(
            &mut output,
            bounded_u64_to_usize(record + 6),
            bounded_usize_to_u16(name.chars().count()),
        );
        let local = suffix_cursor - u64::from(section_offset);
        let start = bounded_u64_to_usize(local);
        let end = start + name.len();
        output[start..end].copy_from_slice(name.as_bytes());
        infos.push(NameInfo {
            name,
            offset: bounded_u64_to_u32(suffix_cursor),
        });
        suffix_cursor += bounded_usize_to_u64(name.len());
    }
    (output, infos)
}

fn build_value_area(
    stages: &[ContainerStage<'_>],
    section_offset: u32,
    section_length: u32,
) -> Result<Vec<u8>, EncodeError> {
    let mut output = Vec::with_capacity(bounded_u64_to_usize(u64::from(section_length)));
    let mut cursor = u64::from(section_offset);
    for stage in stages {
        let count = slot_count(stage.input, &stage.order);
        for slot in 0..count {
            let value = value_at(stage.input, &stage.order, slot);
            if !is_container(value) {
                let aligned = align_bounded(cursor, payload_alignment(value));
                let local = aligned - u64::from(section_offset);
                output.resize(bounded_u64_to_usize(local), 0);
                write_payload(value, &mut output)?;
                cursor = aligned + payload_length(value)?;
            }
        }
    }
    if output.len() != bounded_u64_to_usize(u64::from(section_length)) {
        return Err(EncodeError::ArithmeticOverflow);
    }
    Ok(output)
}

fn build_reference_tables(
    stages: &[ContainerStage<'_>],
    names: &[NameInfo<'_>],
    layout: Layout,
) -> Result<(Vec<u8>, Vec<u8>), EncodeError> {
    let total_fields = stages
        .iter()
        .map(|stage| match stage.input {
            ContainerInput::Object(fields) => fields.len(),
            ContainerInput::Array(_) => 0,
        })
        .sum::<usize>();
    let total_arrays = stages
        .iter()
        .map(|stage| match stage.input {
            ContainerInput::Array(values) => values.len(),
            ContainerInput::Object(_) => 0,
        })
        .sum::<usize>();
    let mut field_table = vec![0_u8; total_fields * bounded_u64_to_usize(FIELD_ENTRY_BYTES)];
    let mut array_entries = vec![0_u8; total_arrays * bounded_u64_to_usize(ARRAY_ENTRY_BYTES)];
    let mut field_record = 0_u64;
    let mut array_record = 0_u64;
    let mut payload_cursor = u64::from(layout.value_offset);

    for stage in stages {
        let count = slot_count(stage.input, &stage.order);
        let mut child_index = 0_usize;
        for slot in 0..count {
            let value = value_at(stage.input, &stage.order, slot);
            let (value_offset, value_length) = if is_container(value) {
                let (child_slot, child_id) = stage.children[child_index];
                if child_slot != slot {
                    return Err(EncodeError::ArithmeticOverflow);
                }
                child_index += 1;
                let descriptor = u64::from(layout.container_offset)
                    + u64::from(child_id) * CONTAINER_DESCRIPTOR_BYTES;
                (bounded_u64_to_u32(descriptor), 32)
            } else {
                payload_cursor = align_bounded(payload_cursor, payload_alignment(value));
                let offset = bounded_u64_to_u32(payload_cursor);
                let length = bounded_u64_to_u32(payload_length(value)?);
                payload_cursor += u64::from(length);
                (offset, length)
            };
            match stage.input {
                ContainerInput::Object(fields) => {
                    let original = stage.order[slot];
                    let field = fields[original];
                    let field_id = names
                        .binary_search_by(|candidate| {
                            candidate.name.as_bytes().cmp(field.name.as_bytes())
                        })
                        .map_err(|_| EncodeError::ArithmeticOverflow)?;
                    let name = names[field_id];
                    let record = field_record * FIELD_ENTRY_BYTES;
                    let start = bounded_u64_to_usize(record);
                    put_u32(&mut field_table, start, bounded_usize_to_u32(field_id));
                    put_u32(&mut field_table, start + 4, name.offset);
                    put_u16(
                        &mut field_table,
                        start + 8,
                        bounded_usize_to_u16(field.name.len()),
                    );
                    field_table[start + 10] = type_tag(value);
                    put_u32(&mut field_table, start + 12, value_offset);
                    put_u32(&mut field_table, start + 16, value_length);
                    put_u32(&mut field_table, start + 20, bounded_usize_to_u32(original));
                    field_record += 1;
                }
                ContainerInput::Array(_) => {
                    let record = array_record * ARRAY_ENTRY_BYTES;
                    let start = bounded_u64_to_usize(record);
                    array_entries[start] = type_tag(value);
                    put_u32(&mut array_entries, start + 4, value_offset);
                    put_u32(&mut array_entries, start + 8, value_length);
                    array_record += 1;
                }
            }
        }
        if child_index != stage.children.len() {
            return Err(EncodeError::ArithmeticOverflow);
        }
    }
    let expected_payload_end = u64::from(layout.value_offset) + u64::from(layout.value_length);
    if payload_cursor != expected_payload_end {
        return Err(EncodeError::ArithmeticOverflow);
    }
    Ok((field_table, array_entries))
}

fn build_container_tables(
    stages: &[ContainerStage<'_>],
    array_entries: &[u8],
    layout: Layout,
) -> Vec<u8> {
    let descriptor_length = bounded_usize_to_u64(stages.len()) * CONTAINER_DESCRIPTOR_BYTES;
    let mut output = vec![0_u8; bounded_u64_to_usize(u64::from(layout.container_length))];
    let mut field_cursor = u64::from(layout.field_offset);
    let mut array_cursor = u64::from(layout.container_offset) + descriptor_length;
    for (index, stage) in stages.iter().enumerate() {
        let descriptor_offset = bounded_usize_to_u64(index) * CONTAINER_DESCRIPTOR_BYTES;
        let start = bounded_u64_to_usize(descriptor_offset);
        put_u32(&mut output, start, bounded_usize_to_u32(index));
        output[start + 4] = match stage.input {
            ContainerInput::Object(_) => 9,
            ContainerInput::Array(_) => 10,
        };
        put_u16(&mut output, start + 6, stage.depth);
        let (item_offset, item_count) = match stage.input {
            ContainerInput::Object(fields) => {
                let offset = field_cursor;
                field_cursor += bounded_usize_to_u64(fields.len()) * FIELD_ENTRY_BYTES;
                (offset, bounded_usize_to_u32(fields.len()))
            }
            ContainerInput::Array(values) => {
                let offset = array_cursor;
                array_cursor += bounded_usize_to_u64(values.len()) * ARRAY_ENTRY_BYTES;
                (offset, bounded_usize_to_u32(values.len()))
            }
        };
        put_u32(&mut output, start + 8, bounded_u64_to_u32(item_offset));
        put_u32(&mut output, start + 12, item_count);
        put_u32(&mut output, start + 16, stage.recursive_fields);
        put_u32(&mut output, start + 20, stage.parent_id);
        put_u32(&mut output, start + 24, stage.parent_slot);
    }
    let suffix = bounded_u64_to_usize(descriptor_length);
    output[suffix..].copy_from_slice(array_entries);
    output
}

fn hash_document(stages: &[ContainerStage<'_>]) -> Result<[u8; 32], EncodeError> {
    let mut container_digests = vec![[0_u8; 32]; stages.len()];
    for index in (0..stages.len()).rev() {
        let stage = &stages[index];
        let mut node_hasher = Hasher::new();
        match stage.input {
            ContainerInput::Object(fields) => {
                let body_length = stage.order.iter().try_fold(4_u64, |total, original| {
                    checked_add(
                        total,
                        checked_add(36, usize_to_u64(fields[*original].name.len())?)?,
                    )
                })?;
                hash_frame_prefix(&mut node_hasher, 9, body_length);
                node_hasher.update(&usize_to_u32(stage.order.len())?.to_le_bytes());
                let mut child_index = 0_usize;
                for (slot, original) in stage.order.iter().enumerate() {
                    let field = fields[*original];
                    node_hasher.update(&usize_to_u32(field.name.len())?.to_le_bytes());
                    node_hasher.update(field.name.as_bytes());
                    let digest = value_digest(
                        field.value,
                        slot,
                        stage,
                        &container_digests,
                        &mut child_index,
                    )?;
                    node_hasher.update(&digest);
                }
                if child_index != stage.children.len() {
                    return Err(EncodeError::ArithmeticOverflow);
                }
            }
            ContainerInput::Array(values) => {
                let body_length = checked_add(4, checked_mul(usize_to_u64(values.len())?, 36)?)?;
                hash_frame_prefix(&mut node_hasher, 10, body_length);
                node_hasher.update(&usize_to_u32(values.len())?.to_le_bytes());
                let mut child_index = 0_usize;
                for (slot, value) in values.iter().enumerate() {
                    node_hasher.update(&usize_to_u32(slot)?.to_le_bytes());
                    let digest =
                        value_digest(*value, slot, stage, &container_digests, &mut child_index)?;
                    node_hasher.update(&digest);
                }
                if child_index != stage.children.len() {
                    return Err(EncodeError::ArithmeticOverflow);
                }
            }
        }
        container_digests[index].copy_from_slice(node_hasher.finalize().as_bytes());
    }
    container_digests
        .first()
        .copied()
        .ok_or(EncodeError::ArithmeticOverflow)
}

fn value_digest(
    value: EncodeValue<'_>,
    slot: usize,
    stage: &ContainerStage<'_>,
    hashes: &[[u8; 32]],
    child_index: &mut usize,
) -> Result<[u8; 32], EncodeError> {
    if is_container(value) {
        let (expected_slot, child_id) = stage.children[*child_index];
        if expected_slot != slot {
            return Err(EncodeError::ArithmeticOverflow);
        }
        *child_index += 1;
        return hashes
            .get(u32_to_usize(child_id)?)
            .copied()
            .ok_or(EncodeError::ArithmeticOverflow);
    }
    hash_noncontainer(value)
}

fn hash_noncontainer(value: EncodeValue<'_>) -> Result<[u8; 32], EncodeError> {
    let mut hasher = Hasher::new();
    hash_frame_prefix(&mut hasher, type_tag(value), payload_length(value)?);
    update_payload_hash(value, &mut hasher)?;
    Ok(*hasher.finalize().as_bytes())
}

fn hash_frame_prefix(hasher: &mut Hasher, tag: u8, body_length: u64) {
    hasher.update(HASH_DOMAIN);
    hasher.update(&1_u16.to_le_bytes());
    hasher.update(&[tag]);
    hasher.update(&body_length.to_le_bytes());
}

fn update_payload_hash(value: EncodeValue<'_>, hasher: &mut Hasher) -> Result<(), EncodeError> {
    match value {
        EncodeValue::Null => {}
        EncodeValue::Bool(value) => {
            hasher.update(&[u8::from(value)]);
        }
        EncodeValue::Int32(value) | EncodeValue::Date(value) => {
            hasher.update(&value.to_le_bytes());
        }
        EncodeValue::Int64(value) | EncodeValue::Timestamp(value) => {
            hasher.update(&value.to_le_bytes());
        }
        EncodeValue::Float64Bits(value) => {
            hasher.update(&value.to_le_bytes());
        }
        EncodeValue::Decimal128(value) => {
            hasher.update(&decimal_bytes(value)?);
        }
        EncodeValue::String(value) => {
            hasher.update(value.as_bytes());
        }
        EncodeValue::Binary(value) => {
            hasher.update(&[0]);
            hasher.update(value);
        }
        EncodeValue::Uuid(value) => {
            hasher.update(&value);
        }
        EncodeValue::ObjectId(value) => {
            hasher.update(&value);
        }
        EncodeValue::VectorF32(values) => {
            hasher.update(&usize_to_u32(values.len())?.to_le_bytes());
            for value in values {
                hasher.update(&value.to_le_bytes());
            }
        }
        EncodeValue::VectorF16(values) => {
            hasher.update(&usize_to_u32(values.len())?.to_le_bytes());
            for value in values {
                hasher.update(&value.to_le_bytes());
            }
        }
        EncodeValue::Object(_) | EncodeValue::Array(_) => {
            return Err(EncodeError::ArithmeticOverflow);
        }
    }
    Ok(())
}

fn write_payload(value: EncodeValue<'_>, output: &mut Vec<u8>) -> Result<(), EncodeError> {
    match value {
        EncodeValue::Null => {}
        EncodeValue::Bool(value) => output.push(u8::from(value)),
        EncodeValue::Int32(value) | EncodeValue::Date(value) => {
            output.extend_from_slice(&value.to_le_bytes());
        }
        EncodeValue::Int64(value) | EncodeValue::Timestamp(value) => {
            output.extend_from_slice(&value.to_le_bytes());
        }
        EncodeValue::Float64Bits(value) => output.extend_from_slice(&value.to_le_bytes()),
        EncodeValue::Decimal128(value) => output.extend_from_slice(&decimal_bytes(value)?),
        EncodeValue::String(value) => output.extend_from_slice(value.as_bytes()),
        EncodeValue::Binary(value) => {
            output.push(0);
            output.extend_from_slice(value);
        }
        EncodeValue::Uuid(value) => output.extend_from_slice(&value),
        EncodeValue::ObjectId(value) => output.extend_from_slice(&value),
        EncodeValue::VectorF32(values) => {
            output.extend_from_slice(&usize_to_u32(values.len())?.to_le_bytes());
            for value in values {
                output.extend_from_slice(&value.to_le_bytes());
            }
        }
        EncodeValue::VectorF16(values) => {
            output.extend_from_slice(&usize_to_u32(values.len())?.to_le_bytes());
            for value in values {
                output.extend_from_slice(&value.to_le_bytes());
            }
        }
        EncodeValue::Object(_) | EncodeValue::Array(_) => {
            return Err(EncodeError::ArithmeticOverflow);
        }
    }
    Ok(())
}

fn payload_length(value: EncodeValue<'_>) -> Result<u64, EncodeError> {
    match value {
        EncodeValue::Null => Ok(0),
        EncodeValue::Bool(_) => Ok(1),
        EncodeValue::Int32(_) | EncodeValue::Date(_) => Ok(4),
        EncodeValue::Int64(_) | EncodeValue::Float64Bits(_) | EncodeValue::Timestamp(_) => Ok(8),
        EncodeValue::Decimal128(_) | EncodeValue::Uuid(_) => Ok(16),
        EncodeValue::String(value) => usize_to_u64(value.len()),
        EncodeValue::Binary(value) => checked_add(1, usize_to_u64(value.len())?),
        EncodeValue::ObjectId(_) => Ok(12),
        EncodeValue::VectorF32(values) => {
            checked_add(4, checked_mul(usize_to_u64(values.len())?, 4)?)
        }
        EncodeValue::VectorF16(values) => {
            checked_add(4, checked_mul(usize_to_u64(values.len())?, 2)?)
        }
        EncodeValue::Object(_) | EncodeValue::Array(_) => Err(EncodeError::ArithmeticOverflow),
    }
}

const fn payload_alignment(value: EncodeValue<'_>) -> u64 {
    match value {
        EncodeValue::Int32(_)
        | EncodeValue::Date(_)
        | EncodeValue::VectorF32(_)
        | EncodeValue::VectorF16(_) => 4,
        EncodeValue::Int64(_)
        | EncodeValue::Float64Bits(_)
        | EncodeValue::Decimal128(_)
        | EncodeValue::Timestamp(_) => 8,
        _ => 1,
    }
}

const fn is_container(value: EncodeValue<'_>) -> bool {
    value.value_type().is_container()
}

const fn type_tag(value: EncodeValue<'_>) -> u8 {
    value.value_type().hdoc_tag()
}

fn decimal_bytes(decimal: Decimal128) -> Result<[u8; 16], EncodeError> {
    let bits = match decimal {
        Decimal128::PositiveInfinity => 0x7800_0000_0000_0000_0000_0000_0000_0000,
        Decimal128::NegativeInfinity => 0xf800_0000_0000_0000_0000_0000_0000_0000,
        Decimal128::NaN => 0x7c00_0000_0000_0000_0000_0000_0000_0000,
        Decimal128::Zero { negative } => {
            let sign = u128::from(negative) << 127;
            sign | (u128::from(6_176_u16) << 113)
        }
        Decimal128::Finite {
            negative,
            mut coefficient,
            mut exponent,
        } => {
            if coefficient == 0 || coefficient >= DECIMAL_COEFFICIENT_LIMIT {
                return Err(EncodeError::InvalidDecimal);
            }
            while coefficient % 10 == 0 {
                coefficient /= 10;
                exponent = exponent.checked_add(1).ok_or(EncodeError::InvalidDecimal)?;
            }
            let digits = decimal_digits(coefficient);
            let adjusted = exponent
                .checked_add(i32::from(digits) - 1)
                .ok_or(EncodeError::InvalidDecimal)?;
            if exponent < -6_176 || adjusted > 6_144 {
                return Err(EncodeError::InvalidDecimal);
            }
            let shift = if exponent > 6_111 {
                u32::try_from(exponent - 6_111).map_err(|_| EncodeError::InvalidDecimal)?
            } else {
                0
            };
            let factor = pow10(shift)?;
            let wire_coefficient = coefficient
                .checked_mul(factor)
                .ok_or(EncodeError::InvalidDecimal)?;
            let wire_exponent = exponent
                .checked_sub(i32::try_from(shift).map_err(|_| EncodeError::InvalidDecimal)?)
                .ok_or(EncodeError::InvalidDecimal)?;
            let biased = u128::from(
                u16::try_from(wire_exponent + 6_176).map_err(|_| EncodeError::InvalidDecimal)?,
            );
            (u128::from(negative) << 127) | (biased << 113) | wire_coefficient
        }
    };
    Ok(bits.to_le_bytes())
}

fn decimal_digits(mut coefficient: u128) -> u8 {
    let mut digits = 0_u8;
    while coefficient > 0 {
        digits += 1;
        coefficient /= 10;
    }
    digits
}

fn pow10(exponent: u32) -> Result<u128, EncodeError> {
    let mut result = 1_u128;
    for _ in 0..exponent {
        result = result.checked_mul(10).ok_or(EncodeError::InvalidDecimal)?;
    }
    Ok(result)
}

fn assemble_document(
    logical_sections: &[Vec<u8>; 4],
    item_counts: [u32; 4],
    field_count: u32,
    content_hash: [u8; 32],
    canonical_length: u32,
    compression: CompressionMode,
) -> Result<EncodedHDoc, EncodeError> {
    let candidates = if compression == CompressionMode::Canonical {
        [
            compression_stream(&logical_sections[0]),
            compression_stream(&logical_sections[1]),
            compression_stream(&logical_sections[2]),
            compression_stream(&logical_sections[3]),
        ]
    } else {
        [None, None, None, None]
    };
    let compressed_count = candidates
        .iter()
        .filter(|candidate| candidate.is_some())
        .count();
    let compressed_length = measure_stored_length(logical_sections, &candidates);
    let use_compression = compressed_count > 0 && compressed_length < u64::from(canonical_length);
    let bytes = build_envelope(
        logical_sections,
        &candidates,
        item_counts,
        field_count,
        content_hash,
        canonical_length,
        use_compression,
    )?;
    Ok(EncodedHDoc {
        bytes,
        content_hash,
        canonical_length,
        compressed_sections: if use_compression {
            bounded_usize_to_u8(compressed_count)
        } else {
            0
        },
    })
}

struct CompressionBlock<'a> {
    logical: &'a [u8],
    stored: Vec<u8>,
    raw: bool,
}

fn compression_stream(input: &[u8]) -> Option<Vec<u8>> {
    if input.is_empty() {
        return None;
    }
    let mut blocks = Vec::with_capacity(input.len().div_ceil(COMPRESSION_BLOCK_BYTES));
    let mut any_compressed = false;
    for logical in input.chunks(COMPRESSION_BLOCK_BYTES) {
        let mut compressed = lz4_flex::block::compress(logical);
        let raw = compressed.len() >= logical.len();
        if raw {
            compressed.clear();
            compressed.extend_from_slice(logical);
        } else {
            any_compressed = true;
        }
        blocks.push(CompressionBlock {
            logical,
            stored: compressed,
            raw,
        });
    }
    let table_length = bounded_usize_to_u64(blocks.len()) * 24;
    let payload_offset = 32 + table_length;
    let payload_length = blocks
        .iter()
        .map(|block| bounded_usize_to_u64(block.stored.len()))
        .sum::<u64>();
    let stream_length = payload_offset + payload_length;
    if !any_compressed || stream_length >= bounded_usize_to_u64(input.len()) {
        return None;
    }
    let mut output = vec![0_u8; bounded_u64_to_usize(stream_length)];
    output[..8].copy_from_slice(COMPRESSION_MAGIC);
    put_u16(&mut output, 8, 1);
    put_u16(&mut output, 10, 32);
    put_u16(&mut output, 12, 24);
    output[14] = 15;
    put_u32(&mut output, 16, bounded_usize_to_u32(blocks.len()));
    put_u32(&mut output, 20, bounded_usize_to_u32(input.len()));
    put_u32(&mut output, 24, bounded_u64_to_u32(payload_offset));
    let mut logical_cursor = 0_u64;
    let mut stored_cursor = payload_offset;
    for (index, block) in blocks.iter().enumerate() {
        let entry = 32 + bounded_usize_to_u64(index) * 24;
        let start = bounded_u64_to_usize(entry);
        put_u32(&mut output, start, bounded_u64_to_u32(logical_cursor));
        put_u32(
            &mut output,
            start + 4,
            bounded_usize_to_u32(block.logical.len()),
        );
        put_u32(&mut output, start + 8, bounded_u64_to_u32(stored_cursor));
        put_u32(
            &mut output,
            start + 12,
            bounded_usize_to_u32(block.stored.len()),
        );
        put_u16(&mut output, start + 16, u16::from(block.raw));
        let payload_start = bounded_u64_to_usize(stored_cursor);
        let payload_end = payload_start + block.stored.len();
        output[payload_start..payload_end].copy_from_slice(&block.stored);
        logical_cursor += bounded_usize_to_u64(block.logical.len());
        stored_cursor += bounded_usize_to_u64(block.stored.len());
    }
    Some(output)
}

fn measure_stored_length<S: AsRef<[u8]>>(
    logical_sections: &[S; 4],
    candidates: &[Option<Vec<u8>>; 4],
) -> u64 {
    let mut cursor = BASE_HEADER_BYTES;
    for index in 0..4 {
        cursor = align8_bounded(cursor);
        let length = candidates[index]
            .as_ref()
            .map_or(logical_sections[index].as_ref().len(), Vec::len);
        cursor += bounded_usize_to_u64(length);
    }
    align8_bounded(cursor) + FOOTER_BYTES
}

fn build_envelope<S: AsRef<[u8]>>(
    logical_sections: &[S; 4],
    candidates: &[Option<Vec<u8>>; 4],
    item_counts: [u32; 4],
    field_count: u32,
    content_hash: [u8; 32],
    canonical_length: u32,
    use_compression: bool,
) -> Result<Vec<u8>, EncodeError> {
    let total_length = if use_compression {
        measure_stored_length(logical_sections, candidates)
    } else {
        measure_stored_length(logical_sections, &[None, None, None, None])
    };
    if !use_compression && total_length != u64::from(canonical_length) {
        return Err(EncodeError::ArithmeticOverflow);
    }
    let mut output = vec![0_u8; bounded_u64_to_usize(total_length)];
    output[..8].copy_from_slice(HEADER_MAGIC);
    put_u16(&mut output, 8, 1);
    put_u16(&mut output, 12, bounded_u64_to_u16(BASE_HEADER_BYTES));
    put_u16(&mut output, 14, bounded_u64_to_u16(DIRECTORY_ENTRY_BYTES));
    put_u32(&mut output, 16, u32::from(use_compression));
    put_u32(&mut output, 20, bounded_u64_to_u32(total_length));
    put_u32(&mut output, 24, canonical_length);
    put_u32(&mut output, 28, field_count);
    put_u16(&mut output, 36, SECTION_COUNT);
    put_u32(&mut output, 40, bounded_u64_to_u32(HEADER_BYTES));
    put_u64(&mut output, 48, u64::from(use_compression));

    let mut cursor = BASE_HEADER_BYTES;
    for index in 0..4 {
        cursor = align8_bounded(cursor);
        let candidate = if use_compression {
            candidates[index].as_deref()
        } else {
            None
        };
        let logical = logical_sections[index].as_ref();
        let stored = candidate.unwrap_or(logical);
        let directory = bounded_u64_to_usize(
            HEADER_BYTES + bounded_usize_to_u64(index) * DIRECTORY_ENTRY_BYTES,
        );
        put_u16(&mut output, directory, bounded_usize_to_u16(index + 1));
        put_u16(
            &mut output,
            directory + 2,
            if candidate.is_some() { 7 } else { 6 },
        );
        put_u32(&mut output, directory + 4, bounded_u64_to_u32(cursor));
        put_u32(
            &mut output,
            directory + 8,
            bounded_usize_to_u32(stored.len()),
        );
        put_u32(
            &mut output,
            directory + 12,
            bounded_usize_to_u32(logical.len()),
        );
        put_u32(&mut output, directory + 16, item_counts[index]);
        put_u16(&mut output, directory + 20, u16::from(candidate.is_some()));
        put_u16(&mut output, directory + 22, u16::from(candidate.is_some()));
        put_u16(&mut output, directory + 24, 1);
        let start = bounded_u64_to_usize(cursor);
        let end = start + stored.len();
        output[start..end].copy_from_slice(stored);
        cursor += bounded_usize_to_u64(stored.len());
    }
    let footer_offset = align8_bounded(cursor);
    put_u32(&mut output, 44, bounded_u64_to_u32(footer_offset));
    let footer = bounded_u64_to_usize(footer_offset);
    output[footer..footer + 8].copy_from_slice(FOOTER_MAGIC);
    put_u16(&mut output, footer + 8, 64);
    put_u16(&mut output, footer + 10, 1);
    put_u16(&mut output, footer + 12, 1);
    put_u16(&mut output, footer + 14, 1);
    put_u32(&mut output, footer + 16, 32);
    put_u32(&mut output, footer + 20, bounded_u64_to_u32(total_length));
    put_u32(&mut output, footer + 24, canonical_length);
    put_u32(&mut output, footer + 28, field_count);
    output[footer + 32..footer + 64].copy_from_slice(&content_hash);
    let checksum = CRC32C.checksum(&output);
    put_u32(&mut output, 32, checksum);
    Ok(output)
}

fn put_u16(output: &mut [u8], offset: usize, value: u16) {
    output[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
}

fn put_u32(output: &mut [u8], offset: usize, value: u32) {
    output[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn put_u64(output: &mut [u8], offset: usize, value: u64) {
    output[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
}

fn align8(value: u64) -> Result<u64, EncodeError> {
    align_to(value, 8)
}

const fn align8_bounded(value: u64) -> u64 {
    align_bounded(value, 8)
}

const fn align_bounded(value: u64, alignment: u64) -> u64 {
    (value + alignment - 1) & !(alignment - 1)
}

fn align_to(value: u64, alignment: u64) -> Result<u64, EncodeError> {
    let mask = alignment
        .checked_sub(1)
        .ok_or(EncodeError::ArithmeticOverflow)?;
    checked_add(value, mask).map(|candidate| candidate & !mask)
}

fn checked_add(left: u64, right: u64) -> Result<u64, EncodeError> {
    left.checked_add(right)
        .ok_or(EncodeError::ArithmeticOverflow)
}

fn checked_mul(left: u64, right: u64) -> Result<u64, EncodeError> {
    left.checked_mul(right)
        .ok_or(EncodeError::ArithmeticOverflow)
}

fn usize_to_u64(value: usize) -> Result<u64, EncodeError> {
    u64::try_from(value).map_err(|_| EncodeError::ArithmeticOverflow)
}

fn usize_to_u32(value: usize) -> Result<u32, EncodeError> {
    u32::try_from(value).map_err(|_| EncodeError::ArithmeticOverflow)
}

fn u64_to_u32(value: u64) -> Result<u32, EncodeError> {
    u32::try_from(value).map_err(|_| EncodeError::ArithmeticOverflow)
}

fn u32_to_usize(value: u32) -> Result<usize, EncodeError> {
    usize::try_from(value).map_err(|_| EncodeError::ArithmeticOverflow)
}

#[allow(
    clippy::cast_possible_truncation,
    reason = "validated HDoc assembly lengths are capped at 16 MiB before this conversion"
)]
const fn bounded_u64_to_u32(value: u64) -> u32 {
    value as u32
}

#[allow(
    clippy::cast_possible_truncation,
    reason = "validated HDoc assembly lengths are capped at 16 MiB before this conversion"
)]
const fn bounded_u64_to_u16(value: u64) -> u16 {
    value as u16
}

#[allow(
    clippy::cast_possible_truncation,
    reason = "validated HDoc assembly lengths are capped at 16 MiB on supported 32-bit and 64-bit targets"
)]
const fn bounded_u64_to_usize(value: u64) -> usize {
    value as usize
}

#[allow(
    clippy::cast_possible_truncation,
    reason = "validated HDoc assembly counts and lengths are capped below u32 maximum"
)]
const fn bounded_usize_to_u32(value: usize) -> u32 {
    value as u32
}

#[allow(
    clippy::cast_possible_truncation,
    reason = "callers convert four directory IDs or path offsets bounded to 4096 bytes"
)]
const fn bounded_usize_to_u16(value: usize) -> u16 {
    value as u16
}

#[allow(
    clippy::cast_possible_truncation,
    reason = "the only caller counts the four bounded HDoc base sections"
)]
const fn bounded_usize_to_u8(value: usize) -> u8 {
    value as u8
}

#[allow(
    clippy::cast_lossless,
    reason = "supported HDoc targets have 32-bit or 64-bit usize and assembly is already bounded"
)]
const fn bounded_usize_to_u64(value: usize) -> u64 {
    value as u64
}

#[derive(Clone, Copy, Default)]
struct DirectoryEntry {
    flags: u16,
    stored_offset: u32,
    stored_length: u32,
    logical_length: u32,
    item_count: u32,
    codec_id: u16,
    codec_profile_id: u16,
}

struct ParsedEnvelope {
    entries: [DirectoryEntry; 4],
    logical_offsets: [u32; 4],
    total_length: u32,
    canonical_length: u32,
    field_count: u32,
    footer_hash: [u8; 32],
    compressed_sections: u8,
}

/// Validates and decodes one complete `HDoc` 1.0 envelope atomically.
///
/// The returned wrapper retains borrowed uncompressed section slices and owns only sections that
/// required bounded decompression. No logical view is available until every validation and exact
/// canonical-envelope check has succeeded.
///
/// # Errors
///
/// Returns a redacted [`DecodeError`] for unsupported format capabilities or any checksum,
/// structural, compression, payload, limit, canonicality, or typed-hash failure.
pub fn decode(bytes: &[u8]) -> Result<DecodedHDoc<'_>, DecodeError> {
    let envelope = parse_envelope(bytes)?;
    let logical_sections = decode_logical_sections(bytes, &envelope)?;
    let section_refs = logical_sections.each_ref().map(AsRef::as_ref);
    let validated = validate_logical_sections(&section_refs, &envelope)?;
    validate_canonical_envelope(bytes, &section_refs, &envelope, envelope.footer_hash)?;
    if validated.content_hash != envelope.footer_hash {
        return Err(corruption(DecodeCheck::TypedContentHash, 0));
    }
    Ok(DecodedHDoc {
        bytes,
        logical_sections,
        logical_offsets: envelope.logical_offsets,
        names: validated.names,
        fields: validated.fields,
        arrays: validated.arrays,
        containers: validated.containers,
        presentation_fields: validated.presentation_fields,
        content_hash: validated.content_hash,
        canonical_length: envelope.canonical_length,
        field_count: envelope.field_count,
        compressed_sections: envelope.compressed_sections,
    })
}

#[allow(
    clippy::too_many_lines,
    reason = "the normative envelope trust order is kept in one auditable fail-closed sequence"
)]
fn parse_envelope(bytes: &[u8]) -> Result<ParsedEnvelope, DecodeError> {
    if bytes.get(..8) != Some(HEADER_MAGIC.as_slice()) {
        return Err(DecodeError::FormatUnsupported);
    }
    if bytes.len() < bounded_u64_to_usize(HEADER_BYTES) {
        return Err(corruption(DecodeCheck::Header, bytes.len()));
    }

    let major = validated_u16(bytes, 8);
    let minor = validated_u16(bytes, 10);
    if major != 1 || minor != 0 {
        return Err(DecodeError::UnsupportedVersion { major, minor });
    }
    let header_bytes = validated_u16(bytes, 12);
    let directory_entry_bytes = validated_u16(bytes, 14);
    let document_flags = validated_u32(bytes, 16);
    let total_length = validated_u32(bytes, 20);
    let canonical_length = validated_u32(bytes, 24);
    let field_count = validated_u32(bytes, 28);
    let expected_checksum = validated_u32(bytes, 32);
    let section_count = validated_u16(bytes, 36);
    let reserved = validated_u16(bytes, 38);
    let directory_offset = validated_u32(bytes, 40);
    let footer_offset = validated_u32(bytes, 44);
    let required_features = validated_u64(bytes, 48);
    let optional_features = validated_u64(bytes, 56);

    if total_length < 256
        || total_length > canonical_length
        || u64::from(canonical_length) > MAX_CANONICAL_BYTES
        || !total_length.is_multiple_of(8)
        || !canonical_length.is_multiple_of(8)
        || bounded_u64_to_usize(u64::from(total_length)) != bytes.len()
        || footer_offset.checked_add(bounded_u64_to_u32(FOOTER_BYTES)) != Some(total_length)
        || !footer_offset.is_multiple_of(8)
    {
        return Err(corruption(DecodeCheck::Length, 20));
    }
    validate_checksum(bytes, expected_checksum)?;

    let unknown_required = required_features & !hdoc_negotiation::HDOC_SUPPORTED_REQUIRED_FEATURES;
    if unknown_required != 0 {
        return Err(unsupported(DecodeCheck::Feature, unknown_required));
    }
    if optional_features & !hdoc_negotiation::HDOC_SUPPORTED_OPTIONAL_FEATURES != 0 {
        return Err(unsupported(DecodeCheck::Feature, optional_features << 32));
    }
    let unsupported_flags = document_flags & !hdoc_negotiation::HDOC_SUPPORTED_DOCUMENT_FLAGS;
    if unsupported_flags != 0 {
        return Err(unsupported(
            DecodeCheck::Feature,
            u64::from(unsupported_flags) << 32,
        ));
    }
    if !(4..=32).contains(&section_count) {
        return Err(corruption(DecodeCheck::Header, 36));
    }
    if section_count != SECTION_COUNT {
        return Err(unsupported(
            DecodeCheck::Directory,
            u64::from(section_count),
        ));
    }
    let expected_header_bytes = HEADER_BYTES + u64::from(section_count) * DIRECTORY_ENTRY_BYTES;
    if directory_entry_bytes != bounded_u64_to_u16(DIRECTORY_ENTRY_BYTES)
        || u64::from(header_bytes) != expected_header_bytes
        || u64::from(directory_offset) != HEADER_BYTES
        || reserved != 0
    {
        return Err(corruption(DecodeCheck::Header, 12));
    }
    if u64::from(field_count) > MAX_DOCUMENT_FIELDS {
        return Err(corruption(DecodeCheck::Limit, 28));
    }

    let mut entries = [DirectoryEntry::default(); 4];
    let mut stored_cursor = u64::from(header_bytes);
    let mut compressed_sections = 0_u8;
    for (index, entry_slot) in entries.iter_mut().enumerate() {
        let directory = bounded_u64_to_usize(HEADER_BYTES)
            + index * bounded_u64_to_usize(DIRECTORY_ENTRY_BYTES);
        let kind = validated_u16(bytes, directory);
        let flags = validated_u16(bytes, directory + 2);
        let stored_offset = validated_u32(bytes, directory + 4);
        let stored_length = validated_u32(bytes, directory + 8);
        let logical_length = validated_u32(bytes, directory + 12);
        let item_count = validated_u32(bytes, directory + 16);
        let codec_id = validated_u16(bytes, directory + 20);
        let codec_profile_id = validated_u16(bytes, directory + 22);
        let section_version = validated_u16(bytes, directory + 24);
        let reserved_0 = validated_u16(bytes, directory + 26);
        let reserved_1 = validated_u32(bytes, directory + 28);
        let expected_kind = bounded_usize_to_u16(index + 1);
        if kind != expected_kind {
            return Err(corruption(DecodeCheck::Directory, directory));
        }
        if section_version != 1 {
            let identifier = (u64::from(kind) << 32) | u64::from(section_version);
            return Err(unsupported(DecodeCheck::Directory, identifier));
        }
        if reserved_0 != 0 || reserved_1 != 0 || (flags & !7) != 0 || (flags & 6) != 6 {
            return Err(corruption(DecodeCheck::Directory, directory + 2));
        }
        let compressed = flags & 1 != 0;
        if compressed {
            if codec_id != 1 || codec_profile_id != 1 {
                let identifier = (u64::from(codec_id) << 32) | u64::from(codec_profile_id);
                return Err(unsupported(DecodeCheck::CompressionHeader, identifier));
            }
            if logical_length == 0 || stored_length >= logical_length {
                return Err(corruption(DecodeCheck::Directory, directory + 8));
            }
            compressed_sections += 1;
        } else if flags != 6
            || codec_id != 0
            || codec_profile_id != 0
            || stored_length != logical_length
        {
            return Err(corruption(DecodeCheck::Directory, directory + 2));
        }
        let expected_offset = align8_decode(stored_cursor, DecodeCheck::Directory, directory + 4)?;
        if u64::from(stored_offset) != expected_offset {
            return Err(corruption(DecodeCheck::Directory, directory + 4));
        }
        require_zero_range(
            bytes,
            stored_cursor,
            expected_offset,
            DecodeCheck::Directory,
        )?;
        let stored_end = expected_offset
            .checked_add(u64::from(stored_length))
            .ok_or(corruption(DecodeCheck::Directory, directory + 8))?;
        if stored_end > u64::from(footer_offset) {
            return Err(corruption(DecodeCheck::Directory, directory + 8));
        }
        stored_cursor = stored_end;
        *entry_slot = DirectoryEntry {
            flags,
            stored_offset,
            stored_length,
            logical_length,
            item_count,
            codec_id,
            codec_profile_id,
        };
    }
    let expected_footer = align8_decode(stored_cursor, DecodeCheck::Directory, 44)?;
    if expected_footer != u64::from(footer_offset) {
        return Err(corruption(DecodeCheck::Directory, 44));
    }
    require_zero_range(
        bytes,
        stored_cursor,
        expected_footer,
        DecodeCheck::Directory,
    )?;
    let has_compression = compressed_sections != 0;
    if document_flags != u32::from(has_compression)
        || required_features != u64::from(has_compression)
    {
        return Err(corruption(DecodeCheck::Feature, 16));
    }

    let footer = bounded_u64_to_usize(u64::from(footer_offset));
    if bytes.get(footer..footer + 8) != Some(FOOTER_MAGIC.as_slice())
        || validated_u16(bytes, footer + 8) != 64
        || validated_u16(bytes, footer + 10) != 1
        || validated_u16(bytes, footer + 12) != 1
        || validated_u16(bytes, footer + 14) != 1
        || validated_u32(bytes, footer + 16) != 32
        || validated_u32(bytes, footer + 20) != total_length
        || validated_u32(bytes, footer + 24) != canonical_length
        || validated_u32(bytes, footer + 28) != field_count
    {
        return Err(corruption(DecodeCheck::Footer, footer));
    }
    let footer_hash = validated_array::<32>(bytes, footer + 32);

    let mut logical_offsets = [0_u32; 4];
    let mut logical_cursor = u64::from(header_bytes);
    for (index, entry) in entries.iter().enumerate() {
        logical_cursor = align8_bounded(logical_cursor);
        logical_offsets[index] = bounded_u64_to_u32(logical_cursor);
        logical_cursor = logical_cursor
            .checked_add(u64::from(entry.logical_length))
            .ok_or(corruption(DecodeCheck::LogicalLayout, 24))?;
    }
    let logical_footer = align8_decode(logical_cursor, DecodeCheck::LogicalLayout, 24)?;
    let derived_canonical = logical_footer
        .checked_add(FOOTER_BYTES)
        .ok_or(corruption(DecodeCheck::LogicalLayout, 24))?;
    if derived_canonical != u64::from(canonical_length) {
        return Err(corruption(DecodeCheck::LogicalLayout, 24));
    }

    Ok(ParsedEnvelope {
        entries,
        logical_offsets,
        total_length,
        canonical_length,
        field_count,
        footer_hash,
        compressed_sections,
    })
}

fn validate_checksum(bytes: &[u8], expected: u32) -> Result<(), DecodeError> {
    let mut digest = CRC32C.digest();
    digest.update(
        bytes
            .get(..32)
            .ok_or(corruption(DecodeCheck::Checksum, 0))?,
    );
    digest.update(&[0; 4]);
    digest.update(
        bytes
            .get(36..)
            .ok_or(corruption(DecodeCheck::Checksum, 36))?,
    );
    if digest.finalize() != expected {
        return Err(corruption(DecodeCheck::Checksum, 32));
    }
    Ok(())
}

fn decode_logical_sections<'a>(
    bytes: &'a [u8],
    envelope: &ParsedEnvelope,
) -> Result<[Cow<'a, [u8]>; 4], DecodeError> {
    let mut sections = std::array::from_fn(|_| Cow::Borrowed(&[][..]));
    for (index, entry) in envelope.entries.iter().copied().enumerate() {
        let start = bounded_u64_to_usize(u64::from(entry.stored_offset));
        let end = start
            .checked_add(bounded_u64_to_usize(u64::from(entry.stored_length)))
            .ok_or(corruption(DecodeCheck::Directory, start))?;
        let stored = bytes
            .get(start..end)
            .ok_or(corruption(DecodeCheck::Directory, start))?;
        if entry.flags & 1 == 0 {
            sections[index] = Cow::Borrowed(stored);
        } else {
            sections[index] = Cow::Owned(decode_compressed_section(stored, entry)?);
        }
    }
    Ok(sections)
}

#[derive(Clone, Copy)]
struct CompressionDescriptor {
    logical_offset: usize,
    logical_length: usize,
    stored_offset: usize,
    stored_length: usize,
    raw: bool,
}

#[allow(
    clippy::too_many_lines,
    reason = "header, table, and bounded block passes intentionally remain visibly ordered"
)]
fn decode_compressed_section(stored: &[u8], entry: DirectoryEntry) -> Result<Vec<u8>, DecodeError> {
    if stored.len() < 32
        || stored.get(..8) != Some(COMPRESSION_MAGIC.as_slice())
        || read_u16(stored, 8, DecodeCheck::CompressionHeader)? != 1
        || read_u16(stored, 10, DecodeCheck::CompressionHeader)? != 32
        || read_u16(stored, 12, DecodeCheck::CompressionHeader)? != 24
        || read_u8(stored, 14, DecodeCheck::CompressionHeader)? != 15
        || read_u8(stored, 15, DecodeCheck::CompressionHeader)? != 0
        || read_u32(stored, 20, DecodeCheck::CompressionHeader)? != entry.logical_length
        || read_u32(stored, 28, DecodeCheck::CompressionHeader)? != 0
        || entry.codec_id != 1
        || entry.codec_profile_id != 1
    {
        return Err(corruption(DecodeCheck::CompressionHeader, 0));
    }
    let block_count = read_u32(stored, 16, DecodeCheck::CompressionHeader)?;
    let expected_blocks = entry
        .logical_length
        .div_ceil(bounded_usize_to_u32(COMPRESSION_BLOCK_BYTES));
    let table_length = u64::from(block_count)
        .checked_mul(24)
        .ok_or(corruption(DecodeCheck::CompressionTable, 16))?;
    let expected_payload_offset = 32_u64
        .checked_add(table_length)
        .ok_or(corruption(DecodeCheck::CompressionTable, 16))?;
    let payload_offset = read_u32(stored, 24, DecodeCheck::CompressionHeader)?;
    if block_count == 0
        || block_count != expected_blocks
        || block_count > 512
        || u64::from(payload_offset) != expected_payload_offset
        || expected_payload_offset > bounded_usize_to_u64(stored.len())
    {
        return Err(corruption(DecodeCheck::CompressionTable, 16));
    }

    let mut descriptors = Vec::with_capacity(bounded_u64_to_usize(u64::from(block_count)));
    let mut logical_cursor = 0_u64;
    let mut stored_cursor = expected_payload_offset;
    for index in 0..bounded_u64_to_usize(u64::from(block_count)) {
        let descriptor = 32 + index * 24;
        let logical_offset = read_u32(stored, descriptor, DecodeCheck::CompressionTable)?;
        let logical_length = read_u32(stored, descriptor + 4, DecodeCheck::CompressionTable)?;
        let stored_offset = read_u32(stored, descriptor + 8, DecodeCheck::CompressionTable)?;
        let stored_length = read_u32(stored, descriptor + 12, DecodeCheck::CompressionTable)?;
        let flags = read_u16(stored, descriptor + 16, DecodeCheck::CompressionTable)?;
        let reserved_0 = read_u16(stored, descriptor + 18, DecodeCheck::CompressionTable)?;
        let reserved_1 = read_u32(stored, descriptor + 20, DecodeCheck::CompressionTable)?;
        let remaining = u64::from(entry.logical_length)
            .checked_sub(logical_cursor)
            .ok_or(corruption(DecodeCheck::CompressionTable, descriptor))?;
        let expected_logical_length = remaining.min(bounded_usize_to_u64(COMPRESSION_BLOCK_BYTES));
        let raw = flags & 1 != 0;
        if u64::from(logical_offset) != logical_cursor
            || u64::from(logical_length) != expected_logical_length
            || u64::from(stored_offset) != stored_cursor
            || stored_length == 0
            || u64::from(stored_length) > bounded_usize_to_u64(COMPRESSION_BLOCK_BYTES)
            || flags & !1 != 0
            || reserved_0 != 0
            || reserved_1 != 0
            || (raw && stored_length != logical_length)
            || (!raw && stored_length >= logical_length)
        {
            return Err(corruption(DecodeCheck::CompressionTable, descriptor));
        }
        logical_cursor = logical_cursor
            .checked_add(u64::from(logical_length))
            .ok_or(corruption(DecodeCheck::CompressionTable, descriptor))?;
        stored_cursor = stored_cursor
            .checked_add(u64::from(stored_length))
            .ok_or(corruption(DecodeCheck::CompressionTable, descriptor))?;
        if stored_cursor > bounded_usize_to_u64(stored.len()) {
            return Err(corruption(DecodeCheck::CompressionTable, descriptor));
        }
        descriptors.push(CompressionDescriptor {
            logical_offset: bounded_u64_to_usize(u64::from(logical_offset)),
            logical_length: bounded_u64_to_usize(u64::from(logical_length)),
            stored_offset: bounded_u64_to_usize(u64::from(stored_offset)),
            stored_length: bounded_u64_to_usize(u64::from(stored_length)),
            raw,
        });
    }
    if logical_cursor != u64::from(entry.logical_length)
        || stored_cursor != bounded_usize_to_u64(stored.len())
    {
        return Err(corruption(DecodeCheck::CompressionTable, 16));
    }

    let mut output = vec![0_u8; bounded_u64_to_usize(u64::from(entry.logical_length))];
    for descriptor in descriptors {
        let logical_end = descriptor.logical_offset + descriptor.logical_length;
        let stored_end = descriptor.stored_offset + descriptor.stored_length;
        let input = &stored[descriptor.stored_offset..stored_end];
        let target = &mut output[descriptor.logical_offset..logical_end];
        if descriptor.raw {
            target.copy_from_slice(input);
        } else {
            let decoded = lz4_flex::block::decompress_into(input, target)
                .map_err(|_| corruption(DecodeCheck::CompressionBlock, descriptor.stored_offset))?;
            if decoded != descriptor.logical_length {
                return Err(corruption(
                    DecodeCheck::CompressionBlock,
                    descriptor.stored_offset,
                ));
            }
        }
    }
    Ok(output)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct NameRecord {
    absolute_offset: u32,
    local_offset: usize,
    length: u16,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ValueReference {
    tag: u8,
    offset: u32,
    length: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct FieldRecord {
    field_id: u32,
    name_offset: u32,
    name_length: u16,
    value: ValueReference,
    presentation_ordinal: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct ContainerRecord {
    tag: u8,
    depth: u16,
    item_start: usize,
    item_count: usize,
    recursive_fields: u32,
    parent_id: u32,
    parent_slot: u32,
}

struct ValidatedLogicalSections {
    names: Vec<NameRecord>,
    fields: Vec<FieldRecord>,
    arrays: Vec<ValueReference>,
    containers: Vec<ContainerRecord>,
    presentation_fields: Vec<usize>,
    content_hash: [u8; 32],
}

fn validate_logical_sections<S: AsRef<[u8]>>(
    sections: &[S; 4],
    envelope: &ParsedEnvelope,
) -> Result<ValidatedLogicalSections, DecodeError> {
    let sections = sections.each_ref().map(AsRef::as_ref);
    let expected_field_bytes = u64::from(envelope.field_count)
        .checked_mul(FIELD_ENTRY_BYTES)
        .ok_or(corruption(DecodeCheck::FieldTable, 0))?;
    if expected_field_bytes != bounded_usize_to_u64(sections[0].len())
        || envelope.entries[0].item_count != envelope.field_count
    {
        return Err(corruption(DecodeCheck::FieldTable, 0));
    }
    if envelope.entries[1].item_count > envelope.field_count {
        return Err(corruption(DecodeCheck::NamePool, 0));
    }
    let names = parse_names(
        sections[1],
        envelope.logical_offsets[1],
        envelope.entries[1].item_count,
    )?;
    let fields = parse_fields(sections[0], envelope.field_count)?;
    let (containers, arrays) = parse_containers_and_arrays(
        sections[3],
        envelope.logical_offsets[0],
        envelope.logical_offsets[3],
        envelope.field_count,
        envelope.entries[3].item_count,
    )?;
    let (root_id_field, presentation_fields) =
        validate_records_and_tree(&sections, envelope, &names, &fields, &arrays, &containers)?;
    validate_value_area(
        sections[2],
        envelope.logical_offsets[2],
        envelope.entries[2].item_count,
        &fields,
        &arrays,
        &containers,
    )?;
    validate_decoded_root_id(
        &fields[root_id_field],
        sections[2],
        envelope.logical_offsets[2],
    )?;
    let content_hash_result = hash_decoded_document(
        sections[1],
        sections[2],
        envelope.logical_offsets[2],
        envelope.logical_offsets[3],
        &names,
        &fields,
        &arrays,
        &containers,
    );
    let content_hash = content_hash_result?;
    Ok(ValidatedLogicalSections {
        names,
        fields,
        arrays,
        containers,
        presentation_fields,
        content_hash,
    })
}

fn parse_names(
    section: &[u8],
    logical_offset: u32,
    count: u32,
) -> Result<Vec<NameRecord>, DecodeError> {
    let table_length = u64::from(count)
        .checked_mul(NAME_RECORD_BYTES)
        .ok_or(corruption(DecodeCheck::NamePool, 0))?;
    if table_length > bounded_usize_to_u64(section.len()) {
        return Err(corruption(DecodeCheck::NamePool, 0));
    }
    let mut records = Vec::with_capacity(bounded_u64_to_usize(u64::from(count)));
    let mut expected_absolute = u64::from(logical_offset) + table_length;
    let section_end = u64::from(logical_offset) + bounded_usize_to_u64(section.len());
    let mut previous: Option<&[u8]> = None;
    for index in 0..bounded_u64_to_usize(u64::from(count)) {
        let record_offset = index * bounded_u64_to_usize(NAME_RECORD_BYTES);
        let absolute_offset = read_u32(section, record_offset, DecodeCheck::NamePool)?;
        let length = read_u16(section, record_offset + 4, DecodeCheck::NamePool)?;
        let scalar_count = read_u16(section, record_offset + 6, DecodeCheck::NamePool)?;
        let end = expected_absolute
            .checked_add(u64::from(length))
            .ok_or(corruption(DecodeCheck::NamePool, record_offset))?;
        if u64::from(absolute_offset) != expected_absolute
            || length == 0
            || u64::from(length) > MAX_FIELD_NAME_BYTES
            || scalar_count == 0
            || u64::from(scalar_count) > MAX_FIELD_NAME_SCALARS
            || end > section_end
        {
            return Err(corruption(DecodeCheck::NamePool, record_offset));
        }
        let local_offset = bounded_u64_to_usize(expected_absolute - u64::from(logical_offset));
        let local_end = local_offset + usize::from(length);
        let bytes = section
            .get(local_offset..local_end)
            .ok_or(corruption(DecodeCheck::NamePool, local_offset))?;
        let Ok(name) = std::str::from_utf8(bytes) else {
            return Err(corruption(DecodeCheck::NamePool, local_offset));
        };
        if name.chars().count() != usize::from(scalar_count)
            || !valid_decoded_field_name(name)
            || previous.is_some_and(|candidate| candidate >= bytes)
        {
            return Err(corruption(DecodeCheck::NamePool, local_offset));
        }
        records.push(NameRecord {
            absolute_offset,
            local_offset,
            length,
        });
        previous = Some(bytes);
        expected_absolute = end;
    }
    if expected_absolute != section_end {
        return Err(corruption(DecodeCheck::NamePool, section.len()));
    }
    Ok(records)
}

fn valid_decoded_field_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('$')
        && !name.contains('.')
        && !name
            .chars()
            .any(|character| matches!(character, '\0'..='\u{1f}' | '\u{7f}'))
}

fn parse_fields(section: &[u8], count: u32) -> Result<Vec<FieldRecord>, DecodeError> {
    let mut fields = Vec::with_capacity(bounded_u64_to_usize(u64::from(count)));
    for index in 0..bounded_u64_to_usize(u64::from(count)) {
        let offset = index * bounded_u64_to_usize(FIELD_ENTRY_BYTES);
        let tag = read_u8(section, offset + 10, DecodeCheck::FieldTable)?;
        if read_u8(section, offset + 11, DecodeCheck::FieldTable)? != 0 || !assigned_tag(tag) {
            return Err(corruption(DecodeCheck::FieldTable, offset + 10));
        }
        fields.push(FieldRecord {
            field_id: read_u32(section, offset, DecodeCheck::FieldTable)?,
            name_offset: read_u32(section, offset + 4, DecodeCheck::FieldTable)?,
            name_length: read_u16(section, offset + 8, DecodeCheck::FieldTable)?,
            value: ValueReference {
                tag,
                offset: read_u32(section, offset + 12, DecodeCheck::FieldTable)?,
                length: read_u32(section, offset + 16, DecodeCheck::FieldTable)?,
            },
            presentation_ordinal: read_u32(section, offset + 20, DecodeCheck::FieldTable)?,
        });
    }
    Ok(fields)
}

#[allow(
    clippy::too_many_lines,
    reason = "descriptor and array suffix validation share one canonical cursor audit"
)]
fn parse_containers_and_arrays(
    section: &[u8],
    field_logical_offset: u32,
    container_logical_offset: u32,
    field_count: u32,
    container_count: u32,
) -> Result<(Vec<ContainerRecord>, Vec<ValueReference>), DecodeError> {
    if container_count == 0 {
        return Err(corruption(DecodeCheck::ContainerTables, 0));
    }
    let descriptor_bytes = u64::from(container_count)
        .checked_mul(CONTAINER_DESCRIPTOR_BYTES)
        .ok_or(corruption(DecodeCheck::ContainerTables, 0))?;
    if descriptor_bytes > bounded_usize_to_u64(section.len()) {
        return Err(corruption(DecodeCheck::ContainerTables, 0));
    }
    let suffix_bytes = bounded_usize_to_u64(section.len()) - descriptor_bytes;
    if !suffix_bytes.is_multiple_of(ARRAY_ENTRY_BYTES) {
        return Err(corruption(
            DecodeCheck::ContainerTables,
            bounded_u64_to_usize(descriptor_bytes),
        ));
    }
    let array_count = suffix_bytes / ARRAY_ENTRY_BYTES;
    let mut arrays = Vec::with_capacity(bounded_u64_to_usize(array_count));
    for index in 0..bounded_u64_to_usize(array_count) {
        let offset = bounded_u64_to_usize(descriptor_bytes)
            + index * bounded_u64_to_usize(ARRAY_ENTRY_BYTES);
        let tag = read_u8(section, offset, DecodeCheck::ContainerTables)?;
        if !assigned_tag(tag)
            || read_u8(section, offset + 1, DecodeCheck::ContainerTables)? != 0
            || read_u16(section, offset + 2, DecodeCheck::ContainerTables)? != 0
        {
            return Err(corruption(DecodeCheck::ContainerTables, offset));
        }
        arrays.push(ValueReference {
            tag,
            offset: read_u32(section, offset + 4, DecodeCheck::ContainerTables)?,
            length: read_u32(section, offset + 8, DecodeCheck::ContainerTables)?,
        });
    }

    let mut containers = Vec::with_capacity(bounded_u64_to_usize(u64::from(container_count)));
    let mut field_cursor = 0_u64;
    let mut array_cursor = 0_u64;
    for index in 0..bounded_u64_to_usize(u64::from(container_count)) {
        let offset = index * bounded_u64_to_usize(CONTAINER_DESCRIPTOR_BYTES);
        let container_id = read_u32(section, offset, DecodeCheck::ContainerTables)?;
        let tag = read_u8(section, offset + 4, DecodeCheck::ContainerTables)?;
        let flags = read_u8(section, offset + 5, DecodeCheck::ContainerTables)?;
        let depth = read_u16(section, offset + 6, DecodeCheck::ContainerTables)?;
        let item_offset = read_u32(section, offset + 8, DecodeCheck::ContainerTables)?;
        let item_count = read_u32(section, offset + 12, DecodeCheck::ContainerTables)?;
        let recursive_fields = read_u32(section, offset + 16, DecodeCheck::ContainerTables)?;
        let parent_id = read_u32(section, offset + 20, DecodeCheck::ContainerTables)?;
        let parent_slot = read_u32(section, offset + 24, DecodeCheck::ContainerTables)?;
        let reserved = read_u32(section, offset + 28, DecodeCheck::ContainerTables)?;
        if container_id != bounded_usize_to_u32(index)
            || !matches!(tag, 9 | 10)
            || flags != 0
            || reserved != 0
            || depth == 0
            || recursive_fields > field_count
        {
            return Err(corruption(DecodeCheck::ContainerTables, offset));
        }
        if u64::from(depth) > MAX_DEPTH {
            return Err(corruption(DecodeCheck::Limit, offset + 6));
        }
        if index == 0 {
            if tag != 9 || depth != 1 || parent_id != ROOT_SENTINEL || parent_slot != ROOT_SENTINEL
            {
                return Err(corruption(DecodeCheck::ContainerTables, offset));
            }
        } else if parent_id == ROOT_SENTINEL || parent_slot == ROOT_SENTINEL {
            return Err(corruption(DecodeCheck::ContainerTables, offset + 20));
        }
        let (expected_item_offset, item_start, maximum) = if tag == 9 {
            (
                u64::from(field_logical_offset) + field_cursor * FIELD_ENTRY_BYTES,
                field_cursor,
                MAX_OBJECT_FIELDS,
            )
        } else {
            (
                u64::from(container_logical_offset)
                    + descriptor_bytes
                    + array_cursor * ARRAY_ENTRY_BYTES,
                array_cursor,
                MAX_ARRAY_ELEMENTS,
            )
        };
        if u64::from(item_count) > maximum {
            return Err(corruption(DecodeCheck::Limit, offset + 12));
        }
        if u64::from(item_offset) != expected_item_offset {
            return Err(corruption(DecodeCheck::ContainerTables, offset + 8));
        }
        let end = item_start
            .checked_add(u64::from(item_count))
            .ok_or(corruption(DecodeCheck::ContainerTables, offset + 12))?;
        if (tag == 9 && end > u64::from(field_count)) || (tag == 10 && end > array_count) {
            return Err(corruption(DecodeCheck::ContainerTables, offset + 12));
        }
        if tag == 9 {
            field_cursor = end;
        } else {
            array_cursor = end;
        }
        containers.push(ContainerRecord {
            tag,
            depth,
            item_start: bounded_u64_to_usize(item_start),
            item_count: bounded_u64_to_usize(u64::from(item_count)),
            recursive_fields,
            parent_id,
            parent_slot,
        });
    }
    if field_cursor != u64::from(field_count) || array_cursor != array_count {
        return Err(corruption(DecodeCheck::ContainerTables, section.len()));
    }
    Ok((containers, arrays))
}

#[allow(
    clippy::too_many_lines,
    reason = "record ownership, breadth-first reachability, and recursive counts form one audit"
)]
fn validate_records_and_tree<S: AsRef<[u8]>>(
    sections: &[S; 4],
    envelope: &ParsedEnvelope,
    names: &[NameRecord],
    fields: &[FieldRecord],
    arrays: &[ValueReference],
    containers: &[ContainerRecord],
) -> Result<(usize, Vec<usize>), DecodeError> {
    let sections = sections.each_ref().map(AsRef::as_ref);
    let mut name_uses = vec![0_u32; names.len()];
    let mut presentation_fields = vec![0_usize; fields.len()];
    let mut root_id_field = None;
    for (container_id, container) in containers.iter().enumerate() {
        if container.tag != 9 {
            continue;
        }
        let mut previous_id = None;
        let mut ordinals = vec![false; container.item_count];
        for slot in 0..container.item_count {
            let field_index = container.item_start + slot;
            let field = fields
                .get(field_index)
                .ok_or(corruption(DecodeCheck::FieldTable, field_index * 24))?;
            let name_index = bounded_u64_to_usize(u64::from(field.field_id));
            let name = names
                .get(name_index)
                .ok_or(corruption(DecodeCheck::FieldTable, field_index * 24))?;
            if previous_id.is_some_and(|candidate| candidate >= field.field_id)
                || field.name_offset != name.absolute_offset
                || field.name_length != name.length
            {
                return Err(corruption(DecodeCheck::FieldTable, field_index * 24));
            }
            previous_id = Some(field.field_id);
            let ordinal = bounded_u64_to_usize(u64::from(field.presentation_ordinal));
            let ordinal_slot = ordinals
                .get_mut(ordinal)
                .ok_or(corruption(DecodeCheck::FieldTable, field_index * 24 + 20))?;
            if *ordinal_slot {
                return Err(corruption(DecodeCheck::FieldTable, field_index * 24 + 20));
            }
            *ordinal_slot = true;
            let presentation_index = container
                .item_start
                .checked_add(ordinal)
                .ok_or(corruption(DecodeCheck::FieldTable, field_index * 24 + 20))?;
            let presentation_slot = presentation_fields
                .get_mut(presentation_index)
                .ok_or(corruption(DecodeCheck::FieldTable, field_index * 24 + 20))?;
            *presentation_slot = field_index;
            name_uses[name_index] = name_uses[name_index]
                .checked_add(1)
                .ok_or(corruption(DecodeCheck::NamePool, name.local_offset))?;
            if container_id == 0 {
                let name_bytes = name_bytes(sections[1], name)?;
                if matches!(name_bytes, b"_v" | b"_ts") {
                    return Err(corruption(DecodeCheck::RootId, field_index * 24));
                }
                if name_bytes == b"_id" {
                    root_id_field = Some(field_index);
                }
            }
        }
    }
    if name_uses.contains(&0) {
        return Err(corruption(DecodeCheck::NamePool, 0));
    }
    let root_id_field = root_id_field.ok_or(corruption(DecodeCheck::RootId, 0))?;

    let mut next_child = 1_usize;
    let mut noncontainer_values = 0_u64;
    for (container_id, container) in containers.iter().enumerate() {
        for slot in 0..container.item_count {
            let reference = container_reference(container, slot, fields, arrays)?;
            if matches!(reference.tag, 9 | 10) {
                let child = containers
                    .get(next_child)
                    .ok_or(corruption(DecodeCheck::ContainerTables, container_id * 32))?;
                let expected_offset = u64::from(envelope.logical_offsets[3])
                    + bounded_usize_to_u64(next_child) * CONTAINER_DESCRIPTOR_BYTES;
                if u64::from(reference.offset) != expected_offset
                    || u64::from(reference.length) != CONTAINER_DESCRIPTOR_BYTES
                    || child.tag != reference.tag
                    || child.parent_id != bounded_usize_to_u32(container_id)
                    || child.parent_slot != bounded_usize_to_u32(slot)
                    || child.depth != container.depth.checked_add(1).unwrap_or(0)
                {
                    return Err(corruption(DecodeCheck::ContainerTables, container_id * 32));
                }
                next_child += 1;
            } else {
                noncontainer_values = noncontainer_values
                    .checked_add(1)
                    .ok_or(corruption(DecodeCheck::ValueArea, 0))?;
            }
        }
    }
    if next_child != containers.len()
        || noncontainer_values != u64::from(envelope.entries[2].item_count)
    {
        return Err(corruption(DecodeCheck::ContainerTables, 0));
    }

    let mut recursive = vec![0_u32; containers.len()];
    for index in (0..containers.len()).rev() {
        let container = &containers[index];
        let mut count = if container.tag == 9 {
            bounded_usize_to_u32(container.item_count)
        } else {
            0
        };
        for slot in 0..container.item_count {
            let reference = container_reference(container, slot, fields, arrays)?;
            if matches!(reference.tag, 9 | 10) {
                let child_index = decoded_child_index(reference, envelope.logical_offsets[3])?;
                let child_count = *recursive
                    .get(child_index)
                    .ok_or(corruption(DecodeCheck::ContainerTables, index * 32))?;
                count = count
                    .checked_add(child_count)
                    .ok_or(corruption(DecodeCheck::ContainerTables, index * 32 + 16))?;
            }
        }
        if count != container.recursive_fields {
            return Err(corruption(DecodeCheck::ContainerTables, index * 32 + 16));
        }
        recursive[index] = count;
    }
    if recursive.first().copied() != Some(envelope.field_count) {
        return Err(corruption(DecodeCheck::ContainerTables, 16));
    }
    Ok((root_id_field, presentation_fields))
}

fn container_reference(
    container: &ContainerRecord,
    slot: usize,
    fields: &[FieldRecord],
    arrays: &[ValueReference],
) -> Result<ValueReference, DecodeError> {
    let index = container
        .item_start
        .checked_add(slot)
        .ok_or(corruption(DecodeCheck::ContainerTables, 0))?;
    if container.tag == 9 {
        fields
            .get(index)
            .map(|field| field.value)
            .ok_or(corruption(DecodeCheck::FieldTable, index * 24))
    } else {
        arrays
            .get(index)
            .copied()
            .ok_or(corruption(DecodeCheck::ContainerTables, index * 12))
    }
}

fn decoded_child_index(
    reference: ValueReference,
    container_logical_offset: u32,
) -> Result<usize, DecodeError> {
    let relative = reference
        .offset
        .checked_sub(container_logical_offset)
        .ok_or(corruption(DecodeCheck::ContainerTables, 0))?;
    if !relative.is_multiple_of(bounded_u64_to_u32(CONTAINER_DESCRIPTOR_BYTES)) {
        return Err(corruption(DecodeCheck::ContainerTables, 0));
    }
    Ok(bounded_u64_to_usize(
        u64::from(relative) / CONTAINER_DESCRIPTOR_BYTES,
    ))
}

fn lookup_name_id(data: ViewData<'_>, name: &str) -> Option<u32> {
    let needle = name.as_bytes();
    let mut start = 0_usize;
    let mut end = data.names.len();
    while start < end {
        let middle = start + (end - start) / 2;
        let candidate = name_bytes(data.sections[1], data.names.get(middle)?).ok()?;
        match candidate.cmp(needle) {
            std::cmp::Ordering::Less => start = middle + 1,
            std::cmp::Ordering::Equal => return Some(bounded_usize_to_u32(middle)),
            std::cmp::Ordering::Greater => end = middle,
        }
    }
    None
}

fn lookup_object_field_index(
    data: ViewData<'_>,
    container: &ContainerRecord,
    field_id: u32,
) -> Option<usize> {
    let mut start = container.item_start;
    let mut end = start.checked_add(container.item_count)?;
    while start < end {
        let middle = start + (end - start) / 2;
        let candidate = data.fields.get(middle)?.field_id;
        match candidate.cmp(&field_id) {
            std::cmp::Ordering::Less => start = middle + 1,
            std::cmp::Ordering::Equal => return Some(middle),
            std::cmp::Ordering::Greater => end = middle,
        }
    }
    None
}

fn field_view(data: ViewData<'_>, field_index: usize) -> Option<FieldView<'_>> {
    let field = data.fields.get(field_index)?;
    let name = data
        .names
        .get(bounded_u64_to_usize(u64::from(field.field_id)))?;
    let name = std::str::from_utf8(name_bytes(data.sections[1], name).ok()?).ok()?;
    Some(FieldView {
        name,
        value: value_view(data, field.value)?,
        presentation_ordinal: field.presentation_ordinal,
    })
}

fn value_view(data: ViewData<'_>, reference: ValueReference) -> Option<ValueView<'_>> {
    if matches!(reference.tag, 9 | 10) {
        let container_id = decoded_child_index(reference, data.logical_offsets[3]).ok()?;
        let container = data.containers.get(container_id)?;
        return match container.tag {
            9 => Some(ValueView::Object(ObjectView { data, container_id })),
            10 => Some(ValueView::Array(ArrayView { data, container_id })),
            _ => None,
        };
    }
    let start = reference.offset.checked_sub(data.logical_offsets[2])?;
    let end = start.checked_add(reference.length)?;
    let payload = data.sections[2]
        .get(bounded_u64_to_usize(u64::from(start))..bounded_u64_to_usize(u64::from(end)))?;
    match reference.tag {
        1 if payload.is_empty() => Some(ValueView::Null),
        2 => Some(ValueView::Bool(*payload.first()? != 0)),
        3 => Some(ValueView::Int32(i32::from_le_bytes(
            <[u8; 4]>::try_from(payload).ok()?,
        ))),
        4 => Some(ValueView::Int64(i64::from_le_bytes(
            <[u8; 8]>::try_from(payload).ok()?,
        ))),
        5 => Some(ValueView::Float64Bits(u64::from_le_bytes(
            <[u8; 8]>::try_from(payload).ok()?,
        ))),
        6 => Some(ValueView::Decimal128(decode_decimal_payload(payload)?)),
        7 => Some(ValueView::String(std::str::from_utf8(payload).ok()?)),
        8 => {
            let (&subtype, bytes) = payload.split_first()?;
            Some(ValueView::Binary(BinaryView { subtype, bytes }))
        }
        11 => Some(ValueView::Timestamp(i64::from_le_bytes(
            <[u8; 8]>::try_from(payload).ok()?,
        ))),
        12 => Some(ValueView::Date(i32::from_le_bytes(
            <[u8; 4]>::try_from(payload).ok()?,
        ))),
        13 => Some(ValueView::Uuid(<[u8; 16]>::try_from(payload).ok()?)),
        14 => Some(ValueView::ObjectId(<[u8; 12]>::try_from(payload).ok()?)),
        15 => {
            let count = u32::from_le_bytes(<[u8; 4]>::try_from(payload.get(..4)?).ok()?);
            let element_bytes = payload.get(4..)?;
            if bounded_u64_to_usize(u64::from(count)).checked_mul(4)? != element_bytes.len() {
                return None;
            }
            Some(ValueView::VectorF32(VectorF32View { element_bytes }))
        }
        16 => {
            let count = u32::from_le_bytes(<[u8; 4]>::try_from(payload.get(..4)?).ok()?);
            let element_bytes = payload.get(4..)?;
            if bounded_u64_to_usize(u64::from(count)).checked_mul(2)? != element_bytes.len() {
                return None;
            }
            Some(ValueView::VectorF16(VectorF16View { element_bytes }))
        }
        _ => None,
    }
}

fn validate_value_area(
    section: &[u8],
    logical_offset: u32,
    expected_count: u32,
    fields: &[FieldRecord],
    arrays: &[ValueReference],
    containers: &[ContainerRecord],
) -> Result<(), DecodeError> {
    let mut cursor = u64::from(logical_offset);
    let section_end = cursor + bounded_usize_to_u64(section.len());
    let mut count = 0_u64;
    for container in containers {
        for slot in 0..container.item_count {
            let reference = container_reference(container, slot, fields, arrays)?;
            if matches!(reference.tag, 9 | 10) {
                continue;
            }
            let alignment = payload_alignment_for_tag(reference.tag)
                .ok_or(corruption(DecodeCheck::Payload, 0))?;
            let aligned = align_decode(cursor, alignment, DecodeCheck::ValueArea)?;
            if u64::from(reference.offset) != aligned {
                return Err(corruption(DecodeCheck::ValueArea, 0));
            }
            require_zero_range(
                section,
                cursor - u64::from(logical_offset),
                aligned - u64::from(logical_offset),
                DecodeCheck::ValueArea,
            )?;
            let end = aligned
                .checked_add(u64::from(reference.length))
                .ok_or(corruption(DecodeCheck::ValueArea, 0))?;
            if end > section_end {
                return Err(corruption(DecodeCheck::ValueArea, 0));
            }
            let local = bounded_u64_to_usize(aligned - u64::from(logical_offset));
            let local_end = bounded_u64_to_usize(end - u64::from(logical_offset));
            let payload = section
                .get(local..local_end)
                .ok_or(corruption(DecodeCheck::Payload, local))?;
            validate_payload(reference.tag, payload, local)?;
            cursor = end;
            count = count
                .checked_add(1)
                .ok_or(corruption(DecodeCheck::ValueArea, local))?;
        }
    }
    if cursor != section_end || count != u64::from(expected_count) {
        return Err(corruption(DecodeCheck::ValueArea, section.len()));
    }
    Ok(())
}

fn validate_payload(tag: u8, payload: &[u8], offset: usize) -> Result<(), DecodeError> {
    let valid = match tag {
        1 => payload.is_empty(),
        2 => payload.len() == 1 && matches!(payload.first(), Some(0 | 1)),
        3 => payload.len() == 4,
        4 | 5 => payload.len() == 8,
        6 => validate_decimal_payload(payload),
        7 => std::str::from_utf8(payload).is_ok(),
        8 => payload.first() == Some(&0),
        11 => {
            payload.len() == 8
                && read_i64(payload, 0, DecodeCheck::Payload)
                    .is_ok_and(|value| (TIMESTAMP_MIN..=TIMESTAMP_MAX).contains(&value))
        }
        12 => {
            payload.len() == 4
                && read_i32(payload, 0, DecodeCheck::Payload)
                    .is_ok_and(|value| (DATE_MIN..=DATE_MAX).contains(&value))
        }
        13 => payload.len() == 16,
        14 => payload.len() == 12,
        15 => validate_vector_payload(payload, 4, 23, 0xff),
        16 => validate_vector_payload(payload, 2, 10, 0x1f),
        _ => false,
    };
    if !valid {
        return Err(corruption(DecodeCheck::Payload, offset));
    }
    Ok(())
}

fn validate_decimal_payload(payload: &[u8]) -> bool {
    decode_decimal_payload(payload).is_some()
}

fn decode_decimal_payload(payload: &[u8]) -> Option<Decimal128> {
    let bytes = <[u8; 16]>::try_from(payload).ok()?;
    let bits = u128::from_le_bytes(bytes);
    let logical = match bits {
        0x7800_0000_0000_0000_0000_0000_0000_0000 => Decimal128::PositiveInfinity,
        0xf800_0000_0000_0000_0000_0000_0000_0000 => Decimal128::NegativeInfinity,
        0x7c00_0000_0000_0000_0000_0000_0000_0000 => Decimal128::NaN,
        _ => {
            let negative = bits >> 127 != 0;
            let coefficient_mask = (1_u128 << 113) - 1;
            let mut coefficient = bits & coefficient_mask;
            let biased_bits = (bits >> 113) & 0x3fff;
            #[allow(
                clippy::cast_possible_truncation,
                reason = "the preceding 14-bit mask proves the conversion is lossless"
            )]
            let biased = biased_bits as u16;
            let mut exponent = i32::from(biased) - 6_176;
            if coefficient == 0 {
                Decimal128::Zero { negative }
            } else {
                if exponent == 6_111 {
                    while coefficient.is_multiple_of(10) {
                        coefficient /= 10;
                        exponent += 1;
                    }
                }
                Decimal128::Finite {
                    negative,
                    coefficient,
                    exponent,
                }
            }
        }
    };
    (decimal_bytes(logical).ok()? == bytes).then_some(logical)
}

fn validate_vector_payload(payload: &[u8], width: usize, shift: u32, mask: u32) -> bool {
    if payload.len() < 4 || !matches!(width, 2 | 4) {
        return false;
    }
    let count = u32::from_le_bytes([payload[0], payload[1], payload[2], payload[3]]);
    if count == 0 || u64::from(count) > MAX_VECTOR_DIMENSION {
        return false;
    }
    let expected = bounded_u64_to_usize(u64::from(count)) * width + 4;
    if payload.len() != expected {
        return false;
    }
    payload[4..].chunks_exact(width).all(|element| {
        let bits = if width == 4 {
            u32::from_le_bytes([element[0], element[1], element[2], element[3]])
        } else {
            u32::from(u16::from_le_bytes([element[0], element[1]]))
        };
        (bits >> shift) & mask != mask
    })
}

fn validate_decoded_root_id(
    field: &FieldRecord,
    value_section: &[u8],
    value_logical_offset: u32,
) -> Result<(), DecodeError> {
    let accepted = match field.value.tag {
        3 | 4 | 13 | 14 => true,
        7 => u64::from(field.value.length) <= MAX_ID_PAYLOAD_BYTES,
        8 => field.value.length > 0 && u64::from(field.value.length - 1) <= MAX_ID_PAYLOAD_BYTES,
        _ => false,
    };
    if !accepted {
        return Err(corruption(DecodeCheck::RootId, 0));
    }
    let start = field
        .value
        .offset
        .checked_sub(value_logical_offset)
        .ok_or(corruption(DecodeCheck::RootId, 0))?;
    let end = start
        .checked_add(field.value.length)
        .ok_or(corruption(DecodeCheck::RootId, 0))?;
    if value_section
        .get(bounded_u64_to_usize(u64::from(start))..bounded_u64_to_usize(u64::from(end)))
        .is_none()
    {
        return Err(corruption(DecodeCheck::RootId, 0));
    }
    Ok(())
}

#[allow(
    clippy::too_many_arguments,
    reason = "the hash pass receives the four already-validated table slices and coordinate roots"
)]
fn hash_decoded_document(
    name_section: &[u8],
    value_section: &[u8],
    value_logical_offset: u32,
    container_logical_offset: u32,
    names: &[NameRecord],
    fields: &[FieldRecord],
    arrays: &[ValueReference],
    containers: &[ContainerRecord],
) -> Result<[u8; 32], DecodeError> {
    let mut digests = vec![[0_u8; 32]; containers.len()];
    for index in (0..containers.len()).rev() {
        let container = &containers[index];
        let mut hasher = Hasher::new();
        if container.tag == 9 {
            let end = container.item_start.saturating_add(container.item_count);
            let container_fields = fields.get(container.item_start..end).ok_or(corruption(
                DecodeCheck::TypedContentHash,
                container.item_start * 24,
            ))?;
            let mut body_length = 4_u64;
            let mut object_entries = Vec::with_capacity(container_fields.len());
            for field in container_fields {
                let name = names
                    .get(bounded_u64_to_usize(u64::from(field.field_id)))
                    .ok_or(corruption(DecodeCheck::TypedContentHash, 0))?;
                body_length = body_length
                    .checked_add(36 + u64::from(name.length))
                    .ok_or(corruption(DecodeCheck::TypedContentHash, 0))?;
                object_entries.push((field.value, name_bytes(name_section, name)?));
            }
            hash_frame_prefix(&mut hasher, 9, body_length);
            hasher.update(&bounded_usize_to_u32(container.item_count).to_le_bytes());
            for (value, bytes) in object_entries {
                hasher.update(&bounded_usize_to_u32(bytes.len()).to_le_bytes());
                hasher.update(bytes);
                let digest = decoded_value_digest(
                    value,
                    value_section,
                    value_logical_offset,
                    container_logical_offset,
                    &digests,
                )?;
                hasher.update(&digest);
            }
        } else {
            let body_length = 4_u64
                .checked_add(
                    bounded_usize_to_u64(container.item_count)
                        .checked_mul(36)
                        .ok_or(corruption(DecodeCheck::TypedContentHash, 0))?,
                )
                .ok_or(corruption(DecodeCheck::TypedContentHash, 0))?;
            hash_frame_prefix(&mut hasher, 10, body_length);
            hasher.update(&bounded_usize_to_u32(container.item_count).to_le_bytes());
            let end = container.item_start.saturating_add(container.item_count);
            let references = arrays.get(container.item_start..end).ok_or(corruption(
                DecodeCheck::TypedContentHash,
                container.item_start * 12,
            ))?;
            for (slot, reference) in references.iter().copied().enumerate() {
                hasher.update(&bounded_usize_to_u32(slot).to_le_bytes());
                let digest = decoded_value_digest(
                    reference,
                    value_section,
                    value_logical_offset,
                    container_logical_offset,
                    &digests,
                )?;
                hasher.update(&digest);
            }
        }
        digests[index].copy_from_slice(hasher.finalize().as_bytes());
    }
    digests
        .first()
        .copied()
        .ok_or(corruption(DecodeCheck::TypedContentHash, 0))
}

fn decoded_value_digest(
    reference: ValueReference,
    value_section: &[u8],
    value_logical_offset: u32,
    container_logical_offset: u32,
    digests: &[[u8; 32]],
) -> Result<[u8; 32], DecodeError> {
    if matches!(reference.tag, 9 | 10) {
        let child = decoded_child_index(reference, container_logical_offset)?;
        return digests
            .get(child)
            .copied()
            .ok_or(corruption(DecodeCheck::TypedContentHash, 0));
    }
    let start = reference
        .offset
        .checked_sub(value_logical_offset)
        .ok_or(corruption(DecodeCheck::TypedContentHash, 0))?;
    let end = start
        .checked_add(reference.length)
        .ok_or(corruption(DecodeCheck::TypedContentHash, 0))?;
    let payload = value_section
        .get(bounded_u64_to_usize(u64::from(start))..bounded_u64_to_usize(u64::from(end)))
        .ok_or(corruption(DecodeCheck::TypedContentHash, 0))?;
    let mut hasher = Hasher::new();
    hash_frame_prefix(&mut hasher, reference.tag, u64::from(reference.length));
    hasher.update(payload);
    Ok(*hasher.finalize().as_bytes())
}

fn name_bytes<'a>(section: &'a [u8], name: &NameRecord) -> Result<&'a [u8], DecodeError> {
    let end = name
        .local_offset
        .checked_add(usize::from(name.length))
        .ok_or(corruption(DecodeCheck::NamePool, name.local_offset))?;
    section
        .get(name.local_offset..end)
        .ok_or(corruption(DecodeCheck::NamePool, name.local_offset))
}

fn validate_canonical_envelope<S: AsRef<[u8]>>(
    bytes: &[u8],
    sections: &[S; 4],
    envelope: &ParsedEnvelope,
    content_hash: [u8; 32],
) -> Result<(), DecodeError> {
    let sections = sections.each_ref().map(AsRef::as_ref);
    let candidates = [
        compression_stream(sections[0]),
        compression_stream(sections[1]),
        compression_stream(sections[2]),
        compression_stream(sections[3]),
    ];
    let use_compression = envelope.compressed_sections != 0;
    if use_compression {
        let mut selected = 0_u8;
        for (index, candidate) in candidates.iter().enumerate() {
            let compressed = envelope.entries[index].flags & 1 != 0;
            if compressed != candidate.is_some() {
                return Err(corruption(DecodeCheck::CompressionCanonicality, index));
            }
            if let Some(candidate) = candidate {
                selected = selected
                    .checked_add(1)
                    .ok_or(corruption(DecodeCheck::CompressionCanonicality, index))?;
                let start = bounded_u64_to_usize(u64::from(envelope.entries[index].stored_offset));
                let end = start + candidate.len();
                if bytes.get(start..end) != Some(candidate.as_slice()) {
                    return Err(corruption(DecodeCheck::CompressionCanonicality, start));
                }
            }
        }
        if selected != envelope.compressed_sections
            || measure_stored_length(&sections, &candidates) >= u64::from(envelope.canonical_length)
        {
            return Err(corruption(DecodeCheck::CompressionCanonicality, 0));
        }
    }
    let Ok(rebuilt) = build_envelope(
        &sections,
        &candidates,
        [
            envelope.entries[0].item_count,
            envelope.entries[1].item_count,
            envelope.entries[2].item_count,
            envelope.entries[3].item_count,
        ],
        envelope.field_count,
        content_hash,
        envelope.canonical_length,
        use_compression,
    ) else {
        return Err(corruption(DecodeCheck::CompressionCanonicality, 0));
    };
    if rebuilt.len() != bounded_u64_to_usize(u64::from(envelope.total_length)) || rebuilt != bytes {
        return Err(corruption(DecodeCheck::CompressionCanonicality, 0));
    }
    Ok(())
}

const fn assigned_tag(tag: u8) -> bool {
    matches!(tag, 1..=16)
}

const fn payload_alignment_for_tag(tag: u8) -> Option<u64> {
    match tag {
        3 | 12 | 15 | 16 => Some(4),
        4 | 5 | 6 | 11 => Some(8),
        1 | 2 | 7 | 8 | 13 | 14 => Some(1),
        _ => None,
    }
}

fn align_decode(value: u64, alignment: u64, check: DecodeCheck) -> Result<u64, DecodeError> {
    let mask = alignment.checked_sub(1).ok_or(corruption(check, 0))?;
    value
        .checked_add(mask)
        .map(|candidate| candidate & !mask)
        .ok_or(corruption(check, 0))
}

fn validated_array<const N: usize>(input: &[u8], offset: usize) -> [u8; N] {
    let mut output = [0_u8; N];
    output.copy_from_slice(&input[offset..offset + N]);
    output
}

fn validated_u16(input: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes(validated_array(input, offset))
}

fn validated_u32(input: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(validated_array(input, offset))
}

fn validated_u64(input: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(validated_array(input, offset))
}

fn read_u8(input: &[u8], offset: usize, check: DecodeCheck) -> Result<u8, DecodeError> {
    input.get(offset).copied().ok_or(corruption(check, offset))
}

fn read_u16(input: &[u8], offset: usize, check: DecodeCheck) -> Result<u16, DecodeError> {
    Ok(u16::from_le_bytes(read_array::<2>(input, offset, check)?))
}

fn read_u32(input: &[u8], offset: usize, check: DecodeCheck) -> Result<u32, DecodeError> {
    Ok(u32::from_le_bytes(read_array::<4>(input, offset, check)?))
}

fn read_i32(input: &[u8], offset: usize, check: DecodeCheck) -> Result<i32, DecodeError> {
    Ok(i32::from_le_bytes(read_array::<4>(input, offset, check)?))
}

fn read_i64(input: &[u8], offset: usize, check: DecodeCheck) -> Result<i64, DecodeError> {
    Ok(i64::from_le_bytes(read_array::<8>(input, offset, check)?))
}

fn read_array<const N: usize>(
    input: &[u8],
    offset: usize,
    check: DecodeCheck,
) -> Result<[u8; N], DecodeError> {
    let end = offset.checked_add(N).ok_or(corruption(check, offset))?;
    let slice = input.get(offset..end).ok_or(corruption(check, offset))?;
    let mut output = [0_u8; N];
    output.copy_from_slice(slice);
    Ok(output)
}

fn align8_decode(value: u64, check: DecodeCheck, offset: usize) -> Result<u64, DecodeError> {
    value
        .checked_add(7)
        .map(|candidate| candidate & !7)
        .ok_or(corruption(check, offset))
}

fn require_zero_range(
    bytes: &[u8],
    start: u64,
    end: u64,
    check: DecodeCheck,
) -> Result<(), DecodeError> {
    let start = bounded_u64_to_usize(start);
    let end = bounded_u64_to_usize(end);
    let padding = bytes.get(start..end).ok_or(corruption(check, start))?;
    if let Some(relative) = padding.iter().position(|byte| *byte != 0) {
        return Err(corruption(check, start + relative));
    }
    Ok(())
}

fn corruption(check: DecodeCheck, offset: usize) -> DecodeError {
    let offset = u32::try_from(offset).unwrap_or(u32::MAX);
    DecodeError::Corruption { check, offset }
}

const fn unsupported(check: DecodeCheck, identifier: u64) -> DecodeError {
    DecodeError::UnsupportedFeature { check, identifier }
}

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;

    const INTEGRITY_FIXTURE: &str = include_str!("../../../docs/formats/hdoc-v1-integrity.json");
    const PAYLOAD_FIXTURE: &str = include_str!("../../../docs/formats/hdoc-v1-payloads.json");
    const RECORD_FIXTURE: &str = include_str!("../../../docs/formats/hdoc-v1-records.json");
    const COMPRESSION_FIXTURE: &str =
        include_str!("../../../docs/formats/hdoc-v1-compression.json");

    fn fixture_string<'a>(
        fixture: &'a str,
        id: &str,
        property: &str,
    ) -> Result<&'a str, EncodeError> {
        let id_marker = format!("\"id\": \"{id}\"");
        let item = fixture
            .find(&id_marker)
            .ok_or(EncodeError::ArithmeticOverflow)?;
        let property_marker = format!("\"{property}\": \"");
        let relative = fixture[item..]
            .find(&property_marker)
            .ok_or(EncodeError::ArithmeticOverflow)?;
        let start = item
            .checked_add(relative)
            .and_then(|value| value.checked_add(property_marker.len()))
            .ok_or(EncodeError::ArithmeticOverflow)?;
        let end = fixture[start..]
            .find('"')
            .and_then(|value| start.checked_add(value))
            .ok_or(EncodeError::ArithmeticOverflow)?;
        Ok(&fixture[start..end])
    }

    fn hex_nibble(value: u8) -> Result<u8, EncodeError> {
        match value {
            b'0'..=b'9' => Ok(value - b'0'),
            b'a'..=b'f' => Ok(value - b'a' + 10),
            b'A'..=b'F' => Ok(value - b'A' + 10),
            _ => Err(EncodeError::ArithmeticOverflow),
        }
    }

    fn decode_hex(value: &str) -> Result<Vec<u8>, EncodeError> {
        if !value.len().is_multiple_of(2) {
            return Err(EncodeError::ArithmeticOverflow);
        }
        value
            .as_bytes()
            .chunks_exact(2)
            .map(|pair| Ok((hex_nibble(pair[0])? << 4) | hex_nibble(pair[1])?))
            .collect()
    }

    fn fixture_hex(fixture: &str, id: &str, property: &str) -> Result<Vec<u8>, EncodeError> {
        decode_hex(fixture_string(fixture, id, property)?)
    }

    fn fixture_hex_after(
        fixture: &str,
        section: &str,
        id: &str,
        property: &str,
    ) -> Result<Vec<u8>, EncodeError> {
        let start = fixture
            .find(section)
            .ok_or(EncodeError::ArithmeticOverflow)?;
        fixture_hex(&fixture[start..], id, property)
    }

    fn disabled() -> EncodeOptions {
        EncodeOptions {
            compression: CompressionMode::Disabled,
        }
    }

    fn error<T>(result: Result<T, EncodeError>, expected: EncodeError) {
        assert_eq!(result.err(), Some(expected));
    }

    fn payload(value: EncodeValue<'_>) -> Result<Vec<u8>, EncodeError> {
        let mut output = Vec::new();
        write_payload(value, &mut output)?;
        Ok(output)
    }

    fn with_nested_arrays(depth: usize, callback: &mut dyn FnMut(&[EncodeValue<'_>])) {
        if depth == 0 {
            let leaf = [EncodeValue::Null];
            callback(&leaf);
        } else {
            with_nested_arrays(depth - 1, &mut |inner| {
                let outer = [EncodeValue::Array(inner)];
                callback(&outer);
            });
        }
    }

    fn splitmix_bytes(length: usize) -> Vec<u8> {
        let mut state = 0x4844_4f43_434d_5031_u64;
        let mut output = Vec::with_capacity(length);
        while output.len() < length {
            state = state.wrapping_add(0x9e37_79b9_7f4a_7c15);
            let mut value = state;
            value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
            value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
            value ^= value >> 31;
            for byte in value.to_le_bytes() {
                if output.len() == length {
                    break;
                }
                output.push(byte);
            }
        }
        output
    }

    fn decoder_scalar_hdoc() -> Result<EncodedHDoc, EncodeError> {
        let fields = [
            EncodeField::new("b", EncodeValue::Int64(1)),
            EncodeField::new("_id", EncodeValue::Uuid([0; 16])),
            EncodeField::new("a", EncodeValue::Bool(true)),
        ];
        encode_with_options(EncodeDocument::new(&fields), disabled())
    }

    fn decoder_nested_hdoc() -> Result<EncodedHDoc, EncodeError> {
        let empty_fields = [];
        let nested_fields = [EncodeField::new("a", EncodeValue::Bool(true))];
        let array = [
            EncodeValue::Null,
            EncodeValue::Object(EncodeObject::new(&nested_fields)),
        ];
        let fields = [
            EncodeField::new("z", EncodeValue::Object(EncodeObject::new(&empty_fields))),
            EncodeField::new("_id", EncodeValue::ObjectId([0; 12])),
            EncodeField::new("a", EncodeValue::Array(&array)),
        ];
        encode_with_options(EncodeDocument::new(&fields), disabled())
    }

    fn decoder_all_types_hdoc() -> Result<EncodedHDoc, EncodeError> {
        let empty_fields = [];
        let array_values = [EncodeValue::Null];
        let vector_f32 = [0x3f80_0000, 0x8000_0000, 1];
        let vector_f16 = [0x3c00, 0x8000, 1];
        let fields = [
            EncodeField::new("_id", EncodeValue::Uuid([0; 16])),
            EncodeField::new("t01", EncodeValue::Null),
            EncodeField::new("t02", EncodeValue::Bool(true)),
            EncodeField::new("t03", EncodeValue::Int32(i32::MIN)),
            EncodeField::new("t04", EncodeValue::Int64(i64::MAX)),
            EncodeField::new("t05", EncodeValue::Float64Bits(0x7ff0_0000_0000_0001)),
            EncodeField::new(
                "t06",
                EncodeValue::Decimal128(Decimal128::Finite {
                    negative: true,
                    coefficient: 12_345,
                    exponent: -2,
                }),
            ),
            EncodeField::new("t07", EncodeValue::String("e\u{301}")),
            EncodeField::new("t08", EncodeValue::Binary(&[0, 0xff])),
            EncodeField::new("t09", EncodeValue::Object(EncodeObject::new(&empty_fields))),
            EncodeField::new("t10", EncodeValue::Array(&array_values)),
            EncodeField::new("t11", EncodeValue::Timestamp(TIMESTAMP_MIN)),
            EncodeField::new("t12", EncodeValue::Date(DATE_MAX)),
            EncodeField::new("t13", EncodeValue::Uuid([0xff; 16])),
            EncodeField::new("t14", EncodeValue::ObjectId([0xff; 12])),
            EncodeField::new("t15", EncodeValue::VectorF32(&vector_f32)),
            EncodeField::new("t16", EncodeValue::VectorF16(&vector_f16)),
        ];
        encode_with_options(EncodeDocument::new(&fields), disabled())
    }

    fn refresh_hdoc_checksum(bytes: &mut [u8]) {
        bytes[32..36].fill(0);
        let checksum = CRC32C.checksum(bytes);
        put_u32(bytes, 32, checksum);
    }

    fn mutate_hdoc(base: &[u8], action: impl FnOnce(&mut [u8])) -> Vec<u8> {
        let mut candidate = base.to_vec();
        action(&mut candidate);
        refresh_hdoc_checksum(&mut candidate);
        candidate
    }

    fn expect_decode_check(bytes: &[u8], expected: DecodeCheck) {
        assert_eq!(
            decode(bytes).err().and_then(|error| error.check()),
            Some(expected)
        );
    }

    fn expect_result_check<T>(result: Result<T, DecodeError>, expected: DecodeCheck) {
        assert_eq!(result.err().and_then(|error| error.check()), Some(expected));
    }

    fn synthetic_envelope(field_count: u32) -> ParsedEnvelope {
        ParsedEnvelope {
            entries: [DirectoryEntry::default(); 4],
            logical_offsets: [0; 4],
            total_length: 256,
            canonical_length: 256,
            field_count,
            footer_hash: [0; 32],
            compressed_sections: 0,
        }
    }

    fn field_locations(
        bytes: &[u8],
        expected_name: &[u8],
    ) -> Result<(usize, usize, FieldRecord), DecodeError> {
        let envelope = parse_envelope(bytes)?;
        if envelope.compressed_sections != 0 {
            return Err(corruption(DecodeCheck::FieldTable, 0));
        }
        let sections = decode_logical_sections(bytes, &envelope)?;
        let names = parse_names(
            &sections[1],
            envelope.logical_offsets[1],
            envelope.entries[1].item_count,
        )?;
        let fields = parse_fields(&sections[0], envelope.field_count)?;
        for (index, field) in fields.iter().copied().enumerate() {
            let name = names
                .get(bounded_u64_to_usize(u64::from(field.field_id)))
                .ok_or_else(|| corruption(DecodeCheck::NamePool, 0))?;
            if name_bytes(&sections[1], name)? == expected_name {
                let record = bounded_u64_to_usize(u64::from(envelope.entries[0].stored_offset))
                    + index * bounded_u64_to_usize(FIELD_ENTRY_BYTES);
                return Ok((
                    record,
                    bounded_u64_to_usize(u64::from(field.value.offset)),
                    field,
                ));
            }
        }
        Err(corruption(DecodeCheck::FieldTable, 0))
    }

    #[test]
    #[allow(
        clippy::too_many_lines,
        reason = "all logical variants and public borrowed/owned accessors form one round-trip table"
    )]
    fn borrowed_and_owned_values_preserve_every_logical_type() -> Result<(), EncodeError> {
        let encoded = decoder_all_types_hdoc()?;
        let decoded = decode(encoded.as_bytes()).map_err(|_| EncodeError::ArithmeticOverflow)?;
        assert!(
            decoded
                .logical_sections
                .iter()
                .all(|section| matches!(section, Cow::Borrowed(_)))
        );

        let types = [
            ValueType::Uuid,
            ValueType::Null,
            ValueType::Bool,
            ValueType::Int32,
            ValueType::Int64,
            ValueType::Float64,
            ValueType::Decimal128,
            ValueType::String,
            ValueType::Binary,
            ValueType::Object,
            ValueType::Array,
            ValueType::Timestamp,
            ValueType::Date,
            ValueType::Uuid,
            ValueType::ObjectId,
            ValueType::VectorF32,
            ValueType::VectorF16,
        ];
        let registry = [
            (ValueType::Null, "null", 1),
            (ValueType::Bool, "bool", 2),
            (ValueType::Int32, "int32", 3),
            (ValueType::Int64, "int64", 4),
            (ValueType::Float64, "float64", 5),
            (ValueType::Decimal128, "decimal128", 6),
            (ValueType::String, "string", 7),
            (ValueType::Binary, "binary", 8),
            (ValueType::Object, "object", 9),
            (ValueType::Array, "array", 10),
            (ValueType::Timestamp, "timestamp", 11),
            (ValueType::Date, "date", 12),
            (ValueType::Uuid, "uuid", 13),
            (ValueType::ObjectId, "objectId", 14),
            (ValueType::VectorF32, "vector<f32,N>", 15),
            (ValueType::VectorF16, "vector<f16,N>", 16),
        ];
        for (value_type, name, tag) in registry {
            assert_eq!(value_type.as_str(), name);
            assert_eq!(value_type.hdoc_tag(), tag);
            assert_eq!(value_type.is_container(), matches!(tag, 9 | 10));
        }

        let view = decoded.view();
        assert_eq!(view.len(), 17);
        assert!(!view.is_empty());
        assert_eq!(view.root().len(), 17);
        assert!(!view.root().is_empty());
        assert_eq!(view.root().recursive_field_count(), 17);
        assert!(view.field_at(17).is_none());

        let fields = view.fields().collect::<Vec<_>>();
        assert_eq!(fields.len(), 17);
        for (index, field) in fields.iter().copied().enumerate() {
            assert_eq!(field.presentation_ordinal(), bounded_usize_to_u32(index));
            assert_eq!(field.value().value_type(), types[index]);
        }
        assert_eq!(
            fields.iter().map(|field| field.name()).collect::<Vec<_>>(),
            [
                "_id", "t01", "t02", "t03", "t04", "t05", "t06", "t07", "t08", "t09", "t10", "t11",
                "t12", "t13", "t14", "t15", "t16",
            ]
        );

        let mut field_ends = view.fields();
        assert_eq!(field_ends.len(), 17);
        assert_eq!(field_ends.next().map(FieldView::name), Some("_id"));
        assert_eq!(field_ends.next_back().map(FieldView::name), Some("t16"));
        assert_eq!(field_ends.size_hint(), (15, Some(15)));
        for _ in &mut field_ends {}
        assert!(field_ends.next().is_none());
        assert!(field_ends.next_back().is_none());

        assert!(matches!(fields[0].value(), ValueView::Uuid(value) if value == [0; 16]));
        assert!(matches!(fields[1].value(), ValueView::Null));
        assert!(matches!(fields[2].value(), ValueView::Bool(true)));
        assert!(matches!(fields[3].value(), ValueView::Int32(i32::MIN)));
        assert!(matches!(fields[4].value(), ValueView::Int64(i64::MAX)));
        assert!(matches!(
            fields[5].value(),
            ValueView::Float64Bits(0x7ff0_0000_0000_0001)
        ));
        assert!(matches!(
            fields[6].value(),
            ValueView::Decimal128(Decimal128::Finite {
                negative: true,
                coefficient: 12_345,
                exponent: -2
            })
        ));
        let ValueView::String(string) = fields[7].value() else {
            return Err(EncodeError::ArithmeticOverflow);
        };
        assert_eq!(string, "e\u{301}");
        let stored_start = encoded.as_bytes().as_ptr() as usize;
        let stored_end = stored_start + encoded.as_bytes().len();
        assert!((stored_start..stored_end).contains(&(string.as_ptr() as usize)));

        let ValueView::Binary(binary) = fields[8].value() else {
            return Err(EncodeError::ArithmeticOverflow);
        };
        assert_eq!(binary.subtype(), 0);
        assert_eq!(binary.as_bytes(), [0, 0xff]);
        assert_eq!(binary.len(), 2);
        assert!(!binary.is_empty());
        let empty_binary = BinaryView {
            subtype: 0,
            bytes: &[],
        };
        assert!(empty_binary.is_empty());

        let ValueView::Object(object) = fields[9].value() else {
            return Err(EncodeError::ArithmeticOverflow);
        };
        assert_eq!(object.len(), 0);
        assert!(object.is_empty());
        assert_eq!(object.recursive_field_count(), 0);
        assert!(object.field_at(0).is_none());
        assert_eq!(object.fields().len(), 0);
        assert!(object.to_owned_object().into_fields().is_empty());

        let ValueView::Array(array) = fields[10].value() else {
            return Err(EncodeError::ArithmeticOverflow);
        };
        assert_eq!(array.len(), 1);
        assert!(!array.is_empty());
        assert!(matches!(array.get(0), Some(ValueView::Null)));
        assert!(array.get(1).is_none());
        let mut elements = array.elements();
        assert_eq!(elements.len(), 1);
        assert!(matches!(elements.next_back(), Some(ValueView::Null)));
        assert!(elements.next().is_none());
        assert!(elements.next_back().is_none());

        assert!(matches!(
            fields[11].value(),
            ValueView::Timestamp(TIMESTAMP_MIN)
        ));
        assert!(matches!(fields[12].value(), ValueView::Date(DATE_MAX)));
        assert!(matches!(fields[13].value(), ValueView::Uuid(value) if value == [0xff; 16]));
        assert!(matches!(
            fields[14].value(),
            ValueView::ObjectId(value) if value == [0xff; 12]
        ));

        let ValueView::VectorF32(vector_f32) = fields[15].value() else {
            return Err(EncodeError::ArithmeticOverflow);
        };
        assert_eq!(vector_f32.len(), 3);
        assert!(!vector_f32.is_empty());
        assert_eq!(vector_f32.get(0), Some(0x3f80_0000));
        assert_eq!(vector_f32.get(3), None);
        assert_eq!(vector_f32.get(usize::MAX), None);
        let mut f32_bits = vector_f32.iter();
        assert_eq!(f32_bits.len(), 3);
        assert_eq!(f32_bits.next(), Some(0x3f80_0000));
        assert_eq!(f32_bits.next_back(), Some(1));
        assert_eq!(f32_bits.size_hint(), (1, Some(1)));
        assert_eq!(f32_bits.next(), Some(0x8000_0000));
        assert_eq!(f32_bits.next(), None);
        assert_eq!(f32_bits.next_back(), None);
        assert!(VectorF32View { element_bytes: &[] }.is_empty());

        let ValueView::VectorF16(vector_f16) = fields[16].value() else {
            return Err(EncodeError::ArithmeticOverflow);
        };
        assert_eq!(vector_f16.len(), 3);
        assert!(!vector_f16.is_empty());
        assert_eq!(vector_f16.get(0), Some(0x3c00));
        assert_eq!(vector_f16.get(3), None);
        assert_eq!(vector_f16.get(usize::MAX), None);
        let mut f16_bits = vector_f16.iter();
        assert_eq!(f16_bits.len(), 3);
        assert_eq!(f16_bits.next(), Some(0x3c00));
        assert_eq!(f16_bits.next_back(), Some(1));
        assert_eq!(f16_bits.size_hint(), (1, Some(1)));
        assert_eq!(f16_bits.next(), Some(0x8000));
        assert_eq!(f16_bits.next(), None);
        assert_eq!(f16_bits.next_back(), None);
        assert!(VectorF16View { element_bytes: &[] }.is_empty());

        let owned = decoded.to_owned_document();
        let owned_from_view = view.to_owned_document();
        let owned_root = view.root().to_owned_object();
        assert_eq!(owned.fields().len(), 17);
        assert_eq!(owned_from_view.fields().len(), 17);
        assert_eq!(owned_root.fields().len(), 17);
        for (index, field) in owned.fields().iter().enumerate() {
            assert_eq!(field.name(), fields[index].name());
            assert_eq!(field.value().value_type(), types[index]);
        }
        let (detached_name, detached_value) = fields[7].to_owned_field().into_parts();
        assert_eq!(detached_name, "t07");
        assert!(matches!(detached_value, OwnedValue::String(value) if value == "e\u{301}"));
        let owned_fields = owned.clone().into_fields();
        assert_eq!(owned_fields.len(), 17);
        assert!(matches!(owned_fields[1].value(), OwnedValue::Null));
        assert!(matches!(owned_fields[2].value(), OwnedValue::Bool(true)));
        assert!(matches!(
            owned_fields[3].value(),
            OwnedValue::Int32(i32::MIN)
        ));
        assert!(matches!(
            owned_fields[4].value(),
            OwnedValue::Int64(i64::MAX)
        ));
        assert!(matches!(
            owned_fields[5].value(),
            OwnedValue::Float64Bits(0x7ff0_0000_0000_0001)
        ));
        assert!(matches!(
            owned_fields[6].value(),
            OwnedValue::Decimal128(Decimal128::Finite {
                negative: true,
                coefficient: 12_345,
                exponent: -2
            })
        ));
        assert!(matches!(
            owned_fields[8].value(),
            OwnedValue::Binary { subtype: 0, bytes } if bytes == &[0, 0xff]
        ));
        assert!(matches!(
            owned_fields[9].value(),
            OwnedValue::Object(value) if value.fields().is_empty()
        ));
        assert!(matches!(
            owned_fields[10].value(),
            OwnedValue::Array(values) if matches!(values.as_slice(), [OwnedValue::Null])
        ));
        assert!(matches!(
            owned_fields[11].value(),
            OwnedValue::Timestamp(TIMESTAMP_MIN)
        ));
        assert!(matches!(
            owned_fields[12].value(),
            OwnedValue::Date(DATE_MAX)
        ));
        assert!(matches!(
            owned_fields[13].value(),
            OwnedValue::Uuid(value) if value == &[0xff; 16]
        ));
        assert!(matches!(
            owned_fields[14].value(),
            OwnedValue::ObjectId(value) if value == &[0xff; 12]
        ));
        assert!(matches!(
            owned_fields[15].value(),
            OwnedValue::VectorF32(values) if values == &[0x3f80_0000, 0x8000_0000, 1]
        ));
        assert!(matches!(
            owned_fields[16].value(),
            OwnedValue::VectorF16(values) if values == &[0x3c00, 0x8000, 1]
        ));

        let invalid_object = ObjectView {
            data: view.data,
            container_id: usize::MAX,
        };
        assert_eq!(invalid_object.len(), 0);
        assert_eq!(invalid_object.recursive_field_count(), 0);
        assert!(invalid_object.field_at(0).is_none());
        let invalid_array = ArrayView {
            data: view.data,
            container_id: usize::MAX,
        };
        assert_eq!(invalid_array.len(), 0);
        assert!(invalid_array.is_empty());
        assert!(invalid_array.get(0).is_none());
        assert!(invalid_array.arrays().is_empty());
        assert!(
            ArrayView {
                data: view.data,
                container_id: 0
            }
            .get(0)
            .is_none()
        );
        assert!(
            value_view(
                view.data,
                ValueReference {
                    tag: 17,
                    offset: view.data.logical_offsets[2],
                    length: 0,
                }
            )
            .is_none()
        );
        let mut invalid_containers = decoded.containers.clone();
        invalid_containers[1].tag = 17;
        let mut invalid_container_data = view.data;
        invalid_container_data.containers = &invalid_containers;
        assert!(
            value_view(
                invalid_container_data,
                ValueReference {
                    tag: 9,
                    offset: view.data.logical_offsets[3]
                        + bounded_u64_to_u32(CONTAINER_DESCRIPTOR_BYTES),
                    length: bounded_u64_to_u32(CONTAINER_DESCRIPTOR_BYTES),
                }
            )
            .is_none()
        );

        let bad_f32 = [2, 0, 0, 0, 0, 0, 0, 0];
        let mut bad_f32_data = view.data;
        bad_f32_data.sections[2] = &bad_f32;
        bad_f32_data.logical_offsets[2] = 0;
        assert!(
            value_view(
                bad_f32_data,
                ValueReference {
                    tag: 15,
                    offset: 0,
                    length: bounded_usize_to_u32(bad_f32.len()),
                }
            )
            .is_none()
        );
        let bad_f16 = [2, 0, 0, 0, 0, 0];
        let mut bad_f16_data = view.data;
        bad_f16_data.sections[2] = &bad_f16;
        bad_f16_data.logical_offsets[2] = 0;
        assert!(
            value_view(
                bad_f16_data,
                ValueReference {
                    tag: 16,
                    offset: 0,
                    length: bounded_usize_to_u32(bad_f16.len()),
                }
            )
            .is_none()
        );
        Ok(())
    }

    #[test]
    fn views_preserve_presentation_and_own_only_decoded_sections() -> Result<(), EncodeError> {
        let scalar = decoder_scalar_hdoc()?;
        let scalar_decoded =
            decode(scalar.as_bytes()).map_err(|_| EncodeError::ArithmeticOverflow)?;
        assert_eq!(
            scalar_decoded
                .view()
                .fields()
                .map(FieldView::name)
                .collect::<Vec<_>>(),
            ["b", "_id", "a"]
        );
        assert_eq!(
            scalar_decoded
                .view()
                .fields()
                .map(FieldView::presentation_ordinal)
                .collect::<Vec<_>>(),
            [0, 1, 2]
        );

        let detached = {
            let large = "view-storage-sentinel-".repeat(256);
            let fields = [
                EncodeField::new("_id", EncodeValue::Uuid([0; 16])),
                EncodeField::new("pad", EncodeValue::String(&large)),
            ];
            let encoded = encode(EncodeDocument::new(&fields))?;
            assert_eq!(encoded.compressed_section_count(), 1);
            let decoded =
                decode(encoded.as_bytes()).map_err(|_| EncodeError::ArithmeticOverflow)?;
            assert_eq!(decoded.compressed_section_count(), 1);
            assert_eq!(
                decoded
                    .logical_sections
                    .iter()
                    .filter(|section| matches!(section, Cow::Owned(_)))
                    .count(),
                1
            );
            let first = decoded
                .view()
                .field_at(1)
                .ok_or(EncodeError::ArithmeticOverflow)?;
            let second = decoded
                .view()
                .field_at(1)
                .ok_or(EncodeError::ArithmeticOverflow)?;
            let (ValueView::String(first), ValueView::String(second)) =
                (first.value(), second.value())
            else {
                return Err(EncodeError::ArithmeticOverflow);
            };
            assert_eq!(first, large);
            assert_eq!(first.as_ptr(), second.as_ptr());
            let stored_start = encoded.as_bytes().as_ptr() as usize;
            let stored_end = stored_start + encoded.as_bytes().len();
            assert!(!(stored_start..stored_end).contains(&(first.as_ptr() as usize)));
            let debug = format!("{decoded:?}");
            assert!(debug.contains("compressed_sections: 1"));
            assert!(!debug.contains("view-storage-sentinel"));
            decoded.to_owned_document()
        };
        let detached_pad = detached
            .fields()
            .get(1)
            .ok_or(EncodeError::ArithmeticOverflow)?;
        assert!(matches!(
            detached_pad.value(),
            OwnedValue::String(value) if value == &"view-storage-sentinel-".repeat(256)
        ));
        assert_eq!(detached.into_fields().len(), 2);
        Ok(())
    }

    #[test]
    #[allow(
        clippy::too_many_lines,
        reason = "one nested fixture proves the complete exact-name, path, fan-out, and error API"
    )]
    fn raw_views_support_bounded_exact_name_and_nested_path_lookup() -> Result<(), Box<dyn Error>> {
        let profile_fields = [
            EncodeField::new("name", EncodeValue::String("Ada")),
            EncodeField::new("0", EncodeValue::Bool(true)),
        ];
        let details_zero = [EncodeField::new("sku", EncodeValue::String("A"))];
        let details_one = [EncodeField::new("sku", EncodeValue::String("B"))];
        let item_zero_fields = [
            EncodeField::new("price", EncodeValue::Int32(1)),
            EncodeField::new(
                "details",
                EncodeValue::Object(EncodeObject::new(&details_zero)),
            ),
            EncodeField::new("00", EncodeValue::Int32(10)),
        ];
        let item_one_fields = [
            EncodeField::new("price", EncodeValue::Null),
            EncodeField::new(
                "details",
                EncodeValue::Object(EncodeObject::new(&details_one)),
            ),
        ];
        let item_two_fields = [EncodeField::new("other", EncodeValue::Bool(true))];
        let nested_item_fields = [EncodeField::new("price", EncodeValue::Int32(3))];
        let nested_item_array = [EncodeValue::Object(EncodeObject::new(&nested_item_fields))];
        let items = [
            EncodeValue::Object(EncodeObject::new(&item_zero_fields)),
            EncodeValue::Object(EncodeObject::new(&item_one_fields)),
            EncodeValue::Object(EncodeObject::new(&item_two_fields)),
            EncodeValue::Int32(99),
            EncodeValue::Array(&nested_item_array),
        ];
        let matrix_zero_fields = [EncodeField::new("x", EncodeValue::Int32(10))];
        let matrix_one_fields = [EncodeField::new("x", EncodeValue::Int32(20))];
        let matrix_zero = [EncodeValue::Object(EncodeObject::new(&matrix_zero_fields))];
        let matrix_one = [EncodeValue::Object(EncodeObject::new(&matrix_one_fields))];
        let matrix = [
            EncodeValue::Array(&matrix_zero),
            EncodeValue::Array(&matrix_one),
        ];
        let numbers = [EncodeValue::Int32(4), EncodeValue::Int32(5)];
        let large_numeric_object = [EncodeField::new("1000000", EncodeValue::Int32(6))];
        let mixed_object = [EncodeField::new(
            "value",
            EncodeValue::Object(EncodeObject::new(&large_numeric_object)),
        )];
        let mixed_array = [EncodeField::new("value", EncodeValue::Array(&numbers))];
        let mixed = [
            EncodeValue::Object(EncodeObject::new(&mixed_object)),
            EncodeValue::Object(EncodeObject::new(&mixed_array)),
        ];
        let root_fields = [
            EncodeField::new("items", EncodeValue::Array(&items)),
            EncodeField::new("_id", EncodeValue::Uuid([7; 16])),
            EncodeField::new(
                "profile",
                EncodeValue::Object(EncodeObject::new(&profile_fields)),
            ),
            EncodeField::new("explicit_null", EncodeValue::Null),
            EncodeField::new("matrix", EncodeValue::Array(&matrix)),
            EncodeField::new("numbers", EncodeValue::Array(&numbers)),
            EncodeField::new("mixed", EncodeValue::Array(&mixed)),
            EncodeField::new("scalar", EncodeValue::Int32(7)),
            EncodeField::new("1000000", EncodeValue::String("object-name")),
        ];
        let encoded = encode_with_options(EncodeDocument::new(&root_fields), disabled())?;
        let decoded = decode(encoded.as_bytes())?;
        let view = decoded.view();

        assert_eq!(view.get_field("items").map(FieldView::name), Some("items"));
        assert!(matches!(view.get("_id"), Some(ValueView::Uuid(value)) if value == [7; 16]));
        assert!(view.get("price").is_none());
        assert!(view.get("not-present").is_none());
        assert!(view.get("$invalid").is_none());
        let Some(ValueView::Object(profile)) = view.get("profile") else {
            return Err(EncodeError::ArithmeticOverflow.into());
        };
        assert_eq!(profile.get_field("name").map(FieldView::name), Some("name"));
        assert!(matches!(profile.get("0"), Some(ValueView::Bool(true))));
        assert!(profile.get("price").is_none());
        let Some(ValueView::Array(items_view)) = view.get("items") else {
            return Err(EncodeError::ArithmeticOverflow.into());
        };
        assert!(
            ObjectView {
                data: view.data,
                container_id: items_view.container_id,
            }
            .get_field("items")
            .is_none()
        );

        let reusable = FieldPath::parse("profile.name")?;
        assert_eq!(reusable.as_str(), "profile.name");
        assert_eq!(reusable.len(), 2);
        assert!(!reusable.is_empty());
        assert_eq!(reusable.segment(0), Some("profile"));
        assert_eq!(reusable.segment(1), Some("name"));
        assert_eq!(reusable.segment(2), None);
        let mut name = view.lookup_path(reusable)?;
        assert_eq!(name.len(), 1);
        assert_eq!(name.size_hint(), (1, Some(1)));
        let name = name.next().ok_or(EncodeError::ArithmeticOverflow)?;
        assert!(matches!(name.value(), ValueView::String("Ada")));
        assert!(name.array_positions().is_empty());

        let null = view
            .lookup_path_text("explicit_null")?
            .next()
            .ok_or(EncodeError::ArithmeticOverflow)?;
        assert!(matches!(null.value(), ValueView::Null));
        assert_eq!(view.lookup_path_text("missing")?.len(), 0);
        assert_eq!(view.lookup_path_text("scalar.child")?.len(), 0);
        assert!(matches!(
            view.lookup_path_text("1000000")?
                .next()
                .map(PathCandidate::value),
            Some(ValueView::String("object-name"))
        ));
        assert!(matches!(
            profile
                .lookup_path_text("name")?
                .next()
                .map(PathCandidate::value),
            Some(ValueView::String("Ada"))
        ));

        let mut prices = view.lookup_path_text("items.price")?;
        assert_eq!(prices.len(), 2);
        let first_price = prices.next().ok_or(EncodeError::ArithmeticOverflow)?;
        assert!(matches!(first_price.value(), ValueView::Int32(1)));
        assert_eq!(first_price.array_positions(), [0]);
        assert_eq!(prices.len(), 1);
        let second_price = prices.next().ok_or(EncodeError::ArithmeticOverflow)?;
        assert!(matches!(second_price.value(), ValueView::Null));
        assert_eq!(second_price.array_positions(), [1]);
        assert!(prices.next().is_none());
        assert!(prices.next().is_none());
        assert_eq!(prices.size_hint(), (0, Some(0)));

        let direct = view
            .lookup_path_text("items.0.details.sku")?
            .next()
            .ok_or(EncodeError::ArithmeticOverflow)?;
        assert!(matches!(direct.value(), ValueView::String("A")));
        assert_eq!(direct.array_positions(), [0]);
        assert_eq!(view.lookup_path_text("items.8.price")?.len(), 0);
        assert_eq!(view.lookup_path_text("items.price.1000000")?.len(), 0);
        assert!(matches!(
            view.lookup_path_text("items.00")?
                .next()
                .map(PathCandidate::value),
            Some(ValueView::Int32(10))
        ));
        assert_eq!(view.lookup_path_text("items.price")?.clone().len(), 2);

        assert_eq!(view.lookup_path_text("items.4.price")?.len(), 1);
        let nested = view
            .lookup_path_text("items.4.price")?
            .next()
            .ok_or(EncodeError::ArithmeticOverflow)?;
        assert!(matches!(nested.value(), ValueView::Int32(3)));
        assert_eq!(nested.array_positions(), [4, 0]);
        assert_eq!(view.lookup_path_text("matrix.x")?.len(), 0);
        let matrix_value = view
            .lookup_path_text("matrix.0.x")?
            .next()
            .ok_or(EncodeError::ArithmeticOverflow)?;
        assert!(matches!(matrix_value.value(), ValueView::Int32(10)));
        assert_eq!(matrix_value.array_positions(), [0, 0]);
        let terminal_array = view
            .lookup_path_text("items")?
            .next()
            .ok_or(EncodeError::ArithmeticOverflow)?;
        assert!(matches!(terminal_array.value(), ValueView::Array(value) if value.len() == 5));
        assert!(terminal_array.array_positions().is_empty());

        for invalid in ["", ".a", "a.", "a..b"] {
            assert_eq!(
                FieldPath::parse(invalid).err(),
                Some(PathError::InvalidSyntax)
            );
        }
        for invalid in ["$operator", "a.\u{1f}"] {
            assert!(matches!(
                FieldPath::parse(invalid).err(),
                Some(PathError::InvalidSegment { .. })
            ));
        }
        let too_many_segments = vec!["a"; MAX_PATH_SEGMENTS + 1].join(".");
        assert_eq!(
            FieldPath::parse(&too_many_segments).err(),
            Some(PathError::LimitExceeded {
                limit: LimitId::PathSegments,
                maximum: 100,
                observed: 101,
            })
        );
        let too_many_bytes = "a".repeat(bounded_u64_to_usize(MAX_PATH_BYTES + 1));
        assert_eq!(
            FieldPath::parse(&too_many_bytes).err(),
            Some(PathError::LimitExceeded {
                limit: LimitId::PathUtf8Bytes,
                maximum: MAX_PATH_BYTES,
                observed: MAX_PATH_BYTES + 1,
            })
        );
        let long_segment = "a".repeat(bounded_u64_to_usize(MAX_FIELD_NAME_BYTES + 1));
        assert!(matches!(
            FieldPath::parse(&long_segment).err(),
            Some(PathError::LimitExceeded {
                limit: LimitId::FieldNameUtf8Bytes,
                ..
            })
        ));
        let many_scalars = "é".repeat(bounded_u64_to_usize(MAX_FIELD_NAME_SCALARS + 1));
        assert!(matches!(
            FieldPath::parse(&many_scalars).err(),
            Some(PathError::LimitExceeded {
                limit: LimitId::FieldNameScalars,
                ..
            })
        ));

        let Some(invalid_index) = view.lookup_path_text("numbers.1000000").err() else {
            return Err(EncodeError::ArithmeticOverflow.into());
        };
        assert_eq!(
            invalid_index,
            PathError::InvalidArrayIndex { segment_index: 1 }
        );
        assert_eq!(invalid_index.code(), "VAL_INVALID_PATH");
        assert_eq!(invalid_index.to_string(), "VAL_INVALID_PATH: segment 1");
        assert!(matches!(
            view.lookup_path_text("numbers.999999999999999999999999999999999999")
                .err(),
            Some(PathError::InvalidArrayIndex { segment_index: 1 })
        ));
        assert!(matches!(
            view.lookup_path_text("mixed.value.1000000").err(),
            Some(PathError::InvalidArrayIndex { segment_index: 2 })
        ));
        assert!(matches!(
            view.lookup_path_text("mixed.0.value.1000000")?
                .next()
                .map(PathCandidate::value),
            Some(ValueView::Int32(6))
        ));
        assert_eq!(view.lookup_path_text("numbers.999999")?.len(), 0);
        let syntax = PathError::InvalidSyntax;
        assert_eq!(syntax.code(), "VAL_INVALID_PATH");
        assert_eq!(syntax.to_string(), "VAL_INVALID_PATH");
        let invalid_segment = PathError::InvalidSegment { segment_index: 2 };
        assert_eq!(invalid_segment.to_string(), "VAL_INVALID_PATH: segment 2");
        assert_eq!(enforce_path_candidate_limit(MAX_PATH_CANDIDATES), Ok(()));
        let Some(candidate_limit) = enforce_path_candidate_limit(MAX_PATH_CANDIDATES + 1).err()
        else {
            return Err(EncodeError::ArithmeticOverflow.into());
        };
        assert_eq!(candidate_limit.code(), "QUOTA_LIMIT_EXCEEDED");
        assert_eq!(
            candidate_limit.to_string(),
            "QUOTA_LIMIT_EXCEEDED: path.candidates maximum 1000000, observed 1000001"
        );

        let invalid_path = FieldPath::parse("numbers.1000000")?;
        let mut invalid_walker = PathWalker::new(view.root(), invalid_path);
        assert_eq!(
            invalid_walker.advance().err(),
            Some(PathError::InvalidArrayIndex { segment_index: 1 })
        );

        let large = "path-lookup-compressed-sentinel-".repeat(256);
        let compressed_nested = [EncodeField::new("payload", EncodeValue::String(&large))];
        let compressed_fields = [
            EncodeField::new("_id", EncodeValue::Uuid([9; 16])),
            EncodeField::new(
                "nested",
                EncodeValue::Object(EncodeObject::new(&compressed_nested)),
            ),
        ];
        let compressed = encode(EncodeDocument::new(&compressed_fields))?;
        assert!(compressed.compressed_section_count() > 0);
        let compressed_decoded = decode(compressed.as_bytes())?;
        let compressed_value = compressed_decoded
            .view()
            .lookup_path_text("nested.payload")?
            .next()
            .ok_or(EncodeError::ArithmeticOverflow)?;
        assert!(matches!(compressed_value.value(), ValueView::String(value) if value == large));
        Ok(())
    }

    #[test]
    fn exact_root_envelopes_are_deterministic_and_presentation_sensitive() -> Result<(), EncodeError>
    {
        let first_fields = [
            EncodeField::new("s", EncodeValue::String("")),
            EncodeField::new("_id", EncodeValue::Uuid([0; 16])),
            EncodeField::new("n", EncodeValue::Null),
        ];
        let second_fields = [
            EncodeField::new("_id", EncodeValue::Uuid([0; 16])),
            EncodeField::new("n", EncodeValue::Null),
            EncodeField::new("s", EncodeValue::String("")),
        ];
        let first = encode_with_options(EncodeDocument::new(&first_fields), disabled())?;
        let repeated = encode_with_options(EncodeDocument::new(&first_fields), disabled())?;
        let second = encode_with_options(EncodeDocument::new(&second_fields), disabled())?;

        assert_eq!(first, repeated);
        assert_eq!(first.as_bytes().len(), 408);
        assert_eq!(first.canonical_length(), 408);
        assert_eq!(first.compressed_section_count(), 0);
        assert_eq!(
            first.as_bytes(),
            fixture_hex(
                INTEGRITY_FIXTURE,
                "root-scalars-presentation-s-id-n",
                "hdoc_hex"
            )?
        );
        assert_eq!(
            second.as_bytes(),
            fixture_hex(
                INTEGRITY_FIXTURE,
                "root-scalars-presentation-id-n-s",
                "hdoc_hex"
            )?
        );
        assert_eq!(first.content_hash(), second.content_hash());
        assert_ne!(&first.as_bytes()[32..36], &second.as_bytes()[32..36]);
        assert_eq!(
            first.content_hash(),
            fixture_hex(INTEGRITY_FIXTURE, "root-scalars", "digest_hex")?.as_slice()
        );
        assert_eq!(
            decode(first.as_bytes())
                .map_err(|_| EncodeError::ArithmeticOverflow)?
                .content_hash(),
            first.content_hash()
        );
        assert_eq!(
            decode(second.as_bytes())
                .map_err(|_| EncodeError::ArithmeticOverflow)?
                .content_hash(),
            second.content_hash()
        );
        assert_eq!(first.clone().into_bytes(), first.as_bytes());
        Ok(())
    }

    #[test]
    fn structural_sections_match_the_record_registry() -> Result<(), EncodeError> {
        let aligned_fields = [
            EncodeField::new("b", EncodeValue::Int64(1)),
            EncodeField::new("_id", EncodeValue::Uuid([0; 16])),
            EncodeField::new("a", EncodeValue::Bool(true)),
        ];
        let aligned = encode_with_options(EncodeDocument::new(&aligned_fields), disabled())?;
        assert_eq!(aligned.as_bytes().len(), 424);
        assert_eq!(
            &aligned.as_bytes()[192..264],
            fixture_hex(
                RECORD_FIXTURE,
                "internal-payload-alignment",
                "field_table_hex"
            )?
        );
        assert_eq!(
            &aligned.as_bytes()[264..293],
            fixture_hex(
                RECORD_FIXTURE,
                "internal-payload-alignment",
                "name_pool_hex"
            )?
        );
        assert_eq!(
            &aligned.as_bytes()[296..328],
            fixture_hex(
                RECORD_FIXTURE,
                "internal-payload-alignment",
                "value_area_hex"
            )?
        );
        assert_eq!(
            &aligned.as_bytes()[328..360],
            fixture_hex(
                RECORD_FIXTURE,
                "internal-payload-alignment",
                "container_tables_hex"
            )?
        );
        assert_eq!(
            decode(aligned.as_bytes())
                .map_err(|_| EncodeError::ArithmeticOverflow)?
                .content_hash(),
            aligned.content_hash()
        );

        let inner_fields = [EncodeField::new("a", EncodeValue::Bool(true))];
        let nested_values = [
            EncodeValue::Null,
            EncodeValue::Object(EncodeObject::new(&inner_fields)),
        ];
        let empty_fields = [];
        let nested_fields = [
            EncodeField::new("z", EncodeValue::Array(&nested_values)),
            EncodeField::new(
                "_id",
                EncodeValue::ObjectId([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
            ),
            EncodeField::new("a", EncodeValue::Object(EncodeObject::new(&empty_fields))),
        ];
        let nested = encode_with_options(EncodeDocument::new(&nested_fields), disabled())?;
        assert_eq!(nested.as_bytes().len(), 552);
        for (range, property) in [
            (192..288, "field_table_hex"),
            (288..317, "name_pool_hex"),
            (320..333, "value_area_hex"),
            (336..488, "container_tables_hex"),
        ] {
            assert_eq!(
                &nested.as_bytes()[range],
                fixture_hex(RECORD_FIXTURE, "nested-object-array", property)?
            );
        }
        assert_eq!(
            decode(nested.as_bytes())
                .map_err(|_| EncodeError::ArithmeticOverflow)?
                .content_hash(),
            nested.content_hash()
        );
        Ok(())
    }

    #[test]
    fn canonical_compression_matches_every_stream_and_complete_vector() -> Result<(), EncodeError> {
        assert_eq!(compression_stream(&[]), None);
        assert_eq!(compression_stream(&[0; 13]), None);

        let zero_32768 = vec![0; 32_768];
        assert_eq!(
            compression_stream(&zero_32768),
            Some(fixture_hex_after(
                COMPRESSION_FIXTURE,
                "\"section_vectors\"",
                "zero-32768",
                "stream_hex"
            )?)
        );
        let zero_65536 = vec![0; 65_536];
        assert_eq!(
            compression_stream(&zero_65536),
            Some(fixture_hex_after(
                COMPRESSION_FIXTURE,
                "\"section_vectors\"",
                "zero-65536",
                "stream_hex"
            )?)
        );
        let mut mixed = zero_32768;
        mixed.extend_from_slice(&splitmix_bytes(257));
        assert_eq!(
            compression_stream(&mixed),
            Some(fixture_hex_after(
                COMPRESSION_FIXTURE,
                "\"section_vectors\"",
                "zero-32768-splitmix64-257",
                "stream_hex"
            )?)
        );
        assert_eq!(compression_stream(&splitmix_bytes(32_768)), None);

        let large = "A".repeat(4096);
        let fields = [
            EncodeField::new("_id", EncodeValue::Uuid([0; 16])),
            EncodeField::new("pad", EncodeValue::String(&large)),
        ];
        let canonical = encode(EncodeDocument::new(&fields))?;
        assert_eq!(canonical.as_bytes().len(), 448);
        assert_eq!(canonical.canonical_length(), 4472);
        assert_eq!(canonical.compressed_section_count(), 1);
        assert_eq!(
            canonical.as_bytes(),
            fixture_hex(
                COMPRESSION_FIXTURE,
                "large-string-value-area-lz4",
                "hdoc_hex"
            )?
        );
        let uncompressed = encode_with_options(EncodeDocument::new(&fields), disabled())?;
        assert_eq!(uncompressed.as_bytes().len(), 4472);
        assert_eq!(uncompressed.content_hash(), canonical.content_hash());
        assert_eq!(
            decode(canonical.as_bytes())
                .map_err(|_| EncodeError::ArithmeticOverflow)?
                .content_hash(),
            canonical.content_hash()
        );
        assert_eq!(
            decode(uncompressed.as_bytes())
                .map_err(|_| EncodeError::ArithmeticOverflow)?
                .content_hash(),
            uncompressed.content_hash()
        );
        Ok(())
    }

    #[test]
    #[allow(
        clippy::too_many_lines,
        reason = "the normative payload and hash registries are reviewed as contiguous tables"
    )]
    fn every_noncontainer_payload_and_typed_hash_matches_the_registry() -> Result<(), EncodeError> {
        let decimal_cases = [
            (
                "decimal128-positive-zero",
                Decimal128::Zero { negative: false },
            ),
            (
                "decimal128-negative-zero",
                Decimal128::Zero { negative: true },
            ),
            (
                "decimal128-one",
                Decimal128::Finite {
                    negative: false,
                    coefficient: 1,
                    exponent: 0,
                },
            ),
            (
                "decimal128-negative-12345",
                Decimal128::Finite {
                    negative: true,
                    coefficient: 12_345,
                    exponent: 0,
                },
            ),
            (
                "decimal128-12-34",
                Decimal128::Finite {
                    negative: false,
                    coefficient: 1_234,
                    exponent: -2,
                },
            ),
            (
                "decimal128-smallest-positive",
                Decimal128::Finite {
                    negative: false,
                    coefficient: 1,
                    exponent: -6_176,
                },
            ),
            (
                "decimal128-largest-positive",
                Decimal128::Finite {
                    negative: false,
                    coefficient: DECIMAL_COEFFICIENT_LIMIT - 1,
                    exponent: 6_111,
                },
            ),
            (
                "decimal128-high-exponent-clamped",
                Decimal128::Finite {
                    negative: false,
                    coefficient: 1,
                    exponent: 6_144,
                },
            ),
            ("decimal128-positive-infinity", Decimal128::PositiveInfinity),
            ("decimal128-negative-infinity", Decimal128::NegativeInfinity),
            ("decimal128-nan", Decimal128::NaN),
        ];
        for (id, decimal) in decimal_cases {
            assert_eq!(
                decimal_bytes(decimal)?,
                fixture_hex(PAYLOAD_FIXTURE, id, "payload_hex")?.as_slice()
            );
        }
        assert_eq!(
            decimal_bytes(Decimal128::Finite {
                negative: false,
                coefficient: 10,
                exponent: -1,
            })?,
            decimal_bytes(Decimal128::Finite {
                negative: false,
                coefficient: 1,
                exponent: 0,
            })?
        );

        let f32_values = [0x3f80_0000, 0x8000_0000, 1];
        let f16_values = [0x3c00, 0x8000, 1];
        let payload_cases = [
            ("null", EncodeValue::Null),
            ("bool-false", EncodeValue::Bool(false)),
            ("bool-true", EncodeValue::Bool(true)),
            ("int32-min", EncodeValue::Int32(i32::MIN)),
            ("int32-max", EncodeValue::Int32(i32::MAX)),
            ("int64-min", EncodeValue::Int64(i64::MIN)),
            ("int64-max", EncodeValue::Int64(i64::MAX)),
            (
                "float64-positive-zero",
                EncodeValue::Float64Bits(0x0000_0000_0000_0000),
            ),
            (
                "float64-negative-zero",
                EncodeValue::Float64Bits(0x8000_0000_0000_0000),
            ),
            (
                "float64-one",
                EncodeValue::Float64Bits(0x3ff0_0000_0000_0000),
            ),
            (
                "float64-positive-infinity",
                EncodeValue::Float64Bits(0x7ff0_0000_0000_0000),
            ),
            (
                "float64-negative-infinity",
                EncodeValue::Float64Bits(0xfff0_0000_0000_0000),
            ),
            (
                "float64-canonical-quiet-nan",
                EncodeValue::Float64Bits(0x7ff8_0000_0000_0000),
            ),
            (
                "float64-signaling-nan-payload-one",
                EncodeValue::Float64Bits(0x7ff0_0000_0000_0001),
            ),
            ("string-empty", EncodeValue::String("")),
            ("string-nul", EncodeValue::String("\0")),
            ("string-decomposed-e-acute", EncodeValue::String("e\u{301}")),
            ("string-slightly-smiling-face", EncodeValue::String("🙂")),
            ("binary-generic-empty", EncodeValue::Binary(&[])),
            ("binary-generic-00ff", EncodeValue::Binary(&[0, 0xff])),
            ("timestamp-epoch", EncodeValue::Timestamp(0)),
            ("timestamp-min", EncodeValue::Timestamp(TIMESTAMP_MIN)),
            ("timestamp-max", EncodeValue::Timestamp(TIMESTAMP_MAX)),
            ("date-epoch", EncodeValue::Date(0)),
            ("date-min", EncodeValue::Date(DATE_MIN)),
            ("date-max", EncodeValue::Date(DATE_MAX)),
            (
                "uuid-rfc-example",
                EncodeValue::Uuid([
                    0xf8, 0x1d, 0x4f, 0xae, 0x7d, 0xec, 0x11, 0xd0, 0xa7, 0x65, 0x00, 0xa0, 0xc9,
                    0x1e, 0x6b, 0xf6,
                ]),
            ),
            (
                "objectid-example",
                EncodeValue::ObjectId([
                    0x50, 0x7f, 0x1f, 0x77, 0xbc, 0xf8, 0x6c, 0xd7, 0x99, 0x43, 0x90, 0x11,
                ]),
            ),
            ("vector-f32-bits", EncodeValue::VectorF32(&f32_values)),
            ("vector-f16-bits", EncodeValue::VectorF16(&f16_values)),
        ];
        for (id, value) in payload_cases {
            assert_eq!(
                payload(value)?,
                fixture_hex(PAYLOAD_FIXTURE, id, "payload_hex")?
            );
        }

        let hash_cases = [
            ("null", EncodeValue::Null),
            ("bool-false", EncodeValue::Bool(false)),
            ("bool-true", EncodeValue::Bool(true)),
            ("int32-one", EncodeValue::Int32(1)),
            ("int64-one", EncodeValue::Int64(1)),
            ("float64-positive-zero", EncodeValue::Float64Bits(0)),
            (
                "float64-negative-zero",
                EncodeValue::Float64Bits(0x8000_0000_0000_0000),
            ),
            (
                "decimal128-one",
                EncodeValue::Decimal128(Decimal128::Finite {
                    negative: false,
                    coefficient: 1,
                    exponent: 0,
                }),
            ),
            ("string-empty", EncodeValue::String("")),
            ("binary-generic-empty", EncodeValue::Binary(&[])),
            ("timestamp-epoch", EncodeValue::Timestamp(0)),
            ("date-epoch", EncodeValue::Date(0)),
            ("uuid-nil", EncodeValue::Uuid([0; 16])),
            (
                "objectid-incrementing",
                EncodeValue::ObjectId([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
            ),
            ("vector-f32-one", EncodeValue::VectorF32(&[0x3f80_0000])),
            ("vector-f16-one", EncodeValue::VectorF16(&[0x3c00])),
        ];
        for (id, value) in hash_cases {
            assert_eq!(
                hash_noncontainer(value)?,
                fixture_hex(INTEGRITY_FIXTURE, id, "digest_hex")?.as_slice()
            );
        }
        Ok(())
    }

    #[test]
    fn container_typed_hashes_match_canonical_order_and_array_position() -> Result<(), EncodeError>
    {
        let empty_fields = [];
        let empty_object = stage_containers(EncodeDocument::new(&empty_fields))?;
        assert_eq!(
            hash_document(&empty_object)?,
            fixture_hex(INTEGRITY_FIXTURE, "empty-object", "digest_hex")?.as_slice()
        );

        let empty_values = [];
        let empty_array = [ContainerStage {
            input: ContainerInput::Array(&empty_values),
            order: Vec::new(),
            children: Vec::new(),
            depth: 1,
            parent_id: ROOT_SENTINEL,
            parent_slot: ROOT_SENTINEL,
            recursive_fields: 0,
        }];
        assert_eq!(
            hash_document(&empty_array)?,
            fixture_hex(INTEGRITY_FIXTURE, "empty-array", "digest_hex")?.as_slice()
        );

        let null_true = [EncodeValue::Null, EncodeValue::Bool(true)];
        let true_null = [EncodeValue::Bool(true), EncodeValue::Null];
        for (id, values) in [
            ("array-null-true", null_true.as_slice()),
            ("array-true-null", true_null.as_slice()),
        ] {
            let stages = [ContainerStage {
                input: ContainerInput::Array(values),
                order: Vec::new(),
                children: Vec::new(),
                depth: 1,
                parent_id: ROOT_SENTINEL,
                parent_slot: ROOT_SENTINEL,
                recursive_fields: 0,
            }];
            assert_eq!(
                hash_document(&stages)?,
                fixture_hex(INTEGRITY_FIXTURE, id, "digest_hex")?.as_slice()
            );
        }

        let object_fields = [
            EncodeField::new("b", EncodeValue::Null),
            EncodeField::new("a", EncodeValue::Bool(true)),
        ];
        let object = stage_containers(EncodeDocument::new(&object_fields))?;
        assert_eq!(
            hash_document(&object)?,
            fixture_hex(INTEGRITY_FIXTURE, "object-a-true-b-null", "digest_hex")?.as_slice()
        );

        let array_values = [EncodeValue::Null, EncodeValue::Bool(true)];
        let with_array_fields = [EncodeField::new("a", EncodeValue::Array(&array_values))];
        let with_array = stage_containers(EncodeDocument::new(&with_array_fields))?;
        assert_eq!(
            hash_document(&with_array)?,
            fixture_hex(INTEGRITY_FIXTURE, "object-with-array", "digest_hex")?.as_slice()
        );
        Ok(())
    }

    #[test]
    fn every_type_tag_traverses_the_complete_public_encoder() -> Result<(), EncodeError> {
        let empty_fields = [];
        let array_values = [EncodeValue::Null];
        let vector_f32 = [0x3f80_0000, 0x8000_0000, 1];
        let vector_f16 = [0x3c00, 0x8000, 1];
        let fields = [
            EncodeField::new("_id", EncodeValue::Uuid([0; 16])),
            EncodeField::new("t01", EncodeValue::Null),
            EncodeField::new("t02", EncodeValue::Bool(true)),
            EncodeField::new("t03", EncodeValue::Int32(i32::MIN)),
            EncodeField::new("t04", EncodeValue::Int64(i64::MAX)),
            EncodeField::new("t05", EncodeValue::Float64Bits(0x7ff0_0000_0000_0001)),
            EncodeField::new(
                "t06",
                EncodeValue::Decimal128(Decimal128::Finite {
                    negative: true,
                    coefficient: 12_345,
                    exponent: -2,
                }),
            ),
            EncodeField::new("t07", EncodeValue::String("e\u{301}")),
            EncodeField::new("t08", EncodeValue::Binary(&[0, 0xff])),
            EncodeField::new("t09", EncodeValue::Object(EncodeObject::new(&empty_fields))),
            EncodeField::new("t10", EncodeValue::Array(&array_values)),
            EncodeField::new("t11", EncodeValue::Timestamp(TIMESTAMP_MIN)),
            EncodeField::new("t12", EncodeValue::Date(DATE_MAX)),
            EncodeField::new("t13", EncodeValue::Uuid([0xff; 16])),
            EncodeField::new("t14", EncodeValue::ObjectId([0xff; 12])),
            EncodeField::new("t15", EncodeValue::VectorF32(&vector_f32)),
            EncodeField::new("t16", EncodeValue::VectorF16(&vector_f16)),
        ];
        let encoded = encode_with_options(EncodeDocument::new(&fields), disabled())?;
        let decoded = decode(encoded.as_bytes()).map_err(|_| EncodeError::ArithmeticOverflow)?;
        assert_eq!(decoded.content_hash(), encoded.content_hash());
        assert_eq!(decoded.field_count(), 17);
        assert_eq!(&encoded.as_bytes()[28..32], &17_u32.to_le_bytes());
        let expected_tags = [13, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
        for (index, expected) in expected_tags.iter().enumerate() {
            assert_eq!(encoded.as_bytes()[192 + index * 24 + 10], *expected);
        }
        let mut checksum_input = encoded.as_bytes().to_vec();
        let stored_checksum = checksum_input[32..36].to_vec();
        checksum_input[32..36].fill(0);
        assert_eq!(
            stored_checksum,
            CRC32C.checksum(&checksum_input).to_le_bytes()
        );
        assert_eq!(
            encoded,
            encode_with_options(EncodeDocument::new(&fields), disabled())?
        );
        Ok(())
    }

    #[test]
    #[allow(
        clippy::too_many_lines,
        reason = "the validation matrix is easier to audit when its adjacent error cases stay together"
    )]
    fn public_validation_rejects_invalid_shape_names_values_and_limits() {
        error(
            encode_with_options(EncodeDocument::new(&[]), disabled()),
            EncodeError::MissingRootId,
        );
        let invalid_id = [EncodeField::new("_id", EncodeValue::Null)];
        error(
            encode_with_options(EncodeDocument::new(&invalid_id), disabled()),
            EncodeError::InvalidRootIdType,
        );
        for name in ["", "$bad", "a.b", "control\u{7f}", "control\u{1f}"] {
            let fields = [
                EncodeField::new("_id", EncodeValue::Int32(1)),
                EncodeField::new(name, EncodeValue::Null),
            ];
            error(
                encode_with_options(EncodeDocument::new(&fields), disabled()),
                EncodeError::InvalidFieldName,
            );
        }
        let duplicate = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new("same", EncodeValue::Null),
            EncodeField::new("same", EncodeValue::Bool(true)),
        ];
        error(
            encode_with_options(EncodeDocument::new(&duplicate), disabled()),
            EncodeError::DuplicateField,
        );
        for protected in ["_v", "_ts"] {
            let fields = [
                EncodeField::new("_id", EncodeValue::Int32(1)),
                EncodeField::new(protected, EncodeValue::Null),
            ];
            error(
                encode_with_options(EncodeDocument::new(&fields), disabled()),
                EncodeError::ProtectedRootField,
            );
        }

        let bytes_name = "a".repeat(1_025);
        let fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new(&bytes_name, EncodeValue::Null),
        ];
        error(
            encode_with_options(EncodeDocument::new(&fields), disabled()),
            EncodeError::LimitExceeded {
                limit: LimitId::FieldNameUtf8Bytes,
                maximum: 1_024,
                observed: 1_025,
            },
        );
        let scalar_name = "é".repeat(257);
        let fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new(&scalar_name, EncodeValue::Null),
        ];
        error(
            encode_with_options(EncodeDocument::new(&fields), disabled()),
            EncodeError::LimitExceeded {
                limit: LimitId::FieldNameScalars,
                maximum: 256,
                observed: 257,
            },
        );

        for value in [
            EncodeValue::Timestamp(TIMESTAMP_MIN - 1),
            EncodeValue::Timestamp(TIMESTAMP_MAX + 1),
            EncodeValue::Date(DATE_MIN - 1),
            EncodeValue::Date(DATE_MAX + 1),
        ] {
            let fields = [
                EncodeField::new("_id", EncodeValue::Int32(1)),
                EncodeField::new("bad", value),
            ];
            error(
                encode_with_options(EncodeDocument::new(&fields), disabled()),
                EncodeError::TemporalRange,
            );
        }
        for value in [
            EncodeValue::VectorF32(&[]),
            EncodeValue::VectorF32(&[0x7f80_0000]),
            EncodeValue::VectorF32(&[0x7fc0_0001]),
            EncodeValue::VectorF16(&[]),
            EncodeValue::VectorF16(&[0x7c00]),
            EncodeValue::VectorF16(&[0x7e01]),
        ] {
            let fields = [
                EncodeField::new("_id", EncodeValue::Int32(1)),
                EncodeField::new("bad", value),
            ];
            error(
                encode_with_options(EncodeDocument::new(&fields), disabled()),
                EncodeError::InvalidVector,
            );
        }
        let finite_f32 = [0x3f80_0000, 0x8000_0000, 1];
        let finite_f16 = [0x3c00, 0x8000, 1];
        let valid_values = [
            EncodeValue::VectorF32(&finite_f32),
            EncodeValue::VectorF16(&finite_f16),
        ];
        let fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new("vectors", EncodeValue::Array(&valid_values)),
        ];
        assert!(encode_with_options(EncodeDocument::new(&fields), disabled()).is_ok());
        let oversized_vector = vec![0_u32; 4_097];
        let fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new("bad", EncodeValue::VectorF32(&oversized_vector)),
        ];
        error(
            encode_with_options(EncodeDocument::new(&fields), disabled()),
            EncodeError::LimitExceeded {
                limit: LimitId::VectorDimension,
                maximum: 4_096,
                observed: 4_097,
            },
        );

        for decimal in [
            Decimal128::Finite {
                negative: false,
                coefficient: 0,
                exponent: 0,
            },
            Decimal128::Finite {
                negative: false,
                coefficient: DECIMAL_COEFFICIENT_LIMIT,
                exponent: 0,
            },
            Decimal128::Finite {
                negative: false,
                coefficient: 1,
                exponent: -6_177,
            },
            Decimal128::Finite {
                negative: false,
                coefficient: 1,
                exponent: 6_145,
            },
            Decimal128::Finite {
                negative: false,
                coefficient: 10,
                exponent: i32::MAX,
            },
        ] {
            let fields = [
                EncodeField::new("_id", EncodeValue::Int32(1)),
                EncodeField::new("bad", EncodeValue::Decimal128(decimal)),
            ];
            error(
                encode_with_options(EncodeDocument::new(&fields), disabled()),
                EncodeError::InvalidDecimal,
            );
        }
    }

    #[test]
    #[allow(
        clippy::too_many_lines,
        reason = "portable limit boundaries remain together as one auditable acceptance matrix"
    )]
    fn root_id_domain_and_large_limit_boundaries_are_enforced() -> Result<(), EncodeError> {
        let long_string = "x".repeat(1_024);
        let long_binary = vec![0_u8; 1_024];
        for id in [
            EncodeValue::Int32(i32::MIN),
            EncodeValue::Int64(i64::MAX),
            EncodeValue::String(&long_string),
            EncodeValue::Binary(&long_binary),
            EncodeValue::Uuid([0xff; 16]),
            EncodeValue::ObjectId([0xff; 12]),
        ] {
            let fields = [EncodeField::new("_id", id)];
            encode_with_options(EncodeDocument::new(&fields), disabled())?;
        }
        let too_long_string = "x".repeat(1_025);
        let fields = [EncodeField::new(
            "_id",
            EncodeValue::String(&too_long_string),
        )];
        error(
            encode_with_options(EncodeDocument::new(&fields), disabled()),
            EncodeError::LimitExceeded {
                limit: LimitId::IdPayloadBytes,
                maximum: 1_024,
                observed: 1_025,
            },
        );
        let too_long_binary = vec![0_u8; 1_025];
        let fields = [EncodeField::new(
            "_id",
            EncodeValue::Binary(&too_long_binary),
        )];
        error(
            encode_with_options(EncodeDocument::new(&fields), disabled()),
            EncodeError::LimitExceeded {
                limit: LimitId::IdPayloadBytes,
                maximum: 1_024,
                observed: 1_025,
            },
        );

        let object_fields = vec![EncodeField::new("x", EncodeValue::Null); 10_001];
        let root_fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new(
                "nested",
                EncodeValue::Object(EncodeObject::new(&object_fields)),
            ),
        ];
        error(
            encode_with_options(EncodeDocument::new(&root_fields), disabled()),
            EncodeError::LimitExceeded {
                limit: LimitId::ObjectFields,
                maximum: 10_000,
                observed: 10_001,
            },
        );

        let field_names = (0..10_000)
            .map(|index| format!("f{index:04}"))
            .collect::<Vec<_>>();
        let repeated_fields = field_names
            .iter()
            .map(|name| EncodeField::new(name, EncodeValue::Null))
            .collect::<Vec<_>>();
        let root_fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new(
                "n00",
                EncodeValue::Object(EncodeObject::new(&repeated_fields)),
            ),
            EncodeField::new(
                "n01",
                EncodeValue::Object(EncodeObject::new(&repeated_fields)),
            ),
            EncodeField::new(
                "n02",
                EncodeValue::Object(EncodeObject::new(&repeated_fields)),
            ),
            EncodeField::new(
                "n03",
                EncodeValue::Object(EncodeObject::new(&repeated_fields)),
            ),
            EncodeField::new(
                "n04",
                EncodeValue::Object(EncodeObject::new(&repeated_fields)),
            ),
            EncodeField::new(
                "n05",
                EncodeValue::Object(EncodeObject::new(&repeated_fields)),
            ),
            EncodeField::new(
                "n06",
                EncodeValue::Object(EncodeObject::new(&repeated_fields)),
            ),
            EncodeField::new(
                "n07",
                EncodeValue::Object(EncodeObject::new(&repeated_fields)),
            ),
            EncodeField::new(
                "n08",
                EncodeValue::Object(EncodeObject::new(&repeated_fields)),
            ),
            EncodeField::new(
                "n09",
                EncodeValue::Object(EncodeObject::new(&repeated_fields)),
            ),
        ];
        error(
            encode_with_options(EncodeDocument::new(&root_fields), disabled()),
            EncodeError::LimitExceeded {
                limit: LimitId::DocumentTotalFields,
                maximum: 100_000,
                observed: 100_011,
            },
        );

        let oversized_array = vec![EncodeValue::Null; 1_000_001];
        let root_fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new("array", EncodeValue::Array(&oversized_array)),
        ];
        error(
            encode_with_options(EncodeDocument::new(&root_fields), disabled()),
            EncodeError::LimitExceeded {
                limit: LimitId::ArrayElements,
                maximum: 1_000_000,
                observed: 1_000_001,
            },
        );

        with_nested_arrays(98, &mut |nested| {
            let root_fields = [
                EncodeField::new("_id", EncodeValue::Int32(1)),
                EncodeField::new("deep", EncodeValue::Array(nested)),
            ];
            assert!(
                encode_with_options(EncodeDocument::new(&root_fields), disabled())
                    .is_ok_and(|encoded| decode(encoded.as_bytes()).is_ok())
            );
        });
        with_nested_arrays(99, &mut |nested| {
            let root_fields = [
                EncodeField::new("_id", EncodeValue::Int32(1)),
                EncodeField::new("deep", EncodeValue::Array(nested)),
            ];
            error(
                encode_with_options(EncodeDocument::new(&root_fields), disabled()),
                EncodeError::LimitExceeded {
                    limit: LimitId::DocumentDepth,
                    maximum: 100,
                    observed: 101,
                },
            );
        });

        let mut oversized_value = "x".repeat(16_776_852);
        let root_fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new("large", EncodeValue::String(&oversized_value)),
        ];
        let exact = encode_with_options(EncodeDocument::new(&root_fields), disabled())?;
        assert_eq!(exact.canonical_length(), 16_777_216);
        assert_eq!(exact.as_bytes().len(), 16_777_216);
        let decoded = decode(exact.as_bytes()).map_err(|_| EncodeError::ArithmeticOverflow)?;
        assert_eq!(decoded.canonical_length(), 16_777_216);
        drop(exact);
        oversized_value.push('x');
        let root_fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new("large", EncodeValue::String(&oversized_value)),
        ];
        error(
            encode_with_options(EncodeDocument::new(&root_fields), disabled()),
            EncodeError::LimitExceeded {
                limit: LimitId::DocumentCanonicalBytes,
                maximum: 16_777_216,
                observed: 16_777_224,
            },
        );
        Ok(())
    }

    #[test]
    fn validating_decoder_accepts_exact_base_and_compressed_profiles() -> Result<(), Box<dyn Error>>
    {
        let base_fields = [
            EncodeField::new("s", EncodeValue::String("")),
            EncodeField::new("_id", EncodeValue::Uuid([0; 16])),
            EncodeField::new("n", EncodeValue::Null),
        ];
        let base = encode_with_options(EncodeDocument::new(&base_fields), disabled())?;
        let decoded = decode(base.as_bytes())?;
        assert_eq!(decoded.as_bytes(), base.as_bytes());
        assert_eq!(decoded.content_hash(), base.content_hash());
        assert_eq!(decoded.canonical_length(), 408);
        assert_eq!(decoded.field_count(), 3);
        assert_eq!(decoded.compressed_section_count(), 0);
        assert_eq!(decoded, decoded.clone());

        let repeated = "a".repeat(4_096);
        let compressed_fields = [
            EncodeField::new("_id", EncodeValue::ObjectId([0; 12])),
            EncodeField::new("payload", EncodeValue::String(&repeated)),
        ];
        let compressed = encode(EncodeDocument::new(&compressed_fields))?;
        let decoded_compressed = decode(compressed.as_bytes())?;
        assert_eq!(decoded_compressed.as_bytes(), compressed.as_bytes());
        assert_eq!(decoded_compressed.content_hash(), compressed.content_hash());
        assert_eq!(decoded_compressed.canonical_length(), 4_480);
        assert_eq!(decoded_compressed.field_count(), 2);
        assert_eq!(decoded_compressed.compressed_section_count(), 1);

        let mut wrong_magic = base.as_bytes().to_vec();
        wrong_magic[0] ^= 1;
        assert_eq!(decode(&wrong_magic), Err(DecodeError::FormatUnsupported));
        assert_eq!(
            DecodeError::FormatUnsupported.code(),
            "CAP_FORMAT_UNSUPPORTED"
        );
        assert_eq!(DecodeError::FormatUnsupported.check(), None);
        assert_eq!(
            DecodeError::FormatUnsupported.to_string(),
            "CAP_FORMAT_UNSUPPORTED"
        );
        let version = DecodeError::UnsupportedVersion { major: 2, minor: 0 };
        assert_eq!(version.code(), "CAP_UNSUPPORTED_VERSION");
        assert_eq!(version.check(), None);
        assert_eq!(version.to_string(), "CAP_UNSUPPORTED_VERSION: 2.0");
        let feature = unsupported(DecodeCheck::Feature, 2);
        assert_eq!(feature.code(), "CAP_FORMAT_UNSUPPORTED");
        assert_eq!(feature.check(), Some(DecodeCheck::Feature));
        assert_eq!(feature.to_string(), "CAP_FORMAT_UNSUPPORTED: feature 2");
        let corrupt = corruption(DecodeCheck::Checksum, 32);
        assert_eq!(corrupt.code(), "DUR_CORRUPTION");
        assert_eq!(corrupt.check(), Some(DecodeCheck::Checksum));
        assert_eq!(corrupt.to_string(), "DUR_CORRUPTION: checksum at 32");
        Ok(())
    }

    #[test]
    #[allow(
        clippy::too_many_lines,
        reason = "the fail-closed envelope mutation matrix is audited as one ordered trust sequence"
    )]
    fn decoder_rejects_header_length_feature_checksum_directory_and_footer_mutations()
    -> Result<(), Box<dyn Error>> {
        let encoded = decoder_scalar_hdoc()?;
        let base = encoded.as_bytes();
        for length in 0..base.len() {
            assert!(
                decode(&base[..length]).is_err(),
                "truncation {length} passed"
            );
        }
        let mut trailing = base.to_vec();
        trailing.push(0);
        expect_decode_check(&trailing, DecodeCheck::Length);

        for index in (0..base.len()).filter(|index| !(32..36).contains(index)) {
            let flipped = mutate_hdoc(base, |bytes| bytes[index] ^= 0x80);
            assert!(decode(&flipped).is_err(), "bit flip at byte {index} passed");
        }

        let wrong_major = mutate_hdoc(base, |bytes| put_u16(bytes, 8, 2));
        assert_eq!(
            decode(&wrong_major),
            Err(DecodeError::UnsupportedVersion { major: 2, minor: 0 })
        );
        let wrong_minor = mutate_hdoc(base, |bytes| put_u16(bytes, 10, 1));
        assert_eq!(
            decode(&wrong_minor),
            Err(DecodeError::UnsupportedVersion { major: 1, minor: 1 })
        );
        for candidate in [
            mutate_hdoc(base, |bytes| put_u16(bytes, 12, 200)),
            mutate_hdoc(base, |bytes| put_u16(bytes, 14, 24)),
            mutate_hdoc(base, |bytes| put_u16(bytes, 38, 1)),
            mutate_hdoc(base, |bytes| put_u32(bytes, 40, 72)),
            mutate_hdoc(base, |bytes| put_u16(bytes, 36, 3)),
        ] {
            expect_decode_check(&candidate, DecodeCheck::Header);
        }
        let extra_section = mutate_hdoc(base, |bytes| put_u16(bytes, 36, 5));
        assert_eq!(
            decode(&extra_section),
            Err(unsupported(DecodeCheck::Directory, 5))
        );
        let unknown_required = mutate_hdoc(base, |bytes| put_u64(bytes, 48, 2));
        assert_eq!(
            decode(&unknown_required),
            Err(unsupported(DecodeCheck::Feature, 2))
        );
        let unknown_optional = mutate_hdoc(base, |bytes| put_u64(bytes, 56, 1));
        assert_eq!(
            decode(&unknown_optional),
            Err(unsupported(DecodeCheck::Feature, 1_u64 << 32))
        );
        let unsupported_flag = mutate_hdoc(base, |bytes| put_u32(bytes, 16, 2));
        assert_eq!(
            decode(&unsupported_flag),
            Err(unsupported(DecodeCheck::Feature, 2_u64 << 32))
        );
        let feature_mismatch = mutate_hdoc(base, |bytes| put_u64(bytes, 48, 1));
        expect_decode_check(&feature_mismatch, DecodeCheck::Feature);

        for candidate in [
            mutate_hdoc(base, |bytes| put_u32(bytes, 20, 256)),
            mutate_hdoc(base, |bytes| put_u32(bytes, 24, 16_777_224)),
            mutate_hdoc(base, |bytes| put_u32(bytes, 44, 0)),
        ] {
            expect_decode_check(&candidate, DecodeCheck::Length);
        }
        let too_many_fields = mutate_hdoc(base, |bytes| put_u32(bytes, 28, 100_001));
        expect_decode_check(&too_many_fields, DecodeCheck::Limit);

        let mut wrong_checksum = base.to_vec();
        wrong_checksum[200] ^= 1;
        expect_decode_check(&wrong_checksum, DecodeCheck::Checksum);
        let mut unknown_feature_with_bad_crc = base.to_vec();
        put_u64(&mut unknown_feature_with_bad_crc, 48, 2);
        expect_decode_check(&unknown_feature_with_bad_crc, DecodeCheck::Checksum);

        let wrong_kind = mutate_hdoc(base, |bytes| put_u16(bytes, 64, 2));
        expect_decode_check(&wrong_kind, DecodeCheck::Directory);
        let unknown_section_version = mutate_hdoc(base, |bytes| put_u16(bytes, 64 + 24, 2));
        assert_eq!(
            decode(&unknown_section_version),
            Err(unsupported(DecodeCheck::Directory, (1_u64 << 32) | 2))
        );
        for candidate in [
            mutate_hdoc(base, |bytes| put_u16(bytes, 64 + 2, 0x16)),
            mutate_hdoc(base, |bytes| put_u16(bytes, 64 + 26, 1)),
            mutate_hdoc(base, |bytes| put_u32(bytes, 64 + 28, 1)),
            mutate_hdoc(base, |bytes| put_u32(bytes, 64 + 4, 200)),
            mutate_hdoc(base, |bytes| put_u32(bytes, 64 + 8, 71)),
            mutate_hdoc(base, |bytes| put_u16(bytes, 64 + 20, 1)),
        ] {
            expect_decode_check(&candidate, DecodeCheck::Directory);
        }
        let nonzero_padding = mutate_hdoc(base, |bytes| bytes[293] = 1);
        expect_decode_check(&nonzero_padding, DecodeCheck::Directory);

        let footer = bounded_u64_to_usize(u64::from(read_u32(base, 44, DecodeCheck::Footer)?));
        let bad_footer = mutate_hdoc(base, |bytes| bytes[footer] ^= 1);
        expect_decode_check(&bad_footer, DecodeCheck::Footer);
        let logical_mismatch = mutate_hdoc(base, |bytes| {
            put_u32(bytes, 24, encoded.canonical_length() + 8);
            put_u32(bytes, footer + 24, encoded.canonical_length() + 8);
        });
        expect_decode_check(&logical_mismatch, DecodeCheck::LogicalLayout);
        let hash_mismatch = mutate_hdoc(base, |bytes| bytes[footer + 32] ^= 1);
        expect_decode_check(&hash_mismatch, DecodeCheck::TypedContentHash);

        let checks = [
            DecodeCheck::Header,
            DecodeCheck::Length,
            DecodeCheck::Feature,
            DecodeCheck::Checksum,
            DecodeCheck::Directory,
            DecodeCheck::Footer,
            DecodeCheck::LogicalLayout,
            DecodeCheck::CompressionHeader,
            DecodeCheck::CompressionTable,
            DecodeCheck::CompressionBlock,
            DecodeCheck::CompressionCanonicality,
            DecodeCheck::FieldTable,
            DecodeCheck::NamePool,
            DecodeCheck::ContainerTables,
            DecodeCheck::ValueArea,
            DecodeCheck::Payload,
            DecodeCheck::Limit,
            DecodeCheck::RootId,
            DecodeCheck::TypedContentHash,
        ];
        assert_eq!(checks.len(), 19);
        assert_eq!(checks[0].as_str(), "header");
        assert_eq!(checks[18].as_str(), "typed-content-hash");
        assert!(checks.iter().all(|check| !check.as_str().is_empty()));
        Ok(())
    }

    #[test]
    #[allow(
        clippy::too_many_lines,
        reason = "the inner-grammar mutation corpus stays grouped by names, records, tree, and payload"
    )]
    fn decoder_rejects_name_record_tree_value_and_payload_mutations() -> Result<(), Box<dyn Error>>
    {
        let scalar = decoder_scalar_hdoc()?;
        let scalar_envelope = parse_envelope(scalar.as_bytes())?;
        let field_start = bounded_u64_to_usize(u64::from(scalar_envelope.entries[0].stored_offset));
        let name_start = bounded_u64_to_usize(u64::from(scalar_envelope.entries[1].stored_offset));
        let name_suffix = name_start
            + bounded_u64_to_usize(u64::from(scalar_envelope.entries[1].item_count))
                * bounded_u64_to_usize(NAME_RECORD_BYTES);
        let first_name_offset = read_u32(scalar.as_bytes(), name_start, DecodeCheck::NamePool)?;
        for candidate in [
            mutate_hdoc(scalar.as_bytes(), |bytes| {
                put_u32(bytes, field_start, scalar_envelope.entries[1].item_count);
            }),
            mutate_hdoc(scalar.as_bytes(), |bytes| {
                bytes[field_start + 11] = 1;
            }),
            mutate_hdoc(scalar.as_bytes(), |bytes| {
                bytes[field_start + 10] = 0;
            }),
            mutate_hdoc(scalar.as_bytes(), |bytes| {
                put_u32(bytes, field_start + 24 + 20, 1);
            }),
            mutate_hdoc(scalar.as_bytes(), |bytes| {
                put_u32(bytes, field_start + 4, 0);
            }),
        ] {
            expect_decode_check(&candidate, DecodeCheck::FieldTable);
        }
        for candidate in [
            mutate_hdoc(scalar.as_bytes(), |bytes| {
                put_u32(bytes, name_start, first_name_offset + 1);
            }),
            mutate_hdoc(scalar.as_bytes(), |bytes| {
                put_u16(bytes, name_start + 6, 0);
            }),
            mutate_hdoc(scalar.as_bytes(), |bytes| {
                bytes[name_suffix] = b'$';
            }),
        ] {
            expect_decode_check(&candidate, DecodeCheck::NamePool);
        }

        let missing_id = mutate_hdoc(scalar.as_bytes(), |bytes| {
            bytes[name_suffix + 2] = b'x';
        });
        expect_decode_check(&missing_id, DecodeCheck::RootId);

        let protected_fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new("_x", EncodeValue::Bool(true)),
        ];
        let protected = encode_with_options(EncodeDocument::new(&protected_fields), disabled())?;
        let (_, _, protected_field) = field_locations(protected.as_bytes(), b"_x")?;
        let protected_name = bounded_u64_to_usize(u64::from(protected_field.name_offset));
        let protected_mutation = mutate_hdoc(protected.as_bytes(), |bytes| {
            bytes[protected_name + 1] = b'v';
        });
        expect_decode_check(&protected_mutation, DecodeCheck::RootId);

        let oversized_binary = vec![0x5a; 1_025];
        let oversized_id_fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new("_ix", EncodeValue::Binary(&oversized_binary)),
        ];
        let oversized_id =
            encode_with_options(EncodeDocument::new(&oversized_id_fields), disabled())?;
        let (_, _, original_id) = field_locations(oversized_id.as_bytes(), b"_id")?;
        let (_, _, replacement_id) = field_locations(oversized_id.as_bytes(), b"_ix")?;
        let oversized_id_mutation = mutate_hdoc(oversized_id.as_bytes(), |bytes| {
            bytes[bounded_u64_to_usize(u64::from(original_id.name_offset)) + 2] = b'a';
            bytes[bounded_u64_to_usize(u64::from(replacement_id.name_offset)) + 2] = b'd';
        });
        expect_decode_check(&oversized_id_mutation, DecodeCheck::RootId);

        let nested_name_fields = [EncodeField::new("x", EncodeValue::Bool(true))];
        let unused_name_fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new(
                "a",
                EncodeValue::Object(EncodeObject::new(&nested_name_fields)),
            ),
        ];
        let unused_name =
            encode_with_options(EncodeDocument::new(&unused_name_fields), disabled())?;
        let (_, _, used_a) = field_locations(unused_name.as_bytes(), b"a")?;
        let (nested_x_record, _, _) = field_locations(unused_name.as_bytes(), b"x")?;
        let unused_name_mutation = mutate_hdoc(unused_name.as_bytes(), |bytes| {
            put_u32(bytes, nested_x_record, used_a.field_id);
            put_u32(bytes, nested_x_record + 4, used_a.name_offset);
            put_u16(bytes, nested_x_record + 8, used_a.name_length);
        });
        expect_decode_check(&unused_name_mutation, DecodeCheck::NamePool);

        let nested = decoder_nested_hdoc()?;
        let nested_envelope = parse_envelope(nested.as_bytes())?;
        let container_start =
            bounded_u64_to_usize(u64::from(nested_envelope.entries[3].stored_offset));
        let descriptor_count =
            bounded_u64_to_usize(u64::from(nested_envelope.entries[3].item_count));
        let array_suffix =
            container_start + descriptor_count * bounded_u64_to_usize(CONTAINER_DESCRIPTOR_BYTES);
        let (array_field_record, _, array_field) = field_locations(nested.as_bytes(), b"a")?;
        for candidate in [
            mutate_hdoc(nested.as_bytes(), |bytes| {
                put_u32(bytes, container_start, 1);
            }),
            mutate_hdoc(nested.as_bytes(), |bytes| {
                bytes[container_start + 4] = 10;
            }),
            mutate_hdoc(nested.as_bytes(), |bytes| {
                put_u32(bytes, container_start + 28, 1);
            }),
            mutate_hdoc(nested.as_bytes(), |bytes| {
                put_u32(bytes, container_start + 16, 0);
            }),
            mutate_hdoc(nested.as_bytes(), |bytes| {
                put_u32(bytes, container_start + 32 + 8, 0);
            }),
            mutate_hdoc(nested.as_bytes(), |bytes| {
                put_u32(bytes, container_start + 32 + 20, 1);
            }),
            mutate_hdoc(nested.as_bytes(), |bytes| {
                put_u32(
                    bytes,
                    array_field_record + 12,
                    bounded_usize_to_u32(container_start),
                );
            }),
            mutate_hdoc(nested.as_bytes(), |bytes| {
                bytes[array_suffix + 1] = 1;
            }),
            mutate_hdoc(nested.as_bytes(), |bytes| {
                put_u32(bytes, 64 + 3 * 32 + 16, 0);
            }),
        ] {
            expect_decode_check(&candidate, DecodeCheck::ContainerTables);
        }
        let excessive_depth = mutate_hdoc(nested.as_bytes(), |bytes| {
            put_u16(bytes, container_start + 32 + 6, 101);
        });
        expect_decode_check(&excessive_depth, DecodeCheck::Limit);
        let excessive_array = mutate_hdoc(nested.as_bytes(), |bytes| {
            put_u32(bytes, container_start + 32 + 12, 1_000_001);
        });
        expect_decode_check(&excessive_array, DecodeCheck::Limit);
        assert_eq!(array_field.value.tag, 10);

        let (_, bool_payload, _) = field_locations(scalar.as_bytes(), b"a")?;
        let (int_record, int_payload, int_field) = field_locations(scalar.as_bytes(), b"b")?;
        let nonzero_value_padding = mutate_hdoc(scalar.as_bytes(), |bytes| {
            bytes[int_payload - 1] = 1;
        });
        expect_decode_check(&nonzero_value_padding, DecodeCheck::ValueArea);
        let wrong_value_offset = mutate_hdoc(scalar.as_bytes(), |bytes| {
            put_u32(bytes, int_record + 12, int_field.value.offset + 1);
        });
        expect_decode_check(&wrong_value_offset, DecodeCheck::ValueArea);
        let invalid_bool = mutate_hdoc(scalar.as_bytes(), |bytes| {
            bytes[bool_payload] = 2;
        });
        expect_decode_check(&invalid_bool, DecodeCheck::Payload);

        let (id_record, id_payload, _) = field_locations(scalar.as_bytes(), b"_id")?;
        let zero_decimal = decimal_bytes(Decimal128::Zero { negative: false })?;
        let invalid_id_type = mutate_hdoc(scalar.as_bytes(), |bytes| {
            bytes[id_record + 10] = 6;
            bytes[id_payload..id_payload + 16].copy_from_slice(&zero_decimal);
        });
        expect_decode_check(&invalid_id_type, DecodeCheck::RootId);

        let all_types = decoder_all_types_hdoc()?;
        let (bool_record, bool_offset, _) = field_locations(all_types.as_bytes(), b"t02")?;
        let (_, string_offset, _) = field_locations(all_types.as_bytes(), b"t07")?;
        let (_, binary_offset, _) = field_locations(all_types.as_bytes(), b"t08")?;
        let (_, decimal_offset, _) = field_locations(all_types.as_bytes(), b"t06")?;
        let (_, timestamp_offset, _) = field_locations(all_types.as_bytes(), b"t11")?;
        let (_, date_offset, _) = field_locations(all_types.as_bytes(), b"t12")?;
        let (_, vector_f32_offset, _) = field_locations(all_types.as_bytes(), b"t15")?;
        let (vector_f16_record, vector_f16_offset, _) =
            field_locations(all_types.as_bytes(), b"t16")?;
        for candidate in [
            mutate_hdoc(all_types.as_bytes(), |bytes| {
                bytes[bool_offset] = 2;
            }),
            mutate_hdoc(all_types.as_bytes(), |bytes| {
                bytes[string_offset] = 0xff;
            }),
            mutate_hdoc(all_types.as_bytes(), |bytes| {
                bytes[binary_offset] = 1;
            }),
            mutate_hdoc(all_types.as_bytes(), |bytes| {
                bytes[decimal_offset..decimal_offset + 16].fill(0);
            }),
            mutate_hdoc(all_types.as_bytes(), |bytes| {
                bytes[timestamp_offset..timestamp_offset + 8]
                    .copy_from_slice(&(TIMESTAMP_MAX + 1).to_le_bytes());
            }),
            mutate_hdoc(all_types.as_bytes(), |bytes| {
                bytes[date_offset..date_offset + 4].copy_from_slice(&(DATE_MAX + 1).to_le_bytes());
            }),
            mutate_hdoc(all_types.as_bytes(), |bytes| {
                put_u32(bytes, vector_f32_offset + 4, 0x7f80_0000);
            }),
            mutate_hdoc(all_types.as_bytes(), |bytes| {
                put_u16(bytes, vector_f16_offset + 4, 0x7c00);
            }),
            mutate_hdoc(all_types.as_bytes(), |bytes| {
                put_u32(bytes, vector_f16_record + 16, 9);
            }),
        ] {
            expect_decode_check(&candidate, DecodeCheck::Payload);
        }
        let unknown_tag = mutate_hdoc(all_types.as_bytes(), |bytes| {
            bytes[bool_record + 10] = 17;
        });
        expect_decode_check(&unknown_tag, DecodeCheck::FieldTable);
        Ok(())
    }

    #[test]
    #[allow(
        clippy::too_many_lines,
        reason = "compression trust-order and canonicality mutations are reviewed as one matrix"
    )]
    fn decoder_bounds_decompression_and_rejects_noncanonical_streams() -> Result<(), Box<dyn Error>>
    {
        let compressed = fixture_hex(
            COMPRESSION_FIXTURE,
            "large-string-value-area-lz4",
            "hdoc_hex",
        )?;
        let decoded = decode(&compressed)?;
        assert_eq!(decoded.as_bytes(), compressed);
        assert_eq!(decoded.canonical_length(), 4_472);
        assert_eq!(decoded.compressed_section_count(), 1);

        let directory = 64 + 2 * 32;
        let stream_start = bounded_u64_to_usize(u64::from(read_u32(
            &compressed,
            directory + 4,
            DecodeCheck::Directory,
        )?));
        let payload_offset = bounded_u64_to_usize(u64::from(read_u32(
            &compressed,
            stream_start + 24,
            DecodeCheck::CompressionHeader,
        )?));
        let block_payload = stream_start + payload_offset;

        let unknown_codec = mutate_hdoc(&compressed, |bytes| {
            put_u16(bytes, directory + 20, 2);
        });
        assert_eq!(
            decode(&unknown_codec),
            Err(unsupported(
                DecodeCheck::CompressionHeader,
                (2_u64 << 32) | 1
            ))
        );
        for candidate in [
            mutate_hdoc(&compressed, |bytes| {
                bytes[stream_start] ^= 1;
            }),
            mutate_hdoc(&compressed, |bytes| {
                put_u16(bytes, stream_start + 8, 2);
            }),
            mutate_hdoc(&compressed, |bytes| {
                put_u16(bytes, stream_start + 10, 24);
            }),
            mutate_hdoc(&compressed, |bytes| {
                put_u16(bytes, stream_start + 12, 16);
            }),
            mutate_hdoc(&compressed, |bytes| {
                bytes[stream_start + 14] = 14;
            }),
            mutate_hdoc(&compressed, |bytes| {
                bytes[stream_start + 15] = 1;
            }),
            mutate_hdoc(&compressed, |bytes| {
                put_u32(bytes, stream_start + 20, 4_111);
            }),
            mutate_hdoc(&compressed, |bytes| {
                put_u32(bytes, stream_start + 28, 1);
            }),
        ] {
            expect_decode_check(&candidate, DecodeCheck::CompressionHeader);
        }
        for candidate in [
            mutate_hdoc(&compressed, |bytes| {
                put_u32(bytes, stream_start + 16, 0);
            }),
            mutate_hdoc(&compressed, |bytes| {
                put_u32(bytes, stream_start + 24, 55);
            }),
            mutate_hdoc(&compressed, |bytes| {
                put_u32(bytes, stream_start + 32, 1);
            }),
            mutate_hdoc(&compressed, |bytes| {
                put_u32(bytes, stream_start + 36, 4_110);
            }),
            mutate_hdoc(&compressed, |bytes| {
                put_u32(bytes, stream_start + 40, 57);
            }),
            mutate_hdoc(&compressed, |bytes| {
                put_u32(bytes, stream_start + 44, 0);
            }),
            mutate_hdoc(&compressed, |bytes| {
                put_u16(bytes, stream_start + 48, 2);
            }),
            mutate_hdoc(&compressed, |bytes| {
                put_u16(bytes, stream_start + 50, 1);
            }),
            mutate_hdoc(&compressed, |bytes| {
                put_u32(bytes, stream_start + 52, 1);
            }),
        ] {
            expect_decode_check(&candidate, DecodeCheck::CompressionTable);
        }

        let invalid_lz4 = mutate_hdoc(&compressed, |bytes| {
            bytes[block_payload] = 0x10;
            bytes[block_payload + 1] = b'A';
            bytes[block_payload + 2] = 0;
            bytes[block_payload + 3] = 0;
        });
        expect_decode_check(&invalid_lz4, DecodeCheck::CompressionBlock);

        let canonical_payload_length = bounded_u64_to_usize(u64::from(read_u32(
            &compressed,
            stream_start + 44,
            DecodeCheck::CompressionTable,
        )?));
        assert_eq!(canonical_payload_length, 31);
        let canonical_payload = compressed
            .get(block_payload..block_payload + canonical_payload_length)
            .ok_or_else(|| corruption(DecodeCheck::CompressionBlock, block_payload))?
            .to_vec();
        let mut alternate = compressed.clone();
        alternate[block_payload] = 0x2a;
        alternate[block_payload + 1] = 0;
        alternate[block_payload + 2] = 0;
        alternate[block_payload + 3] = 2;
        alternate[block_payload + 4] = 0;
        alternate[block_payload + 5..block_payload + 32].copy_from_slice(&canonical_payload[4..]);
        put_u32(&mut alternate, directory + 8, 88);
        put_u32(&mut alternate, stream_start + 44, 32);
        refresh_hdoc_checksum(&mut alternate);
        expect_decode_check(&alternate, DecodeCheck::CompressionCanonicality);

        let mut mixed_data = vec![0_u8; 32_751];
        mixed_data.extend_from_slice(&splitmix_bytes(257));
        let mixed_fields = [
            EncodeField::new("_id", EncodeValue::Uuid([0; 16])),
            EncodeField::new("data", EncodeValue::Binary(&mixed_data)),
        ];
        let mixed = encode(EncodeDocument::new(&mixed_fields))?;
        let mixed_envelope = parse_envelope(mixed.as_bytes())?;
        let mixed_entry = mixed_envelope.entries[2];
        assert_eq!(mixed_entry.flags, 7);
        let mixed_stream = bounded_u64_to_usize(u64::from(mixed_entry.stored_offset));
        assert_eq!(
            read_u32(
                mixed.as_bytes(),
                mixed_stream + 16,
                DecodeCheck::CompressionHeader,
            )?,
            2
        );
        assert_eq!(
            read_u16(
                mixed.as_bytes(),
                mixed_stream + 32 + 24 + 16,
                DecodeCheck::CompressionTable,
            )?,
            1
        );
        assert_eq!(
            decode(mixed.as_bytes())?.content_hash(),
            mixed.content_hash()
        );
        Ok(())
    }

    #[test]
    #[allow(
        clippy::too_many_lines,
        reason = "each assertion proves a distinct decoder guard fails closed without panicking"
    )]
    fn decoder_defensive_rejection_paths_fail_closed() -> Result<(), Box<dyn Error>> {
        let scalar = decoder_scalar_hdoc()?;
        let base = scalar.as_bytes();
        let last_directory = 64 + 3 * 32;
        let last_length = read_u32(base, last_directory + 8, DecodeCheck::Directory)?;

        let compressed = fixture_hex(
            COMPRESSION_FIXTURE,
            "large-string-value-area-lz4",
            "hdoc_hex",
        )?;
        let compressed_directory = 64 + 2 * 32;
        let compressed_logical = read_u32(
            &compressed,
            compressed_directory + 12,
            DecodeCheck::Directory,
        )?;
        let invalid_compressed_length = mutate_hdoc(&compressed, |bytes| {
            put_u32(bytes, compressed_directory + 8, compressed_logical);
        });
        expect_decode_check(&invalid_compressed_length, DecodeCheck::Directory);

        let section_overruns_footer = mutate_hdoc(base, |bytes| {
            put_u32(bytes, last_directory + 8, last_length + 64);
            put_u32(bytes, last_directory + 12, last_length + 64);
        });
        expect_decode_check(&section_overruns_footer, DecodeCheck::Directory);
        let footer_position_mismatch = mutate_hdoc(base, |bytes| {
            put_u32(bytes, last_directory + 8, last_length - 8);
            put_u32(bytes, last_directory + 12, last_length - 8);
        });
        expect_decode_check(&footer_position_mismatch, DecodeCheck::Directory);

        let array_values = [EncodeValue::Null];
        let padded_fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new("array", EncodeValue::Array(&array_values)),
        ];
        let padded = encode_with_options(EncodeDocument::new(&padded_fields), disabled())?;
        let padded_envelope = parse_envelope(padded.as_bytes())?;
        let last_entry = padded_envelope.entries[3];
        let padding_start = bounded_u64_to_usize(
            u64::from(last_entry.stored_offset) + u64::from(last_entry.stored_length),
        );
        assert!(
            padding_start
                < bounded_u64_to_usize(u64::from(read_u32(
                    padded.as_bytes(),
                    44,
                    DecodeCheck::Footer,
                )?))
        );
        let nonzero_footer_padding = mutate_hdoc(padded.as_bytes(), |bytes| {
            bytes[padding_start] = 1;
        });
        expect_decode_check(&nonzero_footer_padding, DecodeCheck::Directory);
        expect_result_check(
            align8_decode(u64::MAX, DecodeCheck::LogicalLayout, 24),
            DecodeCheck::LogicalLayout,
        );

        let stream_start = bounded_u64_to_usize(u64::from(read_u32(
            &compressed,
            compressed_directory + 4,
            DecodeCheck::Directory,
        )?));
        let descriptor_stored_length = read_u32(
            &compressed,
            stream_start + 44,
            DecodeCheck::CompressionTable,
        )?;
        let stream_overrun = mutate_hdoc(&compressed, |bytes| {
            put_u32(bytes, stream_start + 44, descriptor_stored_length + 1);
        });
        expect_decode_check(&stream_overrun, DecodeCheck::CompressionTable);
        let stream_trailing_byte = mutate_hdoc(&compressed, |bytes| {
            put_u32(bytes, stream_start + 44, descriptor_stored_length - 1);
        });
        expect_decode_check(&stream_trailing_byte, DecodeCheck::CompressionTable);

        let short_logical = vec![b'A'; 99];
        let short_stream = lz4_flex::block::compress(&short_logical);
        assert!(short_stream.len() < 100);
        let mut mismatched_stream = vec![0_u8; 56 + short_stream.len()];
        mismatched_stream[..8].copy_from_slice(COMPRESSION_MAGIC);
        put_u16(&mut mismatched_stream, 8, 1);
        put_u16(&mut mismatched_stream, 10, 32);
        put_u16(&mut mismatched_stream, 12, 24);
        mismatched_stream[14] = 15;
        put_u32(&mut mismatched_stream, 16, 1);
        put_u32(&mut mismatched_stream, 20, 100);
        put_u32(&mut mismatched_stream, 24, 56);
        put_u32(&mut mismatched_stream, 36, 100);
        put_u32(&mut mismatched_stream, 40, 56);
        put_u32(
            &mut mismatched_stream,
            44,
            bounded_usize_to_u32(short_stream.len()),
        );
        mismatched_stream[56..].copy_from_slice(&short_stream);
        let mismatched_entry = DirectoryEntry {
            flags: 7,
            stored_offset: 0,
            stored_length: bounded_usize_to_u32(mismatched_stream.len()),
            logical_length: 100,
            item_count: 0,
            codec_id: 1,
            codec_profile_id: 1,
        };
        expect_result_check(
            decode_compressed_section(&mismatched_stream, mismatched_entry),
            DecodeCheck::CompressionBlock,
        );

        let empty_sections = [Vec::new(), Vec::new(), Vec::new(), Vec::new()];
        let mut envelope = synthetic_envelope(1);
        expect_result_check(
            validate_logical_sections(&empty_sections, &envelope),
            DecodeCheck::FieldTable,
        );
        envelope.entries[0].item_count = 1;
        envelope.entries[1].item_count = 2;
        let mut one_field_sections = [vec![0; 24], Vec::new(), Vec::new(), Vec::new()];
        expect_result_check(
            validate_logical_sections(&one_field_sections, &envelope),
            DecodeCheck::NamePool,
        );
        expect_result_check(parse_names(&[], 0, 1), DecodeCheck::NamePool);

        let mut invalid_utf8_name = vec![0_u8; 9];
        put_u32(&mut invalid_utf8_name, 0, 108);
        put_u16(&mut invalid_utf8_name, 4, 1);
        put_u16(&mut invalid_utf8_name, 6, 1);
        invalid_utf8_name[8] = 0xff;
        expect_result_check(
            parse_names(&invalid_utf8_name, 100, 1),
            DecodeCheck::NamePool,
        );
        let mut trailing_name = vec![0_u8; 10];
        put_u32(&mut trailing_name, 0, 108);
        put_u16(&mut trailing_name, 4, 1);
        put_u16(&mut trailing_name, 6, 1);
        trailing_name[8] = b'a';
        expect_result_check(parse_names(&trailing_name, 100, 1), DecodeCheck::NamePool);

        expect_result_check(
            parse_containers_and_arrays(&[], 0, 0, 0, 1),
            DecodeCheck::ContainerTables,
        );
        expect_result_check(
            parse_containers_and_arrays(&[0; 33], 0, 0, 0, 1),
            DecodeCheck::ContainerTables,
        );
        let nested = decoder_nested_hdoc()?;
        let nested_envelope = parse_envelope(nested.as_bytes())?;
        let container_start =
            bounded_u64_to_usize(u64::from(nested_envelope.entries[3].stored_offset));
        let sentinel_parent = mutate_hdoc(nested.as_bytes(), |bytes| {
            put_u32(bytes, container_start + 32 + 20, ROOT_SENTINEL);
        });
        expect_decode_check(&sentinel_parent, DecodeCheck::ContainerTables);

        let mut excessive_items = vec![0_u8; 32];
        excessive_items[4] = 9;
        put_u16(&mut excessive_items, 6, 1);
        put_u32(&mut excessive_items, 12, 2);
        put_u32(&mut excessive_items, 16, 1);
        put_u32(&mut excessive_items, 20, ROOT_SENTINEL);
        put_u32(&mut excessive_items, 24, ROOT_SENTINEL);
        expect_result_check(
            parse_containers_and_arrays(&excessive_items, 0, 0, 1, 1),
            DecodeCheck::ContainerTables,
        );
        put_u32(&mut excessive_items, 12, 0);
        put_u32(&mut excessive_items, 16, 0);
        expect_result_check(
            parse_containers_and_arrays(&excessive_items, 0, 0, 1, 1),
            DecodeCheck::ContainerTables,
        );

        let name_section = b"_id".to_vec();
        one_field_sections[1] = name_section.clone();
        let names = [NameRecord {
            absolute_offset: 0,
            local_offset: 0,
            length: 3,
        }];
        let id_field = FieldRecord {
            field_id: 0,
            name_offset: 0,
            name_length: 3,
            value: ValueReference {
                tag: 3,
                offset: 0,
                length: 4,
            },
            presentation_ordinal: 0,
        };
        let root = ContainerRecord {
            tag: 9,
            depth: 1,
            item_start: 0,
            item_count: 1,
            recursive_fields: 1,
            parent_id: ROOT_SENTINEL,
            parent_slot: ROOT_SENTINEL,
        };
        let mut tree_envelope = synthetic_envelope(1);
        expect_result_check(
            validate_records_and_tree(
                &one_field_sections,
                &tree_envelope,
                &names,
                &[id_field],
                &[],
                &[root],
            ),
            DecodeCheck::ContainerTables,
        );
        tree_envelope.field_count = 2;
        tree_envelope.entries[2].item_count = 1;
        expect_result_check(
            validate_records_and_tree(
                &one_field_sections,
                &tree_envelope,
                &names,
                &[id_field],
                &[],
                &[root],
            ),
            DecodeCheck::ContainerTables,
        );
        expect_result_check(
            decoded_child_index(
                ValueReference {
                    tag: 9,
                    offset: 1,
                    length: 32,
                },
                0,
            ),
            DecodeCheck::ContainerTables,
        );

        let out_of_bounds_value = FieldRecord {
            value: ValueReference {
                tag: 7,
                offset: 0,
                length: 1,
            },
            ..id_field
        };
        expect_result_check(
            validate_value_area(&[], 0, 1, &[out_of_bounds_value], &[], &[root]),
            DecodeCheck::ValueArea,
        );
        expect_result_check(
            validate_value_area(&[], 0, 1, &[], &[], &[]),
            DecodeCheck::ValueArea,
        );
        expect_result_check(validate_payload(17, &[], 0), DecodeCheck::Payload);

        assert!(!validate_decimal_payload(&[]));
        for bits in [
            0x7800_0000_0000_0000_0000_0000_0000_0000_u128,
            0xf800_0000_0000_0000_0000_0000_0000_0000,
            0x7c00_0000_0000_0000_0000_0000_0000_0000,
        ] {
            assert!(validate_decimal_payload(&bits.to_le_bytes()));
        }
        let reducible_decimal = ((12_287_u128) << 113) | 0x0a;
        assert!(validate_decimal_payload(&reducible_decimal.to_le_bytes()));
        assert!(!validate_vector_payload(&[], 4, 23, 0xff));
        assert!(!validate_vector_payload(&[0; 4], 4, 23, 0xff));

        let string_id = FieldRecord {
            value: ValueReference {
                tag: 7,
                offset: 0,
                length: 0,
            },
            ..id_field
        };
        assert!(validate_decoded_root_id(&string_id, &[], 0).is_ok());
        expect_result_check(
            validate_decoded_root_id(&id_field, &[], 0),
            DecodeCheck::RootId,
        );

        expect_result_check(
            hash_decoded_document(&[], &[], 0, 0, &[], &[], &[], &[root]),
            DecodeCheck::TypedContentHash,
        );
        let bad_digest_field = FieldRecord {
            field_id: 0,
            name_offset: 0,
            name_length: 1,
            value: ValueReference {
                tag: 7,
                offset: 1,
                length: 1,
            },
            presentation_ordinal: 0,
        };
        let short_name = [NameRecord {
            absolute_offset: 0,
            local_offset: 0,
            length: 1,
        }];
        expect_result_check(
            hash_decoded_document(
                b"a",
                &[],
                0,
                0,
                &short_name,
                &[bad_digest_field],
                &[],
                &[root],
            ),
            DecodeCheck::TypedContentHash,
        );
        let array_container = ContainerRecord {
            tag: 10,
            depth: 1,
            item_start: 0,
            item_count: 1,
            recursive_fields: 0,
            parent_id: ROOT_SENTINEL,
            parent_slot: ROOT_SENTINEL,
        };
        expect_result_check(
            hash_decoded_document(&[], &[], 0, 0, &[], &[], &[], &[array_container]),
            DecodeCheck::TypedContentHash,
        );
        expect_result_check(
            hash_decoded_document(
                &[],
                &[],
                0,
                0,
                &[],
                &[],
                &[ValueReference {
                    tag: 7,
                    offset: 1,
                    length: 1,
                }],
                &[array_container],
            ),
            DecodeCheck::TypedContentHash,
        );

        let compressible_sections = [vec![b'a'; 4_096], Vec::new(), Vec::new(), Vec::new()];
        let mut canonical_envelope = synthetic_envelope(0);
        canonical_envelope.compressed_sections = 1;
        expect_result_check(
            validate_canonical_envelope(&[], &compressible_sections, &canonical_envelope, [0; 32]),
            DecodeCheck::CompressionCanonicality,
        );
        let mut compressed_envelope = parse_envelope(&compressed)?;
        let compressed_sections = decode_logical_sections(&compressed, &compressed_envelope)?;
        compressed_envelope.compressed_sections += 1;
        expect_result_check(
            validate_canonical_envelope(
                &compressed,
                &compressed_sections,
                &compressed_envelope,
                compressed_envelope.footer_hash,
            ),
            DecodeCheck::CompressionCanonicality,
        );
        let mut build_failure = synthetic_envelope(0);
        build_failure.total_length = 0;
        build_failure.canonical_length = 0;
        expect_result_check(
            validate_canonical_envelope(&[], &empty_sections, &build_failure, [0; 32]),
            DecodeCheck::CompressionCanonicality,
        );
        let mut rebuilt_mismatch = synthetic_envelope(0);
        rebuilt_mismatch.total_length = 256;
        rebuilt_mismatch.canonical_length = 256;
        expect_result_check(
            validate_canonical_envelope(&[], &empty_sections, &rebuilt_mismatch, [0; 32]),
            DecodeCheck::CompressionCanonicality,
        );
        assert_eq!(payload_alignment_for_tag(9), None);
        Ok(())
    }

    #[test]
    fn metadata_error_codes_and_internal_guards_are_stable() -> Result<(), EncodeError> {
        assert_eq!(COMPONENT_NAME, "helix-doc");
        assert_eq!(MATURITY, "hdoc-properties-v1");
        assert!(INTERNAL_DEPENDENCIES.is_empty());
        assert_eq!(CompressionMode::default(), CompressionMode::Canonical);
        assert_eq!(
            EncodeOptions::default().compression,
            CompressionMode::Canonical
        );

        let errors = [
            (EncodeError::MissingRootId, "VAL_INVALID_SHAPE"),
            (EncodeError::InvalidRootIdType, "TYPE_MISMATCH"),
            (EncodeError::InvalidFieldName, "VAL_INVALID_FIELD_NAME"),
            (EncodeError::DuplicateField, "VAL_DUPLICATE_FIELD"),
            (EncodeError::ProtectedRootField, "VAL_PROTECTED_FIELD"),
            (
                EncodeError::LimitExceeded {
                    limit: LimitId::DocumentDepth,
                    maximum: 100,
                    observed: 101,
                },
                "QUOTA_LIMIT_EXCEEDED",
            ),
            (EncodeError::TemporalRange, "TYPE_TEMPORAL_RANGE"),
            (EncodeError::InvalidVector, "TYPE_VECTOR_DIMENSION"),
            (EncodeError::InvalidDecimal, "PAR_INVALID_TYPED_VALUE"),
            (EncodeError::ArithmeticOverflow, "TYPE_NUMERIC_OVERFLOW"),
        ];
        for (failure, code) in errors {
            assert_eq!(failure.code(), code);
            assert!(!failure.to_string().contains("secret"));
        }
        let limited = EncodeError::LimitExceeded {
            limit: LimitId::FieldNameScalars,
            maximum: 256,
            observed: 257,
        };
        assert_eq!(
            limited.to_string(),
            "QUOTA_LIMIT_EXCEEDED: field_name.scalars maximum 256, observed 257"
        );
        assert_eq!(
            [
                LimitId::DocumentCanonicalBytes,
                LimitId::DocumentDepth,
                LimitId::ObjectFields,
                LimitId::DocumentTotalFields,
                LimitId::FieldNameUtf8Bytes,
                LimitId::FieldNameScalars,
                LimitId::PathUtf8Bytes,
                LimitId::PathSegments,
                LimitId::PathCandidates,
                LimitId::ArrayElements,
                LimitId::VectorDimension,
                LimitId::IdPayloadBytes,
            ]
            .map(LimitId::as_str),
            [
                "document.canonical_bytes",
                "document.depth",
                "object.fields",
                "document.total_fields",
                "field_name.utf8_bytes",
                "field_name.scalars",
                "path.utf8_bytes",
                "path.segments",
                "path.candidates",
                "array.elements",
                "vector.dimension",
                "id.payload_bytes",
            ]
        );

        assert_eq!(align8(0)?, 0);
        assert_eq!(align8(1)?, 8);
        assert_eq!(align_to(9, 4)?, 12);
        error(align_to(1, 0), EncodeError::ArithmeticOverflow);
        error(checked_add(u64::MAX, 1), EncodeError::ArithmeticOverflow);
        error(checked_mul(u64::MAX, 2), EncodeError::ArithmeticOverflow);
        assert_eq!(usize_to_u64(1)?, 1);
        assert_eq!(usize_to_u32(1)?, 1);
        assert_eq!(u64_to_u32(1)?, 1);
        assert_eq!(u32_to_usize(1)?, 1);
        error(usize_to_u32(usize::MAX), EncodeError::ArithmeticOverflow);
        error(u64_to_u32(u64::MAX), EncodeError::ArithmeticOverflow);

        assert_eq!(decode_hex("00aAfF")?, [0, 0xaa, 0xff]);
        error(decode_hex("0"), EncodeError::ArithmeticOverflow);
        error(decode_hex("gg"), EncodeError::ArithmeticOverflow);
        Ok(())
    }

    #[test]
    #[allow(
        clippy::too_many_lines,
        reason = "defensive invariant failures share staged internal fixtures and remain reviewable together"
    )]
    fn defensive_internal_error_paths_fail_closed() -> Result<(), EncodeError> {
        let mut frames = Vec::new();
        let mut containers = u64::MAX;
        let mut noncontainers = 0;
        error(
            validate_value(
                EncodeValue::Object(EncodeObject::new(&[])),
                1,
                &mut frames,
                &mut containers,
                &mut noncontainers,
            ),
            EncodeError::ArithmeticOverflow,
        );
        containers = u64::MAX;
        error(
            validate_value(
                EncodeValue::Array(&[]),
                1,
                &mut frames,
                &mut containers,
                &mut noncontainers,
            ),
            EncodeError::ArithmeticOverflow,
        );
        containers = 0;
        noncontainers = u64::MAX;
        error(
            validate_value(
                EncodeValue::Null,
                1,
                &mut frames,
                &mut containers,
                &mut noncontainers,
            ),
            EncodeError::ArithmeticOverflow,
        );

        let invalid_array = [EncodeValue::Timestamp(TIMESTAMP_MAX + 1)];
        let fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new("array", EncodeValue::Array(&invalid_array)),
        ];
        error(
            validate_document(EncodeDocument::new(&fields)),
            EncodeError::TemporalRange,
        );

        assert!(enforce_minimum_size(1, 1, 2).is_ok());
        error(
            enforce_minimum_size(u64::MAX, 0, 0),
            EncodeError::ArithmeticOverflow,
        );
        error(
            enforce_minimum_size(
                0,
                u64::MAX / ARRAY_ENTRY_BYTES,
                u64::MAX / CONTAINER_DESCRIPTOR_BYTES,
            ),
            EncodeError::ArithmeticOverflow,
        );
        error(
            enforce_minimum_size((u64::MAX - 300) / FIELD_ENTRY_BYTES, 0, 2),
            EncodeError::ArithmeticOverflow,
        );

        let scalar_fields = [EncodeField::new("_id", EncodeValue::Int32(1))];
        let statistics = validate_document(EncodeDocument::new(&scalar_fields))?;
        let mut scalar_stages = stage_containers(EncodeDocument::new(&scalar_fields))?;
        compute_recursive_field_counts(&mut scalar_stages)?;
        let scalar_names = collect_names(&scalar_stages, statistics.total_fields)?;
        let scalar_layout = measure_layout(&scalar_stages, &scalar_names, statistics)?;
        error(
            build_value_area(
                &scalar_stages,
                scalar_layout.value_offset,
                scalar_layout.value_length + 1,
            ),
            EncodeError::ArithmeticOverflow,
        );
        let (_, scalar_name_infos) = build_name_pool(&scalar_names, scalar_layout.name_offset);
        let mut wrong_value_layout = scalar_layout;
        wrong_value_layout.value_length += 1;
        error(
            build_reference_tables(&scalar_stages, &scalar_name_infos, wrong_value_layout),
            EncodeError::ArithmeticOverflow,
        );
        scalar_stages[0].children.push((0, 0));
        error(
            build_reference_tables(&scalar_stages, &scalar_name_infos, scalar_layout),
            EncodeError::ArithmeticOverflow,
        );
        error(
            hash_document(&scalar_stages),
            EncodeError::ArithmeticOverflow,
        );

        let child_fields = [];
        let container_fields = [
            EncodeField::new("_id", EncodeValue::Int32(1)),
            EncodeField::new(
                "child",
                EncodeValue::Object(EncodeObject::new(&child_fields)),
            ),
        ];
        let statistics = validate_document(EncodeDocument::new(&container_fields))?;
        let mut stages = stage_containers(EncodeDocument::new(&container_fields))?;
        compute_recursive_field_counts(&mut stages)?;
        let names = collect_names(&stages, statistics.total_fields)?;
        let layout = measure_layout(&stages, &names, statistics)?;
        let (_, name_infos) = build_name_pool(&names, layout.name_offset);
        stages[0].children[0].0 += 1;
        error(
            build_reference_tables(&stages, &name_infos, layout),
            EncodeError::ArithmeticOverflow,
        );
        error(hash_document(&stages), EncodeError::ArithmeticOverflow);
        let mut child_index = 0;
        error(
            value_digest(
                container_fields[1].value,
                0,
                &stages[0],
                &[[0; 32], [0; 32]],
                &mut child_index,
            ),
            EncodeError::ArithmeticOverflow,
        );

        let array_values = [EncodeValue::Null];
        let array_with_extra_child = [ContainerStage {
            input: ContainerInput::Array(&array_values),
            order: Vec::new(),
            children: vec![(0, 0)],
            depth: 1,
            parent_id: ROOT_SENTINEL,
            parent_slot: ROOT_SENTINEL,
            recursive_fields: 0,
        }];
        error(
            hash_document(&array_with_extra_child),
            EncodeError::ArithmeticOverflow,
        );

        error(hash_document(&[]), EncodeError::ArithmeticOverflow);
        error(
            update_payload_hash(
                EncodeValue::Object(EncodeObject::new(&[])),
                &mut Hasher::new(),
            ),
            EncodeError::ArithmeticOverflow,
        );
        error(
            write_payload(EncodeValue::Array(&[]), &mut Vec::new()),
            EncodeError::ArithmeticOverflow,
        );
        error(
            payload_length(EncodeValue::Object(EncodeObject::new(&[]))),
            EncodeError::ArithmeticOverflow,
        );
        error(
            write_payload(
                EncodeValue::Decimal128(Decimal128::Finite {
                    negative: false,
                    coefficient: 0,
                    exponent: 0,
                }),
                &mut Vec::new(),
            ),
            EncodeError::InvalidDecimal,
        );

        let logical_sections = [Vec::new(), Vec::new(), Vec::new(), Vec::new()];
        error(
            assemble_document(
                &logical_sections,
                [0; 4],
                0,
                [0; 32],
                0,
                CompressionMode::Disabled,
            ),
            EncodeError::ArithmeticOverflow,
        );
        error(
            build_envelope(
                &logical_sections,
                &[None, None, None, None],
                [0; 4],
                0,
                [0; 32],
                0,
                false,
            ),
            EncodeError::ArithmeticOverflow,
        );
        Ok(())
    }
}

#[cfg(test)]
mod property_tests;
// helix-coverage: exclude-end unit-tests

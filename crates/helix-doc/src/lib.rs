//! Safe, deterministic `HDoc` 1.0 encoding.
//!
//! The encoder accepts a transient borrowed input tree, validates the complete tree and portable
//! limits, and publishes bytes only after canonical tables, typed content identity, optional
//! bounded compression, and stored-byte integrity have all succeeded. The production validating
//! decoder and decoded owned/borrowed value APIs remain separate later plan items.

use std::collections::BTreeSet;
use std::error::Error;
use std::fmt;

use blake3::Hasher;
use crc::{CRC_32_ISCSI, Crc};

/// Stable development name used by workspace-boundary checks.
pub const COMPONENT_NAME: &str = "helix-doc";

/// Current implementation maturity.
pub const MATURITY: &str = "hdoc-encoder";

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
    matches!(value, EncodeValue::Object(_) | EncodeValue::Array(_))
}

const fn type_tag(value: EncodeValue<'_>) -> u8 {
    match value {
        EncodeValue::Null => 1,
        EncodeValue::Bool(_) => 2,
        EncodeValue::Int32(_) => 3,
        EncodeValue::Int64(_) => 4,
        EncodeValue::Float64Bits(_) => 5,
        EncodeValue::Decimal128(_) => 6,
        EncodeValue::String(_) => 7,
        EncodeValue::Binary(_) => 8,
        EncodeValue::Object(_) => 9,
        EncodeValue::Array(_) => 10,
        EncodeValue::Timestamp(_) => 11,
        EncodeValue::Date(_) => 12,
        EncodeValue::Uuid(_) => 13,
        EncodeValue::ObjectId(_) => 14,
        EncodeValue::VectorF32(_) => 15,
        EncodeValue::VectorF16(_) => 16,
    }
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

fn measure_stored_length(
    logical_sections: &[Vec<u8>; 4],
    candidates: &[Option<Vec<u8>>; 4],
) -> u64 {
    let mut cursor = BASE_HEADER_BYTES;
    for index in 0..4 {
        cursor = align8_bounded(cursor);
        let length = candidates[index]
            .as_ref()
            .map_or(logical_sections[index].len(), Vec::len);
        cursor += bounded_usize_to_u64(length);
    }
    align8_bounded(cursor) + FOOTER_BYTES
}

fn build_envelope(
    logical_sections: &[Vec<u8>; 4],
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
        let stored = candidate.unwrap_or(&logical_sections[index]);
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
            bounded_usize_to_u32(logical_sections[index].len()),
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
    reason = "the only callers convert four directory IDs after validation"
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
            assert!(encode_with_options(EncodeDocument::new(&root_fields), disabled()).is_ok());
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
    fn metadata_error_codes_and_internal_guards_are_stable() -> Result<(), EncodeError> {
        assert_eq!(COMPONENT_NAME, "helix-doc");
        assert_eq!(MATURITY, "hdoc-encoder");
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
// helix-coverage: exclude-end unit-tests

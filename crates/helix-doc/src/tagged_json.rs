//! Lossless canonical tagged JSON rendering and strict import for validated `HDoc` values.

use std::collections::BTreeSet;
use std::error::Error;
use std::fmt;

use super::{
    ARRAY_ENTRY_BYTES, ArrayView, BASE_HEADER_BYTES, BinaryView, CONTAINER_DESCRIPTOR_BYTES,
    DATE_MAX, DATE_MIN, Decimal128, DocumentView, EncodeError, FIELD_ENTRY_BYTES, FOOTER_BYTES,
    FieldView, LimitId, MAX_ARRAY_ELEMENTS, MAX_CANONICAL_BYTES, MAX_DEPTH, MAX_DOCUMENT_FIELDS,
    MAX_ID_PAYLOAD_BYTES, MAX_OBJECT_FIELDS, MAX_VECTOR_DIMENSION, NAME_RECORD_BYTES, ObjectView,
    OwnedDocument, OwnedField, OwnedObject, OwnedValue, TIMESTAMP_MAX, TIMESTAMP_MIN, ValueView,
    VectorF16View, VectorF32View, align_to, align8, bounded_u64_to_usize, checked_add, checked_mul,
    decimal_bytes, enforce_limit, usize_to_u64, validate_field_name,
};

/// Versioned internal/debug profile shared with the language-neutral semantic fixture value model.
pub const HDOC_TAGGED_JSON_PROFILE: &str = "helix.hdoc-tagged-json/1";

const MAX_JSON_IMPORT_BYTES: u64 = 67_108_864;

/// Stable resource-limit identities specific to tagged JSON import.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum JsonImportLimitId {
    /// `command.expanded_bytes` from `limits-v1`.
    ExpandedBytes,
}

impl JsonImportLimitId {
    /// Returns the stable `limits-v1` identity.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ExpandedBytes => "command.expanded_bytes",
        }
    }
}

/// Redacted strict-JSON, typed-wrapper, limit, or HDoc-document import failure.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum JsonImportError {
    /// Input ended before the current JSON token or container completed.
    TruncatedInput {
        /// Bounded UTF-8 byte offset.
        offset: u32,
    },
    /// JSON lexical or structural syntax is invalid.
    InvalidJson {
        /// Bounded UTF-8 byte offset.
        offset: u32,
    },
    /// A Unicode escape contains an unpaired surrogate.
    InvalidUnicode {
        /// Bounded UTF-8 byte offset.
        offset: u32,
    },
    /// A JSON wrapper or logical object repeats an exact property/field name.
    DuplicateProperty {
        /// Bounded UTF-8 byte offset.
        offset: u32,
    },
    /// A syntactically valid JSON value does not match one exact tagged-value shape.
    InvalidTypedValue {
        /// Bounded UTF-8 byte offset.
        offset: u32,
    },
    /// Tagged JSON input exceeds a stable transport/resource limit.
    LimitExceeded {
        /// Stable limit identity.
        limit: JsonImportLimitId,
        /// Inclusive maximum.
        maximum: u64,
        /// Observed value.
        observed: u64,
    },
    /// The decoded logical tree violates a canonical `HDoc` document rule.
    InvalidDocument(EncodeError),
}

impl JsonImportError {
    /// Returns the stable public error-family code.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::TruncatedInput { .. } => "PAR_TRUNCATED_INPUT",
            Self::InvalidJson { .. } => "PAR_INVALID_JSON",
            Self::InvalidUnicode { .. } => "PAR_INVALID_UTF8",
            Self::DuplicateProperty { .. } => "VAL_DUPLICATE_FIELD",
            Self::InvalidTypedValue { .. } => "PAR_INVALID_TYPED_VALUE",
            Self::LimitExceeded { .. } => "QUOTA_LIMIT_EXCEEDED",
            Self::InvalidDocument(error) => error.code(),
        }
    }

    /// Returns the bounded byte offset for lexical/shape failures.
    #[must_use]
    pub const fn offset(&self) -> Option<u32> {
        match self {
            Self::TruncatedInput { offset }
            | Self::InvalidJson { offset }
            | Self::InvalidUnicode { offset }
            | Self::DuplicateProperty { offset }
            | Self::InvalidTypedValue { offset } => Some(*offset),
            Self::LimitExceeded { .. } | Self::InvalidDocument(_) => None,
        }
    }
}

impl fmt::Display for JsonImportError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TruncatedInput { offset }
            | Self::InvalidJson { offset }
            | Self::InvalidUnicode { offset }
            | Self::DuplicateProperty { offset }
            | Self::InvalidTypedValue { offset } => {
                write!(formatter, "{}: at {offset}", self.code())
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
            Self::InvalidDocument(error) => error.fmt(formatter),
        }
    }
}

impl Error for JsonImportError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::InvalidDocument(error) => Some(error),
            Self::TruncatedInput { .. }
            | Self::InvalidJson { .. }
            | Self::InvalidUnicode { .. }
            | Self::DuplicateProperty { .. }
            | Self::InvalidTypedValue { .. }
            | Self::LimitExceeded { .. } => None,
        }
    }
}

impl From<EncodeError> for JsonImportError {
    fn from(value: EncodeError) -> Self {
        Self::InvalidDocument(value)
    }
}

impl DocumentView<'_> {
    /// Renders this validated document in canonical lossless tagged JSON.
    #[must_use]
    pub fn to_canonical_tagged_json(self) -> String {
        let mut output = String::new();
        write_view_object(&mut output, self.root());
        output
    }
}

impl ObjectView<'_> {
    /// Renders this validated object in canonical lossless tagged JSON.
    #[must_use]
    pub fn to_canonical_tagged_json(self) -> String {
        let mut output = String::new();
        write_view_object(&mut output, self);
        output
    }
}

impl ValueView<'_> {
    /// Renders this validated value in canonical lossless tagged JSON.
    #[must_use]
    pub fn to_canonical_tagged_json(self) -> String {
        let mut output = String::new();
        write_view_value(&mut output, self);
        output
    }
}

impl OwnedDocument {
    /// Renders this detached document in canonical lossless tagged JSON.
    #[must_use]
    pub fn to_canonical_tagged_json(&self) -> String {
        let mut output = String::new();
        write_owned_fields_object(&mut output, &self.fields);
        output
    }
}

impl OwnedObject {
    /// Renders this detached object in canonical lossless tagged JSON.
    #[must_use]
    pub fn to_canonical_tagged_json(&self) -> String {
        let mut output = String::new();
        write_owned_fields_object(&mut output, &self.fields);
        output
    }
}

impl OwnedValue {
    /// Renders this detached value in canonical lossless tagged JSON.
    #[must_use]
    pub fn to_canonical_tagged_json(&self) -> String {
        let mut output = String::new();
        write_owned_value(&mut output, self);
        output
    }
}

fn write_view_object(output: &mut String, object: ObjectView<'_>) {
    output.push_str("{\"fields\":[");
    for (index, field) in object.fields().enumerate() {
        if index != 0 {
            output.push(',');
        }
        write_view_field(output, field);
    }
    output.push_str("],\"t\":\"object\"}");
}

fn write_owned_fields_object(output: &mut String, fields: &[OwnedField]) {
    output.push_str("{\"fields\":[");
    for (index, field) in fields.iter().enumerate() {
        if index != 0 {
            output.push(',');
        }
        output.push_str("{\"name\":");
        write_json_string(output, &field.name);
        output.push_str(",\"value\":");
        write_owned_value(output, &field.value);
        output.push('}');
    }
    output.push_str("],\"t\":\"object\"}");
}

fn write_view_field(output: &mut String, field: FieldView<'_>) {
    output.push_str("{\"name\":");
    write_json_string(output, field.name());
    output.push_str(",\"value\":");
    write_view_value(output, field.value());
    output.push('}');
}

fn write_view_value(output: &mut String, value: ValueView<'_>) {
    match value {
        ValueView::Null => output.push_str("{\"t\":\"null\"}"),
        ValueView::Bool(value) => write_bool(output, value),
        ValueView::Int32(value) => write_integer(output, "int32", &value),
        ValueView::Int64(value) => write_integer(output, "int64", &value),
        ValueView::Float64Bits(bits) => write_float64(output, bits),
        ValueView::Decimal128(value) => write_decimal(output, value),
        ValueView::String(value) => write_string_value(output, value),
        ValueView::Binary(value) => write_binary(output, value),
        ValueView::Object(value) => write_view_object(output, value),
        ValueView::Array(value) => write_view_array(output, value),
        ValueView::Timestamp(value) => {
            write_signed_text(output, "microseconds", "timestamp", &value);
        }
        ValueView::Date(value) => write_signed_text(output, "days", "date", &value),
        ValueView::Uuid(value) => write_uuid(output, value),
        ValueView::ObjectId(value) => write_object_id(output, value),
        ValueView::VectorF32(value) => write_vector_f32(output, value),
        ValueView::VectorF16(value) => write_vector_f16(output, value),
    }
}

fn write_owned_value(output: &mut String, value: &OwnedValue) {
    match value {
        OwnedValue::Null => output.push_str("{\"t\":\"null\"}"),
        OwnedValue::Bool(value) => write_bool(output, *value),
        OwnedValue::Int32(value) => write_integer(output, "int32", value),
        OwnedValue::Int64(value) => write_integer(output, "int64", value),
        OwnedValue::Float64Bits(bits) => write_float64(output, *bits),
        OwnedValue::Decimal128(value) => write_decimal(output, *value),
        OwnedValue::String(value) => write_string_value(output, value),
        OwnedValue::Binary { subtype, bytes } => write_binary_parts(output, *subtype, bytes),
        OwnedValue::Object(value) => write_owned_fields_object(output, &value.fields),
        OwnedValue::Array(values) => {
            output.push_str("{\"t\":\"array\",\"values\":[");
            for (index, child) in values.iter().enumerate() {
                if index != 0 {
                    output.push(',');
                }
                write_owned_value(output, child);
            }
            output.push_str("]}");
        }
        OwnedValue::Timestamp(value) => {
            write_signed_text(output, "microseconds", "timestamp", value);
        }
        OwnedValue::Date(value) => write_signed_text(output, "days", "date", value),
        OwnedValue::Uuid(value) => write_uuid(output, *value),
        OwnedValue::ObjectId(value) => write_object_id(output, *value),
        OwnedValue::VectorF32(values) => write_owned_vector_f32(output, values),
        OwnedValue::VectorF16(values) => write_owned_vector_f16(output, values),
    }
}

fn write_bool(output: &mut String, value: bool) {
    output.push_str("{\"t\":\"bool\",\"value\":");
    output.push_str(if value { "true" } else { "false" });
    output.push('}');
}

fn write_integer<T: fmt::Display>(output: &mut String, tag: &str, value: &T) {
    output.push_str("{\"t\":\"");
    output.push_str(tag);
    output.push_str("\",\"value\":\"");
    output.push_str(&value.to_string());
    output.push_str("\"}");
}

fn write_float64(output: &mut String, bits: u64) {
    output.push_str("{\"bits\":\"");
    write_fixed_hex(output, u128::from(bits), 16);
    output.push_str("\",\"t\":\"float64\"}");
}

fn write_decimal(output: &mut String, value: Decimal128) {
    match value {
        Decimal128::Zero { negative } => {
            output.push_str(
                "{\"class\":\"finite\",\"coefficient\":\"0\",\"exponent\":\"0\",\"sign\":\"",
            );
            output.push_str(if negative { "negative" } else { "positive" });
            output.push_str("\",\"t\":\"decimal128\"}");
        }
        Decimal128::Finite {
            negative,
            coefficient,
            exponent,
        } => {
            output.push_str("{\"class\":\"finite\",\"coefficient\":\"");
            output.push_str(&coefficient.to_string());
            output.push_str("\",\"exponent\":\"");
            output.push_str(&exponent.to_string());
            output.push_str("\",\"sign\":\"");
            output.push_str(if negative { "negative" } else { "positive" });
            output.push_str("\",\"t\":\"decimal128\"}");
        }
        Decimal128::PositiveInfinity | Decimal128::NegativeInfinity => {
            output.push_str("{\"class\":\"infinity\",\"sign\":\"");
            output.push_str(if matches!(value, Decimal128::NegativeInfinity) {
                "negative"
            } else {
                "positive"
            });
            output.push_str("\",\"t\":\"decimal128\"}");
        }
        Decimal128::NaN => output.push_str("{\"class\":\"nan\",\"t\":\"decimal128\"}"),
    }
}

fn write_string_value(output: &mut String, value: &str) {
    output.push_str("{\"t\":\"string\",\"value\":");
    write_json_string(output, value);
    output.push('}');
}

fn write_binary(output: &mut String, value: BinaryView<'_>) {
    write_binary_parts(output, value.subtype(), value.as_bytes());
}

fn write_binary_parts(output: &mut String, subtype: u8, bytes: &[u8]) {
    output.push_str("{\"hex\":\"");
    write_hex_bytes(output, bytes);
    output.push_str("\",\"subtype\":");
    output.push_str(&subtype.to_string());
    output.push_str(",\"t\":\"binary\"}");
}

fn write_view_array(output: &mut String, array: ArrayView<'_>) {
    output.push_str("{\"t\":\"array\",\"values\":[");
    for (index, value) in array.elements().enumerate() {
        if index != 0 {
            output.push(',');
        }
        write_view_value(output, value);
    }
    output.push_str("]}");
}

fn write_signed_text<T: fmt::Display>(output: &mut String, key: &str, tag: &str, value: &T) {
    output.push_str("{\"");
    output.push_str(key);
    output.push_str("\":\"");
    output.push_str(&value.to_string());
    output.push_str("\",\"t\":\"");
    output.push_str(tag);
    output.push_str("\"}");
}

fn write_uuid(output: &mut String, bytes: [u8; 16]) {
    output.push_str("{\"t\":\"uuid\",\"value\":\"");
    for (index, byte) in bytes.iter().enumerate() {
        if matches!(index, 4 | 6 | 8 | 10) {
            output.push('-');
        }
        write_hex_byte(output, *byte);
    }
    output.push_str("\"}");
}

fn write_object_id(output: &mut String, bytes: [u8; 12]) {
    output.push_str("{\"t\":\"objectId\",\"value\":\"");
    write_hex_bytes(output, &bytes);
    output.push_str("\"}");
}

fn write_vector_f32(output: &mut String, vector: VectorF32View<'_>) {
    output.push_str("{\"bits\":[");
    for (index, bits) in vector.iter().enumerate() {
        if index != 0 {
            output.push(',');
        }
        output.push('"');
        write_fixed_hex(output, u128::from(bits), 8);
        output.push('"');
    }
    write_vector_suffix(output, vector.len(), "f32");
}

fn write_vector_f16(output: &mut String, vector: VectorF16View<'_>) {
    output.push_str("{\"bits\":[");
    for (index, bits) in vector.iter().enumerate() {
        if index != 0 {
            output.push(',');
        }
        output.push('"');
        write_fixed_hex(output, u128::from(bits), 4);
        output.push('"');
    }
    write_vector_suffix(output, vector.len(), "f16");
}

fn write_owned_vector_f32(output: &mut String, values: &[u32]) {
    output.push_str("{\"bits\":[");
    for (index, bits) in values.iter().enumerate() {
        if index != 0 {
            output.push(',');
        }
        output.push('"');
        write_fixed_hex(output, u128::from(*bits), 8);
        output.push('"');
    }
    write_vector_suffix(output, values.len(), "f32");
}

fn write_owned_vector_f16(output: &mut String, values: &[u16]) {
    output.push_str("{\"bits\":[");
    for (index, bits) in values.iter().enumerate() {
        if index != 0 {
            output.push(',');
        }
        output.push('"');
        write_fixed_hex(output, u128::from(*bits), 4);
        output.push('"');
    }
    write_vector_suffix(output, values.len(), "f16");
}

fn write_vector_suffix(output: &mut String, dimension: usize, element: &str) {
    output.push_str("],\"dimension\":");
    output.push_str(&dimension.to_string());
    output.push_str(",\"element\":\"");
    output.push_str(element);
    output.push_str("\",\"t\":\"vector\"}");
}

fn write_json_string(output: &mut String, value: &str) {
    output.push('"');
    for character in value.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\u{08}' => output.push_str("\\b"),
            '\u{09}' => output.push_str("\\t"),
            '\u{0a}' => output.push_str("\\n"),
            '\u{0c}' => output.push_str("\\f"),
            '\u{0d}' => output.push_str("\\r"),
            '\u{00}'..='\u{1f}' => {
                output.push_str("\\u00");
                write_hex_byte(output, character as u8);
            }
            _ => output.push(character),
        }
    }
    output.push('"');
}

fn write_hex_bytes(output: &mut String, bytes: &[u8]) {
    for byte in bytes {
        write_hex_byte(output, *byte);
    }
}

fn write_hex_byte(output: &mut String, byte: u8) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    output.push(char::from(HEX[usize::from(byte >> 4)]));
    output.push(char::from(HEX[usize::from(byte & 0x0f)]));
}

fn write_fixed_hex(output: &mut String, value: u128, digits: usize) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for position in (0..digits).rev() {
        let shift = position * 4;
        let nibble = ((value >> shift) & 0x0f) as usize;
        output.push(char::from(HEX[nibble]));
    }
}

/// Imports strict lossless tagged JSON into a detached, validated `HDoc` logical document.
///
/// Property order and insignificant JSON whitespace are accepted, but every typed wrapper must
/// contain exactly its registered properties. The returned document preserves the `fields` array's
/// presentation order and can be rendered canonically without loss.
///
/// # Errors
///
/// Returns [`JsonImportError`] for JSON syntax/Unicode/duplicates, invalid tagged shapes or
/// payloads, transport limits, or canonical `HDoc` document constraints.
pub fn import_tagged_json(source: &str) -> Result<OwnedDocument, JsonImportError> {
    enforce_json_import_bytes(source.len())?;
    if source.starts_with('\u{feff}') {
        return Err(JsonImportError::InvalidUnicode { offset: 0 });
    }
    let mut parser = TaggedJsonParser::new(source);
    let value = parser.parse_value(1)?;
    parser.skip_whitespace();
    if parser.offset != parser.bytes.len() {
        return Err(parser.invalid_json());
    }
    let OwnedValue::Object(object) = value else {
        return Err(parser.invalid_typed());
    };
    let document = OwnedDocument {
        fields: object.fields,
    };
    validate_import_document(&document)?;
    Ok(document)
}

fn enforce_json_import_bytes(length: usize) -> Result<(), JsonImportError> {
    let observed = u64::try_from(length).unwrap_or(u64::MAX);
    if observed > MAX_JSON_IMPORT_BYTES {
        Err(JsonImportError::LimitExceeded {
            limit: JsonImportLimitId::ExpandedBytes,
            maximum: MAX_JSON_IMPORT_BYTES,
            observed,
        })
    } else {
        Ok(())
    }
}

#[derive(Clone, Copy)]
enum OwnedContainerInput<'a> {
    Object(&'a [OwnedField]),
    Array(&'a [OwnedValue]),
}

#[derive(Clone, Copy)]
struct OwnedValidationFrame<'a> {
    input: OwnedContainerInput<'a>,
    depth: u64,
    root: bool,
}

struct OwnedContainerStage<'a> {
    input: OwnedContainerInput<'a>,
    order: Vec<usize>,
}

fn validate_import_document(document: &OwnedDocument) -> Result<(), EncodeError> {
    let mut frames = vec![OwnedValidationFrame {
        input: OwnedContainerInput::Object(&document.fields),
        depth: 1,
        root: true,
    }];
    let mut total_fields = 0_u64;
    let mut array_entries = 0_u64;
    let mut containers = 1_u64;

    while let Some(frame) = frames.pop() {
        enforce_limit(LimitId::DocumentDepth, MAX_DEPTH, frame.depth)?;
        match frame.input {
            OwnedContainerInput::Object(fields) => {
                add_owned_object_fields(&mut total_fields, usize_to_u64(fields.len())?)?;
                let mut names = BTreeSet::new();
                let mut root_id = false;
                for field in fields {
                    validate_field_name(&field.name)?;
                    if !names.insert(field.name.as_str()) {
                        return Err(EncodeError::DuplicateField);
                    }
                    if frame.root && matches!(field.name.as_str(), "_v" | "_ts") {
                        return Err(EncodeError::ProtectedRootField);
                    }
                    if frame.root && field.name == "_id" {
                        validate_owned_root_id(&field.value)?;
                        root_id = true;
                    }
                    validate_owned_value(&field.value, frame.depth, &mut frames, &mut containers)?;
                    enforce_owned_minimum_size(total_fields, array_entries, containers)?;
                }
                if frame.root && !root_id {
                    return Err(EncodeError::MissingRootId);
                }
            }
            OwnedContainerInput::Array(values) => {
                let count = usize_to_u64(values.len())?;
                enforce_limit(LimitId::ArrayElements, MAX_ARRAY_ELEMENTS, count)?;
                array_entries = checked_add(array_entries, count)?;
                for value in values {
                    validate_owned_value(value, frame.depth, &mut frames, &mut containers)?;
                    enforce_owned_minimum_size(total_fields, array_entries, containers)?;
                }
            }
        }
    }

    measure_owned_document(document, total_fields, array_entries)
}

fn add_owned_object_fields(total_fields: &mut u64, object_fields: u64) -> Result<(), EncodeError> {
    enforce_limit(LimitId::ObjectFields, MAX_OBJECT_FIELDS, object_fields)?;
    *total_fields = checked_add(*total_fields, object_fields)?;
    enforce_limit(
        LimitId::DocumentTotalFields,
        MAX_DOCUMENT_FIELDS,
        *total_fields,
    )
}

fn validate_owned_value<'a>(
    value: &'a OwnedValue,
    parent_depth: u64,
    frames: &mut Vec<OwnedValidationFrame<'a>>,
    containers: &mut u64,
) -> Result<(), EncodeError> {
    let child = match value {
        OwnedValue::Object(object) => Some(OwnedContainerInput::Object(&object.fields)),
        OwnedValue::Array(values) => Some(OwnedContainerInput::Array(values)),
        OwnedValue::Timestamp(value) if !(TIMESTAMP_MIN..=TIMESTAMP_MAX).contains(value) => {
            return Err(EncodeError::TemporalRange);
        }
        OwnedValue::Date(value) if !(DATE_MIN..=DATE_MAX).contains(value) => {
            return Err(EncodeError::TemporalRange);
        }
        OwnedValue::VectorF32(values)
            if values.is_empty()
                || usize_to_u64(values.len())? > MAX_VECTOR_DIMENSION
                || values.iter().any(|bits| (bits >> 23) & 0xff == 0xff) =>
        {
            return Err(EncodeError::InvalidVector);
        }
        OwnedValue::VectorF16(values)
            if values.is_empty()
                || usize_to_u64(values.len())? > MAX_VECTOR_DIMENSION
                || values.iter().any(|bits| (bits >> 10) & 0x1f == 0x1f) =>
        {
            return Err(EncodeError::InvalidVector);
        }
        OwnedValue::Decimal128(value) => {
            decimal_bytes(*value)?;
            None
        }
        _ => None,
    };
    if let Some(input) = child {
        *containers = checked_add(*containers, 1)?;
        frames.push(OwnedValidationFrame {
            input,
            depth: checked_add(parent_depth, 1)?,
            root: false,
        });
    }
    Ok(())
}

fn validate_owned_root_id(value: &OwnedValue) -> Result<(), EncodeError> {
    match value {
        OwnedValue::Int32(_)
        | OwnedValue::Int64(_)
        | OwnedValue::Uuid(_)
        | OwnedValue::ObjectId(_) => Ok(()),
        OwnedValue::String(value) => enforce_limit(
            LimitId::IdPayloadBytes,
            MAX_ID_PAYLOAD_BYTES,
            usize_to_u64(value.len())?,
        ),
        OwnedValue::Binary { bytes, .. } => enforce_limit(
            LimitId::IdPayloadBytes,
            MAX_ID_PAYLOAD_BYTES,
            usize_to_u64(bytes.len())?,
        ),
        _ => Err(EncodeError::InvalidRootIdType),
    }
}

fn enforce_owned_minimum_size(
    fields: u64,
    arrays: u64,
    containers: u64,
) -> Result<(), EncodeError> {
    let field_bytes = checked_mul(fields, FIELD_ENTRY_BYTES)?;
    let array_bytes = checked_mul(arrays, ARRAY_ENTRY_BYTES)?;
    let container_bytes = checked_mul(containers, CONTAINER_DESCRIPTOR_BYTES)?;
    let fixed_and_fields = checked_add(BASE_HEADER_BYTES + FOOTER_BYTES, field_bytes)?;
    let array_and_containers = checked_add(array_bytes, container_bytes)?;
    let minimum = checked_add(fixed_and_fields, array_and_containers)?;
    enforce_limit(
        LimitId::DocumentCanonicalBytes,
        MAX_CANONICAL_BYTES,
        minimum,
    )
}

fn measure_owned_document(
    document: &OwnedDocument,
    total_fields: u64,
    array_entries: u64,
) -> Result<(), EncodeError> {
    let stages = stage_owned_containers(document);
    let mut names = BTreeSet::new();
    for stage in &stages {
        if let OwnedContainerInput::Object(fields) = stage.input {
            names.extend(fields.iter().map(|field| field.name.as_str()));
        }
    }
    let field_length = checked_mul(total_fields, FIELD_ENTRY_BYTES)?;
    let name_table = checked_mul(usize_to_u64(names.len())?, NAME_RECORD_BYTES)?;
    let name_bytes = names.iter().try_fold(0_u64, |total, name| {
        checked_add(total, usize_to_u64(name.len())?)
    })?;
    let name_offset = align8(checked_add(BASE_HEADER_BYTES, field_length)?)?;
    let name_length = checked_add(name_table, name_bytes)?;
    let value_offset = align8(checked_add(name_offset, name_length)?)?;
    let mut value_cursor = value_offset;
    for stage in &stages {
        for slot in 0..owned_slot_count(stage) {
            let value = owned_value_at(stage, slot);
            if !matches!(value, OwnedValue::Object(_) | OwnedValue::Array(_)) {
                value_cursor = align_to(value_cursor, owned_payload_alignment(value))?;
                value_cursor = checked_add(value_cursor, owned_payload_length(value)?)?;
            }
        }
    }
    let container_offset = align8(value_cursor)?;
    let descriptor_length = checked_mul(usize_to_u64(stages.len())?, CONTAINER_DESCRIPTOR_BYTES)?;
    let array_length = checked_mul(array_entries, ARRAY_ENTRY_BYTES)?;
    let container_length = checked_add(descriptor_length, array_length)?;
    let footer_offset = align8(checked_add(container_offset, container_length)?)?;
    enforce_limit(
        LimitId::DocumentCanonicalBytes,
        MAX_CANONICAL_BYTES,
        checked_add(footer_offset, FOOTER_BYTES)?,
    )
}

fn stage_owned_containers(document: &OwnedDocument) -> Vec<OwnedContainerStage<'_>> {
    let mut stages = vec![OwnedContainerStage {
        input: OwnedContainerInput::Object(&document.fields),
        order: Vec::new(),
    }];
    let mut index = 0_usize;
    while index < stages.len() {
        let input = stages[index].input;
        let mut order = match input {
            OwnedContainerInput::Object(fields) => (0..fields.len()).collect::<Vec<_>>(),
            OwnedContainerInput::Array(_) => Vec::new(),
        };
        if let OwnedContainerInput::Object(fields) = input {
            order.sort_unstable_by(|left, right| {
                fields[*left]
                    .name
                    .as_bytes()
                    .cmp(fields[*right].name.as_bytes())
            });
        }
        let stage = OwnedContainerStage { input, order };
        for slot in 0..owned_slot_count(&stage) {
            match owned_value_at(&stage, slot) {
                OwnedValue::Object(object) => stages.push(OwnedContainerStage {
                    input: OwnedContainerInput::Object(&object.fields),
                    order: Vec::new(),
                }),
                OwnedValue::Array(values) => stages.push(OwnedContainerStage {
                    input: OwnedContainerInput::Array(values),
                    order: Vec::new(),
                }),
                _ => {}
            }
        }
        stages[index].order = stage.order;
        index += 1;
    }
    stages
}

fn owned_slot_count(stage: &OwnedContainerStage<'_>) -> usize {
    match stage.input {
        OwnedContainerInput::Object(_) => stage.order.len(),
        OwnedContainerInput::Array(values) => values.len(),
    }
}

fn owned_value_at<'a>(stage: &OwnedContainerStage<'a>, slot: usize) -> &'a OwnedValue {
    match stage.input {
        OwnedContainerInput::Object(fields) => &fields[stage.order[slot]].value,
        OwnedContainerInput::Array(values) => &values[slot],
    }
}

const fn owned_payload_alignment(value: &OwnedValue) -> u64 {
    match value {
        OwnedValue::Int32(_)
        | OwnedValue::Date(_)
        | OwnedValue::VectorF32(_)
        | OwnedValue::VectorF16(_) => 4,
        OwnedValue::Int64(_)
        | OwnedValue::Float64Bits(_)
        | OwnedValue::Decimal128(_)
        | OwnedValue::Timestamp(_) => 8,
        _ => 1,
    }
}

fn owned_payload_length(value: &OwnedValue) -> Result<u64, EncodeError> {
    match value {
        OwnedValue::Null => Ok(0),
        OwnedValue::Bool(_) => Ok(1),
        OwnedValue::Int32(_) | OwnedValue::Date(_) => Ok(4),
        OwnedValue::Int64(_) | OwnedValue::Float64Bits(_) | OwnedValue::Timestamp(_) => Ok(8),
        OwnedValue::Decimal128(_) | OwnedValue::Uuid(_) => Ok(16),
        OwnedValue::String(value) => usize_to_u64(value.len()),
        OwnedValue::Binary { bytes, .. } => checked_add(1, usize_to_u64(bytes.len())?),
        OwnedValue::ObjectId(_) => Ok(12),
        OwnedValue::VectorF32(values) => {
            checked_add(4, checked_mul(usize_to_u64(values.len())?, 4)?)
        }
        OwnedValue::VectorF16(values) => {
            checked_add(4, checked_mul(usize_to_u64(values.len())?, 2)?)
        }
        OwnedValue::Object(_) | OwnedValue::Array(_) => Err(EncodeError::ArithmeticOverflow),
    }
}

const PROP_T: u32 = 1 << 0;
const PROP_CLASS: u32 = 1 << 1;
const PROP_SIGN: u32 = 1 << 2;
const PROP_COEFFICIENT: u32 = 1 << 3;
const PROP_EXPONENT: u32 = 1 << 4;
const PROP_VALUE: u32 = 1 << 5;
const PROP_BITS: u32 = 1 << 6;
const PROP_HEX: u32 = 1 << 7;
const PROP_SUBTYPE: u32 = 1 << 8;
const PROP_FIELDS: u32 = 1 << 9;
const PROP_VALUES: u32 = 1 << 10;
const PROP_MICROSECONDS: u32 = 1 << 11;
const PROP_DAYS: u32 = 1 << 12;
const PROP_ELEMENT: u32 = 1 << 13;
const PROP_DIMENSION: u32 = 1 << 14;

enum JsonScalar {
    Text(String),
    Bool(bool),
}

enum JsonBits {
    Text(String),
    Items(Vec<String>),
}

#[derive(Default)]
struct TaggedProperties {
    mask: u32,
    tag: Option<String>,
    class: Option<String>,
    sign: Option<String>,
    coefficient: Option<String>,
    exponent: Option<String>,
    value: Option<JsonScalar>,
    bits: Option<JsonBits>,
    hex: Option<String>,
    subtype: Option<String>,
    fields: Option<Vec<OwnedField>>,
    values: Option<Vec<OwnedValue>>,
    microseconds: Option<String>,
    days: Option<String>,
    element: Option<String>,
    dimension: Option<String>,
}

impl TaggedProperties {
    fn mark(&mut self, bit: u32, offset: u32) -> Result<(), JsonImportError> {
        if self.mask & bit != 0 {
            return Err(JsonImportError::DuplicateProperty { offset });
        }
        self.mask |= bit;
        Ok(())
    }

    fn exact(&self, expected: u32, offset: u32) -> Result<(), JsonImportError> {
        if self.mask == expected {
            Ok(())
        } else {
            Err(JsonImportError::InvalidTypedValue { offset })
        }
    }
}

struct TaggedJsonParser<'a> {
    source: &'a str,
    bytes: &'a [u8],
    offset: usize,
    total_fields: u64,
}

impl<'a> TaggedJsonParser<'a> {
    fn new(source: &'a str) -> Self {
        Self {
            source,
            bytes: source.as_bytes(),
            offset: 0,
            total_fields: 0,
        }
    }

    fn parse_value(&mut self, depth: u64) -> Result<OwnedValue, JsonImportError> {
        if depth > MAX_DEPTH {
            return Err(EncodeError::LimitExceeded {
                limit: LimitId::DocumentDepth,
                maximum: MAX_DEPTH,
                observed: depth,
            }
            .into());
        }
        self.skip_whitespace();
        if self.peek().is_none() {
            return Err(self.truncated());
        }
        if self.peek() != Some(b'{') {
            return Err(self.invalid_typed());
        }
        let wrapper_offset = self.offset_u32();
        let properties = self.parse_properties(depth)?;
        Self::finish_value(properties, wrapper_offset)
    }

    fn parse_properties(&mut self, depth: u64) -> Result<TaggedProperties, JsonImportError> {
        self.consume_expected(b'{')?;
        let mut properties = TaggedProperties::default();
        self.skip_whitespace();
        if self.consume_if(b'}') {
            return Ok(properties);
        }
        loop {
            self.skip_whitespace();
            if self.peek().is_none() {
                return Err(self.truncated());
            }
            if self.peek() != Some(b'"') {
                return Err(self.invalid_json());
            }
            let property_offset = self.offset_u32();
            let name = self.parse_string()?;
            self.skip_whitespace();
            self.consume_expected(b':')?;
            match name.as_str() {
                "t" => {
                    properties.mark(PROP_T, property_offset)?;
                    properties.tag = Some(self.parse_typed_string()?);
                }
                "class" => {
                    properties.mark(PROP_CLASS, property_offset)?;
                    properties.class = Some(self.parse_typed_string()?);
                }
                "sign" => {
                    properties.mark(PROP_SIGN, property_offset)?;
                    properties.sign = Some(self.parse_typed_string()?);
                }
                "coefficient" => {
                    properties.mark(PROP_COEFFICIENT, property_offset)?;
                    properties.coefficient = Some(self.parse_typed_string()?);
                }
                "exponent" => {
                    properties.mark(PROP_EXPONENT, property_offset)?;
                    properties.exponent = Some(self.parse_typed_string()?);
                }
                "value" => {
                    properties.mark(PROP_VALUE, property_offset)?;
                    properties.value = Some(self.parse_scalar_property()?);
                }
                "bits" => {
                    properties.mark(PROP_BITS, property_offset)?;
                    properties.bits = Some(self.parse_bits_property()?);
                }
                "hex" => {
                    properties.mark(PROP_HEX, property_offset)?;
                    properties.hex = Some(self.parse_typed_string()?);
                }
                "subtype" => {
                    properties.mark(PROP_SUBTYPE, property_offset)?;
                    properties.subtype = Some(self.parse_number_token()?);
                }
                "fields" => {
                    properties.mark(PROP_FIELDS, property_offset)?;
                    properties.fields = Some(self.parse_fields(depth)?);
                }
                "values" => {
                    properties.mark(PROP_VALUES, property_offset)?;
                    properties.values = Some(self.parse_values(depth)?);
                }
                "microseconds" => {
                    properties.mark(PROP_MICROSECONDS, property_offset)?;
                    properties.microseconds = Some(self.parse_typed_string()?);
                }
                "days" => {
                    properties.mark(PROP_DAYS, property_offset)?;
                    properties.days = Some(self.parse_typed_string()?);
                }
                "element" => {
                    properties.mark(PROP_ELEMENT, property_offset)?;
                    properties.element = Some(self.parse_typed_string()?);
                }
                "dimension" => {
                    properties.mark(PROP_DIMENSION, property_offset)?;
                    properties.dimension = Some(self.parse_number_token()?);
                }
                _ => {
                    return Err(JsonImportError::InvalidTypedValue {
                        offset: property_offset,
                    });
                }
            }
            self.skip_whitespace();
            if self.consume_if(b'}') {
                return Ok(properties);
            }
            self.consume_expected(b',')?;
        }
    }

    fn parse_fields(&mut self, depth: u64) -> Result<Vec<OwnedField>, JsonImportError> {
        self.skip_whitespace();
        if self.peek() != Some(b'[') {
            return Err(self.invalid_typed());
        }
        self.offset += 1;
        let mut fields = Vec::new();
        self.skip_whitespace();
        if self.consume_if(b']') {
            return Ok(fields);
        }
        loop {
            if fields.len() >= bounded_u64_to_usize(MAX_OBJECT_FIELDS) {
                return Err(EncodeError::LimitExceeded {
                    limit: LimitId::ObjectFields,
                    maximum: MAX_OBJECT_FIELDS,
                    observed: u64::try_from(fields.len() + 1).unwrap_or(u64::MAX),
                }
                .into());
            }
            fields.push(self.parse_field(depth + 1)?);
            self.total_fields = self
                .total_fields
                .checked_add(1)
                .ok_or(EncodeError::ArithmeticOverflow)?;
            enforce_limit(
                LimitId::DocumentTotalFields,
                MAX_DOCUMENT_FIELDS,
                self.total_fields,
            )?;
            self.skip_whitespace();
            if self.consume_if(b']') {
                return Ok(fields);
            }
            self.consume_expected(b',')?;
        }
    }

    fn parse_field(&mut self, depth: u64) -> Result<OwnedField, JsonImportError> {
        self.skip_whitespace();
        if self.peek() != Some(b'{') {
            return Err(self.invalid_typed());
        }
        let wrapper_offset = self.offset_u32();
        self.offset += 1;
        let mut name = None;
        let mut value = None;
        let mut mask = 0_u8;
        self.skip_whitespace();
        if self.consume_if(b'}') {
            return Err(JsonImportError::InvalidTypedValue {
                offset: wrapper_offset,
            });
        }
        loop {
            self.skip_whitespace();
            if self.peek() != Some(b'"') {
                return Err(if self.peek().is_none() {
                    self.truncated()
                } else {
                    self.invalid_json()
                });
            }
            let property_offset = self.offset_u32();
            let property = self.parse_string()?;
            self.skip_whitespace();
            self.consume_expected(b':')?;
            match property.as_str() {
                "name" => {
                    if mask & 1 != 0 {
                        return Err(JsonImportError::DuplicateProperty {
                            offset: property_offset,
                        });
                    }
                    mask |= 1;
                    name = Some(self.parse_typed_string()?);
                }
                "value" => {
                    if mask & 2 != 0 {
                        return Err(JsonImportError::DuplicateProperty {
                            offset: property_offset,
                        });
                    }
                    mask |= 2;
                    value = Some(self.parse_value(depth)?);
                }
                _ => {
                    return Err(JsonImportError::InvalidTypedValue {
                        offset: property_offset,
                    });
                }
            }
            self.skip_whitespace();
            if self.consume_if(b'}') {
                break;
            }
            self.consume_expected(b',')?;
        }
        let (Some(name), Some(value)) = (name, value) else {
            return Err(JsonImportError::InvalidTypedValue {
                offset: wrapper_offset,
            });
        };
        Ok(OwnedField { name, value })
    }

    fn parse_values(&mut self, depth: u64) -> Result<Vec<OwnedValue>, JsonImportError> {
        self.skip_whitespace();
        if self.peek() != Some(b'[') {
            return Err(self.invalid_typed());
        }
        self.offset += 1;
        let mut values = Vec::new();
        self.skip_whitespace();
        if self.consume_if(b']') {
            return Ok(values);
        }
        loop {
            if values.len() >= bounded_u64_to_usize(MAX_ARRAY_ELEMENTS) {
                return Err(EncodeError::LimitExceeded {
                    limit: LimitId::ArrayElements,
                    maximum: MAX_ARRAY_ELEMENTS,
                    observed: u64::try_from(values.len() + 1).unwrap_or(u64::MAX),
                }
                .into());
            }
            values.push(self.parse_value(depth + 1)?);
            self.skip_whitespace();
            if self.consume_if(b']') {
                return Ok(values);
            }
            self.consume_expected(b',')?;
        }
    }

    fn parse_bits_property(&mut self) -> Result<JsonBits, JsonImportError> {
        self.skip_whitespace();
        if self.peek() == Some(b'"') {
            return Ok(JsonBits::Text(self.parse_string()?));
        }
        if self.peek() != Some(b'[') {
            return Err(self.invalid_typed());
        }
        self.offset += 1;
        let mut items = Vec::new();
        self.skip_whitespace();
        if self.consume_if(b']') {
            return Ok(JsonBits::Items(items));
        }
        loop {
            if items.len() >= bounded_u64_to_usize(MAX_VECTOR_DIMENSION) {
                return Err(EncodeError::LimitExceeded {
                    limit: LimitId::VectorDimension,
                    maximum: MAX_VECTOR_DIMENSION,
                    observed: u64::try_from(items.len() + 1).unwrap_or(u64::MAX),
                }
                .into());
            }
            items.push(self.parse_typed_string()?);
            self.skip_whitespace();
            if self.consume_if(b']') {
                return Ok(JsonBits::Items(items));
            }
            self.consume_expected(b',')?;
        }
    }

    fn parse_scalar_property(&mut self) -> Result<JsonScalar, JsonImportError> {
        self.skip_whitespace();
        match self.peek() {
            Some(b'"') => Ok(JsonScalar::Text(self.parse_string()?)),
            Some(b't') => {
                self.consume_literal(b"true")?;
                Ok(JsonScalar::Bool(true))
            }
            Some(b'f') => {
                self.consume_literal(b"false")?;
                Ok(JsonScalar::Bool(false))
            }
            Some(_) => Err(self.invalid_typed()),
            None => Err(self.truncated()),
        }
    }

    fn parse_typed_string(&mut self) -> Result<String, JsonImportError> {
        self.skip_whitespace();
        if self.peek() == Some(b'"') {
            self.parse_string()
        } else if self.peek().is_none() {
            Err(self.truncated())
        } else {
            Err(self.invalid_typed())
        }
    }

    fn parse_string(&mut self) -> Result<String, JsonImportError> {
        self.consume_expected(b'"')?;
        let mut output = String::new();
        let mut chunk_start = self.offset;
        loop {
            let Some(byte) = self.peek() else {
                return Err(self.truncated());
            };
            match byte {
                b'"' => {
                    output.push_str(&self.source[chunk_start..self.offset]);
                    self.offset += 1;
                    return Ok(output);
                }
                b'\\' => {
                    output.push_str(&self.source[chunk_start..self.offset]);
                    self.offset += 1;
                    let Some(escaped) = self.peek() else {
                        return Err(self.truncated());
                    };
                    self.offset += 1;
                    match escaped {
                        b'"' => output.push('"'),
                        b'\\' => output.push('\\'),
                        b'/' => output.push('/'),
                        b'b' => output.push('\u{08}'),
                        b'f' => output.push('\u{0c}'),
                        b'n' => output.push('\n'),
                        b'r' => output.push('\r'),
                        b't' => output.push('\t'),
                        b'u' => self.parse_unicode_escape(&mut output)?,
                        _ => return Err(self.invalid_json()),
                    }
                    chunk_start = self.offset;
                }
                0x00..=0x1f => return Err(self.invalid_json()),
                0x20..=0x7f => self.offset += 1,
                _ => {
                    let width = self.source[self.offset..]
                        .chars()
                        .next()
                        .map_or(1, char::len_utf8);
                    self.offset += width;
                }
            }
        }
    }

    fn parse_unicode_escape(&mut self, output: &mut String) -> Result<(), JsonImportError> {
        let first = self.parse_hex_quad()?;
        let scalar = if (0xd800..=0xdbff).contains(&first) {
            if self.bytes.get(self.offset..self.offset + 2) != Some(b"\\u") {
                return Err(self.invalid_unicode());
            }
            self.offset += 2;
            let second = self.parse_hex_quad()?;
            if !(0xdc00..=0xdfff).contains(&second) {
                return Err(self.invalid_unicode());
            }
            0x1_0000 + ((u32::from(first) - 0xd800) << 10) + (u32::from(second) - 0xdc00)
        } else if (0xdc00..=0xdfff).contains(&first) {
            return Err(self.invalid_unicode());
        } else {
            u32::from(first)
        };
        let character = char::from_u32(scalar).ok_or(self.invalid_unicode())?;
        output.push(character);
        Ok(())
    }

    fn parse_hex_quad(&mut self) -> Result<u16, JsonImportError> {
        let Some(digits) = self.bytes.get(self.offset..self.offset + 4) else {
            return Err(self.truncated());
        };
        let mut value = 0_u16;
        for digit in digits {
            let nibble = match digit {
                b'0'..=b'9' => u16::from(*digit - b'0'),
                b'a'..=b'f' => u16::from(*digit - b'a' + 10),
                b'A'..=b'F' => u16::from(*digit - b'A' + 10),
                _ => return Err(self.invalid_json()),
            };
            value = value * 16 + nibble;
        }
        self.offset += 4;
        Ok(value)
    }

    fn parse_number_token(&mut self) -> Result<String, JsonImportError> {
        self.skip_whitespace();
        let start = self.offset;
        if self.consume_if(b'-') && self.peek().is_none() {
            return Err(self.truncated());
        }
        match self.peek() {
            Some(b'0') => {
                self.offset += 1;
                if self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                    return Err(self.invalid_json());
                }
            }
            Some(b'1'..=b'9') => {
                self.offset += 1;
                while self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                    self.offset += 1;
                }
            }
            Some(_) => return Err(self.invalid_typed()),
            None => return Err(self.truncated()),
        }
        if self.consume_if(b'.') {
            if !self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                return Err(if self.peek().is_none() {
                    self.truncated()
                } else {
                    self.invalid_json()
                });
            }
            while self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                self.offset += 1;
            }
        }
        if self.peek().is_some_and(|byte| matches!(byte, b'e' | b'E')) {
            self.offset += 1;
            if self.peek().is_some_and(|byte| matches!(byte, b'+' | b'-')) {
                self.offset += 1;
            }
            if !self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                return Err(if self.peek().is_none() {
                    self.truncated()
                } else {
                    self.invalid_json()
                });
            }
            while self.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                self.offset += 1;
            }
        }
        if self.peek().is_some_and(|byte| !is_json_delimiter(byte)) {
            return Err(self.invalid_json());
        }
        Ok(self.source[start..self.offset].to_owned())
    }

    fn finish_value(
        properties: TaggedProperties,
        offset: u32,
    ) -> Result<OwnedValue, JsonImportError> {
        let Some(tag) = properties.tag.as_deref() else {
            return Err(JsonImportError::InvalidTypedValue { offset });
        };
        match tag {
            "null" => {
                properties.exact(PROP_T, offset)?;
                Ok(OwnedValue::Null)
            }
            "bool" => {
                properties.exact(PROP_T | PROP_VALUE, offset)?;
                let Some(JsonScalar::Bool(value)) = properties.value else {
                    return Err(JsonImportError::InvalidTypedValue { offset });
                };
                Ok(OwnedValue::Bool(value))
            }
            "int32" => {
                properties.exact(PROP_T | PROP_VALUE, offset)?;
                let text = scalar_text(properties.value, offset)?;
                Ok(OwnedValue::Int32(parse_i32(&text, offset)?))
            }
            "int64" => {
                properties.exact(PROP_T | PROP_VALUE, offset)?;
                let text = scalar_text(properties.value, offset)?;
                Ok(OwnedValue::Int64(parse_i64(&text, offset)?))
            }
            "float64" => {
                properties.exact(PROP_BITS | PROP_T, offset)?;
                let Some(JsonBits::Text(bits)) = properties.bits else {
                    return Err(JsonImportError::InvalidTypedValue { offset });
                };
                Ok(OwnedValue::Float64Bits(parse_fixed_hex_u64(
                    &bits, 16, offset,
                )?))
            }
            "decimal128" => parse_decimal(&properties, offset),
            "string" => {
                properties.exact(PROP_T | PROP_VALUE, offset)?;
                Ok(OwnedValue::String(scalar_text(properties.value, offset)?))
            }
            "binary" => parse_binary(properties, offset),
            "object" => {
                properties.exact(PROP_FIELDS | PROP_T, offset)?;
                debug_assert!(properties.fields.is_some());
                let fields = properties.fields.unwrap_or_default();
                Ok(OwnedValue::Object(OwnedObject { fields }))
            }
            "array" => {
                properties.exact(PROP_T | PROP_VALUES, offset)?;
                debug_assert!(properties.values.is_some());
                let values = properties.values.unwrap_or_default();
                Ok(OwnedValue::Array(values))
            }
            "timestamp" => {
                properties.exact(PROP_MICROSECONDS | PROP_T, offset)?;
                debug_assert!(properties.microseconds.is_some());
                let text = properties.microseconds.unwrap_or_default();
                let value = parse_i64(&text, offset)?;
                if !(TIMESTAMP_MIN..=TIMESTAMP_MAX).contains(&value) {
                    return Err(JsonImportError::InvalidTypedValue { offset });
                }
                Ok(OwnedValue::Timestamp(value))
            }
            "date" => {
                properties.exact(PROP_DAYS | PROP_T, offset)?;
                debug_assert!(properties.days.is_some());
                let text = properties.days.unwrap_or_default();
                let value = parse_i32(&text, offset)?;
                if !(DATE_MIN..=DATE_MAX).contains(&value) {
                    return Err(JsonImportError::InvalidTypedValue { offset });
                }
                Ok(OwnedValue::Date(value))
            }
            "uuid" => {
                properties.exact(PROP_T | PROP_VALUE, offset)?;
                let text = scalar_text(properties.value, offset)?;
                Ok(OwnedValue::Uuid(parse_uuid(&text, offset)?))
            }
            "objectId" => {
                properties.exact(PROP_T | PROP_VALUE, offset)?;
                let text = scalar_text(properties.value, offset)?;
                Ok(OwnedValue::ObjectId(parse_object_id(&text, offset)?))
            }
            "vector" => parse_vector(properties, offset),
            _ => Err(JsonImportError::InvalidTypedValue { offset }),
        }
    }

    fn consume_literal(&mut self, literal: &[u8]) -> Result<(), JsonImportError> {
        let Some(candidate) = self.bytes.get(self.offset..self.offset + literal.len()) else {
            return Err(self.truncated());
        };
        if candidate != literal {
            return Err(self.invalid_json());
        }
        self.offset += literal.len();
        Ok(())
    }

    fn consume_expected(&mut self, expected: u8) -> Result<(), JsonImportError> {
        self.skip_whitespace();
        match self.peek() {
            Some(actual) if actual == expected => {
                self.offset += 1;
                Ok(())
            }
            Some(_) => Err(self.invalid_json()),
            None => Err(self.truncated()),
        }
    }

    fn consume_if(&mut self, expected: u8) -> bool {
        if self.peek() == Some(expected) {
            self.offset += 1;
            true
        } else {
            false
        }
    }

    fn skip_whitespace(&mut self) {
        while self.peek().is_some_and(is_json_whitespace) {
            self.offset += 1;
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.offset).copied()
    }

    fn offset_u32(&self) -> u32 {
        u32::try_from(self.offset).unwrap_or(u32::MAX)
    }

    fn truncated(&self) -> JsonImportError {
        JsonImportError::TruncatedInput {
            offset: self.offset_u32(),
        }
    }

    fn invalid_json(&self) -> JsonImportError {
        JsonImportError::InvalidJson {
            offset: self.offset_u32(),
        }
    }

    fn invalid_unicode(&self) -> JsonImportError {
        JsonImportError::InvalidUnicode {
            offset: self.offset_u32(),
        }
    }

    fn invalid_typed(&self) -> JsonImportError {
        JsonImportError::InvalidTypedValue {
            offset: self.offset_u32(),
        }
    }
}

fn is_json_whitespace(byte: u8) -> bool {
    matches!(byte, b' ' | b'\t' | b'\r' | b'\n')
}

fn is_json_delimiter(byte: u8) -> bool {
    is_json_whitespace(byte) || matches!(byte, b',' | b']' | b'}')
}

fn scalar_text(value: Option<JsonScalar>, offset: u32) -> Result<String, JsonImportError> {
    match value {
        Some(JsonScalar::Text(text)) => Ok(text),
        Some(JsonScalar::Bool(_)) | None => Err(JsonImportError::InvalidTypedValue { offset }),
    }
}

fn canonical_integer(text: &str) -> bool {
    if text == "0" {
        return true;
    }
    let bytes = text.as_bytes();
    let digits = if bytes.first() == Some(&b'-') {
        &bytes[1..]
    } else {
        bytes
    };
    !digits.is_empty()
        && matches!(digits.first(), Some(b'1'..=b'9'))
        && digits.iter().all(u8::is_ascii_digit)
}

fn parse_i32(text: &str, offset: u32) -> Result<i32, JsonImportError> {
    if !canonical_integer(text) {
        return Err(JsonImportError::InvalidTypedValue { offset });
    }
    text.parse()
        .map_err(|_| JsonImportError::InvalidTypedValue { offset })
}

fn parse_i64(text: &str, offset: u32) -> Result<i64, JsonImportError> {
    if !canonical_integer(text) {
        return Err(JsonImportError::InvalidTypedValue { offset });
    }
    text.parse()
        .map_err(|_| JsonImportError::InvalidTypedValue { offset })
}

fn parse_binary(properties: TaggedProperties, offset: u32) -> Result<OwnedValue, JsonImportError> {
    properties.exact(PROP_HEX | PROP_SUBTYPE | PROP_T, offset)?;
    debug_assert!(properties.subtype.is_some() && properties.hex.is_some());
    let subtype = properties.subtype.unwrap_or_default();
    let hex = properties.hex.unwrap_or_default();
    if subtype != "0" {
        return Err(JsonImportError::InvalidTypedValue { offset });
    }
    Ok(OwnedValue::Binary {
        subtype: 0,
        bytes: parse_hex_bytes(&hex, offset)?,
    })
}

fn parse_decimal(
    properties: &TaggedProperties,
    offset: u32,
) -> Result<OwnedValue, JsonImportError> {
    let Some(class) = properties.class.as_deref() else {
        return Err(JsonImportError::InvalidTypedValue { offset });
    };
    let decimal = match class {
        "nan" => {
            properties.exact(PROP_CLASS | PROP_T, offset)?;
            Decimal128::NaN
        }
        "infinity" => {
            properties.exact(PROP_CLASS | PROP_SIGN | PROP_T, offset)?;
            match properties.sign.as_deref() {
                Some("positive") => Decimal128::PositiveInfinity,
                Some("negative") => Decimal128::NegativeInfinity,
                _ => return Err(JsonImportError::InvalidTypedValue { offset }),
            }
        }
        "finite" => {
            properties.exact(
                PROP_CLASS | PROP_COEFFICIENT | PROP_EXPONENT | PROP_SIGN | PROP_T,
                offset,
            )?;
            let negative = match properties.sign.as_deref() {
                Some("positive") => false,
                Some("negative") => true,
                _ => return Err(JsonImportError::InvalidTypedValue { offset }),
            };
            debug_assert!(properties.coefficient.is_some() && properties.exponent.is_some());
            let coefficient = properties.coefficient.as_deref().unwrap_or_default();
            let exponent = properties.exponent.as_deref().unwrap_or_default();
            if coefficient == "0" {
                if exponent != "0" {
                    return Err(JsonImportError::InvalidTypedValue { offset });
                }
                Decimal128::Zero { negative }
            } else {
                if coefficient.len() > 34
                    || !canonical_integer(coefficient)
                    || coefficient.starts_with('-')
                    || coefficient.ends_with('0')
                {
                    return Err(JsonImportError::InvalidTypedValue { offset });
                }
                let coefficient = coefficient
                    .bytes()
                    .fold(0_u128, |value, digit| value * 10 + u128::from(digit - b'0'));
                let exponent = parse_i32(exponent, offset)?;
                Decimal128::Finite {
                    negative,
                    coefficient,
                    exponent,
                }
            }
        }
        _ => return Err(JsonImportError::InvalidTypedValue { offset }),
    };
    decimal_bytes(decimal).map_err(|_| JsonImportError::InvalidTypedValue { offset })?;
    Ok(OwnedValue::Decimal128(decimal))
}

fn parse_vector(properties: TaggedProperties, offset: u32) -> Result<OwnedValue, JsonImportError> {
    properties.exact(PROP_BITS | PROP_DIMENSION | PROP_ELEMENT | PROP_T, offset)?;
    let (Some(JsonBits::Items(bits)), Some(dimension), Some(element)) =
        (properties.bits, properties.dimension, properties.element)
    else {
        return Err(JsonImportError::InvalidTypedValue { offset });
    };
    if !canonical_unsigned_json_integer(&dimension) {
        return Err(JsonImportError::InvalidTypedValue { offset });
    }
    let dimension = dimension
        .parse::<usize>()
        .map_err(|_| JsonImportError::InvalidTypedValue { offset })?;
    if dimension == 0
        || u64::try_from(dimension).unwrap_or(u64::MAX) > MAX_VECTOR_DIMENSION
        || dimension != bits.len()
    {
        return Err(JsonImportError::InvalidTypedValue { offset });
    }
    match element.as_str() {
        "f32" => {
            let mut values = Vec::with_capacity(bits.len());
            for text in bits {
                let parsed = parse_fixed_hex_u64(&text, 8, offset)?;
                let value = u32::try_from(parsed).unwrap_or_default();
                if (value >> 23) & 0xff == 0xff {
                    return Err(JsonImportError::InvalidTypedValue { offset });
                }
                values.push(value);
            }
            Ok(OwnedValue::VectorF32(values))
        }
        "f16" => {
            let mut values = Vec::with_capacity(bits.len());
            for text in bits {
                let parsed = parse_fixed_hex_u64(&text, 4, offset)?;
                let value = u16::try_from(parsed).unwrap_or_default();
                if (value >> 10) & 0x1f == 0x1f {
                    return Err(JsonImportError::InvalidTypedValue { offset });
                }
                values.push(value);
            }
            Ok(OwnedValue::VectorF16(values))
        }
        _ => Err(JsonImportError::InvalidTypedValue { offset }),
    }
}

fn canonical_unsigned_json_integer(text: &str) -> bool {
    text == "0"
        || text
            .as_bytes()
            .first()
            .is_some_and(|byte| matches!(byte, b'1'..=b'9'))
            && text.as_bytes().iter().all(u8::is_ascii_digit)
}

fn parse_fixed_hex_u64(text: &str, digits: usize, offset: u32) -> Result<u64, JsonImportError> {
    if text.len() != digits || !text.as_bytes().iter().all(|byte| is_lower_hex(*byte)) {
        return Err(JsonImportError::InvalidTypedValue { offset });
    }
    let mut value = 0_u64;
    for byte in text.bytes() {
        value = value * 16 + u64::from(hex_value(byte, offset)?);
    }
    Ok(value)
}

fn parse_hex_bytes(text: &str, offset: u32) -> Result<Vec<u8>, JsonImportError> {
    if !text.len().is_multiple_of(2) {
        return Err(JsonImportError::InvalidTypedValue { offset });
    }
    text.as_bytes()
        .chunks_exact(2)
        .map(|pair| Ok((hex_value(pair[0], offset)? << 4) | hex_value(pair[1], offset)?))
        .collect::<Result<Vec<_>, JsonImportError>>()
}

fn parse_uuid(text: &str, offset: u32) -> Result<[u8; 16], JsonImportError> {
    if text.len() != 36
        || [8, 13, 18, 23]
            .iter()
            .any(|index| text.as_bytes().get(*index) != Some(&b'-'))
    {
        return Err(JsonImportError::InvalidTypedValue { offset });
    }
    let compact = text
        .chars()
        .filter(|character| *character != '-')
        .collect::<String>();
    let bytes = parse_hex_bytes(&compact, offset)?;
    debug_assert_eq!(bytes.len(), 16);
    let mut output = [0_u8; 16];
    output.copy_from_slice(&bytes);
    Ok(output)
}

fn parse_object_id(text: &str, offset: u32) -> Result<[u8; 12], JsonImportError> {
    let bytes = parse_hex_bytes(text, offset)?;
    <[u8; 12]>::try_from(bytes).map_err(|_| JsonImportError::InvalidTypedValue { offset })
}

const fn is_lower_hex(byte: u8) -> bool {
    matches!(byte, b'0'..=b'9' | b'a'..=b'f')
}

const fn hex_value(byte: u8, offset: u32) -> Result<u8, JsonImportError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        _ => Err(JsonImportError::InvalidTypedValue { offset }),
    }
}

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;
    use crate::{EncodeDocument, EncodeField, EncodeObject, EncodeValue, decode, encode};

    fn all_types_hdoc() -> Result<crate::EncodedHDoc, EncodeError> {
        let empty_fields = [];
        let array_values = [EncodeValue::Null, EncodeValue::Bool(false)];
        let vector_f32 = [0x3f80_0000, 0x8000_0000, 1];
        let vector_f16 = [0x3c00, 0x8000, 1];
        let fields = [
            EncodeField::new("_id", EncodeValue::Uuid([0; 16])),
            EncodeField::new("null", EncodeValue::Null),
            EncodeField::new("bool", EncodeValue::Bool(true)),
            EncodeField::new("int32", EncodeValue::Int32(i32::MIN)),
            EncodeField::new("int64", EncodeValue::Int64(i64::MAX)),
            EncodeField::new("float64", EncodeValue::Float64Bits(0x8000_0000_0000_0000)),
            EncodeField::new(
                "decimal128",
                EncodeValue::Decimal128(Decimal128::Finite {
                    negative: true,
                    coefficient: 12_345,
                    exponent: -2,
                }),
            ),
            EncodeField::new("string", EncodeValue::String("\0\n\"\\e\u{301}")),
            EncodeField::new("binary", EncodeValue::Binary(&[0, 0xff])),
            EncodeField::new(
                "object",
                EncodeValue::Object(EncodeObject::new(&empty_fields)),
            ),
            EncodeField::new("array", EncodeValue::Array(&array_values)),
            EncodeField::new("timestamp", EncodeValue::Timestamp(TIMESTAMP_MIN)),
            EncodeField::new("date", EncodeValue::Date(DATE_MAX)),
            EncodeField::new("uuid", EncodeValue::Uuid([0xff; 16])),
            EncodeField::new("objectId", EncodeValue::ObjectId([0xff; 12])),
            EncodeField::new("vector32", EncodeValue::VectorF32(&vector_f32)),
            EncodeField::new("vector16", EncodeValue::VectorF16(&vector_f16)),
        ];
        encode(EncodeDocument::new(&fields))
    }

    #[test]
    fn canonical_render_and_import_preserve_every_logical_type() -> Result<(), Box<dyn Error>> {
        let encoded = all_types_hdoc()?;
        let decoded = decode(encoded.as_bytes())?;
        let view = decoded.view();
        let canonical = view.to_canonical_tagged_json();
        let imported = import_tagged_json(&canonical)?;
        assert_eq!(imported, view.to_owned_document());
        assert_eq!(imported.to_canonical_tagged_json(), canonical);
        assert_eq!(view.root().to_canonical_tagged_json(), canonical);

        for (field, owned) in view.fields().zip(imported.fields()) {
            assert_eq!(
                field.value().to_canonical_tagged_json(),
                owned.value().to_canonical_tagged_json()
            );
        }
        let object_value = imported
            .fields()
            .iter()
            .find(|field| field.name() == "object")
            .ok_or(std::io::Error::other("missing object field"))?
            .value();
        let OwnedValue::Object(object) = object_value else {
            return Err(std::io::Error::other("object field changed type").into());
        };
        assert_eq!(
            object.to_canonical_tagged_json(),
            "{\"fields\":[],\"t\":\"object\"}"
        );
        Ok(())
    }

    #[test]
    fn import_accepts_property_reordering_and_canonicalizes_decimal_classes()
    -> Result<(), Box<dyn Error>> {
        let cases = [
            (
                r#"{"t":"decimal128","class":"nan"}"#,
                r#"{"class":"nan","t":"decimal128"}"#,
            ),
            (
                r#"{"sign":"positive","t":"decimal128","class":"infinity"}"#,
                r#"{"class":"infinity","sign":"positive","t":"decimal128"}"#,
            ),
            (
                r#"{"class":"infinity","sign":"negative","t":"decimal128"}"#,
                r#"{"class":"infinity","sign":"negative","t":"decimal128"}"#,
            ),
            (
                r#"{"coefficient":"0","class":"finite","t":"decimal128","exponent":"0","sign":"negative"}"#,
                r#"{"class":"finite","coefficient":"0","exponent":"0","sign":"negative","t":"decimal128"}"#,
            ),
        ];
        for (source, expected) in cases {
            let mut parser = TaggedJsonParser::new(source);
            let value = parser.parse_value(1)?;
            assert_eq!(value.to_canonical_tagged_json(), expected);
        }

        let reordered = concat!(
            " \n {\"t\":\"object\",\"fields\":[",
            "{\"value\":{\"value\":\"id\",\"t\":\"string\"},\"name\":\"_id\"},",
            "{\"name\":\"escaped\",\"value\":{\"value\":\"\\u0061\\b\\f\\n\\r\\t\\/\",\"t\":\"string\"}}",
            "]} \t"
        );
        let imported = import_tagged_json(reordered)?;
        assert_eq!(imported.fields()[1].name(), "escaped");
        assert_eq!(
            imported.fields()[1].value().to_canonical_tagged_json(),
            "{\"t\":\"string\",\"value\":\"a\\b\\f\\n\\r\\t/\"}"
        );
        assert_eq!(
            import_tagged_json(
                r#"{"fields":[{"name":"_id","value":{"t":"int32","value":"0"}}],"t":"object"}"#,
            )?
            .fields()[0]
                .value(),
            &OwnedValue::Int32(0)
        );
        Ok(())
    }

    #[test]
    fn import_reports_stable_syntax_shape_and_document_errors() -> Result<(), Box<dyn Error>> {
        let cases = [
            ("", "PAR_TRUNCATED_INPUT", true),
            ("{", "PAR_TRUNCATED_INPUT", true),
            ("[]", "PAR_INVALID_TYPED_VALUE", true),
            (r#"{"t":"null",}"#, "PAR_INVALID_JSON", true),
            (r#"{"t":"null","t":"null"}"#, "VAL_DUPLICATE_FIELD", true),
            (
                r#"{"t":"string","value":"\uD800"}"#,
                "PAR_INVALID_UTF8",
                true,
            ),
            (r#"{"t":"unknown"}"#, "PAR_INVALID_TYPED_VALUE", true),
            (r#"{"t":"null"}x"#, "PAR_INVALID_JSON", true),
            (r#"{"t":"null"}"#, "PAR_INVALID_TYPED_VALUE", true),
            (r#"{"fields":[],"t":"object"}"#, "VAL_INVALID_SHAPE", false),
            (
                r#"{"fields":[{"name":"_id","value":{"t":"null"}}],"t":"object"}"#,
                "TYPE_MISMATCH",
                false,
            ),
            (
                r#"{"fields":[{"name":"_id","value":{"t":"int32","value":"1"}},{"name":"_v","value":{"t":"null"}}],"t":"object"}"#,
                "VAL_PROTECTED_FIELD",
                false,
            ),
        ];
        for (source, code, has_offset) in cases {
            let Err(error) = import_tagged_json(source) else {
                return Err(
                    std::io::Error::other(format!("accepted invalid JSON: {source}")).into(),
                );
            };
            assert_eq!(error.code(), code, "{source}");
            assert_eq!(error.offset().is_some(), has_offset);
            assert_eq!(error.to_string().split(':').next(), Some(code));
        }
        assert_eq!(
            import_tagged_json("\u{feff}{\"fields\":[],\"t\":\"object\"}")
                .err()
                .ok_or(std::io::Error::other("BOM accepted"))?
                .code(),
            "PAR_INVALID_UTF8"
        );
        Ok(())
    }

    fn reject_value(source: &str, code: &str) -> Result<(), Box<dyn Error>> {
        let mut parser = TaggedJsonParser::new(source);
        let error = if let Err(error) = parser.parse_value(1) {
            error
        } else {
            parser.skip_whitespace();
            if parser.offset == parser.bytes.len() {
                return Err(
                    std::io::Error::other(format!("accepted invalid value: {source}")).into(),
                );
            }
            parser.invalid_json()
        };
        assert_eq!(error.code(), code, "{source}");
        Ok(())
    }

    #[test]
    #[allow(
        clippy::too_many_lines,
        reason = "one malformed-input table audits every tagged scalar and container grammar"
    )]
    fn parser_rejects_noncanonical_or_malformed_typed_payloads() -> Result<(), Box<dyn Error>> {
        let invalid_typed = [
            "{}",
            r#"{"extra":0,"t":"null"}"#,
            r#"{"t":"bool","value":null}"#,
            r#"{"t":"bool","value":"true"}"#,
            r#"{"t":"int32","value":"01"}"#,
            r#"{"t":"int32","value":"2147483648"}"#,
            r#"{"t":"int64","value":"01"}"#,
            r#"{"t":"int64","value":"9223372036854775808"}"#,
            r#"{"bits":"000000000000000g","t":"float64"}"#,
            r#"{"bits":"0","t":"float64"}"#,
            r#"{"t":"string","value":false}"#,
            r#"{"hex":"0","subtype":0,"t":"binary"}"#,
            r#"{"hex":"gg","subtype":0,"t":"binary"}"#,
            r#"{"hex":"","subtype":1,"t":"binary"}"#,
            r#"{"fields":{},"t":"object"}"#,
            r#"{"t":"array","values":{}}"#,
            r#"{"microseconds":"253402300800000000","t":"timestamp"}"#,
            r#"{"days":"2932897","t":"date"}"#,
            r#"{"t":"uuid","value":"00000000-0000-0000-0000"}"#,
            r#"{"t":"uuid","value":"000000000000-0000-0000-000000000000"}"#,
            r#"{"t":"uuid","value":"00000000-0000-0000-0000-00000000000g"}"#,
            r#"{"t":"objectId","value":"00"}"#,
            r#"{"t":"objectId","value":"00000000000000000000000g"}"#,
            r#"{"bits":[],"dimension":0,"element":"f32","t":"vector"}"#,
            r#"{"bits":["3f800000"],"dimension":2,"element":"f32","t":"vector"}"#,
            r#"{"bits":["7f800000"],"dimension":1,"element":"f32","t":"vector"}"#,
            r#"{"bits":["zzzzzzzz"],"dimension":1,"element":"f32","t":"vector"}"#,
            r#"{"bits":["7c00"],"dimension":1,"element":"f16","t":"vector"}"#,
            r#"{"bits":["zzzz"],"dimension":1,"element":"f16","t":"vector"}"#,
            r#"{"bits":["0000"],"dimension":1,"element":"f64","t":"vector"}"#,
            r#"{"bits":"0000","dimension":1,"element":"f16","t":"vector"}"#,
            r#"{"bits":[],"dimension":1.0,"element":"f16","t":"vector"}"#,
            r#"{"bits":[],"dimension":1e+0,"element":"f16","t":"vector"}"#,
            r#"{"bits":[],"dimension":-1,"element":"f16","t":"vector"}"#,
            r#"{"bits":[],"dimension":999999999999999999999999999999,"element":"f16","t":"vector"}"#,
            r#"{"class":"finite","coefficient":"0","exponent":"1","sign":"positive","t":"decimal128"}"#,
            r#"{"class":"finite","coefficient":"10","exponent":"0","sign":"positive","t":"decimal128"}"#,
            r#"{"class":"finite","coefficient":"1","exponent":"0","sign":"sideways","t":"decimal128"}"#,
            r#"{"class":"infinity","sign":"sideways","t":"decimal128"}"#,
            r#"{"class":"other","t":"decimal128"}"#,
            r#"{"t":"decimal128"}"#,
            r#"{"class":"finite","coefficient":"1","exponent":"99999","sign":"positive","t":"decimal128"}"#,
            r#"{"class":"finite","coefficient":"1","sign":"positive","t":"decimal128"}"#,
            r#"{"t":"null","value":"extra"}"#,
            r#"{"bits":false,"t":"float64"}"#,
            r#"{"bits":[],"t":"float64"}"#,
            r#"{"t":"object"}"#,
            r#"{"t":"array"}"#,
            r#"{"t":"timestamp"}"#,
            r#"{"t":"date"}"#,
            r#"{"t":"binary","subtype":0}"#,
            r#"{"t":1}"#,
            r#"{"fields":[0],"t":"object"}"#,
            r#"{"fields":[{}],"t":"object"}"#,
            r#"{"fields":[{"name":"a"}],"t":"object"}"#,
            r#"{"fields":[{"value":{"t":"null"}}],"t":"object"}"#,
            r#"{"fields":[{"other":"x"}],"t":"object"}"#,
        ];
        for source in invalid_typed {
            reject_value(source, "PAR_INVALID_TYPED_VALUE")?;
        }

        let invalid_json = [
            r#"{"t":"null"}x"#,
            r#"{"t":"string","value":"\q"}"#,
            "{\"t\":\"string\",\"value\":\"\u{1f}\"}",
            r#"{"t":"string","value":"\u12xz"}"#,
            r#"{"hex":"","subtype":01,"t":"binary"}"#,
            r#"{"hex":"","subtype":0x,"t":"binary"}"#,
            r#"{"hex":"","subtype":1.x,"t":"binary"}"#,
            r#"{"hex":"","subtype":1ex,"t":"binary"}"#,
            r#"{"fields":[{x],"t":"object"}"#,
            r#"{"t" 1}"#,
            r#"{"t":"bool","value":falsx}"#,
        ];
        for source in invalid_json {
            reject_value(source, "PAR_INVALID_JSON")?;
        }
        for source in [
            r#"{"fields":[{"name":"a","name":"b","value":{"t":"null"}}],"t":"object"}"#,
            r#"{"fields":[{"name":"a","value":{"t":"null"},"value":{"t":"null"}}],"t":"object"}"#,
        ] {
            reject_value(source, "VAL_DUPLICATE_FIELD")?;
        }
        for source in [
            r#"{"t":"string","value":"\uD800\u0041"}"#,
            r#"{"t":"string","value":"\uDC00"}"#,
        ] {
            reject_value(source, "PAR_INVALID_UTF8")?;
        }

        let truncated = [
            r#"{"t":"string","value":"abc"#,
            r#"{"t":"string","value":"\"#,
            r#"{"t":"string","value":"\u12"#,
            r#"{"hex":"","subtype":-"#,
            r#"{"hex":"","subtype":"#,
            r#"{"hex":"","subtype":1."#,
            r#"{"hex":"","subtype":1e"#,
            r#"{"hex":"","subtype":1e+"#,
            r#"{"t":"bool","value":tru"#,
            r#"{"t":"bool","value":false"#,
            r#"{"t":"bool","value":"#,
            r#"{"t":"#,
            r#"{"t":"string","value":"x""#,
            r#"{"fields":[{"#,
        ];
        for source in truncated {
            reject_value(source, "PAR_TRUNCATED_INPUT")?;
        }

        let mut parser = TaggedJsonParser::new(r#"{"t":"string","value":"\uD83D\uDE00"}"#);
        assert_eq!(
            parser.parse_value(1)?.to_canonical_tagged_json(),
            "{\"t\":\"string\",\"value\":\"😀\"}"
        );
        let mut parser = TaggedJsonParser::new(r#"{"t":"array","values":[]}"#);
        assert_eq!(parser.parse_value(1)?, OwnedValue::Array(Vec::new()));
        for source in [
            r#"{"hex":"","subtype":12,"t":"binary"}"#,
            r#"{"hex":"","subtype":},"t":"binary"}"#,
        ] {
            reject_value(source, "PAR_INVALID_TYPED_VALUE")?;
        }
        let mut parser = TaggedJsonParser::new("{}");
        assert_eq!(
            parser
                .parse_value(MAX_DEPTH + 1)
                .err()
                .ok_or(std::io::Error::other("excess depth accepted"))?
                .code(),
            "QUOTA_LIMIT_EXCEEDED"
        );
        Ok(())
    }

    #[test]
    fn parser_enforces_field_and_array_count_limits() -> Result<(), Box<dyn Error>> {
        let field = r#"{"name":"a","value":{"t":"null"}}"#;
        let mut object = String::from("[");
        for index in 0..=MAX_OBJECT_FIELDS {
            if index != 0 {
                object.push(',');
            }
            object.push_str(field);
        }
        object.push(']');
        let mut parser = TaggedJsonParser::new(&object);
        let error = parser
            .parse_fields(1)
            .err()
            .ok_or(std::io::Error::other("field limit bypassed"))?;
        assert_eq!(error.code(), "QUOTA_LIMIT_EXCEEDED");

        let one_field = format!("[{field}]");
        let mut parser = TaggedJsonParser::new(&one_field);
        parser.total_fields = MAX_DOCUMENT_FIELDS;
        let error = parser
            .parse_fields(1)
            .err()
            .ok_or(std::io::Error::other("total field limit bypassed"))?;
        assert_eq!(error.code(), "QUOTA_LIMIT_EXCEEDED");

        let mut array = String::from("[");
        for index in 0..=MAX_ARRAY_ELEMENTS {
            if index != 0 {
                array.push(',');
            }
            array.push_str(r#"{"t":"null"}"#);
        }
        array.push(']');
        let mut parser = TaggedJsonParser::new(&array);
        let error = parser
            .parse_values(1)
            .err()
            .ok_or(std::io::Error::other("array limit bypassed"))?;
        assert_eq!(error.code(), "QUOTA_LIMIT_EXCEEDED");

        let mut bits = String::from("[");
        for index in 0..=MAX_VECTOR_DIMENSION {
            if index != 0 {
                bits.push(',');
            }
            bits.push_str(r#""0000""#);
        }
        bits.push(']');
        let mut parser = TaggedJsonParser::new(&bits);
        let error = parser
            .parse_bits_property()
            .err()
            .ok_or(std::io::Error::other("vector limit bypassed"))?;
        assert_eq!(error.code(), "QUOTA_LIMIT_EXCEEDED");
        Ok(())
    }

    fn owned_field(name: &str, value: OwnedValue) -> OwnedField {
        OwnedField {
            name: name.to_owned(),
            value,
        }
    }

    #[test]
    fn detached_validation_enforces_hdoc_rules_and_limits() -> Result<(), Box<dyn Error>> {
        let duplicate = OwnedDocument {
            fields: vec![
                owned_field("_id", OwnedValue::Int32(1)),
                owned_field("_id", OwnedValue::Int32(2)),
            ],
        };
        assert_eq!(
            validate_import_document(&duplicate),
            Err(EncodeError::DuplicateField)
        );

        for value in [
            OwnedValue::Timestamp(TIMESTAMP_MAX + 1),
            OwnedValue::Date(DATE_MAX + 1),
            OwnedValue::VectorF32(Vec::new()),
            OwnedValue::VectorF32(vec![0x7f80_0000]),
            OwnedValue::VectorF16(Vec::new()),
            OwnedValue::VectorF16(vec![0x7c00]),
        ] {
            let document = OwnedDocument {
                fields: vec![
                    owned_field("_id", OwnedValue::Int32(1)),
                    owned_field("value", value),
                ],
            };
            assert!(validate_import_document(&document).is_err());
        }

        let binary_id = OwnedDocument {
            fields: vec![owned_field(
                "_id",
                OwnedValue::Binary {
                    subtype: 0,
                    bytes: vec![1],
                },
            )],
        };
        validate_import_document(&binary_id)?;

        let long_id = OwnedDocument {
            fields: vec![owned_field(
                "_id",
                OwnedValue::String("x".repeat(bounded_u64_to_usize(MAX_ID_PAYLOAD_BYTES + 1))),
            )],
        };
        assert!(validate_import_document(&long_id).is_err());

        let oversized = OwnedDocument {
            fields: vec![
                owned_field("_id", OwnedValue::Int32(1)),
                owned_field(
                    "large",
                    OwnedValue::String("x".repeat(bounded_u64_to_usize(MAX_CANONICAL_BYTES))),
                ),
            ],
        };
        assert!(validate_import_document(&oversized).is_err());
        assert_eq!(
            owned_payload_length(&OwnedValue::Array(Vec::new())),
            Err(EncodeError::ArithmeticOverflow)
        );

        let limit = enforce_json_import_bytes(bounded_u64_to_usize(MAX_JSON_IMPORT_BYTES + 1))
            .err()
            .ok_or(std::io::Error::other("oversized JSON accepted"))?;
        assert_eq!(limit.code(), "QUOTA_LIMIT_EXCEEDED");
        assert_eq!(limit.offset(), None);
        assert!(limit.source().is_none());
        assert_eq!(
            limit.to_string(),
            "QUOTA_LIMIT_EXCEEDED: command.expanded_bytes maximum 67108864, observed 67108865"
        );
        assert_eq!(
            JsonImportLimitId::ExpandedBytes.as_str(),
            "command.expanded_bytes"
        );

        let invalid_document = JsonImportError::from(EncodeError::MissingRootId);
        assert!(invalid_document.source().is_some());

        let mut total_fields = 0;
        assert!(add_owned_object_fields(&mut total_fields, MAX_OBJECT_FIELDS + 1).is_err());
        total_fields = MAX_DOCUMENT_FIELDS;
        assert!(add_owned_object_fields(&mut total_fields, 1).is_err());
        Ok(())
    }
}
// helix-coverage: exclude-end unit-tests

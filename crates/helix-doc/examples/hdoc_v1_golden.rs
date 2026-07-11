//! Creates missing immutable `HDoc` 1.0 fixtures or checks them without permitting overwrites.

#![allow(
    clippy::print_stderr,
    clippy::print_stdout,
    reason = "the command-line fixture checker reports a stable result or actionable failure"
)]

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use crc::{CRC_32_ISCSI, Crc};
use helix_doc::{
    CompressionMode, Decimal128, DecodeCheck, EncodeDocument, EncodeField, EncodeObject,
    EncodeOptions, EncodeValue, decode, encode_with_options,
};

const CRC32C: Crc<u32> = Crc::<u32>::new(&CRC_32_ISCSI);

#[derive(Clone, Copy)]
struct ExpectedError {
    code: &'static str,
    check: Option<DecodeCheck>,
}

struct GoldenCase {
    id: &'static str,
    bytes: Vec<u8>,
    expected_error: Option<ExpectedError>,
}

fn disabled() -> EncodeOptions {
    EncodeOptions {
        compression: CompressionMode::Disabled,
    }
}

fn encode_minimal() -> Result<Vec<u8>, String> {
    let fields = [EncodeField::new("_id", EncodeValue::Int32(1))];
    encode_with_options(EncodeDocument::new(&fields), disabled())
        .map(helix_doc::EncodedHDoc::into_bytes)
        .map_err(|error| error.to_string())
}

fn encode_all_types() -> Result<Vec<u8>, String> {
    let empty_fields = [];
    let nested_object_fields = [EncodeField::new("leaf", EncodeValue::String("value"))];
    let inner_array = [EncodeValue::Int32(7), EncodeValue::Null];
    let nested_array = [
        EncodeValue::Object(EncodeObject::new(&nested_object_fields)),
        EncodeValue::Array(&inner_array),
    ];
    let vector_f32 = [0x3f80_0000, 0x8000_0000, 1];
    let vector_f16 = [0x3c00, 0x8000, 1];
    let fields = [
        EncodeField::new("_id", EncodeValue::Uuid([0; 16])),
        EncodeField::new("null", EncodeValue::Null),
        EncodeField::new("bool", EncodeValue::Bool(true)),
        EncodeField::new("int32", EncodeValue::Int32(i32::MIN)),
        EncodeField::new("int64", EncodeValue::Int64(i64::MAX)),
        EncodeField::new("float64", EncodeValue::Float64Bits(0x7ff0_0000_0000_0001)),
        EncodeField::new(
            "decimal128",
            EncodeValue::Decimal128(Decimal128::Finite {
                negative: true,
                coefficient: 12_345,
                exponent: -2,
            }),
        ),
        EncodeField::new("string", EncodeValue::String("e\u{301}")),
        EncodeField::new("binary", EncodeValue::Binary(&[0, 0xff])),
        EncodeField::new(
            "empty_object",
            EncodeValue::Object(EncodeObject::new(&empty_fields)),
        ),
        EncodeField::new("nested", EncodeValue::Array(&nested_array)),
        EncodeField::new("timestamp", EncodeValue::Timestamp(-62_135_596_800_000_000)),
        EncodeField::new("date", EncodeValue::Date(2_932_896)),
        EncodeField::new("uuid", EncodeValue::Uuid([0xff; 16])),
        EncodeField::new("object_id", EncodeValue::ObjectId([0xff; 12])),
        EncodeField::new("vector_f32", EncodeValue::VectorF32(&vector_f32)),
        EncodeField::new("vector_f16", EncodeValue::VectorF16(&vector_f16)),
    ];
    encode_with_options(EncodeDocument::new(&fields), disabled())
        .map(helix_doc::EncodedHDoc::into_bytes)
        .map_err(|error| error.to_string())
}

fn encode_boundaries() -> Result<Vec<u8>, String> {
    let vector_f32 = [1, 0x8000_0000, 0x7f7f_ffff, 0xff7f_ffff];
    let vector_f16 = [1, 0x8000, 0x7bff, 0xfbff];
    let fields = [
        EncodeField::new("_id", EncodeValue::Int64(i64::MIN)),
        EncodeField::new("i32_min", EncodeValue::Int32(i32::MIN)),
        EncodeField::new("i32_max", EncodeValue::Int32(i32::MAX)),
        EncodeField::new("i64_min", EncodeValue::Int64(i64::MIN)),
        EncodeField::new("i64_max", EncodeValue::Int64(i64::MAX)),
        EncodeField::new(
            "f64_neg_zero",
            EncodeValue::Float64Bits(0x8000_0000_0000_0000),
        ),
        EncodeField::new(
            "f64_pos_inf",
            EncodeValue::Float64Bits(0x7ff0_0000_0000_0000),
        ),
        EncodeField::new(
            "f64_neg_inf",
            EncodeValue::Float64Bits(0xfff0_0000_0000_0000),
        ),
        EncodeField::new("f64_nan", EncodeValue::Float64Bits(0x7ff8_0000_0000_0001)),
        EncodeField::new(
            "decimal_neg_zero",
            EncodeValue::Decimal128(Decimal128::Zero { negative: true }),
        ),
        EncodeField::new(
            "decimal_min",
            EncodeValue::Decimal128(Decimal128::Finite {
                negative: false,
                coefficient: 1,
                exponent: -6_176,
            }),
        ),
        EncodeField::new(
            "decimal_max",
            EncodeValue::Decimal128(Decimal128::Finite {
                negative: false,
                coefficient: 9_999_999_999_999_999_999_999_999_999_999_999,
                exponent: 6_111,
            }),
        ),
        EncodeField::new(
            "decimal_pos_inf",
            EncodeValue::Decimal128(Decimal128::PositiveInfinity),
        ),
        EncodeField::new(
            "decimal_neg_inf",
            EncodeValue::Decimal128(Decimal128::NegativeInfinity),
        ),
        EncodeField::new("decimal_nan", EncodeValue::Decimal128(Decimal128::NaN)),
        EncodeField::new(
            "timestamp_min",
            EncodeValue::Timestamp(-62_135_596_800_000_000),
        ),
        EncodeField::new(
            "timestamp_max",
            EncodeValue::Timestamp(253_402_300_799_999_999),
        ),
        EncodeField::new("date_min", EncodeValue::Date(-719_162)),
        EncodeField::new("date_max", EncodeValue::Date(2_932_896)),
        EncodeField::new("unicode_\u{10ffff}", EncodeValue::String("\0é\u{10ffff}")),
        EncodeField::new(
            "binary_edges",
            EncodeValue::Binary(&[0, 1, 0x7f, 0x80, 0xff]),
        ),
        EncodeField::new("vector_f32", EncodeValue::VectorF32(&vector_f32)),
        EncodeField::new("vector_f16", EncodeValue::VectorF16(&vector_f16)),
    ];
    encode_with_options(EncodeDocument::new(&fields), disabled())
        .map(helix_doc::EncodedHDoc::into_bytes)
        .map_err(|error| error.to_string())
}

fn encode_compressed() -> Result<Vec<u8>, String> {
    let text = "compressible-HDoc-golden-vector-".repeat(4_096);
    let fields = [
        EncodeField::new("_id", EncodeValue::ObjectId([0x5a; 12])),
        EncodeField::new("payload", EncodeValue::String(&text)),
    ];
    encode_with_options(EncodeDocument::new(&fields), EncodeOptions::default())
        .map(helix_doc::EncodedHDoc::into_bytes)
        .map_err(|error| error.to_string())
}

fn put_u16(bytes: &mut [u8], offset: usize, value: u16) {
    bytes[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
}

fn put_u32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn put_u64(bytes: &mut [u8], offset: usize, value: u64) {
    bytes[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
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

fn refresh_checksum(bytes: &mut [u8]) {
    bytes[32..36].fill(0);
    let checksum = CRC32C.checksum(bytes);
    put_u32(bytes, 32, checksum);
}

fn mutate(base: &[u8], action: impl FnOnce(&mut [u8])) -> Vec<u8> {
    let mut bytes = base.to_vec();
    action(&mut bytes);
    refresh_checksum(&mut bytes);
    bytes
}

fn invalid(
    id: &'static str,
    bytes: Vec<u8>,
    code: &'static str,
    check: Option<DecodeCheck>,
) -> GoldenCase {
    GoldenCase {
        id,
        bytes,
        expected_error: Some(ExpectedError { code, check }),
    }
}

#[allow(
    clippy::too_many_lines,
    reason = "the frozen case inventory stays together so mutation construction and outcomes remain auditable"
)]
fn cases() -> Result<Vec<GoldenCase>, String> {
    let minimal = encode_minimal()?;
    let all_types = encode_all_types()?;
    let boundaries = encode_boundaries()?;
    let compressed = encode_compressed()?;
    let mut result = vec![
        GoldenCase {
            id: "positive-minimal",
            bytes: minimal.clone(),
            expected_error: None,
        },
        GoldenCase {
            id: "positive-all-types-nested",
            bytes: all_types.clone(),
            expected_error: None,
        },
        GoldenCase {
            id: "positive-boundary-values",
            bytes: boundaries,
            expected_error: None,
        },
        GoldenCase {
            id: "positive-compression-profile-1",
            bytes: compressed.clone(),
            expected_error: None,
        },
    ];

    let mut wrong_magic = minimal.clone();
    wrong_magic[0] ^= 0xff;
    result.push(invalid(
        "invalid-magic",
        wrong_magic,
        "CAP_FORMAT_UNSUPPORTED",
        None,
    ));
    result.push(invalid(
        "invalid-major-version",
        mutate(&minimal, |bytes| put_u16(bytes, 8, 2)),
        "CAP_UNSUPPORTED_VERSION",
        None,
    ));
    result.push(invalid(
        "invalid-minor-version",
        mutate(&minimal, |bytes| put_u16(bytes, 10, 1)),
        "CAP_UNSUPPORTED_VERSION",
        None,
    ));
    result.push(invalid(
        "invalid-document-flag",
        mutate(&minimal, |bytes| put_u32(bytes, 16, 2)),
        "CAP_FORMAT_UNSUPPORTED",
        Some(DecodeCheck::Feature),
    ));
    result.push(invalid(
        "invalid-required-feature",
        mutate(&minimal, |bytes| put_u64(bytes, 48, 2)),
        "CAP_FORMAT_UNSUPPORTED",
        Some(DecodeCheck::Feature),
    ));
    result.push(invalid(
        "invalid-optional-feature",
        mutate(&minimal, |bytes| put_u64(bytes, 56, 1)),
        "CAP_FORMAT_UNSUPPORTED",
        Some(DecodeCheck::Feature),
    ));
    result.push(invalid(
        "invalid-truncated-header",
        minimal[..63].to_vec(),
        "DUR_CORRUPTION",
        Some(DecodeCheck::Header),
    ));
    result.push(invalid(
        "invalid-truncated-body",
        minimal[..minimal.len() - 1].to_vec(),
        "DUR_CORRUPTION",
        Some(DecodeCheck::Length),
    ));
    let mut trailing = minimal.clone();
    trailing.push(0);
    result.push(invalid(
        "invalid-trailing-byte",
        trailing,
        "DUR_CORRUPTION",
        Some(DecodeCheck::Length),
    ));
    let mut checksum = minimal.clone();
    let first_section = read_u32(&checksum, 68) as usize;
    checksum[first_section] ^= 1;
    result.push(invalid(
        "invalid-body-checksum",
        checksum,
        "DUR_CORRUPTION",
        Some(DecodeCheck::Checksum),
    ));
    result.push(invalid(
        "invalid-directory-overlap",
        mutate(&minimal, |bytes| {
            let first = read_u32(bytes, 68);
            put_u32(bytes, 100, first);
        }),
        "DUR_CORRUPTION",
        Some(DecodeCheck::Directory),
    ));
    result.push(invalid(
        "invalid-section-version",
        mutate(&minimal, |bytes| put_u16(bytes, 88, 2)),
        "CAP_FORMAT_UNSUPPORTED",
        Some(DecodeCheck::Directory),
    ));
    result.push(invalid(
        "invalid-type-tag",
        mutate(&all_types, |bytes| {
            let field_table = read_u32(bytes, 68) as usize;
            bytes[field_table + 10] = 0xff;
        }),
        "DUR_CORRUPTION",
        Some(DecodeCheck::FieldTable),
    ));
    result.push(invalid(
        "invalid-footer-magic",
        mutate(&minimal, |bytes| {
            let footer = read_u32(bytes, 44) as usize;
            bytes[footer] ^= 1;
        }),
        "DUR_CORRUPTION",
        Some(DecodeCheck::Footer),
    ));
    result.push(invalid(
        "invalid-hash-profile",
        mutate(&minimal, |bytes| {
            let footer = read_u32(bytes, 44) as usize;
            put_u16(bytes, footer + 14, 2);
        }),
        "DUR_CORRUPTION",
        Some(DecodeCheck::Footer),
    ));
    result.push(invalid(
        "invalid-content-hash",
        mutate(&minimal, |bytes| {
            let footer = read_u32(bytes, 44) as usize;
            bytes[footer + 32] ^= 1;
        }),
        "DUR_CORRUPTION",
        Some(DecodeCheck::TypedContentHash),
    ));
    let compressed_entry = (0..usize::from(read_u16(&compressed, 36)))
        .map(|index| 64 + index * 32)
        .find(|offset| read_u16(&compressed, offset + 20) == 1)
        .ok_or_else(|| "compressed fixture did not select codec 1".to_string())?;
    result.push(invalid(
        "invalid-compression-codec",
        mutate(&compressed, |bytes| {
            put_u16(bytes, compressed_entry + 20, 2);
        }),
        "CAP_FORMAT_UNSUPPORTED",
        Some(DecodeCheck::CompressionHeader),
    ));
    result.push(invalid(
        "invalid-nonzero-padding",
        mutate(&minimal, |bytes| bytes[227] = 1),
        "DUR_CORRUPTION",
        Some(DecodeCheck::Directory),
    ));
    result.push(invalid(
        "invalid-field-count-limit",
        mutate(&minimal, |bytes| {
            let footer = read_u32(bytes, 44) as usize;
            put_u32(bytes, 28, 1_000_001);
            put_u32(bytes, footer + 28, 1_000_001);
        }),
        "DUR_CORRUPTION",
        Some(DecodeCheck::Limit),
    ));
    result.push(invalid(
        "invalid-compression-expansion-limit",
        mutate(&compressed, |bytes| {
            let section = read_u32(bytes, compressed_entry + 4) as usize;
            put_u32(bytes, section + 20, 16_777_217);
        }),
        "DUR_CORRUPTION",
        Some(DecodeCheck::CompressionHeader),
    ));
    Ok(result)
}

fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join("fixtures/hdoc/v1/cases")
}

fn verify_case(case: &GoldenCase) -> Result<(), String> {
    match (decode(&case.bytes), case.expected_error) {
        (Ok(_), None) => Ok(()),
        (Err(error), Some(expected))
            if error.code() == expected.code && error.check() == expected.check =>
        {
            Ok(())
        }
        (Ok(_), Some(_)) => Err(format!("{}: invalid case decoded", case.id)),
        (Err(error), None) => Err(format!("{}: positive case failed: {error}", case.id)),
        (Err(error), Some(expected)) => Err(format!(
            "{}: expected {} {:?}, observed {} {:?}",
            case.id,
            expected.code,
            expected.check,
            error.code(),
            error.check()
        )),
    }
}

fn reconcile(case: &GoldenCase, mode: &str, root: &Path) -> Result<(), String> {
    verify_case(case)?;
    let path = root.join(format!("{}.hdoc", case.id));
    if mode == "--write" && !path.exists() {
        fs::create_dir_all(root).map_err(|error| error.to_string())?;
        fs::write(&path, &case.bytes).map_err(|error| error.to_string())?;
        return Ok(());
    }
    let committed = fs::read(&path).map_err(|error| format!("{}: {error}", path.display()))?;
    if committed != case.bytes {
        return Err(format!(
            "{}: immutable fixture drift; add a new format version instead of overwriting",
            path.display()
        ));
    }
    Ok(())
}

fn run() -> Result<(), String> {
    let mode = env::args().nth(1).unwrap_or_else(|| "--check".to_string());
    if !matches!(mode.as_str(), "--check" | "--write") || env::args().nth(2).is_some() {
        return Err(
            "usage: cargo run -p helix-doc --example hdoc_v1_golden -- [--check|--write]"
                .to_string(),
        );
    }
    let cases = cases()?;
    let root = fixture_root();
    for case in &cases {
        reconcile(case, &mode, &root)?;
    }
    let positives = cases
        .iter()
        .filter(|case| case.expected_error.is_none())
        .count();
    println!(
        "PASS immutable HDoc 1.0 fixtures: {} positive, {} invalid, no overwrites",
        positives,
        cases.len() - positives
    );
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

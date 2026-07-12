//! Runs bounded, correctness-checked `HDoc` codec and lookup measurements over fixed shapes.

#![allow(
    clippy::print_stdout,
    reason = "the benchmark engine emits one machine-readable JSON report on stdout"
)]

use std::error::Error;
use std::hint::black_box;
use std::time::Instant;

use helix_doc::{
    CompressionMode, Decimal128, EncodeDocument, EncodeField, EncodeObject, EncodeOptions,
    EncodeValue, PathDictionaryInput, PathDictionaryInputEntry, ValueType, decode,
    encode_path_dictionary, encode_with_options,
};

const WARMUPS: usize = 5;
const MEASUREMENTS: usize = 20;
const ITERATIONS: usize = 16;
const DICTIONARY_DOCUMENTS: u64 = 10_000;

struct OperationResult {
    id: &'static str,
    durations_ns: Vec<u64>,
    checksum: u64,
}

struct DictionaryModel {
    path_count: usize,
    documents: u64,
    snapshot_bytes: u64,
    raw_name_reference_bytes: u64,
    id_reference_bytes: u64,
    amortized_dictionary_bytes: u64,
    savings_bytes: i64,
    savings_basis_points: i64,
}

struct ShapeResult {
    id: &'static str,
    root_fields: usize,
    recursive_fields: u32,
    path_depth: usize,
    expected_path_candidates: usize,
    base_bytes: usize,
    canonical_stored_bytes: usize,
    canonical_logical_bytes: u32,
    tagged_json_bytes: usize,
    compressed_sections: u8,
    dictionary: DictionaryModel,
    operations: Vec<OperationResult>,
}

fn disabled() -> EncodeOptions {
    EncodeOptions {
        compression: CompressionMode::Disabled,
    }
}

fn measure<F>(id: &'static str, mut operation: F) -> Result<OperationResult, String>
where
    F: FnMut() -> Result<u64, String>,
{
    let mut checksum = 0_u64;
    for _ in 0..WARMUPS {
        for _ in 0..ITERATIONS {
            checksum = checksum.wrapping_add(black_box(operation()?));
        }
    }
    let mut durations_ns = Vec::with_capacity(MEASUREMENTS);
    for _ in 0..MEASUREMENTS {
        let start = Instant::now();
        for _ in 0..ITERATIONS {
            checksum = checksum.wrapping_add(black_box(operation()?));
        }
        let elapsed = u64::try_from(start.elapsed().as_nanos()).unwrap_or(u64::MAX);
        durations_ns.push(elapsed.max(1));
    }
    Ok(OperationResult {
        id,
        durations_ns,
        checksum,
    })
}

fn dictionary_model(paths: &[&str]) -> Result<DictionaryModel, String> {
    let entries = paths
        .iter()
        .enumerate()
        .map(|(index, path)| PathDictionaryInputEntry {
            path_id: u32::try_from(index + 1).unwrap_or(u32::MAX),
            introduced_version: 1,
            path,
        })
        .collect::<Vec<_>>();
    let snapshot = encode_path_dictionary(PathDictionaryInput {
        dictionary_id: [0x42; 16],
        version: 1,
        entries: &entries,
    })
    .map_err(|error| error.to_string())?;
    let path_bytes = paths.iter().try_fold(0_u64, |total, path| {
        u64::try_from(path.len())
            .ok()
            .and_then(|length| total.checked_add(length))
            .ok_or_else(|| "dictionary raw-name byte overflow".to_owned())
    })?;
    let raw_name_reference_bytes = path_bytes
        .checked_mul(DICTIONARY_DOCUMENTS)
        .ok_or_else(|| "dictionary raw-name multiplication overflow".to_owned())?;
    let id_reference_bytes = u64::try_from(paths.len())
        .unwrap_or(u64::MAX)
        .checked_mul(4)
        .and_then(|bytes| bytes.checked_mul(DICTIONARY_DOCUMENTS))
        .ok_or_else(|| "dictionary ID-reference multiplication overflow".to_owned())?;
    let snapshot_bytes = u64::try_from(snapshot.as_bytes().len()).unwrap_or(u64::MAX);
    let amortized_dictionary_bytes = snapshot_bytes
        .checked_add(id_reference_bytes)
        .ok_or_else(|| "dictionary total byte overflow".to_owned())?;
    let raw_signed = i64::try_from(raw_name_reference_bytes)
        .map_err(|_| "dictionary raw-name signed conversion".to_owned())?;
    let dictionary_signed = i64::try_from(amortized_dictionary_bytes)
        .map_err(|_| "dictionary total signed conversion".to_owned())?;
    let savings_bytes = raw_signed - dictionary_signed;
    let savings_basis_points = if raw_name_reference_bytes == 0 {
        0
    } else {
        i64::try_from(i128::from(savings_bytes) * 10_000 / i128::from(raw_name_reference_bytes))
            .map_err(|_| "dictionary basis-point conversion".to_owned())?
    };
    Ok(DictionaryModel {
        path_count: paths.len(),
        documents: DICTIONARY_DOCUMENTS,
        snapshot_bytes,
        raw_name_reference_bytes,
        id_reference_bytes,
        amortized_dictionary_bytes,
        savings_bytes,
        savings_basis_points,
    })
}

fn benchmark_shape(
    id: &'static str,
    document: EncodeDocument<'_>,
    direct_field: &str,
    path: &str,
    expected_path_candidates: usize,
    dictionary_paths: &[&str],
) -> Result<ShapeResult, String> {
    let base = encode_with_options(document, disabled()).map_err(|error| error.to_string())?;
    let canonical = encode_with_options(document, EncodeOptions::default())
        .map_err(|error| error.to_string())?;
    if base.content_hash() != canonical.content_hash()
        || base.canonical_length() != canonical.canonical_length()
    {
        return Err(format!("{id}: base/canonical identity mismatch"));
    }
    let decoded = decode(canonical.as_bytes()).map_err(|error| error.to_string())?;
    let view = decoded.view();
    let direct_type = view
        .get(direct_field)
        .ok_or_else(|| format!("{id}: direct field absent"))?
        .value_type();
    let candidates = view
        .lookup_path_text(path)
        .map_err(|error| error.to_string())?;
    if candidates.len() != expected_path_candidates {
        return Err(format!("{id}: path candidate count mismatch"));
    }
    let path_depth = path.split('.').count();
    let recursive_fields = decoded.field_count();
    let tagged_json_bytes = view.to_canonical_tagged_json().len();
    let base_bytes = base.as_bytes().len();
    let canonical_stored_bytes = canonical.as_bytes().len();
    let canonical_logical_bytes = canonical.canonical_length();
    let compressed_sections = canonical.compressed_section_count();

    let mut operations = Vec::new();
    operations.push(measure("encode_base", || {
        let encoded =
            encode_with_options(document, disabled()).map_err(|error| error.to_string())?;
        Ok(u64::try_from(encoded.as_bytes().len()).unwrap_or(u64::MAX)
            ^ u64::from(encoded.content_hash()[0]))
    })?);
    operations.push(measure("encode_canonical", || {
        let encoded = encode_with_options(document, EncodeOptions::default())
            .map_err(|error| error.to_string())?;
        Ok(u64::try_from(encoded.as_bytes().len()).unwrap_or(u64::MAX)
            ^ u64::from(encoded.content_hash()[0]))
    })?);
    operations.push(measure("decode_base", || {
        let value = decode(base.as_bytes()).map_err(|error| error.to_string())?;
        Ok(u64::from(value.field_count()) ^ u64::from(value.content_hash()[0]))
    })?);
    operations.push(measure("decode_canonical", || {
        let value = decode(canonical.as_bytes()).map_err(|error| error.to_string())?;
        Ok(u64::from(value.field_count()) ^ u64::from(value.content_hash()[0]))
    })?);
    operations.push(measure("field_lookup", || {
        let value = view
            .get(direct_field)
            .ok_or_else(|| format!("{id}: measured direct field absent"))?;
        Ok(u64::from(value.value_type().hdoc_tag()))
    })?);
    operations.push(measure("path_lookup", || {
        let values = view
            .lookup_path_text(path)
            .map_err(|error| error.to_string())?;
        let mut checksum = u64::try_from(values.len()).unwrap_or(u64::MAX);
        for candidate in values {
            checksum = checksum.wrapping_add(u64::from(candidate.value().value_type().hdoc_tag()));
        }
        Ok(checksum)
    })?);

    if operations.iter().any(|operation| {
        operation.durations_ns.len() != MEASUREMENTS
            || operation.durations_ns.contains(&0)
            || operation.checksum == 0
    }) {
        return Err(format!("{id}: incomplete or unverified measurement"));
    }
    if direct_type == ValueType::Null && direct_field != "explicit_null" {
        return Err(format!("{id}: unexpected direct null"));
    }

    Ok(ShapeResult {
        id,
        root_fields: document.fields.len(),
        recursive_fields,
        path_depth,
        expected_path_candidates,
        base_bytes,
        canonical_stored_bytes,
        canonical_logical_bytes,
        tagged_json_bytes,
        compressed_sections,
        dictionary: dictionary_model(dictionary_paths)?,
        operations,
    })
}

fn operation_json(operation: &OperationResult) -> String {
    let durations = operation
        .durations_ns
        .iter()
        .map(u64::to_string)
        .collect::<Vec<_>>()
        .join(",");
    format!(
        "{{\"id\":\"{}\",\"iterations_per_sample\":{ITERATIONS},\"durations_ns\":[{durations}],\"checksum\":{}}}",
        operation.id, operation.checksum
    )
}

fn shape_json(shape: &ShapeResult) -> String {
    let operations = shape
        .operations
        .iter()
        .map(operation_json)
        .collect::<Vec<_>>()
        .join(",");
    let dictionary = &shape.dictionary;
    format!(
        concat!(
            "{{\"id\":\"{}\",\"root_fields\":{},\"recursive_fields\":{},",
            "\"path_depth\":{},\"expected_path_candidates\":{},",
            "\"sizes\":{{\"base_bytes\":{},\"canonical_stored_bytes\":{},",
            "\"canonical_logical_bytes\":{},\"tagged_json_bytes\":{},",
            "\"compressed_sections\":{}}},",
            "\"dictionary_model\":{{\"basis\":\"snapshot-plus-u32-path-id-per-reference\",",
            "\"path_count\":{},\"documents\":{},\"snapshot_bytes\":{},",
            "\"raw_name_reference_bytes\":{},\"id_reference_bytes\":{},",
            "\"amortized_dictionary_bytes\":{},\"savings_bytes\":{},",
            "\"savings_basis_points\":{}}},\"operations\":[{}]}}"
        ),
        shape.id,
        shape.root_fields,
        shape.recursive_fields,
        shape.path_depth,
        shape.expected_path_candidates,
        shape.base_bytes,
        shape.canonical_stored_bytes,
        shape.canonical_logical_bytes,
        shape.tagged_json_bytes,
        shape.compressed_sections,
        dictionary.path_count,
        dictionary.documents,
        dictionary.snapshot_bytes,
        dictionary.raw_name_reference_bytes,
        dictionary.id_reference_bytes,
        dictionary.amortized_dictionary_bytes,
        dictionary.savings_bytes,
        dictionary.savings_basis_points,
        operations,
    )
}

#[allow(
    clippy::too_many_lines,
    reason = "the five benchmark shapes remain together so their fixed inputs are reviewable"
)]
fn run() -> Result<Vec<ShapeResult>, String> {
    let mut results = Vec::new();

    let minimal_fields = [EncodeField::new("_id", EncodeValue::Int32(1))];
    results.push(benchmark_shape(
        "minimal",
        EncodeDocument::new(&minimal_fields),
        "_id",
        "_id",
        1,
        &["_id"],
    )?);

    let vector = [0x3f80_0000, 0x4000_0000, 0x4040_0000, 0x4080_0000];
    let mixed_fields = [
        EncodeField::new("_id", EncodeValue::Uuid([0x11; 16])),
        EncodeField::new("active", EncodeValue::Bool(true)),
        EncodeField::new("count", EncodeValue::Int64(9_223_372_036_854_775)),
        EncodeField::new("ratio", EncodeValue::Float64Bits(0x3fef_ffff_ffff_ffff)),
        EncodeField::new(
            "amount",
            EncodeValue::Decimal128(Decimal128::Finite {
                negative: false,
                coefficient: 123_456_789,
                exponent: -4,
            }),
        ),
        EncodeField::new("title", EncodeValue::String("hélice-数据库")),
        EncodeField::new("payload", EncodeValue::Binary(&[0, 1, 2, 3, 0xfe, 0xff])),
        EncodeField::new("created", EncodeValue::Timestamp(1_700_000_000_000_000)),
        EncodeField::new("day", EncodeValue::Date(19_675)),
        EncodeField::new("object_id", EncodeValue::ObjectId([0x22; 12])),
        EncodeField::new("embedding", EncodeValue::VectorF32(&vector)),
        EncodeField::new("explicit_null", EncodeValue::Null),
    ];
    results.push(benchmark_shape(
        "mixed_types",
        EncodeDocument::new(&mixed_fields),
        "embedding",
        "embedding",
        1,
        &[
            "_id",
            "active",
            "count",
            "ratio",
            "amount",
            "title",
            "payload",
            "created",
            "day",
            "object_id",
            "embedding",
            "explicit_null",
        ],
    )?);

    let item_fields = [
        EncodeField::new("sku", EncodeValue::String("SKU-000042")),
        EncodeField::new("price", EncodeValue::Int64(12_345)),
        EncodeField::new(
            "description",
            EncodeValue::String("representative nested item"),
        ),
    ];
    let item = EncodeValue::Object(EncodeObject::new(&item_fields));
    let items = [item; 16];
    let metadata_fields = [
        EncodeField::new("region", EncodeValue::String("eu-west")),
        EncodeField::new("revision", EncodeValue::Int32(7)),
    ];
    let nested_fields = [
        EncodeField::new("_id", EncodeValue::ObjectId([0x33; 12])),
        EncodeField::new("owner", EncodeValue::String("benchmark-owner")),
        EncodeField::new("items", EncodeValue::Array(&items)),
        EncodeField::new(
            "metadata",
            EncodeValue::Object(EncodeObject::new(&metadata_fields)),
        ),
    ];
    results.push(benchmark_shape(
        "nested_fanout",
        EncodeDocument::new(&nested_fields),
        "owner",
        "items.price",
        16,
        &[
            "_id",
            "owner",
            "items",
            "items.sku",
            "items.price",
            "items.description",
            "metadata",
            "metadata.region",
            "metadata.revision",
        ],
    )?);

    let wide_names = (0..127)
        .map(|index| format!("field_{index:03}_representative"))
        .collect::<Vec<_>>();
    let mut wide_fields = Vec::with_capacity(128);
    wide_fields.push(EncodeField::new("_id", EncodeValue::Int64(4)));
    for (index, name) in wide_names.iter().enumerate() {
        wide_fields.push(EncodeField::new(
            name,
            EncodeValue::Int64(i64::try_from(index).unwrap_or(i64::MAX)),
        ));
    }
    let mut wide_paths = Vec::with_capacity(128);
    wide_paths.push("_id");
    wide_paths.extend(wide_names.iter().map(String::as_str));
    results.push(benchmark_shape(
        "wide_128",
        EncodeDocument::new(&wide_fields),
        "field_126_representative",
        "field_126_representative",
        1,
        &wide_paths,
    )?);

    let repeated = "helix-compressible-payload-".repeat(1_280);
    let compressible_fields = [
        EncodeField::new("_id", EncodeValue::Int64(5)),
        EncodeField::new("category", EncodeValue::String("compressible")),
        EncodeField::new("payload", EncodeValue::String(&repeated)),
    ];
    results.push(benchmark_shape(
        "compressible_32k",
        EncodeDocument::new(&compressible_fields),
        "payload",
        "payload",
        1,
        &["_id", "category", "payload"],
    )?);

    Ok(results)
}

fn main() -> Result<(), Box<dyn Error>> {
    let results = run().map_err(|message| -> Box<dyn Error> { message.into() })?;
    let shapes = results.iter().map(shape_json).collect::<Vec<_>>().join(",");
    println!(
        "{{\"schema\":\"helix.hdoc-benchmark-engine/1\",\"warmups\":{WARMUPS},\"measurements\":{MEASUREMENTS},\"iterations_per_sample\":{ITERATIONS},\"shape_count\":{},\"operation_count_per_shape\":6,\"shapes\":[{shapes}],\"verdict\":\"pass\"}}",
        results.len()
    );
    Ok(())
}

//! Deterministic property and mutation suites for the complete `HDoc` codec boundary.

#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_possible_wrap,
    clippy::panic,
    reason = "bounded deterministic test seeds deliberately project random words and panic with the replay seed"
)]

use crc::{CRC_32_ISCSI, Crc};

use super::{
    CompressionMode, Decimal128, EncodeDocument, EncodeField, EncodeObject, EncodeOptions,
    EncodeValue, decode, encode_with_options,
};
use crate::tagged_json::import_tagged_json;

const CRC32C: Crc<u32> = Crc::<u32>::new(&CRC_32_ISCSI);
const GENERATED_CASES: u64 = 512;

struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    const fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut value = self.state;
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        value ^ (value >> 31)
    }

    fn bytes<const N: usize>(&mut self) -> [u8; N] {
        let mut output = [0_u8; N];
        for chunk in output.chunks_mut(8) {
            let word = self.next().to_le_bytes();
            chunk.copy_from_slice(&word[..chunk.len()]);
        }
        output
    }
}

fn disabled() -> EncodeOptions {
    EncodeOptions {
        compression: CompressionMode::Disabled,
    }
}

fn refresh_crc(bytes: &mut [u8]) {
    bytes[32..36].fill(0);
    let checksum = CRC32C.checksum(bytes);
    bytes[32..36].copy_from_slice(&checksum.to_le_bytes());
}

fn with_generated_document(seed: u64, callback: &mut dyn FnMut(EncodeDocument<'_>)) {
    let mut random = SplitMix64::new(seed ^ 0x4844_4f43_5030_3331);
    let identifier = random.bytes::<12>();
    let uuid = random.bytes::<16>();
    let binary = random.bytes::<31>();
    let text = format!(
        "seed-{seed:016x}-{}",
        "compressible-property-value-".repeat((seed as usize % 9) + 1)
    );
    let dynamic_name = format!("field_{:08x}", random.next() as u32);
    let nested_name = format!("nested_{:08x}", random.next() as u32);
    let float_bits = random.next() & 0xffef_ffff_ffff_ffff;
    let vector_f32 = [
        random.next() as u32 & 0x7f7f_ffff,
        random.next() as u32 & 0xff7f_ffff,
        1,
    ];
    let vector_f16 = [
        random.next() as u16 & 0x7bff,
        random.next() as u16 & 0xfbff,
        1,
    ];
    let nested_fields = [
        EncodeField::new("leaf", EncodeValue::String(&text)),
        EncodeField::new(
            &nested_name,
            EncodeValue::Int64(i64::from_le_bytes(random.next().to_le_bytes())),
        ),
    ];
    let array = [
        EncodeValue::Null,
        EncodeValue::Bool(seed & 1 != 0),
        EncodeValue::Object(EncodeObject::new(&nested_fields)),
    ];
    let coefficient = u128::from(random.next() % 999_999_999) + 1;
    let fields = [
        EncodeField::new("_id", EncodeValue::ObjectId(identifier)),
        EncodeField::new(&dynamic_name, EncodeValue::String(&text)),
        EncodeField::new("binary", EncodeValue::Binary(&binary)),
        EncodeField::new("array", EncodeValue::Array(&array)),
        EncodeField::new("int32", EncodeValue::Int32(random.next() as i32)),
        EncodeField::new(
            "int64",
            EncodeValue::Int64(i64::from_le_bytes(random.next().to_le_bytes())),
        ),
        EncodeField::new("float64", EncodeValue::Float64Bits(float_bits)),
        EncodeField::new(
            "decimal128",
            EncodeValue::Decimal128(Decimal128::Finite {
                negative: seed & 2 != 0,
                coefficient,
                exponent: i32::try_from(seed % 201).unwrap_or(0) - 100,
            }),
        ),
        EncodeField::new("timestamp", EncodeValue::Timestamp((seed as i64) - 256)),
        EncodeField::new("date", EncodeValue::Date((seed as i32) - 256)),
        EncodeField::new("uuid", EncodeValue::Uuid(uuid)),
        EncodeField::new("vector_f32", EncodeValue::VectorF32(&vector_f32)),
        EncodeField::new("vector_f16", EncodeValue::VectorF16(&vector_f16)),
    ];
    callback(EncodeDocument::new(&fields));
}

#[test]
fn deterministic_generated_round_trip_property() {
    for seed in 0..GENERATED_CASES {
        with_generated_document(seed, &mut |document| {
            let compressed = encode_with_options(document, EncodeOptions::default())
                .unwrap_or_else(|error| panic!("seed {seed}: compressed encode: {error}"));
            let uncompressed = encode_with_options(document, disabled())
                .unwrap_or_else(|error| panic!("seed {seed}: base encode: {error}"));
            let compressed_view = decode(compressed.as_bytes())
                .unwrap_or_else(|error| panic!("seed {seed}: compressed decode: {error}"));
            let base_view = decode(uncompressed.as_bytes())
                .unwrap_or_else(|error| panic!("seed {seed}: base decode: {error}"));
            assert_eq!(
                compressed.content_hash(),
                uncompressed.content_hash(),
                "seed {seed}"
            );
            assert_eq!(
                compressed_view.content_hash(),
                base_view.content_hash(),
                "seed {seed}"
            );
            assert_eq!(
                compressed_view.to_owned_document(),
                base_view.to_owned_document(),
                "seed {seed}"
            );
            assert_eq!(
                compressed_view.view().to_canonical_tagged_json(),
                base_view.view().to_canonical_tagged_json(),
                "seed {seed}"
            );
        });
    }
}

#[test]
fn presentation_permutations_preserve_canonical_identity() {
    for seed in 0..256_u64 {
        let identifier = seed.to_le_bytes();
        let id = [
            identifier[0],
            identifier[1],
            identifier[2],
            identifier[3],
            identifier[4],
            identifier[5],
            identifier[6],
            identifier[7],
            0xa5,
            0x5a,
            0xc3,
            0x3c,
        ];
        let first = [
            EncodeField::new("_id", EncodeValue::ObjectId(id)),
            EncodeField::new("alpha", EncodeValue::Int64(seed as i64)),
            EncodeField::new("omega", EncodeValue::Bool(seed & 1 != 0)),
        ];
        let second = [first[2], first[0], first[1]];
        let left = encode_with_options(EncodeDocument::new(&first), disabled())
            .unwrap_or_else(|error| panic!("seed {seed}: first: {error}"));
        let right = encode_with_options(EncodeDocument::new(&second), disabled())
            .unwrap_or_else(|error| panic!("seed {seed}: second: {error}"));
        assert_ne!(left.as_bytes(), right.as_bytes(), "seed {seed}");
        assert_eq!(left.content_hash(), right.content_hash(), "seed {seed}");
        let left_view = decode(left.as_bytes()).unwrap_or_else(|error| panic!("{error}"));
        let right_view = decode(right.as_bytes()).unwrap_or_else(|error| panic!("{error}"));
        for name in ["_id", "alpha", "omega"] {
            assert_eq!(
                left_view
                    .view()
                    .get(name)
                    .map(super::ValueView::to_canonical_tagged_json),
                right_view
                    .view()
                    .get(name)
                    .map(super::ValueView::to_canonical_tagged_json),
                "seed {seed}: {name}"
            );
        }
    }
}

#[test]
fn malformed_prefix_suffix_and_byte_mutation_corpus_rejects() {
    const FIXTURES: [&[u8]; 4] = [
        include_bytes!("../../../fixtures/hdoc/v1/cases/positive-minimal.hdoc"),
        include_bytes!("../../../fixtures/hdoc/v1/cases/positive-all-types-nested.hdoc"),
        include_bytes!("../../../fixtures/hdoc/v1/cases/positive-boundary-values.hdoc"),
        include_bytes!("../../../fixtures/hdoc/v1/cases/positive-compression-profile-1.hdoc"),
    ];
    for fixture in FIXTURES {
        assert!(decode(fixture).is_ok());
        for length in 0..fixture.len() {
            assert!(
                decode(&fixture[..length]).is_err(),
                "accepted prefix {length}"
            );
        }
        let mut trailing = fixture.to_vec();
        trailing.push(0);
        assert!(decode(&trailing).is_err());
        for offset in (0..fixture.len()).step_by(7) {
            let mut mutation = fixture.to_vec();
            mutation[offset] ^= 0x80;
            assert!(
                decode(&mutation).is_err(),
                "accepted byte mutation {offset}"
            );
        }
    }
}

#[test]
fn checksum_repaired_single_bit_mutation_property() {
    let fixture = include_bytes!("../../../fixtures/hdoc/v1/cases/positive-minimal.hdoc");
    for offset in 0..fixture.len() {
        if (32..36).contains(&offset) {
            continue;
        }
        for bit in 0..8 {
            let mut mutation = fixture.to_vec();
            mutation[offset] ^= 1 << bit;
            refresh_crc(&mut mutation);
            assert!(
                decode(&mutation).is_err(),
                "accepted checksum-repaired mutation at {offset} bit {bit}"
            );
        }
    }
}

#[test]
fn tagged_json_generated_canonicalization_property() {
    for seed in 0..GENERATED_CASES {
        with_generated_document(seed, &mut |document| {
            let encoded = encode_with_options(document, disabled())
                .unwrap_or_else(|error| panic!("seed {seed}: encode: {error}"));
            let decoded = decode(encoded.as_bytes())
                .unwrap_or_else(|error| panic!("seed {seed}: decode: {error}"));
            let canonical = decoded.view().to_canonical_tagged_json();
            let imported = import_tagged_json(&format!(" \n\t{canonical}\r "))
                .unwrap_or_else(|error| panic!("seed {seed}: import: {error}"));
            assert_eq!(
                imported.to_canonical_tagged_json(),
                canonical,
                "seed {seed}"
            );
            assert_eq!(imported, decoded.to_owned_document(), "seed {seed}");
        });
    }
}

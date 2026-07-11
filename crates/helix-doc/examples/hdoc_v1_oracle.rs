//! Emits production-Rust logical values and hashes for immutable positive `HDoc` 1.0 fixtures.

#![allow(
    clippy::print_stderr,
    clippy::print_stdout,
    reason = "the cross-language fixture oracle writes one deterministic JSON report to stdout"
)]

use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use helix_doc::decode;

const CASE_IDS: [&str; 4] = [
    "positive-minimal",
    "positive-all-types-nested",
    "positive-boundary-values",
    "positive-compression-profile-1",
];

fn hex(bytes: &[u8]) -> Result<String, String> {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(output, "{byte:02x}").map_err(|error| error.to_string())?;
    }
    Ok(output)
}

fn run() -> Result<String, String> {
    let fixture_root = Path::new("fixtures/hdoc/v1/cases");
    let mut output = String::from("{\"schema\":\"helix.hdoc-rust-golden-reader/1\",\"cases\":[");
    for (index, id) in CASE_IDS.iter().enumerate() {
        let path = fixture_root.join(format!("{id}.hdoc"));
        let bytes = fs::read(&path).map_err(|error| format!("{}: {error}", path.display()))?;
        let decoded = decode(&bytes).map_err(|error| format!("{id}: {error}"))?;
        if index != 0 {
            output.push(',');
        }
        write!(
            output,
            "{{\"id\":\"{id}\",\"storedLength\":{},\"canonicalLength\":{},\"fieldCount\":{},\"contentHashHex\":\"{}\",\"logicalValue\":{}}}",
            decoded.as_bytes().len(),
            decoded.canonical_length(),
            decoded.field_count(),
            hex(decoded.content_hash())?,
            decoded.view().to_canonical_tagged_json(),
        )
        .map_err(|error| error.to_string())?;
    }
    output.push_str("]}");
    Ok(output)
}

fn main() {
    match run() {
        Ok(report) => println!("{report}"),
        Err(error) => {
            eprintln!("FAIL HDoc Rust golden reader: {error}");
            std::process::exit(1);
        }
    }
}

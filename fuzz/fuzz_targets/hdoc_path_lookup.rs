#![no_main]

use helix_doc::{FieldPath, decode};
use libfuzzer_sys::fuzz_target;

const DOCUMENT: &[u8] =
    include_bytes!("../../fixtures/hdoc/v1/cases/positive-all-types-nested.hdoc");

fuzz_target!(|bytes: &[u8]| {
    let document = decode(DOCUMENT).expect("the immutable seed document must decode");
    if let Ok(text) = std::str::from_utf8(bytes) {
        if let Ok(path) = FieldPath::parse(text) {
            if let Ok(candidates) = document.view().lookup_path(path) {
                for candidate in candidates {
                    let _ = candidate.value().to_canonical_tagged_json();
                    let _ = candidate.array_positions();
                }
            }
        }
    }
});

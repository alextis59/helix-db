#![no_main]

use helix_doc::import_tagged_json;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|bytes: &[u8]| {
    if let Ok(text) = std::str::from_utf8(bytes) {
        if let Ok(document) = import_tagged_json(text) {
            let canonical = document.to_canonical_tagged_json();
            let reparsed = import_tagged_json(&canonical)
                .expect("canonical tagged rendering must always import");
            assert_eq!(reparsed, document);
        }
    }
});

#![no_main]

use helix_doc::decode;
use libfuzzer_sys::fuzz_target;

fuzz_target!(|bytes: &[u8]| {
    if let Ok(document) = decode(bytes) {
        let _ = document.view().to_canonical_tagged_json();
        let _ = document.to_owned_document();
    }
});

#![no_main]

use helix_doc::{EncodeDocument, EncodeField, EncodeValue, decode, encode};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|bytes: &[u8]| {
    let mut identifier = [0_u8; 12];
    let copied = bytes.len().min(identifier.len());
    identifier[..copied].copy_from_slice(&bytes[..copied]);
    let text = String::from_utf8_lossy(bytes);
    let fields = [
        EncodeField::new("_id", EncodeValue::ObjectId(identifier)),
        EncodeField::new("payload", EncodeValue::String(&text)),
        EncodeField::new("binary", EncodeValue::Binary(bytes)),
    ];
    if let Ok(encoded) = encode(EncodeDocument::new(&fields)) {
        let decoded = decode(encoded.as_bytes()).expect("encoder output must always decode");
        assert_eq!(decoded.content_hash(), encoded.content_hash());
    }
});

#![no_main]

use helix_doc::{HDocMigrationTarget, assess_hdoc_migration};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|bytes: &[u8]| {
    let major = bytes.first().copied().map_or(1, u16::from);
    let minor = bytes.get(1).copied().map_or(0, u16::from);
    let source = bytes.get(2..).unwrap_or_default();
    let _ = assess_hdoc_migration(source, HDocMigrationTarget::new(major, minor));
});

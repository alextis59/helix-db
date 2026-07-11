//! Minimal native toolchain example for the boundary-only host crate.
//!
//! This executable links the real workspace crate graph and emits a machine-readable maturity
//! report. It does not create, open, query, persist, or serve a database.

use std::process::ExitCode;

const CLAIM_BOUNDARY: &str = "This example proves native Rust linking only; database document, query, storage, durability, GPU, network, compatibility, security, and release functionality is not implemented.";

#[allow(
    clippy::print_stdout,
    reason = "the executable contract is a single machine-readable stdout report"
)]
fn main() -> ExitCode {
    if helix_host_native::COMPONENT_NAME != "helix-host-native"
        || helix_host_native::MATURITY != "boundary-skeleton"
        || helix_host_native::INTERNAL_DEPENDENCIES != ["helix-core"]
    {
        return ExitCode::FAILURE;
    }

    let architecture = std::env::consts::ARCH;
    let operating_system = std::env::consts::OS;
    println!(
        r#"{{"schema":"helix.native-toolchain-example/1","plan_item":"P02-016","example":"native-toolchain","component":{{"name":"helix-host-native","maturity":"boundary-skeleton","required_dependencies":["helix-core"]}},"target":{{"architecture":"{architecture}","operating_system":"{operating_system}"}},"database_functionality":false,"operations":[],"claim_boundary":"{CLAIM_BOUNDARY}"}}"#
    );
    ExitCode::SUCCESS
}

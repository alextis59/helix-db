//! Native observational benchmark for the four Phase 4 boundary transport strategies.

use std::hint::black_box;
use std::io::{self, Write};
use std::time::Instant;

use helix_core::explicit_copy::{ImmutableBuffer, MutableStagingBuffer};
use helix_core::transport_alternatives::{HostOwnedHandleStore, SharedStagingPrototype};

const BYTES: usize = 64 * 1024;
const BYTES_U32: u32 = 64 * 1024;
const BYTES_U64: u64 = 64 * 1024;
const CHUNK: usize = 64;
const CHUNK_U32: u32 = 64;
const CHATTY_ITERATIONS: usize = 1;
const COARSE_ITERATIONS: usize = 256;
const WARMUPS: usize = 5;
const MEASUREMENTS: usize = 20;

fn source() -> Result<ImmutableBuffer, String> {
    let bytes: Vec<u8> = (0..BYTES)
        .map(|index| u8::try_from((index * 31 + 17) & 0xff).unwrap_or(0))
        .collect();
    let mut staging =
        MutableStagingBuffer::allocate(BYTES_U64).map_err(|error| format!("{error:?}"))?;
    staging
        .write(0, &bytes)
        .map_err(|error| format!("{error:?}"))?;
    staging
        .seal(BYTES_U64)
        .map_err(|error| format!("{error:?}"))
}

fn checksum(bytes: &[u8]) -> u32 {
    bytes.iter().fold(0x811c_9dc5, |hash, byte| {
        (hash ^ u32::from(*byte)).wrapping_mul(0x0100_0193)
    })
}

fn execute(strategy: &str, source: &ImmutableBuffer) -> Result<Vec<u8>, String> {
    let output = match strategy {
        "chatty" => {
            let mut output = Vec::with_capacity(BYTES);
            for offset in (0..BYTES_U32).step_by(CHUNK) {
                output.extend(
                    source
                        .read(u64::from(offset), CHUNK_U32)
                        .map_err(|error| format!("{error:?}"))?
                        .bytes,
                );
            }
            output
        }
        "batched-copy" => {
            source
                .read(0, BYTES_U32)
                .map_err(|error| format!("{error:?}"))?
                .bytes
        }
        "opaque-handle" => {
            let mut store = HostOwnedHandleStore::default();
            let handle = store
                .insert(source.duplicate())
                .map_err(|error| format!("{error:?}"))?;
            store
                .read(handle, 0, BYTES_U32)
                .map_err(|error| format!("{error:?}"))?
                .bytes
        }
        "shared-staging" => {
            let bytes = source
                .read(0, BYTES_U32)
                .map_err(|error| format!("{error:?}"))?
                .bytes;
            let mut staging =
                SharedStagingPrototype::allocate(BYTES).map_err(|error| format!("{error:?}"))?;
            staging
                .begin_lease(BYTES)
                .map_err(|error| format!("{error:?}"))?;
            staging
                .leased_bytes_mut()
                .map_err(|error| format!("{error:?}"))?
                .copy_from_slice(&bytes);
            staging.end_lease().map_err(|error| format!("{error:?}"))?;
            staging
                .snapshot_copy()
                .map_err(|error| format!("{error:?}"))?
        }
        _ => return Err("unknown strategy".to_owned()),
    };
    Ok(output)
}

fn main() -> Result<(), String> {
    let source = source()?;
    let expected = checksum(
        &source
            .read(0, BYTES_U32)
            .map_err(|error| format!("{error:?}"))?
            .bytes,
    );
    let stdout = io::stdout();
    let mut writer = stdout.lock();
    writeln!(writer, "schema\thelix.host-boundary-benchmark-native/1")
        .map_err(|error| error.to_string())?;
    writeln!(
        writer,
        "config\t{BYTES}\t{CHUNK}\t{CHATTY_ITERATIONS}\t{COARSE_ITERATIONS}\t{WARMUPS}\t{MEASUREMENTS}\t{expected}"
    )
    .map_err(|error| error.to_string())?;
    for strategy in ["chatty", "batched-copy", "opaque-handle", "shared-staging"] {
        for index in 0..(WARMUPS + MEASUREMENTS) {
            let iterations = if strategy == "chatty" {
                CHATTY_ITERATIONS
            } else {
                COARSE_ITERATIONS
            };
            let start = Instant::now();
            let mut output = Vec::new();
            for _ in 0..iterations {
                output = execute(strategy, &source)?;
            }
            let duration = start.elapsed().as_nanos();
            let digest = checksum(black_box(&output));
            let bytes = output.len();
            if digest != expected || bytes != BYTES {
                return Err("benchmark correctness mismatch".to_owned());
            }
            writeln!(
                writer,
                "sample\t{strategy}\t{index}\t{iterations}\t{duration}\t{bytes}\t{digest}"
            )
            .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

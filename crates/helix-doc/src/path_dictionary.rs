//! Canonical collection field-path dictionary snapshot bytes and lineage validation.

use std::collections::BTreeSet;
use std::error::Error;
use std::fmt;

use blake3::Hasher;

use super::{CRC32C, FieldPath};

/// Stable format/profile identity for collection field-path dictionary snapshots.
pub const PATH_DICTIONARY_FORMAT: &str = "helix.path-dictionary/1.0";

const MAGIC: &[u8; 8] = b"HPDICT\r\n";
const FOOTER_MAGIC: &[u8; 8] = b"HPDEND\r\n";
const HEADER_BYTES: u64 = 64;
const ENTRY_BYTES: u64 = 24;
const FOOTER_BYTES: u64 = 64;
const MAX_SNAPSHOT_BYTES: u64 = 67_108_864;
const MAX_PATHS: u64 = 1_000_000;
const HASH_DOMAIN: &[u8] = b"HELIX-PATH-DICTIONARY-V1\0";

/// One caller-supplied path registration in a complete dictionary snapshot.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PathDictionaryInputEntry<'a> {
    /// Dense monotonic ID. IDs start at one and are never reused.
    pub path_id: u32,
    /// Dictionary version that first introduced this path.
    pub introduced_version: u64,
    /// Exact canonical dotted field path.
    pub path: &'a str,
}

/// Complete logical input for one canonical dictionary snapshot.
#[derive(Clone, Copy, Debug)]
pub struct PathDictionaryInput<'a> {
    /// Nonzero collection-scoped dictionary identity.
    pub dictionary_id: [u8; 16],
    /// Exact snapshot version. Empty snapshots use zero.
    pub version: u64,
    /// Complete retained registration history in ascending ID order.
    pub entries: &'a [PathDictionaryInputEntry<'a>],
}

/// Owned canonical snapshot bytes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EncodedPathDictionary {
    bytes: Vec<u8>,
}

impl EncodedPathDictionary {
    /// Returns the complete canonical snapshot envelope.
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes
    }

    /// Consumes the wrapper and returns the complete bytes.
    #[must_use]
    pub fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }
}

/// Trust-ordered validation stage for a rejected snapshot.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PathDictionaryCheck {
    /// Magic, version, fixed widths, flags, and identity.
    Header,
    /// Supplied and declared complete lengths.
    Length,
    /// CRC-32C over exact stored bytes.
    Checksum,
    /// Entry/string/footer placement and padding.
    Layout,
    /// Dense IDs, versions, paths, and uniqueness.
    Entries,
    /// Footer copies and semantic BLAKE3 identity.
    ContentHash,
    /// Prefix-preserving successor/non-reuse relationship.
    Lineage,
}

/// Safe format/limit failure with no retained path text.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PathDictionaryError {
    /// Major/minor/profile is unsupported.
    FormatUnsupported,
    /// Snapshot bytes ended before their declared complete length.
    Truncated {
        /// First unavailable byte offset.
        offset: u32,
    },
    /// A named snapshot size/count limit was exceeded.
    LimitExceeded {
        /// Stable format limit identity.
        limit: &'static str,
        /// Inclusive maximum.
        maximum: u64,
        /// Observed count or byte length.
        observed: u64,
    },
    /// Exact bytes or logical input violate the canonical format.
    Corruption {
        /// Trust-ordered validation stage.
        check: PathDictionaryCheck,
        /// Bounded byte offset identifying the rejected region.
        offset: u32,
    },
}

impl PathDictionaryError {
    /// Returns the stable errors-v1 family code.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::FormatUnsupported => "CAP_FORMAT_UNSUPPORTED",
            Self::Truncated { .. } => "PAR_TRUNCATED_INPUT",
            Self::LimitExceeded { .. } => "QUOTA_LIMIT_EXCEEDED",
            Self::Corruption { .. } => "DUR_CORRUPTION",
        }
    }

    /// Returns a bounded byte offset when one identifies the rejected region.
    #[must_use]
    pub const fn offset(&self) -> Option<u32> {
        match self {
            Self::Truncated { offset } | Self::Corruption { offset, .. } => Some(*offset),
            Self::FormatUnsupported | Self::LimitExceeded { .. } => None,
        }
    }
}

impl fmt::Display for PathDictionaryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::LimitExceeded {
                limit,
                maximum,
                observed,
            } => write!(
                formatter,
                "{}: {limit} maximum {maximum}, observed {observed}",
                self.code()
            ),
            _ => formatter.write_str(self.code()),
        }
    }
}

impl Error for PathDictionaryError {}

/// One validated borrowed dictionary entry.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PathDictionaryEntry<'a> {
    path_id: u32,
    introduced_version: u64,
    path: &'a str,
}

impl<'a> PathDictionaryEntry<'a> {
    /// Returns the dense monotonic ID.
    #[must_use]
    pub const fn path_id(self) -> u32 {
        self.path_id
    }

    /// Returns the version that first introduced this path.
    #[must_use]
    pub const fn introduced_version(self) -> u64 {
        self.introduced_version
    }

    /// Returns the exact dotted path.
    #[must_use]
    pub const fn path(self) -> &'a str {
        self.path
    }
}

/// Completely validated read-only view over one snapshot.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PathDictionaryView<'a> {
    bytes: &'a [u8],
    dictionary_id: [u8; 16],
    version: u64,
    entry_count: usize,
    footer_offset: usize,
}

impl<'a> PathDictionaryView<'a> {
    /// Returns the collection-scoped dictionary identity.
    #[must_use]
    pub const fn dictionary_id(self) -> [u8; 16] {
        self.dictionary_id
    }

    /// Returns the exact snapshot version.
    #[must_use]
    pub const fn version(self) -> u64 {
        self.version
    }

    /// Returns the retained path count and maximum assigned ID.
    #[must_use]
    pub const fn len(self) -> usize {
        self.entry_count
    }

    /// Reports whether this is the canonical version-zero empty snapshot.
    #[must_use]
    pub const fn is_empty(self) -> bool {
        self.entry_count == 0
    }

    /// Returns one entry by dense zero-based storage position.
    #[must_use]
    pub fn entry_at(self, index: usize) -> Option<PathDictionaryEntry<'a>> {
        if index >= self.entry_count {
            return None;
        }
        Some(read_validated_entry(self.bytes, index))
    }

    /// Returns the semantic BLAKE3 snapshot identity from the validated footer.
    #[must_use]
    pub fn content_hash(self) -> [u8; 32] {
        let mut output = [0_u8; 32];
        output.copy_from_slice(&self.bytes[self.footer_offset + 32..self.footer_offset + 64]);
        output
    }

    /// Iterates entries in ascending stable-ID order.
    #[must_use]
    pub fn entries(self) -> impl ExactSizeIterator<Item = PathDictionaryEntry<'a>> {
        (0..self.entry_count).map(move |index| read_validated_entry(self.bytes, index))
    }
}

/// Encodes one complete canonical append-only snapshot.
///
/// # Errors
///
/// Returns a redacted format or limit error for an invalid identity, version, ID sequence, path,
/// duplicate path, arithmetic overflow, or oversized canonical snapshot.
pub fn encode_path_dictionary(
    input: PathDictionaryInput<'_>,
) -> Result<EncodedPathDictionary, PathDictionaryError> {
    validate_input(input)?;
    let entry_bytes = checked_format_mul(usize_to_format_u64(input.entries.len()), ENTRY_BYTES)?;
    let mut strings_bytes = 0_u64;
    for entry in input.entries {
        strings_bytes = checked_format_add(strings_bytes, usize_to_format_u64(entry.path.len()))?;
    }
    let (strings_offset, footer_offset, total_length) =
        measure_snapshot_layout(entry_bytes, strings_bytes)?;
    let mut bytes = vec![0_u8; to_usize(total_length)];
    bytes[..8].copy_from_slice(MAGIC);
    put_u16(&mut bytes, 8, 1);
    put_u16(&mut bytes, 10, 0);
    put_u16(&mut bytes, 12, 64);
    put_u16(&mut bytes, 14, 24);
    put_u32(&mut bytes, 20, to_u32(total_length));
    put_u64(&mut bytes, 24, input.version);
    bytes[32..48].copy_from_slice(&input.dictionary_id);
    put_u32(
        &mut bytes,
        48,
        to_u32(usize_to_format_u64(input.entries.len())),
    );
    put_u32(
        &mut bytes,
        52,
        to_u32(usize_to_format_u64(input.entries.len())),
    );
    put_u32(&mut bytes, 56, to_u32(footer_offset));
    let mut path_cursor = strings_offset;
    for (index, entry) in input.entries.iter().enumerate() {
        let record = to_usize(HEADER_BYTES + usize_to_format_u64(index) * ENTRY_BYTES);
        put_u32(&mut bytes, record, entry.path_id);
        put_u16(
            &mut bytes,
            record + 6,
            u16::try_from(entry.path.split('.').count()).unwrap_or(u16::MAX),
        );
        put_u64(&mut bytes, record + 8, entry.introduced_version);
        put_u32(&mut bytes, record + 16, to_u32(path_cursor));
        put_u16(
            &mut bytes,
            record + 20,
            u16::try_from(entry.path.len()).unwrap_or(u16::MAX),
        );
        let start = to_usize(path_cursor);
        bytes[start..start + entry.path.len()].copy_from_slice(entry.path.as_bytes());
        path_cursor = checked_format_add(path_cursor, usize_to_format_u64(entry.path.len()))?;
    }
    let footer = to_usize(footer_offset);
    bytes[footer..footer + 8].copy_from_slice(FOOTER_MAGIC);
    put_u16(&mut bytes, footer + 8, 64);
    put_u16(&mut bytes, footer + 10, 1);
    put_u16(&mut bytes, footer + 12, 1);
    put_u16(&mut bytes, footer + 14, 1);
    put_u32(&mut bytes, footer + 16, to_u32(total_length));
    put_u32(
        &mut bytes,
        footer + 20,
        to_u32(usize_to_format_u64(input.entries.len())),
    );
    put_u64(&mut bytes, footer + 24, input.version);
    bytes[footer + 32..footer + 64].copy_from_slice(&dictionary_hash(input));
    let checksum = CRC32C.checksum(&bytes);
    put_u32(&mut bytes, 60, checksum);
    Ok(EncodedPathDictionary { bytes })
}

/// Validates and opens one exact complete snapshot.
///
/// # Errors
///
/// Returns a trust-ordered redacted failure for unsupported, truncated, oversized, corrupt,
/// noncanonical, or content-hash-inconsistent bytes.
pub fn decode_path_dictionary(bytes: &[u8]) -> Result<PathDictionaryView<'_>, PathDictionaryError> {
    if bytes.len() < to_usize(HEADER_BYTES) {
        return Err(PathDictionaryError::Truncated {
            offset: to_offset(bytes.len()),
        });
    }
    if &bytes[..8] != MAGIC || read_u16(bytes, 8) != 1 || read_u16(bytes, 10) != 0 {
        return Err(PathDictionaryError::FormatUnsupported);
    }
    if read_u16(bytes, 12) != 64 || read_u16(bytes, 14) != 24 || read_u32(bytes, 16) != 0 {
        return Err(corruption(PathDictionaryCheck::Header, 12));
    }
    let total_length = read_u32(bytes, 20) as usize;
    enforce_format_limit(
        "dictionary.snapshot_bytes",
        MAX_SNAPSHOT_BYTES,
        usize_to_format_u64(total_length),
    )?;
    if bytes.len() < total_length {
        return Err(PathDictionaryError::Truncated {
            offset: to_offset(bytes.len()),
        });
    }
    if bytes.len() != total_length {
        return Err(corruption(PathDictionaryCheck::Length, total_length));
    }
    let mut checksum_bytes = bytes.to_vec();
    let expected_checksum = read_u32(bytes, 60);
    checksum_bytes[60..64].fill(0);
    if CRC32C.checksum(&checksum_bytes) != expected_checksum {
        return Err(corruption(PathDictionaryCheck::Checksum, 60));
    }
    validate_decoded(bytes)
}

/// Proves that `next` only appends new IDs and cannot reuse or reinterpret an old ID.
///
/// # Errors
///
/// Returns `DUR_CORRUPTION` when identity/version lineage, the retained prefix, or newly introduced
/// entry versions violate the append-only non-reuse contract.
pub fn validate_path_dictionary_successor(
    previous: PathDictionaryView<'_>,
    next: PathDictionaryView<'_>,
) -> Result<(), PathDictionaryError> {
    if previous.dictionary_id != next.dictionary_id
        || next.version != previous.version.saturating_add(1)
        || next.entry_count <= previous.entry_count
    {
        return Err(corruption(PathDictionaryCheck::Lineage, 24));
    }
    for index in 0..previous.entry_count {
        if previous.entry_at(index) != next.entry_at(index) {
            return Err(corruption(PathDictionaryCheck::Lineage, 64 + index * 24));
        }
    }
    for entry in next.entries().skip(previous.entry_count) {
        if entry.introduced_version != next.version {
            return Err(corruption(PathDictionaryCheck::Lineage, 24));
        }
    }
    Ok(())
}

fn validate_input(input: PathDictionaryInput<'_>) -> Result<(), PathDictionaryError> {
    if input.dictionary_id == [0; 16] {
        return Err(corruption(PathDictionaryCheck::Header, 32));
    }
    enforce_format_limit(
        "dictionary.paths",
        MAX_PATHS,
        usize_to_format_u64(input.entries.len()),
    )?;
    if input.entries.is_empty() {
        if input.version != 0 {
            return Err(corruption(PathDictionaryCheck::Entries, 24));
        }
        return Ok(());
    }
    if input.version == 0 || input.entries[0].path != "_id" {
        return Err(corruption(PathDictionaryCheck::Entries, 64));
    }
    let mut paths = BTreeSet::new();
    let mut previous_version = 0_u64;
    for (index, entry) in input.entries.iter().enumerate() {
        let expected_id = u32::try_from(index + 1).unwrap_or(u32::MAX);
        if entry.path_id != expected_id
            || entry.introduced_version == 0
            || entry.introduced_version > input.version
            || entry.introduced_version < previous_version
            || entry.introduced_version > previous_version.saturating_add(1)
            || FieldPath::parse(entry.path).is_err()
            || !paths.insert(entry.path)
        {
            return Err(corruption(PathDictionaryCheck::Entries, 64 + index * 24));
        }
        previous_version = entry.introduced_version;
    }
    if previous_version != input.version {
        return Err(corruption(PathDictionaryCheck::Entries, 24));
    }
    Ok(())
}

fn validate_decoded(bytes: &[u8]) -> Result<PathDictionaryView<'_>, PathDictionaryError> {
    let version = read_u64(bytes, 24);
    let mut dictionary_id = [0_u8; 16];
    dictionary_id.copy_from_slice(&bytes[32..48]);
    let count = read_u32(bytes, 48) as usize;
    if read_u32(bytes, 52) != read_u32(bytes, 48) {
        return Err(corruption(PathDictionaryCheck::Entries, 52));
    }
    enforce_format_limit("dictionary.paths", MAX_PATHS, usize_to_format_u64(count))?;
    let entry_length = checked_format_mul(usize_to_format_u64(count), ENTRY_BYTES)?;
    let strings_offset = checked_format_add(HEADER_BYTES, entry_length)?;
    let footer_offset = read_u32(bytes, 56) as usize;
    if footer_offset < to_usize(strings_offset)
        || footer_offset + 64 != bytes.len()
        || !footer_offset.is_multiple_of(8)
    {
        return Err(corruption(PathDictionaryCheck::Layout, 56));
    }
    let mut entries = Vec::with_capacity(count);
    let mut cursor = to_usize(strings_offset);
    for index in 0..count {
        let record = 64 + index * 24;
        let path_id = read_u32(bytes, record);
        let flags = read_u16(bytes, record + 4);
        let segments = read_u16(bytes, record + 6);
        let introduced_version = read_u64(bytes, record + 8);
        let offset = read_u32(bytes, record + 16) as usize;
        let length = usize::from(read_u16(bytes, record + 20));
        if flags != 0
            || read_u16(bytes, record + 22) != 0
            || path_id != u32::try_from(index + 1).unwrap_or(u32::MAX)
            || offset != cursor
        {
            return Err(corruption(PathDictionaryCheck::Entries, record));
        }
        let end = offset.saturating_add(length);
        if end > footer_offset {
            return Err(corruption(PathDictionaryCheck::Layout, record + 16));
        }
        let Ok(path) = std::str::from_utf8(&bytes[offset..end]) else {
            return Err(corruption(PathDictionaryCheck::Entries, offset));
        };
        if segments != u16::try_from(path.split('.').count()).unwrap_or(u16::MAX) {
            return Err(corruption(PathDictionaryCheck::Entries, record + 6));
        }
        entries.push(PathDictionaryInputEntry {
            path_id,
            introduced_version,
            path,
        });
        cursor = end;
    }
    if bytes[cursor..footer_offset].iter().any(|byte| *byte != 0) {
        return Err(corruption(PathDictionaryCheck::Layout, cursor));
    }
    let input = PathDictionaryInput {
        dictionary_id,
        version,
        entries: &entries,
    };
    validate_input(input)?;
    validate_footer(bytes, footer_offset, input)?;
    Ok(PathDictionaryView {
        bytes,
        dictionary_id,
        version,
        entry_count: count,
        footer_offset,
    })
}

fn validate_footer(
    bytes: &[u8],
    footer: usize,
    input: PathDictionaryInput<'_>,
) -> Result<(), PathDictionaryError> {
    if &bytes[footer..footer + 8] != FOOTER_MAGIC
        || read_u16(bytes, footer + 8) != 64
        || read_u16(bytes, footer + 10) != 1
        || read_u16(bytes, footer + 12) != 1
        || read_u16(bytes, footer + 14) != 1
        || usize::try_from(read_u32(bytes, footer + 16)).unwrap_or(usize::MAX) != bytes.len()
        || usize::try_from(read_u32(bytes, footer + 20)).unwrap_or(usize::MAX)
            != input.entries.len()
        || read_u64(bytes, footer + 24) != input.version
    {
        return Err(corruption(PathDictionaryCheck::ContentHash, footer));
    }
    if bytes[footer + 32..footer + 64] != dictionary_hash(input) {
        return Err(corruption(PathDictionaryCheck::ContentHash, footer + 32));
    }
    Ok(())
}

fn dictionary_hash(input: PathDictionaryInput<'_>) -> [u8; 32] {
    let mut hasher = Hasher::new();
    hasher.update(HASH_DOMAIN);
    hasher.update(&input.dictionary_id);
    hasher.update(&input.version.to_le_bytes());
    hasher.update(
        &u32::try_from(input.entries.len())
            .unwrap_or(u32::MAX)
            .to_le_bytes(),
    );
    for entry in input.entries {
        hasher.update(&entry.path_id.to_le_bytes());
        hasher.update(&entry.introduced_version.to_le_bytes());
        hasher.update(
            &u32::try_from(entry.path.len())
                .unwrap_or(u32::MAX)
                .to_le_bytes(),
        );
        hasher.update(entry.path.as_bytes());
    }
    *hasher.finalize().as_bytes()
}

fn read_validated_entry(bytes: &[u8], index: usize) -> PathDictionaryEntry<'_> {
    let record = 64 + index * 24;
    let offset = read_u32(bytes, record + 16) as usize;
    let length = usize::from(read_u16(bytes, record + 20));
    let path = std::str::from_utf8(&bytes[offset..offset + length]).unwrap_or_default();
    PathDictionaryEntry {
        path_id: read_u32(bytes, record),
        introduced_version: read_u64(bytes, record + 8),
        path,
    }
}

fn enforce_format_limit(
    limit: &'static str,
    maximum: u64,
    observed: u64,
) -> Result<(), PathDictionaryError> {
    if observed > maximum {
        Err(PathDictionaryError::LimitExceeded {
            limit,
            maximum,
            observed,
        })
    } else {
        Ok(())
    }
}

fn measure_snapshot_layout(
    entry_bytes: u64,
    strings_bytes: u64,
) -> Result<(u64, u64, u64), PathDictionaryError> {
    let strings_offset = checked_format_add(HEADER_BYTES, entry_bytes)?;
    let strings_end = checked_format_add(strings_offset, strings_bytes)?;
    let footer_offset = align_format8(strings_end)?;
    let total_length = checked_format_add(footer_offset, FOOTER_BYTES)?;
    enforce_format_limit(
        "dictionary.snapshot_bytes",
        MAX_SNAPSHOT_BYTES,
        total_length,
    )?;
    Ok((strings_offset, footer_offset, total_length))
}

fn checked_format_add(left: u64, right: u64) -> Result<u64, PathDictionaryError> {
    left.checked_add(right)
        .ok_or(corruption(PathDictionaryCheck::Layout, 0))
}

fn checked_format_mul(value: u64, width: u64) -> Result<u64, PathDictionaryError> {
    value
        .checked_mul(width)
        .ok_or(corruption(PathDictionaryCheck::Layout, 0))
}

fn align_format8(value: u64) -> Result<u64, PathDictionaryError> {
    checked_format_add(value, 7).map(|candidate| candidate & !7)
}

fn usize_to_format_u64(value: usize) -> u64 {
    u64::try_from(value).unwrap_or(u64::MAX)
}

fn to_usize(value: u64) -> usize {
    usize::try_from(value).unwrap_or(usize::MAX)
}

fn to_u32(value: u64) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

fn to_offset(value: usize) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

fn corruption(check: PathDictionaryCheck, offset: usize) -> PathDictionaryError {
    PathDictionaryError::Corruption {
        check,
        offset: to_offset(offset),
    }
}

fn read_u16(bytes: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([bytes[offset], bytes[offset + 1]])
}

fn read_u32(bytes: &[u8], offset: usize) -> u32 {
    u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap_or_default())
}

fn read_u64(bytes: &[u8], offset: usize) -> u64 {
    u64::from_le_bytes(bytes[offset..offset + 8].try_into().unwrap_or_default())
}

fn put_u16(bytes: &mut [u8], offset: usize, value: u16) {
    bytes[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
}

fn put_u32(bytes: &mut [u8], offset: usize, value: u32) {
    bytes[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn put_u64(bytes: &mut [u8], offset: usize, value: u64) {
    bytes[offset..offset + 8].copy_from_slice(&value.to_le_bytes());
}

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;

    const ID: [u8; 16] = [0x11; 16];
    const FORMAT_REGISTRY: &str = include_str!("../../../docs/formats/path-dictionary-v1.json");

    fn entry(path_id: u32, introduced_version: u64, path: &str) -> PathDictionaryInputEntry<'_> {
        PathDictionaryInputEntry {
            path_id,
            introduced_version,
            path,
        }
    }

    fn encode_entries(
        dictionary_id: [u8; 16],
        version: u64,
        entries: &[PathDictionaryInputEntry<'_>],
    ) -> Result<EncodedPathDictionary, PathDictionaryError> {
        encode_path_dictionary(PathDictionaryInput {
            dictionary_id,
            version,
            entries,
        })
    }

    fn refresh_checksum(bytes: &mut [u8]) {
        bytes[60..64].fill(0);
        let checksum = CRC32C.checksum(bytes);
        put_u32(bytes, 60, checksum);
    }

    fn expect_check(bytes: &[u8], expected: PathDictionaryCheck) {
        assert_eq!(
            decode_path_dictionary(bytes),
            Err(PathDictionaryError::Corruption {
                check: expected,
                offset: decode_path_dictionary(bytes)
                    .err()
                    .and_then(|error| error.offset())
                    .unwrap_or_default()
            })
        );
    }

    #[test]
    fn canonical_snapshots_round_trip_and_preserve_append_only_lineage()
    -> Result<(), PathDictionaryError> {
        assert_eq!(PATH_DICTIONARY_FORMAT, "helix.path-dictionary/1.0");
        for marker in [
            "\"identity\": \"helix.path-dictionary/1.0\"",
            "\"maximum_bytes\": 67108864",
            "\"maximum_paths\": 1000000",
            "\"header_ascii_escaped\": \"HPDICT\\\\r\\\\n\"",
            "\"footer_ascii_escaped\": \"HPDEND\\\\r\\\\n\"",
        ] {
            assert!(FORMAT_REGISTRY.contains(marker));
        }
        let empty = encode_entries(ID, 0, &[])?;
        let empty_view = decode_path_dictionary(empty.as_bytes())?;
        assert!(empty_view.is_empty());
        assert_eq!(empty_view.len(), 0);
        assert_eq!(empty_view.version(), 0);
        assert_eq!(empty_view.dictionary_id(), ID);
        assert_eq!(empty_view.entry_at(0), None);

        let v1_entries = [entry(1, 1, "_id")];
        let v1 = encode_entries(ID, 1, &v1_entries)?;
        let v1_again = encode_entries(ID, 1, &v1_entries)?;
        assert_eq!(v1, v1_again);
        assert_eq!(v1_again.clone().into_bytes(), v1_again.as_bytes());
        let view1 = decode_path_dictionary(v1.as_bytes())?;
        let first = view1
            .entry_at(0)
            .ok_or_else(|| corruption(PathDictionaryCheck::Entries, 64))?;
        assert_eq!(first.path_id(), 1);
        assert_eq!(first.introduced_version(), 1);
        assert_eq!(first.path(), "_id");
        assert_ne!(view1.content_hash(), [0; 32]);

        let v2_entries = [
            entry(1, 1, "_id"),
            entry(2, 2, "user.id"),
            entry(3, 2, "user.email"),
        ];
        let v2 = encode_entries(ID, 2, &v2_entries)?;
        let view2 = decode_path_dictionary(v2.as_bytes())?;
        assert_eq!(view2.entries().len(), 3);
        assert_eq!(
            view2
                .entries()
                .map(PathDictionaryEntry::path)
                .collect::<Vec<_>>(),
            ["_id", "user.id", "user.email"]
        );
        validate_path_dictionary_successor(empty_view, view1)?;
        validate_path_dictionary_successor(view1, view2)?;
        assert_ne!(view1.content_hash(), view2.content_hash());
        Ok(())
    }

    #[test]
    fn encoder_rejects_invalid_identity_versions_ids_paths_and_limits() {
        let cases: &[([u8; 16], u64, &[PathDictionaryInputEntry<'_>])] = &[
            ([0; 16], 0, &[]),
            (ID, 1, &[]),
            (ID, 0, &[entry(1, 1, "_id")]),
            (ID, 1, &[entry(1, 1, "other")]),
            (ID, 1, &[entry(2, 1, "_id")]),
            (ID, 2, &[entry(1, 1, "_id")]),
            (ID, 2, &[entry(1, 2, "_id")]),
            (ID, 2, &[entry(1, 1, "_id"), entry(2, 2, "bad..path")]),
            (ID, 2, &[entry(1, 1, "_id"), entry(2, 2, "_id")]),
            (ID, 3, &[entry(1, 1, "_id"), entry(2, 3, "x")]),
        ];
        for (identity, version, entries) in cases {
            assert!(encode_entries(*identity, *version, entries).is_err());
        }
        let too_many_entries = vec![entry(1, 1, "_id"); to_usize(MAX_PATHS + 1)];
        assert!(matches!(
            encode_entries(ID, 1, &too_many_entries),
            Err(PathDictionaryError::LimitExceeded {
                limit: "dictionary.paths",
                ..
            })
        ));
        assert!(enforce_format_limit("dictionary.paths", 1, 2).is_err());
        let error = enforce_format_limit("dictionary.paths", 1, 2)
            .err()
            .unwrap_or_else(|| corruption(PathDictionaryCheck::Entries, 0));
        assert_eq!(error.code(), "QUOTA_LIMIT_EXCEEDED");
        assert_eq!(error.offset(), None);
        assert!(error.source().is_none());
        assert_eq!(
            error.to_string(),
            "QUOTA_LIMIT_EXCEEDED: dictionary.paths maximum 1, observed 2"
        );
        assert!(measure_snapshot_layout(0, MAX_SNAPSHOT_BYTES).is_err());
        assert!(checked_format_add(u64::MAX, 1).is_err());
        assert!(checked_format_mul(u64::MAX, 2).is_err());
        assert!(align_format8(u64::MAX).is_err());
        for error in [
            PathDictionaryError::FormatUnsupported,
            PathDictionaryError::Truncated { offset: 1 },
            corruption(PathDictionaryCheck::Header, 2),
        ] {
            assert_ne!(error.code(), "QUOTA_LIMIT_EXCEEDED");
            assert_eq!(error.to_string(), error.code());
            assert!(error.offset().is_some() || error == PathDictionaryError::FormatUnsupported);
        }
    }

    #[test]
    fn decoder_rejects_truncation_header_checksum_layout_entries_and_hash()
    -> Result<(), PathDictionaryError> {
        let entries = [entry(1, 1, "_id"), entry(2, 2, "a.b")];
        let encoded = encode_entries(ID, 2, &entries)?;
        let base = encoded.as_bytes();
        assert_eq!(
            decode_path_dictionary(&base[..63]),
            Err(PathDictionaryError::Truncated { offset: 63 })
        );

        let mut candidate = base.to_vec();
        candidate[0] ^= 1;
        assert_eq!(
            decode_path_dictionary(&candidate),
            Err(PathDictionaryError::FormatUnsupported)
        );

        let mut oversized_header = vec![0_u8; 64];
        oversized_header[..8].copy_from_slice(MAGIC);
        put_u16(&mut oversized_header, 8, 1);
        put_u16(&mut oversized_header, 12, 64);
        put_u16(&mut oversized_header, 14, 24);
        put_u32(
            &mut oversized_header,
            20,
            u32::try_from(MAX_SNAPSHOT_BYTES + 1).unwrap_or(u32::MAX),
        );
        assert!(matches!(
            decode_path_dictionary(&oversized_header),
            Err(PathDictionaryError::LimitExceeded { .. })
        ));

        let mut declared_truncated = base.to_vec();
        put_u32(
            &mut declared_truncated,
            20,
            u32::try_from(base.len() + 1).unwrap_or(u32::MAX),
        );
        assert!(matches!(
            decode_path_dictionary(&declared_truncated),
            Err(PathDictionaryError::Truncated { .. })
        ));

        let mut candidate = base.to_vec();
        candidate[12] = 63;
        refresh_checksum(&mut candidate);
        expect_check(&candidate, PathDictionaryCheck::Header);

        let mut candidate = base.to_vec();
        candidate[70] ^= 1;
        expect_check(&candidate, PathDictionaryCheck::Checksum);

        let mut trailing = base.to_vec();
        trailing.push(0);
        expect_check(&trailing, PathDictionaryCheck::Length);

        let mut candidate = base.to_vec();
        put_u32(&mut candidate, 56, 65);
        refresh_checksum(&mut candidate);
        expect_check(&candidate, PathDictionaryCheck::Layout);

        let mut candidate = base.to_vec();
        put_u32(&mut candidate, 52, 1);
        refresh_checksum(&mut candidate);
        expect_check(&candidate, PathDictionaryCheck::Entries);

        let mut candidate = base.to_vec();
        put_u16(&mut candidate, 68, 1);
        refresh_checksum(&mut candidate);
        expect_check(&candidate, PathDictionaryCheck::Entries);

        let mut candidate = base.to_vec();
        put_u16(&mut candidate, 64 + 24 + 20, u16::MAX);
        refresh_checksum(&mut candidate);
        expect_check(&candidate, PathDictionaryCheck::Layout);

        let mut candidate = base.to_vec();
        put_u16(&mut candidate, 64 + 24 + 6, 1);
        refresh_checksum(&mut candidate);
        expect_check(&candidate, PathDictionaryCheck::Entries);

        let path_offset = read_u32(base, 64 + 24 + 16) as usize;
        let mut candidate = base.to_vec();
        candidate[path_offset] = 0xff;
        refresh_checksum(&mut candidate);
        expect_check(&candidate, PathDictionaryCheck::Entries);

        let footer = read_u32(base, 56) as usize;
        let mut candidate = base.to_vec();
        candidate[footer - 1] = 1;
        refresh_checksum(&mut candidate);
        expect_check(&candidate, PathDictionaryCheck::Layout);

        let mut candidate = base.to_vec();
        candidate[footer + 32] ^= 1;
        refresh_checksum(&mut candidate);
        expect_check(&candidate, PathDictionaryCheck::ContentHash);

        let mut candidate = base.to_vec();
        candidate[footer] ^= 1;
        refresh_checksum(&mut candidate);
        expect_check(&candidate, PathDictionaryCheck::ContentHash);
        Ok(())
    }

    #[test]
    fn successor_validation_rejects_identity_version_prefix_and_backdated_entries()
    -> Result<(), PathDictionaryError> {
        let previous_entries = [entry(1, 1, "_id"), entry(2, 2, "a")];
        let previous = encode_entries(ID, 2, &previous_entries)?;
        let previous_view = decode_path_dictionary(previous.as_bytes())?;

        let other_id_entries = [entry(1, 1, "_id"), entry(2, 2, "a"), entry(3, 3, "b")];
        let other_id = encode_entries([0x22; 16], 3, &other_id_entries)?;
        assert!(
            validate_path_dictionary_successor(
                previous_view,
                decode_path_dictionary(other_id.as_bytes())?
            )
            .is_err()
        );

        let skipped_entries = [
            entry(1, 1, "_id"),
            entry(2, 2, "a"),
            entry(3, 3, "b"),
            entry(4, 4, "c"),
        ];
        let skipped = encode_entries(ID, 4, &skipped_entries)?;
        assert!(
            validate_path_dictionary_successor(
                previous_view,
                decode_path_dictionary(skipped.as_bytes())?
            )
            .is_err()
        );

        let replaced_entries = [entry(1, 1, "_id"), entry(2, 2, "changed"), entry(3, 3, "b")];
        let replaced = encode_entries(ID, 3, &replaced_entries)?;
        assert!(
            validate_path_dictionary_successor(
                previous_view,
                decode_path_dictionary(replaced.as_bytes())?
            )
            .is_err()
        );

        let backdated_entries = [
            entry(1, 1, "_id"),
            entry(2, 2, "a"),
            entry(3, 2, "ghost"),
            entry(4, 3, "b"),
        ];
        let backdated = encode_entries(ID, 3, &backdated_entries)?;
        assert!(
            validate_path_dictionary_successor(
                previous_view,
                decode_path_dictionary(backdated.as_bytes())?
            )
            .is_err()
        );
        assert!(validate_path_dictionary_successor(previous_view, previous_view).is_err());
        Ok(())
    }
}
// helix-coverage: exclude-end unit-tests

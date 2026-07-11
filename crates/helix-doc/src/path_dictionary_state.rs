//! Atomic collection dictionary registration, resolution, snapshots, and exact version pins.

use std::collections::BTreeMap;
use std::error::Error;
use std::fmt;

use super::{
    EncodedPathDictionary, FieldPath, PathDictionaryCheck, PathDictionaryError,
    PathDictionaryInput, PathDictionaryInputEntry, decode_path_dictionary, encode_path_dictionary,
    validate_path_dictionary_successor,
};

#[derive(Clone, Debug, Eq, PartialEq)]
struct OwnedPathEntry {
    path_id: u32,
    introduced_version: u64,
    path: String,
}

/// One immutable canonical dictionary snapshot suitable for durable publication.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PathDictionarySnapshot {
    bytes: Vec<u8>,
}

impl PathDictionarySnapshot {
    /// Validates and owns an externally retained snapshot.
    ///
    /// # Errors
    ///
    /// Returns the format reader's redacted error when the bytes are not one complete canonical
    /// dictionary snapshot.
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, PathDictionaryError> {
        decode_path_dictionary(bytes)?;
        Ok(Self {
            bytes: bytes.to_vec(),
        })
    }

    /// Returns the exact canonical bytes.
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes
    }

    /// Returns the collection dictionary identity after revalidating the retained bytes.
    ///
    /// # Errors
    ///
    /// Returns a format error if memory corruption changed the internally retained bytes.
    pub fn dictionary_id(&self) -> Result<[u8; 16], PathDictionaryError> {
        Ok(decode_path_dictionary(&self.bytes)?.dictionary_id())
    }

    /// Returns the exact dictionary version after revalidating the retained bytes.
    ///
    /// # Errors
    ///
    /// Returns a format error if memory corruption changed the internally retained bytes.
    pub fn version(&self) -> Result<u64, PathDictionaryError> {
        Ok(decode_path_dictionary(&self.bytes)?.version())
    }
}

/// Immutable version pin with owned snapshot bytes and allocation-free resolution indexes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PathDictionaryPin {
    snapshot: PathDictionarySnapshot,
    dictionary_id: [u8; 16],
    version: u64,
    content_hash: [u8; 32],
    entries: Vec<OwnedPathEntry>,
    by_path: BTreeMap<String, u32>,
}

impl PathDictionaryPin {
    /// Validates and pins one externally retained snapshot.
    ///
    /// This proves the snapshot itself, not its relationship to an earlier version. Use
    /// [`CollectionPathDictionary::recover`] when predecessor/non-reuse proof is available.
    ///
    /// # Errors
    ///
    /// Returns the format reader's redacted error for invalid snapshot bytes.
    pub fn from_snapshot(snapshot: PathDictionarySnapshot) -> Result<Self, PathDictionaryError> {
        let (dictionary_id, version, content_hash, entries, by_path) = {
            let view = decode_path_dictionary(snapshot.as_bytes())?;
            let mut entries = Vec::with_capacity(view.len());
            let mut by_path = BTreeMap::new();
            for entry in view.entries() {
                entries.push(OwnedPathEntry {
                    path_id: entry.path_id(),
                    introduced_version: entry.introduced_version(),
                    path: entry.path().to_owned(),
                });
                by_path.insert(entry.path().to_owned(), entry.path_id());
            }
            (
                view.dictionary_id(),
                view.version(),
                view.content_hash(),
                entries,
                by_path,
            )
        };
        Ok(Self {
            snapshot,
            dictionary_id,
            version,
            content_hash,
            entries,
            by_path,
        })
    }

    /// Returns the collection-lineage identity.
    #[must_use]
    pub const fn dictionary_id(&self) -> [u8; 16] {
        self.dictionary_id
    }

    /// Returns the exact pinned version.
    #[must_use]
    pub const fn version(&self) -> u64 {
        self.version
    }

    /// Returns the semantic snapshot content hash.
    #[must_use]
    pub const fn content_hash(&self) -> [u8; 32] {
        self.content_hash
    }

    /// Returns the retained path count and maximum assigned ID.
    #[must_use]
    pub const fn len(&self) -> usize {
        self.entries.len()
    }

    /// Reports whether this is the empty version-zero pin.
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Resolves one exact dotted path to its stable ID in this version.
    #[must_use]
    pub fn resolve_path(&self, path: &str) -> Option<u32> {
        self.by_path.get(path).copied()
    }

    /// Resolves one stable ID to its exact dotted path in this version.
    #[must_use]
    pub fn resolve_id(&self, path_id: u32) -> Option<&str> {
        let index = path_id.checked_sub(1)? as usize;
        self.entries.get(index).map(|entry| entry.path.as_str())
    }

    /// Returns the version that introduced one stable ID.
    #[must_use]
    pub fn introduced_version(&self, path_id: u32) -> Option<u64> {
        let index = path_id.checked_sub(1)? as usize;
        self.entries
            .get(index)
            .map(|entry| entry.introduced_version)
    }

    /// Returns the immutable canonical snapshot backing this pin.
    #[must_use]
    pub const fn snapshot(&self) -> &PathDictionarySnapshot {
        &self.snapshot
    }
}

/// Resolution result for one requested path, preserving request order and duplicates.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PathDictionaryRegistration {
    /// Stable resolved/assigned ID.
    pub path_id: u32,
    /// Version in which the path was first introduced.
    pub introduced_version: u64,
}

/// Prepared atomic dictionary candidate bound to an exact base snapshot.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PreparedPathDictionaryUpdate {
    base_dictionary_id: [u8; 16],
    base_version: u64,
    base_content_hash: [u8; 32],
    candidate: PathDictionaryPin,
    registrations: Vec<PathDictionaryRegistration>,
}

impl PreparedPathDictionaryUpdate {
    /// Returns the version against which this update was prepared.
    #[must_use]
    pub const fn base_version(&self) -> u64 {
        self.base_version
    }

    /// Returns the candidate version. An idempotent no-op retains the base version.
    #[must_use]
    pub const fn candidate_version(&self) -> u64 {
        self.candidate.version
    }

    /// Reports whether publication appends at least one new path.
    #[must_use]
    pub const fn changes_dictionary(&self) -> bool {
        self.base_version != self.candidate.version
    }

    /// Returns path results in caller request order, including duplicate requests.
    #[must_use]
    pub fn registrations(&self) -> &[PathDictionaryRegistration] {
        &self.registrations
    }

    /// Returns the fully validated candidate snapshot for durable staging.
    #[must_use]
    pub const fn candidate_snapshot(&self) -> &PathDictionarySnapshot {
        &self.candidate.snapshot
    }
}

/// Redacted mutable dictionary lifecycle failure.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PathDictionaryLifecycleError {
    /// Snapshot encoding/decoding/lineage failed.
    Format(PathDictionaryError),
    /// One requested path was not valid canonical dotted-path text.
    InvalidPath {
        /// Zero-based request position.
        index: u32,
    },
    /// A prepared update's base is no longer authoritative.
    WriteConflict {
        /// Version used during preparation.
        expected_version: u64,
        /// Version authoritative at attempted publication.
        current_version: u64,
    },
    /// Recovery was requested without a genesis snapshot.
    EmptyRecovery,
}

impl PathDictionaryLifecycleError {
    /// Returns the stable errors-v1 code.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::Format(error) => error.code(),
            Self::InvalidPath { .. } => "VAL_INVALID_PATH",
            Self::WriteConflict { .. } => "CON_WRITE_CONFLICT",
            Self::EmptyRecovery => "PAR_TRUNCATED_INPUT",
        }
    }
}

impl fmt::Display for PathDictionaryLifecycleError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.code())
    }
}

impl Error for PathDictionaryLifecycleError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Format(error) => Some(error),
            Self::InvalidPath { .. } | Self::WriteConflict { .. } | Self::EmptyRecovery => None,
        }
    }
}

impl From<PathDictionaryError> for PathDictionaryLifecycleError {
    fn from(error: PathDictionaryError) -> Self {
        Self::Format(error)
    }
}

/// Collection-scoped mutable dictionary with optimistic atomic publication.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CollectionPathDictionary {
    current: PathDictionaryPin,
}

impl CollectionPathDictionary {
    /// Creates one empty version-zero collection dictionary.
    ///
    /// # Errors
    ///
    /// Returns a format error when `dictionary_id` is the reserved all-zero identity.
    pub fn new(dictionary_id: [u8; 16]) -> Result<Self, PathDictionaryLifecycleError> {
        let encoded = encode_path_dictionary(PathDictionaryInput {
            dictionary_id,
            version: 0,
            entries: &[],
        })?;
        Self::from_encoded(encoded)
    }

    /// Recovers an authoritative dictionary from a complete genesis-to-current snapshot chain.
    ///
    /// # Errors
    ///
    /// Returns a redacted error for an empty chain, a nonzero first version, an invalid snapshot,
    /// or any identity/version/prefix/non-reuse lineage violation.
    pub fn recover(
        snapshots: &[PathDictionarySnapshot],
    ) -> Result<Self, PathDictionaryLifecycleError> {
        let Some(first) = snapshots.first() else {
            return Err(PathDictionaryLifecycleError::EmptyRecovery);
        };
        let first_view = decode_path_dictionary(first.as_bytes())?;
        if first_view.version() != 0 {
            return Err(PathDictionaryError::Corruption {
                check: PathDictionaryCheck::Lineage,
                offset: 24,
            }
            .into());
        }
        let mut previous = first_view;
        let mut current = first.clone();
        for snapshot in &snapshots[1..] {
            let next = decode_path_dictionary(snapshot.as_bytes())?;
            validate_path_dictionary_successor(previous, next)?;
            previous = next;
            current = snapshot.clone();
        }
        Ok(Self {
            current: PathDictionaryPin::from_snapshot(current)?,
        })
    }

    /// Returns an immutable exact-version pin of the current authoritative snapshot.
    #[must_use]
    pub fn pin(&self) -> PathDictionaryPin {
        self.current.clone()
    }

    /// Prepares one atomic idempotent registration batch without changing authoritative state.
    ///
    /// New unique paths are assigned in first-request order within one next dictionary version.
    /// On the first nonempty batch, `_id` is inserted first if the caller did not request it.
    /// Existing and duplicate requested paths resolve without consuming another ID.
    ///
    /// # Errors
    ///
    /// Returns a redacted invalid-path, limit, arithmetic, or format error. No state changes on
    /// failure.
    pub fn prepare_registration(
        &self,
        paths: &[&str],
    ) -> Result<PreparedPathDictionaryUpdate, PathDictionaryLifecycleError> {
        for (index, path) in paths.iter().enumerate() {
            if FieldPath::parse(path).is_err() {
                return Err(PathDictionaryLifecycleError::InvalidPath {
                    index: u32::try_from(index).unwrap_or(u32::MAX),
                });
            }
        }
        let mut entries = self.current.entries.clone();
        let mut by_path = self.current.by_path.clone();
        let mut next_id = u32::try_from(entries.len())
            .unwrap_or(u32::MAX)
            .saturating_add(1);
        let mut candidate_version = self.current.version;
        if paths.iter().any(|path| !by_path.contains_key(*path)) {
            candidate_version = self.current.version.saturating_add(1);
            if entries.is_empty() && !paths.contains(&"_id") {
                entries.push(OwnedPathEntry {
                    path_id: next_id,
                    introduced_version: candidate_version,
                    path: "_id".to_owned(),
                });
                by_path.insert("_id".to_owned(), next_id);
                next_id = next_id.saturating_add(1);
            }
            for path in paths {
                if !by_path.contains_key(*path) {
                    entries.push(OwnedPathEntry {
                        path_id: next_id,
                        introduced_version: candidate_version,
                        path: (*path).to_owned(),
                    });
                    by_path.insert((*path).to_owned(), next_id);
                    next_id = next_id.saturating_add(1);
                }
            }
        }
        let input_entries = entries
            .iter()
            .map(|entry| PathDictionaryInputEntry {
                path_id: entry.path_id,
                introduced_version: entry.introduced_version,
                path: &entry.path,
            })
            .collect::<Vec<_>>();
        let encoded = encode_path_dictionary(PathDictionaryInput {
            dictionary_id: self.current.dictionary_id,
            version: candidate_version,
            entries: &input_entries,
        })?;
        let candidate = Self::pin_encoded(encoded)?;
        let registrations = paths
            .iter()
            .map(|path| {
                let path_id = by_path.get(*path).copied().unwrap_or(u32::MAX);
                let index = usize::try_from(path_id.saturating_sub(1)).unwrap_or(usize::MAX);
                PathDictionaryRegistration {
                    path_id,
                    introduced_version: entries
                        .get(index)
                        .map_or(u64::MAX, |entry| entry.introduced_version),
                }
            })
            .collect();
        Ok(PreparedPathDictionaryUpdate {
            base_dictionary_id: self.current.dictionary_id,
            base_version: self.current.version,
            base_content_hash: self.current.content_hash,
            candidate,
            registrations,
        })
    }

    /// Atomically publishes a prepared candidate when its exact base remains authoritative.
    ///
    /// # Errors
    ///
    /// Returns `CON_WRITE_CONFLICT` for a stale/different base or a format lineage error for an
    /// invalid candidate. The authoritative pin is unchanged on failure.
    pub fn publish(
        &mut self,
        update: PreparedPathDictionaryUpdate,
    ) -> Result<PathDictionaryPin, PathDictionaryLifecycleError> {
        if update.base_dictionary_id != self.current.dictionary_id
            || update.base_version != self.current.version
            || update.base_content_hash != self.current.content_hash
        {
            return Err(PathDictionaryLifecycleError::WriteConflict {
                expected_version: update.base_version,
                current_version: self.current.version,
            });
        }
        if update.candidate.version == self.current.version {
            if update.candidate.snapshot != self.current.snapshot {
                return Err(PathDictionaryError::Corruption {
                    check: PathDictionaryCheck::Lineage,
                    offset: 24,
                }
                .into());
            }
            return Ok(self.current.clone());
        }
        let previous = decode_path_dictionary(self.current.snapshot.as_bytes())?;
        let next = decode_path_dictionary(update.candidate.snapshot.as_bytes())?;
        validate_path_dictionary_successor(previous, next)?;
        self.current = update.candidate;
        Ok(self.current.clone())
    }

    /// Prepares and immediately publishes one registration batch.
    ///
    /// # Errors
    ///
    /// Returns the same redacted errors as [`Self::prepare_registration`] and [`Self::publish`].
    pub fn register_paths(
        &mut self,
        paths: &[&str],
    ) -> Result<Vec<PathDictionaryRegistration>, PathDictionaryLifecycleError> {
        let update = self.prepare_registration(paths)?;
        let registrations = update.registrations.clone();
        self.publish(update)?;
        Ok(registrations)
    }

    fn from_encoded(encoded: EncodedPathDictionary) -> Result<Self, PathDictionaryLifecycleError> {
        Ok(Self {
            current: Self::pin_encoded(encoded)?,
        })
    }

    fn pin_encoded(
        encoded: EncodedPathDictionary,
    ) -> Result<PathDictionaryPin, PathDictionaryError> {
        PathDictionaryPin::from_snapshot(PathDictionarySnapshot {
            bytes: encoded.into_bytes(),
        })
    }
}

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;

    const ID: [u8; 16] = [0x44; 16];

    #[test]
    fn registration_is_atomic_idempotent_ordered_and_version_pinned()
    -> Result<(), PathDictionaryLifecycleError> {
        let mut dictionary = CollectionPathDictionary::new(ID)?;
        let genesis = dictionary.pin();
        assert!(genesis.is_empty());
        assert_eq!(genesis.version(), 0);
        assert_eq!(genesis.dictionary_id(), ID);
        assert_ne!(genesis.content_hash(), [0; 32]);
        assert_eq!(genesis.resolve_path("_id"), None);
        assert_eq!(genesis.resolve_id(0), None);
        assert_eq!(genesis.resolve_id(1), None);
        assert_eq!(genesis.introduced_version(0), None);
        assert_eq!(genesis.introduced_version(1), None);
        assert_eq!(genesis.snapshot().version()?, 0);
        assert_eq!(genesis.snapshot().dictionary_id()?, ID);

        let prepared = dictionary.prepare_registration(&["user.id", "user.email", "user.id"])?;
        assert_eq!(prepared.base_version(), 0);
        assert_eq!(prepared.candidate_version(), 1);
        assert!(prepared.changes_dictionary());
        assert_eq!(prepared.candidate_snapshot().version()?, 1);
        assert_eq!(dictionary.pin(), genesis);
        assert_eq!(
            prepared.registrations(),
            [
                PathDictionaryRegistration {
                    path_id: 2,
                    introduced_version: 1,
                },
                PathDictionaryRegistration {
                    path_id: 3,
                    introduced_version: 1,
                },
                PathDictionaryRegistration {
                    path_id: 2,
                    introduced_version: 1,
                },
            ]
        );
        let v1 = dictionary.publish(prepared)?;
        assert_eq!(v1.len(), 3);
        assert!(!v1.is_empty());
        assert_eq!(v1.resolve_path("_id"), Some(1));
        assert_eq!(v1.resolve_path("user.id"), Some(2));
        assert_eq!(v1.resolve_id(3), Some("user.email"));
        assert_eq!(v1.resolve_id(4), None);
        assert_eq!(v1.introduced_version(3), Some(1));
        assert!(genesis.is_empty());

        let no_change = dictionary.prepare_registration(&["user.id", "user.id"])?;
        assert!(!no_change.changes_dictionary());
        assert_eq!(no_change.candidate_version(), 1);
        assert_eq!(dictionary.publish(no_change)?, v1);
        let v2_results = dictionary.register_paths(&["age", "user.id"])?;
        assert_eq!(v2_results[0].path_id, 4);
        assert_eq!(v2_results[0].introduced_version, 2);
        assert_eq!(v2_results[1].path_id, 2);
        assert_eq!(v2_results[1].introduced_version, 1);
        assert_eq!(dictionary.pin().version(), 2);
        assert_eq!(v1.resolve_path("age"), None);
        Ok(())
    }

    #[test]
    fn stale_updates_invalid_paths_and_identity_fail_without_partial_publication()
    -> Result<(), PathDictionaryLifecycleError> {
        assert!(CollectionPathDictionary::new([0; 16]).is_err());
        let mut dictionary = CollectionPathDictionary::new(ID)?;
        let stale = dictionary.prepare_registration(&["a"])?;
        dictionary.register_paths(&["b"])?;
        let before = dictionary.pin();
        let conflict = dictionary
            .publish(stale)
            .err()
            .unwrap_or(PathDictionaryLifecycleError::EmptyRecovery);
        assert_eq!(conflict.code(), "CON_WRITE_CONFLICT");
        assert_eq!(conflict.to_string(), conflict.code());
        assert!(conflict.source().is_none());
        assert_eq!(dictionary.pin(), before);
        let invalid = dictionary
            .prepare_registration(&["ok", "bad..path"])
            .err()
            .unwrap_or(PathDictionaryLifecycleError::EmptyRecovery);
        assert_eq!(
            invalid,
            PathDictionaryLifecycleError::InvalidPath { index: 1 }
        );
        assert_eq!(invalid.code(), "VAL_INVALID_PATH");
        assert_eq!(dictionary.pin(), before);
        let format_error =
            PathDictionaryLifecycleError::Format(PathDictionaryError::FormatUnsupported);
        assert_eq!(format_error.code(), "CAP_FORMAT_UNSUPPORTED");
        assert!(format_error.source().is_some());
        let mut internally_corrupt = CollectionPathDictionary::new(ID)?;
        internally_corrupt.current.entries.push(OwnedPathEntry {
            path_id: 1,
            introduced_version: 1,
            path: "_id".to_owned(),
        });
        assert!(matches!(
            internally_corrupt.prepare_registration(&[]),
            Err(PathDictionaryLifecycleError::Format(
                PathDictionaryError::Corruption { .. }
            ))
        ));
        Ok(())
    }

    #[test]
    fn recovery_requires_genesis_and_proves_every_successor()
    -> Result<(), PathDictionaryLifecycleError> {
        let mut original = CollectionPathDictionary::new(ID)?;
        let v0 = original.pin().snapshot().clone();
        original.register_paths(&["a"])?;
        let v1 = original.pin().snapshot().clone();
        original.register_paths(&["b.c"])?;
        let v2 = original.pin().snapshot().clone();
        let recovered = CollectionPathDictionary::recover(&[v0.clone(), v1.clone(), v2.clone()])?;
        assert_eq!(recovered.pin(), original.pin());
        assert_eq!(PathDictionarySnapshot::from_bytes(v2.as_bytes())?, v2);
        assert_eq!(
            PathDictionaryPin::from_snapshot(v1.clone())?.resolve_path("a"),
            Some(2)
        );
        assert_eq!(
            CollectionPathDictionary::recover(&[]).err(),
            Some(PathDictionaryLifecycleError::EmptyRecovery)
        );
        let empty_error = PathDictionaryLifecycleError::EmptyRecovery;
        assert_eq!(empty_error.code(), "PAR_TRUNCATED_INPUT");
        assert_eq!(empty_error.to_string(), empty_error.code());
        assert!(empty_error.source().is_none());
        assert!(CollectionPathDictionary::recover(std::slice::from_ref(&v1)).is_err());
        assert!(CollectionPathDictionary::recover(&[v0.clone(), v2.clone()]).is_err());
        let mut damaged = v1.as_bytes().to_vec();
        damaged[0] ^= 1;
        assert!(PathDictionarySnapshot::from_bytes(&damaged).is_err());
        Ok(())
    }

    #[test]
    fn explicit_id_registration_and_noop_empty_batch_are_canonical()
    -> Result<(), PathDictionaryLifecycleError> {
        let mut dictionary = CollectionPathDictionary::new(ID)?;
        let empty = dictionary.prepare_registration(&[])?;
        assert!(!empty.changes_dictionary());
        assert!(empty.registrations().is_empty());
        assert_eq!(dictionary.publish(empty)?.version(), 0);
        let mut forged_noop = dictionary.prepare_registration(&[])?;
        forged_noop.candidate.snapshot.bytes[0] ^= 1;
        assert!(matches!(
            dictionary.publish(forged_noop),
            Err(PathDictionaryLifecycleError::Format(
                PathDictionaryError::Corruption {
                    check: PathDictionaryCheck::Lineage,
                    ..
                }
            ))
        ));
        assert_eq!(dictionary.pin().version(), 0);
        let result = dictionary.register_paths(&["_id"])?;
        assert_eq!(
            result,
            [PathDictionaryRegistration {
                path_id: 1,
                introduced_version: 1
            }]
        );
        assert_eq!(
            dictionary.pin().snapshot().as_bytes(),
            dictionary.pin().snapshot().as_bytes()
        );
        Ok(())
    }
}
// helix-coverage: exclude-end unit-tests

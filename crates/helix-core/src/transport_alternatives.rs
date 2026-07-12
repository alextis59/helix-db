//! Non-required transport prototypes used to evaluate host-owned handles and shared staging.
//!
//! These types are not component ABI resources. They exercise identity, stale-handle, exclusive
//! lease, bounds, and semantic-equivalence rules before any alternative is selected or exposed.

use crate::explicit_copy::{
    BufferError, ImmutableBuffer, ImmutableReadResult, MAXIMUM_BUFFER_BYTES,
};

/// Maximum live prototype handles, matching the accepted resource-lifecycle bound.
pub const MAXIMUM_PROTOTYPE_HANDLES: usize = 4096;

/// Failures specific to non-required transport prototypes.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AlternativeError {
    /// A region or handle store exceeds its accepted bound.
    CapacityExceeded,
    /// A supplied handle was never issued by this store.
    UnknownHandle,
    /// A previously issued handle identifies an older slot generation.
    StaleHandle,
    /// Shared staging is already under one exclusive lease.
    LeaseActive,
    /// Shared staging has no active lease to release.
    LeaseInactive,
    /// The initialized prefix would exceed fixed capacity.
    InitializedLengthOutOfBounds,
    /// The explicit-copy model rejected an otherwise valid handle operation.
    Buffer(BufferError),
}

impl From<BufferError> for AlternativeError {
    fn from(value: BufferError) -> Self {
        Self::Buffer(value)
    }
}

/// Store-local opaque identity. Fields stay private so callers cannot construct valid handles.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PrototypeHandle {
    slot: u32,
    generation: u32,
}

#[derive(Debug)]
struct HandleSlot {
    generation: u32,
    buffer: Option<ImmutableBuffer>,
}

/// Bounded generational registry for host-owned immutable-buffer experiments.
#[derive(Debug, Default)]
pub struct HostOwnedHandleStore {
    slots: Vec<HandleSlot>,
    live: usize,
}

impl HostOwnedHandleStore {
    /// Returns the number of live handle-owned buffers.
    #[must_use]
    pub fn live_handles(&self) -> usize {
        self.live
    }

    /// Inserts one immutable buffer and returns an opaque store-local identity.
    ///
    /// # Errors
    ///
    /// Returns an error when the live-handle bound is exhausted.
    pub fn insert(&mut self, buffer: ImmutableBuffer) -> Result<PrototypeHandle, AlternativeError> {
        if self.live >= MAXIMUM_PROTOTYPE_HANDLES {
            return Err(AlternativeError::CapacityExceeded);
        }
        if let Some((slot, entry)) = self
            .slots
            .iter_mut()
            .enumerate()
            .find(|(_, entry)| entry.buffer.is_none())
        {
            entry.generation = entry.generation.wrapping_add(1).max(1);
            entry.buffer = Some(buffer);
            self.live += 1;
            #[allow(
                clippy::cast_possible_truncation,
                reason = "the live handle bound limits every slot below 4096"
            )]
            let slot = slot as u32;
            return Ok(PrototypeHandle {
                slot,
                generation: entry.generation,
            });
        }
        #[allow(
            clippy::cast_possible_truncation,
            reason = "the live handle bound limits every slot below 4096"
        )]
        let slot = self.slots.len() as u32;
        self.slots.push(HandleSlot {
            generation: 1,
            buffer: Some(buffer),
        });
        self.live += 1;
        Ok(PrototypeHandle {
            slot,
            generation: 1,
        })
    }

    /// Reads through a live handle using the explicit-copy reference semantics.
    ///
    /// # Errors
    ///
    /// Returns an error for unknown/stale handles or rejected explicit-copy reads.
    pub fn read(
        &self,
        handle: PrototypeHandle,
        offset: u64,
        length: u32,
    ) -> Result<ImmutableReadResult, AlternativeError> {
        self.resolve(handle)?
            .read(offset, length)
            .map_err(Into::into)
    }

    /// Removes and returns the uniquely owned immutable buffer.
    ///
    /// # Errors
    ///
    /// Returns an error for unknown or stale handles without changing the store.
    pub fn remove(&mut self, handle: PrototypeHandle) -> Result<ImmutableBuffer, AlternativeError> {
        let index = handle.slot as usize;
        let Some(entry) = self.slots.get_mut(index) else {
            return Err(AlternativeError::UnknownHandle);
        };
        if entry.generation != handle.generation {
            return Err(AlternativeError::StaleHandle);
        }
        let Some(buffer) = entry.buffer.take() else {
            return Err(AlternativeError::StaleHandle);
        };
        self.live -= 1;
        Ok(buffer)
    }

    fn resolve(&self, handle: PrototypeHandle) -> Result<&ImmutableBuffer, AlternativeError> {
        let Some(entry) = self.slots.get(handle.slot as usize) else {
            return Err(AlternativeError::UnknownHandle);
        };
        if entry.generation != handle.generation {
            return Err(AlternativeError::StaleHandle);
        }
        entry.buffer.as_ref().ok_or(AlternativeError::StaleHandle)
    }
}

/// Safe same-address-space model for an exclusively leased shared-staging region.
#[derive(Debug, Eq, PartialEq)]
pub struct SharedStagingPrototype {
    bytes: Box<[u8]>,
    initialized_length: usize,
    leased: bool,
}

impl SharedStagingPrototype {
    /// Allocates a zeroed fixed-capacity prototype region.
    ///
    /// # Errors
    ///
    /// Returns an error above the accepted 16 MiB buffer bound.
    pub fn allocate(capacity: usize) -> Result<Self, AlternativeError> {
        if capacity > MAXIMUM_BUFFER_BYTES {
            return Err(AlternativeError::CapacityExceeded);
        }
        Ok(Self {
            bytes: vec![0; capacity].into_boxed_slice(),
            initialized_length: 0,
            leased: false,
        })
    }

    /// Begins one exclusive lease over a zeroed initialized prefix.
    ///
    /// # Errors
    ///
    /// Returns an error if a lease is active or the requested prefix exceeds capacity.
    pub fn begin_lease(&mut self, initialized_length: usize) -> Result<(), AlternativeError> {
        if self.leased {
            return Err(AlternativeError::LeaseActive);
        }
        if initialized_length > self.bytes.len() {
            return Err(AlternativeError::InitializedLengthOutOfBounds);
        }
        self.bytes[..initialized_length].fill(0);
        self.initialized_length = initialized_length;
        self.leased = true;
        Ok(())
    }

    /// Returns the exclusively leased initialized prefix for direct same-process mutation.
    ///
    /// # Errors
    ///
    /// Returns an error when no lease is active.
    pub fn leased_bytes_mut(&mut self) -> Result<&mut [u8], AlternativeError> {
        if !self.leased {
            return Err(AlternativeError::LeaseInactive);
        }
        Ok(&mut self.bytes[..self.initialized_length])
    }

    /// Ends the active lease while retaining the initialized prefix.
    ///
    /// # Errors
    ///
    /// Returns an error when no lease is active.
    pub fn end_lease(&mut self) -> Result<(), AlternativeError> {
        if !self.leased {
            return Err(AlternativeError::LeaseInactive);
        }
        self.leased = false;
        Ok(())
    }

    /// Copies the initialized prefix for comparison with the required explicit-copy baseline.
    ///
    /// # Errors
    ///
    /// Returns an error while a mutable lease remains active.
    pub fn snapshot_copy(&self) -> Result<Vec<u8>, AlternativeError> {
        if self.leased {
            return Err(AlternativeError::LeaseActive);
        }
        Ok(self.bytes[..self.initialized_length].to_vec())
    }
}

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;
    use crate::explicit_copy::MutableStagingBuffer;

    fn immutable(bytes: &[u8]) -> Result<ImmutableBuffer, BufferError> {
        let mut staging = MutableStagingBuffer::allocate(bytes.len() as u64)?;
        staging.write(0, bytes)?;
        staging.seal(bytes.len() as u64)
    }

    #[test]
    fn handle_store_preserves_copy_semantics_and_rejects_stale_identity() {
        let source = immutable(b"handle-bytes");
        assert!(source.is_ok());
        let Ok(source) = source else { return };
        let mut store = HostOwnedHandleStore::default();
        let handle = store.insert(source);
        assert!(handle.is_ok());
        let Ok(handle) = handle else { return };
        assert_eq!(store.live_handles(), 1);
        assert_eq!(
            store.read(handle, 7, 5).map(|value| value.bytes),
            Ok(b"bytes".to_vec())
        );
        assert!(store.remove(handle).is_ok());
        assert_eq!(store.live_handles(), 0);
        assert_eq!(store.read(handle, 0, 1), Err(AlternativeError::StaleHandle));
        assert_eq!(store.remove(handle), Err(AlternativeError::StaleHandle));

        let replacement = immutable(b"new");
        assert!(replacement.is_ok());
        let Ok(replacement) = replacement else { return };
        let next = store.insert(replacement);
        assert!(next.is_ok());
        let Ok(next) = next else { return };
        assert_ne!(next, handle);
        assert_eq!(store.read(handle, 0, 1), Err(AlternativeError::StaleHandle));
        assert_eq!(store.remove(handle), Err(AlternativeError::StaleHandle));
        assert_eq!(
            store.read(next, u64::MAX, 1),
            Err(AlternativeError::Buffer(BufferError::OffsetOutOfBounds))
        );
    }

    #[test]
    fn shared_staging_requires_one_lease_and_matches_explicit_copy_bytes() {
        let region = SharedStagingPrototype::allocate(8);
        assert!(region.is_ok());
        let Ok(mut region) = region else { return };
        assert_eq!(
            region.leased_bytes_mut(),
            Err(AlternativeError::LeaseInactive)
        );
        assert_eq!(region.begin_lease(5), Ok(()));
        assert_eq!(region.begin_lease(5), Err(AlternativeError::LeaseActive));
        let bytes = region.leased_bytes_mut();
        assert!(bytes.is_ok());
        if let Ok(bytes) = bytes {
            bytes.copy_from_slice(b"hello");
        }
        assert_eq!(region.snapshot_copy(), Err(AlternativeError::LeaseActive));
        assert_eq!(region.end_lease(), Ok(()));
        assert_eq!(region.end_lease(), Err(AlternativeError::LeaseInactive));
        assert_eq!(region.snapshot_copy(), Ok(b"hello".to_vec()));
    }

    #[test]
    fn prototype_bounds_and_unknown_handles_fail_closed() {
        assert_eq!(
            SharedStagingPrototype::allocate(MAXIMUM_BUFFER_BYTES + 1),
            Err(AlternativeError::CapacityExceeded)
        );
        let region = SharedStagingPrototype::allocate(2);
        assert!(region.is_ok());
        let Ok(mut region) = region else { return };
        assert_eq!(
            region.begin_lease(3),
            Err(AlternativeError::InitializedLengthOutOfBounds)
        );

        let mut store = HostOwnedHandleStore::default();
        let forged = PrototypeHandle {
            slot: 99,
            generation: 1,
        };
        assert_eq!(
            store.read(forged, 0, 0),
            Err(AlternativeError::UnknownHandle)
        );
        assert_eq!(store.remove(forged), Err(AlternativeError::UnknownHandle));

        for _ in 0..MAXIMUM_PROTOTYPE_HANDLES {
            let buffer = immutable(&[]);
            assert!(buffer.is_ok());
            let Ok(buffer) = buffer else { return };
            assert!(store.insert(buffer).is_ok());
        }
        let overflow = immutable(&[]);
        assert!(overflow.is_ok());
        let Ok(overflow) = overflow else { return };
        assert_eq!(
            store.insert(overflow),
            Err(AlternativeError::CapacityExceeded)
        );
    }
}
// helix-coverage: exclude-end unit-tests

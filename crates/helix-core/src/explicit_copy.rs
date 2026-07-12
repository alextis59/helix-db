//! Deterministic explicit-copy reference transport for the component buffer contract.
//!
//! Hosts retain resource ownership. This model fixes observable copy, bounds, initialization, and
//! failure-atomicity semantics so mock, native, and browser hosts can share conformance vectors.

/// Maximum bytes held by one buffer or copied by one boundary operation.
pub const MAXIMUM_BUFFER_BYTES: usize = 16 * 1024 * 1024;
const MAXIMUM_BUFFER_BYTES_U32: u32 = 16 * 1024 * 1024;
const MAXIMUM_BUFFER_BYTES_U64: u64 = 16 * 1024 * 1024;

#[allow(
    clippy::cast_possible_truncation,
    reason = "callers prove the value is at most the 16 MiB ABI bound"
)]
fn bounded_usize(value: u64) -> usize {
    value as usize
}

/// Stable reference-model failures. Host bindings map these to versioned `helix-error` values.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BufferError {
    /// Allocation or mutation exceeds the fixed buffer capacity.
    CapacityExceeded,
    /// Seal input disagrees with the host-tracked initialized length.
    InitializedLengthMismatch,
    /// A read or write offset is outside its valid range.
    OffsetOutOfBounds,
    /// An exact source copy is not fully contained by the immutable source.
    SourceRangeOutOfBounds,
    /// One operation attempts to copy more than the ABI maximum.
    TransferTooLarge,
    /// A staging write would expose an uninitialized hole.
    UninitializedGap,
}

/// Successful detached immutable read.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImmutableReadResult {
    /// Source offset used for the read.
    pub offset: u64,
    /// Detached copied bytes.
    pub bytes: Vec<u8>,
    /// Whether the returned range reaches the immutable buffer end.
    pub end_of_buffer: bool,
}

/// Successful staging mutation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StagingWriteResult {
    /// Exact number of bytes copied by the operation.
    pub bytes_written: u32,
    /// Host-tracked initialized prefix after the operation.
    pub initialized_length: u64,
}

/// Host-owned immutable bytes represented by the portable conformance model.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImmutableBuffer {
    bytes: Box<[u8]>,
}

impl ImmutableBuffer {
    /// Returns the immutable byte length.
    #[must_use]
    pub fn length(&self) -> u64 {
        self.bytes.len() as u64
    }

    /// Copies at most `length` bytes into a detached result, shortening only at end-of-buffer.
    ///
    /// # Errors
    ///
    /// Returns an error when the offset is outside the buffer or the requested transfer exceeds
    /// the ABI bound.
    pub fn read(&self, offset: u64, length: u32) -> Result<ImmutableReadResult, BufferError> {
        if offset > MAXIMUM_BUFFER_BYTES_U64 {
            return Err(BufferError::OffsetOutOfBounds);
        }
        if length > MAXIMUM_BUFFER_BYTES_U32 {
            return Err(BufferError::TransferTooLarge);
        }
        let offset = bounded_usize(offset);
        let length = length as usize;
        if offset > self.bytes.len() {
            return Err(BufferError::OffsetOutOfBounds);
        }
        let end = offset.saturating_add(length).min(self.bytes.len());
        Ok(ImmutableReadResult {
            offset: offset as u64,
            bytes: self.bytes[offset..end].to_vec(),
            end_of_buffer: end == self.bytes.len(),
        })
    }

    #[must_use]
    /// Returns an equal byte sequence under a distinct owned value.
    pub fn duplicate(&self) -> Self {
        Self {
            bytes: self.bytes.clone(),
        }
    }
}

/// Host-owned mutable staging bytes represented by the portable conformance model.
#[derive(Debug, Eq, PartialEq)]
pub struct MutableStagingBuffer {
    bytes: Box<[u8]>,
    initialized_length: usize,
}

impl MutableStagingBuffer {
    /// Allocates a zeroed fixed-capacity staging buffer with initialized length zero.
    ///
    /// # Errors
    ///
    /// Returns an error when capacity exceeds the ABI bound or the platform address range.
    pub fn allocate(capacity: u64) -> Result<Self, BufferError> {
        if capacity > MAXIMUM_BUFFER_BYTES_U64 {
            return Err(BufferError::CapacityExceeded);
        }
        let capacity = bounded_usize(capacity);
        Ok(Self {
            bytes: vec![0; capacity].into_boxed_slice(),
            initialized_length: 0,
        })
    }

    #[must_use]
    /// Returns the fixed staging capacity.
    pub fn capacity(&self) -> u64 {
        self.bytes.len() as u64
    }

    #[must_use]
    /// Returns the initialized prefix length.
    pub fn initialized_length(&self) -> u64 {
        self.initialized_length as u64
    }

    /// Copies bytes into the initialized prefix or appends contiguously, atomically on failure.
    ///
    /// # Errors
    ///
    /// Returns an error for an uninitialized gap, capacity overflow, invalid offset, or transfer
    /// above the ABI bound. The target is unchanged on every error.
    pub fn write(&mut self, offset: u64, source: &[u8]) -> Result<StagingWriteResult, BufferError> {
        if offset > MAXIMUM_BUFFER_BYTES_U64 {
            return Err(BufferError::OffsetOutOfBounds);
        }
        if source.len() > MAXIMUM_BUFFER_BYTES {
            return Err(BufferError::TransferTooLarge);
        }
        let offset = bounded_usize(offset);
        if offset > self.initialized_length {
            return Err(BufferError::UninitializedGap);
        }
        let end = offset
            .checked_add(source.len())
            .ok_or(BufferError::CapacityExceeded)?;
        if end > self.bytes.len() {
            return Err(BufferError::CapacityExceeded);
        }
        #[allow(
            clippy::cast_possible_truncation,
            reason = "source length is bounded below u32::MAX above"
        )]
        let bytes_written = source.len() as u32;
        self.bytes[offset..end].copy_from_slice(source);
        self.initialized_length = self.initialized_length.max(end);
        Ok(StagingWriteResult {
            bytes_written,
            initialized_length: self.initialized_length as u64,
        })
    }

    /// Copies one exact immutable range into staging, atomically on failure.
    ///
    /// # Errors
    ///
    /// Returns an error when the source range is incomplete or the target write violates any
    /// staging rule. The target is unchanged on every error.
    pub fn copy_from(
        &mut self,
        source: &ImmutableBuffer,
        source_offset: u64,
        target_offset: u64,
        length: u32,
    ) -> Result<StagingWriteResult, BufferError> {
        if source_offset > MAXIMUM_BUFFER_BYTES_U64 {
            return Err(BufferError::SourceRangeOutOfBounds);
        }
        if length > MAXIMUM_BUFFER_BYTES_U32 {
            return Err(BufferError::TransferTooLarge);
        }
        let source_offset = bounded_usize(source_offset);
        let length = length as usize;
        let source_end = source_offset
            .checked_add(length)
            .ok_or(BufferError::SourceRangeOutOfBounds)?;
        if source_end > source.bytes.len() {
            return Err(BufferError::SourceRangeOutOfBounds);
        }
        self.write(target_offset, &source.bytes[source_offset..source_end])
    }

    /// Consumes staging and returns its initialized prefix when the supplied length matches.
    ///
    /// # Errors
    ///
    /// Returns an error without a resource when the supplied and tracked lengths differ.
    pub fn seal(self, initialized_length: u64) -> Result<ImmutableBuffer, BufferError> {
        if initialized_length != self.initialized_length as u64 {
            return Err(BufferError::InitializedLengthMismatch);
        }
        Ok(ImmutableBuffer {
            bytes: self.bytes[..self.initialized_length]
                .to_vec()
                .into_boxed_slice(),
        })
    }
}

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;

    fn sealed(bytes: &[u8]) -> Result<ImmutableBuffer, BufferError> {
        let mut staging = MutableStagingBuffer::allocate(bytes.len() as u64)?;
        staging.write(0, bytes)?;
        staging.seal(bytes.len() as u64)
    }

    #[test]
    fn explicit_copy_round_trip_is_detached_and_bounded() {
        let source = sealed(b"abcdef");
        assert!(source.is_ok(), "bounded setup must succeed");
        let Ok(source) = source else {
            return;
        };
        let duplicate = source.duplicate();
        let read = source.read(2, 8);
        assert!(read.is_ok(), "bounded read must succeed");
        let Ok(read) = read else {
            return;
        };
        assert_eq!(read.bytes, b"cdef");
        assert!(read.end_of_buffer);
        assert_eq!(source, duplicate);

        let target = MutableStagingBuffer::allocate(8);
        assert!(target.is_ok(), "allocation must succeed");
        let Ok(mut target) = target else {
            return;
        };
        let copied = target.copy_from(&source, 1, 0, 4);
        assert!(copied.is_ok(), "in-range copy must succeed");
        let Ok(copied) = copied else {
            return;
        };
        assert_eq!(copied.bytes_written, 4);
        assert_eq!(copied.initialized_length, 4);
        assert_eq!(target.seal(4), sealed(b"bcde"));
    }

    #[test]
    fn staging_writes_are_contiguous_overwritable_and_failure_atomic() {
        let staging = MutableStagingBuffer::allocate(6);
        assert!(staging.is_ok(), "allocation must succeed");
        let Ok(mut staging) = staging else {
            return;
        };
        assert_eq!(staging.capacity(), 6);
        assert_eq!(staging.initialized_length(), 0);
        assert_eq!(
            staging
                .write(0, b"abcd")
                .map(|value| value.initialized_length),
            Ok(4)
        );
        assert_eq!(
            staging
                .write(2, b"XY")
                .map(|value| value.initialized_length),
            Ok(4)
        );
        assert_eq!(
            staging.write(4, b"z").map(|value| value.initialized_length),
            Ok(5)
        );

        assert_eq!(staging.write(6, b"x"), Err(BufferError::UninitializedGap));
        assert_eq!(staging.write(5, b"xx"), Err(BufferError::CapacityExceeded));
        assert_eq!(staging.initialized_length(), 5);
        assert_eq!(staging.seal(5), sealed(b"abXYz"));
    }

    #[test]
    fn invalid_reads_copies_seals_and_allocations_fail_closed() {
        assert_eq!(
            MutableStagingBuffer::allocate(MAXIMUM_BUFFER_BYTES as u64 + 1),
            Err(BufferError::CapacityExceeded)
        );
        let source = sealed(b"abc");
        assert!(source.is_ok(), "bounded setup must succeed");
        let Ok(source) = source else {
            return;
        };
        assert_eq!(source.length(), 3);
        assert_eq!(
            source.read(0, MAXIMUM_BUFFER_BYTES_U32 + 1),
            Err(BufferError::TransferTooLarge)
        );
        assert_eq!(
            source.read(u64::MAX, 0),
            Err(BufferError::OffsetOutOfBounds)
        );
        assert_eq!(source.read(4, 1), Err(BufferError::OffsetOutOfBounds));
        let target = MutableStagingBuffer::allocate(3);
        assert!(target.is_ok(), "allocation must succeed");
        let Ok(mut target) = target else {
            return;
        };
        let oversized = vec![0; MAXIMUM_BUFFER_BYTES + 1];
        assert_eq!(
            target.write(0, &oversized),
            Err(BufferError::TransferTooLarge)
        );
        assert_eq!(
            target.write(u64::MAX, &[]),
            Err(BufferError::OffsetOutOfBounds)
        );
        assert_eq!(
            target.copy_from(&source, 0, 0, MAXIMUM_BUFFER_BYTES_U32 + 1),
            Err(BufferError::TransferTooLarge)
        );
        assert_eq!(
            target.copy_from(&source, u64::MAX, 0, 0),
            Err(BufferError::SourceRangeOutOfBounds)
        );
        assert_eq!(
            target.copy_from(&source, 2, 0, 2),
            Err(BufferError::SourceRangeOutOfBounds)
        );
        assert_eq!(target.initialized_length(), 0);
        assert_eq!(target.seal(1), Err(BufferError::InitializedLengthMismatch));
    }
}
// helix-coverage: exclude-end unit-tests

//! Deterministic in-memory mock for every imported `helix:core-abi@7.0.0` host call.
//!
//! Calls are bounded, recorded in one total order, and may fail at an exact per-kind occurrence.
//! The crate contains no ambient I/O, clock, randomness, thread, process, network, or device access.

#![allow(
    clippy::missing_errors_doc,
    reason = "all ABI methods share the module-level injection contract and return typed validation errors"
)]

use std::collections::BTreeMap;

use helix_core::deterministic_inputs::{
    ClockRole, ClockSample, DeterministicInputs, ExecutionProfile, InjectionError, RandomPurpose,
};
use helix_core::explicit_copy::{
    BufferError, ImmutableBuffer, ImmutableReadResult, MutableStagingBuffer, StagingWriteResult,
};

/// Maximum failure rules retained by one mock host.
pub const MAXIMUM_FAILURE_RULES: usize = 4096;
/// Maximum call records retained by one mock host.
pub const MAXIMUM_CALL_RECORDS: usize = 16_384;
/// Maximum requests in one mock storage batch.
pub const MAXIMUM_BATCH_REQUESTS: usize = 1024;
/// Maximum bytes in one mock file.
pub const MAXIMUM_FILE_BYTES: usize = 16 * 1024 * 1024;

/// Every imported ABI 7 host call, including host-owned resource methods.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum CapabilityCall {
    /// `immutable-buffer.length`.
    ImmutableBufferLength,
    /// `mutable-staging-buffer.capacity`.
    MutableStagingCapacity,
    /// `mutable-staging-buffer.initialized-length`.
    MutableStagingInitializedLength,
    /// `opaque-handle.descriptor`.
    OpaqueHandleDescriptor,
    /// `host-resources.allocate-staging`.
    AllocateStaging,
    /// `host-resources.seal-staging`.
    SealStaging,
    /// `host-resources.duplicate-immutable`.
    DuplicateImmutable,
    /// `host-resources.read-immutable`.
    ReadImmutable,
    /// `host-resources.write-staging`.
    WriteStaging,
    /// `host-resources.copy-immutable-to-staging`.
    CopyImmutableToStaging,
    /// `host-files.read-batch`.
    ReadBatch,
    /// `host-files.write-batch`.
    WriteBatch,
    /// `host-directories.rename-batch`.
    RenameBatch,
    /// `host-directories.list-batch`.
    ListBatch,
    /// `host-directories.delete-batch`.
    DeleteBatch,
    /// `host-durability.sync-batch`.
    SyncBatch,
    /// `host-timers.read-clock`.
    ReadClock,
    /// `host-randomness.read-random`.
    ReadRandom,
    /// `host-control.poll-cancellation`.
    PollCancellation,
    /// `host-control.lifecycle`.
    Lifecycle,
    /// `host-control.capture-execution-profile`.
    CaptureExecutionProfile,
}

/// All imported call kinds in stable ABI inventory order.
pub const ALL_CAPABILITY_CALLS: [CapabilityCall; 21] = [
    CapabilityCall::ImmutableBufferLength,
    CapabilityCall::MutableStagingCapacity,
    CapabilityCall::MutableStagingInitializedLength,
    CapabilityCall::OpaqueHandleDescriptor,
    CapabilityCall::AllocateStaging,
    CapabilityCall::SealStaging,
    CapabilityCall::DuplicateImmutable,
    CapabilityCall::ReadImmutable,
    CapabilityCall::WriteStaging,
    CapabilityCall::CopyImmutableToStaging,
    CapabilityCall::ReadBatch,
    CapabilityCall::WriteBatch,
    CapabilityCall::RenameBatch,
    CapabilityCall::ListBatch,
    CapabilityCall::DeleteBatch,
    CapabilityCall::SyncBatch,
    CapabilityCall::ReadClock,
    CapabilityCall::ReadRandom,
    CapabilityCall::PollCancellation,
    CapabilityCall::Lifecycle,
    CapabilityCall::CaptureExecutionProfile,
];

/// Stable mock fault selectable by a deterministic failure rule.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MockFault {
    /// Required capability is unavailable.
    HostUnavailable,
    /// Granted scope denies the request.
    PermissionDenied,
    /// Host I/O fails before a confirmed mutation.
    Io,
    /// Clock quality is not safe for the requested role.
    ClockUnsafe,
    /// Memory or admission budget is exhausted.
    QuotaMemory,
    /// Cooperative cancellation is observed.
    Cancelled,
    /// Monotonic deadline is exceeded.
    DeadlineExceeded,
    /// GPU/device capability is lost.
    DeviceLost,
}

impl MockFault {
    const fn code(self) -> &'static str {
        match self {
            Self::HostUnavailable => "CAP_HOST_UNAVAILABLE",
            Self::PermissionDenied => "AUTH_SCOPE_DENIED",
            Self::Io => "IO_HOST_FAILURE",
            Self::ClockUnsafe => "CAP_CLOCK_UNSAFE",
            Self::QuotaMemory => "QUOTA_MEMORY",
            Self::Cancelled => "DEADLINE_CANCELLED",
            Self::DeadlineExceeded => "DEADLINE_EXCEEDED",
            Self::DeviceLost => "CAP_GPU_DEVICE_LOST",
        }
    }
}

/// Mutation certainty carried by an injected or model-produced failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MockMutationOutcome {
    /// The call cannot mutate state.
    NotApplicable,
    /// The host proves no mutation committed.
    NotCommitted,
    /// The host proves the mutation committed.
    Committed,
    /// The host cannot determine whether a mutation committed.
    Unknown,
}

/// Stable mock-host error.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MockError {
    /// Stable versioned error code.
    pub code: &'static str,
    /// Mutation certainty.
    pub outcome: MockMutationOutcome,
}

impl MockError {
    const fn new(code: &'static str, outcome: MockMutationOutcome) -> Self {
        Self { code, outcome }
    }
}

/// One exact per-call occurrence failure.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct FailureRule {
    /// Call kind to fail.
    pub call: CapabilityCall,
    /// One-based occurrence of that call kind.
    pub occurrence: u64,
    /// Injected stable fault.
    pub fault: MockFault,
    /// Injected mutation certainty.
    pub outcome: MockMutationOutcome,
}

/// Recorded call result class.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RecordedResult {
    /// Call returned a success value.
    Success,
    /// Call returned this stable error code.
    Error(&'static str),
}

/// One total-order call record.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CallRecord {
    /// Zero-based total call sequence.
    pub sequence: u64,
    /// Imported call kind.
    pub call: CapabilityCall,
    /// One-based per-kind occurrence.
    pub occurrence: u64,
    /// Observable result class.
    pub result: RecordedResult,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct CallTicket {
    sequence: u64,
    call: CapabilityCall,
    occurrence: u64,
}

/// Redacted opaque-handle descriptor used by the mock resource method.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MockHandleDescriptor {
    /// Stable handle kind.
    pub kind: String,
    /// Bounded redacted name.
    pub name: String,
    /// Descriptor version.
    pub version: (u16, u16),
}

/// Host lifecycle returned by the mock control call.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MockLifecycle {
    /// New work may be admitted.
    Running,
    /// New work is rejected while admitted work drains.
    Draining,
    /// Every operation is rejected.
    Stopped,
}

/// Deterministic file read request.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReadRequest {
    /// Relative granted path.
    pub path: String,
    /// Byte offset.
    pub offset: u64,
    /// Maximum requested bytes.
    pub length: u32,
}

/// Deterministic file read result.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReadResult {
    /// Source offset.
    pub offset: u64,
    /// Detached bytes.
    pub bytes: Vec<u8>,
    /// Whether the returned range reaches file end.
    pub end_of_file: bool,
}

/// Deterministic file write request.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WriteRequest {
    /// Relative granted path.
    pub path: String,
    /// Existing-prefix overwrite or contiguous append offset.
    pub offset: u64,
    /// Exact copied bytes.
    pub bytes: Vec<u8>,
}

/// Deterministic file write result.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct WriteResult {
    /// Target offset.
    pub offset: u64,
    /// Exact bytes written.
    pub bytes_written: u32,
}

/// Deterministic rename request.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RenameRequest {
    /// Existing relative source path.
    pub source: String,
    /// Relative destination path.
    pub destination: String,
    /// Whether an existing destination may be replaced.
    pub replace: bool,
}

/// Deterministic delete request.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeleteRequest {
    /// Relative file path.
    pub path: String,
}

/// In-memory deterministic ABI 7 host with exact failure injection.
#[derive(Debug)]
pub struct MockHost {
    rules: Vec<FailureRule>,
    occurrences: BTreeMap<CapabilityCall, u64>,
    records: Vec<CallRecord>,
    next_sequence: u64,
    files: BTreeMap<String, Vec<u8>>,
    inputs: DeterministicInputs,
    profile: ExecutionProfile,
    lifecycle: MockLifecycle,
}

impl MockHost {
    /// Creates a bounded mock host after validating unique nonzero failure occurrences.
    ///
    /// # Errors
    ///
    /// Returns an error for too many, duplicate, or zero-occurrence failure rules.
    pub fn new(
        rules: Vec<FailureRule>,
        inputs: DeterministicInputs,
        profile: ExecutionProfile,
    ) -> Result<Self, MockError> {
        if rules.len() > MAXIMUM_FAILURE_RULES
            || rules.iter().any(|rule| rule.occurrence == 0)
            || rules.iter().enumerate().any(|(index, rule)| {
                rules[..index]
                    .iter()
                    .any(|prior| prior.call == rule.call && prior.occurrence == rule.occurrence)
            })
        {
            return Err(MockError::new(
                "MOCK_INVALID_FAILURE_PLAN",
                MockMutationOutcome::NotApplicable,
            ));
        }
        profile.clone().validate().map_err(Self::input_error)?;
        Ok(Self {
            rules,
            occurrences: BTreeMap::new(),
            records: Vec::new(),
            next_sequence: 0,
            files: BTreeMap::new(),
            inputs,
            profile,
            lifecycle: MockLifecycle::Running,
        })
    }

    /// Returns the immutable total-order call log.
    #[must_use]
    pub fn records(&self) -> &[CallRecord] {
        &self.records
    }

    /// Replaces the explicit lifecycle state used by the next control query.
    pub fn set_lifecycle(&mut self, lifecycle: MockLifecycle) {
        self.lifecycle = lifecycle;
    }

    /// Seeds a bounded relative file without recording a capability call.
    ///
    /// # Errors
    ///
    /// Returns an error for an invalid path or oversized value.
    pub fn seed_file(&mut self, path: String, bytes: Vec<u8>) -> Result<(), MockError> {
        Self::validate_path(&path)?;
        if bytes.len() > MAXIMUM_FILE_BYTES {
            return Err(Self::limit_error());
        }
        self.files.insert(path, bytes);
        Ok(())
    }

    fn begin(&mut self, call: CapabilityCall) -> Result<CallTicket, MockError> {
        if self.records.len() >= MAXIMUM_CALL_RECORDS {
            return Err(MockError::new(
                "MOCK_CALL_LOG_LIMIT",
                MockMutationOutcome::NotApplicable,
            ));
        }
        let occurrence = self.occurrences.entry(call).or_default();
        *occurrence = occurrence.saturating_add(1);
        let ticket = CallTicket {
            sequence: self.next_sequence,
            call,
            occurrence: *occurrence,
        };
        self.next_sequence = self.next_sequence.saturating_add(1);
        let lifecycle_error = match self.lifecycle {
            MockLifecycle::Stopped if call != CapabilityCall::Lifecycle => Some(MockError::new(
                "HOST_STOPPED",
                MockMutationOutcome::NotApplicable,
            )),
            MockLifecycle::Draining if Self::is_admission_call(call) => Some(MockError::new(
                "HOST_DRAINING",
                MockMutationOutcome::NotCommitted,
            )),
            _ => None,
        };
        if let Some(error) = lifecycle_error {
            self.records.push(CallRecord {
                sequence: ticket.sequence,
                call,
                occurrence: ticket.occurrence,
                result: RecordedResult::Error(error.code),
            });
            return Err(error);
        }
        if let Some(index) = self
            .rules
            .iter()
            .position(|rule| rule.call == call && rule.occurrence == ticket.occurrence)
        {
            let rule = self.rules.remove(index);
            let error = MockError::new(rule.fault.code(), rule.outcome);
            self.records.push(CallRecord {
                sequence: ticket.sequence,
                call,
                occurrence: ticket.occurrence,
                result: RecordedResult::Error(error.code),
            });
            return Err(error);
        }
        Ok(ticket)
    }

    const fn is_admission_call(call: CapabilityCall) -> bool {
        matches!(
            call,
            CapabilityCall::ReadBatch
                | CapabilityCall::WriteBatch
                | CapabilityCall::RenameBatch
                | CapabilityCall::ListBatch
                | CapabilityCall::DeleteBatch
                | CapabilityCall::SyncBatch
        )
    }

    fn finish<T>(
        &mut self,
        ticket: CallTicket,
        result: Result<T, MockError>,
    ) -> Result<T, MockError> {
        let recorded = match result {
            Ok(_) => RecordedResult::Success,
            Err(error) => RecordedResult::Error(error.code),
        };
        self.records.push(CallRecord {
            sequence: ticket.sequence,
            call: ticket.call,
            occurrence: ticket.occurrence,
            result: recorded,
        });
        result
    }

    fn input_error(error: InjectionError) -> MockError {
        let code = match error {
            InjectionError::MemoryBudgetExceeded => "QUOTA_MEMORY",
            InjectionError::UnsupportedProfileVersion => "CAP_UNSUPPORTED_VERSION",
            InjectionError::ClockInputExhausted
            | InjectionError::RandomInputExhausted
            | InjectionError::InputMismatch => "MOCK_INPUT_MISMATCH",
            _ => "MOCK_INVALID_INPUT",
        };
        MockError::new(code, MockMutationOutcome::NotApplicable)
    }

    fn buffer_error(_error: BufferError) -> MockError {
        MockError::new("IO_BUFFER_CONTRACT", MockMutationOutcome::NotApplicable)
    }

    fn limit_error() -> MockError {
        MockError::new("QUOTA_LIMIT_EXCEEDED", MockMutationOutcome::NotCommitted)
    }

    fn validate_batch(length: usize) -> Result<(), MockError> {
        if length > MAXIMUM_BATCH_REQUESTS {
            return Err(Self::limit_error());
        }
        Ok(())
    }

    fn validate_path(path: &str) -> Result<(), MockError> {
        if path.is_empty()
            || path.len() > 4096
            || path.starts_with('/')
            || path.split('/').any(|part| part.is_empty() || part == "..")
        {
            return Err(MockError::new(
                "AUTH_SCOPE_DENIED",
                MockMutationOutcome::NotCommitted,
            ));
        }
        Ok(())
    }

    /// Implements `immutable-buffer.length`.
    pub fn immutable_buffer_length(&mut self, buffer: &ImmutableBuffer) -> Result<u64, MockError> {
        let ticket = self.begin(CapabilityCall::ImmutableBufferLength)?;
        self.finish(ticket, Ok(buffer.length()))
    }

    /// Implements `mutable-staging-buffer.capacity`.
    pub fn mutable_staging_capacity(
        &mut self,
        buffer: &MutableStagingBuffer,
    ) -> Result<u64, MockError> {
        let ticket = self.begin(CapabilityCall::MutableStagingCapacity)?;
        self.finish(ticket, Ok(buffer.capacity()))
    }

    /// Implements `mutable-staging-buffer.initialized-length`.
    pub fn mutable_staging_initialized_length(
        &mut self,
        buffer: &MutableStagingBuffer,
    ) -> Result<u64, MockError> {
        let ticket = self.begin(CapabilityCall::MutableStagingInitializedLength)?;
        self.finish(ticket, Ok(buffer.initialized_length()))
    }

    /// Implements `opaque-handle.descriptor`.
    pub fn opaque_handle_descriptor(
        &mut self,
        descriptor: &MockHandleDescriptor,
    ) -> Result<MockHandleDescriptor, MockError> {
        let ticket = self.begin(CapabilityCall::OpaqueHandleDescriptor)?;
        let result = if descriptor.name.is_empty() || descriptor.name.len() > 64 {
            Err(MockError::new(
                "VAL_HANDLE_DESCRIPTOR",
                MockMutationOutcome::NotApplicable,
            ))
        } else {
            Ok(descriptor.clone())
        };
        self.finish(ticket, result)
    }

    /// Implements `host-resources.allocate-staging`.
    pub fn allocate_staging(&mut self, capacity: u64) -> Result<MutableStagingBuffer, MockError> {
        let ticket = self.begin(CapabilityCall::AllocateStaging)?;
        let result = MutableStagingBuffer::allocate(capacity).map_err(Self::buffer_error);
        self.finish(ticket, result)
    }

    /// Implements `host-resources.seal-staging`.
    pub fn seal_staging(
        &mut self,
        buffer: MutableStagingBuffer,
        initialized_length: u64,
    ) -> Result<ImmutableBuffer, MockError> {
        let ticket = self.begin(CapabilityCall::SealStaging)?;
        let result = buffer.seal(initialized_length).map_err(Self::buffer_error);
        self.finish(ticket, result)
    }

    /// Implements `host-resources.duplicate-immutable`.
    pub fn duplicate_immutable(
        &mut self,
        buffer: &ImmutableBuffer,
    ) -> Result<ImmutableBuffer, MockError> {
        let ticket = self.begin(CapabilityCall::DuplicateImmutable)?;
        self.finish(ticket, Ok(buffer.duplicate()))
    }

    /// Implements `host-resources.read-immutable`.
    pub fn read_immutable(
        &mut self,
        buffer: &ImmutableBuffer,
        offset: u64,
        length: u32,
    ) -> Result<ImmutableReadResult, MockError> {
        let ticket = self.begin(CapabilityCall::ReadImmutable)?;
        let result = buffer.read(offset, length).map_err(Self::buffer_error);
        self.finish(ticket, result)
    }

    /// Implements `host-resources.write-staging`.
    pub fn write_staging(
        &mut self,
        buffer: &mut MutableStagingBuffer,
        offset: u64,
        bytes: &[u8],
    ) -> Result<StagingWriteResult, MockError> {
        let ticket = self.begin(CapabilityCall::WriteStaging)?;
        let result = buffer.write(offset, bytes).map_err(Self::buffer_error);
        self.finish(ticket, result)
    }

    /// Implements `host-resources.copy-immutable-to-staging`.
    pub fn copy_immutable_to_staging(
        &mut self,
        source: &ImmutableBuffer,
        target: &mut MutableStagingBuffer,
        source_offset: u64,
        target_offset: u64,
        length: u32,
    ) -> Result<StagingWriteResult, MockError> {
        let ticket = self.begin(CapabilityCall::CopyImmutableToStaging)?;
        let result = target
            .copy_from(source, source_offset, target_offset, length)
            .map_err(Self::buffer_error);
        self.finish(ticket, result)
    }

    /// Implements deterministic bounded `host-files.read-batch`.
    pub fn read_batch(&mut self, requests: &[ReadRequest]) -> Result<Vec<ReadResult>, MockError> {
        let ticket = self.begin(CapabilityCall::ReadBatch)?;
        let result = (|| {
            Self::validate_batch(requests.len())?;
            requests
                .iter()
                .map(|request| {
                    Self::validate_path(&request.path)?;
                    let bytes = self.files.get(&request.path).ok_or(MockError::new(
                        "VAL_RESOURCE_NOT_FOUND",
                        MockMutationOutcome::NotApplicable,
                    ))?;
                    let offset =
                        usize::try_from(request.offset).map_err(|_| Self::limit_error())?;
                    if offset > bytes.len() {
                        return Err(Self::limit_error());
                    }
                    let end = offset
                        .saturating_add(request.length as usize)
                        .min(bytes.len());
                    Ok(ReadResult {
                        offset: request.offset,
                        bytes: bytes[offset..end].to_vec(),
                        end_of_file: end == bytes.len(),
                    })
                })
                .collect()
        })();
        self.finish(ticket, result)
    }

    /// Implements failure-atomic bounded `host-files.write-batch`.
    pub fn write_batch(
        &mut self,
        requests: &[WriteRequest],
    ) -> Result<Vec<WriteResult>, MockError> {
        let ticket = self.begin(CapabilityCall::WriteBatch)?;
        let result = (|| {
            Self::validate_batch(requests.len())?;
            let mut candidate = self.files.clone();
            let mut results = Vec::with_capacity(requests.len());
            for request in requests {
                Self::validate_path(&request.path)?;
                let bytes = candidate.entry(request.path.clone()).or_default();
                let offset = usize::try_from(request.offset).map_err(|_| Self::limit_error())?;
                if offset > bytes.len() {
                    return Err(Self::limit_error());
                }
                let end = offset
                    .checked_add(request.bytes.len())
                    .ok_or_else(Self::limit_error)?;
                if end > MAXIMUM_FILE_BYTES {
                    return Err(Self::limit_error());
                }
                if end > bytes.len() {
                    bytes.resize(end, 0);
                }
                bytes[offset..end].copy_from_slice(&request.bytes);
                let bytes_written =
                    u32::try_from(request.bytes.len()).map_err(|_| Self::limit_error())?;
                results.push(WriteResult {
                    offset: request.offset,
                    bytes_written,
                });
            }
            self.files = candidate;
            Ok(results)
        })();
        self.finish(ticket, result)
    }

    /// Implements failure-atomic bounded `host-directories.rename-batch`.
    pub fn rename_batch(&mut self, requests: &[RenameRequest]) -> Result<Vec<bool>, MockError> {
        let ticket = self.begin(CapabilityCall::RenameBatch)?;
        let result = (|| {
            Self::validate_batch(requests.len())?;
            let mut candidate = self.files.clone();
            let mut results = Vec::with_capacity(requests.len());
            for request in requests {
                Self::validate_path(&request.source)?;
                Self::validate_path(&request.destination)?;
                let replaced = candidate.contains_key(&request.destination);
                if replaced && !request.replace {
                    return Err(MockError::new(
                        "VAL_ALREADY_EXISTS",
                        MockMutationOutcome::NotCommitted,
                    ));
                }
                let bytes = candidate.remove(&request.source).ok_or(MockError::new(
                    "VAL_RESOURCE_NOT_FOUND",
                    MockMutationOutcome::NotCommitted,
                ))?;
                candidate.insert(request.destination.clone(), bytes);
                results.push(replaced);
            }
            self.files = candidate;
            Ok(results)
        })();
        self.finish(ticket, result)
    }

    /// Implements sorted bounded `host-directories.list-batch`.
    pub fn list_batch(&mut self, paths: &[String]) -> Result<Vec<Vec<String>>, MockError> {
        let ticket = self.begin(CapabilityCall::ListBatch)?;
        let result = (|| {
            Self::validate_batch(paths.len())?;
            paths
                .iter()
                .map(|prefix| {
                    Self::validate_path(prefix)?;
                    let prefix = format!("{prefix}/");
                    Ok(self
                        .files
                        .keys()
                        .filter(|path| path.starts_with(&prefix))
                        .cloned()
                        .collect())
                })
                .collect()
        })();
        self.finish(ticket, result)
    }

    /// Implements failure-atomic bounded `host-directories.delete-batch`.
    pub fn delete_batch(&mut self, requests: &[DeleteRequest]) -> Result<Vec<bool>, MockError> {
        let ticket = self.begin(CapabilityCall::DeleteBatch)?;
        let result = (|| {
            Self::validate_batch(requests.len())?;
            let mut candidate = self.files.clone();
            let mut results = Vec::with_capacity(requests.len());
            for request in requests {
                Self::validate_path(&request.path)?;
                results.push(candidate.remove(&request.path).is_some());
            }
            self.files = candidate;
            Ok(results)
        })();
        self.finish(ticket, result)
    }

    /// Implements bounded deterministic `host-durability.sync-batch`.
    pub fn sync_batch(&mut self, paths: &[String]) -> Result<Vec<String>, MockError> {
        let ticket = self.begin(CapabilityCall::SyncBatch)?;
        let result = (|| {
            Self::validate_batch(paths.len())?;
            for path in paths {
                Self::validate_path(path)?;
                if !self.files.contains_key(path) {
                    return Err(MockError::new(
                        "VAL_RESOURCE_NOT_FOUND",
                        MockMutationOutcome::NotApplicable,
                    ));
                }
            }
            Ok(paths.to_vec())
        })();
        self.finish(ticket, result)
    }

    /// Implements exact deterministic `host-timers.read-clock` consumption.
    pub fn read_clock(
        &mut self,
        role: ClockRole,
        source_name: &str,
        sequence: u64,
    ) -> Result<ClockSample, MockError> {
        let ticket = self.begin(CapabilityCall::ReadClock)?;
        let result = self
            .inputs
            .take_clock(role, source_name, sequence)
            .map_err(Self::input_error);
        self.finish(ticket, result)
    }

    /// Implements exact deterministic `host-randomness.read-random` consumption.
    pub fn read_random(
        &mut self,
        purpose: RandomPurpose,
        sequence: u64,
        byte_length: usize,
    ) -> Result<Vec<u8>, MockError> {
        let ticket = self.begin(CapabilityCall::ReadRandom)?;
        let result = self
            .inputs
            .take_random(purpose, sequence, byte_length)
            .map_err(Self::input_error);
        self.finish(ticket, result)
    }

    /// Implements explicit `host-control.poll-cancellation`.
    pub fn poll_cancellation(&mut self, cancelled: bool) -> Result<bool, MockError> {
        let ticket = self.begin(CapabilityCall::PollCancellation)?;
        self.finish(ticket, Ok(cancelled))
    }

    /// Implements explicit `host-control.lifecycle`.
    pub fn lifecycle(&mut self) -> Result<MockLifecycle, MockError> {
        let ticket = self.begin(CapabilityCall::Lifecycle)?;
        self.finish(ticket, Ok(self.lifecycle))
    }

    /// Implements pinned `host-control.capture-execution-profile`.
    pub fn capture_execution_profile(&mut self) -> Result<ExecutionProfile, MockError> {
        let ticket = self.begin(CapabilityCall::CaptureExecutionProfile)?;
        self.finish(ticket, Ok(self.profile.clone()))
    }
}

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;
    use helix_core::deterministic_inputs::{
        ClockQuality, ClockValue, DeviceClass, DeviceProfile, MemoryBudget, RandomSample,
    };

    fn profile() -> ExecutionProfile {
        ExecutionProfile {
            version: (7, 0),
            memory: MemoryBudget {
                total_bytes: 1024,
                scratch_bytes: 512,
                result_bytes: 512,
                maximum_allocations: 16,
            },
            device: DeviceProfile {
                profile_name: "mock".to_owned(),
                architecture: "wasm32".to_owned(),
                logical_cores: 1,
                class: DeviceClass::CpuOnly,
                features: vec![],
                maximum_buffer_bytes: 256,
            },
        }
    }

    fn inputs() -> Result<DeterministicInputs, InjectionError> {
        DeterministicInputs::new(
            vec![ClockSample {
                role: ClockRole::Monotonic,
                source_name: "mock-clock".to_owned(),
                sequence: 0,
                value: ClockValue::MonotonicTick(7),
                resolution_ns: 1,
                quality: ClockQuality::Trusted,
            }],
            vec![RandomSample {
                purpose: RandomPurpose::RequestId,
                sequence: 0,
                bytes: vec![1, 2, 3, 4],
            }],
        )
    }

    fn host(rules: Vec<FailureRule>) -> Result<MockHost, MockError> {
        inputs()
            .map_err(MockHost::input_error)
            .and_then(|inputs| MockHost::new(rules, inputs, profile()))
    }

    fn immutable(bytes: &[u8]) -> Result<ImmutableBuffer, BufferError> {
        let mut staging = MutableStagingBuffer::allocate(bytes.len() as u64)?;
        staging.write(0, bytes)?;
        staging.seal(bytes.len() as u64)
    }

    #[test]
    fn failure_plan_rejects_invalid_rules_and_fails_exact_occurrence_once() {
        let rule = FailureRule {
            call: CapabilityCall::PollCancellation,
            occurrence: 2,
            fault: MockFault::Cancelled,
            outcome: MockMutationOutcome::NotCommitted,
        };
        assert!(
            host(vec![FailureRule {
                occurrence: 0,
                ..rule
            }])
            .is_err()
        );
        assert!(host(vec![rule, rule]).is_err());
        let mock = host(vec![rule]);
        assert!(mock.is_ok());
        let Ok(mut mock) = mock else { return };
        assert_eq!(mock.poll_cancellation(false), Ok(false));
        assert_eq!(
            mock.poll_cancellation(false),
            Err(MockError::new(
                "DEADLINE_CANCELLED",
                MockMutationOutcome::NotCommitted
            ))
        );
        assert_eq!(mock.poll_cancellation(true), Ok(true));
        assert_eq!(mock.records().len(), 3);
        assert_eq!(mock.records()[1].occurrence, 2);
    }

    #[test]
    fn resource_calls_execute_explicit_copy_and_record_order() {
        let mock = host(vec![]);
        assert!(mock.is_ok());
        let Ok(mut mock) = mock else { return };
        let staging = mock.allocate_staging(8);
        assert!(staging.is_ok());
        let Ok(mut staging) = staging else { return };
        assert_eq!(mock.mutable_staging_capacity(&staging), Ok(8));
        assert_eq!(mock.mutable_staging_initialized_length(&staging), Ok(0));
        assert!(mock.write_staging(&mut staging, 0, b"abcd").is_ok());
        assert_eq!(mock.mutable_staging_initialized_length(&staging), Ok(4));
        let sealed = mock.seal_staging(staging, 4);
        assert!(sealed.is_ok());
        let Ok(sealed) = sealed else { return };
        assert_eq!(mock.immutable_buffer_length(&sealed), Ok(4));
        assert!(mock.read_immutable(&sealed, 1, 2).is_ok());
        let duplicate = mock.duplicate_immutable(&sealed);
        assert!(duplicate.is_ok());
        let Ok(duplicate) = duplicate else { return };
        let target = mock.allocate_staging(4);
        assert!(target.is_ok());
        let Ok(mut target) = target else { return };
        assert!(
            mock.copy_immutable_to_staging(&duplicate, &mut target, 0, 0, 4)
                .is_ok()
        );
        let descriptor = MockHandleDescriptor {
            kind: "operation".to_owned(),
            name: "mock-handle".to_owned(),
            version: (1, 0),
        };
        assert_eq!(mock.opaque_handle_descriptor(&descriptor), Ok(descriptor));
        assert_eq!(
            mock.records().first().map(|record| record.sequence),
            Some(0)
        );
    }

    #[test]
    fn storage_batches_are_deterministic_sorted_and_failure_atomic() {
        let mock = host(vec![]);
        assert!(mock.is_ok());
        let Ok(mut mock) = mock else { return };
        assert!(mock.seed_file("data/a".to_owned(), b"abc".to_vec()).is_ok());
        let writes = vec![WriteRequest {
            path: "data/a".to_owned(),
            offset: 3,
            bytes: b"def".to_vec(),
        }];
        assert_eq!(
            mock.write_batch(&writes)
                .map(|value| value[0].bytes_written),
            Ok(3)
        );
        assert_eq!(
            mock.read_batch(&[ReadRequest {
                path: "data/a".to_owned(),
                offset: 1,
                length: 9,
            }])
            .map(|value| value[0].bytes.clone()),
            Ok(b"bcdef".to_vec())
        );
        assert!(mock.seed_file("data/b".to_owned(), b"b".to_vec()).is_ok());
        assert_eq!(
            mock.list_batch(&["data".to_owned()]),
            Ok(vec![vec!["data/a".to_owned(), "data/b".to_owned()]])
        );
        assert_eq!(
            mock.rename_batch(&[RenameRequest {
                source: "data/b".to_owned(),
                destination: "data/c".to_owned(),
                replace: false,
            }]),
            Ok(vec![false])
        );
        assert_eq!(
            mock.sync_batch(&["data/c".to_owned()]),
            Ok(vec!["data/c".to_owned()])
        );
        assert_eq!(
            mock.delete_batch(&[DeleteRequest {
                path: "data/c".to_owned(),
            }]),
            Ok(vec![true])
        );
        let before = mock.read_batch(&[ReadRequest {
            path: "data/a".to_owned(),
            offset: 0,
            length: 16,
        }]);
        let invalid = mock.write_batch(&[
            WriteRequest {
                path: "data/a".to_owned(),
                offset: 0,
                bytes: b"x".to_vec(),
            },
            WriteRequest {
                path: "../escape".to_owned(),
                offset: 0,
                bytes: b"y".to_vec(),
            },
        ]);
        assert!(invalid.is_err());
        let after = mock.read_batch(&[ReadRequest {
            path: "data/a".to_owned(),
            offset: 0,
            length: 16,
        }]);
        assert_eq!(before, after);
    }

    #[test]
    fn deterministic_inputs_profile_and_lifecycle_are_explicit() {
        let mock = host(vec![]);
        assert!(mock.is_ok());
        let Ok(mut mock) = mock else { return };
        assert!(
            mock.read_clock(ClockRole::Monotonic, "mock-clock", 0)
                .is_ok()
        );
        assert_eq!(
            mock.read_random(RandomPurpose::RequestId, 0, 4),
            Ok(vec![1, 2, 3, 4])
        );
        assert_eq!(mock.lifecycle(), Ok(MockLifecycle::Running));
        mock.set_lifecycle(MockLifecycle::Draining);
        assert_eq!(mock.lifecycle(), Ok(MockLifecycle::Draining));
        assert_eq!(
            mock.read_batch(&[]),
            Err(MockError::new(
                "HOST_DRAINING",
                MockMutationOutcome::NotCommitted
            ))
        );
        assert_eq!(mock.capture_execution_profile(), Ok(profile()));
        mock.set_lifecycle(MockLifecycle::Stopped);
        assert_eq!(mock.lifecycle(), Ok(MockLifecycle::Stopped));
        assert_eq!(
            mock.capture_execution_profile(),
            Err(MockError::new(
                "HOST_STOPPED",
                MockMutationOutcome::NotApplicable
            ))
        );
    }

    #[test]
    fn every_imported_call_kind_accepts_failure_injection() {
        for call in ALL_CAPABILITY_CALLS {
            let mock = host(vec![FailureRule {
                call,
                occurrence: 1,
                fault: MockFault::HostUnavailable,
                outcome: MockMutationOutcome::NotApplicable,
            }]);
            assert!(mock.is_ok());
            let Ok(mut mock) = mock else { continue };
            let result = match call {
                CapabilityCall::ImmutableBufferLength => immutable(b"x")
                    .map_err(MockHost::buffer_error)
                    .and_then(|buffer| mock.immutable_buffer_length(&buffer).map(|_| ())),
                CapabilityCall::MutableStagingCapacity => MutableStagingBuffer::allocate(1)
                    .map_err(MockHost::buffer_error)
                    .and_then(|buffer| mock.mutable_staging_capacity(&buffer).map(|_| ())),
                CapabilityCall::MutableStagingInitializedLength => {
                    MutableStagingBuffer::allocate(1)
                        .map_err(MockHost::buffer_error)
                        .and_then(|buffer| {
                            mock.mutable_staging_initialized_length(&buffer).map(|_| ())
                        })
                }
                CapabilityCall::OpaqueHandleDescriptor => mock
                    .opaque_handle_descriptor(&MockHandleDescriptor {
                        kind: "file".to_owned(),
                        name: "x".to_owned(),
                        version: (1, 0),
                    })
                    .map(|_| ()),
                CapabilityCall::AllocateStaging => mock.allocate_staging(1).map(|_| ()),
                CapabilityCall::SealStaging => MutableStagingBuffer::allocate(0)
                    .map_err(MockHost::buffer_error)
                    .and_then(|buffer| mock.seal_staging(buffer, 0).map(|_| ())),
                CapabilityCall::DuplicateImmutable => immutable(b"x")
                    .map_err(MockHost::buffer_error)
                    .and_then(|buffer| mock.duplicate_immutable(&buffer).map(|_| ())),
                CapabilityCall::ReadImmutable => immutable(b"x")
                    .map_err(MockHost::buffer_error)
                    .and_then(|buffer| mock.read_immutable(&buffer, 0, 1).map(|_| ())),
                CapabilityCall::WriteStaging => MutableStagingBuffer::allocate(1)
                    .map_err(MockHost::buffer_error)
                    .and_then(|mut buffer| mock.write_staging(&mut buffer, 0, b"x").map(|_| ())),
                CapabilityCall::CopyImmutableToStaging => immutable(b"x")
                    .map_err(MockHost::buffer_error)
                    .and_then(|source| {
                        MutableStagingBuffer::allocate(1)
                            .map_err(MockHost::buffer_error)
                            .and_then(|mut target| {
                                mock.copy_immutable_to_staging(&source, &mut target, 0, 0, 1)
                                    .map(|_| ())
                            })
                    }),
                CapabilityCall::ReadBatch => mock.read_batch(&[]).map(|_| ()),
                CapabilityCall::WriteBatch => mock.write_batch(&[]).map(|_| ()),
                CapabilityCall::RenameBatch => mock.rename_batch(&[]).map(|_| ()),
                CapabilityCall::ListBatch => mock.list_batch(&[]).map(|_| ()),
                CapabilityCall::DeleteBatch => mock.delete_batch(&[]).map(|_| ()),
                CapabilityCall::SyncBatch => mock.sync_batch(&[]).map(|_| ()),
                CapabilityCall::ReadClock => mock
                    .read_clock(ClockRole::Monotonic, "mock-clock", 0)
                    .map(|_| ()),
                CapabilityCall::ReadRandom => {
                    mock.read_random(RandomPurpose::RequestId, 0, 4).map(|_| ())
                }
                CapabilityCall::PollCancellation => mock.poll_cancellation(false).map(|_| ()),
                CapabilityCall::Lifecycle => mock.lifecycle().map(|_| ()),
                CapabilityCall::CaptureExecutionProfile => {
                    mock.capture_execution_profile().map(|_| ())
                }
            };
            assert_eq!(
                result,
                Err(MockError::new(
                    "CAP_HOST_UNAVAILABLE",
                    MockMutationOutcome::NotApplicable
                )),
                "{call:?}"
            );
            assert_eq!(mock.records().len(), 1, "{call:?}");
        }
    }
}
// helix-coverage: exclude-end unit-tests

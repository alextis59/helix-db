//! Portable reference model for deterministic clock, randomness, memory, and device inputs.
//!
//! The model consumes explicit bounded sequences and never discovers ambient host state. It is not
//! a host implementation; mock, native, and browser adapters use these semantics as conformance
//! input beginning with P04-010.

use std::collections::VecDeque;

/// Maximum injected clock samples retained by one admitted operation.
pub const MAXIMUM_CLOCK_SAMPLES: usize = 1024;
/// Maximum injected random samples retained by one admitted operation.
pub const MAXIMUM_RANDOM_SAMPLES: usize = 1024;
/// Maximum bytes returned by one purpose-separated random request.
pub const MAXIMUM_RANDOM_BYTES: usize = 65_536;
/// Maximum bytes admitted by one Wasm32 execution profile.
pub const MAXIMUM_MEMORY_BUDGET_BYTES: u64 = 4_294_967_296;
/// Maximum simultaneous allocation records admitted by one execution profile.
pub const MAXIMUM_MEMORY_ALLOCATIONS: u32 = 1_048_576;
/// Maximum named features in one redacted device profile.
pub const MAXIMUM_DEVICE_FEATURES: usize = 64;
/// Maximum UTF-8 bytes in a source, profile, architecture, or feature name.
pub const MAXIMUM_INPUT_NAME_BYTES: usize = 64;
/// Maximum bytes in an ordered MVCC clock token.
pub const MAXIMUM_ORDERED_CLOCK_TOKEN_BYTES: usize = 32;

/// Semantic role of an injected clock sample.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClockRole {
    /// Trusted UTC microseconds for captured user-visible wall time.
    WallTimeUtc,
    /// Opaque nondecreasing ticks for deadlines and elapsed durations.
    Monotonic,
    /// Opaque ordered token for snapshot and commit ordering.
    Mvcc,
    /// Trusted nonregressing UTC microsecond cutoff for TTL visibility.
    LogicalExpiry,
}

/// Host-declared quality of one clock sample.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClockQuality {
    /// The host satisfies the role's accepted guarantees.
    Trusted,
    /// The value is usable but the host reports reduced quality.
    Degraded,
    /// The value must fail closed for safety-sensitive decisions.
    Unsafe,
}

/// Typed value carried by a role-separated clock sample.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClockValue {
    /// Signed microseconds from the Unix epoch.
    UtcMicroseconds(i64),
    /// Opaque tick in one named monotonic timer domain.
    MonotonicTick(u64),
    /// Opaque nonempty lexicographically ordered token.
    OrderedToken(Vec<u8>),
}

/// One explicit clock response in deterministic consumption order.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClockSample {
    /// Required semantic role.
    pub role: ClockRole,
    /// Negotiated source name; timer domains never compare across names.
    pub source_name: String,
    /// Zero-based sequence within the admitted operation.
    pub sequence: u64,
    /// Role-compatible clock value.
    pub value: ClockValue,
    /// Declared source resolution in nanoseconds.
    pub resolution_ns: u64,
    /// Declared source quality.
    pub quality: ClockQuality,
}

/// Purpose separating cryptographic random-byte requests.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RandomPurpose {
    /// Request correlation identity.
    RequestId,
    /// Transaction correlation identity.
    TransactionId,
    /// Entropy used by native `UUIDv7` generation.
    UuidV7,
    /// Seed/counter entropy used by explicit `ObjectId` generation.
    ObjectId,
    /// Security-sensitive nonce material.
    Nonce,
    /// Non-semantic sampling material.
    Sampling,
}

/// One explicit random-byte response in deterministic consumption order.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RandomSample {
    /// Required purpose.
    pub purpose: RandomPurpose,
    /// Zero-based sequence within the admitted operation.
    pub sequence: u64,
    /// Exact requested bytes.
    pub bytes: Vec<u8>,
}

/// Stable failures from deterministic input validation and consumption.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InjectionError {
    /// A name is empty, oversized, or contains a control character.
    InvalidName,
    /// A supplied sequence is not zero-based and contiguous.
    InvalidSequence,
    /// A clock value does not match its semantic role.
    InvalidClockValue,
    /// Clock resolution is zero.
    InvalidClockResolution,
    /// Too many deterministic values were supplied.
    InputLimitExceeded,
    /// No clock sample remains.
    ClockInputExhausted,
    /// No random sample remains.
    RandomInputExhausted,
    /// The next value does not match the requested role, source, purpose, sequence, or length.
    InputMismatch,
    /// A memory budget violates the ABI envelope.
    InvalidMemoryBudget,
    /// A reservation would exceed total, class, or allocation-count limits.
    MemoryBudgetExceeded,
    /// A release does not correspond to currently reserved memory.
    InvalidMemoryRelease,
    /// A device profile violates its redacted bounded shape.
    InvalidDeviceProfile,
    /// An execution profile uses an unsupported contract version.
    UnsupportedProfileVersion,
}

fn valid_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAXIMUM_INPUT_NAME_BYTES
        && value.chars().all(|character| !character.is_control())
}

fn valid_clock_value(role: ClockRole, value: &ClockValue) -> bool {
    match (role, value) {
        (ClockRole::WallTimeUtc | ClockRole::LogicalExpiry, ClockValue::UtcMicroseconds(_))
        | (ClockRole::Monotonic, ClockValue::MonotonicTick(_)) => true,
        (ClockRole::Mvcc, ClockValue::OrderedToken(token)) => {
            !token.is_empty() && token.len() <= MAXIMUM_ORDERED_CLOCK_TOKEN_BYTES
        }
        _ => false,
    }
}

/// Bounded deterministic clock/random queues consumed exactly in supplied order.
#[derive(Debug, Eq, PartialEq)]
pub struct DeterministicInputs {
    clocks: VecDeque<ClockSample>,
    randomness: VecDeque<RandomSample>,
}

impl DeterministicInputs {
    /// Validates and stores explicit input sequences without reading ambient state.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid values, noncontiguous sequences, or input-count overflow.
    pub fn new(
        clocks: Vec<ClockSample>,
        randomness: Vec<RandomSample>,
    ) -> Result<Self, InjectionError> {
        if clocks.len() > MAXIMUM_CLOCK_SAMPLES || randomness.len() > MAXIMUM_RANDOM_SAMPLES {
            return Err(InjectionError::InputLimitExceeded);
        }
        for (sequence, sample) in clocks.iter().enumerate() {
            if sample.sequence != sequence as u64 {
                return Err(InjectionError::InvalidSequence);
            }
            if !valid_name(&sample.source_name) {
                return Err(InjectionError::InvalidName);
            }
            if sample.resolution_ns == 0 {
                return Err(InjectionError::InvalidClockResolution);
            }
            if !valid_clock_value(sample.role, &sample.value) {
                return Err(InjectionError::InvalidClockValue);
            }
        }
        for (sequence, sample) in randomness.iter().enumerate() {
            if sample.sequence != sequence as u64 {
                return Err(InjectionError::InvalidSequence);
            }
            if sample.bytes.is_empty() || sample.bytes.len() > MAXIMUM_RANDOM_BYTES {
                return Err(InjectionError::InputLimitExceeded);
            }
        }
        Ok(Self {
            clocks: clocks.into(),
            randomness: randomness.into(),
        })
    }

    /// Consumes the next exact role/source/sequence clock value.
    ///
    /// # Errors
    ///
    /// Returns an error without consuming input when the queue is empty or the request differs.
    pub fn take_clock(
        &mut self,
        role: ClockRole,
        source_name: &str,
        sequence: u64,
    ) -> Result<ClockSample, InjectionError> {
        let Some(sample) = self.clocks.front() else {
            return Err(InjectionError::ClockInputExhausted);
        };
        if sample.role != role || sample.source_name != source_name || sample.sequence != sequence {
            return Err(InjectionError::InputMismatch);
        }
        self.clocks
            .pop_front()
            .ok_or(InjectionError::ClockInputExhausted)
    }

    /// Consumes the next exact purpose/sequence/length random value.
    ///
    /// # Errors
    ///
    /// Returns an error without consuming input when the queue is empty or the request differs.
    pub fn take_random(
        &mut self,
        purpose: RandomPurpose,
        sequence: u64,
        byte_length: usize,
    ) -> Result<Vec<u8>, InjectionError> {
        let Some(sample) = self.randomness.front() else {
            return Err(InjectionError::RandomInputExhausted);
        };
        if sample.purpose != purpose
            || sample.sequence != sequence
            || sample.bytes.len() != byte_length
        {
            return Err(InjectionError::InputMismatch);
        }
        self.randomness
            .pop_front()
            .map(|sample| sample.bytes)
            .ok_or(InjectionError::RandomInputExhausted)
    }

    /// Returns unconsumed clock and random sample counts.
    #[must_use]
    pub fn remaining(&self) -> (usize, usize) {
        (self.clocks.len(), self.randomness.len())
    }
}

/// Pinned numeric memory envelope for one admitted operation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MemoryBudget {
    /// Maximum total simultaneously reserved bytes.
    pub total_bytes: u64,
    /// Maximum simultaneously reserved scratch bytes.
    pub scratch_bytes: u64,
    /// Maximum simultaneously reserved result bytes.
    pub result_bytes: u64,
    /// Maximum simultaneous allocation records.
    pub maximum_allocations: u32,
}

impl MemoryBudget {
    /// Validates the budget against the ABI envelope.
    ///
    /// # Errors
    ///
    /// Returns an error when a class exceeds total or an ABI maximum is exceeded.
    pub fn validate(self) -> Result<Self, InjectionError> {
        if self.total_bytes > MAXIMUM_MEMORY_BUDGET_BYTES
            || self.scratch_bytes > self.total_bytes
            || self.result_bytes > self.total_bytes
            || self.maximum_allocations > MAXIMUM_MEMORY_ALLOCATIONS
        {
            return Err(InjectionError::InvalidMemoryBudget);
        }
        Ok(self)
    }
}

/// Accounted memory class.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MemoryClass {
    /// Temporary execution/intermediate memory.
    Scratch,
    /// Materialized result/publication memory.
    Result,
}

/// Opaque ledger-local identity for one exact live reservation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AllocationId {
    ledger_id: u64,
    sequence: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct AllocationRecord {
    id: AllocationId,
    class: MemoryClass,
    bytes: u64,
}

/// Fail-before-mutation memory accounting for one pinned budget.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MemoryLedger {
    budget: MemoryBudget,
    scratch_used: u64,
    result_used: u64,
    ledger_id: u64,
    next_sequence: u64,
    allocations: Vec<AllocationRecord>,
}

impl MemoryLedger {
    /// Creates an empty ledger from a validated budget.
    ///
    /// # Errors
    ///
    /// Returns an error when the budget violates the ABI envelope.
    pub fn new(budget: MemoryBudget, ledger_id: u64) -> Result<Self, InjectionError> {
        if ledger_id == 0 {
            return Err(InjectionError::InvalidMemoryBudget);
        }
        Ok(Self {
            budget: budget.validate()?,
            scratch_used: 0,
            result_used: 0,
            ledger_id,
            next_sequence: 1,
            allocations: Vec::new(),
        })
    }

    /// Reserves one nonempty allocation atomically.
    ///
    /// # Errors
    ///
    /// Returns an error without changing the ledger when any applicable limit is exceeded.
    pub fn reserve(
        &mut self,
        class: MemoryClass,
        bytes: u64,
    ) -> Result<AllocationId, InjectionError> {
        let live_allocations = u32::try_from(self.allocations.len())
            .map_err(|_| InjectionError::MemoryBudgetExceeded)?;
        let next_allocations = live_allocations
            .checked_add(1)
            .ok_or(InjectionError::MemoryBudgetExceeded)?;
        let (current, maximum) = match class {
            MemoryClass::Scratch => (self.scratch_used, self.budget.scratch_bytes),
            MemoryClass::Result => (self.result_used, self.budget.result_bytes),
        };
        let next_class = current
            .checked_add(bytes)
            .ok_or(InjectionError::MemoryBudgetExceeded)?;
        let next_total = self
            .scratch_used
            .checked_add(self.result_used)
            .and_then(|used| used.checked_add(bytes))
            .ok_or(InjectionError::MemoryBudgetExceeded)?;
        if bytes == 0
            || next_allocations > self.budget.maximum_allocations
            || next_class > maximum
            || next_total > self.budget.total_bytes
        {
            return Err(InjectionError::MemoryBudgetExceeded);
        }
        let id = AllocationId {
            ledger_id: self.ledger_id,
            sequence: self.next_sequence,
        };
        let next_sequence = self
            .next_sequence
            .checked_add(1)
            .ok_or(InjectionError::MemoryBudgetExceeded)?;
        match class {
            MemoryClass::Scratch => self.scratch_used = next_class,
            MemoryClass::Result => self.result_used = next_class,
        }
        self.next_sequence = next_sequence;
        self.allocations.push(AllocationRecord { id, class, bytes });
        Ok(id)
    }

    /// Releases one exact live allocation by its opaque ledger-local identity.
    ///
    /// # Errors
    ///
    /// Returns an error without changing the ledger for an unknown or already released identity.
    pub fn release(&mut self, id: AllocationId) -> Result<(), InjectionError> {
        let Some(index) = self.allocations.iter().position(|record| record.id == id) else {
            return Err(InjectionError::InvalidMemoryRelease);
        };
        let record = self.allocations.remove(index);
        match record.class {
            MemoryClass::Scratch => self.scratch_used -= record.bytes,
            MemoryClass::Result => self.result_used -= record.bytes,
        }
        Ok(())
    }

    /// Returns scratch bytes, result bytes, and allocation records currently reserved.
    #[must_use]
    pub fn usage(&self) -> (u64, u64, usize) {
        (self.scratch_used, self.result_used, self.allocations.len())
    }
}

/// Coarse execution device class; it contains no host-unique identity.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DeviceClass {
    /// Portable CPU execution only.
    CpuOnly,
    /// CPU execution with an available GPU candidate.
    CpuAndGpu,
}

/// Redacted, bounded, explicitly injected device facts.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DeviceProfile {
    /// Stable deployment policy name, not a machine identifier.
    pub profile_name: String,
    /// Coarse architecture name.
    pub architecture: String,
    /// Bounded logical concurrency fact.
    pub logical_cores: u16,
    /// Available execution class.
    pub class: DeviceClass,
    /// Sorted unique feature names.
    pub features: Vec<String>,
    /// Maximum accepted boundary buffer size.
    pub maximum_buffer_bytes: u64,
}

impl DeviceProfile {
    /// Validates the redacted deterministic profile shape.
    ///
    /// # Errors
    ///
    /// Returns an error for invalid names, count/order drift, zero cores, or oversized buffers.
    pub fn validate(self) -> Result<Self, InjectionError> {
        let names_valid = valid_name(&self.profile_name)
            && valid_name(&self.architecture)
            && self.features.iter().all(|feature| valid_name(feature));
        let strictly_sorted = self
            .features
            .windows(2)
            .all(|pair| pair[0].as_bytes() < pair[1].as_bytes());
        if !names_valid
            || self.logical_cores == 0
            || self.features.len() > MAXIMUM_DEVICE_FEATURES
            || !strictly_sorted
            || self.maximum_buffer_bytes > MAXIMUM_MEMORY_BUDGET_BYTES
        {
            return Err(InjectionError::InvalidDeviceProfile);
        }
        Ok(self)
    }
}

/// One versioned memory/device profile pinned before semantic execution.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExecutionProfile {
    /// Exact component ABI version of the profile.
    pub version: (u16, u16),
    /// Numeric memory envelope.
    pub memory: MemoryBudget,
    /// Redacted device facts.
    pub device: DeviceProfile,
}

impl ExecutionProfile {
    /// Validates exact ABI 7.0 plus memory and device bounds.
    ///
    /// # Errors
    ///
    /// Returns a stable error for version, memory, or device-profile rejection.
    pub fn validate(self) -> Result<Self, InjectionError> {
        if self.version != (7, 0) {
            return Err(InjectionError::UnsupportedProfileVersion);
        }
        self.memory.validate()?;
        self.device.clone().validate()?;
        if self.device.maximum_buffer_bytes > self.memory.total_bytes {
            return Err(InjectionError::InvalidDeviceProfile);
        }
        Ok(self)
    }
}

// helix-coverage: exclude-start unit-tests
#[cfg(test)]
mod tests {
    use super::*;

    fn clock(role: ClockRole, sequence: u64, value: ClockValue) -> ClockSample {
        ClockSample {
            role,
            source_name: "fixture-clock".to_owned(),
            sequence,
            value,
            resolution_ns: 1_000,
            quality: ClockQuality::Trusted,
        }
    }

    fn budget() -> MemoryBudget {
        MemoryBudget {
            total_bytes: 12,
            scratch_bytes: 8,
            result_bytes: 8,
            maximum_allocations: 2,
        }
    }

    fn device() -> DeviceProfile {
        DeviceProfile {
            profile_name: "portable".to_owned(),
            architecture: "wasm32".to_owned(),
            logical_cores: 1,
            class: DeviceClass::CpuOnly,
            features: vec!["bulk-memory".to_owned(), "simd128".to_owned()],
            maximum_buffer_bytes: 8,
        }
    }

    #[test]
    fn consumes_exact_clock_and_purpose_separated_random_sequences() {
        let clocks = vec![
            clock(ClockRole::WallTimeUtc, 0, ClockValue::UtcMicroseconds(42)),
            clock(ClockRole::Monotonic, 1, ClockValue::MonotonicTick(9)),
            clock(ClockRole::Mvcc, 2, ClockValue::OrderedToken(vec![1, 2])),
            clock(ClockRole::LogicalExpiry, 3, ClockValue::UtcMicroseconds(40)),
        ];
        let randomness = vec![
            RandomSample {
                purpose: RandomPurpose::UuidV7,
                sequence: 0,
                bytes: vec![7; 10],
            },
            RandomSample {
                purpose: RandomPurpose::ObjectId,
                sequence: 1,
                bytes: vec![8; 8],
            },
        ];
        let inputs = DeterministicInputs::new(clocks, randomness);
        assert!(inputs.is_ok());
        let Ok(mut inputs) = inputs else { return };
        assert_eq!(inputs.remaining(), (4, 2));
        assert_eq!(
            inputs.take_clock(ClockRole::Mvcc, "fixture-clock", 0),
            Err(InjectionError::InputMismatch)
        );
        assert!(
            inputs
                .take_clock(ClockRole::WallTimeUtc, "fixture-clock", 0)
                .is_ok()
        );
        assert!(
            inputs
                .take_clock(ClockRole::Monotonic, "fixture-clock", 1)
                .is_ok()
        );
        assert!(
            inputs
                .take_clock(ClockRole::Mvcc, "fixture-clock", 2)
                .is_ok()
        );
        assert!(
            inputs
                .take_clock(ClockRole::LogicalExpiry, "fixture-clock", 3)
                .is_ok()
        );
        assert_eq!(
            inputs.take_clock(ClockRole::WallTimeUtc, "fixture-clock", 4),
            Err(InjectionError::ClockInputExhausted)
        );
        assert_eq!(
            inputs.take_random(RandomPurpose::ObjectId, 0, 10),
            Err(InjectionError::InputMismatch)
        );
        assert_eq!(
            inputs.take_random(RandomPurpose::UuidV7, 0, 10),
            Ok(vec![7; 10])
        );
        assert_eq!(
            inputs.take_random(RandomPurpose::ObjectId, 1, 8),
            Ok(vec![8; 8])
        );
        assert_eq!(
            inputs.take_random(RandomPurpose::Nonce, 2, 1),
            Err(InjectionError::RandomInputExhausted)
        );
        assert_eq!(inputs.remaining(), (0, 0));
    }

    #[test]
    fn rejects_invalid_sequences_clock_shapes_names_and_input_bounds() {
        let invalid = [
            DeterministicInputs::new(
                vec![clock(
                    ClockRole::WallTimeUtc,
                    1,
                    ClockValue::UtcMicroseconds(0),
                )],
                vec![],
            ),
            DeterministicInputs::new(
                vec![clock(
                    ClockRole::Monotonic,
                    0,
                    ClockValue::UtcMicroseconds(0),
                )],
                vec![],
            ),
            DeterministicInputs::new(
                vec![clock(ClockRole::Mvcc, 0, ClockValue::OrderedToken(vec![]))],
                vec![],
            ),
        ];
        assert_eq!(invalid[0], Err(InjectionError::InvalidSequence));
        assert_eq!(invalid[1], Err(InjectionError::InvalidClockValue));
        assert_eq!(invalid[2], Err(InjectionError::InvalidClockValue));

        let mut invalid_name = clock(ClockRole::Monotonic, 0, ClockValue::MonotonicTick(0));
        invalid_name.source_name = "\n".to_owned();
        assert_eq!(
            DeterministicInputs::new(vec![invalid_name], vec![]),
            Err(InjectionError::InvalidName)
        );
        let mut zero_resolution = clock(ClockRole::Monotonic, 0, ClockValue::MonotonicTick(0));
        zero_resolution.resolution_ns = 0;
        assert_eq!(
            DeterministicInputs::new(vec![zero_resolution], vec![]),
            Err(InjectionError::InvalidClockResolution)
        );
        assert_eq!(
            DeterministicInputs::new(
                vec![],
                vec![RandomSample {
                    purpose: RandomPurpose::Nonce,
                    sequence: 1,
                    bytes: vec![1],
                }],
            ),
            Err(InjectionError::InvalidSequence)
        );
        assert_eq!(
            DeterministicInputs::new(
                vec![],
                vec![RandomSample {
                    purpose: RandomPurpose::Sampling,
                    sequence: 0,
                    bytes: vec![],
                }],
            ),
            Err(InjectionError::InputLimitExceeded)
        );
        assert_eq!(
            DeterministicInputs::new(
                vec![],
                (0..=MAXIMUM_RANDOM_SAMPLES)
                    .map(|sequence| RandomSample {
                        purpose: RandomPurpose::RequestId,
                        sequence: sequence as u64,
                        bytes: vec![0],
                    })
                    .collect(),
            ),
            Err(InjectionError::InputLimitExceeded)
        );
    }

    #[test]
    fn memory_ledger_is_bounded_and_failure_atomic() {
        let ledger = MemoryLedger::new(budget(), 1);
        assert!(ledger.is_ok());
        let Ok(mut ledger) = ledger else { return };
        let scratch = ledger.reserve(MemoryClass::Scratch, 5);
        let result = ledger.reserve(MemoryClass::Result, 7);
        assert!(scratch.is_ok());
        assert!(result.is_ok());
        let (Ok(scratch), Ok(result)) = (scratch, result) else {
            return;
        };
        assert_eq!(ledger.usage(), (5, 7, 2));
        assert_eq!(
            ledger.reserve(MemoryClass::Scratch, 1),
            Err(InjectionError::MemoryBudgetExceeded)
        );
        assert_eq!(ledger.usage(), (5, 7, 2));
        assert_eq!(ledger.release(scratch), Ok(()));
        let foreign = MemoryLedger::new(budget(), 2)
            .and_then(|mut ledger| ledger.reserve(MemoryClass::Scratch, 1));
        assert!(foreign.is_ok());
        if let Ok(foreign) = foreign {
            assert_eq!(
                ledger.release(foreign),
                Err(InjectionError::InvalidMemoryRelease)
            );
        }
        assert_eq!(ledger.release(result), Ok(()));
        assert_eq!(ledger.usage(), (0, 0, 0));
        assert_eq!(
            ledger.release(result),
            Err(InjectionError::InvalidMemoryRelease)
        );
        assert_eq!(
            ledger.reserve(MemoryClass::Result, 0),
            Err(InjectionError::MemoryBudgetExceeded)
        );
        let invalid = MemoryBudget {
            total_bytes: 1,
            scratch_bytes: 2,
            result_bytes: 0,
            maximum_allocations: 0,
        };
        assert_eq!(
            MemoryLedger::new(invalid, 1),
            Err(InjectionError::InvalidMemoryBudget)
        );
        assert_eq!(
            MemoryLedger::new(budget(), 0),
            Err(InjectionError::InvalidMemoryBudget)
        );
    }

    #[test]
    fn execution_profile_is_exact_bounded_and_redacted() {
        let profile = ExecutionProfile {
            version: (7, 0),
            memory: budget(),
            device: device(),
        };
        assert_eq!(profile.clone().validate(), Ok(profile));
        let mut wrong_version = ExecutionProfile {
            version: (6, 0),
            memory: budget(),
            device: device(),
        };
        assert_eq!(
            wrong_version.clone().validate(),
            Err(InjectionError::UnsupportedProfileVersion)
        );
        wrong_version.version = (7, 0);
        wrong_version.device.features.reverse();
        assert_eq!(
            wrong_version.validate(),
            Err(InjectionError::InvalidDeviceProfile)
        );
        let mut too_large = device();
        too_large.maximum_buffer_bytes = 13;
        assert_eq!(
            ExecutionProfile {
                version: (7, 0),
                memory: budget(),
                device: too_large,
            }
            .validate(),
            Err(InjectionError::InvalidDeviceProfile)
        );
        let mut invalid_name = device();
        invalid_name.profile_name.clear();
        assert_eq!(
            invalid_name.validate(),
            Err(InjectionError::InvalidDeviceProfile)
        );
    }
}
// helix-coverage: exclude-end unit-tests

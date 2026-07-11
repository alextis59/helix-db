export const ORACLE_VERSION = '1.0.0';
export const ORACLE_PROFILE = 'helix-reference-oracle/1';

export const REQUIRED_PROFILES = Object.freeze({
  semantics: 'helix-native-v1',
  limits: 'limits-v1',
  collation: 'binary_utf8_v1',
  errors: 'errors-v1',
  default_order: 'default_order_v1',
});

export const OPERATION_ARITY = Object.freeze({
  'array.all': [2, 2],
  'array.elem-match': [2, 2],
  'array.size': [1, 1],
  'fixture.echo-order': [1, 1],
  'fixture.generate-boundary': [4, 4],
  'fixture.raise-error': [1, 1],
  'numeric.add': [2, 2],
  'numeric.negate': [1, 1],
  'path.exists': [2, 2],
  'path.resolve': [2, 2],
  'string.contains': [2, 2],
  'time.parse-timestamp': [1, 1],
  'value.compare': [2, 2],
  'value.equal': [2, 2],
  'value.identical': [2, 2],
  'value.identity': [1, 1],
  'vector.distance': [2, 2],
});

export const LIMITS = Object.freeze({
  'array.elements': { maximum: 1_000_000n, unit: 'count', mutation: true },
  'ast.depth': { maximum: 64n, unit: 'levels', mutation: false },
  'ast.nodes': { maximum: 4_096n, unit: 'count', mutation: false },
  'batch.items': { maximum: 1_000n, unit: 'count', mutation: true },
  'command.expanded_bytes': { maximum: 67_108_864n, unit: 'bytes', mutation: false },
  'command.raw_bytes': { maximum: 67_108_864n, unit: 'bytes', mutation: false },
  'document.canonical_bytes': { maximum: 16_777_216n, unit: 'bytes', mutation: true },
  'document.depth': { maximum: 100n, unit: 'levels', mutation: true },
  'document.total_fields': { maximum: 100_000n, unit: 'count', mutation: true },
  'field_name.scalars': { maximum: 256n, unit: 'count', mutation: true },
  'field_name.utf8_bytes': { maximum: 1_024n, unit: 'bytes', mutation: true },
  'id.payload_bytes': { maximum: 1_024n, unit: 'bytes', mutation: true },
  'literal_list.items': { maximum: 10_000n, unit: 'count', mutation: false },
  'object.fields': { maximum: 10_000n, unit: 'count', mutation: true },
  'path.candidates': { maximum: 1_000_000n, unit: 'count', mutation: false },
  'path.segments': { maximum: 100n, unit: 'count', mutation: true },
  'path.utf8_bytes': { maximum: 4_096n, unit: 'bytes', mutation: true },
  'pipeline.stages': { maximum: 256n, unit: 'count', mutation: false },
  'projection.paths': { maximum: 10_000n, unit: 'count', mutation: false },
  'regex.pattern_bytes': { maximum: 65_536n, unit: 'bytes', mutation: false },
  'sort.keys': { maximum: 64n, unit: 'count', mutation: false },
  'vector.dimension': { maximum: 4_096n, unit: 'count', mutation: true },
  'vector.top_k': { maximum: 10_000n, unit: 'count', mutation: false },
});

const CODES_BY_CATEGORY = Object.freeze({
  parse: [
    'PAR_MALFORMED_ENVELOPE',
    'PAR_TRUNCATED_INPUT',
    'PAR_INVALID_JSON',
    'PAR_INVALID_CBOR',
    'PAR_INVALID_UTF8',
    'PAR_INVALID_TYPED_VALUE',
    'PAR_COMPRESSION_FAILED',
  ],
  validation: [
    'VAL_UNKNOWN_COMMAND',
    'VAL_UNKNOWN_OPTION',
    'VAL_UNKNOWN_OPERATOR',
    'VAL_INVALID_SHAPE',
    'VAL_INVALID_LITERAL',
    'VAL_INVALID_FIELD_NAME',
    'VAL_INVALID_PATH',
    'VAL_PROTECTED_FIELD',
    'VAL_DUPLICATE_FIELD',
    'VAL_CONFLICTING_PATHS',
    'VAL_SCHEMA_MISMATCH',
    'VAL_RESOURCE_NOT_FOUND',
    'VAL_UNSUPPORTED_COMBINATION',
  ],
  type: [
    'TYPE_MISMATCH',
    'TYPE_COERCION_LOSS',
    'TYPE_NUMERIC_OVERFLOW',
    'TYPE_NUMERIC_UNDERFLOW',
    'TYPE_INVALID_SPECIAL',
    'TYPE_TEMPORAL_RANGE',
    'TYPE_VECTOR_DIMENSION',
    'TYPE_VECTOR_ZERO_NORM',
    'TYPE_EXPRESSION_MISSING',
  ],
  conflict: [
    'CON_WRITE_CONFLICT',
    'CON_IDEMPOTENCY_MISMATCH',
    'CON_TRANSACTION_STATE',
    'CON_SNAPSHOT_EXPIRED',
    'CON_CURSOR_STATE',
    'CON_STALE_EPOCH',
    'CON_RETRY_EXHAUSTED',
  ],
  uniqueness: ['UNQ_PRIMARY_DUPLICATE', 'UNQ_SECONDARY_DUPLICATE', 'UNQ_GENERATED_ID_EXHAUSTED'],
  authorization: [
    'AUTH_UNAUTHENTICATED',
    'AUTH_CREDENTIAL_EXPIRED',
    'AUTH_FORBIDDEN',
    'AUTH_SCOPE_DENIED',
    'AUTH_POLICY_DENIED',
  ],
  capability: [
    'CAP_UNSUPPORTED_FEATURE',
    'CAP_UNSUPPORTED_VERSION',
    'CAP_HOST_UNAVAILABLE',
    'CAP_STORAGE_UNAVAILABLE',
    'CAP_GPU_UNAVAILABLE',
    'CAP_GPU_DEVICE_LOST',
    'CAP_CLOCK_UNSAFE',
    'CAP_FORMAT_UNSUPPORTED',
  ],
  quota: [
    'QUOTA_LIMIT_EXCEEDED',
    'QUOTA_RATE_LIMITED',
    'QUOTA_MEMORY',
    'QUOTA_STORAGE',
    'QUOTA_CONCURRENCY',
    'QUOTA_GPU',
    'QUOTA_RESULT',
  ],
  deadline: ['DEADLINE_EXCEEDED', 'DEADLINE_CANCELLED', 'DEADLINE_CURSOR_EXPIRED'],
  durability: [
    'DUR_IO',
    'DUR_SYNC',
    'DUR_NO_SPACE',
    'DUR_CORRUPTION',
    'DUR_RECOVERY_REQUIRED',
    'DUR_ACK_UNKNOWN',
    'DUR_BACKUP_INVALID',
    'DUR_RESTORE_INVALID',
  ],
  internal: ['INT_INVARIANT', 'INT_PANIC', 'INT_SERIALIZATION', 'INT_UNEXPECTED'],
});

const PHASE_BY_CATEGORY = Object.freeze({
  parse: 'decode',
  validation: 'validate',
  type: 'execute',
  conflict: 'execute',
  uniqueness: 'execute',
  authorization: 'authorize',
  capability: 'admit',
  quota: 'admit',
  deadline: 'execute',
  durability: 'commit',
  internal: 'internal',
});

const PHASE_OVERRIDES = new Map([
  ['CON_SNAPSHOT_EXPIRED', 'snapshot'],
  ['CON_CURSOR_STATE', 'cursor'],
  ['DEADLINE_CURSOR_EXPIRED', 'cursor'],
  ['DUR_RECOVERY_REQUIRED', 'recover'],
  ['DUR_ACK_UNKNOWN', 'acknowledge'],
  ['DUR_BACKUP_INVALID', 'backup'],
  ['DUR_RESTORE_INVALID', 'restore'],
]);

const RETRY_SCOPES = Object.freeze({
  new_snapshot: new Set(['CON_WRITE_CONFLICT', 'CON_SNAPSHOT_EXPIRED', 'CON_STALE_EPOCH']),
  same_idempotency_key: new Set(['DUR_ACK_UNKNOWN']),
  after_capability_change: new Set([
    'CAP_HOST_UNAVAILABLE',
    'CAP_STORAGE_UNAVAILABLE',
    'CAP_GPU_UNAVAILABLE',
    'CAP_GPU_DEVICE_LOST',
  ]),
  after_delay: new Set(['QUOTA_RATE_LIMITED', 'QUOTA_MEMORY', 'QUOTA_CONCURRENCY', 'QUOTA_GPU']),
  after_operator_action: new Set([
    'CAP_CLOCK_UNSAFE',
    'QUOTA_STORAGE',
    'DUR_IO',
    'DUR_SYNC',
    'DUR_NO_SPACE',
    'DUR_RECOVERY_REQUIRED',
    'DUR_BACKUP_INVALID',
    'DUR_RESTORE_INVALID',
  ]),
});

const ERROR_REGISTRY = new Map();
for (const [category, codes] of Object.entries(CODES_BY_CATEGORY)) {
  for (const code of codes) {
    let scope = 'never';
    for (const [candidate, scopedCodes] of Object.entries(RETRY_SCOPES)) {
      if (scopedCodes.has(code)) scope = candidate;
    }
    ERROR_REGISTRY.set(
      code,
      Object.freeze({
        category,
        code,
        phase: PHASE_OVERRIDES.get(code) ?? PHASE_BY_CATEGORY[category],
        outcome: code === 'DUR_ACK_UNKNOWN' ? 'unknown' : 'not_applicable',
        retry: Object.freeze({
          retryable: scope !== 'never',
          scope,
          token: ['new_snapshot', 'same_idempotency_key'].includes(scope) ? 'present' : 'absent',
        }),
      }),
    );
  }
}

if (ERROR_REGISTRY.size !== 74) {
  throw new Error(`oracle registry must contain 74 errors, received ${ERROR_REGISTRY.size}`);
}

export const ERROR_CODES = Object.freeze([...ERROR_REGISTRY.keys()].sort());

export const errorMetadata = (code) => {
  const metadata = ERROR_REGISTRY.get(code);
  if (!metadata) throw new Error(`unregistered errors-v1 code ${JSON.stringify(code)}`);
  return metadata;
};

export class OracleExecutionError extends Error {
  constructor(code, options = {}) {
    super(code);
    this.name = 'OracleExecutionError';
    this.code = code;
    this.details = options.details;
    this.outcome = options.outcome;
    this.phase = options.phase;
  }
}

export class FixtureDiagnostic extends Error {
  constructor(code, at, message) {
    super(`${code} at ${at}: ${message}`);
    this.name = 'FixtureDiagnostic';
    this.code = code;
    this.at = at;
  }
}

export const fixtureFailure = (code, at, message) => {
  throw new FixtureDiagnostic(code, at, message);
};

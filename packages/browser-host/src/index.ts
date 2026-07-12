export const BROWSER_HOST_ABI = Object.freeze({ major: 7, minor: 0 });
export const MAXIMUM_BROWSER_WASM_BYTES = 16 * 1024 * 1024;
export const MAXIMUM_BROWSER_GRANTS = 128;
export const MAXIMUM_BROWSER_SCOPE_BYTES = 4096;
export const MAXIMUM_BROWSER_BUFFER_BYTES = 16 * 1024 * 1024;

export const BROWSER_CAPABILITY_KINDS = [
  'files',
  'directories',
  'durability',
  'locks',
  'timers',
  'randomness',
  'scheduling',
  'metrics',
  'secrets',
  'networking',
  'object-storage',
  'gpu',
] as const;

export type BrowserCapabilityKind = (typeof BROWSER_CAPABILITY_KINDS)[number];

export interface BrowserCapabilityGrant {
  readonly kind: BrowserCapabilityKind;
  readonly scope: string;
}

export interface BrowserRuntimeFeatures {
  readonly opfs: boolean;
  readonly indexedDb: boolean;
  readonly webGpu: boolean;
  readonly cryptographicRandom: boolean;
  readonly monotonicClock: boolean;
  readonly workers: boolean;
}

export interface BrowserRuntimeSurface {
  readonly navigator?: {
    readonly storage?: { readonly getDirectory?: unknown };
    readonly gpu?: unknown;
  };
  readonly indexedDB?: { readonly open?: unknown };
  readonly crypto?: { readonly getRandomValues?: unknown };
  readonly performance?: { readonly now?: unknown };
  readonly Worker?: unknown;
}

export interface HandleDescriptor {
  readonly kind: string;
  readonly name: string;
  readonly version: { readonly major: number; readonly minor: number };
}

export interface ExecutionProfile {
  readonly version: { readonly major: number; readonly minor: number };
  readonly memory: {
    readonly totalBytes: bigint;
    readonly scratchBytes: bigint;
    readonly resultBytes: bigint;
    readonly maximumAllocations: number;
  };
  readonly device: {
    readonly profileName: string;
    readonly architecture: string;
    readonly logicalCores: number;
    readonly class: 'cpu-only' | 'cpu-and-gpu';
    readonly features: readonly string[];
    readonly maximumBufferBytes: bigint;
  };
}

export interface BrowserOperationContext {
  readonly requestId: Uint8Array;
  readonly idempotencyKey?: Uint8Array;
  readonly deadline?: { readonly timerName: string; readonly tick: bigint };
}

export interface BrowserReadRequest {
  readonly path: string;
  readonly offset: bigint;
  readonly length: number;
}

export interface BrowserReadResult {
  readonly offset: bigint;
  readonly bytes: Uint8Array;
  readonly endOfFile: boolean;
}

export interface BrowserWriteRequest {
  readonly path: string;
  readonly offset: bigint;
  readonly bytes: Uint8Array;
}

export interface BrowserWriteResult {
  readonly offset: bigint;
  readonly bytesWritten: number;
}

export interface BrowserRenameRequest {
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly replace: boolean;
}

export interface BrowserRenameResult {
  readonly replaced: boolean;
}

export type BrowserPathKind = 'file' | 'directory';

export interface BrowserDirectoryEntry {
  readonly name: string;
  readonly kind: BrowserPathKind;
  readonly byteLength?: bigint;
}

export interface BrowserListRequest {
  readonly path: string;
}

export interface BrowserListResult {
  readonly entries: readonly BrowserDirectoryEntry[];
}

export interface BrowserDeleteRequest {
  readonly path: string;
  readonly kind: BrowserPathKind;
}

export interface BrowserDeleteResult {
  readonly deleted: boolean;
}

export type BrowserDurabilityLevel =
  | 'memory'
  | 'data'
  | 'data-and-metadata'
  | 'data-metadata-and-directory';

export interface BrowserSyncRequest {
  readonly path: string;
  readonly level: BrowserDurabilityLevel;
}

export interface BrowserSyncResult {
  readonly level: BrowserDurabilityLevel;
}

export type BrowserClockRole = 'wall-time-utc' | 'monotonic' | 'mvcc' | 'logical-expiry';

export interface BrowserClockRequest {
  readonly role: BrowserClockRole;
  readonly sourceName: string;
  readonly sequence: bigint;
}

export type BrowserClockValue =
  | { readonly tag: 'utc-microseconds'; readonly value: bigint }
  | { readonly tag: 'monotonic-tick'; readonly value: bigint }
  | { readonly tag: 'ordered-token'; readonly value: Uint8Array };

export interface BrowserClockSample extends BrowserClockRequest {
  readonly value: BrowserClockValue;
  readonly resolutionNs: bigint;
  readonly quality: 'trusted' | 'degraded' | 'unsafe';
}

export type BrowserRandomPurpose =
  | 'request-id'
  | 'transaction-id'
  | 'uuid-v7'
  | 'object-id'
  | 'nonce'
  | 'sampling';

export interface BrowserRandomRequest {
  readonly purpose: BrowserRandomPurpose;
  readonly byteLength: number;
  readonly sequence: bigint;
}

export interface BrowserCancellationToken {
  readonly cancelled: boolean;
}

export interface BrowserHostAdapters {
  readonly readBatch?: (
    context: BrowserOperationContext,
    requests: readonly BrowserReadRequest[],
  ) => Promise<BrowserReadResult[]>;
  readonly writeBatch?: (
    context: BrowserOperationContext,
    requests: readonly BrowserWriteRequest[],
  ) => Promise<BrowserWriteResult[]>;
  readonly renameBatch?: (
    context: BrowserOperationContext,
    requests: readonly BrowserRenameRequest[],
  ) => Promise<BrowserRenameResult[]>;
  readonly listBatch?: (
    context: BrowserOperationContext,
    requests: readonly BrowserListRequest[],
  ) => Promise<BrowserListResult[]>;
  readonly deleteBatch?: (
    context: BrowserOperationContext,
    requests: readonly BrowserDeleteRequest[],
  ) => Promise<BrowserDeleteResult[]>;
  readonly syncBatch?: (
    context: BrowserOperationContext,
    requests: readonly BrowserSyncRequest[],
  ) => Promise<BrowserSyncResult[]>;
  readonly readClock?: (request: BrowserClockRequest) => Promise<BrowserClockSample>;
  readonly readRandom?: (request: BrowserRandomRequest) => Promise<Uint8Array>;
}

export interface BrowserHostOptions {
  readonly grants: readonly BrowserCapabilityGrant[];
  readonly features: BrowserRuntimeFeatures;
  readonly executionProfile: ExecutionProfile;
  readonly adapters?: BrowserHostAdapters;
  readonly lifecycle?: () => {
    readonly state: 'running' | 'draining' | 'stopped';
    readonly shutdownDeadline?: { readonly timerName: string; readonly tick: bigint };
  };
}

const encoder = new TextEncoder();
const capabilityKinds = new Set<string>(BROWSER_CAPABILITY_KINDS);
const safeInteger = (value: bigint, maximum: number, label: string): number => {
  if (value < 0n || value > BigInt(maximum)) {
    throw new BrowserHostError('BUF_OUT_OF_BOUNDS', `${label} is outside the bounded range`);
  }
  return Number(value);
};
const safeU32 = (value: number, maximum: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new BrowserHostError('BUF_OUT_OF_BOUNDS', `${label} is outside the bounded range`);
  }
  return value;
};
const assertBoundedText = (
  value: string,
  maximum: number,
  label: string,
  code = 'AUTH_INVALID_GRANT',
) => {
  const containsControlText = Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (value.length === 0 || encoder.encode(value).byteLength > maximum || containsControlText) {
    throw new BrowserHostError(code, `${label} is empty, unsafe, or oversized`);
  }
};

export class BrowserHostError extends Error {
  readonly code: string;
  readonly phase: string;

  constructor(code: string, message: string, phase = 'browser-host') {
    super(message);
    this.name = 'BrowserHostError';
    this.code = code;
    this.phase = phase;
  }
}

export class BrowserCapabilityPolicy {
  readonly #keys: ReadonlySet<string>;

  constructor(grants: readonly BrowserCapabilityGrant[]) {
    if (grants.length > MAXIMUM_BROWSER_GRANTS) {
      throw new BrowserHostError('AUTH_INVALID_GRANT', 'capability grant count exceeds the bound');
    }
    const keys = new Set<string>();
    for (const grant of grants) {
      if (!capabilityKinds.has(grant.kind)) {
        throw new BrowserHostError('AUTH_INVALID_GRANT', 'capability kind is unknown');
      }
      assertBoundedText(grant.scope, MAXIMUM_BROWSER_SCOPE_BYTES, 'capability scope');
      if (grant.scope.includes('*')) {
        throw new BrowserHostError(
          'AUTH_INVALID_GRANT',
          'wildcard capability scopes are forbidden',
        );
      }
      const key = `${grant.kind}\u0000${grant.scope}`;
      if (keys.has(key)) {
        throw new BrowserHostError('AUTH_INVALID_GRANT', 'duplicate capability grant');
      }
      keys.add(key);
    }
    this.#keys = keys;
  }

  permits(kind: BrowserCapabilityKind, scope: string): boolean {
    return this.#keys.has(`${kind}\u0000${scope}`);
  }

  require(kind: BrowserCapabilityKind, scope: string): void {
    if (!this.permits(kind, scope)) {
      throw new BrowserHostError('AUTH_SCOPE_DENIED', `capability ${kind} is not granted`);
    }
  }
}

export class BrowserImmutableBuffer {
  readonly #bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    if (bytes.byteLength > MAXIMUM_BROWSER_BUFFER_BYTES) {
      throw new BrowserHostError('BUF_OUT_OF_BOUNDS', 'immutable buffer exceeds the size bound');
    }
    this.#bytes = bytes.slice();
  }

  length(): bigint {
    return BigInt(this.#bytes.byteLength);
  }

  copy(): Uint8Array {
    return this.#bytes.slice();
  }
}

export class BrowserStagingBuffer {
  readonly #bytes: Uint8Array;
  #initializedLength = 0;
  #sealed = false;

  constructor(capacity: number) {
    safeU32(capacity, MAXIMUM_BROWSER_BUFFER_BYTES, 'capacity');
    this.#bytes = new Uint8Array(capacity);
  }

  capacity(): bigint {
    return BigInt(this.#bytes.byteLength);
  }

  initializedLength(): bigint {
    return BigInt(this.#initializedLength);
  }

  write(offset: bigint, source: Uint8Array): { bytesWritten: number; initializedLength: bigint } {
    if (this.#sealed) throw new BrowserHostError('BUF_CLOSED', 'staging buffer is sealed');
    const start = safeInteger(offset, this.#bytes.byteLength, 'write offset');
    if (start > this.#initializedLength || source.byteLength > this.#bytes.byteLength - start) {
      throw new BrowserHostError('BUF_OUT_OF_BOUNDS', 'write is noncontiguous or exceeds capacity');
    }
    this.#bytes.set(source, start);
    this.#initializedLength = Math.max(this.#initializedLength, start + source.byteLength);
    return { bytesWritten: source.byteLength, initializedLength: BigInt(this.#initializedLength) };
  }

  seal(initializedLength: bigint): BrowserImmutableBuffer {
    if (this.#sealed) throw new BrowserHostError('BUF_CLOSED', 'staging buffer is already sealed');
    const length = safeInteger(initializedLength, this.#initializedLength, 'initialized length');
    if (length !== this.#initializedLength) {
      throw new BrowserHostError(
        'BUF_LENGTH_MISMATCH',
        'seal length must equal initialized length',
      );
    }
    this.#sealed = true;
    return new BrowserImmutableBuffer(this.#bytes.subarray(0, length));
  }
}

export class BrowserOpaqueHandle {
  readonly #descriptor: HandleDescriptor;

  constructor(descriptor: HandleDescriptor) {
    this.#descriptor = structuredClone(descriptor);
  }

  descriptor(): HandleDescriptor {
    return structuredClone(this.#descriptor);
  }
}

export const detectBrowserRuntimeFeatures = (
  runtime: BrowserRuntimeSurface,
): BrowserRuntimeFeatures => ({
  opfs: typeof runtime.navigator?.storage?.getDirectory === 'function',
  indexedDb: typeof runtime.indexedDB?.open === 'function',
  webGpu: runtime.navigator?.gpu !== undefined && runtime.navigator.gpu !== null,
  cryptographicRandom: typeof runtime.crypto?.getRandomValues === 'function',
  monotonicClock: typeof runtime.performance?.now === 'function',
  workers: typeof runtime.Worker === 'function',
});

const allowedImportModules = new Set([
  'helix:core-abi/host-resources@7.0.0',
  'helix:core-abi/host-files@7.0.0',
  'helix:core-abi/host-directories@7.0.0',
  'helix:core-abi/host-durability@7.0.0',
  'helix:core-abi/host-locks@7.0.0',
  'helix:core-abi/host-timers@7.0.0',
  'helix:core-abi/host-randomness@7.0.0',
  'helix:core-abi/host-scheduling@7.0.0',
  'helix:core-abi/host-metrics@7.0.0',
  'helix:core-abi/host-secrets@7.0.0',
  'helix:core-abi/host-control@7.0.0',
]);
const browserFeatureNames = [
  'opfs',
  'indexedDb',
  'webGpu',
  'cryptographicRandom',
  'monotonicClock',
  'workers',
] as const;
const browserAdapterNames = [
  'readBatch',
  'writeBatch',
  'renameBatch',
  'listBatch',
  'deleteBatch',
  'syncBatch',
  'readClock',
  'readRandom',
] as const;

export class BrowserHost {
  readonly policy: BrowserCapabilityPolicy;
  readonly features: BrowserRuntimeFeatures;
  readonly bindings: BrowserHostBindings;
  readonly #adapters: BrowserHostAdapters;
  readonly #executionProfile: ExecutionProfile;
  readonly #lifecycle: BrowserHostOptions['lifecycle'];

  constructor(options: BrowserHostOptions) {
    this.policy = new BrowserCapabilityPolicy(options.grants);
    const featureKeys = Object.keys(options.features);
    if (
      featureKeys.length !== browserFeatureNames.length ||
      !browserFeatureNames.every(
        (name) => featureKeys.includes(name) && typeof options.features[name] === 'boolean',
      )
    ) {
      throw new BrowserHostError('CAP_INVALID_PROFILE', 'browser features must be booleans');
    }
    this.features = Object.freeze({ ...options.features });
    this.#executionProfile = validateExecutionProfile(options.executionProfile);
    const adapters = options.adapters ?? {};
    if (
      Object.entries(adapters).some(
        ([name, adapter]) =>
          !browserAdapterNames.includes(name as (typeof browserAdapterNames)[number]) ||
          typeof adapter !== 'function',
      )
    ) {
      throw new BrowserHostError('CAP_INVALID_PROFILE', 'browser adapter shape is invalid');
    }
    this.#adapters = Object.freeze({ ...adapters });
    this.#lifecycle = options.lifecycle;
    this.bindings = this.#createBindings();
  }

  async compileAndInstantiate(bytes: BufferSource): Promise<WebAssembly.Instance> {
    const view =
      bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.byteLength === 0 || view.byteLength > MAXIMUM_BROWSER_WASM_BYTES) {
      throw new BrowserHostError('ABI_COMPONENT_SIZE', 'Wasm module is empty or exceeds the bound');
    }
    if (!WebAssembly.validate(view)) {
      throw new BrowserHostError('ABI_INVALID_MODULE', 'browser rejected the Wasm module');
    }
    const module = await WebAssembly.compile(view);
    for (const entry of WebAssembly.Module.imports(module)) {
      if (entry.kind !== 'function' || !allowedImportModules.has(entry.module)) {
        throw new BrowserHostError(
          'AUTH_IMPORT_DENIED',
          'Wasm module requests an unrecognized import',
        );
      }
    }
    if (WebAssembly.Module.imports(module).length !== 0) {
      throw new BrowserHostError(
        'ABI_COMPONENT_BINDING_PENDING',
        'raw core-module imports cannot substitute for generated Component Model bindings',
      );
    }
    return WebAssembly.instantiate(module, {});
  }

  #createBindings(): BrowserHostBindings {
    const adapters = this.#adapters;
    const requireAdapter = <K extends keyof BrowserHostAdapters>(
      kind: BrowserCapabilityKind,
      scope: string,
      name: K,
    ): NonNullable<BrowserHostAdapters[K]> => {
      this.policy.require(kind, scope);
      const adapter = adapters[name];
      if (!adapter)
        throw new BrowserHostError('CAP_HOST_UNAVAILABLE', `${String(name)} adapter is absent`);
      return adapter as NonNullable<BrowserHostAdapters[K]>;
    };
    const checkCancellation = (token: BrowserCancellationToken) => {
      if (token.cancelled) throw new BrowserHostError('OP_CANCELLED', 'operation was cancelled');
    };
    const bindings: BrowserHostBindings = {
      immutableBufferLength: (buffer) => buffer.length(),
      mutableStagingBufferCapacity: (buffer) => buffer.capacity(),
      mutableStagingBufferInitializedLength: (buffer) => buffer.initializedLength(),
      opaqueHandleDescriptor: (handle) => handle.descriptor(),
      allocateStaging: (capacity) =>
        new BrowserStagingBuffer(safeInteger(capacity, MAXIMUM_BROWSER_BUFFER_BYTES, 'capacity')),
      sealStaging: (buffer, initializedLength) => buffer.seal(initializedLength),
      duplicateImmutable: (buffer) => new BrowserImmutableBuffer(buffer.copy()),
      readImmutable: (buffer, offset, length) => {
        const bytes = buffer.copy();
        const start = safeInteger(offset, bytes.byteLength, 'read offset');
        const requested = safeU32(length, 0xffff_ffff, 'read length');
        const end = Math.min(bytes.byteLength, start + requested);
        return { offset, bytes: bytes.slice(start, end), endOfBuffer: end === bytes.byteLength };
      },
      writeStaging: (buffer, offset, bytes) => buffer.write(offset, bytes),
      copyImmutableToStaging: (source, target, sourceOffset, targetOffset, length) => {
        const sourceBytes = source.copy();
        const start = safeInteger(sourceOffset, sourceBytes.byteLength, 'source offset');
        const requested = safeU32(length, 0xffff_ffff, 'copy length');
        if (requested > sourceBytes.byteLength - start) {
          throw new BrowserHostError('BUF_OUT_OF_BOUNDS', 'copy exceeds the immutable source');
        }
        return target.write(targetOffset, sourceBytes.slice(start, start + requested));
      },
      readBatch: async (scope, context, requests, cancellation) => {
        checkCancellation(cancellation);
        return requireAdapter('files', scope, 'readBatch')(context, requests);
      },
      writeBatch: async (scope, context, requests, cancellation) => {
        checkCancellation(cancellation);
        return requireAdapter('files', scope, 'writeBatch')(context, requests);
      },
      renameBatch: async (scope, context, requests, cancellation) => {
        checkCancellation(cancellation);
        return requireAdapter('directories', scope, 'renameBatch')(context, requests);
      },
      listBatch: async (scope, context, requests, cancellation) => {
        checkCancellation(cancellation);
        return requireAdapter('directories', scope, 'listBatch')(context, requests);
      },
      deleteBatch: async (scope, context, requests, cancellation) => {
        checkCancellation(cancellation);
        return requireAdapter('directories', scope, 'deleteBatch')(context, requests);
      },
      syncBatch: async (scope, context, requests, cancellation) => {
        checkCancellation(cancellation);
        return requireAdapter('durability', scope, 'syncBatch')(context, requests);
      },
      readClock: async (scope, request) => requireAdapter('timers', scope, 'readClock')(request),
      readRandom: async (scope, request) =>
        requireAdapter('randomness', scope, 'readRandom')(request),
      pollCancellation: (token) => token.cancelled,
      lifecycle: () => this.#lifecycle?.() ?? { state: 'running' },
      captureExecutionProfile: () => structuredClone(this.#executionProfile),
    };
    return Object.freeze(bindings);
  }
}

const validateExecutionProfile = (profile: ExecutionProfile): ExecutionProfile => {
  if (profile.version.major !== 7 || profile.version.minor !== 0) {
    throw new BrowserHostError('CAP_UNSUPPORTED_VERSION', 'execution profile ABI is unsupported');
  }
  const { memory, device } = profile;
  if (
    memory.totalBytes <= 0n ||
    memory.totalBytes > 4_294_967_296n ||
    memory.scratchBytes < 0n ||
    memory.scratchBytes > memory.totalBytes ||
    memory.resultBytes < 0n ||
    memory.resultBytes > memory.totalBytes ||
    !Number.isSafeInteger(memory.maximumAllocations) ||
    memory.maximumAllocations <= 0 ||
    memory.maximumAllocations > 1_048_576
  ) {
    throw new BrowserHostError('QUOTA_MEMORY', 'execution memory profile is outside its bounds');
  }
  assertBoundedText(device.profileName, 64, 'device profile name', 'CAP_INVALID_PROFILE');
  assertBoundedText(device.architecture, 64, 'device architecture', 'CAP_INVALID_PROFILE');
  if (
    !Number.isSafeInteger(device.logicalCores) ||
    device.logicalCores <= 0 ||
    device.logicalCores > 65_535 ||
    device.maximumBufferBytes <= 0n ||
    device.maximumBufferBytes > memory.totalBytes ||
    device.features.length > 64 ||
    !['cpu-only', 'cpu-and-gpu'].includes(device.class)
  ) {
    throw new BrowserHostError('CAP_INVALID_PROFILE', 'device profile is outside its bounds');
  }
  const features = [...device.features];
  for (const feature of features)
    assertBoundedText(feature, 64, 'device feature', 'CAP_INVALID_PROFILE');
  const featuresUnsorted = features.some((value, index) => {
    if (index === 0) return false;
    const previous = features[index - 1];
    return previous === undefined || value <= previous;
  });
  if (new Set(features).size !== features.length || featuresUnsorted) {
    throw new BrowserHostError('CAP_INVALID_PROFILE', 'device features must be sorted and unique');
  }
  return structuredClone(profile);
};

export interface BrowserHostBindings {
  readonly immutableBufferLength: (buffer: BrowserImmutableBuffer) => bigint;
  readonly mutableStagingBufferCapacity: (buffer: BrowserStagingBuffer) => bigint;
  readonly mutableStagingBufferInitializedLength: (buffer: BrowserStagingBuffer) => bigint;
  readonly opaqueHandleDescriptor: (handle: BrowserOpaqueHandle) => HandleDescriptor;
  readonly allocateStaging: (capacity: bigint) => BrowserStagingBuffer;
  readonly sealStaging: (
    buffer: BrowserStagingBuffer,
    initializedLength: bigint,
  ) => BrowserImmutableBuffer;
  readonly duplicateImmutable: (buffer: BrowserImmutableBuffer) => BrowserImmutableBuffer;
  readonly readImmutable: (
    buffer: BrowserImmutableBuffer,
    offset: bigint,
    length: number,
  ) => { readonly offset: bigint; readonly bytes: Uint8Array; readonly endOfBuffer: boolean };
  readonly writeStaging: (
    buffer: BrowserStagingBuffer,
    offset: bigint,
    bytes: Uint8Array,
  ) => { readonly bytesWritten: number; readonly initializedLength: bigint };
  readonly copyImmutableToStaging: (
    source: BrowserImmutableBuffer,
    target: BrowserStagingBuffer,
    sourceOffset: bigint,
    targetOffset: bigint,
    length: number,
  ) => { readonly bytesWritten: number; readonly initializedLength: bigint };
  readonly readBatch: (
    scope: string,
    context: BrowserOperationContext,
    requests: readonly BrowserReadRequest[],
    cancellation: BrowserCancellationToken,
  ) => Promise<BrowserReadResult[]>;
  readonly writeBatch: (
    scope: string,
    context: BrowserOperationContext,
    requests: readonly BrowserWriteRequest[],
    cancellation: BrowserCancellationToken,
  ) => Promise<BrowserWriteResult[]>;
  readonly renameBatch: (
    scope: string,
    context: BrowserOperationContext,
    requests: readonly BrowserRenameRequest[],
    cancellation: BrowserCancellationToken,
  ) => Promise<BrowserRenameResult[]>;
  readonly listBatch: (
    scope: string,
    context: BrowserOperationContext,
    requests: readonly BrowserListRequest[],
    cancellation: BrowserCancellationToken,
  ) => Promise<BrowserListResult[]>;
  readonly deleteBatch: (
    scope: string,
    context: BrowserOperationContext,
    requests: readonly BrowserDeleteRequest[],
    cancellation: BrowserCancellationToken,
  ) => Promise<BrowserDeleteResult[]>;
  readonly syncBatch: (
    scope: string,
    context: BrowserOperationContext,
    requests: readonly BrowserSyncRequest[],
    cancellation: BrowserCancellationToken,
  ) => Promise<BrowserSyncResult[]>;
  readonly readClock: (scope: string, request: BrowserClockRequest) => Promise<BrowserClockSample>;
  readonly readRandom: (scope: string, request: BrowserRandomRequest) => Promise<Uint8Array>;
  readonly pollCancellation: (token: BrowserCancellationToken) => boolean;
  readonly lifecycle: () => {
    readonly state: 'running' | 'draining' | 'stopped';
    readonly shutdownDeadline?: { readonly timerName: string; readonly tick: bigint };
  };
  readonly captureExecutionProfile: () => ExecutionProfile;
}

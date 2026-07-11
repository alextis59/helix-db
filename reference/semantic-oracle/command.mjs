import { OracleExecutionError } from './registry.mjs';
import {
  arrayAll,
  arrayElemMatch,
  cloneValue,
  compareValues,
  equalValues,
  objectField,
  pathCandidates,
  V,
  validateValue,
} from './value.mjs';

const isRecord = (value) => value && typeof value === 'object' && !Array.isArray(value);
const numericTags = new Set(['int32', 'int64', 'float64', 'decimal128']);

const literal = (node) => {
  if (!isRecord(node) || Object.keys(node).length !== 1 || !Object.hasOwn(node, '$value')) {
    throw new OracleExecutionError('VAL_INVALID_LITERAL');
  }
  try {
    validateValue(node.$value);
  } catch {
    throw new OracleExecutionError('VAL_INVALID_LITERAL');
  }
  return node.$value;
};

const rangeCompatible = (left, right) => {
  if (numericTags.has(left.t) && numericTags.has(right.t)) return true;
  if (left.t !== right.t || ['missing', 'null'].includes(left.t)) return false;
  if (left.t === 'vector') {
    return left.element === right.element && left.dimension === right.dimension;
  }
  return true;
};

const validateElemPredicate = (predicate) => {
  if (!isRecord(predicate) || Object.keys(predicate).length !== 1) {
    throw new OracleExecutionError('VAL_INVALID_SHAPE');
  }
  const [operator, operand] = Object.entries(predicate)[0];
  if (operator !== '$eq') throw new OracleExecutionError('VAL_UNKNOWN_OPERATOR');
  return literal(operand);
};

const evaluateFieldPredicate = (document, path, predicate) => {
  if (!isRecord(predicate) || Object.keys(predicate).length === 0) {
    throw new OracleExecutionError('VAL_INVALID_SHAPE');
  }
  const candidates = pathCandidates(document, path);
  let result = true;
  for (const [operator, operandNode] of Object.entries(predicate)) {
    let matches;
    switch (operator) {
      case '$eq': {
        const operand = literal(operandNode);
        matches = candidates.some((candidate) => equalValues(candidate, operand));
        break;
      }
      case '$ne': {
        const operand = literal(operandNode);
        matches = !candidates.some((candidate) => equalValues(candidate, operand));
        break;
      }
      case '$gt':
      case '$gte':
      case '$lt':
      case '$lte': {
        const operand = literal(operandNode);
        matches = candidates.some((candidate) => {
          if (!rangeCompatible(candidate, operand)) return false;
          const order = compareValues(candidate, operand);
          if (operator === '$gt') return order > 0;
          if (operator === '$gte') return order >= 0;
          if (operator === '$lt') return order < 0;
          return order <= 0;
        });
        break;
      }
      case '$exists':
        if (typeof operandNode !== 'boolean') throw new OracleExecutionError('VAL_INVALID_LITERAL');
        matches = operandNode ? candidates.length > 0 : candidates.length === 0;
        break;
      case '$size': {
        const operand = literal(operandNode);
        if (!['int32', 'int64'].includes(operand.t) || BigInt(operand.value) < 0n) {
          throw new OracleExecutionError('VAL_INVALID_LITERAL');
        }
        matches = candidates.some(
          (candidate) =>
            candidate.t === 'array' && BigInt(candidate.values.length) === BigInt(operand.value),
        );
        break;
      }
      case '$all': {
        const operand = literal(operandNode);
        if (operand.t !== 'array') throw new OracleExecutionError('TYPE_MISMATCH');
        matches = candidates.some(
          (candidate) => candidate.t === 'array' && arrayAll(candidate, operand).value,
        );
        break;
      }
      case '$elemMatch': {
        const operand = validateElemPredicate(operandNode);
        matches = candidates.some(
          (candidate) => candidate.t === 'array' && arrayElemMatch(candidate, operand).value,
        );
        break;
      }
      case '$vectorTopK': {
        if (!isRecord(operandNode)) throw new OracleExecutionError('VAL_INVALID_SHAPE');
        const allowed = new Set(['vector', 'metric', 'k']);
        if (Object.keys(operandNode).some((key) => !allowed.has(key))) {
          throw new OracleExecutionError('VAL_UNKNOWN_OPTION');
        }
        const vector = literal(operandNode.vector);
        if (vector.t !== 'vector' || !['l2', 'dot', 'cosine'].includes(operandNode.metric)) {
          throw new OracleExecutionError('VAL_INVALID_LITERAL');
        }
        if (!Number.isSafeInteger(operandNode.k) || operandNode.k < 1 || operandNode.k > 10_000) {
          throw new OracleExecutionError('VAL_INVALID_LITERAL');
        }
        matches = true;
        break;
      }
      default:
        throw new OracleExecutionError('VAL_UNKNOWN_OPERATOR');
    }
    result = result && matches;
  }
  return result;
};

const evaluateFilter = (document, filter) => {
  if (!isRecord(filter)) throw new OracleExecutionError('VAL_INVALID_SHAPE');
  for (const [path, predicate] of Object.entries(filter)) {
    if (path.startsWith('$')) throw new OracleExecutionError('VAL_UNKNOWN_OPERATOR');
    if (!evaluateFieldPredicate(document, path, predicate)) return false;
  }
  return true;
};

const findCollection = (state, name) => {
  const collection = state.collections.find((candidate) => candidate.name === name);
  if (!collection) throw new OracleExecutionError('VAL_RESOURCE_NOT_FOUND');
  return collection;
};

const projectDocument = (document, projection) => {
  if (!isRecord(projection) || Object.keys(projection).length === 0) {
    throw new OracleExecutionError('VAL_INVALID_SHAPE');
  }
  for (const direction of Object.values(projection)) {
    if (![0, 1].includes(direction)) throw new OracleExecutionError('VAL_INVALID_LITERAL');
  }
  const entries = Object.entries(projection);
  const nonIdModes = new Set(entries.filter(([name]) => name !== '_id').map(([, mode]) => mode));
  if (nonIdModes.size > 1) throw new OracleExecutionError('VAL_UNSUPPORTED_COMBINATION');
  const inclusion = nonIdModes.has(1);
  if (inclusion) {
    const fields = [];
    for (const [name, mode] of entries) {
      if (mode !== 1) continue;
      const value = objectField(document, name);
      if (value !== undefined) fields.push({ name, value: cloneValue(value) });
    }
    if (!Object.hasOwn(projection, '_id') && objectField(document, '_id') !== undefined) {
      fields.unshift({ name: '_id', value: cloneValue(objectField(document, '_id')) });
    }
    return { t: 'object', fields };
  }
  return {
    t: 'object',
    fields: document.fields
      .filter((field) => projection[field.name] !== 0)
      .map((field) => ({ name: field.name, value: cloneValue(field.value) })),
  };
};

const orderKey = (value, direction = 'asc') => ({
  kind: 'value',
  direction,
  value: cloneValue(value),
});
const exactOrder = (basis, keys) => ({
  mode: 'exact',
  basis,
  row_count: keys.length,
  keys: keys.map((components) => ({ components })),
});

const executeFind = (command, state) => {
  const allowedOptions = new Set(['find', 'filter', 'projection', 'sort', 'skip', 'limit']);
  if (Object.keys(command).some((key) => !allowedOptions.has(key))) {
    throw new OracleExecutionError('VAL_UNKNOWN_OPTION');
  }
  if (typeof command.find !== 'string' || !isRecord(command.filter)) {
    throw new OracleExecutionError('VAL_INVALID_SHAPE');
  }
  if (command.sort !== undefined) {
    if (!isRecord(command.sort) || Object.keys(command.sort).length === 0) {
      throw new OracleExecutionError('VAL_INVALID_SHAPE');
    }
    for (const direction of Object.values(command.sort)) {
      if (![1, -1].includes(direction)) throw new OracleExecutionError('VAL_INVALID_LITERAL');
    }
    if (Object.keys(command.sort).length > 64)
      throw new OracleExecutionError('QUOTA_LIMIT_EXCEEDED');
  }
  if (command.projection !== undefined && Object.keys(command.projection).length > 10_000) {
    throw new OracleExecutionError('QUOTA_LIMIT_EXCEEDED');
  }
  for (const option of ['skip', 'limit']) {
    if (
      command[option] !== undefined &&
      (!Number.isSafeInteger(command[option]) || command[option] < 0)
    )
      throw new OracleExecutionError('VAL_INVALID_LITERAL');
  }
  const hasVector = JSON.stringify(command.filter).includes('"$vectorTopK"');
  if (hasVector && command.sort !== undefined)
    throw new OracleExecutionError('VAL_UNSUPPORTED_COMBINATION');
  // Validate the entire filter before resource lookup to preserve errors-v1 precedence.
  evaluateFilter({ t: 'object', fields: [] }, command.filter);
  const collection = findCollection(state, command.find);
  let selected = collection.documents
    .filter((document) => evaluateFilter(document, command.filter))
    .map((document) => ({ document, id: objectField(document, '_id') }));

  let basis = 'default_order_v1';
  let keyRows;
  if (command.sort !== undefined) {
    basis = 'explicit_sort';
    const sortEntries = Object.entries(command.sort);
    const components = (row) => [
      ...sortEntries.map(([path, direction]) => ({
        value: pathCandidates(row.document, path)[0] ?? V.missing(),
        direction,
      })),
      { value: row.id, direction: 1 },
    ];
    selected.sort((left, right) => {
      for (const component of components(left).map((value, index) => [
        value,
        components(right)[index],
      ])) {
        const [{ value: a, direction }, { value: b }] = component;
        const order = compareValues(a, b) * direction;
        if (order !== 0) return order;
      }
      return 0;
    });
    keyRows = selected.map((row) =>
      components(row).map(({ value, direction }) =>
        orderKey(value, direction === 1 ? 'asc' : 'desc'),
      ),
    );
  } else {
    selected.sort((left, right) => compareValues(left.id, right.id));
    keyRows = selected.map((row) => [orderKey(row.id)]);
  }

  const skip = command.skip ?? 0;
  const limit = command.limit ?? selected.length;
  selected = selected.slice(skip, skip + limit);
  keyRows = keyRows.slice(skip, skip + limit);
  const rows = selected.map(({ document }) =>
    command.projection === undefined
      ? cloneValue(document)
      : projectDocument(document, command.projection),
  );
  return {
    value: V.object([['rows', V.array(rows)]]),
    order: exactOrder(basis, keyRows),
  };
};

const updatePaths = (update) => {
  if (!isRecord(update) || Object.keys(update).length === 0) {
    throw new OracleExecutionError('VAL_INVALID_SHAPE', { outcome: 'not_committed' });
  }
  const paths = [];
  for (const [operator, operands] of Object.entries(update)) {
    if (!['$set', '$unset', '$inc'].includes(operator)) {
      throw new OracleExecutionError('VAL_UNKNOWN_OPERATOR', { outcome: 'not_committed' });
    }
    if (!isRecord(operands))
      throw new OracleExecutionError('VAL_INVALID_SHAPE', { outcome: 'not_committed' });
    for (const [path, operand] of Object.entries(operands)) {
      if (path === '_id' || path.startsWith('_id.')) {
        throw new OracleExecutionError('VAL_PROTECTED_FIELD', { outcome: 'not_committed' });
      }
      if (operator !== '$unset') literal(operand);
      paths.push(path);
    }
  }
  for (let left = 0; left < paths.length; left += 1) {
    for (let right = left + 1; right < paths.length; right += 1) {
      if (
        paths[left] === paths[right] ||
        paths[left].startsWith(`${paths[right]}.`) ||
        paths[right].startsWith(`${paths[left]}.`)
      )
        throw new OracleExecutionError('VAL_CONFLICTING_PATHS', { outcome: 'not_committed' });
    }
  }
  return paths;
};

const validateUpdateOne = (command) => {
  const allowed = new Set(['updateOne', 'filter', 'update', 'upsert']);
  if (Object.keys(command).some((key) => !allowed.has(key))) {
    throw new OracleExecutionError('VAL_UNKNOWN_OPTION', { outcome: 'not_committed' });
  }
  if (typeof command.updateOne !== 'string' || !isRecord(command.filter)) {
    throw new OracleExecutionError('VAL_INVALID_SHAPE', { outcome: 'not_committed' });
  }
  evaluateFilter({ t: 'object', fields: [] }, command.filter);
  updatePaths(command.update);
  // The P01-019 command corpus contains validation failures only. Actual mutation execution
  // becomes a broader state oracle in the CRUD/update engine phases.
  throw new OracleExecutionError('CAP_UNSUPPORTED_FEATURE', { outcome: 'not_committed' });
};

export const executeCommand = (command, state) => {
  if (!isRecord(command) || Object.keys(command).length === 0) {
    throw new OracleExecutionError('VAL_INVALID_SHAPE');
  }
  const commandKeys = ['find', 'updateOne'].filter((key) => Object.hasOwn(command, key));
  if (commandKeys.length === 0) throw new OracleExecutionError('VAL_UNKNOWN_COMMAND');
  if (commandKeys.length !== 1) throw new OracleExecutionError('VAL_INVALID_SHAPE');
  if (commandKeys[0] === 'find') return executeFind(command, state);
  return validateUpdateOne(command);
};

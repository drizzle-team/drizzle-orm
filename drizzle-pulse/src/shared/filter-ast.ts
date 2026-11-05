import type { WhereClause } from '../types.js';

/** @internal */
const LOGICAL_KEYS = new Set(['OR', 'AND', 'NOT']);
/** @internal */
const OPERATOR_KEYS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'isNull', 'isNotNull'] as const;

/** @internal */
export type OperatorObject = {
  eq?: unknown;
  ne?: unknown;
  gt?: unknown;
  gte?: unknown;
  lt?: unknown;
  lte?: unknown;
  in?: unknown;
  isNull?: unknown;
  isNotNull?: unknown;
};

type FilterConditionObject = Record<string, unknown> & {
  AND?: unknown;
  OR?: unknown;
  NOT?: unknown;
};

/** @internal */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @internal */
export function hasOperatorKey(value: Record<string, unknown>) {
  return OPERATOR_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isNumericLike(value: unknown): value is number | string {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value !== 'string') {
    return false;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return Number.isFinite(Number(trimmed));
}

/** @internal */
export function compareScalarValues(left: unknown, right: unknown): number | null {
  if (isNumericLike(left) && isNumericLike(right)) {
    const numericLeft = Number(left);
    const numericRight = Number(right);
    if (numericLeft === numericRight) return 0;
    return numericLeft < numericRight ? -1 : 1;
  }

  if (typeof left === 'string' && typeof right === 'string') {
    if (left === right) return 0;
    return left < right ? -1 : 1;
  }

  if (left === right) {
    return 0;
  }

  return null;
}

type WhereAst =
  | { kind: 'always-true' }
  | { kind: 'always-false' }
  | {
      kind: 'group';
      columns: Array<{ columnName: string; filterValue: unknown }>;
      and: WhereAst[];
      or: WhereAst[];
      not: WhereAst | null;
    };

function validateLogicalNodeShape(condition: FilterConditionObject): void {
  const hasAnd = condition.AND !== undefined;
  const hasOr = condition.OR !== undefined;
  const hasNot = condition.NOT !== undefined;
  const logicalCount = [hasAnd, hasOr, hasNot].filter((value) => value).length;

  if (logicalCount > 1) {
    throw new Error('Invalid where condition: AND/OR/NOT are mutually exclusive per level');
  }

  if (logicalCount === 1) {
    const nonLogicalKeys = Object.keys(condition).filter((key) => !LOGICAL_KEYS.has(key));
    if (nonLogicalKeys.length > 0) {
      throw new Error('Invalid where condition: logical node cannot include column filters');
    }
  }

  if (hasAnd && !Array.isArray(condition.AND)) {
    throw new Error('Invalid where condition: AND must be an array');
  }

  if (hasOr && !Array.isArray(condition.OR)) {
    throw new Error('Invalid where condition: OR must be an array');
  }

  if (Array.isArray(condition.NOT)) {
    throw new Error('Invalid where condition: NOT must be an object');
  }
}

/** @internal */
export function parseWhereClause(condition: WhereClause | unknown | null | undefined): WhereAst {
  if (condition === null || condition === undefined) {
    return { kind: 'always-true' };
  }

  if (!isPlainObject(condition)) {
    return { kind: 'always-false' };
  }

  const filterCondition: FilterConditionObject = condition;
  validateLogicalNodeShape(filterCondition);

  const columns: Array<{ columnName: string; filterValue: unknown }> = [];
  for (const [key, value] of Object.entries(filterCondition)) {
    if (LOGICAL_KEYS.has(key)) {
      continue;
    }

    columns.push({ columnName: key, filterValue: value });
  }

  const and = Array.isArray(filterCondition.AND)
    ? filterCondition.AND.map((child) => parseWhereClause(child))
    : [];

  const or = Array.isArray(filterCondition.OR)
    ? filterCondition.OR.map((child) => parseWhereClause(child))
    : [];

  let not: WhereAst | null = null;
  if (filterCondition.NOT) {
    not = parseWhereClause(filterCondition.NOT);
  }

  return {
    kind: 'group',
    columns,
    and,
    or,
    not,
  };
}

function evalColumn(
  columnName: string,
  filterValue: unknown,
  row: Record<string, unknown>,
): boolean {
  const colVal = row[columnName];

  if (filterValue === null) {
    return colVal === null || colVal === undefined;
  }

  if (!isPlainObject(filterValue) || !hasOperatorKey(filterValue)) {
    return compareScalarValues(colVal, filterValue) === 0;
  }

  const ops = filterValue as OperatorObject;

  // All present operators must hold — AND semantics, matching combineWithAnd in the SQL builder.
  if (ops.eq !== undefined) {
    // SQL: col = NULL is always NULL (row excluded); use { col: null } or { isNull: true }
    if (ops.eq === null || ops.eq === undefined) return false;
    if (compareScalarValues(colVal, ops.eq) !== 0) return false;
  }

  if (ops.ne !== undefined) {
    // SQL ne excludes NULLs: NULL ne 'x' → NULL (row excluded). Mirror that here.
    if (colVal === null || colVal === undefined) return false;
    if (compareScalarValues(colVal, ops.ne) === 0) return false;
  }

  if (ops.gt !== undefined) {
    const r = compareScalarValues(colVal, ops.gt);
    if (r === null || r <= 0) return false;
  }

  if (ops.gte !== undefined) {
    const r = compareScalarValues(colVal, ops.gte);
    if (r === null || r < 0) return false;
  }

  if (ops.lt !== undefined) {
    const r = compareScalarValues(colVal, ops.lt);
    if (r === null || r >= 0) return false;
  }

  if (ops.lte !== undefined) {
    const r = compareScalarValues(colVal, ops.lte);
    if (r === null || r > 0) return false;
  }

  if (ops.in !== undefined) {
    const arr = Array.isArray(ops.in) ? ops.in : [];
    if (arr.length === 0) return false;
    // SQL: NULL IN (...) is always NULL regardless of array contents
    if (colVal === null || colVal === undefined) return false;
    if (!arr.some((v) => compareScalarValues(colVal, v) === 0)) return false;
  }

  if (ops.isNull === true && !(colVal === null || colVal === undefined)) return false;
  if (ops.isNotNull === true && (colVal === null || colVal === undefined)) return false;

  return true;
}

function evalAst(ast: WhereAst, row: Record<string, unknown>): boolean {
  if (ast.kind === 'always-true') return true;
  if (ast.kind === 'always-false') return false;

  for (const { columnName, filterValue } of ast.columns) {
    if (!evalColumn(columnName, filterValue, row)) return false;
  }

  if (ast.and.length > 0 && !ast.and.every((child) => evalAst(child, row))) return false;
  if (ast.or.length > 0 && !ast.or.some((child) => evalAst(child, row))) return false;
  if (ast.not !== null && evalAst(ast.not, row)) return false;

  return true;
}

/**
 * Evaluates a `WhereClause` predicate against an in-memory row.
 *
 * Returns the same boolean the SQL predicate built by `buildWhereClausePredicate`
 * would produce, including: ne excludes NULLs, empty `in` → false, isNull/isNotNull,
 * NOT/AND/OR composition, and numeric-text coercion via `compareScalarValues`.
 */
export function evaluateCondition(
  where: WhereClause | null | undefined,
  row: Record<string, unknown>,
): boolean {
  return evalAst(parseWhereClause(where), row);
}

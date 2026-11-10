import {
  and,
  isNotNull as drizzleIsNotNull,
  isNull as drizzleIsNull,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  ne,
  not,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import {
  hasOperatorKey,
  isPlainObject,
  type OperatorObject,
  parseWhereClause,
} from '../shared/filter-ast.js';

import type { WhereClause } from '../types.js';

type WhereAst = ReturnType<typeof parseWhereClause>;

function getColumn(
  columnName: string,
  columns: Record<string, PgColumn>,
  allowedColumnNames: ReadonlySet<string>,
): PgColumn {
  if (!allowedColumnNames.has(columnName)) {
    throw new Error(`Unsupported column: ${columnName}`);
  }

  const column = columns[columnName];
  if (!column) {
    throw new Error(`Unsupported column: ${columnName}`);
  }

  return column;
}

/**
 * Builds a Drizzle SQL predicate for a single column filter.
 */
function buildColumnFilterPredicate(
  columnName: string,
  filterValue: unknown,
  columns: Record<string, PgColumn>,
  allowedColumnNames: ReadonlySet<string>,
): SQL | undefined {
  if (filterValue === undefined) return undefined;

  const column = getColumn(columnName, columns, allowedColumnNames);
  if (filterValue === null) {
    return drizzleIsNull(column);
  }

  if (!isPlainObject(filterValue) || !hasOperatorKey(filterValue)) {
    return eq(column, filterValue);
  }

  const clauses: SQL[] = [];
  const ops: OperatorObject = filterValue;

  if (ops.eq !== undefined) clauses.push(eq(column, ops.eq));
  if (ops.ne !== undefined) clauses.push(ne(column, ops.ne));
  if (ops.gt !== undefined) clauses.push(gt(column, ops.gt));
  if (ops.gte !== undefined) clauses.push(gte(column, ops.gte));
  if (ops.lt !== undefined) clauses.push(lt(column, ops.lt));
  if (ops.lte !== undefined) clauses.push(lte(column, ops.lte));

  if (ops.in !== undefined) {
    if (!Array.isArray(ops.in)) {
      throw new Error(`Expected array for in operator on ${columnName}`);
    }

    if (ops.in.length === 0) {
      clauses.push(sql`false`);
    } else {
      clauses.push(inArray(column, ops.in));
    }
  }

  if (ops.isNull === true) {
    clauses.push(drizzleIsNull(column));
  }
  if (ops.isNotNull === true) {
    clauses.push(drizzleIsNotNull(column));
  }

  return and(...clauses);
}

function buildWhereAstPredicate(
  ast: WhereAst,
  columns: Record<string, PgColumn>,
  allowedColumnNames: ReadonlySet<string>,
): SQL | undefined {
  if (ast.kind === 'always-true') {
    return undefined;
  }

  if (ast.kind === 'always-false') {
    throw new Error('Invalid where condition');
  }

  const clauses: SQL[] = [];

  for (const { columnName, filterValue } of ast.columns) {
    const columnClause = buildColumnFilterPredicate(
      columnName,
      filterValue,
      columns,
      allowedColumnNames,
    );
    if (columnClause) clauses.push(columnClause);
  }

  for (const child of ast.and) {
    const childClause = buildWhereAstPredicate(child, columns, allowedColumnNames);
    if (childClause) clauses.push(childClause);
  }

  if (ast.or.length > 0) {
    const orClauses = ast.or
      .map((child) => buildWhereAstPredicate(child, columns, allowedColumnNames))
      .filter((clause): clause is SQL => Boolean(clause));

    if (orClauses.length === 1) {
      const [singleClause] = orClauses;
      if (singleClause) {
        clauses.push(singleClause);
      }
    } else if (orClauses.length > 1) {
      const orClause = or(...orClauses);
      if (orClause) {
        clauses.push(orClause);
      }
    }
  }

  if (ast.not) {
    const notClause = buildWhereAstPredicate(ast.not, columns, allowedColumnNames);
    if (notClause) {
      const negated = not(notClause);
      if (negated) {
        clauses.push(negated);
      }
    }
  }

  return and(...clauses);
}

/**
 * Builds a Drizzle SQL predicate from a Pulse `WhereClause` tree.
 */
export function buildWhereClausePredicate(
  condition: WhereClause | null | undefined,
  columns: Record<string, PgColumn>,
  allowedColumnNames: ReadonlySet<string>,
): SQL | undefined {
  return buildWhereAstPredicate(parseWhereClause(condition), columns, allowedColumnNames);
}

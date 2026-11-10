import { asc, desc } from 'drizzle-orm';
import type { PgAsyncDatabase, PgQueryResultHKT, PgTable } from 'drizzle-orm/pg-core';
import type { ResolvedPulseQuery } from '../types.js';
import { buildWhereClausePredicate } from './drizzle-utils.js';
import { getQueryColumnKey } from './pulse-types.js';

// biome-ignore lint/suspicious/noExplicitAny: any pg driver
export type PulseSourceDb = PgAsyncDatabase<PgQueryResultHKT, any>;

type SelectQueryConfig = Pick<
  ResolvedPulseQuery,
  | 'table'
  | 'pkColumn'
  | 'columns'
  | 'selectedColumns'
  | 'allowedColumnNames'
  | 'order'
  | 'limit'
  | 'where'
>;

function getReadColumns(query: SelectQueryConfig) {
  const pkQueryKey = getQueryColumnKey(query.columns, query.pkColumn);
  if (!pkQueryKey || pkQueryKey in query.selectedColumns) {
    return query.selectedColumns;
  }

  const pkColumn = query.columns[pkQueryKey];
  if (!pkColumn) {
    return query.selectedColumns;
  }

  return {
    ...query.selectedColumns,
    [pkQueryKey]: pkColumn,
  };
}

export function buildSelectQuery(
  db: PulseSourceDb,
  sourceTable: PgTable,
  query: SelectQueryConfig,
): PromiseLike<Record<string, unknown>[]> {
  const whereClause = buildWhereClausePredicate(
    query.where,
    query.columns,
    query.allowedColumnNames,
  );

  let q = db.select(getReadColumns(query)).from(sourceTable).where(whereClause).$dynamic();

  if (query.order) {
    const orderFn = query.order === 'desc' ? desc : asc;
    q = q.orderBy(orderFn(query.pkColumn));
  }

  if (query.limit !== null && query.limit !== undefined) {
    return q.limit(query.limit);
  }

  return q;
}

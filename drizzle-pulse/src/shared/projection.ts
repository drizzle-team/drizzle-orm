import type { ResolvedPulseQuery } from '../types.js';
import { applyColumnFilter, getQueryColumnKey } from './column-filter.js';
import { getQualifiedTableName } from './qualified-table-name.js';

// Must stay free of drizzle-orm/pg-core VALUE imports (bare `drizzle-orm` only): the embedded
// client entrypoint value-imports projectEmbeddedRows directly, and platform-imports.test.ts
// enforces purity across everything reachable from there.
export function addPrimaryKey(row: Record<string, unknown>, pulseQuery: ResolvedPulseQuery) {
  // `row` is SELECT-shaped (keyed by JS property name), which diverges from the PK
  // column's own SQL name whenever a table declares e.g. `orderId: serial('order_id')` —
  // resolve the JS query key once and index by that instead.
  const pkQueryKey =
    getQueryColumnKey(pulseQuery.columns, pulseQuery.pkColumn) ?? pulseQuery.pkColumn.name;
  const pkValue = row[pkQueryKey];
  if (pkValue === undefined) {
    throw new Error(
      `Primary key column "${pulseQuery.pkColumn.name}" on "${getQualifiedTableName(pulseQuery.table)}" is missing`,
    );
  }

  return { ...row, $pk: pkValue };
}

// Synchronous projection helper for the HTTP server path — skips async transformRows.
export function applyProjectionPipeline(
  rows: Record<string, unknown>[],
  pulseQuery: Pick<ResolvedPulseQuery, 'pkColumn' | 'selectedColumns' | 'table' | 'columns'>,
): Record<string, unknown>[] {
  return rows
    .map((row) => addPrimaryKey(row, pulseQuery as ResolvedPulseQuery))
    .map((row) => applyColumnFilter(row, pulseQuery.selectedColumns));
}

// Embedded projection: no `$pk` stamp. The pk is read off the unprojected row (the baseline
// SELECT always includes the pk column, and WAL rows are full under REPLICA IDENTITY FULL)
// and returned alongside the filtered row, so the visible row is exactly the selected columns
// — deselecting the pk really removes it from the row.
export function projectEmbeddedRows(
  rows: Record<string, unknown>[],
  pulseQuery: Pick<ResolvedPulseQuery, 'pkColumn' | 'selectedColumns' | 'table' | 'columns'>,
): Array<{ pk: unknown; row: Record<string, unknown> }> {
  const pkQueryKey =
    getQueryColumnKey(pulseQuery.columns, pulseQuery.pkColumn) ?? pulseQuery.pkColumn.name;
  return rows.map((row) => {
    const pk = row[pkQueryKey];
    if (pk === undefined) {
      throw new Error(
        `Primary key column "${pulseQuery.pkColumn.name}" on "${getQualifiedTableName(pulseQuery.table)}" is missing`,
      );
    }
    return { pk, row: applyColumnFilter(row, pulseQuery.selectedColumns) };
  });
}

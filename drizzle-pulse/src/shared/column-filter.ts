import type { PgColumn } from 'drizzle-orm/pg-core';
import type { WithPk } from '../server/pulse-types.js';

// Must stay free of drizzle-orm/pg-core VALUE imports (bare `drizzle-orm` only): the embedded
// client entrypoint value-imports projectEmbeddedRows directly, and platform-imports.test.ts
// enforces purity across everything reachable from there.
export function getQueryColumnKey(columns: Record<string, PgColumn>, targetColumn: PgColumn) {
  for (const [queryKey, column] of Object.entries(columns)) {
    if (column === targetColumn || column.name === targetColumn.name) {
      return queryKey;
    }
  }

  return null;
}

export function applyColumnFilter(
  row: Record<string, unknown>,
  selectedColumns: Record<string, PgColumn>,
) {
  const keys = Object.keys(selectedColumns);
  if (keys.length === 0) return row;
  const result: Record<string, unknown> & { $pk?: unknown } = {};

  if ('$pk' in row) {
    const rowWithPk = row as WithPk<typeof row>;
    result.$pk = rowWithPk.$pk;
  }

  for (const [k, v] of Object.entries(row)) {
    if (k === '$pk') continue;
    if (k in selectedColumns) {
      result[k] = v;
    }
  }

  return result;
}

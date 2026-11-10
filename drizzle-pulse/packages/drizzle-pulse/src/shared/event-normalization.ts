import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Extracts a query-keyed row from an already JS-property-keyed event record.
 *
 * Iterates over `columns` (mapping query key → PgColumn) and copies
 * `rawEvent[keyPrefix + queryKey]` into the result under the query key, skipping
 * keys whose source value is `undefined`. The query keys mirror the source
 * table's JS property keys, so they also index the events-table record.
 *
 * Values arrive already in their JS types: the HTTP-pull path reads the events
 * table via a typed Drizzle select, and the embedded WAL tap receives rows
 * minipg decoded through the per-table replication shapes, re-keyed to JS
 * property keys (see server/wal-shape-bridge.ts). So this only re-keys and
 * prunes — no type coercion happens here.
 *
 * Returns `null` when all column values are absent (all-undefined event).
 */
export function extractRow(
  rawEvent: Record<string, unknown>,
  columns: Record<string, PgColumn>,
  keyPrefix = '',
): Record<string, unknown> | null {
  const row: Record<string, unknown> = {};
  for (const queryKey of Object.keys(columns)) {
    const value = rawEvent[`${keyPrefix}${queryKey}`];
    if (value !== undefined) {
      row[queryKey] = value;
    }
  }
  return Object.keys(row).length > 0 ? row : null;
}

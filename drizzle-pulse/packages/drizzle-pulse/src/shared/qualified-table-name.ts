import { getTableName, getTableSchema, type Table } from 'drizzle-orm';

// Must match the `schema.table` key that the WAL decoder builds from each change. drizzle-orm's
// getTableUniqueName omits the default schema since 1.0.0-rc.5, so Pulse owns this format.
export function getQualifiedTableName(table: Table): string {
  return `${getTableSchema(table) ?? 'public'}.${getTableName(table)}`;
}

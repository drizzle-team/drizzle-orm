import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { SQLiteColumn } from '~/sqlite-core/columns/index.ts';

export * from '~/sql/expressions/index.ts';

export function concat(column: SQLiteColumn | SQL.Aliased, value: string | SQLWrapper): SQL {
	return sql`${column} || ${value}`;
}

export function substring(
	column: SQLiteColumn | SQL.Aliased,
	start: number | bigint | SQLWrapper,
	length?: number | bigint | SQLWrapper,
): SQL {
	return length === undefined ? sql`substr(${column}, ${start})` : sql`substr(${column}, ${start}, ${length})`;
}

/**
 * The `rowid` of a row, as a `number`
 *
 * A row id above `Number.MAX_SAFE_INTEGER` does not fit a `number`: use `rowId.big()` for tables that have them
 */
export function rowId(): SQL<number> {
	return sql<number>`rowid`.mapWith(Number);
}

/**
 * The `rowid` of a row, as a `bigint`
 *
 * Exact for every row id on the drivers that read integers as `bigint` (`better-sqlite3`, `bun:sqlite`, Turso
 * Database). The other drivers give the row id as a `number`, so there it is exact only up to
 * `Number.MAX_SAFE_INTEGER`
 */
rowId.big = (): SQL<bigint> => sql<bigint>`rowid`.mapWith(BigInt);

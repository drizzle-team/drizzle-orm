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

export function rowId(): SQL<number> {
	return sql<number>`rowid`;
}

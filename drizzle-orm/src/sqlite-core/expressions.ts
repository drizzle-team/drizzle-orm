import { bindIfParam } from '~/sql/expressions/index.ts';
import type { SQL, SQLChunk, SQLWrapper } from '~/sql/sql.ts';
import { sql } from '~/sql/sql.ts';
import type { SQLiteColumn } from '~/sqlite-core/columns/index.ts';

export * from '~/sql/expressions/index.ts';

export function concat(column: SQLiteColumn | SQL.Aliased, value: string | SQLWrapper): SQL {
	return sql`${column} || ${bindIfParam(value, column)}`;
}

export function substring(
	column: SQLiteColumn | SQL.Aliased,
	{ from, for: _for }: { from?: number | SQLWrapper; for?: number | SQLWrapper },
): SQL {
	// SQLite has no `substring(x from y for z)` form, only `substr(x, start, length)`.
	// `substr` counts from 1, which is what an omitted `from` means.
	const chunks: SQLChunk[] = [sql`substr(`, column];
	if (from === undefined) {
		if (_for !== undefined) {
			chunks.push(sql`, 1`);
		}
	} else {
		chunks.push(sql`, `, bindIfParam(from, column));
	}
	if (_for !== undefined) {
		chunks.push(sql`, `, bindIfParam(_for, column));
	}
	chunks.push(sql`)`);
	return sql.join(chunks);
}

export function rowId(): SQL<number> {
	return sql<number>`rowid`;
}

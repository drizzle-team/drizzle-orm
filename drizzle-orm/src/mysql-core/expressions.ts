import { bindIfParam } from '~/expressions';
import type { Placeholder, SQL, SQLChunk, SQLWrapper } from '~/sql';
import { sql } from '~/sql';
import type { AnyMySqlColumn } from './columns/common';

export * from '~/expressions';

export function concat(column: AnyMySqlColumn | SQL.Aliased, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} || ${bindIfParam(value, column)}`;
}

export function substring(
	column: AnyMySqlColumn | SQL.Aliased,
	{ from, for: _for }: { from?: number | Placeholder | SQLWrapper; for?: number | Placeholder | SQLWrapper },
): SQL {
	const chunks: SQLChunk[] = [sql`substring(`, column];
	if (from !== undefined) {
		chunks.push(sql` from `, bindIfParam(from, column));
	}
	if (_for !== undefined) {
		chunks.push(sql` for `, bindIfParam(_for, column));
	}
	chunks.push(sql`)`);
	return sql.join(chunks);
}

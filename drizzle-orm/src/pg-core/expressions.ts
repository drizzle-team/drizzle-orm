import { bindIfParam } from '~/expressions';
import type { AnyPgColumn } from '~/pg-core/columns';
import type { Placeholder, SQL, SQLSourceParam, SQLWrapper } from '~/sql';
import { sql } from '~/sql';

export * from '~/expressions';

export function concat(column: AnyPgColumn | SQL.Aliased, value: string | Placeholder | SQLWrapper): SQL {
	return sql`${column} || ${bindIfParam(value, column)}`;
}

export function substring(
	column: AnyPgColumn | SQL.Aliased,
	{ from, for: _for }: { from?: number | Placeholder | SQLWrapper; for?: number | Placeholder | SQLWrapper },
): SQL {
	const chunks: SQLSourceParam[] = [sql`substring(`, column];
	if (from !== undefined) {
		chunks.push(sql` from `, bindIfParam(from, column));
	}
	if (_for !== undefined) {
		chunks.push(sql` for `, bindIfParam(_for, column));
	}
	chunks.push(sql`)`);
	return sql.fromList(chunks);
}

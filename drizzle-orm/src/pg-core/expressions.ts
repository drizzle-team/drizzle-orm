import { AnyPgColumn } from '~/pg-core/columns';
import { param, SQL, sql, SQLSourceParam } from '~/sql';

export * from '~/expressions';

export function concat(column: AnyPgColumn, value: string): SQL {
	return sql`${column} || ${param(value, column)}`;
}

export function substring(column: AnyPgColumn, { from, for: _for }: { from?: number; for?: number }): SQL {
	const chunks: SQLSourceParam[] = [sql`substring(`, column];
	if (from !== undefined) {
		chunks.push(sql` from `, param(from, column));
	}
	if (_for !== undefined) {
		chunks.push(sql` for `, param(_for, column));
	}
	chunks.push(sql`)`);
	return sql.fromList(chunks);
}

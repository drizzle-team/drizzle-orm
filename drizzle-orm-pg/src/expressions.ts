import { AnyColumn, sql } from 'drizzle-orm';
import { SQLSourceParam } from 'drizzle-orm/sql';
import { TableName } from 'drizzle-orm/utils';

export function concat<TColumn extends AnyColumn>(column: TColumn, value: string) {
	return sql<TableName<TColumn>>`${column} || ${value}`;
}

export function substring<TColumn extends AnyColumn>(
	column: TColumn,
	{ from, for: _for }: { from?: number; for?: number },
) {
	const chunks: SQLSourceParam[] = [sql`substring(`, column];
	if (from !== undefined) {
		chunks.push(sql` from `, from);
	}
	if (_for !== undefined) {
		chunks.push(sql` for `, _for);
	}
	chunks.push(sql`)`);
	return sql.fromList(chunks);
}

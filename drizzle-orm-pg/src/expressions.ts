import { AnyColumn, sql } from 'drizzle-orm';
import { SQLSourceParam, raw } from 'drizzle-orm/sql';
import { TableName } from 'drizzle-orm/utils';

export function concat<TColumn extends AnyColumn>(column: TColumn, value: string) {
	return sql<TableName<TColumn>>`${column} || ${value}`;
}

export function substring<TColumn extends AnyColumn>(
	column: TColumn,
	{ from, for: _for }: { from?: number; for?: number },
) {
	const chunks: SQLSourceParam[] = [raw('substring('), column];
	if (from !== undefined) {
		chunks.push(raw(' from '), from);
	}
	if (_for !== undefined) {
		chunks.push(raw(' for '), _for);
	}
	chunks.push(raw(')'));
	return sql.fromList(chunks);
}

import { AnyColumn, sql } from 'drizzle-orm';
import { ColumnData, TableName } from 'drizzle-orm/branded-types';
import { SQL, SQLSourceParam } from 'drizzle-orm/sql';

export function concat<
	TTableName extends TableName,
	TColumn extends AnyColumn<TTableName>,
>(
	column: TColumn,
	value: string,
): SQL<TTableName> {
	return sql<TTableName>`${column} || ${value as ColumnData<string>}`;
}

export function substring<
	TTableName extends TableName,
	TColumn extends AnyColumn<TTableName>,
>(
	column: TColumn,
	{ from, for: _for }: { from?: number; for?: number },
): SQL<TTableName> {
	const chunks: SQLSourceParam<TTableName>[] = [sql`substring(`, column];
	if (from !== undefined) {
		chunks.push(sql` from `, from as ColumnData<number>);
	}
	if (_for !== undefined) {
		chunks.push(sql` for `, _for as ColumnData<number>);
	}
	chunks.push(sql`)`);
	return sql.fromList(chunks);
}

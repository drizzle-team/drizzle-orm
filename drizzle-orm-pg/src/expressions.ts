import { AnyColumn, sql } from 'drizzle-orm';
import { ColumnData } from 'drizzle-orm/branded-types';
import { SQL, SQLSourceParam } from 'drizzle-orm/sql';
import { GetTableName } from 'drizzle-orm/utils';

export function concat<TColumn extends AnyColumn>(
	column: TColumn,
	value: string,
): SQL<GetTableName<TColumn>> {
	return sql<GetTableName<TColumn>>`${column} || ${value as ColumnData<string>}`;
}

export function substring<TColumn extends AnyColumn>(
	column: TColumn,
	{ from, for: _for }: { from?: number; for?: number },
): SQL<GetTableName<TColumn>> {
	const chunks: SQLSourceParam<GetTableName<TColumn>>[] = [sql`substring(`, column];
	if (from !== undefined) {
		chunks.push(sql` from `, from as ColumnData<number>);
	}
	if (_for !== undefined) {
		chunks.push(sql` for `, _for as ColumnData<number>);
	}
	chunks.push(sql`)`);
	return sql.fromList(chunks);
}

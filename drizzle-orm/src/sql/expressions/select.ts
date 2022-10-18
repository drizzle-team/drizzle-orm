import { Column } from '../../column';
import { SQL, sql } from '..';

export function asc<TTableName extends string>(
	column: Column<{ tableName: TTableName }>,
): SQL<TTableName> {
	return sql`${column} asc`;
}

export function desc<TTableName extends string>(
	column: Column<{ tableName: TTableName }>,
): SQL<TTableName> {
	return sql`${column} desc`;
}

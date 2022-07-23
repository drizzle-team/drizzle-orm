import { TableName } from '../../branded-types';
import { AnyColumn } from '../../column';
import { SQL, sql } from '..';

export function asc<TTableName extends TableName>(
	column: AnyColumn<TTableName>,
): SQL<TTableName> {
	return sql`${column} asc`;
}

export function desc<TTableName extends TableName>(
	column: AnyColumn<TTableName>,
): SQL<TTableName> {
	return sql`${column} desc`;
}

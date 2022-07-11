import { AnyTable, tableName } from './core';

export function getTableName<TTableName extends string>(
	table: AnyTable<TTableName>,
): TTableName {
	return table[tableName];
}

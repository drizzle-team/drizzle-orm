import { AnyColumn, Column } from './column';
import { AnyTable, Table } from './table';

/** @internal */
export const tableName = Symbol('tableName');

/** @internal */
export const tableColumns = Symbol('tableColumns');

/** @internal */
export const tableRowMapper = Symbol('tableRowMapper');

export function getTableName<TTableName extends string>(table: AnyTable<TTableName>): TTableName {
	return table[tableName];
}

export function getTableRowMapper<TTableName extends string>(
	table: AnyTable<TTableName>,
) {
	return table[tableRowMapper];
}

export type TableName<T extends AnyTable | AnyColumn> = T extends AnyTable<infer TName> ? TName
	: T extends AnyColumn<infer TName> ? TName
	: never;

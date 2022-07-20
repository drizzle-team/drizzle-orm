import { ColumnDriverParam, TableName } from './branded-types';
import { AnyColumn, Column } from './column';
import { SelectFieldsOrdered } from './operations';
import { AnyTable, Table } from './table';

/** @internal */
export const tableName = Symbol('tableName');

/** @internal */
export const tableColumns = Symbol('tableColumns');

/** @internal */
export const tableRowMapper = Symbol('tableRowMapper');

export function getTableName<TTableName extends TableName>(table: AnyTable<TTableName>): TTableName {
	return table[tableName];
}

export function getTableRowMapper<TTableName extends TableName>(
	table: AnyTable<TTableName>,
): <TResult>(columns: SelectFieldsOrdered, row: ColumnDriverParam[]) => TResult {
	return table[tableRowMapper] as <TResult>(columns: SelectFieldsOrdered, row: ColumnDriverParam[]) => TResult;
}

export type GetTableName<T extends AnyTable | AnyColumn> = T extends AnyTable<infer TName> ? TName
	: T extends AnyColumn<infer TName> ? TName
	: never;

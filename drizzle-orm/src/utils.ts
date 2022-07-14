import { AnyColumn, Column } from './column';
import { AnyTable, TableColumns } from './table';

/** @internal */
export const tableName = Symbol('tableName');

/** @internal */
export const tableColumns = Symbol('tableColumns');

export function getTableName<TTableName extends string>(table: AnyTable<TTableName>): TTableName {
	return table[tableName];
}

export function getTableColumns<TTable extends AnyTable>(table: TTable): TableColumns<TTable> {
	return table[tableColumns];
}

export type TableName<T extends AnyTable | AnyColumn> = T extends AnyTable<infer TName>
	? TName
	: T extends Column<infer TName>
	? TName
	: never;

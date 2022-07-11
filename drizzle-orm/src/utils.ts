import { AnyTable } from '.';

/** @internal */
export const tableName = Symbol('tableName');

/** @internal */
export const tableColumns = Symbol('columns');

export function getTableName<TTableName extends string>(table: AnyTable<TTableName>): TTableName {
	return table[tableName];
}

export type TableName<T extends AnyTable> = T extends AnyTable<infer TName> ? TName : never;

import { AnyColumn } from '.';
import { ColumnBuilder, BuildColumnsWithTable } from './column-builder';
import { tableColumns, tableName } from './utils';

export function table<TTableName extends string, TColumnsMap extends Record<string, ColumnBuilder>>(
	name: TTableName,
	columns: TColumnsMap,
	other?: (self: BuildColumnsWithTable<TTableName, TColumnsMap>) => any,
): Table<TTableName, BuildColumnsWithTable<TTableName, TColumnsMap>> &
	BuildColumnsWithTable<TTableName, TColumnsMap> {
	const table = new Table<TTableName, BuildColumnsWithTable<TTableName, TColumnsMap>>(name);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colConfig]) => [name, colConfig.build(table)]),
	) as BuildColumnsWithTable<TTableName, TColumnsMap>;

	table[tableColumns] = builtColumns;

	return Object.assign(table, builtColumns);
}

export class Table<TName extends string, TColumns extends Record<string, AnyColumn>> {
	/** @internal */
	[tableName]: TName;

	/** @internal */
	[tableColumns]!: TColumns;

	constructor(name: TName) {
		this[tableName] = name;
	}
}

export type AnyTable<TName extends string = string> = Table<TName, Record<string, AnyColumn>>;

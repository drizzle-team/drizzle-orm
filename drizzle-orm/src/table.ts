import { AnyColumn } from './column';
import { ColumnBuilder, BuildColumns } from './column-builder';
import { tableColumns, tableName } from './utils';

export type TableExtraConfig = Record<string, unknown>;

export function table<TTableName extends string, TColumnsMap extends Record<string, ColumnBuilder>>(
	name: TTableName,
	columns: TColumnsMap,
): Table<TTableName, BuildColumns<TTableName, TColumnsMap>> &
	BuildColumns<TTableName, TColumnsMap> {
	const table = new Table<TTableName, BuildColumns<TTableName, TColumnsMap>>(name);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colConfig]) => [name, colConfig.build(table)]),
	) as BuildColumns<TTableName, TColumnsMap>;

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

export type TableColumns<TTable extends AnyTable> = TTable[typeof tableColumns];

export type AnyTable<TName extends string = string> = Table<TName, Record<string, AnyColumn>>;

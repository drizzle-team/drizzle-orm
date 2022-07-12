import { AnyColumn } from './column';
import { tableColumns, tableName } from './utils';

export type TableExtraConfig = Record<string, unknown>;

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

import { TableName } from './branded-types';
import { AnyColumn } from './column';
import { tableColumns, tableName } from './utils';

export type TableExtraConfig = Record<string, unknown>;

export class Table<TName extends TableName> {
	protected typeKeeper!: {
		brand: 'Table';
		name: TName;
	};

	/** @internal */
	[tableName]: TName;

	/** @internal */
	[tableColumns]!: Record<string, AnyColumn<TName>>;

	constructor(name: TName) {
		this[tableName] = name;
	}
}

export type AnyTable<TName extends TableName = TableName> = Table<TName>;

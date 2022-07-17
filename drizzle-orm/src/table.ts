import { AnyColumn } from './column';
import { tableColumns, tableName } from './utils';

export type TableExtraConfig = Record<string, unknown>;

export class Table<TName extends string> {
	protected typeKeeper!: {
		name: TName;
	};

	/** @internal */
	[tableName]: TName;

	/** @internal */
	[tableColumns]!: Record<string, AnyColumn>;

	constructor(name: TName) {
		this[tableName] = name;
	}
}

export type AnyTable<TName extends string = string> = Table<TName>;

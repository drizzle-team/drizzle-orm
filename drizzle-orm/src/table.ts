import { AnyColumn } from './column';

/** @internal */
export const nameSym = Symbol();

/** @internal */
export const columnsSym = Symbol();

/** @internal */
export const originalNameSym = Symbol();

export class Table<TName extends string = string> {
	declare protected $brand: 'Table';
	declare protected $name: TName;

	/** @internal */
	static readonly Symbol = {
		Name: nameSym as typeof nameSym,
		OriginalName: originalNameSym as typeof originalNameSym,
		Columns: columnsSym as typeof columnsSym,
	};

	/**
	 *  @internal
	 *  Can be changed if the table is aliased.
	 */
	[nameSym]: TName;

	/**
	 * @internal
	 * Used to store the original name of the table, before any aliasing.
	 */
	[originalNameSym]: TName;

	/** @internal */
	declare [columnsSym]: Record<string | symbol, AnyColumn<{ tableName: TName }>>;

	constructor(name: TName) {
		this[nameSym] = this[originalNameSym] = name;
	}
}

export function getTableName<TTableName extends string>(table: Table<TTableName>): TTableName {
	return table[Table.Symbol.Name];
}

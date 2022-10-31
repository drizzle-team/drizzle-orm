import { AnyColumn } from './column';

/** @internal */
export const Name = Symbol('Name');

/** @internal */
export const Columns = Symbol('Columns');

/** @internal */
export const OriginalName = Symbol('OriginalName');

export class Table<TName extends string | undefined = string> {
	declare protected $brand: 'Table';
	declare protected $name: TName;

	/** @internal */
	static readonly Symbol = {
		Name: Name as typeof Name,
		OriginalName: OriginalName as typeof OriginalName,
		Columns: Columns as typeof Columns,
	};

	/**
	 *  @internal
	 *  Can be changed if the table is aliased.
	 */
	[Name]: TName;

	/**
	 * @internal
	 * Used to store the original name of the table, before any aliasing.
	 */
	[OriginalName]: TName;

	/** @internal */
	declare [Columns]: Record<string | symbol, AnyColumn> | undefined;

	constructor(name: TName) {
		this[Name] = this[OriginalName] = name;
	}
}

export function getTableName<TTableName extends string>(table: Table<TTableName>): TTableName {
	return table[Table.Symbol.Name];
}

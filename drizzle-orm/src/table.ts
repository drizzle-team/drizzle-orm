import { AnyColumn } from './column';

export const Name = Symbol('Name');

export const Columns = Symbol('Columns');

export const OriginalName = Symbol('OriginalName');

export class Table<TName extends string | undefined = string> {
	declare protected $brand: 'Table';
	declare protected $name: TName;

	static readonly Symbol = {
		Name: Name as typeof Name,
		OriginalName: OriginalName as typeof OriginalName,
		Columns: Columns as typeof Columns,
	};

	/**
	 * Can be changed if the table is aliased.
	 */
	[Name]: TName;

	/**
	 * Used to store the original name of the table, before any aliasing.
	 */
	[OriginalName]: TName;

	[Columns]!: Record<string | symbol, AnyColumn>;

	constructor(name: TName) {
		this[Name] = this[OriginalName] = name;
	}
}

export function getTableName<TTableName extends string>(table: Table<TTableName>): TTableName {
	return table[Table.Symbol.Name];
}

import { AnyColumn } from './column';

/** @internal */
export const Name = Symbol('Name');

/** @internal */
export const Schema = Symbol('Schema');

/** @internal */
export const Columns = Symbol('Columns');

/** @internal */
export const OriginalName = Symbol('OriginalName');

export class Table<TName extends string | undefined = string, TSchema extends string | undefined = string> {
	declare protected $brand: 'Table';
	declare protected $name: TName;
	declare protected $schema: TSchema;

	/** @internal */
	static readonly Symbol = {
		Name: Name as typeof Name,
		Schema: Schema as typeof Schema,
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
	[Schema]: TSchema | undefined;

	/** @internal */
	declare [Columns]: Record<string | symbol, AnyColumn> | undefined;

	constructor(name: TName, schema?: TSchema) {
		this[Name] = this[OriginalName] = name;
		this[Schema] = schema;
	}
}

export function getTableName<TTableName extends string>(table: Table<TTableName>): TTableName {
	return table[Table.Symbol.Name];
}

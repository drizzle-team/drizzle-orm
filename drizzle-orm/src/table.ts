import { AnyColumn } from './column';

export const Name = Symbol('Name');

export const Schema = Symbol('Schema');

export const Columns = Symbol('Columns');

export const OriginalName = Symbol('OriginalName');

export class Table<TName extends string | undefined = string, TSchema extends string | undefined = string> {
	declare protected $brand: 'Table';
	declare protected $name: TName;
	declare protected $schema: TSchema;

	static readonly Symbol = {
		Name: Name as typeof Name,
		Schema: Schema as typeof Schema,
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

	[Schema]: TSchema | undefined;

	declare [Columns]: Record<string, AnyColumn>;

	constructor(name: TName, schema?: TSchema) {
		this[Name] = this[OriginalName] = name;
		this[Schema] = schema;
	}
}

export function getTableName<TTableName extends string>(table: Table<TTableName>): TTableName {
	return table[Table.Symbol.Name];
}

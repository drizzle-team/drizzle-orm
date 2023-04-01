import type { AnyColumn, GetColumnData } from './column';
import type { OptionalKeyOnly, RequiredKeyOnly } from './operations';
import type { Simplify, Update } from './utils';

export interface TableConfig<TColumn extends AnyColumn = AnyColumn> {
	name: string;
	schema: string | undefined;
	columns: Record<string, TColumn>;
}

export type UpdateTableConfig<T extends TableConfig, TUpdate extends Partial<TableConfig>> = Required<
	Update<T, TUpdate>
>;

/** @internal */
export const Name = Symbol('Name');

/** @internal */
export const Schema = Symbol('Schema');

/** @internal */
export const Columns = Symbol('Columns');

/** @internal */
export const OriginalName = Symbol('OriginalName');

export class Table<T extends TableConfig = TableConfig> {
	declare readonly _: {
		readonly brand: 'Table';
		readonly config: T;
		readonly name: T['name'];
		readonly schema: T['schema'];
		readonly columns: T['columns'];
		readonly model: {
			select: InferModel<Table<T>>;
			insert: InferModel<Table<T>, 'insert'>;
		};
	};

	/** @internal */
	static readonly Symbol = {
		Name: Name as typeof Name,
		Schema: Schema as typeof Schema,
		OriginalName: OriginalName as typeof OriginalName,
		Columns: Columns as typeof Columns,
	};

	/**
	 * @internal
	 * Can be changed if the table is aliased.
	 */
	[Name]: string;

	/**
	 * @internal
	 * Used to store the original name of the table, before any aliasing.
	 */
	[OriginalName]: string;

	/** @internal */
	[Schema]: string | undefined;

	/** @internal */
	[Columns]!: T['columns'];

	constructor(name: string, schema?: string) {
		this[Name] = this[OriginalName] = name;
		this[Schema] = schema;
	}
}

export type AnyTable<TPartial extends Partial<TableConfig> = {}> = Table<UpdateTableConfig<TableConfig, TPartial>>;

export function getTableName<T extends Table>(table: T): T['_']['name'] {
	return table[Name];
}

export type MapColumnName<TName extends string, TColumn extends AnyColumn, TDBColumNames extends boolean> =
	TDBColumNames extends true ? TColumn['_']['name']
		: TName;

export type InferModel<
	TTable extends AnyTable,
	TInferMode extends 'select' | 'insert' = 'select',
	TConfig extends { dbColumnNames: boolean } = { dbColumnNames: false },
> = TInferMode extends 'insert' ? Simplify<
		& {
			[
				Key in keyof TTable['_']['columns'] & string as RequiredKeyOnly<
					MapColumnName<Key, TTable['_']['columns'][Key], TConfig['dbColumnNames']>,
					TTable['_']['columns'][Key]
				>
			]: GetColumnData<TTable['_']['columns'][Key], 'query'>;
		}
		& {
			[
				Key in keyof TTable['_']['columns'] & string as OptionalKeyOnly<
					MapColumnName<Key, TTable['_']['columns'][Key], TConfig['dbColumnNames']>,
					TTable['_']['columns'][Key]
				>
			]?: GetColumnData<TTable['_']['columns'][Key], 'query'>;
		}
	>
	: {
		[
			Key in keyof TTable['_']['columns'] & string as MapColumnName<
				Key,
				TTable['_']['columns'][Key],
				TConfig['dbColumnNames']
			>
		]: GetColumnData<TTable['_']['columns'][Key], 'query'>;
	};

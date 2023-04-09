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
export const TableName = Symbol('Name');

/** @internal */
export const Schema = Symbol('Schema');

/** @internal */
export const Columns = Symbol('Columns');

/** @internal */
export const OriginalName = Symbol('OriginalName');

/** @internal */
export const BaseName = Symbol('BaseName');

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
		Name: TableName as typeof TableName,
		Schema: Schema as typeof Schema,
		OriginalName: OriginalName as typeof OriginalName,
		Columns: Columns as typeof Columns,
		BaseName: BaseName as typeof BaseName,
	};

	/**
	 * @internal
	 * Can be changed if the table is aliased.
	 */
	[TableName]: string;

	/**
	 * @internal
	 * Used to store the original name of the table, before any aliasing.
	 */
	[OriginalName]: string;

	/** @internal */
	[Schema]: string | undefined;

	/** @internal */
	[Columns]!: T['columns'];

	/**
	 *  @internal
	 * Used to store the table name before the transformation via the `tableCreator` functions.
	 */
	[BaseName]: string;

	constructor(name: string, schema: string | undefined, baseName: string) {
		this[TableName] = this[OriginalName] = name;
		this[Schema] = schema;
		this[BaseName] = baseName;
	}
}

export type AnyTable<TPartial extends Partial<TableConfig> = {}> = Table<UpdateTableConfig<TableConfig, TPartial>>;

export function getTableName<T extends Table>(table: T): T['_']['name'] {
	return table[TableName];
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

import type { AnyColumn, GetColumnData } from './column';
import type { OptionalKeyOnly, RequiredKeyOnly } from './operations';
import type { Assume, SimplifyShallow, Update } from './utils';

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

/** @internal */
export const IsAlias = Symbol('IsAlias');

/** @internal */
export const ExtraConfigBuilder = Symbol('ExtraConfigBuilder');

const IsDrizzleTable = Symbol.for('IsDrizzleTable');

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
		IsAlias: IsAlias as typeof IsAlias,
		ExtraConfigBuilder: ExtraConfigBuilder as typeof ExtraConfigBuilder,
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

	/** @internal */
	[IsAlias] = false;

	/** @internal */
	[ExtraConfigBuilder]: ((self: any) => Record<string, unknown>) | undefined = undefined;

	[IsDrizzleTable] = true;

	constructor(name: string, schema: string | undefined, baseName: string) {
		this[TableName] = this[OriginalName] = name;
		this[Schema] = schema;
		this[BaseName] = baseName;
	}
}

export function isTable(table: unknown): table is Table {
	return typeof table === 'object' && table !== null && IsDrizzleTable in table;
}

export type AnyTable<TPartial extends Partial<TableConfig> = {}> = Table<UpdateTableConfig<TableConfig, TPartial>>;

export interface AnyTableHKT {
	readonly brand: 'TableHKT';
	config: unknown;
	type: unknown;
}

export interface AnyTableHKTBase extends AnyTableHKT {
	type: AnyTable<Assume<this['config'], Partial<TableConfig>>>;
}

export type AnyTableKind<THKT extends AnyTableHKT, TConfig extends Partial<TableConfig>> =
	(THKT & { config: TConfig })['type'];

export function getTableName<T extends Table>(table: T): T['_']['name'] {
	return table[TableName];
}

export type MapColumnName<TName extends string, TColumn extends AnyColumn, TDBColumNames extends boolean> =
	TDBColumNames extends true ? TColumn['_']['name']
		: TName;

export type InferModelFromColumns<
	TColumns extends Record<string, AnyColumn>,
	TInferMode extends 'select' | 'insert' = 'select',
	TConfig extends { dbColumnNames: boolean } = { dbColumnNames: false },
> = TInferMode extends 'insert' ? SimplifyShallow<
		& {
			[
				Key in keyof TColumns & string as RequiredKeyOnly<
					MapColumnName<Key, TColumns[Key], TConfig['dbColumnNames']>,
					TColumns[Key]
				>
			]: GetColumnData<TColumns[Key], 'query'>;
		}
		& {
			[
				Key in keyof TColumns & string as OptionalKeyOnly<
					MapColumnName<Key, TColumns[Key], TConfig['dbColumnNames']>,
					TColumns[Key]
				>
			]?: GetColumnData<TColumns[Key], 'query'>;
		}
	>
	: {
		[
			Key in keyof TColumns & string as MapColumnName<
				Key,
				TColumns[Key],
				TConfig['dbColumnNames']
			>
		]: GetColumnData<TColumns[Key], 'query'>;
	};

export type InferModel<
	TTable extends AnyTable,
	TInferMode extends 'select' | 'insert' = 'select',
	TConfig extends { dbColumnNames: boolean } = { dbColumnNames: false },
> = InferModelFromColumns<TTable['_']['columns'], TInferMode, TConfig>;

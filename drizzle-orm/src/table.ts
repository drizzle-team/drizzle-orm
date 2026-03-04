import type { Column, Columns, GetColumnData } from './column.ts';
import { entityKind } from './entity.ts';
import type { OptionalKeyOnly, RequiredKeyOnly } from './operations.ts';
import type { View } from './sql/sql.ts';
import { TableName } from './table.utils.ts';
import type { Simplify, Update } from './utils.ts';

export interface TableConfig<TColumns extends Columns = Columns> {
	name: string;
	schema: string | undefined;
	columns: TColumns;
	dialect: string;
}

export type UpdateTableConfig<T extends TableConfig, TUpdate extends Partial<TableConfig>> = Required<
	Update<T, TUpdate>
>;

/** @internal */
export const TableSchema = Symbol.for('drizzle:Schema');

/** @internal */
export const TableColumns = Symbol.for('drizzle:Columns');

/** @internal */
export const ExtraConfigColumns = Symbol.for('drizzle:ExtraConfigColumns');

/** @internal */
export const OriginalName = Symbol.for('drizzle:OriginalName');

/** @internal */
export const BaseName = Symbol.for('drizzle:BaseName');

/** @internal */
export const IsAlias = Symbol.for('drizzle:IsAlias');

/** @internal */
export const ExtraConfigBuilder = Symbol.for('drizzle:ExtraConfigBuilder');

const IsDrizzleTable = Symbol.for('drizzle:IsDrizzleTable');

export interface TableTypeConfig<T extends TableConfig> {
	readonly brand: 'Table';
	readonly name: T['name'];
	readonly schema: T['schema'];
	readonly columns: T['columns'];
	readonly dialect: T['dialect'];
}

export class Table<out T extends TableConfig = TableConfig> {
	static readonly [entityKind]: string = 'Table';

	declare readonly _: TableTypeConfig<T>;

	/** @internal */
	static readonly Symbol = {
		Name: TableName as typeof TableName,
		Schema: TableSchema as typeof TableSchema,
		OriginalName: OriginalName as typeof OriginalName,
		Columns: TableColumns as typeof TableColumns,
		ExtraConfigColumns: ExtraConfigColumns as typeof ExtraConfigColumns,
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
	[TableSchema]: string | undefined;

	/** @internal */
	[TableColumns]!: T['columns'];

	/** @internal */
	[ExtraConfigColumns]!: Record<string, unknown>;

	/**
	 *  @internal
	 * Used to store the table name before the transformation via the `tableCreator` functions.
	 */
	[BaseName]: string;

	/** @internal */
	[IsAlias] = false;

	/** @internal */
	[IsDrizzleTable] = true;

	/** @internal */
	[ExtraConfigBuilder]: ((self: any) => Record<string, unknown> | unknown[]) | undefined = undefined;

	constructor(name: string, schema: string | undefined, baseName: string) {
		this[TableName] = this[OriginalName] = name;
		this[TableSchema] = schema;
		this[BaseName] = baseName;
	}
}

export function isTable(table: unknown): table is Table {
	return typeof table === 'object' && table !== null && IsDrizzleTable in table;
}

/**
 * Any table with a specified boundary.
 *
 * @example
	```ts
	// Any table with a specific name
	type AnyUsersTable = AnyTable<{ name: 'users' }>;
	```
 *
 * To describe any table with any config, simply use `Table` without any type arguments, like this:
 *
	```ts
	function needsTable(table: Table) {
		...
	}
	```
 */
export type AnyTable<TPartial extends Partial<TableConfig>> = Table<UpdateTableConfig<TableConfig, TPartial>>;

export function getTableName<T extends Table>(table: T): T['_']['name'] {
	return table[TableName];
}

export function getTableUniqueName<
	T extends Table | View,
	TResult extends string = T extends Table ? T['_']['schema'] extends undefined ? `public.${T['_']['name']}`
		: `${T['_']['schema']}.${T['_']['name']}`
		// Views don't have type-level schema names, to be added
		: `${string}.${T['_']['name']}`,
>(
	table: T,
): TResult {
	return `${table[TableSchema] ?? 'public'}.${table[TableName]}` as TResult;
}

export type MapColumnName<TName extends string, TColumn extends Column, TDBColumNames extends boolean> =
	TDBColumNames extends true ? TColumn['_']['name']
		: TName;

export type InferModelFromColumns<
	TColumns extends Columns,
	TInferMode extends 'select' | 'insert' = 'select',
	TConfig extends { override?: boolean } = { dbColumnNames: false; override: false },
> = Simplify<
	TInferMode extends 'insert' ?
			& {
				[
					Key in keyof TColumns & string as RequiredKeyOnly<
						Key,
						TColumns[Key]
					>
				]: GetColumnData<TColumns[Key], 'query'>;
			}
			& {
				[
					Key in keyof TColumns & string as OptionalKeyOnly<
						Key,
						TColumns[Key],
						TConfig['override']
					>
				]?: GetColumnData<TColumns[Key], 'query'> | undefined;
			}
		: {
			[
				Key in keyof TColumns & string
			]: GetColumnData<TColumns[Key], 'query'>;
		}
>;

/** @deprecated Use one of the alternatives: {@link InferSelectModel} / {@link InferInsertModel}, or `table.$inferSelect` / `table.$inferInsert`
 */
export type InferModel<
	TTable extends Table,
	TInferMode extends 'select' | 'insert' = 'select',
> = InferModelFromColumns<TTable['_']['columns'], TInferMode>;

export type InferSelectModel<
	TTable extends Table,
> = InferModelFromColumns<TTable['_']['columns'], 'select'>;

export type InferInsertModel<
	TTable extends Table,
	TOverride extends { override?: boolean } = { override: false },
> = InferModelFromColumns<TTable['_']['columns'], 'insert', TOverride>;

export type InferEnum<T> = T extends { enumValues: readonly (infer U)[] } ? U
	: never;

export interface InferTableColumnsModels<TColumns extends Columns> {
	readonly $inferSelect: InferModelFromColumns<TColumns, 'select'>;
	readonly $inferInsert: InferModelFromColumns<TColumns, 'insert', { override: false }>;
}

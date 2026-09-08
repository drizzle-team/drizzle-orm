/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable drizzle-internal/require-entity-kind */
import type { BuildExtraConfigColumns, Simplify, SQLWrapper } from 'drizzle-orm';
import type { PgColumnBuilderBase, /* PgTableExtraConfig,*/ PgTableExtraConfigValue } from 'drizzle-orm/pg-core';
import type { PgColumnsBuilders } from 'drizzle-orm/pg-core/columns/all';
import type { AnyColumn, BuildColumns, Column } from './optimized-columns.ts';

export interface TableConfig<TColumns extends Record<string, Column> = Record<string, Column>> {
	name: string;
	schema: string | undefined;
	columns: TColumns;
	dialect: string;
}

export type RequiredKeyOnly<TKey extends string, T extends Column> = T extends AnyColumn<{
	notNull: true;
	hasDefault: false;
}> ? TKey
	: never;
export type OptionalKeyOnly<TKey extends string, T extends Column, OverrideT extends boolean | undefined = false> =
	TKey extends RequiredKeyOnly<TKey, T> ? never : T extends {
		_: {
			generated: undefined;
		};
	} ? (T extends {
			_: {
				identity: undefined;
			};
		} ? TKey
			: T['_']['identity'] extends 'always' ? OverrideT extends true ? TKey : never
			: TKey)
	: never;

export type GetColumnData<TColumn extends Column, TInferMode extends 'query' | 'raw' = 'query'> =
	// dprint-ignore
	TInferMode extends 'raw' // Raw mode
        ? TColumn['_']['data'] // Just return the underlying type
        : TColumn['_']['notNull'] extends true // Query mode
        ? TColumn['_']['data'] // Query mode, not null
        : TColumn['_']['data'] | null; // Query mode, nullable

export type MapColumnName<TName extends string, TColumn extends Column, TDBColumNames extends boolean> =
	TDBColumNames extends true ? TColumn['_']['name']
		: TName;

export type InferModelFromColumns<
	TColumns extends Record<string, Column>,
	TInferMode extends 'select' | 'insert' = 'select',
	TConfig extends { dbColumnNames: boolean; override?: boolean } = { dbColumnNames: false; override: false },
> = Simplify<
	TInferMode extends 'insert' ?
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
						TColumns[Key],
						TConfig['override']
					>
				]?: GetColumnData<TColumns[Key], 'query'> | undefined;
			}
		: {
			[
				Key in keyof TColumns & string as MapColumnName<
					Key,
					TColumns[Key],
					TConfig['dbColumnNames']
				>
			]: GetColumnData<TColumns[Key], 'query'>;
		}
>;

export type InferModel<
	TTable extends Table,
	TInferMode extends 'select' | 'insert' = 'select',
	TConfig extends { dbColumnNames: boolean } = { dbColumnNames: false },
> = InferModelFromColumns<TTable['_']['columns'], TInferMode, TConfig>;

export type InferSelectModel<
	TTable extends Table,
	TConfig extends { dbColumnNames: boolean } = { dbColumnNames: false },
> = InferModelFromColumns<TTable['_']['columns'], 'select', TConfig>;

export type InferInsertModel<
	TTable extends Table,
	TConfig extends { dbColumnNames: boolean; override?: boolean } = { dbColumnNames: false; override: false },
> = InferModelFromColumns<TTable['_']['columns'], 'insert', TConfig>;

export type InferSelectModelConfig<
	TTableConfig extends TableConfig,
	TConfig extends { dbColumnNames: boolean } = { dbColumnNames: false },
> = InferModelFromColumns<TTableConfig['columns'], 'select', TConfig>;

export type InferInsertModelConfig<
	TTableConfig extends TableConfig,
	TConfig extends { dbColumnNames: boolean; override?: boolean } = { dbColumnNames: false; override: false },
> = InferModelFromColumns<TTableConfig['columns'], 'insert', TConfig>;

export interface Table<
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	T extends TableConfig = TableConfig,
> extends SQLWrapper, InferTableModels<T> {
	// SQLWrapper runtime implementation is defined in 'sql/sql.ts'
}

export interface TableTypeConfig<T extends TableConfig> {
	readonly brand: 'Table';
	// readonly config: T;
	readonly name: T['name'];
	readonly schema: T['schema'];
	readonly columns: T['columns'];
	readonly inferSelect: Record<string, unknown>;
	readonly inferInsert: Record<string, unknown>;
}

export interface InferTableModels<TConfig extends TableConfig> {
	readonly $inferSelect: InferSelectModelConfig<TConfig>;
	readonly $inferInsert: InferInsertModelConfig<TConfig>;
}

export interface Table<T extends TableConfig = TableConfig> extends SQLWrapper, InferTableModels<T> {
}

export class Table<T extends TableConfig = TableConfig> implements SQLWrapper {
	declare readonly _: TableTypeConfig<T>;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	constructor(name: string, schema: string | undefined, baseName: string) {
	}
}

export class PgTable<T extends TableConfig = TableConfig> extends Table<T> {}

export type PgTableWithColumns<
	T extends TableConfig,
	TTable extends PgTable<T & InferTableModels<T>> = PgTable<T & InferTableModels<T>>,
> =
	& TTable
	& T['columns']
	& InferTableModels<T>
	& {
		enableRLS: () => Omit<
			PgTableWithColumns<T>,
			'enableRLS'
		>;
	};

export function pgTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, PgColumnBuilderBase>,
>(
	name: TTableName,
	columns: TColumnsMap | ((columnTypes: PgColumnsBuilders) => TColumnsMap),
	schema: TSchemaName,
	baseName = name,
): PgTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap>;
	dialect: 'pg';
}> {
	return {} as any;
}

export interface PgTableFn<TSchema extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, PgColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (
			self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'pg'>,
		) => PgTableExtraConfigValue[],
	): PgTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap>;
		dialect: 'pg';
	}>;

	// <
	// 	TTableName extends string,
	// 	TColumnsMap extends Record<string, PgColumnBuilderBase>,
	// >(
	// 	name: TTableName,
	// 	columns: (columnTypes: PgColumnsBuilders) => TColumnsMap,
	// 	extraConfig?: (self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'pg'>) => PgTableExtraConfigValue[],
	// ): PgTableWithColumns<{
	// 	name: TTableName;
	// 	schema: TSchema;
	// 	columns: BuildColumns<TTableName, TColumnsMap>;
	// 	dialect: 'pg';
	// }>;

	// <
	// 	TTableName extends string,
	// 	TColumnsMap extends Record<string, PgColumnBuilderBase>,
	// >(
	// 	name: TTableName,
	// 	columns: TColumnsMap,
	// 	extraConfig: (
	// 		self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'pg'>,
	// 	) => PgTableExtraConfig,
	// ): PgTableWithColumns<{
	// 	name: TTableName;
	// 	schema: TSchema;
	// 	columns: BuildColumns<TTableName, TColumnsMap>;
	// 	dialect: 'pg';
	// }>;

	// <
	// 	TTableName extends string,
	// 	TColumnsMap extends Record<string, PgColumnBuilderBase>,
	// >(
	// 	name: TTableName,
	// 	columns: (columnTypes: PgColumnsBuilders) => TColumnsMap,
	// ): PgTableWithColumns<{
	// 	name: TTableName;
	// 	schema: TSchema;
	// 	columns: BuildColumns<TTableName, TColumnsMap>;
	// 	dialect: 'pg';
	// }>;
}

export const pgTable: PgTableFn = (name, columns) => {
	// return pgTableWithSchema(name, columns, undefined) as any;
	return {} as any;
};

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable drizzle-internal/require-entity-kind */
// import type { BuildExtraConfigColumns, Simplify, SQLWrapper } from 'drizzle-orm';
// import type { PgColumnBuilderBase } from 'drizzle-orm/pg-core';
// import type { PgColumnsBuilders } from 'drizzle-orm/pg-core/columns/all';
// import type { AnyColumn, BuildColumns, Column } from './optimized-columns.ts';

export interface TableConfig<TColumns extends Record<string, any> = Record<string, any>> {
	name: string;
	schema: string | undefined;
	// columns: TColumns;
	dialect: string;
}

// export type RequiredKeyOnly<TKey extends string, T extends Column> = T extends AnyColumn<{
// 	notNull: true;
// 	hasDefault: false;
// }> ? TKey
// 	: never;

// export type OptionalKeyOnly<TKey extends string, T extends Column, OverrideT extends boolean | undefined = false> =
// 	TKey extends RequiredKeyOnly<TKey, T> ? never : T extends {
// 		_: {
// 			generated: undefined;
// 		};
// 	} ? (T extends {
// 			_: {
// 				identity: undefined;
// 			};
// 		} ? TKey
// 			: T['_']['identity'] extends 'always' ? OverrideT extends true ? TKey : never
// 			: TKey)
// 	: never;

// export type GetColumnData<TColumn extends Column, TInferMode extends 'query' | 'raw' = 'query'> =
// 	// dprint-ignore
// 	TInferMode extends 'raw' // Raw mode
//         ? TColumn['_']['data'] // Just return the underlying type
//         : TColumn['_']['notNull'] extends true // Query mode
//         ? TColumn['_']['data'] // Query mode, not null
//         : TColumn['_']['data'] | null; // Query mode, nullable

// export type MapColumnName<TName extends string, TColumn extends Column, TDBColumNames extends boolean> =
// 	TDBColumNames extends true ? TColumn['_']['name']
// 		: TName;

// export type InferModelFromColumns<
// 	TColumns extends Record<string, Column>,
// 	TInferMode extends 'select' | 'insert' = 'select',
// 	TConfig extends { dbColumnNames: boolean; override?: boolean } = { dbColumnNames: false; override: false },
// > = Simplify<
// 	TInferMode extends 'insert' ?
// 			& {
// 				[
// 					Key in keyof TColumns & string as RequiredKeyOnly<
// 						MapColumnName<Key, TColumns[Key], TConfig['dbColumnNames']>,
// 						TColumns[Key]
// 					>
// 				]: GetColumnData<TColumns[Key], 'query'>;
// 			}
// 			& {
// 				[
// 					Key in keyof TColumns & string as OptionalKeyOnly<
// 						MapColumnName<Key, TColumns[Key], TConfig['dbColumnNames']>,
// 						TColumns[Key],
// 						TConfig['override']
// 					>
// 				]?: GetColumnData<TColumns[Key], 'query'> | undefined;
// 			}
// 		: {
// 			[
// 				Key in keyof TColumns & string as MapColumnName<
// 					Key,
// 					TColumns[Key],
// 					TConfig['dbColumnNames']
// 				>
// 			]: GetColumnData<TColumns[Key], 'query'>;
// 		}
// >;

// export type InferModel<
// 	TTable extends Table,
// 	TInferMode extends 'select' | 'insert' = 'select',
// 	TConfig extends { dbColumnNames: boolean } = { dbColumnNames: false },
// > = InferModelFromColumns<TTable['_']['columns'], TInferMode, TConfig>;

// export type InferSelectModel<
// 	TTable extends Table,
// 	TConfig extends { dbColumnNames: boolean } = { dbColumnNames: false },
// > = InferModelFromColumns<TTable['_']['columns'], 'select', TConfig>;

// export type InferInsertModel<
// 	TTable extends Table,
// 	TConfig extends { dbColumnNames: boolean; override?: boolean } = { dbColumnNames: false; override: false },
// > = InferModelFromColumns<TTable['_']['columns'], 'insert', TConfig>;

// export interface Table<
// 	// eslint-disable-next-line @typescript-eslint/no-unused-vars
// 	T extends TableConfig = TableConfig,
// > extends SQLWrapper {
// 	// SQLWrapper runtime implementation is defined in 'sql/sql.ts'
// }

export class Table<T extends TableConfig = TableConfig> {
	declare readonly _: {
		readonly brand: 'Table';
		readonly config: T;
		readonly name: T['name'];
		readonly schema: T['schema'];
		// readonly columns: T['columns'];
		// readonly inferSelect: InferSelectModel<Table<T>>;
		// readonly inferInsert: InferInsertModel<Table<T>>;
	};

	// declare readonly $inferSelect: InferSelectModel<Table<T>>;
	// declare readonly $inferInsert: InferInsertModel<Table<T>>;

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	constructor(name: string, schema: string | undefined, baseName: string) {
	}
}

export class PgTable<T extends TableConfig = TableConfig> extends Table<T> {}

// export type PgTableWithColumns<T extends TableConfig> =
// 	& PgTable<T>
// & {
// 	[Key in keyof T['columns']]: T['columns'][Key];
// }
// & {
// 	enableRLS: () => Omit<
// 		PgTableWithColumns<T>,
// 		'enableRLS'
// 	>;
// };

// export function pgTableWithSchema<
// 	TTableName extends string,
// 	TSchemaName extends string | undefined,
// 	TColumnsMap extends Record<string, PgColumnBuilderBase>,
// >(
// 	name: TTableName,
// 	columns: TColumnsMap | ((columnTypes: PgColumnsBuilders) => TColumnsMap),
// 	schema: TSchemaName,
// 	baseName = name,
// ): PgTableWithColumns<{
// 	name: TTableName;
// 	schema: TSchemaName;
// 	columns: BuildColumns<TTableName, TColumnsMap>;
// 	dialect: 'pg';
// }> {
// 	const rawTable = new PgTable<{
// 		name: TTableName;
// 		schema: TSchemaName;
// 		columns: BuildColumns<TTableName, TColumnsMap>;
// 		dialect: 'pg';
// 	}>(name, schema, baseName);

// 	const parsedColumns: TColumnsMap = columns as TColumnsMap;

// 	const builtColumns = Object.fromEntries(
// 		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
// 			return [name, undefined];
// 		}),
// 	) as unknown as BuildColumns<TTableName, TColumnsMap>;

// 	const builtColumnsForExtraConfig = Object.fromEntries(
// 		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
// 			return [name, undefined];
// 		}),
// 	) as unknown as BuildExtraConfigColumns<TTableName, TColumnsMap, 'pg'>;

// 	const table = Object.assign(rawTable, builtColumns);

// 	return Object.assign(table, {
// 		enableRLS: () => {
// 			return table as PgTableWithColumns<{
// 				name: TTableName;
// 				schema: TSchemaName;
// 				columns: BuildColumns<TTableName, TColumnsMap>;
// 				dialect: 'pg';
// 			}>;
// 		},
// 	});
// }

export interface PgTableFn<TSchema extends string | undefined = undefined> {
	// <
	// 	TTableName extends string,
	// 	TColumnsMap extends Record<string, PgColumnBuilderBase>,
	// >(
	// 	name: TTableName,
	// 	columns: TColumnsMap,
	// 	// extraConfig?: (
	// 	// 	self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'pg'>,
	// 	// ) => PgTableExtraConfigValue[],
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
	// ): // extraConfig?: (self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'pg'>) => PgTableExtraConfigValue[],
	// PgTableWithColumns<{
	// 	name: TTableName;
	// 	schema: TSchema;
	// 	columns: BuildColumns<TTableName, TColumnsMap>;
	// 	dialect: 'pg';
	// }>;

	<
		TTableName extends string,
	>(
		name: TTableName,
		columns: any,
	): Table<{
		name: TTableName;
		schema: TSchema;
		dialect: 'pg';
	}>;

	// <
	// 	TTableName extends string,
	// 	TColumnsMap extends Record<string, any>,
	// >(
	// 	name: TTableName,
	// 	columns: (columnTypes: PgColumnsBuilders) => TColumnsMap,
	// ): PgTable<{
	// 	name: TTableName;
	// 	schema: TSchema;
	// 	dialect: 'pg';
	// }>;
}

export const pgTable: PgTableFn = (name, columns) => {
	// return pgTableWithSchema(name, columns, undefined) as any;
	return {} as any;
};

import { GetColumnData } from '~/column';
import { OptionalKeyOnly, RequiredKeyOnly } from '~/operations';
import { Table } from '~/table';
import { Update } from '~/utils';
import { Simplify } from '~/utils';

import { Check, CheckBuilder } from './checks';
import { AnyMySqlColumn, AnyMySqlColumnBuilder, BuildColumns } from './columns/common';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { AnyIndexBuilder, Index, IndexBuilder } from './indexes';

export type MySqlTableExtraConfig = Record<
	string,
	| AnyIndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
>;

export interface TableConfig<TName extends string = string> {
	name: TName;
	columns: Record<string | symbol, AnyMySqlColumn<{ tableName: TName }>>;
}

/** @internal */
export const Indexes = Symbol('Indexes');

/** @internal */
export const ForeignKeys = Symbol('ForeignKeys');

/** @internal */
export const Checks = Symbol('Checks');

/** @internal */
export const ExtraConfig = Symbol('ExtraConfig');

export type UpdateTableConfig<T extends TableConfig, TUpdate extends Partial<TableConfig>> = Update<T, TUpdate>;

export class MySqlTable<T extends Partial<TableConfig>> extends Table<T['name']> {
	declare protected $columns: T['columns'];

	/** @internal */
	static override readonly Symbol = Object.assign(Table.Symbol, {
		Indexes: Indexes as typeof Indexes,
		ForeignKeys: ForeignKeys as typeof ForeignKeys,
		Checks: Checks as typeof Checks,
		ExtraConfig: ExtraConfig as typeof ExtraConfig,
	});

	/** @internal */
	override [Table.Symbol.Columns]!: NonNullable<T['columns']>;

	/** @internal */
	[Indexes]: Record<string | symbol, Index> = {};

	/** @internal */
	[ForeignKeys]: Record<string | symbol, ForeignKey> = {};

	/** @internal */
	[Checks]: Record<string | symbol, Check> = {};

	/** @internal */
	[ExtraConfig]: ((self: Record<string, AnyMySqlColumn>) => MySqlTableExtraConfig) | undefined = undefined;
}

export type AnyMySqlTable<TPartial extends Partial<TableConfig> = {}> = MySqlTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type MySqlTableWithColumns<T extends TableConfig> =
	& MySqlTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

/**
 * See `GetColumnConfig`.
 */
export type GetTableConfig<T extends AnyMySqlTable, TParam extends keyof TableConfig | undefined = undefined> =
	T extends MySqlTableWithColumns<infer TConfig>
		? TParam extends undefined ? TConfig : TParam extends keyof TConfig ? TConfig[TParam] : TConfig
		: never;

export type InferModel<
	TTable extends AnyMySqlTable,
	TInferMode extends 'select' | 'insert' = 'select',
> = TInferMode extends 'insert' ? Simplify<
		& {
			[
				Key in keyof GetTableConfig<TTable, 'columns'> & string as RequiredKeyOnly<
					Key,
					GetTableConfig<TTable, 'columns'>[Key]
				>
			]: GetColumnData<GetTableConfig<TTable, 'columns'>[Key], 'query'>;
		}
		& {
			[
				Key in keyof GetTableConfig<TTable, 'columns'> & string as OptionalKeyOnly<
					Key,
					GetTableConfig<TTable, 'columns'>[Key]
				>
			]?: GetColumnData<GetTableConfig<TTable, 'columns'>[Key], 'query'>;
		}
	>
	: {
		[Key in keyof GetTableConfig<TTable, 'columns'>]: GetColumnData<
			GetTableConfig<TTable, 'columns'>[Key],
			'query'
		>;
	};

const isMySqlSchemaSym = Symbol('isMySqlSchema');
export interface MySqlSchema {
	schemaName: string;
	/** @internal */
	[isMySqlSchemaSym]: true;
}

export function isMySqlSchema(obj: unknown): obj is MySqlSchema {
	return !!obj && typeof obj === 'function' && isMySqlSchemaSym in obj;
}

/**
 * mysqlDatabase is same as {@link mysqlSchema} function
 *
 * https://dev.mysql.com/doc/refman/8.0/en/create-database.html
 *
 * @param databaseName - mysql use database name
 * @returns
 */
export function mysqlDatabase<T extends string = string>(databaseName: T) {
	return mysqlSchema(databaseName);
}

/**
 * mysqlSchema is same as {@link mysqlDatabase} function
 *
 * https://dev.mysql.com/doc/refman/8.0/en/create-database.html
 *
 * @param schemaName - mysql use schema name
 * @returns
 */
export function mysqlSchema<T extends string = string>(schemaName: T) {
	const schemaValue: MySqlSchema = {
		schemaName,
		[isMySqlSchemaSym]: true,
	};

	const columnFactory = <
		TTableName extends string,
		TColumnsMap extends Record<string, AnyMySqlColumnBuilder>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap>) => MySqlTableExtraConfig,
	) => mysqlTableWithSchema(name, columns, schemaName, extraConfig);
	return Object.assign(columnFactory, schemaValue);
}

export function mysqlTableWithSchema<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyMySqlColumnBuilder>,
>(
	name: TTableName,
	columns: TColumnsMap,
	schema?: string,
	extraConfig?: (self: BuildColumns<TTableName, TColumnsMap>) => MySqlTableExtraConfig,
): MySqlTableWithColumns<{
	name: TTableName;
	columns: BuildColumns<TTableName, TColumnsMap>;
}> {
	const rawTable = new MySqlTable<{
		name: TTableName;
		columns: BuildColumns<TTableName, TColumnsMap>;
	}>(name, schema);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colBuilder]) => {
			const column = colBuilder.build(rawTable);
			colBuilder.buildForeignKeys(column, rawTable).forEach((fk, fkIndex) => {
				rawTable[ForeignKeys][Symbol(`${name}_${fkIndex}`)] = fk;
			});
			return [name, column];
		}),
	) as BuildColumns<TTableName, TColumnsMap>;

	rawTable[MySqlTable.Symbol.Columns] = builtColumns;

	const table = Object.assign(rawTable, builtColumns);

	table[MySqlTable.Symbol.Columns] = builtColumns;

	if (extraConfig) {
		table[MySqlTable.Symbol.ExtraConfig] = extraConfig as (
			self: Record<string, AnyMySqlColumn>,
		) => MySqlTableExtraConfig;
	}

	return table;
}

export function mysqlTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyMySqlColumnBuilder>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: (self: BuildColumns<TTableName, TColumnsMap>) => MySqlTableExtraConfig,
): MySqlTableWithColumns<{
	name: TTableName;
	columns: BuildColumns<TTableName, TColumnsMap>;
}> {
	return mysqlTableWithSchema(name, columns, undefined, extraConfig);
}

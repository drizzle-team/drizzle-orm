import type { BuildColumns, BuildExtraConfigColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import { getGoogleSqlColumnBuilders, type GoogleSqlColumnBuilders } from './columns/all.ts';
import type { GoogleSqlColumn, GoogleSqlColumnBuilder, GoogleSqlColumnBuilderBase } from './columns/common.ts';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { AnyIndexBuilder } from './indexes.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type GoogleSqlTableExtraConfigValue =
	| AnyIndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder;

export type GoogleSqlTableExtraConfig = Record<
	string,
	GoogleSqlTableExtraConfigValue
>;

export type TableConfig = TableConfigBase<GoogleSqlColumn>;

/** @internal */
export const InlineForeignKeys = Symbol.for('drizzle:GoogleSqlInlineForeignKeys');

export class GoogleSqlTable<T extends TableConfig = TableConfig> extends Table<T> {
	static override readonly [entityKind]: string = 'GoogleSqlTable';

	declare protected $columns: T['columns'];

	/** @internal */
	static override readonly Symbol = Object.assign({}, Table.Symbol, {
		InlineForeignKeys: InlineForeignKeys as typeof InlineForeignKeys,
	});

	/** @internal */
	override [Table.Symbol.Columns]!: NonNullable<T['columns']>;

	/** @internal */
	[InlineForeignKeys]: ForeignKey[] = [];

	/** @internal */
	override [Table.Symbol.ExtraConfigBuilder]:
		| ((self: Record<string, GoogleSqlColumn>) => GoogleSqlTableExtraConfig)
		| undefined = undefined;
}

export type AnyGoogleSqlTable<TPartial extends Partial<TableConfig> = {}> = GoogleSqlTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type GoogleSqlTableWithColumns<T extends TableConfig> =
	& GoogleSqlTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

export function googlesqlTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, GoogleSqlColumnBuilderBase>,
>(
	name: TTableName,
	columns: TColumnsMap | ((columnTypes: GoogleSqlColumnBuilders) => TColumnsMap),
	extraConfig:
		| ((
			self: BuildColumns<TTableName, TColumnsMap, 'googlesql'>,
		) => GoogleSqlTableExtraConfig | GoogleSqlTableExtraConfigValue[])
		| undefined,
	schema: TSchemaName,
	baseName = name,
): GoogleSqlTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap, 'googlesql'>;
	dialect: 'googlesql';
}> {
	const rawTable = new GoogleSqlTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'googlesql'>;
		dialect: 'googlesql';
	}>(name, schema, baseName);

	const parsedColumns: TColumnsMap = typeof columns === 'function' ? columns(getGoogleSqlColumnBuilders()) : columns;

	const builtColumns = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as GoogleSqlColumnBuilder;
			colBuilder.setName(name);
			const column = colBuilder.build(rawTable);
			rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'googlesql'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumns as unknown as BuildExtraConfigColumns<
		TTableName,
		TColumnsMap,
		'googlesql'
	>;

	if (extraConfig) {
		table[GoogleSqlTable.Symbol.ExtraConfigBuilder] = extraConfig as unknown as (
			self: Record<string, GoogleSqlColumn>,
		) => GoogleSqlTableExtraConfig;
	}

	return table;
}

export interface GoogleSqlTableFn<TSchemaName extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, GoogleSqlColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (
			self: BuildColumns<TTableName, TColumnsMap, 'googlesql'>,
		) => GoogleSqlTableExtraConfigValue[],
	): GoogleSqlTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'googlesql'>;
		dialect: 'googlesql';
	}>;

	<
		TTableName extends string,
		TColumnsMap extends Record<string, GoogleSqlColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: GoogleSqlColumnBuilders) => TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'googlesql'>) => GoogleSqlTableExtraConfigValue[],
	): GoogleSqlTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'googlesql'>;
		dialect: 'googlesql';
	}>;
	/**
	 * @deprecated The third parameter of googlesqlTable is changing and will only accept an array instead of an object
	 *
	 * @example
	 * Deprecated version:
	 * ```ts
	 * export const users = googlesqlTable("users", {
	 * 	id: int(),
	 * }, (t) => ({
	 * 	idx: index('custom_name').on(t.id)
	 * }));
	 * ```
	 *
	 * New API:
	 * ```ts
	 * export const users = googlesqlTable("users", {
	 * 	id: int(),
	 * }, (t) => [
	 * 	index('custom_name').on(t.id)
	 * ]);
	 * ```
	 */
	<
		TTableName extends string,
		TColumnsMap extends Record<string, GoogleSqlColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig: (self: BuildColumns<TTableName, TColumnsMap, 'googlesql'>) => GoogleSqlTableExtraConfig,
	): GoogleSqlTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'googlesql'>;
		dialect: 'googlesql';
	}>;

	/**
	 * @deprecated The third parameter of googlesqlTable is changing and will only accept an array instead of an object
	 *
	 * @example
	 * Deprecated version:
	 * ```ts
	 * export const users = googlesqlTable("users", {
	 * 	id: int(),
	 * }, (t) => ({
	 * 	idx: index('custom_name').on(t.id)
	 * }));
	 * ```
	 *
	 * New API:
	 * ```ts
	 * export const users = googlesqlTable("users", {
	 * 	id: int(),
	 * }, (t) => [
	 * 	index('custom_name').on(t.id)
	 * ]);
	 * ```
	 */
	<
		TTableName extends string,
		TColumnsMap extends Record<string, GoogleSqlColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: GoogleSqlColumnBuilders) => TColumnsMap,
		extraConfig: (self: BuildColumns<TTableName, TColumnsMap, 'googlesql'>) => GoogleSqlTableExtraConfig,
	): GoogleSqlTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'googlesql'>;
		dialect: 'googlesql';
	}>;
}

export const googlesqlTable: GoogleSqlTableFn = (name, columns, extraConfig) => {
	return googlesqlTableWithSchema(name, columns, extraConfig, undefined, name);
};

export function googlesqlTableCreator(customizeTableName: (name: string) => string): GoogleSqlTableFn {
	return (name, columns, extraConfig) => {
		return googlesqlTableWithSchema(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};
}

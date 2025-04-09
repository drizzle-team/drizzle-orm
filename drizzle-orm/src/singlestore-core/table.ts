import type { BuildColumns, BuildExtraConfigColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import { getSingleStoreColumnBuilders, type SingleStoreColumnBuilders } from './columns/all.ts';
import type { SingleStoreColumn, SingleStoreColumnBuilder, SingleStoreColumnBuilderBase } from './columns/common.ts';
import type { AnyIndexBuilder } from './indexes.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type SingleStoreTableExtraConfigValue =
	| AnyIndexBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder;

export type SingleStoreTableExtraConfig = Record<
	string,
	SingleStoreTableExtraConfigValue
>;

export type TableConfig = TableConfigBase<SingleStoreColumn>;

export class SingleStoreTable<T extends TableConfig = TableConfig> extends Table<T> {
	static override readonly [entityKind]: string = 'SingleStoreTable';

	declare protected $columns: T['columns'];

	/** @internal */
	static override readonly Symbol = Object.assign({}, Table.Symbol, {});

	/** @internal */
	override [Table.Symbol.Columns]!: NonNullable<T['columns']>;

	/** @internal */
	override [Table.Symbol.ExtraConfigBuilder]:
		| ((self: Record<string, SingleStoreColumn>) => SingleStoreTableExtraConfig)
		| undefined = undefined;
}

export type AnySingleStoreTable<TPartial extends Partial<TableConfig> = {}> = SingleStoreTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type SingleStoreTableWithColumns<T extends TableConfig> =
	& SingleStoreTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

export function singlestoreTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, SingleStoreColumnBuilderBase>,
>(
	name: TTableName,
	columns: TColumnsMap | ((columnTypes: SingleStoreColumnBuilders) => TColumnsMap),
	extraConfig:
		| ((
			self: BuildColumns<TTableName, TColumnsMap, 'singlestore'>,
		) => SingleStoreTableExtraConfig | SingleStoreTableExtraConfigValue[])
		| undefined,
	schema: TSchemaName,
	baseName = name,
): SingleStoreTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
	dialect: 'singlestore';
}> {
	const rawTable = new SingleStoreTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
		dialect: 'singlestore';
	}>(name, schema, baseName);

	const parsedColumns: TColumnsMap = typeof columns === 'function' ? columns(getSingleStoreColumnBuilders()) : columns;

	const builtColumns = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as SingleStoreColumnBuilder;
			colBuilder.setName(name);
			const column = colBuilder.build(rawTable);
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'singlestore'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumns as unknown as BuildExtraConfigColumns<
		TTableName,
		TColumnsMap,
		'singlestore'
	>;

	if (extraConfig) {
		table[SingleStoreTable.Symbol.ExtraConfigBuilder] = extraConfig as unknown as (
			self: Record<string, SingleStoreColumn>,
		) => SingleStoreTableExtraConfig;
	}

	return table;
}

export interface SingleStoreTableFn<TSchemaName extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, SingleStoreColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (
			self: BuildColumns<TTableName, TColumnsMap, 'singlestore'>,
		) => SingleStoreTableExtraConfigValue[],
	): SingleStoreTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
		dialect: 'singlestore';
	}>;

	<
		TTableName extends string,
		TColumnsMap extends Record<string, SingleStoreColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: SingleStoreColumnBuilders) => TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'singlestore'>) => SingleStoreTableExtraConfigValue[],
	): SingleStoreTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
		dialect: 'singlestore';
	}>;
	/**
	 * @deprecated The third parameter of singlestoreTable is changing and will only accept an array instead of an object
	 *
	 * @example
	 * Deprecated version:
	 * ```ts
	 * export const users = singlestoreTable("users", {
	 * 	id: int(),
	 * }, (t) => ({
	 * 	idx: index('custom_name').on(t.id)
	 * }));
	 * ```
	 *
	 * New API:
	 * ```ts
	 * export const users = singlestoreTable("users", {
	 * 	id: int(),
	 * }, (t) => [
	 * 	index('custom_name').on(t.id)
	 * ]);
	 * ```
	 */
	<
		TTableName extends string,
		TColumnsMap extends Record<string, SingleStoreColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'singlestore'>) => SingleStoreTableExtraConfig,
	): SingleStoreTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
		dialect: 'singlestore';
	}>;

	/**
	 * @deprecated The third parameter of singlestoreTable is changing and will only accept an array instead of an object
	 *
	 * @example
	 * Deprecated version:
	 * ```ts
	 * export const users = singlestoreTable("users", {
	 * 	id: int(),
	 * }, (t) => ({
	 * 	idx: index('custom_name').on(t.id)
	 * }));
	 * ```
	 *
	 * New API:
	 * ```ts
	 * export const users = singlestoreTable("users", {
	 * 	id: int(),
	 * }, (t) => [
	 * 	index('custom_name').on(t.id)
	 * ]);
	 * ```
	 */
	<
		TTableName extends string,
		TColumnsMap extends Record<string, SingleStoreColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: SingleStoreColumnBuilders) => TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'singlestore'>) => SingleStoreTableExtraConfig,
	): SingleStoreTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
		dialect: 'singlestore';
	}>;
}

export const singlestoreTable: SingleStoreTableFn = (name, columns, extraConfig) => {
	return singlestoreTableWithSchema(name, columns, extraConfig, undefined, name);
};

export function singlestoreTableCreator(customizeTableName: (name: string) => string): SingleStoreTableFn {
	return (name, columns, extraConfig) => {
		return singlestoreTableWithSchema(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};
}

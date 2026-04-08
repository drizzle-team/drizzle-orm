import type { BuildColumns, BuildExtraConfigColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import { getFirebirdColumnBuilders, type FirebirdColumnBuilders } from './columns/all.ts';
import type { FirebirdColumn, FirebirdColumnBuilder, FirebirdColumnBuilderBase } from './columns/common.ts';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { IndexBuilder } from './indexes.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type FirebirdTableExtraConfigValue =
	| IndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder;

export type FirebirdTableExtraConfig = Record<
	string,
	FirebirdTableExtraConfigValue
>;

export type TableConfig = TableConfigBase<FirebirdColumn<any>>;

/** @internal */
export const InlineForeignKeys = Symbol.for('drizzle:FirebirdInlineForeignKeys');

export class FirebirdTable<T extends TableConfig = TableConfig> extends Table<T> {
	static override readonly [entityKind]: string = 'FirebirdTable';

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
		| ((self: Record<string, FirebirdColumn>) => FirebirdTableExtraConfig)
		| undefined = undefined;
}

export type AnyFirebirdTable<TPartial extends Partial<TableConfig> = {}> = FirebirdTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type FirebirdTableWithColumns<T extends TableConfig> =
	& FirebirdTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

export interface FirebirdTableFn<TSchema extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, FirebirdColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (
			self: BuildColumns<TTableName, TColumnsMap, 'firebird'>,
		) => FirebirdTableExtraConfigValue[],
	): FirebirdTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'firebird'>;
		dialect: 'firebird';
	}>;

	<
		TTableName extends string,
		TColumnsMap extends Record<string, FirebirdColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: FirebirdColumnBuilders) => TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'firebird'>) => FirebirdTableExtraConfigValue[],
	): FirebirdTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'firebird'>;
		dialect: 'firebird';
	}>;
	/**
	 * @deprecated The third parameter of firebirdTable is changing and will only accept an array instead of an object
	 *
	 * @example
	 * Deprecated version:
	 * ```ts
	 * export const users = firebirdTable("users", {
	 * 	id: int(),
	 * }, (t) => ({
	 * 	idx: index('custom_name').on(t.id)
	 * }));
	 * ```
	 *
	 * New API:
	 * ```ts
	 * export const users = firebirdTable("users", {
	 * 	id: int(),
	 * }, (t) => [
	 * 	index('custom_name').on(t.id)
	 * ]);
	 * ```
	 */
	<
		TTableName extends string,
		TColumnsMap extends Record<string, FirebirdColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'firebird'>) => FirebirdTableExtraConfig,
	): FirebirdTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'firebird'>;
		dialect: 'firebird';
	}>;

	/**
	 * @deprecated The third parameter of firebirdTable is changing and will only accept an array instead of an object
	 *
	 * @example
	 * Deprecated version:
	 * ```ts
	 * export const users = firebirdTable("users", {
	 * 	id: int(),
	 * }, (t) => ({
	 * 	idx: index('custom_name').on(t.id)
	 * }));
	 * ```
	 *
	 * New API:
	 * ```ts
	 * export const users = firebirdTable("users", {
	 * 	id: int(),
	 * }, (t) => [
	 * 	index('custom_name').on(t.id)
	 * ]);
	 * ```
	 */
	<
		TTableName extends string,
		TColumnsMap extends Record<string, FirebirdColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: FirebirdColumnBuilders) => TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'firebird'>) => FirebirdTableExtraConfig,
	): FirebirdTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'firebird'>;
		dialect: 'firebird';
	}>;
}

function firebirdTableBase<
	TTableName extends string,
	TColumnsMap extends Record<string, FirebirdColumnBuilderBase>,
	TSchema extends string | undefined,
>(
	name: TTableName,
	columns: TColumnsMap | ((columnTypes: FirebirdColumnBuilders) => TColumnsMap),
	extraConfig:
		| ((
			self: BuildColumns<TTableName, TColumnsMap, 'firebird'>,
		) => FirebirdTableExtraConfig | FirebirdTableExtraConfigValue[])
		| undefined,
	schema?: TSchema,
	baseName = name,
): FirebirdTableWithColumns<{
	name: TTableName;
	schema: TSchema;
	columns: BuildColumns<TTableName, TColumnsMap, 'firebird'>;
	dialect: 'firebird';
}> {
	const rawTable = new FirebirdTable<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'firebird'>;
		dialect: 'firebird';
	}>(name, schema, baseName);

	const parsedColumns: TColumnsMap = typeof columns === 'function' ? columns(getFirebirdColumnBuilders()) : columns;

	const builtColumns = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as FirebirdColumnBuilder;
			colBuilder.setName(name);
			const column = colBuilder.build(rawTable);
			rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'firebird'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumns as unknown as BuildExtraConfigColumns<
		TTableName,
		TColumnsMap,
		'firebird'
	>;

	if (extraConfig) {
		table[FirebirdTable.Symbol.ExtraConfigBuilder] = extraConfig as (
			self: Record<string, FirebirdColumn>,
		) => FirebirdTableExtraConfig;
	}

	return table;
}

export const firebirdTable: FirebirdTableFn = (name, columns, extraConfig) => {
	return firebirdTableBase(name, columns, extraConfig);
};

export function firebirdTableCreator(customizeTableName: (name: string) => string): FirebirdTableFn {
	return (name, columns, extraConfig) => {
		return firebirdTableBase(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};
}

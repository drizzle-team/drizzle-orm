import type { BuildColumns, BuildExtraConfigColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import { type GelColumnsBuilders, getGelColumnBuilders } from './columns/all.ts';
import type { GelColumn, GelColumnBuilder, GelColumnBuilderBase, GelExtraConfigColumn } from './columns/common.ts';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { AnyIndexBuilder } from './indexes.ts';
import type { GelPolicy } from './policies.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type GelTableExtraConfigValue =
	| AnyIndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder
	| GelPolicy;

export type GelTableExtraConfig = Record<
	string,
	GelTableExtraConfigValue
>;

export type TableConfig = TableConfigBase<GelColumn>;

/** @internal */
export const InlineForeignKeys = Symbol.for('drizzle:GelInlineForeignKeys');
/** @internal */
export const EnableRLS = Symbol.for('drizzle:EnableRLS');

export class GelTable<T extends TableConfig = TableConfig> extends Table<T> {
	static override readonly [entityKind]: string = 'GelTable';

	/** @internal */
	static override readonly Symbol = Object.assign({}, Table.Symbol, {
		InlineForeignKeys: InlineForeignKeys as typeof InlineForeignKeys,
		EnableRLS: EnableRLS as typeof EnableRLS,
	});

	/**@internal */
	[InlineForeignKeys]: ForeignKey[] = [];

	/** @internal */
	[EnableRLS]: boolean = false;

	/** @internal */
	override [Table.Symbol.ExtraConfigBuilder]: ((self: Record<string, GelColumn>) => GelTableExtraConfig) | undefined =
		undefined;

	/** @internal */
	override [Table.Symbol.ExtraConfigColumns]: Record<string, GelExtraConfigColumn> = {};
}

export type AnyGelTable<TPartial extends Partial<TableConfig> = {}> = GelTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type GelTableWithColumns<T extends TableConfig> =
	& GelTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	}
	& {
		enableRLS: () => Omit<
			GelTableWithColumns<T>,
			'enableRLS'
		>;
	};

/** @internal */
export function gelTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, GelColumnBuilderBase>,
>(
	name: TTableName,
	columns: TColumnsMap | ((columnTypes: GelColumnsBuilders) => TColumnsMap),
	extraConfig:
		| ((
			self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'gel'>,
		) => GelTableExtraConfig | GelTableExtraConfigValue[])
		| undefined,
	schema: TSchemaName,
	baseName = name,
): GelTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap, 'gel'>;
	dialect: 'gel';
}> {
	const rawTable = new GelTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'gel'>;
		dialect: 'gel';
	}>(name, schema, baseName);

	const parsedColumns: TColumnsMap = typeof columns === 'function' ? columns(getGelColumnBuilders()) : columns;

	const builtColumns = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as GelColumnBuilder;
			colBuilder.setName(name);
			const column = colBuilder.build(rawTable);
			rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'gel'>;

	const builtColumnsForExtraConfig = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as GelColumnBuilder;
			colBuilder.setName(name);
			const column = colBuilder.buildExtraConfigColumn(rawTable);
			return [name, column];
		}),
	) as unknown as BuildExtraConfigColumns<TTableName, TColumnsMap, 'gel'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumnsForExtraConfig;

	if (extraConfig) {
		table[GelTable.Symbol.ExtraConfigBuilder] = extraConfig as any;
	}

	return Object.assign(table, {
		enableRLS: () => {
			table[GelTable.Symbol.EnableRLS] = true;
			return table as GelTableWithColumns<{
				name: TTableName;
				schema: TSchemaName;
				columns: BuildColumns<TTableName, TColumnsMap, 'gel'>;
				dialect: 'gel';
			}>;
		},
	});
}

export interface GelTableFn<TSchema extends string | undefined = undefined> {
	/**
	 * @deprecated The third parameter of GelTable is changing and will only accept an array instead of an object
	 *
	 * @example
	 * Deprecated version:
	 * ```ts
	 * export const users = gelTable("users", {
	 * 	id: integer(),
	 * }, (t) => ({
	 * 	idx: index('custom_name').on(t.id)
	 * }));
	 * ```
	 *
	 * New API:
	 * ```ts
	 * export const users = gelTable("users", {
	 * 	id: integer(),
	 * }, (t) => [
	 * 	index('custom_name').on(t.id)
	 * ]);
	 * ```
	 */
	<
		TTableName extends string,
		TColumnsMap extends Record<string, GelColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig: (
			self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'gel'>,
		) => GelTableExtraConfig,
	): GelTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'gel'>;
		dialect: 'gel';
	}>;

	/**
	 * @deprecated The third parameter of gelTable is changing and will only accept an array instead of an object
	 *
	 * @example
	 * Deprecated version:
	 * ```ts
	 * export const users = gelTable("users", {
	 * 	id: integer(),
	 * }, (t) => ({
	 * 	idx: index('custom_name').on(t.id)
	 * }));
	 * ```
	 *
	 * New API:
	 * ```ts
	 * export const users = gelTable("users", {
	 * 	id: integer(),
	 * }, (t) => [
	 * 	index('custom_name').on(t.id)
	 * ]);
	 * ```
	 */
	<
		TTableName extends string,
		TColumnsMap extends Record<string, GelColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: GelColumnsBuilders) => TColumnsMap,
		extraConfig: (self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'gel'>) => GelTableExtraConfig,
	): GelTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'gel'>;
		dialect: 'gel';
	}>;

	<
		TTableName extends string,
		TColumnsMap extends Record<string, GelColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (
			self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'gel'>,
		) => GelTableExtraConfigValue[],
	): GelTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'gel'>;
		dialect: 'gel';
	}>;

	<
		TTableName extends string,
		TColumnsMap extends Record<string, GelColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: GelColumnsBuilders) => TColumnsMap,
		extraConfig?: (self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'gel'>) => GelTableExtraConfigValue[],
	): GelTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'gel'>;
		dialect: 'gel';
	}>;
}

export const gelTable: GelTableFn = (name, columns, extraConfig) => {
	return gelTableWithSchema(name, columns, extraConfig, undefined);
};

export function gelTableCreator(customizeTableName: (name: string) => string): GelTableFn {
	return (name, columns, extraConfig) => {
		return gelTableWithSchema(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};
}

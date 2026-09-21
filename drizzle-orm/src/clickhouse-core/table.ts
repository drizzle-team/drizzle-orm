import type { BuildColumns, BuildExtraConfigColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import { type ClickHouseColumnBuilders, getClickHouseColumnBuilders } from './columns/all.ts';
import type { ClickHouseColumn, ClickHouseColumnBuilder, ClickHouseColumnBuilderBase } from './columns/common.ts';
import type { ClickHouseTableEngine } from './engines.ts';
import type { AnyIndexBuilder, ProjectionBuilder } from './indexes.ts';

/**
 * Anything a ClickHouse table can declare alongside its columns: the table engine, data-skipping
 * indexes and projections.
 */
export type ClickHouseTableExtraConfigValue =
	| ClickHouseTableEngine
	| AnyIndexBuilder
	| ProjectionBuilder;

export type TableConfig = TableConfigBase<ClickHouseColumn>;

export class ClickHouseTable<T extends TableConfig = TableConfig> extends Table<T> {
	static override readonly [entityKind]: string = 'ClickHouseTable';

	declare protected $columns: T['columns'];

	/** @internal */
	static override readonly Symbol = Object.assign({}, Table.Symbol, {});

	/** @internal */
	override [Table.Symbol.Columns]!: NonNullable<T['columns']>;

	/** @internal */
	override [Table.Symbol.ExtraConfigBuilder]:
		| ((self: Record<string, ClickHouseColumn>) => ClickHouseTableExtraConfigValue[])
		| undefined = undefined;
}

export type AnyClickHouseTable<TPartial extends Partial<TableConfig> = {}> = ClickHouseTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type ClickHouseTableWithColumns<T extends TableConfig> =
	& ClickHouseTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

export function clickhouseTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, ClickHouseColumnBuilderBase>,
>(
	name: TTableName,
	columns: TColumnsMap | ((columnTypes: ClickHouseColumnBuilders) => TColumnsMap),
	extraConfig:
		| ((self: BuildColumns<TTableName, TColumnsMap, 'clickhouse'>) => ClickHouseTableExtraConfigValue[])
		| undefined,
	schema: TSchemaName,
	baseName = name,
): ClickHouseTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap, 'clickhouse'>;
	dialect: 'clickhouse';
}> {
	const rawTable = new ClickHouseTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'clickhouse'>;
		dialect: 'clickhouse';
	}>(name, schema, baseName);

	const parsedColumns: TColumnsMap = typeof columns === 'function' ? columns(getClickHouseColumnBuilders()) : columns;

	const builtColumns = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as ClickHouseColumnBuilder;
			colBuilder.setName(name);
			const column = colBuilder.build(rawTable);
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'clickhouse'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumns as unknown as BuildExtraConfigColumns<
		TTableName,
		TColumnsMap,
		'clickhouse'
	>;

	if (extraConfig) {
		table[ClickHouseTable.Symbol.ExtraConfigBuilder] = extraConfig as unknown as (
			self: Record<string, ClickHouseColumn>,
		) => ClickHouseTableExtraConfigValue[];
	}

	return table;
}

export interface ClickHouseTableFn<TSchemaName extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, ClickHouseColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (
			self: BuildColumns<TTableName, TColumnsMap, 'clickhouse'>,
		) => ClickHouseTableExtraConfigValue[],
	): ClickHouseTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'clickhouse'>;
		dialect: 'clickhouse';
	}>;

	<
		TTableName extends string,
		TColumnsMap extends Record<string, ClickHouseColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: ClickHouseColumnBuilders) => TColumnsMap,
		extraConfig?: (
			self: BuildColumns<TTableName, TColumnsMap, 'clickhouse'>,
		) => ClickHouseTableExtraConfigValue[],
	): ClickHouseTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'clickhouse'>;
		dialect: 'clickhouse';
	}>;
}

/**
 * Declares a ClickHouse table.
 *
 * Unlike the row-store dialects, the third argument is where the *engine* is declared — ClickHouse
 * tables have no meaningful default beyond `MergeTree`, and the sorting key is what determines how
 * the table performs.
 *
 * ```ts
 * export const events = clickhouseTable('events', {
 * 	id: uint64().notNull(),
 * 	ts: dateTime({ timezone: 'UTC' }).notNull(),
 * 	url: lowCardinality(string()).notNull(),
 * }, (t) => [
 * 	mergeTree({
 * 		orderBy: [t.ts, t.id],
 * 		partitionBy: sql`toYYYYMM(${t.ts})`,
 * 	}),
 * 	index('idx_url').on(t.url).bloomFilter(0.01).granularity(4),
 * ]);
 * ```
 */
export const clickhouseTable: ClickHouseTableFn = (name, columns, extraConfig) => {
	return clickhouseTableWithSchema(name, columns, extraConfig, undefined, name);
};

export function clickhouseTableCreator(customizeTableName: (name: string) => string): ClickHouseTableFn {
	return (name, columns, extraConfig) => {
		return clickhouseTableWithSchema(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};
}

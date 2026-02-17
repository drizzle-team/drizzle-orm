import type { BuildColumns, BuildExtraConfigColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import { type BigQueryColumnBuilders, getBigQueryColumnBuilders } from './columns/all.ts';
import type { BigQueryColumn, BigQueryColumnBuilder, BigQueryColumnBuilderBase } from './columns/common.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type BigQueryTableExtraConfigValue =
	| CheckBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder;

export type BigQueryTableExtraConfig = Record<
	string,
	BigQueryTableExtraConfigValue
>;

export type TableConfig = TableConfigBase<BigQueryColumn>;

export class BigQueryTable<T extends TableConfig = TableConfig> extends Table<T> {
	static override readonly [entityKind]: string = 'BigQueryTable';

	declare protected $columns: T['columns'];

	/** @internal */
	override [Table.Symbol.Columns]!: NonNullable<T['columns']>;

	/** @internal */
	override [Table.Symbol.ExtraConfigBuilder]:
		| ((self: Record<string, BigQueryColumn>) => BigQueryTableExtraConfig)
		| undefined = undefined;
}

export type AnyBigQueryTable<TPartial extends Partial<TableConfig> = {}> = BigQueryTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type BigQueryTableWithColumns<T extends TableConfig> =
	& BigQueryTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

export function bigqueryTableWithDataset<
	TTableName extends string,
	TDatasetName extends string | undefined,
	TColumnsMap extends Record<string, BigQueryColumnBuilderBase>,
>(
	name: TTableName,
	columns: TColumnsMap | ((columnTypes: BigQueryColumnBuilders) => TColumnsMap),
	extraConfig:
		| ((
			self: BuildColumns<TTableName, TColumnsMap, 'bigquery'>,
		) => BigQueryTableExtraConfig | BigQueryTableExtraConfigValue[])
		| undefined,
	dataset: TDatasetName,
	baseName = name,
): BigQueryTableWithColumns<{
	name: TTableName;
	schema: TDatasetName;
	columns: BuildColumns<TTableName, TColumnsMap, 'bigquery'>;
	dialect: 'bigquery';
}> {
	const rawTable = new BigQueryTable<{
		name: TTableName;
		schema: TDatasetName;
		columns: BuildColumns<TTableName, TColumnsMap, 'bigquery'>;
		dialect: 'bigquery';
	}>(name, dataset, baseName);

	const parsedColumns: TColumnsMap = typeof columns === 'function' ? columns(getBigQueryColumnBuilders()) : columns;

	const builtColumns = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as BigQueryColumnBuilder;
			colBuilder.setName(name);
			const column = colBuilder.build(rawTable);
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'bigquery'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumns as unknown as BuildExtraConfigColumns<
		TTableName,
		TColumnsMap,
		'bigquery'
	>;

	if (extraConfig) {
		table[BigQueryTable.Symbol.ExtraConfigBuilder] = extraConfig as unknown as (
			self: Record<string, BigQueryColumn>,
		) => BigQueryTableExtraConfig;
	}

	return table;
}

export interface BigQueryTableFn<TDatasetName extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, BigQueryColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (
			self: BuildColumns<TTableName, TColumnsMap, 'bigquery'>,
		) => BigQueryTableExtraConfigValue[],
	): BigQueryTableWithColumns<{
		name: TTableName;
		schema: TDatasetName;
		columns: BuildColumns<TTableName, TColumnsMap, 'bigquery'>;
		dialect: 'bigquery';
	}>;

	<
		TTableName extends string,
		TColumnsMap extends Record<string, BigQueryColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: BigQueryColumnBuilders) => TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'bigquery'>) => BigQueryTableExtraConfigValue[],
	): BigQueryTableWithColumns<{
		name: TTableName;
		schema: TDatasetName;
		columns: BuildColumns<TTableName, TColumnsMap, 'bigquery'>;
		dialect: 'bigquery';
	}>;

	/**
	 * @deprecated The third parameter of bigqueryTable is changing and will only accept an array instead of an object
	 */
	<
		TTableName extends string,
		TColumnsMap extends Record<string, BigQueryColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig: (self: BuildColumns<TTableName, TColumnsMap, 'bigquery'>) => BigQueryTableExtraConfig,
	): BigQueryTableWithColumns<{
		name: TTableName;
		schema: TDatasetName;
		columns: BuildColumns<TTableName, TColumnsMap, 'bigquery'>;
		dialect: 'bigquery';
	}>;

	/**
	 * @deprecated The third parameter of bigqueryTable is changing and will only accept an array instead of an object
	 */
	<
		TTableName extends string,
		TColumnsMap extends Record<string, BigQueryColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: BigQueryColumnBuilders) => TColumnsMap,
		extraConfig: (self: BuildColumns<TTableName, TColumnsMap, 'bigquery'>) => BigQueryTableExtraConfig,
	): BigQueryTableWithColumns<{
		name: TTableName;
		schema: TDatasetName;
		columns: BuildColumns<TTableName, TColumnsMap, 'bigquery'>;
		dialect: 'bigquery';
	}>;
}

export const bigqueryTable: BigQueryTableFn = (name, columns, extraConfig) => {
	return bigqueryTableWithDataset(name, columns, extraConfig, undefined, name);
};

export function bigqueryTableCreator(customizeTableName: (name: string) => string): BigQueryTableFn {
	return (name, columns, extraConfig) => {
		return bigqueryTableWithDataset(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};
}

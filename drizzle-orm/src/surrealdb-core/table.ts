import type { BuildColumns, BuildExtraConfigColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import { getSurrealDBColumnBuilders, type SurrealDBColumnBuilders } from './columns/all.ts';
import type { SurrealDBColumn, SurrealDBColumnBuilder, SurrealDBColumnBuilderBase } from './columns/common.ts';
import type { AnyIndexBuilder } from './indexes.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type SurrealDBTableExtraConfigValue =
	| AnyIndexBuilder
	| UniqueConstraintBuilder;

export type SurrealDBTableExtraConfig = Record<
	string,
	SurrealDBTableExtraConfigValue
>;

export type TableConfig = TableConfigBase<SurrealDBColumn>;

export class SurrealDBTable<T extends TableConfig = TableConfig> extends Table<T> {
	static override readonly [entityKind]: string = 'SurrealDBTable';

	declare protected $columns: T['columns'];

	/** @internal */
	static override readonly Symbol = Object.assign({}, Table.Symbol, {});

	/** @internal */
	override [Table.Symbol.Columns]!: NonNullable<T['columns']>;

	/** @internal */
	override [Table.Symbol.ExtraConfigBuilder]:
		| ((self: Record<string, SurrealDBColumn>) => SurrealDBTableExtraConfig)
		| undefined = undefined;
}

export type AnySurrealDBTable<TPartial extends Partial<TableConfig> = {}> = SurrealDBTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type SurrealDBTableWithColumns<T extends TableConfig> =
	& SurrealDBTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

export function surrealdbTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, SurrealDBColumnBuilderBase>,
>(
	name: TTableName,
	columns: TColumnsMap | ((columnTypes: SurrealDBColumnBuilders) => TColumnsMap),
	extraConfig:
		| ((
			self: BuildColumns<TTableName, TColumnsMap, 'surrealdb'>,
		) => SurrealDBTableExtraConfig | SurrealDBTableExtraConfigValue[])
		| undefined,
	schema: TSchemaName,
	baseName = name,
): SurrealDBTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap, 'surrealdb'>;
	dialect: 'surrealdb';
}> {
	const rawTable = new SurrealDBTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'surrealdb'>;
		dialect: 'surrealdb';
	}>(name, schema, baseName);

	const parsedColumns: TColumnsMap = typeof columns === 'function' ? columns(getSurrealDBColumnBuilders()) : columns;

	const builtColumns = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as SurrealDBColumnBuilder;
			colBuilder.setName(name);
			const column = colBuilder.build(rawTable);
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'surrealdb'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumns as unknown as BuildExtraConfigColumns<
		TTableName,
		TColumnsMap,
		'surrealdb'
	>;

	if (extraConfig) {
		table[SurrealDBTable.Symbol.ExtraConfigBuilder] = extraConfig as unknown as (
			self: Record<string, SurrealDBColumn>,
		) => SurrealDBTableExtraConfig;
	}

	return table;
}

export interface SurrealDBTableFn<TSchemaName extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, SurrealDBColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (
			self: BuildColumns<TTableName, TColumnsMap, 'surrealdb'>,
		) => SurrealDBTableExtraConfigValue[],
	): SurrealDBTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'surrealdb'>;
		dialect: 'surrealdb';
	}>;

	<
		TTableName extends string,
		TColumnsMap extends Record<string, SurrealDBColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: SurrealDBColumnBuilders) => TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'surrealdb'>) => SurrealDBTableExtraConfigValue[],
	): SurrealDBTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'surrealdb'>;
		dialect: 'surrealdb';
	}>;
}

export const surrealdbTable: SurrealDBTableFn = (name, columns, extraConfig) => {
	return surrealdbTableWithSchema(name, columns, extraConfig, undefined, name);
};

export function surrealdbTableCreator(customizeTableName: (name: string) => string): SurrealDBTableFn {
	return (name, columns, extraConfig) => {
		return surrealdbTableWithSchema(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};
}

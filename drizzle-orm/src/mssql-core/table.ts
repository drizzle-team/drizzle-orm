import type { BuildColumns, BuildExtraConfigColumns, ColumnBuilderBase } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import {
	type InferTableColumnsModels,
	Table,
	type TableConfig as TableConfigBase,
	type UpdateTableConfig,
} from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import { getMsSqlColumnBuilders, type MsSqlColumnBuilders } from './columns/all.ts';
import type { MsSqlColumn, MsSqlColumnBuilder, MsSqlColumns } from './columns/common.ts';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { AnyIndexBuilder } from './indexes.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type MsSqlTableExtraConfigValue =
	| AnyIndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder;

export type MsSqlTableExtraConfig = Record<
	string,
	MsSqlTableExtraConfigValue
>;

export type TableConfig = TableConfigBase<MsSqlColumns>;

/** @internal */
export const InlineForeignKeys = Symbol.for('drizzle:MsSqlInlineForeignKeys');

export class MsSqlTable<T extends TableConfig = TableConfig> extends Table<T> {
	static override readonly [entityKind]: string = 'MsSqlTable';

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
		| ((self: Record<string, MsSqlColumn>) => MsSqlTableExtraConfig)
		| undefined = undefined;
}

export type AnyMsSqlTable<TPartial extends Partial<TableConfig> = {}> = MsSqlTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type MsSqlTableWithColumns<T extends TableConfig> =
	& MsSqlTable<T>
	& T['columns']
	& InferTableColumnsModels<T['columns']>;

export function mssqlTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, ColumnBuilderBase>,
>(
	name: TTableName,
	columns: TColumnsMap | ((columnTypes: MsSqlColumnBuilders) => TColumnsMap),
	extraConfig:
		| ((
			self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'mssql'>,
		) => MsSqlTableExtraConfig | MsSqlTableExtraConfigValue[])
		| undefined,
	schema: TSchemaName,
	baseName = name,
): MsSqlTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap, 'mssql'>;
	dialect: 'mssql';
}> {
	const rawTable = new MsSqlTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'mssql'>;
		dialect: 'mssql';
	}>(name, schema, baseName);

	const parsedColumns: TColumnsMap = typeof columns === 'function' ? columns(getMsSqlColumnBuilders()) : columns;

	const builtColumns = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as MsSqlColumnBuilder;
			colBuilder.setName(name);
			const column = colBuilder.build(rawTable);
			rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'mssql'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumns as unknown as BuildExtraConfigColumns<
		TTableName,
		TColumnsMap,
		'mssql'
	>;

	if (extraConfig) {
		table[MsSqlTable.Symbol.ExtraConfigBuilder] = extraConfig as unknown as (
			self: Record<string, MsSqlColumn>,
		) => MsSqlTableExtraConfig;
	}

	return table as any;
}

export interface MsSqlTableFn<TSchema extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, ColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'mssql'>) => MsSqlTableExtraConfigValue[],
	): MsSqlTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'mssql'>;
		dialect: 'mssql';
	}>;

	<
		TTableName extends string,
		TColumnsMap extends Record<string, ColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: MsSqlColumnBuilders) => TColumnsMap,
		extraConfig?: (self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'mssql'>) => MsSqlTableExtraConfigValue[],
	): MsSqlTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'mssql'>;
		dialect: 'mssql';
	}>;
}

export const mssqlTable: MsSqlTableFn = (name, columns, extraConfig) => {
	return mssqlTableWithSchema(name, columns, extraConfig, undefined, name);
};

export function mssqlTableCreator(customizeTableName: (name: string) => string): MsSqlTableFn {
	return (name, columns, extraConfig) => {
		return mssqlTableWithSchema(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};
}

import { entityKind } from '~/entity.ts';
import type { InferModelFromColumns } from '~/table.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import { type DSQLColumnsBuilders, getDSQLColumnBuilders } from './columns/all.ts';
import type {
	AnyDSQLColumnBuilder,
	DSQLBuildColumns,
	DSQLBuildExtraConfigColumns,
	DSQLColumn,
	DSQLColumnBuilder,
	DSQLColumns,
	ExtraConfigColumn,
} from './columns/common.ts';
import type { AnyIndexBuilder } from './indexes.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type DSQLTableExtraConfigValue =
	| AnyIndexBuilder
	| CheckBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder;

export type DSQLTableExtraConfig = Record<string, DSQLTableExtraConfigValue>;

export type TableConfig = TableConfigBase<DSQLColumns>;

export class DSQLTable<out T extends TableConfig = TableConfig> extends Table<T> {
	static override readonly [entityKind]: string = 'DSQLTable';

	/** @internal */
	static override readonly Symbol = Object.assign({}, Table.Symbol, {});

	/** @internal */
	override [Table.Symbol.ExtraConfigBuilder]: ((self: Record<string, DSQLColumn>) => DSQLTableExtraConfig) | undefined =
		undefined;

	/** @internal */
	override [Table.Symbol.ExtraConfigColumns]: Record<string, ExtraConfigColumn> = {};
}

export type AnyDSQLTable<TPartial extends Partial<TableConfig> = {}> = DSQLTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type DSQLTableWithColumns<T extends TableConfig> =
	& DSQLTable<T>
	& T['columns']
	& {
		readonly $inferSelect: InferModelFromColumns<T['columns'], 'select'>;
		readonly $inferInsert: InferModelFromColumns<T['columns'], 'insert'>;
	};

/** @internal */
export function dsqlTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, AnyDSQLColumnBuilder>,
>(
	name: TTableName,
	columns: TColumnsMap | ((columnTypes: DSQLColumnsBuilders) => TColumnsMap),
	extraConfig:
		| ((self: DSQLBuildExtraConfigColumns<TColumnsMap>) => DSQLTableExtraConfig | DSQLTableExtraConfigValue[])
		| undefined,
	schema: TSchemaName,
	baseName = name,
): DSQLTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: DSQLBuildColumns<TTableName, TColumnsMap>;
	dialect: 'dsql';
}> {
	const rawTable = new DSQLTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: DSQLBuildColumns<TTableName, TColumnsMap>;
		dialect: 'dsql';
	}>(name, schema, baseName);

	const parsedColumns: TColumnsMap = typeof columns === 'function' ? columns(getDSQLColumnBuilders()) : columns;

	const builtColumns = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as DSQLColumnBuilder;
			colBuilder.setName(name);
			const column = colBuilder.build(rawTable);
			return [name, column];
		}),
	) as unknown as DSQLBuildColumns<TTableName, TColumnsMap>;

	const builtColumnsForExtraConfig = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as DSQLColumnBuilder;
			colBuilder.setName(name);
			const column = colBuilder.buildExtraConfigColumn(rawTable);
			return [name, column];
		}),
	) as unknown as DSQLBuildExtraConfigColumns<TColumnsMap>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumnsForExtraConfig;

	if (extraConfig) {
		table[DSQLTable.Symbol.ExtraConfigBuilder] = extraConfig as any;
	}

	return table as any;
}

export interface DSQLTableFn<TSchema extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, AnyDSQLColumnBuilder>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (
			self: DSQLBuildExtraConfigColumns<TColumnsMap>,
		) => DSQLTableExtraConfigValue[],
	): DSQLTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: DSQLBuildColumns<TTableName, TColumnsMap>;
		dialect: 'dsql';
	}>;

	<
		TTableName extends string,
		TColumnsMap extends Record<string, AnyDSQLColumnBuilder>,
	>(
		name: TTableName,
		columns: (columnTypes: DSQLColumnsBuilders) => TColumnsMap,
		extraConfig?: (self: DSQLBuildExtraConfigColumns<TColumnsMap>) => DSQLTableExtraConfigValue[],
	): DSQLTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: DSQLBuildColumns<TTableName, TColumnsMap>;
		dialect: 'dsql';
	}>;
}

export const dsqlTable: DSQLTableFn = (name, columns, extraConfig) => {
	return dsqlTableWithSchema(name, columns, extraConfig, undefined);
};

export function dsqlTableCreator(customizeTableName: (name: string) => string): DSQLTableFn {
	return (name, columns, extraConfig) => {
		return dsqlTableWithSchema(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};
}

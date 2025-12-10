import type { BuildColumns, BuildExtraConfigColumns, ColumnBuilderBase } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import {
	type InferTableColumnsModels,
	Table,
	type TableConfig as TableConfigBase,
	type UpdateTableConfig,
} from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import { type CockroachColumnsBuilders, getCockroachColumnBuilders } from './columns/all.ts';
import type {
	CockroachColumn,
	CockroachColumns,
	CockroachColumnWithArrayBuilder,
	ExtraConfigColumn,
} from './columns/common.ts';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { AnyIndexBuilder } from './indexes.ts';
import type { CockroachPolicy } from './policies.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type CockroachTableExtraConfigValue =
	| AnyIndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder
	| CockroachPolicy;

export type CockroachTableExtraConfig = Record<
	string,
	CockroachTableExtraConfigValue
>;

export type TableConfig = TableConfigBase<CockroachColumns>;

/** @internal */
export const InlineForeignKeys = Symbol.for('drizzle:CockroachInlineForeignKeys');
/** @internal */
export const EnableRLS = Symbol.for('drizzle:EnableRLS');

export class CockroachTable<T extends TableConfig = TableConfig> extends Table<T> {
	static override readonly [entityKind]: string = 'CockroachTable';

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
	override [Table.Symbol.ExtraConfigBuilder]:
		| ((self: Record<string, CockroachColumn>) => CockroachTableExtraConfig)
		| undefined = undefined;

	/** @internal */
	override [Table.Symbol.ExtraConfigColumns]: Record<string, ExtraConfigColumn> = {};
}

export type AnyCockroachTable<TPartial extends Partial<TableConfig> = {}> = CockroachTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type CockroachTableWithColumns<T extends TableConfig> =
	& CockroachTable<T>
	& T['columns']
	& InferTableColumnsModels<T['columns']>
	& {
		/** @deprecated use `cockroachTable.withRLS()` instead*/
		enableRLS: () => Omit<
			CockroachTableWithColumns<T>,
			'enableRLS'
		>;
	};

/** @internal */
export function cockroachTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, ColumnBuilderBase>,
>(
	name: TTableName,
	columns: TColumnsMap | ((columnTypes: CockroachColumnsBuilders) => TColumnsMap),
	extraConfig:
		| ((
			self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'cockroach'>,
		) => CockroachTableExtraConfig | CockroachTableExtraConfigValue[])
		| undefined,
	schema: TSchemaName,
	baseName = name,
): CockroachTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap, 'cockroach'>;
	dialect: 'cockroach';
}> {
	const rawTable = new CockroachTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'cockroach'>;
		dialect: 'cockroach';
	}>(name, schema, baseName);

	const parsedColumns: TColumnsMap = typeof columns === 'function' ? columns(getCockroachColumnBuilders()) : columns;

	const builtColumns = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as CockroachColumnWithArrayBuilder;
			colBuilder.setName(name);
			const column = colBuilder.build(rawTable);
			rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'cockroach'>;

	const builtColumnsForExtraConfig = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as CockroachColumnWithArrayBuilder;
			colBuilder.setName(name);
			const column = colBuilder.buildExtraConfigColumn(rawTable);
			return [name, column];
		}),
	) as unknown as BuildExtraConfigColumns<TTableName, TColumnsMap, 'cockroach'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumnsForExtraConfig;

	if (extraConfig) {
		table[CockroachTable.Symbol.ExtraConfigBuilder] = extraConfig as any;
	}

	return Object.assign(table, {
		enableRLS: () => {
			table[CockroachTable.Symbol.EnableRLS] = true;
			return table as CockroachTableWithColumns<{
				name: TTableName;
				schema: TSchemaName;
				columns: BuildColumns<TTableName, TColumnsMap, 'cockroach'>;
				dialect: 'cockroach';
			}>;
		},
	}) as any;
}

export interface CockroachTableFnInternal<TSchema extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, ColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (
			self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'cockroach'>,
		) => CockroachTableExtraConfigValue[],
	): CockroachTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'cockroach'>;
		dialect: 'cockroach';
	}>;

	<
		TTableName extends string,
		TColumnsMap extends Record<string, ColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: CockroachColumnsBuilders) => TColumnsMap,
		extraConfig?: (
			self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'cockroach'>,
		) => CockroachTableExtraConfigValue[],
	): CockroachTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'cockroach'>;
		dialect: 'cockroach';
	}>;
}

export interface CockroachTableFn<TSchema extends string | undefined = undefined>
	extends CockroachTableFnInternal<TSchema>
{
	withRLS: CockroachTableFnInternal<TSchema>;
}

const cockroachTableInternal: CockroachTableFnInternal = (name, columns, extraConfig) => {
	return cockroachTableWithSchema(name, columns, extraConfig, undefined);
};

const cockroachTableWithRLS: CockroachTableFn['withRLS'] = (name, columns, extraConfig) => {
	const table = cockroachTableWithSchema(name, columns, extraConfig, undefined);
	table[EnableRLS] = true;

	return table;
};

export const cockroachTable: CockroachTableFn = Object.assign(cockroachTableInternal, {
	withRLS: cockroachTableWithRLS,
});

export function cockroachTableCreator(customizeTableName: (name: string) => string): CockroachTableFn {
	const fn: CockroachTableFnInternal = (name, columns, extraConfig) => {
		return cockroachTableWithSchema(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};

	return Object.assign(fn, {
		withRLS: ((name, columns, extraConfig) => {
			const table = cockroachTableWithSchema(
				customizeTableName(name) as typeof name,
				columns,
				extraConfig,
				undefined,
				name,
			);
			table[EnableRLS] = true;

			return table;
		}) as CockroachTableFnInternal,
	});
}

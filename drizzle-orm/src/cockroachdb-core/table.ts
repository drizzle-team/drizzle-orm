import type { BuildColumns, BuildExtraConfigColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import { type CockroachDbColumnsBuilders, getCockroachDbColumnBuilders } from './columns/all.ts';
import type {
	CockroachDbColumn,
	CockroachDbColumnBuilderBase,
	CockroachDbColumnWithArrayBuilder,
	ExtraConfigColumn,
} from './columns/common.ts';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { AnyIndexBuilder } from './indexes.ts';
import type { CockroachDbPolicy } from './policies.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type CockroachDbTableExtraConfigValue =
	| AnyIndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder
	| CockroachDbPolicy;

export type CockroachDbTableExtraConfig = Record<
	string,
	CockroachDbTableExtraConfigValue
>;

export type TableConfig = TableConfigBase<CockroachDbColumn>;

/** @internal */
export const InlineForeignKeys = Symbol.for('drizzle:CockroachDbInlineForeignKeys');
/** @internal */
export const EnableRLS = Symbol.for('drizzle:EnableRLS');

export class CockroachDbTable<T extends TableConfig = TableConfig> extends Table<T> {
	static override readonly [entityKind]: string = 'CockroachDbTable';

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
		| ((self: Record<string, CockroachDbColumn>) => CockroachDbTableExtraConfig)
		| undefined = undefined;

	/** @internal */
	override [Table.Symbol.ExtraConfigColumns]: Record<string, ExtraConfigColumn> = {};
}

export type AnyCockroachDbTable<TPartial extends Partial<TableConfig> = {}> = CockroachDbTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type CockroachDbTableWithColumns<T extends TableConfig> =
	& CockroachDbTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	}
	& {
		enableRLS: () => Omit<
			CockroachDbTableWithColumns<T>,
			'enableRLS'
		>;
	};

/** @internal */
export function cockroachdbTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, CockroachDbColumnBuilderBase>,
>(
	name: TTableName,
	columns: TColumnsMap | ((columnTypes: CockroachDbColumnsBuilders) => TColumnsMap),
	extraConfig:
		| ((
			self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'cockroachdb'>,
		) => CockroachDbTableExtraConfig | CockroachDbTableExtraConfigValue[])
		| undefined,
	schema: TSchemaName,
	baseName = name,
): CockroachDbTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap, 'cockroachdb'>;
	dialect: 'cockroachdb';
}> {
	const rawTable = new CockroachDbTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'cockroachdb'>;
		dialect: 'cockroachdb';
	}>(name, schema, baseName);

	const parsedColumns: TColumnsMap = typeof columns === 'function' ? columns(getCockroachDbColumnBuilders()) : columns;

	const builtColumns = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as CockroachDbColumnWithArrayBuilder;
			colBuilder.setName(name);
			const column = colBuilder.build(rawTable);
			rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'cockroachdb'>;

	const builtColumnsForExtraConfig = Object.fromEntries(
		Object.entries(parsedColumns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as CockroachDbColumnWithArrayBuilder;
			colBuilder.setName(name);
			const column = colBuilder.buildExtraConfigColumn(rawTable);
			return [name, column];
		}),
	) as unknown as BuildExtraConfigColumns<TTableName, TColumnsMap, 'cockroachdb'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumnsForExtraConfig;

	if (extraConfig) {
		table[CockroachDbTable.Symbol.ExtraConfigBuilder] = extraConfig as any;
	}

	return Object.assign(table, {
		enableRLS: () => {
			table[CockroachDbTable.Symbol.EnableRLS] = true;
			return table as CockroachDbTableWithColumns<{
				name: TTableName;
				schema: TSchemaName;
				columns: BuildColumns<TTableName, TColumnsMap, 'cockroachdb'>;
				dialect: 'cockroachdb';
			}>;
		},
	});
}

export interface CockroachDbTableFn<TSchema extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, CockroachDbColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (
			self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'cockroachdb'>,
		) => CockroachDbTableExtraConfigValue[],
	): CockroachDbTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'cockroachdb'>;
		dialect: 'cockroachdb';
	}>;

	<
		TTableName extends string,
		TColumnsMap extends Record<string, CockroachDbColumnBuilderBase>,
	>(
		name: TTableName,
		columns: (columnTypes: CockroachDbColumnsBuilders) => TColumnsMap,
		extraConfig?: (
			self: BuildExtraConfigColumns<TTableName, TColumnsMap, 'cockroachdb'>,
		) => CockroachDbTableExtraConfigValue[],
	): CockroachDbTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'cockroachdb'>;
		dialect: 'cockroachdb';
	}>;
}

export const cockroachdbTable: CockroachDbTableFn = (name, columns, extraConfig) => {
	return cockroachdbTableWithSchema(name, columns, extraConfig, undefined);
};

export function cockroachdbTableCreator(customizeTableName: (name: string) => string): CockroachDbTableFn {
	return (name, columns, extraConfig) => {
		return cockroachdbTableWithSchema(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};
}

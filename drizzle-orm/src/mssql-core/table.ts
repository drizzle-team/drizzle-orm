import type { BuildColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import type { MsSqlColumn, MsSqlColumnBuilder, MsSqlColumnBuilderBase } from './columns/common.ts';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { AnyIndexBuilder } from './indexes.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type MsSqlTableExtraConfig = Record<
	string,
	| AnyIndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder
>;

export type TableConfig = TableConfigBase<MsSqlColumn>;

/** @internal */
export const InlineForeignKeys = Symbol.for('drizzle:MsSqlInlineForeignKeys');

export class MsSqlTable<T extends TableConfig = TableConfig> extends Table<T> {
	static readonly [entityKind]: string = 'MsSqlTable';

	declare protected $columns: T['columns'];

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
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

export function mssqlTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, MsSqlColumnBuilderBase>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig: ((self: BuildColumns<TTableName, TColumnsMap, 'mssql'>) => MsSqlTableExtraConfig) | undefined,
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

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as MsSqlColumnBuilder;
			const column = colBuilder.build(rawTable);
			rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'mssql'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;

	if (extraConfig) {
		table[MsSqlTable.Symbol.ExtraConfigBuilder] = extraConfig as unknown as (
			self: Record<string, MsSqlColumn>,
		) => MsSqlTableExtraConfig;
	}

	return table;
}

export interface MsSqlTableFn<TSchemaName extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, MsSqlColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'mssql'>) => MsSqlTableExtraConfig,
	): MsSqlTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
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

import type { BuildColumns, BuildExtraConfigColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import type { SingleStoreColumn, SingleStoreColumnBuilder, SingleStoreColumnBuilderBase } from './columns/common.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';
import type { IndexColumnstoreBuilder, IndexRowstoreBuilder } from './indexes.ts';

export type SingleStoreColumnstoreTableExtraConfig = Record<
	string,
	| IndexColumnstoreBuilder
	| CheckBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder
>;
export type SingleStoreRowstoreTableExtraConfig = Record<
	string,
	| IndexRowstoreBuilder
	| CheckBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder
>;
export type SingleStoreTableExtraConfig = SingleStoreColumnstoreTableExtraConfig | SingleStoreRowstoreTableExtraConfig;

export type TableConfig = TableConfigBase<SingleStoreColumn>;

export abstract class SingleStoreTable<
	TColumn extends TableConfig = TableConfig,
	TExtraConfig extends SingleStoreTableExtraConfig = SingleStoreTableExtraConfig,
> extends Table<TColumn> {
	static readonly [entityKind]: string = 'SingleStoreTable';

	declare protected $columns: TColumn['columns'];

	/** @internal */
	static override readonly Symbol = Object.assign({}, Table.Symbol, {});

	/** @internal */
	override [Table.Symbol.Columns]!: NonNullable<TColumn['columns']>;

	/** @internal */
	override [Table.Symbol.ExtraConfigBuilder]:
		| ((self: Record<string, SingleStoreColumn>) => TExtraConfig)
		| undefined = undefined;
}

export class SingleStoreRowstoreTable<T extends TableConfig = TableConfig>
	extends SingleStoreTable<T, SingleStoreRowstoreTableExtraConfig>
{
	static readonly [entityKind]: string = 'SingleStoreRowstoreTable';
}

export class SingleStoreColumnstoreTable<T extends TableConfig = TableConfig>
	extends SingleStoreTable<T, SingleStoreColumnstoreTableExtraConfig>
{
	static readonly [entityKind]: string = 'SingleStoreColumnstoreTable';
}

export type AnySingleStoreTable<TPartial extends Partial<TableConfig> = {}> = SingleStoreTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type SingleStoreTableWithColumns<T extends TableConfig> =
	& SingleStoreTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

export enum SinglestoreTableType {
	rowstore,
	columnstore,
}

export function singlestoreTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, SingleStoreColumnBuilderBase>,
>(
	type: SinglestoreTableType,
	name: TTableName,
	columns: TColumnsMap,
	extraConfig:
		| ((self: BuildColumns<TTableName, TColumnsMap, 'singlestore'>) => SingleStoreTableExtraConfig)
		| undefined,
	schema: TSchemaName,
	baseName = name,
): SingleStoreTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
	dialect: 'singlestore';
}> {
	let rawTable;
	switch (type) {
		case SinglestoreTableType.columnstore: {
			rawTable = new SingleStoreColumnstoreTable<{
				name: TTableName;
				schema: TSchemaName;
				columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
				dialect: 'singlestore';
			}>(name, schema, baseName);
			break;
		}
		case SinglestoreTableType.rowstore: {
			rawTable = new SingleStoreRowstoreTable<{
				name: TTableName;
				schema: TSchemaName;
				columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
				dialect: 'singlestore';
			}>(name, schema, baseName);
			break;
		}
	}

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as SingleStoreColumnBuilder;
			const column = colBuilder.build(rawTable);
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'singlestore'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumns as unknown as BuildExtraConfigColumns<
		TTableName,
		TColumnsMap,
		'singlestore'
	>;

	if (extraConfig) {
		table[SingleStoreTable.Symbol.ExtraConfigBuilder] = extraConfig as unknown as (
			self: Record<string, SingleStoreColumn>,
		) => SingleStoreTableExtraConfig;
	}

	return table;
}

export interface SingleStoreTableFn<
	TSchemaName extends string | undefined = undefined,
	TExtraConfig extends SingleStoreTableExtraConfig = SingleStoreTableExtraConfig,
> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, SingleStoreColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'singlestore'>) => TExtraConfig,
	): SingleStoreTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
		dialect: 'singlestore';
	}>;
}

export const singlestoreTable: SingleStoreTableFn<undefined, SingleStoreColumnstoreTableExtraConfig> = (
	name,
	columns,
	extraConfig,
) => {
	return singlestoreTableWithSchema(SinglestoreTableType.columnstore, name, columns, extraConfig, undefined, name);
};

// TODO: Need to access drizzle kit to add rowstore support on migrations
export const singlestoreRowstoreTable: SingleStoreTableFn<undefined, SingleStoreRowstoreTableExtraConfig> = (
	name,
	columns,
	extraConfig,
) => {
	return singlestoreTableWithSchema(SinglestoreTableType.rowstore, name, columns, extraConfig, undefined, name);
};

export function singlestoreTableCreator(customizeTableName: (name: string) => string): SingleStoreTableFn {
	return (name, columns, extraConfig) => {
		return singlestoreTableWithSchema(
			SinglestoreTableType.columnstore,
			customizeTableName(name) as typeof name,
			columns,
			extraConfig,
			undefined,
			name,
		);
	};
}

import type { BuildColumns, BuildExtraConfigColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import type { SingleStoreColumn, SingleStoreColumnBuilder, SingleStoreColumnBuilderBase } from './columns/common.ts';
import type { IndexBuilder, IndexColumnstoreConfig, IndexRowstoreConfig } from './indexes.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

type SinglestoreTableTypeTypes = {
	columnstore: {
		extraconfig: SingleStoreColumnstoreTableExtraConfig;
	};
	rowstore: {
		extraconfig: SingleStoreRowstoreTableExtraConfig;
	};
};
type SinglestoreTableTypes = 'columnstore' | 'rowstore';

export type SingleStoreColumnstoreTableExtraConfig = Record<
	string,
	| IndexBuilder<IndexColumnstoreConfig>
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder
>;

export type SingleStoreRowstoreTableExtraConfig = Record<
	string,
	| IndexBuilder<IndexRowstoreConfig>
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder
>;

export type TableConfig = TableConfigBase<SingleStoreColumn>;

export abstract class SingleStoreTable<
	TTableType extends SinglestoreTableTypes = SinglestoreTableTypes,
	T extends TableConfig = TableConfig,
> extends Table<T> {
	static readonly [entityKind]: string = 'SingleStoreTable';

	declare protected $columns: T['columns'];

	/** @internal */
	static override readonly Symbol = Object.assign({}, Table.Symbol, {});

	/** @internal */
	override [Table.Symbol.Columns]!: NonNullable<T['columns']>;

	/** @internal */
	override [Table.Symbol.ExtraConfigBuilder]:
		| ((self: Record<string, SingleStoreColumn>) => SinglestoreTableTypeTypes[TTableType]['extraconfig'])
		| undefined = undefined;
}

export class SingleStoreColumnstoreTable<T extends TableConfig = TableConfig>
	extends SingleStoreTable<'columnstore', T>
{
	static readonly [entityKind]: string = 'SingleStoreColumnstoreTable';
}

export class SingleStoreRowstoreTable<T extends TableConfig = TableConfig> extends SingleStoreTable<'rowstore', T> {
	static readonly [entityKind]: string = 'SingleStoreRowstoreTable';
}

export type AnySingleStoreTable<TPartial extends Partial<TableConfig> = {}> =
	| SingleStoreColumnstoreTable<UpdateTableConfig<TableConfig, TPartial>>
	| SingleStoreRowstoreTable<UpdateTableConfig<TableConfig, TPartial>>;

export type SingleStoreTableWithColumns<T extends TableConfig, TTableType extends SinglestoreTableTypes = SinglestoreTableTypes> =
	& (SingleStoreTable<TTableType, T>)
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

export function singlestoreTableWithSchema<
	TTableType extends SinglestoreTableTypes,
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, SingleStoreColumnBuilderBase>,
>(
	tableType: TTableType,
	name: TTableName,
	columns: TColumnsMap,
	extraConfig:
		| ((
			self: BuildColumns<TTableName, TColumnsMap, 'singlestore'>,
		) => SinglestoreTableTypeTypes[TTableType]['extraconfig'])
		| undefined,
	schema: TSchemaName,
	baseName = name,
): SingleStoreTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
	dialect: 'singlestore';
}, TTableType> {
	let rawTable;
	switch (tableType) {
		case 'columnstore': {
			rawTable = new SingleStoreColumnstoreTable<{
				name: TTableName;
				schema: TSchemaName;
				columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
				dialect: 'singlestore';
			}>(name, schema, baseName);
			break;
		}
		case 'rowstore': {
			rawTable = new SingleStoreRowstoreTable<{
				name: TTableName;
				schema: TSchemaName;
				columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
				dialect: 'singlestore';
			}>(name, schema, baseName);
			break;
		}
		default: {
			throw new Error('Invalid table type');
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
		) => SinglestoreTableTypeTypes[TTableType]['extraconfig'];
	}

	return table;
}

export interface SingleStoreTableFn<
	TTableType extends SinglestoreTableTypes,
	TSchemaName extends string | undefined = undefined,
> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, SingleStoreColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (
			self: BuildColumns<TTableName, TColumnsMap, 'singlestore'>,
		) => SinglestoreTableTypeTypes[TTableType]['extraconfig'],
	): SingleStoreTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
		dialect: 'singlestore';
	}, TTableType>;
}

export const singlestoreTable: SingleStoreTableFn<'columnstore'> = (name, columns, extraConfig) => {
	return singlestoreTableWithSchema('columnstore', name, columns, extraConfig, undefined, name);
};

export const singlestoreRowstoreTable: SingleStoreTableFn<'rowstore'> = (name, columns, extraConfig) => {
	return singlestoreTableWithSchema('rowstore', name, columns, extraConfig, undefined, name);
};

export function singlestoreTableCreator(
	customizeTableName: (name: string) => string,
): SingleStoreTableFn<'columnstore'> {
	return (name, columns, extraConfig) => {
		return singlestoreTableWithSchema(
			'columnstore',
			customizeTableName(name) as typeof name,
			columns,
			extraConfig,
			undefined,
			name,
		);
	};
}

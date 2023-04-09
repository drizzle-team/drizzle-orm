import type { BuildColumns } from '~/column-builder';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table';
import type { CheckBuilder } from './checks';
import type { AnySQLiteColumn, AnySQLiteColumnBuilder } from './columns/common';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import type { IndexBuilder } from './indexes';
import type { PrimaryKeyBuilder } from './primary-keys';

export type SQLiteTableExtraConfig = Record<
	string,
	| IndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
>;
export type TableConfig = TableConfigBase<AnySQLiteColumn>;

/** @internal */
export const InlineForeignKeys = Symbol('InlineForeignKeys');

/** @internal */
export const ExtraConfigBuilder = Symbol('ExtraConfigBuilder');

export class SQLiteTable<T extends TableConfig> extends Table<T> {
	/** @internal */
	static override readonly Symbol = Object.assign({}, Table.Symbol, {
		InlineForeignKeys: InlineForeignKeys as typeof InlineForeignKeys,
		ExtraConfigBuilder: ExtraConfigBuilder as typeof ExtraConfigBuilder,
	});

	/** @internal */
	override [Table.Symbol.Columns]!: NonNullable<T['columns']>;

	/** @internal */
	[InlineForeignKeys]: ForeignKey[] = [];

	/** @internal */
	[ExtraConfigBuilder]: ((self: Record<string, AnySQLiteColumn>) => SQLiteTableExtraConfig) | undefined = undefined;
}

export type AnySQLiteTable<TPartial extends Partial<TableConfig> = {}> = SQLiteTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type SQLiteTableWithColumns<T extends TableConfig> =
	& SQLiteTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

export function sqliteTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnySQLiteColumnBuilder>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: (self: BuildColumns<TTableName, TColumnsMap>) => SQLiteTableExtraConfig,
	baseName = name,
): SQLiteTableWithColumns<{
	name: TTableName;
	schema: undefined;
	columns: BuildColumns<TTableName, TColumnsMap>;
}> {
	const rawTable = new SQLiteTable<{
		name: TTableName;
		schema: undefined;
		columns: BuildColumns<TTableName, TColumnsMap>;
	}>(name, undefined, baseName);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colBuilder]) => {
			const column = colBuilder.build(rawTable);
			rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;

	if (extraConfig) {
		table[SQLiteTable.Symbol.ExtraConfigBuilder] = extraConfig as (
			self: Record<string, AnySQLiteColumn>,
		) => SQLiteTableExtraConfig;
	}

	return table;
}

export function sqliteTableCreator(customizeTableName: (name: string) => string): typeof sqliteTable {
	const builder: typeof sqliteTable = (name, columns, extraConfig) => {
		return sqliteTable(customizeTableName(name) as typeof name, columns, extraConfig, name);
	};
	return builder;
}

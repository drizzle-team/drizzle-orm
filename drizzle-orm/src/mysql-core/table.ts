import type { BuildColumns } from '~/column-builder';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table';
import type { CheckBuilder } from './checks';
import type { AnyMySqlColumn, AnyMySqlColumnBuilder } from './columns/common';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import type { AnyIndexBuilder } from './indexes';
import type { PrimaryKeyBuilder } from './primary-keys';

export type MySqlTableExtraConfig = Record<
	string,
	| AnyIndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
>;

export type TableConfig = TableConfigBase<AnyMySqlColumn>;

/** @internal */
export const InlineForeignKeys = Symbol('InlineForeignKeys');

export class MySqlTable<T extends TableConfig> extends Table<T> {
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
		| ((self: Record<string, AnyMySqlColumn>) => MySqlTableExtraConfig)
		| undefined = undefined;
}

export type AnyMySqlTable<TPartial extends Partial<TableConfig> = {}> = MySqlTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type MySqlTableWithColumns<T extends TableConfig> =
	& MySqlTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

export function mysqlTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, AnyMySqlColumnBuilder>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig: ((self: BuildColumns<TTableName, TColumnsMap>) => MySqlTableExtraConfig) | undefined,
	schema: TSchemaName,
	baseName = name,
): MySqlTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap>;
}> {
	const rawTable = new MySqlTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap>;
	}>(name, schema, baseName);

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
		table[MySqlTable.Symbol.ExtraConfigBuilder] = extraConfig as (
			self: Record<string, AnyMySqlColumn>,
		) => MySqlTableExtraConfig;
	}

	return table;
}

export interface MySqlTableFn<TSchemaName extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, AnyMySqlColumnBuilder>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap>) => MySqlTableExtraConfig,
	): MySqlTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap>;
	}>;
}

export const mysqlTable: MySqlTableFn = (name, columns, extraConfig) => {
	return mysqlTableWithSchema(name, columns, extraConfig, undefined, name);
};

export function mysqlTableCreator(customizeTableName: (name: string) => string): MySqlTableFn {
	return (name, columns, extraConfig) => {
		return mysqlTableWithSchema(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};
}

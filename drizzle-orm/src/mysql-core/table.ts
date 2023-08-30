import type { BuildColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import type { MySqlColumn, MySqlColumnBuilder, MySqlColumnBuilderBase } from './columns/common.ts';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { AnyIndexBuilder } from './indexes.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type MySqlTableExtraConfig = Record<
	string,
	| AnyIndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder
>;

export type TableConfig = TableConfigBase<MySqlColumn>;

/** @internal */
export const InlineForeignKeys = Symbol.for('drizzle:MySqlInlineForeignKeys');

export class MySqlTable<T extends TableConfig = TableConfig> extends Table<T> {
	static readonly [entityKind]: string = 'MySqlTable';

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
		| ((self: Record<string, MySqlColumn>) => MySqlTableExtraConfig)
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
	TColumnsMap extends Record<string, MySqlColumnBuilderBase>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig: ((self: BuildColumns<TTableName, TColumnsMap, 'mysql'>) => MySqlTableExtraConfig) | undefined,
	schema: TSchemaName,
	baseName = name,
): MySqlTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap, 'mysql'>;
	dialect: 'mysql';
}> {
	const rawTable = new MySqlTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'mysql'>;
		dialect: 'mysql';
	}>(name, schema, baseName);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as MySqlColumnBuilder;
			const column = colBuilder.build(rawTable);
			rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'mysql'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;

	if (extraConfig) {
		table[MySqlTable.Symbol.ExtraConfigBuilder] = extraConfig as unknown as (
			self: Record<string, MySqlColumn>,
		) => MySqlTableExtraConfig;
	}

	return table;
}

export interface MySqlTableFn<TSchemaName extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, MySqlColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'mysql'>) => MySqlTableExtraConfig,
	): MySqlTableWithColumns<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'mysql'>;
		dialect: 'mysql';
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

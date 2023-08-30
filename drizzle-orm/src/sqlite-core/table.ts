import type { BuildColumns } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { Table, type TableConfig as TableConfigBase, type UpdateTableConfig } from '~/table.ts';
import type { CheckBuilder } from './checks.ts';
import type { SQLiteColumn, SQLiteColumnBuilder, SQLiteColumnBuilderBase } from './columns/common.ts';
import type { ForeignKey, ForeignKeyBuilder } from './foreign-keys.ts';
import type { IndexBuilder } from './indexes.ts';
import type { PrimaryKeyBuilder } from './primary-keys.ts';
import type { UniqueConstraintBuilder } from './unique-constraint.ts';

export type SQLiteTableExtraConfig = Record<
	string,
	| IndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
	| PrimaryKeyBuilder
	| UniqueConstraintBuilder
>;

export type TableConfig = TableConfigBase<SQLiteColumn<any>>;

/** @internal */
export const InlineForeignKeys = Symbol.for('drizzle:SQLiteInlineForeignKeys');

export class SQLiteTable<T extends TableConfig = TableConfig> extends Table<T> {
	static readonly [entityKind]: string = 'SQLiteTable';

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
		| ((self: Record<string, SQLiteColumn>) => SQLiteTableExtraConfig)
		| undefined = undefined;
}

export type AnySQLiteTable<TPartial extends Partial<TableConfig> = {}> = SQLiteTable<
	UpdateTableConfig<TableConfig, TPartial>
>;

export type SQLiteTableWithColumns<T extends TableConfig> =
	& SQLiteTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

export interface SQLiteTableFn<TSchema extends string | undefined = undefined> {
	<
		TTableName extends string,
		TColumnsMap extends Record<string, SQLiteColumnBuilderBase>,
	>(
		name: TTableName,
		columns: TColumnsMap,
		extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'sqlite'>) => SQLiteTableExtraConfig,
	): SQLiteTableWithColumns<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'sqlite'>;
		dialect: 'sqlite';
	}>;
}

function sqliteTableBase<
	TTableName extends string,
	TColumnsMap extends Record<string, SQLiteColumnBuilderBase>,
	TSchema extends string | undefined,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: (self: BuildColumns<TTableName, TColumnsMap, 'sqlite'>) => SQLiteTableExtraConfig,
	schema?: TSchema,
	baseName = name,
): SQLiteTableWithColumns<{
	name: TTableName;
	schema: TSchema;
	columns: BuildColumns<TTableName, TColumnsMap, 'sqlite'>;
	dialect: 'sqlite';
}> {
	const rawTable = new SQLiteTable<{
		name: TTableName;
		schema: TSchema;
		columns: BuildColumns<TTableName, TColumnsMap, 'sqlite'>;
		dialect: 'sqlite';
	}>(name, schema, baseName);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colBuilderBase]) => {
			const colBuilder = colBuilderBase as SQLiteColumnBuilder;
			const column = colBuilder.build(rawTable);
			rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
			return [name, column];
		}),
	) as unknown as BuildColumns<TTableName, TColumnsMap, 'sqlite'>;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;

	if (extraConfig) {
		table[SQLiteTable.Symbol.ExtraConfigBuilder] = extraConfig as (
			self: Record<string, SQLiteColumn>,
		) => SQLiteTableExtraConfig;
	}

	return table;
}

export const sqliteTable: SQLiteTableFn = (name, columns, extraConfig) => {
	return sqliteTableBase(name, columns, extraConfig);
};

export function sqliteTableCreator(customizeTableName: (name: string) => string): SQLiteTableFn {
	return (name, columns, extraConfig) => {
		return sqliteTableBase(customizeTableName(name) as typeof name, columns, extraConfig, undefined, name);
	};
}

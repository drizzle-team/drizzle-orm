import { AnyColumn, ColumnConfig, GetColumnData } from 'drizzle-orm';
import { OptionalKeyOnly, RequiredKeyOnly } from 'drizzle-orm/operations';
import { Table } from 'drizzle-orm/table';
import { Update } from 'drizzle-orm/utils';
import { Simplify } from 'drizzle-orm/utils';

import { Check, CheckBuilder } from './checks';
import { AnySQLiteColumn, AnySQLiteColumnBuilder, BuildColumns } from './columns/common';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { Index, IndexBuilder } from './indexes';

export type SQLiteTableExtraConfig = Record<
	string,
	| IndexBuilder
	| CheckBuilder
	| ForeignKeyBuilder
>;
export interface TableConfig {
	name: string;
	columns: Record<string | symbol, AnySQLiteColumn>;
}

export type UpdateTableConfig<T extends TableConfig, TUpdate extends Partial<TableConfig>> = Update<T, TUpdate>;

/** @internal */
export const Indexes = Symbol('Indexes');

/** @internal */
export const ForeignKeys = Symbol('ForeignKeys');

/** @internal */
export const Checks = Symbol('Checks');

/** @internal */
export const ConflictConstraints = Symbol('ConflictConstraints');

export class SQLiteTable<T extends Partial<TableConfig>> extends Table<T['name']> {
	declare protected $columns: T['columns'];

	/** @internal */
	static override readonly Symbol = Object.assign(Table.Symbol, {
		Indexes: Indexes as typeof Indexes,
		ForeignKeys: ForeignKeys as typeof ForeignKeys,
		Checks: Checks as typeof Checks,
		ConflictConstraints: ConflictConstraints as typeof ConflictConstraints,
	});

	/** @internal */
	override [Table.Symbol.Columns]!: T['columns'];

	/** @internal */
	[Indexes]: Record<string | symbol, Index> = {};

	/** @internal */
	[ForeignKeys]: Record<string | symbol, ForeignKey> = {};

	/** @internal */
	[Checks]: Record<string | symbol, Check> = {};

	override toString(): T['name'] {
		return this[Table.Symbol.Name]!;
	}
}

export type AnySQLiteTable<TPartial extends Partial<TableConfig> = {}> = SQLiteTable<Update<TableConfig, TPartial>>;

export type SQLiteTableWithColumns<T extends TableConfig> =
	& SQLiteTable<T>
	& {
		[Key in keyof T['columns']]: T['columns'][Key];
	};

/**
 * See `GetColumnConfig`.
 */
export type GetTableConfig<T extends AnySQLiteTable, TParam extends keyof TableConfig | undefined = undefined> =
	T extends SQLiteTableWithColumns<infer TConfig>
		? TParam extends undefined ? TConfig : TParam extends keyof TConfig ? TConfig[TParam] : TConfig
		: never;

export type InferModel<
	TTable extends AnySQLiteTable,
	TInferMode extends 'select' | 'insert' = 'select',
> = TInferMode extends 'insert' ? Simplify<
		& {
			[
				Key in keyof GetTableConfig<TTable, 'columns'> & string as RequiredKeyOnly<
					Key,
					GetTableConfig<TTable, 'columns'>[Key]
				>
			]: GetColumnData<GetTableConfig<TTable, 'columns'>[Key], 'query'>;
		}
		& {
			[
				Key in keyof GetTableConfig<TTable, 'columns'> & string as OptionalKeyOnly<
					Key,
					GetTableConfig<TTable, 'columns'>[Key]
				>
			]?: GetColumnData<GetTableConfig<TTable, 'columns'>[Key], 'query'>;
		}
	>
	: {
		[Key in keyof GetTableConfig<TTable, 'columns'>]: GetColumnData<
			GetTableConfig<TTable, 'columns'>[Key],
			'query'
		>;
	};

export interface SQLiteTableConfig<TName extends string> {
	name: TName;
	temporary?: boolean;
}

export function sqliteTable<TTableName extends string, TColumnsMap extends Record<string, AnySQLiteColumnBuilder>>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: (self: BuildColumns<TTableName, TColumnsMap>) => SQLiteTableExtraConfig,
): SQLiteTableWithColumns<{
	name: TTableName;
	columns: BuildColumns<TTableName, TColumnsMap>;
}> {
	const rawTable = new SQLiteTable<{
		name: TTableName;
		columns: BuildColumns<TTableName, TColumnsMap>;
	}>(name);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colBuilder]) => {
			const column = colBuilder.build(rawTable);
			colBuilder.buildForeignKeys(column, rawTable).forEach((fk, fkIndex) => {
				rawTable[ForeignKeys][Symbol(`${name}_${fkIndex}`)] = fk;
			});
			return [name, column];
		}),
	) as BuildColumns<TTableName, TColumnsMap>;

	rawTable[Table.Symbol.Columns] = builtColumns;

	const table = Object.assign(rawTable, builtColumns);

	table[Table.Symbol.Columns] = builtColumns;

	if (extraConfig) {
		const builtConfig = extraConfig(table);

		Object.entries(builtConfig).forEach(([name, builder]) => {
			if (builder instanceof IndexBuilder) {
				table[Indexes][name] = builder.build(table);
			} else if (builder instanceof CheckBuilder) {
				table[Checks][name] = builder.build(table);
			} else if (builder instanceof ForeignKeyBuilder) {
				table[ForeignKeys][name] = builder.build(table);
			}
		});
	}

	return table;
}

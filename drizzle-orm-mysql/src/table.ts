import { GetColumnData } from 'drizzle-orm';
import { TableName } from 'drizzle-orm/branded-types';
import { OptionalKeyOnly, RequiredKeyOnly } from 'drizzle-orm/operations';
import { Table } from 'drizzle-orm/table';
import { GetTableName, tableColumns } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyCheckBuilder, BuildCheck, Check, CheckBuilder } from './checks';
import { AnyMySqlColumn, AnyMySqlColumnBuilder, BuildMySqlColumns } from './columns/common';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { AnyIndexBuilder, BuildIndex, Index, IndexBuilder } from './indexes';
import { tableChecks, tableConflictConstraints, tableForeignKeys, tableIndexes } from './utils';

export type MySqlTableExtraConfig<TTableName extends TableName> = Record<
	string,
	| AnyIndexBuilder<TTableName>
	| CheckBuilder<TTableName>
	| ForeignKeyBuilder<TTableName, TableName>
>;

export type AnyConflictConstraintBuilder<TTable extends AnyMySqlTable> =
	| AnyIndexBuilder<GetTableName<TTable>>
	| AnyCheckBuilder<GetTableName<TTable>>;

export type BuildConflictConstraint<T> = T extends IndexBuilder<any, true> ? BuildIndex<T>
	: T extends AnyCheckBuilder ? BuildCheck<T>
	: never;

export type ConflictConstraintKeyOnly<Key, TType> = TType extends AnyCheckBuilder ? Key
	: TType extends IndexBuilder<any, infer TUnique> ? TUnique extends true ? Key
		: never
	: never;

export type BuildConflictConstraints<TConfig extends MySqlTableExtraConfig<any>> = Simplify<
	{
		[Key in keyof TConfig as ConflictConstraintKeyOnly<Key, TConfig[Key]>]: BuildConflictConstraint<TConfig[Key]>;
	}
>;

export type ConflictConstraint<TTableName extends TableName> =
	| Index<TTableName, true>
	| Check<TTableName>;

export class MySqlTable<
	TName extends TableName,
	TConflictConstraints extends Record<string | symbol, ConflictConstraint<TableName>>,
> extends Table<TName> {
	declare protected typeKeeper: Table<TName>['typeKeeper'] & {
		conflictConstraints: TConflictConstraints;
	};

	/** @internal */
	[tableColumns]!: Record<string | symbol, AnyMySqlColumn<TName>>;

	/** @internal */
	[tableIndexes]: Record<string | symbol, Index<TName, boolean>> = {};

	/** @internal */
	[tableForeignKeys]: Record<string | symbol, ForeignKey<TName, TableName>> = {};

	/** @internal */
	[tableChecks]: Record<string | symbol, Check<TName>> = {};

	/** @internal */
	[tableConflictConstraints] = {} as TConflictConstraints;
}

export type MySqlTableWithColumns<
	TName extends TableName,
	TColumns extends Record<string, AnyMySqlColumn<TName>>,
	TConflictConstraints extends Record<string, ConflictConstraint<TableName>>,
> = MySqlTable<TName, TConflictConstraints> & TColumns;

export type GetTableColumns<TTable extends AnyMySqlTable> = TTable extends MySqlTableWithColumns<
	any,
	infer TColumns,
	any
> ? TColumns
	: never;

export type GetTableConflictConstraints<TTable extends AnyMySqlTable> = TTable extends MySqlTable<
	any,
	infer TConflictConstraints
> ? TConflictConstraints
	: never;

export type InferModel<
	TTable extends AnyMySqlTable,
	TInferMode extends 'select' | 'insert' = 'select',
> = TInferMode extends 'insert' ? Simplify<
		& {
			[
				Key in keyof GetTableColumns<TTable> & string as RequiredKeyOnly<
					Key,
					GetTableColumns<TTable>[Key]
				>
			]: GetColumnData<GetTableColumns<TTable>[Key], 'query'>;
		}
		& {
			[
				Key in keyof GetTableColumns<TTable> & string as OptionalKeyOnly<
					Key,
					GetTableColumns<TTable>[Key]
				>
			]?: GetColumnData<GetTableColumns<TTable>[Key], 'query'>;
		}
	>
	: {
		[Key in keyof GetTableColumns<TTable>]: GetColumnData<
			GetTableColumns<TTable>[Key],
			'query'
		>;
	};

export type AnyMySqlTable<TName extends TableName = TableName> = MySqlTable<TName, any>;

export function mysqlTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyMySqlColumnBuilder>,
	TExtraConfigCallback extends (
		self: BuildMySqlColumns<TableName<TTableName>, TColumnsMap>,
	) => MySqlTableExtraConfig<TableName<TTableName>> = (
		self: BuildMySqlColumns<TableName<TTableName>, TColumnsMap>,
	) => {},
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: TExtraConfigCallback,
): MySqlTableWithColumns<
	TableName<TTableName>,
	BuildMySqlColumns<TableName<TTableName>, TColumnsMap>,
	BuildConflictConstraints<ReturnType<TExtraConfigCallback>>
>;
export function mysqlTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyMySqlColumnBuilder>,
	TExtraConfig extends MySqlTableExtraConfig<TableName<TTableName>>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig?: (self: BuildMySqlColumns<TableName<TTableName>, TColumnsMap>) => TExtraConfig,
): MySqlTableWithColumns<
	TableName<TTableName>,
	BuildMySqlColumns<TableName<TTableName>, TColumnsMap>,
	BuildConflictConstraints<TExtraConfig>
> {
	const rawTable = new MySqlTable<TableName<TTableName>, BuildConflictConstraints<TExtraConfig>>(
		name as TableName<TTableName>,
	);

	const builtColumns = Object.fromEntries(
		Object.entries(columns).map(([name, colBuilder]) => {
			const column = colBuilder.build(rawTable);
			colBuilder.buildForeignKeys(column, rawTable).forEach((fk, fkIndex) => {
				rawTable[tableForeignKeys][Symbol(`${name}_${fkIndex}`)] = fk;
			});
			return [name, column];
		}),
	) as BuildMySqlColumns<TableName<TTableName>, TColumnsMap>;

	rawTable[tableColumns] = builtColumns;

	const table = Object.assign(rawTable, builtColumns) as MySqlTableWithColumns<
		TableName<TTableName>,
		BuildMySqlColumns<TableName<TTableName>, TColumnsMap>,
		BuildConflictConstraints<TExtraConfig>
	>;

	table[tableColumns] = builtColumns;

	if (extraConfig) {
		const builtConfig = extraConfig(table);
		table[tableConflictConstraints] = builtConfig as unknown as BuildConflictConstraints<TExtraConfig>;

		Object.entries(builtConfig).forEach(([name, builder]) => {
			if (builder instanceof IndexBuilder) {
				table[tableIndexes][name] = builder.build(table);
			} else if (builder instanceof CheckBuilder) {
				table[tableChecks][name] = builder.build(table);
			} else if (builder instanceof ForeignKeyBuilder) {
				table[tableForeignKeys][name] = builder.build(table);
			}
		});
	}

	return table;
}

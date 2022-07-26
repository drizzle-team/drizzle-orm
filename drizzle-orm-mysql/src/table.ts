import { GetColumnData } from 'drizzle-orm';
import { TableName } from 'drizzle-orm/branded-types';
import { OptionalKeyOnly, RequiredKeyOnly } from 'drizzle-orm/operations';
import { Table } from 'drizzle-orm/table';
import { GetTableName, tableColumns } from 'drizzle-orm/utils';
import { Simplify } from 'type-fest';

import { AnyMySqlColumn, AnyMySqlColumnBuilder, BuildMySqlColumns } from './columns/common';
import { AnyConstraintBuilder, BuildConstraint, Constraint, ConstraintBuilder } from './constraints';
import { ForeignKey, ForeignKeyBuilder } from './foreign-keys';
import { AnyIndexBuilder, BuildIndex, Index, IndexBuilder } from './indexes';
import { tableConflictConstraints, tableConstraints, tableForeignKeys, tableIndexes } from './utils';

export type MySqlTableExtraConfig<TTableName extends TableName, TTable extends AnyMySqlTable<TTableName>> = Record<
	string,
	| AnyIndexBuilder<TTableName, TTable>
	| ConstraintBuilder<TTableName>
	| ForeignKeyBuilder<TTableName, TableName>
>;

export type AnyConflictConstraintBuilder<TTable extends AnyMySqlTable> =
	| AnyIndexBuilder<GetTableName<TTable>>
	| AnyConstraintBuilder<GetTableName<TTable>>;

export type BuildConflictConstraint<T> = T extends AnyIndexBuilder ? BuildIndex<T>
	: T extends AnyConstraintBuilder ? BuildConstraint<T>
	: never;

export type ConflictConstraintKeyOnly<Key, TType> = TType extends AnyConstraintBuilder ? Key
	: TType extends IndexBuilder<any, infer TUnique> ? TUnique extends true ? Key
		: never
	: never;

export type BuildConflictConstraints<TConfig extends MySqlTableExtraConfig<any, any>> = Simplify<
	{
		[Key in keyof TConfig as ConflictConstraintKeyOnly<Key, TConfig[Key]>]: BuildConflictConstraint<
			TConfig[Key]
		>;
	}
>;

export type ConflictConstraint<TTable extends AnyMySqlTable> =
	| Index<TTable, true>
	| Constraint<GetTableName<TTable>>;

export class MySqlTable<
	TName extends TableName,
	TConflictConstraints extends Record<string, ConflictConstraint<AnyMySqlTable>>,
> extends Table<TName> {
	protected override typeKeeper!: Table<TName>['typeKeeper'] & {
		conflictConstraints: TConflictConstraints;
	};

	/** @internal */
	[tableColumns]!: Record<string, AnyMySqlColumn<TName>>;

	/** @internal */
	[tableIndexes]: Record<string, Index<AnyMySqlTable<TName>, boolean>> = {};

	/** @internal */
	[tableForeignKeys]: Record<string, ForeignKey<TName, TableName>> = {};

	/** @internal */
	[tableConstraints]: Record<string, Constraint<TName>> = {};

	/** @internal */
	[tableConflictConstraints] = {} as TConflictConstraints;
}

export type MySqlTableWithColumns<
	TName extends TableName,
	TColumns extends Record<string, AnyMySqlColumn<TName>>,
	TConflictConstraints extends Record<string, ConflictConstraint<AnyMySqlTable>>,
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

export function mySqlTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyMySqlColumnBuilder>,
>(
	name: TTableName,
	columns: TColumnsMap,
): MySqlTableWithColumns<TableName<TTableName>, BuildMySqlColumns<TableName<TTableName>, TColumnsMap>, {}>;
export function mySqlTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyMySqlColumnBuilder>,
	TExtraConfig extends MySqlTableExtraConfig<TableName<TTableName>, any>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig: (self: BuildMySqlColumns<TableName<TTableName>, TColumnsMap>) => TExtraConfig,
): MySqlTableWithColumns<
	TableName<TTableName>,
	BuildMySqlColumns<TableName<TTableName>, TColumnsMap>,
	BuildConflictConstraints<TExtraConfig>
>;
export function mySqlTable<
	TTableName extends string,
	TColumnsMap extends Record<string, AnyMySqlColumnBuilder>,
	TExtraConfig extends MySqlTableExtraConfig<TableName<TTableName>, any>,
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
		Object.entries(columns).map(([name, colConfig]) => [name, colConfig.build(rawTable)]),
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
			} else if (builder instanceof ConstraintBuilder) {
				table[tableConstraints][name] = builder.build(table);
			} else if (builder instanceof ForeignKeyBuilder) {
				table[tableForeignKeys][name] = builder.build(table);
			}
		});
	}

	return table;
}
